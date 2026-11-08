import mongoose, { Schema } from 'mongoose';

const opts={timestamps:true,strict:'throw' as const};
const scheduleSchema=new Schema({frequency:{type:String,enum:['daily','weekly','monthly'],required:true},timezone:{type:String,required:true},localTime:{type:String,required:true},dayOfWeek:{type:Number,min:0,max:6},dayOfMonth:{type:Number,min:1,max:28}},{_id:false});
const actionSchema=new Schema({kind:{type:String,enum:['notification','task'],required:true},title:{type:String,required:true,maxlength:180},message:{type:String,default:'',maxlength:3000},project:{type:Schema.Types.ObjectId,ref:'Project'},description:{type:String,default:'',maxlength:3000}},{_id:false});
const triggerTypes=['schedule','project-status-change','task-completed','new-lead','lead-status-change','proposal-expiry','invoice-due','overdue-invoice','new-payment','deployment-status-change','infrastructure-expiry'];
const workflowSchema=new Schema({name:{type:String,required:true,trim:true,maxlength:120},enabled:{type:Boolean,default:false},triggerType:{type:String,enum:triggerTypes,default:'schedule'},schedule:{type:scheduleSchema},action:{type:actionSchema,required:true},nextRunAt:Date,leaseUntil:Date,leaseToken:String,lastRunAt:Date,lastError:{type:String,maxlength:300} },opts);
workflowSchema.index({enabled:1,nextRunAt:1});
workflowSchema.index({enabled:1,triggerType:1});
const executionSchema=new Schema({workflow:{type:Schema.Types.ObjectId,ref:'AutomationWorkflow',required:true,index:true},runKey:{type:String,required:true,unique:true},scheduledFor:{type:Date,required:true},status:{type:String,enum:['running','succeeded','failed'],required:true},attempts:{type:Number,default:0},startedAt:Date,finishedAt:Date,error:{type:String,maxlength:300},log:{type:String,maxlength:2000} },opts);
executionSchema.index({workflow:1,createdAt:-1});
const workerStatusSchema=new Schema({_id:{type:String,default:'scheduler'},lastHeartbeat:{type:Date,required:true},status:{type:String,enum:['running','degraded'],default:'running'}},{versionKey:false});
function model(name:string,schema:Schema){return (mongoose.models[name]||mongoose.model(name,schema)) as any}
export const AutomationWorkflow=model('AutomationWorkflow',workflowSchema);
export const AutomationExecution=model('AutomationExecution',executionSchema);
export const AutomationWorkerStatus=model('AutomationWorkerStatus',workerStatusSchema);
