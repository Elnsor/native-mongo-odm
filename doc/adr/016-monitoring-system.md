# ADR-016: Implementation of a High-Performance Ring Buffer Monitoring and Observability System

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Development Team
- **Related Files:** `monitoringSystem.js`, `systemMonitor.js`, `metricsCollector.js`, `auditLogger.js`, `eventType.js`, `metricsName.js`, `typeDef.js`

## Context
As the Framework Core and RBAC engine evolved, the need for deep, granular observability (metrics, audit trails, and health checks) became critical. However, integrating standard observability tools at the framework level introduced significant architectural challenges:

1. **Performance Overhead & GC Pressure:** Traditional logging and metrics libraries (like Winston or standard Prometheus clients) rely heavily on string interpolation, JSON serialization, and object allocation. When instrumenting high-frequency operations (e.g., RBAC `checkAccess` or deep schema validation), this causes severe Garbage Collection (GC) pauses and CPU spikes.
2. **Synchronous I/O Blocking:** Writing audit logs or metrics directly to disk or network on every event blocks the Node.js event loop, degrading overall API throughput.
3. **Fragmented Observability:** Metrics, audit trails, and system health were often handled by disparate libraries, making it difficult to correlate an internal framework event with a user-facing audit action.
4. **Lack of Domain Isolation:** There was no mechanism to dynamically toggle observability for specific subsystems (e.g., disabling heavy RBAC metrics in production while keeping them active in the `auth` domain).

To resolve these issues, a custom, ultra-low-overhead observability engine was required to instrument the framework without compromising its high-performance guarantees.

## Decision
We have designed and implemented a **High-Performance Ring Buffer Monitoring System**. This architecture replaces traditional event emitters with a lock-free, memory-efficient pipeline governed by a centralized Singleton facade.

The core architectural pillars are:

1. **Lock-Free Ring Buffer (`SystemMonitor`):**
   - Replaces standard Node.js `EventEmitter` with a pre-allocated `Int32Array` Ring Buffer (capacity: 60,000 events).
   - Event emission (`emit`) operates in **O(1) time** with **zero object allocation**, resulting in zero GC pressure.
   - Events are processed in batches (500 events per 100ms) via a background worker, ensuring the main execution thread is never blocked.

2. **Decoupled Metrics & Audit Engines (`MetricsCollector` & `AuditLogger`):**
   - **Metrics:** Aggregates data into Counters, Gauges, and Histograms (with p50, p95, p99 percentiles) using a highly optimized key-building algorithm.
   - **Audit:** Captures sensitive operational logs in an isolated buffer and persists them asynchronously in batches to disk or custom handlers, ensuring audit compliance without I/O blocking.

3. **Centralized Facade & Domain Routing (`MonitoringSystem`):**
   - Acts as the single entry point (`record()`, `auditLog()`) for the entire application.
   - Implements **Domain-Based Configuration**, allowing developers to dynamically enable/disable metrics and audits per domain (e.g., `rbac`, `auth`, `framework`) at runtime without restarting the server.

4. **Standardized Taxonomy (`eventType.js` & `metricsName.js`):**
   - Enforces a strict, dot-notation naming convention for metrics (e.g., `rbac.access.check.duration`).
   - Maps human-readable string constants to numeric IDs internally, allowing the Ring Buffer to store events as raw integers rather than heavy string objects.

## Consequences

### Positive
- **Ultra-Low Latency:** Event emission takes microseconds. The framework can now instrument deep, high-frequency loops (like RBAC binary buffer checks) without measurable performance degradation.
- **Zero Garbage Collection Pressure:** By using typed arrays (`Int32Array`) and avoiding object creation during the `emit` phase, the system prevents GC stalls during traffic spikes.
- **Non-Blocking Audit Compliance:** Audit logs are batched and written asynchronously, ensuring strict compliance requirements are met without sacrificing API response times.
- **Granular Runtime Control:** The domain routing system allows operations to toggle observability overhead on the fly, which is invaluable for debugging production issues without deploying new code.
- **Prometheus-Compatible Output:** The `MetricsCollector` snapshot format naturally aligns with Prometheus exposition formats, making future integration with external scraping agents trivial.

### Negative / Caveats
- **Pre-allocated Memory Footprint:** The Ring Buffer pre-allocates ~1.4MB of memory (60,000 events × 6 integers × 4 bytes). While negligible for a server, it is a fixed cost that cannot be garbage collected.
- **Event Loss Under Extreme Load:** If the system experiences a massive spike and the buffer reaches its 60,000 capacity before the background worker can drain it, new events are silently dropped (tracked via `droppedCount`). The system prioritizes application stability over 100% metric retention.
- **Numeric Event IDs:** To save memory in the buffer, events are stored as numeric IDs. Developers must constantly reference `eventType.js` to map these numbers back to human-readable strings when building dashboards or reading raw logs.
- **Custom Implementation Maintenance:** By building a custom Ring Buffer and batch processor instead of using a standard library, the team assumes the long-term maintenance burden of this specific concurrency logic.

## Alternatives Considered
- **Standard Node.js Loggers (Winston, Pino):** Rejected for *internal framework metrics*. While excellent for application-level logging, their string interpolation and JSON serialization overhead is too high for instrumenting operations that fire thousands of times per second.
- **Prometheus Client JS (as the sole engine):** Rejected because it lacks built-in audit logging capabilities, domain-based runtime toggling, and the specific lock-free ring buffer architecture required for our deep-framework instrumentation.
- **External APM Solutions (Datadog, New Relic):** Rejected for *internal* framework instrumentation due to high financial costs, network I/O overhead, and the inability to control the exact data emitted at the binary/buffer level. (Note: External APMs can still consume our metrics via the Prometheus-compatible snapshot endpoint).