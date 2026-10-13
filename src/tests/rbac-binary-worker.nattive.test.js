import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';
import { SYSTEM_STATUS, STRIDER_SIZES, TYPE_IDS,TYPE_ID_TAG } from '../rbac/constant/resourceType.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import strict from 'node:assert/strict';

/**
 * some method are used four manupelation buffer i keep public for testing in production all method related to buffer will be private 
 */

describe('RoleBinaryWorker & RowBinaryAllocator', () => {
    const ROLE_NAME = 'GUEST-1';
    const ROLE_WC_Name="GUEST-2"
     const ROLE_NC_Name="GUEST-3"
    // Use actual TYPE_IDS if available, otherwise fallback to standard mock numbers
    const PARENT_TYPE = TYPE_IDS.COLLECTIONS || 100;
    const CHILD_TYPE = TYPE_IDS.SEARCH_INDEXES || 102;
    const GRANDCHILD_TYPE = TYPE_IDS.FIELD_METRICS || 103;
    const docType=TYPE_IDS.DOCUMENTS;
    const docTagType=TYPE_ID_TAG[docType];
    const roleHeaderTag=TYPE_IDS.ROLE_HEADER_TAG
    
    let mockRoles;
    /**@type {RoleBinaryWorker} */
    let worker;
   /**@type {RoleBinaryWorker} */
    let wildcardWorker;
    /**@type {RoleBinaryWorker} */
    let ncWorker;

    const testGroupRole={
        'role-1':{
            /**
             *@type {import('../rbac/constant/typesDef.js').RoleElementObject} 
             *  */
            DOCUMENTS:{
                parentResource: "COLLECTIONS",
                parentInstance:['users'],
                action: 'RO',
                actionToOthers:'NONE',
                ownerInstance:['1'],
                nested:null,
                nestedInstance:null,
                ttl:0
            }

        }
    }

    const test3GroupRole={
        'role-1':{
            /**
             *@type {import('../rbac/constant/typesDef.js').RoleElementObject} 
             *  */
            DOCUMENTS:{
                parentResource: "COLLECTIONS",
                parentInstance:['*'],
                action: 'RO',
                actionToOthers:'NONE',
                ownerInstance:['1'],
                nested:null,
                nestedInstance:null,
                ttl:0
            }

        }
    }


    const test2GroupRole={
        'role-1':{
            /**
             *@type {import('../rbac/constant/typesDef.js').RoleElementObject} 
             *  
             * */
            'FIELD_METRICS' :{
                parentResource: 'COLLECTIONS' ,
                parentInstance:['users','products'],
                action:'RO',
                actionToOthers:'NONE',
                ownerInstance:['mat1'],
                nested: 'SEARCH_INDEXES',
                nestedInstance:[ 'sear1'],
                ttl: 0,

            }
        }
    }
        resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
        resourceInstance.AddResourceInstance('COLLECTIONS', 'products');
        resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');
        resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
    let compileTestGroupRole;
    let wcCompile;
    let ncCompile;
     // buffer 2 parent + 4 LeaF Node Direct Child total size of element buffer = 6  
        compileTestGroupRole=new RoleCompiler(ROLE_NAME,testGroupRole)
        compileTestGroupRole.compile();
        // wildcard  // buffer 2 parent + 4 LeaF Node Direct Child total size of element buffer = 6 
        wcCompile=new RoleCompiler(ROLE_WC_Name,test3GroupRole);
        wcCompile.compile();
        // nested with multiple parent 
        //1r+1p+nested header(1 child Count + 1...n nested child instncs)+(child 1 Instance (1 taged + 4 for its grand childe))
        //1r + 1pIns +1 (nested child count)+1 (nestedchild) + 1 (nested child Instce tage)+4 (leaf grand child ) = 9
        // products and users are targeted same Leaf with same insance so each one have 9 element total = 9*2=18 element
        ncCompile=new RoleCompiler(ROLE_NC_Name,test2GroupRole);
        ncCompile.compile();

        worker = new RoleBinaryWorker(ROLE_NAME, compileTestGroupRole);
        wildcardWorker=new RoleBinaryWorker(ROLE_WC_Name,wcCompile);
        ncWorker=new RoleBinaryWorker(ROLE_NC_Name,ncCompile);  

    // first test wiht direct child example document and parent resources is collection and instances pIns=0
    // ==========================================
    // INITIALIZATION & ALLOCATION
    // ==========================================
    describe('Initialization & Allocation', () => {
        it('should initialize correctly and set groupRolesPid', () => {
            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(worker.groupRolesPid, roleId);
            assert.strictEqual(worker.totalSize,6);
            assert.strictEqual(worker.bufferState.type, Uint32Array);
            assert.strictEqual(worker.bufferLength,6);

            // for wild card role
            const roleIdWc = resourceInstance.getRoleId(ROLE_WC_Name);
            assert.strictEqual(wildcardWorker.groupRolesPid, roleIdWc);
            assert.strictEqual(wildcardWorker.totalSize,6);
            assert.strictEqual(wildcardWorker.bufferState.type, Uint32Array);
            assert.strictEqual(wildcardWorker.bufferLength,6);

            // for nested 

             
            const roleIdNc = resourceInstance.getRoleId(ROLE_NC_Name);
            assert.strictEqual(ncWorker.groupRolesPid, roleIdNc);
            assert.strictEqual(ncWorker.totalSize,18);
            assert.strictEqual(ncWorker.bufferState.type, Uint32Array);
            assert.strictEqual(ncWorker.bufferLength,18);
        });

        it('should throw error if role is not found', () => {
            assert.throws(() => {
                new RoleBinaryWorker('NONEXISTENT_ROLE', compileTestGroupRole);
               
            }, /Roles Errors/);
        });

    });

    // ==========================================
    // STRIDER & OFFSET RETRIEVAL
    // ==========================================
    describe('Strider & Offset Retrieval', () => {
        it('should get instance strider size', () => {
            // role contain parent with one direct child 2 parent \
            // or role header (elment 0 contain role id,element 1 contain pIns)= 2 element + Leaf Direct child [chIns+roleMemberid+TTL+Action]=4 element \
            // total = 2+4=6 element 
            //strider size of parent type is += parent Ins Element + its direct child element + if exist nested child(nested header) + grand child (Leaf) 
            // 1 for pIns +4 for Direct Leaf child =5,
            // the first byte in each role in buffer its Role header Tage element its contain role id but in strider size its contain total size of element for this role in buffer
            const size = worker.getinstanceStriderSize(PARENT_TYPE, 0);
            assert.strictEqual(size[PARENT_TYPE],5)
            assert.strictEqual(size[docType],4);
            assert.strictEqual(size[docTagType],1);
            assert.strictEqual(size[roleHeaderTag],1);
             assert.strictEqual(size[TYPE_IDS.ROOT],6);
          
            // wildcard 
            const size1 = wildcardWorker.getinstanceStriderSize(PARENT_TYPE, wildcardWorker.wildcard);
            assert.strictEqual(size1[PARENT_TYPE],5)
            assert.strictEqual(size1[docType],4);
            assert.strictEqual(size1[docTagType],1);
            assert.strictEqual(size1[roleHeaderTag],1);
            assert.strictEqual(size[TYPE_IDS.ROOT],6);

             // nested 
            const size2 = ncWorker.getinstanceStriderSize(PARENT_TYPE, 0);
            assert.strictEqual(size2[PARENT_TYPE],8)
            assert.strictEqual(size2[CHILD_TYPE],5);
            assert.strictEqual(size2[GRANDCHILD_TYPE],4);
            assert.strictEqual(size2[roleHeaderTag],1); 
            assert.strictEqual(size2[TYPE_IDS.ROOT],9);
        });

        it('should get instance strider offset', () => {
            const offset = worker.getinstanceStriderOffset(PARENT_TYPE, 0);
          
            assert.strictEqual(offset[PARENT_TYPE],1)
            assert.strictEqual(offset[docType],2);
            assert.strictEqual(offset[docTagType],2);
            assert.strictEqual(offset[roleHeaderTag],0);

             const offsetWC = wildcardWorker.getinstanceStriderOffset(PARENT_TYPE, wildcardWorker.wildcard);
          
            assert.strictEqual(offsetWC[PARENT_TYPE],1)
            assert.strictEqual(offsetWC[docType],2);
            assert.strictEqual(offsetWC[docTagType],2);
            assert.strictEqual(offsetWC[roleHeaderTag],0);

            const offsetNC = ncWorker.getinstanceStriderOffset(PARENT_TYPE, 1);
          
            assert.strictEqual(offsetNC[PARENT_TYPE],1)
            assert.strictEqual(offsetNC[CHILD_TYPE],2);
            assert.strictEqual(offsetNC[GRANDCHILD_TYPE],1);
            assert.strictEqual(offsetNC[roleHeaderTag],0);
        });

        it('should get instance strider shift', () => {
            const shift = worker.getinstanceStriderShift(PARENT_TYPE, 0);
            assert.strictEqual(shift, 0);
        });

        it('should return 0 for undefined strider shift', () => {
            const shift = worker.getinstanceStriderShift(999, 999);
            assert.strictEqual(shift, 0);
        });


        it('should get global strider for pIns wildcard '*' ', () => {
            const global = wildcardWorker.getGlobalStrider(PARENT_TYPE);
            assert.deepStrictEqual(global.shift,0);
            assert.deepStrictEqual(global.totalNodeSize,6);
        });
    });

    // ==========================================
    // COMPACT INDEX TRANSLATION
    // ==========================================
    describe('Compact Index Translation', () => {
        it('should translate child global to compact', () => {
            // role have one child translate golobal 0 to 0 
         
            const compact = worker.translateChildGlobalToCompact(0, docType, 0);
            assert.strictEqual(compact, 0);
        });

        it('should translate wildcard global to compact with fallback', () => {
          
            
            const specific = wildcardWorker.translateWildCardGlobalToCompact(PARENT_TYPE, docType, 0);
            assert.strictEqual(specific, 0);
            
            const fallback = wildcardWorker.translateWildCardGlobalToCompact(PARENT_TYPE, docType, 999);
            assert.strictEqual(fallback, -1); // child not wildcard its just parent its must much same instance index for this it return -1 (no found)
        });

        it('should return -1 if wildcard tree is empty', () => {
            const compact = worker.translateWildCardGlobalToCompact(999, 999, 0);
            assert.strictEqual(compact, -1);
        });
    });

    // ==========================================
    // ADDRESS CALCULATION (geteffected)
    // ==========================================
    describe('Address Calculation (geteffected)', () => {
       
        worker.addRolesValuseToRowBinary();
        ncWorker.addRolesValuseToRowBinary();
        it('should return -1 if groupRoleId does not match', () => {
            const result = worker.geteffected(999, PARENT_TYPE, 0);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_ROLE_ID);
        });

        it('should return shift address when fetchGroupRole is true', () => {
            const address = worker.geteffected(worker.groupRolesPid, PARENT_TYPE, 0, null, null, null, null, true, false);
            assert.strictEqual(address, 0); // shift is 0
            
            const value = worker.geteffected(worker.groupRolesPid, PARENT_TYPE, 0, null, null, null, null, true, true);
            assert.strictEqual(value, worker.groupRolesPid); // buffer[0]
        });

        it('should return error for undefined parent', () => {
            const result = worker.geteffected(worker.groupRolesPid, undefined, 0);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        it('should calculate direct child address correctly', () => {
            // address = shift(0) + striderOffset[child](2) + striderSize[child](4) * 0 = 2
            const address = worker.geteffected(worker.groupRolesPid, PARENT_TYPE, 0, docType, 0);
            assert.strictEqual(address, 2);
        });

        it('should calculate nested grandchild address correctly', () => {
            // Setup buffer for nested header
            // address = rId() 1 + pIns(0) 1 + childCount(1) 1 + childOffset(0) 1 +  nestedChildTage (0) 1 = 5
            // 1+1+1+1+1=5 // buffer index start from zero 

            const address = ncWorker.geteffected(ncWorker.groupRolesPid, PARENT_TYPE, 0, CHILD_TYPE, 0, GRANDCHILD_TYPE, 0);
            assert.strictEqual(address, 5);
        });

        it('should return error for buffer overflow', () => {
            // Force an out-of-bounds calculation by mocking a huge shift
            const originalShift = worker.getinstanceStriderShift;
            
            worker.getinstanceStriderShift = () => 1000;
            const result = worker.geteffected(worker.groupRolesPid, PARENT_TYPE, 0, docType, 0);
            
            assert.strictEqual(result.code, SYSTEM_STATUS.BUFFER_OVERFLOW);
            worker.getinstanceStriderShift = originalShift;

        });
    });

    // ==========================================
    // NESTED CHILD ADDRESS (getNesteChilddAddress)
    // ==========================================
    describe('Nested Child Address', () => {
        it('should calculate nested child header address correctly', () => {
          ncWorker.addRolesValuseToRowBinary();
            
            // address = tempAddress(3) + childCount(1) + childShift(0) = 4
            const address = ncWorker.getNesteChilddAddress(ncWorker.groupRolesPid, PARENT_TYPE, 0, CHILD_TYPE, 0);
            assert.strictEqual(address,4);
        });

        it('should return error for undefined child in nested address', () => {
            const result = ncWorker.getNesteChilddAddress(ncWorker.groupRolesPid, PARENT_TYPE, 0, 999, 0);
            assert.strictEqual(result.code, SYSTEM_STATUS.UNDEFINED_ADDRESS);
        });
    });

    // ==========================================
    // AUTHORIZATION ACCESS (geteffectedAccess)
    // ==========================================
    describe('Authorization Access (geteffectedAccess)', () => {
        it('should return effected value for valid direct child access', () => {
            // Setup buffer
           worker.addRolesValuseToRowBinary();
             ncWorker.addRolesValuseToRowBinary();

            const result = worker.geteffectedAccess(worker.groupRolesPid, PARENT_TYPE, 0, docType, 0, null, null, 0);
            assert.strictEqual(result, 17);
        });

        it('should return effected value for valid nested grandchild access', () => {

            const result = ncWorker.geteffectedAccess(ncWorker.groupRolesPid, PARENT_TYPE, 0, CHILD_TYPE, 0, GRANDCHILD_TYPE, 0, 0);
            assert.strictEqual(result, 17);
        });

        it('should return error for role mismatch', () => {
            
            const result = worker.geteffectedAccess(999, PARENT_TYPE, 0);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_ROLE_ID);
        });

      
    });

    
    // ==========================================
    // BULK POPULATION
    // ==========================================
    describe('Bulk Population (addRolesValuseToRowBinary)', () => {
        it('should populate buffer from pTi and pathsMemeber correctly', () => {
            worker.addRolesValuseToRowBinary();
            
            // Check parent header (from pTi loop)
            assert.strictEqual(worker.getBufferCell(0), worker.groupRolesPid);
            assert.strictEqual(worker.getBufferCell(1), 0); // pInstance
            
            // Check paths member population (from pathsMemeber loop)
            // For direct child, address = 2
            assert.strictEqual(worker.getBufferCell(2), 0); 
            assert.strictEqual(worker.getBufferCell(3), 0); 
            assert.strictEqual(worker.getBufferCell(4), 0); 
            assert.strictEqual(worker.getBufferCell(5), 17);
        });

        it('should handle nested child offset tree during bulk population', () => {
            // Mock nestedChildCompactoffsetTree
           
            ncWorker.addRolesValuseToRowBinary();
            
            // Verify nested header was written
            // address for child = 2. childCount = 1 (size of map)
            assert.strictEqual(ncWorker.getBufferCell(2), 1); 
            // childShift for index 0 is written at address + 1 + 0 = 3
            assert.strictEqual(ncWorker.getBufferCell(3), 0);
        });
    });
});

console.log('✅ RoleBinaryWorker test suite loaded. Run with: node --test RoleBinaryWorker.native.test.js');
