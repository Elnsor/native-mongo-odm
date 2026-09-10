
/***
    * @typedef {Object} SystemMonitorState
      *@property {boolean}     enabled: this.#enabled,
      *@property {number}      uptime: uptime live time of this Monitoring instance,
      *@property {number}      listenersCount - how many handler in the buckets 
      *@property {number}      totalEventsEmitted: how many event are saved in buffer in this live time 
      *@property {number}      totalEventsProcessed: how many event are proccessed handled by handler in this live time 
      *@property {number}      batchesProcessed: how many batch are proccessed batch size is 500 event by default
      *@property {number}      lastProcessTime:  last time processing is running 
      *@property {number}      eventsPerSecond: number of event handled in second 
      *@property {number}      queueSize: the que size  ,
      *@property {number}      droppedCount: how many event are dropped do to full que,
      *@property {Array<Array<string,number>}      eventCounts : each element is key value peer the key is event type and the value is counter 

      *@exports {SystemMonitorState}
*/

/**
 * @typedef {Object} AuditingOption
 * @property {number} maxBufferSize -- the maximum logs records this buffer can hold 
 * @property {number} flushIntervalMs -- it unit melli Second 
 * @property { path} logFilePath -- the path to file the need to save record to its
 * @property {Function} customPersistHandler -- you can provide function that can handl commited record into disk
 * 
 * @typedef {Object} AuditState
 * @property {number}    bufferSize: log buffer size 
 * @property {number}    totalRecorded: total record logs
 * @property {number}    totalPersisted: total commited record 
 * @property {boolean}   isFlushing: is flushing operation is runing 
 * @property {number}    flushIntervalMs: the duration between each flushing operation 
 * @property {boolean}   sTimerRunning - see if background timer worker run or not 
 */

/**
 * @typedef {Object} MonitoringInitOption
 * @property {number} maxBufferSize -- the maximum logs records this buffer can hold 
 * @property {number} flushIntervalMs -- it unit melli Second 
 * @property { path} logFilePath -- the path to file the need to save record to its
 * @property {boolean} auditEnabled -- enable auditing logger system 
 * @property {boolean} enabled -- enabled metrics system 
 * 
 * 
 * */