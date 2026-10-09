# 📘 SystemResourcesIntstances: Global Resource Registry & Indexing Engine

The `SystemResourcesIntstances` class is the **single source of truth** for all resource types and their instances across the entire RBAC system. It assigns every resource instance a unique, sequential numeric index that serves as the foundation for all buffer addressing, compact indexing, and authorization lookups.

---

## 1. 🔄 Old vs. New: What Changed

| Feature | ❌ Old Version | ✅ New Version |
| :--- | :--- | :--- |
| **Instance Deletion** | Not supported. Instances lived forever. | ✅ `deleteResourceInstanceIndex()` with active-role safety guard |
| **Role Deletion** | Not supported. | ✅ `deleteRolebyName()` blocks deletion of active roles |
| **Memory Cleanup** | Empty resource types accumulated as orphaned objects. | ✅ Auto-deletes empty `res_pid` objects after last instance removal |
| **Telemetry** | No metrics or monitoring. | ✅ `getStats()` + `record()` integration for observability |
| **Wildcard Scaling** | Static 8-bit wildcard (max 255). | ✅ Dynamic scaling up to 32-bit (4.2 billion) as instances grow |
| **Validation** | Basic PID check only. | ✅ `RESOURCE_NONE_INSTANCES` guard prevents illegal instance creation |
| **Error Responses** | Inconsistent return types. | ✅ Standardized `{ code, message }` error objects |

---

## 2. 🏗️ Most Important Updates

### A. Active-Role Safety Guard
The most critical addition. Before deleting any resource instance, the system now checks if it is bound to an active role via `RoleBaseBuckets.isParentReourceInstanceActive()`. This prevents **silent buffer corruption** that would occur if a compiled binary buffer referenced a deleted instance.

```javascript
const isParentActive = RoleBaseBuckets.isParentReourceInstanceActive(res_pid, resIndex);
if (isParentActive) {
    return { success: false, code: SYSTEM_STATUS.DELETE_ERROR, message: "Linked to Active role" };
}
```

### B. Orphaned Object Cleanup
When the last instance of a resource type is deleted, the entire parent object is removed from memory:

```javascript
if (Object.keys(this.resourcelist[res_pid].index).length === 0) {
    delete this.resourcelist[res_pid]; // Prevents memory leaks in multi-tenant systems
}
```

### C. Dynamic Wildcard Scaling
As the number of instances grows, the wildcard capacity automatically doubles:

```javascript
if (wildcard < 32 && counter % wildcard > wildcard - 10) {
    SIZE_POWER.WILDCARD *= 2; // 8 → 16 → 32
}
```

---

## 3. 📚 Complete Method Reference

### Role Management

| Method | Description | Returns |
| :--- | :--- | :--- |
| `AddRole(RoleName)` | Registers a new role and assigns it a unique sequential ID. | `true` or `{code, message}` |
| `deleteRolebyName(GroupRoleName)` | Deletes a role by name. **Blocked if role is active.** | `true` or `{code, message}` |
| `getRoleId(RoleName)` | Returns the numeric ID for a role name. | `number` or `{code, message}` |

### Resource Instance Management

| Method | Description | Returns |
| :--- | :--- | :--- |
| `AddResourceInstance(res_Name, instanceName)` | Registers a new instance under a resource type. | `true` or `{code, message}` |
| `getResourceInstanceIndex(res_Name, instanceName)` | 🔥 **Hot-path lookup.** Returns the global index for an instance. | `number` or `{code, message}` |
| `deleteResourceInstanceIndex(res_Name, instanceName)` | Deletes an instance. **Blocked if linked to active role.** | `true` or `{code, message}` |
| `getResourceInstanceList(res_Name)` | Returns all instances for a resource type as `{name: index}`. | `Object` or `{code, message}` |

### Utility

| Method | Description | Returns |
| :--- | :--- | :--- |
| `getStats()` | Returns system metrics for monitoring dashboards. | `{rolesCount, resourcesCount, resourcesDeleteCount, wildcardPower}` |
| `reset()` | Clears all data. **For testing only.** | `void` |

---

## 4. 🔢 How Resources Are Indexed

### The Indexing Formula
Every resource instance receives a **sequential, zero-based counter** scoped to its resource type:

```
Resource Type: COLLECTIONS (PID: 100)
  ├── "users"    → index 0
  ├── "product"  → index 1
  ├── "orders"   → index 2
  └── "logs"     → index 3

Resource Type: FIELD_METRICS (PID: 103)
  ├── "mat1"     → index 0
  ├── "mat2"     → index 1
  └── "mat3"     → index 2
```

### Internal Data Structure
```javascript
this.resourcelist = {
    100: {                          // COLLECTIONS PID
        counter: 4,                 // Next available index
        index: {                    // Pure dictionary (Object.create(null))
            "users": 0,
            "product": 1,
            "orders": 2,
            "logs": 3
        }
    },
    103: {                          // FIELD_METRICS PID
        counter: 3,
        index: {
            "mat1": 0,
            "mat2": 1,
            "mat3": 2
        }
    }
}
```

### Special Cases
| Input | Behavior | Reason |
| :--- | :--- | :--- |
| `instanceName === '*'` | Returns `WILDCARD_INDEX` (4,294,967,295) | Universal wildcard for "all instances" |
| `RESOURCE_NONE_INSTANCES[pid]` | Returns `0` | Some resources (e.g., DOCUMENTS) don't have named instances |

---

## 5. 🎯 What This Index Means in the RBAC System

The global instance index is the **first layer** of a three-layer addressing system. It answers the question: *"Which specific instance of this resource type are we talking about?"*

### The Three-Layer Index Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RBAC INDEXING HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LAYER 1: Global Instance Index (SystemResourcesIntstances)         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  "users" → 0,  "product" → 1,  "mat1" → 0,  "mat2" → 1   │    │
│  │  Scope: GLOBAL (unique across the entire system)            │    │
│  │  Lifetime: Permanent (survives role recompilation)          │    │
│  │  Used by: Compiler, Authorization, Buffer Writing           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          ↓ feeds into                              │
│  LAYER 2: Child Compact Index (RoleBase / childCompactTree)         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  parent=0 + childType=102 + global=0 → compact=0           │    │
│  │  parent=0 + childType=102 + global=1 → compact=1           │    │
│  │  Scope: LOCAL to a specific parent instance                 │    │
│  │  Lifetime: Per-role (rebuilt on recompilation)              │    │
│  │  Used by: Buffer addressing for direct children             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          ↓ feeds into                              │
│  LAYER 3: Grandchild Compact Index (nestedGrandChildCompactTree)    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  parent=0 + gcType=103 + nested=0 + global=0 → compact=0   │    │
│  │  parent=0 + gcType=103 + nested=0 + global=1 → compact=1   │    │
│  │  Scope: LOCAL to a specific nested child instance           │    │
│  │  Lifetime: Per-role (rebuilt on recompilation)              │    │
│  │  Used by: Buffer addressing for grandchildren               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. ⚖️ Global Index vs. RoleBase Child Compact Index

| Aspect | Global Index (`SystemResourcesIntstances`) | Child Compact Index (`childCompactTree`) |
| :--- | :--- | :--- |
| **What it identifies** | A specific instance of a resource type | A child's position relative to its parent |
| **Scope** | **Global** — same across all roles | **Local** — unique per parent instance |
| **Example** | `"sear1"` → `0` (always, everywhere) | `parent=0, type=102, global=0` → compact `0` |
| **Persistence** | **Permanent** — survives role changes | **Transient** — rebuilt on recompilation |
| **Who assigns it** | `AddResourceInstance()` at system startup | `register2KeyChildCompact()` during compilation |
| **Used for** | Translating names → numbers | Calculating buffer memory addresses |
| **Wildcard support** | `'*'` → `4,294,967,295` | `WILDCARD_INDEX` in compact tree |

### Concrete Example
```
System has: "sear1" (global=0), "sear2" (global=1), "sear3" (global=2)

Role "ADMIN" targets parent "users" (index=0) with children sear1, sear2:
  → childCompactTree: parent=0, type=102, global=0 → compact=0
  → childCompactTree: parent=0, type=102, global=1 → compact=1
  (sear3 is NOT in this role, so it has no compact index here)

Role "GUEST" targets parent "product" (index=1) with child sear2 only:
  → childCompactTree: parent=1, type=102, global=1 → compact=0  ← Note: starts at 0!
  (Compact indices are isolated per parent, so they restart from 0)
```

---

## 7. ⚖️ Global Index vs. Nested Grandchild Compact Index

| Aspect | Global Index (`SystemResourcesIntstances`) | Grandchild Compact Index (`nestedGrandChildCompactTree`) |
| :--- | :--- | :--- |
| **What it identifies** | A specific instance of a resource type | A grandchild's position relative to its nested parent |
| **Scope** | **Global** — same across all roles | **Local** — unique per (parent + nested child) combination |
| **Example** | `"mat1"` → `0` (always, everywhere) | `parent=0, gcType=103, nested=0, global=0` → compact `0` |
| **Persistence** | **Permanent** | **Transient** — rebuilt on recompilation |
| **Who assigns it** | `AddResourceInstance()` | `registerNestedFlaten2keyGrandChildCompact()` |
| **Used for** | Translating names → numbers | Final buffer payload addressing (the 4-unit data block) |
| **Key difference** | Flat, single-level lookup | 3-level composite key (53-bit flattened) |

### Concrete Example
```
System has: "mat1" (global=0), "mat2" (global=1), "mat3" (global=2)

Role "ADMIN" has:
  Parent: "users" (index=0)
    └── Nested: "sear1" (compact=0)
          └── Grandchildren: mat1, mat2
              → nestedTree: parent=0, gc=103, nested=0, global=0 → compact=0
              → nestedTree: parent=0, gc=103, nested=0, global=1 → compact=1

    └── Nested: "sear2" (compact=1)
          └── Grandchildren: mat1, mat3
              → nestedTree: parent=0, gc=103, nested=1, global=0 → compact=0  ← Restarts!
              → nestedTree: parent=0, gc=103, nested=1, global=2 → compact=1
```

---

## 8. 🚀 Quick Start Example

```javascript
import { resourceInstance } from './systemReourcesInstances.js';
import { TYPE_IDS } from './constant/resourceType.js';

// ==========================================
// 1. Register Resources (System Startup)
// ==========================================
resourceInstance.AddResourceInstance("COLLECTIONS", "users");
resourceInstance.AddResourceInstance("COLLECTIONS", "product");
resourceInstance.AddResourceInstance("FIELD_METRICS", "mat1");
resourceInstance.AddResourceInstance("FIELD_METRICS", "mat2");

// ==========================================
// 2. Look Up Indices (Hot Path)
// ==========================================
const usersIndex = resourceInstance.getResourceInstanceIndex("COLLECTIONS", "users");
console.log(usersIndex); // 0

const wildcardIndex = resourceInstance.getResourceInstanceIndex("COLLECTIONS", "*");
console.log(wildcardIndex); // 4294967295

// ==========================================
// 3. Safe Deletion (Runtime)
// ==========================================
const result = resourceInstance.deleteResourceInstanceIndex("COLLECTIONS", "product");
if (result === true) {
    console.log("✅ Instance deleted safely");
} else {
    console.log("❌ Blocked:", result.message);
}

// ==========================================
// 4. Monitor System Health
// ==========================================
console.log(resourceInstance.getStats());
// { rolesCount: 5, resourcesCount: 4, resourcesDeleteCount: 1, wildcardPower: 32 }
```

---

## 9. 🧠 Key Takeaways

1. **Global indices are permanent and system-wide.** They never change during the lifetime of the application.
2. **Compact indices are temporary and role-local.** They are rebuilt every time a role is compiled or recompiled.
3. **The global index feeds into the compact index.** The compiler uses global indices to look up instances, then assigns compact indices for efficient buffer addressing.
4. **Never delete an instance that is bound to an active role.** The safety guard prevents this, but understanding *why* helps you design better resource lifecycle management.
5. **The wildcard index (`4,294,967,295`) is a special sentinel value** that bypasses normal indexing and matches all instances at the buffer level.

---

*This class is the foundation upon which the entire binary RBAC engine is built. Every buffer address, every compact index, and every authorization check ultimately traces back to the global instance indices managed here.* 