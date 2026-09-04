import { connectDb, closeDb, getDb } from "./config/db.js";
import { collectionManager } from "./framework/CollectionManager.js";
import { applicationSchemaRegistry } from "./framework/applicationSchemaRegistry.js";
import { securityRulesEngine } from "./framework/engines/SecurityRulesEngine.js";
import { Projection } from "./framework/engines/projectionEngine.js";
import { AppError } from "./framework/appError.js";
import { frameworkConfig } from "./config/frameworkConfig.js";

/**
 * dbApp  user interface app for manageing db 
 */
class dbApp {
    static #instance = null;
    #isInitialized = false;
    #isStarted = false;
    #config = {};

    /**
     * Constructor خاص - يمنع إنشاء instances متعددة
     */
    constructor() {
        if (dbApp.#instance) {
            return dbApp.#instance;
        }
        dbApp.#instance = this;
    }

    /**
     * الحصول على الـ instance الوحيد
     * @returns {dbApp}
     */
    static getInstance() {
        if (!dbApp.#instance) {
            dbApp.#instance = new dbApp();
        }
        return dbApp.#instance;
    }

    /**
     * تهيئة التطبيق بالإعدادات
     * @param {frameworkConfig} config - إعدادات التطبيق
     * @returns {dbApp}
     */
    configure(config = frameworkConfig) {
        if (this.#isStarted) {
            throw new AppError("Cannot configure app after it has started", 500);
        }

        this.#config = {
            schemaConfig: config.schemaDefaults || {},
            security: config.security|| {},
            cache: config.cache || { warmUpOnStartup: true },
            ...config
        };

        this.#isInitialized = true;
        console.log("✅ App configured successfully");
        return this;
    }

    /**
     * start up db 
     * sync collection 
     * enable db starter
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.#isInitialized) {
            throw new AppError("App must be configured before starting. Call configure() first.", 500);
        }

        if (this.#isStarted) {
            console.warn("App is already started");
            return;
        }

        try {
            console.log("🚀 Starting Monolith App...");

            // connection to db
            await connectDb();
            console.log("✅ Database connected");

            // sync collection
            await collectionManager.syncAllCollectionOnBoot(applicationSchemaRegistry);
            console.log("✅ Collections synced");

           
            if (this.#config.cache?.warmUpOnStartup) {
                console.log("✅ Cache warmed up");
            }

            this.#isStarted = true;
            console.log("🎉 Monolith App started successfully!");
        } catch (error) {
            console.error("❌ Failed to start app:", error.message);
            throw error;
        }
    }

    /**
     * safely stopping db
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.#isStarted) {
            console.warn("App is not started");
            return;
        }

        try {
            console.log("🛑 Stopping Monolith App...");
            await closeDb();
            this.#isStarted = false;
            console.log("✅ App stopped successfully");
        } catch (error) {
            console.error("❌ Error stopping app:", error.message);
            throw error;
        }
    }

    /**
     * register new schema builder
     * @param {string} collectionName - Name of the collection
     * @param {SchemaBuilder} schemaBuilder - instance of SchemaBuilder
     * @returns {boolean}
     */
    registerSchema(collectionName, schemaBuilder) {
       
        if (!collectionName || typeof collectionName !== 'string') {
            throw new AppError("Collection name must be a non-empty string", 400);
        }

        if (!schemaBuilder) {
            throw new AppError("Schema builder is required", 400);
        }

        try {
            applicationSchemaRegistry.register(collectionName, schemaBuilder);
            Projection.addProjection(collectionName, schemaBuilder);
            console.log(`✅ Schema registered: ${collectionName}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to register schema: ${collectionName}`, error.message);
            throw error;
        }
    }

    /**
     * register managed by system hook or function 
     * @param {string} type - uniq type name 
     * @param {Function} strategy - the hook handler function
     * @param {Object} params - more params 
     * @returns {boolean}
     */
    registerCustomManagedBySystem(type, strategy, params = {}) {
        if (typeof type !== 'string' || !type) {
            throw new AppError("Type must be a non-empty string", 400);
        }

        if (typeof strategy !== 'function') {
            throw new AppError("Strategy must be a function", 400);
        }

        try {
            securityRulesEngine.registerCustomCore(type, strategy, params);
            console.log(`✅ Custom managed type registered: ${type}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to register custom type: ${type}`, error.message);
            throw error;
        }
    }

    /**
     * for advanced usage get collection object by name for collection cache
     * @param {string} collectionName - اسم الـ collection
     * @returns {Collection|null}
     */
    getCollection(collectionName) {
        if (!this.#isStarted) {
            throw new AppError("App must be started before accessing collections", 500);
        }

        const cache = collectionManager.getCollectionCache();
        const collection = cache[collectionName];

        if (!collection) {
            throw new AppError(`Collection '${collectionName}' not found in cache`, 404);
        }

        return collection;
    }

    /**
     * show app status 
     * @returns {Object}
     */
    getStatus() {
        return {
            isInitialized: this.#isInitialized,
            isStarted: this.#isStarted,
            config: this.#config,
            registeredSchemas: applicationSchemaRegistry.getAllSchema() ? 
                Array.from(applicationSchemaRegistry.getAllSchema()).map(([name]) => name) : [],
            cachedCollections: Object.keys(collectionManager.getCollectionCache())
        };
    }

    /**
     * get get db instances 
     * @returns {Db}
     */
    getDatabase() {
        if (!this.#isStarted) {
            throw new AppError("App must be started before accessing database", 500);
        }
        return getDb();
    }
}


export const dbAppIns = dbApp.getInstance();
export default dbApp;