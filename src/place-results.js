import {scope,originFor,coordinates,gate,routeLink} from './geo.js';

// Extract an explicitly named tree, without a closed vocabulary of tree species.
export function treeIntent(query){
 const q=query.normalize('NFKC');
 const match=q.match(/([\p{Script=Katakana}ー]{2,30}|[\p{Script=Han}]{1,12}|[A-Za-z][A-Za-z -]{1,35})(?:の木|の樹木|の並木)/u);
 if(!match)return null;
 const target=match[1], n=q.match(/(\d+)\s*本/);
 const aliases={プラタナス:['スズカケノキ','モミジバスズカケノキ','Platanus'],イチョウ:['銀杏','Ginkgo']};
 return {target,terms:[target,...(aliases[target]??[])],minimum:n?Number(n[1]):null,season:/見頃|紅葉|黄葉|開花|満開/.test(q)};
}
export function discoveryPlan(query,origin,intent,now=new Date()){
 const region=origin?.name?.match(/横浜市|[^\s（(]{2,12}市/)?.[0]??origin?.name??'';
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now.getTime()+(/明日/.test(query)?86400000:0)));
 const t=intent.terms[0],alt=intent.terms[1]??t;
 return {goal:query,keywords:intent.terms,search_queries:[
  region+' '+t+' 公園 並木 広場',
  region+' 周辺 '+alt+' 植栽 本数 樹木マップ',
  region+' '+t+' '+date.slice(5,7)+'月 公園 紅葉 黄葉',
  region+' '+alt+' 樹木 公園 管理者 散策'
 ],constraints:[...(intent.minimum?[intent.minimum+'本以上']:[]),...(intent.season?['対象日 '+date+' の見頃']:[]),'起点 '+origin?.name, '公共交通 '+scope(query)?.minutes+'分以内'],sources:['web'],target_date:date,ai_generated:false};
}
const norm=s=>String(s??'').normalize('NFKC').toLowerCase();
const contains=(text,terms)=>terms.some(t=>norm(text).includes(norm(t)));
function excerpt(r,terms){
 const text=String(r.snippet??'');
 const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
 const matching=lines.filter(x=>contains(x,terms));
 const substantive=matching.filter(x=>/木々|樹木|植栽|植え|並木|高木|本の木|大木|紅葉|黄葉|葉が|\d+\s*本/.test(x)&&!/^Name:/.test(x));
 return (substantive[0]??matching[0]??text).slice(0,240);
}
function sourceName(r){
 const text=String(r.snippet??'');
 const n=text.match(/(?:^|\n)\s*Name:\s*([^\n]+?)(?=\s+Category:|\s+Address:|\n|$)/i);
 if(n&&coordinates(text))return n[1].trim().slice(0,100);
 // Accept actual site names in the title, not species or article headings alone.
 const title=String(r.title??'');
 if(/街路樹の種類|街路樹による|街路樹ハンドブック|紅葉スポット|おすすめ|ランキング|始発検索|終電検索|乗換案内|一覧/.test(title))return null;
 const names=title.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・ヶケ]{2,35}(?:公園|緑地|庭園|植物園|並木道|並木|広場|遊歩道|通り)/gu)??[];
 return names.find(x=>!/(?:の|みどころ|紹介|へのアクセス)$/.test(x)&&!/^街路樹|^紅葉|^観光/.test(x))??null;
}
function locationHint(r,origin){
 const text=String(r.title??'')+'\n'+String(r.snippet??'')+'\n'+String(r.url??'');
 const city=origin?.name?.match(/横浜市|[^\s（(]{2,12}市/)?.[0];
 if(city==='横浜市'){
  if(/北海道|岩見沢|大阪府|吹田市|岐阜県|飛騨高山|高山市|Hokkaido|Osaka|Iwamizawa|Takayama/i.test(text))return false;
  return /横浜|神奈川|川崎|横須賀|鎌倉|逗子|Yokohama|Kanagawa|Kawasaki|Yokosuka|Kamakura|Zushi|hama-midorinokyokai\.or\.jp/i.test(text);
 }
 return city?text.includes(city):false;
}
export async function buildPlaceResults(query,records,originOverride){
 const spatial=scope(query),intent=treeIntent(query);
 if(!spatial||!intent)return null;
 const origin=originOverride??await originFor(spatial);
 const groups=new Map();
 for(const r of records){
  if(!r?.snippet||!contains(r.title+' '+r.snippet,intent.terms))continue;
  const name=sourceName(r);
  if(!name||name===intent.target||name===spatial.origin||!contains(r.title+' '+r.snippet,[name]))continue;
  const point=coordinates(r.snippet),geo=gate(origin,point,spatial.minutes);
  if(geo.status==='excluded'||(!point&&!locationHint(r,origin)))continue;
  if(!groups.has(name))groups.set(name,{name,records:[],point:null,geo:{status:'unknown',km:null}});
  const g=groups.get(name);g.records.push(r);if(point){g.point=point;g.geo=geo;}
 }
 const candidates=[...groups.values()].map(g=>{
  const ev=g.records.slice(0,3).map(r=>({id:r.id,title:r.title,url:r.url,quote:excerpt(r,intent.terms),published_at:r.published_at??null}));
  const substantive=ev.filter(e=>/木々|樹木|植栽|植え|高木|本の木|大木|紅葉|黄葉|葉が|\d+\s*本/.test(e.quote)&&!/^Name:/.test(e.quote));
  const official=g.records.some(r=>/\.lg\.jp\/|hama-midorinokyokai\.or\.jp\//.test(r.url));
  const countEvidence=ev.filter(e=>contains(e.quote,intent.terms)&&/\d+\s*本/.test(e.quote.normalize('NFKC')));
  const checks=[{condition:intent.target+'の存在',status:'unknown',detail:substantive.length?'樹木の描写がある資料を取得。記録時点の情報であり現在は未確認。':'名称が一致するだけで、樹木の存在は未確認。',evidence:ev}];
  if(intent.minimum)checks.push({condition:intent.minimum+'本以上',status:'unknown',detail:countEvidence.length?'本数の記載候補あり。総数が'+intent.minimum+'本以上とは確認できていません。':'本数を裏付ける資料は未取得。',evidence:countEvidence});
  if(intent.season)checks.push({condition:'指定日の見頃',status:'unknown',detail:'対象日・対象樹種の色づきは未確認。',evidence:[]});
  checks.push({condition:'公共交通で'+spatial.minutes+'分以内',status:'unknown',detail:'経路未計算。下の経路確認リンクで確認可能。',evidence:[]});
  return {name:g.name,checks,geo:g.geo,point:g.point,status:'unverified',route_url:routeLink(origin?.name??spatial.origin,g.point?g.point.lat+','+g.point.lon:g.name),next_queries:[],source_count:g.records.length,substantive_count:substantive.length,official_source:official};
 }).filter(c=>c.substantive_count>0).sort((a,b)=>Number(b.official_source)-Number(a.official_source)||b.substantive_count-a.substantive_count||b.source_count-a.source_count||(a.geo.km??Infinity)-(b.geo.km??Infinity)).slice(0,8);
 return {status:candidates.length?'evidence_candidates':'no_grounded_candidates',candidates,notice:'実資料から抽出した候補です。全条件の確認済み候補は0件です。',confirmed_count:0};
}

export function focusedSourceQueries(intent,origin){
 const region=origin?.name?.match(/横浜市|[^\s（(]{2,12}市/)?.[0]??origin?.name??'';
 // Regional source registry: publisher domains only, never stored candidate locations.
 const publishers={'横浜市':['hama-midorinokyokai.or.jp/park/','city.yokohama.lg.jp']};
 const domains=publishers[region]??[];
 return {objective:region+'の実在する公園・並木を探す。対象樹種は'+intent.terms.join('、')+'。各公園の公式管理者が樹木そのものについて説明したページや現地記録を優先。自治体全体の樹木一覧や駅のページは不要。個別公園名をタイトルに含み、対象樹種の説明部分を抽出する。',
 queries:domains.length?[...domains.flatMap(domain=>intent.terms.slice(0,2).map(t=>'site:'+domain+' "'+t+'" 公園'))].slice(0,4):intent.terms.slice(0,2).map(t=>region+' "'+t+'" 公園 管理者 ブログ')};
}
