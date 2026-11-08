import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearProviderCacheForTests, providerJson, providerPages } from '../../src/services/providerHttp.js';

afterEach(() => { vi.unstubAllGlobals(); clearProviderCacheForTests(); });

describe('provider HTTP adapter', () => {
  it('caches successful responses without exposing bearer credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await providerJson('https://provider.example.test/me', 'private-token')).toEqual({ ok: true });
    expect(await providerJson('https://provider.example.test/me', 'private-token')).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await providerJson('https://provider.example.test/me', 'private-token'))).not.toContain('private-token');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer private-token');
  });

  it('retries rate-limited requests and reports only sanitized status errors', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await providerJson('https://provider.example.test/rate', 'token')).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(providerJson('https://provider.example.test/invalid', 'secret-token')).rejects.toThrow('Provider request failed (401)');
  });

  it('follows provider Link pagination with a bounded page count', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { link: '<https://provider.example.test/page2>; rel="next"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 2 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await providerPages('https://provider.example.test/page1', 'token', {}, 5)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
