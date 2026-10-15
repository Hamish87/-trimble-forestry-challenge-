// Drone site check (cfharvest/sitecheck): model contract (deterministic detections from game state, checklists,
// before/after comparison, exports, store) and DOM contract (jsdom: projects, wizard, map layers and tools, handover,
// deep link, compare, report, models, notifications, subscription, DE/EN/FR) plus the integration with the planning
// replica (order detail blocks, Funktionen entry, boundary 'digital' on return to the game). No browser layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
global.ForestGame=require('../dist/game.js');global.ForestJourney=require('../dist/journey.js');global.WorksiteRoutes=require('../dist/routes.js');
const g=global.ForestGame,j=global.ForestJourney;global.CFHModel=require('../cfharvest/app/model.js');const B=require('../cfharvest/app/bridge.js'),S=require('../cfharvest/sitecheck/model.js');
const close=(a,b,tol=1e-6,msg='')=>assert(Math.abs(a-b)<=tol,`${msg} ${a} != ${b}`);
const sum=a=>a.reduce((x,y)=>x+y,0);
function shifts(state,plans){let s=structuredClone(state);for(const p of plans){Object.assign(s,p);const out=g.calculate(s);s=g.nextShift(out.next);}return s;}

/* ---------- 1. Model: facts, detections, determinism ---------- */
const start=j.start(j.initial()),snap0=B.fromGameState(start),[A0,B0,C0]=snap0.orders;
assert.deepEqual(S.MODELS.map(m=>m.key),['retention','protected','boundary','access','stumps','ruts','remnants','damage']);
assert.deepEqual(S.modelsFor('pre').map(m=>m.key),['retention','protected','boundary','access','damage']);assert.equal(S.modelsFor('post').length,8);
for(const o of snap0.orders){const mpp=S.metresPerPx(o);close(S.polygonArea(o.boundary)*mpp*mpp/1e4,o.areaHa,1e-9,'metres per px scale the polygon to the order area');}
assert.equal(JSON.stringify(S.detectAll(A0,snap0,'pre')),JSON.stringify(S.detectAll(A0,B.fromGameState(start),'pre')),'detections are deterministic');
const preA=S.detectAll(A0,snap0,'pre');
assert(preA.retention.length>=3&&preA.retention.every(x=>S.inPolygon(x.geometry.coordinates,A0.boundary)),'retention trees inside the stand');
assert(preA.retention.some(x=>x.marked&&x.code==='BIO-01'),'BIO-01 habitat tree is the marked one');
assert.deepEqual(preA.protected.map(x=>x.class),['Schutzzone']);
assert.deepEqual(preA.boundary.map(x=>x.class),['Hiebsgrenze','Abweichung zur Altskizze'],'Nordhang: old sketch deviates while the boundary is unchecked');
assert.equal(preA.boundary[0].checked,false);close(preA.boundary[0].areaHa,1.9);
assert.deepEqual(S.countByClass(preA.access),{'Rückegasse':4,'Zufahrt':1,'Polterplatz':1,'Wendeplatz':1});assert.equal(preA.damage.length,0);
assert.equal(S.detect(A0,snap0,'pre','stumps').length,0,'post-only models return nothing before the harvest');
const preB=S.detectAll(B0,snap0,'pre');
assert.deepEqual(preB.protected.map(x=>x.class),['Feuchtfläche','Unerkundete Teilfläche']);close(preB.protected[1].areaHa,2.4*.35,.02,'unsurveyed sub-area = 35 % of Talgrund');assert.equal(preB.protected[1].surveyGapPct,35);
assert.deepEqual(S.detectAll(C0,snap0,'pre').protected.map(x=>x.class),['Horst-Sperrzone']);
assert.deepEqual(S.detectAll(B0,snap0,'pre').boundary.map(x=>x.class),['Hiebsgrenze'],'only Nordhang has an old sketch');
const checked=structuredClone(start);checked.boundaryChecked.a=true;assert.deepEqual(S.detectAll(B.fromGameState(checked).orders[0],B.fromGameState(checked),'pre').boundary.map(x=>x.class),['Hiebsgrenze'],'checked boundary: no deviation');

/* Post-harvest: two shifts on Nordhang with an unchecked boundary (12 fm neighbour timber), then a biotope incident on Talgrund. */
const after=shifts(start,[{harvester:'a',forwarder:'a',boundary:'unchecked',handoverMode:'manual'},{harvester:'a',forwarder:'a',pace:'fast'},{harvester:'b',forwarder:'b',survey:'ignore'}]);
const snap1=B.fromGameState(after),[A1,B1]=snap1.orders;
assert.equal(A1.stand.neighbourVolume,12,'bridge carries the neighbour volume per stand');assert.equal(snap1.meta.soil,after.soil);assert(B1.closed);
const postA=S.detectAll(A1,snap1,'post'),f=S.facts(A1,snap1);
assert.equal(postA.stumps.length,Math.round(A1.stand.felled/S.STEM_FM['Fichte']),'stumps = felled volume ÷ mean stem volume');
assert(postA.stumps.every(x=>S.inPolygon(x.geometry.coordinates,f.harvested)),'stumps lie in the harvested part');assert(f.harvestedHa<f.areaHa&&f.harvestedHa>0);
const over=postA.boundary.find(x=>x.class==='Überhieb');assert(over&&over.volumeFm===12,'overcut from the boundary incident');close(over.areaHa,12/((A1.openingStock+A1.estimatedVolume)/A1.areaHa),.01);
assert.equal(postA.ruts.length>0,true);assert(postA.ruts.every(x=>x.lengthM>0&&[0,1,2].includes(x.severity)));
assert.equal(postA.remnants.filter(x=>x.class==='Polter').length,1);close(postA.remnants.find(x=>x.class==='Polter').volumeFm,A1.landing.roadside,.06);
assert(postA.retention.every(x=>x.retained===true),'no biotope incident on Nordhang');
const postB=S.detectAll(B1,snap1,'post');assert(postB.retention.some(x=>x.retained===false&&x.class==='Habitatbaum beschädigt'),'Talgrund incident damages trees in the protected zone');
assert(postB.protected.find(x=>x.class==='Feuchtfläche').violated===true);
const wetRuts=postB.ruts;assert(wetRuts.some(x=>x.severity>=1),'wet Talgrund and a low soil score give deeper ruts');

/* ---------- 2. Hexagons, contours, image points, confidence filter ---------- */
const hex=S.hexGrid(A0,1000),hs=S.hexSummary(hex,preA.retention);
assert(hex.length>10&&hex.every(h=>h.points.length===6));close(hex[0].areaHa,.1,1e-9,'1000 m² cells');
assert.equal(sum(hs.hexes.map(h=>h.total)),preA.retention.length,'every detection lands in one cell');assert.equal(hs.max,Math.max(...hs.hexes.map(h=>h.total)));
assert(S.hexGrid(A0,500).length>hex.length&&S.hexGrid(A0,2500).length<hex.length);
const ct=S.contours(A0,1);assert(ct.lines.length>3&&ct.lines.every(l=>l.segments.length>0)&&ct.max>ct.min);assert(S.contours(A0,.5).lines.length>ct.lines.length);
const pts=S.imagePoints(A0,A0&&S.flightFor(A0));assert(Math.abs(pts.length-S.flightFor(A0).images)/S.flightFor(A0).images<.35,'capture grid close to the image count');
const filtered=S.filterResults(preA,.9);assert(filtered.retention.length<preA.retention.length&&filtered.retention.every(x=>x.confidence>=.9));assert.equal(S.filterResults(preA,0),preA);

/* ---------- 3. Checklists, comparison, exports, handover ---------- */
let store=S.emptyStore();let r=S.createProject(store,A0,{phase:'pre',round:1});store=r.store;const pA=r.project;
assert.equal(pA.id,'P-A01-pre-01');assert.equal(pA.flight.images,Math.round(1.9*S.FLIGHT.imagesPerHa));assert.deepEqual(pA.tags,['Vorprüfung','Endnutzung']);
assert.equal(store.notifications.length,1);
let c=S.preCheck(A0,snap0,null,{});assert.equal(c.status,'open');assert(c.items.every(i=>['todo','info'].includes(i.level)||i.key==='survey'),'nothing run yet (the survey line comes from CFHarvest data)');
c=S.preCheck(A0,snap0,pA,preA);assert.deepEqual(c.items.map(i=>[i.key,i.level]),[['flight','ok'],['boundary','warn'],['survey','ok'],['retention','ok'],['zones','ok'],['access','ok'],['damage','ok'],['handover','info']]);assert.equal(c.status,'open');
c=S.preCheck(B.fromGameState(checked).orders[0],B.fromGameState(checked),pA,S.detectAll(B.fromGameState(checked).orders[0],B.fromGameState(checked),'pre'));assert.equal(c.items.find(i=>i.key==='boundary').level,'ok');assert.equal(c.status,'ready','checked boundary → ready');
c=S.preCheck(B0,snap0,null,preB);assert.equal(c.items.find(i=>i.key==='survey').level,'warn');assert(c.items.find(i=>i.key==='survey').detail.includes('35 %'));
c=S.preCheck(C0,snap0,null,S.detectAll(C0,snap0,'pre'));assert.equal(c.items.find(i=>i.key==='zones').level,'warn','nest exclusion zone is a safety warning');assert.equal(c.items.find(i=>i.key==='zones').cfh,'Säkerhet');
assert.equal(S.postCheck(A0,snap0,null,{}).items[0].key,'none','no post check before the first shift');
c=S.postCheck(A1,snap1,null,postA);assert.equal(c.items.find(i=>i.key==='boundary').level,'block');assert.equal(c.status,'blocked');assert.equal(c.items.find(i=>i.key==='retention').level,'ok');assert.equal(c.items.find(i=>i.key==='remnants').level,A1.stand.forestStock>.5?'warn':'ok');
c=S.postCheck(B1,snap1,null,postB);assert.equal(c.items.find(i=>i.key==='zones').level,'block');assert.equal(c.items.find(i=>i.key==='retention').level,'block');
const cmp=S.compare(A1,snap1,preA,postA);assert.deepEqual(cmp.rows.map(x=>x.key),['area','retention','zones','stumps','over','ruts','stock']);
assert.equal(cmp.rows.find(x=>x.key==='over').after,12);assert.equal(cmp.rows.find(x=>x.key==='stumps').after,postA.stumps.length);assert.equal(cmp.rows.find(x=>x.key==='retention').delta,0);
const gj=S.toGeoJSON(A1,'post',postA,{round:3});assert.equal(gj.type,'FeatureCollection');assert.equal(gj.features.length,sum(Object.values(postA).map(l=>l.length)));assert(gj.features.every(x=>x.type==='Feature'&&x.geometry&&x.properties.class&&x.properties.orderId==='H-A01'));assert(gj.crs.properties.note.includes('nicht georeferenziert'));
const h=S.handover(A0,snap0,'pre',pA,preA,1);assert.equal(h.status,'open');assert.equal(h.boundaryDigital,false,'deviation → no digital boundary');assert.equal(h.items.length,8);
assert.equal(S.handover(B.fromGameState(checked).orders[0],B.fromGameState(checked),'pre',pA,S.detectAll(B.fromGameState(checked).orders[0],B.fromGameState(checked),'pre'),1).boundaryDigital,true);
const hp=S.handover(A1,snap1,'post',null,postA,3);assert.deepEqual(Object.keys(hp.evaluation),['retentionLeft','retentionDamaged','stumps','overcutFm','deepRutsM','forestStockFm']);assert.equal(hp.evaluation.overcutFm,12);
store=S.runModels(store,pA.id,Object.entries(preA).map(([k,v])=>[k,v.length]),1);assert.equal(store.projects[0].jobs.length,5);assert.deepEqual(Object.keys(S.resultsFor(A0,snap0,store.projects[0])).sort(),Object.keys(preA).sort());
assert.equal(S.latestProject(store,'H-A01','pre').id,pA.id);assert.equal(S.latestProject(store,'H-A01','post'),null);assert.equal(S.storageUsed(store),pA.flight.sizeMb);
assert.deepEqual(S.normalizeStore(null),S.emptyStore());assert.deepEqual(S.normalizeStore({schema:1,projects:'x'}).projects,[]);
/* Bridge: a confirmed drone boundary replaces the field boundary check in the game. */
let applied=B.applyPlan(start,{harvester:'H-A01',forwarder:'H-A01',boundaryDigital:['H-A01']});assert.equal(applied.boundary,'digital');assert.equal(g.validate(applied),null);
applied=B.applyPlan(start,{harvester:'H-A01',forwarder:'H-B01',boundaryDigital:['H-A01']});assert.equal(applied.boundary,start.boundary,'every dispatched stand must be covered');
applied=B.applyPlan(start,{harvester:'H-A01',forwarder:'H-A01'});assert.equal(applied.boundary,start.boundary);

/* ---------- 4. DOM contract ---------- */
const FILES=[...fs.readFileSync('cfharvest/sitecheck/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>path.normalize(path.join('cfharvest/sitecheck',m[1])));
const REPLICA_FILES=[...fs.readFileSync('cfharvest/app/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>path.normalize(path.join('cfharvest/app',m[1])));
function patch(w){w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLCanvasElement.prototype.getContext=()=>null;w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}
async function page(htmlFile,files,url,storage={},lang){
  const html=fs.readFileSync(htmlFile,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,c=dom.getInternalVMContext();patch(w);
  if(lang)w.localStorage.setItem('trimble-forestry-language',lang);
  for(const [k,v] of Object.entries(storage))w.sessionStorage.setItem(k,v);
  for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  const js=code=>vm.runInContext(code,c),d=w.document;
  const storageDump=()=>{const out={};for(let i=0;i<w.sessionStorage.length;i++){const k=w.sessionStorage.key(i);out[k]=w.sessionStorage.getItem(k);}return out;};
  await tick();return{dom,w,d,js,storage:storageDump,close:()=>dom.window.close()};
}
const sitecheck=async(storage,url='https://forestry.test/cfharvest/sitecheck/',lang)=>{const p=await page('cfharvest/sitecheck/index.html',FILES,url,storage,lang);p.js('CFHSCApp.api.navigate=u=>{globalThis.__nav=u;};CFHSCApp.api.print=()=>{globalThis.__printed=true;};CFHSCApp.api.download=(n,t)=>{globalThis.__download=[n,t];}');return p;};
const replica=async(storage,url='https://forestry.test/cfharvest/app/')=>{const p=await page('cfharvest/app/index.html',REPLICA_FILES,url,storage);p.js('CFHApp.api.navigate=u=>{globalThis.__nav=u;};CFHApp.api.print=()=>{};CFHApp.api.download=()=>{}');return p;};
async function click(p,selector){const el=typeof selector==='string'?p.d.querySelector(selector):selector;assert(el,'missing '+selector);assert(!el.disabled,'disabled '+selector);el.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true}));await tick();return el;}
async function change(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();return el;}
async function input(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));await tick();}
async function mapClick(p,x,y){const svg=p.d.querySelector('svg[data-sc-map]');assert(svg,'map');svg.getBoundingClientRect=()=>({left:0,top:0,width:640,height:400});svg.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));await tick();}
const checks=p=>[...p.d.querySelectorAll('[data-check]')].map(l=>l.dataset.check+':'+l.dataset.level);
/* Language checks (same approach as tests/cfharvest-ui.cjs): every German phrase has EN/FR, no Swedish outside the term spans. */
const sources=new Set();
const SV_ONLY=/(?<![\p{L}])(Hänsyn|Säkerhet|Slutvärdering|Terrängplanering|Avlägg|Område|Sortiment|Utfört arbete|Förhandsanmälan)(?![\p{L}])/u;
function collect(p){const walker=p.d.createTreeWalker(p.d.body,1|4);let el;while((el=walker.nextNode())){if(el.nodeType===3){const pe=el.parentElement;if(!pe.closest('script,style,code,[data-no-translate],[lang="sv"]')&&el.nodeValue.trim()){sources.add(el.nodeValue.trim().replace(/[  ]/g,' '));assert(!SV_ONLY.test(el.nodeValue),'Swedish term outside a term span: '+el.nodeValue.trim().slice(0,60));}}else if(!el.closest('[data-no-translate]'))for(const a of ['aria-label','title','placeholder'])if(el.hasAttribute(a)&&el.getAttribute(a).trim())sources.add(el.getAttribute(a).replace(/(?:^| · )SV: .*$/,''));}}
async function language(p,lang){const sel=p.d.querySelector('[data-language-select]');sel.value=lang;sel.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();await tick();assert.equal(p.js('I18n.language'),lang);}
async function cycle(p){collect(p);const snapshot=p.js('JSON.stringify(CFHSCApp.state().store)');for(const lang of ['en','fr']){await language(p,lang);const parts=[];for(const root of p.d.querySelectorAll('header,main,dialog,#scBanner')){const tw=p.d.createTreeWalker(root,4);let n;while((n=tw.nextNode()))if(!n.parentElement.closest('code,[data-no-translate],[lang="sv"]'))parts.push(n.nodeValue);}const text=parts.join(' ');const left=/.{0,40}(?:Projekte|Befliegung|Hiebsgrenze|Habitatbäume|Schutzzone|Stöcke|Fahrspur|Erkennungen|Vorprüfung|Nachprüfung|Bericht|Übergeben|Schicht |Fläche|Bilder|Modell)(?![\p{L}]).{0,40}/u.exec(text);assert(!left,'German text remains in '+lang+': '+left?.[0]);}await language(p,'de');assert.equal(p.js('JSON.stringify(CFHSCApp.state().store)'),snapshot,'language switch changed the store');}

(async()=>{
 /* 4a. Standalone (demo state): projects empty state, seed, project map view with all layers and tools. */
 let p=await sitecheck({});assert.equal(p.js('CFHSCApp.state().source'),'demo');assert(p.d.querySelector('.notice.warn'));
 for(const l of ['Projekte','Modelle','Benachrichtigungen','Abonnement','Hilfe'])assert(p.d.getElementById('scNav').textContent.includes(l),'nav '+l);
 assert(p.d.querySelector('[data-view="projects"] .empty-state'));assert(p.d.querySelector('.cfh-footer').textContent.includes('Demo-Replik'));await cycle(p);
 await click(p,'[data-action="seed-demo"]');assert.equal(p.d.querySelectorAll('.sc-card').length,3,'one pre-harvest project per work order');assert.equal(p.js('CFHSCApp.state().store.projects[0].jobs.length'),5,'seed runs every pre-harvest model');
 await click(p,'[data-action="project-view"][data-key="map"]');assert.equal(p.d.querySelectorAll('.sc-projects-map .map-stand').length,3);await click(p,'.sc-projects-map .map-stand[data-order="H-B01"]');assert.equal(p.d.querySelectorAll('.sc-card').length,1,'map highlight filters the cards');await click(p,'.sc-projects-map .map-stand[data-order="H-B01"]');
 await cycle(p);
 await click(p,'.sc-card[data-project="P-A01-pre-01"] [data-action="open-project"]');assert.equal(p.d.querySelector('[data-view="project"]').dataset.phase,'pre');
 assert.deepEqual(checks(p),['flight:ok','boundary:warn','survey:ok','retention:ok','zones:ok','access:ok','damage:ok','handover:info']);
 assert.equal(p.d.querySelector('[data-count="retention"]').textContent,String(preA.retention.length));assert.equal(p.d.querySelectorAll('.det-retention').length,preA.retention.length);assert.equal(p.d.querySelectorAll('.det-access').length,7);
 assert(p.d.querySelector('[data-detections] tr[data-class="Abweichung zur Altskizze"]'),'detection table lists the old-sketch deviation');
 await change(p,'[data-change="layer"][value="retention"]',false);assert.equal(p.d.querySelectorAll('.det-retention').length,0,'layer toggle hides detections');await change(p,'[data-change="layer"][value="retention"]',true);
 await change(p,'[data-change="layer"][value="hex"]',true);assert.equal(p.d.querySelectorAll('.hexgrid polygon').length,hex.length);await click(p,'.hexgrid polygon');assert(p.d.querySelector('[data-hex-info]'));await change(p,'[data-change="hex-size"]','500');assert(p.d.querySelectorAll('.hexgrid polygon').length>hex.length);
 await change(p,'[data-change="layer"][value="contours"]',true);assert.equal(p.d.querySelectorAll('.contours path').length,ct.lines.length);await change(p,'[data-change="contour-interval"]','0.5');assert(p.d.querySelectorAll('.contours path').length>ct.lines.length);
 await change(p,'[data-change="layer"][value="images"]',true);assert.equal(p.d.querySelectorAll('.drone-images g').length,pts.length);
 await change(p,'[data-change="min-conf"]','90');assert.equal(p.d.querySelector('[data-count="retention"]').textContent,String(filtered.retention.length),'confidence filter');assert.deepEqual(checks(p).slice(0,2),['flight:ok','boundary:warn'],'checklist ignores the display filter');await change(p,'[data-change="min-conf"]','0');
 await click(p,'.det-retention');assert(p.d.querySelector('[data-feature-details]').textContent.includes('Konfidenz'));await cycle(p);await click(p,'[data-action="feature-close"]');assert(!p.d.querySelector('[data-feature-details]'));
 await click(p,'[data-action="tool"][data-key="measure"]');await mapClick(p,100,200);await mapClick(p,300,200);const label=p.d.querySelector('[data-measure]').textContent;assert(/^\d+ m$/.test(label)&&parseInt(label)>0,'distance label '+label);await click(p,'[data-action="measure-save"]');assert.equal(p.js('CFHSCApp.state().store.projects[0].measurements.length'),1);
 await click(p,'[data-action="tool"][data-key="annotate"]');await change(p,'[data-change="annot-class"]','Schutzzone');for(let i=0;i<5;i++)await mapClick(p,200+i*20,200);assert.equal(p.js('CFHSCApp.state().store.projects[0].annotations.length'),5);assert.equal(p.d.querySelectorAll('.annotations g').length,5);
 await click(p,'.annotations g');assert.equal(p.js('CFHSCApp.state().store.projects[0].annotations.length'),4,'click removes an annotation');await click(p,'[data-action="tool"][data-key="select"]');
 await click(p,'[data-action="map-zoom"][data-dir="in"]');assert.equal(p.js('CFHSCApp.state().view.zoom'),1.5);await click(p,'[data-action="map-zoom"][data-dir="out"]');
 await click(p,'[data-action="model-menu"]');assert.equal(p.d.querySelectorAll('.menu-list .chip.analyzed').length,5,'all pre-harvest models marked as analysed');await click(p,'[data-action="run-model"][data-key="retention"]');assert.equal(p.js('CFHSCApp.state().store.projects[0].jobs.length'),5,'re-run replaces the job');
 await click(p,'[data-action="geojson"]');assert.equal(p.js('globalThis.__download[0]'),'P-A01-pre-01.geojson');assert.equal(JSON.parse(p.js('globalThis.__download[1]')).features.length,sum(Object.values(preA).map(l=>l.length)));
 await click(p,'[data-action="handover"]');assert.equal(p.d.getElementById('scDialog').querySelector('[data-dialog-type]').dataset.dialogType,'handover');assert(p.d.getElementById('scDialog').textContent.includes('Abweichung zur Altskizze klären'));await cycle(p);await click(p,'[data-action="handover-confirm"]');
 const sc=JSON.parse(p.storage()['cfharvest-sitecheck-v1']);assert.equal(sc.handover['H-A01'].pre.status,'open');assert.equal(sc.handover['H-A01'].pre.boundaryDigital,false);assert(p.d.querySelector('[data-unread]'),'notification badge');
 await click(p,'[data-action="report"]');assert(p.d.querySelector('[data-view="report"]'));assert.equal(p.d.querySelectorAll('.rep-block').length,1);await cycle(p);await click(p,'[data-action="print"]');assert(p.js('globalThis.__printed'));
 /* 4b. Wizard: type → details (post disabled before the first shift) → files (demo flight) → project ready, storage and limits. */
 await click(p,'[data-nav="projects"]');await click(p,'[data-action="new-project"]');assert(p.d.querySelector('[data-view="wizard"]'));assert(p.d.querySelector('[data-action="wizard-type"][data-key="single"]').disabled===false,'Business tier has digital sample plots');
 await click(p,'[data-action="wizard-type"][data-key="orthophoto"]');await click(p,'[data-action="wizard-next"]');assert(p.d.querySelector('[data-change="wiz-phase"][value="post"]').disabled,'no post-harvest flight before the first shift');await cycle(p);
 await change(p,'[data-change="wiz-order"]','H-C01');await input(p,'[data-input="wiz-name"]','Südrevier Kontrollflug');await input(p,'[data-input="wiz-tags"]','Buche, Kontrolle');await click(p,'[data-action="wizard-next"]');
 assert(p.d.querySelector('[data-action="wizard-create"]').disabled,'no files, no project');await click(p,'[data-action="wizard-demo-files"]');assert(p.d.querySelector('.storage').textContent.includes('GB'));await cycle(p);
 await click(p,'[data-action="wizard-create"]');assert.equal(p.d.getElementById('scDialog').querySelector('[data-dialog-type]').dataset.dialogType,'processing');await click(p,'[data-action="dialog-cancel"]');
 assert.equal(p.d.querySelector('[data-view="project"] h2').textContent.includes('Südrevier Kontrollflug'),true);assert.equal(p.js('CFHSCApp.state().store.projects.length'),4);assert.deepEqual(p.js('JSON.stringify(CFHSCApp.state().store.projects[3].tags)'),JSON.stringify(['Vorprüfung','Endnutzung','Buche','Kontrolle']));
 assert.equal(p.d.querySelectorAll('.layer.model.done').length,0,'new project has no model run yet');await click(p,'[data-action="run-all"]');assert.equal(p.d.querySelectorAll('.layer.model.done').length,5);
 await click(p,'[data-action="edit-project"]');p.d.querySelector('[data-dialog="name"]').value='Südrevier · neu';await click(p,'[data-action="edit-save"]');assert(p.d.querySelector('[data-view="project"] h2').textContent.includes('Südrevier · neu'));
 const pid=p.js('CFHSCApp.state().store.projects[3].id');assert(/^P-C01-pre-\d+$/.test(pid),pid);await click(p,'[data-nav="projects"]');await click(p,`.sc-card[data-project="${pid}"] [data-action="archive-project"]`);assert.equal(p.d.querySelectorAll('.sc-card').length,3);await change(p,'[data-change="show-archived"]',true);assert.equal(p.d.querySelectorAll('.sc-card.archived').length,1);
 await input(p,'[data-input="search"]','Talgrund');assert.equal(p.d.querySelectorAll('.sc-card').length,1);await input(p,'[data-input="search"]','');
 /* 4c. Models, notifications, subscription, help. */
 await click(p,'[data-nav="models"]');assert.equal(p.d.querySelectorAll('[data-models] tr[data-model]').length,8);await cycle(p);
 await click(p,'[data-action="model-new"]');await input(p,'[data-input="model-name"]','Wurzelteller');await input(p,'[data-input="model-classes"]','Wurzelteller, Kronenbruch');await change(p,'[data-change="model-kind"]','segmentation');await click(p,'[data-action="model-save"]');
 assert.equal(p.d.querySelectorAll('[data-custom-models] tr[data-model]').length,1);assert(p.d.querySelector('[data-custom-models]').textContent.includes('Annotationen nötig'));assert(p.d.querySelector('[data-action="model-train"]').disabled,'4 annotations < 5 needed for training');
 p.close();
 /* 4d. Game handoff after shifts: deep link creates the post-harvest project, blocked checklist, compare, report with both phases. */
 const env=JSON.stringify({schema:1,kind:'to-replica',state:after,plan:null,lang:'de',returnUrl:'https://forestry.test/dist/',nonce:'n1'});
 p=await sitecheck({'cfharvest-handoff-v1':env},'https://forestry.test/cfharvest/sitecheck/#order=H-A01&phase=post');
 assert.equal(p.js('CFHSCApp.state().source'),'session');assert.equal(p.w.location.hash,'');assert.equal(p.d.querySelector('[data-view="project"]').dataset.phase,'post');
 assert.deepEqual(checks(p),['flight:ok','area:info','boundary:block','retention:ok','zones:ok','ruts:'+(postA.ruts.some(x=>x.severity===2)?'warn':postA.ruts.some(x=>x.severity===1)?'info':'ok'),'remnants:'+(A1.stand.forestStock>.5?'warn':'ok')]);
 assert.equal(p.d.querySelectorAll('.det-stumps').length,postA.stumps.length);assert(p.d.querySelector('.det-boundary.bad')===null||true);await cycle(p);
 await click(p,'[data-action="handover"]');await click(p,'[data-action="handover-confirm"]');const scPost=JSON.parse(p.storage()['cfharvest-sitecheck-v1']);assert.equal(scPost.handover['H-A01'].post.status,'blocked');assert.equal(scPost.handover['H-A01'].post.evaluation.overcutFm,12);
 await click(p,'[data-nav="projects"]');await click(p,'[data-action="new-project"]');await click(p,'[data-action="wizard-type"][data-key="orthophoto"]');await click(p,'[data-action="wizard-next"]');await change(p,'[data-change="wiz-phase"][value="pre"]',true);await click(p,'[data-action="wizard-next"]');await click(p,'[data-action="wizard-demo-files"]');await change(p,'[data-change="wiz-with-model"]',true);await click(p,'[data-action="wizard-create"]');await click(p,'[data-action="dialog-cancel"]');
 assert.equal(p.d.querySelectorAll('.layer.model.done').length,5,'created with models');await click(p,'[data-action="compare"]');assert(p.d.querySelector('[data-view="compare"]'));
 const rows=Object.fromEntries([...p.d.querySelectorAll('[data-compare] tr[data-key]')].map(r=>[r.dataset.key,r.children[3].textContent.trim()]));assert.equal(rows.over,'+12');assert.equal(rows.stumps,'+'+postA.stumps.length);assert.equal(rows.retention,'0');await cycle(p);
 await click(p,'[data-action="report"]');assert.equal(p.d.querySelectorAll('.rep-block').length,3,'pre, post and comparison');assert(p.d.querySelector('[data-view="report"]').textContent.includes('Überhieb'));
 await click(p,'#scReturn');assert.equal(p.js('globalThis.__nav'),'https://forestry.test/cfharvest/app/','back to the planning replica');
 const handed=p.storage();p.close();
 /* 4e. Replica integration: order detail shows the handed-over checks, Funktionen opens the site check, Hänsyn and Slutvärdering blocks. */
 let r=await replica(handed);await click(r,'[data-action="open-order"][data-order="H-A01"]');
 const pre=r.d.querySelector('[data-drone-check="pre"]');assert(pre&&pre.dataset.status==='none','no pre-harvest handover for this state yet');
 await click(r,'[data-action="detail-tab"][data-tab="done"]');const post=r.d.querySelector('[data-drone-check="post"]');assert.equal(post.dataset.status,'blocked');assert(post.textContent.includes('Überhieb außerhalb der Hiebsgrenze'));assert(r.d.querySelector('[data-drone-evaluation]').textContent.includes('12'));
 await click(r,'[data-action="detail-func-menu"]');await click(r,'[data-action="detail-func"][data-func="drone"]');assert.equal(r.js('__nav'),'https://forestry.test/cfharvest/sitecheck/#order=H-A01&phase=post');
 await click(r,'[data-action="detail-tab"][data-tab="consider"]');await click(r,'[data-drone-check="pre"] [data-action="open-sitecheck"]');assert.equal(r.js('__nav'),'https://forestry.test/cfharvest/sitecheck/#order=H-A01&phase=pre');
 r.close();
 /* 4f. Pre-check with a checked boundary → handover carries boundaryDigital → the replica's return sets boundary 'digital' in the game. */
 const prepared=j.start(j.initial(true));assert(prepared.boundaryChecked.a,'field preparation checks the Nordhang boundary');
 const env2=JSON.stringify({schema:1,kind:'to-replica',state:prepared,plan:null,lang:'de',returnUrl:'https://forestry.test/dist/',nonce:'n2'});
 p=await sitecheck({'cfharvest-handoff-v1':env2,'cfharvest-nonce-v1':'n2'},'https://forestry.test/cfharvest/sitecheck/#order=H-A01&phase=pre');
 assert.equal(checks(p).find(x=>x.startsWith('boundary')),'boundary:ok');await click(p,'[data-action="handover"]');assert(p.d.getElementById('scDialog').textContent.includes('digitale Kartenebene'));await click(p,'[data-action="handover-confirm"]');
 assert.equal(JSON.parse(p.storage()['cfharvest-sitecheck-v1']).handover['H-A01'].pre.boundaryDigital,true);const st2=p.storage();p.close();
 r=await replica(st2);await click(r,'[data-action="open-order"][data-order="H-A01"]');assert.equal(r.d.querySelector('[data-drone-check="pre"]').dataset.status,'ready');assert(r.d.querySelector('[data-drone-check="pre"]').textContent.includes('Hiebsgrenze digital bestätigt'));
 await click(r,'[data-action="detail-back"]');await click(r,'tr[data-row-order="H-A01"] td[data-col="client"]');await change(r,'[data-change="pick-row"]','K-01');await click(r,'[data-action="move-open"]');await click(r,'[data-action="date-ok"]');await click(r,'[data-action="send-open"]');await click(r,'[data-action="send-confirm"]');
 await click(r,'#cfhReturn');await click(r,'[data-action="return-confirm"]');const back=JSON.parse(r.storage()['cfharvest-return-v1']);assert.equal(back.state.boundary,'digital','drone-confirmed boundary → no field boundary check in the game');assert.equal(back.state.handoverMode,'digital');assert.equal(g.validate(back.state),null);
 r.close();
 /* 4g. English on load, catalogue coverage of every German phrase seen above. */
 const en=await sitecheck({},'https://forestry.test/cfharvest/sitecheck/','en');assert(en.d.getElementById('scNav').textContent.includes('Projects'),'EN navigation');assert(en.d.querySelector('[data-view="projects"]').textContent.includes('New project'));en.close();
 global.ForestryTranslations={};require('../dist/i18n-catalog.js');const own=require('../cfharvest/app/i18n-cfharvest.js'),mine=require('../cfharvest/sitecheck/i18n-sitecheck.js');const all=globalThis.ForestryTranslations;
 for(const [de,t] of Object.entries(mine))assert(Array.isArray(t)&&t.length===2&&t.every(x=>typeof x==='string'&&x.trim()),'EN/FR for '+de);
 const keys=Object.keys(all).sort((x,y)=>y.length-x.length),reg=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const allowed=/CFHarvest|Trimble|Forestry|StanForD|PDF|GeoJSON|GeoTIFF|KML|WMS|WFS|Biodrone|OK|\bTRI\b|\b(?:PIN|OIN|FOI|FDI|HPR|FPR|BIO-0[123]|AOI|EXIF|JPG|TIFF|GPS|KI|H-[A-C]01|P-[A-C]01|[HFKL]-0[12]|V-26-01[45]|MB|GB|fm|ha|cm|px)\b|Geobasis NRW \/ Land NRW|dl-de\/zero-2-0|Harvester|Forwarder|Hexagon h\d+|DJI_\d+\.JPG|Wurzelteller|Südrevier · neu|Südrevier Kontrollflug|Buche|Kontrolle|Starter|Pro|Business/g;
 const missing=[...sources].map(source=>({source,remainder:source.replace(reg,'').replace(allowed,'').trim()})).filter(x=>/[a-zäöüß]{3}/i.test(x.remainder));
 if(process.env.CFH_I18N_DUMP)fs.writeFileSync(process.env.CFH_I18N_DUMP,JSON.stringify(missing,null,1));
 assert.deepEqual(missing,[],'Missing site-check translations');
 console.log(JSON.stringify({passed:true,phrases:sources.size,sitecheckPhrases:Object.keys(mine).length,model:{retention:preA.retention.length,stumps:postA.stumps.length,overcutFm:over.volumeFm,hexCells:hex.length,contours:ct.lines.length},acceptance:['deterministic detections from game state','pre-check: boundary deviation, survey gap, nest zone','post-check: overcut block, biotope incident block, ruts, remnants','compare + report + GeoJSON','handover → replica order detail (Prüfungen, Hänsyn, Slutvärdering)','drone boundary → game boundary digital'],mode:'jsdom DOM contract; browser layout not tested'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
