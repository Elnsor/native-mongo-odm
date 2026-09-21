import { coreSystemManageTypes } from "../../strategies/coreSystemManageTypes.js";
import { schemaManager } from "../../validation/schemaManager.js";
import { AppError } from "../appError.js";
import { record, auditLog } from "../../Monitor/monitoringSystem.js";
import { DOMAIN, EVENT_TYPES, EVENT_MTYPES } from "../../Monitor/constant/eventType.js"

class SecurityRulesEngine {

    constructor() {
        this.core = coreSystemManageTypes;
        this.customCore = {};
    }

    /**
     * Safely reads a value from a nested object path (e.g., "accountInfo.email")
     */
    _getNestedValue(obj, path) {
        if (!path || !obj) return undefined;
        if (!path.includes('.')) return obj[path];

        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length; i++) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[keys[i]];
        }

        return current;
    }

    /**
     * Sets a value on a nested object path, building missing parent nodes automatically
     */
    _setNestedValue(obj, path, value) {
        if (!path.includes('.')) {
            obj[path] = value;
            return;
        }

        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    registerCustomCore(type, executionStrategy, optParams = {}) {
        if (this.core[type]) {
            throw new Error(`Framework Error: Can Not overwriting existing built-in Core Type ${type}`);
        } else if (this.customCore[type]) {
            throw new Error(`Framework Error: Can Not overwriting existing Custom Core Type ${type}`);
        }

        if (typeof executionStrategy !== 'function') {
            throw new Error(`Framework Error: Custom Core Type ${type} strategy must be function`);
        }

        this.customCore[type] = { params: optParams, strategy: executionStrategy };
    }

    

    async evalRoles(collectionName, sanitizeDoc, currentDoc, userContextRole, isUpdate = false) {

         const startTime = performance.now();
        const actor = userContextRole?.role?.[0] || 'system';

        
       try{

        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SECURITY_EVAL_START, EVENT_MTYPES.METRIC_C);
        // Synchronously load registered schema from memory
        const baseSchema = await schemaManager.getSchema(collectionName);
        const schemaBlueprint = baseSchema.properties;
        const blueprintkey = Object.getOwnPropertyNames(schemaBlueprint);

        const customCoreFunction = [];

        for (let i = 0; i < blueprintkey.length; i++) {

            const fieldName = blueprintkey[i];
            const fieldDefinition = schemaBlueprint[fieldName];
            const appRoles = fieldDefinition.appRoles;
   
            // Skip container objects; evaluate leaf properties directly
            if (fieldDefinition.mongoRoles?.bsonType === 'object') {
                continue;
            }

            // Extract values using dot-notation path resolution
            const oldValue = currentDoc ? this._getNestedValue(currentDoc, fieldName) : undefined;
            const newValue = this._getNestedValue(sanitizeDoc, fieldName);

            // 1. Restricted Roles Enforcement
            if (appRoles.restrictedRoles && Array.isArray(appRoles.restrictedRoles)) {

                if (newValue !== undefined && newValue !== oldValue) {
                    const userRoles = userContextRole?.role || [];
                    const hasAccess = appRoles.restrictedRoles.some(role => userRoles.includes(role));

                    if (!hasAccess) {
                        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SECURITY_RULE_BLOCKED, EVENT_MTYPES.METRIC_C);
                        auditLog(
                                DOMAIN.ODM_DOMAIN, 'security_restricted_blocked', 
                                { actor }, { collection: collectionName, field: fieldName, rule: 'restrictedRoles' }, 
                                'failure', { userRoles }
                            );
                        throw new AppError(`Security Exception: Unauthorized access to modify privileged restricted field '${fieldName}'.`, 403);
                    }
                }
            }

            // 2. Immutability Enforcement
            if (isUpdate && appRoles.immutable) {

                if (newValue !== undefined) {
                    if (oldValue === undefined && appRoles.strictImmutable) {

                        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SECURITY_RULE_BLOCKED, EVENT_MTYPES.METRIC_C);
                        auditLog(
                                DOMAIN.ODM_DOMAIN, 'security_immutable_blocked', 
                                { actor }, { collection: collectionName, field: fieldName, rule: 'strictImmutable' }, 
                                'failure'
                            );
                        throw new AppError(`Security Error: Field "${fieldName}" is strictly immutable and cannot be initialized during an update operation.`, 403);
                    }
                    if (oldValue !== undefined && oldValue !== newValue) {
                        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SECURITY_RULE_BLOCKED, EVENT_MTYPES.METRIC_C);
                            auditLog(
                                DOMAIN.ODM_DOMAIN, 'security_immutable_blocked', 
                                { actor }, { collection: collectionName, field: fieldName, rule: 'immutable' }, 
                                'failure'
                            );
                        throw new AppError(`Security Error: Not allowed to modefied immutable Field "${fieldName}"`, 403);
                    }
                }
            }
 
            // 3. System-Managed Fields Evaluation
            if (appRoles.managedBySystem) {

                if (!appRoles.managedBySystem.type) continue;
                if (isUpdate && appRoles.immutable && oldValue !== undefined) continue;

                const appRoleType = appRoles.managedBySystem.type;
     
                if (this.core[appRoleType]) {
                   
                    const generatedValue = this.core[appRoleType](sanitizeDoc, appRoles.managedBySystem.params);
                   
                           

                    this._setNestedValue(sanitizeDoc, fieldName, generatedValue);
                    record(DOMAIN.ODM_DOMAIN,EVENT_TYPES.SECURITY_SYSTEM_INJECT,EVENT_MTYPES.METRIC_C)
                    
                    auditLog(
                            DOMAIN.ODM_DOMAIN, 'system_field_injected', 
                            { actor: 'system' }, { collection: collectionName, field: fieldName, type: appRoleType }, 
                            'success'
                        );
                    
                } else if (this.customCore[appRoleType]) {
                    customCoreFunction.push({
                        fieldName,
                        strategy: this.customCore[appRoleType].strategy,
                        options: appRoles.managedBySystem
                    });
                   


                } else {
                    throw new AppError(`Framework Configuration Error: Unknown system-managed type strategy '${appRoleType}' on field '${fieldName}'`, 500);
                }
            }
        } // end for

        // Execute Custom System-Managed Functions
        for (let j = 0; j < customCoreFunction.length; j++) {
         
            const { fieldName, strategy, options } = customCoreFunction[j];
            try {
                const generatedValue = strategy(sanitizeDoc, options.params);
                console.log(sanitizeDoc[fieldName])
                if(isUpdate && sanitizeDoc?.[fieldName] === undefined) continue;
                this._setNestedValue(sanitizeDoc, fieldName, generatedValue);
            } catch (err) {
                throw new AppError(`Runtime Execution Failure inside custom type system handler '${options.type}': ${err.message}`, 500);
            }
        }
        const durationNs = (performance.now() - startTime) * 1000000;
        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SECURITY_EVAL_END, EVENT_MTYPES.METRIC_H, durationNs);
  
        return sanitizeDoc;
    }catch(err){

        throw err;
    }
    }
}

export const securityRulesEngine = new SecurityRulesEngine();