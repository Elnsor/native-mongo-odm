Here is the Architecture Decision Record (ADR) and the corresponding brief Git commit message for the new `dbApp` class.

# ADR-012: Implementation of `dbApp` Singleton Facade for Framework Lifecycle and Initialization

- **Status:** Accepted
- **Date:** 2024-05-20
- **Deciders:** Development Team
- **Related Files:** `dbApp.js`, `server.js` (or main entry point), `CollectionManager.js`, `applicationSchemaRegistry.js`

## Context
Previously, initializing the custom MongoDB framework required developers to manually orchestrate multiple independent singleton modules in the main application file (e.g., `server.js`). This involved manually calling `connectDb()`, triggering `collectionManager.syncAllCollectionOnBoot()`, and separately registering schemas and projections. 

This approach presented several risks:
1. **Initialization Race Conditions:** Developers could accidentally attempt to access collections or schemas before the database was connected or synced.
2. **Boilerplate and Complexity:** The main entry point became cluttered with framework-specific setup logic.
3. **Unsafe Direct Access:** Exposing internal managers directly encouraged unsafe manipulation of the application state (e.g., modifying the registry cache directly).

## Decision
We have introduced the `dbApp` class, which acts as a **Singleton Facade** and the unified entry point for the entire framework. 

Key architectural decisions include:
1. **Strict Lifecycle Enforcement:** The class enforces a strict initialization sequence: `configure()` must be called before `start()`. Attempting to access resources before `start()` throws a clear `AppError`.
2. **Encapsulation of Complexity:** The `start()` method internally orchestrates the database connection, collection synchronization (`syncAllCollectionOnBoot`), and cache warming in the correct, safe order.
3. **Unified Registration API:** The `registerSchema()` method now handles both registering the schema in the `applicationSchemaRegistry` *and* pre-computing the `Projection` cache in a single, atomic operation.
4. **Safe Resource Access:** Methods like `getCollection()` and `getDatabase()` provide controlled, read-only access to underlying resources, preventing accidental mutation of the framework's internal state.
5. **Extensibility:** Exposes `registerCustomManagedBySystem()` to allow developers to safely inject custom business logic into the `SecurityRulesEngine` without importing it directly.

## Consequences

### Positive
- **Cleaner Entry Point:** The main `server.js` file is reduced to a few clean, readable lines (`dbApp.configure().start()`).
- **Fail-Fast Safety:** Prevents runtime errors caused by accessing uninitialized components by throwing explicit operational errors.
- **Improved Testability:** The `dbApp` singleton can be easily mocked or reset in testing environments, and `getStatus()` provides a clear way to assert the framework's state.
- **Reduced Coupling:** Application code no longer needs to know about `CollectionManager` or `applicationSchemaRegistry` directly; it only interacts with the `dbApp` facade.

### Negative / Caveats
- **Singleton Limitations:** As a singleton, it holds global state. Care must be taken in testing environments to ensure the instance is properly reset or mocked between test suites to avoid state leakage.
- **Learning Curve:** New developers must learn the `dbApp` API rather than directly interacting with the underlying modules, though the API is designed to be highly intuitive.

## Alternatives Considered
- **Direct Module Imports in `server.js`:** Rejected because it scatters initialization logic, increases boilerplate, and lacks lifecycle enforcement.
- **Auto-Initialization on Import:** Rejected because it hides errors, makes dependency injection for testing nearly impossible, and removes control over the startup sequence.

---

### 💻 Brief Git Commit Message

```text
feat(core): introduce dbApp singleton facade for framework lifecycle

Adds a unified entry point (`dbApp`) to manage database connection, 
schema registration, and boot synchronization. Enforces a strict 
initialization lifecycle (configure -> start) and encapsulates 
internal managers to prevent direct, unsafe manipulation of the 
framework's state.

Ref: docs/adr/014-dbapp-singleton-facade.md
```