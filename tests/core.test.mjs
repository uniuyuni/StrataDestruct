import test from 'node:test';
import assert from 'node:assert/strict';
import { basicPlan, validatePlan, createPlan, extractJson } from '../src/plan.js';
import { wikipedia, crossref, searchSources } from '../src/providers.js';

test('natural language is not filtered by a fixed keyword dictionary', () => {
  const query='消えた灯台の古い記録と、その技術が海外の測量に与えた影響を探す';
  assert.equal(basicPlan(query).keywords[0],query);
});

test('blank query fails', () => assert.throws(()=>basicPlan('   ')));

test('AI JSON parse and schema validation', () => {
  const value=extractJson('Some text ```json\n{"goal":"研究","keywords":["old maps","古地図"],"sources":["crossref"]}\n```');
  const plan=validatePlan(value,'古地図');
  assert.equal(plan.keywords.length,2);
  assert.deepEqual(plan.sources,['crossref']);
});

test('unknown sources cannot be invoked', () => {
  const p=validatePlan({keywords:['test'],sources:['http://localhost:8080','wikipedia']},'test');
  assert.deepEqual(p.sources,['wikipedia']);
});

test('failed AI retains original free-text query and reports fallback', async () => {
  const r=await createPlan('珍しい形の雲の記録',{run:async()=>{throw Error('quota exceeded')}});
  assert.equal(r.status,'fallback');
  assert.equal(r.plan.keywords[0],'珍しい形の雲の記録');
});

test('AI schema yields structured search keywords', async () => {
  const r=await createPlan('湖の伝承',{run:async()=>({response:'{"goal":"湖","keywords":["湖 伝承","lake folklore"],"sources":["wikipedia","crossref"],"constraints":["日本"],"unknowns":["位置"]}'})});
  assert.equal(r.status,'ok');
  assert.equal(r.plan.keywords[1],'lake folklore');
});

const fakeFetch=async url=>{
  const u=new URL(url);
  if(u.hostname==='ja.wikipedia.org'){
    return {ok:true,json:async()=>({query:{search:[{pageid:123,title:'古い記録',snippet:'<span>実際の索引</span>'}]}})};
  }
  if(u.hostname==='api.crossref.org'){
    return {ok:true,json:async()=>({message:{items:[{DOI:'10.1234/test',title:['測量の歴史']}]}})};
  }
  throw Error('unknown host');
};

test('Wikipedia and Crossref JSON responses normalize to evidence records', async () => {
  const w=await wikipedia('古い記録',fakeFetch);
  const c=await crossref('測量の歴史',fakeFetch);
  assert.equal(w[0].evidence_level,'search_snippet');
  assert.equal(w[0].snippet,'実際の索引');
  assert.equal(c[0].evidence_level,'metadata');
});

test('one failed source does not hide other results', async ()=>{
  const fetcher=async url=>{
    if(String(url).includes('crossref')) throw Error('HTTP 429');
    return fakeFetch(url);
  };
  const r=await searchSources({keywords:['紅葉'],sources:['wikipedia','crossref']},fetcher);
  assert.equal(r.records.length,1);
  assert.equal(r.reports.filter(x=>x.status==='error').length,1);
});
