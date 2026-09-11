

/**
 *@import {ResourcesName,RoleElementObject,ActionEffect,BoundaryStrategy} from './../constant/typesDef.js'
 */


export class RoleBuilder {
    #roleDefinition = {};
    #currentMember = null;
    #currentLeaf = null;

    /**
     add Role Member 
     * @param {string} memberName - name of Role Member any
     * @returns {RoleBuilder}
     */
    addMember(memberName) {
        this.#currentMember = memberName;
        this.#roleDefinition[memberName] ??= Object.create(null);
        return this;
    }

    /**
     * Add Leaf to roleMember 
     * @param {import("../constant/typesDef.js").ResourcesName} leafName - 
     * @returns {RoleBuilder}
     */
    addLeaf(leafName) {
        if (!this.#currentMember) {
            throw new Error('Must add member first');
        }
        this.#currentLeaf = leafName;
       /**
        * @type {RoleElementObject}
        */
        this.#roleDefinition[this.#currentMember][leafName] =  
        {
        
            parentResource: null,
            parentInstance: [],
            action: [],
            boundary: "OWN",
            actionToOthers: "NONE",
            boundaryToOthers: "NONE",
            ownerInstance: [],
            ttl: null,
            nested: null,
            nestedInstance: null
        };
        return this;
    }

    /**
     * add to parent resource and its instances
     * @param {ResourcesName} parentResource
     * @param {string[]} parentInstance
     * @returns {RoleBuilder}
     */
    setParent(parentResource, parentInstance) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].parentResource = parentResource;
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].parentInstance = parentInstance;
        return this;
    }

    /**
     * add actions 
     * @param {Array<ActionEffect>} actions
     * @returns {RoleBuilder}
     */
    setActions(actions) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].action = actions;
        return this;
    }

    /**
     *  boundary
     * @param {BoundaryStrategy} boundary
     * @returns {RoleBuilder}
     */
    setBoundary(boundary) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].boundary = boundary;
        return this;
    }

/**
     * OthersAction
     * @param {Array<ActionEffect>} actions
     * @returns {RoleBuilder}
     */
    setOtherActions(actions) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].actionToOthers = actions;
        return this;
    }

    /**
     * Othersboundary
     * @param {BoundaryStrategy} boundary
     * @returns {RoleBuilder}
     */
    setOthersBoundary(boundary) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].boundaryToOthers = boundary;
        return this;
    }

    /**
     * add owner instances
     * @param {string[]} ownerInstance
     * @returns {RoleBuilder}
     */
    setOwnerInstances(ownerInstance) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].ownerInstance = ownerInstance;
        return this;
    }

    /**
     * add TTL
     * @param {string} ttl
     * @returns {RoleBuilder}
     */
    setTTL(ttl) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].ttl = ttl;
        return this;
    }

    /**
     * its child that have child 
     * تested (GrandChild)
     * @param {ResourcesName} nested
     * @param {string[]} nestedInstance
     * @returns {RoleBuilder}
     */
    setNested(nested, nestedInstance) {
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].nested = nested;
        this.#roleDefinition[this.#currentMember][this.#currentLeaf].nestedInstance = nestedInstance;
        return this;
    }

    /**
     * get GroupRole 
     * @returns {Object}
     */
    build() {
       
        return this.#roleDefinition;
    }
}