import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Boxes, ChevronLeft, ChevronRight, Command, Github, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun, X, Zap, type LucideIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Login from './Login';
const Dashboard = lazy(() => import('../features/dashboard/Dashboard'));
import { IntegrationsPage, SettingsPage } from '../features/workspace/SystemPages';

type User = { email: string; name?: string; role?:string };
type NavItem = [string, string, LucideIcon];
const groups: {title:string;links:NavItem[]}[] = [
  { title: 'OVERVIEW', links: [['Dashboard', '/', LayoutDashboard]] },
  { title: 'PROVIDERS', links: [['All Projects', '/provider-projects', Boxes], ['GitHub', '/github', Github], ['Vercel', '/vercel', Zap], ['Render', '/render', Zap]] },
  { title: 'CONFIGURATION', links: [['Settings', '/settings', Settings]] },
];

export default function App() {
  const queryClient=useQueryClient(); const [collapsed,setCollapsed]=useState(false); const [mobileOpen,setMobileOpen]=useState(false); const [light,setLight]=useState(()=>localStorage.getItem('kenora-theme')==='light'); const location=useLocation(); const navigate=useNavigate();
  const userQuery=useQuery({queryKey:['me'],queryFn:()=>api<User>('/auth/me'),retry:false});
  const visibleGroups=groups;
  useEffect(()=>{document.documentElement.dataset.theme=light?'light':'dark';localStorage.setItem('kenora-theme',light?'light':'dark')},[light]);
  useEffect(()=>{setMobileOpen(false)},[location.pathname]);
  if(userQuery.isLoading)return <div className="boot"><div className="brand-icon"><Command/></div><span>Connecting to your workspace…</span></div>;
  if(userQuery.isError||!userQuery.data)return <Login onLogin={()=>queryClient.invalidateQueries({queryKey:['me']})}/>;
  const current=visibleGroups.flatMap(g=>g.links).find(l=>l[1]===location.pathname); const title=current?.[0]||'Dashboard';
  async function logout(){await api('/auth/logout',{method:'POST'}).catch(()=>{});queryClient.setQueryData(['me'],null);}
  return <div className={`app-shell ${collapsed?'is-collapsed':''} ${mobileOpen?'mobile-open':''}`}>
    <aside className="sidebar"><div className="side-brand"><span className="brand-icon"><Command size={18}/></span>{!collapsed&&<div className="brand-name">KENORA<span>TECH</span><small>OPERATING SYSTEM</small></div>}<button className="collapse-btn" onClick={()=>setCollapsed(!collapsed)} title="Collapse sidebar">{collapsed?<ChevronRight size={15}/>:<ChevronLeft size={15}/>}</button></div>
      <nav className="side-nav">{visibleGroups.map(group=><div className="nav-group" key={group.title}>{!collapsed&&<div className="nav-heading">{group.title}</div>}{group.links.map(([label,path,Icon])=><NavLink to={path} key={path} title={collapsed?label:undefined} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon size={17}/>{!collapsed&&<span>{label}</span>}</NavLink>)}</div>)}</nav>
      {!collapsed&&<div className="sidebar-bottom"><div className="profile-row"><div className="profile-avatar">{(userQuery.data.name||userQuery.data.email)[0].toUpperCase()}</div><div className="profile-info"><b>{userQuery.data.name||'Administrator'}</b><small>{userQuery.data.email}</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={16}/></button></div></div>}
    </aside>
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={19}/></button><div className="breadcrumbs"><span>Provider operations</span><ChevronRight size={13}/><b>{title}</b></div><div className="top-actions"><button className="icon-button theme-toggle" onClick={()=>setLight(!light)} title="Toggle theme">{light?<Moon size={17}/>:<Sun size={17}/>}</button></div></header>
      <div className="page-content"><Suspense fallback={<div className="loading-state">Loading page…</div>}><Routes><Route path="/" element={<Dashboard/>}/>{visibleGroups.flatMap(g=>g.links).filter(l=>l[1]!=='/').map(([label,path])=><Route key={path} path={path} element={<WorkspaceRoute title={label}/>}/>)}<Route path="*" element={<section className="feature-page"><div className="page-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Page not found</h1><p>This route does not match an available workspace page.</p></div><button className="secondary-btn" onClick={()=>navigate('/')}>Go to dashboard</button></div></section>}/></Routes></Suspense></div>
    </main><button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"><X/></button>
  </div>
}

function WorkspaceRoute({title}:{title:string}){
 if(title==='Settings')return <SettingsPage/>;
 return <IntegrationsPage title={title}/>;
}
