# 📜 Architecture Decision Record (ADR): RBACManager Facade

**Status:** Accepted  
**Date:** 2026-10-11  
**Component:** `RBACManager` (`src/rbac/RBACManager.js`)  
**Pattern:** Facade / Orchestrator  

---

## 1. Context & Background
The underlying RBAC engine consists of highly specialized, low-level components (`RoleCompiler`, `RoleBinaryWorker`, `RoleBaseBuckets`, `SystemResourcesIntstances`). While powerful, exposing these directly to application developers creates a steep learning curve, risks memory corruption through misuse, and violates the principle of separation of concerns.

**Decision:** Implement `RBACManager` as the **single, unified Facade** for the entire RBAC system. It abstracts compilation, binary allocation, file I/O orchestration, and authorization checks into a clean, safe, and highly observable API.

---

## 2. Core Design Principles
1. **Zero Memory Leaks:** Bulk operations process items sequentially and yield to the event loop, preventing memory spikes.
2. **Non-Blocking:** All file I/O and heavy compilation tasks are asynchronous and yield via `setImmediate`.
3. **Atomic Safety:** Operations like `saveAndRegisterRole` feature automatic rollback if registration fails.
4. **Standardized Responses:** Almost all methods return a predictable `{ success: boolean, message?: string, ...data }` envelope.

---

## 3. Comprehensive Method Reference

### 🟢 A. Initialization & Lifecycle

#### 1. `constructor()`
* **Why it's here:** Sets up the internal authorization checker and initial state.
* **Benefit:** Ensures the manager is ready to be configured without side effects.
* **Input:** None.
* **Output:** `RBACManager` instance.

#### 2. `initialize(options)`
* **Why it's here:** Bootstraps the system and wires in the monitoring system.
* **Benefit:** Prevents premature usage before monitoring and state are ready. Idempotent (safe to call multiple times).
* **Input:** `{ monitoring?: { enabled: boolean, ... } }`
* **Expected Output:** `this` (the manager instance).
* **How to read:** If already initialized, it logs a warning and returns early.

---

### 🟢 B. Resource Taxonomy Management

#### 3. `registerResource(resourceName, instances)`
* **Why it's here:** Registers a resource type (e.g., `"COLLECTIONS"`) and its specific instances (e.g., `["users", "products"]`) into the global taxonomy.
* **Benefit:** Assigns unique, sequential global indices required for binary buffer addressing.
* **Input:** `resourceName` (string), `instances` (string[]).
* **Expected Output:** `boolean` (`true` on success, `false` on failure).
* **How to read:** If `false`, check console for the specific error message (e.g., duplicate instance).

#### 4. `bulkRegisterResources(resourcesMap)`
* **Why it's here:** Seeds multiple resource types at once during system startup.
* **Benefit:** Reduces boilerplate; fails fast if any single resource registration fails.
* **Input:** `{ [resourceName: string]: string[] }` (e.g., `{ COLLECTIONS: ["users"], DOCUMENTS: ["doc1"] }`).
* **Expected Output:** `boolean`.
* **How to read:** `true` means all registered successfully. `false` means one failed and the process halted.

#### 5. `getResourceInstanceIndex(resourceName, instanceName)`
* **Why it's here:** Translates a human-readable instance name into its internal numeric global index.
* **Benefit:** Required for passing correct parameters to `checkAccess`.
* **Input:** `resourceName` (string), `instanceName` (string).
* **Expected Output:** `number` (the index) OR `{ code: number, message: string }` (on error).
* **How to read:** If the output is an object with a `code` property, the resource/instance does not exist.

---

### 🟢 C. Role Lifecycle Management

#### 6. `validateRole(roleName, roleDefinition)`
* **Why it's here:** Dry-runs the schema validation without allocating memory or compiling.
* **Benefit:** Perfect for API endpoint pre-flight checks to reject malformed JSON before expensive compilation.
* **Input:** `roleName` (string), `roleDefinition` (Object).
* **Expected Output:** `{ success: boolean, message?: string, code?: number }`.
* **How to read:** `success: true` means the JSON is structurally valid. `success: false` contains the exact schema violation in `message`.

#### 7. `createRole(roleName, roleDefinition)`
* **Why it's here:** The primary method to build, compile, and register a new role.
* **Benefit:** Orchestrates the entire 6-phase compilation pipeline and records metrics.
* **Input:** `roleName` (string), `roleDefinition` (Object).
* **Expected Output:** `{ success: boolean, message: string, roleId?: number, code?: number }`.
* **How to read:** If `success: true`, the role is active and `roleId` is returned. If `false`, check `code` (e.g., `SYSTEM_STATUS.RECOMPILE_FAILED`).

#### 8. `updateRole(roleName, newRoleDefinition, options)`
* **Why it's here:** Replaces an existing role's definition.
* **Benefit:** Triggers **Atomic Hot-Swap**. Compiles a new worker in the background and swaps the pointer only on success, ensuring zero downtime.
* **Input:** `roleName` (string), `newRoleDefinition` (Object), `options` (Object, optional).
* **Expected Output:** `{ success: boolean, message: string, code?: number }`.
* **How to read:** `success: true` means the live system is now using the new definition instantly.

#### 9. `deleteRole(roleName)`
* **Why it's here:** Safely removes a role from the system.
* **Benefit:** Two-phase deletion: removes from active memory buckets first, then cleans up the global registry, preventing orphaned state.
* **Input:** `roleName` (string).
* **Expected Output:** `{ success: boolean, message: string, details?: any }`.
* **How to read:** `success: true` means fully deleted. If `false` with `details`, it was removed from memory but failed to clear the global registry (edge case).

---

### 🟢 D. Role Introspection & Debugging

#### 10. `isRoleActive(roleName)`
* **Why it's here:** Quick existence check.
* **Benefit:** O(1) lookup to prevent unnecessary operations on non-existent roles.
* **Input:** `roleName` (string).
* **Expected Output:** `boolean`.

#### 11. `getRoleDefinition(roleName)`
* **Why it's here:** Retrieves the original, unpruned JSON definition of an active role.
* **Benefit:** Useful for admin panels to display the current configuration without reading from disk.
* **Input:** `roleName` (string).
* **Expected Output:** `{ success: boolean, roleName?: string, definition?: Object, message?: string }`.

#### 12. `getAllActiveRoles()`
* **Why it's here:** Returns a simple list of active role names.
* **Benefit:** Lightweight alternative to `getSystemInfo` for populating dropdowns or audit logs.
* **Input:** None.
* **Expected Output:** `string[]` (e.g., `["ADMIN", "EDITOR"]`).

#### 13. `getRoleInfo(roleName)`
* **Why it's here:** Provides deep metadata about a compiled role.
* **Benefit:** Essential for debugging memory usage or buffer sizing.
* **Input:** `roleName` (string).
* **Expected Output:** `{ roleName, roleId, bufferSize: number, totalBytesSize: number, memberCount: number }` OR `null`.
* **How to read:** `bufferSize` is the length of the `Uint32Array`. `totalBytesSize` is the calculated memory footprint.

---

### 🟢 E. Authorization & Bitwise Decoding

#### 14. `checkAccess(roleId, pType, pInstId, cType, cInsId, gcType, gcInsId)`
* **Why it's here:** The core O(1) permission verification engine.
* **Benefit:** Executes in < 100ns using direct memory offset calculation and bitwise checks.
* **Input:** 
  * `roleId` (number)
  * `pType`, `pInstId` (Parent Resource Type & Instance Index)
  * `cType`, `cInsId` (Child Resource Type & Instance Index, or `null`)
  * `gcType`, `gcInsId` (Grandchild Resource Type & Instance Index, or `null`)
* **Expected Output:** `number` (Packed 32-bit effect integer) OR `{ code: number, message: string }` (Error object).
* **How to read:** If the output is a `number`, access is **granted**, and you must use the bitwise helpers below to decode *what* actions are allowed. If it's an object with a `code`, access is **denied** (e.g., `PERMISSION_EXPIRED`, `ROLE_NOT_FOUND`).

#### 15-20. Bitwise Decoding Helpers
* **Why they are here:** To decode the 32-bit integer returned by `checkAccess`.
* **Benefit:** Abstracts complex bitwise math (`&`, `>> 16`) into readable boolean checks.
* **Methods:**
  * `allowedPrimaryTarget(primaryEffect, targetActionBit)`: Can the user perform the action on their *own* resource?
  * `allowedTargetToOthers(othersEffect, targetActionBit)`: Can the user delegate this action to *others*?
  * `allowedOwnerAction(primaryEffect, targetActionBit)`: Raw bitwise check for primary action.
  * `allowedOtherAction(primaryEffect, targetActionBit)`: Raw bitwise check for others' action.
  * `getOwnerBoundary(primaryEffect)`: Returns the boundary enum (e.g., `OWN`, `ALL`) for the primary action.
  * `getOtherBoundary(primaryEffect)`: Returns the boundary enum for the delegated action.
* **Input:** `effect` (number from `checkAccess`), `targetActionBit` (number, e.g., `DEFAULT_ACTIONS.READ`).
* **Expected Output:** `boolean` (for `allowed*` methods) or `number` (for `get*Boundary` methods).

---

### 🟢 F. System Safety & Management

#### 21. `deleteInstance(resourceName, instanceName, force)`
* **Why it's here:** Removes a resource instance from the global taxonomy.
* **Benefit:** **Prevents silent buffer corruption.** It checks `RoleBaseBuckets` to ensure no active role is currently targeting this instance before allowing deletion.
* **Input:** `resourceName` (string), `instanceName` (string), `force` (boolean, currently unused but reserved).
* **Expected Output:** `{ success: boolean, message: string, code?: number }`.
* **How to read:** If `success: false` with a message about "Active role", you must delete/update the blocking role first.

#### 22. `getRolesBoundToParentInstance(parentTypeName, InsName)`
* **Why it's here:** Reverse-lookup to find which roles are preventing an instance deletion.
* **Benefit:** Provides actionable feedback to admins when `deleteInstance` fails.
* **Input:** `parentTypeName` (string), `InsName` (string).
* **Expected Output:** `{ parentIns: string, numberOfActiveRole: number, activeRolesNames: string[], unknownRoles: number }`.

#### 23. `reset()`
* **Why it's here:** Wipes all in-memory state.
* **Benefit:** Critical for isolated, side-effect-free unit and integration testing.
* **Input:** None.
* **Expected Output:** `void` (logs success).

#### 24. `getSystemInfo()`
* **Why it's here:** High-level health and metrics snapshot.
* **Benefit:** Quick diagnostic tool for monitoring dashboards.
* **Input:** None.
* **Expected Output:** `{ totalActiveRoles: number, expiredBucketSize: number, roles: Array<{roleId, roleName, bufferSize}> }`.

---

### 🟢 G. File Repository Orchestration

*Note: These methods bridge the in-memory engine with the `RoleFileRepository` for persistence.*

#### 25. `loadAndRegisterAllRolesFromDirectory(dirPath, options)`
* **Why it's here:** Bootstraps the system by loading all dedicated role files from a folder.
* **Benefit:** Memory-safe sequential processing with event-loop yielding (`yieldEvery`).
* **Input:** `dirPath` (string), `options: { updateIfExists?: boolean, yieldEvery?: number }`.
* **Expected Output:** `{ success: boolean, message: string, created: string[], updated: string[], failed: Array<{roleName, reason}>, totalProcessed: number }`.
* **How to read:** Check the `failed` array for specific roles that had invalid JSON or compilation errors.

#### 26. `loadAndRegisterRolesFromBulkFile(filePath, options)`
* **Why it's here:** Imports roles from a Newline-Delimited JSON (NDJSON) file.
* **Benefit:** Streams the file line-by-line. **Never loads the entire file into memory**, making it safe for massive backups.
* **Input:** `filePath` (string), `options: { updateIfExists?: boolean, startLine?: number, limit?: number, yieldEvery?: number }`.
* **Expected Output:** Same envelope as #25.

#### 27. `saveAndRegisterRole(roleName, roleDefinition, dirPath)`
* **Why it's here:** One-step atomic operation to save a role to disk AND compile it in memory.
* **Benefit:** **Automatic Rollback.** If in-memory compilation fails, it automatically deletes the saved file to prevent "zombie" configurations.
* **Input:** `roleName` (string), `roleDefinition` (Object), `dirPath` (string).
* **Expected Output:** `{ success: boolean, message: string, filePath?: string, roleId?: number }`.

#### 28. `backupAllActiveRolesToBulkFile(filePath, options)`
* **Why it's here:** Exports the current live state of all active roles to an NDJSON file.
* **Benefit:** Appends roles sequentially with event-loop yielding. Saves the **original `ListOfGroups`** (unpruned), ensuring the backup can be freshly compiled later.
* **Input:** `filePath` (string), `options: { yieldEvery?: number }`.
* **Expected Output:** `{ success: boolean, message: string, backedUp: string[], failed: Array<{roleId, reason}>, totalRoles: number }`.

#### 29. `loadAndRegisterSingleRole(roleName, dirPath, options)`
* **Why it's here:** On-demand loading of a single role from a dedicated file.
* **Benefit:** O(1) file read and registration. Useful for lazy-loading roles in multi-tenant systems.
* **Input:** `roleName` (string), `dirPath` (string), `options: { updateIfExists?: boolean }`.
* **Expected Output:** `{ success: boolean, action: 'created' | 'updated', message?: string, roleId?: number }`.

#### 30. `findAndRegisterRoleFromBulkFile(roleName, filePath, options)`
* **Why it's here:** Searches a massive NDJSON file for a specific role and registers it.
* **Benefit:** **Early Exit.** Streams the file and stops reading the millisecond the target `roleName` is found, saving massive I/O time.
* **Input:** `roleName` (string), `filePath` (string), `options: { updateIfExists?: boolean }`.
* **Expected Output:** `{ success: boolean, action: 'created' | 'updated', lineNumber?: number, roleId?: number, message?: string }`.

---

## 4. Strategic Method Comparisons

### A. Dedicated Files vs. Bulk File Operations
| Feature | `...FromDirectory` Methods | `...FromBulkFile` Methods |
| :--- | :--- | :--- |
| **Underlying Format** | One `.json` file per role. | Single `.ndjson` file (one JSON object per line). |
| **Best Use Case** | Active development, frequent individual updates/deletes. | Nightly backups, system migrations, bulk imports. |
| **Update Speed** | **O(1)** (Overwrites 1 file). | **O(N)** (Must stream/rewrite the whole file). |
| **Memory Footprint** | Low (loads 1 file at a time). | Constant (streams line-by-line, never holds full file). |

### B. `createRole` vs. `updateRole`
| Feature | `createRole` | `updateRole` |
| :--- | :--- | :--- |
| **Purpose** | First-time registration of a role. | Modifying an existing, active role. |
| **Pipeline** | Full 6-phase compilation (Validation → Pruning → Indexing → Strider Calc → Buffer Allocation). | **Atomic Hot-Swap** (Compiles new worker → Swaps pointer → Discards old worker). |
| **Downtime** | N/A (New role). | **Zero.** Active requests continue using the old buffer until the new one is ready. |

### C. `saveAndRegisterRole` vs. `backupAllActiveRolesToBulkFile`
* `saveAndRegisterRole` is for **forward-looking creation**: "I have a new JSON, save it to disk and make it active now."
* `backupAllActiveRolesToBulkFile` is for **retroactive preservation**: "Take whatever is currently active in memory and snapshot it to disk for disaster recovery."

---

## 5. How to Read the Standardized Output Envelope

Almost every method in `RBACManager` adheres to this contract:

```javascript
// SUCCESS CASE
{
  success: true,
  message: "Human-readable success description",
  // ... optional payload data (e.g., roleId, created: [], definition: {})
}

// FAILURE CASE
{
  success: false,
  message: "Human-readable error description",
  code: -11, // Optional: SYSTEM_STATUS numeric code for programmatic handling
  // ... optional details (e.g., failed: [{roleName, reason}])
}
```
**Rule of Thumb:** Always check `if (result.success)` first. If `false`, log `result.message` and optionally inspect `result.code` or `result.failed` arrays for debugging.

---

## 6. Conclusion
The `RBACManager` successfully decouples the application layer from the high-performance binary engine. By enforcing strict input validation, providing automatic rollbacks, yielding to the event loop during bulk operations, and standardizing all outputs, it guarantees a **safe, observable, and highly performant** authorization experience.