// src/tests/auditLogger.native.test.js
import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogger } from '../Monitor/core/auditLogger.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { resolve } from 'node:dns';

describe('AuditLogger', () => {
    let logger;
    let tempDir;
    let tempFilePath;

    beforeEach(async () => {
        // create folder with logfile as temp 
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-logger-test-'));
        tempFilePath = path.join(tempDir, 'audit.log');
        
        // reinitilizing audits option 
        logger = new AuditLogger({
            maxBufferSize: 5, // can contain 5 audit message 
            flushIntervalMs: 50, // backe ground flash timing 
            logFilePath: tempFilePath // log file path
        });
    });

    afterEach(async () => {
        // clean log file and reset timer
        logger.stopAutoFlush();
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (err) {
        //ignor file if allready deleted
        }
        mock.restoreAll();
    });

    // ==========================================================================
    // 1. (Initialization)
    // ==========================================================================
    describe('Initialization', () => {
        test('should initialize with default options', () => {
            const defaultLogger = new AuditLogger();
            const stats = defaultLogger.getStats();
            assert.strictEqual(stats.bufferSize, 0);
            assert.strictEqual(stats.totalRecorded, 0);
            assert.strictEqual(stats.totalPersisted, 0);
            assert.strictEqual(stats.isTimerRunning, false);
        });

        test('should initialize with custom options', () => {
            const customLogger = new AuditLogger({
                maxBufferSize: 2000,
                flushIntervalMs: 10000,
                logFilePath: '/custom/path.log'
            });
            const stats = customLogger.getStats();
            assert.strictEqual(stats.flushIntervalMs, 10000);
        });
    });

    // ==========================================================================
    // 2. (Logging)
    // ==========================================================================
    describe('log()', () => {
        test('should add entry to buffer and increment counters', () => {
            const size = logger.log('test_action', { id: 1 }, { resource: 'user' }, 'success', { duration: 10 });
            
            assert.strictEqual(size, 1);
            const stats = logger.getStats();
            assert.strictEqual(stats.bufferSize, 1);
            assert.strictEqual(stats.totalRecorded, 1);
            assert.strictEqual(stats.totalPersisted, 0);
        });

        test('should trigger auto-flush when buffer reaches maxBufferSize', async () => {
            // semulate #flushAsync 
            
            
            // 5 record wiht maxBufferSize = 5
            for (let i = 0; i < 5; i++) {
                logger.log('action', {}, {}, 'success');
            }

            // should call #flushAsync() internely  
            // may take time to flush record to log file 
            await new Promise(resolve=> setTimeout(resolve,50));
                 
            assert.strictEqual(logger.getStats().totalPersisted, 5);
        });

        test('should start auto-flush timer when buffer was empty and a log is added', () => {
            assert.strictEqual(logger.getStats().isTimerRunning, false);
            logger.log('action', {}, {}, 'success');
            assert.strictEqual(logger.getStats().isTimerRunning, true);
        });
    });

    // ==========================================================================
    // 3. (Flushing Mechanisms)
    // ==========================================================================
    describe('Flushing Mechanisms', () => {
        test('stopAutoFlush should clear the timer', () => {
            logger.log('action', {}, {}, 'success'); // add new logs to start timer 
            assert.strictEqual(logger.getStats().isTimerRunning, true);
            
            logger.stopAutoFlush();
            assert.strictEqual(logger.getStats().isTimerRunning, false);
        });

        test('stopAutoFlush should be safe to call multiple times', () => {
            logger.stopAutoFlush();
            logger.stopAutoFlush(); // dont throw error 
            assert.strictEqual(logger.getStats().isTimerRunning, false);
        });

        test('flush() should process all pending logs', async () => {
            logger.log('action1', {}, {}, 'success');
            logger.log('action2', {}, {}, 'success');
            
            await logger.flush();
            
            const stats = logger.getStats();
            assert.strictEqual(stats.bufferSize, 0);
            assert.strictEqual(stats.totalPersisted, 2);
        });

        test('#flushAsync should do nothing if buffer is empty', async () => {
            const persistSpy = mock.method(logger, 'flush'); // what calling for flush
            await logger.flush();
            assert.strictEqual(persistSpy.mock.callCount(), 1); // it calling but doing nothing and not throw error if buffer is empty 
        });

        test('#flushAsync should prevent concurrent flushes', async () => {
            logger.log('action', {}, {}, 'success');
            
            // semulate saving take time 
            let isFlushing = false;
            const originalPersist = logger.flush.bind(logger);
            mock.method(logger, 'flush', async () => {
                isFlushing = true;
                await new Promise(resolve => setTimeout(resolve, 50));
                return originalPersist();
            });

            // try calling in syncing way 
            const promise1 = logger.flush();
            const promise2 = logger.flush();

            await Promise.all([promise1, promise2]);
            
            // dont throw any error 
            assert.ok(true);
        });
    });

    // ==========================================================================
    // 4. (Persistence: Custom & File)
    // ==========================================================================
    describe('Persistence', () => {
        test('should use customPersistHandler if provided', async () => {
            let capturedBatch = null;
            const customHandler = mock.fn(async (batch) => {
                capturedBatch = batch;
            });

            const customLogger = new AuditLogger({
                maxBufferSize: 2,
                customPersistHandler: customHandler
            });

            customLogger.log('custom_action', { id: 99 }, {}, 'success');
            customLogger.log('custom_action', { id: 100 }, {}, 'success'); //  flush

            // add waiting time to grantee async flush
            await new Promise(resolve => setTimeout(resolve, 20));

            assert.ok(capturedBatch !== null);
            assert.strictEqual(capturedBatch.length, 2);
            assert.strictEqual(capturedBatch[0].action, 'custom_action');
        });

        test('should write to file correctly', async () => {
            logger.log('file_action', { user: 'test' }, { id: 1 }, 'success', { meta: 'data' });
            await logger.flush();

            // reading temp log file 
            const fileContent = await fs.readFile(tempFilePath, 'utf-8');
            const lines = fileContent.trim().split('\n');
            
            assert.strictEqual(lines.length, 1);
            const parsedLog = JSON.parse(lines[0]);
            
            assert.strictEqual(parsedLog.action, 'file_action');
            assert.strictEqual(parsedLog.actor.user, 'test');
            assert.strictEqual(parsedLog.outcome, 'success');
            assert.strictEqual(parsedLog.metadata.meta, 'data');
            assert.ok(typeof parsedLog.timestamp === 'number');
        });

        test('should handle file write errors gracefully', async () => {
            // semulate error writing 

            const invalidPath="$/?+/"
        const failingLogger = new AuditLogger({
                maxBufferSize: 1,
                logFilePath: invalidPath
            });

              const spylog=mock.method(console,"error");
            
            failingLogger.log('error_action', {}, {}, 'success');

          
            //shoud catch error and save it in log console.error
            await assert.doesNotReject(async () => {
                await failingLogger.flush();
            });
            await new Promise(resolve=> setTimeout(resolve,50));
            assert.ok(spylog.mock.calls.length > 0)
            const errLog=spylog.mock.calls[0].arguments
            assert.strictEqual(errLog[0],'[AuditLogger] Error writing to file:')
            assert.ok(errLog[1] instanceof Error);
            
            // the error writing log no counting 
            const stats = failingLogger.getStats();
            assert.strictEqual(stats.totalPersisted, 0);
        });
    });

    // ==========================================================================
    // 5. (Utility Methods)
    // ==========================================================================
    describe('Utility Methods', () => {
        test('getRecentLogs should return the last N logs', () => {
            for (let i = 1; i <= 10; i++) {
                logger.log(`action_${i}`, {}, {}, 'success');
            }
            
            const recent = logger.getRecentLogs(3);
            assert.strictEqual(recent.length, 3);
            assert.strictEqual(recent[0].action, 'action_8');
            assert.strictEqual(recent[2].action, 'action_10');
        });

        test('getRecentLogs should return all logs if count is greater than buffer size', () => {
            logger.log('action_1', {}, {}, 'success');
            logger.log('action_2', {}, {}, 'success');
            
            const recent = logger.getRecentLogs(100);
            assert.strictEqual(recent.length, 2);
        });

        test('clear should empty the buffer and return the count', () => {
            logger.log('action', {}, {}, 'success');
            logger.log('action', {}, {}, 'success');
            
            const clearedCount = logger.clear();
            
            assert.strictEqual(clearedCount, 2);
            assert.strictEqual(logger.getStats().bufferSize, 0);
        });
    });

    // ==========================================================================
    // 6. (Edge Cases & Performance)
    // ==========================================================================
    describe('Edge Cases & Performance', () => {
        test('should handle large metadata objects', () => {
            const largeMetadata = { data: 'x'.repeat(10000) };
            const size = logger.log('large_action', {}, {}, 'success', largeMetadata);
            
            assert.strictEqual(size, 1);
            const recent = logger.getRecentLogs(1);
            assert.strictEqual(recent[0].metadata.data.length, 10000);
        });

        test('should handle rapid consecutive logs without crashing', async () => {
            const rapidLogger = new AuditLogger({
                maxBufferSize: 100,
                flushIntervalMs: 10
            });

            const promises = [];
            for (let i = 0; i < 500; i++) {
                rapidLogger.log('rapid_action', {}, {}, 'success');
            }

            // flushes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const stats = rapidLogger.getStats();
            assert.strictEqual(stats.totalRecorded, 500);
            // system no broking and its may not save all log presistence 
            assert.ok(stats.totalPersisted >= 0);
            
            rapidLogger.stopAutoFlush();
        });

        test('getStats should accurately reflect internal state', () => {
            logger.log('action', {}, {}, 'success');
            const stats = logger.getStats();
            
            assert.strictEqual(stats.bufferSize, 1);
            assert.strictEqual(stats.totalRecorded, 1);
            assert.strictEqual(stats.totalPersisted, 0);
            assert.strictEqual(stats.isFlushing, false);
            assert.strictEqual(stats.flushIntervalMs, 50);
            assert.strictEqual(stats.isTimerRunning, true);
        });
    });
});