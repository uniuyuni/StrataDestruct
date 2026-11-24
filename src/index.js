import { createPlan, basicPlan } from './plan.js';
import { searchSources } from './providers.js';
import { webSearch } from './web-search.js';
import { assess } from './assessment.js';

const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const ms=()=>Math.round(performance.now());

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/health') return respond({app:'Strata Destruct',version:'0.6.0-dev',ai_binding:Boolean(env?.AI),status:'ok'});
    if(url.pathname==='/api/search' && request.method==='POST'){
      let payload;
      try{payload=await request.json();}catch{return respond({error:'JSONリクエストが不正です'},400);}
      const query=typeof payload?.query==='string'?payload.query.trim():'';
      if(!query || query.length>1200) return respond({error:'検索文は1〜1200文字にしてください'},400);
      const start=ms();
      try{
        // Explicit AI-off path helps diagnose external free data independently.
        const skipAI=payload?.use_ai===false;
        const parsed=skipAI
          ? {plan:basicPlan(query),status:'skipped',error:'AIを使用せず、入力全文で資料索引を検索'}
          : await createPlan(query,env?.AI,{timeoutMs:22000});
        const aiMs=ms()-start;
        const plan=parsed.plan;
        const webOnly=plan.sources?.includes('web')&&!plan.sources.some(s=>s==='crossref'||s==='wikipedia');
        const objective='日本語で根拠を探す。基準日（日本時間）: '+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+'。各条件の実証資料を優先し、数値・日付・交通経路が不明なら不明とする。目的: '+query;
        const [indexes,web]=await Promise.all([
          webOnly?Promise.resolve({records:[],reports:[]}):searchSources(plan),
          skipAI?Promise.resolve({records:[],report:null}):webSearch(objective,[query,...(plan.search_queries??[])]).then(records=>({records,report:{source:'parallel',query,status:'ok',count:records.length,error:null}})).catch(e=>({records:[],report:{source:'parallel',query,status:'error',count:0,error:String(e.message).slice(0,250)}}))
        ]);
        const findings={records:[...web.records,...indexes.records],reports:[...(web.report?[web.report]:[]),...indexes.reports]};
        const fetchMs=ms()-start-aiMs;
        const assessment=skipAI?{status:'skipped',candidates:[]}:await assess(query,web.records,env?.AI);
        return respond({
          query,mode:'free_only',plan:parsed.plan,assessment,ai_status:parsed.status,
          ai_error:parsed.error,ai_model:parsed.model??null,records:findings.records,sources:findings.reports,
          timings_ms:{ai:aiMs,sources:fetchMs,total:ms()-start},
          caveat:'検索索引・Web抜粋・メタデータです。条件適合と原資料全文は未検証です。'
        });
      }catch(e){
        return respond({error:'検索処理が失敗しました',detail:String(e?.message??e).slice(0,160),elapsed_ms:ms()-start},502);
      }
    }
    if(url.pathname.startsWith('/api/')) return respond({error:'Not found'},404);
    return env.ASSETS.fetch(request);
  }
};
