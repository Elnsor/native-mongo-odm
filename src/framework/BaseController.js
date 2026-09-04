import { ObjectId } from 'mongodb'
import { collectionManager } from './CollectionManager.js';
import { AppError } from './appError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { frameworkConfig } from '../config/frameworkConfig.js';


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
        
    
    const collection=this.getCollNameFromReq(req);

    // for OCC
    const doc={...req.body,...(frameworkConfig.schemaDefaults.optimisticConcurrencyControl && {version:1})

    }
    const result= await collection.insertOne(doc);

    res.status(201).json({success:true , InsertedId: result.insertedId});
    })


    

    findAll = catchAsync( async (req,res,next) => {


    
    const collection=this.getCollNameFromReq(req);

    if(!ObjectId.isValid(req.params.id)){
        return next(new AppError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer",400));
    }
    const queryFilterd= {};

        if(frameworkConfig.schemaDefaults.softDocumentDetele){
            queryFilterd.deteledAt={$exists: false};
        }


     const data= await collection.find(queryFilterd,{projection: req.projection}).toArray();
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
    const queryFilterd= {_id: new ObjectId(req.params.id)};

        if(frameworkConfig.schemaDefaults.softDocumentDetele){
            queryFilterd.deteledAt={$exists: false};
        }


    const data = await collection.findOne( queryFilterd,{projection: req.projection} );
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
    const setOperation={}
    let result;
    const softdelete=frameworkConfig.schemaDefaults.softDocumentDetele;

    if(softdelete){

        setOperation.$set={deletedAt: new Date()};
        if(frameworkConfig.schemaDefaults.optimisticConcurrencyControl){
            setOperation.$inc={version:1};
        }

        result= await collection.updateOne(
            {
                _id: new ObjectId(req.params.id),
                deletedAt:{$exists : false}},
            setOperation
        )

    }else{

         result= await collection.deleteOne({_id: new ObjectId(req.params.id)});

    }
    
   const counter= softdelete? result.matchedCount: result.deletedCount;
     if (counter== 0 ){
        return next(new AppError("No record found for delete",404))

     }
     return res.status(200).json({success: true,message:softdelete? "Document soft Deleted ": "Document Permanently purged" ,record:result});
})

update = catchAsync( async (req, res,next) => {

   
            const collection = this.getCollNameFromReq(req);

         
            const targetId = req.params.id;
               if(!ObjectId.isValid(targetId)){
        return next(new AppError("input must be a 24 character hex string, 12 byte Uint8Array, or an integer",400));
    }
          
            const currentVersion = req.currentDoc.version || 1;
  
            const queryFilterd={
                 _id: new ObjectId(targetId) ,
                  version: currentVersion
            }
           
            console.log("+++++++++++++",targetId);
            const updateOperation={
                   $set:  req.body 
            }
               
            if(frameworkConfig.schemaDefaults.optimisticConcurrencyControl){
                updateOperation.$inc={
                    version: 1}
            }
             
            if(frameworkConfig.schemaDefaults.softDocumentDetele){
                queryFilterd.deteledAt={$exists: false};
            }

       
            const result = await collection.updateOne(queryFilterd, updateOperation);

             

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
