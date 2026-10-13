
 ### The New Class `RoleFileRepository` Class

 * RoleFileRepository
 - Handles all file I/O operations for role definitions.<br>
 - Provides two distinct strategies: Dedicated Files (one per role) and Bulk File (newline-delimited).<br>
 
**class RoleFileRepository**

* Ensures the target directory exists.<br>
**async ensureDirectoryExists(dirPath)**


* Gets the file path for a specific role in the Dedicated Files strategy.<br>
**getDedicatedFilePath(dirPath, roleName)**

-----

### STRATEGY 1: DEDICATED FILES (One file per role)
Best for: Frequent individual updates, deletions, and isolated role management.

* Saves a single role definition to its own dedicated file.<br>
**async saveRoleToDedicatedFile(roleName, roleDefinition, dirPath)**

* Lists all role names stored as dedicated files in a directory.<br>
**async listRolesInDirectory(dirPath)**

* Loads a single role definition from its dedicated file.<br>
**async loadRoleFromDedicatedFile(roleName, dirPath)**


* Gets metadata about a dedicated role file.<br>
**async getRoleFileMetadata(roleName, dirPath)**


### STRATEGY 2: BULK FILE (Newline-Delimited JSON / NDJSON)
Best for: Bulk exports, imports, migrations, and append-only logging.

* Appends a single role definition to a bulk file (one JSON object per line).<br>
**async appendRoleToBulkFile(roleName, roleDefinition, filePath, options = {})**


* Streams and reads role definitions from a bulk file with pagination control.<br>
**async streamRolesFromBulkFile(filePath, options = {})**


* Finds a specific role by name within a bulk file.<br>
**async findRoleInBulkFile(filePath, searchName, options = {})**


### 📊 Big-O Complexity Comparison: Dedicated vs. Bulk

Here is the mathematical reality of how these two approaches perform as your system scales (where **N = total number of roles**).<br>

| Operation | Strategy 1: Dedicated Files (One per role) | Strategy 2: Bulk File (NDJSON) | Winner & Why |
| :--- | :--- | :--- | :--- |
| **Save / Update** | **O(1)** <br>*(Writes exactly 1 file)* | **O(1)** <br>*(Appends to end of file)* | **Tie**. Both are incredibly fast. |
| **Delete** | **O(1)** <br>*(Unlinks 1 file instantly)* | **O(N)** <br>*(Must read entire file, filter out the role, and rewrite the whole file)* | 🏆 **Dedicated**. Deleting from the middle of a text file is inherently slow. |
| **Read Single Role** | **O(1)** <br>*(Reads exactly 1 file)* | **O(N)** <br>*(Must stream and parse line-by-line until found)* | 🏆 **Dedicated**. Direct file access beats sequential scanning. |
| **Read All Roles** | **O(N)** <br>*(Lists dir, then reads N files)* | **O(N)** <br>*(Streams N lines sequentially)* | **Tie**. Both scale linearly, but Bulk has slightly less OS overhead (1 file handle vs N). |
| **Search by Name** | **O(N)** <br>*(Must list dir and open files until match)* | **O(N)** <br>*(Must stream lines until match)* | **Tie**. Both require scanning, though Dedicated can stop after finding the right filename. |
| **Concurrency Safety** | **High** <br>*(Different files = no lock contention)* | **Low** <br>*(Multiple appends can interleave; rewrites cause race conditions)* | 🏆 **Dedicated**. Much safer for multi-threaded/async environments. |
| **Disk Space Efficiency** | **Lower** <br>*(JSON formatting + file system metadata overhead per file)* | **Higher** <br>*(No whitespace, single file metadata)* | 🏆 **Bulk**. Better for massive datasets. |

---

 🎯 Architectural Recommendation: Which to Choose?

You don't have to choose just one. The best enterprise systems use **both for different purposes**:

1. **Use Strategy 1 (Dedicated Files) as your PRIMARY working directory.**
   - *Why:* When an admin edits a role via an API, you need O(1) reads, O(1) updates, and O(1) deletes. Dedicated files make this trivial and safe.<br>
   - *Example:* `./config/roles/ADMIN.json`, `./config/roles/EDITOR.json`

2. **Use Strategy 2 (Bulk File) for EXPORTS, IMPORTS, and AUDIT LOGS.**
   - *Why:* When you need to back up the entire system, migrate to a new server, or keep a historical log of role changes, appending to a single NDJSON file is the most efficient and portable method.<br>
   - *Example:* `./backups/rbac-export-2026-10-10.ndjson`

 💡 How to use them together in `RBACManager`:
```javascript
// 1. Daily operations use Dedicated Files (Fast CRUD)
await rbacManager.saveAndRegisterRole('ADMIN', adminDef, './config/roles');

// 2. Nightly backup uses Bulk File (Fast sequential write)
const allRoles = await roleFileRepo.listRolesInDirectory('./config/roles');
for (const roleName of allRoles.roles) {
    const { definition } = await roleFileRepo.loadRoleFromDedicatedFile(roleName, './config/roles');
    await roleFileRepo.appendRoleToBulkFile(roleName, definition, './backups/daily.ndjson');
}
``` 

