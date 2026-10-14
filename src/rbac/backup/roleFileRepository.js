import { 
    writeFile, readFile, readdir, unlink, mkdir, access, stat, appendFile, constants 
} from 'fs/promises';
import { createReadStream } from 'fs';
import path, { join, resolve } from 'path';
import readline from 'readline';
import { createHash } from 'crypto';

/**
 * ### RoleFileRepository
 * Handles all file I/O operations for role definitions.
 * Provides two distinct strategies: Dedicated Files (one per role) and Bulk File (newline-delimited).
 * 
 * #### Architectural Recommendation: Which to Choose?
You don't have to choose just one. The best enterprise systems use both for different purposes:

    - Use **Strategy 1** (Dedicated Files) as your PRIMARY working directory.
        Why: When an admin edits a role via an API, you need O(1) reads, O(1) updates, and O(1) deletes. Dedicated files make this trivial and safe.
        Example: ./config/roles/ADMIN.json, ./config/roles/EDITOR.json.

    - Use **Strategy 2** (Bulk File) for EXPORTS, IMPORTS, and AUDIT LOGS.
        Why: When you need to back up the entire system, migrate to a new server, or keep a historical log of role changes, appending to a single NDJSON file is the most efficient and portable method.
        Example: ./backups/rbac-export-2026-10-10.ndjson
### For Me used it as comming below
For our specific RBAC system, I strongly recommend this hybrid approach:

    1. **Primary Source of Truth:** Use Dedicated Files **(saveRoleToDedicatedFile)** for all live CRUD operations (Create, Read, Update, Delete). It is O(1), inherently safe, and easy to manage.
    2. **Bulk File as Export/Backup Only:** Use **appendRoleToBulkFile** only when a new role is successfully created, or use a background cron job to generate a daily rbac-snapshot.ndjson file using the Atomic Rename pattern.
    3. **Never rewrite the bulk file in real-time.** If a role is **updated**, update its Dedicated File. **The bulk file is just a historical log or a bulk-import seed file**.

By treating the Bulk File as an **append-only log** rather than a mutable database,to completely **eliminate the race condition risk** while retaining the massive performance benefits of sequential disk I/O
 */
export class RoleFileRepository {
   
    /**
     * Ensures the target directory exists.
     * @param {string} dirPath - Directory path
     * @returns {Promise<void>}
     */
    async #ensureDirectoryExists(dirPath) {
        try {
            await access(dirPath, constants.F_OK);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await mkdir(dirPath, { recursive: true });
            } else {
                throw error;
            }
        }
    }

        /**
     * Gets the file path for a specific role in the Dedicated Files strategy.
     * Includes OS Path Length Protection to prevent Windows MAX_PATH (260 chars) crashes (i add this after test ).
     *  - OS Path Length Protection (Windows MAX_PATH = 260 chars)
        - If the role name is excessively long, truncate it and append a hash
        - to guarantee uniqueness while keeping the filename within safe limits.
        - the result of longe name is caped to 100 chars longe
     *
     * @param {string} dirPath - Directory path
     * @param {string} roleName - Role name
     * @returns {string} File path
     */
    #getDedicatedFilePath(dirPath, roleName) {
        let safeRoleName = roleName.replace(/[^a-zA-Z0-9_-]/g, '_');

        
        if (safeRoleName.length > 100) {
            const hash = createHash('sha256').update(roleName).digest('hex').substring(0, 16);
            safeRoleName = `${safeRoleName.substring(0, 80)}_${hash}`;
        }

        return join(dirPath, `${safeRoleName}.json`);
    }

    // =========================================================================
    // STRATEGY 1: DEDICATED FILES (One file per role)
    // Best for: Frequent individual updates, deletions, and isolated role management.
    // =========================================================================

    /**
     * Saves a single role definition to its own dedicated file.
     * @param {string} roleName - The role name
     * @param {Object} roleDefinition - The original role definition JSON
     * @param {string} dirPath - Directory to store role files
     * @returns {Promise<Object>} Result object
     */
    async saveRoleToDedicatedFile(roleName, roleDefinition, dirPath,options={}) {
        try {
            await this.#ensureDirectoryExists(dirPath);
            const filePath = this.#getDedicatedFilePath(dirPath, roleName);
            
            const roleData = {
                version: options.version || "1.0",
                type: options.type || "ROLE_DEFINITION",
                roleName: roleName,
                definition: roleDefinition,
                savedAt: new Date().toISOString()
            };

            await writeFile(filePath, JSON.stringify(roleData, null, 2), 'utf-8');

            return { success: true, message: `Saved '${roleName}' to ${filePath}`, filePath };
        } catch (error) {
            return { success: false, message: `Save failed: ${error.message}` };

        }
    }

    /**
     * Lists all role names stored as dedicated files in a directory.
     * @param {string} dirPath - Directory containing role files
     * @returns {Promise<Object>} Result object with role names
     */
    async listRolesInDirectory(dirPath) {
        try {
            await this.#ensureDirectoryExists(dirPath);
            const files = await readdir(dirPath);
            const roleFiles = files.filter(f => f.endsWith('.json'));
            const roles = roleFiles.map(f => f.replace('.json', ''));

            return { success: true, roles, totalRoles: roles.length, directory: dirPath };
        } catch (error) {
            return { success: false, message: `List failed: ${error.message}` };
        }
    }

    /**
     * Loads a single role definition from its dedicated file.
     * @param {string} roleName - The role name
     * @param {string} dirPath - Directory containing role files
     * @returns {Promise<Object>} Result object with role definition
     */
    async loadRoleFromDedicatedFile(roleName, dirPath) {
        try {
            const filePath = this.#getDedicatedFilePath(dirPath, roleName);
            const fileContent = await readFile(filePath, 'utf-8');
            const roleData = JSON.parse(fileContent);

            if (roleData.type !== "ROLE_DEFINITION") {
                return { success: false, message: `Invalid file format in ${filePath}` };
            }

            return { success: true, roleName: roleData.roleName, definition: roleData.definition, savedAt: roleData.savedAt };
        } catch (error) {
            return { success: false, message: `Load failed: ${error.message}` };
        }
    }
    /**
     * Removes a role definition from its dedicated file.
     * O(1) operation - just delete the file.
     * 
     * @param {string} roleName - The role name to remove
     * @param {string} dirPath - Directory containing role files
     * @returns {Promise<Object>} Result object
     */
    async removeRoleFromDedicatedFile(roleName, dirPath) {
        try {
            const filePath = this.#getDedicatedFilePath(dirPath, roleName);
            
            try {
                await access(filePath, constants.F_OK);
                const filec=await readdir(dirPath)
               
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return { success: false, message: `Role '${roleName}' not found in ${dirPath}` };
                }
                throw error;
            }

            await unlink(filePath);
            

            return {
                success: true,
                message: `Removed role definition '${roleName}' from ${dirPath}`,
                filePath: filePath
            };
        } catch (error) {
            return { success: false, message: `Remove failed: ${error.message}` };
        }

          
    }
    /**
     * Gets metadata about a dedicated role file.
     * @param {string} roleName - The role name
     * @param {string} dirPath - Directory containing role files
     * @returns {Promise<Object>} Result object with metadata
     */
    async getRoleFileMetadata(roleName, dirPath) {
        try {
            const filePath = this.#getDedicatedFilePath(dirPath, roleName);
            const stats = await stat(filePath);

            return {
                success: true, roleName, filePath,
                sizeBytes: stats.size, createdAt: stats.birthtime, modifiedAt: stats.mtime
            };
           
        } catch (error){
             return { success: false, message: `Metadata failed: ${error.message}`} ;
        }
    }
    

    

    // =========================================================================
    // STRATEGY 2: BULK FILE (Newline-Delimited JSON / NDJSON)
    // Best for: Bulk exports, imports, migrations, and append-only logging.
    // =========================================================================

    /**
     * Appends a single role definition to a bulk file (one JSON object per line).
     * @param {string} roleName - The role name
     * @param {Object} roleDefinition - The original role definition JSON
     * @param {string} filePath - Absolute path to the bulk file
     * @param {Object} [options] - Options (version, type)
     * @returns {Promise<Object>} Result object
     */
    async appendRoleToBulkFile(roleName, roleDefinition, filePath, options = {}) {
        try {
            const dirPath = resolve(filePath, '..');
            await this.#ensureDirectoryExists(dirPath);
            
            const roleData = {
                version: options.version || "1.0",
                type: options.type || "ROLE_DEFINITION",
                roleName: roleName,
                definition: roleDefinition,
                savedAt: new Date().toISOString()
            };

            // Append with a newline character for NDJSON format
            await appendFile(filePath, JSON.stringify(roleData) + '\n', 'utf-8');

            return { success: true, message: `Appended '${roleName}' to ${filePath}`, filePath };
        } catch (error) {
            return { success: false, message: `Append failed: ${error.message}` };
        }
    }

    /**
     * Streams and reads role definitions from a bulk file with pagination control.
     * @param {string} filePath - Path to the bulk file
     * @param {Object} [options] - Configuration options
     * @param {number} [options.startLine=1] - 1-based line number to start reading from
     * @param {number} [options.limit=Infinity] - Maximum number of lines to read
     * @returns {Promise<Object>} Result object with roles array
     */
    async streamRolesFromBulkFile(filePath, options = {}) {
        const { startLine = 1, limit = Infinity } = options;
        
        try {
            const fileStream = createReadStream(filePath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

            const roles = [];
            let lineNumber = 0;

            for await (const line of rl) {
                lineNumber++;
                if (lineNumber < startLine) continue;

                const role = JSON.parse(line);
                roles.push(role);

                if (roles.length >= limit) {
                    rl.close();
                    fileStream.destroy();
                    break;
                }
            }

            return { success: true, roles, totalRead: roles.length, filePath };
        } catch (error) {
            return { success: false, message: `Stream read failed: ${error.message}` };
        }
    }

    /**
     * Finds a specific role by name within a bulk file.
     * @param {string} filePath - Path to the bulk file
     * @param {string} searchName - The role name to find
     * @param {Object} [options] - Configuration options
     * @param {number} [options.startLine=1] - 1-based line number to start searching from
     * @param {number} [options.limit=Infinity] - Maximum number of lines to search
     * @returns {Promise<Object>} The role object if found, or null
     */
    async findRoleInBulkFile(filePath, searchName, options = {}) {
        const { startLine = 1, limit = Infinity } = options;
        
        try {
            const fileStream = createReadStream(filePath);
            const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

            let lineNumber = 0;
            let linesChecked = 0;

            for await (const line of rl) {
                lineNumber++;
                if (lineNumber < startLine) continue;

                linesChecked++;
                const role = JSON.parse(line);

             
                if (role.roleName === searchName) {
                    rl.close();
                    fileStream.destroy();
                    return { success: true, role, lineNumber };
                }

                if (linesChecked >= limit) {
                    rl.close();
                    fileStream.destroy();
                    break;
                }
            }

            return { success: true, role: null, message: `Role '${searchName}' not found` };
        } catch (error) {
            return { success: false, message: `Search failed: ${error.message}` };
        }
    }
}

export const roleFileRepo = new RoleFileRepository();