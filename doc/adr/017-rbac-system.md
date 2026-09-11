# ADR-017: Implementation of a High-Performance Binary-Compiled RBAC Engine

- **Status:** Accepted
- **Date:** 2026-09-11
- **Deciders:** Development Team
- **Related Files:** `RBACManager.js`, `schema-parser.js`, `binary-worker.js`, `buckets.js`, `authorization.js`

## Context
Traditional Role-Based Access Control (RBAC) systems typically rely on database lookups, heavy JSON object traversals, or complex rule-engine evaluations for every single access check. In high-throughput applications, this approach introduces severe bottlenecks:
1. **Latency Spikes:** Evaluating nested JSON permissions takes milliseconds, which is unacceptable for microservices or high-frequency APIs.
2. **High Memory Overhead:** Keeping massive, unoptimized JSON role definitions in memory wastes RAM and increases Garbage Collection (GC) pressure.
3. **Database Dependency:** Checking permissions against the database for every request creates a single point of failure and limits horizontal scaling.

To resolve these issues, an ultra-fast, memory-efficient, and database-independent authorization engine was required.

## Decision
We have designed and implemented a **Binary-Compiled RBAC Engine**. Instead of evaluating raw JSON definitions at runtime, the system compiles role definitions into highly optimized binary buffers.

The core architectural pillars are:

1. **Schema Parsing & Compilation (`RoleCompiler`):** 
   - Translates human-readable JSON role definitions into a structured, normalized format.
   - Validates resource hierarchies and action mappings during the compilation phase, not at runtime.

2. **Binary Buffer Allocation (`RoleBinaryWorker`):**
   - Converts the compiled role structure into a contiguous binary buffer (`Buffer` or `Uint8Array`).
   - Maps permissions to specific bit offsets, allowing permission checks to be performed using ultra-fast bitwise operations.

3. **In-Memory Buckets (`RoleBaseBuckets`):**
   - Stores the compiled binary workers in a highly optimized, thread-safe in-memory registry.
   - Eliminates the need for database lookups during authorization checks.
   - Supports atomic "Hot-Swapping" to update roles in production without server restarts or downtime.

4. **Sub-Microsecond Authorization (`AutherizationCheck`):**
   - Evaluates access by performing direct memory reads and bitwise AND operations against the binary buffer.
   - Achieves authorization checks in less than 5 microseconds (μs).

## Consequences

### Positive
- **Extreme Performance:** Authorization checks are reduced from milliseconds to sub-microseconds, making the RBAC system virtually invisible to API latency.
- **Zero Database Dependency at Runtime:** Once roles are loaded and compiled, the database is never queried for access checks, ensuring high availability even if the DB goes down.
- **Memory Efficiency:** Binary buffers consume a fraction of the memory compared to equivalent JSON objects, reducing GC pauses.
- **Hot-Swapping Capabilities:** Roles can be updated atomically in memory, allowing dynamic permission changes without restarting the application.

### Negative / Caveats
- **Complex Compilation Phase:** The initial compilation of roles is computationally expensive. However, this is a one-time cost performed only when roles are created, updated, or loaded on boot.
- **Debugging Complexity:** Inspecting raw binary buffers is difficult for developers. The system must provide robust logging and translation tools to map binary offsets back to human-readable permissions for debugging.
- **Memory Limit on Roles:** While highly efficient, storing thousands of massive roles in memory requires careful monitoring of the server's RAM limits.

## Alternatives Considered
- **Standard JSON Evaluation:** Rejected due to high CPU usage and latency during deep object traversal.
- **Database-Level Authorization (e.g., MongoDB $lookup):** Rejected because it couples authorization logic to the database layer, introducing unacceptable network latency for every request.
- **External Policy Engines (e.g., OPA, Casbin):** Rejected to maintain absolute control over the execution environment, avoid external network calls, and achieve the specific sub-microsecond latency required for our framework.