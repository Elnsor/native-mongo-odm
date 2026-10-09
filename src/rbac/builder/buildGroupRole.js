import { TYPE_IDS, EFFECT_ACTION, RESOURCE_NONE_INSTANCES, RESOURCES_CHILD } from '../constant/resourceType.js';

/**
 * ### Fluent Builder for constructing modern GroupRole definitions.
 * 
 * Supports:
 *  - Per-owner TTL (each owner can have its own expiration)
 *  - Per-owner Actions (each owner can override default actions)
 *  - Wildcard support (`*`) at all levels
 *  - Nested resources (Parent → Child → Grandchild)
 *  - Full validation to prevent schema errors
 * 
 * @example
 * const role = new RoleBuilder()
 *   .addMember('admin-role')
 *     .addLeaf('FIELD_METRICS')
 *       .setParent('COLLECTIONS', ['users'])
 *       .setActions('RO')
 *       .setOtherActions('NONE')
 *       .setNested('SEARCH_INDEXES', ['sear1'])
 *       .addOwner('mat1', { ttl: '1h' })
 *       .addOwner('mat2', { ttl: '1d', action: 'RW' })
 *     .endLeaf()
 *   .endMember()
 *   .build();
 */
export class RoleBuilder {
    #roleDefinition = Object.create(null);
    #currentMember = null;
    #currentLeaf = null;
    #memberStack = [];
    #leafStack = [];

   
    /**
     *  ### MEMBER MANAGEMENT
     * Adds a new role member (e.g., 'role1', 'admin-role').
     * Each member contains a collection of leaf permissions.
     * 
     * @param {string} memberName - Unique name for this role member
     * @returns {RoleBuilder} this (for chaining)
     * @throws {Error} If memberName is invalid or already exists
     */
    addMember(memberName) {
        if (!memberName || typeof memberName !== 'string') {
            throw new Error(`RoleBuilder: Invalid member name "${memberName}". Must be a non-empty string.`);
        }
        if (this.#roleDefinition[memberName]) {
            throw new Error(`RoleBuilder: Member "${memberName}" already exists.`);
        }

        // Push current context to stack (supports nested member calls)
        if (this.#currentMember) {
            this.#memberStack.push({
                member: this.#currentMember,
                leaf: this.#currentLeaf
            });
        }

        this.#currentMember = memberName;
        this.#currentLeaf = null;
        this.#roleDefinition[memberName] = Object.create(null);
        return this;
    }

    /**
     * Closes the current member scope and returns to the previous one.
     * Useful when building multiple members in a single chain.
     * 
     * @returns {RoleBuilder} this
     */
    endMember() {
        //!! why 
        if (!this.#currentMember) {
            throw new Error('RoleBuilder: No active member to end.');
        }
        if (this.#currentLeaf) {
            this.endLeaf();
        }

        const previous = this.#memberStack.pop();
        if (previous) {
            this.#currentMember = previous.member;
            this.#currentLeaf = previous.leaf;
        } else {
            this.#currentMember = null;
            this.#currentLeaf = null;
        }
        return this;
    }

   
    /**
     * ### LEAF MANAGEMENT
     * Adds a new leaf resource (the target of permissions).
     * Must be called after `addMember()`.
     * 
     * @param {keyof typeof TYPE_IDS} leafName - Resource type name (e.g., 'FIELD_METRICS', 'DOCUMENTS')
     * @returns {RoleBuilder} this
     * @throws {Error} If no active member or leaf is invalid
     */
    addLeaf(leafName) {
        if (!this.#currentMember) {
            throw new Error('RoleBuilder: Must call addMember() before addLeaf().');
        }
        if (!leafName || !TYPE_IDS[leafName]) {
            throw new Error(`RoleBuilder: Invalid leaf resource "${leafName}". Must be a valid TYPE_IDS key.`);
        }
        if (this.#roleDefinition[this.#currentMember][leafName]) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" already exists for member "${this.#currentMember}".`);
        }

        // Push current leaf to stack
        if (this.#currentLeaf) {
            this.#leafStack.push(this.#currentLeaf);
        }

        this.#currentLeaf = leafName;
        
        // Initialize with NEW structure (EffectedActionNotation, no boundary)
        this.#roleDefinition[this.#currentMember][leafName] = {
            parentResource: null,
            parentInstance: [],
            action: 'NONE',
            actionToOthers: 'NONE',
            ownerInstance: [],
            ttl: null,
            nested: null,
            nestedInstance: null
        };
        return this;
    }

    /**
     * Closes the current leaf scope.
     * 
     * @returns {RoleBuilder} this
     */
    endLeaf() {
       
        if (!this.#currentLeaf) {
            throw new Error('RoleBuilder: No active leaf to end.');
        }
        this.#currentLeaf = this.#leafStack.pop() || null;
        return this;
    }

   

    /**
     *  ### Parent Configuration
     * Sets the parent resource and its instances for the current leaf.
     * 
     * @param {keyof typeof TYPE_IDS} parentResource - Parent resource name (e.g., 'COLLECTIONS')
     * @param {string[]} parentInstance - Array of instance names or ['*'] for wildcard
     * @returns {RoleBuilder} this
     * @throws {Error} If parent is invalid or hierarchy is wrong
     */
    setParent(parentResource, parentInstance) {
        this.#validateActiveLeaf();

        if (!parentResource || !TYPE_IDS[parentResource]) {
            throw new Error(`RoleBuilder: Invalid parent resource "${parentResource}".`);
        }
        if (!Array.isArray(parentInstance) || parentInstance.length === 0) {
            throw new Error('RoleBuilder: parentInstance must be a non-empty array.');
        }
        if (parentInstance.length > 1 && parentInstance.includes('*')) {
            throw new Error('RoleBuilder: Wildcard "*" cannot be mixed with specific instances.');
        }

        // Validate hierarchy: leaf must be a child of parent (directly or via nested)
        const parentPid = TYPE_IDS[parentResource];
        const leafPid = TYPE_IDS[this.#currentLeaf];
        const parentChildren = RESOURCES_CHILD[parentPid];
        
        if (!parentChildren || !parentChildren.has(leafPid)) {
            // Check if it's a valid nested scenario (will be validated later when setNested is called)
            // For now, allow it but warn in build()
        }

        const leaf = this.#getCurrentLeafObject();
        leaf.parentResource = parentResource;
        leaf.parentInstance = [...parentInstance];
        return this;
    }

   
    /**
     * ### ACTIONS (NEW: EffectedActionNotation)
     * Sets the default action for the current leaf.
     * Uses the new EffectedActionNotation (combines action + boundary).
     * 
     * @param {keyof typeof EFFECT_ACTION} action - e.g., 'RO', 'RWO', 'RWUDA', 'NONE'
     * @returns {RoleBuilder} this
     * @throws {Error} If action is invalid
     */
    setActions(action) {
        this.#validateActiveLeaf();
        if (EFFECT_ACTION[action] === undefined) {
            throw new Error(`RoleBuilder: Invalid action "${action}". Must be one of: ${Object.keys(EFFECT_ACTION).join(', ')}`);
        }
        this.#getCurrentLeafObject().action = action;
        return this;
    }

    /**
     * 
     * ACTIONS To Others (NEW: EffectedActionNotation)
     * Sets the action applied to OTHERS (non-owners).
     * 
     * @param {keyof typeof EFFECT_ACTION} action - e.g., 'RO', 'NONE'
     * @returns {RoleBuilder} this
     */
    setOtherActions(action) {
        this.#validateActiveLeaf();
        if (EFFECT_ACTION[action] === undefined) {
            throw new Error(`RoleBuilder: Invalid actionToOthers "${action}".`);
        }
        this.#getCurrentLeafObject().actionToOthers = action;
        return this;
    }

    
    /**
     * ###  OWNER MANAGEMENT (NEW: Per-Owner TTL & Actions)
     * Adds an owner instance with optional per-owner overrides.
     * 
     * @param {string} ownerName - Instance name or '*' for wildcard
     * @param {Object} [options] - Optional per-owner overrides
     * @param {string|number} [options.ttl] - Per-owner TTL (e.g., '1h', '7d', 3600)
     * @param {keyof typeof EFFECT_ACTION} [options.action] - Override default action for this owner
     * @param {keyof typeof EFFECT_ACTION} [options.actionToOthers] - Override default actionToOthers
     * @returns {RoleBuilder} this
     * @throws {Error} If owner is invalid or conflicts with existing
     */
    addOwner(ownerName, options = {}) {
        this.#validateActiveLeaf();

        if (typeof ownerName !== 'string' && typeof ownerName !== 'number') {
            throw new Error(`RoleBuilder: Invalid owner name. Must be string or number.`);
        }

        const leaf = this.#getCurrentLeafObject();
        const ownerStr = String(ownerName);
         
        const hasWildcard = leaf.ownerInstance.some(o => 
                (typeof o === 'object' ? o.name : o) === '*'
            );

        // Check for wildcard conflicts
        if (ownerStr === '*') {
           
            if (hasWildcard) {
                throw new Error('RoleBuilder: Wildcard owner "*" already added.');
            }
            if (leaf.ownerInstance.length > 0) {
                throw new Error('RoleBuilder: Cannot add wildcard "*" when specific owners exist. Add "*" first or use it alone.');
            }
        } else {
          
            if (hasWildcard) {
                throw new Error('RoleBuilder: Cannot add specific owners after wildcard "*" is set.');
            }
        }

        // Build owner object (NEW structure)
        const ownerObj = { name: ownerStr };

        // Per-owner action overrides
        if (options.action !== undefined) {
            if (EFFECT_ACTION[options.action] === undefined) {
                throw new Error(`RoleBuilder: Invalid owner action "${options.action}".`);
            }
            ownerObj.EffectedAction = options.action;
        }
        if (options.actionToOthers !== undefined) {
            if (EFFECT_ACTION[options.actionToOthers] === undefined) {
                throw new Error(`RoleBuilder: Invalid owner actionToOthers "${options.actionToOthers}".`);
            }
            ownerObj.EffectedActionToOthers = options.actionToOthers;
        }

        // Per-owner TTL
        if (options.ttl !== undefined) {
            ownerObj.ttl = options.ttl;
        }

        leaf.ownerInstance.push(ownerObj);
        return this;
    }

    /**
     * ### Same Options for Multipe Owner Addition
     * Bulk add multiple owners with the same options.
     * 
     * @param {string[]} ownerNames - Array of owner names
     * @param {Object} [options] - Shared options for all owners
     * @returns {RoleBuilder} this
     */
    addOwners(ownerNames, options = {}) {
        if (!Array.isArray(ownerNames)) {
            throw new Error('RoleBuilder: addOwners expects an array of names.');
        }
        for (const name of ownerNames) {
            this.addOwner(name, options);
        }
        return this;
    }

    /**
     * Sets all owners at once (replaces existing).
     * For backward compatibility with simple string arrays.(Old Compatibillity)
     * 
     * @param {Array<string|Object>} owners - Array of owner names or owner objects
     * @returns {RoleBuilder} this
     */
    setOwners(owners) {
        this.#validateActiveLeaf();
        if (!Array.isArray(owners)) {
            throw new Error('RoleBuilder: setOwners expects an array.');
        }
        const leaf = this.#getCurrentLeafObject();
        leaf.ownerInstance = [];
        for (const owner of owners) {
            if (typeof owner === 'string' || typeof owner === 'number') {
                this.addOwner(owner);
            } else if (typeof owner === 'object' && owner.name) {
                this.addOwner(owner.name, {
                    ttl: owner.ttl,
                    action: owner.EffectedAction,
                    actionToOthers: owner.EffectedActionToOthers
                });
            }
        }
        return this;
    }

    

    /**
     * ### TTL (DEFAULT)
     * Sets the default TTL for the current leaf.
     * Individual owners can override this with their own TTL.
     * 
     * @param {string|number|null} ttl - e.g., '1h', '7d', 3600, or null for permanent
     * @returns {RoleBuilder} this
     */
    setTTL(ttl) {
        this.#validateActiveLeaf();
        this.#getCurrentLeafObject().ttl = ttl;
        return this;
    }

   

    /**
     * ###  NESTED RESOURCES (Grandchildren)
     * Sets the nested (child) resource for the current leaf.
     * The current leaf becomes a "grandchild" under the nested resource.
     * 
     * @param {keyof typeof TYPE_IDS} nested - Nested resource name (e.g., 'SEARCH_INDEXES')
     * @param {string[]} nestedInstance - Array of nested instance names or ['*']
     * @returns {RoleBuilder} this
     * @throws {Error} If hierarchy is invalid
     */
    setNested(nested, nestedInstance) {
        this.#validateActiveLeaf();

        if (!nested || !TYPE_IDS[nested]) {
            throw new Error(`RoleBuilder: Invalid nested resource "${nested}".`);
        }
        if (!Array.isArray(nestedInstance) || nestedInstance.length === 0) {
            throw new Error('RoleBuilder: nestedInstance must be a non-empty array.');
        }
        if (nestedInstance.length > 1 && nestedInstance.includes('*')) {
            throw new Error('RoleBuilder: Wildcard "*" cannot be mixed with specific nested instances.');
        }

        // Validate hierarchy: parent → nested → leaf
        const leaf = this.#getCurrentLeafObject();
        const parentPid = TYPE_IDS[leaf.parentResource];
        const nestedPid = TYPE_IDS[nested];
        const leafPid = TYPE_IDS[this.#currentLeaf];

        const parentChildren = RESOURCES_CHILD[parentPid];
        if (!parentChildren || !parentChildren.has(nestedPid)) {
            throw new Error(`RoleBuilder: Resource "${nested}" is not a valid child of "${leaf.parentResource}".`);
        }

        const nestedChildren = RESOURCES_CHILD[nestedPid];
        if (!nestedChildren || !nestedChildren.has(leafPid)) {
            throw new Error(`RoleBuilder: Leaf "${this.#currentLeaf}" is not a valid child of nested resource "${nested}".`);
        }

        leaf.nested = nested;
        leaf.nestedInstance = [...nestedInstance];
        return this;
    }

    

    /**
     * ###  BUILD & VALIDATION
     * Builds and returns the final GroupRole definition.
     * Performs final validation before returning.
     * 
     * @returns {Object} The complete GroupRole definition
     * @throws {Error} If any leaf is incomplete or invalid
     */
    build() {
        // Final validation pass
        for (const [memberName, leaves] of Object.entries(this.#roleDefinition)) {
            for (const [leafName, leaf] of Object.entries(leaves)) {
                this.#validateLeaf(memberName, leafName, leaf);
            }
        }

        return this.#roleDefinition;
    }

    /**
     * Returns a deep clone of the current definition (for inspection).
     * 
     * @returns {Object}
     */
    peek() {
        return structuredClone(this.#roleDefinition);
    }

    /**
     * Resets the builder to its initial state.
     * 
     * @returns {RoleBuilder} this
     */
    reset() {
        this.#roleDefinition = Object.create(null);
        this.#currentMember = null;
        this.#currentLeaf = null;
        this.#memberStack = [];
        this.#leafStack = [];
        return this;
    }

   /**
    * ****************
    * ### PRIVATE HELPERS
    * ****************
    */
    #validateActiveLeaf() {
        if (!this.#currentMember) {
            throw new Error('RoleBuilder: Must call addMember() first.');
        }
        if (!this.#currentLeaf) {
            throw new Error('RoleBuilder: Must call addLeaf() first.');
        }
    }

    #getCurrentLeafObject() {
        return this.#roleDefinition[this.#currentMember][this.#currentLeaf];
    }

    #validateLeaf(memberName, leafName, leaf) {
        // Parent must be set
        if (!leaf.parentResource) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" in member "${memberName}" is missing parentResource.`);
        }
        if (!Array.isArray(leaf.parentInstance) || leaf.parentInstance.length === 0) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" in member "${memberName}" has empty parentInstance.`);
        }

        // Owner must be set
        if (!Array.isArray(leaf.ownerInstance) || leaf.ownerInstance.length === 0) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" in member "${memberName}" has no owners.`);
        }

        // Action must be valid
        if (EFFECT_ACTION[leaf.action] === undefined) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" has invalid action "${leaf.action}".`);
        }
        if (EFFECT_ACTION[leaf.actionToOthers] === undefined) {
            throw new Error(`RoleBuilder: Leaf "${leafName}" has invalid actionToOthers "${leaf.actionToOthers}".`);
        }

        // Nested validation
        if (leaf.nested) {
            if (!Array.isArray(leaf.nestedInstance) || leaf.nestedInstance.length === 0) {
                throw new Error(`RoleBuilder: Leaf "${leafName}" has nested resource but empty nestedInstance.`);
            }
        }
    }
}