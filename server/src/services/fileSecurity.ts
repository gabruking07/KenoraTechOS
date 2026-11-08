import { readFile } from 'node:fs/promises';

const signatures: Record<string, (data: Buffer) => boolean> = {
  '.pdf': data => data.subarray(0,5).toString('ascii') === '%PDF-',
  '.png': data => data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  '.jpg': data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  '.jpeg': data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
};
const expectedMime: Record<string,string[]> = { '.pdf':['application/pdf'],'.txt':['text/plain'],'.md':['text/markdown','text/plain'],'.png':['image/png'],'.jpg':['image/jpeg'],'.jpeg':['image/jpeg'] };
export function safeFilename(input: string) { const normalized = input.replace(/\\/g,'/').split('/').pop() || 'document'; return normalized.replace(/[\x00-\x1f\x7f"<>:*?|]/g,'_').trim().slice(0,255) || 'document'; }
export async function validateDocumentFile(file: { path:string; originalname:string; mimetype:string }) {
  const name = safeFilename(file.originalname), ext = name.slice(name.lastIndexOf('.')).toLowerCase(), types = expectedMime[ext];
  if (!types || !types.includes(file.mimetype)) throw new Error('File extension and MIME type do not match an allowed document type.');
  const data = await readFile(file.path);
  if (signatures[ext] ? !signatures[ext](data) : data.includes(0)) throw new Error('File content does not match the selected document type.');
  if (ext === '.txt' || ext === '.md') { try { new TextDecoder('utf-8', { fatal:true }).decode(data); } catch { throw new Error('Text documents must contain valid UTF-8 text.'); } }
  return { name, size:data.length };
}
export async function scanDocument(file: { path:string; originalname:string }) {
  const url = process.env.FILE_SCANNER_URL, token = process.env.FILE_SCANNER_TOKEN;
  if (!url && !token) return { scanned:false, verdict:'not-configured' as const };
  if (!url || !token) throw new Error('File scanner configuration is incomplete.');
  const data = await readFile(file.path);
  const response = await fetch(url, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/octet-stream', 'X-File-Name':safeFilename(file.originalname) }, body:new Uint8Array(data), signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`File scanning service returned ${response.status}.`);
  const result = await response.json() as { clean?:boolean };
  if (result.clean !== true) throw new Error('File was rejected by the malware scanning service.');
  return { scanned:true, verdict:'clean' as const };
}
