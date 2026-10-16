
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
We implement `dbApp` as a **Singleton Facade Class** that orchestrates the entire application lifecycle. It exposes a clean public API (`configure()`, `start()`, `stop()`, `registerSchema()`, etc.) and internally manages:
- Configuration validation and storage
- Dynamic module loading via `loadDirectory('./src/modules')`
- Lifecycle hook execution (before/after sets)
- Database connection and collection synchronization
- Monitoring system initialization
- Cache warming

The class is exported as both a default export and a pre-instantiated singleton (`dbAppIns`) for convenience.

## Architecture & Boot Sequence

```
┌─────────────────────────────────────────────────────────────┐
│                    dbApp.configure(config)                   │
│  - Validates and stores frameworkConfig, monitoring config  │
│  - Sets #isInitialized = true                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      dbApp.start()                           │
│  1. Initialize Monitoring System (if enabled)               │
│  2. Dynamically load all modules from ./src/modules         │
│     └─> Modules call dbAppIns.registerSchema() etc.         │
│  3. Execute all "before" hooks (#handlerBefore)             │
│  4. Connect to MongoDB (connectDb)                          │
│  5. Sync all registered schemas → create/update collections │
│  6. Execute all "after" hooks (#handlerAfter)               │
│  7. Warm up caches (if configured)                          │
│  8. Set #isStarted = true                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      dbApp.stop()                            │
│  - Close database connection (closeDb)                      │
│  - Set #isStarted = false                                   │
│  - Trigger graceful shutdown handlers                       │
└─────────────────────────────────────────────────────────────┘
```

## Usage Guide

### Basic Usage
```javascript
import { dbAppIns } from './dpApp.js';
import { frameworkConfig } from './config/frameworkConfig.js';

// 1. Configure the app
dbAppIns.configure({
  ...frameworkConfig,
  monitoring: {
    enabled: true,
    auditEnabled: true,
    maxBufferSize: 1000,
    flushIntervalMs: 5000,
    logFilePath: './audit.jsonl'
  }
});

// 2. Start the app
await dbAppIns.start();

// 3. Access database or collections
const db = dbAppIns.getDatabase();
const usersColl = dbAppIns.getCollection('users');

// 4. Stop gracefully
await dbAppIns.stop();
```

### Registering a Schema (from a module)
```javascript
// src/modules/User.js
import { dbAppIns } from '../dpApp.js';
import { SchemaBuilder } from '../framework/SchemaBuilder.js';

const userSchema = new SchemaBuilder('users')
  .string({ name: 'username', config: { required: true } })
  .withTimestamps();

dbAppIns.registerSchema('users', userSchema);
```

### Using Lifecycle Hooks
```javascript
// Register a hook that runs BEFORE DB connection
dbAppIns.registerHandlerBefore(() => {
  console.log('Loading custom middleware...');
  // Initialize custom services, load plugins, etc.
});

// Register a hook that runs AFTER collections are synced
dbAppIns.registerHandlerAfter(() => {
  console.log('Seeding initial data...');
  // Seed default roles, admin users, etc.
});
```

### Registering Custom Managed-By-System Types
```javascript
// Register a custom field generator
dbAppIns.registerCustomManagedBySystem('formatDisplayName', (doc) => {
  return `${doc.firstName} ${doc.lastName}`;
});
```

## Key Strengths
* **Singleton Pattern**: Guarantees a single source of truth for framework state across all modules
* **Strict Boot Sequence**: Enforces predictable initialization order (config → modules → hooks → DB → sync → hooks → cache)
* **Dynamic Module Loading**: Automatically discovers and loads all modules from `./src/modules` without manual imports
* **Lifecycle Hooks**: Provides `before`/`after` hooks for modular initialization without tight coupling
* **Centralized Configuration**: All framework settings flow through a single `configure()` method
* **Graceful Shutdown**: Handles SIGINT/SIGTERM signals and ensures clean resource cleanup
* **Status Introspection**: `getStatus()` provides real-time visibility into app state, registered schemas, and cached collections

---

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

