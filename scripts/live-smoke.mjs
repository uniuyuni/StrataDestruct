const base = process.env.STRATA_URL || 'https://stratadestruct.uniuyuni-c76.workers.dev';
const shorten=(s,n=200)=>String(s).replace(/\s+/g,' ').slice(0,n);
async function send(path,opts={},timeoutMs=30000){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  const t=Date.now();
  try {
    const r=await fetch(new URL(path,base),{...opts,signal:ctl.signal});
    const body=await r.text();
    let json;try{json=JSON.parse(body);}catch{}
    console.log('HTTP',r.status,path,'elapsed_ms',Date.now()-t,'type',r.headers.get('content-type'));
    return {r,json,body};
  }finally{clearTimeout(timer);}
}
const post=async (query,use_ai) => send('/api/search',
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,use_ai})},30000);
let failures=0, health;
try {
  const home=await send('/',{},12000);
  console.log('Home snippet:',shorten(home.body,120));
  if(!home.r.ok || !home.body.includes('Strata Destruct')) failures++;
}catch(e){console.error('Home failed',e.message);failures++;}
try {
  health=await send('/api/health',{},12000);
  console.log('Health',health.json??shorten(health.body));
  if(health.json?.app!=='Strata Destruct') failures++;
}catch(e){console.error('Health failed',e.message);failures++;}
if(health?.json?.version!=='0.5.2-dev'){
  console.error('DEPLOYMENT MISMATCH: expected 0.5.1-dev, got',health?.json?.version,' (possibly deployment not updated yet).');
  failures++;
}else{
  try{
    const res=await post('computational photography',false);
    console.log('No-AI source statuses',JSON.stringify(res.json?.sources));
    console.log('No-AI count',res.json?.records?.length,'timings',res.json?.timings_ms);
    if(!res.r.ok || !Array.isArray(res.json?.sources)) failures++;
    if(!(res.json?.records?.length>0)){console.error('FREE SEARCH FAILED: no real records from Wikipedia or Crossref'); failures++;}
  }catch(e){console.error('No-AI lookup failed',e.message);failures++;}
  try{
    const res=await post('写真の空気感を改善する画像復元技術を天文学の研究も含めて探したい',true);
    console.log('AI status',res.json?.ai_status,'AI error',res.json?.ai_error,'timings',res.json?.timings_ms);
    console.log('AI plan',JSON.stringify(res.json?.plan));
    if(!Array.isArray(res.json?.plan?.search_queries) || !res.json.plan.search_queries.some(x=>/天文|astron|space/i.test(x))){
      console.error('P0 NOT DONE: cross-domain astronomy intent missing in executed search queries');
      failures++;
    }
    console.log('AI source statuses',JSON.stringify(res.json?.sources));
    console.log('AI records count',res.json?.records?.length);
    if(!res.r.ok || res.json?.ai_status!=='ok'){console.error('P0 NOT DONE: AI semantic analysis failed or fell back');failures++;}
  }catch(e){console.error('AI search failed',e.message);failures++;}
}
if(failures){console.error('LIVE SMOKE FAILED:',failures);process.exitCode=1;}
else console.log('LIVE SMOKE OK: actual API calls returned records and AI plan');
