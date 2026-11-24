const base=process.env.STRATA_URL||'https://stratadestruct.uniuyuni-c76.workers.dev';
async function req(path,body,ms=90000){const r=await fetch(base+path,{method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json();}
let h;
for(let i=0;i<30;i++){h=await req('/api/health');if(h.version==='0.6.6-dev')break;await new Promise(r=>setTimeout(r,4000));}
if(h.version!=='0.6.6-dev')throw Error('deployment mismatch '+h.version);
const query='明日見頃のプラタナスが10本以上ある場所を、山手駅から公共交通機関で1時間以内の範囲で探して';
const result=await req('/api/search',{query,defer_assessment:true});
console.log('PLAN',JSON.stringify(result.plan));console.log('SOURCES',JSON.stringify(result.sources));
const records=result.records.filter(r=>r.evidence_level==='web_excerpt');
console.log('WEB RESULTS',JSON.stringify(records.map(r=>({id:r.id,title:r.title,url:r.url,snippet:r.snippet.slice(0,550)}))));
if(!records.length)throw Error('No actual web results');
if(result.intent?.target!=='プラタナス'||result.spatial?.minutes!==60||result.ai_status!=='structured')throw Error('natural-language variant bypassed place discovery');
const a=result.assessment; if(!a||a.status!=='evidence_candidates')throw Error('No usable source-backed place cards: '+JSON.stringify(a));
console.log('ASSESSMENT',JSON.stringify(a));
if(!a.candidates?.some(c=>c.substantive_count>0))throw Error('No grounded candidates from real data');
if(a.candidates.some(c=>c.geo?.status==='excluded'||/岩見沢|万博記念公園|高山駅/.test(c.name)||!c.checks.some(k=>k.evidence?.length)||c.name==='プラタナス'))throw Error('Out-of-area candidate');
if(a.candidates.some(c=>c.checks.some(k=>/公共交通/.test(k.condition)&&k.status==='supported')))throw Error('Unverified transport falsely supported');
const second=await req('/api/assess',{query,records},30000); if(second.status!=='evidence_candidates'||!second.candidates.length)throw Error('assessment endpoint failed');
console.log('LIVE SEARCH OK — deterministic place cards with sources; all constraints unverified');
