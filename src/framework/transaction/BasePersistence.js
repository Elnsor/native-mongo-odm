import { getClient } from "../../config/db.js";
import { collectionManager } from "../CollectionManager.js";
import { schemaManager } from "../../validation/schemaManager.js";
import { securityRulesEngine } from "../engines/SecurityRulesEngine.js";
import { frameworkConfig } from "../../config/frameworkConfig.js";
import { AppError } from "../appError.js";


import { record, auditLog } from "../../Monitor/monitoringSystem.js";
import { DOMAIN, EVENT_TYPES, EVENT_MTYPES } from "../../Monitor/constant/eventType.js";

/**
 * @typedef {Object} PersistenceOptions
 * @property {string} collectionName -Name of collection need operate in atomic transaction 
 * @property {string} [eventsCollectionName] - Name of Event resource collection if you need to save event for operation  if enableEventSourcing is true then its must provide name of event resource collection 
 * @property {boolean} [enableEventSourcing=false] - Enable event Resource 
 * @property {boolean} [enableAuditTrail=true] - enable Audit Trail
 */

/**
 * @typedef {Object} SaveOptions
 * @property {Object} [userContext ={role:[]}] - who do operation
 * @property {Object} [metadata={}] - addition meta data 
 */

/**
 * @typedef {Object} UpdateOptions
 * @property {Object} [userContext ={role:[]}] - who do operation
 * @property {boolean} [hardDelete=false] -skip versioning 
 */

/**
 * @typedef {Object} DeleteOptions
 * @property {Object} [userContext ={role:[]}] - who do operation
 * @property {boolean} [hardDelete = false] - if true then document all hard deleted if false then it softdeleted its keep as archive with deletedAt key contain when its soft deleted 
 */

/**
 * @typedef {Object} LoadAllOption 
 * @property {boolean} includeDeleted -- if true sofdeleted decument are loaded else is false 
 * @property {number} limit -- limit document that match filter 
 * @property {Object} sort -- for sort document 
 */

export class BasePersistence {

    /**
     * @param {PersistenceOptions} options 
     */
    constructor(options) {
        if (!options || !options.collectionName) {
            throw new AppError("Persistence Error: collectionName is required", 500);
        }
        this.collectionName = options.collectionName;
        this.eventsCollectionName = options.eventsCollectionName || null;
        this.enableEventSourcing = options.enableEventSourcing || false;
    }

    /**
     * Helper: Transaction with retry 
     */
    async #withTransaction(operations, options = {}) {
        const { maxRetries = 3 } = options;
        const client = getClient();

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const session = client.startSession();
            try {
                session.startTransaction();
                const result = await operations(session);
                await session.commitTransaction();
                return result;
            } catch (error) {
                await session.abortTransaction();
                if (error.hasErrorLabel?.('UnknownTransactionCommitResult') && attempt < maxRetries) {
                    continue; // Retry on transient conflicts
                }
                throw error instanceof AppError ? error : new AppError(`Transaction Failed: ${error.message}`, 500);
            } finally {
                await session.endSession();
            }
        }
    }

    /**
     * save new document in atomic transaction 
     * @param {Object} document
     * @param {SaveOptions} options
     */
    async save(document, options = {}) {
        const { userContext = { role: [] }, metadata = {} } = options;
        const actor = userContext.role?.[0] || "system";
        const startTime = performance.now(); // Start timing

        try {
            const result = await this.#withTransaction(async (session) => {
                const coll = await collectionManager.getCollection(this.collectionName);

                // validate document 
                const sanitizedDoc = await schemaManager.validateDocument(this.collectionName, document, frameworkConfig.schemaDefaults.globalSkipRequiredFields, false);

                // security role like immutable and managed by system fields 
                const finalDoc = await securityRulesEngine.evalRoles(this.collectionName, sanitizedDoc, null, userContext, false);

                // insertion 
                const insertResult = await coll.insertOne(finalDoc, { session });

                // optional event source 
                if (this.enableEventSourcing) {
                    const eventsColl = await collectionManager.getCollection(this.eventsCollectionName);
                    await eventsColl.insertOne({
                        eventType: "DOCUMENT_CREATED",
                        collectionName: this.collectionName,
                        documentId: insertResult.insertedId,
                        newDocument: finalDoc,
                        actor: actor,
                        timestamp: new Date(),
                        metadata
                    }, { session });
                }

                return { success: true, insertedId: insertResult.insertedId };
            });

            // RECORD SUCCESS METRICS & AUDIT
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_CREATE_END, EVENT_MTYPES.METRIC_H, durationNs);
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATIONS_TOTAL, EVENT_MTYPES.METRIC_C, 1);
            
            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_created', 
                { actor }, 
                { collection: this.collectionName, id: result.insertedId }, 
                'success', 
                metadata
            );

            return result;

        } catch (error) {
          
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATION_ERROR, EVENT_MTYPES.METRIC_C, 1);
            
            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_create_failed', 
                { actor }, 
                { collection: this.collectionName }, 
                'failure', 
                { error: error.message }
            );

            throw error instanceof AppError ? error : new AppError(`Transaction Failed: ${error.message}`, 500);
        }
    }

    /**
     * update existing doc 
     * @param {Object} filter -- mongo filter 
     * @param {Object} updatePayload -- updated document or pay load 
     * @param {UpdateOptions} options
     */
    async update(filter, updatePayload, options = {}) {
        const { userContext = { role: [] }, metadata = {}, skipVersionCheck = false } = options;
        const actor = userContext.role?.[0] || "system";
        const startTime = performance.now(); // Start timing

        try {
            const result = await this.#withTransaction(async (session) => {
                const coll = await collectionManager.getCollection(this.collectionName);
                
                const currentDoc = await coll.findOne(filter, { session });
                if (!currentDoc) {
                    throw new AppError("Document not found", 404);
                }

                if (frameworkConfig.schemaDefaults.softDocumentDelete && currentDoc.deletedAt) {
                    throw new AppError("Cannot update a soft-deleted document", 400);
                }

                const sanitizedUpdate = await schemaManager.validateDocument(this.collectionName, updatePayload, frameworkConfig.schemaDefaults.globalSkipRequiredFields, true);
                const finalUpdateDoc = await securityRulesEngine.evalRoles(this.collectionName, { ...currentDoc, ...sanitizedUpdate }, currentDoc, userContext, true);

                const updateOperation = { $set: {} };
                for (const key of Object.keys(sanitizedUpdate)) {
                    updateOperation.$set[key] = finalUpdateDoc[key];
                }

                if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl && !skipVersionCheck) {
                    const currentVersion = currentDoc.version || 1;
                    filter.version = currentVersion; 
                    updateOperation.$inc = { version: 1 }; 
                }

                const updateResult = await coll.updateOne(filter, updateOperation, { session });

                if (updateResult.matchedCount === 0) {
                    throw new AppError("Concurrent modification detected (OCC Conflict) or document not found. Please retry.", 409);
                }

                if (this.enableEventSourcing) {
                    const eventsColl = await collectionManager.getCollection(this.eventsCollectionName);
                    await eventsColl.insertOne({
                        eventType: "DOCUMENT_UPDATED",
                        collectionName: this.collectionName,
                        documentId: currentDoc._id,
                        previousVersion: currentDoc.version || 1,
                        newVersion: (currentDoc.version || 1) + 1,
                        previousDocument: currentDoc,
                        newDocument: { ...currentDoc, ...updateOperation.$set },
                        actor: actor,
                        timestamp: new Date(),
                        metadata
                    }, { session });
                }

                return { 
                    success: true, 
                    matchedCount: updateResult.matchedCount, 
                    modifiedCount: updateResult.modifiedCount,
                    documentId: currentDoc._id 
                };
            });

            // RECORD SUCCESS METRICS & AUDIT
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_UPDATE_END, EVENT_MTYPES.METRIC_H, durationNs);
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATIONS_TOTAL, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_updated', 
                { actor }, 
                { collection: this.collectionName, id: result.documentId }, 
                'success', 
                { modifiedCount: result.modifiedCount, ...metadata }
            );

            return result;

        } catch (error) {
            // RECORD ERROR METRICS & AUDIT
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATION_ERROR, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_update_failed', 
                { actor }, 
                { collection: this.collectionName }, 
                'failure', 
                { error: error.message }
            );

            throw error instanceof AppError ? error : new AppError(`Transaction Failed: ${error.message}`, 500);
        }
    }

    /**
     * @param {Object} filter -- mongo filter 
     * @param {DeleteOptions} options 
     */
    async delete(filter, options = {}) {
        const { hardDelete = false, userContext = { role: [] } } = options;
        const actor = userContext.role?.[0] || "system";
        const startTime = performance.now(); // Start timing

        try {
            const result = await this.#withTransaction(async (session) => {
                const coll = await collectionManager.getCollection(this.collectionName);

                if (frameworkConfig.schemaDefaults.softDocumentDelete && !hardDelete) {
                    // Soft Delete
                    const updateOperation = { $set: { deletedAt: new Date() } };
                    if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl) {
                        updateOperation.$inc = { version: 1 };
                    }
                    const safeFilter = { ...filter, deletedAt: { $exists: false } };
                    const deleteResult = await coll.updateOne(safeFilter, updateOperation, { session });

                    if (deleteResult.matchedCount === 0) {
                        throw new AppError("Document not found or already deleted", 404);
                    }
                    return { success: true, deletedCount: deleteResult.matchedCount, hardDelete: false, filter };
                } else {
                    // Hard Delete
                    const deleteResult = await coll.deleteOne(filter, { session });
                    if (deleteResult.deletedCount === 0) {
                        throw new AppError("Document not found", 404);
                    }
                    return { success: true, deletedCount: deleteResult.deletedCount, hardDelete: true, filter };
                }
            });

         
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_DELETE_END, EVENT_MTYPES.METRIC_H, durationNs);
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATIONS_TOTAL, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_deleted', 
                { actor }, 
                { collection: this.collectionName, filter: result.filter }, 
                'success', 
                { hardDelete: result.hardDelete, deletedCount: result.deletedCount }
            );

            return result;

        } catch (error) {
         
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATION_ERROR, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_delete_failed', 
                { actor }, 
                { collection: this.collectionName }, 
                'failure', 
                { error: error.message }
            );

            throw error instanceof AppError ? error : new AppError(`Transaction Failed: ${error.message}`, 500);
        }
    }

    /**
     * @param {Object} filter 
     * @param {Object} [includeDeleted=false] -- if you need to load document that have softdeleted 
     */
    async load(filter, options = {}) {
        const { includeDeleted = false } = options;
        const coll = await collectionManager.getCollection(this.collectionName);

        const queryFilter = { ...filter };
        if (frameworkConfig.schemaDefaults.softDocumentDelete && !includeDeleted) {
            queryFilter.deletedAt = { $exists: false };
        }

        const document = await coll.findOne(queryFilter);
        if (!document) {
            return { success: false, code: 404, message: "Document not found" };
        }

        return { success: true, data: document };
    }

    /**
     * Load multiple documents
     */
    async loadAll(filter = {}, options = {}) {
        const { includeDeleted = false, limit = 0, sort = {} } = options;
        const coll = await collectionManager.getCollection(this.collectionName);

        const queryFilter = { ...filter };
        if (frameworkConfig.schemaDefaults.softDocumentDelete && !includeDeleted) {
            queryFilter.deletedAt = { $exists: false };
        }

        let cursor = coll.find(queryFilter);
        if (Object.keys(sort).length > 0) cursor = cursor.sort(sort);
        if (limit > 0) cursor = cursor.limit(limit);

        return { success: true, data: await cursor.toArray(), count: await coll.countDocuments(queryFilter) };
    }

    /**
     * @param {*} documents 
     * @param {*} options 
     */
    async saveBatch(documents, options = {}) {
        const { userContext = { role: [] }, metadata = {} } = options;
        const actor = userContext.role?.[0] || "system";
        const startTime = performance.now(); //  Start timing

        if (!Array.isArray(documents) || documents.length === 0) {
            throw new AppError("saveBatch requires a non-empty array of documents", 400);
        }

        try {
            const result = await this.#withTransaction(async (session) => {
                const coll = await collectionManager.getCollection(this.collectionName);
                const sanitizedDocs = [];

                // verify all docs
                for (const doc of documents) {
                    const sanitized = await schemaManager.validateDocument(this.collectionName, doc,frameworkConfig.schemaDefaults.globalSkipRequiredFields, false);
                    const finalDoc = await securityRulesEngine.evalRoles(this.collectionName, sanitized, null, userContext, false);

                    // occ operation 
                    if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl && finalDoc.version === undefined) {
                        finalDoc.version = 1;
                    }
                    sanitizedDocs.push(finalDoc);
                }

                // bulk operation 
                const insertResult = await coll.insertMany(sanitizedDocs, { session, ordered: true });

                // optional event source 
                if (this.enableEventSourcing) {
                    const eventsColl = await collectionManager.getCollection(this.eventsCollectionName);
                    const events = sanitizedDocs.map(doc => ({
                        eventType: "DOCUMENT_CREATED",
                        collectionName: this.collectionName,
                        documentId: doc._id,
                        newDocument: doc,
                        actor: actor,
                        timestamp: new Date(),
                        metadata
                    }));

                    await eventsColl.insertMany(events, { session, ordered: false });
                }

                return {
                    success: true,
                    insertedCount: insertResult.insertedCount,
                    insertedIds: Object.values(insertResult.insertedIds)
                };
            });

            // RECORD SUCCESS METRICS & AUDIT
            const durationNs = (performance.now() - startTime) * 1000000;
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_CREATE_END, EVENT_MTYPES.METRIC_H, durationNs); // Reusing create end for batch
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATIONS_TOTAL, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'documents_batch_created', 
                { actor }, 
                { collection: this.collectionName }, 
                'success', 
                { insertedCount: result.insertedCount, ...metadata }
            );

            return result;

        } catch (error) {
         
            record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.CRUD_OPERATION_ERROR, EVENT_MTYPES.METRIC_C, 1);

            auditLog(
                DOMAIN.ODM_DOMAIN, 
                'document_batch_create_failed', 
                { actor }, 
                { collection: this.collectionName }, 
                'failure', 
                { error: error.message }
            );

            throw error instanceof AppError ? error : new AppError(`Transaction Failed: ${error.message}`, 500);
        }
    }

    /**
     * @param {Object} filter -- mongo filter 
     */
    async exists(filter) {
        const coll = await collectionManager.getCollection(this.collectionName);
        const queryFilter = { ...filter };
        if (frameworkConfig.schemaDefaults.softDocumentDelete) {
            queryFilter.deletedAt = { $exists: false };
        }
        return (await coll.countDocuments(queryFilter)) > 0;
    }
}