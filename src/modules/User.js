import { SchemaBuilder } from "../framework/SchemaBuilder.js";
import { collectionManager } from "../framework/CollectionManager.js";




const userSchema = new SchemaBuilder({timestamp:true})
    .string(
        {
            name:"first_name",
            attrs:{description:"Your First Name"},
            config:{required: true}
        
        }

    )
    .number({
        name:"age",
        attrs:{minimum:0},
        config:{required:true},
    })
    .string(
        {
            name:"email",
            attrs: {
                description:"your email address", 
                pattern: "^[a-zA-Z][a-zA-Z_.0-9-]+@[a-zA-Z-.]+\\.[a-zA-Z]{2,}$",
            },
            config:{required:true}
        })
    .index({ email: 1 }, { unique: true }).setPropertyAttribute("age","description","your Age");



export async function initUserModule() {

   const userCollectionObject= await collectionManager.createCollection("users",userSchema);
   return userCollectionObject;
}

