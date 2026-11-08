// In production, route API requests through Vercel so the browser uses a
// same-origin session cookie. Local development talks directly to the API.
const base = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1');
export type PageResult<T> = { data: T[]; meta: { page: number; limit: number; total: number; pages: number } };
async function responseBody(path: string, options: RequestInit = {}) {
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.message || `Request failed (${response.status})`);
  return body;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await responseBody(path, options);
  return body.data as T;
}
export async function apiPage<T>(path: string): Promise<PageResult<T>> { const body = await responseBody(path); return { data: body.data as T[], meta: body.meta }; }
export async function downloadFile(path: string, filename: string) {
  const response = await fetch(`${base}${path}`, { credentials: 'include' });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error?.message || `Download failed (${response.status})`); }
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
