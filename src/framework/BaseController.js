import { ObjectId } from 'mongodb'
import { collectionManager } from './CollectionManager.js';


export class BaseController{
    constructor(collectionName){
        this.collectionName=collectionName;
    }

    getCollection(){
        
        const coll=collectionManager.cache[this.collectionName];
        if(!coll){
            throw new Error(`No collection found by this collection name ${this.collectionName}`);
        }
        return coll;
    }

    create = async (req,res) => {
        
        const doc=req.body
        
    try{
    const collection=this.getCollection();
    const result= await collection.insertOne(doc);

    res.status(201).json({success:true , InsertedId: result.insertedId});
    }catch(error){
        res.status(400).json({success: false,message:"Validation Faild or Write Reject",details: error.message});

       

    }

}

    findAll = async (req,res) => {
        
        
        
    try{
    const collection=this.getCollection();
     const data= await collection.find({}).toArray();

    res.status(200).json({success:true ,message:`${data.length?`Document Found in ${this.collectionName}`:`No Document Found in ${this.collectionName}`}` ,count: data.length,data});
    }catch(error){
        res.status(500).json({success: false,message:"Server issue, Try again later ", details: error.message});
    }

}

findById = async (req,res) => {
        
    try{
    const collection=this.getCollection();
    const data = await collection.findOne({_id: new ObjectId(req.params.id)});
    if(!data){
        return res.status(400).json({success: false,message: "no Document Found By Tis ID"})
    }
    return res.status(200).json({success:true ,data});
    }catch(error){
       return res.status(400).json({success: false,message:"Invalid ID format ", details: error.message});
    }

}

remove = async (req,res)=>{

    try{
     const collection= this.getCollection();
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
            const collection = this.getCollection();
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

