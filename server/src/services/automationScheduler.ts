import { randomUUID } from 'node:crypto';
import { ActivityLog, Project, Task } from '../models/index.js';
import { BusinessInfrastructure, BusinessInvoice, BusinessNotification, BusinessProposal } from '../models/business.js';
import { AutomationExecution, AutomationWorkflow, AutomationWorkerStatus } from '../models/automation.js';

export type Schedule={frequency:'daily'|'weekly'|'monthly';timezone:string;localTime:string;dayOfWeek?:number;dayOfMonth?:number};
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function localParts(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(parts.map(p=>[p.type,p.value]));}
function localDateInstant(year:number,month:number,day:number,hour:number,minute:number,timeZone:string){const target=Date.UTC(year,month-1,day,hour,minute);let guess=target;for(let i=0;i<5;i++){const p=localParts(new Date(guess),timeZone);const represented=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));const delta=target-represented;if(delta===0)return new Date(guess);guess+=delta;}return undefined;}
export function nextScheduledOccurrence(schedule:Schedule,after:Date){
  if(!/^\d{2}:\d{2}$/.test(schedule.localTime))throw new Error('Schedule time must use HH:mm.');
  const [hour,minute]=schedule.localTime.split(':').map(Number);if(hour>23||minute>59)throw new Error('Schedule time is invalid.');
  try{new Intl.DateTimeFormat('en-US',{timeZone:schedule.timezone}).format(after)}catch{throw new Error('Schedule time zone is invalid.')}
  if(schedule.frequency==='weekly'&&(!Number.isInteger(schedule.dayOfWeek)||schedule.dayOfWeek!<0||schedule.dayOfWeek!>6))throw new Error('Weekly schedules need a weekday.');
  if(schedule.frequency==='monthly'&&(!Number.isInteger(schedule.dayOfMonth)||schedule.dayOfMonth!<1||schedule.dayOfMonth!>28))throw new Error('Monthly schedules need a day from 1 to 28.');
  const first=localParts(new Date(Math.floor(after.getTime()/60_000)*60_000+60_000),schedule.timezone);let day=Date.UTC(Number(first.year),Number(first.month)-1,Number(first.day)),days=schedule.frequency==='monthly'?36:9;
  for(let offset=0;offset<days;offset++){const localDay=new Date(day+offset*86_400_000),year=localDay.getUTCFullYear(),month=localDay.getUTCMonth()+1,dateNumber=localDay.getUTCDate(),weekday=localDay.getUTCDay();if(schedule.frequency==='weekly'&&weekday!==schedule.dayOfWeek)continue;if(schedule.frequency==='monthly'&&dateNumber!==schedule.dayOfMonth)continue;const instant=localDateInstant(year,month,dateNumber,hour,minute,schedule.timezone);if(instant&&instant.getTime()>after.getTime())return instant;}
  throw new Error('Could not find the next schedule time in the supported window.');
}

async function performAction(workflow:any,runKey:string){
  if(workflow.action.kind==='notification'){
    await BusinessNotification.updateOne({dedupeKey:`automation:${runKey}`},{$setOnInsert:{dedupeKey:`automation:${runKey}`,kind:'automation',category:'automation',priority:'normal',title:workflow.action.title,message:workflow.action.message||workflow.name,relatedType:'Automation',relatedId:String(workflow._id),deliveryStatus:'in-app'}},{upsert:true});
  }else if(workflow.action.kind==='task'){
    if(!workflow.action.project||!await Project.exists({_id:workflow.action.project}))throw new Error('Automation task project no longer exists.');
    await Task.updateOne({automationKey:runKey},{$setOnInsert:{automationKey:runKey,title:workflow.action.title,description:workflow.action.description||'',project:workflow.action.project,status:'To Do',priority:'Medium'}},{upsert:true});
  }else throw new Error('Automation action is not supported.');
}

async function executeClaim(workflow:any,dueAt:Date,leaseToken:string){
  const runKey=`${workflow._id}:${dueAt.toISOString()}`;
  const execution=await AutomationExecution.findOneAndUpdate({runKey},{$setOnInsert:{workflow:workflow._id,runKey,scheduledFor:dueAt,status:'running',attempts:0,startedAt:new Date()}},{new:true,upsert:true,setDefaultsOnInsert:true});
  if(execution.status==='succeeded'){
    const nextRunAt=nextScheduledOccurrence(workflow.schedule,dueAt);await AutomationWorkflow.updateOne({_id:workflow._id,leaseToken},{$set:{nextRunAt,lastRunAt:execution.finishedAt||new Date(),leaseUntil:null,leaseToken:null}});return;
  }
  execution.status='running';execution.attempts=(execution.attempts||0)+1;execution.startedAt=new Date();execution.error=undefined;await execution.save();
  try{
    await performAction(workflow,runKey);
    execution.status='succeeded';execution.finishedAt=new Date();execution.log='Configured action completed.';await execution.save();
    await ActivityLog.create({action:'Automation executed',description:`Executed workflow ${workflow.name}`,entityType:'Automation',entityId:workflow._id});
    await AutomationWorkflow.updateOne({_id:workflow._id,leaseToken},{$set:{nextRunAt:nextScheduledOccurrence(workflow.schedule,dueAt),lastRunAt:new Date(),lastError:null,leaseUntil:null,leaseToken:null}});
  }catch(error){
    execution.status='failed';execution.finishedAt=new Date();execution.error='The configured action failed. Review the workflow and related records, then retry.';execution.log=error instanceof Error?error.name:'UnknownError';await execution.save();
    await AutomationWorkflow.updateOne({_id:workflow._id,leaseToken},{$set:{nextRunAt:nextScheduledOccurrence(workflow.schedule,dueAt),lastRunAt:new Date(),lastError:execution.error,leaseUntil:null,leaseToken:null}});
  }
}

let interval:NodeJS.Timeout|undefined;
let lastTickAt:Date|undefined;
let lastError:string|undefined;
export async function runDueAutomations(now=new Date(),batchSize=20){
  lastTickAt=now;lastError=undefined;await AutomationWorkerStatus.updateOne({_id:'scheduler'},{$set:{lastHeartbeat:now,status:'running'}},{upsert:true});const due=await AutomationWorkflow.find({enabled:true,triggerType:'schedule',nextRunAt:{$lte:now}}).sort({nextRunAt:1}).limit(Math.min(50,Math.max(1,batchSize))).select('_id nextRunAt').lean();let claimed=0;
  for(const item of due){const leaseToken=randomUUID(),leaseUntil=new Date(now.getTime()+120_000);const workflow=await AutomationWorkflow.findOneAndUpdate({_id:item._id,enabled:true,nextRunAt:item.nextRunAt,$or:[{leaseUntil:null},{leaseUntil:{$exists:false}},{leaseUntil:{$lt:now}}]},{$set:{leaseToken,leaseUntil}},{new:true}).lean();if(!workflow)continue;claimed++;try{await executeClaim(workflow,new Date(item.nextRunAt),leaseToken)}catch(error){lastError='One or more automation executions failed.';await AutomationWorkflow.updateOne({_id:workflow._id,leaseToken},{$set:{leaseUntil:null,leaseToken:null,lastError}}).catch(()=>{});}
  }
  await emitDueBusinessEvents(now);
  return {claimed,lastTickAt,lastError};
}
export function schedulerStatus(){return{running:Boolean(interval),lastTickAt:lastTickAt?.toISOString()||null,lastError:lastError||null}}
export function startAutomationScheduler(){if(interval)return;interval=setInterval(()=>{void runDueAutomations().catch(()=>{lastError='Automation scheduler could not query workflows.';void AutomationWorkerStatus.updateOne({_id:'scheduler'},{$set:{lastHeartbeat:new Date(),status:'degraded'}},{upsert:true}).catch(()=>{})})},30_000);interval.unref();void runDueAutomations().catch(()=>{lastError='Automation scheduler could not query workflows.';void AutomationWorkerStatus.updateOne({_id:'scheduler'},{$set:{lastHeartbeat:new Date(),status:'degraded'}},{upsert:true}).catch(()=>{})});}
export function stopAutomationScheduler(){if(interval)clearInterval(interval);interval=undefined;}

export async function retryAutomationExecution(executionId:string){
  const execution=await AutomationExecution.findOneAndUpdate({_id:executionId,status:'failed'},{$set:{status:'running',startedAt:new Date(),finishedAt:null,error:null},$inc:{attempts:1}},{new:true});
  if(!execution)throw new Error('Failed automation execution was not found or is already running.');
  const workflow=await AutomationWorkflow.findById(execution.workflow).lean();if(!workflow){execution.status='failed';execution.error='Workflow is unavailable.';execution.finishedAt=new Date();await execution.save();throw new Error('Automation workflow is unavailable.');}
  try{await performAction(workflow,execution.runKey);execution.status='succeeded';execution.finishedAt=new Date();execution.log='Retry completed.';await execution.save();await AutomationWorkflow.updateOne({_id:workflow._id},{$set:{lastRunAt:new Date(),lastError:null}});return execution;}
  catch(error){execution.status='failed';execution.finishedAt=new Date();execution.error='The configured action failed. Review the workflow and related records, then retry.';execution.log=error instanceof Error?error.name:'UnknownError';await execution.save();await AutomationWorkflow.updateOne({_id:workflow._id},{$set:{lastError:execution.error}});throw new Error(execution.error);}
}

export async function emitAutomationEvent(type:string,entityId:string,eventVersion:string){
  const workflows=await AutomationWorkflow.find({enabled:true,triggerType:type}).limit(50).lean();
  for(const workflow of workflows){
    const runKey=`${workflow._id}:${type}:${entityId}:${eventVersion}`;
    let execution:any;
    try{
      execution=await AutomationExecution.findOneAndUpdate({runKey},{$setOnInsert:{workflow:workflow._id,runKey,scheduledFor:new Date(),status:'running',attempts:0,startedAt:new Date()}},{new:true,upsert:true,setDefaultsOnInsert:true});
    }catch(error:any){if(error?.code===11000)continue;throw error;}
    if(execution.status==='succeeded')continue;
    try{
      execution.status='running';execution.attempts=(execution.attempts||0)+1;execution.startedAt=new Date();await execution.save();
      await performAction(workflow,runKey);
      execution.status='succeeded';execution.finishedAt=new Date();execution.log=`Event trigger ${type} completed.`;await execution.save();
      await ActivityLog.create({action:'Automation event executed',description:`Executed ${workflow.name} after ${type}`,entityType:'Automation',entityId:workflow._id});
      await AutomationWorkflow.updateOne({_id:workflow._id},{$set:{lastRunAt:new Date(),lastError:null}});
    }catch(error){
      if(execution){execution.status='failed';execution.finishedAt=new Date();execution.error='The configured action failed. Review the workflow and related records, then retry.';execution.log=error instanceof Error?error.name:'UnknownError';await execution.save().catch(()=>{});}
      await AutomationWorkflow.updateOne({_id:workflow._id},{$set:{lastError:'An event-triggered action failed.'}}).catch(()=>{});
    }
  }
}

async function emitDueBusinessEvents(now:Date){
  const eventTypes=['proposal-expiry','invoice-due','overdue-invoice','infrastructure-expiry'];
  const active=await AutomationWorkflow.exists({enabled:true,triggerType:{$in:eventTypes}});if(!active)return;
  const overdueBefore=new Date(now.getTime()-24*60*60*1000);
  const [proposals,dueInvoices,overdueInvoices,resources]=await Promise.all([
    AutomationWorkflow.exists({enabled:true,triggerType:'proposal-expiry'}).then((enabled:boolean)=>enabled?BusinessProposal.find({status:{$in:['Sent','Viewed']},expiryDate:{$lte:now}}).select('_id expiryDate').sort({expiryDate:1}).limit(50).lean():[]),
    AutomationWorkflow.exists({enabled:true,triggerType:'invoice-due'}).then((enabled:boolean)=>enabled?BusinessInvoice.find({status:{$in:['Issued','Partially paid','Overdue']},dueDate:{$gt:overdueBefore,$lte:now}}).select('_id dueDate').sort({dueDate:1}).limit(50).lean():[]),
    AutomationWorkflow.exists({enabled:true,triggerType:'overdue-invoice'}).then((enabled:boolean)=>enabled?BusinessInvoice.find({status:{$in:['Issued','Partially paid','Overdue']},dueDate:{$lte:overdueBefore}}).select('_id dueDate').sort({dueDate:1}).limit(50).lean():[]),
    AutomationWorkflow.exists({enabled:true,triggerType:'infrastructure-expiry'}).then((enabled:boolean)=>enabled?BusinessInfrastructure.find({status:{$in:['active','maintenance']},renewalDate:{$lte:now}}).select('_id renewalDate').sort({renewalDate:1}).limit(50).lean():[])
  ]);
  for(const row of proposals)await emitAutomationEvent('proposal-expiry',String(row._id),new Date(row.expiryDate).toISOString());
  for(const row of dueInvoices)await emitAutomationEvent('invoice-due',String(row._id),new Date(row.dueDate).toISOString());
  for(const row of overdueInvoices)await emitAutomationEvent('overdue-invoice',String(row._id),new Date(row.dueDate).toISOString());
  for(const row of resources)await emitAutomationEvent('infrastructure-expiry',String(row._id),new Date(row.renewalDate).toISOString());
}
