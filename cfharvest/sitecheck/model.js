/* Hiebsprüfung · Drohne — domain model (cfharvest/SPEC_SITECHECK.md §2–§5).
   A Biodrone-Portal-style drone-image analysis workflow (projects → orthomosaic → AI detection models → hexagon
   statistics → export) applied to the CFHarvest pre-harvest check (Vorprüfung: Hänsyn/Säkerhet/Terrängplanering) and
   the post-harvest audit (Nachprüfung: Slutvärdering). Pure functions over the CFHBridge snapshot; every detection is
   derived deterministically from the game state (stand facts, shift history, incidents), never from a real image.
   Geometry is the game's orthophoto image space (world px); metres are scaled so that the stand polygon equals the
   work order's area (ha). No file is uploaded or analysed: "Befliegung" and "KI-Modell" are demo simulations. */
'use strict';
const CFHSiteCheck=(()=>{
const SCHEMA=1,KEY='cfharvest-sitecheck-v1';
const PHASES={pre:{de:'Vor dem Hieb',cfh:'Vorprüfung',sv:'Förhandsanmälan'},post:{de:'Nach dem Hieb',cfh:'Nachprüfung',sv:'Slutvärdering'}};
/* Flight defaults [DEMO, within the public figures: drone flights up to 200 m, centimetre resolution]. */
const FLIGHT={altitudeM:100,gsdCm:2.7,overlapPct:80,imagesPerHa:62,mbPerImage:38};
const STEM_FM={'Fichte':.9,'Fichte / Kiefer':.8,'Buche':1.3};
/* Pre-trained detection models [DEMO: classes chosen from the Biodrone Portal vocabulary (tree stubs, buffer zones,
   harvest boundary polygons, storm damage) and the CFHarvest work-order tabs (Hänsyn, Säkerhet, Avlägg)]. */
const MODELS=[
  {key:'retention',name:'Habitatbäume',kind:'object',geom:'point',phases:['pre','post'],classes:['Habitatbaum','Höhlenbaum','Hochstubben'],cfh:'Hänsyn',size:'Mittel',version:'3.1',colour:'#ffdf72'},
  {key:'protected',name:'Schutzzonen und Feuchtflächen',kind:'segmentation',geom:'polygon',phases:['pre','post'],classes:['Schutzzone','Feuchtfläche','Horst-Sperrzone','Unerkundete Teilfläche'],cfh:'Hänsyn',size:'Groß',version:'2.4',colour:'#f4a797'},
  {key:'boundary',name:'Hiebsgrenze',kind:'segmentation',geom:'polygon',phases:['pre','post'],classes:['Hiebsgrenze','Abweichung zur Altskizze','Überhieb'],cfh:'Område',size:'Groß',version:'1.8',colour:'#b9d9ec'},
  {key:'access',name:'Rückegassen, Zufahrt und Polterplatz',kind:'object',geom:'line',phases:['pre','post'],classes:['Rückegasse','Zufahrt','Polterplatz','Wendeplatz'],cfh:'Avlägg',size:'Groß',version:'2.0',colour:'#52d5ff'},
  {key:'stumps',name:'Stöcke',kind:'object',geom:'point',phases:['post'],classes:['Stock'],cfh:'Utfört arbete',size:'Klein',version:'4.2',colour:'#ffb36b'},
  {key:'ruts',name:'Fahrspuren und Bodenschäden',kind:'object',geom:'line',phases:['post'],classes:['Fahrspur leicht','Fahrspur mittel','Fahrspur tief'],cfh:'Slutvärdering',size:'Mittel',version:'1.5',colour:'#ff906f'},
  {key:'remnants',name:'Holzreste und Polter',kind:'object',geom:'point',phases:['post'],classes:['Waldlager','Polter'],cfh:'Sortiment',size:'Mittel',version:'2.2',colour:'#d9a066'},
  {key:'damage',name:'Schadholz und Windwurf',kind:'object',geom:'polygon',phases:['pre','post'],classes:['Windwurf','Kronenbruch'],cfh:'Säkerhet',size:'Groß',version:'5.0',colour:'#c77dff'}];
const modelOf=k=>MODELS.find(m=>m.key===k);
const modelsFor=phase=>MODELS.filter(m=>m.phases.includes(phase));

/* ---------- Geometry (world px of the 620×350 orthophoto) ---------- */
const sum=a=>a.reduce((x,y)=>x+y,0);
function polygonArea(p){let a=0;for(let i=0;i<p.length;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length];a+=x1*y2-x2*y1;}return Math.abs(a)/2;}
function pathLength(p){let l=0;for(let i=1;i<p.length;i++)l+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return l;}
function inPolygon([x,y],poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function bbox(p){const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
function centroid(p){return[sum(p.map(q=>q[0]))/p.length,sum(p.map(q=>q[1]))/p.length];}
/** Metres per world px so that the stand polygon equals the order's area (ha) [DEMO scale, the photo is not georeferenced]. */
function metresPerPx(order){const a=polygonArea(order.boundary);const ha=order.areaHa>0?order.areaHa:2;return a>0?Math.sqrt(ha*1e4/a):1.33;}
const r2=n=>Math.round(n*100)/100,r1=n=>Math.round(n*10)/10;
function hash(str){let h=2166136261;for(const c of String(str)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){let a=hash(seed);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/** Deterministic points inside a polygon, at least `gap` px apart, avoiding circles. */
function scatter(poly,n,seed,{gap=4,avoid=[]}={}){
  const r=rng(seed),[x0,y0,x1,y1]=bbox(poly),out=[];let tries=0;
  while(out.length<n&&tries<n*60+200){tries++;const p=[r2(x0+r()*(x1-x0)),r2(y0+r()*(y1-y0))];
    if(!inPolygon(p,poly))continue;if(avoid.some(c=>Math.hypot(p[0]-c.point[0],p[1]-c.point[1])<c.radius))continue;
    if(out.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<gap))continue;out.push(p);}
  return out;
}
function circlePoly(c,r,n=14){const out=[];for(let i=0;i<n;i++){const t=i/n*2*Math.PI;out.push([r2(c[0]+r*Math.cos(t)),r2(c[1]+r*Math.sin(t))]);}return out;}
/** Clip the stand polygon to x < limit (the harvester works the stand in columns from the west: dist/routes.js). */
function clipWest(poly,limit){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=a[0]<=limit,bi=b[0]<=limit;if(ai)out.push(a);if(ai!==bi){const t=(limit-a[0])/(b[0]-a[0]);out.push([r2(limit),r2(a[1]+t*(b[1]-a[1]))]);}}return out;}
const world=(anchor,[x,y])=>[r2(anchor[0]+anchor[2]*x),r2(anchor[1]+anchor[2]*y)];

/* ---------- Site facts from the snapshot ---------- */
function facts(order,snapshot){
  const site=WorksiteRoutes.sites[order.standId],anchor=site.anchor,mpp=metresPerPx(order);
  const harvestRounds=order.events.filter(e=>e.kind==='harvest'),forwardRounds=order.events.filter(e=>e.kind==='forward');
  const total=order.openingStock+order.estimatedVolume,felled=order.stand.felled,fraction=total>0?Math.max(0,Math.min(1,felled/total)):0;
  const [x0,,x1]=bbox(order.boundary),harvested=fraction>=.999?order.boundary:fraction<=0?[]:clipWest(order.boundary,x0+fraction*(x1-x0));
  return{site,anchor,mpp,areaHa:order.areaHa||r2(polygonArea(order.boundary)*mpp*mpp/1e4),harvestRounds,forwardRounds,felled,fraction,harvested,
    harvestedHa:r2(polygonArea(harvested)*mpp*mpp/1e4),harvesterRoute:site.harvester.map(p=>world(anchor,p)),forwarderRoute:site.forwarder.map(p=>world(anchor,p)),
    stemFm:STEM_FM[order.species]||1,soil:snapshot.meta.soil??100,wet:/Feucht/i.test(order.terrain||''),neighbourVolume:order.stand.neighbourVolume||0,
    incident:!!order.closed,surveyGap:Math.max(0,100-(order.surveyCoverage||0))};
}
/* ---------- Detection models (deterministic) ---------- */
const feature=(model,cls,geometry,props={})=>({model:model.key,class:cls,geometry,...props});
function detect(order,snapshot,phase,modelKey){
  const m=modelOf(modelKey);if(!m||!m.phases.includes(phase))return[];
  const f=facts(order,snapshot),seed=`${order.id}:${modelKey}`,mpp=f.mpp,out=[];
  const bioZone=order.bio?{point:order.bio.point,radius:Math.max(9,order.bio.radius)}:null;
  if(modelKey==='retention'){
    const marked=order.bio&&/Habitatbaum/i.test(order.bio.title);
    if(marked)out.push(feature(m,'Habitatbaum',{type:'Point',coordinates:order.bio.point},{confidence:.96,heightM:31,marked:true,code:order.bio.code}));
    const n=Math.max(2,Math.round(f.areaHa*2.4)),pts=scatter(order.boundary,n,seed,{gap:9,avoid:bioZone?[bioZone]:[]}),r=rng(seed+':attr');
    pts.forEach((p,i)=>out.push(feature(m,i%3===0?'Höhlenbaum':i%4===0?'Hochstubben':'Habitatbaum',{type:'Point',coordinates:p},{confidence:r2(.78+r()*.19),heightM:Math.round(18+r()*14),marked:false})));
    if(phase==='post'){ // biotope incident (survey ignored): trees in and around the protected zone are damaged, at least the nearest one
      const dist=x=>bioZone?Math.hypot(x.geometry.coordinates[0]-bioZone.point[0],x.geometry.coordinates[1]-bioZone.point[1]):Infinity,near=f.incident&&bioZone?out.filter(x=>dist(x)<=bioZone.radius*1.8):[];
      if(f.incident&&bioZone&&!near.length&&out.length)near.push(out.reduce((a,x)=>dist(x)<dist(a)?x:a));
      for(const x of out){x.retained=!near.includes(x);if(!x.retained)x.class='Habitatbaum beschädigt';}}
  }
  if(modelKey==='protected'){
    if(order.bio){const cls=/Feucht|Bach/i.test(order.bio.title)?'Feuchtfläche':/Horst/i.test(order.bio.title)?'Horst-Sperrzone':'Schutzzone';
      out.push(feature(m,cls,{type:'Polygon',coordinates:[circlePoly(order.bio.point,bioZone.radius)]},{confidence:.91,code:order.bio.code,areaHa:r2(Math.PI*bioZone.radius**2*mpp*mpp/1e4),title:order.bio.title,violated:phase==='post'&&f.incident}));}
    if(f.surveyGap>0&&order.bio){const ha=f.areaHa*f.surveyGap/100,rad=Math.sqrt(ha*1e4/Math.PI)/mpp;out.push(feature(m,'Unerkundete Teilfläche',{type:'Polygon',coordinates:[circlePoly(order.bio.point,rad,18)]},{confidence:.74,areaHa:r2(ha),surveyGapPct:f.surveyGap}));}
  }
  if(modelKey==='boundary'){
    out.push(feature(m,'Hiebsgrenze',{type:'Polygon',coordinates:[order.boundary]},{confidence:.97,areaHa:f.areaHa,perimeterM:Math.round(pathLength([...order.boundary,order.boundary[0]])*mpp),checked:!!order.boundaryChecked}));
    if(order.standId==='a'&&!order.boundaryChecked)out.push(feature(m,'Abweichung zur Altskizze',{type:'Polygon',coordinates:[[[87,8],[103,10],[103,78],[80,88],[94,78]].map(p=>world(f.anchor,p))]},{confidence:.83,areaHa:r2(polygonArea([[87,8],[103,10],[103,78],[80,88],[94,78]].map(p=>world(f.anchor,p)))*mpp*mpp/1e4),note:'Ostgrenze der Altskizze liegt im Nachbarbestand'}));
    if(phase==='post'&&f.neighbourVolume>0){const perHa=f.areaHa>0?(order.openingStock+order.estimatedVolume)/f.areaHa:300,ha=f.neighbourVolume/perHa,wPx=Math.sqrt(ha*1e4)/mpp;
      const poly=[[87,14],[87+wPx/f.anchor[2]*.9,14],[94+wPx/f.anchor[2]*.9,72],[94,72]].map(p=>world(f.anchor,p));
      out.push(feature(m,'Überhieb',{type:'Polygon',coordinates:[poly]},{confidence:.88,areaHa:r2(ha),volumeFm:f.neighbourVolume,note:'Fällung außerhalb der Hiebsgrenze (Nachbarholz)'}));}
  }
  if(modelKey==='access'){
    const hr=f.harvesterRoute,fr=f.forwarderRoute;
    for(let i=0;i<hr.length-1;i+=2){const seg=[hr[i],hr[i+1]];out.push(feature(m,'Rückegasse',{type:'LineString',coordinates:seg},{confidence:.9,lengthM:Math.round(pathLength(seg)*mpp),index:i/2+1}));}
    out.push(feature(m,'Zufahrt',{type:'LineString',coordinates:fr.slice(0,3)},{confidence:.92,lengthM:Math.round(pathLength(fr.slice(0,3))*mpp)}));
    out.push(feature(m,'Polterplatz',{type:'Point',coordinates:order.landing.point},{confidence:.95,id:order.landing.id,roadsideFm:r1(order.landing.roadside)}));
    out.push(feature(m,'Wendeplatz',{type:'Point',coordinates:fr[1]},{confidence:.81}));
  }
  if(modelKey==='stumps'&&phase==='post'&&f.harvested.length){
    const n=Math.round(f.felled/f.stemFm),pts=scatter(f.harvested,Math.min(n,900),seed,{gap:2.2,avoid:bioZone?[bioZone]:[]}),r=rng(seed+':d');
    pts.forEach(p=>out.push(feature(m,'Stock',{type:'Point',coordinates:p},{confidence:r2(.8+r()*.18),diameterCm:Math.round(28+r()*30)})));
    out.meta={expected:n,shown:pts.length,harvestedHa:f.harvestedHa};
  }
  if(modelKey==='ruts'&&phase==='post'&&f.forwardRounds.length){
    const fr=f.forwarderRoute,share=Math.max(.15,Math.min(1,order.stand.forwarded/Math.max(1,f.felled))),segs=Math.max(1,Math.round((fr.length-1)*share));
    const base=(f.wet?1:0)+(f.soil<70?1:0)+(f.soil<40?1:0)+(f.forwardRounds.length>2?1:0),r=rng(seed+':r');
    for(let i=0;i<segs;i++){const seg=[fr[i],fr[i+1]],sev=Math.min(2,Math.max(0,base-(i%3===0?0:1)));
      out.push(feature(m,['Fahrspur leicht','Fahrspur mittel','Fahrspur tief'][sev],{type:'LineString',coordinates:seg},{confidence:r2(.8+r()*.17),lengthM:Math.round(pathLength(seg)*mpp),depthCm:[6,16,32][sev]+Math.round(r()*4),severity:sev}));}
  }
  if(modelKey==='remnants'&&phase==='post'){
    const stock=order.stand.forestStock,n=stock>.5?Math.ceil(stock/15):0,pts=scatter(f.harvested.length?f.harvested:order.boundary,n,seed,{gap:8,avoid:bioZone?[bioZone]:[]});
    pts.forEach((p,i)=>out.push(feature(m,'Waldlager',{type:'Point',coordinates:p},{confidence:.86,volumeFm:r1(stock/pts.length)})));
    if(order.landing.roadside>.05)out.push(feature(m,'Polter',{type:'Point',coordinates:order.landing.point},{confidence:.93,volumeFm:r1(order.landing.roadside),id:order.landing.id}));
  }
  if(modelKey==='damage'){/* no storm event in the game scenario: the model runs and finds nothing */}
  return out;
}
/** All models of a phase run on an order: { modelKey: features[] }. */
function detectAll(order,snapshot,phase,modelKeys=modelsFor(phase).map(m=>m.key)){const out={};for(const k of modelKeys)out[k]=detect(order,snapshot,phase,k);return out;}
function countByClass(features){const c={};for(const f of features)c[f.class]=(c[f.class]||0)+1;return c;}

/* ---------- Hexagon grid (density statistics) [B-SRC: hexagon aggregates, default cell 1000 m²] ---------- */
function hexGrid(order,sizeM2){
  const mpp=metresPerPx(order),s=Math.max(2,Math.sqrt(2*Math.max(100,sizeM2)/(3*Math.sqrt(3)))/mpp),w=Math.sqrt(3)*s,h=1.5*s,[x0,y0,x1,y1]=bbox(order.boundary),out=[];let row=0;
  for(let cy=y0-s;cy<=y1+s;cy+=h,row++)for(let cx=x0-w+(row%2?w/2:0);cx<=x1+w;cx+=w){
    const pts=[];for(let i=0;i<6;i++){const t=Math.PI/180*(60*i-30);pts.push([r2(cx+s*Math.cos(t)),r2(cy+s*Math.sin(t))]);}
    if(pts.some(p=>inPolygon(p,order.boundary))||inPolygon([cx,cy],order.boundary))out.push({id:`h${out.length}`,cx:r2(cx),cy:r2(cy),points:pts,inside:inPolygon([cx,cy],order.boundary),areaHa:r2(3*Math.sqrt(3)/2*s*s*mpp*mpp/1e4)});}
  return out;
}
/** Count point/line/polygon features per hexagon (points by position, lines by vertex sample, polygons by centroid). */
function hexSummary(hexes,features){
  const counts=new Map(hexes.map(h=>[h.id,{total:0,classes:{}}]));
  const place=(p,cls)=>{let best=null,bd=Infinity;for(const h of hexes){const d=Math.hypot(h.cx-p[0],h.cy-p[1]);if(d<bd){bd=d;best=h;}}if(!best)return;const c=counts.get(best.id);c.total++;c.classes[cls]=(c.classes[cls]||0)+1;};
  for(const f of features){const g=f.geometry;if(g.type==='Point')place(g.coordinates,f.class);else if(g.type==='LineString')place(g.coordinates[Math.floor(g.coordinates.length/2)],f.class);else if(g.type==='Polygon')place(centroid(g.coordinates[0]),f.class);}
  const list=hexes.map(h=>({...h,...counts.get(h.id),density:h.areaHa>0?r1(counts.get(h.id).total/h.areaHa):0}));
  const max=Math.max(0,...list.map(h=>h.total));
  return{hexes:list,max,total:features.length,withHits:list.filter(h=>h.total>0).length};
}

/** Contour lines of the game's modelled terrain (dist/routes.js elevation) in world px: marching squares on a grid.
    [B-SRC: Contours layer, intervals 0.25–2 m] The game's heights are modelled, not surveyed. */
function contours(order,intervalM=1){
  const site=WorksiteRoutes.sites[order.standId],[ax,ay,k]=site.anchor,N=26,z=[],lines=[];
  for(let j=0;j<=N;j++){const row=[];for(let i=0;i<=N;i++)row.push(WorksiteRoutes.elevation(order.standId,i/N*100,j/N*100));z.push(row);}
  let lo=Infinity,hi=-Infinity;for(const r of z)for(const v of r){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  const step=Math.max(.25,intervalM),P=(i,j)=>world([ax,ay,k],[i/N*100,j/N*100]);
  for(let lev=Math.ceil(lo/step)*step;lev<=hi;lev+=step){const segs=[];
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=z[j][i],b=z[j][i+1],c=z[j+1][i+1],d=z[j+1][i],pts=[];
      const edge=(v1,v2,p1,p2)=>{if((v1<lev)!==(v2<lev)){const t=(lev-v1)/(v2-v1);pts.push([p1[0]+t*(p2[0]-p1[0]),p1[1]+t*(p2[1]-p1[1])]);}};
      edge(a,b,P(i,j),P(i+1,j));edge(b,c,P(i+1,j),P(i+1,j+1));edge(c,d,P(i+1,j+1),P(i,j+1));edge(d,a,P(i,j+1),P(i,j));
      if(pts.length>=2)segs.push([pts[0],pts[1]].map(p=>[r2(p[0]),r2(p[1])]));}
    if(segs.length)lines.push({level:r2(lev),major:Math.abs(lev/(step*4)-Math.round(lev/(step*4)))<1e-6,segments:segs});}
  return{lines,min:r2(lo),max:r2(hi),interval:step};
}
/** Drone capture positions of a flight (grid inside the stand at the spacing the image count implies) [B-SRC: Drone Images layer]. */
function imagePoints(order,flight){
  const mpp=metresPerPx(order),perHa=flight?.images&&order.areaHa?flight.images/order.areaHa:FLIGHT.imagesPerHa,spacing=Math.max(3,Math.sqrt(1e4/perHa)/mpp),[x0,y0,x1,y1]=bbox(order.boundary),out=[];let n=0;
  for(let y=y0-spacing/2;y<=y1+spacing/2;y+=spacing)for(let x=x0-spacing/2;x<=x1+spacing/2;x+=spacing){const p=[r2(x),r2(y)];if(inPolygon(p,order.boundary)||inPolygon([p[0]+spacing/2,p[1]],order.boundary)||inPolygon([p[0]-spacing/2,p[1]],order.boundary))out.push({index:++n,point:p,yaw:Math.round(y/spacing)%2?90:270,name:`DJI_${String(n).padStart(4,'0')}.JPG`});}
  return out;
}
/** Detection filter by minimum confidence (the portal filters detections by confidence/height/area). */
function filterResults(results,minConfidence=0){if(!(minConfidence>0))return results;const out={};for(const [k,list] of Object.entries(results||{}))out[k]=list.filter(x=>x.confidence==null||x.confidence>=minConfidence);return out;}
/* ---------- Checklists: Vorprüfung (pre) and Nachprüfung (post) ---------- */
const item=(key,level,title,detail,cfh,source='Drohne')=>({key,level,title,detail,cfh,source});
const LEVEL_RANK={ok:0,info:1,todo:2,warn:3,block:4};
function overall(items){const worst=items.reduce((w,i)=>LEVEL_RANK[i.level]>LEVEL_RANK[w]?i.level:w,'ok');return worst==='block'?'blocked':['warn','todo'].includes(worst)?'open':'ready';}
function preCheck(order,snapshot,project,results){
  const f=facts(order,snapshot),R=results||{},has=k=>Array.isArray(R[k]),cnt=k=>has(k)?R[k].length:0,items=[];
  items.push(project?item('flight','ok','Befliegung vor dem Hieb vorhanden',`${project.flight.images} Bilder · ${project.flight.gsdCm} cm/px · Schicht ${project.round}`,'Terrängplanering'):item('flight','todo','Keine Befliegung vor dem Hieb','Projekt anlegen und Befliegung hochladen','Terrängplanering'));
  const devi=has('boundary')?R.boundary.find(x=>x.class==='Abweichung zur Altskizze'):null;
  items.push(!has('boundary')?item('boundary','todo','Hiebsgrenze noch nicht erkannt','Modell „Hiebsgrenze“ ausführen','Område'):devi?item('boundary','warn','Hiebsgrenze weicht von der Altskizze ab',`${devi.areaHa} ha im Nachbarbestand · Grenze mit Revierleitung klären oder digitale Grenze übergeben`,'Område'):item('boundary','ok','Hiebsgrenze bestätigt',`${R.boundary[0]?.perimeterM||0} m Umfang · ${f.areaHa} ha`,'Område'));
  const gap=has('protected')?R.protected.find(x=>x.class==='Unerkundete Teilfläche'):null;
  items.push(f.surveyGap>0?item('survey',gap?'warn':'todo',gap?'Unerkundete Teilfläche abgegrenzt':'Vorerkundung unvollständig',gap?`${gap.areaHa} ha (${f.surveyGap} %) nicht begangen · vor dem Einsatz nacherkunden oder ausnehmen`:`${f.surveyGap} % der Fläche nicht erkundet`,'Hänsyn',gap?'Drohne':'CFHarvest'):item('survey','ok','Vorerkundung vollständig','100 % der Fläche begangen','Hänsyn','CFHarvest'));
  items.push(!has('retention')?item('retention','todo','Habitatbäume noch nicht erkannt','Modell „Habitatbäume“ ausführen','Hänsyn'):item('retention','ok','Habitatbäume markiert',`${cnt('retention')} Bäume erkannt${R.retention.some(x=>x.marked)?' · '+R.retention.find(x=>x.marked).code+' bestätigt':''}`,'Hänsyn'));
  const zones=has('protected')?R.protected.filter(x=>x.class!=='Unerkundete Teilfläche'):[];
  items.push(!has('protected')?item('zones','todo','Schutzzonen noch nicht abgegrenzt','Modell „Schutzzonen und Feuchtflächen“ ausführen','Hänsyn'):zones.length?item('zones',zones.some(z=>z.class==='Horst-Sperrzone')?'warn':'ok',zones.some(z=>z.class==='Horst-Sperrzone')?'Sperrzone im Hieb':'Schutzzonen abgegrenzt',zones.map(z=>`${z.class} ${z.areaHa} ha`).join(' · '),zones.some(z=>z.class==='Horst-Sperrzone')?'Säkerhet':'Hänsyn'):item('zones','ok','Keine Schutzzone erkannt','','Hänsyn'));
  items.push(!has('access')?item('access','todo','Zufahrt und Polterplatz noch nicht geprüft','Modell „Rückegassen, Zufahrt und Polterplatz“ ausführen','Avlägg'):item('access','ok','Rückegassen, Zufahrt und Polterplatz erkannt',`${R.access.filter(x=>x.class==='Rückegasse').length} Rückegassen · Zufahrt ${R.access.find(x=>x.class==='Zufahrt')?.lengthM||0} m · ${order.landing.id}`,'Avlägg'));
  items.push(has('damage')?item('damage','ok','Kein Schadholz oder Windwurf','Modell ausgeführt, keine Treffer','Säkerhet'):item('damage','info','Schadholz nicht geprüft','Modell „Schadholz und Windwurf“ optional','Säkerhet'));
  items.push(order.closed?item('closed','block','Hieb gesperrt','Vom Auftraggeber bis zur Prüfung gestoppt','Status','CFHarvest'):item('handover',order.handover.accepted?'ok':'info',order.handover.accepted?'Digitale Übergabe bestätigt':'Übergabe an die Maschine offen',order.handover.accepted?`Version ${order.handover.version}`:'Prüfergebnis an CFHarvest übergeben, dann Arbeitsauftrag senden','Status','CFHarvest'));
  return{phase:'pre',items,status:overall(items)};
}
function postCheck(order,snapshot,project,results){
  const f=facts(order,snapshot),R=results||{},has=k=>Array.isArray(R[k]),items=[];
  if(!f.harvestRounds.length)return{phase:'post',items:[item('none','info','Noch keine Schicht auf dieser Fläche','Die Nachprüfung ist nach der ersten Schicht möglich','Utfört arbete','Spiel')],status:'open'};
  items.push(project?item('flight','ok','Befliegung nach dem Hieb vorhanden',`${project.flight.images} Bilder · Schicht ${project.round}`,'Slutvärdering'):item('flight','todo','Keine Befliegung nach dem Hieb','Projekt anlegen und Befliegung hochladen','Slutvärdering'));
  const st=has('stumps')?R.stumps:null;
  items.push(!st?item('area','todo','Abgeerntete Fläche noch nicht erkannt','Modell „Stöcke“ ausführen','Utfört arbete'):item('area',Math.abs(f.harvestedHa-f.areaHa)<.05||f.fraction>=.999?'ok':'info',`Abgeerntete Fläche ${f.harvestedHa} ha von ${f.areaHa} ha`,`${st.length} Stöcke erkannt · ${r1(f.felled)} fm gefällt (${Math.round(f.fraction*100)} % des Vorrats)`,'Utfört arbete'));
  const over=has('boundary')?R.boundary.find(x=>x.class==='Überhieb'):null;
  items.push(!has('boundary')?item('boundary','todo','Hiebsgrenze noch nicht geprüft','Modell „Hiebsgrenze“ ausführen','Område'):over?item('boundary','block','Überhieb außerhalb der Hiebsgrenze',`${over.volumeFm} fm Nachbarholz auf ${over.areaHa} ha · gesondert lagern, Auftraggeber informieren`,'Område'):item('boundary','ok','Hiebsgrenze eingehalten','Keine Fällung außerhalb der Grenze erkannt','Område'));
  const ret=has('retention')?R.retention:null;
  items.push(!ret?item('retention','todo','Habitatbäume noch nicht geprüft','Modell „Habitatbäume“ ausführen','Hänsyn'):ret.some(x=>x.retained===false)?item('retention','block','Habitatbäume beschädigt',`${ret.filter(x=>x.retained===false).length} von ${ret.length} im Schutzbereich beschädigt`,'Hänsyn'):item('retention','ok','Habitatbäume erhalten',`${ret.length} von ${ret.length} stehen`,'Hänsyn'));
  const zones=has('protected')?R.protected.filter(x=>x.class!=='Unerkundete Teilfläche'):null;
  items.push(!zones?item('zones','todo','Schutzzonen noch nicht geprüft','Modell „Schutzzonen und Feuchtflächen“ ausführen','Hänsyn'):zones.some(z=>z.violated)?item('zones','block','Schutzzone befahren oder beschädigt',zones.filter(z=>z.violated).map(z=>z.code).join(', '),'Hänsyn'):item('zones','ok','Schutzzonen unberührt',zones.length?zones.map(z=>z.code).join(', '):'keine','Hänsyn'));
  const ruts=has('ruts')?R.ruts:null;
  if(ruts){const deep=ruts.filter(x=>x.severity===2),mid=ruts.filter(x=>x.severity===1),len=sum(ruts.map(x=>x.lengthM));items.push(item('ruts',deep.length?'warn':mid.length?'info':'ok',deep.length?'Tiefe Fahrspuren':mid.length?'Mittlere Fahrspuren':'Fahrspuren unauffällig',`${len} m Rückeweg · ${deep.length} tief · ${mid.length} mittel · ${ruts.length-deep.length-mid.length} leicht · Bodenschutz ${f.soil}/100`,'Slutvärdering'));}
  else items.push(item('ruts','todo','Fahrspuren noch nicht geprüft','Modell „Fahrspuren und Bodenschäden“ ausführen','Slutvärdering'));
  const rem=has('remnants')?R.remnants:null;
  if(rem){const stock=order.stand.forestStock,pol=rem.find(x=>x.class==='Polter');items.push(item('remnants',stock>.5?'warn':'ok',stock>.5?'Holz im Bestand liegen geblieben':'Kein Holz im Bestand',`${r1(stock)} fm Waldlager${pol?` · Polter ${pol.id} ${pol.volumeFm} fm`:''}`,'Sortiment'));}
  else items.push(item('remnants','todo','Holzreste noch nicht geprüft','Modell „Holzreste und Polter“ ausführen','Sortiment'));
  return{phase:'post',items,status:overall(items)};
}
function checklist(order,snapshot,phase,project,results){return phase==='post'?postCheck(order,snapshot,project,results):preCheck(order,snapshot,project,results);}

/* ---------- Before/after comparison ---------- */
function compare(order,snapshot,preResults,postResults){
  const f=facts(order,snapshot),P=preResults||{},Q=postResults||{},rows=[],n=(R,k,cls)=>Array.isArray(R[k])?R[k].filter(x=>!cls||x.class===cls).length:null;
  rows.push({key:'area',title:'Fläche (ha)',before:f.areaHa,after:f.harvestedHa,unit:'ha',note:'abgeerntet'});
  rows.push({key:'retention',title:'Habitatbäume',before:n(P,'retention'),after:Array.isArray(Q.retention)?Q.retention.filter(x=>x.retained!==false).length:null,unit:'',note:'erhalten'});
  rows.push({key:'zones',title:'Schutzzonen',before:n(P,'protected'),after:Array.isArray(Q.protected)?Q.protected.filter(x=>!x.violated).length:null,unit:'',note:'unberührt'});
  rows.push({key:'stumps',title:'Stöcke',before:0,after:n(Q,'stumps'),unit:'',note:'gefällte Stämme'});
  rows.push({key:'over',title:'Überhieb (fm)',before:0,after:Array.isArray(Q.boundary)?(Q.boundary.find(x=>x.class==='Überhieb')?.volumeFm||0):null,unit:'fm',note:'außerhalb der Grenze'});
  rows.push({key:'ruts',title:'Fahrspuren tief (m)',before:0,after:Array.isArray(Q.ruts)?sum(Q.ruts.filter(x=>x.severity===2).map(x=>x.lengthM)):null,unit:'m',note:''});
  rows.push({key:'stock',title:'Waldlager (fm)',before:r1(order.openingStock),after:Array.isArray(Q.remnants)?r1(order.stand.forestStock):null,unit:'fm',note:'liegendes Holz'});
  for(const r of rows)r.delta=r.before!=null&&r.after!=null?r2(r.after-r.before):null;
  return{rows,harvestedHa:f.harvestedHa,areaHa:f.areaHa,fraction:f.fraction};
}

/* ---------- Exports ---------- */
function toGeoJSON(order,phase,results,{round=null}={}){
  const mpp=metresPerPx(order),features=[];
  for(const [k,list] of Object.entries(results||{}))for(const x of list)features.push({type:'Feature',geometry:x.geometry,properties:{model:k,class:x.class,orderId:order.id,phase,...Object.fromEntries(Object.entries(x).filter(([a])=>!['geometry','model','class'].includes(a)))}});
  return{type:'FeatureCollection',name:`${order.id}-${phase}`,crs:{type:'name',properties:{name:'urn:trimble-forestry-demo:orthophoto-image-space',note:'Bildkoordinaten des Spiel-Luftbilds (620×350 px), nicht georeferenziert',metresPerPx:r2(mpp)}},
    properties:{orderId:order.id,orderName:order.name,contractId:order.contractId,phase,round,generator:'Hiebsprüfung · Drohne (Demo)',demo:true},features};
}
/** Record handed to CFHarvest (read by the planning replica: readiness list, Hänsyn tab, Slutvärdering). */
function handover(order,snapshot,phase,project,results,round){
  const c=checklist(order,snapshot,phase,project,results);
  const rec={orderId:order.id,phase,round,status:c.status,items:c.items.map(i=>({key:i.key,level:i.level,title:i.title,detail:i.detail,cfh:i.cfh})),
    counts:Object.fromEntries(Object.entries(results||{}).map(([k,v])=>[k,v.length])),boundaryDigital:phase==='pre'&&!!(results?.boundary)&&!results.boundary.some(x=>x.class==='Abweichung zur Altskizze')};
  if(phase==='post'&&results){rec.evaluation={retentionLeft:(results.retention||[]).filter(x=>x.retained!==false).length,retentionDamaged:(results.retention||[]).filter(x=>x.retained===false).length,stumps:(results.stumps||[]).length,overcutFm:results.boundary?.find(x=>x.class==='Überhieb')?.volumeFm||0,deepRutsM:sum((results.ruts||[]).filter(x=>x.severity===2).map(x=>x.lengthM)),forestStockFm:r1(order.stand.forestStock)};}
  return rec;
}

/* ---------- Project store (the portal's own data; sessionStorage, never game state) ---------- */
function emptyStore(){return{schema:SCHEMA,seq:0,projects:[],models:[],notifications:[],handover:{},basis:null};}
function normalizeStore(s){const base=emptyStore();if(!s||typeof s!=='object'||s.schema!==SCHEMA)return base;const out={...base,...s};for(const k of ['projects','models','notifications'])if(!Array.isArray(out[k]))out[k]=[];if(!out.handover||typeof out.handover!=='object')out.handover={};out.seq=Number.isFinite(out.seq)?out.seq:0;return out;}
function flightFor(order,opts={}){const ha=order.areaHa||2,images=Math.max(40,Math.round(ha*(opts.imagesPerHa||FLIGHT.imagesPerHa)));return{altitudeM:opts.altitudeM||FLIGHT.altitudeM,gsdCm:opts.gsdCm||FLIGHT.gsdCm,overlapPct:opts.overlapPct||FLIGHT.overlapPct,images,sizeMb:images*FLIGHT.mbPerImage,source:opts.source||'demo'};}
function projectId(store,order,phase){return `P-${order.id.replace(/^H-/,'')}-${phase}-${String(++store.seq).padStart(2,'0')}`;}
function createProject(storeIn,order,{phase='pre',type='orthophoto',name,tags=[],round=1,flight}={}){
  const store=normalizeStore(structuredClone(storeIn));
  const p={id:projectId(store,order,phase),orderId:order.id,standId:order.standId,name:name||`${order.name} · ${PHASES[phase].de}`,phase,type,tags:[...new Set([PHASES[phase].cfh,order.operationLabel||'Endnutzung',...tags])],round,created:new Date().toISOString(),flight:flight||flightFor(order),status:'ready',steps:['Hochgeladen','Orthomosaik erstellt','Bereit'],jobs:[],annotations:[],measurements:[],archived:false,handedOver:null};
  store.projects.push(p);store.notifications.push({id:'N'+(++store.seq),kind:'job',title:`Orthomosaik für ${p.name} erstellt`,text:`${p.flight.images} Bilder verarbeitet`,round,projectId:p.id,read:false});
  return{store,project:p};
}
function runModel(storeIn,projectId_,modelKey,count,round){const store=normalizeStore(structuredClone(storeIn)),p=store.projects.find(x=>x.id===projectId_);if(!p)throw Error('Projekt nicht gefunden');
  p.jobs=p.jobs.filter(j=>j.modelKey!==modelKey);p.jobs.push({modelKey,status:'done',round,count});store.notifications.push({id:'N'+(++store.seq),kind:'job',title:`${modelOf(modelKey)?.name||modelKey}: ${count} Erkennungen`,text:p.name,round,projectId:p.id,read:false});return store;}
function runModels(store,projectId_,entries,round){let s=store;for(const [k,c] of entries)s=runModel(s,projectId_,k,c,round);return s;}
function resultsFor(order,snapshot,project){const out={};for(const j of project.jobs)if(j.status==='done')out[j.modelKey]=detect(order,snapshot,project.phase,j.modelKey);return out;}
function latestProject(store,orderId,phase){return store.projects.filter(p=>p.orderId===orderId&&p.phase===phase&&!p.archived).sort((a,b)=>b.round-a.round||(b.id>a.id?1:-1))[0]||null;}
function storageUsed(store){return sum(store.projects.filter(p=>!p.archived).map(p=>p.flight.sizeMb||0));}
/* Public plan tiers of the portal (register page, Oct 2026) — shown as the demo tenant's quota, no payment. */
const TIERS=[{key:'starter',name:'Starter',usd:59,storageGb:15,projects:2,imagesOrtho:500,imagesSingle:500},{key:'pro',name:'Pro',usd:129,storageGb:50,projects:10,imagesOrtho:1500,imagesSingle:1000},{key:'business',name:'Business',usd:299,storageGb:1000,projects:20,imagesOrtho:3000,imagesSingle:3000,dsp:true}];
return{SCHEMA,KEY,PHASES,FLIGHT,MODELS,TIERS,STEM_FM,modelOf,modelsFor,polygonArea,pathLength,inPolygon,bbox,centroid,metresPerPx,rng,scatter,circlePoly,clipWest,facts,detect,detectAll,countByClass,hexGrid,hexSummary,contours,imagePoints,filterResults,preCheck,postCheck,checklist,overall,compare,toGeoJSON,handover,emptyStore,normalizeStore,flightFor,createProject,runModel,runModels,resultsFor,latestProject,storageUsed};
})();
if(typeof module!=='undefined')module.exports=CFHSiteCheck;
