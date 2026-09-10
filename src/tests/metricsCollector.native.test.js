// tests/monitoring/metricsCollector.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { MetricsCollector } from '../Monitor/core/metricsCollector.js';

describe('MetricsCollector', () => {
    let collector;

    beforeEach(() => {
        collector = new MetricsCollector();
    });

    // counter test 

    describe('Counter (increment)', () => {
        test('should increment counter by 1 by default', () => {
            const result = collector.increment('test.counter');
            assert.strictEqual(result, 1);
        });

        test('should increment counter by custom value', () => {
            const result = collector.increment('test.counter', 5);
            assert.strictEqual(result, 5);
        });

        test('should increment counter by negative value (decrement)', () => {
            collector.increment('test.counter', 10);
            const result = collector.increment('test.counter', -3);
            assert.strictEqual(result, 7);
        });

        test('should accumulate increments', () => {
            collector.increment('test.counter');
            collector.increment('test.counter');
            collector.increment('test.counter', 3);
            
            const count = collector.getCount('test.counter');
            assert.strictEqual(count, 5);
        });

        test('should return 0 for non-existent counter', () => {
            const count = collector.getCount('test.nonexistent');
            assert.strictEqual(count, 0);
        });

        test('should handle labels correctly', () => {
            collector.increment('test.counter', 1, { method: 'GET', status: '200' });
            collector.increment('test.counter', 1, { method: 'POST', status: '200' });
            collector.increment('test.counter', 2, { method: 'GET', status: '200' });
            
            const getCount = collector.getCount('test.counter', { method: 'GET', status: '200' });
            const postCount = collector.getCount('test.counter', { method: 'POST', status: '200' });
            
            assert.strictEqual(getCount, 3);
            assert.strictEqual(postCount, 1);
        });

        test('should sort labels alphabetically (order-independent)', () => {
            collector.increment('test.counter', 1, { b: '2', a: '1' });
            const count = collector.getCount('test.counter', { a: '1', b: '2' });
            assert.strictEqual(count, 1);
        });

        test('should treat different labels as different counters', () => {
            collector.increment('test.counter', 1, { env: 'prod' });
            collector.increment('test.counter', 5, { env: 'dev' });
            
            const prodCount = collector.getCount('test.counter', { env: 'prod' });
            const devCount = collector.getCount('test.counter', { env: 'dev' });
            
            assert.strictEqual(prodCount, 1);
            assert.strictEqual(devCount, 5);
        });

        test('should handle empty labels object', () => {
            collector.increment('test.counter', 1, {});
            const count = collector.getCount('test.counter');
            assert.strictEqual(count, 1);
        });

        test('should handle multiple label values', () => {
            collector.increment('test.counter', 1, { a: '1', b: '2', c: '3' });
            const count = collector.getCount('test.counter', { a: '1', b: '2', c: '3' });
            assert.strictEqual(count, 1);
        });
    });

   //Guge metrics test 
    describe('Gauge (setGauge)', () => {
        test('should set gauge value', () => {
            const result = collector.setGauge('test.gauge', 100);
            assert.strictEqual(result, 100);
        });

        test('should overwrite previous value', () => {
            collector.setGauge('test.gauge', 100);
            collector.setGauge('test.gauge', 200);
            
            const value = collector.getGauge('test.gauge');
            assert.strictEqual(value, 200);
        });

        test('should set gauge to zero', () => {
            collector.setGauge('test.gauge', 100);
            collector.setGauge('test.gauge', 0);
            
            const value = collector.getGauge('test.gauge');
            assert.strictEqual(value, 0);
        });

        test('should set gauge to negative value', () => {
            collector.setGauge('test.gauge', -50);
            const value = collector.getGauge('test.gauge');
            assert.strictEqual(value, -50);
        });

        test('should set gauge to floating point', () => {
            collector.setGauge('test.gauge', 3.14159);
            const value = collector.getGauge('test.gauge');
            assert.strictEqual(value, 3.14159);
        });

        test('should handle labels', () => {
            collector.setGauge('test.gauge', 100, { region: 'us-east' });
            collector.setGauge('test.gauge', 200, { region: 'eu-west' });
            
            const usValue = collector.getGauge('test.gauge', { region: 'us-east' });
            const euValue = collector.getGauge('test.gauge', { region: 'eu-west' });
            
            assert.strictEqual(usValue, 100);
            assert.strictEqual(euValue, 200);
        });

        test('should return undefined for non-existent gauge', () => {
            const value = collector.getGauge('test.nonexistent');
            assert.strictEqual(value, undefined);
        });

        test('should sort labels alphabetically', () => {
            collector.setGauge('test.gauge', 100, { z: '1', a: '2' });
            const value = collector.getGauge('test.gauge', { a: '2', z: '1' });
            assert.strictEqual(value, 100);
        });
    });

   // histogram test 
    describe('Histogram (observeHistogram)', () => {
        test('should create histogram on first observation', () => {
            const result = collector.observeHistogram('test.histogram', 100);
            assert.strictEqual(result.count, 1);
            assert.strictEqual(result.sum, 100);
            assert.strictEqual(result.min, 100);
            assert.strictEqual(result.max, 100);
        });

        test('should accumulate observations', () => {
            collector.observeHistogram('test.histogram', 100);
            collector.observeHistogram('test.histogram', 200);
            collector.observeHistogram('test.histogram', 300);
            
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.count, 3);
            assert.strictEqual(histogram.sum, 600);
            assert.strictEqual(histogram.min, 100);
            assert.strictEqual(histogram.max, 300);
        });

        test('should track min and max correctly', () => {
            collector.observeHistogram('test.histogram', 50);
            collector.observeHistogram('test.histogram', 10);
            collector.observeHistogram('test.histogram', 100);
            collector.observeHistogram('test.histogram', 25);
            
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.min, 10);
            assert.strictEqual(histogram.max, 100);
        });

        test('should handle negative values', () => {
            collector.observeHistogram('test.histogram', -50);
            collector.observeHistogram('test.histogram', 100);
            
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.min, -50);
            assert.strictEqual(histogram.max, 100);
            assert.strictEqual(histogram.sum, 50);
        });

        test('should handle zero values', () => {
            collector.observeHistogram('test.histogram', 0);
            collector.observeHistogram('test.histogram', 100);
            
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.min, 0);
            assert.strictEqual(histogram.max, 100);
        });

        test('should limit sample size to 100', () => {
            for (let i = 0; i < 150; i++) {
                collector.observeHistogram('test.histogram', i);
            }
            
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.values.length, 100);
            assert.strictEqual(histogram.count, 150);
        });

        test('should store unit correctly', () => {
            collector.observeHistogram('test.histogram', 100, {}, 'ns');
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.unit, 'ns');
        });

        test('should default to raw unit', () => {
            collector.observeHistogram('test.histogram', 100);
            const histogram = collector.getHistogram('test.histogram');
            assert.strictEqual(histogram.unit, 'raw');
        });

        test('should handle labels', () => {
            collector.observeHistogram('test.histogram', 100, { method: 'GET' });
            collector.observeHistogram('test.histogram', 200, { method: 'POST' });
            
            const getHist = collector.getHistogram('test.histogram', { method: 'GET' });
            const postHist = collector.getHistogram('test.histogram', { method: 'POST' });
            
            assert.strictEqual(getHist.count, 1);
            assert.strictEqual(getHist.sum, 100);
            assert.strictEqual(postHist.count, 1);
            assert.strictEqual(postHist.sum, 200);
        });

        test('should return undefined for non-existent histogram', () => {
            const hist = collector.getHistogram('test.nonexistent');
            assert.strictEqual(hist, undefined);
        });

        test('should calculate percentiles correctly', () => {
            // Add 100 values from 1 to 100
            for (let i = 1; i <= 100; i++) {
                collector.observeHistogram('test.histogram', i);
            }
            
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            // p50 should be around 50
            assert.ok(parseInt(hist.p50) >= 45 && parseInt(hist.p50) <= 55);
            // p95 should be around 95
            assert.ok(parseInt(hist.p95) >= 90 && parseInt(hist.p95) <= 100);
            // p99 should be around 99
            assert.ok(parseInt(hist.p99) >= 95 && parseInt(hist.p99) <= 100);
        });

        test('should calculate average correctly', () => {
            collector.observeHistogram('test.histogram', 100);
            collector.observeHistogram('test.histogram', 200);
            collector.observeHistogram('test.histogram', 300);
            
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            // Average should be 200
            assert.ok(hist.avg.includes('200'));
        });
    });

    // fromat histogram unit 
    describe('Unit Formatting', () => {
        test('should format nanoseconds correctly', () => {
            collector.observeHistogram('test.histogram', 500, {}, 'ns');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('ns'));
        });

        test('should convert ns to μs when >= 1000', () => {
            collector.observeHistogram('test.histogram', 1500, {}, 'ns');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('μs'));
        });

        test('should convert ns to ms when >= 1,000,000', () => {
            collector.observeHistogram('test.histogram', 1500000, {}, 'ns');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('ms'));
        });

        test('should convert ns to s when >= 1,000,000,000', () => {
            collector.observeHistogram('test.histogram', 1500000000, {}, 'ns');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('s'));
        });

        test('should format bytes correctly', () => {
            collector.observeHistogram('test.histogram', 500, {}, 'bytes');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('B'));
        });

        test('should convert bytes to KB when >= 1024', () => {
            collector.observeHistogram('test.histogram', 2048, {}, 'bytes');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('KB'));
        });

        test('should convert bytes to MB when >= 1,048,576', () => {
            collector.observeHistogram('test.histogram', 2097152, {}, 'bytes');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('MB'));
        });

        test('should format milliseconds correctly', () => {
            collector.observeHistogram('test.histogram', 50, {}, 'ms');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('ms'));
        });

        test('should format microseconds correctly', () => {
            collector.observeHistogram('test.histogram', 50, {}, 'us');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.min.includes('μs'));
        });

        test('should format raw/count values correctly', () => {
            collector.observeHistogram('test.histogram', 42, {}, 'raw');
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.strictEqual(hist.min, '42');
        });

        test('should handle Infinity in formatting', () => {
            // Create a histogram with no observations to test edge case
            const snapshot = collector.snapshot();
            assert.ok(snapshot.histograms);
        });
    });

    // ==========================================================================
    // 5. SNAPSHOT TESTS
    // ==========================================================================
    describe('Snapshot', () => {
        test('should return complete snapshot structure', () => {
            collector.increment('counter1');
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            const snapshot = collector.snapshot();
            
            assert.ok(snapshot.hasOwnProperty('counters'));
            assert.ok(snapshot.hasOwnProperty('gauges'));
            assert.ok(snapshot.hasOwnProperty('histograms'));
            assert.ok(snapshot.hasOwnProperty('timestamp'));
        });

        test('should include timestamp', () => {
            const before = Date.now();
            const snapshot = collector.snapshot();
            const after = Date.now();
            
            assert.ok(snapshot.timestamp >= before);
            assert.ok(snapshot.timestamp <= after);
        });

        test('should include all counters', () => {
            collector.increment('counter1');
            collector.increment('counter2', 5);
            
            const snapshot = collector.snapshot();
            assert.strictEqual(snapshot.counters['counter1'], 1);
            assert.strictEqual(snapshot.counters['counter2'], 5);
        });

        test('should include all gauges', () => {
            collector.setGauge('gauge1', 100);
            collector.setGauge('gauge2', 200);
            
            const snapshot = collector.snapshot();
            assert.strictEqual(snapshot.gauges['gauge1'], 100);
            assert.strictEqual(snapshot.gauges['gauge2'], 200);
        });

        test('should format histograms in snapshot', () => {
            collector.observeHistogram('test.histogram', 100, {}, 'ns');
            collector.observeHistogram('test.histogram', 200, {}, 'ns');
            
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.ok(hist.hasOwnProperty('unit'));
            assert.ok(hist.hasOwnProperty('count'));
            assert.ok(hist.hasOwnProperty('sum'));
            assert.ok(hist.hasOwnProperty('avg'));
            assert.ok(hist.hasOwnProperty('min'));
            assert.ok(hist.hasOwnProperty('max'));
            assert.ok(hist.hasOwnProperty('p50'));
            assert.ok(hist.hasOwnProperty('p95'));
            assert.ok(hist.hasOwnProperty('p99'));
        });

        test('should return empty snapshot when no metrics', () => {
            const snapshot = collector.snapshot();
            
            assert.deepStrictEqual(snapshot.counters, {});
            assert.deepStrictEqual(snapshot.gauges, {});
            assert.deepStrictEqual(snapshot.histograms, {});
        });

        test('should include labels in metric keys', () => {
            collector.increment('test.counter', 1, { method: 'GET' });
            
            const snapshot = collector.snapshot();
            const keys = Object.keys(snapshot.counters);
            
            assert.ok(keys.some(k => k.includes('method=GET')));
        });
    });

   // utility methods test 
    describe('Utility Methods', () => {
        test('should reset all metrics', () => {
            collector.increment('counter1');
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            const result = collector.reset();
            
            assert.strictEqual(result, collector); // Should return this
            const count = collector.getMetricsCount();
            assert.strictEqual(count.total, 0);
        });

        test('should reset counters only', () => {
            collector.increment('counter1');
            collector.setGauge('gauge1', 100);
            
            collector.reset();
            
            assert.strictEqual(collector.getCount('counter1'), 0);
            assert.strictEqual(collector.getGauge('gauge1'), undefined);
        });

        test('should remove specific counter', () => {
            collector.increment('counter1');
            collector.increment('counter2');
            
            const removed = collector.removeMetric('counter1');
            assert.strictEqual(removed, true);
            
            assert.strictEqual(collector.getCount('counter1'), 0);
            assert.strictEqual(collector.getCount('counter2'), 1);
        });

        test('should remove specific gauge', () => {
            collector.setGauge('gauge1', 100);
            collector.setGauge('gauge2', 200);
            
            const removed = collector.removeMetric('gauge1');
            assert.strictEqual(removed, true);
            
            assert.strictEqual(collector.getGauge('gauge1'), undefined);
            assert.strictEqual(collector.getGauge('gauge2'), 200);
        });

        test('should remove specific histogram', () => {
            collector.observeHistogram('hist1', 50);
            collector.observeHistogram('hist2', 100);
            
            const removed = collector.removeMetric('hist1');
            assert.strictEqual(removed, true);
            
            assert.strictEqual(collector.getHistogram('hist1'), undefined);
            assert.ok(collector.getHistogram('hist2'));
        });

        test('should return false when removing non-existent metric', () => {
            const removed = collector.removeMetric('nonexistent');
            assert.strictEqual(removed, false);
        });

        test('should remove metric with labels', () => {
            collector.increment('test.counter', 1, { method: 'GET' });
            collector.increment('test.counter', 1, { method: 'POST' });
            
            const removed = collector.removeMetric('test.counter', { method: 'GET' });
            assert.strictEqual(removed, true);
            
            assert.strictEqual(collector.getCount('test.counter', { method: 'GET' }), 0);
            assert.strictEqual(collector.getCount('test.counter', { method: 'POST' }), 1);
        });

        test('should list all metrics', () => {
            collector.increment('counter1');
            collector.increment('counter2');
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            const list = collector.listMetrics();
            
            assert.ok(list.counters.includes('counter1'));
            assert.ok(list.counters.includes('counter2'));
            assert.ok(list.gauges.includes('gauge1'));
            assert.ok(list.histograms.includes('hist1'));
        });

        test('should list metrics with labels', () => {
            collector.increment('test.counter', 1, { method: 'GET' });
            
            const list = collector.listMetrics();
            assert.ok(list.counters.some(k => k.includes('method=GET')));
        });

        test('should return empty lists when no metrics', () => {
            const list = collector.listMetrics();
            
            assert.deepStrictEqual(list.counters, []);
            assert.deepStrictEqual(list.gauges, []);
            assert.deepStrictEqual(list.histograms, []);
        });

        test('should count metrics correctly', () => {
            collector.increment('counter1');
            collector.increment('counter2');
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            const count = collector.getMetricsCount();
            
            assert.strictEqual(count.counters, 2);
            assert.strictEqual(count.gauges, 1);
            assert.strictEqual(count.histograms, 1);
            assert.strictEqual(count.total, 4);
        });

        test('should count metrics with labels as separate', () => {
            collector.increment('test.counter', 1, { method: 'GET' });
            collector.increment('test.counter', 1, { method: 'POST' });
            
            const count = collector.getMetricsCount();
            assert.strictEqual(count.counters, 2);
        });

        test('should return zero counts when no metrics', () => {
            const count = collector.getMetricsCount();
            
            assert.strictEqual(count.counters, 0);
            assert.strictEqual(count.gauges, 0);
            assert.strictEqual(count.histograms, 0);
            assert.strictEqual(count.total, 0);
        });
    });

   // labeled key creation test
    describe('Key Building (via public API)', () => {
        test('should build key without labels', () => {
            collector.increment('test.counter');
            const list = collector.listMetrics();
            assert.deepStrictEqual(list.counters, ['test.counter']);
        });

        test('should build key with single label', () => {
            collector.increment('test.counter', 1, { method: 'GET' });
            const list = collector.listMetrics();
            assert.ok(list.counters[0].includes('test.counter'));
            assert.ok(list.counters[0].includes('method=GET'));
        });

        test('should build key with multiple labels sorted alphabetically', () => {
            collector.increment('test.counter', 1, { z: '1', a: '2', m: '3' });
            const list = collector.listMetrics();
            const key = list.counters[0];
            
            // Labels should be sorted: a, m, z
            const aIndex = key.indexOf('a=');
            const mIndex = key.indexOf('m=');
            const zIndex = key.indexOf('z=');
            
            assert.ok(aIndex < mIndex);
            assert.ok(mIndex < zIndex);
        });

        test('should build key with empty labels object', () => {
            collector.increment('test.counter', 1, {});
            const list = collector.listMetrics();
            assert.deepStrictEqual(list.counters, ['test.counter']);
        });

        test('should handle special characters in label values', () => {
            collector.increment('test.counter', 1, { path: '/api/users' });
            const count = collector.getCount('test.counter', { path: '/api/users' });
            assert.strictEqual(count, 1);
        });
    });

    // edge casses 

    describe('Edge Cases', () => {
        test('should handle very large counter values', () => {
            collector.increment('test.counter', Number.MAX_SAFE_INTEGER);
            const count = collector.getCount('test.counter');
            assert.strictEqual(count, Number.MAX_SAFE_INTEGER);
        });

        test('should handle very small floating point values', () => {
            collector.observeHistogram('test.histogram', 0.000001);
            const hist = collector.getHistogram('test.histogram');
            assert.strictEqual(hist.min, 0.000001);
        });

        test('should handle single observation histogram', () => {
            collector.observeHistogram('test.histogram', 42);
            
            const snapshot = collector.snapshot();
            const histKey = Object.keys(snapshot.histograms)[0];
            const hist = snapshot.histograms[histKey];
            
            assert.strictEqual(hist.count, 1);
            assert.strictEqual(hist.min, hist.max);
        });

        test('should handle gauge overwrite with same value', () => {
            collector.setGauge('test.gauge', 100);
            collector.setGauge('test.gauge', 100);
            
            const value = collector.getGauge('test.gauge');
            assert.strictEqual(value, 100);
        });

        test('should handle multiple increments in sequence', () => {
            for (let i = 0; i < 1000; i++) {
                collector.increment('test.counter');
            }
            
            const count = collector.getCount('test.counter');
            assert.strictEqual(count, 1000);
        });

        test('should handle histogram with all same values', () => {
            for (let i = 0; i < 10; i++) {
                collector.observeHistogram('test.histogram', 100);
            }
            
            const hist = collector.getHistogram('test.histogram');
            assert.strictEqual(hist.min, 100);
            assert.strictEqual(hist.max, 100);
            assert.strictEqual(hist.sum, 1000);
        });

        test('should handle metric names with dots', () => {
            collector.increment('rbac.access.check.total');
            const count = collector.getCount('rbac.access.check.total');
            assert.strictEqual(count, 1);
        });

        test('should handle metric names with underscores', () => {
            collector.increment('rbac_access_check_total');
            const count = collector.getCount('rbac_access_check_total');
            assert.strictEqual(count, 1);
        });
    });

    // performance test
    describe('Performance', () => {
        test('should handle 10000 increments quickly', () => {
            const start = performance.now();
            
            for (let i = 0; i < 10000; i++) {
                collector.increment('test.counter');
            }
            
            const duration = performance.now() - start;
            assert.ok(duration < 100, `Took ${duration}ms, expected < 100ms`);
        });

        test('should handle 1000 histogram observations quickly', () => {
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                collector.observeHistogram('test.histogram', i);
            }
            
            const duration = performance.now() - start;
            assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
        });

        test('should handle 1000 gauge sets quickly', () => {
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                collector.setGauge('test.gauge', i);
            }
            
            const duration = performance.now() - start;
            assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
        });

        test('should handle labeled metrics efficiently', () => {
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                collector.increment('test.counter', 1, { method: 'GET', status: '200' });
            }
            
            const duration = performance.now() - start;
            assert.ok(duration < 100, `Took ${duration}ms, expected < 100ms`);
        });
    });

   // integration test
    describe('Integration', () => {
        test('should handle mixed metric types', () => {
            collector.increment('counter1');
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            const snapshot = collector.snapshot();
            
            assert.strictEqual(snapshot.counters['counter1'], 1);
            assert.strictEqual(snapshot.gauges['gauge1'], 100);
            assert.ok(snapshot.histograms['hist1']);
        });

        test('should handle same name for different metric types', () => {
            // Note: In practice, names should be unique per type
            // but the implementation allows it
            collector.increment('test.metric');
            collector.setGauge('test.metric', 100);
            collector.observeHistogram('test.metric', 50);
            
            assert.strictEqual(collector.getCount('test.metric'), 1);
            assert.strictEqual(collector.getGauge('test.metric'), 100);
            assert.ok(collector.getHistogram('test.metric'));
        });

        test('should maintain state across operations', () => {
            collector.increment('counter1', 5);
            collector.setGauge('gauge1', 100);
            collector.observeHistogram('hist1', 50);
            
            // Perform more operations
            collector.increment('counter1', 3);
            collector.setGauge('gauge1', 200);
            collector.observeHistogram('hist1', 100);
            
            // Verify final state
            assert.strictEqual(collector.getCount('counter1'), 8);
            assert.strictEqual(collector.getGauge('gauge1'), 200);
            
            const hist = collector.getHistogram('hist1');
            assert.strictEqual(hist.count, 2);
            assert.strictEqual(hist.sum, 150);
        });

        test('should work with real-world RBAC metrics scenario', () => {
            // Simulate RBAC access checks
            collector.increment('rbac.access.check.total');
            collector.observeHistogram('rbac.access.check.duration', 1500, {}, 'ns');
            
            // Simulate denied access
            collector.increment('rbac.access.check.denied', 1, { groupRoleId: 5 });
            
            // Simulate granted access
            collector.increment('rbac.access.check.granted', 1, { groupRoleId: 5 });
            
            const snapshot = collector.snapshot();
            
            assert.strictEqual(snapshot.counters['rbac.access.check.total'], 1);
            assert.ok(snapshot.histograms['rbac.access.check.duration']);
            assert.ok(Object.keys(snapshot.counters).some(k => k.includes('denied')));
            assert.ok(Object.keys(snapshot.counters).some(k => k.includes('granted')));
        });
    });
});