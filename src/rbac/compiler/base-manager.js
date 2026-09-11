
import { resourceInstance } from "../buckets/systemReourcesInstances.js";
import { RESOURCES_CHILD ,SYSTEM_STATUS,TYPE_IDS,TYPE_ID_TAG ,STRIDER_SIZES} from "../constant/resourceType.js";


/**
 * @import {ResourcesName, SchemaSlices, ResourcePid} from './../constant/typesDef.js'
 */
export class ResourceRoleGroupManager {
    constructor(groupRoleName, groupRoles,update=false) {
        this.groupRoleName = groupRoleName;


        const result=update? update : resourceInstance.AddRole(groupRoleName);
       
        if(result?.code) throw new Error(`ResourceRole Error: ${result.message}`);
        this.ListOfGroups = groupRoles;

        this._pathsBufferSize = STRIDER_SIZES.PATHS_BUFFER_SIZE;
        this._pathsBufferInstanceSize = 10
        this._pathsBufferInstanceCounts = 0;
        this._pathsBuffer = this.#createPathsBuffer();
        this.schemaSlices = new Map();
       
        this.pTi = new Map();
    }

    #createPathsBuffer() {
        const PathsBuffer = new Uint32Array(this._pathsBufferSize);
        return PathsBuffer;
    }

    setPathBuffer(roleId,memberId,pType, pIndex, cType, cIndex, gType, gIndex, effects, ttl) {
        if ((this._pathsBufferInstanceCounts + 1) * this._pathsBufferInstanceSize > this._pathsBuffer.length) {
            // Expand staging array if needed
            const newArr = new Uint32Array(this._pathsBuffer.length * 2);
            newArr.set(this._pathsBuffer);
            this._pathsBuffer = newArr;
        }
        const stagedPaths = this._pathsBuffer;

        const offset = this._pathsBufferInstanceCounts * this._pathsBufferInstanceSize;
        stagedPaths[offset + 0] = roleId;
        stagedPaths[offset + 1] = memberId;
        stagedPaths[offset + 2] = pType;
        stagedPaths[offset + 3] = pIndex;
        stagedPaths[offset + 4] = cType;
        stagedPaths[offset + 5] = cIndex;
        stagedPaths[offset + 6] = gType ?? 0;
        stagedPaths[offset + 7] = gIndex ?? 0; // -1 if no grandchild
        stagedPaths[offset + 8] = effects;
        stagedPaths[offset + 9] = ttl || 0;

        this._pathsBufferInstanceCounts++;
    }


    getPTI() {

        return this.pTi;
    }
    /**
     * 
     * @returns {SchemaSlices}
     */
    getSchemaSlice() {
        return this.schemaSlices
    }

    /**
     * 
     * @param {ResourcePid} parentPID 
     * @returns 
     */

    getSchemaSliceByParentPID(parentPID){

        return this.schemaSlices.get(parentPID);

    }

    /**
     * 
     * @param {ResourcePid} parentPID 
     * @param {number} instanceIndex 
     * @returns {SchemaSlices} -- get slices belonge to instance resources index it parent resource is Parent id
     */
    getSchemaSliceByParentInsPID(parentPID,instanceIndex){

        return this.schemaSlices.get(parentPID).get(instanceIndex);

    }

    /**
     * 
     * @returns {Array} contain row binay buffer contain 
     */
    getPathsBuffer(){
           const validLength = this._pathsBufferInstanceCounts * this._pathsBufferInstanceSize;
        
        return this._pathsBuffer.slice(0, validLength);
    }
  

    /**
     * 
     * @param {ResourcesName} parentName 
     * @returns {Array<SchemaSlices>}
     */
      getSchemaSliceByParentName(parentName){

        const parentPID=TYPE_IDS[parentName];
        if(!parentPID) return createError(SYSTEM_STATUS.INVALID_RESOURCE_PID,`SchemaSliceError:this resource  ${parentName} not valid `);

        return this.schemaSlices.get(parentPID);

    }

/**
 * 
 * @param {ResourcesName} parentName 
 * @param {number} instanceName 
 * @returns {SchemaSlices} -- for instance belong to parent 
 */
     getSchemaSliceByParentInsName(parentName,instanceName){

        const parentPID=TYPE_IDS[parentName];
        const index=resourceInstance.getResourceInstanceIndex(parentName,instanceName);
        if(index.code) return index;

        return this.schemaSlices.get(parentPID).get(index);

    }

/**
 * Validates a single role element against the system schema.
 * Caches PIDs locally to avoid repeated global Map/Object lookups.
 * 
 * @param {string} leafName 
 * @param {RoleElementObject} roleElement 
 * @returns {number|{code: number, message: string}} 0 if valid, or error object
 */
validateRolElement(leafName, { parentResource, parentInstance, action, boundary,actionToOthers,BoundaryToOthers,ownerInstance, nested, nestedInstance }) {
   
    const parentPid = TYPE_IDS[parentResource];
    const leafPid = TYPE_IDS[leafName];
    const nestedPid = nested ? TYPE_IDS[nested] : null;

    //  Parent Resource Validation
    if (parentPid === undefined) {
        return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not defined or tagged Parent Resource: ${parentResource}` };
    }
    if (!Array.isArray(parentInstance) || parentInstance.length === 0) {
        return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `Parent Resource ${parentResource} must have a non-empty Instances List` };
    }
    if (parentInstance.length > 1 && parentInstance.includes("*")) {
        return { code: SYSTEM_STATUS.WILDCARD_WITHE_INSTANCE, message: `Leaf ${leafName} in Parent Resource ${parentResource} list does not allow other instances alongside wildcard '*'` };
    }

    //Leaf Resource Validation
    if (leafPid === undefined) {
        return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Undefined Leaf Resource: ${leafName}` };
    }

    // Check if leaf is illegal (cannot act as a parent/container)
    const leafChildren = RESOURCES_CHILD[leafPid];
    if (leafChildren && leafChildren.size > 0) {
        return { code: SYSTEM_STATUS.INVALID_HIERARCHY, message: `Leaf Resource ${leafName} cannot have Leaf child resources` };
    }

    // Check if leaf is tagged and requires an owner instance list
    const isLeafTagged = TYPE_ID_TAG[leafPid] ? true : false;
    if (isLeafTagged) {
        if (!Array.isArray(ownerInstance) || ownerInstance.length === 0) {
            return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `Tagged Leaf Resource ${leafName} must have a valid list of instances` };
        }
    }

    if (ownerInstance.length > 1 && ownerInstance.includes("*")) {
       
        return { code: SYSTEM_STATUS.WILDCARD_WITHE_INSTANCE, message: `Leaf ${leafName} List in Parent Resource ${parentResource} does not allow other instances alongside wildcard '*'` };
    }

    //  Hierarchy & Relationship Checks (Direct PID lookup)
    const parentChildren = RESOURCES_CHILD[parentPid];

    if (nested) {
        if (nestedPid === undefined) {
            return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not defined or tagged Nested Resource: ${nested}` };
        }

        // Validate Parent -> Nested hierarchy
        if (!parentChildren || !parentChildren.has(nestedPid)) {
            return { code: SYSTEM_STATUS.INVALID_HIERARCHY, message: `Resource ${nested} is not a member of ${parentResource}` };
        }

        if (!Array.isArray(nestedInstance) || nestedInstance.length === 0) {
            return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `Nested Resource ${nested} must have a valid Instances List` };
        }
        if (nestedInstance.length > 1 && nestedInstance.includes("*")) {
        return { code:SYSTEM_STATUS.WILDCARD_WITHE_INSTANCE, message: `nested Child ${nested} in Parent Resource ${parentResource} list does not allow other instances alongside wildcard '*'` };
    }

        // Validate Nested -> Leaf hierarchy
        const nestedChildren = RESOURCES_CHILD[nestedPid];
        if (!nestedChildren || !nestedChildren.has(leafPid)) {
            return { code: SYSTEM_STATUS.INVALID_HIERARCHY, message: `Leaf ${leafName} is not a child of Nested Resource ${nested}` };
        }
    } else {
        // Validate Parent -> Leaf direct hierarchy
        if (!parentChildren || !parentChildren.has(leafPid)) {
            return { code: SYSTEM_STATUS.INVALID_HIERARCHY, message: `Resource ${leafName} is not a member of ${parentResource}` };
        }
    }

    return 0; // Validation Passed
}

}