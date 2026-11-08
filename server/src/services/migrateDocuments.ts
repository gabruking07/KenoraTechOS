import path from 'node:path';
import { access, constants } from 'node:fs/promises';
import mongoose from 'mongoose';
import { StoredDocument } from '../models/index.js';
import { documentStorage, storageConfig } from './documentStorage.js';

const apply = process.argv.includes('--apply');
const localDir = path.resolve(process.env.LEGACY_UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'));
const config = storageConfig();
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
await mongoose.connect(process.env.MONGODB_URI);
let copied = 0, missing = 0, unchanged = 0;
try {
  for await (const document of StoredDocument.find().cursor()) {
    const refs = [document.storageName, ...document.versions.map((v: any) => v.storageName)].filter(Boolean) as string[];
    let changed = false;
    for (const oldKey of refs) {
      if (config.provider === 'local') { unchanged++; continue; }
      const source = path.join(localDir, path.basename(oldKey));
      try { await access(source, constants.R_OK); } catch { missing++; console.warn(`Missing legacy file for document ${document.id}; metadata left unchanged.`); continue; }
      if (!apply) { copied++; continue; }
      const newKey = await documentStorage.migrateLocalFile(source);
      if (document.storageName === oldKey) document.storageName = newKey;
      else { const version = document.versions.find((v: any) => v.storageName === oldKey); if (version) version.storageName = newKey; }
      copied++; changed = true;
    }
    if (changed) await document.save();
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', copied, missing, unchanged, originalsDeleted: 0 }, null, 2));
} finally { await mongoose.disconnect(); }
