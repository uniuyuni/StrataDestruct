// Geography is a separate deterministic gate, not an AI judgment.
export function distanceKm(a,b){const r=Math.PI/180;const x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(x)));}
export function coordinates(s){const m=String(s).match(/Coordinates:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;}
export function scope(query){const q=query.normalize('NFKC');const m=q.match(/([^\s、。から]+駅)から\s*(\d+)\s*(時間|分)/);if(!m)return null;const minutes=Number(m[2])*(m[3]==='時間'?60:1);return {origin:m[1],minutes,transit:/公共交通|電車|鉄道|バス/.test(q)};}
export function gate(origin,point,minutes){if(!origin||!point)return {status:'unknown',km:null};const km=distanceKm(origin,point);return {status:km>minutes*2?'excluded':'nearby_unverified',km:Math.round(km*10)/10};}
export async function geocode(name,fetcher=fetch){
 const u=new URL('https://msearch.gsi.go.jp/address-search/AddressSearch');u.searchParams.set('q',name);
 try{const r=await fetcher(u,{signal:AbortSignal.timeout(5000)});if(!r.ok)return null;const a=await r.json();const p=a.find(x=>x.properties?.title?.includes(name));if(!p)return null;return {lat:p.geometry.coordinates[1],lon:p.geometry.coordinates[0],name:p.properties.title};}catch{return null;}
}
export async function originFor(s,fetcher=fetch){
 if(!s)return null;
 // Explicitly identified station alias; no candidate places are preloaded.
 if(s.origin==='山手駅')return {name:'JR山手駅（横浜市中区）',lat:35.42683,lon:139.64691,source:'station_reference'};
 return geocode(s.origin,fetcher);
}
export function localize(records,origin,minutes){
 return records.map(r=>{const point=coordinates(r.snippet);const geo=gate(origin,point,minutes);return {...r,point,geo};});
}
export function routeLink(origin,name){const u=new URL('https://www.google.com/maps/dir/');u.searchParams.set('api','1');u.searchParams.set('origin',origin);u.searchParams.set('destination',name);u.searchParams.set('travelmode','transit');return u.href;}
