import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';
import { AutherizationCheck } from '../rbac/authorized/authorization.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { normalizeTTLToTimestamp,parseDurationStringToSeconds } from '../rbac/utils/utils.js';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';
import { 
    TYPE_IDS,
    TYPE_IDS_NAME,
    EFFECT_ACTION,
    SYSTEM_STATUS,
} from '../rbac/constant/resourceType.js';

// ==========================================
// TEST SUITE 1: TTL Normalization
// ==========================================
RoleBaseBuckets.FLUSH_INTERVAL_MS=100; 
describe('TTL Normalization', () => {
    
    describe('parseDurationStringToSeconds', () => {
        it('should parse seconds correctly', () => {
            assert.strictEqual(parseDurationStringToSeconds('30s'), 30);
            assert.strictEqual(parseDurationStringToSeconds('3600'), 3600);
            assert.strictEqual(parseDurationStringToSeconds('0'), 0);
        });

        it('should parse minutes correctly', () => {
            assert.strictEqual(parseDurationStringToSeconds('10m'), 600);
            assert.strictEqual(parseDurationStringToSeconds('1m'), 60);
        });

        it('should parse hours correctly', () => {
            assert.strictEqual(parseDurationStringToSeconds('1h'), 3600);
            assert.strictEqual(parseDurationStringToSeconds('24h'), 86400);
        });

        it('should parse days correctly', () => {
            assert.strictEqual(parseDurationStringToSeconds('1d'), 86400);
            assert.strictEqual(parseDurationStringToSeconds('7d'), 604800);
        });

        it('should parse Week correctly', () => {
            assert.strictEqual(parseDurationStringToSeconds('1W'), 604800);
            assert.strictEqual(parseDurationStringToSeconds('7d'), 604800);
        });
 it('should parse multipe combination correctly', () => {
            // ==========================================
            // Complex Multi-Unit Combinations
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('1Y1W'), 32140800, "should parse 1 year + 1 week");
            assert.strictEqual(parseDurationStringToSeconds('1M1w'), 3196800, "should parse 1 month + 1 week");
            assert.strictEqual(parseDurationStringToSeconds('1d10h'), 122400, "should parse 1 day + 10 hours");
            assert.strictEqual(parseDurationStringToSeconds('1d5m'), 86700, "should parse 1 day + 5 minutes");
            assert.strictEqual(parseDurationStringToSeconds('2d30s'), 172830, "should parse 2 days + 30 seconds");
            assert.strictEqual(parseDurationStringToSeconds('1d10h30m60s'), 124260, "should parse 1 day + 10 hours + 30 minutes + 60 seconds");
            assert.strictEqual(parseDurationStringToSeconds('1d5m30s'), 86730, "should parse 1 day + 5 minutes + 30 seconds");
            assert.strictEqual(parseDurationStringToSeconds('10h5m'), 36300, "should parse 10 hours + 5 minutes");
            assert.strictEqual(parseDurationStringToSeconds('1h1m1s'), 3661, "should parse 1 hour + 1 minute + 1 second");
            assert.strictEqual(parseDurationStringToSeconds('1W1d'), 691200, "should parse 1 week + 1 day");

            // ==========================================
            // Full Spectrum Combinations (All Units)
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('1Y2M3W4d5h6m7s'), 38898367, "should parse full spectrum combination");
            assert.strictEqual(parseDurationStringToSeconds('1Y1M1W1d1h1m1s'), 34822861, "should parse 1 of every unit");
            assert.strictEqual(parseDurationStringToSeconds('1y2m3d'), 31795320, "should parse lowercase year, minute, day");

            // ==========================================
            // Case Insensitivity & Variations
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('1y1w'), 32140800, "should parse lowercase 'y' and 'w'");
            assert.strictEqual(parseDurationStringToSeconds('1Y1W'), 32140800, "should parse uppercase 'Y' and 'W'");
            assert.strictEqual(parseDurationStringToSeconds('1M1W'), 3196800, "should parse uppercase 'M' and 'W'");
            assert.strictEqual(parseDurationStringToSeconds('1m1w'), 604860, "should parse lowercase 'm'(minute not month) and 'w'");

            // ==========================================
            // Edge Cases & Zero Values
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('0Y0M0W0d0h0m0s'), 0, "should parse all zeros as 0");
            assert.strictEqual(parseDurationStringToSeconds('0d0h'), 0, "should parse 0 days and 0 hours as 0");
            assert.strictEqual(parseDurationStringToSeconds('0s'), 0, "should parse 0 seconds as 0");

            // ==========================================
            // Implicit Seconds (No Unit Provided)
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('3600'), 3600, "should treat pure numbers as seconds");
            assert.strictEqual(parseDurationStringToSeconds('86400'), 86400, "should treat large pure numbers as seconds");
            assert.strictEqual(parseDurationStringToSeconds('0'), 0, "should treat '0' as 0 seconds");

            // ==========================================
            // Whitespace Handling supported it
            // ==========================================
            assert.strictEqual(parseDurationStringToSeconds('1d 10h'), 122400, "should parse with space between units");
            assert.strictEqual(parseDurationStringToSeconds(' 1Y 2M '), 36720000, "should parse with leading/trailing spaces");
        });

        it('should return -1 for invalid input', () => {
            assert.strictEqual(parseDurationStringToSeconds('invalid'), -1);
            assert.strictEqual(parseDurationStringToSeconds(''), -1);
            assert.strictEqual(parseDurationStringToSeconds('-5h'), -1);
        });
    });

    describe('normalizeTTLToTimestamp', () => {
        it('should return 0 for null/undefined/false', () => {
            assert.strictEqual(normalizeTTLToTimestamp(null), -1);
            assert.strictEqual(normalizeTTLToTimestamp(undefined), -1);
            assert.strictEqual(normalizeTTLToTimestamp(false), -1);
            assert.strictEqual(normalizeTTLToTimestamp(''), -1);
        });

        it('should handle relative numeric seconds', () => {
            const now = Math.floor(Date.now() / 1000);
            const result = normalizeTTLToTimestamp(3600);
            assert.ok(result >= now + 3600 - 1);
            assert.ok(result <= now + 3600 + 1);
        });

        it('should handle absolute epoch timestamps', () => {
            const futureTimestamp = 1791000000; // Some future date
            const result = normalizeTTLToTimestamp(futureTimestamp);
            assert.strictEqual(result, futureTimestamp);
        });

        it('should parse duration strings', () => {
            const now = Math.floor(Date.now() / 1000);
            const result = normalizeTTLToTimestamp('1h');
            assert.ok(result >= now + 3600 - 1);
            assert.ok(result <= now + 3600 + 1);
        });

        it('should handle millisecond timestamps by converting to seconds', () => {
            const msTimestamp = Date.now() + 3600000; // 1 hour in milliseconds
            const result = normalizeTTLToTimestamp(msTimestamp);
            const expectedSeconds = Math.floor(msTimestamp / 1000);
            assert.strictEqual(result, expectedSeconds);
        });

        it('should if ttl > MAX_UINT32  Auto-detect accidental millisecond timestamps and convert to seconds if result still > MAX_UINT32 its cap to MAX_UINT32 ', () => {
            let hugeTimestamp = 5000000000; // 
            let convertTimeStamp=hugeTimestamp/1000; // < MAX_UINT32
            let result = normalizeTTLToTimestamp(hugeTimestamp);
            assert.strictEqual(result, convertTimeStamp);

            hugeTimestamp = 5000000000000; // 
            convertTimeStamp=hugeTimestamp/1000;// > MAX_UINT32
            result = normalizeTTLToTimestamp(hugeTimestamp);
            assert.strictEqual(result,4294967295);

        });
    });
});

// ==========================================
// TEST SUITE 2: Per-Owner TTL in Merging
// ==========================================
describe('Per-Owner TTL Merging', () => {
    let compiler;

    beforeEach(() => {
        // Setup test resources
        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
            resourceInstance.AddResourceInstance("COLLECTIONS", "product");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear2");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat2");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat3");
        }
    });

    it('should preserve individual owner TTLs', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "mat1", ttl: "1h" },
                        { name: "mat2", ttl: "1d" }
                    ],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        compiler = new RoleCompiler("TEST_ROLE", roles);
        const merged = compiler.explodeAndInvertRolesFinal(roles);
        
        const key = "FIELD_METRICS|COLLECTIONS|users";
        const mergedEntry = merged.get(key);
        
        assert.ok(mergedEntry, "Should have merged entry");
        assert.strictEqual(mergedEntry.nestedOwnersMap.length, 1);
        
        const nestedEntry = mergedEntry.nestedOwnersMap[0];
        assert.strictEqual(nestedEntry.nestedInstance, "sear1");
        assert.strictEqual(nestedEntry.allowedOwners.length, 2);
        
        const mat1 = nestedEntry.allowedOwners.find(o => o.name === "mat1");
        const mat2 = nestedEntry.allowedOwners.find(o => o.name === "mat2");
        
        assert.ok(mat1, "Should have mat1");
        assert.ok(mat2, "Should have mat2");
        
        // mat1 should have 1h TTL, mat2 should have 1d TTL
        const now = Math.floor(Date.now() / 1000);
        assert.ok(mat1.ttl >= now + 3600 - 1 && mat1.ttl <= now + 3600 + 1, 
            `mat1 TTL should be ~1h, got ${mat1.ttl}`);
        assert.ok(mat2.ttl >= now + 86400 - 1 && mat2.ttl <= now + 86400 + 1, 
            `mat2 TTL should be ~1d, got ${mat2.ttl}`);
    });

    it('should use max TTL when merging same owner from different roles', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: "1h" }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            },
            'role2': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "WO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: "1d" }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        compiler = new RoleCompiler("TEST_ROLE2", roles);
        const merged = compiler.explodeAndInvertRolesFinal(roles);
        
        const key = "FIELD_METRICS|COLLECTIONS|users";
        const mergedEntry = merged.get(key);
        const nestedEntry = mergedEntry.nestedOwnersMap[0];
        const mat1 = nestedEntry.allowedOwners.find(o => o.name === "mat1");
        
        // Should use max TTL (1d)
        const now = Math.floor(Date.now() / 1000);
        assert.ok(mat1.ttl >= now + 86400 - 1 && mat1.ttl <= now + 86400 + 1, 
            `Should use max TTL (1d), got ${mat1.ttl}`);
        
        // Should merge actions to RWO
        assert.strictEqual(mat1.EffectedAction, "RWO", "Should merge actions");
    });

    it('should use permanent (0) when any role grants permanent access', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: "1h" }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            },
            'role2': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: 0 }], // Permanent
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        compiler = new RoleCompiler("TEST_ROLE3", roles);
        const merged = compiler.explodeAndInvertRolesFinal(roles);
        
        const key = "FIELD_METRICS|COLLECTIONS|users";
        const mergedEntry = merged.get(key);
        const nestedEntry = mergedEntry.nestedOwnersMap[0];
        const mat1 = nestedEntry.allowedOwners.find(o => o.name === "mat1");
      
        assert.strictEqual(mat1.ttl, 0, "Should be permanent (0)");
    });

    it('should handle mixed permanent and temporary owners', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "mat1", ttl: 0 },      // Permanent
                        { name: "mat2", ttl: "1h" },   // 1 hour
                        { name: "mat3", ttl: "1d" }    // 1 day
                    ],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        compiler = new RoleCompiler("TEST_ROLE4", roles);
        const merged = compiler.explodeAndInvertRolesFinal(roles);
        
        const key = "FIELD_METRICS|COLLECTIONS|users";
        const mergedEntry = merged.get(key);
        const nestedEntry = mergedEntry.nestedOwnersMap[0];
        
        const mat1 = nestedEntry.allowedOwners.find(o => o.name === "mat1");
        const mat2 = nestedEntry.allowedOwners.find(o => o.name === "mat2");
        const mat3 = nestedEntry.allowedOwners.find(o => o.name === "mat3");
        
        assert.strictEqual(mat1.ttl, 0, "mat1 should be permanent");
        assert.ok(mat2.ttl > 0, "mat2 should have TTL");
        assert.ok(mat3.ttl > 0, "mat3 should have TTL");
        assert.ok(mat3.ttl > mat2.ttl, "mat3 TTL should be greater than mat2");
    });
});

// ==========================================
// TEST SUITE 3: Compact Index Assignment
// ==========================================
describe('Compact Index Assignment', () => {
    let compiler;
    
    beforeEach(() => {
        resourceInstance.reset();

        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat2");
        }
    });

    it('should assign compactIndex to nested entries', () => {
       
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: ["mat1", "mat2"],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl: "1d"
                }
            }
        };

        compiler = new RoleCompiler("TEST_COMPACT", roles);
        compiler.compile()
      
        
        const mergedEntry = compiler.ListOfMemberGroups['member-100-0'];
        assert.ok(mergedEntry, "Should have member group");
        
        const fieldMetrics = mergedEntry.FIELD_METRICS;
        assert.ok(fieldMetrics.nestedOwnersMap[0].compactIndex !== undefined, 
            "nestedEntry should have compactIndex");
    });

    it('should assign compactIndex to owners', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: ["mat1", "mat2"],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl: "1d"
                }
            }
        };

        compiler = new RoleCompiler("TEST_OWNER_COMPACT", roles);
        compiler.compile();
        
        const mergedEntry = compiler.ListOfMemberGroups['member-100-0'];
        const nestedEntry = mergedEntry.FIELD_METRICS.nestedOwnersMap[0];
        
        for (const owner of nestedEntry.allowedOwners) {
            assert.ok(owner.compactIndex !== undefined, 
                `Owner ${owner.name} should have compactIndex`);
            assert.strictEqual(typeof owner.compactIndex, 'number', 
                "compactIndex should be a number");
        }
    });
});

// ==========================================
// TEST SUITE 4: Expiration Detection
// ==========================================
describe('Expiration Detection', () => {
    let compiler, worker, auth;

    beforeEach(() => {
        // Clear buckets
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.cancelPendingFlush();
        
        // Setup resources
        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
        }
    });

    it('should detect expired permissions', async () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: ["mat1"],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl: 1 // 1 second from now
                }
            }
        };

        compiler = new RoleCompiler("EXPIRE_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("EXPIRE_TEST", RoleBinaryWorker);
        worker = RoleBaseBuckets.createRegisterRole("EXPIRE_TEST", "EXPIRE_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        auth = new AutherizationCheck();
        
        // Check immediately - should be valid
        const now = Math.floor(Date.now() / 1000);
        const result1 = auth.checkAccess(
            resourceInstance.getRoleId("EXPIRE_TEST"),
            TYPE_IDS.COLLECTIONS,
            0, // users
            TYPE_IDS.SEARCH_INDEXES,
            0, // sear1
            TYPE_IDS.FIELD_METRICS,
            0, // mat1
            now
        );
        
        assert.ok(result1 >= 0 || result1.code === undefined, 
            `Should be valid now, got ${JSON.stringify(result1)}`);
        
        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check after expiration
        const futureTime = Math.floor(Date.now() / 1000);
        const result2 = auth.checkAccess(
            resourceInstance.getRoleId("EXPIRE_TEST"),
            TYPE_IDS.COLLECTIONS,
            0,
            TYPE_IDS.SEARCH_INDEXES,
            0,
            TYPE_IDS.FIELD_METRICS,
            0,
            futureTime
        );
        
        assert.ok(result2.code === SYSTEM_STATUS.PERMISSION_EXPIRED, 
            `Should be expired, got ${JSON.stringify(result2)}`);
    });

    it('should respect timestamp parameter for batch consistency', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: ["mat1"],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl: 3600 // 1 hour
                }
            }
        };

        compiler = new RoleCompiler("BATCH_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("BATCH_TEST", RoleBinaryWorker);
        worker = RoleBaseBuckets.createRegisterRole("BATCH_TEST", "BATCH_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        auth = new AutherizationCheck();
        
        // Use same timestamp for multiple checks
        const fixedTime = Math.floor(Date.now() / 1000);
        
        const result1 = auth.checkAccess(
            resourceInstance.getRoleId("BATCH_TEST"),
            TYPE_IDS.COLLECTIONS, 0,
            TYPE_IDS.SEARCH_INDEXES, 0,
            TYPE_IDS.FIELD_METRICS, 0,
            fixedTime
        );
        
        const result2 = auth.checkAccess(
            resourceInstance.getRoleId("BATCH_TEST"),
            TYPE_IDS.COLLECTIONS, 0,
            TYPE_IDS.SEARCH_INDEXES, 0,
            TYPE_IDS.FIELD_METRICS, 0,
            fixedTime
        );
        
        // Both should have same result
        assert.deepStrictEqual(result1, result2, 
            "Same timestamp should give same result");
    });
});

// ==========================================
// TEST SUITE 5: Background Flush & Surgical Removal
// ==========================================
describe('Background Flush & Surgical Removal', () => {
    let compiler, worker;

    beforeEach(() => {
         resourceInstance.reset()
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.cancelPendingFlush();
     
        
        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat2");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat3");
        }
    });

    it('should surgically remove only expired owners', async () => {
        
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "mat1", ttl: 1 },  // Expires in 1 second
                        { name: "mat2", ttl: 3600 }, // 1 hour
                        { name: "mat3", ttl: 0 }     // Permanent
                    ],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl:'1d'
                }
            }
        };

       
        compiler = new RoleCompiler("SURGICAL_TEST", roles);
       compiler.compile();
        
        RoleBaseBuckets.registerNewRole("SURGICAL_TEST", RoleBinaryWorker);
        worker = RoleBaseBuckets.createRegisterRole("SURGICAL_TEST", "SURGICAL_TEST", compiler);

        worker.addRolesValuseToRowBinary();
       
        
        // Simulate expiration by adding to bucket
        const roleId = resourceInstance.getRoleId("SURGICAL_TEST");

        // the default threshold for trigger flush is 5s i change it just for test to 100ms
       
       
        
           await new Promise(resolve => setTimeout(resolve, 1000));
       
         // add to expire bucket manualy 
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.FIELD_METRICS);
       
        
     
      
        // Wait for background flush i
       
        await new Promise(resolve => setTimeout(resolve, 150));
        // Get updated worker
        const updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        const memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];

        const nestedEntry = memberGroup.FIELD_METRICS.nestedOwnersMap[0];
        
        // mat1 should be removed, mat2 and mat3 should remain
        const remainingOwners = nestedEntry.allowedOwners.map(o => o.name);
        
        assert.ok(!remainingOwners.includes("mat1"), 
            "mat1 should be removed (expired)");
        assert.ok(remainingOwners.includes("mat2"), 
            "mat2 should remain (valid)");
        assert.ok(remainingOwners.includes("mat3"), 
            "mat3 should remain (permanent)");
    });

    it('should nullify empty leaves after all owners expire', async () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "mat1", ttl: 1 } // Only owner, expires
                    ],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl:1
                }
            }
        };

        compiler = new RoleCompiler("EMPTY_LEAF_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("EMPTY_LEAF_TEST", RoleBinaryWorker);
        worker = RoleBaseBuckets.createRegisterRole("EMPTY_LEAF_TEST", "EMPTY_LEAF_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const roleId = resourceInstance.getRoleId("EMPTY_LEAF_TEST");
         await new Promise(resolve => setTimeout(resolve, 1000));
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.FIELD_METRICS);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        const memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];
        
        assert.strictEqual(memberGroup.FIELD_METRICS, undefined, 
            "Leaf should be nullified when all owners expire and if its nullify then its remove form new update Role member");
    });

    it('should use fast-track recompilation (skip merge phase)', async () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: 1 }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    ttl:1
                }
            }
        };

        compiler = new RoleCompiler("FAST_TRACK_TEST", roles);
        compiler.compile();
        
        // Spy on explodeAndInvertRolesFinal
        let mergeCalled = false;
        const originalMerge = compiler.explodeAndInvertRolesFinal.bind(compiler);
        compiler.explodeAndInvertRolesFinal = function(...args) {
            mergeCalled = true;
            return originalMerge(...args);
        };
        
        RoleBaseBuckets.registerNewRole("FAST_TRACK_TEST", RoleBinaryWorker);
        worker = RoleBaseBuckets.createRegisterRole("FAST_TRACK_TEST", "FAST_TRACK_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const roleId = resourceInstance.getRoleId("FAST_TRACK_TEST");
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.FIELD_METRICS);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Fast-track should NOT call explodeAndInvertRolesFinal
        assert.strictEqual(mergeCalled, false, 
            "Fast-track recompilation should skip merge phase");
    });
});

// ==========================================
// TEST SUITE 6: Edge Cases
// ==========================================
describe('Expiration Edge Cases', () => {
    beforeEach(() => {
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.cancelPendingFlush();
        
        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
        }
    });

    it('should handle permanent permissions (ttl=0)', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: 0 }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        const compiler = new RoleCompiler("PERMANENT_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("PERMANENT_TEST", RoleBinaryWorker);
        const worker = RoleBaseBuckets.createRegisterRole("PERMANENT_TEST", "PERMANENT_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const auth = new AutherizationCheck();
        
        // Check far in the future - should still be valid
        const futureTime = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year
        const result = auth.checkAccess(
            resourceInstance.getRoleId("PERMANENT_TEST"),
            TYPE_IDS.COLLECTIONS, 0,
            TYPE_IDS.SEARCH_INDEXES, 0,
            TYPE_IDS.FIELD_METRICS, 0,
            futureTime
        );
        
        assert.ok(result >= 0 || result.code === undefined, 
            "Permanent permission should never expire");
    });

    it('should handle no TTL (undefined)', () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: ["mat1"],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                    // No ttl specified
                }
            }
        };

        const compiler = new RoleCompiler("NO_TTL_TEST", roles);
        compiler.compile();
        
        const memberGroup = compiler.ListOfMemberGroups['member-100-0'];
        const nestedEntry = memberGroup.FIELD_METRICS.nestedOwnersMap[0];
        const mat1 = nestedEntry.allowedOwners[0];
        
        assert.strictEqual(mat1.ttl, 0, "No TTL should default to permanent (0)");
    });

    it('should handle direct (non-nested) expiration', async () => {
        if (!resourceInstance.resourcelist[TYPE_IDS.DOCUMENTS]) {
            resourceInstance.AddResourceInstance('DOCUMENTS', "doc1");
        }

        const roles = {
            'role1': {
                "DOCUMENTS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "doc1", ttl: 1 }
                    ],
                    nested: null,
                    nestedInstance: null,
                }
            }
        };

        const compiler = new RoleCompiler("DIRECT_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("DIRECT_TEST", RoleBinaryWorker);
        const worker = RoleBaseBuckets.createRegisterRole("DIRECT_TEST", "DIRECT_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const roleId = resourceInstance.getRoleId("DIRECT_TEST");
         await new Promise(resolve => setTimeout(resolve, 1000));
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.DOCUMENTS);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        const memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];
        
        assert.strictEqual(memberGroup.DOCUMENTS, undefined, 
            "Direct leaf should be nullified when expired if leaf is nullify its remove from new member update ");
    });
});

// ==========================================
// TEST SUITE 7: Integration Tests
// ==========================================
describe('Full Expiration Integration',async () => {
    beforeEach(() => {
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.cancelPendingFlush();
        resourceInstance.reset();
        
        if (!resourceInstance.resourcelist[TYPE_IDS.COLLECTIONS]) {
            resourceInstance.AddResourceInstance("COLLECTIONS", "users");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.SEARCH_INDEXES]) {
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', "sear1");
        }
        if (!resourceInstance.resourcelist[TYPE_IDS.FIELD_METRICS]) {
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', "mat2");
        }
    });

    it('should handle complete expiration lifecycle', async () => {
        // 1. Create role with expiring permission
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [{ name: "mat1", ttl: 1 }],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        const compiler = new RoleCompiler("LIFECYCLE_TEST", roles);
        compiler.compile();
        
        RoleBaseBuckets.registerNewRole("LIFECYCLE_TEST", RoleBinaryWorker);
        const worker = RoleBaseBuckets.createRegisterRole("LIFECYCLE_TEST", "LIFECYCLE_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const auth = new AutherizationCheck();
        const roleId = resourceInstance.getRoleId("LIFECYCLE_TEST");
        
        // 2. Verify access is granted initially
        const now = Math.floor(Date.now() / 1000);
        const result1 = auth.checkAccess(
            roleId,
            TYPE_IDS.COLLECTIONS, 0,
            TYPE_IDS.SEARCH_INDEXES, 0,
            TYPE_IDS.FIELD_METRICS, 0,
            now
        );
        
        assert.ok(result1 >= 0 || result1.code === undefined, 
            "Access should be granted initially");
        
        // 3. Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 4. Verify access is denied after expiration
        const futureTime = Math.floor(Date.now() / 1000);
        const result2 = auth.checkAccess(
            roleId,
            TYPE_IDS.COLLECTIONS, 0,
            TYPE_IDS.SEARCH_INDEXES, 0,
            TYPE_IDS.FIELD_METRICS, 0,
            futureTime
        );
        
        assert.ok(result2.code === SYSTEM_STATUS.PERMISSION_EXPIRED, 
            "Access should be denied after expiration");
        
        // 5. Wait for background flush
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 6. Verify permission is surgically removed
        const updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        const memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];
        
        assert.strictEqual(memberGroup.FIELD_METRICS, undefined, 
            "Permission should be removed after flush");
    });

    it('should handle multiple expirations in same role', async () => {
        const roles = {
            'role1': {
                "FIELD_METRICS": {
                    parentResource: "COLLECTIONS",
                    parentInstance: ["users"],
                    action: "RO",
                    actionToOthers: "NONE",
                    ownerInstance: [
                        { name: "mat1", ttl: 1 },
                        { name: "mat2", ttl: 2 }
                    ],
                    nested: "SEARCH_INDEXES",
                    nestedInstance: ["sear1"],
                }
            }
        };

        const compiler = new RoleCompiler("MULTI_EXPIRE_TEST", roles);
        compiler.compile();

        
        RoleBaseBuckets.registerNewRole("MULTI_EXPIRE_TEST", RoleBinaryWorker);
        const worker = RoleBaseBuckets.createRegisterRole("MULTI_EXPIRE_TEST", "MULTI_EXPIRE_TEST", compiler);
        worker.addRolesValuseToRowBinary();
        
        const roleId = resourceInstance.getRoleId("MULTI_EXPIRE_TEST");
        
        // Wait for first expiration
        await new Promise(resolve => setTimeout(resolve,800));
        
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.FIELD_METRICS);
        await new Promise(resolve => setTimeout(resolve,150));
        
        let updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        let memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];

       
        let nestedEntry = memberGroup.FIELD_METRICS.nestedOwnersMap[0];
        
        // mat1 should be removed, mat2 should remain
        assert.strictEqual(nestedEntry.allowedOwners.length, 1, 
            "Should have 1 owner remaining");
        assert.strictEqual(nestedEntry.allowedOwners[0].name, "mat2", 
            "mat2 should remain");
        
        // Wait for second expiration
        await new Promise(resolve => setTimeout(resolve, 1000));
       
        RoleBaseBuckets.addToExpierdBucket(roleId, 0, TYPE_IDS.FIELD_METRICS);
     
        await new Promise(resolve => setTimeout(resolve, 150));
       
        updatedWorker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        memberGroup = updatedWorker.roles.ListOfMemberGroups['member-100-0'];
     
        // Leaf should be nullified
     
        assert.strictEqual(memberGroup.FIELD_METRICS, undefined, 
            "Leaf should be nullified after all owners expire");
    });
});

console.log('✅ All expiration test suites loaded. Run with: node --test test-expiration.js');