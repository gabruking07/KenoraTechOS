import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('API access', () => {
  afterEach(() => { delete process.env.MONGODB_URI; });

  it('reports degraded readiness when the database is disconnected', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const response = await request(createApp()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body.data.status).toBe('degraded');
    expect(response.body.data.database).toBe('disconnected');
  });

  it('requires an authenticated admin session for workspace data', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const response = await request(createApp()).get('/api/v1/dashboard');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('requires an authenticated session before global search', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const response = await request(createApp()).get('/api/v1/search?q=client');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('protects provider resources, provider health, and provider sync endpoints', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const app = createApp();
    const resources = await request(app).get('/api/v1/providers/resources');
    const health = await request(app).get('/api/v1/providers/health');
    const sync = await request(app).post('/api/v1/providers/sync').send({});
    expect(resources.status).toBe(401);
    expect(health.status).toBe(401);
    expect(sync.status).toBe(401);
  });

  it('protects dedicated business records with the same authenticated admin session', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const response = await request(createApp()).get('/api/v1/business/clients');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('blocks unauthenticated document upload and download routes', async () => {
    process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
    const app = createApp();
    const upload = await request(app).post('/api/v1/documents/upload');
    const download = await request(app).get('/api/v1/documents/507f1f77bcf86cd799439011/download');
    expect(upload.status).toBe(401);
    expect(download.status).toBe(401);
  });
});
