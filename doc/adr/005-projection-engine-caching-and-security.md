Here is the Architecture Decision Record (ADR) documenting the design and implementation of the `Projection` engine, written in standard professional English.

---

# ADR-005: Implement Static Caching and Database-Level Projection Engine for Data Security

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Development Team
- **Related Files:** `projectionEngine.js`, `projectionMeddleware.js`, `SchemaBuilder.js`

## Context
In traditional application architectures, sensitive fields (like `passwordHash`, `salt`, or internal metadata) are often fetched from the database and then manually stripped out in the application layer (e.g., Node.js controllers) before being sent to the client. This approach presents several critical issues:
1. **Security Risk:** It relies on developers remembering to filter sensitive data in every single endpoint. A single oversight results in data leakage.
2. **Performance Overhead:** Fetching large, sensitive fields from the database consumes unnecessary network I/O, database memory, and Node.js processing power, only to discard the data immediately.
3. **Code Duplication:** Manually defining projection objects (e.g., `{ password: 0, salt: 0 }`) in every query leads to repetitive, error-prone code.

## Decision
We have implemented a dedicated, static `Projection` engine that translates application-level schema rules (`appRoles.select: false`) into native MongoDB projection syntax at the database query level. 

The specific architectural decisions are:
1. **Static In-Memory Caching:** The engine uses a `static Map` to cache the compiled projection object for each collection. This ensures that the schema parsing logic runs exactly *once* per collection (during registration or first access), providing O(1) lookup time for all subsequent requests.
2. **Database-Level Exclusion:** By generating a projection object like `{ "accountInfo.password": 0 }` and passing it directly to the MongoDB driver's `find` or `findOne` methods, we guarantee that sensitive data is **never transmitted** from the database to the Node.js application.
3. **Middleware Integration:** The `selectProjection` middleware automatically retrieves the cached projection for the requested collection and attaches it to `req.projection`, seamlessly integrating with the `BaseController` without requiring manual intervention in the controllers.

## Consequences

### Positive
- **Zero-Trust Data Security:** Sensitive fields are mathematically guaranteed to be excluded at the database level, eliminating the risk of accidental data leakage in API responses.
- **Optimal Performance:** Reduces network payload size between MongoDB and Node.js, and decreases memory allocation in the application layer. The static cache ensures near-zero overhead during request processing.
- **Developer Experience (DX):** Developers only need to declare `select: false` once in the `SchemaBuilder`. The framework handles the rest automatically across all CRUD operations.
- **Native Dot-Notation Support:** The engine correctly formats nested fields (e.g., `"accountInfo.password": 0`), which the MongoDB native driver fully supports for precise field exclusion.

### Negative / Caveats
- **Runtime Schema Mutation Complexity:** If the `frameworkConfig.cache.allowRuntimeSchemaMutation` is used to alter a schema's `select` rules on the fly, the `Projection.cache` must be explicitly cleared (e.g., `Projection.cache.delete(collectionName)`), otherwise the middleware will continue to serve the stale, cached projection.
- **Read-Only Nature:** This engine is designed specifically for *excluding* fields (`0`). It does not currently support dynamic *inclusion* whitelists (`1`) based on user roles, which would require a more complex, request-aware projection builder.

## Alternatives Considered
- **Application-Level Filtering (Post-Processing):** Fetching the full document and using `delete doc.accountInfo.password` before sending the response. *Rejected* due to the high security risk of human error and the unnecessary performance cost of transmitting and parsing unwanted data.
- **MongoDB Views:** Creating read-only database views that exclude sensitive columns. *Rejected* because it fragments schema management, makes dynamic updates difficult, and adds unnecessary complexity to the database administration layer.

--- 

