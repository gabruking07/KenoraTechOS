import { Project, Task, Milestone, StoredDocument, WorkspaceRecord } from '../models/index.js';
import { BusinessClient, BusinessLead, BusinessProposal, BusinessInvoice, BusinessTransaction, BusinessPayment, BusinessInfrastructure, BusinessDeployment } from '../models/business.js';

export type SearchHit = { id: string; category: string; title: string; detail: string; updatedAt: Date; href: string };
export function normalizeSearchQuery(value: unknown) {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  if (query.length < 2 || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) return null;
  return query;
}
export const literalSearchPattern = (value: string) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const asText = (value: unknown) => typeof value === 'string' ? value : '';

export async function searchWorkspace(query: string, page: number, limit: number) {
  const rx = literalSearchPattern(query);
  const specs = [
    { category: 'Projects', Model: Project, filter: { $or: [{ name: rx }, { slug: rx }, { description: rx }] }, fields: 'name description status updatedAt', href: (x: any) => `/projects/${x._id}`, title: (x: any) => x.name, detail: (x: any) => x.status || 'Project' },
    { category: 'Tasks', Model: Task, filter: { $or: [{ title: rx }, { description: rx }] }, fields: 'title description status project updatedAt', href: (x: any) => '/tasks', title: (x: any) => x.title, detail: (x: any) => x.status || 'Task' },
    { category: 'Milestones', Model: Milestone, filter: { $or: [{ name: rx }, { description: rx }] }, fields: 'name description status project updatedAt', href: (x: any) => '/milestones', title: (x: any) => x.name, detail: (x: any) => x.status || 'Milestone' },
    { category: 'Documents', Model: StoredDocument, filter: { name: rx }, fields: 'name documentType updatedAt', href: (x: any) => '/documentation', title: (x: any) => x.name, detail: (x: any) => x.documentType || 'Document' },
    { category: 'Clients', Model: BusinessClient, filter: { $or: [{ companyName: rx }, { contactPerson: rx }, { email: rx }] }, fields: 'companyName contactPerson status updatedAt', href: (x: any) => '/clients', title: (x: any) => x.companyName || x.contactPerson, detail: (x: any) => x.status || 'Client' },
    { category: 'Leads', Model: BusinessLead, filter: { $or: [{ name: rx }, { companyName: rx }, { email: rx }] }, fields: 'name companyName status updatedAt', href: (x: any) => '/leads', title: (x: any) => x.name, detail: (x: any) => x.status || 'Lead' },
    { category: 'Proposals', Model: BusinessProposal, filter: { $or: [{ number: rx }, { description: rx }] }, fields: 'number description status updatedAt', href: (x: any) => '/proposals', title: (x: any) => x.number, detail: (x: any) => x.status || 'Proposal' },
    { category: 'Invoices', Model: BusinessInvoice, filter: { $or: [{ number: rx }, { notes: rx }] }, fields: 'number notes status updatedAt', href: (x: any) => '/invoices', title: (x: any) => x.number, detail: (x: any) => x.status || 'Invoice' },
    { category: 'Transactions', Model: BusinessTransaction, filter: { $or: [{ number: rx }, { category: rx }, { vendor: rx }, { description: rx }] }, fields: 'number category vendor kind updatedAt', href: (x: any) => '/finance', title: (x: any) => x.number || x.category, detail: (x: any) => `${x.kind || 'Transaction'}${x.vendor ? ` · ${x.vendor}` : ''}` },
    { category: 'Payments', Model: BusinessPayment, filter: { $or: [{ number: rx }, { reference: rx }, { method: rx }, { notes: rx }] }, fields: 'number reference method currency updatedAt', href: (x: any) => '/finance', title: (x: any) => x.number, detail: (x: any) => `${x.currency}${x.reference ? ` · ${x.reference}` : ''}` },
    { category: 'Infrastructure', Model: BusinessInfrastructure, filter: { $or: [{ serviceName: rx }, { provider: rx }, { resourceType: rx }] }, fields: 'serviceName provider status updatedAt', href: (x: any) => '/infrastructure', title: (x: any) => x.serviceName, detail: (x: any) => x.provider || x.status || 'Infrastructure' },
    { category: 'Deployments', Model: BusinessDeployment, filter: { $or: [{ version: rx }, { provider: rx }, { logsSummary: rx }] }, fields: 'version provider status updatedAt', href: (x: any) => '/deployments', title: (x: any) => x.version || x.provider || 'Deployment', detail: (x: any) => x.status || 'Deployment' },
    { category: 'Workspace records', Model: WorkspaceRecord, filter: { $or: [{ title: rx }, { module: rx }] }, fields: 'title module updatedAt', href: (x: any) => `/${x.module}`, title: (x: any) => x.title, detail: (x: any) => x.module },
  ];
  const offset = (page - 1) * limit;
  // To merge collections into one stable page, read only the top offset+limit candidates from each collection.
  const candidateLimit = offset + limit;
  const groups = await Promise.all(specs.map(async spec => {
    const [rows, total] = await Promise.all([
      spec.Model.find(spec.filter).select(spec.fields).sort({ updatedAt: -1, _id: -1 }).limit(candidateLimit).lean(),
      spec.Model.countDocuments(spec.filter),
    ]);
    return { total, hits: rows.map((row: any) => ({ id: String(row._id), category: spec.category, title: asText(spec.title(row)), detail: asText(spec.detail(row)), updatedAt: row.updatedAt || new Date(0), href: spec.href(row) } satisfies SearchHit)) };
  }));
  const all = groups.flatMap(group => group.hits).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  return { data: all.slice(offset, offset + limit), meta: { page, limit, total, pages: Math.ceil(total / limit), categories: Object.fromEntries(specs.map((spec, index) => [spec.category, groups[index].total])) } };
}
