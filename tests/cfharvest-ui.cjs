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
const game=async(storage,url='https://forestry.test/dist/')=>{const p=await page('dist/index.html',GAME_FILES,url,storage);p.js('CFHarvestLink.navigate=u=>{globalThis.__nav=u;}');return p;};
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
 // Chain bars mirrored as outlined bars on the member rows [M59].
 assert(r.d.querySelector('[data-cal-row="H-01"] .cal-item.mirror[data-order="H-A01"]')&&r.d.querySelector('[data-cal-row="F-01"] .cal-item.mirror[data-order="H-A01"]'));
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
 // Administration menu (17 items, 4 enabled) [M8]; Resurser form with required markers; Veckokalender; chains; users.
 await click(r,'[data-action="nav-menu"][data-key="admin"]');const adminItems=[...r.d.querySelectorAll('[data-action="admin-page"]')];assert.equal(adminItems.length,17);assert.deepEqual(adminItems.filter(b=>!b.disabled).map(b=>b.dataset.key),['resources','weekcal','chains','users']);await cycle(r);
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
 // Messages, integration log, reports, help.
 await click(r,'[data-nav="messages"]');await input(r,'[data-input="msg-text"]','Bitte Rückegasse 3 zuerst');await click(r,'[data-action="msg-send"]');assert(r.d.querySelector('[data-message]'));await cycle(r);
 await click(r,'[data-nav="integration"]');assert(r.d.querySelector('[data-integration] tr[data-dir="out"]'));await cycle(r);
 await click(r,'[data-nav="reports"]');await cycle(r);await click(r,'[data-action="nav-menu"][data-key="help"]');await click(r,'[data-action="help-page"]');await cycle(r);
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
 let g2=await game({},'http://localhost:3000/');g2.js("state=ForestJourney.start(ForestJourney.initial());render()");await click(g2,'#cfharvestButton');const nav=g2.js('__nav');
 assert(nav.startsWith('http://localhost:3001/cfharvest/app/#cfh='),nav.slice(0,60));
 let r2=await replica({},nav);assert.equal(r2.js("CFHApp.state().source"),'hash');assert.equal(r2.w.location.hash,'');assert.equal(r2.js("CFHApp.state().returnUrl"),'http://localhost:3000/');
 await click(r2,'tr[data-row-order="H-C01"] td[data-col="client"]');await change(r2,'[data-change="pick-row"]','K-01');await click(r2,'[data-action="move-open"]');await click(r2,'[data-action="date-ok"]');
 await click(r2,'[data-action="send-open"]');await click(r2,'[data-action="send-confirm"]');assert.equal(bar(r2,'K-01','H-C01').dataset.tone,'sent','Skicka saves staged changes first');
 await click(r2,'#cfhReturn');await click(r2,'[data-action="return-confirm"]');const back2=r2.js('__nav');assert(back2.startsWith('http://localhost:3000/#cfh-return='));
 g2=await game(g2.storage(),back2);assert.equal(g2.js('state.harvester'),'c');assert.equal(g2.js('state.handoverMode'),'digital');assert.equal(g2.js('ForestGame.validate(state)'),null);assert.equal(g2.w.location.hash,'');
 /* 8. Standalone replica (no handoff) uses a demo state and does not write a return payload; staged changes are saved on return. */
 const solo=await replica({});assert.equal(solo.js("CFHApp.state().source"),'demo');assert(solo.d.querySelector('.notice.warn'));
 await html5Drag(solo,solo.d.querySelector('tr[data-row-order="H-B01"]'),'H-01',0);assert(bar(solo,'H-01','H-B01').classList.contains('unsaved'));
 await click(solo,'#cfhReturn');assert(solo.d.getElementById('cfhDialog').textContent.includes('ungespeicherte Änderungen werden vorher gespeichert'));await click(solo,'[data-action="return-confirm"]');assert.equal(solo.js('__nav'),'https://forestry.test/dist/');assert.equal(solo.storage()['cfharvest-return-v1'],undefined);
 assert.equal(JSON.parse(solo.storage()['cfharvest-plan-v1']).assignments.length,1,'staged drop saved on return');

 /* Catalogue coverage of every German phrase seen above; every replica phrase has English and French. */
 const cat=r.w.ForestryTranslations,keys=Object.keys(cat).sort((x,y)=>y.length-x.length),reg=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const allowed=/CFHarvest|Trimble|Forestry|StanForD|Excel|PDF|XLSX|WoodForce|\bTRI\b|\b(?:PIN|OIN|FOI|FDI|HPR|FPR)\b|Geobasis NRW \/ Land NRW|dl-de\/zero-2-0|BIO-0[123]|Harvester|Forwarder/g;
 const missing=[...sources].map(source=>({source,remainder:source.replace(reg,'').replace(allowed,'').trim()})).filter(x=>/[a-zäöüß]{3}/i.test(x.remainder));
 if(process.env.CFH_I18N_DUMP)fs.writeFileSync(process.env.CFH_I18N_DUMP,JSON.stringify(missing,null,1));
 assert.deepEqual(missing,[],'Missing replica translations');
 const own=require('../cfharvest/app/i18n-cfharvest.js');for(const [de,t] of Object.entries(own))assert(Array.isArray(t)&&t.length===2&&t.every(x=>typeof x==='string'&&x.trim()),'EN/FR for '+de);
 /* 9. Narrow screen markup: views stack (CSS) and English default language works on load. */
 const en=await page('cfharvest/app/index.html',REPLICA_FILES,'https://forestry.test/cfharvest/app/',{},'en');await tick();assert(en.d.getElementById('cfhNav').textContent.includes('Work planning'),'EN navigation');assert(en.d.querySelector('[data-view="list"] h2').textContent.includes('(Uppdragslista)'));
 for(const p of [g,r,back,g2,r2,solo,en])p.close();
 console.log(JSON.stringify({passed:true,...results,replicaPhrases:Object.keys(own).length,acceptance:['three stands as work orders + K-01 chain','Nordhang on K-01 day 1, Skicka → teal/purple','game: digital handover pre-confirmed, validate null','follow-up = receipt (0.1 fm), status harvesting','round 3: PIN v2, H-01 on v1 flagged','two-server fragment handoff with nonce'],milestone2:['German shell and 14 columns','HTML5 drag list→calendar, bar→resource (Kopiera), reorder','Pointer Events touch drag','insert-between shifts on Spara','Skicka PIN banner','status pill colours','detail page 13 tabs','admin 17-item menu, required markers, Veckokalender'],mode:'jsdom DOM contract; browser layout not tested'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
