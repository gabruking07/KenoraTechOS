import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

type ProviderHealth = {
  provider: 'GitHub' | 'Vercel' | 'Render';
  configured: boolean;
  connected: boolean;
  accountName?: string | null;
  count: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
  status: string;
};
type ProviderOverview = {
  providers: ProviderHealth[];
  totalDeployments: number;
  deploymentCounts: Record<string, number>;
  recent: Array<{ _id: string; provider: string; name: string; normalizedStatus?: string; url?: string; metadata?: Record<string, unknown> }>;
};

const providerRoutes: Record<string, string> = { GitHub: '/github', Vercel: '/vercel', Render: '/render' };
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not synced yet';

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['provider-overview'], queryFn: () => api<ProviderOverview>('/providers/overview') });
  const sync = useMutation({
    mutationFn: () => api('/providers/sync', { method: 'POST', body: '{}' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-overview'] });
      queryClient.invalidateQueries({ queryKey: ['provider-resources'] });
      queryClient.invalidateQueries({ queryKey: ['provider-health'] });
    },
  });
  const data = overview.data;

  return <section className="feature-page">
    <div className="page-heading">
      <div><div className="eyebrow">DEVELOPMENT OVERVIEW</div><h1>Provider operations</h1><p>Connected GitHub repositories, Vercel projects, Render services, and deployments.</p></div>
      <button className="secondary-btn" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw size={14} className={sync.isPending ? 'spin' : ''}/>{sync.isPending ? 'Syncing…' : 'Sync all providers'}</button>
    </div>
    {overview.isLoading && <div className="loading-state">Loading provider data…</div>}
    {overview.isError && <div className="error-banner">Provider data could not be loaded. Check the API connection, then refresh this page.</div>}
    {sync.isError && <div className="error-banner">Provider sync failed: {(sync.error as Error).message}</div>}
    {data && <>
      <section className="panel provider-overview">
        <div className="panel-header"><div><h2>Connected providers</h2><p>Resources discovered directly from provider accounts.</p></div></div>
        <div className="provider-overview-grid">
          {data.providers.map(provider => <button className="provider-overview-card" key={provider.provider} onClick={() => navigate(providerRoutes[provider.provider])}>
            <b>{provider.provider}</b><strong>{provider.count}</strong><span>{provider.provider === 'GitHub' ? 'repositories' : provider.provider === 'Vercel' ? 'projects' : 'services'}</span>
            <small>{provider.connected ? `Connected${provider.accountName ? ` · ${provider.accountName}` : ''}` : provider.configured ? 'Configured · sync to check connection' : 'Credentials not configured'}</small>
            {provider.lastError && <small className="provider-error">Last sync: {provider.lastError}</small>}
            {provider.lastSyncAt && <small>Last sync: {formatDate(provider.lastSyncAt)}</small>}
          </button>)}
        </div>
      </section>
    </>}
  </section>;
}
