import { normalizeTTLToTimestamp,parseDurationStringToSeconds } from "../utils/utils.js";
import { TYPE_IDS, TYPE_ID_TAG ,  STRIDER_SIZES ,SYSTEM_STATUS,DEFAULT_ACTIONS,BOUNDARY,RESOURCES_CHILD,EFFECT_ACTION,SIZE_POWER} from "../constant/resourceType.js";
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

         this.nestedChildCompactoffsetTree= new Map();
    this.nestedGrandChildCompactTree=new Map();
    this.memberTableMap=new Map();
    this.pathsMemeber= Object.create(null);
    this.ListOfMemberGroups={};

    }

    #getOrInitMap(targetMap, key) {
    let subMap = targetMap.get(key);
    if (!subMap) {
        subMap = new Map();
        targetMap.set(key, subMap);
    }
    return subMap;
}

/**
 * Retrieves or initializes a schema slice for a specific parent resource instance.
 * 
 * This method dynamically builds the blueprint for the binary buffer by tracking 
 * child resources and their per-instance grandchild counts. It uses a highly optimized, 
 * flat data structure to enable variable-sized buffer allocations, eliminating memory waste 
 * and enabling O(1) lookups during buffer compilation.
 *
 * @param {Map} targetMap - The Map holding schema slices (e.g., `this.schemaSlices`).
 * @param {number} resIndex - The instance index of the parent resource.
 * @param {ResourcesName} parentResource - The name of the parent resource (e.g., "COLLECTIONS").
 * @param {ResourcesName} childName - The name of the child resource (e.g., "SEARCH_INDEXES").
 * @param {number} childCount - The number of instances of this child resource to allocate.
 * @param {ResourcesName|null} [gChildName=null] - The name of the grandchild resource (e.g., "FIELD_METRICS"), if applicable.
 * @param {number|null} [gChildCount=null] - The number of grandchild instances associated with this specific child instance.
 * @param {number|null} [childInstanceIndex=null] - The specific instance index of the child resource.
 * @returns {Object} The initialized or updated schema slice object containing parent, child, and grandChild metadata.
 */

#getOrCreateSchemaSlice(targetMap, resIndex, parentResource, childName, childCount, gChildName = null, gChildCount = null, childInstanceIndex = null) {
let slice = targetMap.get(resIndex);
if (!slice) {
    slice = {
        parentResource: { name: parentResource, capacity: 1 },
        child: [],
        grandChild: [],
    };
}

let childSlice = slice.child.find(c => c.name === childName);
if (childSlice) {
    childSlice.capacity += childCount;
} else {
    childSlice = {
        name: childName,
        capacity: childCount,
        instanceDetails: []
    };
    slice.child.push(childSlice);
}

// ✅ NEW: Flat structure for per-instance grandchild counts
if (gChildName && childInstanceIndex !== null) {
    const hasGrandChild = childSlice.instanceDetails.find(d => (gChildName in d));
    
    if (hasGrandChild) {
        const grandChildType = hasGrandChild[gChildName];
        // Direct assignment - no nested object
        grandChildType[childInstanceIndex] = (grandChildType[childInstanceIndex] || 0) + gChildCount;
        grandChildType.parentIndex = resIndex;
    } else {
        const newType = {
            parentIndex: resIndex,
            [childInstanceIndex]: gChildCount
        };
        newType[gChildName] = newType; // Self-reference for lookup
        childSlice.instanceDetails.push({ [gChildName]: { [childInstanceIndex]: gChildCount, parentIndex: resIndex } });
    }

    // Update global grandChild list
    let gChildSlice = slice.grandChild.find(g => g.name === gChildName);
    if (gChildSlice) {
        gChildSlice.capacity += gChildCount;
    } else {
        slice.grandChild.push({ name: gChildName, capacity: gChildCount });
    }
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

 registerRoleMember(memberName){
    const size=this.memberTableMap.size
    this.memberTableMap.set(size,memberName);
    return size;
 }

 getRoleMemberNameById(memberId){
    return this.memberTableMap.get(memberId) ?? -1;
   }
   
/**
 * it 3 level map all resource type and instances are cap 2^32
* map parent index -> map child or grand child index -> local role index base role index 
* @param {number} parentGlobal - resource parent index
* @param {ResourcePid} childType - 
* @param {number} childGlobal - resouce child or grandchild index 
* @returns {number} new child compact
*/

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
    return existingCompact;
    }

    // new compact index
    const childCompact = childTypeMap.size;
    childTypeMap.set(childGlobal, childCompact);

    return childCompact;
}

/**
 * 
* map parent index -> map child or grand child index -> local role index 
* @param {number} parentGlobal - resource parent index
* @param {ResourcePid} childType - 
* @param {number} childGlobal - resouce child or grandchild index 
* @returns {number} 
*/

register2KeyChildCompact(parentGlobal, childType, childGlobal) {

    const flatenKey=this.#packComposite2Key(childType,parentGlobal);
    // create parent instance map
    let parentMap = this.childCompactTree.get(flatenKey);
    if (!parentMap) {
    parentMap = new Map();
    this.childCompactTree.set(flatenKey, parentMap);
    }

    //  child or recource child index map 
    const existingCompact = parentMap.get(childGlobal);
    if (existingCompact !== undefined) {
    return existingCompact;
    }

    // new compact index
    const childCompact = parentMap.size;
    parentMap.set(childGlobal, childCompact);

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
 * ### Ultra-fast nested grandchild compact registration.
* Uses **pure primitive Map lookups** to avoid string concatenation GC pressure.
* 4 level map all are caped 32 bit
* used for massive system resources and instances ()
* wildcard = 2^32 -1 
 * no key flaten here each key is 32 bit  
 * 1. Natively supports the full 32-bit WILDCARD_INDEX (4,294,967,295) at every level.
 * 2. Guarantees isolated, 0-based relative indexing (nestedMap.size) per nested child.
 * 3. Avoids complex bitwise packing that risks overflow or corruption.
 *  - **`cons`** : consume more in memory and are slow from 2key teq
 * 
 * @param {number} parentId - The parent resource instance ID
 * @param {ResourcePid} grandChildType - The resource type ID of the grandchild (e.g., 103)
 * @param {number} nestedChildIndex - The compact index of the nested child
 * @param {number} granChildIndex - The global index of the grandchild to look up
 * @returns {number} The local compact index ***(0-based relative to nestedChildIndex)*** or **-1** if not have 
 */

registerNestedGrandChild(parentId, grandChildType, nestedChildIndex, granChildIndex) {
    // Level 1: Grand Child Type
    let typeMap = this.nestedGrandChildCompactTree.get(grandChildType);
    if (!typeMap) {
        typeMap = new Map();
        this.nestedGrandChildCompactTree.set(grandChildType, typeMap);
    }

    // Level 2: Parent Instance ID
    let parentMap = typeMap.get(parentId);
    if (!parentMap) {
        parentMap = new Map();
        typeMap.set(parentId, parentMap);
    }

    // Level 3: Nested Child Index
    let nestedMap = parentMap.get(nestedChildIndex);
    if (!nestedMap) {
        nestedMap = new Map();
        parentMap.set(nestedChildIndex, nestedMap);
    }

    // Level 4: Check if compact index already exists
    const existingCompact = nestedMap.get(granChildIndex);
    if (existingCompact !== undefined) {
        return existingCompact; // ✅ Fast path: Cache hit, zero allocations
    }

    // Create new compact index
    const newCompact = nestedMap.size;
    nestedMap.set(granChildIndex, newCompact);

    return newCompact;
}
/**
 * save the relative offset of nestedchild indexed from its first nested headers tags (counter element then offsets elements) of its type 
 * its act as distance between start of first nested child and other nested child
 * @param {ResourcePid} parentId 
 * @param {ResourcePid} childType 
 * @param {number} childCompactIndex 
 * @param {number} offset 
 * @returns {number } offset
 */

registerNestedChildCompactoffset(parentId, childType, childCompactIndex,offset) {
    // create parent instance map
    let parentMap = this.nestedChildCompactoffsetTree.get(parentId);
    if (!parentMap) {
        parentMap = new Map();
        this.nestedChildCompactoffsetTree.set(parentId, parentMap);
    }

    // child or grand child map
    let childTypeMap = parentMap.get(childType);
    if (!childTypeMap) {
        childTypeMap = new Map();
        parentMap.set(childType, childTypeMap);
    }

    //  child or recource child index map 
    const existingCompact = childTypeMap.get(childCompactIndex);
    if (existingCompact !== undefined) {
        return existingCompact;  // compact is exists
    }

    // creat new compact index
    
    childTypeMap.set(childCompactIndex, offset);

    return offset;
}

/**
 * Packs grandChildType (21-bit) + parentId (32-bit) into a 53-bit Number.
* Supports:
*   - grandChildType: 0 to 2,097,151 (21 bits)
*   - parentId: 0 to 4,294,967,295 (32 bits, includes WILDCARD_INDEX)
* @param {ResourcePid} grandChildType 
* @param {number} parentId -- parent instances index
* @returns {number} 53 bit number flaten key 
*/
 #packComposite2Key(grandChildType, parentId) {
        return (grandChildType * SIZE_POWER.MULTIPLIER_32) + parentId;
    }


  /**
 * ### Ultra-fast nested grandchild compact registration.
 * - Uses pure primitive Map lookups to avoid string concatenation GC pressure.
 * - Use flate key instead of using 4 level map its now 3 level map 
 * - this method are used when the maximum parent type is 20970 or max resources type 2097000
 * - its define grand child index based on grand child  each first grand child index start from 0 relative to it nested child 
 * /**
 * @param {number} parentId - The parent resource instance ID
 * @param {ResourcePid} grandChildType - The resource type ID of the grandchild (e.g., 103 for FIELD_METRICS)
 * @param {number} nestedChildIndex - The compact index of the nested child
 * @param {number} granChildGlobalIndex - The global index of the grandchild to look up
 * @returns {number} The local compact index, or -1 if not found
 */
registerNestedFlaten2keyGrandChildCompact(parentId, grandChildType, nestedChildIndex, granChildIndex) {
    // Level 1: Get or create inner Map using 53-bit composite key
    const compositeKey = this.#packComposite2Key(grandChildType, parentId);
    
    let innerMap = this.nestedGrandChildCompactTree.get(compositeKey);
    if (innerMap === undefined) {
        innerMap = new Map();
        this.nestedGrandChildCompactTree.set(compositeKey, innerMap);
    }

    // Level 2: Get or create 3 level Nestedmap 

    let nestedMap = innerMap.get(nestedChildIndex);
    if (!nestedMap) {
        nestedMap = new Map();
        innerMap.set(nestedChildIndex, nestedMap);
    }

    // Level 2: Get or assign compact index (relative to this nested child)
    const existingCompact = nestedMap.get(granChildIndex);
    if (existingCompact !== undefined) {
        return existingCompact; 
    }

    const newCompact = nestedMap.size; 
    nestedMap.set(granChildIndex, newCompact);
    return newCompact;
}

/**
 * return child (if child is leaf ) or grand  compact index 
 * its index relative to its role 
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
 * return child or grand child  compact index 
 * using 2 level map instead of 3 level map with flaten key
 * @param {number} parentGlobal
 * @param {ResourcePid} childType
 * @param {number} childGlobal index
 * @returns {number} childCompact 
 */
get2KeyChildCompact(parentGlobal, childType, childGlobal) {

    const flatenKey=this.#packComposite2Key(childType,parentGlobal);
    // create parent instance map
    const parentMap = this.childCompactTree.get(flatenKey);
    if (!parentMap) return -1

    // child or grand child map
    

    //  child or recource child index map 
    return parentMap.get(childGlobal) ?? parentMap.get(STRIDER_SIZES.WILDCARD_INDEX) ?? -1;
    
}

/**
 * Retrieves the local compact index (grand child nested based indexed ) for a specific nested grandchild.
 * using this method when max resource types total go above this limet 2**21 ~ 2097152 \
 * or the number of parent type resource increase to be 2097152/100 =~ 20970
 * its 
 * @param {number} parentId - The parent resource instance ID
 * @param {number} grandChildType - The resource type ID of the grandchild (e.g., 103 for FIELD_METRICS)
 * @param {number} nestedChildIndex - The compact index of the nested child
 * @param {number} granChildGlobalIndex - The global index of the grandchild to look up
 * @returns {number} The local compact index, or -1 if not found
 */
getNestedGrandChildCompact(parentId, grandChildType, nestedChildIndex, granChildGlobalIndex) {
    // Level 1: Grand Child Type
    const typeMap = this.nestedGrandChildCompactTree.get(grandChildType);
    if (!typeMap) return -1;

    // Level 2: Parent Instance ID
    const parentMap = typeMap.get(parentId);
    if (!parentMap) return -1;

    // Level 3: Nested Child Index
    const nestedMap = parentMap.get(nestedChildIndex) ?? parentMap.get(STRIDER_SIZES.WILDCARD_INDEX);
    if (!nestedMap) return -1;

    // Level 4: Return existing compact index if not try to find wildcard if not retrun  -1 (Fast path: zero allocations)
    return nestedMap.get(granChildGlobalIndex) ??  nestedMap.get(STRIDER_SIZES.WILDCARD_INDEX) ?? -1;
}


/**
 * Retrieves the local compact index  ( grand child nested based indexed ) for a specific nested grandchild.
* using this method when max resource types total  limet 2**21 ~ 2097152 \
* using 3 level map with flaten 2 key 
* @param {number} parentId - The parent resource instance ID
* @param {number} grandChildType - The resource type ID of the grandchild (e.g., 103 for FIELD_METRICS)
* @param {number} nestedChildIndex - The compact index of the nested child
* @param {number} granChildGlobalIndex - The global index of the grandchild to look up
* @returns {number} The local compact index, or -1 if not found
*/
getNestedFlaten2keyGrandChildCompact(parentId, grandChildType, nestedChildIndex, granChildIndex) {
    
    const compositeKey = this.#packComposite2Key(grandChildType, parentId);
    
    let innerMap = this.nestedGrandChildCompactTree.get(compositeKey);
    if (innerMap === undefined) return -1;


    let nestedMap = innerMap.get(nestedChildIndex) ?? innerMap.get(STRIDER_SIZES.WILDCARD_INDEX);
    if (nestedMap === undefined) return -1;

    return (nestedMap.get(granChildIndex) ?? nestedMap.get(STRIDER_SIZES.WILDCARD_INDEX) ?? -1) 
    
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

getWildCardCompactTree() {
    return this.wildcardCompactTree;
}

/**
* 
* @returns {Map} tree 
*/
getChildCompactTree() {
    return this.childCompactTree;
}

getNestedChildCompactoffset(parentId,childType,childCompact){

    const parentMap = this.nestedChildCompactoffsetTree.get(parentId);
    if (!parentMap) return -1;

    const childTypeMap = parentMap.get(childType);
    if (!childTypeMap) return -1;

    return childTypeMap.get(childCompact) ?? -1;

}

 /**
 * Normalizes owner instances to include BOTH EffectedAction and EffectedActionToOthers.
 * @param {Array} ownerInstance 
 * @param {string} action - EffectedAction notation (e.g., "RO")
 * @param {string} actionToOthers - EffectedAction notation (e.g., "NONE")
 */
#normalizeOwnersWithAction(ownerInstance, action, actionToOthers,defaultTtl=0) {
    if (!Array.isArray(ownerInstance)) return [];
    
    // Default actions if not provided in the object
    const defaultPrimary = action || "NONE";
    const defaultOthers = actionToOthers || "NONE";

    return ownerInstance.map(ins => {
        if (typeof ins === 'object' && ins !== null) {
            return {
                name: String(ins.name),
                EffectedAction: ins.EffectedAction || defaultPrimary,
                EffectedActionToOthers: ins.EffectedActionToOthers || defaultOthers,
                ttl: ins.ttl !== undefined 
                    ? normalizeTTLToTimestamp(ins.ttl) 
                    : normalizeTTLToTimestamp(defaultTtl),
                compactIndex:0
            };
        }
        return {
            name: String(ins),
            EffectedAction: defaultPrimary,
            EffectedActionToOthers: defaultOthers,
            ttl: normalizeTTLToTimestamp(defaultTtl),
            compactIndex:0
        };
    });
}

/**
 * Merges an owner into a Map, applying Bitwise OR to BOTH primary and 'others' actions.
 */
#mergeOwnerWithAction(ownerMap, newOwner) {

     
     const newOthers = EFFECT_ACTION[newOwner.EffectedActionToOthers] || 0;
     const newPrimary = EFFECT_ACTION[newOwner.EffectedAction] || 0;
  
    if (ownerMap.has(newOwner.name)  ) {
         
        const existingOwner = ownerMap.get(newOwner.name) ;
       
        // Merge Primary Actions
        const existingPrimary = EFFECT_ACTION[existingOwner.EffectedAction] || 0;
        
        existingOwner.EffectedAction = this.#findActionNotation(existingPrimary | newPrimary);
        
        // Merge 'Others' Actions
        const existingOthers = EFFECT_ACTION[existingOwner.EffectedActionToOthers] || 0;
       
        existingOwner.EffectedActionToOthers = this.#findActionNotation(existingOthers | newOthers);
        
        // This is the SAFE choice — if member 1 says "1 day" and member 2 says "10h",
        // the union of their grants is "1 day" (the broader permission wins).
        const existingTtl = Number(existingOwner.ttl) || 0;
        const newTtl = Number(newOwner.ttl) || 0;
        
        // If either is 0 (permanent), result is permanent
        if (existingTtl === 0 || newTtl === 0) {
            existingOwner.ttl = 0;
        } else {
            existingOwner.ttl = Math.max(existingTtl, newTtl);
        }
        
    } else {
        if(ownerMap.has("*")){
            const existingWildCardOwner= ownerMap.get("*");
       
            const existingWildCardPrimary = EFFECT_ACTION[existingWildCardOwner.EffectedAction] || 0;
            const existingWildCardOthers = EFFECT_ACTION[existingWildCardOwner.EffectedActionToOthers] || 0;
            const isPrimaryCovered=((existingWildCardPrimary & newPrimary) === newPrimary);
            const isOthersCovered=((existingWildCardOthers & newOthers) === newOthers);
            if(!isPrimaryCovered || !isOthersCovered){
                ownerMap.set(newOwner.name, { ...newOwner });

            }

        }else{
       
             ownerMap.set(newOwner.name, { ...newOwner });

        }
        
    }
  ;
}
/**
 * Finds the string notation for a given bitmask effect.
 */
#findActionNotation(effect) {
    for (const [key, value] of Object.entries(EFFECT_ACTION)) {
        if (value === effect) return key;
    }
    return 'NONE';
}


  /**
   * Automatically merges similar role members to consolidate per-instance actions 
   * and reduce redundancy. Optimized for zero-allocation grouping and maximum speed.
   * 
   * **
   * We used this method for resone that when 2 member role conatain same leaf with same parent resource for example 
   * ```javascript
   * { 
   * role1:{ 
   * "FIELD_MT":{ 
   * parentResource :"COLLECTION" 
   * parentInstance:["users"]  
   * owneInsane:["mat1"]  
   * nested:"SEARCH_INDEXES", 
   * nestedInstance:["sear1"] 
   * ....
   * }
   * },
   * 
   *  role2:{ 
   * "FIELD_MT":{ 
   * parentResource :"COLLECTION" 
   * parentInstance:["users"] 
   * owneInsane:["mat2"] 
   * nested:"SEARCH_INDEXES", 
   * nestedInstance:["sear2"] 
   * ....
   * }
   * }
   * } 
   * ```
   * Explodes, inverts, and PRUNES role definitions.
   * FINAL LOGIC: Handles child-parent linking, nested pruning, AND parent wildcard absorption.
   * 
   * ## 🤔 Why is it Used? (The Problem)
  In complex RBAC systems, role definitions often contain massive redundancies:
  1. **Overlapping Wildcards:** A rule granting `"*"` access to a user makes specific rules for `"mat1"` redundant.
  2. **Fragmented Parents:** A single role targeting `parentInstance: ["users", "product"]` needs to be split to be processed efficiently.
  3. **Action Redundancy:** Multiple rules granting `RO` (Read Own) to the same user on the same resource waste memory and compilation time.
  4. **Complex Hierarchies:** Managing the relationship between Parent, Child (Nested), and Grandchild (Owner) instances manually during compilation is computationally expensive.
  ## ⚙️ What Does It Do? (The Solution)
  This function performs four critical operations in a single pass:
  1. **Explodes** multi-instance parent rules into discrete, addressable keys.
  2. **Inverts** the data structure from `Owner -> [Nested]` to `Nested -> [Allowed Owners]`, creating a direct lookup map for the compiler.
  3. **Normalizes** raw  for(actions/boundaries) now its just(action its value is Action Notation)  into unified `EffectedAction` bitmasks directly on the owner objects and same Happen To ActionToOthers.
  4. **Prunes & Absorbs** redundant permissions using advanced bitwise coverage logic (`(wildcard & specific) === specific`), ensuring the final payload is as small as mathematically possible.
  ## Phase-by-Phase Breakdown (4 Phases)
  ### Phase 1: Build the Raw Inverted Map & Normalize
  **Goal:** Explode parent instances, normalize owner actions, and build the initial inverted map (`NestedInstance -> Map<OwnerName, OwnerData>`).
  ### Phase 2: Smart Pruning (Owner Instance Wildcards)
  **Goal:** Remove specific owners if a wildcard owner (`"*"`) exists in the same nested bucket and covers their action.
  ### Phase 3: Smart Pruning (Nested Level Wildcards)
  **Goal:** Handle global nested wildcards (`nestedInstance: ["*"]`) and prune specific nested instances that are fully covered.
  ### Phase 4: Parent Wildcard Absorption (The Core Logic)
  **Goal:** Absorb specific parent rules (e.g., `parentInstance: ["users"]`) into a global parent wildcard rule (`parentInstance: ["*"]`) if the wildcard fully covers the specific rule's permissions.
  ** more about this method in README.md file
   */
explodeAndInvertRolesFinal(groupRole) {
    const merged = new Map();
    const parenList = new Map();

    // ==========================================
    // PHASE 1: Build the raw inverted map
    // ==========================================
    for (const [memberName, leafRoles] of Object.entries(groupRole)) {
        for (const [leafName, rule] of Object.entries(leafRoles)) {
            if (!rule) continue;

            const normalizedOwners = this.#normalizeOwnersWithAction(rule.ownerInstance, rule.action, rule.actionToOthers,rule.ttl);
            const lpKey = `${leafName}|${rule.parentResource}`;
            
            if (!parenList.has(lpKey)) {
                parenList.set(lpKey, new Set());
            }
            /** @type {Set} */
            const pList = parenList.get(lpKey);
            
            for (const pIns of rule.parentInstance) {
                const key = `${leafName}|${rule.parentResource}|${pIns}`;
                pList.add(pIns);
                let existing = merged.get(key);

                if (!existing) {
                    existing = {
                        leafName, parentResource: rule.parentResource, parentInstance: pIns,
                        nested: rule.nested, action: rule.action,
                        actionToOthers: rule.actionToOthers, 
                        ttl: rule.ttl, _mergedFrom: [memberName],
                        directOwnersMap: rule.nested ? null : new Map(),
                        nestedOwnersMap: rule.nested ? new Map() : null
                    };
                    merged.set(key, existing);
                } else {
                    existing._mergedFrom.push(memberName);
                }

                if (!rule.nested) {
                    for (const owner of normalizedOwners) this.#mergeOwnerWithAction(existing.directOwnersMap, owner);
                } else {
                    const nestedInstances = rule.nestedInstance || [];
                    for (const nIns of nestedInstances) {
                        //  ALWAYS ensure the specific nested instance has its own Map.
                        // NEVER fallback to the "*" map for writing/merging to prevent reference mutation.
                        if (!existing.nestedOwnersMap.has(nIns)) {
                            existing.nestedOwnersMap.set(nIns, new Map());
                        }
                    
                        //  Get the specific map for THIS nested instance only.
                        const ownerMap = existing.nestedOwnersMap.get(nIns);
                    
                        //  Merge owners into this specific, isolated map.
                        for (const owner of normalizedOwners) {
                            this.#mergeOwnerWithAction(ownerMap, owner);
                        }
                    }                   
                }
            }
        }
    }

    // ==========================================
    // PHASE 2: SMART PRUNING ( owner instaces wildCard ) 
    // ==========================================

    for(const[key,data] of merged){
        if(data.nested && data.nestedOwnersMap){
            for(const [nestedChildName,ownerMap] of data.nestedOwnersMap){

                const ownerWildCard=ownerMap.get("*")
                if(!ownerWildCard) continue;
                
                const wCPrimaryAction= EFFECT_ACTION[ownerWildCard.EffectedAction]
                const oWAction= EFFECT_ACTION[ownerWildCard.EffectedActionToOthers]

                for(const [ownerName, normalized] of ownerMap){
                    if(ownerName === "*") continue;
                    
                    const nAction=EFFECT_ACTION[normalized.EffectedAction]
                    const oNAction=EFFECT_ACTION[normalized.EffectedActionToOthers]

                    const isPrimaryCovered=((wCPrimaryAction & nAction) ===nAction)
                    const isOthersCovered=((oWAction & oNAction) === oNAction)

                if(isPrimaryCovered && isOthersCovered){
                    ownerMap.delete(ownerName);
                }
            }

            }

        }else{ // for direct owner map 
            const directOwnerWildCard=data.directOwnersMap.get("*");
            if(!directOwnerWildCard) continue
            
            const wCPrimaryAction = EFFECT_ACTION[directOwnerWildCard.EffectedAction] || 0;
            const oWAction = EFFECT_ACTION[directOwnerWildCard.EffectedActionToOthers] || 0;

            for(const [ownerName,normalized] of data.directOwnersMap){
                if(ownerName === "*") continue;
            
                const nAction = EFFECT_ACTION[normalized.EffectedAction] || 0;
                const oNAction = EFFECT_ACTION[normalized.EffectedActionToOthers] || 0;

                const isPrimaryCovered = ((wCPrimaryAction & nAction) === nAction);
                const isOthersCovered = ((oWAction & oNAction) === oNAction);

                if (isPrimaryCovered && isOthersCovered) {
                    data.directOwnersMap.delete(ownerName);
                }

            }

        }
    
    

    }// end for loop stage 
    
    // ==========================================
    // PHASE 3: SMART PRUNING (Nested Level) WildCard 
    // ==========================================
    for (const [key, data] of merged) {
        

        if (!data.nested || !data.nestedOwnersMap) continue;
        
        // check if thier wild card in nested instances 
        const globalWildcardOwners = data.nestedOwnersMap.get("*");
        if (!globalWildcardOwners ) continue; 

            const globalStar = globalWildcardOwners.get("*");
        
            const globalStarsPrimaryAction = globalStar? (EFFECT_ACTION[globalStar.EffectedAction] || 0):0;
            const globalStarActionToOthers = globalStar? (EFFECT_ACTION[globalStar.EffectedActionToOthers] || 0):0;
        
        
        for (const [nIns, ownerMap] of data.nestedOwnersMap) {
            if (nIns === "*") continue; 
            
            for (const [ownerName, ownerData] of ownerMap) {
                let isCovered = false;
                
                    const odPrimary = EFFECT_ACTION[ownerData.EffectedAction] || 0;
                    const odOthers = EFFECT_ACTION[ownerData.EffectedActionToOthers] || 0;

                const globalSpecific = globalWildcardOwners.get(ownerName);
                if (globalSpecific) {
                    
                    const gsPrimary = EFFECT_ACTION[globalSpecific.EffectedAction] || 0;
                    const gsOthers = EFFECT_ACTION[globalSpecific.EffectedActionToOthers] || 0;
                    
                    
                    if (((gsPrimary & odPrimary) === odPrimary) && ((gsOthers & odOthers) === odOthers)) {
                        isCovered = true;
                    }else{
                        ownerData.EffectedAction=this.#findActionNotation((gsPrimary | odPrimary))
                        ownerData.EffectedActionToOthers=this.#findActionNotation((gsOthers | odOthers));

                    }
                } 
                
                if (!isCovered && globalStar) {
                    
                        if (((globalStarsPrimaryAction & odPrimary) === odPrimary) && ((globalStarActionToOthers & odOthers) === odOthers)) {
                            isCovered = true;
                        }
                    
                }
                
                if (isCovered) {
                    ownerMap.delete(ownerName); 
                }
            }
            
            if (ownerMap.size === 0) {
                data.nestedOwnersMap.delete(nIns);
            }
        }
        
        
    }

    // ==========================================
    // PHASE 4 : PARENT WILDCARD ABSORPTION (The New Logic)
    // ==========================================
    for (const [lpKey, pInstances] of parenList) {
        if (!pInstances.has("*")) continue; // No wildcard parent in this group, skip

        const wildcardKey = `${lpKey}|*`;
        const wildcardData = merged.get(wildcardKey);
        if (!wildcardData) continue;


        const hasGlobalNestedWildCard= wildcardData.nested? wildcardData.nestedOwnersMap.has("*") : false;    // [*]
        const onlyHasGlobalNesedWildCard=hasGlobalNestedWildCard?(wildcardData.nestedOwnersMap.size === 1) : false;// only [*]
        const hasDirectOwnerWildCard=!wildcardData.nested? wildcardData.directOwnersMap.has("*") : false; // for none nested roles [*] 
        const hasLocalNestedWildCard=hasGlobalNestedWildCard?wildcardData.nestedOwnersMap.get("*").has("*"):false; // if nested owner have wild card 
        const onlyhasLocalNestedWildCard=hasLocalNestedWildCard?wildcardData.nestedOwnersMap.get("*").size === 1 :false; // if  nested owner list only contain "*"


        

        // Iterate over specific parent instances (SNAME) in this group
        for (const pIns of pInstances) {
            if (pIns === "*") continue;

            const specificKey = `${lpKey}|${pIns}`;
            const specificData = merged.get(specificKey);
            
            if (!specificData) continue;

            if (!!wildcardData.nested !== !!specificData.nested) {
                continue;
            }

            // Check nested instances compatibility for absorption
            let canAbsorb = false;
            let checkAction=false;
            let checkNaming=false;
            if (wildcardData.nested) {

                const wNestedMap = wildcardData.nestedOwnersMap; // nested wildcard map 
                const sNestedMap = specificData.nestedOwnersMap; // coming nested map 
                const hasIncomingGlobalWC=specificData.nestedOwnersMap.get("*");
                const onlyIncomingGlobalWC=hasIncomingGlobalWC?specificData.nestedOwnersMap.size ===1 : false;

                if(hasGlobalNestedWildCard){ // wildecard[*|naming][*|naming] 
                    if(hasLocalNestedWildCard) checkAction=true; //[*][* + naming]| wildcard owner instance All

                    /**
                     * [*|name][*|name] |[*][*+name | name]  
                     * first :when nested its only have wildcard and ownerinstaces have mixed wiledcard with instances or just instaces 
                     * seconde when nested its have mixed wild with nested instances 
                     */
                    if(!onlyHasGlobalNesedWildCard || !onlyhasLocalNestedWildCard) checkNaming=true 


                    
                
                }else{
                    checkNaming=true ;
                    if(hasIncomingGlobalWC){
                        if(onlyIncomingGlobalWC){
                                continue;
                            }
                }
            }

                if(checkAction || checkNaming ){

                    
                                let wildCardAction = 0; //  f 
                                let wildCardActionToOthers=0;
                                // [*][ instances | *]
                                if(hasGlobalNestedWildCard){ //[*|nestedInstances][ *| ownerInstances]
                                    if(hasLocalNestedWildCard){//[*|nestedInstances][ *| ownerInstances]
                                        const normalizedGlobalAll=wNestedMap.get("*").get("*");
                                        wildCardAction=EFFECT_ACTION[normalizedGlobalAll.EffectedAction];
                                        wildCardActionToOthers=EFFECT_ACTION[normalizedGlobalAll.EffectedActionToOthers];

                                    }
                                }
                                
                                
                            
                                for(const[nc,ownersMaps] of sNestedMap){
                                    
                                    let wildOwnerAction=0;
                                    let wildOwnerActionToOthers=0 // its contain wild card owner instances effect and it must be reset each iteration 
                                    let nestedName=false;  // for hold nested object if exist in wildcard nested map set 
                                    
                                    if (checkNaming){
                                        // myabe its have nested name or wildcard [*|nestedName] if result is undifined is nested instance name[nested instances]
                                        // [*|nestedName] ==> undefined its nested name and name not in wildcard nested bucket
                                        nestedName=wNestedMap.get(nc) ?? wNestedMap.get("*"); 
                                        if(!nestedName && !hasLocalNestedWildCard){ // case [nestedInstces][ownerInstances] in nested instance check stage 

                                            continue;
                                        }
                                    }

                                    for(const [owner , normalized] of ownersMaps){

                                        const ownerEffectedAction=EFFECT_ACTION[normalized.EffectedAction] || 0;
                                        const ownerEffectedActionToOthers=EFFECT_ACTION[normalized.EffectedActionToOthers] || 0;

                                        if(nestedName){
                                            const wn=nestedName.get("*") ?? nestedName.get(owner)
                                            
                                            wildOwnerAction = wn ? (EFFECT_ACTION[wn.EffectedAction] || 0) : 0; // its [*|nestedInstances][ownerInsanc|*]
                                            
                                            // that means we are in case [nestedInstance][ownerInstances] and no match in owner check case 
                                            if(!wn && !hasLocalNestedWildCard) continue; 

                                            if (wn) {
                                                wildOwnerAction=EFFECT_ACTION[wn.EffectedAction] || 0; 
                                                wildOwnerActionToOthers=EFFECT_ACTION[wn.EffectedActionToOthers] || 0 ; 
                                                    }
                                        }

                                    
                                        if(checkAction && ((wildCardAction & ownerEffectedAction )=== ownerEffectedAction) && ((wildCardActionToOthers & ownerEffectedActionToOthers )=== ownerEffectedActionToOthers)){ // [*][*] or [nested instaces][*] we dont need for check name just check effected action 

                                            ownersMaps.delete(owner);

                                        }else if ( wildOwnerAction && (((wildOwnerAction & ownerEffectedAction) === ownerEffectedAction)) && (((wildOwnerActionToOthers & ownerEffectedActionToOthers) === ownerEffectedActionToOthers))){ // for [nested name][ownerInstanc] or [*][owner instances] or [mutiple nested instance][multip owner Instance]

                                            ownersMaps.delete(owner);

                                        }
                                        if(ownersMaps.size === 0){
                                        
                                            sNestedMap.delete(nc);
                                        }

                                    }
                                }

                }

checkAction=false;
checkNaming=false
            
            } else {
                // No nested instances (Direct Parent -> Leaf)
                // Wildcard must have Owner="*" to absorb
                const commingData= specificData.directOwnersMap;
                const wD=wildcardData.directOwnersMap;
                let ownerWildCardAction=0;
                let ownerWildCardActionToOthers=0;
                if (hasDirectOwnerWildCard) {
                    checkAction = true;
                    const ownerWildcard=wD.get("*");
                    ownerWildCardAction=EFFECT_ACTION[ownerWildcard.EffectedAction] || 0;
                    ownerWildCardActionToOthers=EFFECT_ACTION[ownerWildcard.EffectedActionToOthers] || 0 ;
                }else{
                    checkNaming=true;
                }
                for(const [owner,normalized] of commingData){
                    const commingOwnerAction=EFFECT_ACTION[normalized.EffectedAction] || 0;
                    const commingOwnerActionToOthers=EFFECT_ACTION[normalized.EffectedActionToOthers] || 0;

                    if(checkAction){
                        
                        if(ownerWildCardAction && ((ownerWildCardAction & commingOwnerAction) === commingOwnerAction) && ((ownerWildCardActionToOthers & commingOwnerActionToOthers) === commingOwnerActionToOthers)){
                            commingData.delete(owner);
                            
                        }

                    }else if(checkNaming){
                        const wDOwner=wD.get(owner);
                        if(!wDOwner) continue;
                        const wDAction=EFFECT_ACTION[wDOwner.EffectedAction] || 0;
                        const wildCardActionToOthers=EFFECT_ACTION[wDOwner.EffectedActionToOthers] || 0;
                        if( ( (wDAction & commingOwnerAction) === commingOwnerAction) && ((wildCardActionToOthers & commingOwnerActionToOthers) === commingOwnerActionToOthers)){
                            commingData.delete(owner);
                        }

                    }
                }
            }

            if((specificData.nested && specificData.nestedOwnersMap.size == 0)) canAbsorb=true;
            if((!specificData.nested && specificData.directOwnersMap.size == 0)) canAbsorb=true;

            if (canAbsorb) {
                // ✅ Absorb: delete specificData from merged and remove from parenList
                
                merged.delete(specificKey);
                pInstances.delete(pIns);
            }
        }
    }


    

    // ==========================================
    // PHASE 3: Convert Maps to Final Arrays
    // ==========================================
    const finalResult = new Map();
    for (const [key, data] of merged) {
        const finalData = {
            leafName: data.leafName, parentResource: data.parentResource, parentInstance: data.parentInstance,
            nested: data.nested, action: data.action, 
            actionToOthers: data.actionToOthers, 
            ttl: data.ttl, _mergedFrom: data._mergedFrom
        };

        if (!data.nested) {
            finalData.ownerInstance = Array.from(data.directOwnersMap.values());
        } else {
            const optimizedNestedMap = [];
            for (const [nIns, ownerMap] of data.nestedOwnersMap) {
                optimizedNestedMap.push({
                    nestedInstance: nIns,
                    allowedOwners: Array.from(ownerMap.values()),
                    compactIndex:0,

                });
            }
            finalData.nestedOwnersMap = optimizedNestedMap;
        }

        finalResult.set(key, finalData);
    }

      return finalResult;
}
/**
 * 
 * @returns {boolean|object} true for valid GroupRole or {code:status code , message} for not valid GroupRoles
 */
    groupRoleValidationSchema() {

        for (const [groupkey, groupElement] of Object.entries(this.ListOfGroups)) { // iterate over all groups group role1 , group role2

            for (const [leaf, roleElement] of Object.entries(groupElement)) {// for leafs roles inside each group role
                if (roleElement === null) continue;

                const validate = this.validateRolElement(leaf, roleElement);

                if (validate !== 0) return validate;
              }
    }
     return true;
}

/**
 * Upgraded parentToLeafMap that works with the output of explodeAndInvertRolesFinal.
 * 
 * Key Changes:
 * - action/actionToOthers are now EffectedActionNotation strings (e.g., "RWO")
 * - boundary/boundaryToOthers are REMOVED (embedded in the notation)
 * - parentInstance is already exploded to single-string
 * - ownerInstance items are always {name, EffectedAction, EffectedActionToOthers ,ttl}
 * - nested cases use nestedOwnersMap instead of flat nestedInstance + ownerInstance
 * - Wildcard pruning is already done by explodeAndInvertRolesFinal (no #filterWildcard needed)
 *
 * @param {Object} memberedEntry - GroupRole in member after merged 
 * @param {number} roleId - The group role ID
 
 * @returns {boolean|Object} true on success, error object on failure
 */
 parentToLeafMap(memberedEntry, roleId) {
    
    for(const [member,Leafs]of Object.entries(memberedEntry)){
        this.pathsMemeber[member] ??={};
        const memberPath=this.pathsMemeber[member]
        // registe member to know where to start and end
        memberPath["start"]=this._pathsBufferInstanceCounts;
        // start member in paths buffer 
        
        for(const [leaf,roleElement] of Object.entries(Leafs)){
            if (roleElement === null){
                delete memberedEntry[member][leaf];
                 continue;
                }

     const {
        leafName, parentResource, parentInstance, nested,
        action, actionToOthers, ownerInstance, nestedOwnersMap
    } = roleElement;

    const leafPid = TYPE_IDS[leafName];
    const respid = TYPE_IDS[parentResource];
    const wildcardIndex = STRIDER_SIZES.WILDCARD_INDEX;

    if (!this.pTi.has(respid)) {
        this.pTi.set(respid, { instance: new Set() });
    }
    const parentToInstanceList = this.pTi.get(respid).instance;
    let subScemaMap = this.#getOrInitMap(this.schemaSlices, respid);

    const defaultPrimary = EFFECT_ACTION[action] || 0;
    const defaultOthers = EFFECT_ACTION[actionToOthers] || 0;

    const resIndex = resourceInstance.getResourceInstanceIndex(parentResource, parentInstance);
    if (resIndex?.code !== undefined) return resIndex;
    parentToInstanceList.add(resIndex);

    if (nested) {
        const nestedPid = TYPE_IDS[nested];

        // Second pass: write path buffer entries
        for (let i = 0; i < nestedOwnersMap.length; i++) {
            const nestedEntry = nestedOwnersMap[i];
            const nestedIndexed = nestedEntry.nestedInstance;
            const allowedOwners = nestedEntry.allowedOwners;

            const nestedchildId = resourceInstance.getResourceInstanceIndex(nested, nestedIndexed);
            if (nestedchildId?.code !== undefined) return nestedchildId;

            const childCompact = (resIndex === wildcardIndex)
                ? this.registerWildCardCompact(respid, nestedPid, nestedchildId)
                : this.register2KeyChildCompact(resIndex, nestedPid, nestedchildId);
                  this.#getOrCreateSchemaSlice(subScemaMap,resIndex,parentResource,nested,1,leafName,allowedOwners.length,childCompact)
                  nestedEntry.compactIndex=childCompact;

            for (const owner of allowedOwners) {
                const lName = owner.name;
                const lIndex = resourceInstance.getResourceInstanceIndex(leafName, lName);
                if (lIndex?.code !== undefined) return lIndex;

                const gChildCompact = (resIndex === wildcardIndex)
                    ? this.registerWildCardCompact(respid, leafPid, lIndex)
                    : this.registerNestedFlaten2keyGrandChildCompact(resIndex,leafPid,nestedchildId,lIndex);

                    owner.compactIndex=gChildCompact;

                const ownerPrimary = EFFECT_ACTION[owner.EffectedAction] || defaultPrimary;
                const ownerOthers = EFFECT_ACTION[owner.EffectedActionToOthers] || defaultOthers;
                const finalEffectedAction = (ownerOthers << 16) | ownerPrimary;

                const ownerTtl = owner.ttl || 0;
                if (ownerTtl > 0 && Math.floor(Date.now() / 1000) >= ownerTtl) continue;

                this.setPathBuffer(
                    roleId, memberPath.memberId, respid, resIndex,
                    nestedPid, childCompact,
                    leafPid, gChildCompact,
                    finalEffectedAction, ownerTtl
                );
            }
        }
    } else {
        // Direct case (no nested) — unchanged
        this.#getOrCreateSchemaSlice(
            subScemaMap,
            resIndex,
            parentResource,
            leafName,
            ownerInstance.length
        );

        for (const owner of ownerInstance) {
            const lName = owner.name;
            const lIndex = resourceInstance.getResourceInstanceIndex(leafName, lName);
            if (lIndex?.code !== undefined) return lIndex;

            const childCompact = (resIndex !== wildcardIndex)
                ? this.register2KeyChildCompact(resIndex, leafPid, lIndex)
                : this.registerWildCardCompact(respid, leafPid, lIndex);
                owner.compactIndex=childCompact;

            const ownerPrimary = EFFECT_ACTION[owner.EffectedAction] || defaultPrimary;
            const ownerOthers = EFFECT_ACTION[owner.EffectedActionToOthers] || defaultOthers;
            const finalEffectedAction = (ownerOthers << 16) | ownerPrimary;

            const ownerTtl = owner.ttl || 0;
            if (ownerTtl > 0 && Math.floor(Date.now() / 1000) >= ownerTtl) continue;

            this.setPathBuffer(
                roleId, memberPath.memberId, respid, resIndex,
                leafPid, childCompact,
                null, null,
                finalEffectedAction, ownerTtl
            );
        }
    }


        }// end Leafs 
        //
        memberPath["end"]=this._pathsBufferInstanceCounts; 

    }

   
    return true;
}

 usedMemberMergedRoles() {

      const memberRoles={}
      const roleId = resourceInstance.getRoleId(this.groupRoleName);
    if (roleId?.code !== undefined) {
        return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `CompileSchemaError: ${roleId.message}` };
    }

       // ==========================================
    // STEP 1: Explode, Invert, Prune & Merge
    // This is the heavy lifting — all wildcard absorption,
    // bitwise coverage pruning, and action merging happens here.
    // ==========================================
    const mergedMap = this.explodeAndInvertRolesFinal(this.ListOfGroups);

    // ==========================================
    // STEP 2: Process each merged entry
    // ==========================================
    for (const [key, mergedEntry] of mergedMap) {
       
        const resName=mergedEntry.parentResource
        const resouceType=TYPE_IDS[resName]
        const resIndex=resourceInstance.getResourceInstanceIndex(resName,mergedEntry.parentInstance);
        const genKey=`member-${resouceType}-${resIndex}`;
              if(!memberRoles[genKey]){
                memberRoles[genKey]={};
                const id=this.registerRoleMember(genKey);
             
                this.pathsMemeber[genKey] = {};
                this.pathsMemeber[genKey]["memberId"]=id;
                

              } ;
        const roleMember=memberRoles[genKey];
              roleMember[mergedEntry.leafName]=mergedEntry;
            
    }
    this.ListOfMemberGroups=memberRoles;
    this.ListOfGroups=mergedMap;

    const result = this.parentToLeafMap(memberRoles, roleId);
        
        if (result !== true) return result;
    

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
#calculateChildStrider(childList, grandChildList, offset, striderSize, striderOffset, childSize = STRIDER_SIZES.CHILD, childPrSize = STRIDER_SIZES.NESTED, schemaSlice = null) {
    let newOffset = offset;
    let totalsize = 0;
    let newSize = 0;
    let childHeader = 0;

    for (let ch of childList) {
        const chName = ch.name;
        const childCount = ch.capacity;
        const chType = TYPE_IDS[chName];
        const chTagType = TYPE_ID_TAG[chType];
        let totalchTypeSize = 0;

        const instanceDetails = ch.instanceDetails || [];

        if (RESOURCES_CHILD[chType]) {
            const hasChild = RESOURCES_CHILD[chType];
            const allowedChild = (grandChildList || []).filter(gch => hasChild.has(TYPE_IDS[gch.name]));

            if (instanceDetails.length > 0) {
                let totalChildCount = 0;
                
                for (const detail of instanceDetails) {
                    for (const [gchType, instbucket] of Object.entries(detail)) {
                        const grandChildType = TYPE_IDS[gchType];
                        const parentIndex = instbucket.parentIndex;
                        
                        // ✅ FLAT ITERATION: Direct value access
                        for (const key of Object.keys(instbucket)) {
                            if (key === 'parentIndex') continue; // Skip metadata
                            
                            const childIdx = Number(key);
                            const grandChildCount = instbucket[key]; // Direct value, no nested object!
                            
                            totalChildCount++;
                            
                            this.registerNestedChildCompactoffset(parentIndex, chType, childIdx, totalchTypeSize);
                            
                            const instanceSize = childPrSize + (grandChildCount * childSize);
                            totalchTypeSize += instanceSize;
                        }
                        
                        striderSize[grandChildType] = childSize;
                        striderOffset[grandChildType] = 1;
                    }
                }

                const offsetTableSize = 1 + totalChildCount;
                const InsChildSize = offsetTableSize + totalchTypeSize;

                striderSize[chType] = totalchTypeSize;
                striderOffset[chType] = newOffset;
                striderSize[chTagType] = offsetTableSize;
                striderOffset[chTagType] = newOffset;

                newOffset += InsChildSize;
                totalsize += InsChildSize;
            } else {
                // Fallback: uniform sizing
                newSize = this.#calculateChildStrider(allowedChild, [], newOffset + childPrSize, striderSize, striderOffset, childSize, childPrSize);
                childHeader = childPrSize;
                let endSize = newSize === 0 ? childSize : newSize;
                const offsetTableSize = 1 + childCount;
                let InsChildSize = offsetTableSize + (childCount * endSize) + (childHeader * childCount);
                
                striderSize[chType] = endSize + childHeader;
                striderOffset[chType] = newOffset;
                striderSize[chTagType] = offsetTableSize;
                striderOffset[chTagType] = newOffset;
                
                newOffset += InsChildSize;
                totalsize += InsChildSize;
            }
        } else {
            // Leaf child (no grandchildren)
           
            let InsChildSize =(childCount * childSize);
            
            striderSize[chType] = childSize;
            striderOffset[chType] = newOffset;
            striderSize[chTagType] = STRIDER_SIZES.TAGGED;
            striderOffset[chTagType] = newOffset;
            
            newOffset += InsChildSize;
            totalsize += InsChildSize;
        }

        childHeader = 0;
        newSize = 0;
    }

    return totalsize;
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




/** its used to compile all roles  used to recompile fast by bypass merged method
 * and reset only the binary/staging state by keeping merged roles not touch
*/
 resetRecompileStateWithoutMerge() {
    // 1. Reset only the binary/staging state (keep the merged JSON intact)
    this._pathsBufferInstanceCounts = 0;
    this.pathsMemeber =  Object.create(null);
    this.schemaSlices = new Map();
    this.pTi = new Map();
    this.striders = Object.create(null);
    this.globalstriders = Object.create(null);
    this.childCompactTree = new Map();
    this.wildcardCompactTree = new Map();
    this.nestedChildCompactoffsetTree = new Map();
    this.nestedGrandChildCompactTree = new Map();

    const roleId = resourceInstance.getRoleId(this.groupRoleName);
    if (roleId === undefined) return { code: SYSTEM_STATUS.INVALID_ROLE_ID };
    
    const result = this.parentToLeafMap(this.ListOfMemberGroups, roleId);
    if (result !== true) return result;
    
    // 3. Recalculate striders
    this.calculateTotalStridersSchemaSlice();
    return true;
}


    /** its used to compile all roles  */
compile() {

    // validation input GroupRole
    let result = true
    result = this.groupRoleValidationSchema()

    if (result != true) return result;

    /// create schemaSlices and pathBuffers and index compact 
        result = this.usedMemberMergedRoles();
    
    if (result != true) return result;

    /// calculate striders size and offset and shift for each groupRoles 

    this.calculateTotalStridersSchemaSlice();
}
    

}
