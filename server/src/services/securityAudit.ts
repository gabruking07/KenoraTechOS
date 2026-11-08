import mongoose from 'mongoose';
import { SecurityEvent } from '../models/index.js';

export async function recordSecurityEvent(req: any, eventType: string, result: 'success'|'failure'|'denied'|'unavailable', options: { actorId?: unknown; targetType?: string; targetId?: unknown; metadata?: Record<string, unknown> } = {}) {
  if (mongoose.connection.readyState !== 1) return null;
  const metadata = Object.fromEntries(Object.entries(options.metadata || {}).filter(([key, value]) =>
    !/(password|secret|token|cookie|session|authorization|credential|code)/i.test(key) &&
    ['string','number','boolean'].includes(typeof value)
  ).map(([key, value]) => [key.slice(0, 60), typeof value === 'string' ? value.slice(0, 200) : value]));
  return SecurityEvent.create({ eventType, result, correlationId: req.requestId || 'unknown', ...(options.actorId ? { actorId: options.actorId } : {}), ...(options.targetType ? { targetType: options.targetType } : {}), ...(options.targetId ? { targetId: String(options.targetId).slice(0, 120) } : {}), metadata });
}
