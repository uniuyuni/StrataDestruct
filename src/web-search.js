const ENDPOINT='https://search.parallel.ai/mcp';

export function decodeRpc(body,id) {
  let values=[];
  try { values=[JSON.parse(body)]; }
  catch { for(const line of body.split(/\r?\n/)){if(line.startsWith('data:'))try{values.push(JSON.parse(line.slice(5).trim()));}catch{}} }
  const msg=values.flat().find(x=>x?.id===id);
  if(!msg)throw Error('MCP response missing id '+id);
  if(msg.error)throw Error(msg.error.message||'MCP error');
  return msg.result;
}
export function normalizeWeb(result){
  const records=[],seen=new Set();
  function visit(v){
    if(typeof v==='string'){
      try{visit(JSON.parse(v));}catch{}
      return;
    }
    if(Array.isArray(v)){v.forEach(visit);return;}
    if(!v||typeof v!=='object')return;
    if(typeof v.url==='string'&&/^https?:\/\//.test(v.url)&&!seen.has(v.url)){
      seen.add(v.url);
      const snippets=v.excerpts??v.snippets??v.snippet??v.text??v.content??'';
      records.push({id:'web-'+(records.length+1),title:String(v.title??v.url).slice(0,250),url:v.url, snippet:(Array.isArray(snippets)?snippets.map(x=>typeof x==='string'?x:x.text??'').join('\n'):String(snippets)).slice(0,2200),source:'Parallel Web Search',evidence_level:'web_excerpt',published_at:v.publish_date??v.published_at??null,retrieved_at:new Date().toISOString()});
    }else Object.values(v).forEach(visit);
  }
  visit(result?.structuredContent??result);
  return records.slice(0,18);
}
export async function webSearch(objective,queries,fetcher=fetch){
  let session,protocol='2025-03-26',id=0;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),25000);
  async function rpc(method,params,notification=false){
    const headers={'content-type':'application/json','accept':'application/json, text/event-stream','MCP-Protocol-Version':protocol};
    if(session)headers['Mcp-Session-Id']=session;
    const body={jsonrpc:'2.0',method,params};
    if(!notification)body.id=++id;
    const res=await fetcher(ENDPOINT,{method:'POST',headers,body:JSON.stringify(body),signal:ctl.signal});
    if(!res.ok)throw Error('Parallel HTTP '+res.status);
    session=res.headers.get('mcp-session-id')??session;
    if(notification){await res.body?.cancel();return;}
    const result=decodeRpc(await res.text(),body.id);
    if(result?.isError)throw Error(JSON.stringify(result.content).slice(0,300));
    return result;
  }
  try{
    const init=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'StrataDestruct',version:'0.6'}});
    protocol=init.protocolVersion??protocol;
    await rpc('notifications/initialized',{},true);
    const tools=await rpc('tools/list',{});
    const search=tools.tools.find(t=>t.name==='web_search');
    if(!search)throw Error('web_search unavailable');
    const p=search.inputSchema?.properties??{};
    const args={};
    if('objective'in p)args.objective=objective.slice(0,1800);
    if('search_queries'in p)args.search_queries=queries.slice(0,4);
    if('query'in p)args.query=queries.join(' ');
    if('max_results'in p)args.max_results=12;
    const result=await rpc('tools/call',{name:search.name,arguments:args});
    const records=normalizeWeb(result);
    if(!records.length)throw Error('No structured search records: '+JSON.stringify(result).slice(0,180));
    return records;
  }finally{clearTimeout(timer);}
}
