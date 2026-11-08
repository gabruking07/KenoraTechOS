import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
export const requestContext:RequestHandler=(req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);next()};
export function safeLogPath(req:Pick<Request,'path'|'originalUrl'>){return (req.originalUrl||req.path||'-').split('?',1)[0].slice(0,2048)}
