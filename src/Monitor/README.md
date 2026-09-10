
**Version:** 1.0.0  
**Last Updated:** 2026-09-10  
**Author:** Framework Core Team
---
# 📊 Monitoring System

A high-performance, production-grade monitoring and observability system built with **Ring Buffer architecture** for ultra-fast event processing, metrics collection, and audit logging.

## 🎯 Overview

The Monitoring System provides comprehensive observability for your application through three core components:

1. **SystemMonitor** - High-performance event bus using lock-free Ring Buffer (`Int32Array`)
2. **MetricsCollector** - Prometheus-style metrics (Counters, Gauges, Histograms)
3. **AuditLogger** - Batched audit trail with async persistence

## 🏗️ Architecture
```mermaid
graph TB
    A[MonitoringSystem  ] --> B[ Facade - Singleton ]
    B --> C[SystemMonitor Ring Buffer]
    B --> D[MetricsCollect]
    B --> E[ AuditLogger Batched  ]
    C --> F[- 60K events
- Lock-free 
- Batch proc]
    D --> G[- Counters  
- Gauges    
- Histograms]
    E --> I[- Buffer    
- Auto-flush
- File/DB]
      
    style C fill:#e1f5ff
    style D fill:#fff4e1
    style E fill:#f0e1ff
```

## ✨ Features

### 🔥 Performance
- **Ring Buffer**: 60,000 event capacity with O(1) enqueue/dequeue
- **Lock-free**: No mutex locks, thread-safe operations
- **Batch Processing**: Processes 500 events per batch every 100ms
- **Zero GC Pressure**: Uses `Int32Array` for minimal memory allocation

### 📈 Metrics
- **Counters**: Monotonically increasing values (e.g., request count)
- **Gauges**: Snapshots of current state (e.g., buffer size)
- **Histograms**: Distribution of values with percentiles (p50, p95, p99)

### 🔐 Audit Trail
- **Batched Writes**: Configurable buffer size (default: 1000 entries)
- **Auto-flush**: Every 5 seconds or when buffer is full
- **Flexible Persistence**: File system, database, or custom handler
- **Structured Logs**: JSON format with timestamps and metadata

##  Installation

No external dependencies required. Part of the Framework Core.

## 🚀 Quick Start

### 1. Initialize the System

```javascript
import { initializeMonitoring } from './Monitoring/monitoringSystem.js';

// Initialize with options
initializeMonitoring({
    enabled: true,              // Enable/disable monitoring
    auditEnabled: true,         // Enable audit logging
    maxBufferSize: 1000,        // Audit buffer size
    flushIntervalMs: 5000,      // Auto-flush interval
    logFilePath: './logs/audit.log'  // Audit log file path
});
```

### 2. Record Events

```javascript
import { record, auditLog } from './Monitoring/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from './Monitoring/constant/eventType.js';

// Record a counter (e.g., authentication check)
record(
    DOMAIN.RBAC_DOMAIN,
    EVENT_TYPES.RBAC_AUTH_CHECK,
    EVENT_MTYPES.METRIC_C,
    1  // increment value
);

// Record a histogram (e.g., operation duration in nanoseconds)
const startTime = performance.now();
// ... your operation ...
const durationNs = (performance.now() - startTime) * 1000000;

record(
    DOMAIN.RBAC_DOMAIN,
    EVENT_TYPES.RBAC_AUTH_CHECK,
    EVENT_MTYPES.METRIC_H,
    durationNs  // duration in nanoseconds
);

// Record audit log
auditLog(
    DOMAIN.RBAC_DOMAIN,
    'check_access',
    { userId: '123', roleId: 'ADMIN' },
    { parentId: 100, childId: 101 },
    'granted',
    { duration: 0.5, ttl: 86400 }
);
```

### 3. Get Metrics Snapshot

```javascript
import { getMetricsSnapshot } from './Monitoring/monitoringSystem.js';

const snapshot = getMetricsSnapshot();

console.log(snapshot.metrics.counters);
// { 'rbac.access.check.total': 1542 }

console.log(snapshot.metrics.histograms);
// {
//   'rbac.access.check.duration': {
//     unit: 'ns',
//     count: 1542,
//     sum: '1.234ms',
//     avg: '0.800μs',
//     min: '0.120μs',
//     max: '45.670μs',
//     p50: '0.650μs',
//     p95: '2.340μs',
//     p99: '5.120μs'
//   }
// }
```

## 📖 API Reference

### Core Functions

#### `initializeMonitoring(options)`
Initialize the monitoring system.

**Options:**
- `enabled` (boolean): Enable metrics collection (default: `true`)
- `auditEnabled` (boolean): Enable audit logging (default: `false`)
- `maxBufferSize` (number): Audit buffer size (default: `1000`)
- `flushIntervalMs` (number): Auto-flush interval (default: `5000`)
- `logFilePath` (string): Path to audit log file (default: `null`)

#### `record(domain, eventType, eventMtype, v1, v2, v3, v4)`
Record an event to the system monitor.

**Parameters:**
- `domain` (string): Event domain (e.g., `'rbac'`, `'framework'`)
- `eventType` (number): Event type constant (from `EVENT_TYPES`)
- `eventMtype` (number): Metric type (from `EVENT_MTYPES`)
- `v1-v4` (number): Event values (e.g., duration, count)

**Returns:** `boolean` - `true` if event was recorded, `false` if buffer full or disabled

#### `auditLog(domain, action, actor, resource, outcome, metadata)`
Record an audit log entry.

**Parameters:**
- `domain` (string): Event domain
- `action` (string): Action name (e.g., `'check_access'`)
- `actor` (object): Who performed the action
- `resource` (object): Resource being accessed
- `outcome` (string): Result (e.g., `'granted'`, `'denied'`)
- `metadata` (object): Additional context

#### `getMetricsSnapshot()`
Get current metrics snapshot.

**Returns:**
```javascript
{
    metrics: {
        counters: { ... },
        gauges: { ... },
        histograms: { ... }
    },
    monitor: {
        enabled: true,
        uptime: 123456,
        totalEventsEmitted: 5000,
        totalEventsProcessed: 4950,
        queueSize: 50,
        eventsPerSecond: 125.5
    },
    audit: {
        bufferSize: 23,
        totalRecorded: 1500,
        totalPersisted: 1477
    }
}
```

#### `getHealthStatus()`
Get system health status.

**Returns:**
```javascript
{
    status: 'healthy',
    enabled: true,
    auditEnabled: true,
    uptime: 123456,
    queueSize: 50,
    droppedEvents: 0,
    totalEvents: 5000
}
```

#### `shutdownMonitoring()`
Gracefully shutdown the monitoring system.

##  Event Types & Domains

### Domains
```javascript
DOMAIN = {
    RBAC_DOMAIN: 'rbac',
    ODM_DOMAIN: 'odm',
    FRAMEWORK_DOMAIN: 'framework',
    AUTH_DOMAIN: 'auth',
    DATABASE_DOMAIN: 'database'
}
```

### Metric Types
```javascript
EVENT_MTYPES = {
    METRIC_C: 0,  // Counter
    METRIC_G: 1,  // Gauge
    METRIC_H: 2   // Histogram
}
```

### RBAC Event Types (1-99)
```javascript
EVENT_TYPES = {
    // Access & Authorization (1-19)
    RBAC_AUTH_CHECK: 1,
    RBAC_AUTH_DENIED: 2,
    RBAC_AUTH_EXPIRED: 3,
    RBAC_AUTH_GRANTED: 4,
    RBAC_AUTH_WILDCARD: 5,
    
    // Compilation & Validation (20-39)
    RBAC_COMPILE_START: 20,
    RBAC_COMPILE_END: 21,
    RBAC_COMPILE_ERROR: 22,
    
    // Buffer & Memory (40-59)
    RBAC_BUFFER_CREATED: 40,
    RBAC_BUFFER_OVERFLOW: 41,
    
    // Role Lifecycle (60-79)
    RBAC_ROLE_REGISTERED: 60,
    RBAC_ROLE_INSTANTIATED: 61,
    RBAC_ROLE_HOT_SWAP: 62,
    
    // System Maintenance (90-99)
    RBAC_FLUSH_START: 90,
    RBAC_FLUSH_END: 91
}
```

## 🔧 Configuration

### Domain Configuration

Enable/disable metrics and audit per domain:

```javascript
import { setDomainConfig } from './Monitoring/monitoringSystem.js';

// Disable metrics for 'database' domain
setDomainConfig('database', false, true);

// Enable both metrics and audit for 'rbac' domain
setDomainConfig('rbac', true, true);
```

### Custom Event Handlers

Register custom handlers for specific event types:

```javascript
import { getMonitoring } from './Monitoring/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES } from './Monitoring/constant/eventType.js';

const monitoring = getMonitoring();

// Register handler for RBAC_AUTH_CHECK events
monitoring.registerHandler(
    EVENT_TYPES.RBAC_AUTH_CHECK,
    EVENT_MTYPES.METRIC_H,
    (data, collector) => {
        // data.v1 contains duration in nanoseconds
        console.log(`Auth check took ${data.v1}ns`);
        
        // Use collector to create custom metrics
        collector.increment('custom.auth.checks');
    }
);
```

## 📊 Metrics Names

See `metricsName.js` for complete list. Examples:

```javascript
METRIC_NAMES = {
    // Access Metrics
    RBAC_CHECK_TOTAL: 'rbac.access.check.total',
    RBAC_CHECK_DURATION: 'rbac.access.check.duration',
    RBAC_CHECK_DENIED: 'rbac.access.check.denied',
    
    // Compilation Metrics
    RBAC_COMPILE_COUNT: 'rbac.compiler.compile.count',
    RBAC_COMPILE_DURATION: 'rbac.compiler.compile.duration',
    
    // Buffer Metrics
    RBAC_BUFFER_SIZE: 'rbac.buffer.size',
    RBAC_BUFFER_BYTES: 'rbac.buffer.bytes'
}
```

## 🧪 Testing

### Flush Events Synchronously

For testing, force immediate processing of all pending events:

```javascript
import { getSyncMetricsSnapshot } from './Monitoring/monitoringSystem.js';

const snapshot = await getSyncMetricsSnapshot();
console.log(snapshot.metrics);
```

### Reset System

```javascript
import { MonitoringSystem } from './Monitoring/monitoringSystem.js';

MonitoringSystem.resetInstance();
```

## 🚨 Error Handling

The system handles errors gracefully:

- **Buffer Full**: Events are dropped silently (tracked in `droppedCount`)
- **Listener Errors**: Caught and logged, don't crash the system
- **Persistence Errors**: Logged to console, buffer retry on next flush

## 📈 Performance Guidelines

### Best Practices

1. **Use Counters for Frequency**: Track how often something happens
2. **Use Histograms for Duration**: Track operation latency
3. **Use Gauges for State**: Track current values (e.g., buffer size)
4. **Batch Operations**: The system automatically batches for performance
5. **Avoid Synchronous Flush**: Use `getSyncMetricsSnapshot()` only in tests

### Tuning Parameters

```javascript
initializeMonitoring({
    maxBufferSize: 5000,      // Increase for high-traffic apps
    flushIntervalMs: 2000,    // Decrease for real-time audit
    logFilePath: './logs/audit.log'
});
```

## 🔐 Security Considerations

- **Audit Logs**: Contain sensitive data - secure the log file permissions
- **PII**: Avoid logging personally identifiable information in metadata
- **Access Control**: Restrict access to metrics endpoints in production

##  Examples

### Example 1: Track API Request Latency

```javascript
import { record } from './Monitoring/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from './Monitoring/constant/eventType.js';

async function handleRequest(req, res) {
    const start = performance.now();
    
    try {
        // ... handle request ...
        
        const duration = (performance.now() - start) * 1000000; // ns
        record(
            DOMAIN.API_DOMAIN,
            EVENT_TYPES.API_RESPONSE,
            EVENT_MTYPES.METRIC_H,
            duration
        );
    } catch (error) {
        record(
            DOMAIN.API_DOMAIN,
            EVENT_TYPES.API_ERROR,
            EVENT_MTYPES.METRIC_C,
            1
        );
        throw error;
    }
}
```

### Example 2: Audit User Login

```javascript
import { auditLog } from './Monitoring/monitoringSystem.js';
import { DOMAIN } from './Monitoring/constant/eventType.js';

async function login(username, password) {
    const user = await findUser(username);
    
    if (!user || !verifyPassword(password, user.hash)) {
        auditLog(
            DOMAIN.AUTH_DOMAIN,
            'login',
            { ip: req.ip, userAgent: req.userAgent },
            { username },
            'failed',
            { reason: 'invalid_credentials' }
        );
        throw new Error('Invalid credentials');
    }
    
    auditLog(
        DOMAIN.AUTH_DOMAIN,
        'login',
        { ip: req.ip, userAgent: req.userAgent },
        { userId: user.id, username },
        'success',
        { sessionId: session.id }
    );
    
    return generateToken(user);
}
```

# 🛠️ Extending the System: Adding Custom Events and Metrics

To maintain the high performance of the Ring Buffer, the system uses a **decoupled architecture**:
1. **`EVENT_TYPES`** uses **Numeric IDs** for ultra-fast Ring Buffer insertion.
2. **`METRIC_NAMES`** uses **String Keys** (dot-notation) for human-readable metric aggregation in the `MetricsCollector`.

Follow these 5 steps to add a new monitored operation (e.g., a new "Cache Invalidation" feature).

### Step 1: Define the Numeric Event Type
Open `src/Monitoring/constant/eventType.js` and add a unique numeric ID. Group them logically to avoid collisions.

```javascript
// src/Monitoring/constant/eventType.js

export const EVENT_TYPES = {
    // ... existing events ...

    // ==========================================
    // Framework Cache Domain Events (100 - 119)
    // ==========================================
    CACHE_INVALIDATE_START: 100,
    CACHE_INVALIDATE_END: 101,
    CACHE_MISS: 102,
};
```

### Step 2: Define the String Metric Name
Open `src/Monitoring/constant/metricsName.js` and define the string key using the `[domain].[operation].[type]` convention.

```javascript
// src/Monitoring/constant/metricsName.js

export const METRIC_NAMES = {
    // ... existing metrics ...

    // ==========================================
    // Framework Core: Cache Metrics
    // ==========================================
    FRAMEWORK_CACHE_INVALIDATE_COUNT: "framework.cache.invalidate.count", // Counter
    FRAMEWORK_CACHE_INVALIDATE_DURATION: "framework.cache.invalidate.duration", // Histogram
    FRAMEWORK_CACHE_MISS_TOTAL: "framework.cache.miss.total", // Counter
};
```

### Step 3: Register the Handler (The Bridge)
You must tell the `MonitoringSystem` how to map the **Numeric Event Type** to the **String Metric Name**. Do this during your application initialization (e.g., in `app.js` or `server.js`).

```javascript
// src/app.js (or your initialization file)
import { getMonitoring } from './Monitoring/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES } from './Monitoring/constant/eventType.js';
import { METRIC_NAMES } from './Monitoring/constant/metricsName.js';

const monitoring = getMonitoring();

// 1. Map CACHE_INVALIDATE_START (Numeric) to the Counter (String)
monitoring.registerHandler(
    EVENT_TYPES.CACHE_INVALIDATE_START, 
    EVENT_MTYPES.METRIC_C, 
    (data, collector) => {
        collector.increment(METRIC_NAMES.FRAMEWORK_CACHE_INVALIDATE_COUNT);
    }
);

// 2. Map CACHE_INVALIDATE_END (Numeric) to the Histogram (String)
monitoring.registerHandler(
    EVENT_TYPES.CACHE_INVALIDATE_END, 
    EVENT_MTYPES.METRIC_H, 
    (data, collector) => {
        // data.v1 contains the duration passed from record()
        collector.observeHistogram(METRIC_NAMES.FRAMEWORK_CACHE_INVALIDATE_DURATION, data.v1, {}, 'ms');
    }
);
```

### Step 4: Emit the Event in Your Code
Now, use the `record()` helper in your actual business logic. It is extremely lightweight and non-blocking.

```javascript
// src/framework/cacheManager.js
import { record, auditLog } from '../Monitoring/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from '../Monitoring/constant/eventType.js';

export async function invalidateCache(key) {
    const start = performance.now();

    // 1. Emit Start Event (Counter)
    record(DOMAIN.FRAMEWORK_DOMAIN, EVENT_TYPES.CACHE_INVALIDATE_START, EVENT_MTYPES.METRIC_C);

    try {
        // ... your heavy cache invalidation logic ...
        await db.collection('cache').deleteOne({ key });
        
        // Optional: Record an Audit Log for sensitive operations
        auditLog(
            DOMAIN.FRAMEWORK_DOMAIN,
            'cache_invalidate',
            { userId: 'system' },
            { cacheKey: key },
            'success'
        );
    } catch (error) {
        // Handle error...
    } finally {
        // 2. Emit End Event (Histogram)
        const duration = performance.now() - start;
        record(DOMAIN.FRAMEWORK_DOMAIN, EVENT_TYPES.CACHE_INVALIDATE_END, EVENT_MTYPES.METRIC_H, duration);
    }
}
```

### Step 5: Configure Domain Toggling (Optional)
If you want the ability to turn off these specific metrics in production without changing code, configure the domain in your initialization:

```javascript
// Disable metrics for the 'framework' domain, but keep audit logs enabled
setDomainConfig('framework', false, true); 
```

---

### 💡 Best Practices for Naming
* **Counters:** End with `.total`, `.count`, `.errors`, or `.denied`.
* **Histograms:** End with `.duration`, `.latency`, or `.size`.
* **Gauges:** End with `.current`, `.active`, or `.queue_size`.
* **Always use snake_case or kebab-case** for the metric string keys to ensure compatibility with Prometheus/Grafana if you export them later.
---
## 📚 Related Documentation

- [EventType Reference](./constant/eventType.js)
- [Metrics Names](./constant/metricsName.js)
- [SystemMonitor Core](./core/systemMonitor.js)
- [MetricsCollector](./core/metricsCollector.js)
- [AuditLogger](./core/auditLogger.js)

## 🤝 Contributing

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Submit pull request

## 📄 License

Part of Framework Core - Internal Use Only





This follows the convention where documentation lives alongside the code it describes, making it easy for developers to find.

---

