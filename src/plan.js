export const MODEL = '@cf/zai-org/glm-4.7-flash';

export function basicPlan(query) {
  const q = String(query ?? '').trim().slice(0, 1200);
  if (!q) throw new Error('調べたいことを入力してください');
  return { goal: q, keywords: [q], languages: ['ja', 'en'], sources: ['wikipedia', 'crossref'], constraints: [], unknowns: ['利用可能な索引だけを検索しています。条件の完全な解釈は未実施です'], ai_generated: false };
}

export function extractJson(value) {
  if (typeof value === 'object' && value !== null) return value;
  let s = String(value ?? '').trim().replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
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

export async function createPlan(query, ai) {
  const fallback = basicPlan(query);
  if (!ai?.run) return { plan: fallback, status: 'unavailable', error: 'Workers AIが設定されていません' };
  const prompt = [
    'あなたはStrata Destructの情報発掘プランナーです。',
    'ユーザー入力を歪めず、自由文の目的・制約・検索語を解釈してください。',
    '必ずJSONオブジェクトだけを返してください。',
    'キー: goal(string), keywords(string[] 最大8), languages(string[]), sources(string[] wikipedia/crossref のみ), constraints(string[]), unknowns(string[])。',
    '地理や技術に偏らずテーマに適切な検索語と英訳を考えてください。事実や引用を捏造しないでください。',
    '入力:', query
  ].join('\n');
  try {
    const output = await ai.run(MODEL, {
      messages: [{role: 'user', content: prompt}],
      max_tokens: 1200,
      temperature: 0.15,
      response_format: {type: 'json_object'}
    });
    const response = output?.response ?? output?.result?.response ?? output?.result ?? output;
    return { plan: validatePlan(extractJson(response), query), status: 'ok', error: null };
  } catch (e) {
    return { plan: fallback, status: 'fallback', error: 'AIによる解釈に失敗したため、入力全文を無料検索します: ' + String(e?.message ?? e).slice(0, 180) };
  }
}
