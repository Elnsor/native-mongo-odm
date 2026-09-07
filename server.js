import dotenv from "dotenv"

import { connectDb, closeDb,getDb } from "./src/config/db.js";
import { collectionManager } from "./src/framework/CollectionManager.js";
import { applicationSchemaRegistry } from "./src/framework/applicationSchemaRegistry.js";
import { loadDirectory } from "./src/utils/dynamicImport.js";
import app from './app.js'



dotenv.config();



const PORT=3000

async function bootstrap(){

    await connectDb();
  //dynamic importing 
   await loadDirectory('./src/modules')
   //warm caching and registeration 
   collectionManager.syncAllCollectionOnBoot(applicationSchemaRegistry)
    
    app.listen(PORT,()=>{
        console.log(`🌐 Production Modular Server operational on http://localhost:${PORT}`);
        
    });

   
}

async function gracefulShutdown(){
   
    
    try {
        // Close your database client pool 
        await closeDb();
        
        console.log('🔌 Database connections disconnected safely.');
    } catch (dbErr) {
        console.error('Error during database disconnection:', dbErr);
    }
        console.log('\n🛑 SIGINT received (Ctrl+C) or SIGTERM . Starting graceful shutdown...');
        console.log('👋 Server process terminated cleanly. Goodbye!');
        process.exit(0); // 0 means clean exit without errors
         
}

bootstrap();
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION! Shutting down gracefully...');
    console.error(err.name, ':', err.message, '\n', err.stack);
    
    // Force exit immediately because the node process is now in an unstable state
    process.exit(1);
});

// Unhandeled Rejection come For Unhandled (Async Promise Failure)
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION! Shutting down gracefully...');
    console.error('Reason:', reason);
        process.exit(1);
});

process.on('SIGINT',gracefulShutdown);

process.on('SIGTERM',gracefulShutdown);





