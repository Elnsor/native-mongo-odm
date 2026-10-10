
/**
 * fast deep clone Object
 * @param {Object} obj 
 * @returns {Object} clone Object
 */
export function fastDeepClone(obj) {
    // for primitive values and  (null, undefined, numbers, strings, booleans)
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // to keep data type as it 
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Map) return new Map(obj);
    if (obj instanceof Set) return new Set(obj);
    if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);

    // for Array
    if (Array.isArray(obj)) {
        return obj.map(fastDeepClone);
    }

    // if prototype exists keep it 
    const clone = Object.create(Object.getPrototypeOf(obj));
    
    for (const key of Object.keys(obj)) {
        // for git its own props without prototype chain 
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            clone[key] = fastDeepClone(obj[key]);
        }
    }
    
    return clone;
}

/* Taxonomy Helpers */
export const isTaged = (resName) => !!TYPE_ID_TAG[TYPE_IDS[resName]];
export const isDefinedTaged = (resName) => {
    const pid = TYPE_IDS[resName];
    return !!(pid && TYPE_ID_TAG[pid]);
};
export const isdefine = (resName) => !!TYPE_IDS[resName];
export const hasChild = (resName) => {
    const pid = TYPE_IDS[resName];
    return !!(pid && RESOURCES_CHILD[pid]);
};
export const isChild = (parentName, childName) => {
    const pPid = TYPE_IDS[parentName];
    const cPid = TYPE_IDS[childName];
    return !!(RESOURCES_CHILD[pPid] && RESOURCES_CHILD[pPid].includes(cPid));
};
export const isListed = (list) => Array.isArray(list) && list.length > 0;

/**
 * Normalizes TTL input into an absolute future Unix timestamp (in seconds).
 * 
 * @param {string|number|null} ttl - Raw TTL input from the role object (e.g., 3600, "1h", "2d")
 * @returns {number} Absolute Unix timestamp in seconds, or 0 if no TTL/permanent
 */
export function normalizeTTLToTimestamp(ttl) {
    let targetTimeStamp;
    if(ttl === 0) return 0;
    if (!ttl) return -1;

    const nowInSeconds = Math.floor(Date.now() / 1000);

    // Case 1: Pure Number -> Treat as relative SECONDS to add to current time
    if (typeof ttl === 'number') {
        // If it's a relative offset (e.g., 3600), add to current time.
        // If it's already an absolute Unix epoch (e.g. 1783084800), return as-is.
        const isAbsoluteEpoch = ttl > 1000000000;
       targetTimeStamp= isAbsoluteEpoch ? ttl : nowInSeconds + ttl;
    }

    // Case 2: String Duration -> Parse unit and add to current time
    if (typeof ttl === 'string') {
        const seconds = parseDurationStringToSeconds(ttl);
        if(seconds<0) return seconds;
        targetTimeStamp= seconds > 0 ? nowInSeconds + seconds : 0;
       
    }

   const MAX_UINT32 = 4294967295; // max number for uint32ArrayBuffer

    if (typeof targetTimeStamp !== 'number' || isNaN(targetTimeStamp) || targetTimeStamp < 0) {
        return 0;
    }
 
    if (targetTimeStamp > MAX_UINT32) {
        // Auto-detect accidental millisecond timestamps and convert to seconds
        targetTimeStamp = Math.floor(targetTimeStamp / 1000);
    }

    // Guard against overflow wrapping in Uint32Array
   
    return Math.min(targetTimeStamp, MAX_UINT32);
}

/**
 * Parses a duration string into an equivalent total number of seconds.
 * 
 * Supports flexible combinations of time units and ignores whitespace.
 * Pure numeric strings are treated as raw seconds.
 * 
 * Supported Units:
 * - `s` : Seconds
 * - `m` : Minutes
 * - `h` : Hours
 * - `d` : Days
 * - `w` or `W` : Weeks (calculated as 7 days)
 * - `M` : Months (calculated as 30 days)
 * - `y` or `Y` : Years (calculated as 365 days)
 *
 * @param {string} str - The duration string to parse (e.g., "1d 12h", "30m", "3600", "1Y 2M").
 * @returns {number} The total duration in seconds, or `-1` if the input is invalid or malformed.
 * 
 * @example
 * parseDurationStringToSeconds("3600");         // Returns: 3600
 * parseDurationStringToSeconds("1h 30m");       // Returns: 5400
 * parseDurationStringToSeconds("1d12h");        // Returns: 129600
 * parseDurationStringToSeconds("1Y 2M 3w");     // Returns: 39139200
 * parseDurationStringToSeconds("10h invalid");  // Returns: -1
 * */

export function parseDurationStringToSeconds(str) {
    if (typeof str !== 'string') return -1;
    const trimmed = str.trim();
    if(trimmed === "") return -1;
    
    // Pure number defaults to seconds (e.g., "3600")
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }

    // Remove all whitespace to allow flexible formats like "1d 10h" or "1d10h"
    const cleaned = trimmed.replace(/\s+/g, '');
    
    // Regex to match number + unit combinations
    // Y/y = Year, M = Month, W/w = week , d = day, h = hour, m = minute, s = second
    const regex = /(\d+)([YyWwMdhms])/g;
    
    //  Strict Validation: Ensure the ENTIRE string is composed of valid chunks
    const reconstructed = cleaned.replace(regex, '');
    if (reconstructed.length > 0) {
        return -1; // Invalid characters or unsupported format found
    }

    let totalSeconds = 0;
    let match;
    
    // Reset regex index to ensure proper iteration
    regex.lastIndex = 0;
    
    // 4. Calculate total seconds from all matched chunks
    while ((match = regex.exec(cleaned)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        
        switch (unit) {
            case 'y':
            case 'Y':
                totalSeconds += value * 31536000; // 1 Year = 365 Days
                break;
            case 'w':
            case 'W':
                totalSeconds += value * 604800;    // Weeks (7 days * 86400 seconds)
                break;
            case 'M':
                totalSeconds += value * 2592000;  // 1 Month = 30 Days
                break;
            case 'd':
                totalSeconds += value * 86400;    // 1 Day = 24 Hours
                break;
            case 'h':
                totalSeconds += value * 3600;     // 1 Hour = 60 Minutes
                break;
            case 'm':
                totalSeconds += value * 60;       // 1 Minute = 60 Seconds
                break;
            case 's':
                totalSeconds += value;            // Seconds
                break;
        }
    }
    
    return totalSeconds;
}
