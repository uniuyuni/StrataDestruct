import test from 'node:test';import assert from 'node:assert/strict';import {treeIntent,discoveryPlan,buildPlaceResults} from '../src/place-results.js';
const query='明日見頃のプラタナスの木が少なくとも10本あるところ。山手駅から１時間の範囲内で公共交通機関利用';
const origin={name:'JR山手駅（横浜市中区）',lat:35.42683,lon:139.64691};
test('extract target and number without fixed vocabulary',()=>{assert.equal(treeIntent(query).minimum,10);assert.equal(treeIntent('ケヤキの木が5本あるところ').target,'ケヤキ');const p=discoveryPlan(query,origin,treeIntent(query),new Date('2026-11-24T02:00:00Z'));assert.equal(p.target_date,'2026-11-25');assert.ok(p.search_queries.every(x=>x.includes('横浜市')));});
test('source cards exclude faraway locations and generic species, never confirm count or transit',async()=>{
 const r=await buildPlaceResults(query,[
 {id:'a',title:'プラタナス広場',url:'https://example.com/a',snippet:'プラタナス広場\nName: プラタナス広場 Category: Park Address: Yokohama Coordinates: 35.3775756, 139.6315477'},
 {id:'b',title:'北3条通りのプラタナス並木',url:'https://example.com/b',snippet:'Name: 北3条通りのプラタナス並木 Category: Park Address: Hokkaido Coordinates: 43.2074742, 141.7569938'},
 {id:'c',title:'街路樹の種類 横浜市',url:'https://example.com/c',snippet:'横浜市 プラタナス'},
 {id:'d',title:'富岡総合公園公式サイト',url:'https://example.com/d',snippet:'横浜市 プラタナス（スズカケノキ）の木々が特徴的です。'}
 ],origin);
 assert.equal(r.status,'evidence_candidates');assert.equal(r.candidates.length,2);
 assert.ok(r.candidates.every(c=>c.checks.every(k=>k.status==='unknown')));
 assert.ok(r.candidates.every(c=>c.checks[0].evidence.length));
});
test('empty source results are not manufactured',async()=>{const r=await buildPlaceResults(query,[],origin);assert.equal(r.candidates.length,0);});
