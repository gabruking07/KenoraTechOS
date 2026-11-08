import type { ProjectType } from '../models/index.js';
import { providerJson, providerPages } from './providerHttp.js';

export type ProviderEvent = {
  id: string; projectId: string; projectName: string; provider: 'GitHub' | 'Vercel' | 'Render' | 'Cloudflare';
  kind: string; title: string; message?: string; state?: string; url?: string; createdAt: string;
};

type AnyRecord = Record<string, any>;
const headers = (token: string, extra: Record<string,string> = {}) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra });
async function getJson(url: string, h: Record<string,string>): Promise<any> { const token=String(h.Authorization||'').replace(/^Bearer\s+/i,'');return providerJson(url,token,Object.fromEntries(Object.entries(h).filter(([key])=>key.toLowerCase()!=='authorization'))); }
async function postJson(url:string,token:string,body:Record<string,unknown>):Promise<any>{const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error(`Provider rejected the deploy request (${response.status}). Check the token permissions and linked service.`);try{return await response.json()}catch{throw new Error('Provider returned an invalid deploy response.')}}
async function getJsonPages(url: string, h:Record<string,string>, maxPages=5):Promise<any[]> { const token=String(h.Authorization||'').replace(/^Bearer\s+/i,'');const extras=Object.fromEntries(Object.entries(h).filter(([key])=>key.toLowerCase()!=='authorization'));return (await providerPages(url,token,extras,maxPages)).flatMap(page=>Array.isArray(page)?page:[]); }
async function renderServicePages(token:string){const all:AnyRecord[]=[];let cursor='';for(let page=0;page<5;page++){const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);const rows:any=await getJson(`https://api.render.com/v1/services?${query}`,headers(token));if(!Array.isArray(rows)||!rows.length)break;all.push(...rows.map((row:AnyRecord)=>row.service||row));cursor=String(rows[rows.length-1]?.cursor||'');if(rows.length<100||!cursor)break;}return all;}
async function vercelProjectPages(token:string){const all:AnyRecord[]=[];let from='';for(let page=0;page<10;page++){const query=new URLSearchParams({limit:'100'});const team=process.env.VERCEL_TEAM_ID;if(team)query.set('teamId',team);if(from)query.set('from',from);const data:any=await getJson(`https://api.vercel.com/v10/projects?${query}`,headers(token));const rows=Array.isArray(data)?data:Array.isArray(data.projects)?data.projects:[];if(!rows.length)break;all.push(...rows);const next=String(data.pagination?.next||data.pagination?.nextCursor||'');if(!next||next===from||rows.length<100)break;from=next;}return all;}
export type ProviderProjectItem={id:string;name:string;url?:string;description?:string;status?:string;updatedAt?:string;repository?:string};
export async function loadProviderProjects(){
  const githubToken=process.env.GITHUB_TOKEN,vercelToken=process.env.VERCEL_ACCESS_TOKEN,renderToken=process.env.RENDER_API_KEY;
  const results=await Promise.all([
    (async()=>{if(!githubToken)return{name:'GitHub',configured:false,connected:false,error:null,projects:[] as ProviderProjectItem[]};try{const repos=await providerPages('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',githubToken,{'X-GitHub-Api-Version':'2022-11-28'});const projects=repos.flatMap((page:any)=>Array.isArray(page)?page:[]).map((r:AnyRecord)=>({id:String(r.id),name:String(r.full_name||r.name),url:r.html_url,description:r.description||undefined,status:r.archived?'Archived':r.private?'Private':'Public',updatedAt:r.updated_at,repository:r.html_url}));return{name:'GitHub',configured:true,connected:true,error:null,projects}}catch(e){return{name:'GitHub',configured:true,connected:false,error:e instanceof Error?e.message:'Provider request failed',projects:[] as ProviderProjectItem[]}}})(),
    (async()=>{if(!vercelToken)return{name:'Vercel',configured:false,connected:false,error:null,projects:[] as ProviderProjectItem[]};try{const records=await vercelProjectPages(vercelToken);const projects=records.map((p:AnyRecord)=>({id:String(p.id),name:String(p.name),description:p.framework||undefined,status:p.latestDeployments?.[0]?.readyState||undefined,updatedAt:p.updatedAt?new Date(p.updatedAt).toISOString():undefined,repository:p.link?.repo?`${p.link.org||''}/${p.link.repo}`:undefined}));return{name:'Vercel',configured:true,connected:true,error:null,projects}}catch(e){return{name:'Vercel',configured:true,connected:false,error:e instanceof Error?e.message:'Provider request failed',projects:[] as ProviderProjectItem[]}}})(),
    (async()=>{if(!renderToken)return{name:'Render',configured:false,connected:false,error:null,projects:[] as ProviderProjectItem[]};try{const services=await renderServicePages(renderToken);const projects=services.map((s:AnyRecord)=>({id:String(s.id),name:String(s.name||s.id),url:`https://dashboard.render.com/web/${encodeURIComponent(s.id)}`,description:s.type||undefined,status:s.suspended?'Suspended':s.suspend==='suspended'?'Suspended':s.status||undefined,updatedAt:s.updatedAt||s.updated_at,repository:s.repo||undefined}));return{name:'Render',configured:true,connected:true,error:null,projects}}catch(e){return{name:'Render',configured:true,connected:false,error:e instanceof Error?e.message:'Provider request failed',projects:[] as ProviderProjectItem[]}}})()
  ]);
  return {providers:results};
}
const date = (value: unknown) => { const d = new Date(String(value || '')); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
function repos(project: AnyRecord): Array<{owner:string;repo:string}> {
  return (project.repositoryLinks || []).flatMap((raw: string) => {
    const s = String(raw).trim().replace(/^git@github\.com:/i, 'https://github.com/').replace(/\.git$/i, '');
    const m = s.match(/github\.com\/([^/]+)\/([^/?#]+)/i); return m ? [{owner:m[1],repo:m[2]}] : [];
  });
}
const event = (p: AnyRecord, provider: ProviderEvent['provider'], kind: string, id: unknown, title: unknown, created: unknown, more: Partial<ProviderEvent> = {}): ProviderEvent => ({
  id: `${provider}:${String(id)}`, projectId: String(p._id), projectName: p.name, provider, kind,
  title: String(title || kind), createdAt: date(created), ...more
});
async function github(projects: AnyRecord[]): Promise<ProviderEvent[]> {
  const token = process.env.GITHUB_TOKEN; if (!token) return [];
  const out: ProviderEvent[] = [];
  for (const p of projects) for (const {owner,repo} of repos(p)) {
    const base=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const h=headers(token, {'X-GitHub-Api-Version':'2022-11-28'});
    const [metadata,branches,issues,commits]=await Promise.all([
      getJson(base,h),
      getJsonPages(`${base}/branches?per_page=100`,h,3),
      getJsonPages(`${base}/issues?state=all&per_page=10&sort=updated&direction=desc`,h,1),
      getJsonPages(`${base}/commits?per_page=10`,h,1)
    ]);
    out.push(event(p,'GitHub','Repository',metadata.id,metadata.full_name,metadata.updated_at,{state:metadata.private?'Private':'Public',url:metadata.html_url,message:metadata.description||undefined}));
    for (const x of branches as AnyRecord[]) out.push(event(p,'GitHub','Branch',`${metadata.id}:${x.name}`,x.name,metadata.updated_at,{state:x.protected?'Protected':'Active',url:`${metadata.html_url}/tree/${encodeURIComponent(x.name)}`}));
    for (const x of issues as AnyRecord[]) out.push(event(p,'GitHub',x.pull_request?'Pull request':'Issue',x.number,x.title,x.updated_at,{message:x.user?.login?`by ${x.user.login}`:undefined,state:x.state,url:x.html_url}));
    for (const x of commits as AnyRecord[]) out.push(event(p,'GitHub','Commit',x.sha,x.commit?.message?.split('\n')[0],x.commit?.author?.date,{message:x.commit?.author?.name,url:x.html_url}));
  }
  return out;
}
async function vercel(projects: AnyRecord[]): Promise<ProviderEvent[]> {
  const token=process.env.VERCEL_ACCESS_TOKEN; if(!token)return[]; const h=headers(token); const team=process.env.VERCEL_TEAM_ID;
  const suffix=team?`&teamId=${encodeURIComponent(team)}`:''; const list=await getJson(`https://api.vercel.com/v9/projects?limit=100${team?`&teamId=${encodeURIComponent(team)}`:''}`,h);
  const vp:AnyRecord[]=list.projects||[]; const out:ProviderEvent[]=[];
  for(const p of projects){const match=vp.filter((v:AnyRecord)=>v.id===p.vercelProjectName||v.name===p.vercelProjectName||v.name?.toLowerCase()===p.slug?.toLowerCase()||v.name?.toLowerCase()===p.name?.toLowerCase());
    for(const v of match){const d=await getJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(v.id)}&limit=10${suffix}`,h);for(const x of d.deployments||[]){out.push(event(p,'Vercel','Deployment',x.uid,x.name||x.url,x.created,{state:x.state||x.readyState,url:x.url?`https://${x.url}`:undefined,message:x.meta?.githubCommitMessage}));const logs=await getJson(`https://api.vercel.com/v3/deployments/${encodeURIComponent(x.uid)}/events?limit=10${team?`&teamId=${encodeURIComponent(team)}`:''}`,h);for(const line of (Array.isArray(logs)?logs:logs.events||[]))out.push(event(p,'Vercel','Build event',`${x.uid}:${line.id||line.createdAt}`,line.type||'Build event',line.createdAt||line.date,{url:x.url?`https://${x.url}`:undefined}));}}
  }return out;
}
async function render(projects: AnyRecord[]): Promise<ProviderEvent[]> {
  const token=process.env.RENDER_API_KEY;if(!token)return[];const h=headers(token);const services=await renderServicePages(token);const out:ProviderEvent[]=[];
  for(const p of projects){const links=(p.repositoryLinks||[]).map((x:string)=>String(x).replace(/\.git$/,'').toLowerCase());const matches=services.filter((s:AnyRecord)=>s.id===p.renderServiceId||s.name?.toLowerCase()===p.slug?.toLowerCase()||s.name?.toLowerCase()===p.name?.toLowerCase()||(s.repo&&links.includes(String(s.repo).replace(/\.git$/,'').toLowerCase())));
    for(const s of matches){const d=await getJson(`https://api.render.com/v1/services/${encodeURIComponent(s.id)}/deploys?limit=10`,h);for(const row of (Array.isArray(d)?d:[])){const x=row.deploy||row;out.push(event(p,'Render','Deployment',x.id,x.commit?.message||`${s.name} deployment`,x.createdAt||x.created_at,{state:x.status,url:`https://dashboard.render.com/web/${s.id}/deploys`,message:x.commit?.id?`Commit ${String(x.commit.id).slice(0,8)}`:undefined}));}if(s.ownerId){const since=new Date(Date.now()-60*60*1000).toISOString();const q=new URLSearchParams({ownerId:s.ownerId,resource:s.id,startTime:since,endTime:new Date().toISOString(),direction:'backward',type:'build',limit:'25'});const logs=await getJson(`https://api.render.com/v1/logs?${q}`,h);for(const x of logs.logs||[])out.push(event(p,'Render','Build event',x.id,x.type||'Build event',x.timestamp,{url:`https://dashboard.render.com/web/${s.id}/logs`}));}}
  }return out;
}
async function cloudflare(projects: AnyRecord[]): Promise<ProviderEvent[]> {
  const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)return[];
  const zones:AnyRecord[]=[],out:ProviderEvent[]=[];
  for(let page=1;page<=5;page++){const data:any=await getJson(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`,headers(token));if(data.success===false)throw new Error('Cloudflare rejected the request or the token lacks zone read permission.');zones.push(...(Array.isArray(data.result)?data.result:[]));if(page>=Number(data.result_info?.total_pages||1))break;}
  for(const p of projects){const domainSet=new Set((p.domains||[]).map((x:string)=>String(x).toLowerCase().replace(/^www\./,'')));for(const raw of p.liveUrls||[]){try{domainSet.add(new URL(raw).hostname.toLowerCase().replace(/^www\./,''))}catch{}}
    for(const zone of zones.filter(z=>domainSet.has(String(z.name||'').toLowerCase())).slice(0,10)){
      out.push(event(p,'Cloudflare','Zone',zone.id,zone.name,zone.modified_on,{state:zone.status,url:`https://dash.cloudflare.com/${zone.id}`,message:zone.paused?'Paused':`Plan: ${zone.plan?.name||'unknown'}`}));
      for(let page=1;page<=3;page++){const dns:any=await getJson(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100&page=${page}`,headers(token));if(dns.success===false)throw new Error('Cloudflare DNS read failed or the token lacks DNS read permission.');for(const record of (dns.result||[]) as AnyRecord[])out.push(event(p,'Cloudflare','DNS record',record.id,`${record.type} ${record.name}`,record.modified_on,{state:record.proxied?'Proxied':'DNS only',url:`https://dash.cloudflare.com/${zone.id}/${zone.name}/dns/records`}));if(page>=Number(dns.result_info?.total_pages||1))break;}
    }
  }
  return out;
}
async function providerCheck(name:string,token:string|undefined,url:string,extra:Record<string,string>={},validate?:(data:any)=>boolean){
  if(!token)return{name,configured:false,connected:false,error:null};
  try{const data=await getJson(url,headers(token,extra));if(validate&&!validate(data))throw new Error('Provider connection check was rejected.');return{name,configured:true,connected:true,error:null}}catch(error){return{name,configured:true,connected:false,error:error instanceof Error?error.message:'Provider request failed'}}
}
export async function loadProviderActivity(projects: Array<ProjectType & {_id: unknown}>) {
  const raw=projects as AnyRecord[];const providers=[['GitHub',github],['Vercel',vercel],['Render',render],['Cloudflare',cloudflare]] as const;
  const [settled,checks]=await Promise.all([Promise.all(providers.map(async([name,fn])=>{try{return {name,events:await fn(raw),error:null}}catch(e){return{name,events:[],error:e instanceof Error?e.message:'Provider request failed'}}})),Promise.all([
    providerCheck('GitHub',process.env.GITHUB_TOKEN,'https://api.github.com/user',{'X-GitHub-Api-Version':'2022-11-28'}),
    providerCheck('Vercel',process.env.VERCEL_ACCESS_TOKEN,'https://api.vercel.com/v2/user'),
    providerCheck('Render',process.env.RENDER_API_KEY,'https://api.render.com/v1/owners?limit=1'),
    providerCheck('Cloudflare',process.env.CLOUDFLARE_API_TOKEN,'https://api.cloudflare.com/client/v4/user/tokens/verify',{},data=>data.success===true)
  ])]);
  const checkByName=new Map(checks.map(item=>[item.name,item]));
  const events=settled.flatMap(x=>x.events).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,250);
  const statuses=settled.map(x=>{const check=checkByName.get(x.name);const error=x.error||check?.error||null;return{name:x.name,configured:check?.configured||false,connected:Boolean(check?.connected&&!error),error}});
  return {events,providers:statuses};
}

export async function triggerProviderDeployment(project:ProjectType & {_id:unknown},provider:'Vercel'|'Render'){
  const p=project as AnyRecord;
  if(provider==='Render'){
    const token=process.env.RENDER_API_KEY;if(!token)throw new Error('RENDER_API_KEY is not configured on the server.');
    const services=await renderServicePages(token);const links=(p.repositoryLinks||[]).map((x:string)=>String(x).replace(/\.git$/,'').toLowerCase());
    const matches=services.filter((s:AnyRecord)=>s.id===p.renderServiceId||(!p.renderServiceId&&(s.name?.toLowerCase()===p.slug?.toLowerCase()||s.name?.toLowerCase()===p.name?.toLowerCase()||(s.repo&&links.includes(String(s.repo).replace(/\.git$/,'').toLowerCase())))));
    if(!matches.length)throw new Error('No Render service is linked. Set its service ID in this project’s Settings.');
    if(matches.length>1)throw new Error('More than one Render service matches this project. Set the exact service ID in project Settings.');
    const service=matches[0];const result=await postJson(`https://api.render.com/v1/services/${encodeURIComponent(service.id)}/deploys`,token,{clearCache:'do_not_clear',deployMode:'build_and_deploy'});
    return {provider,service:service.name||service.id,id:result.id,status:result.status||'queued'};
  }
  const token=process.env.VERCEL_ACCESS_TOKEN;if(!token)throw new Error('VERCEL_ACCESS_TOKEN is not configured on the server.');
  const team=process.env.VERCEL_TEAM_ID;const teamQuery=team?`&teamId=${encodeURIComponent(team)}`:'';const teamBody=team?`?teamId=${encodeURIComponent(team)}`:'';
  const listing=await getJson(`https://api.vercel.com/v9/projects?limit=100${team?`&teamId=${encodeURIComponent(team)}`:''}`,headers(token));const candidates=(listing.projects||[]).filter((v:AnyRecord)=>v.id===p.vercelProjectName||v.name===p.vercelProjectName||(!p.vercelProjectName&&(v.name?.toLowerCase()===p.slug?.toLowerCase()||v.name?.toLowerCase()===p.name?.toLowerCase())));
  if(!candidates.length)throw new Error('No Vercel project is linked. Set its project ID or name in this project’s Settings.');
  if(candidates.length>1)throw new Error('More than one Vercel project matches this project. Set the exact project ID in project Settings.');
  const target=candidates[0];const deployments=await getJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(target.id)}&limit=1${teamQuery}`,headers(token));const latest=deployments.deployments?.[0];
  if(!latest)throw new Error('Vercel has no deployment to redeploy for this project.');
  const result=await postJson(`https://api.vercel.com/v13/deployments${teamBody}`,token,{deploymentId:latest.uid||latest.id});
  return {provider,service:target.name||target.id,id:result.id||result.uid,status:result.readyState||result.status||'queued',url:result.url?`https://${result.url}`:undefined};
}
