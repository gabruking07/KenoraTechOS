type LegacyRecord = { _id: unknown; module: string; title: string; fields?: Record<string, unknown>; createdAt?: Date; updatedAt?: Date };
const moneyMinor = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
const date = (value: unknown): Date | undefined => { if (typeof value !== 'string' && !(value instanceof Date)) return undefined; const parsed = new Date(value); return Number.isFinite(+parsed) ? parsed : undefined; };

/** Converts only fields whose legacy meaning is known. The source WorkspaceRecord is never mutated/deleted. */
export function mapLegacyBusinessRecord(row: LegacyRecord): { collection: string; value: Record<string, unknown> } | { issue: string } {
  const f = row.fields || {}, base = { legacySourceId: row._id, createdAt: row.createdAt, updatedAt: row.updatedAt };
  switch (row.module) {
    case 'clients': return { collection: 'BusinessClient', value: { ...base, kind: f.company ? 'company' : 'individual', companyName: str(f.company), contactPerson: row.title, email: str(f.email)?.toLowerCase(), phone: str(f.phone), status: f.status === 'archived' ? 'archived' : 'active', notes: str(f.notes) } };
    case 'leads': {
      const amount = moneyMinor(f.estimatedValue);
      return { collection: 'BusinessLead', value: { ...base, name: row.title, email: str(f.email)?.toLowerCase(), phone: str(f.phone), source: str(f.source), status: leadStatus(f.status), estimatedValueMinor: amount ?? undefined, currency: 'INR', notes: str(f.notes) } };
    }
    case 'services': {
      const amount = moneyMinor(f.price); if (amount === null) return { issue: 'Legacy service price is missing or invalid.' };
      return { collection: 'BusinessService', value: { ...base, name: row.title, description: str(f.description), basePriceMinor: amount, currency: str(f.currency)?.toUpperCase() || 'INR', pricingModel: f.billingPeriod === 'monthly' ? 'monthly' : 'fixed', active: f.status !== 'archived' } };
    }
    case 'finance': {
      const amount = moneyMinor(f.amount); if (amount === null) return { issue: 'Legacy finance amount is missing or invalid.' };
      if (String(f.kind).toLowerCase() === 'income') return { issue: 'Legacy income is not treated as verified cash received; source retained for manual payment verification.' };
      if (typeof f.project === 'string' && !/^[a-f\d]{24}$/i.test(f.project)) return { issue: 'Legacy project reference is not a MongoDB ID; source record retained for manual mapping.' };
      return { collection: 'BusinessTransaction', value: { ...base, number: `LEGACY-${String(row._id)}`, kind: 'expense', amountMinor: amount, currency: str(f.currency)?.toUpperCase() || 'INR', date: date(f.date) || row.createdAt || new Date(), category: str(f.category) || 'Uncategorized', project: f.project, description: str(f.notes), status: 'recorded' } };
    }
    case 'technical-debt': return { collection: 'BusinessTechnicalDebt', value: { ...base, title: row.title, project: f.project, priority: debtPriority(f.priority), status: debtStatus(f.status), estimatedEffortHours: typeof f.estimatedHours === 'number' ? f.estimatedHours : undefined, description: str(f.resolutionPlan) } };
    case 'testing': return { collection: 'BusinessTestCase', value: { ...base, title: row.title, project: f.project, suite: str(f.testType), description: str(f.notes), priority: 'medium' } };
    case 'infrastructure': return { collection: 'BusinessInfrastructure', value: { ...base, serviceName: row.title, project: f.project, provider: str(f.provider), resourceType: str(f.resourceType), region: str(f.region), status: 'unknown', notes: 'Migrated from legacy record; secret-like values were not copied.' } };
    case 'deployments': return { collection: 'BusinessDeployment', value: { ...base, project: f.project, provider: str(f.provider), environment: str(f.environment), url: str(f.url), status: deploymentStatus(f.status), startedAt: date(f.deployedAt), logsSummary: 'Migrated deployment metadata; no deployment was executed.' } };
    case 'notifications': return { collection: 'BusinessNotification', value: { ...base, title: row.title, kind: 'legacy', message: str(f.message) || row.title, readAt: date(f.readAt), deliveryStatus: 'in-app', dedupeKey: `legacy-${String(row._id)}` } };
    case 'proposals': case 'invoices': return { issue: 'Legacy proposal/invoice conversion requires verified client, line-item, currency and date references; source record retained for manual review.' };
    default: return { issue: `No compatibility mapping for module ${row.module}.` };
  }
}
const str = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 8000) : undefined;
const leadStatus = (value: unknown) => ['New','Contacted','Qualified','Proposal sent','Negotiation','Won','Lost'].includes(String(value)) ? value : 'New';
const debtPriority = (value: unknown) => ['low','medium','high','critical'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'medium';
const debtStatus = (value: unknown) => ['open','in-progress','resolved','accepted'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'open';
const deploymentStatus = (value: unknown) => ({ success: 'succeeded', succeeded: 'succeeded', failed: 'failed', running: 'running', queued: 'queued' } as Record<string,string>)[String(value).toLowerCase()] || 'cancelled';
