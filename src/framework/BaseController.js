import { ObjectId } from 'mongodb'
import { collectionManager } from './CollectionManager.js';
import { AppError } from './appError.js';
import { catchAsync } from '../utils/catchAsync.js';


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
    getCollNameFromReq(req){
        

        const name= this.collectionName || req.params.collectionName ;
        
        if (!name) {
            throw new Error("Framework Error: No collection specified in constructor and no ':collectionName' found in URL path.");
        }
        
        const coll=collectionManager.getCollectionCache()[name];
        if(!coll){
            throw new Error(`Database Error: Collection '${name}' is not active in cache`);
        }
     
        return coll;
    }
/**
 * update to use catchAsync
 * all try catch or removed
 */
    create = catchAsync(async (req,res,next) => {
        
    const doc=req.body
    const collection=this.getCollNameFromReq(req);
    const result= await collection.insertOne(doc);

    res.status(201).json({success:true , InsertedId: result.insertedId});
    })
    

    findAll = catchAsync( async (req,res,next) => {
    
    const collection=this.getCollNameFromReq(req);
     const data= await collection.find({}).toArray();
     const name=this.collectionName || req.params.collectionName

    res.status(200).json(
        {
            success:true ,
            message:`${data.length?`Document Found in ${name}`:`No Document Found in ${name}`}` ,count: data.length,data});
    })

findById = catchAsync(async (req,res,next) => {
        
   
    const collection=this.getCollNameFromReq(req);
    
    if(!ObjectId.isValid(req.params.id)){
        return next(new AppError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer",400));
    }
    const data = await collection.findOne({_id: new ObjectId(req.params.id)});
    if(!data){
        return next(new AppError( "no Document Found By This ID",404));
    }
    return res.status(200).json({success:true ,data});
    

})

remove = catchAsync( async (req,res,next)=>{

     const collection= this.getCollNameFromReq(req);

      if(!ObjectId.isValid(req.params.id)){
        return next(new AppError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer",400));
    }
     const data= await collection.deleteOne({_id: new ObjectId(req.params.id)});
     if (data.deletedCount === 0 ){
        return next(new AppError("No record found for delete",400))

     }
     return res.status(200).json({success: true,message:"Document Remove Cleanly",record:data});
})

update = catchAsync( async (req, res,next) => {
            const collection = this.getCollNameFromReq(req);
            const targetId = req.params.id;

        if(!ObjectId.isValid(targetId)){
        return next(new AppError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer",400));
    }
            const result = await collection.updateOne(
                { _id: new ObjectId(targetId) },
                { $set: req.body }
            );

            if (result.matchedCount === 0) {
                return next(new AppError("No document found matching that ID to update",404));
            }

            return res.status(200).json({ 
                success: true, 
                message: "Document updated successfully",
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount 
            });
    });

}
