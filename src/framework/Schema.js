import { frameworkConfig } from "../config/frameworkConfig.js";


/**
 * -update 1 add reserved list keyWord so this keyWord not allow be used as FieldName 
 * This keyWrod are used by the system ,Only the sysem is allowed to manage and create or modified or deleted this field   
 * 
 * 2- change required to be set for uniquenes 
 * 
 * 3- properties {
 *  fieldName={
 * bsonType: type,
 * mongoRoles:{
 * 
 * }
 * appRoles:{
 * immutable:true | false ,
 * select : true | false ,
 * restrictedRole:[admin,user]
 * managedBySystem: true | false | date | function 
 * 
 * }
 * }
 * 
 * 
 * }
 */
export class Schema {
    constructor(collectionName,{ required = [], properties = {}, indexOption = [] } = {}) {
        
        this.collectionName=collectionName;
        this.required = new Set(required);
        this.properties = properties;
        this.indexOption = indexOption;
        this.allowSystemKeyword=frameworkConfig.schemaDefaults.allowSystemKeyword;
        if(this.allowSystemKeyword){
        this.systemKeyword=new Set(frameworkConfig.schemaDefaults.coreSystemKeywords);
        }else{
            this.systemKeyword=[];
        }

    }
    /**
     * @param {Array} systemKeywordArray -- array contain string custom keyword you need to add 
     * - the global schema coresystem keywor still their not touch 
     * 
     * @throws {Error} if you initializing your schema before 
     */
    addCustomSystemKeyword(systemKeywordArray){
        
        if(!this.allowSystemKeyword) return ;
        
        if(Object.keys(this.properties).length) throw new Error("SchemaError: Not Allowed To Add new CustomKeyWord after you Created some Element");
        
        for(const i=0 ;i<systemKeywordArray.length;i++){
            this.systemKeyword.add(systemKeywordArray[i]);

        }

    }
    /**
     * 
     * @returns {Set} - systemKeyword
     */
    getSystemKeywords() {
        return this.systemKeyword;
    }

    getProperties() {
        return this.properties;

    }
    /**
     * 
     * @returns {Set} required
     */
    getRequired() {
        return this.required;

    }

    getIndex(){
    return this.indexOption;
}

    // set required to required array
    //replace array by set 
    setRequired(name) {
        this.required.add(name);
    }

    // seting  property  
    setProperty(name, prop) {
        this.properties[name] = prop;

    }
    // geting  property by name 
    getProperty(name=""){
        return this.properties[name]
    }
    // for indexed entry and option 
    setIndexOption(indexKey, indexOpt) {
        this.indexOption.push({ key: indexKey, option: indexOpt });
    }

    // Compiles schema properties into a MongoDB $jsonSchema configuration
    compileValidator() {
        
        // i can add new feature her like add dynamic timestap like createdAt or updatedAt or any dynamic field
        

        for (const userIndex of this.getIndex()) {
       
            const indexKeys = Object.keys(userIndex.key);
        
        for (const key of indexKeys) {
            if (!this.properties[key]) {
                throw new Error(`XX Schema Compilation Error: Cannot create an index on "${key}" because it does not exist in definitions!`);
            }
        }
    }

        const mongoProperies=Object.create(null);
       

        const fields=Object.getOwnPropertyNames(this.properties);

        for(let i=0;i<fields.length;i++){
            const name=fields[i];
            mongoProperies[name]=this.properties[name].mongoRoles
            const appRoles=this.properties[name].appRoles
           
            if(appRoles.managedBySystem){
                const sysRoles=appRoles.managedBySystem
           
                if(!sysRoles.type){
                    throw new Error("Schema Compilation Error:Type is undefined in managedbyStytem ")
                }
                
                const specificConfig=frameworkConfig.systemManageTypeSpecifications[sysRoles.type]
                
                if(specificConfig){
                
                    if(specificConfig.allowedOptions && typeof specificConfig.allowedOptions === 'object'){
                        const requiredOptions=Object.getOwnPropertyNames(specificConfig.allowedOptions);
                
                        for(let j=0;j<requiredOptions.length;j++){
                
                            const optionName=requiredOptions[j];
                
                            if(!sysRoles.params || sysRoles.params[optionName] === undefined)
                                throw new Error(`Schema Compilation Error:managedBySystem type ${sysRoles.type} need option ${optionName}`)

                            const spectype=specificConfig.allowedOptions[optionName].type

                            if( spectype!== typeof sysRoles.params[optionName])
                                 throw new Error(`Schema Compilation Error:managedBySystem type ${sysRoles.type} : value of ${optionName} must be of type ${spectype} `);

                        }
                    }
                }
            }
            
           
        }


   
        
// validator: {
//         // i can combine our standard JSON schema with expression rules using $and
//         $and: [
//             // 1. standard schema validator (Approach 1)
//             { $jsonSchema: { bsonType: "object", properties: { ... } } },

//             // 2.  and some restriction check for field doing by mongodbserver 
//             {
//                 $expr: {
//                     // Rule: "createdAt" must be less than or equal to ($lte) "updatedAt"
//                     $lte: [ "$createdAt", "$updatedAt" ]
//                 }
//             }
//         ]
//     }
// };

        return {
            validator: {
                $jsonSchema: {
                    bsonType: 'object',
                    required: [...this.required],
                    properties: mongoProperies
                }
            }
        };
    }

}