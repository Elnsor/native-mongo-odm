Here is the Architecture Decision Record (ADR) documenting the significant refactoring of the `Schema` and `SchemaBuilder` classes, written in standard professional English.

---

# ADR-004: Decouple Application Roles from MongoDB Validation and Enforce System Keyword Protection in Schema Builder

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** Development Team
- **Related Files:** `Schema.js`, `SchemaBuilder.js`, `frameworkConfig.js`

## Context
The previous implementation of the `Schema` and `SchemaBuilder` classes had several architectural limitations that hindered scalability, security, and performance:
1. **Mixed Concerns:** MongoDB validation rules (e.g., `bsonType`, `minLength`) and application-level security rules (e.g., `select: false`, `immutable`) were stored in the same object. This polluted the MongoDB `$jsonSchema` with application-specific metadata that the database does not understand or need.
2. **Lack of System Field Protection:** Developers could accidentally define fields with names like `createdAt`, `updatedAt`, or `version`, potentially conflicting with the framework's automatic system-managed fields.
3. **Inefficient Data Structures:** The `required` fields were stored as an `Array`, making uniqueness checks and lookups O(n) instead of O(1).
4. **Boilerplate Repetition:** Adding standard system fields (like timestamps or OCC versioning) required repetitive, manual configuration in every schema definition.

## Decision
We have fundamentally restructured the schema definition layer to enforce a strict separation of concerns, enhance security, and improve developer experience. The specific changes are:

1. **Separation of `mongoRoles` and `appRoles`:**
   - Schema properties are now explicitly split into `mongoRoles` (pure MongoDB `$jsonSchema` validation rules) and `appRoles` (application-level rules like `immutable`, `select`, `restrictedRoles`, `managedBySystem`, and `nullable`).
   - The `compileValidator()` method now intelligently extracts *only* `mongoRoles` to send to the database, keeping the database schema clean and lightweight.

2. **System Keyword Protection:**
   - Introduced a `systemKeyword` Set (populated from `frameworkConfig.schemaDefaults.coreSystemKeywords`).
   - Added the `_applyFieldRules` guardrail, which throws a `Security Exception` if a developer attempts to manually declare a reserved system field (e.g., `createdAt`), forcing them to use the dedicated system methods instead.
   - Added `addCustomSystemKeyword()` to allow dynamic extension of reserved words *before* schema population begins.

3. **Performance Optimization via `Set`:**
   - Upgraded the `required` fields storage from an `Array` to a `Set`. This guarantees absolute uniqueness and provides O(1) lookup time during validation checks.

4. **Introduction of Fluent System Modifiers:**
   - Added high-level, chainable methods to `SchemaBuilder`: `withTimestamps()`, `withVersionConcurrencyControl()`, and `deletedAtTimestamps()`. These automatically apply the correct `mongoRoles`, `appRoles`, and `frameworkConfig` defaults without manual intervention.

5. **Strict `managedBySystem` Validation at Compile Time:**
   - Enhanced `compileValidator()` to cross-reference `managedBySystem` configurations against `frameworkConfig.systemManageTypeSpecifications`. It now throws descriptive errors during schema compilation if required parameters (like `targetField` for `slugify`) are missing or of the wrong type, catching bugs before runtime.

## Consequences

### Positive
- **Cleaner Database Schemas:** MongoDB only receives relevant validation rules, reducing storage overhead and improving database-side validation performance.
- **Enhanced Security:** Accidental overwriting of critical system fields (like `version` or `deletedAt`) is now mathematically prevented at the schema definition level.
- **Better Performance:** Using `Set` for `required` fields and `systemKeyword` lookups is faster and more memory-efficient than Array operations.
- **Improved Developer Experience (DX):** Chainable methods like `.withTimestamps()` drastically reduce boilerplate code and enforce architectural consistency across all collections.
- **Fail-Fast Compilation:** Schema misconfigurations regarding system-managed types are caught during the `compileValidator` phase, not during runtime document insertion.

### Negative / Caveats
- **Increased Internal Complexity:** The `SchemaBuilder` class is now larger and more complex due to the separation of `mongoRoles` and `appRoles` and the addition of private helper methods (`#applyDefaultconfig`, `#applySystemRules`).
- **Strict Ordering Requirement:** Developers must call `addCustomSystemKeyword()` *before* defining any properties, otherwise, an error is thrown. This requires a slight shift in how custom schemas are initialized.

## Alternatives Considered
- **Keeping a Single Property Object:** Considered keeping `mongo` and `app` rules together and filtering them at runtime. *Rejected* because it makes the code harder to reason about and risks accidentally passing app-rules to the MongoDB driver.
- **Using Arrays for Required Fields:** Considered keeping the Array structure for backward compatibility. *Rejected* because the `Set` data structure is natively supported in modern JavaScript and provides superior performance and built-in uniqueness guarantees for this specific use case.

--- 

