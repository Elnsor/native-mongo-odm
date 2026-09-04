Here is the Architecture Decision Record (ADR) documenting the changes made to the `BaseController.js` file, written in standard professional English.

---

# ADR-002: Implement Optimistic Concurrency Control, Soft Deletion, and Projection in BaseController

- **Status:** Accepted
- **Date:** 2026-09-4
- **Deciders:** Development Team
- **Related Files:** `BaseController.js`, `frameworkConfig.js`

## Context
The previous implementation of `BaseController` performed naive, direct CRUD operations on the database. This approach presented several critical architectural and security risks:
1. **Race Conditions (Lost Updates):** Multiple clients could read and update the same document simultaneously, overwriting each other's changes without detection.
2. **Data Permanence:** The `remove` operation performed hard deletes, permanently destroying data and eliminating any possibility of an audit trail or data recovery.
3. **Data Leakage:** The `findAll` and `findById` operations returned the entire document, ignoring application-level schema rules (like `select: false` for passwords or salts), relying entirely on middleware to filter data later.

## Decision
We have updated the `BaseController` to leverage `frameworkConfig` to enforce enterprise-grade data integrity, security, and concurrency controls directly at the database query level. 

The specific changes implemented are:

1. **Optimistic Concurrency Control (OCC):**
   - **Create:** Automatically injects `version: 1` into new documents if `optimisticConcurrencyControl` is enabled.
   - **Update:** Reads `req.currentDoc.version` (provided by middleware), includes it in the query filter, and uses `$inc: { version: 1 }` in the update operation. If the version mismatches, the update fails (matchedCount === 0), preventing lost updates.
   - **Soft Delete:** Increments the `version` field when marking a document as deleted.

2. **Soft Deletion Support:**
   - **Remove:** Instead of `deleteOne`, the controller now checks `frameworkConfig.schemaDefaults.softDocumentDelete`. If true, it performs an `updateOne` setting `deletedAt: new Date()`.
   - **Read/Update Operations:** `findAll`, `findById`, and `update` now automatically append `deletedAt: { $exists: false }` to their query filters, ensuring soft-deleted documents are invisible to standard operations.

3. **Query-Level Projection:**
   - `findAll` and `findById` now explicitly pass `{ projection: req.projection }` to the MongoDB driver. This ensures that fields marked with `select: false` in the schema are excluded at the database level, reducing payload size and enhancing security.

## Consequences

### Positive
- **Data Integrity:** Race conditions during concurrent updates are now mathematically prevented by the OCC mechanism.
- **Auditability & Recovery:** Soft deletion preserves historical data and allows for easy un-deletion or auditing of removed records.
- **Defense in Depth:** Combining middleware validation with database-level projection and OCC creates a robust, multi-layered security model.
- **Configuration Driven:** All new behaviors are toggled via `frameworkConfig`, allowing easy adaptation for different environments or collections.

### Negative / Caveats
- **Query Complexity:** Database queries are slightly more complex due to the added filters and update operators.
- **⚠️ Critical Bug Identified in `findAll`:** The new `findAll` method contains a copy-paste artifact: `if(!ObjectId.isValid(req.params.id))`. Since `findAll` operates on a collection level (e.g., `GET /users`), `req.params.id` will be `undefined`, causing this check to always fail and throw a 400 error. **This specific block of code must be removed from `findAll` in the next immediate commit.**

## Alternatives Considered
- **Pessimistic Locking:** Considered using MongoDB distributed locks, but rejected due to the high performance overhead and complexity compared to the lightweight OCC approach.
- **Middleware-Only Projection:** Considered relying solely on the `projectionMeddleware` to strip fields from the response. Rejected because fetching sensitive data (like password hashes) from the database and stripping it in Node.js wastes memory and network I/O. Database-level projection is more efficient and secure.

--- 

