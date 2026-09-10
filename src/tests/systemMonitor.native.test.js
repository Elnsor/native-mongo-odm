// tests/monitoring/systemMonitor.test.js
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SystemMonitor } from '../Monitor/core/systemMonitor.js';

describe('SystemMonitor', () => {
    let monitor;

    beforeEach(() => {
        SystemMonitor.resetInstance();
        monitor = SystemMonitor.getInstance();
    });

    afterEach(() => {
        monitor.disable();
    });

    test('should be singleton one instance', () => {
        const instance1 = SystemMonitor.getInstance();
        const instance2 = SystemMonitor.getInstance();
        assert.strictEqual(instance1, instance2);
    });

    test('should emit event successfully', () => {
        monitor.enable();
        const result = monitor.emit(1, 0, 100, 200);
        assert.strictEqual(result, true);
    });

    test('should return false when disabled', () => {
        const result = monitor.emit(1, 0, 100);
        assert.strictEqual(result, false);
    });

    test('should handle buffer overflow', () => {
        monitor.enable();
        // Fill buffer (capacity = 60000)
        for (let i = 0; i < 60000; i++) {
            monitor.emit(1, 0, i);
        }
        // Next should be dropped
        const result = monitor.emit(1, 0, 999);
        assert.strictEqual(result, false);
        
        const stats = monitor.getStats();
        assert.strictEqual(stats.droppedCount, 2);
    });

    test('performance: should handle 10000 emits in < 50ms', () => {
        monitor.enable();
        const start = performance.now();
        
        for (let i = 0; i < 10000; i++) {
            monitor.emit(1, 0, i, i * 2);
        }
        
        const duration = performance.now() - start;
        assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
    });
});