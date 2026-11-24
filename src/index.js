import { createPlan, basicPlan } from './plan.js';
import { searchSources } from './providers.js';
import { webSearch } from './web-search.js';
import { assess } from './assessment.js';
import {scope,originFor,localize} from './geo.js';

const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const ms=()=>Math.round(performance.now());

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/health') return respond({app:'Strata Destruct',version:'0.6.2-dev',ai_binding:Boolean(env?.AI),status:'ok'});
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
        const spatial=scope(query);const origin=await originFor(spatial);
        if(spatial)plan.sources=['web'];
        const webOnly=plan.sources?.includes('web')&&!plan.sources.some(s=>s==='crossref'||s==='wikipedia');
        const objective=(origin?'起点は'+origin.name+'、座標'+origin.lat+','+origin.lon+'。近隣地域の具体的な候補地、街路樹台帳、植栽本数、管理者ブログを優先。全国の有名観光地や単なる乗換案内は不要。候補の所在地も取得。':'')+'日本語で根拠を探す。基準日（日本時間）: '+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+'。各条件の実証資料を優先し、数値・日付・交通経路が不明なら不明とする。目的: '+query;
        const [indexes,web]=await Promise.all([
          webOnly?Promise.resolve({records:[],reports:[]}):searchSources(plan),
          skipAI?Promise.resolve({records:[],report:null}):webSearch(objective,origin?[origin.name+' 周辺 '+query.replace(/[^。]*駅から.*$/,'').trim(),...plan.search_queries.slice(0,3).map(t=>origin.name+' 周辺 '+t)]:[query,...(plan.search_queries??[])]).then(records=>({records,report:{source:'parallel',query,status:'ok',count:records.length,error:null}})).catch(e=>({records:[],report:{source:'parallel',query,status:'error',count:0,error:String(e.message).slice(0,250)}}))
        ]);
        if(spatial)web.records=localize(web.records,origin,spatial.minutes).filter(r=>r.geo.status!=='excluded');
        const findings={records:[...web.records,...indexes.records],reports:[...(web.report?[web.report]:[]),...indexes.reports]};
        const fetchMs=ms()-start-aiMs;
        const assessment=skipAI||payload?.defer_assessment===true?{status:'skipped',candidates:[]}:await assess(query,web.records,env?.AI);
        return respond({
          query,mode:'free_only',spatial,origin,plan:parsed.plan,assessment,ai_status:parsed.status,
          ai_error:parsed.error,ai_model:parsed.model??null,records:findings.records,sources:findings.reports,
          timings_ms:{ai:aiMs,sources:fetchMs,total:ms()-start},
          caveat:'検索索引・Web抜粋・メタデータです。条件適合と原資料全文は未検証です。'
        });
      }catch(e){
        return respond({error:'検索処理が失敗しました',detail:String(e?.message??e).slice(0,160),elapsed_ms:ms()-start},502);
      }
    }
    if(url.pathname==='/api/assess' && request.method==='POST'){
      try{
        const p=await request.json();
        const query=typeof p.query==='string'?p.query.trim().slice(0,1200):'';
        const records=Array.isArray(p.records)?p.records.slice(0,18).filter(r=>typeof r?.id==='string'&&typeof r?.snippet==='string'&&typeof r?.title==='string'&&typeof r?.url==='string'&&/^https?:\/\//.test(r.url)).map(r=>({id:r.id.slice(0,80),title:r.title.slice(0,250),snippet:r.snippet.slice(0,2200),url:r.url.slice(0,2000),published_at:r.published_at})): [];
        if(!query)return respond({error:'検索文がありません'},400);
        const spatial=scope(query);const origin=await originFor(spatial);const eligible=spatial?localize(records,origin,spatial.minutes).filter(r=>r.geo.status!=='excluded'):records;
        return respond(await assess(query,eligible,env?.AI));
      }catch(e){return respond({status:'error',candidates:[],error:String(e.message).slice(0,200)},400);}
    }
    if(url.pathname.startsWith('/api/')) return respond({error:'Not found'},404);
    return env.ASSETS.fetch(request);
  }
};
