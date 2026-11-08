import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { encryptMfaSecret, newTotpSecret, recoveryCodeHash, randomResetToken, tokenDigest, totp } from '../../src/services/securityCrypto.js';

const models=vi.hoisted(()=>{const make=()=>({findOne:vi.fn(),findById:vi.fn(),findByIdAndUpdate:vi.fn(),findByIdAndDelete:vi.fn(),findOneAndUpdate:vi.fn(),findOneAndDelete:vi.fn(),exists:vi.fn(),countDocuments:vi.fn(),create:vi.fn(),find:vi.fn(),aggregate:vi.fn()});return {User:make(),SecurityEvent:make(),ActivityLog:make(),Backup:make(),Category:make(),Folder:make(),Milestone:make(),Project:make(),StoredDocument:make(),Task:make(),Technology:make(),WorkspaceRecord:make()}});
vi.mock('../../src/models/index.js',()=>({...models,ProjectType:undefined}));

const envKeys=['SESSION_SECRET','NODE_ENV','MONGODB_URI','CLIENT_URL','MFA_ENCRYPTION_KEY','SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_USER','SMTP_PASS','SMTP_SECURE'];
let previous:Record<string,string|undefined>={},passwordHash='';
function setUser(overrides:Record<string,unknown>={}){const user:any={_id:'507f1f77bcf86cd799439011',id:'507f1f77bcf86cd799439011',email:'admin@example.test',name:'Admin',role:'admin',mfaEnabled:false,mfaFailedAttempts:0,recoveryCodeHashes:[],passwordHash,lastLogin:null,save:vi.fn().mockResolvedValue(undefined),...overrides};models.User.findOne.mockResolvedValue(user);const query:any={select:vi.fn().mockResolvedValue(user)};query.then=(resolve:any,reject:any)=>Promise.resolve(user).then(resolve,reject);models.User.findById.mockReturnValue(query);return user}

beforeEach(async()=>{previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));process.env.SESSION_SECRET='test-only-session-secret-01234567890123456789';process.env.NODE_ENV='test';process.env.CLIENT_URL='http://localhost:5173';process.env.MFA_ENCRYPTION_KEY='b'.repeat(64);delete process.env.MONGODB_URI;for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_FROM','SMTP_USER','SMTP_PASS','SMTP_SECURE'])delete process.env[key];vi.clearAllMocks();passwordHash=await bcrypt.hash('ValidPassword123!',4);models.SecurityEvent.create.mockResolvedValue({});setUser()});
afterEach(()=>{vi.restoreAllMocks();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}});

describe('authentication routes with isolated user/session fixtures',()=>{
  it('logs in, creates an authenticated session, and invalidates it on logout',async()=>{
    const agent=request.agent(createApp());const login=await agent.post('/api/v1/auth/login').send({email:'admin@example.test',password:'ValidPassword123!'});
    expect(login.status).toBe(200);expect(login.body.data.mfaRequired).toBe(false);expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await agent.post('/api/v1/auth/logout').set('Origin','http://localhost:5173').send({})).status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
  it('uses the same authentication failure message for unknown and incorrect accounts',async()=>{
    const app=createApp();const known=await request(app).post('/api/v1/auth/login').send({email:'admin@example.test',password:'wrong'});models.User.findOne.mockResolvedValue(null);const unknown=await request(app).post('/api/v1/auth/login').send({email:'missing@example.test',password:'wrong'});
    expect(known.status).toBe(401);expect(unknown.status).toBe(401);expect(unknown.body.error.message).toBe(known.body.error.message);
  });
  it('requires MFA after the password and locks repeated invalid codes',async()=>{
    const secret=newTotpSecret(),user=setUser({mfaEnabled:true,mfaSecret:encryptMfaSecret(secret)}),agent=request.agent(createApp());
    expect((await agent.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'})).body.data.mfaRequired).toBe(true);
    for(let i=0;i<5;i++)await agent.post('/api/v1/auth/mfa/verify').set('Origin','http://localhost:5173').send({code:'000000'});
    expect(user.mfaFailedAttempts).toBe(5);expect(user.mfaLockedUntil).toBeInstanceOf(Date);
    expect((await agent.post('/api/v1/auth/mfa/verify').set('Origin','http://localhost:5173').send({code:totp(secret)})).status).toBe(429);
  });
  it('consumes a recovery code once and completes MFA login',async()=>{
    const recovery='A1B2C3-D4E5F6',user=setUser({mfaEnabled:true,recoveryCodeHashes:[recoveryCodeHash(recovery)]}),agent=request.agent(createApp());
    await agent.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'});
    expect((await agent.post('/api/v1/auth/mfa/verify').set('Origin','http://localhost:5173').send({code:recovery.toLowerCase()})).status).toBe(200);
    expect(user.recoveryCodeHashes).toEqual([]);expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    const second=request.agent(createApp());await second.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'});
    expect((await second.post('/api/v1/auth/mfa/verify').set('Origin','http://localhost:5173').send({code:recovery})).status).toBe(401);
  });
  it('enrolls MFA only after current-password verification and activates after a valid TOTP',async()=>{
    vi.spyOn(mongoose.connection,'collection').mockReturnValue({deleteMany:vi.fn().mockResolvedValue({deletedCount:1})} as any);
    const user=setUser(),agent=request.agent(createApp());await agent.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'});
    expect((await agent.post('/api/v1/auth/mfa/enroll').set('Origin','http://localhost:5173').send({})).status).toBe(400);
    const enrollment=await agent.post('/api/v1/auth/mfa/enroll').set('Origin','http://localhost:5173').send({currentPassword:'ValidPassword123!'});
    expect(enrollment.status).toBe(200);expect(enrollment.body.data.qrCode).toMatch(/^data:image\/png;base64,/);
    const secret=enrollment.body.data.manualEntryKey,activated=await agent.post('/api/v1/auth/mfa/activate').set('Origin','http://localhost:5173').send({code:totp(secret)});
    expect(activated.status).toBe(200);expect(activated.body.data.recoveryCodes).toHaveLength(10);expect(user.mfaEnabled).toBe(true);
    expect(user.recoveryCodeHashes).not.toContain(activated.body.data.recoveryCodes[0]);
    const next=request.agent(createApp());expect((await next.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'})).body.data.mfaRequired).toBe(true);
    expect((await next.post('/api/v1/auth/mfa/verify').set('Origin','http://localhost:5173').send({code:totp(secret)})).status).toBe(200);
  });
  it('requires password plus TOTP or recovery verification to disable MFA',async()=>{
    vi.spyOn(mongoose.connection,'collection').mockReturnValue({deleteMany:vi.fn().mockResolvedValue({deletedCount:1})} as any);
    const secret=newTotpSecret(),user=setUser(),agent=request.agent(createApp());await agent.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'});user.mfaEnabled=true;user.mfaSecret=encryptMfaSecret(secret);
    const denied=await agent.post('/api/v1/auth/mfa/disable').set('Origin','http://localhost:5173').send({password:'wrong',code:totp(secret)});expect(denied.status).toBe(400);expect(user.mfaEnabled).toBe(true);
    const success=await agent.post('/api/v1/auth/mfa/disable').set('Origin','http://localhost:5173').send({password:'ValidPassword123!',code:totp(secret)});expect(success.status).toBe(200);expect(user.mfaEnabled).toBe(false);expect(user.mfaSecret).toBeUndefined();
  });
  it('changes passwords only after verifying the current password and revokes other sessions',async()=>{
    vi.spyOn(mongoose.connection,'collection').mockReturnValue({deleteMany:vi.fn().mockResolvedValue({deletedCount:2})} as any);
    const user=setUser(),agent=request.agent(createApp());await agent.post('/api/v1/auth/login').send({email:user.email,password:'ValidPassword123!'});
    const bad=await agent.post('/api/v1/auth/password/change').set('Origin','http://localhost:5173').send({currentPassword:'wrong',newPassword:'BetterPassword123!'});expect(bad.status).toBe(400);
    const good=await agent.post('/api/v1/auth/password/change').set('Origin','http://localhost:5173').send({currentPassword:'ValidPassword123!',newPassword:'BetterPassword123!'});
    expect(good.status).toBe(200);expect(good.body.data.sessionsRevoked).toBe(true);expect(await bcrypt.compare('BetterPassword123!',user.passwordHash)).toBe(true);
  });
  it('returns a non-enumerating reset response when SMTP is unavailable',async()=>{
    const app=createApp(),known=await request(app).post('/api/v1/auth/password/reset/request').send({email:'admin@example.test'});
    models.User.findOne.mockResolvedValue(null);const unknown=await request(app).post('/api/v1/auth/password/reset/request').send({email:'missing@example.test'});
    expect(known.body.data.message).toBe(unknown.body.data.message);expect(known.body.data.message).toMatch(/if the account is eligible/i);
  });
  it('rejects expired reset tokens and accepts a valid token only once',async()=>{
    vi.spyOn(mongoose.connection,'collection').mockReturnValue({deleteMany:vi.fn().mockResolvedValue({deletedCount:2})} as any);
    const user=setUser(),token=randomResetToken(),agent=request.agent(createApp());user.passwordResetHash=tokenDigest(token);user.passwordResetExpires=new Date(Date.now()-1);
    models.User.findOneAndUpdate.mockImplementation(async(filter:any,update:any)=>{if(filter.passwordResetHash!==user.passwordResetHash||user.passwordResetExpires<=new Date())return null;user.passwordHash=update.$set.passwordHash;user.passwordChangedAt=update.$set.passwordChangedAt;user.passwordResetHash=undefined;user.passwordResetExpires=undefined;return user});
    expect((await agent.post('/api/v1/auth/password/reset/complete').send({token,newPassword:'ResetPassword123!'})).status).toBe(400);user.passwordResetExpires=new Date(Date.now()+60_000);
    const result=await agent.post('/api/v1/auth/password/reset/complete').send({token,newPassword:'ResetPassword123!'});
    expect(result.status).toBe(200);expect(user.passwordResetHash).toBeUndefined();expect(await bcrypt.compare('ResetPassword123!',user.passwordHash)).toBe(true);
    expect((await agent.post('/api/v1/auth/password/reset/complete').send({token,newPassword:'ResetPassword456!'})).status).toBe(400);
  });
  it('rejects unsafe origins and users without administrator permission',async()=>{
    const agent=request.agent(createApp());await agent.post('/api/v1/auth/login').send({email:'admin@example.test',password:'ValidPassword123!'});
    const blocked=await agent.post('/api/v1/auth/password/change').set('Origin','https://attacker.invalid').send({currentPassword:'x',newPassword:'StrongPassword123!'});
    expect(blocked.status).toBe(403);
    setUser({role:'viewer'});const forbidden=await agent.get('/api/v1/dashboard');expect(forbidden.status).toBe(403);
  });
  it('rate limits repeated sign-in failures',async()=>{
    models.User.findOne.mockResolvedValue(null);const app=createApp();let last:any;
    for(let attempt=0;attempt<9;attempt++)last=await request(app).post('/api/v1/auth/login').send({email:'missing@example.test',password:'wrong'});
    expect(last.status).toBe(429);
  }, 15000);
  it('sets secure production cookie flags and restricts cross-origin access',async()=>{
    process.env.NODE_ENV='production';const app=createApp(),response=await request(app).post('/api/v1/auth/login').set('X-Forwarded-Proto','https').send({email:'admin@example.test',password:'ValidPassword123!'}),cookie=response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=Lax');expect(cookie).toContain('Expires=');
    const allowed=await request(app).get('/api/v1/health').set('Origin','http://localhost:5173');const blocked=await request(app).get('/api/v1/health').set('Origin','https://attacker.invalid');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');expect(blocked.headers['access-control-allow-origin']).toBeUndefined();expect(blocked.headers['content-security-policy']).toBeTruthy();
  });
});
