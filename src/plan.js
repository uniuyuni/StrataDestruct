export const MODEL = '@cf/google/gemma-4-26b-a4b-it';
export const SECONDARY_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

export function basicPlan(query) {
  const q=String(query??'').trim().slice(0,1200);
  if(!q) throw new Error('調べたいことを入力してください');
  return {goal:q,keywords:[q],search_queries:[q],languages:['ja','en'],sources:['wikipedia','crossref'],constraints:[],unknowns:['AIによる自由文解釈は実施されていません'],ai_generated:false};
}

export function extractJson(value) {
  if(typeof value==='object' && value!==null) return value;
  let s=String(value??'').trim().replace(/<think>[\s\S]*?<\/think>/g,'').trim();
  const fence=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)s=fence[1];
  const a=s.indexOf('{'), b=s.lastIndexOf('}');
  if(a<0||b<=a)throw new Error('AIがJSONを返しませんでした');
  return JSON.parse(s.slice(a,b+1));
}

export function validatePlan(candidate,query){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw new Error('AI計画がオブジェクトではありません');
  const clean=(a,n)=>Array.isArray(a)?a.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,200)).filter(Boolean).slice(0,n):[];
  const search_queries=clean(candidate.search_queries,4);
  const keywords=clean(candidate.keywords,8);
  if(!keywords.length&&!search_queries.length)throw new Error('検索語が無いJSONです: keys='+Object.keys(candidate).slice(0,12).join(','));
  const sources=clean(candidate.sources,3).filter(x=>x==='wikipedia'||x==='crossref');
  return {
    goal:typeof candidate.goal==='string'?candidate.goal.slice(0,300):query,
    keywords:keywords.length?keywords:search_queries,
    search_queries:search_queries.length?search_queries:[keywords.slice(0,3).join(' ')],
    languages:clean(candidate.languages,3),
    sources:sources.length?sources:['wikipedia','crossref'],
    constraints:clean(candidate.constraints,10),
    unknowns:clean(candidate.unknowns,8),
    ai_generated:true
  };
}

export function unwrapResponse(output){
  if(typeof output==='string'||!output||typeof output!=='object')return output;
  if('keywords'in output||'search_queries'in output)return output;
  const content=output?.choices?.[0]?.message?.content;
  if(content) return Array.isArray(content)?content.map(c=>c.text??'').join(''):content;
  if(output?.response) return unwrapResponse(output.response);
  if(output?.result) return unwrapResponse(output.result);
  if(output?.output?.[0]?.content) return unwrapResponse(output.output[0].content);
  if(output?.choices?.[0]?.text) return output.choices[0].text;
  return output;
}

async function runBounded(ai,model,prompt,ms){
  let timer;
  try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('応答時間が'+ms+'msを超過')),ms)});
    const options={
      messages:[{role:'user',content:prompt}],
      max_tokens:700,
      temperature:0.1,
      response_format:{type:'json_object'}
    };
    return await Promise.race([ai.run(model,options),timeout]);
  }finally{clearTimeout(timer);}
}

export async function createPlan(query,ai,{timeoutMs=22000}={}){
  const fallback=basicPlan(query);
  if(!ai?.run)return {plan:fallback,status:'unavailable',error:'Workers AIが未設定'};
  const prompt=[
    'あなたは調査計画を作るAI。必ずJSONのみ返してください。',
    '必須キー: goal(string), keywords(string配列), search_queries(string配列), constraints(string配列)。',
    '推奨キー: sources(["wikipedia","crossref"]), languages(["ja","en"]), unknowns(string配列)。',
    'search_queriesは3件、異なる角度で。必要な異分野条件を必ず含め、1件は英語の検索フレーズ。',
    '例：写真の空気感を天文学の画像復元から調べる → 「天文学 画像復元」「astronomical image restoration」「写真 空気感 画像処理」',
    '出典や事実を捏造しない。',
    '入力:',query
  ].join('\n');
  const errors=[];
  const variants=timeoutMs<1000 ? [{model:MODEL,ms:timeoutMs}] : [{model:MODEL,ms:Math.min(timeoutMs,15000)},{model:SECONDARY_MODEL,ms:Math.min(Math.max(timeoutMs-15000,4000),8000)}];
  for(const {model,ms} of variants){
    try{
      const out=await runBounded(ai,model,prompt,ms);
      return {plan:validatePlan(extractJson(unwrapResponse(out)),query),status:'ok',model,error:null};
    }catch(e){errors.push(model.split('/').pop()+': '+String(e?.message??e).slice(0,100));}
  }
  return {plan:fallback,status:'fallback',error:'AI解釈に失敗したため、入力全文を検索しました。'+errors.join(' / ')};
}
