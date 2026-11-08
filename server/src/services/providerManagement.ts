import { ProviderLease, ProviderResource, ProviderSync } from '../models/provider.js';
import { ProviderRequestError, providerJson, providerPages } from './providerHttp.js';

type Provider = 'GitHub' | 'Vercel' | 'Render';
type Row = Record<string, any>;
const jobs = new Map<Provider, Promise<unknown>>();
const credentials: Record<Provider, string | undefined> = { GitHub: process.env.GITHUB_TOKEN, Vercel: process.env.VERCEL_ACCESS_TOKEN, Render: process.env.RENDER_API_KEY };
const authHeaders = { 'X-GitHub-Api-Version': '2022-11-28' };
const keyForRepo = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const match = raw.match(/(?:github\.com[:/])([^/]+)\/([^/?#]+?)(?:\.git)?$/i);
  return match ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}` : undefined;
};
const api = async (url: string, token: string, headers: Record<string,string> = {}) => providerJson(url, token, headers, { cacheMs: 0 });
async function renderRows(token: string, path: string) {
  const all: Row[] = []; let cursor = '';
  for (let i = 0; i < 20; i++) {
    const query = new URLSearchParams({ limit: '100' }); if (cursor) query.set('cursor', cursor);
    const rows = await api(`https://api.render.com/v1/${path}?${query}`, token) as Row[];
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows); cursor = String(rows.at(-1)?.cursor || ''); if (rows.length < 100 || !cursor) break;
  }
  return all;
}
function resource(provider: Provider, resourceType: string, row: Row, now: Date) {
  const service = row.service || row;
  if (provider === 'GitHub') return { provider, accountId: String(row.owner?.login || 'default'), resourceType: 'repository', externalId: String(row.id), name: String(row.full_name || row.name), url: row.html_url, status: row.archived ? 'Archived' : row.private ? 'Private' : 'Public', normalizedStatus: row.archived ? 'archived' : 'available', repositoryKey: keyForRepo(row.html_url), metadata: { description: row.description, owner: row.owner?.login, visibility: row.visibility || (row.private ? 'private' : 'public'), defaultBranch: row.default_branch, language: row.language, stars: row.stargazers_count, forks: row.forks_count, openIssues: row.open_issues_count, createdAt: row.created_at, updatedAt: row.updated_at, pushedAt: row.pushed_at }, lastSyncedAt: now, unavailableAt: null };
  if (provider === 'Vercel') return { provider, accountId: process.env.VERCEL_TEAM_ID || 'personal', resourceType: 'project', externalId: String(row.id), name: String(row.name || row.id), url: row.link?.productionUrl ? `https://${row.link.productionUrl}` : row.domains?.[0] ? `https://${row.domains[0]}` : undefined, status: row.latestDeployments?.[0]?.readyState || row.latestDeployments?.[0]?.state, normalizedStatus: String(row.latestDeployments?.[0]?.readyState || row.latestDeployments?.[0]?.state || 'unknown').toLowerCase(), repositoryKey: row.link?.repo ? `${row.link.org || row.link.repoOwner || ''}/${row.link.repo}`.replace(/^\//, '').toLowerCase() : undefined, metadata: { framework: row.framework, createdAt: row.createdAt, updatedAt: row.updatedAt, dashboardUrl: `https://vercel.com/dashboard?projectId=${encodeURIComponent(String(row.id))}`, productionDomains: row.domains || (row.link?.productionUrl ? [row.link.productionUrl] : []), link: row.link ? { type: row.link.type, org: row.link.org, repo: row.link.repo, repoId: row.link.repoId, productionBranch: row.link.productionBranch } : undefined }, lastSyncedAt: now, unavailableAt: null };
  if (provider === 'Render') return { provider, accountId: String(service.ownerId || 'default'), resourceType: 'service', externalId: String(service.id), name: String(service.name || service.id), url: service.serviceDetails?.url || service.url || `https://dashboard.render.com/web/${encodeURIComponent(service.id)}`, status: service.suspended ? 'Suspended' : service.serviceDetails?.healthCheckPath ? 'Configured' : service.type, normalizedStatus: service.suspended ? 'suspended' : String(service.status || 'available').toLowerCase(), repositoryKey: keyForRepo(service.repo), metadata: { type: service.type, branch: service.branch, repo: service.repo, region: service.region, runtime: service.serviceDetails?.runtime, createdAt: service.createdAt, updatedAt: service.updatedAt, dashboardUrl: service.dashboardUrl, suspended: service.suspended, ownerId: service.ownerId }, lastSyncedAt: now, unavailableAt: null };
  return { provider, accountId: 'default', resourceType, externalId: String(row.id), name: String(row.name || row.id), lastSyncedAt: now };
}
async function discover(provider: Provider, token: string) {
  if (provider === 'GitHub') {
    const pages = await providerPages('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token, authHeaders, 20);
    return pages.flatMap((page: any) => Array.isArray(page) ? page : []).map((row: Row) => resource(provider, 'repository', row, new Date()));
  }
  if (provider === 'Vercel') {
    const result: Row[] = []; let from = '';
    for (let i = 0; i < 20; i++) {
      const query = new URLSearchParams({ limit: '100' }); if (process.env.VERCEL_TEAM_ID) query.set('teamId', process.env.VERCEL_TEAM_ID); if (from) query.set('from', from);
      const data = await api(`https://api.vercel.com/v10/projects?${query}`, token) as Row;
      const rows: Row[] = Array.isArray(data) ? data : data.projects || []; if (!rows.length) break; result.push(...rows);
      const next = String(data.pagination?.next || data.pagination?.nextCursor || ''); if (!next || next === from || rows.length < 100) break; from = next;
    }
    return result.map(row => resource(provider, 'project', row, new Date()));
  }
  const rows = await renderRows(token, 'services');
  return rows.map((row: Row) => resource(provider, 'service', row.service || row, new Date()));
}
async function providerAccountName(provider: Provider, token: string): Promise<string> {
  if (provider === 'GitHub') { const data = await api('https://api.github.com/user', token, authHeaders) as Row; return String(data.login || 'GitHub account'); }
  if (provider === 'Vercel') { const data = await api('https://api.vercel.com/v2/user', token) as Row; return String(data.user?.username || data.user?.name || data.username || 'Vercel account'); }
  const owners = await renderRows(token, 'owners');
  const names = owners.map((row: Row) => row.owner?.name || row.name).filter(Boolean);
  return names.length ? [...new Set(names)].join(', ').slice(0, 200) : 'Render workspace access';
}
async function discoverDeployments(provider: 'Vercel' | 'Render', token: string, parents: Row[]) {
  const out: Row[] = [];
  for (const parent of parents) {
    let rows: Row[] = [];
    if (provider === 'Vercel') {
      const query = new URLSearchParams({ projectId: parent.externalId, limit: '20' }); if (process.env.VERCEL_TEAM_ID) query.set('teamId', process.env.VERCEL_TEAM_ID);
      const data = await api(`https://api.vercel.com/v6/deployments?${query}`, token) as Row; rows = data.deployments || [];
    } else {
      const raw = await renderRows(token, `services/${encodeURIComponent(parent.externalId)}/deploys`); rows = raw.slice(0, 20).map(row => row.deploy || row);
    }
    for (const d of rows) {
      const id = String(d.uid || d.id || ''); if (!id) continue;
      const status = String(d.readyState || d.state || d.status || 'unknown');
      const url = provider === 'Vercel' ? (d.url ? `https://${d.url}` : undefined) : parent.url;
      out.push({ provider, accountId: parent.accountId, resourceType: 'deployment', externalId: id, name: `${parent.name} · ${d.name || d.commit?.message || id}`, url, status, normalizedStatus: normalizeDeploymentStatus(status), repositoryKey: parent.repositoryKey, metadata: { parentId: parent.externalId, parentName: parent.name, providerDeploymentId: id, target: d.target, branch: d.meta?.githubCommitRef || d.branch || d.commit?.branch, commitSha: d.meta?.githubCommitSha || d.commit?.id, commitMessage: d.meta?.githubCommitMessage || d.commit?.message, createdAt: d.created || d.createdAt || d.created_at, startedAt: d.startedAt, finishedAt: d.finishedAt, ready: d.ready, state: d.readyState || d.state || d.status, providerUrl: provider === 'Vercel' ? d.inspectorUrl || `https://vercel.com/dashboard/deployments/${encodeURIComponent(id)}` : `https://dashboard.render.com/web/${encodeURIComponent(parent.externalId)}/deploys` }, lastSyncedAt: new Date(), unavailableAt: null });
    }
  }
  return out;
}
export function normalizeDeploymentStatus(value: string) {
  const s = value.toLowerCase();
  if (['ready', 'live', 'succeeded', 'success', 'active'].includes(s)) return 'successful';
  if (['error', 'failed', 'build_failed', 'update_failed', 'pre_deploy_failed'].includes(s)) return 'failed';
  if (['queued', 'created'].includes(s)) return 'queued';
  if (['building', 'build_in_progress', 'pre_deploy_in_progress'].includes(s)) return 'building';
  if (['deploying', 'update_in_progress', 'initializing'].includes(s)) return 'deploying';
  if (['canceled', 'cancelled', 'deactivated'].includes(s)) return 'canceled';
  return 'other';
}
export async function syncProvider(provider: Provider) {
  if (jobs.has(provider)) return jobs.get(provider);
  const task = (async () => {
    const token = credentials[provider]; const accountId = provider === 'Vercel' ? process.env.VERCEL_TEAM_ID || 'personal' : 'default';
    const now = new Date(); const leaseUntil = new Date(now.getTime() + 10 * 60_000);
    let lease: any;
    try { lease = await ProviderLease.findOneAndUpdate({ provider, accountId, leaseUntil: { $lte: now } }, { $set: { leaseUntil } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
    catch (error) { if ((error as any)?.code === 11000) return { provider, status: 'running' }; throw error; }
    if (!lease) return { provider, status: 'running' };
    try {
    const startedAt = new Date(); const record = await ProviderSync.create({ provider, accountId, status: 'running', startedAt });
    if (!token) { await record.updateOne({ status: 'failed', completedAt: new Date(), failed: 1, error: `${provider} credential is not configured.` }); return { provider, status: 'failed', error: `${provider} credential is not configured.` }; }
    try {
      const accountName = await providerAccountName(provider, token); await record.updateOne({ accountName });
      const parents = await discover(provider, token); const deployments = provider === 'GitHub' ? [] : await discoverDeployments(provider, token, parents);
      for (const parent of parents as any[]) { const latest: any = deployments.find((item: any) => item.metadata?.parentId === parent.externalId); if (latest) { parent.status = latest.status; parent.normalizedStatus = latest.normalizedStatus; parent.metadata.latestDeployment = { id: latest.externalId, status: latest.status, normalizedStatus: latest.normalizedStatus, createdAt: latest.metadata.createdAt, url: latest.url, providerUrl: latest.metadata.providerUrl }; } }
      const resources = [...parents, ...deployments];
      let updated = 0, unchanged = 0;
      for (const item of resources) { const result = await ProviderResource.updateOne({ provider: item.provider, accountId: item.accountId, resourceType: item.resourceType, externalId: item.externalId }, { $set: item, $setOnInsert: { createdAt: new Date() } }, { upsert: true, runValidators: true }); if (result.modifiedCount || result.upsertedCount) updated++; else unchanged++; }
      const repositoryKeys = [...new Set(resources.map((item: any) => item.repositoryKey).filter(Boolean))];
      for (const repositoryKey of repositoryKeys) { const matches = await ProviderResource.find({ repositoryKey }).select('_id').limit(5).lean(); await ProviderResource.updateMany({ repositoryKey }, { $set: { associationConfidence: matches.length > 1 ? 'exact' : 'unmatched' } }); }
      const completedAt = new Date();
      await record.updateOne({ status: 'success', completedAt, lastSuccessfulAt: completedAt, discovered: parents.length, updated, unchanged, failed: 0 });
      return { provider, status: 'success', discovered: parents.length, updated, unchanged };
    } catch (error) {
      const status = error instanceof ProviderRequestError ? error.status : 0;
      const message = status === 401 ? `${provider} rejected the credential. Verify the token/API key.` : status === 403 ? `${provider} denied access. Check token scopes, team/workspace access, and rate limits.` : status === 429 ? `${provider} rate limited synchronization. Try again later.` : error instanceof Error ? error.message.slice(0, 500) : 'Provider synchronization failed';
      await record.updateOne({ status: 'failed', completedAt: new Date(), failed: 1, error: message });
      return { provider, status: 'failed', error: message };
    }
    } finally { await ProviderLease.updateOne({ provider, accountId }, { $set: { leaseUntil: new Date(0) } }).catch(() => undefined); }
  })().finally(() => jobs.delete(provider));
  jobs.set(provider, task); return task;
}
export async function syncAllProviders() { return Promise.all((['GitHub', 'Vercel', 'Render'] as Provider[]).map(syncProvider)); }
export async function providerHealth() {
  return Promise.all((['GitHub', 'Vercel', 'Render'] as Provider[]).map(async provider => {
    const [sync, lastSuccess, count] = await Promise.all([ProviderSync.findOne({ provider }).sort({ startedAt: -1 }).lean() as Promise<any>, ProviderSync.findOne({ provider, status: 'success' }).sort({ startedAt: -1 }).lean() as Promise<any>, ProviderResource.countDocuments({ provider, resourceType: { $ne: 'deployment' }, unavailableAt: null })]);
    return { provider, configured: Boolean(credentials[provider]), connected: sync?.status === 'success', accountName: lastSuccess?.accountName || null, count, lastSyncAt: sync?.completedAt || null, lastSuccessfulAt: lastSuccess?.completedAt || null, lastError: sync?.error || null, status: sync?.status || 'never' };
  }));
}
export async function refreshDeployments(provider?: 'Vercel' | 'Render') { return Promise.all((provider ? [provider] : ['Vercel', 'Render'] as const).map(syncProvider)); }
export async function providerDetail(provider: Provider, id: string, type: 'repository' | 'project' | 'service') {
  const record: any = await ProviderResource.findOne({ provider, externalId: id, resourceType: type }).lean(); if (!record) return null;
  if (provider !== 'GitHub') return record;
  const token = credentials.GitHub; if (!token) return record;
  const path = String(record.repositoryKey || '').split('/').map(encodeURIComponent).join('/');
  const [branches, commits, issues] = await Promise.all([
    providerPages(`https://api.github.com/repos/${path}/branches?per_page=100`, token, authHeaders, 5),
    providerPages(`https://api.github.com/repos/${path}/commits?per_page=20`, token, authHeaders, 1),
    providerPages(`https://api.github.com/repos/${path}/issues?state=all&per_page=20&sort=updated&direction=desc`, token, authHeaders, 1),
  ]);
  return { ...record, activity: { branches: branches.flatMap((x: any) => Array.isArray(x) ? x : []), commits: commits.flatMap((x: any) => Array.isArray(x) ? x : []), issues: issues.flatMap((x: any) => Array.isArray(x) ? x : []).map((x: Row) => ({ ...x, kind: x.pull_request ? 'pull_request' : 'issue' })) } };
}
export async function redeploy(provider: 'Vercel' | 'Render', externalId: string) {
  const token = credentials[provider]; if (!token) throw new Error(`${provider} credential is not configured on the server.`);
  const parent = provider === 'Vercel' ? await ProviderResource.findOne({ provider, resourceType: 'project', externalId }).lean() : await ProviderResource.findOne({ provider, resourceType: 'service', externalId }).lean();
  if (!parent) throw new Error(`${provider} resource was not found in the last successful discovery. Sync first.`);
  if (provider === 'Render') {
    const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(externalId)}/deploys`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ clearCache: 'do_not_clear', deployMode: 'build_and_deploy' }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Render rejected the deploy request (${response.status}). Check the key permissions.`);
    const data: any = await response.json(); return { provider, id: data.id, status: data.status || 'queued', accepted: true };
  }
  const recent = await ProviderResource.findOne({ provider, resourceType: 'deployment', 'metadata.parentId': externalId }).sort({ 'metadata.createdAt': -1 }).lean() as any;
  if (!recent?.metadata?.providerDeploymentId) throw new Error('Vercel has no deployment to redeploy for this project.');
  const team = process.env.VERCEL_TEAM_ID; const suffix = team ? `?teamId=${encodeURIComponent(team)}` : '';
  const response = await fetch(`https://api.vercel.com/v13/deployments${suffix}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ deploymentId: recent.metadata.providerDeploymentId }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Vercel rejected the redeploy request (${response.status}). Check token access.`);
  const data: any = await response.json(); return { provider, id: data.id || data.uid, status: data.readyState || data.status || 'queued', url: data.url ? `https://${data.url}` : undefined, accepted: true };
}
