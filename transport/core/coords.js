/* Holztransport demo · coordinates. Parses the coordinate strings that appear on German stack lists (DMS, decimal
   degrees, UTM 32/33, Gauss-Krüger zones 2–5), validates them (axis order, ranges, Germany, issuer region) and never
   repairs silently: a malformed string yields verdicts and, where one exists, a suggestion that must be approved
   (SPEC §6). Raw strings are always kept beside the parsed result. */
'use strict';
(function(){
const GERMANY={latMin:47.2,latMax:55.1,lonMin:5.8,lonMax:15.1};
const D2R=Math.PI/180,R2D=180/Math.PI;
const ELLIPSOIDS={grs80:{a:6378137,f:1/298.257222101},bessel:{a:6377397.155,f:1/299.1528128},wgs84:{a:6378137,f:1/298.257223563}};
/* Transverse Mercator inverse (Snyder 1987, 8-17 … 8-25). */
function tmInverse(E,N,{a,f},k0,fe,fn,lon0){
  const e2=2*f-f*f,ep2=e2/(1-e2),M=(N-fn)/k0,mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
  const s=Math.sin(phi1),c=Math.cos(phi1),t=Math.tan(phi1),N1=a/Math.sqrt(1-e2*s*s),T1=t*t,C1=ep2*c*c,R1=a*(1-e2)/Math.pow(1-e2*s*s,1.5),D=(E-fe)/(N1*k0);
  const lat=phi1-(N1*t/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon=lon0*D2R+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/c;
  return {lat:lat*R2D,lon:lon*R2D};
}
function geodeticToXYZ(lat,lon,h,{a,f}){const e2=2*f-f*f,s=Math.sin(lat*D2R),N=a/Math.sqrt(1-e2*s*s);return [(N+h)*Math.cos(lat*D2R)*Math.cos(lon*D2R),(N+h)*Math.cos(lat*D2R)*Math.sin(lon*D2R),(N*(1-e2)+h)*s];}
function xyzToGeodetic([x,y,z],{a,f}){const e2=2*f-f*f,b=a*(1-f),ep2=(a*a-b*b)/(b*b),p=Math.hypot(x,y),th=Math.atan2(z*a,p*b);const lat=Math.atan2(z+ep2*b*Math.sin(th)**3,p-e2*a*Math.cos(th)**3);return {lat:lat*R2D,lon:Math.atan2(y,x)*R2D};}
/* DHDN (Bessel, Gauss-Krüger) → ETRS89/WGS84: 7-parameter Helmert (BeTA2007-class mean values for Germany; metre-level,
   good enough to place a pin for review — the reviewed location is what counts). */
const DHDN_TO_ETRS={dx:598.1,dy:73.7,dz:418.2,rx:0.202,ry:0.045,rz:-2.455,ds:6.7};
function helmert([x,y,z],p){const s=1+p.ds*1e-6,rx=p.rx/3600*D2R,ry=p.ry/3600*D2R,rz=p.rz/3600*D2R;return [p.dx+s*(x-rz*y+ry*z),p.dy+s*(rz*x+y-rx*z),p.dz+s*(-ry*x+rx*y+z)];}
function utmToWgs84(zone,E,N){return tmInverse(E,N,ELLIPSOIDS.grs80,0.9996,500000,0,zone*6-183);}
function gkToWgs84(zone,R,H){const g=tmInverse(R,H,ELLIPSOIDS.bessel,1,zone*1e6+500000,0,zone*3);return xyzToGeodetic(helmert(geodeticToXYZ(g.lat,g.lon,0,ELLIPSOIDS.bessel),DHDN_TO_ETRS),ELLIPSOIDS.grs80);}
function haversineKm(lat1,lon1,lat2,lon2){const dl=(lat2-lat1)*D2R,dn=(lon2-lon1)*D2R,a=Math.sin(dl/2)**2+Math.cos(lat1*D2R)*Math.cos(lat2*D2R)*Math.sin(dn/2)**2;return 2*6371*Math.asin(Math.sqrt(a));}
const inGermany=(lat,lon)=>lat>=GERMANY.latMin&&lat<=GERMANY.latMax&&lon>=GERMANY.lonMin&&lon<=GERMANY.lonMax;
const num=s=>{const t=String(s).trim().replace(/\s/g,'');if(!/^[-+]?\d+([.,]\d+)?$/.test(t))return null;return Number(t.replace(',','.'));};
const DMS_RE=/^\s*([NSEOW])?\s*(\d{1,3})\s*[°º]\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:['′’]\s*(\d{1,5}(?:[.,]\d+)?)\s*(?:["″”]|'')?)?\s*([NSEOW])?\s*$/i;
function parseDms(raw){
  const m=String(raw).match(DMS_RE);if(!m)return {ok:false,reason:'no-dms'};
  const deg=Number(m[2]),min=Number(m[3].replace(',','.')),sec=m[4]!=null?Number(m[4].replace(',','.')):0,hemi=(m[1]||m[5]||'').toUpperCase();
  const problems=[];if(min>=60)problems.push('minutes-range');if(sec>=60)problems.push('seconds-range');
  const sign=/[SW]/.test(hemi)?-1:1;const value=sign*(deg+min/60+sec/3600);
  const out={ok:problems.length===0,deg,min,sec,hemi,value,problems,raw:String(raw).trim()};
  if(problems.includes('seconds-range')&&sec/100<60&&min<60)out.suggestion={value:sign*(deg+min/60+(sec/100)/3600),note:'Sekundenwert ÷ 100',sec:sec/100};
  return out;
}
/* parse(x, y, {region}) — x = easting/longitude column, y = northing/latitude column. A single string with both parts
   can be passed as x alone. Returns {ok, format, crs, lat, lon, raw, verdicts[], suggestion|null}. */
function parse(x,y,opts={}){
  const raw={x:x==null?'':String(x).trim(),y:y==null?'':String(y).trim()};
  const verdicts=[];const push=(code,level,message)=>verdicts.push({code,level,message});
  if(!raw.x&&!raw.y){push('none','block','Keine Koordinate gedruckt');return {ok:false,format:null,crs:null,lat:null,lon:null,raw,verdicts,suggestion:null};}
  let parts=[raw.x,raw.y].filter(Boolean);
  if(parts.length===1){const s=parts[0];let sp;
    if(s.includes('°'))sp=s.split(/(?<=["″”])\s*[,;/]?\s*(?=[NSEOW]?\s*\d)/);
    else if(/^[-+]?\d+[.,]\d+\s*[;/|]\s*[-+]?\d+[.,]\d+$/.test(s))sp=s.split(/\s*[;/|]\s*/);          // "48,12; 9,55"
    else if(/^[-+]?\d+[.,]\d+\s+[-+]?\d+[.,]\d+$/.test(s))sp=s.split(/\s+/);                         // "48,12 9,55" · "48.12 9.55"
    else if(/^[-+]?\d+\.\d+\s*,\s*[-+]?\d+\.\d+$/.test(s))sp=s.split(/\s*,\s*/);                   // "48.12, 9.55"
    else sp=s.split(/\s{2,}|\s(?=\d{6,7}$)|[;/]\s*/);
    if(sp.length===2)parts=sp.map(t=>t.trim());}
  if(parts.length!==2){push('unknown-format','block','Koordinate nicht als Paar erkennbar');return {ok:false,format:'unknown',crs:null,lat:null,lon:null,raw,verdicts,suggestion:null};}
  let result;
  if(parts.some(p=>/[°º]/.test(p))){
    const a=parseDms(parts[0]),b=parseDms(parts[1]);
    if(a.reason||b.reason){push('unknown-format','block','Grad/Minuten/Sekunden nicht lesbar');return {ok:false,format:'dms',crs:'EPSG:4326',lat:null,lon:null,raw,verdicts,suggestion:null};}
    // Which is latitude? Hemisphere letters first, then degree ranges (Germany: lat 47–55, lon 5–15).
    let lonP=a,latP=b;if(/[NS]/.test(a.hemi)||/[EOW]/.test(b.hemi)||(a.deg>=47&&a.deg<=55&&b.deg<=15)){lonP=b;latP=a;if(!(a.hemi||b.hemi))push('axis-order-assumed','info','Achsenreihenfolge geprüft: erster Wert ist der Breitengrad');}
    for(const p of [lonP,latP])for(const pr of p.problems)push(pr,'block',pr==='seconds-range'?`Sekundenwert ${p.sec} ≥ 60 in „${p.raw}“`:`Minutenwert ${p.min} ≥ 60 in „${p.raw}“`);
    result={format:'dms',crs:'EPSG:4326',lat:latP.value,lon:lonP.value,ok:lonP.ok&&latP.ok};
    if(!result.ok&&(lonP.suggestion||latP.suggestion)&&(lonP.ok||lonP.suggestion)&&(latP.ok||latP.suggestion)){
      const lat=latP.suggestion?latP.suggestion.value:latP.value,lon=lonP.suggestion?lonP.suggestion.value:lonP.value;
      if(inGermany(lat,lon))result.suggestion={lat,lon,note:'Mögliche Lesart: '+[lonP.suggestion,latP.suggestion].filter(Boolean).map(s=>s.note).join(', ')+' ergibt eine plausible Lage. Bestätigung erforderlich.'};
    }
  } else {
    const m0=parts[0].match(/^(\d{2})\s*([C-X])\s*(\d{6,7})(?:\s+(\d{7}))?$/i);
    let xs=parts[0],ys=parts[1];let zone=null;
    if(m0){zone=Number(m0[1]);xs=m0[3];ys=m0[4]||parts[1];}
    xs=xs.replace(/^[EeRr]\s*/,'');ys=ys.replace(/^[NnHh]\s*/,'');
    const xn=num(xs),yn=num(ys);
    if(xn==null||yn==null){push('unknown-format','block','Koordinate nicht numerisch lesbar');return {ok:false,format:'unknown',crs:null,lat:null,lon:null,raw,verdicts,suggestion:null};}
    const isDeg=v=>Math.abs(v)<=180&&/[.,]\d{3,}/.test(String(v).includes('.')?String(v):'')||(Math.abs(v)<=180&&(String(xs).includes(',')||String(xs).includes('.')));
    if(Math.abs(xn)<=180&&Math.abs(yn)<=90&&(String(xs).match(/[.,]/)||String(ys).match(/[.,]/))){
      let lon=xn,lat=yn;
      if(!inGermany(lat,lon)&&inGermany(lon,lat)){push('axis-order-assumed','info','Reihenfolge als Breite/Länge gelesen (erster Wert ist der Breitengrad); Lage vor der Freigabe bestätigen');result={format:'dd',crs:'EPSG:4326',lat:lon,lon:lat,ok:true};}
      else result={format:'dd',crs:'EPSG:4326',lat,lon,ok:true};
    } else if(/^\d{7}$/.test(xs)&&/^[2-5]/.test(xs)&&/^\d{7}$/.test(ys)&&yn>5100000&&yn<6200000){
      const z=Number(xs[0]);const g=gkToWgs84(z,xn,yn);result={format:'gk',crs:'EPSG:3146'+(z+4),lat:g.lat,lon:g.lon,ok:true};push('crs-assumed','info',`Gauß-Krüger Zone ${z} (DHDN) angenommen; Lage gegen die Karte prüfen`);
    } else if(/^\d{6,7}$/.test(xs)&&/^\d{7}$/.test(ys)&&xn>=100000&&xn<=999999&&yn>5100000&&yn<6200000){
      const z=zone||(opts.region&&opts.region.lon>=12?33:32);const g=utmToWgs84(z,xn,yn);result={format:'utm',crs:'EPSG:258'+z,lat:g.lat,lon:g.lon,ok:true};if(!zone)push('crs-assumed','info',`UTM Zone ${z} (ETRS89) angenommen; Lage gegen die Karte prüfen`);
    } else {push('unknown-format','block','Zahlenpaar passt zu keinem bekannten Koordinatensystem (WGS84, UTM 32/33, GK 2–5)');return {ok:false,format:'unknown',crs:null,lat:null,lon:null,raw,verdicts,suggestion:null};}
  }
  if(result.ok){
    if(!inGermany(result.lat,result.lon)){push('outside-germany','block',`Lage ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)} liegt außerhalb Deutschlands`);result.ok=false;}
    else if(opts.region){const d=haversineKm(result.lat,result.lon,opts.region.lat,opts.region.lon);if(d>(opts.region.radiusKm||50))push('far-from-region','warn',`${Math.round(d)} km vom Revier/Kundengebiet entfernt`);}
  }
  if(result.ok&&!verdicts.some(v=>v.level!=='info'))push('ok','ok','Koordinate plausibel');
  return {ok:result.ok,format:result.format,crs:result.crs,lat:result.ok?result.lat:null,lon:result.ok?result.lon:null,raw,verdicts,suggestion:result.suggestion||null};
}
function formatDms(lat,lon,digits=1){const f=(v,pos,neg)=>{const h=v<0?neg:pos;v=Math.abs(v);const d=Math.floor(v),m=Math.floor((v-d)*60),s=((v-d)*3600-m*60);return `${String(d).padStart(2,'0')}° ${String(m).padStart(2,'0')}' ${s.toFixed(digits).replace('.',',')}" ${h}`;};return `${f(lat,'N','S')} · ${f(lon,'E','W')}`;}
const api={GERMANY,parse,parseDms,utmToWgs84,gkToWgs84,haversineKm,inGermany,formatDms};
(globalThis.TransportCore=globalThis.TransportCore||{}).coords=api;
if(typeof module!=='undefined')module.exports=api;
})();
