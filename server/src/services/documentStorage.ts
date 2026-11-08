import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, copyFile, readFile, constants, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export type StorageConfig = { provider: 'local' | 'http'; directory?: string; endpoint?: string; token?: string };
export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = env.STORAGE_PROVIDER || 'local';
  if (provider !== 'local' && provider !== 'http') throw new Error('STORAGE_PROVIDER must be local or http.');
  if (provider === 'http' && (!env.STORAGE_ENDPOINT || !env.STORAGE_TOKEN)) throw new Error('STORAGE_ENDPOINT and STORAGE_TOKEN are required for http document storage.');
  return { provider, directory: path.resolve(env.LOCAL_STORAGE_DIR || path.resolve(process.cwd(), 'uploads')), endpoint: env.STORAGE_ENDPOINT?.replace(/\/$/, ''), token: env.STORAGE_TOKEN };
}
const safeKey = (key: string) => {
  if (!/^[a-f\d-]{36}$/i.test(key)) throw new Error('Invalid stored document key.');
  return key;
};

export class DocumentStorage {
  constructor(private readonly config: StorageConfig) {}
  async put(source: string, requestedKey?: string): Promise<string> {
    const key = requestedKey ? safeKey(requestedKey) : randomUUID();
    if (this.config.provider === 'local') {
      const dir = this.config.directory!; await mkdir(dir, { recursive: true });
      const target = path.join(dir, key);
      try { await copyFile(source, target, constants.COPYFILE_EXCL); }
      catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
        const [existing, incoming] = await Promise.all([readFile(target), readFile(source)]);
        if (createHash('sha256').update(existing).digest('hex') !== createHash('sha256').update(incoming).digest('hex')) throw new Error('Storage key already exists with different content; existing file was preserved.');
      }
    } else {
      const body = createReadStream(source);
      const response = await fetch(`${this.config.endpoint}/${key}`, { method: 'PUT', headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/octet-stream', ...(requestedKey ? { 'If-None-Match': '*' } : {}) }, body: body as unknown as BodyInit, duplex: 'half' } as RequestInit & { duplex: 'half' });
      if (response.status === 412 && requestedKey) {
        const stored = await this.read(key);
        const incoming = await readFile(source);
        if (!stored.bytes || createHash('sha256').update(stored.bytes).digest('hex') !== createHash('sha256').update(incoming).digest('hex')) throw new Error('Storage key already exists with different content; existing file was preserved.');
      } else if (!response.ok) throw new Error(`External storage upload failed (${response.status}).`);
    }
    return key;
  }
  async read(keyValue: string): Promise<{ path?: string; bytes?: Buffer }> {
    const key = safeKey(keyValue);
    if (this.config.provider === 'local') {
      const file = path.join(this.config.directory!, key); await stat(file); return { path: file };
    }
    const response = await fetch(`${this.config.endpoint}/${key}`, { headers: { Authorization: `Bearer ${this.config.token}` }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) throw Object.assign(new Error('Stored file is unavailable'), { code: 'ENOENT' });
    if (!response.ok) throw new Error(`External storage download failed (${response.status}).`);
    return { bytes: Buffer.from(await response.arrayBuffer()) };
  }
  async probe(): Promise<boolean> {
    if (this.config.provider === 'local') {
      try { await mkdir(this.config.directory!, { recursive: true }); await access(this.config.directory!, constants.R_OK | constants.W_OK); return true; }
      catch { return false; }
    }
    try { await this.read(randomUUID()); return true; }
    catch (error: any) { return error?.code === 'ENOENT'; }
  }
  async exists(key: string): Promise<boolean> { try { await this.read(key); return true; } catch (error: any) { if (error?.code === 'ENOENT') return false; throw error; } }
  async delete(keyValue: string): Promise<void> {
    const key = safeKey(keyValue);
    if (this.config.provider === 'local') { await rm(path.join(this.config.directory!, key), { force: true }); return; }
    const response = await fetch(`${this.config.endpoint}/${key}`, { method: 'DELETE', headers: { Authorization: `Bearer ${this.config.token}` } });
    if (!response.ok && response.status !== 404) throw new Error(`External storage delete failed (${response.status}).`);
  }
  async migrateLocalFile(filename: string): Promise<string> {
    const source = path.resolve(filename); const sourceBytes = await readFile(source); const key = await this.put(source);
    try {
      const stored = await this.read(key); const storedBytes = stored.bytes || await readFile(stored.path!);
      if (createHash('sha256').update(sourceBytes).digest('hex') !== createHash('sha256').update(storedBytes).digest('hex')) throw new Error('Storage migration checksum verification failed.');
    } catch (error) {
      await this.delete(key).catch(() => {});
      throw new Error(`Storage migration verification failed; original file was preserved. ${error instanceof Error ? error.message : ''}`);
    }
    return key;
  }
}
export const documentStorage = new DocumentStorage(storageConfig());
