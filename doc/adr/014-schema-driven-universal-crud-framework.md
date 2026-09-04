# ADR-014: Implementation of a Schema-Driven Universal CRUD Framework with Centralized Security Engine

- **Status:** Accepted
- **Date:** 2026-08-28
- **Deciders:** Development Team
- **Related Files:** `BaseController.js`, `SchemaBuilder.js`, `SecurityRulesEngine.js`, `CollectionManager.js`, `applicatoinSchemaRegistry.js`, `universal.routes.js`, `validate.js`, `appRolesMeddlware.js`, `projectionEngine.js`

## Context
Traditional Express/MongoDB applications often suffer from severe code duplication, inconsistent security practices, and fragmented data validation. Writing separate Controllers, Routes, and Validation logic for every single resource (e.g., Users, Products, Orders) leads to:
1. **Boilerplate Overload:** Hundreds of lines of repetitive CRUD (Create, Read, Update, Delete) code.
2. **Security Inconsistencies:** Manual filtering of sensitive fields (like passwords) is easily forgotten, leading to data leaks.
3. **Concurrency & Data Integrity Issues:** Without standardized mechanisms, race conditions (lost updates) and accidental hard deletions are common.
4. **Mass Assignment Vulnerabilities:** Naive `req.body` merging allows clients to overwrite restricted fields (e.g., `isAdmin: true`) if not explicitly blocked.

To resolve these issues, a unified, framework-level approach was required to enforce strict data integrity, security, and developer efficiency out of the box.

## Decision
We have designed and implemented a **Schema-Driven Universal CRUD Framework** powered by a centralized security and validation engine. This architecture replaces traditional, resource-specific controllers with a single, dynamic `BaseController` governed by strict middleware chains and in-memory schema definitions.

The core architectural pillars are:

1. **Universal `BaseController`:** 
   - A single class handling `create`, `findAll`, `findById`, `update`, and `remove` operations.
   - Dynamically resolves the target MongoDB collection from the URL parameter (`req.params.collectionName`) or a fixed constructor argument.
   - Natively integrates **Optimistic Concurrency Control (OCC)** (via a `version` field) and **Soft Deletion** (via a `deletedAt` field) based on `frameworkConfig`.

2. **Schema-First Definition (`SchemaBuilder` + `ApplicationSchemaRegistry`):**
   - Developers define data structures using a fluent API (`SchemaBuilder`) that cleanly separates **MongoDB Validation Rules** (`mongoRoles` like `bsonType`, `minLength`) from **Application Security Rules** (`appRoles` like `immutable`, `select`, `restrictedRoles`).
   - Schemas are registered in a singleton, in-memory `Map` (`ApplicationSchemaRegistry`), providing O(1) lookup speed and eliminating the need to query the database for schema metadata.

3. **Centralized Middleware Security Chain:**
   Every mutating or reading request passes through a strict, ordered pipeline in `universal.routes.js`:
   - `tokenauth`: Verifies JWT and fetches the user with database-level projection applied.
   - `authorizeCheck`: Validates the user's role against the requested action (`read`, `write`, `update`, `delete`).
   - `validator` (`validate.js`): Fetches the current document (for updates), validates the incoming payload against the schema, and blocks any undefined/unknown fields (preventing Mass Assignment).
   - `validationCollection` (`appRolesMeddlware.js`): Executes the `SecurityRulesEngine` to enforce `immutable` checks, `restrictedRoles` access, and auto-inject `managedBySystem` values (e.g., timestamps).
   - `selectProjection`: Attaches the pre-compiled, cached projection object (hiding `select: false` fields) to `req.projection` for the database query.

4. **Automated Boot Synchronization (`CollectionManager`):**
   - The `syncAllCollectionOnBoot` method ensures that the physical MongoDB state perfectly matches the in-memory `ApplicationSchemaRegistry` on startup, creating missing collections, applying indexes, and using `collMod` to update validators without data loss.

## Consequences

### Positive
- **Massive Reduction in Boilerplate:** Adding a new resource requires only defining its `SchemaBuilder` and registering it. Zero new controller or route code is needed for standard CRUD operations.
- **Security by Default:** Mass assignment is mathematically blocked. Sensitive fields are excluded at the database query level (not just filtered in Node.js). Immutability and role-based field restrictions are enforced automatically.
- **High Performance:** In-memory schema caching and pre-compiled projections eliminate redundant database lookups and reduce JSON payload sizes.
- **Data Integrity:** OCC prevents lost updates in high-concurrency environments, and soft deletion ensures auditability and easy data recovery.

### Negative / Caveats
- **Steep Learning Curve:** New developers must understand the framework's magic (middleware chain, schema roles, dot-notation resolution) rather than reading explicit, linear controller code.
- **Strict Payload Enforcement:** The framework aggressively rejects any payload containing fields not explicitly defined in the schema. Frontend applications must be disciplined and avoid sending extraneous UI-state data in API requests.
- **Debugging Complexity:** Errors thrown deep within the `SecurityRulesEngine` or `schemaManager` require developers to trace back through the middleware chain and schema definitions rather than a simple controller file.
- **Known Minor Artifacts:** The current `BaseController.findAll` contains a legacy artifact checking `req.params.id` (which is undefined for collection-level queries) and minor typographical inconsistencies (`softDocumentDetele`, `deteledAt`) that require a follow-up cleanup commit.

## Alternatives Considered
- **Traditional Resource-Specific Controllers:** Rejected due to the high maintenance burden, code duplication, and increased risk of human error in security implementations.
- **Existing ORMs (e.g., Mongoose, Prisma):** Rejected to maintain absolute control over performance, avoid the heavy overhead of full ORMs, and leverage MongoDB's native `$jsonSchema` validation combined with our custom, highly optimized application-level rule engine.
- **Relying Solely on MongoDB `$jsonSchema`:** Rejected because the database cannot enforce application-specific logic like `restrictedRoles`, `immutable` state checks, or dynamic `managedBySystem` function execution.

---

