const base = process.env.STRATA_URL || 'https://stratadestruct.uniuyuni-c76.workers.dev';
const shorten = (s, n=400) => String(s).replace(/\s+/g,' ').slice(0,n);
async function send(path, opts={}, ms=30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(new URL(path,base), { ...opts, signal: controller.signal, redirect:'follow' });
    const text = await res.text();
    let json; try{ json=JSON.parse(text); } catch{}
    console.log(`HTTP ${res.status} ${path} (${Date.now()-started}ms), type=${res.headers.get('content-type')}`);
    return {res,json,text};
  } finally{clearTimeout(timer);}
}
let failures=0;
try {
  const home=await send('/', {}, 15000);
  console.log('Page title / snippet:', shorten(home.text,140));
  if(!home.res.ok || !home.text.includes('Strata Destruct')) {
    console.error('FAIL: the deployed home page is not the expected application');
    failures++;
  }
} catch(e){console.error('FAIL: page:', e.message);failures++;}
let health;
try {
  health=await send('/api/health',{},15000);
  console.log('Health:', health.json ?? shorten(health.text));
  if(!health.res.ok || health.json?.app !== 'Strata Destruct') {
    console.error('FAIL: health endpoint did not return the expected Strata Destruct JSON');
    failures++;
  }
} catch(e){console.error('FAIL: health:', e.message);failures++;}
if (health?.json?.app === 'Strata Destruct') {
  try {
    const query = '明治期の日本の灯台整備が航海技術に与えた影響を、海外の記録も含めて調べたい';
    const result=await send('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})},45000);
    if(!result.res.ok || !result.json){
      console.error('FAIL: search endpoint:',shorten(result.text));failures++;
    }else{
      console.log('AI status:', result.json.ai_status);
      console.log('Plan:', JSON.stringify(result.json.plan));
      console.log('Source reports:',JSON.stringify(result.json.sources));
      console.log('Results count:',result.json.records?.length);
      console.log('First titles:',JSON.stringify((result.json.records||[]).slice(0,3).map(x=>({title:x.title,source:x.source,url:x.url}))));
      if(!result.json.plan || !Array.isArray(result.json.sources)) {
        console.error('FAIL: invalid search response schema');failures++;
      }
      if(result.json.ai_status !== 'ok') {
        console.error('WARN: AI natural language parsing is not confirmed; fallback occurred');
      }
      if(!result.json.records?.length) {
        console.error('WARN: No real search records returned: see source reports');
      }
    }
  }catch(e){console.error('FAIL: search:',e.stack||e.message);failures++;}
}else{
  console.log('SKIP: actual search to avoid spending model quota on a different or uninitialized deployment');
}
if(failures) {
  console.error(`Live smoke test: ${failures} fatal problem(s)`);
  process.exitCode=1;
}else console.log('Live smoke test finished; verify warnings before declaring P0 complete.');
