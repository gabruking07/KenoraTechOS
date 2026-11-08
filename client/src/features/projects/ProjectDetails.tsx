import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, FolderKanban, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import ProjectFinance from './ProjectFinance';

type Project = {
  _id: string; name: string; description?: string; status: string; priority: string; riskLevel?: string;
  progress?: number; healthScore?: number; estimatedBudget?: number; actualExpenses?: number; recordedRevenue?: number;
  frontendStack?: string[]; backendStack?: string[]; databaseStack?: string[]; securityStatus: string;
  testingStatus: string; productionReadiness: string; createdAt: string; updatedAt: string;
};
type Item = { _id: string; title?: string; name?: string; description?: string; action?: string; status?: string; dueDate?: string; createdAt?: string; fields?: Record<string, unknown> };
const sections = ['Overview', 'Tasks', 'Milestones', 'Technology', 'Documents', 'Security', 'Technical Debt', 'Testing', 'Finance', 'Activity'];

export default function ProjectDetails() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Overview');
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api<Project>(`/projects/${id}`) });
  const tasks = useQuery({ queryKey: ['tasks', id], queryFn: () => api<Item[]>(`/tasks?project=${id}`), enabled: tab === 'Tasks' });
  const milestones = useQuery({ queryKey: ['milestones', id], queryFn: () => api<Item[]>(`/milestones?project=${id}`), enabled: tab === 'Milestones' });
  const activity = useQuery({ queryKey: ['activity', id], queryFn: () => api<Item[]>(`/activity?project=${id}`), enabled: tab === 'Activity' });
  const recordModule = tab === 'Security' ? 'security' : tab === 'Technical Debt' ? 'technical-debt' : tab === 'Testing' ? 'testing' : tab === 'Documents' ? 'documents' : null;
  const records = useQuery({ queryKey: ['records', recordModule, id], queryFn: () => api<Item[]>(`/records/${recordModule}?project=${id}`), enabled: Boolean(recordModule) });

  if (project.isLoading) return <div className="loading-state"><RefreshCw className="spin" /> Loading project…</div>;
  if (project.isError || !project.data) return <div className="error-state"><CircleAlert /><h2>Project unavailable</h2><p>{project.error?.message || 'This project could not be found.'}</p><button className="secondary-btn" onClick={() => navigate('/projects')}>Back to projects</button></div>;

  const p = project.data;
  const items = tab === 'Tasks' ? tasks.data : tab === 'Milestones' ? milestones.data : tab === 'Activity' ? activity.data : records.data;
  const loading = tab === 'Tasks' ? tasks.isLoading : tab === 'Milestones' ? milestones.isLoading : tab === 'Activity' ? activity.isLoading : records.isLoading;
  return <section className="feature-page">
    <button className="text-button" onClick={() => navigate('/projects')}><ArrowLeft size={14} /> All projects</button>
    <div className="page-heading project-detail-heading"><div><div className="eyebrow">EXISTING INTERNAL RECORD</div><h1>{p.name}</h1><p>{p.description || 'No description has been saved.'}</p></div><span className={`badge ${p.status.toLowerCase().replaceAll(' ', '-')}`}>{p.status}</span></div>
    <div className="project-tabs">{sections.map(section => <button key={section} className={tab === section ? 'selected' : ''} onClick={() => setTab(section)}>{section}</button>)}</div>
    {tab === 'Overview' ? <>
      <div className="metric-grid">{[['Progress', p.progress == null ? 'Not assessed' : `${p.progress}%`], ['Health score', p.healthScore == null ? 'Not assessed' : `${p.healthScore}/100`], ['Risk', p.riskLevel || 'Not Assessed'], ['Priority', p.priority]].map(([label, value]) => <div className="metric-card" key={String(label)}><div className="metric-top">{label}</div><div className="detail-value">{value}</div></div>)}</div>
      <div className="settings-grid"><div className="panel detail-panel"><h2>Project information</h2><div className="record-fields"><div><span>Created</span><b>{new Date(p.createdAt).toLocaleDateString()}</b></div><div><span>Last updated</span><b>{new Date(p.updatedAt).toLocaleDateString()}</b></div><div><span>Security</span><b>{p.securityStatus}</b></div><div><span>Testing</span><b>{p.testingStatus}</b></div><div><span>Production readiness</span><b>{p.productionReadiness}</b></div></div></div><div className="panel detail-panel"><h2>Legacy finance estimates · INR</h2><div className="record-fields">{[['Estimated budget', p.estimatedBudget], ['Legacy expenses', p.actualExpenses], ['Legacy revenue', p.recordedRevenue]].map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{value == null ? 'Not recorded' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value))}</b></div>)}</div></div></div>
    </> : tab === 'Finance' ? <ProjectFinance projectId={id} /> : tab === 'Technology' ? <div className="panel detail-panel"><h2>Technology</h2>{[['Frontend', p.frontendStack], ['Backend', p.backendStack], ['Database', p.databaseStack]].map(([label, value]) => <div className="folder-row" key={String(label)}><span>{label}<small>{Array.isArray(value) && value.length ? value.join(', ') : 'Not recorded'}</small></span></div>)}</div> : <div className="panel folder-list">{loading ? <div className="loading-state"><RefreshCw className="spin" /> Loading {tab.toLowerCase()}…</div> : items?.length ? items.map(item => <div className="folder-row" key={item._id}><FolderKanban size={15} /><span>{item.description || item.title || item.name || String(item.fields?.title || 'Record')}<small>{item.action || item.status || 'Saved record'}{item.dueDate ? ` · ${new Date(item.dueDate).toLocaleDateString()}` : ''}</small></span></div>) : <div className="empty-inline">No {tab.toLowerCase()} records are associated with this project.</div>}</div>}
  </section>;
}
