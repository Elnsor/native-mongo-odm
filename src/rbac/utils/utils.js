
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
    if (!ttl) return 0;

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
 * Helper to convert duration strings ("30s", "10m", "2h", "7d") into total seconds
 */
export function parseDurationStringToSeconds(str) {
    const match = str.trim().match(/^(\d+)([smhd])?$/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2] || 's'; // Default to seconds if no unit provided (e.g. "3600")

    switch (unit) {
        case 's': return value;            // Seconds
        case 'm': return value * 60;       // Minutes
        case 'h': return value * 3600;     // Hours
        case 'd': return value * 86400;    // Days
        default: return value;
    }
}