// DOM contract test for the CFHarvest replica (cfharvest/app) and its game link (dist/cfharvest-link.js).
// jsdom only; no browser layout is simulated (drop positions use a stubbed track rectangle). Covers the PLAN.md Phase 2
// acceptance flow end to end plus milestone 2: German-first labels, drag and drop (HTML5 events and Pointer Events),
// Kopiera, insert-between with Spara, Skicka dialog with the PIN banner, status pill colours, detail page, admin.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const GAME_FILES=['i18n-catalog','i18n','game','journey','routes','flyover','handover','journey-ui','scenes','app','cfharvest-link'].map(f=>'dist/'+f+'.js');
// The replica's own script list, read from its index.html so the test follows the page.
const REPLICA_FILES=[...fs.readFileSync('cfharvest/app/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>path.normalize(path.join('cfharvest/app',m[1])));
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
const game=async(storage,url='https://forestry.test/dist/?cfharvest=1')=>{const p=await page('dist/index.html',GAME_FILES,url,storage);p.js('CFHarvestLink.navigate=u=>{globalThis.__nav=u;}');return p;};
const replica=async(storage,url='https://forestry.test/cfharvest/app/')=>{const p=await page('cfharvest/app/index.html',REPLICA_FILES,url,storage);p.js('CFHApp.api.navigate=u=>{globalThis.__nav=u;};CFHApp.api.print=()=>{globalThis.__printed=true;};CFHApp.api.download=(n,t)=>{globalThis.__download=[n,t];}');return p;};
async function click(p,selector){const el=typeof selector==='string'?p.d.querySelector(selector):selector;assert(el,'missing '+selector);assert(!el.disabled,'disabled '+selector);el.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true}));await tick();return el;}
async function change(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();return el;}
async function input(p,selector,value){const el=p.d.querySelector(selector);assert(el,'missing '+selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));await tick();}
const close=(a,b,tol=.1,msg)=>assert(Math.abs(a-b)<=tol,`${msg||''} ${a} != ${b}`);
const deNum=s=>Number(String(s).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));
const vmOf=p=>p.js('CFHApp.vm()'),barsOf=(p,order)=>[...p.d.querySelectorAll(`.cal-item[data-item][data-order="${order}"]`)];
const bar=(p,row,order)=>p.d.querySelector(`[data-cal-row="${row}"] .cal-item[data-item][data-order="${order}"]`);
const itemsOf=(p,row)=>vmOf(p).rows.find(r=>r.id===row).items;

/* ---------- Drag and drop simulation (layout stubbed: every track is 700 px wide at x = 0) ---------- */
const TRACK_W=700;
function stubTracks(p){for(const t of p.d.querySelectorAll('[data-drop-row]'))t.getBoundingClientRect=()=>({left:0,top:0,right:TRACK_W,bottom:40,width:TRACK_W,height:40,x:0,y:0});}
function xForDay(p,track,day,frac=.5){return (day+frac-Number(track.dataset.off))/Number(track.dataset.days)*TRACK_W;}
function fire(p,type,el,props={}){const ev=new p.w.Event(type,{bubbles:true,cancelable:true});for(const [k,v] of Object.entries(props))Object.defineProperty(ev,k,{value:v});el.dispatchEvent(ev);return ev;}
function dataTransfer(){const data={};return{data,setData:(k,v)=>{data[k]=String(v);},getData:k=>data[k]||'',setDragImage(el){this.image=el;},effectAllowed:'',dropEffect:''};}
async function html5Drag(p,src,row,day,frac=.5){
  stubTracks(p);const track=p.d.querySelector(`[data-drop-row="${row}"]`);assert(track,'track '+row);const dt=dataTransfer(),x=xForDay(p,track,day,frac);
  fire(p,'dragstart',src,{dataTransfer:dt});assert(dt.data['text/plain'],'drag payload');assert(dt.image&&dt.image.textContent.trim(),'ghost label');
  const over=fire(p,'dragover',track,{dataTransfer:dt,clientX:x,clientY:10});assert(over.defaultPrevented,'track accepts the drop');
  assert(track.classList.contains('drop-hover')&&track.querySelector('.drop-day'),'drop target highlighted');
  fire(p,'drop',track,{dataTransfer:dt,clientX:x,clientY:10});fire(p,'dragend',src,{dataTransfer:dt});await tick();await tick();
  return dt;
}
async function pointerDrag(p,src,row,day){
  stubTracks(p);const track=p.d.querySelector(`[data-drop-row="${row}"]`),x=xForDay(p,track,day);p.js('CFHApp.config.longPress=0');
  p.d.elementFromPoint=()=>track;const base={pointerType:'touch',pointerId:7,button:0,isPrimary:true};
  fire(p,'pointerdown',src,{...base,clientX:5,clientY:5});fire(p,'pointermove',p.d,{...base,clientX:x/2,clientY:8});
  assert(p.d.getElementById('cfhGhost').classList.contains('show'),'touch ghost visible');assert(track.querySelector('.drop-day'),'touch drop target highlighted');
  fire(p,'pointermove',p.d,{...base,clientX:x,clientY:8});fire(p,'pointerup',p.d,{...base,clientX:x,clientY:8});await tick();await tick();
  await new Promise(res=>setTimeout(res,450)); // the click that follows a touch drop is swallowed for 400 ms
}

/* ---------- Language checks ---------- */
const sources=new Set();
const SV_ONLY=/(?<![\p{L}])(Uppdragslista|Uppdrag på kartan|Resurser|Arbetsorder\p{L}*|Arbetsplanering|Ledig|Tilldelad|Påbörjad|Avslutad|Skicka\p{L}*|Avplanera\p{L}*|Komprimera|Flytta|Kopiera|Spara|Återställ|Beställning\p{L}*|Åtgärd|Avlägg|Drivning\p{L}*|Veckokalender|Veckoarbetstid|Grunddata|Produktionsdata|Enhetdata|Funktioner|Godkänn|Avbryt|Lägg till|Välj\p{L}*|Övrig|Kontaktuppgifter|Statusändringar|Hänsyn|Säkerhet|Planerad|Slutavverkning|Gallring|Användare|Arbetsgrupp\p{L}*|Uppdragsgivare|Meddelanden|Integrationslogg|Rapporter|Hjälp|Obligatorisk|Förhandsanmälan|Sortimentsgrupp)(?![\p{L}])/u;
function swedishLeaks(p){const out=[],tw=p.d.createTreeWalker(p.d.body,4);let n;while((n=tw.nextNode())){if(n.parentElement.closest('script,style,pre,code,.sv-cap,[lang="sv"],[lang="en"]'))continue; /* StanForD JSON is data, not UI */const m=SV_ONLY.exec(n.nodeValue);if(m)out.push(m[0]+' ← '+n.nodeValue.trim().slice(0,60));}return out;}
const svTitleOk=s=>s.replace(/(?:^| · )SV: .*$/,'');
function collect(p){const walker=p.d.createTreeWalker(p.d.body,1|4);let el;while((el=walker.nextNode())){if(el.nodeType===3){if(!el.parentElement.closest('script,style,code,[data-no-translate]')&&el.nodeValue.trim())sources.add(el.nodeValue.trim().replace(/­/g,'').replace(/[  ]/g,' '));}else if(!el.closest('[data-no-translate]'))for(const a of ['aria-label','title','placeholder'])if(el.hasAttribute(a)&&svTitleOk(el.getAttribute(a)).trim())sources.add(svTitleOk(el.getAttribute(a)));}
  const leaks=swedishLeaks(p);assert.deepEqual(leaks,[],'Swedish UI text outside the term captions');}
async function language(p,lang){const sel=p.d.querySelector('[data-language-select]');sel.value=lang;sel.dispatchEvent(new p.w.Event('change',{bubbles:true}));await tick();await tick();assert.equal(p.js('I18n.language'),lang);}
async function cycle(p){collect(p);const snapshot=p.js('JSON.stringify(CFHApp.state().plan)');for(const lang of ['en','fr']){await language(p,lang);const parts=[];for(const root of p.d.querySelectorAll('header,main,dialog,#cfhBanner')){const tw=p.d.createTreeWalker(root,4);let n;while((n=tw.nextNode()))if(!n.parentElement.closest('code,[data-no-translate]'))parts.push(n.nodeValue);}const text=parts.join(' ');const left=/.{0,40}(?:Geplant|Auftraggeber|Sägeholz|Ressourcen|Gerückt|Schicht |Waldlager|Bestellt|Hieb\b|Übergabe|Arbeitsauftrag|Speichern|Verschieben|Zurücksetzen).{0,40}/.exec(text);if(!process.env.CFH_I18N_COLLECT)assert(!left,'German text remains in '+lang+': '+left?.[0]);}await language(p,'de');assert.equal(p.js('JSON.stringify(CFHApp.state().plan)'),snapshot,'language switch changed the plan');}

(async()=>{
 const results={};
 /* 1. Game link: header button, state API, handoff to the replica (same origin, repo root served). */
 /* Default game (no ?cfharvest=1): no button, no receipt line, no handover link, no product name anywhere in the page. */
 const plain=await page('dist/index.html',GAME_FILES,'https://forestry.test/dist/',{});
 assert.equal(plain.js('CFHarvestLink.visible'),false);assert(!plain.d.getElementById('cfharvestButton'),'no header button by default');
 plain.js("state=ForestJourney.start(ForestJourney.initial());render();openHandover('a')");await tick();assert(!plain.d.querySelector('#cfhMachineLink'),'no machine link by default');
 for(const l of ['de','en','fr']){await language(plain,l);assert(!/cf ?harvest/i.test(plain.d.documentElement.textContent),'product name must not appear in the game ('+l+')');assert(!/cf ?harvest/i.test(plain.d.title));}
 assert.equal(plain.js("typeof ForestChallenge.getState"),'function','state API stays available');
 let g=await game({});
 const btn=g.d.getElementById('cfharvestButton');assert(btn,'header button');assert.equal(btn.previousElementSibling.id,'handoverButton');assert.equal(btn.textContent,'CFHarvest Planung');
 assert.equal(g.js("typeof ForestChallenge.getState"),'function');
 assert.equal(g.js("ForestChallenge.setState(Object.assign(ForestChallenge.getState(),{pace:'careful'}));state.pace"),'careful','setState must replace the game state');
 assert.throws(()=>g.js("ForestChallenge.setState({stands:[]})"));
 g.js("state=ForestJourney.initial();render()");
 await click(g,'#startHarvest');assert.equal(g.js('state.phase'),'plan');assert.equal(g.js('state.handoverMode'),'manual');
 await click(g,'#cfharvestButton');assert.equal(g.js('__nav'),'https://forestry.test/cfharvest/app/');
 let storage=g.storage();assert(storage['cfharvest-handoff-v1']&&storage['cfharvest-nonce-v1']&&storage['cfharvest-pending-v1']);

 /* 2. Replica at round 1: German shell and labels, three work orders, chain K-01 = H-01 + F-01. */
 let r=await replica(storage);
 const navText=r.d.getElementById('cfhNav').textContent;for(const l of ['Bestellungen','Arbeitsplanung','Nachrichten','Administration','Integrationsprotokoll','Berichte','Hilfe'])assert(navText.includes(l),'nav '+l);
 assert(r.d.querySelector('.cfh-user').textContent.includes('Abmelden'));assert(r.d.querySelector('.cfh-footer').textContent.includes('Demo-Replik'));
 const heads=[...r.d.querySelectorAll('.list-grid thead th[data-col]')].map(th=>th.textContent.trim().replace(/ [▲▼]$/,''));
 assert.deepEqual(heads,['Lfd. Nr.','Status','Auftraggeber','Vertrags-Nr.','Arbeitsauftrags-Nr.','Name','Verfügbar ab','Verfügbar bis','Maßnahme','Vorheriger Auftrag','Geplant','Fläche','Beginn','Ende'],'14 columns in spec order, German');
 assert.equal(r.d.querySelector('.list-grid th[data-col="seq"]').title,'SV: Löpnr.','Swedish column name as tooltip');
 assert(r.d.querySelector('[data-view="list"] h2').textContent.includes('Auftragsliste')&&r.d.querySelector('[data-view="list"] h2 .sv-cap').textContent==='(Uppdragslista)','German view name + Swedish caption');
 assert(r.d.querySelector('[data-action="move-open"]').textContent.includes('Auf Ressource verschieben (0)'));assert(r.d.querySelector('[data-action="move-open"]').disabled,'Flytta disabled at 0');
 const rows=[...r.d.querySelectorAll('tr[data-row-order]')];assert.deepEqual(rows.map(x=>x.dataset.rowOrder),['H-A01','H-B01','H-C01']);
 assert(rows[0].textContent.includes('Nordhang')&&rows[0].textContent.includes('560,0 fm')&&rows[0].textContent.includes('TRI')&&rows[0].textContent.includes('V-26-014')&&rows[0].textContent.includes('Endnutzung'));
 assert.equal(rows[0].querySelector('.pill').className,'pill pill-available');assert(rows[0].querySelector('.pill').textContent.startsWith('Frei'));
 assert.equal(r.d.querySelector('[data-sum="volume"]').textContent,'1.500,0 fm','totals row');
 assert.deepEqual([...r.d.querySelectorAll('[data-cal-row]')].map(x=>x.dataset.calRow),['K-01','H-01','F-01']);
 assert(r.d.querySelector('[data-cal-row="K-01"]').textContent.includes('H-01 + F-01'));
 assert.equal(r.js("CFHApp.vm().meta.contract.id"),'V-26-014');
 assert(r.d.querySelector('[data-period]').textContent.includes('21 Tage'),'period label');assert(r.d.querySelector('.band.days .today'),'today column');
 await cycle(r);
 // Button path [M48–M51]: select Nordhang (row click), Välj resurs K-01, Flytta till resurs (1) → Välj datum → OK.
 await click(r,'tr[data-row-order="H-A01"] td[data-col="client"]');assert(r.d.querySelector('tr[data-row-order="H-A01"]').classList.contains('sel'),'orange selection');
 assert(r.d.querySelector('[data-move-count]').textContent==='1');await change(r,'[data-change="pick-row"]','K-01');
 await click(r,'[data-action="move-open"]');assert.equal(r.d.getElementById('cfhDialog').querySelector('[data-dialog-type]').dataset.dialogType,'date');
 assert(r.d.getElementById('cfhDialog').textContent.includes('ACHTUNG!')&&r.d.getElementById('cfhDialog').textContent.includes('Als letzten hinzufügen'));await cycle(r);
 r.d.querySelector('[data-dialog="date"]').value='2026-10-19';await click(r,'[data-action="date-ok"]');
 let item=bar(r,'K-01','H-A01');assert(item,'planned bar');assert.equal(item.dataset.tone,'planned');assert(item.classList.contains('unsaved'),'staged until Spara');
 assert.equal(r.d.querySelector('[data-staged-count]').textContent,'1','Återställ (1)');assert(item.textContent.includes('TRI - V-26-014 - H-A01 - Nordhang'));
 close(parseFloat(item.style.width),2.5/21*100,.01,'capacity: 560 fm / 28 fm/h / 8 h = 2.5 days of 21');assert.equal(parseFloat(item.style.left),0);
 await click(r,'[data-action="stage-save"]');item=bar(r,'K-01','H-A01');assert(!item.classList.contains('unsaved'));assert(r.d.querySelector('[data-action="stage-save"]').disabled);
 assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').className,'pill pill-planned');assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').textContent,'H-01/F-01');
 // Talgrund then Südrevier "Lägg till som sista" (Südrevier after Nordhang, contiguous).
 await click(r,'tr[data-row-order="H-C01"] td[data-col="client"]');await click(r,'[data-action="move-open"]');await click(r,'[data-action="date-last"]');await click(r,'[data-action="stage-save"]');
 let k=itemsOf(r,'K-01');assert.deepEqual(k.map(i=>i.orderId),['H-A01','H-C01']);close(k[1].start,20,1e-9);
 // Skicka till resurs [M53][M54]: dialog, per-resource section, PIN files, no banner; then the pill turns teal (team) and ➦ shows.
 await change(r,'input[data-change="row"][value="K-01"]',true);await click(r,'[data-action="send-open"]');
 let dlg=r.d.getElementById('cfhDialog');assert(dlg.textContent.includes('An Ressource senden')&&dlg.querySelector('.sv-cap').textContent==='(Skicka till resurs)');
 assert(dlg.querySelector('[data-send-row="K-01"]').textContent.includes('(2/2)'),'(n/m) per resource');assert(dlg.textContent.includes('SAG_Nordhang_5-1m_v1'),'PIN file names');assert(!dlg.querySelector('[data-pin-banner]'),'no PIN banner when all assortments have PINs');
 await change(r,`[data-change="send-item"][value="${k[1].id}"]`,false);assert(r.d.querySelector('[data-send-row="K-01"]').textContent.includes('(1/2)'));await cycle(r);
 await click(r,'[data-action="send-confirm"]');
 item=bar(r,'K-01','H-A01');assert.equal(item.dataset.tone,'sent');assert(item.classList.contains('tone-sent'));assert.equal(bar(r,'K-01','H-C01').dataset.tone,'planned','unchecked item not sent');
 assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').className,'pill pill-team','sent to a team = teal');assert(r.d.querySelector('tr[data-row-order="H-A01"] .sent-ico'));
 assert.equal(r.js("CFHApp.vm().dispatch.harvester"),'H-A01');assert.equal(r.js("CFHApp.vm().dispatch.forwarder"),'H-A01');
 // Chain bars appear as greyed member bars on the member rows [M59]; the forwarder's starts after the 1-day lag.
 assert(r.d.querySelector('[data-cal-row="H-01"] .cal-item.ghost[data-order="H-A01"]')&&r.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost[data-order="H-A01"]'));
 close(parseFloat(r.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost[data-order="H-A01"]').style.left),1/21*100,.01,'forwarder member bar one day later');
 /* DnD 1 — list row → calendar row (HTML5): Talgrund into the running Nordhang day = insert between; Spara shifts Südrevier. */
 await html5Drag(r,r.d.querySelector('tr[data-row-order="H-B01"]'),'K-01',2);
 assert.equal(r.d.getElementById('cfhGhost').textContent,'Endnutzung','ghost shows the Maßnahme');
 item=bar(r,'K-01','H-B01');assert(item,'dropped row became a planned bar');assert(item.classList.contains('unsaved'));assert(r.d.querySelector('[data-cal-row="K-01"]').classList.contains('overlap'),'overlap shown until Spara');
 k=itemsOf(r,'K-01');close(k.find(i=>i.orderId==='H-C01').start,20,1e-9,'Südrevier not shifted before Spara');
 await click(r,'[data-action="stage-save"]');k=itemsOf(r,'K-01');assert.deepEqual(k.map(i=>i.orderId),['H-A01','H-B01','H-C01']);close(k[1].start,20,1e-9,'inserted after Nordhang');close(k[2].start,20+600/32,1e-9,'Spara shifted the later bar');close(k[0].start,0,1e-9,'earlier bar untouched');
 // Multi-row drag: ghost shows the count.
 /* DnD 2 — bar → another resource → "Arbetsorder flyttad till resurs" → Kopiera yields two bars [M60]. */
 await html5Drag(r,bar(r,'K-01','H-B01'),'F-01',6);
 dlg=r.d.getElementById('cfhDialog');assert.equal(dlg.querySelector('[data-dialog-type]').dataset.dialogType,'moved');assert(dlg.textContent.includes('Arbeitsauftrag auf Ressource verschoben')&&dlg.textContent.includes('Forwarder F-01'));
 assert(dlg.querySelector('[data-dialog="lock"]').checked,'Lås start- och slutdatumen preset as observed');assert(dlg.textContent.includes('Start- und Enddatum sperren'));await cycle(r);
 await click(r,'[data-action="moved-copy"]');assert.equal(barsOf(r,'H-B01').length,2,'Kopiera: original + copy');assert(bar(r,'F-01','H-B01')&&bar(r,'K-01','H-B01'));
 await click(r,'[data-action="stage-save"]');assert.equal(vmOf(r).orders.find(o=>o.id==='H-B01').assignments.length,2);
 assert.equal(r.d.querySelector('tr[data-row-order="H-B01"] .pill').textContent,'H-01/F-01, Forwarder F-01','pill lists every resource');
 /* DnD 3 — reorder within a row (HTML5): Südrevier before Talgrund. */
 await html5Drag(r,bar(r,'K-01','H-C01'),'K-01',2,.6);await click(r,'[data-action="stage-save"]');
 assert.deepEqual(itemsOf(r,'K-01').map(i=>i.orderId),['H-A01','H-C01','H-B01'],'reordered');close(itemsOf(r,'K-01')[1].start,20,1e-9);
 /* DnD 4 — Pointer Events (touch, long press): the F-01 copy onto H-01 opens the move dialog; Avbryt keeps everything. */
 await pointerDrag(r,bar(r,'F-01','H-B01'),'H-01',8);assert.equal(r.d.getElementById('cfhDialog').querySelector('[data-dialog-type]')?.dataset.dialogType,'moved','touch drag opened the dialog');
 await click(r,'[data-action="dialog-cancel"]');assert.equal(barsOf(r,'H-B01').length,2);
 // Touch drag of a list row: Avplanera Südrevier first, then drag it from the list with a finger.
 await click(r,bar(r,'K-01','H-C01'));await click(r,'[data-action="unplan-open"][data-scope="item"]');assert(r.d.getElementById('cfhDialog').textContent.includes('wieder zur Planung freigeben'));await cycle(r);await click(r,'[data-action="unplan-confirm"]');
 assert(!bar(r,'K-01','H-C01'));await pointerDrag(r,r.d.querySelector('tr[data-row-order="H-C01"]'),'H-01',9);assert(bar(r,'H-01','H-C01'),'touch drop from the list');assert(bar(r,'H-01','H-C01').classList.contains('unsaved'));
 assert.equal(r.d.querySelector('[data-staged-count]').textContent,'2','Återställ (2)');await click(r,'[data-action="undo"]');assert(!bar(r,'H-01','H-C01'),'undo the last staged change');
 await click(r,'[data-action="stage-reset"]');assert(bar(r,'K-01','H-C01'),'Återställ restores the saved plan (Südrevier back on K-01)');
 await click(r,bar(r,'K-01','H-C01'));await click(r,'[data-action="unplan-open"][data-scope="item"]');await click(r,'[data-action="unplan-confirm"]');await click(r,'[data-action="stage-save"]');assert(!bar(r,'K-01','H-C01'));
 // Selection sync: calendar bar → list row active + orange outline; map view on → stand selected.
 await click(r,bar(r,'K-01','H-A01'));assert(bar(r,'K-01','H-A01').classList.contains('selected'));assert(r.d.querySelector('tr[data-row-order="H-A01"]').classList.contains('active'));
 await change(r,'[data-change="view-toggle"][value="map"]',true);assert.deepEqual([...r.d.querySelectorAll('.pane')].map(x=>x.dataset.pane),['list','map','calendar'],'views left-to-right in product order');assert.equal(r.d.querySelectorAll('.splitter').length,2,'splitters between views');
 assert(r.d.querySelector('g.map-stand.selected[data-order="H-A01"]'));assert(r.d.querySelector('.map-label').textContent.includes('TRI'),'black label box client name order');
 // Quick edit (double click) [M72]: estimate table, Veckoarbetstid, manual working time, Beräknad sluttidpunkt.
 fire(r,'dblclick',bar(r,'K-01','H-A01'));await tick();dlg=r.d.getElementById('cfhDialog');assert.equal(dlg.querySelector('[data-dialog-type]').dataset.dialogType,'edit');
 assert(dlg.textContent.includes('Geschätzte Arbeitszeit')&&dlg.textContent.includes('Werktag 8')&&dlg.textContent.includes('Samstag 0'));assert.equal(dlg.querySelector('[data-calc-end]').textContent,'21.10.2026 13:00','09:00 + 20 h over 8 h days');await cycle(r);
 await input(r,'[data-dialog="manualOn"]',true);await input(r,'[data-dialog="manual"]','56');assert.equal(dlg.querySelector('[data-calc-end]').textContent,'27.10.2026 17:00','56 h override = 7 working days, weekend skipped');
 await click(r,'[data-action="edit-update"]');assert.equal(itemsOf(r,'K-01')[0].manualHours,56);await click(r,'[data-action="stage-reset"]');assert.equal(itemsOf(r,'K-01')[0].manualHours,null);
 // Order detail page with 13 tabs and Funktioner [M73][M75].
 await click(r,'tr[data-row-order="H-A01"] [data-action="open-order"]');assert(r.d.querySelector('[data-view="order"]'));assert.equal(r.d.querySelectorAll('.detail-tabs [role="tab"]').length,13);
 assert(r.d.querySelector('#detailTitle').textContent.includes('TRI - V-26-014 - H-A01 - Nordhang - Endnutzung'));assert(r.d.querySelector('#detailTitle').textContent.includes('Arbeitsauftrag an Ressource gesendet'));
 for(const t of ['order','info','area','products','landings','consider','safety','contacts','prevnext','done','adjust','plots','status']){await click(r,`[data-action="detail-tab"][data-tab="${t}"]`);await cycle(r);}
 assert(r.d.querySelector('[data-status-log]').textContent.includes('An Ressource gesendet'));
 await click(r,'[data-action="detail-tab"][data-tab="products"]');assert(r.d.querySelector('tr[data-assortment="saw"]').textContent.includes('Werksvermessung'));
 await click(r,'[data-action="detail-func-menu"]');assert.equal(r.d.querySelectorAll('[data-action="detail-func"]').length,16,'15 observed Funktioner [M75] + Hiebsprüfung (Drohne) [DEMO]');assert(r.d.querySelector('[data-action="detail-func"][data-func="drone"]').textContent.includes('Hiebsprüfung (Drohne)'));await cycle(r);await click(r,'[data-action="detail-func"][data-func="save-file"]');assert(r.js('__download')[0].includes('H-A01'));
 // Skicka dialog shows the PIN banner when an assortment lacks a PIN file [M53].
 await click(r,'[data-action="detail-tab"][data-tab="products"]');await click(r,'[data-action="pin-toggle"][data-key="saw"]');assert(r.d.querySelector('tr[data-assortment="saw"].missing-pin'));
 await click(r,'[data-action="detail-back"]');await click(r,'[data-action="send-open"]');await change(r,`[data-change="send-item"][value="${itemsOf(r,'K-01')[0].id}"]`,true);
 assert(r.d.querySelector('[data-pin-banner]'),'PIN banner');assert(r.d.querySelector('[data-pin-banner]').textContent.includes('Einige Sortimente haben keine PIN-Dateien'));await cycle(r);await click(r,'[data-action="dialog-cancel"]');
 await click(r,'[data-action="open-order"][data-order="H-A01"]');await click(r,'[data-action="detail-tab"][data-tab="products"]');await click(r,'[data-action="pin-toggle"][data-key="saw"]');await click(r,'[data-action="detail-back"]');
 await click(r,'[data-action="send-open"]');assert(!r.d.querySelector('[data-pin-banner]'));await click(r,'[data-action="dialog-cancel"]');
 // Map: zoom out to circles and clusters; selecting a circle syncs the list; pan; layers; legend.
 await click(r,'[data-action="map-zoom-out"]');assert.equal(r.d.querySelector('.cfh-map').dataset.mapLevel,'1');assert.equal(r.d.querySelectorAll('.map-circle').length,3);
 await click(r,'.map-circle[data-order="H-B01"]');assert(r.d.querySelector('tr[data-row-order="H-B01"]').classList.contains('sel'));
 await click(r,'[data-action="map-zoom-out"]');assert.equal(r.d.querySelectorAll('.map-circle.cluster').length,1);assert(r.d.querySelector('.map-circle.cluster').textContent.includes('3'));await cycle(r);
 await click(r,'.map-circle.cluster');await click(r,'[data-action="map-zoom-in"]');await click(r,'[data-action="map-zoom-in"]');assert.equal(r.d.querySelector('.cfh-map').dataset.mapLevel,'3');assert(r.d.querySelector('.map-bio'));assert(r.d.querySelector('.map-landing'));
 const vb=r.d.querySelector('.cfh-map').getAttribute('viewBox');await click(r,'[data-action="map-pan"][data-dx="1"]');assert.notEqual(r.d.querySelector('.cfh-map').getAttribute('viewBox'),vb,'pan');
 await click(r,'[data-action="map-layers"]');await click(r,'[data-action="map-legend"]');await cycle(r);await click(r,'[data-action="map-zoom-out"]');
 // Komprimera (English product title, German subtitle) and calendar zoom levels.
 await click(r,'[data-action="compress-open"]');dlg=r.d.getElementById('cfhDialog');assert(dlg.querySelector('h3[lang="en"]').textContent.includes('Select time interval for compressed schedule'));assert(dlg.textContent.includes('Zeitraum für den komprimierten Plan wählen'));await cycle(r);await click(r,'[data-action="compress-confirm"]');await click(r,'[data-action="stage-save"]');
 assert.deepEqual(itemsOf(r,'K-01').map(i=>i.orderId),['H-A01','H-B01']);close(itemsOf(r,'K-01')[1].start,20,1e-9);
 for(const z of ['day','month','quarter','week']){await click(r,`[data-action="cal-zoom"][data-zoom="${z}"]`);await cycle(r);}
 // List toolbar: filters, columns, Löpnr. boxes, renumber, search, pager.
 await click(r,'[data-action="filter-toggle"]');await change(r,'[data-change="filter"][data-key="status"]','available');assert.deepEqual([...r.d.querySelectorAll('tr[data-row-order]')].map(x=>x.dataset.rowOrder),['H-C01']);await cycle(r);await click(r,'[data-action="filter-clear"]');
 await click(r,'[data-action="col-menu"]');await change(r,'[data-change="column"][value="prev"]',false);assert(!r.d.querySelector('th[data-col="prev"]'));await cycle(r);await change(r,'[data-change="column"][value="prev"]',true);
 await change(r,'[data-change="seq"][data-order="H-C01"]','1');assert.deepEqual(JSON.parse(r.js('JSON.stringify(CFHApp.state().plan.routeOrder)')),['H-C01','H-A01','H-B01']);assert.deepEqual([...r.d.querySelectorAll('tr[data-row-order]')].map(x=>x.dataset.rowOrder),['H-C01','H-A01','H-B01'],'sorted by Lfd. Nr.');
 await input(r,'[data-input="search"]','Süd');assert.deepEqual([...r.d.querySelectorAll('tr[data-row-order]')].map(x=>x.dataset.rowOrder),['H-C01']);await input(r,'[data-input="search"]','');
 await click(r,'[data-action="op-filter"][data-key="service"]');assert.equal(r.d.querySelectorAll('tr[data-row-order]').length,0,'Skoglig Service has no game orders');await click(r,'[data-action="op-filter"][data-key="drivning"]');
 // Beställningar [M78–M82]
 await click(r,'[data-nav="orders"]');const book=r.d.querySelector('tr[data-book="B-V-26-014-SAG"]');assert(book.textContent.includes('360 fm'));await cycle(r);
 await click(r,'[data-action="book-edit"]');assert(r.d.querySelector('[data-book-detail="B-V-26-014-SAG"]'));await cycle(r);await click(r,'[data-action="book-confirm"]');assert(r.d.querySelector('[data-book-confirmed]'));
 await click(r,'[data-action="book-basis"][data-basis="forwarder"]');await change(r,'[data-change="book"][data-key="receiver"]','Sägewerk');assert.equal(r.d.querySelectorAll('.book-sum tbody tr').length,1);await cycle(r);await change(r,'[data-change="book"][data-key="receiver"]','');
 // Administration menu (17 items, 9 enabled) [M8]; the other 8 disabled with the reason; Resurser form with required markers; Veckokalender; chains; users.
 await click(r,'[data-action="nav-menu"][data-key="admin"]');const adminItems=[...r.d.querySelectorAll('.nav-menu [data-action="admin-page"]')];assert.equal(adminItems.length,17);assert.deepEqual(adminItems.filter(b=>!b.disabled).map(b=>b.dataset.key),['resources','transfers','weekcal','chains','users','contracts','company','templates','layers']);
 assert.deepEqual(adminItems.filter(b=>b.disabled).map(b=>b.dataset.key),['settings','certareas','certtarget','files','checks','deleteorders','finalq','warnings']);assert(adminItems.filter(b=>b.disabled).every(b=>b.title.includes('Im Demo nicht enthalten (im Produkt beobachtet)')),'reason in the tooltip');await cycle(r);
 await click(r,'[data-action="admin-page"][data-key="resources"]');assert(r.d.querySelector('[data-view="admin"]').textContent.includes('Hersteller'));
 await click(r,'[data-action="admin-res"][data-res="F-01"]');assert(r.d.querySelector('.required-msg')?.textContent.includes('Pflichtangabe'),'required marker under the empty Feuerlöscher field');assert.equal(r.d.querySelector('.required-msg').title,'SV: Obligatorisk uppgift');await cycle(r);
 await input(r,'[data-admin-base="extinguisherChecked"]','2026-09-01');await input(r,'[data-admin-prod="Slutavverkning"]','40');await click(r,'[data-action="admin-save"]');assert(!r.d.querySelector('.required-msg'));
 close(r.js("CFHApp.vm().rows.find(x=>x.id==='K-01').items.find(i=>i.orderId==='H-B01').duration"),520/28,1e-9,'faster forwarder: chain now waits for the harvester');
 for(const t of ['week','unit','base']){await click(r,`[data-action="admin-res-tab"][data-tab="${t}"]`);await cycle(r);}
 await click(r,'[data-action="admin-res"][data-res="H-01"]');await click(r,'[data-action="admin-res-tab"][data-tab="week"]');await input(r,'[data-admin-week="sat"]','6');await click(r,'[data-action="admin-save"]');assert.equal(r.js("CFHApp.vm().resourcesAll.find(x=>x.id==='H-01').weekly.sat"),6);
 await input(r,'[data-admin-week="sat"]','0');await click(r,'[data-action="admin-save"]');
 await click(r,'[data-action="nav-menu"][data-key="admin"]');await click(r,'[data-action="admin-page"][data-key="weekcal"]');
 await click(r,'.wk-chip[data-key="H-01:5"]');await input(r,'[data-admin="hours"]','8');await click(r,'[data-action="week-apply"]');assert(r.d.querySelector('.wk-chip.override[data-key="H-01:5"]'),'yellow override chip');
 assert.equal(r.js("CFHModel.hoursOn(CFHApp.vm().rows.find(x=>x.id==='H-01'),5)"),8);assert.equal(r.js("CFHModel.hoursOn(CFHApp.vm().rows.find(x=>x.id==='K-01'),5)"),0,'chain keeps 0 h: F-01 still off');await cycle(r);
 await click(r,'.wk-chip[data-key="H-01:5"]');await click(r,'[data-action="week-reset"]');assert(r.d.querySelector('.wk-chip.default[data-key="H-01:5"]'));
 await click(r,'[data-action="nav-menu"][data-key="admin"]');await click(r,'[data-action="admin-page"][data-key="chains"]');await cycle(r);await input(r,'[data-input="chain-name"][data-chain="K-01"]','Kette Nord');await click(r,'[data-action="chain-save"]');assert.equal(r.js("CFHApp.vm().rows[0].name"),'Kette Nord');
 await click(r,'[data-action="nav-menu"][data-key="admin"]');await click(r,'[data-action="admin-page"][data-key="users"]');await cycle(r);
 await click(r,'[data-action="nav-menu"][data-key="admin"]');await click(r,'[data-action="admin-page"][data-key="chains"]');await input(r,'[data-input="chain-name"][data-chain="K-01"]','H-01/F-01');await click(r,'[data-action="chain-save"]');

 // Administration completion (PLAN_OVERNIGHT §4) in the main flow: these edits must survive the game handoff (checked in 4.).
 const adm=async(p,key)=>{await click(p,'[data-action="nav-menu"][data-key="admin"]');await click(p,`.nav-menu [data-action="admin-page"][data-key="${key}"]`);assert.equal(p.d.querySelector('[data-view="admin"]').dataset.adminPage,key);};
 const adminData=p=>JSON.parse(p.js('JSON.stringify(CFHAdmin.data(CFHApp.vm(),CFHApp.state().plan))'));
 assert.equal(r.d.querySelectorAll('.admin-menu [data-action="admin-page"]').length,17,'side menu with all 17 items');assert(r.d.querySelector('.admin-menu [data-key="files"]').disabled);
 // Eget företag: Biometria company id NNNNN+00000 is validated before anything is saved; pre-created note.
 await adm(r,'company');assert(r.d.querySelector('[data-precreated]').textContent.includes('Vom Hersteller angelegt'));assert.equal(r.d.querySelector('[data-af="biometriaId"]').value,'90010+00000');await cycle(r);
 await input(r,'[data-af="biometriaId"]','1234+0000');await input(r,'[data-af="orgNo"]','DE123456789');await click(r,'[data-action="admin-form-save"]');
 assert.equal(r.d.querySelector('[data-err="biometriaId"]').textContent,'Format NNNNN+00000');assert.equal(adminData(r).company.biometriaId,'90010+00000','invalid id not saved');assert.equal(adminData(r).company.orgNo,'');await cycle(r);
 await input(r,'[data-af="biometriaId"]','');await click(r,'[data-action="admin-form-save"]');assert.equal(r.d.querySelector('[data-err="biometriaId"]').textContent,'Pflichtangabe');
 await input(r,'[data-af="biometriaId"]','55123+00000');await click(r,'[data-action="admin-form-save"]');assert(!r.d.querySelector('[data-err]'));assert.equal(adminData(r).company.biometriaId,'55123+00000');assert.equal(adminData(r).company.orgNo,'DE123456789');
 // Användare: seed ids (planer, h-01), Ny with validation, Spara, Uppdatera, deactivate/reactivate, Tillgång till resurser, message with a template.
 await adm(r,'users');assert.deepEqual([...r.d.querySelectorAll('tr[data-user]')].map(t=>t.dataset.user),['planer','h-01']);assert(r.d.querySelector('[data-field="resourceAccess"] dt .term').title.includes('Tillgång till resurser'));await cycle(r);
 await click(r,'[data-action="admin-new-rec"]');await click(r,'[data-action="admin-form-save"]');assert.equal(r.d.querySelector('[data-err="displayName"]').textContent,'Pflichtangabe');assert.equal(r.d.querySelector('[data-err="roles"]').textContent,'Pflichtangabe');assert.equal(adminData(r).users.length,2);await cycle(r);
 await input(r,'[data-af="displayName"]','Anna Berg');await input(r,'[data-af="email"]','planer@demo.invalid');await change(r,'[data-change="af-list"][data-af="roles"][value="mobile"]',true);await click(r,'[data-action="admin-form-save"]');
 assert.equal(r.d.querySelector('[data-err="email"]').textContent,'E-Mail-Adresse bereits vergeben');assert(r.d.querySelector('[data-err="resourceId"]'),'Mobil/Maschine needs a machine');
 await input(r,'[data-af="email"]','anna@demo.invalid');await change(r,'[data-change="af-list"][data-af="roles"][value="mobile"]',false);await change(r,'[data-change="af-list"][data-af="roles"][value="planner"]',true);await change(r,'[data-change="af-list"][data-af="resourceAccess"][value="F-01"]',true);await click(r,'[data-action="admin-form-save"]');
 let anna=adminData(r).users.find(u=>u.id==='user-01');assert.deepEqual([anna.displayName,anna.roles,anna.resourceAccess,anna.active],['Anna Berg',['planner'],['F-01'],true]);assert(r.d.querySelector('tr.sel[data-user="user-01"]'));
 assert(r.d.querySelector('[data-action="admin-form-save"]').title.includes('Uppdatera'),'existing record: Uppdatera');await input(r,'[data-af="phone"]','+49 431 000');await click(r,'[data-action="admin-form-save"]');assert.equal(adminData(r).users.find(u=>u.id==='user-01').phone,'+49 431 000');
 await click(r,'[data-action="user-active"][data-id="user-01"]');assert.equal(r.d.querySelector('tr[data-user="user-01"] [data-active]').dataset.active,'false');assert(r.d.querySelector('[data-action="user-msg-open"]').disabled);await cycle(r);
 await click(r,'[data-action="user-active"][data-id="user-01"]');assert.equal(r.d.querySelector('tr[data-user="user-01"] [data-active]').dataset.active,'true');
 await click(r,'[data-action="user-msg-open"]');await cycle(r);await change(r,'[data-change="msg-template"][data-scope="user"]','MT-02');assert(r.d.querySelector('[data-dialog="umsg"]').value.includes('Rückegasse 3'));await click(r,'[data-action="user-msg-send"]');
 assert.equal(r.js('CFHApp.state().plan.messages.at(-1).to'),'user:user-01');
 // Roles matrix Administratör · Planerare · Mobil/Maskin.
 assert.deepEqual([...r.d.querySelectorAll('[data-role-matrix] thead th[data-role]')].map(t=>t.textContent.replace(/\s+/g,' ').trim()),['Administrator (Administratör)','Planer (Planerare)','Mobil/Maschine (Mobil/Maskin)']);
 assert(r.d.querySelector('[data-change="role-perm"][data-role="administrator"][value="admin.users"]').disabled,'admin keeps user management');
 await change(r,'[data-change="role-perm"][data-role="planner"][value="orderbook.write"]',false);assert(!adminData(r).roles.find(x=>x.code==='planner').permissions.includes('orderbook.write'));
 // Avtal: game contract with its orders, new contract with a new client, duplicate number refused; orders link to their contract.
 await adm(r,'contracts');assert(r.d.querySelector('tr.sel[data-contract="V-26-014"] .badge-game'));assert.equal(r.d.querySelector('tr[data-contract="V-26-014"] [data-order-count]').textContent,'3');assert.equal(r.d.querySelectorAll('[data-contract-orders] li').length,3);await cycle(r);
 await click(r,'[data-action="admin-new-rec"]');await input(r,'[data-af="contractNo"]','V-26-014');await click(r,'[data-action="admin-form-save"]');assert.equal(r.d.querySelector('[data-err="contractNo"]').textContent,'Vertragsnummer bereits vergeben');assert(r.d.querySelector('[data-err="name"]'));assert(r.d.querySelector('[data-err="validTo"]'));
 await input(r,'[data-af="contractNo"]','V-26-100');await input(r,'[data-af="name"]','Durchforstung Nord');await input(r,'[data-af="validTo"]','2026-12-31');await change(r,'[data-change="af"][data-af="clientCode"]','__new');assert(r.d.querySelector('[data-client-form]'));await cycle(r);
 await change(r,'[data-change="af-list"][data-af="operationTypes"][value="Slutavverkning"]',false);await change(r,'[data-change="af-list"][data-af="operationTypes"][value="Gallring"]',true);await click(r,'[data-action="admin-form-save"]');assert(r.d.querySelector('[data-err="clientCode"]'),'new client needs code and name');
 await input(r,'[data-cf="code"]','nor');await input(r,'[data-cf="name"]','Nordforst eG');await input(r,'[data-af="targetVolume"]','900');await click(r,'[data-action="admin-form-save"]');
 let v100=adminData(r).contracts.find(c=>c.contractNo==='V-26-100');assert.deepEqual([v100.clientCode,v100.operationTypes,v100.targetVolume,v100.validTo],['NOR',['Gallring'],900,'2026-12-31']);assert(adminData(r).clients.some(c=>c.code==='NOR'));assert(r.d.querySelector('tr.sel[data-contract="V-26-100"]'));assert.equal(r.d.querySelector('tr[data-contract="V-26-100"] [data-order-count]').textContent,'0');
 await click(r,'[data-action="admin-sel"][data-page="contracts"][data-id="V-26-014"]');assert(!r.d.querySelector('[data-af="targetVolume"]'),'game contract economics are read-only');await change(r,'[data-change="af-list"][data-af="operationTypes"][value="Gallring"]',true);await click(r,'[data-action="admin-form-save"]');
 assert.deepEqual(adminData(r).contracts.find(c=>c.contractNo==='V-26-014').operationTypes,['Slutavverkning','Gallring']);assert.equal(adminData(r).contracts.find(c=>c.contractNo==='V-26-014').targetVolume,600,'volume from the game');
 await click(r,'[data-action="open-order"][data-order="H-A01"]');await click(r,'[data-action="admin-contract"][data-contract="V-26-014"]');assert.equal(r.d.querySelector('[data-view="admin"]').dataset.adminPage,'contracts');assert(r.d.querySelector('tr.sel[data-contract="V-26-014"]'));
 // Resursöverföringar: SE number validated; L-01 to a subcontractor → transfer list + resource flag.
 await adm(r,'transfers');await cycle(r);await change(r,'[data-change="af"][data-af="resourceId"]','L-01');await input(r,'[data-af="partner"]','Rundholz Nord AB');await input(r,'[data-af="seNumber"]','DE123');await click(r,'[data-action="admin-form-save"]');
 assert.equal(r.d.querySelector('[data-err="seNumber"]').textContent,'Format SE + 10 Ziffern (+ 01)');assert.equal(adminData(r).transfers.length,0);
 await input(r,'[data-af="seNumber"]','SE 556677-8899 01');await click(r,'[data-action="admin-form-save"]');const rt=adminData(r).transfers[0];assert.deepEqual([rt.id,rt.resourceId,rt.direction,rt.seNumber],['RT-01','L-01','out','SE556677889901']);
 assert(r.d.querySelector('tr[data-transfer="RT-01"]'));assert(r.d.querySelector('[data-at-sub]').textContent.includes('L-01'));assert.equal(r.js("CFHApp.vm().resourcesAll.find(x=>x.id==='L-01').subcontractor"),true);await cycle(r);
 await adm(r,'resources');assert(r.d.querySelector('tr[data-admin-res="L-01"] .badge-sub'),'Sub badge in the resource list');
 // Meddelande mallar: create, edit, delete; a template fills the quick-edit "Nachricht senden" box.
 await adm(r,'templates');assert.deepEqual([...r.d.querySelectorAll('tr[data-template]')].map(t=>t.dataset.template),['MT-01','MT-02','MT-03']);await cycle(r);
 await click(r,'[data-action="admin-new-rec"]');await click(r,'[data-action="admin-form-save"]');assert(r.d.querySelector('[data-err="name"]')&&r.d.querySelector('[data-err="text"]'));
 await input(r,'[data-af="name"]','Polter abfahren');await input(r,'[data-af="text"]','Polter von {Auftrag} bitte bis {Datum} abfahren.');await click(r,'[data-action="admin-form-save"]');assert(r.d.querySelector('tr.sel[data-template="MT-04"]'));assert(r.d.querySelector('[data-tpl-preview]').textContent.includes('H-A01'));await cycle(r);
 await click(r,'[data-action="admin-sel"][data-page="templates"][data-id="MT-03"]');await click(r,'[data-action="tpl-delete"]');assert.deepEqual(adminData(r).templates.map(t=>t.id),['MT-01','MT-02','MT-04']);
 await click(r,'[data-nav="planning"]');fire(r,'dblclick',bar(r,'K-01','H-A01'));await tick();await click(r,'[data-action="edit-message"]');assert.equal(r.d.querySelectorAll('[data-change="msg-template"][data-scope="edit"] option').length,4);
 await change(r,'[data-change="msg-template"][data-scope="edit"]','MT-04');let msgBox=r.d.querySelector('#cfhDialog [data-dialog="message"]').value;assert(msgBox.startsWith('Polter von TRI - V-26-014 - H-A01 - ')&&!msgBox.includes('{'),'placeholders filled: '+msgBox);await cycle(r);
 await click(r,'[data-action="edit-message-send"]');assert(r.js('CFHApp.state().plan.messages.at(-1).text').startsWith('Polter von'));await click(r,'[data-action="dialog-cancel"]');
 // Kartskikt: Routen on by default (checked again after the handoff).
 await adm(r,'layers');await cycle(r);await change(r,'[data-change="layer-on"][value="routes"]',true);await click(r,'[data-action="layer-save"]');assert.equal(adminData(r).layers.on.routes,true);
 // Messages, integration log, reports, help.
 await click(r,'[data-nav="messages"]');await input(r,'[data-input="msg-text"]','Bitte Rückegasse 3 zuerst');await click(r,'[data-action="msg-send"]');assert(r.d.querySelector('[data-message]'));await cycle(r);
 await click(r,'[data-nav="integration"]');assert(r.d.querySelector('[data-integration] tr[data-dir="out"]'));await cycle(r);
 await click(r,'[data-nav="reports"]');await cycle(r);await click(r,'[data-action="nav-menu"][data-key="help"]');await click(r,'[data-action="help-page"]');await cycle(r);
 await click(r,'[data-nav="planning"]');
 // Back to the game with the plan applied
 await click(r,'#cfhReturn');assert(r.d.getElementById('cfhDialog').textContent.includes('H-01'));await cycle(r);await click(r,'[data-action="return-confirm"]');assert.equal(r.js('__nav'),'https://forestry.test/dist/?cfharvest=1');
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

 /* 4. Production follow-up in the replica matches the receipt; status harvesting (yellow pill, orange bar). */
 r=await replica(storage);
 await change(r,'[data-change="view-toggle"][value="resources"]',true);
 const follow=r.d.querySelector('tr[data-follow="H-A01"]');
 close(Number(follow.dataset.felled),receipt.harvest,.1,'felled');close(Number(follow.dataset.forwarded),receipt.forwarded,.1,'forwarded');close(Number(follow.dataset.stock),receipt.harvest-receipt.forwarded,.1,'forest stock');
 close(deNum(r.d.querySelector('[data-total="forestStock"]').textContent),receipt.stock,.1,'forest stock total');
 assert.equal(r.js("CFHApp.vm().orders[0].status"),'harvesting');assert.equal(r.d.querySelector('tr[data-row-order="H-A01"] .pill').className,'pill pill-started','started = yellow');
 assert.equal(bar(r,'K-01','H-A01').dataset.tone,'started');
 assert(r.d.querySelector('[data-cal-row="H-01"] .cal-report'),'reported HPR on the harvester row');close(deNum(r.d.querySelector('tr[data-resource="H-01"] [data-produced]').textContent),receipt.harvest,.051,'produced fm per resource');
 await click(r,'[data-nav="orders"]');const saw=r.d.querySelector('tr[data-book="B-V-26-014-SAG"] [data-k="harvested"]');close(deNum(saw.textContent),r.js("CFHApp.vm().orders.reduce((a,o)=>a+o.stand.byGrade.saw.felled,0)"),.051);
 await click(r,'[data-nav="integration"]');assert(r.d.querySelector('[data-integration] tr[data-dir="in"]'),'HPR/FPR received');await click(r,'[data-nav="planning"]');
 await cycle(r);
 results.shift1={felled:+receipt.harvest.toFixed(2),forwarded:+receipt.forwarded.toFixed(2)};

 // Administration data survived the round trip through the game (plan envelope).
 {const x=adminData(r);assert.equal(x.company.biometriaId,'55123+00000');assert(x.users.some(u=>u.id==='user-01'&&u.displayName==='Anna Berg'));assert(x.contracts.some(c=>c.contractNo==='V-26-100'&&c.clientCode==='NOR'));
  assert.deepEqual(x.templates.map(t=>t.id),['MT-01','MT-02','MT-04']);assert.equal(x.transfers[0].id,'RT-01');assert.equal(x.layers.on.routes,true);assert(!x.roles.find(q=>q.code==='planner').permissions.includes('orderbook.write'));
  assert.equal(r.js("CFHApp.vm().resourcesAll.find(x=>x.id==='L-01').subcontractor"),true);assert(r.js("CFHApp.state().plan.messages.some(m=>m.to==='user:user-01')"));}

 /* 5. Round 3: PIN v2 required, H-01 still on v1 is flagged; Skicka sends PIN v2 and the game accepts it. */
 await click(r,'#cfhReturn');await click(r,'[data-action="return-confirm"]');g=await game({...storage,...r.storage()});
 assert.equal(g.js('state.phase'),'receipt','returning in receipt phase keeps the state unchanged');
 await click(g,'#next');assert.equal(g.js('ForestGame.validate(state)'),null,'round 2 still covered by the v1 handover');await click(g,'#run');await click(g,'#next');
 assert.equal(g.js('state.round'),3);assert(g.js('ForestGame.validate(state)'),'round 3 needs version 2');
 await click(g,'#cfharvestButton');r=await replica(g.storage());
 let a=r.js("CFHApp.vm().orders[0]");assert.equal(a.pin.required,2);assert.equal(a.pin.spec,'4,1');assert.equal(a.pin.loaded,'5,1');assert.equal(a.pin.machineVersion,1);assert(a.pinFlag);
 assert.deepEqual(JSON.parse(r.js("JSON.stringify(CFHApp.vm().dispatch.issues.map(i=>i.code))")),['outdated','outdated']);assert(r.d.querySelector('.cal-item.outdated'));
 await click(r,'[data-action="open-order"][data-order="H-A01"]');await click(r,'[data-action="detail-tab"][data-tab="products"]');assert(r.d.querySelector('[data-pin-flag]'));await cycle(r);await click(r,'[data-action="detail-back"]');
 await click(r,'[data-action="send-open"]');dlg=r.d.getElementById('cfhDialog');assert(dlg.textContent.includes('v2'),'PIN v2 file names');assert(dlg.querySelector(`[data-change="send-item"][value="${itemsOf(r,'K-01')[0].id}"]`).checked,'outdated item preselected');
 await click(r,'[data-action="send-confirm"]');a=r.js("CFHApp.vm().orders[0]");assert(!a.pinFlag);assert.equal(a.instructions.pinVersion,2);assert.equal(a.instructions.files.pin[0].ProductInstruction.ProductDefinition.ProductVersion,2);
 await click(r,'[data-action="open-order"][data-order="H-A01"]');const files=r.d.querySelector('[data-files]');assert(files&&files.textContent.includes('"fileType": "pin"')&&files.textContent.includes('"fileType": "oin"'));await cycle(r);await click(r,'[data-action="detail-back"]');
 await click(r,'#cfhReturn');await click(r,'[data-action="return-confirm"]');g=await game({...g.storage(),...r.storage()});
 assert.equal(g.js('ForestGame.validate(state)'),null);assert.equal(g.js('state.handoverVersions.a'),2);await click(g,'#run');assert.equal(g.js('state.history[2].downgraded'),0,'current PIN: no downgrade');

 /* 6. Back button without return restores the handed-over state; tampered returns are ignored. */
 g.js("state=ForestJourney.start(ForestJourney.initial());render()");await click(g,'#cfharvestButton');const handed=g.storage();
 let back=await game(handed);assert.equal(back.js('state.phase'),'plan');assert.equal(back.js('state.round'),1);assert.equal(back.storage()['cfharvest-pending-v1'],undefined);
 const forged=JSON.parse(handed['cfharvest-handoff-v1']);forged.kind='to-game';forged.nonce='forged';forged.state.harvester='c';
 back=await game({...handed,'cfharvest-return-v1':JSON.stringify(forged)});assert.equal(back.js('state.harvester'),'a','forged nonce must be rejected');

 /* 7. Two-server setup: dist on :3000, repo root on :3001 → handoff through the URL fragment. */
 let g2=await game({},'http://localhost:3000/?cfharvest=1');g2.js("state=ForestJourney.start(ForestJourney.initial());render()");await click(g2,'#cfharvestButton');const nav=g2.js('__nav');
 assert(nav.startsWith('http://localhost:3001/cfharvest/app/#cfh='),nav.slice(0,60));
 let r2=await replica({},nav);assert.equal(r2.js("CFHApp.state().source"),'hash');assert.equal(r2.w.location.hash,'');assert.equal(r2.js("CFHApp.state().returnUrl"),'http://localhost:3000/?cfharvest=1');
 await click(r2,'tr[data-row-order="H-C01"] td[data-col="client"]');await change(r2,'[data-change="pick-row"]','K-01');await click(r2,'[data-action="move-open"]');await click(r2,'[data-action="date-ok"]');
 await click(r2,'[data-action="send-open"]');await click(r2,'[data-action="send-confirm"]');assert.equal(bar(r2,'K-01','H-C01').dataset.tone,'sent','Skicka saves staged changes first');
 await click(r2,'#cfhReturn');await click(r2,'[data-action="return-confirm"]');const back2=r2.js('__nav');assert(back2.startsWith('http://localhost:3000/?cfharvest=1#cfh-return='),back2.slice(0,60));
 g2=await game(g2.storage(),back2);assert.equal(g2.js('state.harvester'),'c');assert.equal(g2.js('state.handoverMode'),'digital');assert.equal(g2.js('ForestGame.validate(state)'),null);assert.equal(g2.w.location.hash,'');
 /* 8. Standalone replica (no handoff) uses a demo state and does not write a return payload; staged changes are saved on return. */
 const solo=await replica({});assert.equal(solo.js("CFHApp.state().source"),'demo');assert(solo.d.querySelector('.notice.warn'));
 await html5Drag(solo,solo.d.querySelector('tr[data-row-order="H-B01"]'),'H-01',0);assert(bar(solo,'H-01','H-B01').classList.contains('unsaved'));
 await click(solo,'#cfhReturn');assert(solo.d.getElementById('cfhDialog').textContent.includes('ungespeicherte Änderungen werden vorher gespeichert'));await click(solo,'[data-action="return-confirm"]');assert.equal(solo.js('__nav'),'https://forestry.test/dist/');assert.equal(solo.storage()['cfharvest-return-v1'],undefined);
 assert.equal(JSON.parse(solo.storage()['cfharvest-plan-v1']).assignments.length,1,'staged drop saved on return');

 /* 8b. Calendar fidelity (PLAN_OVERNIGHT §1): capacity tooltip and zooms, resize gesture (Pointer Events), move in time,
    cross-row recompute vs lock, greyed member bars, conflicts, Kopiera onto a member, chain lag, rate re-flow, long bars. */
 const cf=await replica({}),cfText=el=>el.textContent.replace(/\s+/g,' ').trim(),dlgType=p=>p.d.getElementById('cfhDialog').querySelector('[data-dialog-type]')?.dataset.dialogType;
 await click(cf,'tr[data-row-order="H-A01"] td[data-col="client"]');await change(cf,'[data-change="pick-row"]','K-01');await click(cf,'[data-action="move-open"]');cf.d.querySelector('[data-dialog="date"]').value='2026-10-19';await click(cf,'[data-action="date-ok"]');await click(cf,'[data-action="stage-save"]');
 let kb=bar(cf,'K-01','H-A01');assert(kb.title.includes('560 fm · 20 h · 2,5 Tage'),'tooltip: volume · hours · working days');
 for(const [z,d] of [['day',7],['week',21],['month',31],['quarter',92]]){await click(cf,`[data-action="cal-zoom"][data-zoom="${z}"]`);close(parseFloat(bar(cf,'K-01','H-A01').style.width),2.5/d*100,.01,'2.5-day bar at zoom '+z);close(parseFloat(cf.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost').style.left),1/d*100,.01);}
 await click(cf,'[data-action="cal-zoom"][data-zoom="week"]');kb=bar(cf,'K-01','H-A01');
 // Greyed member bars: hatched, tooltip names the chain, no select / drag / resize / quick edit.
 let gH=cf.d.querySelector('[data-cal-row="H-01"] .cal-item.ghost[data-order="H-A01"]'),gF=cf.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost[data-order="H-A01"]');
 assert(gH&&gF,'member bars');assert(gH.title.startsWith('geplant über Erntekette K-01'));assert(gF.title.includes('560 fm · 17,5 h · 2,19 Tage'),'forwarder member: own rate');assert(gF.title.includes('Vorlauf Harvester → Forwarder: 1 Tag'));
 for(const g of [gH,gF]){assert(!g.hasAttribute('draggable')&&!g.dataset.item&&!g.dataset.action&&!g.querySelector('[data-resize]')&&!g.hasAttribute('tabindex'));assert.equal(g.getAttribute('aria-disabled'),'true');}
 close(parseFloat(gH.style.left),0,.01);close(parseFloat(gH.style.width),2.5/21*100,.01);close(parseFloat(gF.style.left),1/21*100,.01,'forwarder after the 1-day lag');close(parseFloat(gF.style.width),17.5/8/21*100,.01);
 await click(cf,gH);assert.equal(cf.js('CFHApp.state().view.selItem'),null,'click on a member bar selects nothing');
 let gdt=dataTransfer();fire(cf,'dragstart',gH,{dataTransfer:gdt,clientX:10});assert.equal(gdt.data['text/plain'],undefined,'member bar is no drag source');assert.equal(cf.js('CFHApp.state().drag'),null);
 fire(cf,'dblclick',gH);await tick();assert(!dlgType(cf),'no quick edit from a member bar');
 cf.js('CFHApp.config.longPress=0');fire(cf,'pointerdown',gF,{pointerType:'touch',pointerId:3,button:0,clientX:5,clientY:5});fire(cf,'pointermove',cf.d,{pointerType:'touch',pointerId:3,clientX:60,clientY:8});assert(!cf.d.getElementById('cfhGhost').classList.contains('show'),'no touch drag from a member bar');fire(cf,'pointerup',cf.d,{pointerType:'touch',pointerId:3,clientX:60,clientY:8});await tick();
 // Resize gesture with the mouse (Pointer Events): end snaps to day columns, live label, staged, badge, Speichern persists.
 stubTracks(cf);let trk=cf.d.querySelector('[data-drop-row="K-01"]'),handle=kb.querySelector('[data-resize]');assert(handle,'right-edge handle');
 const mouse={pointerType:'mouse',pointerId:1,button:0,isPrimary:true};
 fire(cf,'pointerdown',handle,{...mouse,clientX:xForDay(cf,trk,2,.5),clientY:10});assert(kb.classList.contains('resizing'));assert.equal(kb.getAttribute('draggable'),null,'native drag off while resizing');
 assert(fire(cf,'dragstart',kb,{dataTransfer:dataTransfer()}).defaultPrevented,'HTML5 drag blocked during resize');
 fire(cf,'pointermove',cf.d,{...mouse,clientX:xForDay(cf,trk,4,.6),clientY:10});assert.equal(kb.querySelector('[data-resize-label]').textContent,'40 h','live label');
 fire(cf,'pointermove',cf.d,{...mouse,clientX:xForDay(cf,trk,4,.4),clientY:10});assert.equal(kb.querySelector('[data-resize-label]').textContent,'32 h');close(parseFloat(kb.style.width),4/21*100,.01,'bar follows in whole days');
 fire(cf,'pointerup',cf.d,{...mouse,clientX:xForDay(cf,trk,4,.4),clientY:10});await tick();await new Promise(res=>setTimeout(res,450)); // the click after a resize is swallowed for 400 ms
 kb=bar(cf,'K-01','H-A01');assert.equal(itemsOf(cf,'K-01')[0].manualHours,32);assert(kb.classList.contains('unsaved'));assert.equal(cf.d.querySelector('[data-staged-count]').textContent,'1','Zurücksetzen (1)');
 assert.equal(cfText(kb.querySelector('[data-manual-badge]')),'✎ manuell');close(parseFloat(kb.style.width),4/21*100,.01);assert(kb.title.includes('32 h · 4 Tage')&&kb.title.includes('Manuelle Arbeitszeit'));
 close(parseFloat(cf.d.querySelector('[data-cal-row="H-01"] .cal-item.ghost').style.width),4/21*100,.01,'harvester member follows the manual time');close(parseFloat(cf.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost').style.width),17.5*1.6/8/21*100,.01,'forwarder member scaled');
 assert(cf.js('CFHApp.state().view.selItem'),'resized bar selected');await click(cf,'[data-action="stage-save"]');assert.equal(JSON.parse(cf.storage()['cfharvest-plan-v1']).assignments[0].manualHours,32,'Speichern persists the manual time');
 // Quick edit is in sync and resets to the computed value.
 fire(cf,'dblclick',bar(cf,'K-01','H-A01'));await tick();let dl=cf.d.getElementById('cfhDialog');assert(dl.querySelector('[data-dialog="manualOn"]').checked);assert.equal(dl.querySelector('[data-dialog="manual"]').value,'32');assert(dl.textContent.includes('Manuelle Arbeitszeit für den Arbeitsauftrag ist auf 32 Stunden gesetzt'));await cycle(cf);
 await click(cf,'[data-action="edit-reset-manual"]');dl=cf.d.getElementById('cfhDialog');assert(!dl.querySelector('[data-dialog="manualOn"]').checked);assert.equal(dl.querySelector('[data-calc-hours]').textContent,'20');
 await click(cf,'[data-action="edit-update"]');assert.equal(itemsOf(cf,'K-01')[0].manualHours,null);assert(!bar(cf,'K-01','H-A01').querySelector('[data-manual-badge]'));await click(cf,'[data-action="stage-save"]');
 // Touch resize (Pointer Events, no long press needed on the handle): shorten to the first day = 8 h.
 stubTracks(cf);trk=cf.d.querySelector('[data-drop-row="K-01"]');kb=bar(cf,'K-01','H-A01');const touch={pointerType:'touch',pointerId:9,button:0,isPrimary:true};
 fire(cf,'pointerdown',kb.querySelector('[data-resize]'),{...touch,clientX:xForDay(cf,trk,2,.5),clientY:10});fire(cf,'pointermove',cf.d,{...touch,clientX:xForDay(cf,trk,0,.7),clientY:10});fire(cf,'pointerup',cf.d,{...touch,clientX:xForDay(cf,trk,0,.7),clientY:10});await tick();await new Promise(res=>setTimeout(res,450));
 assert.equal(itemsOf(cf,'K-01')[0].manualHours,8,'touch resize to one day');await click(cf,'[data-action="stage-reset"]');
 // Keyboard alternative: Shift+ArrowRight on the focused bar = end of the next day column.
 fire(cf,'keydown',bar(cf,'K-01','H-A01'),{key:'ArrowRight',shiftKey:true});await tick();assert.equal(itemsOf(cf,'K-01')[0].manualHours,24,'2,5 → 3 days');
 fire(cf,'keydown',bar(cf,'K-01','H-A01'),{key:'ArrowLeft',shiftKey:true});await tick();assert.equal(itemsOf(cf,'K-01')[0].manualHours,16);await click(cf,'[data-action="stage-reset"]');
 // Move in time within the row: grabbed on its 2nd day and dropped on day 8 → starts day 7, duration kept; drop marker spans the bar.
 stubTracks(cf);trk=cf.d.querySelector('[data-drop-row="K-01"]');gdt=dataTransfer();fire(cf,'dragstart',bar(cf,'K-01','H-A01'),{dataTransfer:gdt,clientX:xForDay(cf,trk,1)});
 fire(cf,'dragover',trk,{dataTransfer:gdt,clientX:xForDay(cf,trk,8),clientY:10});const mk=trk.querySelector('.drop-day');close(parseFloat(mk.style.left),7/21*100,.01,'marker at the new start');close(parseFloat(mk.style.width),3/21*100,.01,'marker spans the bar');
 fire(cf,'drop',trk,{dataTransfer:gdt,clientX:xForDay(cf,trk,8),clientY:10});fire(cf,'dragend',trk,{});await tick();
 assert.deepEqual([itemsOf(cf,'K-01')[0].start,itemsOf(cf,'K-01')[0].duration],[40,20],'Monday of week 2, duration kept');assert(!dlgType(cf),'no dialog within the row');await click(cf,'[data-action="stage-reset"]');
 // Across rows: Südrevier H-01 → F-01. Lock preset keeps the dates (manual 15 h); without the lock the F-01 rate applies.
 await html5Drag(cf,cf.d.querySelector('tr[data-row-order="H-C01"]'),'H-01',8);await click(cf,'[data-action="stage-save"]');
 await html5Drag(cf,bar(cf,'H-01','H-C01'),'F-01',9);assert.equal(dlgType(cf),'moved');assert(cfText(cf.d.querySelector('[data-moved-duration]')).startsWith('Gesperrt: Start- und Enddatum bleiben'));await cycle(cf);
 await change(cf,'[data-dialog="lock"]',false);assert.equal(cfText(cf.d.querySelector('[data-moved-duration]')),'Dauer auf Forwarder F-01: 13,1 h aus der Leistung der Zielressource');await cycle(cf);
 await click(cf,'[data-action="moved-move"]');let fIt=itemsOf(cf,'F-01')[0];assert.equal(fIt.manualHours,null);close(fIt.duration,420/32,1e-9,'recomputed from the forwarder rate');close(fIt.start,56,1e-9,'drop day');await click(cf,'[data-action="stage-reset"]');
 await html5Drag(cf,bar(cf,'H-01','H-C01'),'F-01',9);await click(cf,'[data-action="moved-move"]');fIt=itemsOf(cf,'F-01')[0];assert.equal(fIt.manualHours,15,'locked: same dates, manual hours');close(fIt.start,48);await click(cf,'[data-action="stage-reset"]');
 // Conflict: Südrevier moved in time onto day 1 of H-01 while the chain's harvester member works Nordhang.
 await html5Drag(cf,bar(cf,'H-01','H-C01'),'H-01',1);assert(!dlgType(cf));
 const lines=[...cf.d.querySelectorAll('[data-conflicts] .conflict-line')].map(cfText);assert.deepEqual(lines,['⚠ Konflikt: H-01 ist am 20.10. doppelt verplant'],'warning line under the calendar');
 assert(bar(cf,'K-01','H-A01').classList.contains('conflict')&&bar(cf,'H-01','H-C01').classList.contains('conflict')&&cf.d.querySelector('[data-cal-row="H-01"] .cal-item.ghost').classList.contains('conflict'),'red outline on both bars');
 assert(!cf.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost').classList.contains('conflict'));await cycle(cf);
 await click(cf,'[data-action="stage-save"]');assert(cf.d.querySelector('[data-conflicts]'),'warning only: saved with the conflict');assert.equal(vmOf(cf).orders.find(o=>o.id==='H-C01').status,'planned');
 // Kopiera onto a member machine: an independent, fully interactive bar (and a conflict with the forwarder's member bar).
 await html5Drag(cf,bar(cf,'K-01','H-A01'),'F-01',0);await click(cf,'[data-action="moved-copy"]');const copy=bar(cf,'F-01','H-A01');
 assert(copy&&copy.dataset.item&&copy.getAttribute('draggable')==='true'&&copy.querySelector('[data-resize]')&&copy.dataset.action==='select-item','copy is interactive');assert(bar(cf,'K-01','H-A01'),'original stays on the chain');
 assert.deepEqual([...cf.d.querySelectorAll('[data-conflicts] .conflict-line')].map(cfText).map(t=>t.split(' ist')[0]),['⚠ Konflikt: F-01','⚠ Konflikt: H-01'],'same day, sorted by machine');await click(cf,copy);assert.equal(cf.js('CFHApp.state().view.selItem'),copy.dataset.item);await click(cf,'[data-action="stage-reset"]');
 // Chain lag in Administration → Arbeitsgruppen/Ernteketten.
 await click(cf,'[data-action="nav-menu"][data-key="admin"]');await click(cf,'[data-action="admin-page"][data-key="chains"]');assert.equal(cf.d.querySelector('[data-input="chain-lag"][data-chain="K-01"]').value,'1');await cycle(cf);
 await input(cf,'[data-input="chain-lag"][data-chain="K-01"]','2');await click(cf,'[data-action="chain-save"]');assert.equal(vmOf(cf).chainsAll[0].lag,2);await click(cf,'[data-nav="planning"]');
 gF=cf.d.querySelector('[data-cal-row="F-01"] .cal-item.ghost');close(parseFloat(gF.style.left),2/21*100,.01,'forwarder two days after the harvester');assert(gF.classList.contains('reflow'),'changed member bars highlighted');
 // Rate change re-flows: Talgrund after Nordhang on K-01; H-01 at 14 fm/h doubles Nordhang → Talgrund follows (staged), both highlighted.
 await click(cf,'tr[data-row-order="H-B01"] td[data-col="client"]');await click(cf,'[data-action="move-open"]');await click(cf,'[data-action="date-last"]');await click(cf,'[data-action="stage-save"]');close(itemsOf(cf,'K-01')[1].start,20,1e-9);
 await click(cf,'[data-action="nav-menu"][data-key="admin"]');await click(cf,'[data-action="admin-page"][data-key="resources"]');await click(cf,'[data-action="admin-res"][data-res="H-01"]');await input(cf,'[data-admin-prod="Slutavverkning"]','14');await click(cf,'[data-action="admin-save"]');
 await click(cf,'[data-nav="planning"]');let kItems=itemsOf(cf,'K-01');close(kItems[0].duration,40);close(kItems[1].start,40,1e-9,'Talgrund follows Nordhang');
 assert(bar(cf,'K-01','H-B01').classList.contains('unsaved')&&bar(cf,'K-01','H-B01').classList.contains('reflow')&&bar(cf,'K-01','H-A01').classList.contains('reflow'),'re-flowed bars staged and highlighted');
 assert(bar(cf,'H-01','H-C01').classList.contains('reflow'),'direct H-01 bar re-computed too');assert.equal(cf.d.querySelector('[data-staged-count]').textContent,'1');await cycle(cf);await click(cf,'[data-action="stage-save"]');
 // "1 h + 1 fm" product rule: H-01 at 1 fm/h and 1 h per weekday blocks the calendar beyond every zoom window.
 const lb=await replica({});await click(lb,'[data-action="nav-menu"][data-key="admin"]');await click(lb,'[data-action="admin-page"][data-key="resources"]');await input(lb,'[data-admin-prod="Slutavverkning"]','1');await click(lb,'[data-action="admin-save"]');
 await click(lb,'[data-action="admin-res-tab"][data-tab="week"]');await input(lb,'[data-admin-week="workday"]','1');await click(lb,'[data-action="admin-save"]');await click(lb,'[data-nav="planning"]');
 await html5Drag(lb,lb.d.querySelector('tr[data-row-order="H-C01"]'),'H-01',0);await click(lb,'[data-action="stage-save"]');
 assert(bar(lb,'H-01','H-C01').title.includes('420 fm · 420 h · 420 Tage'));
 for(const z of ['day','week','month','quarter']){await click(lb,`[data-action="cal-zoom"][data-zoom="${z}"]`);const b=bar(lb,'H-01','H-C01');close(parseFloat(b.style.left),0,.01);close(parseFloat(b.style.left)+parseFloat(b.style.width),100,.01,'blocks the whole window at '+z);assert(!b.querySelector('[data-resize]'),'no handle on a clipped end');}
 results.calendarFidelity=['capacity tooltip + zooms','pointer resize (mouse, touch) + keyboard','move in time','cross-row recompute vs lock','greyed member bars','conflict warning','Kopiera onto member','chain lag','rate re-flow','1 h + 1 fm blocks the window'];

 /* 8c. Map as a planning surface (PLAN_OVERNIGHT §3): click / shift-click / lasso selection shared with the list and the
    "Auf Ressource verschieben (n)" count, drag of a selected stand onto a calendar row, landings and symbols (map, Avlägg
    tab, OIN, sessionStorage), route sequence on the map, layers, legend, measure, OSM flag, dispatch-line dedupe. */
 const mp=await replica({}),moveCount=p=>p.d.querySelector('[data-move-count]').textContent,checkedIds=p=>JSON.parse(p.js('JSON.stringify(CFHApp.state().view.checked)'));
 // Layout stubs: the planning map is drawn 620 × 350 px at (0,0), so client px = image units at zoom level 2.
 const stubMaps=p=>{for(const s of p.d.querySelectorAll('svg.cfh-map')){const vb=s.getAttribute('viewBox').split(/\s+/).map(Number),w=s.dataset.mapScope==='detail'?600:620;s.getBoundingClientRect=()=>({left:0,top:0,width:w,height:w*vb[3]/vb[2],right:w,bottom:w*vb[3]/vb[2],x:0,y:0});}};
 const clickAt=async(p,el,x,y,extra={})=>{stubMaps(p);const t=typeof el==='string'?p.d.querySelector(el):el;assert(t,'missing '+el);t.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,clientX:x,clientY:y,...extra}));await tick();};
 const stand=(p,id)=>p.d.querySelector(`svg[data-map-scope="main"] g.map-stand[data-order="${id}"]`);
 await change(mp,'[data-change="view-toggle"][value="map"]',true);assert.equal(mp.d.querySelector('.cfh-map').dataset.mapLevel,'2');
 // Stand polygons coloured by status (same classes as the pills).
 assert(stand(mp,'H-A01').classList.contains('pill-available'));
 // Click selects (list row orange, count 1); Shift+click adds (count 2) and removes again.
 await click(mp,stand(mp,'H-A01'));assert.deepEqual(checkedIds(mp),['H-A01']);assert(mp.d.querySelector('tr[data-row-order="H-A01"]').classList.contains('sel'));assert.equal(moveCount(mp),'1');assert(stand(mp,'H-A01').classList.contains('selected'));
 await clickAt(mp,stand(mp,'H-B01'),365,85,{shiftKey:true});assert.deepEqual(checkedIds(mp),['H-A01','H-B01']);assert.equal(moveCount(mp),'2');assert(mp.d.querySelector('tr[data-row-order="H-B01"]').classList.contains('sel'));assert(stand(mp,'H-B01').classList.contains('selected'));
 await clickAt(mp,stand(mp,'H-A01'),120,140,{shiftKey:true});assert.deepEqual(checkedIds(mp),['H-B01']);assert.equal(moveCount(mp),'1');assert(!stand(mp,'H-A01').classList.contains('selected'));
 // Lasso: rectangle around Talgrund and Südrevier selects both.
 await click(mp,'[data-action="map-tool"][data-tool="lasso"]');assert.equal(mp.d.querySelector('[data-action="map-tool"][data-tool="lasso"]').getAttribute('aria-pressed'),'true');assert(mp.d.querySelector('[data-map-hint]'));await cycle(mp);
 stubMaps(mp);let msvg=mp.d.querySelector('svg[data-map-scope="main"]');const mouseP={pointerType:'mouse',pointerId:4,button:0,isPrimary:true};
 fire(mp,'pointerdown',msvg,{...mouseP,clientX:280,clientY:20});fire(mp,'pointermove',mp.d,{...mouseP,clientX:360,clientY:150});fire(mp,'pointermove',mp.d,{...mouseP,clientX:440,clientY:320});
 const lassoRect=msvg.querySelector('[data-lasso]');assert(lassoRect,'lasso rectangle drawn');close(Number(lassoRect.getAttribute('width')),160,.01);
 fire(mp,'pointerup',mp.d,{...mouseP,clientX:440,clientY:320});await tick();
 assert.deepEqual(checkedIds(mp),['H-B01','H-C01'],'lasso selects the two stands inside');assert.equal(moveCount(mp),'2');assert(!mp.d.querySelector('[data-lasso]'));
 assert(['H-B01','H-C01'].every(id=>mp.d.querySelector(`tr[data-row-order="${id}"]`).classList.contains('sel')));
 await new Promise(res=>setTimeout(res,450));await click(mp,'[data-action="map-tool-off"]');assert(!mp.d.querySelector('[data-map-hint]'));
 // Drag a selected stand onto the K-01 calendar row (mouse, Pointer Events): the whole map selection is planned (staged).
 stubTracks(mp);stubMaps(mp);const ktrack=mp.d.querySelector('[data-drop-row="K-01"]'),kx=xForDay(mp,ktrack,0);mp.d.elementFromPoint=()=>ktrack;
 fire(mp,'pointerdown',stand(mp,'H-B01').querySelector('polygon'),{...mouseP,clientX:365,clientY:85});fire(mp,'pointermove',mp.d,{...mouseP,clientX:367,clientY:86});assert(!mp.d.getElementById('cfhGhost').classList.contains('show'),'no drag below the 5 px threshold');
 fire(mp,'pointermove',mp.d,{...mouseP,clientX:kx/2,clientY:8});assert(mp.d.getElementById('cfhGhost').classList.contains('show'),'ghost while dragging from the map');assert(ktrack.querySelector('.drop-day'),'drop target highlighted');
 fire(mp,'pointermove',mp.d,{...mouseP,clientX:kx,clientY:8});fire(mp,'pointerup',mp.d,{...mouseP,clientX:kx,clientY:8});await tick();await new Promise(res=>setTimeout(res,450));
 assert.deepEqual(itemsOf(mp,'K-01').map(i=>i.orderId),['H-B01','H-C01'],'map selection planned on K-01');assert(itemsOf(mp,'K-01').every(i=>i.staged));assert(bar(mp,'K-01','H-B01'));
 // Dispatch line and return dialog: an unsent chain order is named once, not once per machine of the chain.
 assert.deepEqual(JSON.parse(mp.js("JSON.stringify(CFHApp.vm().dispatch.issues.map(i=>[i.orderId,i.machine,i.code]))")),[['H-B01','harvester','notSent'],['H-B01','forwarder','notSent']]);
 assert.equal(mp.d.querySelectorAll('.dispatch-line .flag').length,1,'dispatch line deduped per order');assert(mp.d.querySelector('.dispatch-line .flag').textContent.includes('Talgrund: geplant, aber nicht an die Ressource gesendet'));
 await click(mp,'#cfhReturn');assert.equal(mp.d.querySelectorAll('[data-return-issue]').length,1,'return dialog deduped');await click(mp,'[data-action="dialog-cancel"]');
 await click(mp,'[data-action="stage-save"]');
 // Layers (🗂): landings, routes, stands, machines toggle; legend (💡) explains colours and the image-space map.
 await click(mp,'[data-action="map-layers"]');const pop=mp.d.querySelector('[data-map-layers]');assert.deepEqual([...pop.querySelectorAll('input')].map(i=>i.value),['photo','stands','landings','symbols','protect','neighbours','routes','machines']);
 assert(pop.textContent.includes('Polterplätze (Avlägg)')&&pop.textContent.includes('Schutzbereiche (Hänsyn)')&&pop.textContent.includes('Ernteketten-Position'));
 assert(mp.d.querySelector('.map-landing'));await change(mp,'[data-change="map-layer"][value="landings"]',false);assert(!mp.d.querySelector('.map-landing'),'landings hidden');await change(mp,'[data-change="map-layer"][value="landings"]',true);assert.equal(mp.d.querySelectorAll('.map-landing').length,3);
 assert(!mp.d.querySelector('.map-routes'));await change(mp,'[data-change="map-layer"][value="routes"]',true);assert.equal(mp.d.querySelectorAll('.map-routes').length,3,'harvester/forwarder routes from routes.js');assert(mp.d.querySelector('.map-routes .route-h')&&mp.d.querySelector('.map-routes .route-f'));
 const machines=mp.d.querySelectorAll('.map-machine').length;assert(machines>=1,'simulated machine positions');assert(mp.d.querySelector('.map-machine title').textContent.includes('simulierte Position'));
 await change(mp,'[data-change="map-layer"][value="machines"]',false);assert.equal(mp.d.querySelectorAll('.map-machine').length,0);await change(mp,'[data-change="map-layer"][value="machines"]',true);
 await change(mp,'[data-change="map-layer"][value="protect"]',false);assert(!mp.d.querySelector('.map-bio'));await change(mp,'[data-change="map-layer"][value="protect"]',true);assert.equal(mp.d.querySelectorAll('.map-bio').length,3);
 await change(mp,'[data-change="map-layer"][value="stands"]',false);assert(!mp.d.querySelector('.map-stand'));await change(mp,'[data-change="map-layer"][value="stands"]',true);assert.equal(mp.d.querySelectorAll('.map-stand').length,3);await cycle(mp);
 await click(mp,'[data-action="map-layers"]');await click(mp,'[data-action="map-legend"]');const legend=mp.d.querySelector('[data-map-legend]').textContent;
 for(const t of ['Frei','Geplant, nicht gesendet','An Ressource gesendet','An Team gesendet','Begonnen','Abgeschlossen','Ausgewählt','Wendeplatz','Abladepunkt','Harvester-Route','Forwarder-Route','simulierte Maschinenposition','Bildkoordinaten, nicht georeferenziert','1,33 m','OpenStreetMap-Mitwirkende','ODbL'])assert(legend.includes(t),'legend: '+t);
 assert.equal(mp.d.querySelectorAll('[data-map-legend] .map-key-stand').length,6,'status palette as the pills');await cycle(mp);await click(mp,'[data-action="map-legend"]');
 assert.equal(mp.d.querySelector('.map-scalebar').dataset.scaleM,'100','scale bar from the orthophoto scale');assert(mp.d.querySelector('.map-status').textContent.includes('Maßstab'));
 // Measure: two clicks, distance from the orthophoto scale (300 image units ≈ 399 m).
 await click(mp,'[data-action="map-tool"][data-tool="measure"]');await clickAt(mp,'svg[data-map-scope="main"]',100,100);await clickAt(mp,'svg[data-map-scope="main"]',400,100);
 assert.equal(mp.d.querySelector('[data-measure]').textContent,'Strecke: 399 m');assert(mp.d.querySelector('.map-measure line'));await cycle(mp);await click(mp,'[data-action="map-tool-off"]');assert(!mp.d.querySelector('[data-measure]'));
 // Landing (Avlägg) placed inside Nordhang: map, Avlägg tab, OIN preview, sessionStorage; then sent in the OIN.
 await click(mp,'[data-action="map-tool"][data-tool="landing"][data-scope="main"]');await clickAt(mp,stand(mp,'H-A01').querySelector('polygon'),120,140);
 assert.deepEqual(JSON.parse(mp.js("JSON.stringify(CFHApp.state().base.edits['H-A01'].landings)")),[{no:2,point:[120,140],id:'L2'}]);
 assert(mp.d.querySelector('.map-landing.extra[data-landing="P-A01-2"]'),'new landing on the map');assert(!mp.js('CFHApp.state().view.mapTool'),'tool ends after placing');
 assert.equal(JSON.parse(mp.storage()['cfharvest-plan-v1']).edits['H-A01'].landings.length,1,'persisted in the plan store');
 // Map symbol: palette, Wendeplatz inside Nordhang.
 await click(mp,'[data-action="map-tool"][data-tool="symbol"][data-scope="main"]');assert.equal(mp.d.querySelectorAll('.symbol-pop [data-action="map-symbol-kind"]').length,4);await cycle(mp);
 await click(mp,'[data-action="map-symbol-kind"][data-kind="turn"]');await clickAt(mp,stand(mp,'H-A01').querySelector('polygon'),100,120);assert(mp.d.querySelector('.map-symbol.sym-turn[data-order="H-A01"]'),'Wendeplatz on the map');
 // Edit on the map: click the symbol → popover with kind, move, delete.
 await click(mp,'.map-symbol[data-obj="S1"]');assert(mp.d.querySelector('[data-obj-pop]').textContent.includes('H-A01-S1'));await cycle(mp);
 await change(mp,'[data-obj-pop] [data-change="map-obj-kind"]','unload');assert(mp.d.querySelector('.map-symbol.sym-unload[data-obj="S1"]'));
 await click(mp,'[data-obj-pop] [data-action="map-obj-move"]');await clickAt(mp,'svg[data-map-scope="main"]',90,110);assert.deepEqual(JSON.parse(mp.js("JSON.stringify(CFHApp.state().base.edits['H-A01'].symbols[0].point)")),[90,110],'moved');
 await click(mp,'.map-symbol[data-obj="S1"]');await click(mp,'[data-obj-pop] [data-action="map-obj-close"]');assert(!mp.d.querySelector('[data-obj-pop]'));
 // Order detail: same layers/legend/tools on its map; the Avlägg tab lists landing and symbol and previews the OIN.
 await click(mp,'tr[data-row-order="H-A01"] [data-action="open-order"]');await click(mp,'[data-action="detail-tab"][data-tab="landings"]');
 assert(mp.d.querySelector('.detail-map-wrap [data-action="map-layers"]')&&mp.d.querySelector('.detail-map-wrap [data-action="map-legend"]')&&mp.d.querySelector('.detail-map-block [data-tool="landing"][data-scope="detail"]')&&mp.d.querySelector('.detail-map-block [data-tool="symbol"]'));
 assert(!mp.d.querySelector('.detail-map-block [data-tool="lasso"]'),'no lasso on the single-order map');assert(mp.d.querySelector('.detail-map .map-landing.extra[data-landing="P-A01-2"]'));
 assert(mp.d.querySelector('tr[data-landing-row="P-A01-2"]'),'landing in the Avlägg tab');assert(mp.d.querySelector('tr[data-symbol-row="H-A01-S1"]'));
 let oin=mp.d.querySelector('[data-oin-preview]').textContent;assert(oin.includes('"LandingKey": "P-A01-2"')&&oin.includes('"SymbolKey": "H-A01-S1"')&&oin.includes('"Type": "unload"'));await cycle(mp);
 await click(mp,'.detail-map-wrap [data-action="map-layers"]');await click(mp,'.detail-map-wrap [data-action="map-legend"]');assert(mp.d.querySelector('.detail-map-wrap [data-map-legend]'));await cycle(mp);await click(mp,'[data-action="map-layers"]');await click(mp,'[data-action="map-legend"]');
 await click(mp,'.detail-body [data-action="map-add-landing"]');await clickAt(mp,'svg[data-map-scope="detail"]',300,100);assert(mp.d.querySelector('tr[data-landing-row="P-A01-3"]'),'landing from the detail map');
 await click(mp,'tr[data-landing-row="P-A01-3"] [data-action="map-obj-delete"]');assert(!mp.d.querySelector('tr[data-landing-row="P-A01-3"]'),'deleted');
 await change(mp,'tr[data-symbol-row="H-A01-S1"] [data-change="map-obj-kind"]','protect');assert(mp.d.querySelector('.detail-map .map-symbol.sym-protect'));
 await click(mp,'[data-action="detail-back"]');
 // Plan Nordhang and send: the OIN carries the extra landing and the symbol.
 await click(mp,'tr[data-row-order="H-A01"] td[data-col="client"]');await change(mp,'[data-change="pick-row"]','H-01');await click(mp,'[data-action="move-open"]');await click(mp,'[data-action="date-ok"]');await click(mp,'[data-action="stage-save"]');
 await click(mp,'[data-action="send-open"]');await click(mp,'[data-action="send-confirm"]');
 oin=JSON.parse(mp.js("JSON.stringify(CFHApp.vm().orders[0].instructions.files.oin.OperatingInstruction)"));
 assert.deepEqual(oin.Landings.map(l=>l.LandingKey),['P-A01','P-A01-2'],'OIN landings');assert.deepEqual(oin.MapSymbols.map(s=>[s.SymbolKey,s.Type]),[['H-A01-S1','protect']]);
 // Route sequence on the map ("Ordna om löpande nummer"): Südrevier, Nordhang, Talgrund → 1, 2, 3; list Lfd.-Nr. and badges follow.
 await click(mp,'[data-action="map-tool"][data-tool="seq"]');await cycle(mp);
 for(const id of ['H-C01','H-A01','H-B01'])await clickAt(mp,stand(mp,id),0,0);
 assert.deepEqual(JSON.parse(mp.js('JSON.stringify(CFHApp.state().base.routeOrder)')),['H-C01','H-A01','H-B01']);assert(!mp.js('CFHApp.state().view.mapTool'),'mode ends when every order has a number');
 assert.deepEqual(['H-A01','H-B01','H-C01'].map(id=>mp.d.querySelector(`[data-change="seq"][data-order="${id}"]`).value),['2','3','1'],'Lfd.-Nr. boxes');
 assert.deepEqual([...mp.d.querySelectorAll('tr[data-row-order]')].map(x=>x.dataset.rowOrder),['H-C01','H-A01','H-B01'],'list sorted by Lfd.-Nr.');
 assert.deepEqual([...mp.d.querySelectorAll('.map-seq')].map(g=>[g.dataset.seq,g.textContent]),[['H-A01','2'],['H-B01','3'],['H-C01','1']]);assert.equal(mp.d.querySelector('.map-route-seq').getAttribute('points').split(' ').length,3,'route polyline');
 await click(mp,'[data-action="map-tool"][data-tool="seq"]');await clickAt(mp,stand(mp,'H-B01'),0,0);assert.deepEqual(JSON.parse(mp.js('JSON.stringify(CFHApp.state().base.routeOrder)')),['H-B01'],'a new pass starts at 1');await clickAt(mp,stand(mp,'H-B01'),0,0);assert.deepEqual(JSON.parse(mp.js('JSON.stringify(CFHApp.state().base.routeOrder)')),[],'second click removes the number');
 await click(mp,'[data-action="map-tool-off"]');
 // Level 1 (circles): selection and drag sources exist there too.
 await click(mp,'[data-action="map-zoom-out"]');assert(mp.d.querySelector('.map-circle[data-map-drag][data-order="H-A01"]'));await clickAt(mp,'.map-circle[data-order="H-C01"]',0,0,{shiftKey:true});assert(checkedIds(mp).includes('H-C01'));
 // OSM basemap flag: no georeference in the game orders → explanatory empty state with attribution, switch back to the photo.
 const osm=await replica({},'https://forestry.test/cfharvest/app/?basemap=osm');await change(osm,'[data-change="view-toggle"][value="map"]',true);
 assert(osm.d.querySelector('[data-basemap-empty]').textContent.includes('keine Geokoordinaten'));assert(osm.d.querySelector('[data-view="map"] [data-osm-attribution]').textContent.includes('OpenStreetMap-Mitwirkende'));assert(!osm.d.querySelector('svg.cfh-map'));await cycle(osm);
 await click(osm,'[data-action="map-basemap"][data-basemap="photo"]');assert(osm.d.querySelector('svg.cfh-map[data-map-scope="main"]'));
 const tiles=JSON.parse(osm.js("JSON.stringify(CFHViews.osmView([{geo:{boundary:[[51.95,8.50],[51.96,8.50],[51.96,8.52],[51.95,8.52]]}}]))"));assert(tiles.z>=12&&tiles.tiles.length>0&&tiles.tiles.every(t=>t.href.startsWith(`https://tile.openstreetmap.org/${tiles.z}/`)),'OSM tiles for georeferenced orders');
 results.mapPlanning=['click / shift-click / lasso → list selection + count','drag map selection → calendar row','landing + symbol: map, Avlägg tab, OIN, storage','route sequence on the map → Lfd.-Nr.','layers + legend + measure','OSM flag empty state','dispatch line dedupe'];

 /* 8d. Administration completion (PLAN_OVERNIGHT §4): Resurser (Typ filter, Ny with type picker, Pausa/Aktivera licens with
    confirmation, Enhetdata consent), Veckokalender (Ctrl/Shift multi-select, Godkänn → overrides in the calendar capacity),
    Kartskikt (defaults, order and colours in the map switcher), templates on the Nachrichten page. */
 const ad=await replica({});
 await adm(ad,'resources');assert.deepEqual([...ad.d.querySelectorAll('[data-change="admin-type"] option')].map(o=>o.value),['','harvester','forwarder','person','truck','other']);
 assert.equal(ad.d.querySelector('[data-change="admin-type"] option[value="other"]').title,'SV: Harv');assert.equal(ad.d.querySelector('[data-change="admin-type"] option[value="harvester"]').title,'SV: Skördare');
 await change(ad,'[data-change="admin-type"]','forwarder');assert.deepEqual([...ad.d.querySelectorAll('[data-res-table] tr[data-admin-res]')].map(t=>t.dataset.adminRes),['F-01']);await change(ad,'[data-change="admin-type"]','person');assert(ad.d.querySelector('[data-res-table]').textContent.includes('Keine Ressource dieses Typs.'));await cycle(ad);await change(ad,'[data-change="admin-type"]','');
 await click(ad,'[data-action="res-new-open"]');assert.equal(ad.d.querySelectorAll('[data-type-pick] input').length,5);await cycle(ad);await change(ad,'[data-change="res-new-type"][value="other"]',true);assert.equal(ad.d.querySelector('[data-dialog="rname"]').value,'Bodenbearbeitung R-01');
 await input(ad,'[data-dialog="rname"]','');await click(ad,'[data-action="res-new-create"]');assert.equal(ad.d.querySelector('[data-err="rname"]').textContent,'Pflichtangabe');
 await input(ad,'[data-dialog="rname"]','Bodenbearbeitung R-01');await click(ad,'[data-action="res-new-create"]');let r01=vmOf(ad).resourcesAll.find(x=>x.id==='R-01');assert.deepEqual([r01.type,r01.name,r01.plannable],['other','Bodenbearbeitung R-01',true]);
 assert(ad.d.querySelector('tr.sel[data-admin-res="R-01"]'));assert(ad.d.querySelector('[data-err="manufacturer"]'),'machine fields are required (Obligatorisk uppgift)');await cycle(ad);
 // Plan H-C01 on H-01, then pause the licence: confirmation, red cross, row leaves the calendar; activate again.
 await click(ad,'[data-nav="planning"]');await html5Drag(ad,ad.d.querySelector('tr[data-row-order="H-C01"]'),'H-01',0);await click(ad,'[data-action="stage-save"]');const endBefore=itemsOf(ad,'H-01')[0].endPos;close(endBefore,1+7/8,1e-6,'15 h at 8 h/day');
 await adm(ad,'resources');assert.equal(ad.d.querySelector('tr[data-admin-res="H-01"] [data-active]').textContent,'✓');await click(ad,'tr[data-admin-res="H-01"] [data-action="licence-open"]');
 let ldlg=ad.d.getElementById('cfhDialog');assert(ldlg.querySelector('[data-licence-question]').textContent.includes('Lizenz pausieren für'));assert(ldlg.querySelector('[data-licence-planned]').textContent.startsWith('1 '));assert(ldlg.querySelector('[data-action="licence-confirm"]').title.includes('Pausa licens'));await cycle(ad);
 await click(ad,'[data-action="licence-confirm"]');const hRow=ad.d.querySelector('tr[data-admin-res="H-01"] [data-active]');assert.equal(hRow.textContent,'✗');assert(hRow.classList.contains('bad'));assert.equal(vmOf(ad).plan.resources['H-01'].active,false);
 await click(ad,'[data-nav="planning"]');assert(!ad.d.querySelector('[data-cal-row="H-01"]'),'paused resource leaves the calendar');assert(![...ad.d.querySelectorAll('[data-change="pick-row"] option')].some(o=>o.value==='H-01'));
 await adm(ad,'resources');await click(ad,'tr[data-admin-res="H-01"] [data-action="licence-open"]');assert(ad.d.getElementById('cfhDialog').textContent.includes('Lizenz aktivieren für'));await cycle(ad);await click(ad,'[data-action="licence-confirm"]');
 assert.equal(ad.d.querySelector('tr[data-admin-res="H-01"] [data-active]').textContent,'✓');await click(ad,'[data-nav="planning"]');assert(bar(ad,'H-01','H-C01'),'planned bar back with the licence');
 // Enhetdata: consent toggle hides and shows the machine data.
 await adm(ad,'resources');await click(ad,'[data-action="admin-res"][data-res="H-01"]');await click(ad,'[data-action="admin-res-tab"][data-tab="unit"]');assert.equal(ad.d.querySelector('[data-consent]').dataset.consent,'true');assert(ad.d.querySelector('[data-unit-data]'));await cycle(ad);
 await change(ad,'[data-change="unit-consent"]',false);assert(ad.d.querySelector('[data-unit-data-off]'));assert(!ad.d.querySelector('[data-unit-data]'));assert.equal(vmOf(ad).plan.resources['H-01'].unitDataConsent.granted,false);await cycle(ad);
 await change(ad,'[data-change="unit-consent"]',true);assert(ad.d.querySelector('[data-unit-data]'));
 // Veckokalender: plain click selects one day, Ctrl adds/removes, Shift selects a range, headers select a day or a resource.
 await adm(ad,'weekcal');const weekSel=p=>JSON.parse(p.js('JSON.stringify(CFHApp.state().view.admin.weekSel)'));
 const wk=async(p,key,mods={})=>{p.d.querySelector(`.wk-chip[data-key="${key}"]`).dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,...mods}));await tick();};
 await wk(ad,'H-01:1');await wk(ad,'H-01:2');assert.deepEqual(weekSel(ad),['H-01:2'],'plain click replaces the selection');
 await wk(ad,'H-01:3',{ctrlKey:true});assert.deepEqual(weekSel(ad),['H-01:2','H-01:3']);await wk(ad,'H-01:2',{metaKey:true});assert.deepEqual(weekSel(ad),['H-01:3'],'Ctrl/Cmd toggles');
 await wk(ad,'H-01:0');await wk(ad,'H-01:4',{shiftKey:true});assert.deepEqual(weekSel(ad).sort(),['H-01:0','H-01:1','H-01:2','H-01:3','H-01:4']);assert.equal(ad.d.querySelector('[data-week-count]').textContent,'5');
 assert.equal(ad.d.querySelectorAll('.wk-chip.picked').length,5);assert(ad.d.querySelector('[data-action="week-apply"]').title.includes('Godkänn'));await cycle(ad);
 await input(ad,'[data-admin="hours"]','4');await click(ad,'[data-action="week-apply"]');assert.equal(ad.d.querySelectorAll('.wk-chip.override').length,5,'yellow override chips');assert.equal(ad.d.querySelector('.wk-chip[data-key="H-01:2"]').textContent,'4');assert.equal(weekSel(ad).length,0);
 for(let d=0;d<5;d++)assert.equal(ad.js(`CFHModel.hoursOn(CFHApp.vm().rows.find(x=>x.id==='H-01'),${d})`),4);
 await click(ad,'[data-nav="planning"]');const ov=[...ad.d.querySelectorAll('[data-cal-row="H-01"] .cal-ov')];assert.equal(ov.length,5,'overrides visible on the calendar row');assert.equal(ov[0].textContent,'4 h');
 close(itemsOf(ad,'H-01')[0].endPos,3+3/4,1e-6,'15 h at 4 h/day: the bar re-flows');assert(itemsOf(ad,'H-01')[0].endPos>endBefore);assert(bar(ad,'H-01','H-C01').title.includes('3,75 Tage'));await cycle(ad);
 await adm(ad,'weekcal');await click(ad,'[data-action="week-col"][data-day="2"]');assert.deepEqual(weekSel(ad),JSON.parse(ad.js("JSON.stringify(CFHApp.vm().resourcesAll.filter(x=>x.active!==false).map(x=>x.id+':2'))")),'column head: the day for every resource');
 await click(ad,'[data-action="week-row"][data-res="H-01"]');assert.equal(weekSel(ad).length,7,'row head: the visible week of one resource');await click(ad,'[data-action="week-reset"]');assert.equal(ad.d.querySelectorAll('.wk-chip.override').length,0);
 await change(ad,'[data-change="week-multi"]',true);await wk(ad,'F-01:1');await wk(ad,'F-01:3');assert.deepEqual(weekSel(ad),['F-01:1','F-01:3'],'multi-select switch for touch');await click(ad,'[data-action="week-clear"]');
 // Kartskikt: default layers, order and colour drive the map switcher (planning map and order detail map).
 await adm(ad,'layers');assert.deepEqual([...ad.d.querySelectorAll('tr[data-layer-row]')].map(t=>t.dataset.layerRow),['photo','stands','landings','symbols','protect','neighbours','routes','machines']);
 await change(ad,'[data-change="layer-on"][value="routes"]',true);await change(ad,'[data-change="layer-on"][value="neighbours"]',false);await click(ad,'[data-action="layer-move"][data-key="routes"][data-dir="-1"]');await click(ad,'[data-action="layer-move"][data-key="routes"][data-dir="-1"]');
 await change(ad,'[data-change="layer-colour"][data-key="stands"]','#ff0000');assert(ad.d.querySelector('[data-layer-dirty]'));await cycle(ad);await click(ad,'[data-action="layer-save"]');assert(!ad.d.querySelector('[data-layer-dirty]'));
 const order8=['photo','stands','landings','symbols','routes','protect','neighbours','machines'];assert.deepEqual(JSON.parse(ad.storage()['cfharvest-plan-v1']).admin.layers.order.slice(0,8),order8);
 await click(ad,'[data-nav="planning"]');await change(ad,'[data-change="view-toggle"][value="map"]',true);await click(ad,'[data-action="map-layers"]');let lp=ad.d.querySelector('[data-map-layers]');
 assert.deepEqual([...lp.querySelectorAll('input')].map(i=>i.value),order8,'switcher in Kartskikt order');assert(lp.querySelector('input[value="routes"]').checked&&!lp.querySelector('input[value="neighbours"]').checked);
 assert(ad.d.querySelector('svg.cfh-map[data-map-scope="main"] .map-routes'),'routes drawn by default');assert(!ad.d.querySelector('svg.cfh-map[data-map-scope="main"] .map-overlay'),'neighbours off by default');assert(ad.d.querySelector('svg.cfh-map .map-layers').getAttribute('style').includes('--lc-stands:#ff0000'));
 await change(ad,'[data-change="map-layer"][value="neighbours"]',true);assert(ad.d.querySelector('svg.cfh-map .map-overlay'),'planner can still switch a layer on');await click(ad,'[data-action="map-layers"]');
 await click(ad,'[data-action="open-order"][data-order="H-A01"]');await click(ad,'.detail-map-wrap [data-action="map-layers"]');assert.deepEqual([...ad.d.querySelectorAll('.detail-map-wrap [data-map-layers] input')].map(i=>i.value),order8);await click(ad,'[data-action="detail-back"]');
 // Messages page: templates and users as recipients.
 await click(ad,'[data-nav="messages"]');await change(ad,'[data-change="msg-to"]','H-01');await change(ad,'[data-change="msg-template"][data-scope="messages"]','MT-01');assert(ad.d.querySelector('[data-input="msg-text"]').value.startsWith('Neuer Arbeitsauftrag TRI - V-26-014 - H-C01'),'template filled for the resource');
 await click(ad,'[data-action="msg-send"]');await change(ad,'[data-change="msg-to"]','user:h-01');await input(ad,'[data-input="msg-text"]','Bitte Funkgerät laden');await click(ad,'[data-action="msg-send"]');assert(ad.d.querySelector('[data-message][data-to="user:h-01"]').textContent.includes('Fahrer Harvester H-01'));await cycle(ad);
 results.administration=['17-item menu, 8 disabled with reason','Eget företag + Biometria id validation','users: Ny/Spara/Uppdatera, deactivate, Tillgång till resurser, message','role matrix','Avtal + new client + order links','Resursöverföringar + SE number','Meddelande mallar in send dialogs','Kartskikt → map switcher','Resurser Typ filter, Ny type picker, licence pause dialog, Enhetdata consent','Veckokalender Ctrl/Shift select + Godkänn → calendar capacity','edits survive the game handoff'];
 /* Catalogue coverage of every German phrase seen above; every replica phrase has English and French. */
 const cat=r.w.ForestryTranslations,keys=Object.keys(cat).sort((x,y)=>y.length-x.length),reg=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const allowed=/CFHarvest|Trimble|Forestry|StanForD|Excel|PDF|XLSX|WoodForce|\bTRI\b|\b(?:PIN|OIN|FOI|FDI|HPR|FPR)\b|Geobasis NRW \/ Land NRW|dl-de\/zero-2-0|BIO-0[123]|Harvester|Forwarder/g;
 const missing=[...sources].map(source=>({source,remainder:source.replace(reg,'').replace(allowed,'').trim()})).filter(x=>/[a-zäöüß]{3}/i.test(x.remainder));
 if(process.env.CFH_I18N_DUMP)fs.writeFileSync(process.env.CFH_I18N_DUMP,JSON.stringify(missing,null,1));
 assert.deepEqual(missing,[],'Missing replica translations');
 const own=require('../cfharvest/app/i18n-cfharvest.js');for(const [de,t] of Object.entries(own))assert(Array.isArray(t)&&t.length===2&&t.every(x=>typeof x==='string'&&x.trim()),'EN/FR for '+de);
 /* 9. Narrow screen markup: views stack (CSS) and English default language works on load. */
 const en=await page('cfharvest/app/index.html',REPLICA_FILES,'https://forestry.test/cfharvest/app/',{},'en');await tick();assert(en.d.getElementById('cfhNav').textContent.includes('Work planning'),'EN navigation');assert(en.d.querySelector('[data-view="list"] h2').textContent.includes('(Uppdragslista)'));
 for(const p of [g,r,back,g2,r2,solo,en,cf,lb,mp,osm,ad])p.close();
 console.log(JSON.stringify({passed:true,...results,replicaPhrases:Object.keys(own).length,acceptance:['three stands as work orders + K-01 chain','Nordhang on K-01 day 1, Skicka → teal/purple','game: digital handover pre-confirmed, validate null','follow-up = receipt (0.1 fm), status harvesting','round 3: PIN v2, H-01 on v1 flagged','two-server fragment handoff with nonce'],milestone2:['German shell and 14 columns','HTML5 drag list→calendar, bar→resource (Kopiera), reorder','Pointer Events touch drag','insert-between shifts on Spara','Skicka PIN banner','status pill colours','detail page 13 tabs','admin 17-item menu, required markers, Veckokalender','admin completion (§4)'],mode:'jsdom DOM contract; browser layout not tested'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
