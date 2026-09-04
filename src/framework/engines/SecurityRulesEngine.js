import { coreSystemManageTypes } from "../../strategies/coreSystemManageTypes.js";
import { schemaManager } from "../../validation/schemaManager.js";
import { AppError } from "../appError.js";

class SecurityRulesEngine {

    constructor() {
        this.core = coreSystemManageTypes;
        this.customCore = {};
    }

    /**
     * Safely reads a value from a nested object path (e.g., "accountInfo.email")
     */
    _getNestedValue(obj, path) {
        if (!path || !obj) return undefined;
        if (!path.includes('.')) return obj[path];

        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length; i++) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[keys[i]];
        }

        return current;
    }

    /**
     * Sets a value on a nested object path, building missing parent nodes automatically
     */
    _setNestedValue(obj, path, value) {
        if (!path.includes('.')) {
            obj[path] = value;
            return;
        }

        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    registerCustomCore(type, executionStrategy, optParams = {}) {
        if (this.core[type]) {
            throw new Error(`Framework Error: Can Not overwriting existing built-in Core Type ${type}`);
        } else if (this.customCore[type]) {
            throw new Error(`Framework Error: Can Not overwriting existing Custom Core Type ${type}`);
        }

        if (typeof executionStrategy !== 'function') {
            throw new Error(`Framework Error: Custom Core Type ${type} strategy must be function`);
        }

        this.customCore[type] = { params: optParams, strategy: executionStrategy };
    }

    

    async evalRoles(collectionName, sanitizeDoc, currentDoc, userContextRole, isUpdate = false) {

        // Synchronously load registered schema from memory
        const baseSchema = await schemaManager.getSchema(collectionName);
        const schemaBlueprint = baseSchema.properties;
        const blueprintkey = Object.getOwnPropertyNames(schemaBlueprint);

        const customCoreFunction = [];

        for (let i = 0; i < blueprintkey.length; i++) {

            const fieldName = blueprintkey[i];
            const fieldDefinition = schemaBlueprint[fieldName];
            const appRoles = fieldDefinition.appRoles;
    //console.log("-------------",fieldDefinition)
            // Skip container objects; evaluate leaf properties directly
            if (fieldDefinition.mongoRoles?.bsonType === 'object') {
                continue;
            }

            // Extract values using dot-notation path resolution
            const oldValue = currentDoc ? this._getNestedValue(currentDoc, fieldName) : undefined;
            const newValue = this._getNestedValue(sanitizeDoc, fieldName);

            // 1. Restricted Roles Enforcement
            if (appRoles.restrictedRoles && Array.isArray(appRoles.restrictedRoles)) {

                if (newValue !== undefined && newValue !== oldValue) {
                    const userRoles = userContextRole?.role || [];
                    const hasAccess = appRoles.restrictedRoles.some(role => userRoles.includes(role));

                    if (!hasAccess) {
                        throw new AppError(`Security Exception: Unauthorized access to modify privileged restricted field '${fieldName}'.`, 403);
                    }
                }
            }

            // 2. Immutability Enforcement
            if (isUpdate && appRoles.immutable) {

                if (newValue !== undefined) {
                    if (oldValue === undefined && appRoles.strictImmutable) {
                        throw new AppError(`Security Error: Field "${fieldName}" is strictly immutable and cannot be initialized during an update operation.`, 403);
                    }
                    if (oldValue !== undefined && oldValue !== newValue) {
                        throw new AppError(`Security Error: Not allowed to modefied immutable Field "${fieldName}"`, 403);
                    }
                }
            }
 
            // 3. System-Managed Fields Evaluation
            if (appRoles.managedBySystem) {

                if (!appRoles.managedBySystem.type) continue;
                if (isUpdate && appRoles.immutable && oldValue !== undefined) continue;

                const appRoleType = appRoles.managedBySystem.type;
     
                if (this.core[appRoleType]) {
                   
                    const generatedValue = this.core[appRoleType](sanitizeDoc, appRoles.managedBySystem.params);
                           

                    this._setNestedValue(sanitizeDoc, fieldName, generatedValue);
                    
                } else if (this.customCore[appRoleType]) {
                    customCoreFunction.push({
                        fieldName,
                        strategy: this.customCore[appRoleType].strategy,
                        options: appRoles.managedBySystem
                    });
                   


                } else {
                    throw new AppError(`Framework Configuration Error: Unknown system-managed type strategy '${appRoleType}' on field '${fieldName}'`, 500);
                }
            }
        } // end for

        // Execute Custom System-Managed Functions
        for (let j = 0; j < customCoreFunction.length; j++) {
         
            const { fieldName, strategy, options } = customCoreFunction[j];
            try {
                const generatedValue = strategy(sanitizeDoc, options.params);
                this._setNestedValue(sanitizeDoc, fieldName, generatedValue);
            } catch (err) {
                throw new AppError(`Runtime Execution Failure inside custom type system handler '${options.type}': ${err.message}`, 500);
            }
        }
  
        return sanitizeDoc;
    }
}

export const securityRulesEngine = new SecurityRulesEngine();