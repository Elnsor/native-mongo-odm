

/**
 * Lightweight LRU Cache with TTL support.
 * Zero dependencies. Uses Map insertion-order for O(1) eviction.
 * 
 * @example
 *   const cache = new LRUCache(500, 30_000); // 500 entries, 30s TTL
 *   cache.set('user_123', userObj);
 *   const hit = cache.get('user_123'); // userObj or undefined
 * */

export class LRUCache{
    #cache;
    #ttlMs;
    #hits;
    #misses;
    #maxSize;

    constructor(maxSize=500,ttlMs=30000){
        this.#cache=new Map();
        this.#ttlMs=ttlMs;
        this.#hits=0
        this.#misses=0;
        this.#maxSize=0;
    }

    /**
     * 
     * @param {string} key -- like user id
     * @returns {*} chached value or undefined  
     */
    get(key){

        const entry=this.#cache.get(key);

        // no key miss 
        if(!entry){
            this.#misses++;
            return undefined;

        }

        // expiration
        if((Date.now() - entry.ts) > this.#ttlMs){
            this.#cache.delete(key);
            this.#misses++;
            return undefined;
        }

        // found and not expire hits 
        this.#cache.delete(key);
        this.#cache.set(entry);
        this.#hits++;
        return entry.value;

    }

    set(key,value){

        /**if exist it remove it and insert new update */
        if(this.#cache.has(key)){
            this.#cache.delete(key);
        }

        // check size limit 
        if(this.#cache.size >= this.#maxSize){
            const oldestKey=this.#cache.keys().next().value;
            this.#cache.delete(oldestKey)
        }

        this.#cache.set(key,{value:value,ts:Date.now()});
    }

     /**
     * Invalidate a single entry (call when user data changes).
     * @param {string} key
     */
    delete(key){
        return this.#cache.delete(key);
    }
 /** @returns {number} Current number of entries */
    get size(){
        return this.#cache.size 

    }
     
    /** Remove all entries */
    clear(){
        this.#cache.clear()
    }
 
    /** @returns {{ hits: number, misses: number, hitRate: string ,size: number}} */
    get stats(){
            const total = this.#hits + this.#misses;
        return {
            hits:    this.#hits,
            misses:  this.#misses,
            hitRate: total === 0 ? '0%' : ((this.#hits / total) * 100).toFixed(1) + '%',
            size:    this.#cache.size,
        };
    }

    

}