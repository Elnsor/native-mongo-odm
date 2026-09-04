

export const frameworkConfig =
{
    schemaDefaults: {
        // allowed system to reserved some keyWord to managed it 
        allowSystemKeyword: true,
        // The core keywords blocked from direct human mutations across ALL collections
        coreSystemKeywords: ["createdAt", "updatedAt", "deletedAt", "version"],

        // custom application rules used to add some rule when insert or  modified 
        /**
         * @property {Array<string>} applicationSchemaRules
         * * * 1. "immutable"
     * - Usage: Evaluated strictly when (isUpdate === true).
     * - Action: Compares the incoming doc payload keys against fields marked immutable. If a client attempts to pass a
     * value for an immutable field during an update, the engine intercepts it and throws an error.
     * - Example: Protects fields like 'createdAt' or 'userId' from being altered after creation.
     * * 2. "select"
     * - Usage: Evaluated primarily during outbound read/query pipelines (or inside dynamic lookups).
     * - Action: If a field is explicitly configured with 'select: false', it automatically filters that key out of 
     * the returned doc object payload before it leaves the controller layer to the client.
     * - Example: Prevents sensitive data hashes like 'password' from being exposed in normal API responses.
     * * 3. "managedBySystem"
     * - Usage: Evaluated universally across both create and update states (isUpdate === true || false).
     * - Action: Overrides or bypasses standard validation rules for specific fields. If a field matches a system rule,
     * the framework completely takes over—dynamically injecting values like native JS Date timestamps 
     * or generating secure unique tokens regardless of what data was sent in the raw doc.
     * - Example: Automatically sets 'createdAt' on creation, or updates 'updatedAt' dynamically on modifications.
     * * 4. "restrictedRoles"
     * - Usage: Evaluated dynamically during incoming execution gates by matching the active client's authorization token.
     * - Action: Restricts access to specific keys within the doc. If an incoming key is listed in 'restrictedRoles' 
     * and the current user's role does not match the permitted array level (e.g., 'admin'), the engine blocks
     * the modification instantly with a security exception.
     * - Example: Restricts structural updates on a 'status' or 'balance' field strictly to administrative users.
     */

        applicationSchemaRules: ["immutable", "select", "managedBySystem", "restrictedRoles", "strictImmutable" ],

        // Default system-managed fields appended automatically on INSERTS and create CreatedAt and updatedAt key 
        autoInjectTimestamps: true,

        // Fields that should be skipped by default in all validation checks
        globalSkipRequiredFields: { _id: true, createdAt: true, updatedAt: true },

        // Force lowercase or trimming on specific structural data types globally when document are parsed and validate
        autoTrimStrings: true,

        // for loading schema from registerd schema or from online database
        // true means its loading schemas from Memory 
        //false means its loading schemas from online db server 
        autoLoadingRegisterSchema: true,

        // this for concurrency updates document by set this to true
        //  each document have field called version in int type when update hit its increament by 1
        // this for prevent 2 client from update one document in same time 
        optimisticConcurrencyControl: true,

        // soft deleted means : this for apply soft deleted for document the do the document from user prospactive is deleted 
        // but its still their in db server
        // it add deletedAt field that hold the date when document is deleted 
        // if true meaning soft deleted if fasle then the document is deleted from db too

        softDocumentDelete: true
    },
    systemManageTypeSpecifications: {
        date: {
            allowedOptions: false
        },
        uuid: {
            allowedOptions: false
        },
        slugify: {
            allowedOptions: {
                targetField: { type: "string", required: true }
            }
        }
    },

    security: {
        // Defines the role name that can bypass field constraints completely
        superUserRole: "system",

        // Global fallback role if a request does not contain a valid JWT
        defaultGuestRole: "guest",

        // Toggle whether unknown/undefined fields in payloads should be silently dropped or throw an error
        strictPayloadFiltering: true,

        // Internal secret key used to identify authorized background cron jobs or scripts
        systemInternalSecret: process.env.SYSTEM_INTERNAL_SECRET,

        // If true, ALL immutable fields across the app are strict by default (means not allowed to be initializing when operation is update)
        //if flase ,ALL immutable fields across the app are allowed to be init when operation is update and after init then its become truly immutable
        strictImmutableDefault: false
    },
    cache: {
        // Warm up the CollectionManager and applicationRegistry instantly on boot
        warmUpOnStartup: true,

        // Enable/Disable hot-reloading schemas on the fly without server reboots
        allowRuntimeSchemaMutation: true,

        // Maximum time (in milliseconds) a GET request's data projection can sit in memory
        readProjectionTTL: 60000
    }

}