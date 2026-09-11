import { normalizeTTLToTimestamp,parseDurationStringToSeconds } from "../utils/utils.js";
import { TYPE_IDS, TYPE_ID_TAG ,  STRIDER_SIZES ,SYSTEM_STATUS,DEFAULT_ACTIONS,BOUNDARY,RESOURCES_CHILD} from "../constant/resourceType.js";
import {ResourceRoleGroupManager} from"./base-manager.js"
import { resourceInstance } from "../buckets/systemReourcesInstances.js";

export class RoleCompiler extends ResourceRoleGroupManager{
    #wildcard={};

     constructor(groupRoleName, groupRoles,update=false) {
        super(groupRoleName, groupRoles,update);
        this.LeafToPI = new Map();
        this.#wildcard = {};
        this.striders = Object.create(null);
    
        this.schemaInsance = Object.create(null);
      
        this.globalstriders = Object.create(null);

        
        this.childCompactTree=new Map();
        this.wildcardCompactTree=new Map();

    }

    #getOrInitMap(targetMap, key) {
    let subMap = targetMap.get(key);
    if (!subMap) {
        subMap = new Map();
        targetMap.set(key, subMap);
    }
    return subMap;
}


#getOrCreateSchemaSlice(targetMap,PathSteps ,resIndex, parentResource,childName,childCount,gChildName=null,gChildCount=null) {
    let slice = targetMap.get(resIndex);
   
    if (!slice) {
        slice = { 
            parentResource: { name: parentResource, capacity: 1 }, 
            child: [], 
            grandChild: [] ,
            pathsBufferIndex: PathSteps 
        };
    }

    let childSlice={name:childName,capacity:childCount}
        slice.child.push(childSlice);

        if(gChildName){
            let gChildSlice={name:gChildName,capacity:gChildCount}
            slice.grandChild.push(gChildSlice);

        }
    targetMap.set(resIndex, slice);
    return slice;
}

/**
 * 
 * @param {ActionEffect} action 
 * @param {BoundaryStrategy} boundary 
 * @returns {number } effectedAction
 */

geteffectedActionBoundary(action,boundary){
      let effects = 0;

        for (let keyAction of action) {
            const byteAction = DEFAULT_ACTIONS[keyAction];
            effects |= byteAction;
        }
        effects |= BOUNDARY[boundary];

        return effects;
}
getStriders(){
    return this.striders
}

getStridersByParentPID(parentPid){
    return this.striders[parentPid]
}
getStridersByParentInsPID(parentPid,instanceIndex){
    return this.striders[parentPid][instanceIndex]
}

/**
 * 
 * @param {ResourcesName} parentName 
 * @param {string} instanceName 
 * @returns 
 */
getStridersByParentInsName(parentName,instanceName){
    const pid=TYPE_IDS[parentName];
    const index=resourceInstance.getResourceInstanceIndex(parentName,instanceName);

    if(index.code != undefined) return index;
    return this.striders[pid][index];
}

/**
 * 
 * @param {ResourcesPid} respid 
 * @param {ResourcesPid} leafPid 
 * @param {number} effects 
 * @param {Array} parentInstance 
 * @returns {[] | parentInstance}
 */
#filterWildcard(respid, leafPid, effects, parentInstance) {
    if (this.#wildcard[respid]?.[leafPid]) {
        const wildcardEffect = this.#wildcard[respid][leafPid];
        if (wildcardEffect.effect === effects && parentInstance[0] !== '*') {
            return [];
        }
    }
    return parentInstance;
}
  registerChildCompact(parentGlobal, childType, childGlobal) {
      // create parent instance map
      let parentMap = this.childCompactTree.get(parentGlobal);
      if (!parentMap) {
          parentMap = new Map();
          this.childCompactTree.set(parentGlobal, parentMap);
      }
      
      // child or grand child map
      let childTypeMap = parentMap.get(childType);
      if (!childTypeMap) {
          childTypeMap = new Map();
          parentMap.set(childType, childTypeMap);
      }
      
      //  child or recource child index map 
      const existingCompact = childTypeMap.get(childGlobal);
      if (existingCompact !== undefined) {
          return existingCompact;  // ✅ موجود مسبقاً
      }
      
      // new compact index
      const childCompact = childTypeMap.size;
      childTypeMap.set(childGlobal, childCompact);
      
      return childCompact;
  }
  
  
  
  registerWildCardCompact(parentId, childType, childGlobal) {
      // create parent instance map
      let parentMap = this.wildcardCompactTree.get(parentId);
      if (!parentMap) {
          parentMap = new Map();
          this.wildcardCompactTree.set(parentId, parentMap);
      }
      
      // child or grand child map
      let childTypeMap = parentMap.get(childType);
      if (!childTypeMap) {
          childTypeMap = new Map();
          parentMap.set(childType, childTypeMap);
      }
      
      //  child or recource child index map 
      const existingCompact = childTypeMap.get(childGlobal);
      if (existingCompact !== undefined) {
          return existingCompact;  // compact is exists
      }
      
      // creat new compact index
      const childCompact = childTypeMap.size;
      childTypeMap.set(childGlobal, childCompact);
      
      return childCompact;
  }
  
  /**
   * return child or grand  compact index
   * @param {number} parentGlobal
   * @param {ResourcePid} childType
   * @param {number} childGlobal index
   * @returns {number} childCompact 
   */
  getChildCompact(parentGlobal, childType, childGlobal) {
    
      const parentMap = this.childCompactTree.get(parentGlobal);
    
      if (!parentMap) return -1;
      
      const childTypeMap = parentMap.get(childType);
      if (!childTypeMap) return -1;
      
      return childTypeMap.get(childGlobal) ?? -1;
  }
  /**
   * 
   * @param {ResourcePid} parentId 
   * @param {ResourcePid} childType 
   * @param {number} childGlobal 
   * @returns 
   */
  getWildCardCompact(parentId, childType, childGlobal) {
      const parentMap = this.wildcardCompactTree.get(parentId);
      if (!parentMap) return -1;
      
      const childTypeMap = parentMap.get(childType);
      if (!childTypeMap) return -1;
      
      return childTypeMap.get(childGlobal) ?? -1;
  }

  /**
   * 
   * @returns {Map} chidl wildCard Commpact 
   */
  
  getWildCardCompactTree(){
      return this.wildcardCompactTree;
  }
  /**
   * 
   * @returns {Map} tree child compact 
   */
  getChildCompactTree() {
      return this.childCompactTree;
  }
      /**
   * used for create schemaSlices and add instances to pathsBuffers
   * @param {RoleElementObject} param0 
   * @param {ResourcesName} leafName 
   * @returns 
   */
      parentToLeafMap({ parentResource, parentInstance, action, boundary,actionToOthers,boundaryToOthers, ownerInstance, nested, nestedInstance, ttl }, leafName,roleId,memberId) {
  
          const leafPid = TYPE_IDS[leafName];
          const respid = TYPE_IDS[parentResource];
          const wildcardIndex=STRIDER_SIZES.WILDCARD_INDEX;
  
          // REFINEMENT: Use Map syntax to get or create the instance Set
          if (!this.pTi.has(respid)) {
              this.pTi.set(respid, { instance: new Set() });
          }
          const parentToInstanceList = this.pTi.get(respid).instance;
  
          /**
           * @type {Map}
           */
  
          let subScemaMap = this.#getOrInitMap(this.schemaSlices,respid)//this.schemaSlices.get(respid);
       
          /**
           * @type {Map}
           */
  
         
  
          let effects = this.geteffectedActionBoundary(action,boundary);
            let othersEffects = this.geteffectedActionBoundary(actionToOthers,boundaryToOthers);
            let totalEffect= (othersEffects << 16) | effects
           
  
          let parentInstanceList = this.#filterWildcard(respid,leafPid,totalEffect,parentInstance);
  
          //resourceInstance
          for (let pIndexName of parentInstanceList) {
  
              const resIndex = resourceInstance.getResourceInstanceIndex(parentResource, pIndexName);
              if(resIndex?.code !== undefined) return resIndex;
  
              parentToInstanceList.add(resIndex);
  
              if (nested) {
                  const nestedPid = TYPE_IDS[nested];
  
                  // nested child like SEARCH_INDEXED
  
  
                  /**
                   * @type {Resourceidentity}
                   *
                   */
                 this.#getOrCreateSchemaSlice(subScemaMap,this._pathsBufferInstanceCounts,resIndex,parentResource,nested,nestedInstance.length,leafName,ownerInstance.length);
  
                  for (let nestedIndexed of nestedInstance) {
  
                      const nestedchildId = resourceInstance.getResourceInstanceIndex(nested, nestedIndexed);
                        if(nestedchildId?.code !== undefined) return nestedchildId;
                    
  
                      if(nestedchildId?.code !== undefined) return nestedchildId;
  
                      const childCompact=(resIndex === wildcardIndex) ? this.registerWildCardCompact(respid,nestedPid,nestedchildId) :  this.registerChildCompact(resIndex,nestedPid,nestedchildId);
            
  
                      for (let lName of ownerInstance) {
                          const lIndex = resourceInstance.getResourceInstanceIndex(leafName, lName);
  
                          if(lIndex?.code !== undefined) return lIndex

                         
                         
                         const gChildCompact=  (resIndex === wildcardIndex) ? this.registerWildCardCompact(respid,leafPid,lIndex) : this.registerChildCompact(resIndex,leafPid,lIndex);
                          if(gChildCompact == -1 ) return {code:SYSTEM_STATUS.CHILD_COMPACT_INDEX,message:`Rigster Child or Wildcar faild `};
  
                          this.setPathBuffer(roleId,memberId,respid, resIndex, nestedPid, childCompact, leafPid, gChildCompact, totalEffect, ttl);
  
                      }// leaf for
                       
  
                  }// nested child for
                  
                
                  continue;
              }
             this.#getOrCreateSchemaSlice(subScemaMap,this._pathsBufferInstanceCounts,resIndex,parentResource,leafName,ownerInstance.length);
  
  
  
              for (let lName of ownerInstance) {
                  const lIndex = resourceInstance.getResourceInstanceIndex(leafName, lName);
                   if(lIndex?.code !== undefined) return lIndex
  
                    
                      const childCompact= (resIndex !== wildcardIndex) ? this.registerChildCompact(resIndex,leafPid,lIndex) : this.registerWildCardCompact(respid,leafPid,lIndex);
                      if(childCompact == -1 ) return {code:SYSTEM_STATUS.CHILD_COMPACT_INDEX,message:`Rigster Child or Wildcar faild `};
  
                  this.setPathBuffer(roleId,memberId,respid, resIndex, leafPid, childCompact, null, null, totalEffect, ttl);
  
              }
                
  
          }
          return true;
  
  
      }

 parsedGroupRole() {


        for (const[ groupkey ,groupElement] of Object.entries(this.ListOfGroups)) { // iterate over all groups group role1 , group role2
            resourceInstance.AddRoleMember(this.groupRoleName,groupkey);

            for (const [leaf ,roleElement] of Object.entries(groupElement)) {
                if(roleElement === null) continue;
              
                if (roleElement.ttl) {
                    roleElement.ttl = normalizeTTLToTimestamp(roleElement.ttl)
                   
                }
                const roleId=resourceInstance.getRoleId(this.groupRoleName);
                if(roleId?.code < 0 ) return roleId;
                const memberId=resourceInstance.getRoleMemberIndexByName(roleId,groupkey);
                if(memberId?.code < 0 ) return memberId;
                const pTLeaf=this.parentToLeafMap(roleElement, leaf,roleId,memberId);
                if(pTLeaf?.code < 0 ) return pTLeaf;

            }// end leafs rolles
        } // end group

        return true;


    }

parsedGroupRoleValidation() {

        const listduplicate = this.LeafToPI;

      

        for (const [groupkey ,groupElement] of Object.entries(this.ListOfGroups)) { // iterate over all groups group role1 , group role2

            for (const [leaf,roleElement] of Object.entries(groupElement)) {// for leafs roles inside each group role
                if (roleElement === null) continue;

                const validate = this.validateRolElement(leaf, roleElement);

                if (validate !== 0) return validate;
                const prs = roleElement.parentResource

                if (!listduplicate.has(prs)) {
                    listduplicate.set(prs, new Map());
                }


                const pMap = listduplicate.get(prs);

                if (!pMap.get(leaf)) {
                    pMap.set(leaf, new Set());
                }
                /**
                 * @type {Set} leafSet
                 */
                const leafSet = pMap.get(leaf);
                let duplicat = false;

                for (let lf of roleElement.parentInstance) {

                    if (leafSet.has(lf)) {
                        console.error(`Duplicat Instance ${lf} for Same Leaf ${leaf} `);
                        duplicat = true;
                        break;
                    } else {
                        leafSet.add(lf)
                    }
                    if (lf === '*') {

                        const leafPid = TYPE_IDS[leaf];
                        const respid = TYPE_IDS[prs];

                        this.#wildcard[respid] ??= Object.create(null);
                        this.#wildcard[respid][leafPid] ??= Object.create(null);

                        const leafWildCard = this.#wildcard[respid][leafPid];

                        let effect =this.geteffectedActionBoundary(roleElement.action,roleElement.boundary);
                        let othersEffects=this.geteffectedActionBoundary(roleElement.actionToOthers,roleElement.boundaryToOthers)
                        let totalEffect=(othersEffects << 16) | effect

                        leafWildCard["effect"] = totalEffect;

                    }
                }
                if (duplicat) return ({ code: SYSTEM_STATUS.DUPLICATE_INSTANCE, message: `Duplicat Instance for Same Leaf ${leaf} ` });

            }// end leafs rolles
        } // end group

        return true;

    }
/**
 * its used for generate strrider size and strider Offsets from JsonSchema
 * @param {JsonSchema} node 
 * @param {Object} striderSize 
 * @param {Object} striderOffset 
 * @param {Object} globalOffset 
 * @returns {number} totalNodeSize number of byte length
 */

calcStridersMapOffest(node, striderSize = Object.create(null), striderOffset = Object.create(null), globalOffset = 0) {

        // base recurseive
        if (!node.children || node.children.length == 0) {
            striderSize[node.typeId] = 1;
            striderOffset[node.typeId] = globalOffset;
            return 1;

        }

        let totalNodeSize = 0;
        let localOffset = globalOffset;

        for (let child of node.children) {

            const localStridSize = this.calcStridersMapOffest(child, striderSize, striderOffset, localOffset);
            const capacitySize = localStridSize * child.capacity;

            totalNodeSize += capacitySize;

            localOffset += capacitySize;


        }
        striderOffset[node.typeId] = globalOffset;
        striderSize[node.typeId] = totalNodeSize;
        if (node.typeId == 0 || node.typeId == 1) {
            return {
                striderSize,
                striderOffset,
                totalNodeSize
            }
        }
        return totalNodeSize;

    }
    /**
     * 
     * @param {SchemaSlices} schemaSlice 
     * @param {boolean} ttl 
     * @returns {Object | -1} return if ttl flase Role Schema in josn Format it doesnt add it to Schema isntance cach \
     * if ttl true return ttl Role Schema in Json format its doesnt add it to cach to any list 
     * if faild return -1 
     */

createRoleJsonSchema(schemaSlice){
    if(!schemaSlice) return -1;
    

       const JsonSchema = ResourcesTemplatesRoles.createResourceGroupRolesv1(
                    this.groupRoleName,
                    schemaSlice.parentResource,
                    schemaSlice.child,
                    schemaSlice.grandChild,
                
                )

                return JsonSchema ;

}


/**
 * create JsonSchema and add it to SchemaInstance
 * @param {TYPE_IDS} parentTypeId 
 * @param {number} parentInsatneIndex 
 * @param {SchemaSlices} SchemaSlices 
 * 
 * @returns {boolean | -1} true for success otherwise -1
 */

setRoleJsonSchemaByPid(parentTypeId,parentInsatneIndex,SchemaSlices){

    const hasParent=this.pTi.get(parentTypeId);

    if(!hasParent|| !hasParent.has(parentInsatneIndex)) return -1;

   return this.#setJsonSchema(parentTypeId,parentInsatneIndex,SchemaSlices);
      

}
/**
 * 
 * @param {ResourcesName} parentName 
 * @param {String} parentInsatneName 
 * @param {SchemaSlices} SchemaSlices 
 
 * @returns {boolean | -1} if success true else -1;
 */

setRoleJsonSchemaByName(parentName,parentInsatneName,SchemaSlices){
    const parentInsatneIndex=resourceInstance.getResourceInstanceIndex(parentName,parentInsatneName);
    if(parentInsatneIndex?.code) return parentInsatneIndex;

    const parentTypeId=TYPE_IDS[parentName];
    const hasParent=this.pTi.get(parentTypeId);

    if(!hasParent|| !hasParent.has(parentInsatneIndex)) return createError(SYSTEM_STATUS.INSTANCE_NOT_FOUND,`JosnSchemaError:not valid resources`);

    return this.#setJsonSchema(parentTypeId,parentInsatneIndex,SchemaSlices);
     

}

/**
 * 
 * @param {number} parentTypeId 
 * @param {number} parentInsatneIndex 
 * @param {SchemaSlices} SchemaSlices 

 * @returns {boolean} true if success else -1
 * if true its create Role Schema in json format and and add it to related cache 
 */

#setJsonSchema(parentTypeId,parentInsatneIndex,SchemaSlices){
    
    const JsonSchema=this.createRoleJsonSchema(SchemaSlices);
    if(JsonSchema === -1) return JsonSchema;
  
      this.schemaInsance[parentTypeId] ??= Object.create(null);
      this.schemaInsance[parentTypeId][parentInsatneIndex] = JsonSchema;

      return true;

}
/**
 * 
 * @returns all schema instance list 
 */
getJsonSchema(){
      return this.schemaInsance;
 
   
}
/**
 * @param {ResourcesPid} parentPID
 
 * @returns all schema instance  related Parent PID
 */
getJsonSchemabyParentPid(parentPID){
     return this.schemaInsance[parentPID];
   
}
/**
 * @param {ResourcesPid} parentPID
 * @param {number} parentInstanceIndex
 
 * @returns schema instance by it  
 */
getJsonSchemabyParentandInstancePid(parentPID,parentInstanceIndex,){
   const targetMap = this.schemaInsance;
    return targetMap?.[parentPID]?.[parentInstanceIndex] ?? createError(SYSTEM_STATUS.RESOURCE_NOT_FOUND,`JsonSchemaError: not found resources`);
}



    /**
     * it used for calculate strider form schema Json format 
     * for not equal roleinstance length
     * @param {boolean} init- if true initializing striders and globalstrider props if false then its just return strider and golbal without init
     * @returns strider {striderSize and striderOffset}
     *
     */

calcTotalStriders(init=false) {
        let shift = 0;
      

        const striders = init ? this.striders : Object.create(null);
        const globalStrider= init ? this.globalstriders : Object.create(null);
        const schemaInsance= init ? this.schemaInsance : Object.create(null);

        const parentToInstanceList = this.getPTI();


        for (const [pType, data] of this.pTi.entries()) {



            const pIden = this.schemaSlices.get(pType);
            const insList = [...data.instance];


            for (let i = 0; i < insList.length; i++) {
                const insIndex = insList[i];
                const chg = pIden.get(insIndex);




                const pSchema = ResourcesTemplatesRoles.createResourceGroupRolesv1(
                    this.groupRoleName,
                    chg.parentResource,
                    chg.child,
                    chg.grandChild
                )

              schemaInsance[pType] ??= Object.create(null);
              schemaInsance[pType][insIndex] = pSchema;


                striders[pType] ??= Object.create(null);
                const resStrider = striders[pType];


                const pStrider = this.calcStridersMapOffest(pSchema);



                if (insIndex === STRIDER_SIZES.WILDCARD_INDEX) {
                    globalStrider[pType] ??= Object.create(null);
                    const globalParentstrides =globalStrider[pType];
                    globalParentstrides["shift"] = shift;
                    globalParentstrides["totalNodeSize"] = pStrider.totalNodeSize;
                }

                resStrider[insIndex] = { ...pStrider, "shift": shift };
                shift += pStrider.totalNodeSize;
            }
        }
        striders["totalBytesSize"] = shift;
        if (init) return {striders,globalStrider,schemaInsance}
        return striders;

    }
 

// for calculate all roles strider
/**
 * 
 * @param {boolean} update -- if true then the operation is update that means keep internal strider not touch and return new striders Object
 * if false (default) it operate in inertnal strider Object 
 * @returns 
 */
calculateTotalStridersSchemaSlice(update=false){
        
         let shift=0;
      
         const normalStrider= update ? {}:this.striders;
        for (const [pType, data] of this.pTi.entries()) {

            const list=[...data.instance];
            normalStrider[pType] ??= Object.create(null);
            const resStrider = normalStrider[pType];


            for(const slice of list){

                const schemaslice=this.schemaSlices.get(pType).get(slice);

                
                let striders = this.calculateStriderFromSchemaSlices(schemaslice);
                     striders["shift"]=shift;

                        if (slice === STRIDER_SIZES.WILDCARD_INDEX) {
                    this.globalstriders[pType] ??= Object.create(null);
                    const globalParentstrides = this.globalstriders[pType];
                    globalParentstrides["shift"] = shift;
                    globalParentstrides["totalNodeSize"] = striders.totalNodeSize;
                }
                     shift+=striders.totalNodeSize;
                     resStrider[slice]=striders;

                 
            }
            
    }
    normalStrider["totalBytesSize"]=shift;
  
   if(update) return normalStrider;
}
/**
 * 
 * @param {Array<Resourceidentity>} childList 
 * @param {Array<Resourceidentity>} grandChildList 
 * @param {number} offset 
 * @param {Object} striderSize 
 * @param {Object} striderOffset 
 * @param {number} childSize 
 * @param {number} childPrSize 
 * @returns total strider size in byte 
 */
#calculateChildStrider(childList,grandChildList,offset,striderSize,striderOffset,childSize=STRIDER_SIZES.CHILD,childPrSize=STRIDER_SIZES.NESTED){
let newOffset=offset;
let totalsize=0;
let newSize=0
let childHeader=0;
    for(/** @type {Resourceidentity} */ let ch of childList ){
        const chName=ch.name;
        const childCount=ch.capacity;
        const chType=TYPE_IDS[chName];
        const chTagType=TYPE_ID_TAG[chType];

  if(RESOURCES_CHILD[chType]){
     

            const hasChild=RESOURCES_CHILD[chType];
            
            const allowedChild=(grandChildList || []).filter(gch => hasChild.has(TYPE_IDS[gch.name]));
        
          
            newSize=this.#calculateChildStrider(allowedChild,[],newOffset+childPrSize,striderSize,striderOffset,childSize=STRIDER_SIZES.CHILD)
             childHeader=childPrSize;
            

          
    }
let endSize= newSize == 0? childSize: newSize
 

           let InsChildSize=(childCount*endSize)+(childHeader*childCount)
              

                striderSize[chType]=endSize+childHeader;
                striderOffset[chType]=newOffset;
                striderSize[chTagType]=1;
                striderOffset[chTagType]=newOffset;
                newOffset+=InsChildSize
                totalsize+=InsChildSize
             
                 childHeader=0
                 newSize=0;
    }
  

    return totalsize

}

/**
 * it for calculate strider for schemaSlices 
 * @param {SchemaSlices} schemaslices 
 * @param {Object} striderSize 
 * @param {Object} striderOffset 
 * @returns {Object} {
        striderSize,
        striderOffset,
        totalNodeSize:totalSize,
      
    }
 */
calculateStriderFromSchemaSlices(schemaslices,striderSize=Object.create(null),striderOffset=Object.create(null)){
      
    const PrSize=STRIDER_SIZES.PARENT;
    const childPrSize=STRIDER_SIZES.NESTED;
    const childSize=STRIDER_SIZES.CHILD;
    const ParentType=TYPE_IDS[schemaslices.parentResource.name];
    const childList=schemaslices.child;
    const grandChildList=schemaslices.grandChild;
    let totalSize=0;
    let offset=0;

    striderSize['0']=0;
    striderSize['50']=1;
    striderOffset['0']=offset;
    striderOffset['50']=offset;
    totalSize++;
    offset++;
   
//     striderSize[TYPE_IDS.ROLE_MEMBER_ID]=[STRIDER_SIZES.MEMBER];
//     striderOffset[TYPE_IDS.ROLE_MEMBER_ID]=offset;
//    totalSize++;
//     offset++;
    striderSize[ParentType]=0;
    striderOffset[ParentType]=offset;
    striderSize[TYPE_ID_TAG[ParentType]]=STRIDER_SIZES.TAGGED;
    striderOffset[TYPE_ID_TAG[ParentType]]=offset;
    totalSize+=PrSize;
    offset+=PrSize;

    const tempsize=this.#calculateChildStrider(childList,grandChildList,offset,striderSize,striderOffset);
   
    totalSize+=tempsize;

    

    striderSize[ParentType]=totalSize-1;
    striderSize["0"]=totalSize;

    return {
        striderSize,
        striderOffset,
        totalNodeSize:totalSize,
      
    }


}




/** its used to compile all roles  */
compile(){

    let result= true
    result=this.parsedGroupRoleValidation()

     if( result != true) return result;
  
   // if( result != true) throw new Error(`ParsedGroup Error: ${result.message}`);
    const parsed=this.parsedGroupRole();
    if(parsed  !== true) return parsed
    this.calculateTotalStridersSchemaSlice();
    return true;



}
    

}
