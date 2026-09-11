import { RowBinaryAllocator } from "./base-buffers.js";
import {SYSTEM_STATUS} from "../constant/resourceType.js"
import { record } from "../../Monitor/monitoringSystem.js";
import { EVENT_TYPES,EVENT_MTYPES,DOMAIN } from "../../Monitor/constant/eventType.js";





export class RoleBinaryWorker extends RowBinaryAllocator {
    /**
     * 
     * @param {*} GroupRolesName 
     * @param { CalculateStrider} roles 
     */

    constructor(GroupRolesName, roles) {
        super(GroupRolesName, roles);
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_BUFFER_CREATED,EVENT_MTYPES.METRIC_C);
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_BUFFER_SIZE,EVENT_MTYPES.METRIC_H,this.buffer.byteLength);
        //this.roles = roles;

    }

    setWorkerRoleId() {
        this.buffer[0] = this.groupRolesPid
    }

    setWorkerParentinstanceId(instanceId) {
        let address = this.shift
        let offset = this.sOffset[this.pid];
        address += offset;
        this.buffer[address] = instanceId;
    }
    setWorkerValueToAddr(address, value) {
        this.buffer[address] = value;

    }
   
    getRoleMemberId(parentId,parentInstanceIndex){
          const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
          shift++;
          return this.buffer[shift];
    }
    getEffectedValue(address) {
        return this.buffer[address];
    }

    /**
     * 
     * @param {RolePid & {}} GroupRoleId 
     * @param {ResourcePid} parentId 
     * @param {ResourcePid} parentInstanceIndex 
     * @param {ResourcePid} child 
     * @param {ResourcePid} childInstanceIndex 
     * @param {ResourcePid} grandChild 
     * @param {ResourcePid} grandChildIndex 
     * @param {ResourcePid} fetchGroupRole 
     * @param {boolean} value 
     * @returns {number} its address or value 
     */
    geteffected(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null, fetchGroupRole = false, value = false) {
        if (this.groupRolesPid !== GroupRoleId) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`Group Role Id missmatch `};
        if (parentId === undefined || parentInstanceIndex === undefined) return {code:SYSTEM_STATUS.INVALID_RESOURCE_PID,message:`GetRoleAddress: Invalid Resources Pid ${parentId}`};
        const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
        const striderSizeMap = this.getinstanceStriderSize(parentId, parentInstanceIndex);
        const striderOffsetMap = this.getinstanceStriderOffset(parentId, parentInstanceIndex);
        const wildcard=this.wildcard;


        let address = shift;
        if (fetchGroupRole) {
            if (value) return this.buffer[shift];
            
            return shift;
        }


        



        address += striderOffsetMap[parentId];
        if (address === undefined) {
            return {code:SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined parent address Pid ${parentId}`};
        }




        if (child !== null) {

            if (striderOffsetMap[child] === undefined) {
                return {cod:SYSTEM_STATUS.UNDEFINED_ADDRESS,message:`GetRoleAddress: undefined child address Pid ${child}`};
            }

            childInstanceIndex %=wildcard;

            address = shift + striderOffsetMap[child];
            address += striderSizeMap[child] * childInstanceIndex
        }

        if (grandChild !== null) {

            if (striderOffsetMap[grandChild] === undefined) {
                return {code:SYSTEM_STATUS.UNDEFINED_ADDRESS,message:`GetRoleAddress: undefined grandChild address Pid ${grandChild}`};
            }
            const childSize = striderSizeMap[child]
            grandChildIndex%=wildcard;

            address = shift + striderOffsetMap[grandChild];
            address += striderSizeMap[grandChild] * grandChildIndex
            address += childInstanceIndex * childSize
        }
        // check buffer Boundry

        if (address > this.buffer.length || address < 0){
            record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_BUFFER_OVERFLOW,EVENT_MTYPES.METRIC_C);
             return {code:SYSTEM_STATUS.BUFFER_OVERFLOW,message:`GetRoleAddress:Buffer overFlow`}
          };

        return (value ? this.buffer[address] : address);

    }
    
 geteffectedAccess(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null) {
   
        if (this.groupRolesPid !== GroupRoleId) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`Group Role Id missmatch `};
        
        const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
        const striderSizeMap = this.getinstanceStriderSize(parentId, parentInstanceIndex);
        const striderOffsetMap = this.getinstanceStriderOffset(parentId, parentInstanceIndex);
        const wildcard=this.wildcard;
       
        let prAddress  =null;
        
       
        let effectedRoleId = null ;
        let priValue   =null;
        let chIValue   =null;
        let currentChiValue=null;
        let gchIValue  =null;
        let leafValue  =null;
        let hasTTL   =null;
        let effected =-1;
     


        let address = shift;
       
            
                effectedRoleId=this.buffer[shift];
                  

        if (effectedRoleId !== GroupRoleId) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`effected role ${effectedRoleId} id not match for commine role id ${GroupRoleId}`};
            

  
        if (parentId === undefined || parentInstanceIndex === undefined) return {code:SYSTEM_STATUS.INVALID_RESOURCE_PID,message:`GetRoleAddress: Invalid Resources Pid ${parentId}`};
        


        address += striderOffsetMap[parentId];
        if (address === undefined) {
            return {code:SYSTEM_STATUS.RESOURCE_NOT_FOUND,message:`Resource ${parentId} not found in strider offset`};
        }


        prAddress=address;
        priValue=this.buffer[prAddress];
     

        if(priValue != parentInstanceIndex ) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`comming parent id not match to cuurent parent id in buffer`}




        if (child !== null) {

            if (striderOffsetMap[child] === undefined) {
               
                 
                return {code:SYSTEM_STATUS.RESOURCE_NOT_FOUND,message:`Resource child ${child} not fount in strider offset`};
            }

          
            address = shift + striderOffsetMap[child];
            
              chIValue=this.buffer[address];
               childInstanceIndex =( chIValue === wildcard ? 0 : childInstanceIndex % wildcard );

            address += striderSizeMap[child] * childInstanceIndex
            currentChiValue=this.buffer[address];
       
  
            if(currentChiValue !== childInstanceIndex && currentChiValue != chIValue) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`comming child instance not equal to current child instance in buffer`};
  
            if(grandChild === null){
               effected=this.buffer[address+3];
            }


            hasTTL=this.buffer[address+2];
          
        }

        if (grandChild !== null) {

            if (striderOffsetMap[grandChild] === undefined) {
               return {code:SYSTEM_STATUS.RESOURCE_NOT_FOUND,message:`Resource grandchild ${grandChild} not fount in strider offset`};
            }
            const childSize = striderSizeMap[child]
          
            address = shift + striderOffsetMap[grandChild];
           
             gchIValue=this.buffer[address];
             grandChildIndex = ( gchIValue === wildcard ? 0 : grandChildIndex % wildcard);

            address += striderSizeMap[grandChild] * grandChildIndex
            
            address += childInstanceIndex * childSize
            leafValue=this.buffer[address];
            if(leafValue != grandChildIndex && leafValue !== gchIValue) return {code:SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message:`comming grandchild instance not equal to current grandchild instance in buffer`};

             effected=this.buffer[address+3];
            hasTTL=this.buffer[address+2];
         
        }
            if (address > this.buffer.length || address < 0){

            record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_BUFFER_OVERFLOW,EVENT_MTYPES.METRIC_C);

             return {code:SYSTEM_STATUS.BUFFER_OVERFLOW,message:`GetRoleAddress:Buffer overFlow`}
          };
          
           if (hasTTL > 0) {
        //const exp = this.getTTLAddress(parentId,parentInstanceIndex, child, childInstanceIndex, grandChild, grandChildIndex, true);
        const time = Math.floor(Date.now() / 1000);

      
        if (time >= hasTTL) return {code:SYSTEM_STATUS.PERMISSION_EXPIRED,message:"Permission expired"}; // Permission expired
    }
        // check buffer Boundry

     return effected;
}


setWorkerValue(value = 0,roleId,memberId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null, ttl = null) {

        let address = this.geteffected(this.groupRolesPid, parentId, parentInstanceIndex, child, childInstanceIndex, grandChild, grandChildIndex);
        if(address?.code !== undefined ) return address;
      

        if (grandChild) { // if thier is grandchild its and have instance then it have byte id for each instance

            // if(!childId ) return -1; // any child have child must be taged


            this.setWorkerValueToAddr(address, grandChildIndex);

            address++;
            this.setWorkerValueToAddr(address, memberId);
            address++;

            if (ttl) {
                this.setWorkerValueToAddr(address, ttl);
            }
            address++;
            this.setWorkerValueToAddr(address, value);

            address = this.geteffected(this.groupRolesPid, parentId, parentInstanceIndex, child, childInstanceIndex);
        
            if(address?.code !== undefined) return address;

            this.setWorkerValueToAddr(address, childInstanceIndex); //set child id
            address++;

        } else { // no grand child

            this.setWorkerValueToAddr(address, childInstanceIndex);
            address++;
            this.setWorkerValueToAddr(address, memberId);
            address++;
            if (ttl) {

                this.setWorkerValueToAddr(address,ttl);
            }

            address++;
            this.setWorkerValueToAddr(address, value);



        }//
        return true;



    }

    addRolesValuseToRowBinary() {

        for (const [pType, data] of this.pTi.entries()) {

            const insList = [...data.instance];

            for (let i = 0; i < insList.length; i++) {

                const pInstance = insList[i]

                let groupIdAddress = this.geteffected(this.groupRolesPid, pType, pInstance, null, null, null, null, true);
               
                if(groupIdAddress?.code != undefined) return groupIdAddress;

                this.setWorkerValueToAddr(groupIdAddress, this.groupRolesPid);
                groupIdAddress++;

                this.setWorkerValueToAddr(groupIdAddress, pInstance);
            }


            const pathsInsanceSize = this._pathsBufferInstanceSize
           
            for (let k = 0; k < this._pathsBufferInstanceCounts; k++) {
                const offset = k * pathsInsanceSize;
                 
                
                const roleId = this._pathsBuffer[offset + 0];
                const memberId = this._pathsBuffer[offset + 1];

                const pType = this._pathsBuffer[offset + 2];
                const pIndex = this._pathsBuffer[offset + 3];
                const cType = this._pathsBuffer[offset + 4];
                const cIndex = this._pathsBuffer[offset + 5];
                const GType = this._pathsBuffer[offset + 6];
                const GIndex = this._pathsBuffer[offset + 7];
                const effects = this._pathsBuffer[offset + 8];
                const ttl = this._pathsBuffer[offset + 9];

                // Check if this path entry terminates at a Child or a Grandchild

                const gType = GType <= 0 ? null : GType;
                const gIndex = GType <= 0 ? null : GIndex;

                
               
            
                const stat=this.setWorkerValue(effects, roleId, memberId, pType, pIndex, cType, cIndex, gType, gIndex, ttl);
                if(stat?.code !== undefined) return stat;
              
              
            }

        }
        return true;
    }


}
