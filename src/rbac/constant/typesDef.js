import { TYPE_IDS , TYPE_IDS_NAME, DEFAULT_ACTIONS,BOUNDARY} from "./resourceType.js";

/**
     
     * @typedef {Object} Resourceidentity
     * @property {ResourcesName} name - name of the resource in all Capital letter like COLLECTION
     * @property {number} capacity - the number of Instance Of this resource
     * */

/**
 * @typedef {keyof typeof BOUNDARY} BoundaryStrategy
 * * Defines how far the access extends:
 * - 'OWN': Can only access documents they created.
 * - 'ALL': Can access all documents in the collection.
 * - 'LIMITED': Restricted only to the specific items listed in `documentInstances`.
 * @typedef {keyof typeof DEFAULT_ACTIONS} ActionEffect
 * Defines how far the access extends:
 * - 'READ': Can Read form Resource
 * - 'WRITE': Can WRITE To Resource
 * - 'UPDATE': Can UPDATE  Resource
 * - 'DELETE': Can DELETE form Resource
 * @typedef {(keyof typeof TYPE_IDS)} ResourcesName
 
 * @typedef {(keyof typeof TYPE_IDS_NAME)} ResourcePid
 
 * 
 * @typedef {typeof GROUP_ROLES[keyof typeof GROUP_ROLES] } RolePid
 * 
 * 
 * 
  */
/**
* 

test("COLLECTIONS","",)

/**
 * @typedef {Object} RoleElementObject
 * @property {ResourcesName} parentResource - its the first parent resource for this owner role under root \
 * its must be writen in capital letter (e.g COLLECTION is parent of DOCUMENT),\
 * @property {Array<String>} parentInstance --  its contain list of ParentInstance (e.g., ['users']).
 * @property {Array<ActionEffect>} action - Allowed operations (e.g., ['READ', 'UPDATE']).
 * @property {BoundaryStrategy} boundary - The quantitative rule strategy ('OWN', 'ALL', 'LIMITED') its apply to leaf node wich is {owner of this role}.
 * @property {Array<ActionEffect>} actionToOthers -- Allowed operation for others for same resources that not own by you  
 * @property {BoundaryStrategy} boundaryToOthers - The quantitative rule strategy ('OWN', 'ALL', 'LIMITED') its apply to leaf node wich is {owner of this role} for not own by you .
 * @property {string[]| null} ownerInstance - List of specific Leaf instance names this role is restricted to \
 * if its allowed to have instance then its contain list if instances name if not it contain [1] its own instance .
 * @property {ResourcesName|null} nested - contain child resource name that allowed to have another child called(grandChild) .
 * @property {Array<String>|null} nestedInstance - List of specific nested  instance names this role is restricted to.
 * @property {number | string} ttl - its time unit in Seconed user can insert time in format (timeStamp in second,\
 *  just number of seconde or as string (1h(hour),1s(second),1d(day)) ) 
 * 
 * @typedef {Object} RoleLeaf 
 *

 * */
/**
 *
 * 
 */
/**
 * @typedef {Object} SchemaSlices
 * @property {Resourceidentity}  parentResource
 * @property {Array<Resourceidentity>} child
 * @property {Array<Resourceidentity>} grandChild
 * 
 */
