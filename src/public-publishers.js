// Bounded retrieval of public park information, not a stored list of locations.
const HOST='www.hama-midorinokyokai.or.jp',BASE='https://'+HOST;
const norm=x=>String(x??'').normalize('NFKC').toLowerCase();
const matches=(x,terms)=>terms.some(t=>norm(x).includes(norm(t)));
function cleanText(html){
 return html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?(?:p|div|li|h[1-6]|br|tr|section|article|dt|dd)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
export function parseParkIndex(html){
 const result=new Map();
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  try{const u=new URL(m[1],BASE+'/parks/');if(u.hostname!==HOST||!/^\/park\/[a-z0-9_-]+\/(?:index\.php)?$/i.test(u.pathname))continue;
   const path=u.pathname.replace(/index\.php$/,'');const name=cleanText(m[2]).trim();
   if(name&&name.length<=100)result.set(path,name);
  }catch{}
 }
 return [...result].map(([path,name])=>({path,name})).slice(0,15);
}
function robotsDisallows(text,path){
 const groups=[];let g=null;
 for(const raw of text.split(/\r?\n/)){
  const m=raw.replace(/#.*$/,'').match(/^\s*(user-agent|disallow|allow)\s*:\s*(.*?)\s*$/i);if(!m)continue;
  if(m[1].toLowerCase()==='user-agent'){if(!g||g.rules.length){g={agents:[],rules:[]};groups.push(g);}g.agents.push(m[2].toLowerCase());}
  else if(g&&m[2])g.rules.push({deny:m[1].toLowerCase()==='disallow',path:m[2]});
 }
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'stratadestruct'.includes(a)));
 const rules=(specific.length?specific:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules).filter(r=>path.startsWith(r.path)).sort((a,b)=>b.path.length-a.path.length||Number(a.deny)-Number(b.deny));
 return rules[0]?.deny??false;
}
async function get(path,fetcher){
 const u=new URL(path,BASE);
 if(u.protocol!=='https:'||u.hostname!==HOST)throw Error('unapproved publisher');
 const key=new Request(u.href);
 const cache=globalThis.caches?.default;
 if(cache){try{const cached=await cache.match(key);if(cached)return {status:200,text:await cached.text()};}catch{}}
 const r=await fetcher(u.href,{redirect:'manual',signal:AbortSignal.timeout(4500),headers:{'user-agent':'StrataDestruct/0.6 (+https://github.com/uniuyuni/StrataDestruct)','accept':'text/html,text/plain'}});
 if(!r.ok)return {status:r.status,text:''};
 if(Number(r.headers.get('content-length'))>600000)return {status:413,text:''};
 const text=await r.text();
 if(text.length>600000)return {status:413,text:''};
 if(cache){try{await cache.put(key,new Response(text,{headers:{'cache-control':'public,max-age=21600','content-type':'text/plain; charset=utf-8'}}));}catch{}}
 return {status:r.status,text};
}
export function extractPublisherEvidence(html,terms){
 const lines=cleanText(html).split('\n').map(x=>x.trim()).filter(Boolean);
 const candidates=[];
 for(let i=0;i<lines.length;i++){
  if(!matches(lines[i],terms))continue;
  const quote=lines.slice(Math.max(0,i-1),i+3).join('\n');
  if(!/木々|樹木|植栽|植え|高木|大木|紅葉|黄葉|葉が|実が|実は|本の木|\d+\s*本|見頃/.test(quote))continue;
  candidates.push(quote.slice(0,550));
 }
 return [...new Set(candidates)].slice(0,3).join('\n');
}
export async function publisherSearch(origin,intent,fetcher=fetch){
 if(!origin?.name?.includes('横浜市'))return {records:[],report:null};
 let count=0,errors=0,blocked=0;const records=[];
 try{
  const robots=await get('/robots.txt',fetcher);
  if(robots.status!==200&&robots.status!==404&&robots.status!==410)throw Error('robots.txt status '+robots.status);
  if(robotsDisallows(robots.text,'/parks/'))throw Error('publisher disallows index');
  const index=await get('/parks/',fetcher);
  if(index.status!==200)throw Error('publisher index HTTP '+index.status);
  const parks=parseParkIndex(index.text);
  if(!parks.length)throw Error('no park links in publisher index');
  // 15 actual linked parks, max three simultaneous requests, no retry on failure.
  for(let i=0;i<parks.length;i+=3){
   const batch=parks.slice(i,i+3);
   const result=await Promise.allSettled(batch.map(async park=>{
    const path=park.path+'stroll.php';
    if(robotsDisallows(robots.text,path)){blocked++;return;}
    const page=await get(path,fetcher);
    if(page.status===429){const e=Error('publisher rate limited');e.status=429;throw e;}
    if(page.status!==200){errors++;return;}
    count++;
    const snippet=extractPublisherEvidence(page.text,intent.terms);
    if(!snippet)return;
    records.push({id:'publisher-'+park.path.replace(/\W+/g,''),title:park.name+'｜公式散策案内',url:BASE+path,snippet:'横浜市 '+park.name+'\n'+snippet,source:'横浜市緑の協会（公式ページ）',evidence_level:'web_excerpt',retrieved_at:new Date().toISOString()});
   }));
   if(result.some(x=>x.status==='rejected'&&x.reason?.status===429)){errors++;break;}
   errors+=result.filter(x=>x.status==='rejected').length;
  }
  return {records,report:{source:'公式公園サイト',query:'公園一覧から公開散策案内を照会',status:count?'ok':'error',count:records.length,error:errors||blocked?'取得成功 '+count+'ページ、未取得 '+(errors+blocked)+'ページ':null}};
 }catch(e){return {records,report:{source:'公式公園サイト',query:'公園一覧から公開散策案内を照会',status:'error',count:records.length,error:String(e.message).slice(0,180)}};}
}
