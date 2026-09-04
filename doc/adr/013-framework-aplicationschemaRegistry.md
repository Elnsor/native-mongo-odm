
# ADR-013: Implementation of In-Memory Application Schema Registry for O(1) Resolution

- **Status:** Accepted
- **Date:** 2024-05-20
- **Deciders:** Development Team
- **Related Files:** `applicatoinSchemaRegistry.js`, `SchemaBuilder.js`, `schemaManager.js`, `dbApp.js`

## Context
In earlier iterations of the framework, schema metadata was either passed manually between modules or fetched dynamically from the MongoDB server (e.g., via `coll.options()`) during request validation. This approach introduced significant drawbacks:
1. **Performance Overhead:** Querying the database for schema rules on every single request added unnecessary network latency and I/O overhead.
2. **Tight Coupling:** Validation engines were tightly coupled to database connection states just to read static structural rules.
3. **Lack of Centralized Control:** There was no single source of truth to prevent duplicate schema definitions or to easily iterate over all registered collections for boot-time synchronization.

## Decision
We have implemented the `ApplicationSchemaRegistry` as a centralized, Singleton in-memory cache using JavaScript's native `Map` data structure. 

Key architectural decisions include:
1. **O(1) Lookup Performance:** Using a `Map` ensures that retrieving a schema by `collectionName` is a constant-time operation, drastically reducing validation latency.
2. **Strict Registration Enforcement:** The `register` method explicitly checks for existing keys and throws a `500 Framework Error` if a schema is registered twice, preventing accidental overwrites and ensuring a single source of truth.
3. **Fail-Fast Retrieval:** The `getSchema` method throws a `404 Routing Error` if a requested collection is not registered, catching configuration errors immediately rather than failing silently during database operations.
4. **Lifecycle Management:** Provides `getAllSchema()` (returning an iterator for boot-sync loops) and `unregister()` for clean teardown or hot-reloading scenarios.

## Consequences

### Positive
- **Blazing Fast Validation:** Schema rules are resolved instantly from RAM, eliminating database round-trips for metadata.
- **Decoupled Architecture:** The `schemaManager` and `SecurityRulesEngine` can operate purely on in-memory data structures, making them easier to test and reason about.
- **Predictable State:** The framework knows exactly which collections are active and configured at any given moment via `getAllSchema()`.

### Negative / Caveats
- **Memory Consumption:** Schemas are held in memory for the lifetime of the Node.js process. While negligible for typical applications (a few KB per schema), it requires awareness in environments with thousands of dynamic collections.
- **Explicit Registration Required:** Developers must remember to call `registerSchema` (or use the `dbApp` facade) before attempting to validate or query a collection, otherwise, the framework will reject the request.

## Alternatives Considered
- **Plain Object `{}` for Storage:** Considered using a standard JavaScript object. *Rejected* because `Map` provides better performance for frequent additions/removals, maintains insertion order, and has a built-in `.size` property, making it superior for registry patterns.
- **Database-First Schema Fetching:** Considered keeping the database as the primary source of truth. *Rejected* due to the unacceptable performance penalty on high-throughput endpoints.

---





