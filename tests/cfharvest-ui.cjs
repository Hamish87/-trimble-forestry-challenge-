// DOM contract test for the CFHarvest replica (cfharvest/app) and its game link (dist/cfharvest-link.js).
// jsdom only; no browser layout is simulated. Covers the PLAN.md Phase 2 acceptance flow end to end.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const GAME_FILES=['i18n-catalog','i18n','game','journey','routes','flyover','handover','journey-ui','scenes','app','cfharvest-link'].map(f=>'dist/'+f+'.js');
const REPLICA_FILES=['dist/i18n-catalog.js','cfharvest/app/i18n-cfharvest.js','dist/i18n.js','dist/game.js','dist/journey.js','dist/routes.js','cfharvest/app/model.js','cfharvest/app/bridge.js','cfharvest/app/ui.js','cfharvest/app/views/uppdragslista.js','cfharvest/app/views/kalender.js','cfharvest/app/views/karta.js','cfharvest/app/views/order-panel.js','cfharvest/app/views/bestallningar.js','cfharvest/app/views/admin.js','cfharvest/app/app.js'];
function patch(w){w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLCanvasElement.prototype.getContext=()=>null;}
async function page(htmlFile,files,url,storage={},lang){
  const html=fs.readFileSync(htmlFile,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,c=dom.getInternalVMContext();patch(w);
  if(lang)w.localStorage.setItem('trimble-forestry-language',lang);
  for(const [k,v] of Object.entries(storage))w.sessionStorage.setItem(k,v);
  for(const f of files)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  const js=code=>vm.runInContext(code,c),d=w.document;
  const storageDump=()=>{const out={};for(let i=0;i<w.sessionStorage.length;i++){const k=w.sessionStorage.key(i);out[k]=w.sessionStorage.getItem(k);}return out;};
  if(d.readyState==='loading')await new Promise(resolve=>d.addEventListener('DOMContentLoaded',resolve,{once:true}));await tick();
  return{dom,w,d,js,storage:storageDump,close:()=>dom.window.close()};
}
const game=async(storage,url='https://forestry.test/dist/')=>{const p=await page('dist/index.html',GAME_FILES,url,storage);p.js('CFHarvestLink.navigate=u=>{globalThis.__nav=u;}');return p;};
const replica=async(storage,url='https://forestry.test/cfharvest/app/')=>{const p=await page('cfharvest/app/index.html',REPLICA_FILES,url,storage);p.js('CFHApp.api.navigate=u=>{globalThis.__nav=u;};CFHApp.api.print=()=>{globalThis.__printed=true;}');return p;};
async function click(p,selector){const el=p.d.querySelector(selector);assert(el,'missing '+selector);assert(!el.disabled,'disabled '+selector);el.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true}));await tick();return el;}
async function change(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();return el;}
async function input(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));await tick();}
const close=(a,b,tol=.1,msg)=>assert(Math.abs(a-b)<=tol,`${msg||''} ${a} != ${b}`);
const deNum=s=>Number(String(s).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));

/* ---------- i18n coverage: every German phrase rendered by the replica is in the catalogue ---------- */
const sources=new Set();
function collect(p){const walker=p.d.createTreeWalker(p.d.body,1|4);let el;while((el=walker.nextNode())){if(el.nodeType===3){if(!el.parentElement.closest('script,style,code,[data-no-translate]')&&el.nodeValue.trim())sources.add(el.nodeValue.trim().replace(/­/g,'').replace(/[  ]/g,' '));}else if(!el.closest('[data-no-translate]'))for(const a of ['aria-label','title','placeholder'])if(el.hasAttribute(a)&&el.getAttribute(a).trim())sources.add(el.getAttribute(a));}}
async function language(p,lang){const sel=p.d.querySelector('[data-language-select]');sel.value=lang;sel.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();await tick();assert.equal(p.js('I18n.language'),lang);}
async function cycle(p){collect(p);const snapshot=p.js('JSON.stringify(CFHApp.state().plan)');for(const lang of ['en','fr']){await language(p,lang);const parts=[];for(const root of p.d.querySelectorAll('main,aside,dialog,#cfhBanner')){const tw=p.d.createTreeWalker(root,4);let n;while((n=tw.nextNode()))if(!n.parentElement.closest('code,[data-no-translate]'))parts.push(n.nodeValue);}const text=parts.join(' ');const left=/.{0,40}(?:Geplant|Auftraggeber|Sägeholz|Ressourcen|Gerückt|Schicht |Waldlager|Bestellt|Hieb\b|Übergabe).{0,40}/.exec(text);if(!process.env.CFH_I18N_COLLECT)assert(!left,'German text remains in '+lang+': '+left?.[0]);}await language(p,'de');assert.equal(p.js('JSON.stringify(CFHApp.state().plan)'),snapshot,'language switch changed the plan');}

(async()=>{
 const results={};
 /* 1. Game link: header button, state API, handoff to the replica (same origin, repo root served). */
 let g=await game({});
 const btn=g.d.getElementById('cfharvestButton');assert(btn,'header button');assert.equal(btn.previousElementSibling.id,'handoverButton');assert.equal(btn.textContent,'CFHarvest Planung');
 assert.equal(g.js("typeof ForestChallenge.getState"),'function');
 assert.equal(g.js("ForestChallenge.setState(Object.assign(ForestChallenge.getState(),{pace:'careful'}));state.pace"),'careful','setState must replace the game state');
 assert.throws(()=>g.js("ForestChallenge.setState({stands:[]})"));
 g.js("state=ForestJourney.initial();render()");
 await click(g,'#startHarvest');assert.equal(g.js('state.phase'),'plan');assert.equal(g.js('state.handoverMode'),'manual');
 await click(g,'#cfharvestButton');assert.equal(g.js('__nav'),'https://forestry.test/cfharvest/app/');
 let storage=g.storage();assert(storage['cfharvest-handoff-v1']&&storage['cfharvest-nonce-v1']&&storage['cfharvest-pending-v1']);

 /* 2. Replica at round 1: three work orders from the contract, chain K-01 = H-01 + F-01. */
 let r=await replica(storage);
 const rows=[...r.d.querySelectorAll('tr[data-row-order]')];assert.deepEqual(rows.map(x=>x.dataset.rowOrder),['H-A01','H-B01','H-C01']);
 assert(rows[0].textContent.includes('Nordhang')&&rows[0].textContent.includes('560 fm')&&rows[0].textContent.includes('SAG')&&rows[0].textContent.includes('IND'));
 assert(rows[0].textContent.includes('Ledig'));
 assert.deepEqual([...r.d.querySelectorAll('[data-cal-row]')].map(x=>x.dataset.calRow),['K-01','H-01','F-01']);
 assert(r.d.querySelector('[data-cal-row="K-01"]').textContent.includes('H-01 + F-01'));
 assert.equal(r.js("CFHApp.vm().meta.contract.id"),'V-26-014');
 await cycle(r);
 // Flytta till resurs: Nordhang → K-01, day 1
 await change(r,'input[data-change="check"][value="H-A01"]',true);await click(r,'[data-action="move-open"]');assert(r.d.getElementById('cfhDialog').open);await cycle(r);
 await change(r,'[data-dialog="row"]','K-01');r.d.querySelector('[data-dialog="mode"][value="day"]').checked=true;await change(r,'[data-dialog="day"]','0');await click(r,'[data-action="move-confirm"]');
 let item=r.d.querySelector('[data-cal-row="K-01"] .cal-item[data-order="H-A01"]');assert(item,'planned item');assert.equal(item.dataset.tone,'dimmed');
 close(parseFloat(item.style.width),2.5/14*100,.01,'capacity: 560 fm / 28 fm/h / 8 h = 2.5 days');assert.equal(parseFloat(item.style.left),0);
 assert(r.d.querySelector('tr[data-row-order="H-A01"]').textContent.includes('Tilldelad'));
 // Skicka till resurs → purple
 await change(r,'input[data-change="row"][value="K-01"]',true);await click(r,'[data-action="cal-send"]');
 item=r.d.querySelector('[data-cal-row="K-01"] .cal-item[data-order="H-A01"]');assert.equal(item.dataset.tone,'purple');assert(item.classList.contains('tone-purple'));
 assert.equal(r.js("CFHApp.vm().dispatch.harvester"),'H-A01');assert.equal(r.js("CFHApp.vm().dispatch.forwarder"),'H-A01');
 // Selection sync: calendar item → panel + list + map
 await click(r,'[data-cal-row="K-01"] .cal-item[data-order="H-A01"]');assert(!r.d.getElementById('cfhPanel').hidden);assert(r.d.querySelector('tr[data-row-order="H-A01"]').classList.contains('selected'));assert(r.d.querySelector('g.map-stand.selected[data-order="H-A01"]'));
 for(const tab of ['order','info','area','products','landings']){await click(r,`[data-action="panel-tab"][data-tab="${tab}"]`);await cycle(r);}
 await click(r,'[data-action="panel-tab"][data-tab="order"]');
 // Map: zoom out to circles and clusters; selecting a circle syncs the list
 await click(r,'[data-action="map-zoom-out"]');assert.equal(r.d.querySelector('.cfh-map').dataset.mapLevel,'1');assert.equal(r.d.querySelectorAll('.map-circle').length,3);
 await click(r,'.map-circle[data-order="H-B01"]');assert(r.d.querySelector('tr[data-row-order="H-B01"]').classList.contains('selected'));
 await click(r,'[data-action="map-zoom-out"]');assert.equal(r.d.querySelectorAll('.map-circle.cluster').length,1);assert(r.d.querySelector('.map-circle.cluster').textContent.includes('3'));await cycle(r);
 await click(r,'.map-circle.cluster');await click(r,'[data-action="map-zoom-in"]');await click(r,'[data-action="map-zoom-in"]');assert.equal(r.d.querySelector('.cfh-map').dataset.mapLevel,'3');assert(r.d.querySelector('.map-bio'));assert(r.d.querySelector('.map-landing'));
 await click(r,'[data-action="map-zoom-out"]');
 // Insert between: Talgrund after Nordhang on K-01, then Südrevier on day 10, Komprimera, Avplanera
 await click(r,'[data-action="insert-mode"]');await click(r,'.cal-insert[data-row="K-01"][data-index="1"]');
 let k=r.js("CFHApp.vm()").rows.find(x=>x.id==='K-01');assert.deepEqual(JSON.parse(JSON.stringify(k.items.map(i=>i.orderId))),['H-A01','H-B01']);close(k.items[1].start,k.items[0].end,1e-9);
 await change(r,'input[data-change="check"][value="H-C01"]',true);await click(r,'[data-action="move-open"]');await change(r,'[data-dialog="row"]','K-01');r.d.querySelector('[data-dialog="mode"][value="day"]').checked=true;await change(r,'[data-dialog="day"]','10');await click(r,'[data-action="move-confirm"]');
 k=r.js("CFHApp.vm()").rows.find(x=>x.id==='K-01');assert(k.items[2].start>k.items[1].end+1,'gap before compress');
 await click(r,'[data-action="compress-open"]');assert(r.d.getElementById('cfhDialog').textContent.includes('Komprimera'));await cycle(r);await click(r,'[data-action="compress-confirm"]');
 k=r.js("CFHApp.vm()").rows.find(x=>x.id==='K-01');close(k.items[2].start,k.items[1].end,1e-9,'compressed');
 await click(r,'[data-cal-row="K-01"] .cal-item[data-order="H-C01"]');await click(r,'[data-action="unplan-open"][data-scope="selected"]');await cycle(r);await click(r,'[data-action="unplan-confirm"]');
 assert(!r.js("CFHApp.vm()").orders.find(o=>o.id==='H-C01').assignment);
 await click(r,'[data-cal-row="K-01"] .cal-item[data-order="H-B01"]');await click(r,'[data-action="unplan-open"][data-scope="selected"]');await click(r,'[data-action="unplan-confirm"]');
 await click(r,'[data-action="close-panel"]');
 // Zoom levels and list functions
 for(const z of ['week','month','day']){await click(r,`[data-action="cal-zoom"][data-zoom="${z}"]`);await cycle(r);}
 await click(r,'[data-action="func-toggle"]');await cycle(r);await click(r,'[data-action="route-mode"]');assert(r.d.querySelector('.route-cell'));await click(r,'[data-action="route-down"][data-order="H-A01"]');assert.deepEqual(JSON.parse(r.js('JSON.stringify(CFHApp.state().plan.routeOrder)')),['H-B01','H-A01','H-C01']);await cycle(r);
 await click(r,'[data-action="func-toggle"]');await click(r,'[data-action="reset-list"]');
 await input(r,'[data-input="search"]','Süd');assert.deepEqual([...r.d.querySelectorAll('tr[data-row-order]')].map(x=>x.dataset.rowOrder),['H-C01']);await input(r,'[data-input="search"]','');
 // Beställningar and Administration
 await click(r,'[data-nav="orders"]');const book=r.d.querySelector('tr[data-book="B-V-26-014-SAG"]');assert(book.textContent.includes('360 fm'));await cycle(r);await click(r,'[data-action="book-confirm"][data-book="B-V-26-014-SAG"]');assert(r.d.querySelector('tr[data-book="B-V-26-014-SAG"]').textContent.includes('Bestätigt'));
 await change(r,'[data-change="book-filter"][data-key="area"]','H-A01');await cycle(r);await change(r,'[data-change="book-filter"][data-key="area"]','');
 assert(r.d.querySelector('[data-view="orders"] button[disabled]').textContent.includes('Export'));
 await click(r,'[data-nav="admin"]');for(const t of ['company','users','roles','chains','contracts','resources']){await click(r,`[data-action="admin-tab"][data-tab="${t}"]`);await cycle(r);}
 for(const t of ['base','prod','week']){await click(r,`[data-action="admin-res-tab"][data-tab="${t}"]`);await cycle(r);}
 assert(r.d.querySelector('[data-view="admin"]').textContent.includes('90001'));
 await change(r,'[data-change="week-day"][value="fri"]',true);await input(r,'[data-admin="hours"]','4');await click(r,'[data-action="week-apply"]');assert(r.d.querySelector('.week-day.manual'));assert.equal(r.js("CFHApp.vm().rows.find(x=>x.id==='K-01').weekly.fri"),4);
 await click(r,'[data-action="week-reset"]');assert.equal(r.js("CFHApp.vm().rows.find(x=>x.id==='K-01').weekly.fri"),8);
 await click(r,'[data-action="admin-res-tab"][data-tab="base"]');await click(r,'[data-action="admin-new"]');assert(r.js("CFHApp.vm().rows.some(x=>x.id==='R-01')"));
 await click(r,'[data-nav="planning"]');
 // Back to the game with the plan applied
 await click(r,'#cfhReturn');assert(r.d.getElementById('cfhDialog').textContent.includes('H-01'));await cycle(r);await click(r,'[data-action="return-confirm"]');assert.equal(r.js('__nav'),'https://forestry.test/dist/');
 const fromReplica=r.storage();assert(fromReplica['cfharvest-return-v1']);
 results.languageCoverageTexts=sources.size;

 /* 3. Game applies the plan: digital handover pre-confirmed, validate passes, shift runs. */
 g=await game({...storage,...fromReplica});
 assert.equal(g.js('state.handoverMode'),'digital');assert.equal(g.js('state.harvester'),'a');assert.equal(g.js('state.forwarder'),'a');assert.equal(g.js('state.cutting'),'current');assert.equal(g.js('state.reporting'),'live');
 assert.equal(g.js('ForestGame.validate(state)'),null);assert.equal(g.js('state.handoverVersions.a'),1);assert(g.d.querySelector('.cfh-applied'));assert(!g.d.getElementById('run').disabled);
 assert.equal(g.storage()['cfharvest-return-v1'],undefined,'return payload consumed once');
 await click(g,'#run');assert.equal(g.js('state.phase'),'receipt');
 const line=g.d.querySelector('.material-balance .cfh-hpr-line');assert(line&&line.textContent.includes('Produktionsmeldung (HPR/FPR) an CFHarvest übertragen'));
 const receipt=g.js('({harvest:state.history[0].harvest,forwarded:state.history[0].forwarded,stock:state.stands.reduce((a,b)=>a+b.stock,0)})');
 const shownHarvest=deNum(g.d.querySelector('.material-balance b').textContent);close(shownHarvest,receipt.harvest,.051,'receipt display');
 await language(g,'en');assert(g.d.querySelector('.cfh-hpr-line').textContent.includes('Production report (HPR/FPR) transferred to CFHarvest'));assert.equal(g.d.getElementById('cfharvestButton').textContent,'CFHarvest Planning');await language(g,'de');
 await click(g,'.cfh-hpr-line button');storage=g.storage();

 /* 4. Production follow-up in the replica matches the receipt; status harvesting (yellow). */
 r=await replica(storage);
 const follow=r.d.querySelector('tr[data-follow="H-A01"]');
 close(Number(follow.dataset.felled),receipt.harvest,.1,'felled');close(Number(follow.dataset.forwarded),receipt.forwarded,.1,'forwarded');close(Number(follow.dataset.stock),receipt.harvest-receipt.forwarded,.1,'forest stock');
 close(deNum(r.d.querySelector('[data-total="forestStock"]').textContent),receipt.stock,.1,'forest stock total');
 assert(follow.textContent.includes('Påbörjad'));assert.equal(r.js("CFHApp.vm().orders[0].status"),'harvesting');
 assert.equal(r.d.querySelector('[data-cal-row="K-01"] .cal-item[data-order="H-A01"]').dataset.tone,'yellow');
 assert(r.d.querySelector('[data-cal-row="H-01"] .cal-report'),'reported HPR on the harvester row');
 await click(r,'[data-nav="orders"]');const saw=r.d.querySelector('tr[data-book="B-V-26-014-SAG"] [data-k="harvested"]');close(deNum(saw.textContent),r.js("CFHApp.vm().orders.reduce((a,o)=>a+o.stand.byGrade.saw.felled,0)"),.051);await click(r,'[data-nav="planning"]');
 await cycle(r);
 results.shift1={felled:+receipt.harvest.toFixed(2),forwarded:+receipt.forwarded.toFixed(2)};

 /* 5. Round 3: PIN v2 required, H-01 still on v1 is flagged; Starta sends PIN v2 and the game accepts it. */
 await click(r,'#cfhReturn');await click(r,'[data-action="return-confirm"]');g=await game({...storage,...r.storage()});
 assert.equal(g.js('state.phase'),'receipt','returning in receipt phase keeps the state unchanged');
 await click(g,'#next');assert.equal(g.js('ForestGame.validate(state)'),null,'round 2 still covered by the v1 handover');await click(g,'#run');await click(g,'#next');
 assert.equal(g.js('state.round'),3);assert(g.js('ForestGame.validate(state)'),'round 3 needs version 2');
 await click(g,'#cfharvestButton');r=await replica(g.storage());
 let a=r.js("CFHApp.vm().orders[0]");assert.equal(a.pin.required,2);assert.equal(a.pin.spec,'4,1');assert.equal(a.pin.loaded,'5,1');assert.equal(a.pin.machineVersion,1);assert(a.pinFlag);
 assert.deepEqual(JSON.parse(r.js("JSON.stringify(CFHApp.vm().dispatch.issues.map(i=>i.code))")),['outdated','outdated']);assert(r.d.querySelector('.cal-item.outdated'));
 await click(r,'[data-action="open-order"][data-order="H-A01"]');await click(r,'[data-action="panel-tab"][data-tab="products"]');assert(r.d.querySelector('[data-pin-flag]'));await cycle(r);
 await click(r,'[data-action="panel-start"]');a=r.js("CFHApp.vm().orders[0]");assert(!a.pinFlag);assert.equal(a.instructions.pinVersion,2);assert.equal(a.instructions.files.pin[0].ProductInstruction.ProductDefinition.ProductVersion,2);
 const files=r.d.querySelector('details.files');assert(files&&files.open&&files.textContent.includes('"fileType": "pin"')&&files.textContent.includes('"fileType": "oin"'));await cycle(r);
 await click(r,'#cfhReturn');await click(r,'[data-action="return-confirm"]');g=await game({...g.storage(),...r.storage()});
 assert.equal(g.js('ForestGame.validate(state)'),null);assert.equal(g.js('state.handoverVersions.a'),2);await click(g,'#run');assert.equal(g.js('state.history[2].downgraded'),0,'current PIN: no downgrade');

 /* 6. Back button without return restores the handed-over state; tampered returns are ignored. */
 g.js("state=ForestJourney.start(ForestJourney.initial());render()");await click(g,'#cfharvestButton');const handed=g.storage();
 let back=await game(handed);assert.equal(back.js('state.phase'),'plan');assert.equal(back.js('state.round'),1);assert.equal(back.storage()['cfharvest-pending-v1'],undefined);
 const forged=JSON.parse(handed['cfharvest-handoff-v1']);forged.kind='to-game';forged.nonce='forged';forged.state.harvester='c';
 back=await game({...handed,'cfharvest-return-v1':JSON.stringify(forged)});assert.equal(back.js('state.harvester'),'a','forged nonce must be rejected');

 /* 7. Two-server setup: dist on :3000, repo root on :3001 → handoff through the URL fragment. */
 let g2=await game({},'http://localhost:3000/');g2.js("state=ForestJourney.start(ForestJourney.initial());render()");await click(g2,'#cfharvestButton');const nav=g2.js('__nav');
 assert(nav.startsWith('http://localhost:3001/cfharvest/app/#cfh='),nav.slice(0,60));
 let r2=await replica({},nav);assert.equal(r2.js("CFHApp.state().source"),'hash');assert.equal(r2.w.location.hash,'');assert.equal(r2.js("CFHApp.state().returnUrl"),'http://localhost:3000/');
 await change(r2,'input[data-change="check"][value="H-C01"]',true);await click(r2,'[data-action="move-open"]');await change(r2,'[data-dialog="row"]','K-01');await click(r2,'[data-action="move-confirm"]');await change(r2,'input[data-change="row"][value="K-01"]',true);await click(r2,'[data-action="cal-send"]');
 await click(r2,'#cfhReturn');await click(r2,'[data-action="return-confirm"]');const back2=r2.js('__nav');assert(back2.startsWith('http://localhost:3000/#cfh-return='));
 g2=await game(g2.storage(),back2);assert.equal(g2.js('state.harvester'),'c');assert.equal(g2.js('state.handoverMode'),'digital');assert.equal(g2.js('ForestGame.validate(state)'),null);assert.equal(g2.w.location.hash,'');
 /* 8. Standalone replica (no handoff) uses a demo state and does not write a return payload. */
 const solo=await replica({});assert.equal(solo.js("CFHApp.state().source"),'demo');assert(solo.d.querySelector('.notice.warn'));await click(solo,'#cfhReturn');await click(solo,'[data-action="return-confirm"]');assert.equal(solo.js('__nav'),'https://forestry.test/dist/');assert.equal(solo.storage()['cfharvest-return-v1'],undefined);

 /* Catalogue coverage of every German phrase seen above. */
 const cat=r.w.ForestryTranslations,keys=Object.keys(cat).sort((x,y)=>y.length-x.length),reg=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const allowed=/CFHarvest|Trimble|Forestry|StanForD|Excel|PDF|Geobasis NRW \/ Land NRW|dl-de\/zero-2-0|BIO-0[123]/g;
 const missing=[...sources].map(source=>({source,remainder:source.replace(reg,'').replace(allowed,'').trim()})).filter(x=>/[a-zäöüß]{3}/i.test(x.remainder));
 if(process.env.CFH_I18N_DUMP)fs.writeFileSync(process.env.CFH_I18N_DUMP,JSON.stringify(missing,null,1));
 assert.deepEqual(missing,[],'Missing replica translations');
 for(const p of [g,r,back,g2,r2,solo])p.close();
 console.log(JSON.stringify({passed:true,...results,acceptance:['three stands as work orders + K-01 chain','Nordhang on K-01 day 1, Skicka → purple','game: digital handover pre-confirmed, validate null','follow-up = receipt (0.1 fm), status harvesting','round 3: PIN v2, H-01 on v1 flagged','two-server fragment handoff with nonce'],mode:'jsdom DOM contract; browser layout not tested'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
