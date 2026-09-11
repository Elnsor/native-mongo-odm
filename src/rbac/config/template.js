import { TYPE_IDS, TYPE_ID_TAG , RESOURCES_CHILD} from "./../constant/resourceType.js";


export class ResourcesTemplatesRoles {
    constructor() { }

    /**
     * @param {Object} options
     * @param {string} options.name - Resource identifier name from TYPE_IDS
     * @param {number} options.capacity - Allocation capacity for strider calculation
     * @returns {Object} Resource template schema
     */
    static getTemplatesRoles({ name = "COLLECTIONS", capacity = 1 } = {}) {

        const Id = TYPE_IDS[name];
        let children = [];

        switch (Id) {

            // ==========================================
            // ROOT & SYSTEM CORE
            // ==========================================
            case TYPE_IDS.ROOT:
                return {
                    typeId: TYPE_IDS.ROOT,
                    typeIdentifier: 0,
                    capacity: 1,
                    children: [{ typeId: TYPE_IDS.ROLE_HEADER_TAG, capacity: 1, children: null }]
                };

            // ==========================================
            // BLOCK 1: COLLECTIONS DOMAIN (100 - 199)
            // ==========================================
            case TYPE_IDS.COLLECTIONS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            case TYPE_IDS.DOCUMENTS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: TYPE_IDS.DOCUMENTS, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: 1, children: children };

            case TYPE_IDS.SEARCH_INDEXES:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            case TYPE_IDS.FIELD_METRICS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: TYPE_IDS.FIELD_METRICS, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            case TYPE_IDS.VIRTUAL_VIEWS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 2: ROLES DOMAIN (200 - 299)
            // ==========================================
            case TYPE_IDS.ROLES:
            case TYPE_IDS.ROLE_MANAGEMENT:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 3: DATABASE DOMAIN (300 - 399)
            // ==========================================
            case TYPE_IDS.DB:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 4: TENANCY / ORG DOMAIN (400 - 499)
            // ==========================================
            case TYPE_IDS.ORGANIZATIONS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 5: API KEYS DOMAIN (500 - 599)
            // ==========================================
            case TYPE_IDS.API_KEYS:
            case TYPE_IDS.KEY_POLICIES:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 6: FILE STORAGE DOMAIN (600 - 699)
            // ==========================================
            case TYPE_IDS.STORAGE:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            case TYPE_IDS.FILES:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: TYPE_IDS.FILES, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 7: USERS & ENTERPRISE MANAGEMENT DOMAIN (700 - 799)
            // ==========================================
            case TYPE_IDS.USERS:
            case TYPE_IDS.PROFILES:
            case TYPE_IDS.PAGE_BUY:
            case TYPE_IDS.PAGE_SETTING:
            case TYPE_IDS.PAGE_NOTIFICATION:
            case TYPE_IDS.PAGE_MARKET:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // Enterprise Entities (Multi-instance containers or Instance References)
            case TYPE_IDS.STORES:
            case TYPE_IDS.ENTERPRISES:
            case TYPE_IDS.TEAMS:
            case TYPE_IDS.STORE_HOUSE:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: Id, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // Multi-Instance Children under Stores/Enterprises
            case TYPE_IDS.VERIFICATION_DOCS:
            case TYPE_IDS.BUSINESS_INVITES:
            case TYPE_IDS.PRODUCTS:
            case TYPE_IDS.INQUIRIES:
            case TYPE_IDS.PRODUCT_REVIEWS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: Id, capacity: 1, children: null } // Stores instance index in buffer
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 8: COMMERCE & MARKETPLACE DOMAIN (800 - 899)
            // ==========================================
            case TYPE_IDS.CATEGORIES:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            case TYPE_IDS.SUPPLIERS_DIRECTORY:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null },
                    { typeId: Id, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            // ==========================================
            // BLOCK 9: ADMIN CONTROL DOMAIN (900 - 999)
            // ==========================================
            case TYPE_IDS.ADMIN_VERIFICATIONS:
            case TYPE_IDS.ADMIN_PLATFORM_METRICS:
                children = [
                    { typeId: TYPE_ID_TAG[Id], capacity: 1, children: null },
                    { typeId: TYPE_IDS.HEADER_TTL_TAG, capacity: 1, children: null }
                ];
                return { typeId: Id, capacity: capacity, children: children };

            default:
                throw new Error(`Unknown Resources type ${name}`);
        }
    }

    /// convert layer 2 identity to schema
    // layer 3 result is schema
    /**
     * 
     * @param {String} groupRolesName 
     * @param {Resourceidentity} parentResource 
     * @param {Array<Resourceidentity>} child 
     * @param {Array<Resourceidentity>} grandChild 
     * @param {boolean} ttl 
     * @param {number} depth 
     * @returns JsonSchema
     */
    static createResourceGroupRolesv1(groupRolesName, parentResource , child, grandChild , depth = 0) {

        const parentId = TYPE_IDS[parentResource?.name];


        if (parentId === undefined || RESOURCES_CHILD[parentId] === undefined || RESOURCES_CHILD[parentId] === null) {
            return createError(SYSTEM_STATUS.RESOURCE_NOT_FOUND,'ParsedGroupERror:Invalid resources  ')
        }

        if (!Array.isArray(child) || child.length === 0) return -1;


        // return parent schema
        const resourceSchema = this.getTemplatesRoles({ name: parentResource.name, capacity: parentResource.capacity });


        for (let baby of child) {
            const Id = TYPE_IDS[baby.name];


            if (Id === undefined || !RESOURCES_CHILD[parentId].has(Id)) return -1

            let childeschemaRoles = this.getTemplatesRoles({ name: baby.name, capacity: baby.capacity })
            if (Array.isArray(grandChild) || grandChild.length > 0) {

                const schema = this.createResourceGroupRolesv1(groupRolesName, baby, grandChild, 0, ++depth);
                depth--;

                if (schema !== -1) {
                    childeschemaRoles = schema;

                }


            }

            resourceSchema.children.push(childeschemaRoles)

        }

        if (depth === 0) {

            const roleId=resourceInstance.getRoleId(groupRolesName);

            if (roleId == undefined) return createError(SYSTEM_STATUS.ROLE_NOT_FOUND,`ParsedGroupERror:Role not valid ${groupRolesName}`)

            let rootres = {};
          
                rootres = {
                    typeId: TYPE_IDS.ROOT,
                    typeIdentifier:roleId, // Cleanly mapped via GROUP_ROLES constant
                    capacity: 1,
                    children: [{ typeId: TYPE_IDS.ROLE_HEADER_TAG, capacity: 1, children: null }]

                }
          
            rootres.children.push(resourceSchema);
            return rootres;
        }

        return resourceSchema;

    }
}