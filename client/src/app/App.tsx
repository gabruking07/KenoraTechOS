import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Archive, ArrowDownUp, Bell, Boxes, BriefcaseBusiness, Building2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Code2, Command, Database, FileText, Folder, Github, LayoutDashboard, LogOut, Menu, Moon, Settings, Shield, Sparkles, Sun, Wallet, Workflow, X, Zap, type LucideIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Login from './Login';
const Dashboard = lazy(() => import('../features/dashboard/Dashboard'));
const Projects = lazy(() => import('../features/projects/Projects'));
const ProjectDetails = lazy(() => import('../features/projects/ProjectDetails'));
import { ActivityPage, AnalyticsPage, BackupsPage, ExportImportPage, IntegrationsPage, SettingsPage } from '../features/workspace/SystemPages';
import { CatalogPage, FoldersPage } from '../features/workspace/Collections';
import TasksPage from '../features/workspace/Tasks';
import MilestonesPage from '../features/workspace/Milestones';
import RecordPage from '../features/workspace/RecordPage';
import Documents from '../features/workspace/Documents';
import SecurityCenter from '../features/workspace/SecurityCenter';
import BusinessPage from '../features/workspace/BusinessPage';
import BusinessReports from '../features/workspace/BusinessReports';
import NotificationsPage from '../features/workspace/NotificationsPage';
import AutomationsPage from '../features/workspace/AutomationsPage';

type User = { email: string; name?: string };
type NavItem = [string, string, LucideIcon];
const groups: {title:string;links:NavItem[]}[] = [
  { title: 'OVERVIEW', links: [['Dashboard', '/', LayoutDashboard]] },
  { title: 'WORKSPACE', links: [['All Projects', '/projects', Boxes], ['Folder Explorer', '/folders', Folder], ['Categories', '/categories', Database], ['Technologies', '/technologies', Code2], ['Documentation', '/documentation', FileText]] },
  { title: 'DEVELOPMENT', links: [['Tasks', '/tasks', CheckSquare], ['Kanban Board', '/kanban', LayoutDashboard], ['Milestones', '/milestones', CircleHelp], ['Roadmap', '/roadmap', ArrowDownUp], ['GitHub', '/github', Github], ['Vercel', '/vercel', Zap], ['Render', '/render', Zap], ['Deployments', '/deployments', Workflow], ['Testing & Quality', '/testing', Shield]] },
  { title: 'OPERATIONS', links: [['Infrastructure', '/infrastructure', Building2], ['Security Center', '/security', Shield], ['Technical Debt', '/technical-debt', Activity], ['Notifications', '/notifications', Bell], ['Automations', '/automations', Workflow], ['Activity Logs', '/activity', Activity]] },
  { title: 'BUSINESS', links: [['Clients', '/clients', BriefcaseBusiness], ['Leads', '/leads', Sparkles], ['Services', '/services', Boxes], ['Proposals', '/proposals', FileText], ['Invoices', '/invoices', FileText], ['Finance & Revenue', '/finance', Wallet]] },
  { title: 'INTELLIGENCE', links: [['AI Assistant', '/ai', Sparkles], ['Analytics', '/analytics', Activity], ['Reports', '/reports', FileText]] },
  { title: 'SYSTEM', links: [['Import & Export', '/import-export', ArrowDownUp], ['Backups', '/backups', Archive], ['Settings', '/settings', Settings]] },
];

export default function App() {
  const queryClient=useQueryClient(); const [collapsed,setCollapsed]=useState(false); const [mobileOpen,setMobileOpen]=useState(false); const [light,setLight]=useState(()=>localStorage.getItem('kenora-theme')==='light'); const search=''; const location=useLocation(); const navigate=useNavigate();
  const userQuery=useQuery({queryKey:['me'],queryFn:()=>api<User>('/auth/me'),retry:false});
  useEffect(()=>{document.documentElement.dataset.theme=light?'light':'dark';localStorage.setItem('kenora-theme',light?'light':'dark')},[light]);
  useEffect(()=>{setMobileOpen(false)},[location.pathname]);
  if(userQuery.isLoading)return <div className="boot"><div className="brand-icon"><Command/></div><span>Connecting to your workspace…</span></div>;
  if(userQuery.isError||!userQuery.data)return <Login onLogin={()=>queryClient.invalidateQueries({queryKey:['me']})}/>;
  const current=groups.flatMap(g=>g.links).find(l=>l[1]===location.pathname); const title=current?.[0]||'Dashboard';
  async function logout(){await api('/auth/logout',{method:'POST'}).catch(()=>{});queryClient.setQueryData(['me'],null);}
  return <div className={`app-shell ${collapsed?'is-collapsed':''} ${mobileOpen?'mobile-open':''}`}>
    <aside className="sidebar"><div className="side-brand"><span className="brand-icon"><Command size={18}/></span>{!collapsed&&<div className="brand-name">KENORA<span>TECH</span><small>OPERATING SYSTEM</small></div>}<button className="collapse-btn" onClick={()=>setCollapsed(!collapsed)} title="Collapse sidebar">{collapsed?<ChevronRight size={15}/>:<ChevronLeft size={15}/>}</button></div>
      <div className="workspace-switch"><span className="workspace-avatar">K</span>{!collapsed&&<><div><b>KenoraTech</b><small>Personal workspace</small></div><ChevronDown size={14}/></>}</div>
      <nav className="side-nav">{groups.map(group=><div className="nav-group" key={group.title}>{!collapsed&&<div className="nav-heading">{group.title}</div>}{group.links.map(([label,path,Icon])=><NavLink to={path} key={path} title={collapsed?label:undefined} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={17}/>{!collapsed&&<span>{label}</span>}</NavLink>)}</div>)}</nav>
      {!collapsed&&<div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={15}/></div><b>Your command center</b><p>One place for every project and operation.</p><button onClick={()=>navigate('/settings')}>Workspace settings <ChevronRight size={13}/></button></div><div className="profile-row"><div className="profile-avatar">{(userQuery.data.name||userQuery.data.email)[0].toUpperCase()}</div><div className="profile-info"><b>{userQuery.data.name||'Administrator'}</b><small>{userQuery.data.email}</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={16}/></button></div></div>}
    </aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={19}/></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13}/><b>{title}</b></div><div className="top-actions"><button className="icon-button theme-toggle" onClick={()=>setLight(!light)} title="Toggle theme">{light?<Moon size={17}/>:<Sun size={17}/>}</button><button className="icon-button notification-button" onClick={()=>navigate('/notifications')} title="Notifications"><Bell size={17}/><i/></button></div></header>
      <div className="page-content"><Suspense fallback={<div className="loading-state">Loading page…</div>}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/projects" element={<Projects search={search}/>}/><Route path="/projects/:id" element={<ProjectDetails/>}/><Route path="/security-findings" element={<RecordPage module="security" title="Security Findings" search={search}/>}/>{groups.flatMap(g=>g.links).filter(l=>l[1]!=='/'&&l[1]!=='/projects').map(([label,path])=><Route key={path} path={path} element={<WorkspaceRoute title={label} path={path} search={search}/>}/>)}<Route path="*" element={<section className="feature-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Page not found</h1><p>This route does not match an available workspace page.</p></div><button className="secondary-btn" onClick={()=>navigate('/')}>Go to dashboard</button></div></section>}/></Routes></Suspense></div>
    </main><button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"><X/></button>
  </div>
}

function WorkspaceRoute({title,path,search}:{title:string;path:string;search:string}){
 const navigate=useNavigate();
 const businessModules:Record<string,string>={'/clients':'clients','/leads':'leads','/services':'services','/proposals':'proposals','/invoices':'invoices','/finance':'finance','/testing':'testing','/technical-debt':'technical-debt','/infrastructure':'infrastructure','/deployments':'deployments','/notifications':'notifications'};
 if(path==='/deployments')return <IntegrationsPage title={title}/>;
 if(path==='/notifications')return <NotificationsPage onNavigate={navigate}/>;
 if(path==='/automations')return <AutomationsPage/>;
 if(businessModules[path])return <BusinessPage module={businessModules[path]} title={title} search={search}/>;
 if(path==='/folders')return <FoldersPage/>;
 if(path==='/tasks')return <TasksPage/>;
 if(path==='/kanban')return <TasksPage kanban/>;
 if(path==='/milestones'||path==='/roadmap')return <MilestonesPage/>;
 if(path==='/categories')return <CatalogPage kind="categories" title={title}/>;
 if(path==='/technologies')return <CatalogPage kind="technologies" title={title}/>;
 if(path==='/settings')return <SettingsPage/>;
 if(path==='/documentation')return <Documents/>;
 if(path==='/github'||path==='/vercel'||path==='/render'||path==='/deployments'||path==='/ai')return <IntegrationsPage title={title}/>;
 if(path==='/activity')return <ActivityPage/>;
 if(path==='/security')return <SecurityCenter onNavigate={navigate}/>;
 if(path==='/reports')return <BusinessReports/>;
 if(path==='/import-export')return <ExportImportPage/>;
 if(path==='/backups')return <BackupsPage/>;
 if(path==='/analytics')return <AnalyticsPage/>;
 if(path==='/reports')return <AnalyticsPage report/>;
 const modules:Record<string,string>={'/security':'security'};
 return <RecordPage module={modules[path]||'documents'} title={title} search={search}/>;
}
