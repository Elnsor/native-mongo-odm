import { Collection, ObjectId } from 'mongodb'
import { collectionManager } from './CollectionManager.js';


/**
 * I update this to be accept to catch cellection name from reqest url
 * so the collection can dynamicly geting and used better for concurrency
 * or 
 * u can add collection to it manually better for one collection at a time "for debug or testing"
 */

export class BaseController{
    /**
     * 
     * @param {String|null} fixedCollectionName 
     */
    constructor(fixedCollectionName=null){
        this.collectionName=fixedCollectionName;
    }

    /**
     * @param {req} 
     * @returns {Collection}
     * 
     */
    //-- update happen her to fetch collection name from req url
    getCollection(req){
        

        const name= this.collectionName || req.params.collectionName ;
        
        if (!name) {
            throw new Error("Framework Error: No collection specified in constructor and no ':collectionName' found in URL path.");
        }
        
        const coll=collectionManager.cache[name];
        if(!coll){
            throw new Error(`Database Error: Collection '${name}' is not active in cache`);
        }
     
        return coll;
    }

    create = async (req,res) => {
        
        const doc=req.body
        
    try{
    const collection=this.getCollection(req);
    const result= await collection.insertOne(doc);

    res.status(201).json({success:true , InsertedId: result.insertedId});
    }catch(error){
        res.status(400).json({success: false,message:"Validation Faild or Write Reject",details: error.message});

       

    }

}

    findAll = async (req,res) => {
        
        
        
    try{
    const collection=this.getCollection(req);
     const data= await collection.find({}).toArray();
     const name=this.collectionName || req.params.collectionName

    res.status(200).json(
        {
            success:true ,
            message:`${data.length?`Document Found in ${name}`:`No Document Found in ${name}`}` ,count: data.length,data});
    }catch(error){
        res.status(500).json({success: false,message:"Server issue, Try again later ", details: error.message});
    }

}

findById = async (req,res) => {
        
    try{
    const collection=this.getCollection(req);
    const data = await collection.findOne({_id: new ObjectId(req.params.id)});
    if(!data){
        return res.status(404).json({success: false,message: "no Document Found By This ID"})
    }
    return res.status(200).json({success:true ,data});
    }catch(error){
       return res.status(400).json({success: false,message:"Invalid ID format ", details: error.message});
    }

}

remove = async (req,res)=>{

    try{
     const collection= this.getCollection(req);
     const data= await collection.deleteOne({_id: new ObjectId(req.params.id)});
     //{ acknowledged: true, deletedCount: 0 }.
     if (data.deletedCount === 0 ){
        return res.status(400).json({success:false,message:"No record found for delete"});
     }
     return res.status(200).json({success: true,message:"Document Remove Cleanly",record:data});
    }catch(error){
        return res.status(400).json({success: false,message:"invalid ID format ", details: error.message});
    }
}

update = async (req, res) => {
        try {
            const collection = this.getCollection(req);
            const targetId = req.params.id;

            // Execute update using MongoDB atomic $set modifier operator
            const result = await collection.updateOne(
                { _id: new ObjectId(targetId) },
                { $set: req.body }
            );

            // If matchedCount is 0, the record doesn't exist in the cluster database
            if (result.matchedCount === 0) {
                return res.status(404).json({ success: false, message: "No document found matching that ID to update" });
            }

            return res.status(200).json({ 
                success: true, 
                message: "Document updated successfully",
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount 
            });
        } catch (error) {
            return res.status(400).json({ success: false, message: "Update Rejected", details: error.message });
        }
    };

}

 




// export const updateUser = async (req,res,next) => {
    
//     try{
    
    
//     const clientUser=getCollection();
//     const doc=await getDocument(req.body,{update:true});
    
//      const user= await clientUser.updateOne(
//         {_id: new ObjectId(req.params.id)},
//         {$set:doc});
        
//         res.json(user)

//     }catch(error)
//     {
//        if(error.message !== "500")
//         {
//             return next(new AppError(error.message,400))
            
//         }else{
//             return next(error);
//         }

//     }
//     }



// export const deleteUser = async (req,res,next) => {

//     try{
//      const clientUser=getCollection();
//      const user= await clientUser.deleteOne({_id: new ObjectId(req.params.id)});
//      if (!user){
//         return next(new AppError("No User Found",400));
//      }
//      res.json(user);
//     }catch(error){
//         return next(error)
//     }

// }

