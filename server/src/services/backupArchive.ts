import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGzip, gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import { ActivityLog, Category, Folder, Milestone, Project, SecurityEvent, StoredDocument, Task, Technology, User, WorkspaceRecord } from '../models/index.js';
import { documentStorage } from './documentStorage.js';
import { BusinessClient, BusinessDeployment, BusinessInfrastructure, BusinessInvoice, BusinessLead, BusinessNotification, BusinessPayment, BusinessProposal, BusinessService, BusinessTechnicalDebt, BusinessTestCase, BusinessTestExecution, BusinessTransaction } from '../models/business.js';
import { calculateLines } from './businessFinance.js';
import { AutomationExecution, AutomationWorkflow } from '../models/automation.js';

const schemaVersion = 1;
const maxArchiveBytes = 256 * 1024 * 1024;
const collections: Array<[string, any]> = [['projects',Project],['folders',Folder],['categories',Category],['technologies',Technology],['tasks',Task],['milestones',Milestone],['records',WorkspaceRecord],['activity',ActivityLog],['securityEvents',SecurityEvent],['documents',StoredDocument],['users',User],['businessClients',BusinessClient],['businessLeads',BusinessLead],['businessServices',BusinessService],['businessProposals',BusinessProposal],['businessInvoices',BusinessInvoice],['businessPayments',BusinessPayment],['businessTransactions',BusinessTransaction],['businessTestCases',BusinessTestCase],['businessTestExecutions',BusinessTestExecution],['businessTechnicalDebt',BusinessTechnicalDebt],['businessInfrastructure',BusinessInfrastructure],['businessDeployments',BusinessDeployment],['businessNotifications',BusinessNotification],['automations',AutomationWorkflow],['automationExecutions',AutomationExecution]];
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
async function writeLine(stream: NodeJS.WritableStream, line: string) { if (!stream.write(`${line}\n`)) await once(stream, 'drain'); }

export async function createFullBackup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'kenora-backup-'));
  const compressed = path.join(directory, 'backup.jsonl.gz');
  const file = createWriteStream(compressed, { flags: 'wx' }); const gzip = createGzip({ level: 6 }); gzip.pipe(file);
  const digest = createHash('sha256'),archiveDigest=createHash('sha256'); const counts: Record<string, number> = {}; const files: Array<{key:string;sha256:string;size:number}> = []; let totalBytes = 0;
  const line = async (value: unknown) => { const text = `${JSON.stringify(value)}\n`; totalBytes += Buffer.byteLength(text); if (totalBytes > maxArchiveBytes) throw new Error('Backup exceeds the configured 256 MB uncompressed safety limit.'); digest.update(text);archiveDigest.update(text); await writeLine(gzip, text.slice(0, -1)); };
  try {
    await line({ type: 'manifest', format: 'kenoratech-full-backup', schemaVersion, createdAt: new Date().toISOString() });
    for (const [name, model] of collections) {
      counts[name] = 0;
      for await (const row of model.find().lean().cursor()) {
        const data = name === 'users' ? { _id: row._id, email: row.email, name: row.name, role: row.role, createdAt: row.createdAt, updatedAt: row.updatedAt } : row;
        await line({ type: 'record', collection: name, data }); counts[name]++;
      }
    }
    for await (const doc of StoredDocument.find().cursor()) {
      for (const stored of [{ key: doc.storageName, name: doc.name }, ...doc.versions.map((v: any) => ({ key: v.storageName, name: v.name }))]) {
        if (!stored.key) throw new Error(`Backup stopped: document ${doc.id} has a missing storage reference.`);
        const result = await documentStorage.read(stored.key); const bytes = result.bytes || await readFile(result.path!); const checksum = sha(bytes);
        await line({ type: 'file', key: stored.key, name: stored.name, size: bytes.length, sha256: checksum, base64: bytes.toString('base64') }); files.push({ key: stored.key, sha256: checksum, size: bytes.length });
      }
    }
    const contentChecksum=digest.digest('hex');const summary=`${JSON.stringify({type:'summary',schemaVersion,counts,files,contentChecksum,uncompressedBytes:totalBytes})}\n`;totalBytes+=Buffer.byteLength(summary);if(totalBytes>maxArchiveBytes)throw new Error('Backup exceeds the configured 256 MB uncompressed safety limit.');archiveDigest.update(summary);await writeLine(gzip,summary.slice(0,-1));
    await new Promise<void>((resolve, reject) => { gzip.once('error', reject); file.once('error', reject); file.once('finish', resolve); gzip.end(); });
    const storageName = await documentStorage.put(compressed);
    const checksum = archiveDigest.digest('hex');
    return { storageName, checksum, schemaVersion, manifest: { counts, files, checksum, contentChecksum, uncompressedBytes: totalBytes, createdAt: new Date().toISOString(), excluded: ['active sessions', 'password hashes and authentication secrets', 'backup history'] } };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function readAndValidateBackup(bytes: Buffer, expectedChecksum: string) {
  const raw = gunzipSync(bytes, { maxOutputLength: maxArchiveBytes });
  if (sha(raw) !== expectedChecksum) throw new Error('Backup archive checksum does not match its manifest.');
  const text=raw.toString('utf8'),rawLines=text.split('\n');if(rawLines.at(-1)==='')rawLines.pop();
  const summary=JSON.parse(rawLines.pop()||'null');const content=Buffer.from(`${rawLines.join('\n')}\n`);
  if(summary?.type!=='summary'||summary.schemaVersion!==schemaVersion||sha(content)!==summary.contentChecksum)throw new Error('Backup archive manifest is missing or inconsistent.');
  const lines = rawLines.map((line) => JSON.parse(line));
  const header = lines.shift();
  if (header?.type !== 'manifest' || header.format !== 'kenoratech-full-backup' || header.schemaVersion !== schemaVersion) throw new Error('Unsupported backup format or schema version.');
  const records: Record<string, any[]> = {}; const files: any[] = [];
  for (const item of lines) {
    if (item.type === 'record' && collections.some(([name]) => name === item.collection)) (records[item.collection] ||= []).push(item.data);
    else if (item.type === 'file' && typeof item.key === 'string' && /^[a-f\d-]{36}$/i.test(item.key) && typeof item.base64 === 'string' && Buffer.from(item.base64, 'base64').length === item.size && sha(Buffer.from(item.base64, 'base64')) === item.sha256) files.push(item);
    else throw new Error('Backup contains an invalid or damaged entry.');
  }
  if(files.length!==(summary.files||[]).length||Object.entries(summary.counts||{}).some(([name,count])=>(records[name]?.length||0)!==count)||files.some(file=>!(summary.files||[]).some((entry:any)=>entry.key===file.key&&entry.sha256===file.sha256&&entry.size===file.size)))throw new Error('Backup archive manifest counts do not match its contents.');
  const ids = new Map<string, Set<string>>();
  for (const [name, rows] of Object.entries(records)) { const seen = new Set<string>(); for (const row of rows) { const id = String(row._id); if (!row._id || seen.has(id)) throw new Error(`Backup contains duplicate or missing IDs in ${name}.`); seen.add(id); } ids.set(name, seen); }
  const known = async (collection: string, value: unknown): Promise<boolean> => {
    if (!value || ids.get(collection)?.has(String(value))) return true;
    const model = collections.find(([name]) => name === collection)?.[1];
    return model ? Boolean(await model.exists({ _id: value })) : false;
  };
  for (const project of records.projects || []) { if (!(await known('categories', project.category))) throw new Error(`Project ${project.name} references a missing category.`); if (!(await known('folders', project.folder))) throw new Error(`Project ${project.name} references a missing folder.`); }
  for (const row of records.folders || []) { if (!(await known('folders', row.parent))) throw new Error(`Folder ${row.name} references a missing parent.`); if (!(await known('projects', row.project))) throw new Error(`Folder ${row.name} references a missing project.`); }
  const milestoneRows = new Map((records.milestones || []).map((row:any)=>[String(row._id),row]));
  for (const row of records.tasks || []) { if (!(await known('projects', row.project))) throw new Error(`Task ${row.title} references a missing project.`); if (!(await known('milestones', row.milestone))) throw new Error(`Task ${row.title} references a missing milestone.`);const milestone=row.milestone?milestoneRows.get(String(row.milestone)):undefined;if(milestone&&row.project&&String(milestone.project)!==String(row.project))throw new Error(`Task ${row.title} references a milestone from another project.`); }
  for (const row of records.milestones || []) { if (!(await known('projects', row.project))) throw new Error(`Milestone ${row.name} references a missing project.`); for (const id of row.dependencies || []) if (!(await known('milestones', id))) throw new Error(`Milestone ${row.name} references a missing dependency.`); }
  for (const row of records.records || []) if (!(await known('projects', row.fields?.project))) throw new Error(`Workspace record ${row.title} references a missing project.`);
  for (const row of records.documents || []) if (!(await known('projects', row.project))) throw new Error(`Document ${row.name} references a missing project.`);
  for (const row of records.businessLeads || []) if (!(await known('businessClients', row.convertedClient))) throw new Error(`Lead ${row.name} references a missing client.`);
  for (const row of records.businessProposals || []) { if (!(await known('businessClients', row.client))) throw new Error(`Proposal ${row.number} references a missing client.`); if (!(await known('businessLeads', row.lead))) throw new Error(`Proposal ${row.number} references a missing lead.`);const totals=calculateLines(row.lines||[]);for(const key of ['subtotalMinor','discountMinor','taxMinor','totalMinor'] as const)if(totals[key]!==row[key])throw new Error(`Proposal ${row.number} has inconsistent financial totals.`);for(const line of row.lines||[])if(!(await known('businessServices',line.service)))throw new Error(`Proposal ${row.number} references a missing service.`); }
  for (const row of records.businessInvoices || []) { if (!(await known('businessClients', row.client))) throw new Error(`Invoice ${row.number} references a missing client.`); if (!(await known('projects', row.project))) throw new Error(`Invoice ${row.number} references a missing project.`); if (!(await known('businessProposals', row.proposal))) throw new Error(`Invoice ${row.number} references a missing proposal.`);const totals=calculateLines(row.lines||[]);for(const key of ['subtotalMinor','discountMinor','taxMinor','totalMinor'] as const)if(totals[key]!==row[key])throw new Error(`Invoice ${row.number} has inconsistent financial totals.`);for(const line of row.lines||[])if(!(await known('businessServices',line.service)))throw new Error(`Invoice ${row.number} references a missing service.`); }
  for (const row of records.businessPayments || []) { if (!(await known('businessInvoices', row.invoice))) throw new Error(`Payment ${row.number} references a missing invoice.`); if (!(await known('businessClients', row.client))) throw new Error(`Payment ${row.number} references a missing client.`); if (!(await known('projects', row.project))) throw new Error(`Payment ${row.number} references a missing project.`); }
  for (const row of records.businessTransactions || []) { if (!(await known('businessClients', row.client))) throw new Error(`Transaction ${row.number} references a missing client.`); if (!(await known('projects', row.project))) throw new Error(`Transaction ${row.number} references a missing project.`); if (!(await known('businessInvoices', row.invoice))) throw new Error(`Transaction ${row.number} references a missing invoice.`); }
  for (const collection of ['businessTestCases','businessTechnicalDebt','businessInfrastructure','businessDeployments'] as const) for (const row of records[collection] || []) if (!(await known('projects', row.project))) throw new Error(`${collection} record references a missing project.`);
  for (const row of records.businessTestExecutions || []) { if (!(await known('businessTestCases', row.testCase))) throw new Error('Test execution references a missing test case.'); if (!(await known('projects', row.project))) throw new Error('Test execution references a missing project.'); }
  for(const row of records.automations||[])if(!(await known('projects',row.action?.project)))throw new Error(`Automation ${row.name} references a missing project.`);
  for(const row of records.automationExecutions||[])if(!(await known('automations',row.workflow)))throw new Error('Automation execution references a missing workflow.');
  const fileKeys = new Set<string>();
  for (const item of files) { if (fileKeys.has(item.key)) throw new Error('Backup contains a duplicate file key.'); fileKeys.add(item.key); }
  for (const row of records.documents || []) for (const key of [row.storageName, ...(row.versions || []).map((v: any) => v.storageName)]) if (!key || !fileKeys.has(key)) throw new Error(`Document ${row.name} is missing a file from the backup.`);
  return { records, files, header };
}
