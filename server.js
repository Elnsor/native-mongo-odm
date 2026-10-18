import dotenv from "dotenv"
import { dbAppIns } from "./src/dpApp.js";
import app from './app.js'
import http from 'http'
dotenv.config();

// validate missing important env
const REQUIRED_INV_VARS= ['MONGODB_URI', 'SECRET_KEY'];
const missingVar=REQUIRED_INV_VARS.filter( key => !process.env[key]);
const NODE_ENV = process.env.NODE_ENV || 'development'

let isShutDown=false;
let server;

if (missingVar.length > 0) {
    console.error(`❌ FATAL: Missing required environment variables: ${missingVar.join(', ')}`);
    process.exit(1); // Stop immediately before trying to connect to DB
}

const PORT=parseInt(process.env.PORT,10) || 3000;
async function bootstrap() {
    const bootStart = performance.now();

    try {
        // 1. Configure and start your custom DB/Framework layer
        dbAppIns.configure();
        await dbAppIns.start();

        // 2. Create HTTP server (Separating http from Express allows clean connection draining)
        server = http.createServer(app);

        // 3. Start listening
        server.listen(PORT, () => {
            const bootDuration = (performance.now() - bootStart).toFixed(2);
            console.log(`\n Server running on port ${PORT} [${NODE_ENV}]`);
            console.log(` Booted in ${bootDuration}ms\n`);
        });

    } catch (error) {
        console.error('❌ FATAL: Boot sequence failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}


async function gracefulShutdown(){
    if(isShutDown) return;
    isShutDown=true;

    if(server){
        server.close( ()=> console.log(`HTTP server closed` ));
        const forceExistDbTimer=setTimeout(()=>{
            console.log("Force shutdown after 10s")
        },10000)
        forceExistDbTimer.unref()

    }
   
    
    try {
        // Close your database client pool 
        await dbAppIns.stop();
        
        console.log('🔌 Database connections disconnected safely.');
    } catch (dbErr) {
        console.error('Error during database disconnection:', dbErr);
    }
        console.log('\n🛑 SIGINT received (Ctrl+C) or SIGTERM . Starting graceful shutdown...');
        console.log('👋 Server process terminated cleanly. Goodbye!');
        process.exit(0); // 0 means clean exit without errors
         
}
function handleUncaughtException(err) {
    console.error('\n UNCAUGHT EXCEPTION!');
    console.error('   Name:', err.name);
    console.error('   Message:', err.message);
    console.error('   Stack:', err.stack);
    gracefulShutdown('uncaughtException');
}
    function handleUnhandledRejection(reason, promise) {
    console.error('\n UNHANDLED REJECTION!');
    console.error('   Reason:', reason);
    gracefulShutdown('unhandledRejection');
}



// Attach listeners
process.on('SIGINT', gracefulShutdown);   // Ctrl+C
process.on('SIGTERM', gracefulShutdown);  // Docker/Kubernetes stop signal
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

bootstrap();








