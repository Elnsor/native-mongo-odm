

export class SystemMonitor {
    static #instance = null;
    #enabled = false;
    #listeners = new Set();
    #buffer;
    #head = 0;
    #tail = 0;
    #capacity = 60000;
    #entrySize = 6;
    #droppedCount = 0;
    #processing = false;
    #batchSize = 500;
    #intervalMs = 100;
    #timer = null;
    #eventCounters = new Map();
    #totalEventsEmitted = 0;
    #totalEventsProcessed = 0;
    #batchesProcessed = 0;
    #startTime = 0;
    #lastProcessTime = 0;
    
    constructor() {
        if (SystemMonitor.#instance) {
            throw new Error(
                'SystemMonitor is a Singleton. Use SystemMonitor.getInstance() instead.'
            );
        }
        this.#buffer = new Int32Array(this.#capacity*this.#entrySize); 
        this.#startTime = Date.now();
        SystemMonitor.#instance = this;
    }
    static getInstance() {
        if (!SystemMonitor.#instance) {
            SystemMonitor.#instance = new SystemMonitor();
        }
        return SystemMonitor.#instance;
    }
    enable() {
        if (this.#enabled) return this;
        this.#enabled = true;
        this.#startTime = Date.now();
        this.#scheduleNextBatch();
        return this;
    }
    disable() {
        if (!this.#enabled) return this;
        this.#enabled = false;
        if (this.#timer) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        return this;
    }
    isEnabled() {
        return this.#enabled;
    }
    /**
     * ====================================================================================
     * - emit() 🚀 add event type and its value to buffer then any listerner can read related value 
     * ====================================================================================
     * @param {number} eventType -- event type constant  
     * @param {number} eventMType -- event metrics type 
     * @param {number}  v1 -- value one 
     * @param {number}  v2 -- value two 
     * @param {number}  v3 -- value three
     * @param {number}  v4 -- value four 
     * @returns {boolean}
     * - true : if buffer is writing
     * - false : if buffer is full or no enabled 
     */
    
    emit(eventType, eventMType,v1 = 0, v2 = 0, v3 = 0, v4 = 0) {
    if (!this.#enabled) return false;
    
    const nextTail = (this.#tail + 1) % this.#capacity;
    if (nextTail === this.#head) {
        this.#droppedCount++;
        return false;
    }
    
    const offset = this.#tail * this.#entrySize;
    this.#buffer[offset]     = eventType;
    this.#buffer[offset  +1] = eventMType;
    this.#buffer[offset + 2] = v1;
    this.#buffer[offset + 3] = v2;
    this.#buffer[offset + 4] = v3;
    this.#buffer[offset + 5] = v4;

    this.#tail = nextTail;
    this.#totalEventsEmitted++;
    
    
    const currentSize = this.#tail > this.#head 
        ? (this.#tail - this.#head) 
        : (this.#capacity - this.#head + this.#tail);
    
    
    if (currentSize >= this.#batchSize && !this.#processing && !this.#timer) {
        setImmediate(() => this.#processBatch());
    }
    
    
    else if (!this.#timer && !this.#processing) {
        this.#scheduleNextBatch();
    }
    
    return true;
}

#processBatch() {

    
    if (!this.#enabled || this.#processing) return;
    
    if (this.#head === this.#tail) {
        this.#timer = null;
        return;
    }
   
    
    this.#processing = true;
    const startTime = performance.now();
    
    try {
        const events = this.#drain(this.#batchSize);
        
        for (const event of events) {
            try {
                this.#processEvent(event);
            } catch (eventError) {
                console.error(`[SystemMonitor] Error processing event type ${event.type}:`, eventError);
            }
        }
        
        this.#totalEventsProcessed += events.length;
        this.#batchesProcessed++;
        this.#lastProcessTime = performance.now() - startTime;
        
    } catch (error) {
        console.error('[SystemMonitor] Error processing batch:', error);
    } finally {
        this.#processing = false;
        
    
        const remainingSize = this.#tail >= this.#head 
            ? (this.#tail - this.#head) 
            : (this.#capacity - this.#head );
        
        if (remainingSize >= this.#batchSize) {
    
            setImmediate(() => this.#processBatch());
        } else if (remainingSize > 0) {
    
            this.#scheduleNextBatch();
        } else {
    
            this.#timer = null;
        }
    }
}

    /**
     * ============================================
     * - subscriber() 🦈 register handler for handl event  
     * ============================================
     * @param {*} listener -- its function that take event type and it data to manage its 
     * @returns {Error | SystemMonitor}
     * - error if listener not function 
     */
    subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('Listener must be a function');
        }
        this.#listeners.add(listener);
        return this;
    }
    /**
     * ==============
     * ### - unsubscribe() 🧺 remove listener from handler bucket 
     * =============
     * 
     * @param {*} listener 
     * @returns 
     */
    unsubscribe(listener) {
        return this.#listeners.delete(listener);
    }

    /**
     * ========================
     * clearListener() : 🔥 remove or unrigstered all handler
     * ========================
     * @returns 
     */
    clearListeners() {
        const count = this.#listeners.size;
        this.#listeners.clear();
        return count;
    }
    #scheduleNextBatch() {
    
        if (!this.#enabled || this.#processing || this.#timer ) return;
        this.#timer = setTimeout(() => {
            this.#processBatch();
    
        }, this.#intervalMs);
    }

    #drain(batchSize) {
        const events = [];
        let count = 0;
        while (this.#head !== this.#tail && count < batchSize) {
            const offset = this.#head * this.#entrySize
            events.push({
                type: this.#buffer[offset],
                mtype:this.#buffer[offset+1],
                v1: this.#buffer[offset + 2],
                v2: this.#buffer[offset + 3],
                v3: this.#buffer[offset + 4],
                v4: this.#buffer[offset + 5]
            });
            this.#head = (this.#head + 1) % this.#capacity;
            count++;
            
        }
        return events;
    }
    #processEvent(event) {
        const eventName = `event_${event.type}`;
        const currentCount = this.#eventCounters.get(eventName) || 0;
     
        this.#eventCounters.set(eventName, currentCount + 1);
     
        for (const listener of this.#listeners) {
            try {
                listener(event.type,event.mtype, {
                  
                    v1: event.v1,
                    v2: event.v2,
                    v3: event.v3,
                    v4: event.v4
                });

            
            } catch (error) {
                console.error(
                    `[SystemMonitor] Error in listener for event type ${event.type}:`,
                    error
                );
            }
        }
    }

    /**
     * ==========================================================================
     * flushSyncAsync() 
     * description : used for proccesing any remaining event imediatly 
     * if their is any proccissing worker in background it wait until it fineshed and then run 
     * when it run it got lock that prevent any worker from running when its run 
     * using :
     * in testing environment 
     * when their is remaining event need to proccessing before gracefull shutdown 
     * to show in dashboard 
     * dont us it in production 
     
     * ==========================================================================
     * @returns 
     */
    async flushSyncAsync() {
    
    if (!this.#enabled) return 0;
    
    
    
    const MAX_WAIT_ITERATIONS = 1000; // counter for prevent deadlock
    let waitIterations = 0;
    
    while (this.#processing) {
        if (++waitIterations > MAX_WAIT_ITERATIONS) {
            console.warn('[SystemMonitor] flushSyncAsync: Timeout waiting for Background Worker');
            return 0;
        }
        // Yield cpu for one cycle 
        await new Promise(resolve => setImmediate(resolve));
    }
    
    //  Acquire Lock
    this.#processing = true;
    let totalProcessed = 0;
    
    try {
        // proccessin reaming event 
        while (this.#head !== this.#tail) {
            const events = this.#drain(this.#batchSize);
            
            if (events.length === 0) break; // if no event 
            
            // it proccess bachSize event for e
            for (const event of events) {
                this.#processEvent(event);
            }
            
            totalProcessed += events.length;
            
            // for not starving cpu if thier is remain or pending event 
            if (this.#head !== this.#tail) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }
        
        // update states
        this.#totalEventsProcessed += totalProcessed;
        this.#batchesProcessed++;
        
        return totalProcessed;
        
    } catch (error) {
        console.error('[SystemMonitor] Error in flushSyncAsync:', error);
        throw error;
        
    } finally {
        // Release Lock after ending in error or not release Lock)
        this.#processing = false;
    }
}


    getStats() {
        const uptime = Date.now() - this.#startTime;
        const uptimeSeconds = uptime / 1000;
        return {
            enabled: this.#enabled,
            uptime: uptime,
            listenersCount: this.#listeners.size,
            totalEventsEmitted: this.#totalEventsEmitted,
            totalEventsProcessed: this.#totalEventsProcessed,
            pendingEvent: this.#totalEventsEmitted - this.#totalEventsProcessed,
            batchesProcessed: this.#batchesProcessed,
            lastProcessTime: this.#lastProcessTime,
            eventsPerSecond: uptimeSeconds > 0 
                ? this.#totalEventsEmitted / uptimeSeconds 
                : 0,
            queueSize: this.#getQueueSize(),
            droppedCount: this.#droppedCount,
            eventCounts: Object.fromEntries(this.#eventCounters)
        };
    }
    #getQueueSize() {
        if (this.#tail >= this.#head) {
            return this.#tail - this.#head;
        }
        return this.#capacity - this.#head + this.#tail;
    }
    reset() {
        this.#eventCounters.clear();
        this.#totalEventsEmitted = 0;
        this.#totalEventsProcessed = 0;
        this.#batchesProcessed = 0;
        this.#droppedCount = 0;
        this.#head = 0;
        this.#tail = 0;
        this.#startTime = Date.now();
        return this;
    }
    static resetInstance() {
        if (SystemMonitor.#instance) {
            SystemMonitor.#instance.disable();
            SystemMonitor.#instance.clearListeners();
            SystemMonitor.#instance.reset();
        }
        SystemMonitor.#instance = null;
    }
}


//export {SystemMonitor}