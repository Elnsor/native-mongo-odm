# ADR-008: Enhance Schema Validation Engine with In-Memory Registry, Dot-Notation Support, and Strict Mass Assignment Protection

- **Status:** Accepted
- **Date:** 2026-08-30
- **Deciders:** Development Team
- **Related Files:** `schemaManager.js`, `applicationSchemaRegistry.js`, `frameworkConfig.js`

## Context
The previous iteration of the `SchemaValidationMananger` had several architectural limitations that hindered security, performance, and developer experience:
1. **Database Dependency for Schema:** It relied solely on fetching the schema from MongoDB's `coll.options()`. This meant it was unaware of application-level rules (`appRoles` like `select`, `immutable`, `restrictedRoles`) and incurred unnecessary network I/O.
 is an Array, resulting in O(n) lookup times for required field checks.
3. **Flat Structure Limitation:** The validation logic iterated over the *incoming payload's keys*, making it incapable of natively understanding or validating deeply nested fields via dot-notation (e.g., `accountInfo.email`).
4. **Mass Assignment Vulnerability:** While it checked if a field existed in the schema, it did not explicitly and aggressively block payloads containing entirely unknown, undefined structural fields, leaving a potential attack surface.
5. **Limited Type Validation:** The `formatValue` function was overly simplistic, lacking support for complex types (Arrays, Binary data) and granular constraints (min/max length, patterns, unique items).

## Decision
We have completely refactored the `SchemaValidationMananger` into a robust, high-performance, and security-first validation engine. The specific architectural changes are:

1. **Dual-Source Schema Loading (In-Memory Priority):** 
   - Introduced `loadRegisterdSchema()`. The `getSchema()` method now checks `frameworkConfig.schemaDefaults.autoLoadingRegisterSchema`. If true, it fetches the schema directly from the `applicationSchemaRegistry`, providing instant O(1) access to both `mongoRoles` and `appRoles` without hitting the database.

2. **Comprehensive `formatValue` Engine:**
   - Upgraded to support complex BSON types: `binData` (with Buffer/Uint8Array handling), `object`, and `array` (with recursive item validation, `minItems`, `maxItems`, and `uniqueItems`).
   - Added granular numeric constraints (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`).
   - Integrated `frameworkConfig.schemaDefaults.autoTrimStrings` to automatically sanitize string inputs.

3. **Dot-Notation Path Resolution:**
   - Introduced `_getNestedValue` and `_setNestedValue` helper methods. This allows the engine to accurately read from and write to deeply nested object paths (e.g., `publicInfo.displayName`) without requiring flattened payload structures.

4. **Inversion of Control in `validateDocument`:**
   - The validation loop now iterates over the **schema blueprint** (`schemaBlueprintKey`), not the incoming payload. This ensures that only explicitly defined fields are processed.
   - Upgraded `required` field storage from an `Array` to a `Set`, enabling O(1) lookup performance via `schemaRequired.has(fieldName)`.

5. **Strict Mass Assignment Prevention:**
   - Implemented a `docSet` tracking mechanism. It records all root keys from the incoming payload and deletes them as they are validated. 
   - **Security Gate:** After the loop, if `docSet.size > 0`, the engine throws a `Security Exception: Direct modification of undefined structural fields [...] is blocked.` This mathematically guarantees that no rogue or unexpected fields can sneak into the database.

## Consequences

### Positive
- **Enterprise-Grade Security:** The strict `docSet` check completely neutralizes Mass Assignment attacks, ensuring clients can only submit fields explicitly defined in the schema.
- **Blazing Fast Performance:** Prioritizing the in-memory `applicationSchemaRegistry` eliminates database round-trips for schema retrieval during validation, significantly reducing latency.
- **Rich, Expressive Validation:** Developers can now define complex, nested schemas with granular constraints (e.g., unique arrays, binary limits, regex patterns) that are strictly enforced before the data ever reaches MongoDB.
- **Clean Sanitized Output:** The use of `_setNestedValue` guarantees that the returned `sanitizerDoc` contains *only* validated, correctly typed, and formatted data, stripped of any malicious or extraneous payload noise.

### Negative / Caveats
- **Stricter Payload Requirements:** Clients sending extra, undefined fields (even if harmless) will now receive a `400 Security Exception`. While this is a security feature, frontend developers must ensure their API calls are clean and do not send unnecessary UI-state data.
- **Increased Code Complexity:** The validation engine is now significantly larger and more complex due to the support for recursive array validation, dot-notation traversal, and dual-source schema loading.

## Alternatives Considered
- **Silent Dropping of Unknown Fields:** Considered simply ignoring extra fields in the payload instead of throwing an error. *Rejected* because silent failure can mask frontend bugs or malicious probing attempts. Explicit rejection (Fail-Fast) is a safer and more transparent architectural choice.
- **Relying Solely on MongoDB `$jsonSchema`:** Considered removing application-level validation entirely. *Rejected* because MongoDB cannot enforce application-specific rules (like `restrictedRoles` or `immutable`), nor can it provide the fast, descriptive error messages required for a good developer/user experience.

--- 

