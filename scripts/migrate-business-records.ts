import 'dotenv/config';
import mongoose from 'mongoose';
import { WorkspaceRecord } from '../server/src/models/index.js';
import { BusinessClient, BusinessDeployment, BusinessInfrastructure, BusinessLead, BusinessNotification, BusinessService, BusinessTechnicalDebt, BusinessTestCase, BusinessTransaction } from '../server/src/models/business.js';
import { mapLegacyBusinessRecord } from '../server/src/services/legacyBusinessMigration.js';

const apply = process.argv.includes('--apply');
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI must target an isolated copy of the database.'); process.exit(1); }
if (apply && !process.argv.includes('--confirm-isolated-database')) { console.error('Apply requires --confirm-isolated-database after verifying this is an isolated database copy.'); process.exit(1); }
const target = process.argv.find(arg => arg.startsWith('--database-name='))?.slice('--database-name='.length);
const models: Record<string, any> = { BusinessClient, BusinessLead, BusinessService, BusinessTransaction, BusinessTechnicalDebt, BusinessTestCase, BusinessInfrastructure, BusinessDeployment, BusinessNotification };
await mongoose.connect(process.env.MONGODB_URI);
try {
  if (target && mongoose.connection.name !== target) throw new Error(`Connected database name did not match the requested target ${target}.`);
  const modules = ['clients','leads','services','proposals','invoices','finance','technical-debt','testing','infrastructure','deployments','notifications'];
  const rows = await WorkspaceRecord.find({ module: { $in: modules } }).sort({ _id: 1 }).lean();
  const report: Array<{ sourceId: string; module: string; destination?: string; status: 'ready'|'created'|'already-migrated'|'review'; issue?: string }> = [];
  for (const row of rows) {
    const sourceId = String(row._id);
    if (await Promise.all(Object.values(models).map((Model: any) => Model.exists({ legacySourceId: row._id }))).then(matches => matches.some(Boolean))) { report.push({ sourceId, module: row.module, status: 'already-migrated' }); continue; }
    const converted = mapLegacyBusinessRecord(row as any);
    if ('issue' in converted) { report.push({ sourceId, module: row.module, status: 'review', issue: converted.issue }); continue; }
    const Model = models[converted.collection];
    if (!Model) { report.push({ sourceId, module: row.module, status: 'review', issue: 'No destination model is registered.' }); continue; }
    if (apply) {
      try { await Model.create(converted.value); report.push({ sourceId, module: row.module, destination: converted.collection, status: 'created' }); }
      catch (error: any) { report.push({ sourceId, module: row.module, destination: converted.collection, status: 'review', issue: error?.code === 11000 ? 'Duplicate unique value; source retained.' : 'Destination validation/write failed; source retained.' }); }
    } else report.push({ sourceId, module: row.module, destination: converted.collection, status: 'ready' });
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sourceRecords: rows.length, ready: report.filter(x=>x.status==='ready').length, created: report.filter(x=>x.status==='created').length, alreadyMigrated: report.filter(x=>x.status==='already-migrated').length, needsReview: report.filter(x=>x.status==='review').length, sourceRecordsPreserved: true, entries: report }, null, 2));
} finally { await mongoose.disconnect(); }
