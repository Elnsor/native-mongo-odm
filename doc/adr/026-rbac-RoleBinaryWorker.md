# 📜 ADR: Buffer Encapsulation & Memory Safety in RoleBinaryWorker

**Status:** Accepted  
**Component:** `RoleBinaryWorker` & `RowBinaryAllocator` (`src/rbac/allocator/`)  
**Pattern:** Encapsulation / Information Hiding  
**Date:** 13-10-2026
## 🍿 Context & Motivation
Previously, the binary permission buffer (`this.buffer`) was a public property. While this made debugging easy, it introduced a critical architectural risk: **any part of the codebase could accidentally or maliciously mutate the binary memory layout**. 

Because this buffer is the single source of truth for sub-microsecond authorization checks, corruption leads to either catastrophic security bypasses or hard Node.js process crashes (e.g., `RangeError: Index out of bounds`).

**Decision:** The `buffer` has been moved to a strict private field (`#buffer`). All direct manipulations are now handled by private methods, and external access is strictly controlled via safe, bounds-checked getters and high-level authorization APIs.

---

## 🏗️ Architectural Changes: Public ➔ Private

To enforce this boundary, the following methods were transitioned from `public` to `private` (`#`):

| Method | Previous Visibility | New Visibility | Reason |
| :--- | :--- | :--- | :--- |
| `buffer` (property) | Public | **Private (`#buffer`)** | Prevents direct external mutation. |
| `createMemorBuffer` | Public | **Private (`#createMemorBuffer`)** | Internal allocation logic only. |
| `setWorkerRoleId` | Public | **Private (`#setWorkerRoleId`)** | Internal initialization step. |
| `setWorkerValueToAddr` | Public | **Private (`#setWorkerValueToAddr`)** | Raw memory write; unsafe if exposed. |
| `getEffectedValue` | Public | **Private (`#getEffectedValue`)** | Raw memory read; replaced by safe getters. |
| `setWorkerValue` | Public | **Private (`#setWorkerValue`)** | Complex multi-step write logic; internal only. |

---

## 🛡️ Benefits of Buffer Privacy

1. **Zero-Trust Security**: External classes (like `AutherizationCheck` or `RoleBaseBuckets`) can no longer accidentally overwrite permission bits or corrupt the nested header structures.
2. **Crash Prevention**: Methods like `getBufferCell` and `handleExpirationAt` now include strict bounds checking (`address < 0 || address >= this.#buffer.length`), preventing `RangeError` crashes from miscalculated addresses.
3. **Maintainability**: The complex memory layout (striders, offsets, nested child headers) is now completely hidden. If the binary format changes in the future, only `RoleBinaryWorker` needs to be updated.
4. **Controlled Debugging**: The `get buffer()` getter returns `this.#buffer.slice(0)`, providing a safe, detached copy for logging or testing without exposing the live (this Method is removed in production ), mutable reference.

---

## 📖 Method Reference & Usage

### 1. Initialization & Allocation
* **`constructor(GroupRolesName, roles)`**  
  Calls `super()` to inherit strider/compact data, then initializes `#buffer` via `#createMemorBuffer()` and records metrics.
* **`#createMemorBuffer()`** *(Private)*  
  Allocates a new `TypedArray` (e.g., `Uint32Array`) based on `totalSize`, or reuses/fills an existing one to prevent memory fragmentation.

### 2. Safe Access & Inspection (Public)
* **`get isBufferReady()`**  
  Returns `true` if the buffer is allocated. Used by `RoleBaseBuckets` to validate worker integrity before hot-swapping.
* **`get bufferLength()` / `get bufferByteLength()`**  
  O(1) read-only access to buffer dimensions for metrics and validation.
* **`getBufferCell(address)`**  
  **Safe Read:** Returns the value at `address`, or `undefined` if the address is out of bounds. *Use this instead of direct array access.*
* **`get bufferState()`**  
  Returns a metadata object: `{ size, byteSize, elementSize, type, active }`. Ideal for admin dashboards.
* **`get buffer()`**  
  Returns a **shallow copy** (`slice(0)`) of the buffer. *Strictly for debugging/testing. Do not use in the hot authorization path.*

### 3. Core Authorization & Address Calculation (Public)
* **`geteffected(GroupRoleId, parentId, parentInstanceIndex, child, childInstanceIndex, grandChild, grandChildIndex, fetchGroupRole, value)`**  
  Calculates the exact memory address for a specific resource hierarchy. If `value=true`, it returns the stored bitmask; otherwise, it returns the address integer.
* **`getNesteChilddAddress(...)`**  
  Calculates the header address for nested child structures (used to read the `childCount` and `childShift` offsets).
* **`geteffectedAccess(..., currentTimeStamp)`**  
  **The Core Engine:** Validates the role ID, traverses the hierarchy, checks instance mismatches, and evaluates TTL expiration. Returns the 32-bit effect bitmask or a `SYSTEM_STATUS` error object.

### 4. Expiration Handling (Public)
* **`handleExpirationAt(address)`**  
  **Crucial for TTL:** Safely zeroes out the TTL (offset +2) and Effects (offset +3) at the given address to permanently deny the permission. Returns the `memberId` (offset +1) so the system can track it in the `expiredBucket`. Includes strict bounds checking.

### 5. Bulk Population (Public)
* **`addRolesValuseToRowBinary()`**  
  The master compilation method. Iterates over `pTi` and the `_pathsBuffer` staging array, using the private `#setWorkerValueToAddr` and `#setWorkerValue` methods to write the entire permission matrix into `#buffer` in a single, optimized pass.

---

## 💡 Usage Examples

### ✅ Correct: Safe Inspection & Authorization
```javascript
// its need the complier stage output and begin initiaizin and manipulate the buffer 
const worker = new RoleBinaryWorker('ADMIN_ROLE', compiler);
worker.addRolesValuseToRowBinary();

// 1. Safe bounds-checked read
const roleId = worker.getBufferCell(0); 

// 2. Core authorization check (Hot Path)
const access = worker.geteffectedAccess(
    worker.groupRolesPid, 
    TYPE_IDS.COLLECTIONS, 0, 
    TYPE_IDS.DOCUMENTS, 0, 
    null, null, 
    Math.floor(Date.now() / 1000)
);

// 3. Handle Expiration (Called by AutherizationCheck)
if (access.code === SYSTEM_STATUS.PERMISSION_EXPIRED) {
    const addr = worker.geteffected(worker.groupRolesPid, /* ...params... */);
    const memberId = worker.handleExpirationAt(addr);
    RoleBaseBuckets.addToExpierdBucket(worker.groupRolesPid, memberId, childType);
}
```

### ❌ Incorrect: Direct Mutation (Now Prevented)
```javascript
// This will now fail or be ignored, protecting the system:
worker.buffer[5] = 999; // Modifies a copy, not the real buffer
worker.setWorkerValueToAddr(5, 999); // TypeError: worker.setWorkerValueToAddr is not a function
```

---
