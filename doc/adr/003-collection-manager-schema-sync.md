Here is the Architecture Decision Record (ADR) documenting the evolution of the `CollectionManager.js` file, written in standard professional English.

---

# ADR-003: Enforce Schema-First Architecture and Add Boot Synchronization in CollectionManager

- **Status:** Accepted
- **Date:** 2026-09-4
- **Deciders:** Development Team
- **Related Files:** `CollectionManager.js`, `applicatoinSchemaRegistry.js`, `projectionEngine.js`

## Context
The previous implementation of `CollectionManager` allowed physical collections to be created in MongoDB by simply passing a `SchemaValidatorObject` directly to the `createCollection` method. This approach presented several architectural risks:
1. **State Desynchronization:** A collection could be created in the database without its schema being registered in the application's in-memory `applicationSchemaRegistry`. This broke the "single source of truth" principle.
2. **Manual Schema Passing:** Developers had to manually instantiate and pass schema objects to create collections, which was redundant since the schema was already defined and registered elsewhere in the codebase.
3. **Lack of Startup Reconciliation:** There was no automated mechanism to ensure that the physical database state matched the in-memory schema registry upon application startup (e.g., after a reboot, deployment, or adding a new feature).
4. **Incomplete Cleanup:** Dropping a collection only removed it from MongoDB and the local cache, but left its registration in the `applicationSchemaRegistry`, leading to potential memory leaks or stale state.

## Decision
We have refactored `CollectionManager` to strictly enforce a **Schema-First Architecture** and introduced automated boot-time synchronization. The specific changes are:

1. **Strict Registration Enforcement:** 
   - Both `createCollection` and the new `createCollectionv1` now explicitly check `applicationSchemaRegistry.isRegister(collectionName)`. If a schema is not registered in memory first, the operation is rejected with a `CollectionError`.

2. **Introduction of `createCollectionv1`:**
   - This new method automatically fetches the schema definition directly from the `applicationSchemaRegistry`, eliminating the need to pass schema objects manually.
   - It introduces support for the `update` flag. If `true` and the collection already exists, it uses MongoDB's `collMod` command to update the native `$jsonSchema` validator without dropping the collection or losing data.

3. **Enhanced `dropCollection`:**
   - Now verifies the collection's existence before attempting to drop it, preventing unnecessary errors.
   - Crucially, it now calls `applicationSchemaRegistry.unregister(collectionName)` to ensure the in-memory registry is perfectly synchronized with the physical database state.

4. **New `syncAllCollectionOnBoot` Method:**
   - A dedicated lifecycle method designed to be called during application startup.
   - It iterates through all schemas in the `applicationSchemaRegistry`.
   - For each schema, it checks if the physical collection exists:
     - **If not:** It creates the collection with the compiled validator and indexes.
     - **If yes:** It updates the existing collection's validator using `collMod` and ensures indexes are applied.
   - It also proactively warms up the `Projection` cache and the `CollectionManager` cache for all registered schemas.

## Consequences

### Positive
- **Guaranteed Consistency:** It is now impossible to have a "ghost" collection in the database that the application framework doesn't know about, and vice versa.
- **Zero-Touch Provisioning:** New environments (or new collections added to the codebase) are automatically provisioned and synchronized on startup without requiring manual database scripts or external migration tools.
- **Safe Schema Evolution:** The `collMod` support allows for safe, non-destructive updates to validation rules as the application evolves.
- **Clean Teardown:** Dropping a collection now performs a complete cleanup across all layers (Database, Cache, and Registry).

### Negative / Caveats
- **Slightly Increased Startup Time:** The `syncAllCollectionOnBoot` process iterates through all registered schemas and performs database commands, which adds a small, fixed overhead to the application's boot sequence.
- **Strict Development Workflow:** Developers must now remember to call `registerNewCollection` (or equivalent) *before* any attempt to create or interact with a collection, otherwise the framework will throw an error.

## Alternatives Considered
- **Lazy Collection Creation:** Relying on MongoDB to create collections automatically on the first `insertOne`. *Rejected* because it bypasses the setup of native `$jsonSchema` validation and index creation, compromising data integrity.


--- 

