import { EVENT_MTYPES, EVENT_TYPES } from "../../Monitor/constant/eventType.js";
import { record } from "../../Monitor/monitoringSystem.js";
import { SYSTEM_STATUS,TYPE_IDS , TYPE_ID_TAG,STRIDER_SIZES,RESOURCES_CHILD,SIZE_POWER} from "../constant/resourceType.js";


/**
 * used for cached every instance of every resource int it own index 
 */
export class SystemResourcesIntstances {

    constructor() {

        this.resourcelist = {};
        this.roleList=Object.create(null);
        this.roleMemberList=Object.create(null);
        this.roleList["counter"]=1;
        this.rolesCount=0;
        

        

    }

   

     AddRole(RoleName) {
        //validate pid
       

        if (this.roleList?.[RoleName] !== undefined ) return { code: SYSTEM_STATUS.ROLE_EXISTS , message: `Role With Sama Name is Existes ${RoleName}` };

        //this.roleList[this.this.roleList.counter]=RoleName;
       
        this.roleList[RoleName]=this.roleList.counter++;
        this.rolesCount++;

       
      
        const wildcard=STRIDER_SIZES.WILDCARD_INDEX;

        if(wildcard < 32 && this.roleList.counter % wildcard > wildcard-10 ) // max wildcard  is 32
           SIZE_POWER.WILDCARD*=2
        return true;
    }
    /**
     * 
     * @param {String} RoleName -name guest admind 
     * @param {string} roleMemberName - role-1 role-2
     * @param {RoleElementObject} roleElementObject 
     * @returns 
     */
    AddRoleMember(RoleName, roleMemberName) {
        const roleId = this.getRoleId(RoleName);
        if (roleId === undefined) {
            return { code:SYSTEM_STATUS.ROLE_NOT_FOUND, message: `Role does not exist: ${RoleName}` };
        }

        // Initialize the role's member container only if it doesn't exist yet
        if (!this.roleMemberList[roleId]) {
            this.roleMemberList[roleId] = {
                groupRoleName: RoleName,
                counter: 0,
                memberToIndex: Object.create(null),
                memberFromIndex: Object.create(null)
            };
        }

        const roleData = this.roleMemberList[roleId];

        // Check if member already exists within this role
        if (roleData.memberToIndex[roleMemberName] !== undefined) {
            return { code: SYSTEM_STATUS.ROLE_MEMBER_EXISTS , message: `Role member already exists: ${roleMemberName}` };
        }

        const memberId = roleData.counter++;

        // Bidirectional mapping
        /**
         * {roleId:{
         * memberFromIndex:{
         *                   memberId:roleMemberName
         * },
         * memberToIndex:{
         *                  memberName: memberId
         * },
         * }, end of roleId
         * },end of 
         * 
         */
        roleData.memberFromIndex[memberId] = roleMemberName;
        roleData.memberToIndex[roleMemberName] = memberId;

      

        return true;
    }
/**
 * 
 * @param {number} roleId -- GroupRole Id 
 * @param {number} roleMemberId -- role Member Id 
 * @returns {String} RoleMemberName return member name by specify RoleId and MemeberId
 */
    getRoleMemberNameByIndexed(roleId, roleMemberId) {
        if (!this.roleMemberList[roleId]) return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `Invalid role ID ${roleId}` };
        return this.roleMemberList[roleId].memberFromIndex[roleMemberId];
    }
    /**
     * return roleMemberid by passing roleId and RoleMemberName
     * @param {number} roleId 
     * @param {string} roleMemberName 
     * @returns {number} roleMemberId
     */

    getRoleMemberIndexByName(roleId, roleMemberName) {
        if (!this.roleMemberList[roleId]) return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `Invalid role ID ${roleId}` };
        return this.roleMemberList[roleId].memberToIndex[roleMemberName];
    }

    /**
     * 
     * @param {number} groupRoleId 
     * @returns {string} GroupRoleName : return Role Name by passing RoleId
     */
    getGoupNameById(groupRoleId) {
        if (!this.roleMemberList[groupRoleId]) return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `Invalid group role ID ${groupRoleId}` };
        return this.roleMemberList[groupRoleId].groupRoleName;
    }
/**
 * 
 * @param {String} RoleName 
 * @returns {number} GroupRoleId
 */
    getRoleId(RoleName){
        if(this.roleList[RoleName] === undefined) return { code: SYSTEM_STATUS.ROLE_NOT_FOUND, message: `Role Name ${RoleName} not have any Id` }
        return this.roleList[RoleName];
    }
    /**
     * each resource type have a resource list nameing by its resourceName and any instance from this resource git indexed 
     * 
     * @param {import("../constant/typesDef.js").ResourcesName} res_Name
     * @param {String} instanceName
     * @returns
     */

    AddResourceInstance(res_Name, instanceName) {
        //validate pid

        if (!TYPE_IDS[res_Name]) return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not Valid Resources PID ${res_Name}` };

        const res_pid = TYPE_IDS[res_Name];


        if (!TYPE_ID_TAG[res_pid]) return { code: SYSTEM_STATUS.INSTANCE_NOT_ALLOWED, message: `None Instance for None Taged Resources ${res_pid},any none taged have instance 0` };
        let counter = 1;


        if (!this.resourcelist?.[res_pid]) {
            this.resourcelist[res_pid] = {};

            this.resourcelist[res_pid].counter = counter;
            this.resourcelist[res_pid].index = Object.create(null);

        } else {
            counter = this.resourcelist[res_pid].counter;
        }

        if (this.resourcelist[res_pid].index[instanceName]) return { code: SYSTEM_STATUS.INSTANCE_EXIST, message: "existed instance resource Name" }

        this.resourcelist[res_pid].index[instanceName] = counter;
        this.resourcelist[res_pid].counter++;
        // record metrics name with lable {pid:res_pid}
       record(EVENT_TYPES.RBAC_INSTANCE_ADDED,EVENT_MTYPES.METRIC_C, 1,res_pid)

        const wildcard=STRIDER_SIZES.WILDCARD_INDEX;

        if(wildcard< 32 && counter % wildcard > wildcard-10 )
           SIZE_POWER.WILDCARD*=2

        return true;

    }
    /**
     *
     * @param {import('../constant/typesDef.js').ResourcesName} res_Name
     * @param {String} instanceName
     * @returns {number} resource instane index value by instance name 
     */
    
    getResourceInstanceIndex(res_Name, instanceName) {
        const res_pid = TYPE_IDS[res_Name];

        if (!res_pid) return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not Valid Resources PID for ${res_Name}` };
        if (instanceName === '*') return STRIDER_SIZES.WILDCARD_INDEX;
        if (res_pid === 101) return 0;

        if (!this.resourcelist[res_pid] || this.resourcelist[res_pid].index[instanceName] === undefined) return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `no (list | existed instance) reource Name ${instanceName}` }
        return Number(this.resourcelist[res_pid].index[instanceName]);

        

    }

     deletetResourceInstanceIndex(res_Name, instanceName) {
        const res_pid = TYPE_IDS[res_Name];

        if (!res_pid) return { code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not Valid Resources PID for ${res_Name}` };
        if (instanceName === '*') return STRIDER_SIZES.WILDCARD_INDEX;
        if (RESOURCES_CHILD[res_pid] === null) return 0;

        if (!this.resourcelist[res_pid] || this.resourcelist[res_pid].index[instanceName] === undefined) return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `no (list | existed instance) reource Name ${instanceName}` }
        delete this.resourcelist[res_pid].index[instanceName];
        return true
     }
    /**
 *
 * @param {ResourcesName} res_Name
 *
 * @returns {Object} contian instance name as prop and its value == index number e.g({users:0,product:1}); of its resources Name 
 */
    getResourceInstanceList(res_Name) {

        if (!TYPE_IDS[res_Name]) return { code:SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Not Valid Resources PID ${res_Name}` };
        const res_pid = TYPE_IDS[res_Name];
        if (!this.resourcelist[res_pid]) return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `no list for this Resource type ${res_Name}` }
        return this.resourcelist[res_pid].index;

    }
/**
 * this method for testing in production its remove
 */
    reset(){

        this.resourcelist=Object.create(null);
        this.roleList=Object.create(null);
        this.roleMemberList=Object.create(null);
        this.roleList["counter"]=1;
        this.rolesCount=0;
    }

    getStats() {
        return {
            rolesCount: this.rolesCount,
            roleMembersCount: Object.keys(this.roleMemberList).length,
            resourcesCount: Object.keys(this.resourcelist).length,
            wildcardPower: SIZE_POWER.WILDCARD
           
        };
    }
}

export const resourceInstance = new SystemResourcesIntstances();