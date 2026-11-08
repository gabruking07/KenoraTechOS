import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DocumentStorage } from '../../src/services/documentStorage.js';
import { readAndValidateBackup } from '../../src/services/backupArchive.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('reliability primitives', () => {
  it('stores, reads, verifies and deletes local objects without unsafe keys', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kenora-storage-test-')); temporary.push(dir);
    const storage = new DocumentStorage({ provider: 'local', directory: path.join(dir, 'objects') });
    const source = path.join(dir, 'source.txt'); await writeFile(source, 'private test bytes');
    const key = await storage.put(source);
    expect(await storage.exists(key)).toBe(true);
    const object = await storage.read(key);
    expect(await readFile(object.path!,'utf8')).toBe('private test bytes');
    await expect(storage.read('../source.txt')).rejects.toThrow('Invalid stored document key');
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('preserves existing local objects when a duplicate key has different bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kenora-storage-test-')); temporary.push(dir);
    const storage = new DocumentStorage({ provider: 'local', directory: path.join(dir, 'objects') });
    const original = path.join(dir, 'original.txt'), different = path.join(dir, 'different.txt');
    await writeFile(original, 'original'); await writeFile(different, 'different');
    const key = await storage.put(original);
    await expect(storage.put(different, key)).rejects.toThrow('different content');
    expect(await readFile((await storage.read(key)).path!, 'utf8')).toBe('original');
  });

  it('rejects external storage errors and accepts an existing identical object key', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kenora-storage-test-')); temporary.push(dir);
    const source = path.join(dir, 'source.txt'); await writeFile(source, 'same bytes');
    const storage = new DocumentStorage({ provider: 'http', endpoint: 'https://storage.invalid', token: 'test-token' });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async (_input: any, init?: RequestInit) => init?.method === 'PUT'
        ? new Response(null, { status: 412 })
        : new Response('same bytes', { status: 200 })) as typeof fetch;
      expect(await storage.put(source, '11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
      await expect(storage.put(source, '../invalid')).rejects.toThrow('Invalid stored document key');
      globalThis.fetch = vi.fn(async () => new Response('gateway failure', { status: 503 })) as typeof fetch;
      await expect(storage.read('11111111-1111-4111-8111-111111111111')).rejects.toThrow('503');
      globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
      await expect(storage.read('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { globalThis.fetch = originalFetch; }
  });

  it('fails migration verification when the destination bytes differ and keeps the source', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kenora-storage-test-')); temporary.push(dir);
    const source = path.join(dir, 'legacy.txt'); await writeFile(source, 'source bytes');
    const storage = new DocumentStorage({ provider: 'http', endpoint: 'https://storage.invalid', token: 'test-token' });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async (_input: any, init?: RequestInit) => init?.method === 'PUT'
        ? new Response(null, { status: 200 })
        : init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('corrupt bytes', { status: 200 })) as typeof fetch;
      await expect(storage.migrateLocalFile(source)).rejects.toThrow('checksum verification failed');
      expect(await readFile(source, 'utf8')).toBe('source bytes');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('rejects a backup whose archive checksum does not match', async () => {
    const bytes = gzipSync('{"type":"manifest","format":"kenoratech-full-backup","schemaVersion":1}\n');
    await expect(readAndValidateBackup(bytes, '0'.repeat(64))).rejects.toThrow('checksum');
  });

  it('validates an intact empty backup envelope', async () => {
    const header = '{"type":"manifest","format":"kenoratech-full-backup","schemaVersion":1}\n';
    const contentChecksum = createHash('sha256').update(header).digest('hex');
    const raw = `${header}${JSON.stringify({type:'summary',schemaVersion:1,counts:{},files:[],contentChecksum,uncompressedBytes:Buffer.byteLength(header)})}\n`;
    const bytes = gzipSync(raw); const checksum = createHash('sha256').update(raw).digest('hex');
    const backup = await readAndValidateBackup(bytes, checksum);
    expect(backup.records).toEqual({}); expect(backup.files).toEqual([]);
  });
});
