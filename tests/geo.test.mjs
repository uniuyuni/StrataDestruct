import test from 'node:test';import assert from 'node:assert/strict';import {scope,gate,coordinates,localize,originFor} from '../src/geo.js';
test('fullwidth time and origin parsed',()=>assert.deepEqual(scope('明日見頃のプラタナス。山手駅から１時間の範囲内で公共交通機関利用'),{origin:'山手駅',minutes:60,transit:true}));
test('Hokkaido and Osaka excluded; Yokohama not automatically confirmed',async()=>{const o=await originFor({origin:'山手駅'});assert.equal(gate(o,{lat:43.2074742,lon:141.7569938},60).status,'excluded');assert.equal(gate(o,{lat:34.81,lon:135.53},60).status,'excluded');assert.equal(gate(o,{lat:35.3775756,lon:139.6315477},60).status,'nearby_unverified');assert.equal(gate(o,null,60).status,'unknown');});
test('coordinates extracted only from actual source fields',()=>{assert.deepEqual(coordinates('Coordinates: 35.3775756, 139.6315477'),{lat:35.3775756,lon:139.6315477});assert.equal(coordinates('35.4 139.6'),null);});

test('transport wording can precede time',()=>{assert.deepEqual(scope('JR山手駅から公共交通機関で１時間以内'),{origin:'JR山手駅',minutes:60,transit:true});assert.equal(scope('山手駅発、電車で1時間30分以内').minutes,90);});
