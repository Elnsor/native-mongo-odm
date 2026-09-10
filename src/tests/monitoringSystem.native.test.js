// tests/monitoring/monitoringSystem.test.js
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { 
    MonitoringSystem, 
    initializeMonitoring, 
    getMonitoring, 
    record, 
    auditLog,
    getMetricsSnapshot,
    getMonitoringHealthStatus,
    shutdownMonitoring,
    getEventsHandler,
    getSyncMetricsSnapshot,
    setDomainConfig
   
} from '../Monitor/monitoringSystem.js';
import { SystemMonitor } from '../Monitor/core/systemMonitor.js';

describe('MonitoringSystem', () => {
    let system;

    beforeEach(() => {
        // Reset singleton before each test
        SystemMonitor.resetInstance();
        MonitoringSystem.resetInstance?.();
        system = MonitoringSystem.getInstance();
    });

    afterEach(() => {
        // if (system?.shutdown) {
        //     system.shutdown();
        // }
      
        system.setDomainConfig("rbac",true,true);
        system.setDomainConfig("framework",true,true);
        
          system.setDomainConfig("global",true,true);
          system.setDomainConfig("auth",true,true);
          system.setDomainConfig("database",true,true);
    });

    // ==========================================================================
    // 1. SINGLETON PATTERN TESTS
    // ==========================================================================
    describe('Singleton Pattern', () => {
        test('should return the same instance', () => {
            const instance1 = MonitoringSystem.getInstance();
            const instance2 = MonitoringSystem.getInstance();
            assert.strictEqual(instance1, instance2);
        });

        test('should return same instance via getMonitoring()', () => {
            const instance1 = getMonitoring();
            const instance2 = getMonitoring();
            assert.strictEqual(instance1, instance2);
        });

        test('getMonitoring() should return MonitoringSystem.getInstance()', () => {
            const instance1 = MonitoringSystem.getInstance();
            const instance2 = getMonitoring();
            assert.strictEqual(instance1, instance2);
        });
    });

    // ==========================================================================
    // 2. INITIALIZE TESTS
    // ==========================================================================
    describe('initialize()', () => {
        test('should initialize with default options', () => {
            const result = system.initialize();
            assert.strictEqual(result, system);
            assert.strictEqual(system.isEnabled, true);
            assert.strictEqual(system.isAuditEnabled, false);
        });

        test('should initialize with enabled=true', () => {
            system.initialize({ enabled: true });
            assert.strictEqual(system.isEnabled, true);
            assert.ok(system.monitor.isEnabled());
        });

        test('should initialize with enabled=false', () => {
            system.initialize({ enabled: false });
            assert.strictEqual(system.isEnabled, false);
            assert.ok(!system.monitor.isEnabled());
        });

        test('should initialize with auditEnabled=true', () => {
            system.initialize({ auditEnabled: true });
            assert.strictEqual(system.isAuditEnabled, true);
            assert.ok(system.audit !== null);
        });

        test('should initialize with auditEnabled=false', () => {
            system.initialize({ auditEnabled: false });
            assert.strictEqual(system.isAuditEnabled, false);
            assert.strictEqual(system.audit, null);
        });

        test('should initialize with custom options', () => {
            system.initialize({
                enabled: true,
                auditEnabled: true,
                maxBufferSize: 500,
                flushIntervalMs: 10000
            });
            assert.strictEqual(system.isEnabled, true);
            assert.strictEqual(system.isAuditEnabled, true);
        });

        test('should return this for chaining', () => {
            const result = system.initialize({ enabled: true });
            assert.strictEqual(result, system);
        });

        test('should initialize default domains', () => {
            system.initialize();
            const domains = system.domains;
            assert.ok(domains.global);
            assert.ok(domains.rbac);
            assert.ok(domains.framework);
            assert.ok(domains.auth);
            assert.ok(domains.database);
        });
    });

    // ==========================================================================
    // 3. DOMAIN CONFIG TESTS
    // ==========================================================================
    describe('Domain Configuration', () => {
        beforeEach(() => {
            system.initialize({ enabled: true });
        });

        test('setDomainConfig should update existing domain', () => {
            system.setDomainConfig('rbac', false, true);
            const config = system.getDomainConfig('rbac');
            assert.strictEqual(config.metrics, false);
            assert.strictEqual(config.audit, true);
        });

        test('setDomainConfig should create new domain if not exists', () => {
            system.setDomainConfig('custom_domain', true, false);
            const config = system.getDomainConfig('custom_domain');
            assert.strictEqual(config.metrics, true);
            assert.strictEqual(config.audit, false);
        });

        test('setDomainConfig should update only metrics if audit is undefined', () => {
            system.setDomainConfig('rbac', false, undefined);
            const config = system.getDomainConfig('rbac');
            assert.strictEqual(config.metrics, false);
            assert.strictEqual(config.audit, true); // unchanged
        });

        test('setDomainConfig should update only audit if metrics is undefined', () => {
            system.setDomainConfig('rbac', undefined, false);
            const config = system.getDomainConfig('rbac');
            assert.strictEqual(config.metrics, true); // unchanged
            assert.strictEqual(config.audit, false);
        });

        test('getDomainConfig should return global for unknown domain', () => {
            const config = system.getDomainConfig('unknown_domain');
            const globalConfig = system.getDomainConfig('global');
            assert.deepStrictEqual(config, globalConfig);
        });

        test('getDomainConfig should return correct config for existing domain', () => {
            const config = system.getDomainConfig('rbac');
            assert.ok(config.hasOwnProperty('metrics'));
            assert.ok(config.hasOwnProperty('audit'));
        });

        test('domains getter should return all domains', () => {
            const domains = system.domains;
            assert.ok(domains.global);
            assert.ok(domains.rbac);
            assert.ok(domains.framework);
        });
    });

    // ==========================================================================
    // 4. REGISTER HANDLER TESTS
    // ==========================================================================
    describe('registerHandler()', () => {
        test('should register handler for event type', () => {
            const handler = () => {};
            system.registerHandler(1, 0, handler);
            
            const handlers = system.getRegisterdHandler();
            assert.ok(handlers);
        });

        test('should register multiple handlers for same event', () => {
            const handler1 = () => {};
            const handler2 = () => {};
            
            system.registerHandler(1, 0, handler1);
            system.registerHandler(1, 0, handler2);
            
            const handlers = system.getRegisterdHandler();
            assert.ok(handlers);
        });

        test('should register handlers for different mtypes', () => {
            const handler1 = () => {};
            const handler2 = () => {};
            
            system.registerHandler(1, 0, handler1);
            system.registerHandler(1, 1, handler2);
            
            const handlers = system.getRegisterdHandler();
            assert.ok(handlers);
        });

        test('should register handlers for different event types', () => {
            const handler1 = () => {};
            const handler2 = () => {};
            
            system.registerHandler(1, 0, handler1);
            system.registerHandler(2, 0, handler2);
            
            const handlers = system.getRegisterdHandler();
            assert.ok(handlers);
        });

        test('should be idempotent (same handler registered twice)', () => {
            const handler = () => {};
            system.registerHandler(1, 0, handler);
            system.registerHandler(1, 0, handler);
            
            const handlers = system.getRegisterdHandler();
            assert.ok(handlers);
        });
    });

    // ==========================================================================
    // 5. RECORD TESTS (with Domain Support)
    // ==========================================================================
    describe('record()', () => {
        test('should return false when system is disabled', () => {
            system.initialize({ enabled: false });
            const result = system.record('rbac', 1, 0, 100);
            assert.strictEqual(result, false);
        });

        test('should return false when domain metrics are disabled', () => {
            system.initialize({ enabled: true });
            system.setDomainConfig('rbac', false, true);
            
            const result = system.record('rbac', 1, 0, 100);
            assert.strictEqual(result, false);
        });

        test('should record event when enabled and domain is enabled', () => {
            system.initialize({ enabled: true });
            system.setDomainConfig('rbac', true, true);
            
            const result = system.record('rbac', 1, 0, 100);
            assert.strictEqual(result, true);
        });

        test('should fallback to global domain for unknown domain', () => {
            system.initialize({ enabled: true });
            // global is enabled by default
            const result = system.record('unknown_domain', 1, 0, 100);
            assert.strictEqual(result, true);
        });

        test('should not record when global domain is disabled', () => {
            system.initialize({ enabled: true });
            system.setDomainConfig('global', false, false);
            
            const result = system.record('unknown_domain', 1, 0, 100);
            assert.strictEqual(result, false);
        });

        test('should record event with default values', () => {
            system.initialize({ enabled: true });
            const result = system.record('rbac', 1, 0);
            assert.strictEqual(result, true);
        });

        test('should record event with all v1-v4 values', () => {
            system.initialize({ enabled: true });
            const result = system.record('rbac', 1, 0, 100, 200, 300, 400);
            assert.strictEqual(result, true);
        });

        test('should isolate domains (rbac disabled, framework enabled)', () => {
            system.initialize({ enabled: true });
            system.setDomainConfig('rbac', false, true);
            system.setDomainConfig('framework', true, true);
            
            const rbacResult = system.record('rbac', 1, 0, 100);
            const frameworkResult = system.record('framework', 100, 0, 200);
            
            assert.strictEqual(rbacResult, false);
            assert.strictEqual(frameworkResult, true);
        });

        test('should handle domain toggling at runtime', () => {
            system.initialize({ enabled: true });
            system.setDomainConfig('rbac', true, true);
            
            // First record should work
            let result = system.record('rbac', 1, 0, 100);
            assert.strictEqual(result, true);
            
            // Disable domain
            system.setDomainConfig('rbac', false, true);
            
            // Second record should fail
            result = system.record('rbac', 1, 0, 200);
            assert.strictEqual(result, false);
            
            // Re-enable domain
            system.setDomainConfig('rbac', true, true);
            
            // Third record should work
            result = system.record('rbac', 1, 0, 300);
            assert.strictEqual(result, true);
        });
    });

    // ==========================================================================
    // 6. AUDIT TESTS (with Domain Support)
    // ==========================================================================
    describe('auditLog()', () => {
        test('should return false when audit is disabled', () => {
            system.initialize({ auditEnabled: false });
            const result=system.auditLog('rbac', 'test_action', {}, {}, 'success');
            assert.strictEqual(result,false);
            // Should not throw
        });

        test('should return false when domain audit is disabled', () => {
            system.initialize({ auditEnabled: true });
            system.setDomainConfig('rbac', true, false);
            
            const result=system.auditLog('rbac', 'test_action', {}, {}, 'success');
            assert.strictEqual(result,false);
            // Should not throw
        });

        test('should log when audit and domain audit are enabled', () => {
            system.initialize({ auditEnabled: true });
            system.setDomainConfig('rbac', true, true);
            
            system.auditLog('rbac', 'test_action', { id: 1 }, { resource: 'user' }, 'success');
            
            const stats = system.audit.getStats();
            assert.strictEqual(stats.totalRecorded, 1);
        });

        test('should fallback to global for unknown domain', () => {
            system.initialize({ auditEnabled: true });
            
            system.auditLog('unknown_domain', 'test_action', {}, {}, 'success');
            
            const stats = system.audit.getStats();
            assert.strictEqual(stats.totalRecorded, 1);
        });

        test('should isolate audit domains', () => {
            system.initialize({ auditEnabled: true });
            system.setDomainConfig('rbac', true, false);
            system.setDomainConfig('framework', true, true);
            
            system.auditLog('rbac', 'test_action', {}, {}, 'success');
            system.auditLog('framework', 'test_action', {}, {}, 'success');
            
            const stats = system.audit.getStats();
            assert.strictEqual(stats.totalRecorded, 1); // only framework
        });
    });

    // ==========================================================================
    // 7. METRICS SNAPSHOT TESTS
    // ==========================================================================
    describe('getMetricsSnapshot()', () => {
        test('should return snapshot with correct structure', () => {
            system.initialize({ enabled: true });
            const snapshot = system.getMetricsSnapshot();
            
            assert.ok(snapshot.hasOwnProperty('metrics'));
            assert.ok(snapshot.hasOwnProperty('monitor'));
            assert.ok(snapshot.hasOwnProperty('audit'));
        });

        test('should include metrics from collector', () => {
            system.initialize({ enabled: true });
            const snapshot = system.getMetricsSnapshot();
            
            assert.ok(snapshot.metrics.hasOwnProperty('counters'));
            assert.ok(snapshot.metrics.hasOwnProperty('gauges'));
            assert.ok(snapshot.metrics.hasOwnProperty('histograms'));
        });

        test('should include monitor stats', () => {
            system.initialize({ enabled: true });
            const snapshot = system.getMetricsSnapshot();
            
            assert.ok(snapshot.monitor.hasOwnProperty('enabled'));
            assert.ok(snapshot.monitor.hasOwnProperty('uptime'));
        });

        test('should return null for audit when audit is disabled', () => {
            system.initialize({ enabled: true, auditEnabled: false });
            const snapshot = system.getMetricsSnapshot();
            
            assert.strictEqual(snapshot.audit, null);
        });

        test('should include audit stats when audit is enabled', () => {
            system.initialize({ enabled: true, auditEnabled: true });
            const snapshot = system.getMetricsSnapshot();
            
            assert.ok(snapshot.audit !== null);
            assert.ok(snapshot.audit.hasOwnProperty('bufferSize'));
        });
    });

    // ==========================================================================
    // 8. SYNC METRICS SNAPSHOT TESTS
    // ==========================================================================
    describe('getSyncMetricsSnapshot()', () => {
        test('should flush pending events before snapshot', async () => {
            system.initialize({ enabled: true });
            
            // Register a handler
            let handlerCalled = false;
            system.registerHandler(1, 0, () => {
                handlerCalled = true;
            });
            
            // Record event
            system.record('rbac', 1, 0, 100);
            
            // Get sync snapshot
            const snapshot = await system.getSyncMetricsSnapshot();
            
            assert.ok(snapshot);
            assert.ok(snapshot.hasOwnProperty('metrics'));
        });

        test('should process all pending events', async () => {
            system.initialize({ enabled: true });
            
            // Record multiple events
            for (let i = 0; i < 10; i++) {
                system.record('rbac', 1, 0, i);
            }
            
            const snapshot = await system.getSyncMetricsSnapshot();
            assert.ok(snapshot.monitor.totalEventsProcessed >= 0);
        });
    });

    // ==========================================================================
    // 9. HEALTH STATUS TESTS
    // ==========================================================================
    describe('getHealthStatus()', () => {
        test('should return health status with correct structure', () => {
            system.initialize({ enabled: true });
            const status = system.getHealthStatus();
            
            assert.ok(status.hasOwnProperty('status'));
            assert.ok(status.hasOwnProperty('enabled'));
            assert.ok(status.hasOwnProperty('auditEnabled'));
            assert.ok(status.hasOwnProperty('uptime'));
            assert.ok(status.hasOwnProperty('queueSize'));
            assert.ok(status.hasOwnProperty('droppedEvents'));
            assert.ok(status.hasOwnProperty('totalEvents'));
        });

        test('should return healthy status', () => {
            system.initialize({ enabled: true });
            const status = system.getHealthStatus();
            
            assert.strictEqual(status.status, 'healthy');
        });

        test('should reflect enabled state', () => {
            system.initialize({ enabled: true });
            const status = system.getHealthStatus();
            
            assert.strictEqual(status.enabled, true);
        });

        test('should reflect auditEnabled state', () => {
            system.initialize({ enabled: true, auditEnabled: true });
            const status = system.getHealthStatus();
            
            assert.strictEqual(status.auditEnabled, true);
        });

        test('should include domains configuration', () => {
            system.initialize({ enabled: true });
            const status = system.getHealthStatus();
            
            assert.ok(status.hasOwnProperty('domains'));
            assert.ok(status.domains.hasOwnProperty('global'));
            assert.ok(status.domains.hasOwnProperty('rbac'));
        });

        test('should track uptime', async () => {
            system.initialize({ enabled: true });
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const status = system.getHealthStatus();
            assert.ok(status.uptime >= 50);
        });

        test('should track total events', () => {
            system.initialize({ enabled: true });
            
            system.record('rbac', 1, 0, 100);
            system.record('rbac', 1, 0, 200);
            
            const status = system.getHealthStatus();
            assert.strictEqual(status.totalEvents, 2);
        });
    });

    // ==========================================================================
    // 10. SHUTDOWN TESTS
    // ==========================================================================
    describe('shutdown()', () => {
        test('should disable monitor on shutdown', async () => {
            system.initialize({ enabled: true });
            await system.shutdown();
            
            assert.strictEqual(system.isEnabled, false);
            assert.ok(!system.monitor.isEnabled());
        });

        test('should flush audit logs on shutdown', async () => {
            system.initialize({ enabled: true, auditEnabled: true });
            
            system.auditLog('rbac', 'test_action', {}, {}, 'success');
            await system.shutdown();
            
            const stats = system.audit.getStats();
            assert.strictEqual(stats.isTimerRunning, false);
        });

        test('should handle shutdown when audit is null', async () => {
            system.initialize({ enabled: true, auditEnabled: false });
            await system.shutdown();
            
            assert.strictEqual(system.isEnabled, false);
        });

        test('should be safe to call multiple times', async () => {
            system.initialize({ enabled: true });
            await system.shutdown();
            await system.shutdown();
            
            assert.strictEqual(system.isEnabled, false);
        });
    });

    // ==========================================================================
    // 11. GETTERS TESTS
    // ==========================================================================
    describe('Getters', () => {
        test('monitor getter should return SystemMonitor instance', () => {
            system.initialize({ enabled: true });
            assert.ok(system.monitor);
            assert.ok(system.monitor instanceof SystemMonitor);
        });

        test('collector getter should return MetricsCollector instance', () => {
            system.initialize({ enabled: true });
            assert.ok(system.collector);
        });

        test('audit getter should return null when disabled', () => {
            system.initialize({ auditEnabled: false });
            assert.strictEqual(system.audit, null);
        });

        test('audit getter should return AuditLogger when enabled', () => {
            system.initialize({ auditEnabled: true });
            assert.ok(system.audit);
        });

        test('isEnabled getter should reflect state', () => {
            system.initialize({ enabled: true });
            assert.strictEqual(system.isEnabled, true);
            
            system.initialize({ enabled: false });
            assert.strictEqual(system.isEnabled, false);
        });

        test('isAuditEnabled getter should reflect state', () => {
            system.initialize({ auditEnabled: true });
            assert.strictEqual(system.isAuditEnabled, true);
        });

        test('domains getter should return domains object', () => {
            system.initialize({ enabled: true });
            const domains = system.domains;
            assert.ok(typeof domains === 'object');
        });
    });

    // ==========================================================================
    // 12. HELPER FUNCTIONS TESTS
    // ==========================================================================
    describe('Helper Functions', () => {
        test('initializeMonitoring should initialize singleton', () => {
            const result = initializeMonitoring({ enabled: true });
            assert.ok(result);
            assert.strictEqual(result.isEnabled, true);
        });

        test('getMonitoring should return singleton instance', () => {
            const instance1 = getMonitoring();
            const instance2 = getMonitoring();
            assert.strictEqual(instance1, instance2);
        });

        test('record helper should call system.record', () => {
            initializeMonitoring({ enabled: true });
            const result = record('rbac', 1, 0, 100);
            assert.strictEqual(result, true);
        });

        test('record helper should respect domain config', () => {
            initializeMonitoring({ enabled: true });
            setDomainConfig('rbac', false, true);
            
            const result = record('rbac', 1, 0, 100);
            assert.strictEqual(result, false);
        });

        test('audit helper should call system.audit', () => {
            initializeMonitoring({ enabled: true, auditEnabled: true });
            auditLog('rbac', 'test_action', {}, {}, 'success');
            
            const system = getMonitoring();
            const stats = system.audit.getStats();
            assert.strictEqual(stats.totalRecorded, 1);
        });

        test('getMetricsSnapshot helper should return snapshot', () => {
            initializeMonitoring({ enabled: true });
            const snapshot = getMetricsSnapshot();
            
            assert.ok(snapshot);
            assert.ok(snapshot.hasOwnProperty('metrics'));
        });

        test('getMonitoringHealthStatus helper should return status', () => {
            initializeMonitoring({ enabled: true });
            const status = getMonitoringHealthStatus();
            
            assert.ok(status);
            assert.strictEqual(status.status, 'healthy');
        });

        test('getEventsHandler helper should return handlers', () => {
            initializeMonitoring({ enabled: true });
            const handlers = getEventsHandler();
            
            assert.ok(handlers);
        });

        test('getSyncMetricsSnapshot helper should work', async () => {
            initializeMonitoring({ enabled: true });
            const snapshot = await getSyncMetricsSnapshot();
            
            assert.ok(snapshot);
        });

        test('setDomainConfig helper should update domain', () => {
            initializeMonitoring({ enabled: true });
            setDomainConfig('rbac', false, true);
            
            const system = getMonitoring();
            const config = system.getDomainConfig('rbac');
            assert.strictEqual(config.metrics, false);
        });

        test('shutdownMonitoring helper should shutdown system', async () => {
            initializeMonitoring({ enabled: true });
            await shutdownMonitoring();
            
            const system = getMonitoring();
            assert.strictEqual(system.isEnabled, false);
        });
    });

    // ==========================================================================
    // 13. INTEGRATION TESTS
    // ==========================================================================
    describe('Integration Tests', () => {
        test('full lifecycle: init → record → handler → snapshot', async () => {
            // Initialize
            initializeMonitoring({ enabled: true });
            
            // Register handler
            let handlerCalled = false;
            let receivedData = null;
            getMonitoring().registerHandler(1, 0, (data, collector) => {
                handlerCalled = true;
                receivedData = data;
                collector.increment('test.counter');
            });
            
            // Record event
            record('rbac', 1, 0, 100, 200);
            
            // Flush and get snapshot
            const snapshot = await getSyncMetricsSnapshot();
            
            assert.ok(snapshot);
            assert.ok(snapshot.monitor.totalEventsEmitted >= 1);
        });

        test('domain isolation: rbac disabled should not affect framework', () => {
            initializeMonitoring({ enabled: true });
            
            setDomainConfig('rbac', false, true);
            setDomainConfig('framework', true, true);
            
            const rbacResult = record('rbac', 1, 0, 100);
            const frameworkResult = record('framework', 100, 0, 200);
            
            assert.strictEqual(rbacResult, false);
            assert.strictEqual(frameworkResult, true);
            
            const status = getMonitoringHealthStatus();
            assert.strictEqual(status.totalEvents, 1); // only framework
        });

        test('audit and metrics should work independently', () => {
            initializeMonitoring({ enabled: true, auditEnabled: true });
            
            // Disable metrics for rbac, keep audit
            setDomainConfig('rbac', false, true);
            
            const metricsResult = record('rbac', 1, 0, 100);
            auditLog('rbac', 'test_action', {}, {}, 'success');
            
            assert.strictEqual(metricsResult, false);
            
            const system = getMonitoring();
            const auditStats = system.audit.getStats();
            assert.strictEqual(auditStats.totalRecorded, 1);
        });

        test('multiple domains with different configs', () => {
            initializeMonitoring({ enabled: true });
            
            setDomainConfig('rbac', true, true);
            setDomainConfig('framework', false, false);
            setDomainConfig('auth', true, false);
            setDomainConfig('database', false, true);
            
            const rbacMetrics = record('rbac', 1, 0, 100);
            const frameworkMetrics = record('framework', 100, 0, 200);
            const authMetrics = record('auth', 160, 0, 300);
            const databaseMetrics = record('database', 180, 0, 400);
            
            assert.strictEqual(rbacMetrics, true);
            assert.strictEqual(frameworkMetrics, false);
            assert.strictEqual(authMetrics, true);
            assert.strictEqual(databaseMetrics, false);
        });

        test('handler receives correct data from record', async () => {
            initializeMonitoring({ enabled: true });
            
            let receivedV1, receivedV2, receivedV3, receivedV4;
            getMonitoring().registerHandler(1, 0, (data, collector) => {
                receivedV1 = data.v1;
                receivedV2 = data.v2;
                receivedV3 = data.v3;
                receivedV4 = data.v4;
            });
            
            record('rbac', 1, 0, 100, 200, 300, 400);
            await getSyncMetricsSnapshot();
            
            assert.strictEqual(receivedV1, 100);
            assert.strictEqual(receivedV2, 200);
            assert.strictEqual(receivedV3, 300);
            assert.strictEqual(receivedV4, 400);
        });

        test('collector updates metrics correctly', async () => {
            
            initializeMonitoring({ enabled: true });
               
            const ins=getMonitoring();
            getMonitoring().registerHandler(1, 0, (data, collector) => {
                collector.increment('test.counter', data.v1);
            });
            
            record('rbac', 1, 0, 5);
            record('rbac', 1, 0, 10);
            record('rbac', 1, 0, 15);
            
            await getSyncMetricsSnapshot();
            
                assert.strictEqual(ins,system)
            const count = system.collector.getCount('test.counter');
            assert.strictEqual(count, 30);
        });
    });

    // ==========================================================================
    // 14. EDGE CASES
    // ==========================================================================
    describe('Edge Cases', () => {
        test('should handle record before initialization', () => {
            // Don't initialize
            const result = record('rbac', 1, 0, 100);
            assert.strictEqual(result, false);
        });

        test('should handle audit before initialization', () => {
            // Don't initialize
            auditLog('rbac', 'test', {}, {}, 'success');
            // Should not throw
        });

        test('should handle empty domain name', () => {
            initializeMonitoring({ enabled: true });
            const result = record('', 1, 0, 100);
            // Should fallback to global
            assert.strictEqual(result, true);
        });

        test('should handle null domain', () => {
            initializeMonitoring({ enabled: true });
            const result = record(null, 1, 0, 100);
            // Should fallback to global
            assert.strictEqual(result, true);
        });

        test('should handle undefined domain', () => {
            initializeMonitoring({ enabled: true });
            const result = record(undefined, 1, 0, 100);
            // Should fallback to global
            assert.strictEqual(result, true);
        });

        test('should handle multiple initialize calls', () => {
            initializeMonitoring({ enabled: true });
            initializeMonitoring({ enabled: false });
            
            const system = getMonitoring();
            assert.strictEqual(system.isEnabled, false);
        });

        test('should handle large number of handlers', () => {
            initializeMonitoring({ enabled: true });
            
            for (let i = 0; i < 100; i++) {
                getMonitoring().registerHandler(1, 0, () => {});
            }
            
            const handlers = getEventsHandler();
            assert.ok(handlers);
        });

        test('should handle rapid domain config changes', () => {
            initializeMonitoring({ enabled: true });
            
            for (let i = 0; i < 100; i++) {
                setDomainConfig('rbac', i % 2 === 0, true);
            }
            
            const config = getMonitoring().getDomainConfig('rbac');
            // Last iteration (99) is odd, so metrics should be false
            assert.strictEqual(config.metrics, false);
        });
    });

    // ==========================================================================
    // 15. PERFORMANCE TESTS
    // ==========================================================================
    describe('Performance', () => {
        test('record() should be fast when domain is disabled', () => {
            initializeMonitoring({ enabled: true });
            setDomainConfig('rbac', false, true);
            
            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                record('rbac', 1, 0, i);
            }
            const duration = performance.now() - start;
            
            // Should be very fast (< 10ms for 10000 calls)
            assert.ok(duration < 10, `Took ${duration}ms, expected < 10ms`);
        });

        test('record() should be fast when system is disabled', () => {
            initializeMonitoring({ enabled: false });
            
            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                record('rbac', 1, 0, i);
            }
            const duration = performance.now() - start;
            
            assert.ok(duration < 10, `Took ${duration}ms, expected < 10ms`);
        });

        test('getHealthStatus() should be fast', () => {
            initializeMonitoring({ enabled: true });
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                getMonitoringHealthStatus();
            }
            const duration = performance.now() - start;
            
            assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
        });

        test('setDomainConfig() should be fast', () => {
            initializeMonitoring({ enabled: true });
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                setDomainConfig('rbac', true, true);
            }
            const duration = performance.now() - start;
            
            assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
        });
    });
});