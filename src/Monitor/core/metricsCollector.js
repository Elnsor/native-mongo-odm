/**
 * this class contain type of metircs like counter and guages and histogram 
 * and contain method that handle this type of metrics 
 * this mithod can be user as handler (listener in SystemMonitors)
 */
export class MetricsCollector {
    #counters = new Map();
    #gauges = new Map();
    #histograms = new Map();
    constructor() {
    }

    /**
     * 
     * @param {string} name 
     * @param {Object} [labels={}] -- object like {name:nameValue,key,Value}
     * @returns
     * 
     *  @example
     * #buildKey("auth.check_access", { group: "ADMIN", parentId: 100 })
     * // result: "auth.check_access{group=ADMIN,parentId=100}" 
     */

    #buildKey(name, labels = {}) {
        const labelEntries = Object.entries(labels);
        if (labelEntries.length === 0) {
            return name;
        }
        const sortedLabels = labelEntries
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        return `${name}{${sortedLabels}}`;
    }

    /**
     * 
     * @param {string} name - event name  
     * @param {number} value -- it used to increment the counter metrices 
     * @param {object} labels -- it have prop that can concat with name to got the last name of this metrics
     * @returns {number} counter value for this metrics
     */
    increment(name, value = 1, labels = {}) {
        const key = this.#buildKey(name, labels);
     
        const current = this.#counters.get(key) || 0;
        const newValue = current + value;
        this.#counters.set(key, newValue);
        return newValue;
    }

 /**
     * 
     * @param {string} name - event name  
     * @param {number} value -- it used to state vale for this type of metrics if its buffer then maby size length  
     * @param {object} labels -- it have prop that can concat with name to got the last name of this metrics
     * @returns {number} counter value for this metrics
     */    
    setGauge(name, value, labels = {}) {
        const key = this.#buildKey(name, labels);
        this.#gauges.set(key, value);
        return value;
    }


    /**
     * 
     * @param {string} name - event name  
     * @param {number} value -- it used to state vale for this type of metrics if its used to calculate the total of this type 
     * for example if its time it sum of all duration and the min duretion and max duration and count how many this type are process and 
     * @param {object} labels -- it have prop that can concat with name to got the last name of this metrics
     * @param {string} unit --('ns', 'us', 'ms', 's', 'bytes', 'count', 'raw')
     * @returns {Object} histogram  
     */    
    observeHistogram(name, value, labels = {}, unit = 'raw') {
        
        const key = this.#buildKey(name, labels);
        let histogram = this.#histograms.get(key);
        
        if (!histogram) {
            histogram = {
                unit: unit,       
                sum: 0,
                count: 0,
                min: Infinity,
                max: -Infinity,
                values: []        //sample value
            };
        }
        
        histogram.sum += value;
        histogram.count++;
        histogram.min = Math.min(histogram.min, value);
        histogram.max = Math.max(histogram.max, value);
        
        // for sample arravy 
        histogram.values.push(value);
        if (histogram.values.length > 100) {
            histogram.values.shift();
        }
        
        this.#histograms.set(key, histogram);
        return histogram;
    }

    /**
     * format value for histgram units 
     * @private
     */
    #formatValue(value, unit) {
        if (value === Infinity || value === -Infinity || isNaN(value)) return '0';

        switch (unit) {
            
            case 'ns':
                if (value < 1000) return `${value.toFixed(0)}ns`;
                if (value < 1_000_000) return `${(value / 1000).toFixed(2)}μs`;
                if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(3)}ms`;
                return `${(value / 1_000_000_000).toFixed(3)}s`;
            
            case 'us':
                if (value < 1000) return `${value.toFixed(2)}μs`;
                if (value < 1_000_000) return `${(value / 1000).toFixed(3)}ms`;
                return `${(value / 1_000_000).toFixed(3)}s`;

            case 'ms':
                if (value < 1000) return `${value.toFixed(3)}ms`;
                return `${(value / 1000).toFixed(3)}s`;

            // bytes units B byte KB MB
            case 'bytes':
                if (value < 1024) return `${value.toFixed(0)}B`;
                if (value < 1_048_576) return `${(value / 1024).toFixed(2)}KB`;
                return `${(value / 1_048_576).toFixed(2)}MB`;

            // just counters 
            case 'count':
            case 'raw':
            default:
                return Number.isInteger(value) ? value.toString() : value.toFixed(2);
        }
    }

    /**
     * get middel sample or last higher sample 
     * p are 50 95 99 
     * @private
     */
    #percentile(sortedValues, p) {
        if (sortedValues.length === 0) return 0;
        const index = Math.ceil((p / 100) * sortedValues.length) - 1;
        return sortedValues[Math.max(0, index)];
    }

    /**
     * give us big picture of histogram 
     */
    snapshot() {
        const formattedHistograms = {};
        
        for (const [key, hist] of this.#histograms.entries()) {
            const sortedValues = [...hist.values].sort((a, b) => a - b);
            const avg = hist.count > 0 ? hist.sum / hist.count : 0;
            
            formattedHistograms[key] = {
                unit: hist.unit,
                count: hist.count,
                sum: this.#formatValue(hist.sum, hist.unit),
                avg: this.#formatValue(avg, hist.unit),
                min: hist.min === Infinity ? '0' : this.#formatValue(hist.min, hist.unit),
                max: hist.max === -Infinity ? '0' : this.#formatValue(hist.max, hist.unit),
                p50: this.#formatValue(this.#percentile(sortedValues, 50), hist.unit),
                p95: this.#formatValue(this.#percentile(sortedValues, 95), hist.unit),
                p99: this.#formatValue(this.#percentile(sortedValues, 99), hist.unit)
            };
        }

        return {
            counters: Object.fromEntries(this.#counters),
            gauges: Object.fromEntries(this.#gauges),
            histograms: formattedHistograms,
            timestamp: Date.now()
        };
    }

    getCount(name, labels = {}) {
        const key = this.#buildKey(name, labels);
        return this.#counters.get(key) || 0;
    }
    getGauge(name, labels = {}) {
        const key = this.#buildKey(name, labels);
        return this.#gauges.get(key);
    }
    getHistogram(name, labels = {}) {
        const key = this.#buildKey(name, labels);
        return this.#histograms.get(key);
    }
    /**
     * reset all type of metrics buckets 
     * @returns 
     */
    reset() {
        this.#counters.clear();
        this.#gauges.clear();
        this.#histograms.clear();
        return this;
    }
    /**
     * remove metrics from it buckets
     * @param {string} name- name of event name  
     * @param {*} labels -- used to concatenate wiht nam to got metrics name
     * @returns 
     */
    removeMetric(name, labels = {}) {
        const key = this.#buildKey(name, labels);
        const removed = 
            this.#counters.delete(key) ||
            this.#gauges.delete(key) ||
            this.#histograms.delete(key);
        return removed;
    }
    /**
     * git list for all buckets 
     */

    listMetrics() {
        return {
            counters: Array.from(this.#counters.keys()),
            gauges: Array.from(this.#gauges.keys()),
            histograms: Array.from(this.#histograms.keys())
        };
    }
    /**
     * get how many metics in each type of buckets
     * @returns 
     */
    getMetricsCount() {
        return {
            counters: this.#counters.size,
            gauges: this.#gauges.size,
            histograms: this.#histograms.size,
            total: this.#counters.size + this.#gauges.size + this.#histograms.size
        };
    }
}

