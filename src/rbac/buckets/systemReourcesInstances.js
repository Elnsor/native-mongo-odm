import { EVENT_MTYPES, EVENT_TYPES } from "../../Monitor/constant/eventType.js";
import { record } from "../../Monitor/monitoringSystem.js";
import { RoleBaseBuckets } from "./buckets.js";
import { SYSTEM_STATUS,TYPE_IDS , RESOURCE_NONE_INSTANCES, STRIDER_SIZES, RESOURCES_CHILD, SIZE_POWER} from "../constant/resourceType.js";


/**
 * Used for caching every instance of every resource into its own index.
 * Optimized for runtime creation and safe deletion in multi-tenant environments.
 */
export class SystemResourcesIntstances {

    constructor() {

        this.resourcelist = Object.create(null);
        this.roleList=Object.create(null);
        this.roleList["counter"]=1;
        this.reverseRoleList=Object.create(null);
        this.rolesCount=0;
        this.totalResourcesCount=0;
        this.totalResourcesDeleteCount=0;
        
    }
/**
 * 
 * @param {String} RoleName : group role name 
 * @returns {boolean} true for success
 */
    AddRole(RoleName) {
        //validate pid
       

        if (this.roleList?.[RoleName] !== undefined ) return { code: SYSTEM_STATUS.ROLE_EXISTS , message: `ResourceInstanceError: Role With Sama Name is Existes ${RoleName}` };

       
       
        this.roleList[RoleName]=this.roleList.counter;
        this.reverseRoleList[counter]=RoleName;
        this.roleList.counter++;
        this.rolesCount++;

        const wildcard=STRIDER_SIZES.WILDCARD_INDEX;

        if(wildcard < 32 && this.roleList.counter % wildcard > wildcard-10 ) // max wildcard  is 32 
           SIZE_POWER.WILDCARD*=2
        return true;
    }

 /**
  * #### delete Group Role by name if Role is Active then its denied 
  * @param {String } GroupRoleName -- name of group  
  * @returns {boolean} true for sucsses ,fail return message code 
  */   
deleteRolebyName(GroupRoleName){
    const isRoleActive=RoleBaseBuckets.isRoleActiveByName(GroupRoleName) 
    if(isRoleActive) return {code:SYSTEM_STATUS.DELETE_ERROR,message: `ResourceInstanceError: Cant Delete Active Role ${GroupRoleName}`}
    const roleId = this.roleList[GroupRoleName];
        if (roleId !== undefined) {
           
            delete this.roleList[GroupRoleName];
            delete this.reverseRoleList[roleId];
            this.rolesCount--;
        }
    return true;
}


    
/**
 * used for getten Rolegroup Id by name
 * @param {String} RoleName 
 * @returns {number} GroupRoleId | message code 
 */
    getRoleId(RoleName){
        if(this.roleList[RoleName] === undefined) return { code: SYSTEM_STATUS.ROLE_NOT_FOUND, message: `ResourceInstanceError: Role Name ${RoleName} not have any Id` }
        return this.roleList[RoleName];
    }

    /**
 * 
 * @param {number} roleId
 * @returns {String} GroupRoleId
 */
    getRoleNameById(roleId){
        if(this.reverseRoleList[roleId] === undefined) return { code: SYSTEM_STATUS.ROLE_NOT_FOUND, message: `ResourceInstanceError: Role Id ${roleId} not Exist Id` }
        return this.roleList[roleId];
    }
    
    /**
     * each resource type have a resource list nameing by its resourceName and any instance from this resource git indexed 
     * 
     * @param {import("../constant/typesDef.js").ResourcesName} res_Name
     * @param {String} instanceName
     * @returns {Boolean} true for success | fail message code
     */

    AddResourceInstance(res_Name, instanceName) {
        //validate pid

        if (!TYPE_IDS[res_Name]) return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `ResourceInstanceError: Not Valid Resources PID ${res_Name}` };

        const res_pid = TYPE_IDS[res_Name];


       if (RESOURCE_NONE_INSTANCES[res_pid]) return { code: SYSTEM_STATUS.INSTANCE_NOT_ALLOWED, message: `ResourceInstanceError: This Resource ${res_pid} Not Allowed to Have instance, its only have instance zero` };
        let counter = 0;


        if (!this.resourcelist?.[res_pid]) {
            this.resourcelist[res_pid] = {};

            this.resourcelist[res_pid].counter = counter;
            this.resourcelist[res_pid].index = Object.create(null);

        } else {
            counter = this.resourcelist[res_pid].counter;
        }

        if (this.resourcelist[res_pid].index[instanceName]) return { code: SYSTEM_STATUS.INSTANCE_EXIST, message: `ResourceInstanceError:existed instance resource Name ${instanceName}` }

        this.resourcelist[res_pid].index[instanceName] = counter;
        this.resourcelist[res_pid].counter++;
         this.totalResourcesCount++;
        // record metrics name with lable {pid:res_pid}
       record(EVENT_TYPES.RBAC_INSTANCE_ADDED,EVENT_MTYPES.METRIC_C, 1,res_pid)

        const wildcard=STRIDER_SIZES.WILDCARD_INDEX;

        if(wildcard< 32 && counter % wildcard > wildcard-10 )
           SIZE_POWER.WILDCARD*=2

        return true;

    }
 /**
 * Gets the instance index for a given resource name and instance name.
 * Optimized for O(1) hot-path lookups with minimal property access.
 * 
 * @param {import('../constant/typesDef.js').ResourcesName} res_Name
 * @param {String} instanceName
 * @returns {number | Object} The instance index, or an error object if not found.
 */
getResourceInstanceIndex(res_Name, instanceName) {
  
    const res_pid = TYPE_IDS[res_Name];
    if (!res_pid) {
        return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `ResourceInstanceError: Invalid Resources PID for ${res_Name}` };
    }
    
    if (instanceName === '*') return STRIDER_SIZES.WILDCARD_INDEX;
    if (RESOURCE_NONE_INSTANCES[res_pid]) return 0;

    const resourceData = this.resourcelist[res_pid];
    if (!resourceData) {
        return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `ResourceInstanceError: no exist index for resource Name ${instanceName}` };
    }

    const index = resourceData.index[instanceName];
    if (index === undefined) {
        return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `ResourceInstanceError: no exist index for resource Name ${instanceName}` };
    }


    return index;
}
    /**
     *  delete just parent type of resource instances 
     * if this instances are linked to active role then not allowed for deletion 
     * @param {import("../constant/typesDef.js").ResourcesName} res_Name 
     * @param {String} instanceName 
     * @returns {boolean} true for success | fail message code
     */

     deletetResourceInstanceIndex(res_Name, instanceName) {
         const res_pid = TYPE_IDS[res_Name];

        if (!res_pid) return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `ResourceInstanceError: Not Valid Resources PID for ${res_Name}` };

        const resIndex = this.getResourceInstanceIndex(res_Name, instanceName);
        if (resIndex?.code !== undefined) {
            return { success: false, code: resIndex.code, message: resIndex.message };
        }

         const isParentActive = RoleBaseBuckets.isParentReourceInstanceActive(res_pid, resIndex);
         if(isParentActive) return { success: false, code: SYSTEM_STATUS.DELETE_ERROR , message: `ResourceInstanceError: Cant Delelte instance ${instanceName} of type ${res_Name} it linked to Active role` };
    
   
    delete this.resourcelist[res_pid].index[res_Name];

        this.totalResourcesDeleteCount++;
        this.totalResourcesCount--;

    if (Object.keys(this.resourcelist[res_pid].index).length === 0) {
            delete this.resourcelist[res_pid];
        }

        return true
   }
    /**
 *
 * @param {ResourcesName} res_Name
 *
 * @returns {Object} contian instance name as prop and its value == index number e.g({users:0,product:1}); of its resources Name 
 */
    getResourceInstanceList(res_Name) {

        if (!TYPE_IDS[res_Name]) return { code:SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `ResourceInstanceError: Not Valid Resources PID ${res_Name}` };
        const res_pid = TYPE_IDS[res_Name];
        if (!this.resourcelist[res_pid]) return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `ResourceInstanceError: no list for this Resource type ${res_Name}` }
        return this.resourcelist[res_pid].index;

    }
/**
 * this method for testing in production its remove
 */
    reset(){

        this.resourcelist=Object.create(null);
        this.roleList=Object.create(null);
        this.roleList["counter"]=1;
        this.rolesCount=0;
    }

    getStats() {
        return {
            rolesCount: this.rolesCount,
            resourcesCount: this.totalResourcesCount,
            resourcesDeleteCount: this.totalResourcesDeleteCount,
            wildcardPower: SIZE_POWER.WILDCARD
           
        };
    }
}

export const resourceInstance = new SystemResourcesIntstances();