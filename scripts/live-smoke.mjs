const base=process.env.STRATA_URL||'https://stratadestruct.uniuyuni-c76.workers.dev';
async function req(path,body,ms=70000){const r=await fetch(base+path,{method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();}
let h;
for(let i=0;i<30;i++){h=await req('/api/health');if(h.version==='0.6.2-dev')break;await new Promise(r=>setTimeout(r,4000));}
if(h.version!=='0.6.2-dev')throw Error('deployment mismatch '+h.version);
const query='明日見頃のプラタナスの木が少なくとも10本あるところ。山手駅から１時間の範囲内で公共交通機関利用';
const result=await req('/api/search',{query,defer_assessment:true});
console.log('PLAN',JSON.stringify(result.plan));console.log('SOURCES',JSON.stringify(result.sources));
const records=result.records.filter(r=>r.evidence_level==='web_excerpt');
console.log('WEB RESULTS',JSON.stringify(records.map(r=>({id:r.id,title:r.title,url:r.url,snippet:r.snippet.slice(0,550)}))));
if(!records.length)throw Error('No actual web results');
const a=await req('/api/assess',{query,records},30000);
console.log('ASSESSMENT',JSON.stringify(a));
if(!a.candidates?.length)throw Error('No grounded candidates from real data');
if(a.candidates.some(c=>c.geo?.status==='excluded'||/岩見沢|万博記念公園|高山駅/.test(c.name)))throw Error('Out-of-area candidate');
if(a.candidates.some(c=>c.checks.some(k=>/公共交通/.test(k.condition)&&k.status==='supported')))throw Error('Unverified transport falsely supported');
console.log('LIVE SEARCH OK — candidates are not necessarily confirmed matches');
