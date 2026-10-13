# 📜 ADR: Role File Repository & Dual-Strategy Persistence

**Status:** Accepted  
**Component:** `RoleFileRepository` (`src/rbac/backup/roleFileRepository.js`)  
**Pattern:** Repository / Dual-Strategy Persistence  
**Date:** 14-10-2026

## 🎯 Context & Motivation
Persisting RBAC role definitions requires a balance between **fast individual updates** and **efficient bulk operations**. A single monolithic JSON file forces O(N) read/write cycles and introduces severe race conditions during concurrent updates. 

To solve this, we implemented a **Dual-Strategy File Repository** that separates live CRUD operations from historical logging, ensuring O(1) performance for active roles and constant-memory streaming for backups.

---

## 🏗️ The Two Strategies & When to Use Them

### 📁 Strategy 1: Dedicated Files (One file per role)
* **What it is:** Each role is saved as an individual `.json` file (e.g., `ADMIN.json`).
* **When to use:** **Primary Source of Truth.** Use this for all live CRUD operations (Create, Read, Update, Delete) via API or admin panels.
* **Why:** Guarantees **O(1)** reads, writes, and deletes. Eliminates race conditions because each role is isolated.

### 📜 Strategy 2: Bulk File (Newline-Delimited JSON / NDJSON)
* **What it is:** A single file where each line is a complete, independent JSON object (e.g., `rbac-snapshot.ndjson`).
* **When to use:** **Exports, Imports, Migrations, and Audit Logs.** Use this for nightly cron backups or seeding a new environment.
* **Why:** Append-only operations are inherently safe and fast. Streaming reads prevent Out-Of-Memory (OOM) crashes on massive files. 
* ⚠️ **Rule:** *Never rewrite this file in real-time.* If a role updates, update its Dedicated File. The bulk file is strictly an append-only historical log.

---

## ⚡ Performance & Optimizations
This class is engineered for maximum speed and safety:
1.  **O(1) File Operations:** Dedicated files bypass parsing the entire database.
2.  **OS Path Length Protection:** Role names > 100 chars are truncated and appended with a 16-char SHA-256 hash, preventing Windows `MAX_PATH` (260 char) crashes while guaranteeing uniqueness.
3.  **Constant Memory Footprint:** `streamRolesFromBulkFile` uses Node's `readline` to process massive NDJSON files line-by-line without loading them into RAM.
4.  **Early-Exit Search:** `findRoleInBulkFile` stops reading the stream the exact millisecond the target role is found, saving massive I/O time.
5.  **Graceful Directory Creation:** `#ensureDirectoryExists` safely creates nested paths without race conditions.

---

## 📖 Method Reference

### 🔹 Dedicated File Methods
| Method | Purpose | Complexity |
| :--- | :--- | :--- |
| `saveRoleToDedicatedFile` | Writes a role to its own `.json` file. | **O(1)** |
| `loadRoleFromDedicatedFile` | Reads and parses a specific role file. | **O(1)** |
| `removeRoleFromDedicatedFile` | Unlinks (deletes) a specific role file. | **O(1)** |
| `listRolesInDirectory` | Returns an array of all role names in a dir. | **O(N)** |
| `getRoleFileMetadata` | Returns file stats (size, created/modified dates).| **O(1)** |

### 🔹 Bulk File Methods
| Method | Purpose | Complexity |
| :--- | :--- | :--- |
| `appendRoleToBulkFile` | Appends a role as a single line to an NDJSON file. | **O(1)** |
| `streamRolesFromBulkFile` | Streams roles with `startLine` and `limit` pagination. | **O(N)** (Const. Memory) |
| `findRoleInBulkFile` | Streams until a specific `roleName` is found (early exit).| **O(K)** (K = position) |

---

## 💡 Usage Examples

```javascript
import { roleFileRepo } from './backup/buckup.js';

const rolesDir = './config/roles';
const backupFile = './backups/rbac-snapshot.ndjson';
const myRoleDef = { /* ... role definition ... */ };

// 1. LIVE OPERATION: Save/Update a role (Strategy 1)
await roleFileRepo.saveRoleToDedicatedFile('ADMIN', myRoleDef, rolesDir);

// 2. LIVE OPERATION: Read a role instantly
const { definition } = await roleFileRepo.loadRoleFromDedicatedFile('ADMIN', rolesDir);

// 3. BACKGROUND TASK: Append to nightly backup log (Strategy 2)
await roleFileRepo.appendRoleToBulkFile('ADMIN', myRoleDef, backupFile);

// 4. MIGRATION: Find a specific role in a massive backup file without loading it all
const { role, lineNumber } = await roleFileRepo.findRoleInBulkFile(backupFile, 'ADMIN', { limit: 5000 });
```

---

## ❓ Can this be made universal for *any* object?

**Short Answer:** Yes, but **it is not recommended** for this specific class.

**Detailed Answer:** 
Technically, you could generalize this into a `GenericFileRepository<T>` by passing a `schemaType` and `fileName` dynamically. However, doing so introduces trade-offs:
1. **Loss of Strict Typing:** RBAC roles have a strict contract (`version`, `type: "ROLE_DEFINITION"`, `roleName`, `definition`). A generic repo would lose this built-in validation.
3. **Security Risks:** RBAC data is highly sensitive. Keeping the repository explicitly named and typed for `RoleFileRepository` prevents accidental misuse (e.g., accidentally overwriting a config file with role data).

**Recommendation:** Keep this class **highly specialized for RBAC**. If you need file persistence for other entities (e.g., `UserFileRepository`), create a separate class or extract a private, generic `BaseFileRepository` utility that this class extends, keeping the RBAC-specific validation intact.
