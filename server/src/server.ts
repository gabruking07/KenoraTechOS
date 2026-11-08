import 'dotenv/config';import {createApp} from './app.js';import {connectDatabase} from './database/connect.js';import { syncAllProviders } from './services/providerManagement.js';
const port=Number(process.env.PORT)||4000;const uri=process.env.MONGODB_URI;if(!uri){console.error('MONGODB_URI is required. Copy server/.env.example to server/.env and configure it.');process.exit(1)}if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32){console.error('SESSION_SECRET must contain at least 32 characters.');process.exit(1)}
try{await connectDatabase(uri)}catch{console.error('Database connection failed; API startup was stopped safely. Verify the MongoDB network and configuration.');process.exit(1)}
const syncInterval=Math.max(5*60_000,Number(process.env.PROVIDER_SYNC_INTERVAL_MS)||15*60_000);
const runProviderSync=()=>{void syncAllProviders().then(results=>{const failed=results.filter((result:any)=>result.status==='failed');if(failed.length)console.warn(`Provider synchronization completed with ${failed.length} provider error(s).`)}).catch(()=>console.warn('Provider synchronization could not complete.'))};
const providerSyncTimer=setInterval(runProviderSync,syncInterval);providerSyncTimer.unref();
createApp().listen(port,()=>{console.log(`KenoraTech OS API listening on ${port}`);runProviderSync()});
