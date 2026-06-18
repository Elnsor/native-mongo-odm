import dotenv from "dotenv"
import { initUserModule } from "./src/modules/User.js";
import { connectDb, closeDb } from "./src/config/db.js";
import { collectionManager } from "./src/framework/CollectionManager.js";
import app from './app.js'



dotenv.config();



const PORT=3000

async function bootstrap(){

    await connectDb();
   // collectionManager.dropCollection("users");
    await initUserModule();
    app.listen(PORT,()=>{
        console.log(`🌐 Production Modular Server operational on http://localhost:${PORT}`);
        
    });
}

async function gracefulShutdown(){
    console.log('\n🛑 SIGINT received (Ctrl+C) or SIGTERM . Starting graceful shutdown...');
    
    try {
        // Close your database client pool 
        await closeDb()
        console.log('🔌 Database connections disconnected safely.');
    } catch (dbErr) {
        console.error('Error during database disconnection:', dbErr);
    }
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





