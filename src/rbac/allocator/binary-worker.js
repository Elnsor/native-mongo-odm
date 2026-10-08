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

   
    setWorkerValueToAddr(address, value) {
        this.buffer[address] = value;

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

    if (this.groupRolesPid !== GroupRoleId) return -1
    const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
    const striderSizeMap = this.getinstanceStriderSize(parentId, parentInstanceIndex);
    const striderOffsetMap = this.getinstanceStriderOffset(parentId, parentInstanceIndex);
    const wildcard = this.wildcard;

    let address = shift;
    
    if (fetchGroupRole) {
        if (value)
            return this.buffer[shift];
        return shift;
    }

    if (parentId === undefined || parentInstanceIndex === undefined) return {code: SYSTEM_STATUS.INVALID_RESOURCE_PID,message: `GetRoleAddress: Invalid Resources Pid ${parentId}`};

    address += striderOffsetMap[parentId];

    if (address === undefined) {
        return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined parent address Pid ${parentId}`};
    }

    let childCount=0;
    let childShift=0;

    if (child !== null) {

        if (striderOffsetMap[child] === undefined) {
            return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined child address Pid ${child}`};
        }

        childInstanceIndex %= wildcard;

        address = shift + striderOffsetMap[child];
            
        if(grandChild !== null){
            
            childCount=this.buffer[address];
        let tempAddress=address;
            tempAddress++;
            childShift=this.buffer[tempAddress+childInstanceIndex];
            address=tempAddress+(childCount+childShift);
            
    }else{
        address += striderSizeMap[child] * childInstanceIndex
    }
    }

    if (grandChild !== null) {
        const grandChildTypeOffset=striderOffsetMap[grandChild]

        if (grandChildTypeOffset === undefined) {
            return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined grandChild address Pid ${grandChild}`};;
        }
        grandChildIndex %= wildcard;
        address+=grandChildTypeOffset
        address += striderSizeMap[grandChild] * grandChildIndex
        
    }
    // check buffer Boundry

    if (address > this.buffer.length || address < 0) return {code: SYSTEM_STATUS.BUFFER_OVERFLOW,message: `GetRoleAddress:Buffer overFlow`};

    return (value ? this.buffer[address] : address);


}
/**
* used for getting correct nested child address
* @param {number} GroupRoleId 
* @param {ResourcePid} parentId 
* @param {number} parentInstanceIndex 
* @param {ResourcePid} child 
* @param {number} childInstanceIndex 
* @returns {number} address
*/

getNesteChilddAddress(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null ) {
    if (this.groupRolesPid !== GroupRoleId) return -1
    const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
    const striderOffsetMap = this.getinstanceStriderOffset(parentId, parentInstanceIndex);
    const wildcard = this.wildcard;

    let address = shift;

    if (parentId === undefined || parentInstanceIndex === undefined) return {code: SYSTEM_STATUS.INVALID_RESOURCE_PID,message: `GetRoleAddress: Invalid Resources Pid ${parentId}`};

    address += striderOffsetMap[parentId];

    if (address === undefined) {
        return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined parent address Pid ${parentId}`};
    }

let childCount=0;
let childShift=0;

    if (child !== null) {

        if (striderOffsetMap[child] === undefined) {
            return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined child address Pid ${child}`};
        }

        childInstanceIndex %= wildcard;

        address = shift + striderOffsetMap[child];

        childCount=this.buffer[address];
    let tempAddress=address;
        tempAddress++;
        childShift=this.buffer[tempAddress+childInstanceIndex];
        address=tempAddress+(childCount+childShift);
    
    }

    if (address > this.buffer.length || address < 0) return {code: SYSTEM_STATUS.BUFFER_OVERFLOW,message: `GetRoleAddress:Buffer overFlow`};

    return address;
}

geteffectedAccess(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null,currentTimeStamp) {

    if (this.groupRolesPid !== GroupRoleId) return -1

    const shift = this.getinstanceStriderShift(parentId, parentInstanceIndex);
    const striderSizeMap = this.getinstanceStriderSize(parentId, parentInstanceIndex);
    const striderOffsetMap = this.getinstanceStriderOffset(parentId, parentInstanceIndex);
    const wildcard = this.wildcard;

    let prAddress = null;


    let effectedRoleId = null;
    let priValue = null;
    let chIValue = null;
    let hasTTL = null;
    let effected = -1;



    let address = shift;


    effectedRoleId = this.buffer[shift];


    if (effectedRoleId !== GroupRoleId) return {code: SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message: `effected role id not match for commine role id`};

    if (parentId === undefined || parentInstanceIndex === undefined) return {code: SYSTEM_STATUS.INVALID_RESOURCE_PID,message: `not valid parent pid or instance parent index`};

    address += striderOffsetMap[parentId];
    if (address === undefined) {
        return {code: SYSTEM_STATUS.RESOURCE_NOT_FOUND,message: `Resource ${parentId} not found in strider offset`};
    }

    prAddress = address;
    priValue = this.buffer[prAddress];

    if (priValue != parentInstanceIndex) return {code: SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message: `comming parent id not match to cuurent parent id in buffer`}

    if (child !== null) {

        if (striderOffsetMap[child] === undefined) {
            return {code: SYSTEM_STATUS.UNDEFINED_ADDRESS,message: `GetRoleAddress: undefined child address Pid ${child}`};
        }

        childInstanceIndex %= wildcard;

        address = shift + striderOffsetMap[child];

        if(grandChild !== null){
            
            const childCount=this.buffer[address];
            let tempAddress=address;
                tempAddress++;
            const childShift=this.buffer[tempAddress+childInstanceIndex];
                address=tempAddress+(childCount+childShift);
        
    }else{

        address += striderSizeMap[child] * childInstanceIndex

    }
        chIValue = this.buffer[address];

        childInstanceIndex %= wildcard;

        if (chIValue !== childInstanceIndex ) return {code: SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE,message: `comming child instance not equal to current child instance in buffer`};

        if (grandChild === null) {
            effected = this.buffer[address + 3];
        }

        hasTTL = this.buffer[address + 2];
    }

    if (grandChild !== null) {

        const grandChildTypeOffset=striderOffsetMap[grandChild]

        if ( grandChildTypeOffset === undefined) {
            return {code: SYSTEM_STATUS.RESOURCE_NOT_FOUND,message: `Resource grandchild ${grandChild} not fount in strider offset`};
        }

        grandChildIndex %= wildcard;
        address+=grandChildTypeOffset
        address += striderSizeMap[grandChild] * grandChildIndex

        const currentBufferGrandChildIndex = this.buffer[address];

        if (currentBufferGrandChildIndex != grandChildIndex ) return { code: SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE, message: `comming grandchild instance not equal to current grandchild instance in buffer` };

            hasTTL = this.buffer[address + 2];
            effected = this.buffer[address + 3];

    }

    if (address >= this.buffer.length || address < 0) return {code: SYSTEM_STATUS.BUFFER_OVERFLOW,message: "Buffer overflow"} //check buffer overflow

    if (hasTTL) {

        if (currentTimeStamp >= hasTTL) return {code: SYSTEM_STATUS.PERMISSION_EXPIRED,message: "Permission expired"}; // Permission expired
    }
    // check buffer Boundry

    return effected;
}


setWorkerValue(value = 0, roleId, memberId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null, ttl = null) {


    let address = this.geteffected(roleId, parentId, parentInstanceIndex, child, childInstanceIndex, grandChild, grandChildIndex);


    if (grandChild) { // if thier is grandchild its and have instance then it have byte id for each instance

        this.setWorkerValueToAddr(address, grandChildIndex);

        address++;
        this.setWorkerValueToAddr(address, memberId);
        address++;

        if (ttl) {
            this.setWorkerValueToAddr(address, ttl);
        }

        address++;
        this.setWorkerValueToAddr(address, value);

        address = this.getNesteChilddAddress(this.groupRolesPid, parentId, parentInstanceIndex, child, childInstanceIndex);
        
        this.setWorkerValueToAddr(address, childInstanceIndex); //set child id
        address++;

    } else { // no grand child

        this.setWorkerValueToAddr(address, childInstanceIndex);
        address++;
        this.setWorkerValueToAddr(address, memberId);
        address++;
        if (ttl) {

            this.setWorkerValueToAddr(address, ttl);
        }

        address++;
        this.setWorkerValueToAddr(address, value);

    }//
}


addRolesValuseToRowBinary() {

    for (const [pType, data] of this.pTi.entries()) {

        const insList = [...data.instance];

        for (let i = 0; i < insList.length; i++) {

            const pInstance = insList[i]

            let groupIdAddress = this.geteffected(this.groupRolesPid, pType, pInstance, null, null, null, null, true);

            this.setWorkerValueToAddr(groupIdAddress, this.groupRolesPid);
            groupIdAddress++;

            this.setWorkerValueToAddr(groupIdAddress, pInstance);

            if(this.roles.nestedChildCompactoffsetTree.has(pInstance)){
                const pMaps=this.roles.nestedChildCompactoffsetTree.get(pInstance);

                for(const [childType,childComactMaps] of pMaps){
                    
                    let chaddress=this.geteffected(this.groupRolesPid,pType,pInstance,childType,0);
                                    this.setWorkerValueToAddr(chaddress,childComactMaps.size)
                                    chaddress++;
                    for(const [chIns,childShift] of childComactMaps){
                
                        this.setWorkerValueToAddr(chaddress+chIns,childShift);

                    }
                }

            }
        }
    }


        const paths=this.roles.pathsMemeber
        const pathsInsanceSize=this._pathsBufferInstanceSize;
        for( const [member,memberPaths] of Object.entries(paths)){
        

        for (let k = memberPaths.start; k < memberPaths.end; k++) {
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

            this.setWorkerValue(effects, roleId, memberId, pType, pIndex, cType, cIndex, gType, gIndex, ttl);
        }
    }
}
}
