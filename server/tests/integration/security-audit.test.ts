import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
const mocks=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('../../src/models/index.js',()=>({SecurityEvent:{create:mocks.create}}));
import { recordSecurityEvent } from '../../src/services/securityAudit.js';

const readyState=mongoose.connection.readyState;
afterEach(()=>{(mongoose.connection as any).readyState=readyState;vi.clearAllMocks()});
describe('security event recording',()=>{
  it('records actor, target, result and correlation while filtering sensitive metadata keys',async()=>{
    (mongoose.connection as any).readyState=1;mocks.create.mockResolvedValue({});
    await recordSecurityEvent({requestId:'request-correlation-id'},'auth.password.change','success',{actorId:'507f1f77bcf86cd799439011',targetType:'User',targetId:'507f1f77bcf86cd799439011',metadata:{reason:'self-service',resetToken:'never-store-this',sessionId:'never-store-this-either',revokedCount:2}});
    const event=mocks.create.mock.calls[0][0];expect(event.actorId).toBe('507f1f77bcf86cd799439011');expect(event.targetType).toBe('User');expect(event.result).toBe('success');expect(event.correlationId).toBe('request-correlation-id');expect(event.metadata).toEqual({reason:'self-service',revokedCount:2});
  });
  it('does not buffer security writes while the database is disconnected',async()=>{
    (mongoose.connection as any).readyState=0;await recordSecurityEvent({requestId:'request-id'},'auth.login','failure');expect(mocks.create).not.toHaveBeenCalled();
  });
});
