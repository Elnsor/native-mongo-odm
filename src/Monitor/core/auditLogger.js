/**
 * get logs audits and save it and can commited it into file in disk or 
 * its save each log line in list its array can contain as max buffer size loging
 * 
 */
export class AuditLogger {
    #logBuffer = [];
    #maxBufferSize = 1000;
    #flushIntervalMs = 5000; 
    #flushTimer = null;
    #isFlushing = false;
    #logFilePath = null;
    #customPersistHandler = null;
    #totalLogsRecorded = 0;
    #totalLogsPersisted = 0;
/**
 * 
 * @param {AuditingOption} options 
 */
    constructor(options = {}) {
        const {
            maxBufferSize = 1000,
            flushIntervalMs = 5000,
            logFilePath = null,
            customPersistHandler = null
        } = options;
        this.#maxBufferSize = maxBufferSize;
        this.#flushIntervalMs = flushIntervalMs;
        this.#logFilePath = logFilePath;
        this.#customPersistHandler = customPersistHandler;
       
    }

   /**
    * 
    * @param {string} action -- the Type Name  of operation
    * @param {sting} actor -- who do this operation 
    * @param {*} resource -- this operation done on resource 
    * @param {*} outcome  -- the result  
    * @param {*} metadata -- some discription or addition info 
    * @returns 
    * @example
    * * audit.log('check_access',
     *     { groupRoleId: 1, memberId: 0 },
     *     { parentId: 100, childId: 101 },
     *     'granted',
     *     { duration: 0.5, ttl: 86400 }
     * );
    */ 
    log(action, actor, resource, outcome, metadata = {}) {
        const entry = {
            timestamp: Date.now(),
            action,
            actor,
            resource,
            outcome,
            metadata
        };
        const wasEmpty= this.#logBuffer.length === 0
        this.#logBuffer.push(entry);
        this.#totalLogsRecorded++;
        if (this.#logBuffer.length >= this.#maxBufferSize) {
            this.#flushAsync();
        }else if(wasEmpty ){
            this.#startAutoFlush();
        }
        return this.#logBuffer.length;
    }

    /**
     *  its set interval time for async flushing record buffer
     * if their is runing interval so not create new one 
     * 
     * @returns  
     */
    #startAutoFlush() {
        if (this.#flushTimer) return;
        this.#flushTimer = setInterval(() => {
            this.#flushAsync();
        }, this.#flushIntervalMs);
    }

    /**
     * clear runing interval and stop flush timer 
     * @returns 
     */
    stopAutoFlush() {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
            this.#flushTimer = null;
        }
        return this;
    }

    /**
     * flush buffer in async manner (commited it into saving type in disk)
     * @returns 
     */
    async #flushAsync() {
        
        if (this.#isFlushing || this.#logBuffer.length === 0) return;
       
        this.#isFlushing = true;
        try {
            const batch = this.#logBuffer.splice(0);
            await this.#persist(batch);
            this.#totalLogsPersisted += batch.length;
        } catch (error) {
            console.error('[AuditLogger] Error flushing logs:', error);
        } finally {
            this.#isFlushing = false;
            if(this.#logBuffer.length === 0){
               
                this.stopAutoFlush();
            }
        }
    }

    /**
     * it choose which type of commited record into disk if its handler then used it else us path
     * @param {Array} batch -- contain record log  
     * @returns 
     */
    async #persist(batch) {
        if (this.#customPersistHandler) {
            await this.#customPersistHandler(batch);
            return;
        }
        if (this.#logFilePath) {
            await this.#writeToFile(batch);
            return;
        }
        console.log(`[AuditLogger] Persisted ${batch.length} entries`);
    }

    /**
     * its conver each record it json string and save it to file that declare in option logFilePath
     * @param {*} batch 
     */
    async #writeToFile(batch) {
        const fs = await import('fs/promises');
        const lines = batch.map(entry => JSON.stringify(entry)).join('\n');
        try {
            await fs.appendFile(this.#logFilePath, lines + '\n');
        } catch (error) {
            console.error('[AuditLogger] Error writing to file:', error);
        }
    }

    /**
     * 
     * @param {number} count -- number of recent record you need to fetch  
     * @returns 
     */
    getRecentLogs(count = 100) {
        return this.#logBuffer.slice(-count);
    }


    getStats() {
        /** @type {AuditState} */
        return {
            
            bufferSize: this.#logBuffer.length,
            totalRecorded: this.#totalLogsRecorded,
            totalPersisted: this.#totalLogsPersisted,
            isFlushing: this.#isFlushing,
            flushIntervalMs: this.#flushIntervalMs,
            isTimerRunning: this.#flushTimer !== null
        };
    }
    clear() {
        const count = this.#logBuffer.length;
        this.#logBuffer = [];
        return count;
    }
    async flush() {
        await this.#flushAsync();
    }
}