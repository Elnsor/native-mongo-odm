
---
- version : v1.3.0
- Date: 21-9-2062
- Operation: update 

## Update SchemaManager and SchemaBuilder method and class 

### why ❓
When schema validator of collection in monogdb contain field type `object` with dot notation like `accountInfo.email` ,with this naming the  `accountInfo is property contain object`  and `email` is property within this `acountInfo` object.<br>
My `SchemaManager` class is enging for validate every document before it go to dp its first layer of validation. its Know how validate document Object that not contain nested child with **not contain field name with Object dot notain** like example above 
### how ?
the update is done to two class `SchemaManager` and `SchemaBuilder`

### SchemaBuilder Update
We introduced a new boolean flag: **appRoles.hasNestedChildren**.
- If **true**: The object is in Strict Mode. The validator will skip the parent container and validate only the explicitly defined children (e.g., accountInfo.email),  
     stripping out any unauthorized extra fields.
- If **false**: The object is a Flexible Black-Box. The validator accepts the entire object as long as it matches the bsonType: 'object', allowing any nested keys.
- **Order-Agnostic**: Whether you write `.object({name: 'accountInfo'})` before or after `.string({name: 'accountInfo.email'})`, the logic correctly identifies the          
  relationship. 
#### Example 
```javascript
const builder=new SchemaBuilder().object({name:accountInfo,config:{required: true,hasNestedChildren}})
.string({name:"accountInfo.email"});
```

### SchemaManager Update
- add new method `_mergeObjFas` : we used this method as helper method to flatting object for example `{accountInfo:{email:"example@yahoo.com",age:10} }` <br>
  become `{"accountInfo.email" : "example@yahoo.com" ,"accountInfo.age": 10}` (and its run in recursive way) to match mongo object naming dot notation
  ```javascript
  _mergeObjFast(obj, prefix = "", result = {},docSet=new Set())
  ```
- update this method too `validateDocument` : add logic for using `hasNestedChildren` flag
  ```javascript
  async validateDocument(collectionName, doc, skipRequired = { "_id": true, "createdAt": true, "updatedAt": true }, isUpdate)
  ```
    Instead of using expensive O(N2) deep-loop flattening to handle nested dot-notation fields `(e.g., accountInfo.email)`,
    the system pre-calculates a `hasNestedChildren` flag during schema loading. This allows for instant, direct O(1) lookups,
-  **Flawless Security (Zero-Trust Validation)**: 
   add 2 layer for finding and catch any bad injection field if its in nested deep field injection or not its catch it .
   The allow-list check elegantly handles both strict objects (blocking unknown nested keys) and black-box objects. 
   Any attempt to inject unmapped structural fields is immediately caught and blocked with a clean, professional error
- update loadSchema method to be compitable with new change so its 
- **Complete Registry Parity**: 
    Whether a schema is loaded directly from the MongoDB $jsonSchema or from the in-memory applicationSchemaRegistry, the pre-calculation logic ensures identical, consistent behavior across the entire framework.
#### Example Scenario
Schema Definition:
**schema**
```javascript

  .object({ name: "accountInfo", config: { required: true } })
  .string({ name: "accountInfo.email", config: { required: true } })
  .number({ name: "accountInfo.age" });
 ```
 Incoming **Payload**:
 ```javascript
 {
  "accountInfo": {
    "email": "user@example.com",
    "age": 30,
    "hackerField": "malicious_data" 
  }
}
```
#### Validation Result:
   Validator sees `accountInfo`has `appRoles.hasNestedChildren === true`.<br>
   its know the `accountInfo` type is object and by checking `hasNestedChildren` by do this ,first its know its parent container <br>
   so its try to flate its content to match schema .seconde skips validating the parent container do to checking of `hasNestedChildren` flag.<br>
   It validates `accountInfo.email` and `accountInfo.age` successfully.<br>
   its rebuild clear sanitize new document that are valid before send it to db<br> 
   Output: `{ accountInfo: { email: "user@example.com", age: 30 } }` (Clean, secure, and perfectly nested). <br>
   #### The first layer of validation is done 




    
