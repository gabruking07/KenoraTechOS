import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from './database/connect.js';
import { startAutomationScheduler, stopAutomationScheduler, schedulerStatus } from './services/automationScheduler.js';

const uri=process.env.MONGODB_URI;
if(!uri){console.error('MONGODB_URI is required to run the automation worker.');process.exit(1)}
try{
  await connectDatabase(uri);
  startAutomationScheduler();
  console.log('KenoraTech automation worker started.');
  const stop=async()=>{stopAutomationScheduler();await mongoose.disconnect();process.exit(0)};
  process.once('SIGINT',()=>{void stop()});process.once('SIGTERM',()=>{void stop()});
  setInterval(()=>{const state=schedulerStatus();if(state.lastError)console.error('Automation worker encountered a scheduler error.')},60_000).unref();
}catch{
  console.error('Automation worker startup failed. Check the database configuration and network.');
  process.exit(1);
}
