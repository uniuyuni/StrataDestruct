// Geography is a separate deterministic gate, not an AI judgment.
export function distanceKm(a,b){const r=Math.PI/180;const x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(x)));}
export function coordinates(s){const m=String(s).match(/Coordinates:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;}
export function scope(query){
 const q=String(query??'').normalize('NFKC');
 const station=q.match(/([\p{Script=Han}\p{Script=Katakana}A-Za-z0-9・ヶケ]{1,30}駅)\s*(?:から|発|を起点|起点|出発)/u);
 if(!station)return null;
 const after=q.slice(station.index+station[0].length);
 const duration=after.match(/(\d+)\s*時間(?:\s*(?:(\d+)\s*分|(半)))?|(\d+)\s*分/);
 if(!duration)return null;
 const minutes=duration[1]?Number(duration[1])*60+Number(duration[2]??(duration[3]?30:0)):Number(duration[4]);
 if(minutes<=0||minutes>1440)return null;
 return {origin:station[1],minutes,transit:/公共交通|電車|鉄道|バス|乗換|乗り換え/.test(q)};
}
export function gate(origin,point,minutes){if(!origin||!point)return {status:'unknown',km:null};const km=distanceKm(origin,point);return {status:km>minutes*2?'excluded':'nearby_unverified',km:Math.round(km*10)/10};}
export async function geocode(name,fetcher=fetch){
 const u=new URL('https://msearch.gsi.go.jp/address-search/AddressSearch');u.searchParams.set('q',name);
 try{const r=await fetcher(u,{signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const a=await r.json();const p=a.find(x=>x.properties?.title?.includes(name));if(!p)return null;return {lat:p.geometry.coordinates[1],lon:p.geometry.coordinates[0],name:p.properties.title};}catch{return null;}
}
export async function originFor(s,fetcher=fetch){
 if(!s)return null;
 // Explicitly identified station alias; no candidate places are preloaded.
 if(/^(?:JR)?山手駅$/.test(s.origin))return {name:'JR山手駅（横浜市中区）',lat:35.427222,lon:139.646194,source:'station_reference'};
 return geocode(s.origin,fetcher);
}
export function localize(records,origin,minutes){
 return records.map(r=>{const point=coordinates(r.snippet);const geo=gate(origin,point,minutes);return {...r,point,geo};});
}
export function routeLink(origin,name){const u=new URL('https://www.google.com/maps/dir/');u.searchParams.set('api','1');u.searchParams.set('origin',origin);u.searchParams.set('destination',name);u.searchParams.set('travelmode','transit');return u.href;}
