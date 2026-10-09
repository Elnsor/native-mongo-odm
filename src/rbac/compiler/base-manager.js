
import { resourceInstance } from "../buckets/systemReourcesInstances.js";
import { RESOURCES_CHILD ,SYSTEM_STATUS,TYPE_IDS,TYPE_ID_TAG ,STRIDER_SIZES,EFFECT_ACTION} from "../constant/resourceType.js";
import { normalizeTTLToTimestamp } from "../utils/utils.js";



/**
 * @import {ResourcesName, SchemaSlices, ResourcePid, RoleElementObject} from './../constant/typesDef.js'
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
    validateRolElement(leafName, { parentResource, parentInstance, action, actionToOthers,ownerInstance, nested, nestedInstance ,ttl=0}) {

        const parentPid = TYPE_IDS[parentResource];
        const leafPid = TYPE_IDS[leafName];
        const nestedPid = nested ? TYPE_IDS[nested] : null;

        //  Parent Resource Validation
        if (parentPid === undefined) {
            return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `SchemaValidationError:Not defined or tagged Parent Name ${parentResource} Resource: ${parentResource}` };
        }
        if (!Array.isArray(parentInstance) || parentInstance.length === 0) {
            return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `SchemaValidationError:Parent Resource ${parentResource} must have a non-empty Instances List` };
        }
        if (parentInstance.length > 1 && parentInstance.includes("*")) {
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError:Leaf ${leafName} in Parent Resource ${parentResource} list does not allow other instances alongside wildcard '*'` };
        }

        //Leaf Resource Validation
        if (leafPid === undefined) {
            return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `SchemaValidationError: Undefined Leaf Resource: ${leafName}` };
        }

        // Check if leaf is illegal (cannot act as a parent/container) means its cant have child
        const leafChildren = RESOURCES_CHILD[leafPid];
        if (leafChildren && leafChildren.size > 0) {
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError:Leaf Resource ${leafName} cannot have child resources` };
        }

        // Check if leaf is tagged and requires an owner instance list
        const isLeafTagged = TYPE_ID_TAG[leafPid] ? true : false;
        if (isLeafTagged) {
            if (!Array.isArray(ownerInstance) || ownerInstance.length === 0) {
                return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `SchemaValidationError:Tagged Leaf Resource ${leafName} must have a valid list of instances` };
            }
        }
         
        const hasOwnerWildcard = ownerInstance.some(o => (typeof o === 'object' && o !== null ? o.name : o) === '*');

        if (ownerInstance.length > 1 && hasOwnerWildcard) {

            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Leaf ${leafName} List in Parent Resource ${parentResource} does not allow other instances alongside wildcard '*'` };
        }

        
         for (let i = 0; i < ownerInstance.length; i++) {
            const ins = ownerInstance[i];
            if (typeof ins === 'object' && ins !== null) {
                if (!ins.name) {
                    return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: ownerInstance object must have 'name' property` };
                }
                if (ins.EffectedAction && EFFECT_ACTION[ins.EffectedAction] === undefined) {
                    return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Invalid EffectedAction '${ins.EffectedAction}' for instance '${ins.name}'` };
                }

                  if (ins.EffectedActionToOthers && EFFECT_ACTION[ins.EffectedActionToOthers] === undefined) {
                    return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Invalid EffectedAction '${ins.EffectedAction}' for instance '${ins.name}'` };
                }
                if(ins.ttl !== 0 ){
                    const nTtl=normalizeTTLToTimestamp(ins.ttl)
                    if(nTtl<0)  return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Invalid ttl '${ins.ttl}' for instance '${ins.name}'` };
                    ins.ttl=nTtl;
                }
            }

            
        }

        //checking action now is EffectedActionNotation
        if(action && action.length === 0){
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Empty Action  Not Allowed`}

        }
        if(EFFECT_ACTION[action] === undefined){
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: not Valid Effected Action Notation `}

        }

        if(actionToOthers && actionToOthers.length === 0){
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Empty ActionToOthers Not Allowed`}

        }
        if(EFFECT_ACTION[actionToOthers] === undefined){
            return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: not Valid Effected Action To Others Notation `}

        }

        //  Hierarchy & Relationship Checks (Direct PID lookup)
        const parentChildren = RESOURCES_CHILD[parentPid];

        if (nested) {
            if (nestedPid === undefined) {
                return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Not defined or tagged Nested Resource: ${nested}` };
            }

            // Validate Parent -> Nested hierarchy
            if (!parentChildren || !parentChildren.has(nestedPid)) {
                return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Resource ${nested} is not a member of ${parentResource}` };
            }

            if (!Array.isArray(nestedInstance) || nestedInstance.length === 0) {
                return { code: SYSTEM_STATUS.RESOURCES_EMPTY_LIST, message: `SchemaValidationError: Nested Resource ${nested} must have a valid Instances List` };
            }
            if (nestedInstance.length > 1 && nestedInstance.includes("*")) {
                return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: nested Child ${nested} in Parent Resource ${parentResource} list does not allow other instances alongside wildcard '*'` };
            }

            // Validate Nested -> Leaf hierarchy
            const nestedChildren = RESOURCES_CHILD[nestedPid];
            if (!nestedChildren || !nestedChildren.has(leafPid)) {
                return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Leaf ${leafName} is not a child of Nested Resource ${nested}` };
            }
        } else {
            // Validate Parent -> Leaf direct hierarchy
            if (!parentChildren || !parentChildren.has(leafPid)) {
                return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Resource ${leafName} is not a member of ${parentResource}` };
            }
        }
        if(ttl !==0){
            const nTtl=normalizeTTLToTimestamp(ttl);
            if(nTtl<0) return { code: SYSTEM_STATUS.INVALID_SCHEMA, message: `SchemaValidationError: Invalid ttl '${ttl}' for Leaf '${leafName}'` };
        }

        return 0; // Validation Passed
    }

}