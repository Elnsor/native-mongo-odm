import { SystemMonitor } from './core/systemMonitor.js'
import { MetricsCollector } from './core/metricsCollector.js';
import { AuditLogger } from './core/auditLogger.js';



export class MonitoringSystem {
    static #instance = null;
    /**@type {SystemMonitor} */
    #monitor;
    /**@type {MetricsCollector} */
    #collector;
    /**@type {AuditLogger} */
    #audit=null;
    #enabled = false;
    #auditEnabled = false;
    #eventHandlers = new Map(); // ✅ Handler Registry O(1)
    #evenHandlersSize = 0;
    #domains = {
        global: { metrics: true, audit: true },
        rbac: { metrics: true, audit: true },
        framework: { metrics: true, audit: true },
        auth: { metrics: true, audit: true },
        database: { metrics: true, audit: true }
    };

    constructor() {
        if (MonitoringSystem.#instance) return MonitoringSystem.#instance;
        this.#monitor = SystemMonitor.getInstance();
        this.#collector = new MetricsCollector();
        MonitoringSystem.#instance = this;
    }

    static getInstance() {
        if (!MonitoringSystem.#instance) MonitoringSystem.#instance = new MonitoringSystem();
        return MonitoringSystem.#instance;
    }

    initialize(options = {}) {

        this.#enabled = options.enabled ?? true;
      
        this.#auditEnabled = options.auditEnabled ?? false;

        if (this.#enabled) {
            this.#monitor.enable();
            this.#monitor.subscribe((eventType, eventMType, data) => {
                const typeHandlers = this.#eventHandlers.get(eventType);
                if (!typeHandlers) return;


                if (eventMType !== undefined && typeHandlers.has(eventMType)) {
                    
                    for (const handler of typeHandlers.get(eventMType)) {
                        try { handler(data, this.#collector); }
                        catch (e) { console.error('[Monitoring] Handler error:', e); }
                    }
                } else if (eventMType === undefined) {

                    for (const mtypeSet of typeHandlers.values()) {
                        for (const handler of mtypeSet) {
                            try { handler(data, this.#collector); }
                            catch (e) { console.error('[Monitoring] Handler error:', e); }
                        }
                    }
                }
            });
        }

        if (this.#auditEnabled) {
            this.#audit = new AuditLogger({
                maxBufferSize: options.maxBufferSize ?? 1000,
                flushIntervalMs: options.flushIntervalMs ?? 5000,
                logFilePath: options.logFilePath ?? null
            });
        }
        return this;
    }

    /**
     * 
     * @param {String} domainName -- its Domain name or the app name need to record its metrics  
     * @param {boolean} metricsEnabled -- if true means the metrics collector for this domain is work if false then its stop 
     * @param {boolean} auditEnabled -- if true means autidlogger is work for this domain and if its false then its stop 
     */
    setDomainConfig(domainName, metricsEnabled, auditEnabled) {
        if (!this.#domains[domainName]) {
            this.#domains[domainName] = { metrics: true, audit: true };
        }
        if (metricsEnabled !== undefined) this.#domains[domainName].metrics = metricsEnabled;
        if (auditEnabled !== undefined) this.#domains[domainName].audit = auditEnabled;
        //console.log(`[Monitoring] Domain '${domainName}' config updated: metrics=${this.#domains[domainName].metrics}, audit=${this.#domains[domainName].audit}`);
    }

    /**
     * // return metric and audit state for this domain 
     * @param {String} domainName 
     * @returns 
     */
    getDomainConfig(domainName) {
        return this.#domains[domainName] || this.#domains['global'];
    }

    // for register metrics handlers
    registerHandler(eventType, mtype, handler) {
        if (!this.#eventHandlers.has(eventType)) {
            this.#eventHandlers.set(eventType, new Map());
        }
        const typeHandlers = this.#eventHandlers.get(eventType);

        if (!typeHandlers.has(mtype)) {
            typeHandlers.set(mtype, new Set());
        }
        typeHandlers.get(mtype).add(handler);
    }


    record(domain, eventType, eventMtype, v1 = 0, v2 = 0, v3 = 0, v4 = 0) {

        if (!this.#enabled) return false;

        const domainConfig = this.#domains[domain] || this.#domains['global'];
        if (!domainConfig.metrics) return false

        return this.#monitor.emit(eventType, eventMtype, v1, v2, v3, v4);
    }

    auditLog(domain, action, actor, resource, outcome, metadata = {}) {

        if (!this.#auditEnabled) return false;

        const domainConfig = this.#domains[domain] || this.#domains['global'];
        if (!domainConfig.audit) return false;
        if (this.#auditEnabled && this.#audit) {
            this.#audit.log(action, actor, resource, outcome, metadata);
        }
    }

    getMetricsSnapshot() {
        return {
            metrics: this.#collector.snapshot(),
            monitor: this.#monitor.getStats(),
            audit: this.#audit?.getStats() || null
        };
    }
    async getSyncMetricsSnapshot() {

        await this.#monitor.flushSyncAsync();
        return this.getMetricsSnapshot();


    }
    getHealthStatus() {
        return {
            status: 'healthy',
            enabled: this.#enabled,
            auditEnabled: this.#auditEnabled,
            domains: { ...this.#domains },
            uptime: this.#monitor.getStats().uptime,
            queueSize: this.#monitor.getStats().queueSize,
            droppedEvents: this.#monitor.getStats().droppedCount,
            totalEvents: this.#monitor.getStats().totalEventsEmitted
        }
    }
    getRegisterdHandler() {
        return this.#eventHandlers.entries();
    }
    async shutdown() {
        console.log(`[Monitoring] Shuting Down start ....`);
        this.#monitor.disable();
        this.#enabled=false;

       
        

        if (this.#audit) {
            this.#audit.stopAutoFlush();
            await this.#audit.flush()
            this.#auditEnabled=false;
          
        }
    }
  static resetInstance() {
        if (MonitoringSystem.#instance) {
            MonitoringSystem.#instance.monitor.disable();
            MonitoringSystem.#instance.collector.reset()
            MonitoringSystem.#instance.eventHandlers.clear();
            if (MonitoringSystem.#instance.audit) {
                MonitoringSystem.#instance.audit.stopAutoFlush();
            }
        }
        MonitoringSystem.#instance = null;
        SystemMonitor.resetInstance();
    }
    // Getters
    get monitor() { return this.#monitor; }
    get collector() { return this.#collector; }
    get audit() { return this.#audit; }
    get isEnabled() { return this.#enabled; }
    get isAuditEnabled() { return this.#auditEnabled; }
    get domains(){ return this.#domains}
    get eventHandlers(){
        return this.#eventHandlers
    }
}

/** helper Monitoring function used as udapter to deal with this monitoring system */
/**
 *
 */
/**
 *@import {MonitoringInitOption} from './constant/typeDef.js'
 * @param {MonitoringInitOption} opts 
 * @returns 
 */
export const initializeMonitoring = (opts) => MonitoringSystem.getInstance().initialize(opts);
export const getMonitoring = () => MonitoringSystem.getInstance();
export const record = (domain, type, mtype, v1, v2, v3, v4) => getMonitoring().record(domain, type, mtype, v1, v2, v3, v4)
export const auditLog = (domain, action, actor, resource, outcome, meta) => getMonitoring().auditLog(domain, action, actor, resource, outcome, meta);
export const getMetricsSnapshot = () => getMonitoring().getMetricsSnapshot();
export const getMonitoringHealthStatus = () => getMonitoring().getHealthStatus();
export const shutdownMonitoring = () => getMonitoring().shutdown();
export const getEventsHandler = () => getMonitoring().getRegisterdHandler();
export const getSyncMetricsSnapshot = () => getMonitoring().getSyncMetricsSnapshot(); 
export const setDomainConfig = (domainName,metricsEnable,auditEnable) => getMonitoring().setDomainConfig(domainName,metricsEnable,auditEnable)