import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTrustedOrigin } from '../middleware/csrf.js';
import { recordSecurityEvent } from '../services/securityAudit.js';
import { decryptMfaSecret, encryptMfaSecret, newTotpSecret, passwordIsStrong, publicSessionKey, randomRecoveryCodes, randomResetToken, recoveryCodeHash, safeEqualHash, tokenDigest, verifyTotp } from '../services/securityCrypto.js';
import { mailConfigured, sendPasswordReset } from '../services/mail.js';

const router=Router(),wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>(req:any,res:any,next:any)=>fn(req,res).catch(next);
const genericAuth='Email or password is incorrect';
const dummyHash=bcrypt.hash('constant-timing-padding-value',12);
const sessionCollection=()=>mongoose.connection.collection('sessions');
const destroySession=(req:any)=>new Promise<void>((resolve,reject)=>req.session.destroy((error:any)=>error?reject(error):resolve()));
const regenerateSession=(req:any)=>new Promise<void>((resolve,reject)=>req.session.regenerate((error:any)=>error?reject(error):resolve()));
async function revokeUserSessions(userId:string,except?:string){const result=await sessionCollection().deleteMany({'session.userId':userId,...(except?{_id:{$ne:except}}:{})} as any);return result.deletedCount||0}
async function verifiedMfaCode(user:any,code:string){if(user.mfaSecret&&verifyTotp(decryptMfaSecret(user.mfaSecret),code))return {ok:true,recovery:false};const normalized=code.trim().toUpperCase(),index=(user.recoveryCodeHashes||[]).findIndex((saved:string)=>safeEqualHash(normalized,saved));if(index>=0){user.recoveryCodeHashes.splice(index,1);return {ok:true,recovery:true}}return {ok:false,recovery:false}}
async function finishLogin(req:any,user:any){await regenerateSession(req);req.session.userId=String(user._id);await new Promise<void>((resolve,reject)=>req.session.save((error:any)=>error?reject(error):resolve()));user.lastLogin=new Date();user.mfaFailedAttempts=0;user.mfaLockedUntil=undefined;await user.save();}

router.post('/login',wrap(async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(254),password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!parsed.success){await bcrypt.compare('invalid',await dummyHash);await recordSecurityEvent(req,'auth.login','failure',{metadata:{reason:'invalid-input'}});return res.status(401).json({error:{message:genericAuth}})}
  const email=parsed.data.email.toLowerCase(),user=await User.findOne({email}),padding=await dummyHash;
  const [matches]=await Promise.all([bcrypt.compare(parsed.data.password,user?.passwordHash||padding),bcrypt.compare(parsed.data.password,padding)]);
  if(!user||!matches){await recordSecurityEvent(req,'auth.login','failure',{actorId:user?._id,metadata:{reason:'invalid-credentials'}});return res.status(401).json({error:{message:genericAuth}})}
  if(user.mfaEnabled){await regenerateSession(req);req.session.mfaUserId=String(user._id);await new Promise<void>((resolve,reject)=>req.session.save((error:any)=>error?reject(error):resolve()));return res.json({data:{mfaRequired:true}})}
  await finishLogin(req,user);await recordSecurityEvent(req,'auth.login','success',{actorId:user._id,targetType:'User',targetId:user._id});res.json({data:{email:user.email,name:user.name,mfaRequired:false}});
}));

router.post('/mfa/verify',requireTrustedOrigin,wrap(async(req,res)=>{
  const userId=req.session.mfaUserId;if(!userId)return res.status(401).json({error:{message:'Authentication required'}});
  const input=z.object({code:z.string().trim().min(6).max(32)}).safeParse(req.body);const user=await User.findById(userId);
  if(!user||!user.mfaEnabled)return res.status(401).json({error:{message:'Verification failed'}});
  if(user.mfaLockedUntil&&user.mfaLockedUntil.getTime()>Date.now())return res.status(429).json({error:{message:'Too many verification attempts. Try again later.'}});
  const check=input.success?await verifiedMfaCode(user,input.data.code):{ok:false,recovery:false};
  if(!check.ok){user.mfaFailedAttempts=(user.mfaFailedAttempts||0)+1;if(user.mfaFailedAttempts>=5)user.mfaLockedUntil=new Date(Date.now()+15*60*1000);await user.save();await recordSecurityEvent(req,'auth.mfa.verify','failure',{actorId:user._id});return res.status(401).json({error:{message:'Verification failed'}})}
  await finishLogin(req,user);await recordSecurityEvent(req,check.recovery?'auth.mfa.recovery':'auth.mfa.verify','success',{actorId:user._id});res.json({data:{email:user.email,name:user.name,mfaRequired:false}});
}));

router.post('/logout',requireTrustedOrigin,wrap(async(req,res)=>{const userId=req.session.userId;const mfaUserId=req.session.mfaUserId;if(userId||mfaUserId)await recordSecurityEvent(req,'auth.logout','success',{actorId:userId||mfaUserId});await destroySession(req);res.clearCookie('kenora.sid',{path:'/',httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'});res.json({data:{success:true}})}));
router.get('/me',requireAuth,wrap(async(_req,res)=>{const u=res.locals.user;res.json({data:{email:u.email,name:u.name,mfaEnabled:Boolean(u.mfaEnabled),lastLogin:u.lastLogin||null}})}));

router.post('/password/change',requireAuth,requireTrustedOrigin,wrap(async(req,res)=>{
  const input=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(1).max(200)}).parse(req.body),user=await User.findById(res.locals.user._id);
  if(!user||!(await bcrypt.compare(input.currentPassword,user.passwordHash))){await recordSecurityEvent(req,'auth.password.change','failure',{actorId:user?._id});return res.status(400).json({error:{message:'Current password is incorrect'}})}
  if(!passwordIsStrong(input.newPassword))return res.status(400).json({error:{message:'Use at least 12 characters with upper and lower case letters, a number, and a symbol.'}});
  user.passwordHash=await bcrypt.hash(input.newPassword,12);user.passwordChangedAt=new Date();user.passwordResetHash=undefined;user.passwordResetExpires=undefined;await user.save();const revoked=await revokeUserSessions(String(user._id),req.sessionID);
  await recordSecurityEvent(req,'auth.password.change','success',{actorId:user._id,targetType:'User',targetId:user._id});await recordSecurityEvent(req,'session.revoke-others','success',{actorId:user._id,metadata:{revokedCount:revoked,reason:'password-change'}});res.json({data:{success:true,sessionsRevoked:true}});
}));

router.post('/password/reset/request',wrap(async(req,res)=>{
  const input=z.object({email:z.string().email().max(254)}).safeParse(req.body);const generic={data:{message:'If the account is eligible, reset instructions will be sent.'}};
  if(!input.success)return res.json(generic);
  const user=await User.findOne({email:input.data.email.toLowerCase()});
  if(!user){await recordSecurityEvent(req,'auth.password.reset.request','success',{metadata:{accountEligible:false}});return res.json(generic)}
  if(!mailConfigured()){await recordSecurityEvent(req,'auth.password.reset.request','unavailable',{actorId:user._id,metadata:{reason:'email-not-configured'}});return res.json(generic)}
  const token=randomResetToken();user.passwordResetHash=tokenDigest(token);user.passwordResetExpires=new Date(Date.now()+20*60*1000);await user.save();
  try{await sendPasswordReset(user.email,token);await recordSecurityEvent(req,'auth.password.reset.request','success',{actorId:user._id})}
  catch{user.passwordResetHash=undefined;user.passwordResetExpires=undefined;await user.save();await recordSecurityEvent(req,'auth.password.reset.request','unavailable',{actorId:user._id,metadata:{reason:'email-delivery-failed'}})}
  res.json(generic);
}));
router.post('/password/reset/complete',wrap(async(req,res)=>{
  const input=z.object({token:z.string().min(32).max(128),newPassword:z.string().min(1).max(200)}).safeParse(req.body);
  if(!input.success||!passwordIsStrong(input.data.newPassword))return res.status(400).json({error:{message:'Reset request is invalid or the new password does not meet strength requirements.'}});
  const changedAt=new Date(),passwordHash=await bcrypt.hash(input.data.newPassword,12),user=await User.findOneAndUpdate({passwordResetHash:tokenDigest(input.data.token),passwordResetExpires:{$gt:changedAt}},{$set:{passwordHash,passwordChangedAt:changedAt},$unset:{passwordResetHash:1,passwordResetExpires:1}},{new:true,runValidators:true});
  if(!user){await recordSecurityEvent(req,'auth.password.reset.complete','failure');return res.status(400).json({error:{message:'Reset request is invalid or expired.'}})}
  const revoked=await revokeUserSessions(String(user._id));
  await recordSecurityEvent(req,'auth.password.reset.complete','success',{actorId:user._id,targetType:'User',targetId:user._id});await recordSecurityEvent(req,'session.invalidate-all','success',{actorId:user._id,metadata:{revokedCount:revoked,reason:'password-reset'}});res.json({data:{success:true}});
}));

router.post('/mfa/enroll',requireAuth,requireTrustedOrigin,wrap(async(req,res)=>{
  const input=z.object({currentPassword:z.string().min(1).max(200)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:{message:'Current password is required to begin MFA enrollment.'}});
  const user=await User.findById(res.locals.user._id);if(!user)return res.status(401).json({error:{message:'Authentication required'}});
  if(!(await bcrypt.compare(input.data.currentPassword,user.passwordHash))){await recordSecurityEvent(req,'auth.mfa.enrollment.started','failure',{actorId:user._id});return res.status(400).json({error:{message:'Current password is incorrect.'}})}
  if(user.mfaEnabled)return res.status(409).json({error:{message:'MFA is already enabled.'}});
  const secret=newTotpSecret();user.pendingMfaSecret=encryptMfaSecret(secret);user.pendingMfaExpires=new Date(Date.now()+10*60*1000);await user.save();
  const account=encodeURIComponent(user.email),issuer=encodeURIComponent('KenoraTech OS'),uri=`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,qr=await QRCode.toDataURL(uri);
  await recordSecurityEvent(req,'auth.mfa.enrollment.started','success',{actorId:user._id});res.json({data:{qrCode:qr,manualEntryKey:secret,expiresAt:user.pendingMfaExpires}});
}));
router.post('/mfa/activate',requireAuth,requireTrustedOrigin,wrap(async(req,res)=>{
  const input=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body),user=await User.findById(res.locals.user._id);
  if(!user?.pendingMfaSecret||!user.pendingMfaExpires||user.pendingMfaExpires.getTime()<Date.now())return res.status(400).json({error:{message:'MFA enrollment expired. Start enrollment again.'}});
  if(!verifyTotp(decryptMfaSecret(user.pendingMfaSecret),input.code)){await recordSecurityEvent(req,'auth.mfa.enrollment','failure',{actorId:user._id});return res.status(400).json({error:{message:'Verification code is invalid.'}})}
  const codes=randomRecoveryCodes();user.mfaSecret=user.pendingMfaSecret;user.pendingMfaSecret=undefined;user.pendingMfaExpires=undefined;user.mfaEnabled=true;user.recoveryCodeHashes=codes.map(recoveryCodeHash);await user.save();const revoked=await revokeUserSessions(String(user._id),req.sessionID);
  await recordSecurityEvent(req,'auth.mfa.enrollment','success',{actorId:user._id});await recordSecurityEvent(req,'session.revoke-others','success',{actorId:user._id,metadata:{revokedCount:revoked,reason:'mfa-enabled'}});res.json({data:{enabled:true,recoveryCodes:codes}});
}));
router.post('/mfa/disable',requireAuth,requireTrustedOrigin,wrap(async(req,res)=>{
  const input=z.object({password:z.string().min(1).max(200),code:z.string().min(6).max(32)}).parse(req.body),user=await User.findById(res.locals.user._id);
  if(!user||!user.mfaEnabled||!(await bcrypt.compare(input.password,user.passwordHash))){await recordSecurityEvent(req,'auth.mfa.disabled','failure',{actorId:user?._id});return res.status(400).json({error:{message:'MFA verification failed.'}})}
  const check=await verifiedMfaCode(user,input.code);if(!check.ok){await recordSecurityEvent(req,'auth.mfa.disabled','failure',{actorId:user._id});return res.status(400).json({error:{message:'MFA verification failed.'}})}
  user.mfaEnabled=false;user.mfaSecret=undefined;user.pendingMfaSecret=undefined;user.pendingMfaExpires=undefined;user.recoveryCodeHashes=[];await user.save();const revoked=await revokeUserSessions(String(user._id),req.sessionID);
  await recordSecurityEvent(req,'auth.mfa.disabled','success',{actorId:user._id});await recordSecurityEvent(req,'session.revoke-others','success',{actorId:user._id,metadata:{revokedCount:revoked,reason:'mfa-disabled'}});res.json({data:{enabled:false,recoveryCodeUsed:check.recovery}});
}));

export default router;
