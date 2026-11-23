import { basicPlan, createPlan } from './plan.js';
import { searchSources } from './providers.js';

const HEADERS = {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff'};
const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return respond({app:'Strata Destruct',version:'0.5.0-dev', ai_binding: Boolean(env?.AI), status:'ok'});
    if (url.pathname === '/api/search' && request.method === 'POST') {
      let payload;
      try { payload = await request.json(); }
      catch { return respond({error:'JSONリクエストが不正です'},400); }
      const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
      if (!query || query.length > 1200) return respond({error:'検索文は1〜1200文字にしてください'},400);
      try {
        // Free tier AI inference is allowed. External paid API integrations intentionally absent.
        const parsed = await createPlan(query, env?.AI);
        const findings = await searchSources(parsed.plan);
        return respond({
          query, mode: 'free_only', plan: parsed.plan, ai_status: parsed.status,
          ai_error: parsed.error, records: findings.records, sources: findings.reports,
          caveat:'検索索引・メタデータのみ確認済み。原資料本文は未検証であり、新発見を意味しません。'
        });
      } catch (e) {
        return respond({error:'検索処理が失敗しました', detail:String(e?.message ?? e).slice(0,160)},502);
      }
    }
    if (url.pathname.startsWith('/api/')) return respond({error:'Not found'},404);
    return env.ASSETS.fetch(request);
  }
};
