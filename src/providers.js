const JSON_HEADERS = {'accept':'application/json', 'user-agent':'StrataDestruct/0.5 (research-prototype; referer https://github.com/uniuyuni/StrataDestruct)'};

async function getJson(url, fetcher, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {headers: JSON_HEADERS, signal: controller.signal});
    if (!response.ok) { const e=new Error('HTTP '+response.status); e.status=response.status; e.retryAfter=response.headers?.get('retry-after'); throw e; }
    return await response.json();
  } finally { clearTimeout(timer); }
}

function trim(s, max = 250) { return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

export async function wikipedia(term, fetcher = fetch) {
  const u = new URL('https://ja.wikipedia.org/w/api.php');
  u.searchParams.set('action', 'query');
  u.searchParams.set('list', 'search');
  u.searchParams.set('srsearch', term);
  u.searchParams.set('srlimit', '5');
  u.searchParams.set('format', 'json');
  u.searchParams.set('origin', '*');
  const data = await getJson(u.toString(), fetcher);
  return (data?.query?.search ?? []).slice(0, 5).map(item => ({
    id: 'wp-' + item.pageid,
    title: trim(item.title, 200),
    url: 'https://ja.wikipedia.org/?curid=' + encodeURIComponent(item.pageid),
    snippet: trim(item.snippet, 350),
    source: 'Wikipedia（検索索引）',
    evidence_level: 'search_snippet',
    retrieved_at: new Date().toISOString()
  }));
}

export async function crossref(term, fetcher = fetch) {
  const u = new URL('https://api.crossref.org/works');
  u.searchParams.set('query', term);
  u.searchParams.set('rows', '5');
  u.searchParams.set('select', 'DOI,title,published,URL');
  const data = await getJson(u.toString(), fetcher);
  return (data?.message?.items ?? []).slice(0, 5).map(item => ({
    id: 'doi-' + trim(item.DOI, 180),
    title: trim(item.title?.[0], 240),
    url: typeof item.DOI === 'string' ? 'https://doi.org/' + encodeURIComponent(item.DOI).replace(/%2F/g, '/') : item.URL,
    snippet: '',
    source: 'Crossref（論文メタデータ）',
    evidence_level: 'metadata',
    retrieved_at: new Date().toISOString()
  })).filter(x => x.title && x.url);
}

export async function searchSources(plan, fetcher = fetch) {
  const terms = (Array.isArray(plan.search_queries) && plan.search_queries.length ? plan.search_queries : (plan.keywords ?? [])).slice(0, 3).filter(Boolean);
  const sources = (plan.sources ?? ['wikipedia', 'crossref']).filter(s => ['wikipedia','crossref'].includes(s));
  const tasks = sources.flatMap(source => terms.map(term => ({
    source, term, run: () => source === 'wikipedia' ? wikipedia(term, fetcher) : crossref(term, fetcher)
  })));
  const settled = new Array(tasks.length);
  const groups = [...new Set(tasks.map(t=>t.source))];
  await Promise.all(groups.map(async source=>{
    let blocked=false;
    for(const [i,t] of tasks.entries()){
      if(t.source!==source)continue;
      if(blocked){settled[i]={status:'rejected',reason:Error('HTTP 429: remaining requests skipped to respect rate limit')};continue;}
      try{settled[i]={status:'fulfilled',value:await t.run()};}
      catch(e){settled[i]={status:'rejected',reason:e};if(e.status===429||/HTTP 429/.test(e.message))blocked=true;}
      if(source==='crossref'&&!blocked)await new Promise(r=>setTimeout(r,1100));
    }
  }));
  const reports = settled.map((result, i) => ({
    source: tasks[i].source,
    query: tasks[i].term,
    status: result.status === 'fulfilled' ? 'ok' : 'error',
    count: result.status === 'fulfilled' ? result.value.length : 0,
    error: result.status === 'rejected' ? String(result.reason?.message ?? result.reason).slice(0, 180) : null
  }));
  const seen = new Set();
  const records = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []).filter(x => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  }).slice(0, 25);
  return { records, reports };
}
