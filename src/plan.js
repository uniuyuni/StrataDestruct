export const MODEL = '@cf/zai-org/glm-4.7-flash';

export function basicPlan(query) {
  const q = String(query ?? '').trim().slice(0, 1200);
  if (!q) throw new Error('調べたいことを入力してください');
  return { goal: q, keywords: [q], languages: ['ja', 'en'], sources: ['wikipedia', 'crossref'], constraints: [], unknowns: ['AIによる自由文解釈は実施されていません。入力全文で検索しています'], ai_generated: false };
}

export function extractJson(value) {
  if (typeof value === 'object' && value !== null) return value;
  let s = String(value ?? '').trim().replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AIがJSONを返しませんでした');
  return JSON.parse(s.slice(start, end + 1));
}

export function validatePlan(candidate, query) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('無効なAI計画');
  const clean = (values, max) => Array.isArray(values) ? values.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 200)).filter(Boolean).slice(0, max) : [];
  const keywords = clean(candidate.keywords, 8);
  if (!keywords.length) throw new Error('検索語を作成できませんでした');
  const allowed = ['wikipedia', 'crossref'];
  const sources = clean(candidate.sources, 3).filter(s => allowed.includes(s));
  return {
    goal: typeof candidate.goal === 'string' ? candidate.goal.slice(0, 300) : query,
    keywords, languages: clean(candidate.languages, 3),
    sources: sources.length ? sources : allowed,
    constraints: clean(candidate.constraints, 10),
    unknowns: clean(candidate.unknowns, 8),
    ai_generated: true
  };
}

export function unwrapResponse(output) {
  if (output?.choices?.[0]?.message?.content) return output.choices[0].message.content;
  if (output?.response !== undefined) return output.response;
  if (output?.result?.choices?.[0]?.message?.content) return output.result.choices[0].message.content;
  if (output?.result?.response !== undefined) return output.result.response;
  return output;
}

export async function createPlan(query, ai, {timeoutMs=10000}={}) {
  const fallback = basicPlan(query);
  if (!ai?.run) return {plan:fallback,status:'unavailable',error:'Workers AIが設定されていません'};
  const prompt = [
    'あなたはStrata Destructの情報調査プランナー。どんなテーマでも自由文を解釈する。',
    'JSONのみ返す。キー goal(string),keywords(string[] 最大8),languages(string[]),sources(string[] Wikipediaはwikipedia、論文はcrossrefのみ),constraints(string[]),unknowns(string[])。',
    '検索語は自然で簡潔に、異表記と英訳を考慮。事実や出典を創作しない。原文の制約を落とさない。',
    '入力:',query
  ].join('\n');
  let timer;
  try {
    const timeout = new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Workers AI応答が'+timeoutMs+'msを超えた')),timeoutMs)});
    const output = await Promise.race([
      ai.run(MODEL, {
        messages:[{role:'user',content:prompt}],
        max_completion_tokens:600,
        temperature:0.1,
        chat_template_kwargs:{enable_thinking:false},
        response_format:{type:'json_object'}
      }),
      timeout
    ]);
    return {plan:validatePlan(extractJson(unwrapResponse(output)),query),status:'ok',error:null};
  }catch(e){
    return {plan:fallback,status:'fallback',error:'AIによる解釈が完了せず、入力全文で検索します: '+String(e?.message??e).slice(0,180)};
  }finally{clearTimeout(timer);}
}
