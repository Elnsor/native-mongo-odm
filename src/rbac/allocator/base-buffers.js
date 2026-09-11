import { RoleCompiler } from "../compiler/schema-parser.js";
import { STRIDER_SIZES,SYSTEM_STATUS, } from "../constant/resourceType.js";
import { resourceInstance } from "../buckets/systemReourcesInstances.js";



export class RowBinaryAllocator {
    /**
     * 
     * @param {*} GroupRolesName 
     * @param {RoleCompiler} roles 
     */

    constructor(GroupRolesName, roles) {


        this.groupRolesPid = 0;
        /**
         * @type {RoleCompiler}
         */
        this.roles = roles;

        this.striders = {};
       

        this.totalSize = 0;
        this.buffer = {};
        this.pTi = {};
        this.globalStriders = {}
        this.wildcard=STRIDER_SIZES.WILDCARD_INDEX;

        if (!this.addGroupRoles(GroupRolesName)) throw new Error("Roles Errors");




    }
    /**
     * 
     * @param {*} GroupRolesName 
     * @param {CalculateStrider} roles 
     * @returns 
     */

    addGroupRoles(GroupRolesName) {
        const GroupId = resourceInstance.getRoleId(GroupRolesName);
        if (!GroupId) return {code:SYSTEM_STATUS.ROLE_NOT_FOUND,message:`not valid Role ${GroupRolesName}`};
        this.groupRolesPid = GroupId;
        this.striders = this.roles.striders;
      
        this.totalSize = this.roles.striders.totalBytesSize;
   
        this.pTi = this.roles.getPTI();
        this.globalStriders = this.roles.globalstriders;
        this._pathsBuffer = this.roles._pathsBuffer;
        this._pathsBufferInstanceSize = this.roles._pathsBufferInstanceSize;
        this._pathsBufferSize = this.roles._pathsBufferSize;
        this._pathsBufferInstanceCounts = this.roles._pathsBufferInstanceCounts
        this.buffer = this.#createMemoryBuffer();
        

        this.childCompactTree = this.roles.getChildCompactTree();
        this.wildCardCompactTree=this.roles.getWildCardCompactTree()
      


        return true;

    }

    /**
     * @return {Uint8Array}
     */
    #createMemoryBuffer() {

       const requiredBytes = this.totalSize;
       const arrayType=STRIDER_SIZES.WILDCARD_ARRAY_TYPE

    
    if (this.buffer instanceof arrayType && this.buffer.length >= requiredBytes) {
        this.buffer.fill(0); 
        return this.buffer;
    }

   
    return new arrayType(requiredBytes);
    }
   
    
     translateChildGlobalToCompact(parentGlobal, childType, childGlobal) {
        const parentMap = this.childCompactTree.get(parentGlobal);
        if (!parentMap) return -1;

        const childTypeMap = parentMap.get(childType);
        if (!childTypeMap) return -1;

        return childTypeMap.get(childGlobal) ?? -1;
    }

    /**
   * @param {number} parentGlobal - Parent Global Index
    * @param {ResourcePid} childType - Child ResourcePid
    * @param {number} childGlobal - Child Global Inde
    * @return childCompact or -1 if not fount 
    * */

    translateWildCardGlobalToCompact(parentId, childType, childGlobal) {
        const parentMap = this.wildCardCompactTree.get(parentId);
        if (!parentMap) return -1;

        const childTypeMap = parentMap.get(childType);
        if (!childTypeMap) return -1;

        return childTypeMap.get(childGlobal) ?? -1;
    }
    /**
   
    /**
     *
     * @param {ResourcePid} parentId
     * @param {number} instanceIndex
     * @returns {Object} striderSize -- contain elements size
     */
    getinstanceStriderSize(parentId, instanceIndex) {
        
        return this.striders[parentId][instanceIndex].striderSize


    }
    /**
    *
    * @param {ResourcePid } parentId
    * @param { number } instanceIndex
    * @returns { Object } striderOffset -- contain elements offset insede row Binary
    */
    getinstanceStriderOffset(parentId, instanceIndex) {
        return this.striders[parentId][instanceIndex].striderOffset


    }
    /**
     *
     * @param {ResourcePid} parentId
     * @param {number} instanceIndex
     * @returns {number} shift is bigening of each parent index in row binary
     */
    getinstanceStriderShift(parentId, instanceIndex) {
        
       
    return this.striders?.[parentId]?.[instanceIndex]?.shift ?? 0;


    }


  
    /**
     *
     * @param {ResourcePid} parentId
     * @returns {Set} Contain parent instance in e.g([0,3,2,4])
     */
    getInstacesList(parentId) {
        return this.pTi.get(parentId)?.instance;
    }
    getGlobalStrider(parentId) {
        return this.globalStriders[parentId];
    }



}