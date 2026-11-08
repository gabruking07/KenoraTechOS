import { createHash } from 'node:crypto';

export class ProviderRequestError extends Error {
  constructor(readonly status: number, message = 'Provider request failed') { super(message); this.name = 'ProviderRequestError'; }
}

const CACHE_MS = 30_000;
const MAX_RETRIES = 2;
const cache = new Map<string, { expires: number; value: unknown }>();
let active = 0;
const waiters: Array<() => void> = [];
async function withConcurrency<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>(resolve => waiters.push(resolve));
  else active++;
  try { return await work(); } finally { const next = waiters.shift(); if (next) next(); else active--; }
}
function safeDelay(ms: number) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ms, 2000)))); }

export async function providerJson(url: string, token: string, extraHeaders: Record<string, string> = {}, options: { cacheMs?: number; retry?: boolean } = {}) {
  const key = createHash('sha256').update(`${url}\0${token}`).digest('hex');
  const ttl = options.cacheMs ?? CACHE_MS;
  const cached = cache.get(key);
  if (ttl > 0 && cached && cached.expires > Date.now()) return cached.value;
  return withConcurrency(async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= (options.retry === false ? 0 : MAX_RETRIES); attempt++) {
      try {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extraHeaders }, signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          let data: unknown;
          try { data = await response.json(); } catch { throw new ProviderRequestError(502, 'Provider returned invalid JSON'); }
          if (ttl > 0) { cache.set(key, { expires: Date.now() + ttl, value: data }); if (cache.size > 500) { const first = cache.keys().next().value; if (first) cache.delete(first); } }
          return data;
        }
        lastStatus = response.status;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_RETRIES || options.retry === false) throw new ProviderRequestError(response.status, `Provider request failed (${response.status})`);
        const retryAfter = Number(response.headers.get('retry-after'));
        await safeDelay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 150 * (2 ** attempt));
      } catch (error) {
        if (error instanceof ProviderRequestError) throw error;
        if (attempt === MAX_RETRIES || options.retry === false) throw new ProviderRequestError(lastStatus || 504, 'Provider request timed out or could not be reached');
        await safeDelay(150 * (2 ** attempt));
      }
    }
    throw new ProviderRequestError(lastStatus || 502);
  });
}

export async function providerPages(url: string, token: string, extraHeaders: Record<string, string> = {}, maxPages = 5) {
  const pages: unknown[] = [];
  let current: string | undefined = url;
  await withConcurrency(async()=>{
    for (let index = 0; index < Math.max(1, Math.min(maxPages, 20)) && current; index++) {
      let response: Response | undefined;
      for (let attempt=0;attempt<=MAX_RETRIES;attempt++) {
        try { response=await fetch(current,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...extraHeaders},signal:AbortSignal.timeout(10_000)}); }
        catch { if(attempt===MAX_RETRIES)throw new ProviderRequestError(504,'Provider request timed out or could not be reached');await safeDelay(150*(2**attempt));continue; }
        if(response.ok)break;
        if(![429,500,502,503,504].includes(response.status)||attempt===MAX_RETRIES)throw new ProviderRequestError(response.status,`Provider request failed (${response.status})`);
        const retryAfter=Number(response.headers.get('retry-after'));await safeDelay(Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:150*(2**attempt));
      }
      if(!response?.ok)throw new ProviderRequestError(502);
      let data:any;try{data=await response.json()}catch{throw new ProviderRequestError(502,'Provider returned invalid JSON')}
      pages.push(data);
      const link=response.headers.get('link')||'';
      current=link.split(',').map(part=>part.match(/<([^>]+)>;\s*rel="?next"?/i)?.[1]).find(Boolean);
    }
  });
  return pages;
}

export function clearProviderCacheForTests() { cache.clear(); }
