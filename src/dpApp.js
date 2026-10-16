import { connectDb, closeDb, getDb } from "./config/db.js";
import { collectionManager } from "./framework/CollectionManager.js";
import { applicationSchemaRegistry } from "./framework/applicationSchemaRegistry.js";
import { securityRulesEngine } from "./framework/engines/SecurityRulesEngine.js";
import { Projection } from "./framework/engines/projectionEngine.js";
import { AppError } from "./framework/appError.js";
import { frameworkConfig } from "./config/frameworkConfig.js";
import { initializeMonitoring } from "./Monitor/monitoringSystem.js";
import { loadDirectory } from "./utils/dynamicImport.js";


/**
 * dbApp  user interface app for manageing db 
 */
class dbApp {
    static #instance = null;
    #isInitialized = false;
    #isStarted = false;
    #config = {};
    #handlerBefore=new Set()
    #handlerAfter=new Set()

    /**
     * Constructor singlton 
     */
    constructor() {
        if (dbApp.#instance) {
            return dbApp.#instance;
        }
        dbApp.#instance = this;
    }

    /**
     * get singelton instance 
     * @returns {dbApp}
     */
    static getInstance() {
        if (!dbApp.#instance) {
            dbApp.#instance = new dbApp();
        }
        return dbApp.#instance;
    }

    /**
     * reinitialize framework configuration
     * @param {frameworkConfig} config - framework configuratoin
     * @returns {dbApp}
     */
    configure(config = {frameworkConfig,monitoring:{ enabled: true,
            auditEnabled: true,
            maxBufferSize: 1000,
            flushIntervalMs: 5000,
            logFilePath: './audit.jsonl'}}
        ) {
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
        console.log(" App configured successfully");
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
            console.log("Starting Monolith App...");

            if(this.#config.monitoring.enabled){
                initializeMonitoring(this.#config.monitoring);
                

            }
            await loadDirectory('./src/modules');

            this.installHandlerBefore();

            // connection to db
            await connectDb();
            console.log("✅ Database connected");

            // sync collection
            await collectionManager.syncAllCollectionOnBoot(applicationSchemaRegistry);
            console.log("✅ Collections synced");
            this.installHandlerAfter();

           
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
     *
     * @param {string} collectionName - 
     * @returns {Collection|null}
     */
    registerHandlerAfter(func){
        if (typeof func !== 'function'){

               throw new AppError("dpApp ERR: Type need to be Function", 500);

        }

        this.#handlerAfter.add(func);
    }

    installHandlerAfter(){
        const handlers=[...this.#handlerAfter]
        for(let func of handlers){
            func();
        }
    }

    registerHandlerBefore(func){
        if (typeof func !== 'function'){

               throw new AppError("dpApp ERR: Type need to be Function", 500);

        }

        this.#handlerBefore.add(func);
    }

    installHandlerBefore(){
        const handlers=[...this.#handlerBefore]
        for(let func of handlers){
            func();
        }
    }

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
    get Config(){
        return this.#config
    }
}


export const dbAppIns = dbApp.getInstance();
export default dbApp;