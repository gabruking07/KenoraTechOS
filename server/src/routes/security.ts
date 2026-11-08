import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { SecurityEvent, User } from '../models/index.js';
import { recordSecurityEvent } from '../services/securityAudit.js';
import { publicSessionKey } from '../services/securityCrypto.js';
import { mailConfigured } from '../services/mail.js';

const router=Router(),wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>(req:any,res:any,next:any)=>fn(req,res).catch(next);
const sessions=()=>mongoose.connection.collection('sessions');
const pageInput=z.object({page:z.coerce.number().int().positive().default(1),limit:z.coerce.number().int().positive().max(100).default(25)});
router.get('/overview',wrap(async(req,res)=>{
  const user=await User.findById(res.locals.user._id).select('email name role mfaEnabled lastLogin passwordChangedAt createdAt');
  const events=await SecurityEvent.find().sort({createdAt:-1}).limit(30).select('-metadata.password -metadata.token').lean();
  const rows=await sessions().find({'session.userId':String(res.locals.user._id),expires:{$gt:new Date()}}).project({_id:1,expires:1,session:1}).toArray();
  res.json({data:{user:{email:user?.email,name:user?.name,role:user?.role,mfaEnabled:Boolean(user?.mfaEnabled),lastLogin:user?.lastLogin||null,passwordChangedAt:user?.passwordChangedAt||null},sessions:rows.map(row=>({id:publicSessionKey(String(row._id)),current:String(row._id)===req.sessionID,expiresAt:row.expires})),events,emailDeliveryConfigured:mailConfigured(),mfaEncryptionConfigured:/^[a-f\d]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY||''),malwareScannerConfigured:Boolean(process.env.FILE_SCANNER_URL&&process.env.FILE_SCANNER_TOKEN)}});
}));
router.get('/events',wrap(async(req,res)=>{const {page,limit}=pageInput.parse(req.query),skip=(page-1)*limit;const [data,total]=await Promise.all([SecurityEvent.find().sort({createdAt:-1}).skip(skip).limit(limit).lean(),SecurityEvent.countDocuments()]);res.json({data,meta:{page,limit,total,pages:Math.ceil(total/limit)}})}));
router.delete('/sessions/:key',wrap(async(req,res)=>{
  const key=z.string().min(20).max(100).parse(req.params.key),userId=String(res.locals.user._id);
  const rows=await sessions().find({'session.userId':userId,expires:{$gt:new Date()}}).project({_id:1}).toArray();
  const row=rows.find(item=>publicSessionKey(String(item._id))===key);
  if(!row)return res.status(404).json({error:{message:'Session not found.'}});
  if(String(row._id)===req.sessionID)return res.status(400).json({error:{message:'Use Sign out to end the current session.'}});
  await sessions().deleteOne({_id:row._id});await recordSecurityEvent(req,'session.revoked','success',{actorId:res.locals.user._id,targetType:'Session'});res.json({data:{success:true}});
}));
router.post('/sessions/revoke-others',wrap(async(req,res)=>{
  const userId=String(res.locals.user._id);const result=await sessions().deleteMany({'session.userId':userId,_id:{$ne:req.sessionID}});
  await recordSecurityEvent(req,'session.revoke-others','success',{actorId:res.locals.user._id,metadata:{revokedCount:result.deletedCount}});res.json({data:{success:true,revokedCount:result.deletedCount}});
}));
export default router;
