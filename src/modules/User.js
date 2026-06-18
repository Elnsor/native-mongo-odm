import { SchemaBuilder } from "../framework/SchemaBuilder.js";
import { collectionManager } from "../framework/CollectionManager.js";




const userSchema = new SchemaBuilder({timestamp:true})
    .string(
            {
                name:"username",
                attrs:{description:"Your user name"},
                config:{required: true}
            
            }

        )
    .string(
        {
            name:"first_name",
            attrs:{description:"Your First Name"},
            config:{required: true}
        
        }

    )
    .string(
        {
            name:"last_name",
            attrs:{description:"Your First Name"},
            config:{required: false}
        
        }
    )
    .number({
        name:"age",
        attrs:{minimum:0},
        config:{required:false},
    })
    .string(
        {
            name:"email",
            attrs: {
                description:"your email address", 
                pattern: "^[a-zA-Z][a-zA-Z_.0-9-]+@[a-zA-Z-.]+\\.[a-zA-Z]{2,}$",//simple patter for email
            },
            config:{required:true}
        })
        .string(
        {
            name:"password",
            attrs:{description:"Your First Name"},
            config:{required: true}
        
        }
    )
    .string(
        {
            name:"salt",
            
            config:{required: true}
        
        }
    )
    .string(
        {
            name:"role",
            
            config:{required: true}
        
        }
    )

    .index({ email: 1 }, { unique: true }).setPropertyAttribute("age","description","your Age");



export async function initUserModule() {

   const userCollectionObject= await collectionManager.createCollection("users",userSchema);
   return userCollectionObject;
}

