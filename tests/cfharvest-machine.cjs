// DOM contract test for the CFHarvest on-board (Maskin) client (cfharvest/machine, PLAN_OVERNIGHT §5, PLAN.md Phase 3).
// jsdom only; browser layout is not simulated (the map click stubs the SVG rectangle). Flow: plan and send in the planning
// app → machine list in route order → five-tab gate → start loads OIN/PIN (harvester) or FOI/FDI (forwarder) → manual
// HPR, Ernte beenden, forwarder start, Skotningsanmälan (manual + from piles) → planning follow-up → Slutvärdering with the
// planned-vs-reported warning → completed. Round 3: PIN version warning. Precedence of game shifts over manual reports.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const filesOf=(html,dir)=>[...fs.readFileSync(html,'utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>path.normalize(path.join(dir,m[1])));
const REPLICA_FILES=filesOf('cfharvest/app/index.html','cfharvest/app'),MACHINE_FILES=filesOf('cfharvest/machine/index.html','cfharvest/machine');
const GAME_FILES=['i18n-catalog','i18n','game','journey','routes','flyover','handover','journey-ui','scenes','app','cfharvest-link'].map(f=>'dist/'+f+'.js');
function patch(w){w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLCanvasElement.prototype.getContext=()=>null;w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};}
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
const replica=(storage,url='https://forestry.test/cfharvest/app/')=>page('cfharvest/app/index.html',REPLICA_FILES,url,storage);
const machine=async(storage,url='https://forestry.test/cfharvest/machine/',lang)=>{const p=await page('cfharvest/machine/index.html',MACHINE_FILES,url,storage,lang);p.js('CFHMachine.api.navigate=u=>{globalThis.__nav=u;}');return p;};
async function click(p,selector){const el=typeof selector==='string'?p.d.querySelector(selector):selector;assert(el,'missing '+selector);assert(!el.disabled,'disabled '+selector);el.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true}));await tick();return el;}
async function change(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();return el;}
async function input(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));await tick();}
const close=(a,b,tol=.1,msg)=>assert(Math.abs(a-b)<=tol,`${msg||''} ${a} != ${b}`);
const mvm=p=>p.js('CFHMachine.vm()'),order=(p,id)=>mvm(p).orders.find(o=>o.id===id),plan=p=>JSON.parse(p.js('JSON.stringify(CFHMachine.state().plan)'));
const listIds=p=>[...p.d.querySelectorAll('[data-orders] [data-action="open-order"]')].map(b=>b.dataset.order);
async function as(p,res){await click(p,`[data-action="resource"][data-res="${res}"]`);assert.equal(p.d.querySelector('[data-action="resource"][aria-pressed="true"]').dataset.res,res);}
async function openAllTabs(p){for(const k of ['info','area','products','landings'])await click(p,`[data-action="tab"][data-tab="${k}"]`);}

/* ---------- Language checks (same approach as tests/cfharvest-ui.cjs) ---------- */
const sources=new Set();
const SV_ONLY=/(?<![\p{L}])(Planering|Arbetsorder\p{L}*|Övrig info|Område|Avlägg|Starta|överför|mätdon|Skotningsanmälan|Provytemätning|Slutvärdering|Tillägg|Avdrag|Avsluta|avverkning\p{L}*|Rita rutt|Sluta rita|Funktioner|Statusändringar|Maskin|Karta|Skördare|Skotare)(?![\p{L}])/u;
function collect(p){
  const walker=p.d.createTreeWalker(p.d.body,1|4);let el;
  while((el=walker.nextNode())){
    if(el.nodeType===3){if(!el.parentElement.closest('script,style,code,[data-no-translate]')&&el.nodeValue.trim())sources.add(el.nodeValue.trim().replace(/­/g,'').replace(/[  ]/g,' '));}
    else if(!el.closest('[data-no-translate]'))for(const a of ['aria-label','title','placeholder'])if(el.hasAttribute(a)&&el.getAttribute(a).trim())sources.add(el.getAttribute(a).replace(/(?:^| · )SV: .*$/,'').trim());
  }
  const leaks=[],tw=p.d.createTreeWalker(p.d.body,4);let n;
  while((n=tw.nextNode())){if(n.parentElement.closest('script,style,pre,code,.sv-cap,[lang="sv"]'))continue;const m=SV_ONLY.exec(n.nodeValue);if(m)leaks.push(m[0]+' ← '+n.nodeValue.trim().slice(0,60));}
  assert.deepEqual(leaks,[],'Swedish UI text outside the term captions');
}

(async()=>{
 const results={};
 /* 1. Planning app (demo, no handoff): Nordhang + Südrevier on K-01, sent; Südrevier first in the route order (Lfd. Nr.). */
 let r=await replica({});
 assert(r.d.querySelector('a.cfh-machine-link[href="../machine/"]'),'header link to the machine app');
 await click(r,'tr[data-row-order="H-A01"] td[data-col="client"]');await change(r,'[data-change="pick-row"]','K-01');await click(r,'[data-action="move-open"]');
 r.d.querySelector('[data-dialog="date"]').value='2026-10-19';await click(r,'[data-action="date-ok"]');await click(r,'[data-action="stage-save"]');
 await click(r,'tr[data-row-order="H-C01"] td[data-col="client"]');await click(r,'[data-action="move-open"]');await click(r,'[data-action="date-last"]');await click(r,'[data-action="stage-save"]');
 await change(r,'input[data-change="row"][value="K-01"]',true);await click(r,'[data-action="send-open"]');await click(r,'[data-action="send-confirm"]');
 await change(r,'[data-change="seq"][data-order="H-C01"]','1');
 assert.deepEqual(r.js('CFHApp.state().base.routeOrder').slice(0,2),['H-C01','H-A01']);
 assert.equal(r.js("CFHApp.vm().orders.find(o=>o.id==='H-A01').status"),'sent');
 const planned=r.storage();r.close();

 /* 2. Machine app as H-01: Planering in route order (Südrevier first although Nordhang starts first), open/closed filter. */
 let m=await machine(planned);
 assert.equal(m.js('CFHMachine.state().source'),'demo');
 assert.equal(m.d.querySelector('[data-action="resource"][aria-pressed="true"]').dataset.res,'H-01','default login H-01');
 assert(m.d.querySelector('.m-login').textContent.includes('Angemeldet als'));
 assert.deepEqual(listIds(m),['H-C01','H-A01'],'route order, top item first; Talgrund (not sent) is not listed');
 assert.equal(m.d.querySelector('[data-orders] .m-seq').textContent,'1');
 assert(m.d.querySelector('[data-order="H-A01"] .pill.pill-team'),'status pill (sent to the chain = teal)');
 await click(m,'[data-action="filter"][data-key="closed"]');assert.equal(listIds(m).length,0);await click(m,'[data-action="filter"][data-key="open"]');
 collect(m);
 results.list=listIds(m);

 /* 3. Five-tab gate: the first tab is viewed on opening; start stays disabled until all five are green. */
 await click(m,'[data-action="open-order"][data-order="H-A01"]');
 assert.equal(m.d.querySelector('[data-screen="order"]').dataset.order,'H-A01');
 assert.deepEqual([...m.d.querySelectorAll('.m-tabs [data-action="tab"]')].map(b=>b.dataset.tab),['order','info','area','products','landings']);
 assert.deepEqual([...m.d.querySelectorAll('.m-tabs button.seen')].map(b=>b.dataset.tab),['order']);
 assert(m.d.querySelector('[data-action="start"]').disabled,'start disabled with 1/5 tabs');assert(m.d.querySelector('[data-start-hint]').textContent.includes('(1/5)'));
 for(const [i,k] of ['info','area','products','landings'].entries()){
   assert(m.d.querySelector('[data-action="start"]').disabled,'still disabled before '+k);
   await click(m,`[data-action="tab"][data-tab="${k}"]`);assert(m.d.querySelector(`[data-action="tab"][data-tab="${k}"]`).classList.contains('seen'),k+' turns green');
   assert.equal(m.d.querySelector(`[data-tab-body="${k}"]`)?.dataset.tabBody,k);collect(m);
   assert(m.d.querySelector('[data-gate]').textContent.includes(`${i+2}/5`));
 }
 assert(!m.d.querySelector('[data-action="start"]').disabled,'start enabled after all five tabs (status sent)');
 assert.deepEqual(plan(m).machine.orders['H-A01'].tabs['H-01'],['order','info','area','products','landings'],'viewed tabs are stored in the plan');
 // Harvester files: OIN + PIN of the last Skicka, no PIN warning in round 1.
 const hFiles=[...m.d.querySelectorAll('[data-files] li')].map(li=>li.textContent);
 assert(hFiles.some(t=>t.includes('OIN_H-A01_v1'))&&hFiles.some(t=>t.includes('SAG_Nordhang_5-1m_v1'))&&!hFiles.some(t=>/FOI|FDI/.test(t)),'harvester gets OIN + PIN');
 assert(!m.d.querySelector('[data-pin-flag]'),'round 1: no PIN warning');
 await input(m,'[data-msg]','Start Nordhang, Rückegasse 3 zuerst');await click(m,'[data-action="send-message"]');
 assert(plan(m).messages.some(x=>x.to==='crew'&&x.from==='H-01'&&x.orderId==='H-A01'&&x.kind==='start'),'start message sent to the crew');
 await click(m,'[data-action="start"]');
 assert.equal(order(m,'H-A01').status,'harvesting','sent → harvesting');
 let loaded=plan(m).machine.loaded['H-01'];assert.equal(loaded.orderId,'H-A01');assert.equal(loaded.pinVersion,1);
 assert(loaded.files.some(f=>f.kind==='OIN')&&loaded.files.some(f=>f.kind==='PIN')&&!loaded.files.some(f=>f.kind==='FOI'),'harvester device holds OIN/PIN');
 assert(m.d.querySelector('[data-loaded]').textContent.includes('OIN_H-A01_v1'));assert(m.d.querySelector('[data-action="start"]').disabled,'started once');
 collect(m);

 /* 4. Map: orthophoto, stand, landings, machine position, route drawing, progress bar. */
 await click(m,'[data-action="section"][data-key="map"]');
 assert(m.d.querySelector('svg.m-map image')?.getAttribute('href').endsWith('assets/forest-orthophoto.jpg'));
 assert(m.d.querySelector('svg.m-map .map-stand.pill-started polygon'),'stand coloured by status');assert(m.d.querySelector('svg.m-map .map-landing'));assert(m.d.querySelector('svg.m-map [data-machine="H-01"]'),'machine position');
 await click(m,'[data-action="route-toggle"]');assert(m.d.querySelector('.m-map-wrap.drawing'));assert(m.d.querySelector('[data-action="route-toggle"] .sv-cap').textContent.includes('Sluta rita rutt'));
 const svg=m.d.querySelector('svg.m-map'),[bx,by,bw,bh]=svg.getAttribute('viewBox').split(' ').map(Number);svg.getBoundingClientRect=()=>({left:0,top:0,width:bw,height:bh,right:bw,bottom:bh,x:0,y:0});
 for(const [x,y] of [[30,30],[60,40]]){const s=m.d.querySelector('svg.m-map');s.getBoundingClientRect=()=>({left:0,top:0,width:bw,height:bh,right:bw,bottom:bh,x:0,y:0});s.dispatchEvent(new m.w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));await tick();}
 let route=plan(m).machine.orders['H-A01'].route['H-01'];assert.equal(route.points.length,2);close(route.points[0].point[0],bx+30,.2);
 assert(m.d.querySelector('[data-drawn="H-01"] polyline'),'drawn route');
 await click(m,'[data-action="legend"]');await click(m,'[data-action="map-mode"][data-key="species"]');assert(m.d.querySelector('svg.m-map .map-stand.pill-species'));await click(m,'[data-action="layers"]');assert(m.d.querySelector('[data-map-resources]').textContent.includes('F-01'));
 await click(m,'[data-action="route-toggle"]');assert(!m.d.querySelector('.m-map-wrap.drawing'));collect(m);

 /* 5. Funktioner (harvester): manual HPR per assortment, sample plot, Ernte beenden → felled. */
 await click(m,'[data-action="section"][data-key="functions"]');
 assert(m.d.querySelector('[data-action="func"][data-func="forwarding"]').disabled,'Skotningsanmälan is the forwarder\'s');assert(m.d.querySelector('[data-action="func"][data-func="evaluation"]').disabled);
 await click(m,'[data-action="func"][data-func="report"]');await input(m,'[data-form="saw"]','60');await input(m,'[data-form="pulp"]','30');collect(m);await click(m,'[data-action="report-save"]');
 let a=order(m,'H-A01');close(a.followUp.felledByShifts,90,1e-9,'manual HPR in the follow-up');assert(m.d.querySelector('[data-reports] tr[data-report]'));
 const hpr=mvm(m).production.messages.find(x=>x.kind==='manual'&&x.type==='HPR');assert.deepEqual({type:hpr.type,round:hpr.round,objectKey:hpr.objectKey,machineKey:hpr.machineKey,volume:hpr.volume},{type:'HPR',round:1,objectKey:'H-A01',machineKey:'H-01',volume:90});
 await click(m,'[data-action="section"][data-key="map"]');await click(m,'[data-action="section"][data-key="functions"]');
 await click(m,'[data-action="func"][data-func="plot"]');await input(m,'[data-plot="stems"]','450');await input(m,'[data-plot="dbh"]','28.5');await click(m,'[data-action="plot-save"]');
 assert.deepEqual(JSON.parse(m.js("JSON.stringify(CFHMachine.state().plan.machine.orders['H-A01'].plots)")),[{plotId:'P1',stems:450,dbh:28.5,resourceId:'H-01',round:1,quality:'HQC'}]);collect(m);
 await click(m,'[data-action="func"][data-func="end"]');assert(m.d.querySelector('[data-func-body="end"] [data-volume-warning]'),'felled volume differs from the plan');collect(m);await click(m,'[data-action="end-confirm"]');
 assert.equal(order(m,'H-A01').status,'felled','harvesting → felled');

 /* 6. Forwarder: own five tabs, start loads FOI/FDI, status forwarding. */
 await as(m,'F-01');assert.equal(m.d.querySelector('[data-screen="order"]')?.dataset.order,'H-A01','order stays open: F-01 is on the chain');
 await click(m,'[data-action="back"]');assert.deepEqual(listIds(m),['H-C01','H-A01']);await click(m,'[data-action="open-order"][data-order="H-A01"]');
 assert.deepEqual([...m.d.querySelectorAll('.m-tabs button.seen')].map(b=>b.dataset.tab),['order'],'tabs are per machine');assert(m.d.querySelector('[data-action="start"]').disabled);
 const fFiles=[...m.d.querySelectorAll('[data-files] li')].map(li=>li.textContent);assert(fFiles.some(t=>t.includes('FOI_H-A01_v1'))&&fFiles.some(t=>t.includes('FDI_H-A01_v1'))&&!fFiles.some(t=>/OIN|PIN/.test(t)),'forwarder gets FOI + FDI');
 await openAllTabs(m);await click(m,'[data-action="start"]');assert.equal(order(m,'H-A01').status,'forwarding','felled → forwarding');
 loaded=plan(m).machine.loaded['F-01'];assert.deepEqual(loaded.files.map(f=>f.kind),['FOI','FDI']);

 /* 7. Skotningsanmälan: manual per assortment and from piles on the map → FPR lines. */
 await click(m,'[data-action="section"][data-key="functions"]');assert(m.d.querySelector('[data-action="func"][data-func="report"]').disabled,'HPR is the harvester\'s');
 await click(m,'[data-action="func"][data-func="forwarding"]');await input(m,'[data-form="saw"]','40');await click(m,'[data-action="report-save"]');
 close(order(m,'H-A01').followUp.forwarded,40,1e-9);
 await click(m,'[data-action="report-mode"][data-key="piles"]');assert(m.d.querySelector('svg.m-map[data-map="piles"]'));const pilesShown=[...m.d.querySelectorAll('.m-pile')].map(g=>g.dataset.key);assert.deepEqual(pilesShown,['saw','pulp'],'piles = forest stock per assortment');
 assert(m.d.querySelector('.m-pile[data-key="saw"] text').textContent.includes('20'),'saw pile = 60 harvested − 40 forwarded');
 await click(m,'.m-pile[data-key="pulp"]');assert(m.d.querySelector('.m-pile[data-key="pulp"]').classList.contains('selected'));assert.equal(m.d.querySelector('[data-form="pulp"]').value,'30.0');collect(m);
 await click(m,'[data-action="report-save"]');a=order(m,'H-A01');close(a.followUp.forwarded,70,1e-9,'FPR from piles');
 const fpr=plan(m).machine.reports.filter(x=>x.type==='FPR');assert.deepEqual(fpr.map(x=>x.source),['manual','piles']);assert.deepEqual(fpr[1].piles,['pulp']);
 // Sample plot as forwarder → FQC.
 await click(m,'[data-action="func"][data-func="plot"]');await input(m,'[data-plot="stems"]','380');await input(m,'[data-plot="dbh"]','26');await click(m,'[data-action="plot-save"]');assert.equal(plan(m).machine.orders['H-A01'].plots[1].quality,'FQC');
 const afterReports=m.storage();

 /* 8. Planning follow-up shows the machine's FPR/HPR, the status and the status changes. */
 r=await replica(afterReports);
 assert.equal(r.js('CFHApp.state().source'),'demo');assert.equal(r.js("CFHApp.vm().orders.find(o=>o.id==='H-A01').status"),'forwarding','planning pill follows the machine status');
 assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').className,'pill pill-started');
 await change(r,'[data-change="view-toggle"][value="resources"]',true);
 const follow=r.d.querySelector('tr[data-follow="H-A01"]');close(Number(follow.dataset.felled),90,1e-9,'felled');close(Number(follow.dataset.forwarded),70,1e-9,'forwarded (FPR lines)');close(Number(follow.dataset.stock),20,1e-9,'forest stock = felled − forwarded');
 close(Number(r.d.querySelector('tr[data-resource="F-01"] [data-produced]').textContent.replace(/[^\d,]/g,'').replace(',','.')),70,.05,'produced by F-01');
 await click(r,'[data-nav="integration"]');assert.equal(r.d.querySelectorAll('[data-integration] tr[data-dir="in"]').length,3,'HPR + 2 FPR incoming');assert(r.d.querySelector('[data-integration]').textContent.includes('manuell'));
 await click(r,'[data-nav="planning"]');await click(r,'[data-action="open-order"][data-order="H-A01"]');await click(r,'[data-action="detail-tab"][data-tab="status"]');
 assert(r.d.querySelector('[data-status-log]').textContent.includes('Fällung beendet'),'machine status changes in the planning status log');
 await click(r,'[data-action="detail-tab"][data-tab="plots"]');assert.equal(r.d.querySelectorAll('[data-plots] tbody tr').length,2,'sample plots in Provytor');
 await click(r,'[data-nav="messages"]');assert(r.d.querySelector('[data-message][data-to="crew"]').textContent.includes('Start Nordhang'),'start message listed');
 r.close();

 /* 9. Slutvärdering: planned vs reported warning, Tillägg/avdrag, worked area; "Nein" → completed, order closed. */
 await click(m,'[data-action="func"][data-func="evaluation"]');
 assert(m.d.querySelector('[data-volume-warning]'),'planned 560 fm vs reported 90 / 70 fm');assert.equal(m.d.querySelectorAll('[data-check].warn').length,2);
 assert(m.d.querySelector('[data-action="evaluation-save"]').disabled,'Ja/Nein required');
 await input(m,'[data-eval="adj-text"][data-i="0"]','Steilhang');await input(m,'[data-eval="adj-amount"][data-i="0"]','120');await input(m,'[data-eval="area"]','1.5');assert.equal(m.d.querySelector('[data-rest-area]').textContent,'0,4 ha');
 await change(m,'[data-eval="more"][value="no"]',true);assert(!m.d.querySelector('[data-action="evaluation-save"]').disabled);collect(m);await click(m,'[data-action="evaluation-save"]');
 assert.equal(order(m,'H-A01').status,'completed','forwarding → completed');assert.equal(m.d.querySelector('[data-screen]').dataset.screen,'list','saving closes the order');
 assert.deepEqual(listIds(m),['H-C01']);await click(m,'[data-action="filter"][data-key="closed"]');assert.deepEqual(listIds(m),['H-A01']);
 const ev=plan(m).machine.orders['H-A01'].evaluation;assert.equal(ev.more,'no');assert.equal(ev.workedArea,1.5);assert.deepEqual(ev.adjustments,[{kind:'addition',text:'Steilhang',amount:120}]);assert(ev.checks.harvest<-.8);
 // Statusändringar: sent → harvesting → felled → forwarding → completed.
 await click(m,'[data-action="open-order"][data-order="H-A01"]');await click(m,'[data-action="section"][data-key="status"]');
 assert.deepEqual([...m.d.querySelectorAll('[data-status-change]')].map(t=>t.dataset.statusChange),['harvesting','felled','forwarding','completed']);
 assert(m.d.querySelector('[data-status-log]').textContent.includes('An Ressource gesendet'));collect(m);
 r=await replica(m.storage());assert.equal(r.js("CFHApp.vm().orders.find(o=>o.id==='H-A01').status"),'completed');assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').className,'pill pill-completed');
 assert.equal(r.d.querySelector('[data-cal-row="K-01"] .cal-item[data-order="H-A01"]').dataset.tone,'completed','calendar bar follows');r.close();
 results.flow=['sent','harvesting','felled','forwarding','completed'];

 /* 10. Precedence: game shift results overwrite manual reports of the same shift (model). */
 const merged=m.js(`(()=>{const game=[{type:'HPR',kind:'shift',round:1,objectKey:'H-B01',volume:150}],man=[{type:'HPR',kind:'manual',round:1,objectKey:'H-A01',volume:90},{type:'FPR',kind:'manual',round:2,objectKey:'H-A01',volume:40}];return JSON.stringify(CFHModel.mergeProduction(game,man).map(x=>x.kind+x.round));})()`);
 assert.deepEqual(JSON.parse(merged),['shift1','manual2'],'manual shift-1 report dropped once the game has shift 1');
 m.close();

 /* 11. Round 3: the device still holds PIN v1 while the order requires v2 (the game's round-3 case); re-send → transfer → v2. */
 let g=await machine({});
 const env3=g.js(`(()=>{let s=ForestJourney.start(ForestJourney.initial());const snap1=CFHBridge.fromGameState(s);let p=CFHModel.assign(CFHModel.emptyPlan(),snap1,['H-A01'],'K-01',{mode:'day',day:0});p=CFHModel.send(p,snap1,{rowIds:['K-01']});
   p=CFHModel.addMachineReport(p,{type:'HPR',resourceId:'H-01',orderId:'H-A01',round:1,products:{saw:10}});delete p.lastReport;p.basis={historyLength:0,contractId:snap1.meta.contract.id};p.savedAt=1;
   s=ForestGame.calculate(s).next;s=ForestGame.nextShift(s);s=ForestGame.calculate(s).next;s=ForestGame.nextShift(s);
   return JSON.stringify(CFHBridge.envelope('to-replica',s,{plan:p,lang:'de',nonce:'n-3',returnUrl:'https://forestry.test/dist/'}));})()`);
 g.close();
 m=await machine({'cfharvest-handoff-v1':env3});
 assert.equal(m.js('CFHMachine.state().source'),'game');assert.equal(mvm(m).meta.round,3);assert(!m.d.getElementById('mReturn').hidden,'back to the game');
 assert.deepEqual(listIds(m),['H-A01']);await click(m,'[data-action="open-order"][data-order="H-A01"]');
 assert.equal(order(m,'H-A01').status,'harvesting','game shifts 1–2 harvested Nordhang');
 let flags=[...m.d.querySelectorAll('[data-pin-flag]')].map(x=>x.textContent);
 assert(flags.some(t=>t.includes('H-01')&&t.includes('arbeitet noch mit')&&t.includes('PIN v1')&&t.includes('(5,1 m)')&&t.includes('Auftrag verlangt')&&t.includes('PIN v2')&&t.includes('(4,1 m)')&&t.includes('Abwertungsrisiko')),'same text as the planning flag for the round-3 case');
 assert(flags.some(t=>t.includes('Gesendete Dateien sind veraltet')),'planner must re-send');
 assert(m.d.querySelector('[data-pin-flag].block'),'cached cutting = blocking colour, as in the planning app');
 // Manual round-1 report is overwritten by the game's shift 1.
 assert(!mvm(m).production.messages.some(x=>x.kind==='manual'),'manual shift-1 report replaced by the game shift');close(order(m,'H-A01').followUp.felledByShifts,m.js("CFHMachine.vm().production.messages.filter(x=>x.kind==='shift'&&x.type==='HPR'&&x.objectKey==='H-A01').reduce((s,x)=>s+x.volume,0)"),1e-9);
 await click(m,'[data-action="section"][data-key="functions"]');await click(m,'[data-action="func"][data-func="transfer"]');await click(m,'[data-action="transfer"]');
 assert.equal(plan(m).machine.loaded['H-01'].pinVersion,1);assert(m.d.querySelector('[data-pin-flag]'),'transferring the old files keeps the warning');
 await click(m,'[data-action="func"][data-func="report"]');assert(m.d.querySelector('[data-reports]').textContent.includes('durch Spielschicht ersetzt'));collect(m);
 // Planner re-sends in round 3 (PIN v2); the machine pulls it and the warning disappears.
 r=await replica(m.storage());await click(r,'[data-action="send-open"]');await click(r,'[data-action="send-confirm"]');assert.equal(r.js("CFHApp.vm().orders[0].instructions.pinVersion"),2);const resent=r.storage();r.close();m.close();
 m=await machine(resent);await click(m,'[data-action="open-order"][data-order="H-A01"]');assert(m.d.querySelector('[data-pin-flag]'),'device still on v1 until the transfer');
 await click(m,'[data-action="section"][data-key="functions"]');await click(m,'[data-action="func"][data-func="transfer"]');assert(m.d.querySelector('[data-func-body="transfer"]').textContent.includes('Nordhang_4-1m_v2'));await click(m,'[data-action="transfer"]');
 assert.equal(plan(m).machine.loaded['H-01'].pinVersion,2);assert(!m.d.querySelector('[data-pin-flag]'),'v2 on the device: no warning');
 await click(m,'[data-action="return"]');assert.equal(m.js('__nav'),'https://forestry.test/dist/');
 m.close();
 results.pinWarning=['v1 on device vs v2 required','outdated send','transfer v2 clears'];

 /* 12. Game entry point: one additive link in the handover dialog opens the machine app with the unchanged envelope. */
 g=await page('dist/index.html',GAME_FILES,'https://forestry.test/dist/?cfharvest=1',{});g.js('CFHarvestLink.navigate=u=>{globalThis.__nav=u;}');
 g.js("state=ForestJourney.start(ForestJourney.initial());render();openHandover('a')");await tick();
 const link=g.d.querySelector('#handoverContent #cfhMachineLink');assert(link,'machine link in the handover dialog');assert.equal(link.textContent.replace(/\s+/g,' ').trim(),'Maschine (Maskin)');
 await click(g,'#handoverContent [data-report="b"]');assert(g.d.querySelector('#handoverContent #cfhMachineLink'),'link survives switching the report tab');
 await click(g,'#cfhMachineLink');assert.equal(g.js('__nav'),'https://forestry.test/cfharvest/machine/');
 const env=JSON.parse(g.storage()['cfharvest-handoff-v1']);assert.deepEqual(Object.keys(env).sort(),['kind','lang','nonce','plan','returnUrl','schema','sentAt','state'],'envelope shape unchanged');assert.equal(env.kind,'to-replica');
 const fromGame=await machine(g.storage());assert.equal(fromGame.js('CFHMachine.state().source'),'game');fromGame.close();g.close();

 /* 13. i18n: every German machine phrase is in the catalogue (EN/FR), Swedish only as captions; English load works. */
 const cat=require('../cfharvest/app/i18n-cfharvest.js'),game=(()=>{const c=vm.createContext({});vm.runInContext(fs.readFileSync('dist/i18n-catalog.js','utf8'),c);return vm.runInContext('globalThis.ForestryTranslations',c)||{};})();
 const all={...game,...cat},keys=Object.keys(all).sort((x,y)=>y.length-x.length),reg=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const allowed=/CFHarvest|Trimble|Forestry|StanForD|\bTRI\b|\b(?:PIN|OIN|FOI|FDI|HPR|FPR|HQC|FQC|SAG|IND|ABW)\b|Geobasis NRW|dl-de\/zero-2-0|BIO-0[123]|Harvester|Forwarder|\bfm\b|\bha\b|\bv\d\b/g;
 const missing=[...sources].map(source=>({source,remainder:source.replace(reg,'').replace(allowed,'').trim()})).filter(x=>/[a-zäöüß]{3}/i.test(x.remainder));
 if(process.env.CFH_I18N_DUMP)fs.writeFileSync(process.env.CFH_I18N_DUMP,JSON.stringify(missing,null,1));
 assert.deepEqual(missing,[],'Missing machine translations');
 for(const [de,t] of Object.entries(cat))assert(Array.isArray(t)&&t.length===2&&t.every(x=>typeof x==='string'&&x.trim()),'EN/FR for '+de);
 const en=await machine(planned,undefined,'en');assert(en.d.querySelector('.m-login').textContent.includes('Logged in as'));await click(en,'[data-action="open-order"][data-order="H-A01"]');
 assert(en.d.querySelector('[data-action="start"]').textContent.includes('Start, transfer to the measuring device'));assert(en.d.querySelector('[data-action="start"] .sv-cap').textContent.includes('Starta, överför till mätdon'));en.close();
 const fr=await machine(planned,undefined,'fr');assert(fr.d.querySelector('[data-screen="list"] h1').textContent.includes('Planification'));fr.close();
 console.log(JSON.stringify({passed:true,...results,machinePhrasesChecked:sources.size,mode:'jsdom DOM contract; browser layout not tested'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
