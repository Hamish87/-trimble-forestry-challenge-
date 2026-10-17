// Holztransport demo (transport/): DOM contract test with jsdom. Drives the shell end to end: inbox and review
// (facsimile, highlight, place-from-map dialog, release), dispatch (map mount, selection, publish, allocate),
// driver phone (accept, pickup, cleared, delivery note, arrival, unloading, offline queue and sync), receipts
// (tickets, matching dialog, ledger, reconciliation), reports and print, admin, DE/EN/FR, demo run. No layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));const ticks=async n=>{for(let i=0;i<n;i++)await tick();};
const FILES=[...fs.readFileSync('transport/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(s=>!/^https?:/.test(s)).map(s=>path.join('transport',s));
function patch(w){w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.URL.createObjectURL=()=>'blob:x';w.confirm=()=>true;}
const CORE=FILES.filter(f=>/(core\/(i18n|i18n-long|units|coords|extract|model|store)|data\/[a-z]+)\.js$/.test(f));
const EMPTY=(()=>{const c=vm.createContext({console,structuredClone});for(const f of CORE)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});return vm.runInContext('const {clock,...plain}=TransportCore.store.create({storage:null}).state;JSON.stringify(plain)',c);})();
async function page(url,lang,opts={}){
  const html=fs.readFileSync('transport/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,c=dom.getInternalVMContext();patch(w);
  if(lang)w.localStorage.setItem('transport-demo-lang',lang);
  if(!opts.firstRun)w.localStorage.setItem('transport-demo-v1',EMPTY); // a saved (empty) workspace: the first visit without one plays the demo run
  for(const f of FILES)vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
  const js=code=>vm.runInContext(code,c),d=w.document;await ticks(2);
  js('TransportApp.api.confirm=()=>true;TransportApp.api.print=()=>{globalThis.__printed=true;};TransportApp.api.download=(n,t)=>{globalThis.__download=[n,t];};');
  return {dom,w,d,js,go:async h=>{w.location.hash=h;await ticks(2);js('TransportApp.render()');await tick();},close:()=>w.close()};
}
// jsdom's selector engine (nwsapi) returns stale results for repeated selectors after innerHTML re-renders, so the
// test uses its own tiny matcher over the live DOM: groups (","), descendant combinator (" "), compounds of
// tag · #id · .class · [attr="value"].
function matchCompound(el,comp){const m=comp.match(/^([a-z][\w-]*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i);if(!m)throw new Error('unsupported selector '+comp);
  if(m[1]&&el.tagName.toLowerCase()!==m[1].toLowerCase())return false;
  for(const part of m[2].match(/#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g)||[]){if(part[0]==='#'){if(el.id!==part.slice(1))return false;}else if(part[0]==='.'){if(!el.classList.contains(part.slice(1)))return false;}else{const a=part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);const v=el.getAttribute(a[1]);if(a[2]===undefined?v===null:v!==a[2])return false;}}
  return true;}
function matchSel(el,sel){const comps=sel.trim().split(/\s+/);if(!matchCompound(el,comps[comps.length-1]))return false;let node=el.parentElement;for(let i=comps.length-2;i>=0;i--){while(node&&!matchCompound(node,comps[i]))node=node.parentElement;if(!node)return false;node=node.parentElement;}return true;}
function qa(p,sel){const groups=sel.split(',').map(x=>x.trim()).filter(Boolean);const out=[];for(const el of p.d.getElementsByTagName('*'))if(groups.some(g=>matchSel(el,g)))out.push(el);return out;}
const q=(p,s)=>qa(p,s)[0]||null;
async function click(p,sel){const el=typeof sel==='string'?q(p,sel):sel;assert(el,'missing '+sel);assert(!el.disabled&&!el.hasAttribute('disabled'),'disabled '+sel);el.dispatchEvent(new p.w.MouseEvent('click',{bubbles:true,cancelable:true}));await ticks(3);return el;}
async function change(p,sel,value){const el=typeof sel==='string'?q(p,sel):sel;assert(el,'missing '+sel);if(el.type==='checkbox'||el.type==='radio')el.checked=value;else el.value=value;el.dispatchEvent(new p.w.Event('change',{bubbles:true}));await ticks(2);return el;}
async function input(p,sel,value){const el=typeof sel==='string'?q(p,sel):sel;assert(el,'missing '+sel);el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));await ticks(2);return el;}
async function submit(p,form){form.dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));await ticks(6);}
const dlg=p=>q(p,'#tpDialog');const fld=(f,n)=>{const el=f.querySelector(`[name="${n}"]`);assert(el,'field '+n);return el;};const text=el=>(el?el.textContent:'').replace(/\s+/g,' ');
const stateOf=p=>p.js('TransportApp.store.state');

(async()=>{
  const p=await page('https://forestry.test/transport/#/inbox');
  /* ---------- shell ---------- */
  assert(q(p,'#tpNav a[href="#/inbox"].active'),'inbox is the default route');assert(text(q(p,'.docs')).includes('Noch keine E-Mails'));
  assert.equal(q(p,'#tpPersona select').value,'U-DISPO');assert(text(q(p,'#tpBanner')).includes('Musterholz Transporte GmbH'));
  /* ---------- inbox: deliver, list, review ---------- */
  await click(p,'[data-action="deliver-demo"]');assert.equal(qa(p,'li.doc').length,5);assert(text(q(p,'#tpNav a[href="#/inbox"]')).includes('5'),'needs-review badge');assert(text(q(p,'#tpToast')).includes('zugestellt'));
  await click(p,'li.doc[data-doc="DOC-TTW-1"]');assert(q(p,'.review[data-doc="DOC-TTW-1"]'),'review opened');
  assert.equal(qa(p,'.rv-pages .tab').length,5,'five page tabs');assert(qa(p,'.fx-line').length>20,'facsimile lines');assert(text(q(p,'.fx-ribbon')).includes('Nachbildung'));
  assert.equal(qa(p,'.stacks tbody tr').length,2,'two stack rows');assert(text(q(p,'.exc')).includes('E-LEN')&&text(q(p,'.exc')).includes('E-INSTR')&&text(q(p,'.exc')).includes('E-MAP-ONLY'));
  assert(text(q(p,'.rv-right')).includes('🔒'),'commercial field visible to the dispatcher');
  // highlight a field line on the facsimile
  await click(p,'.stacks tr[data-stack="124_501/9"] strong[data-action="review-highlight"]');assert(q(p,'.fx-line.hl'),'line highlighted on the page');
  // map page tab shows the schematic map with pins
  await click(p,qa(p,'.rv-pages .tab')[2]);assert(q(p,'.fx-map .fx-pin[data-pin="9"]'),'map page facsimile with pins');
  // place from map: dialog with placeMap and coordinate inputs
  await click(p,'.stacks tr[data-stack="124_501/9"] [data-action="review-line-place"]');assert(dlg(p).open&&q(p,'#tpDialog #placeMap .tm'),'place dialog with a mounted map');
  assert(q(p,'#tpDialog [data-action="place-save"]').hasAttribute('disabled'),'no point yet');
  await input(p,'#tpDialog [name="lat"]','47.831');await input(p,'#tpDialog [name="lon"]','8.869');assert(!q(p,'#tpDialog [data-action="place-save"]').hasAttribute('disabled'));
  q(p,'#tpDialog [name="note"]').value='aus Kartenseite 3 platziert';await click(p,'#tpDialog [data-action="place-save"]');assert(!dlg(p).open);assert(text(q(p,'.stacks tr[data-stack="124_501/9"]')).includes('Standort bestätigt'));
  // second stack: skip it, then reset
  await click(p,'.stacks tr[data-stack="124_501/10"] [data-action="review-line-skip"]');assert(q(p,'.stacks tr[data-stack="124_501/10"].skipped'));await click(p,'.stacks tr[data-stack="124_501/10"] [data-action="review-line-reset"]');assert(!q(p,'.stacks tr[data-stack="124_501/10"].skipped'));
  assert.equal(q(p,'select[name="destinationId"]').value,'P-STADT-AACH','printed Zielwerk pre-selected');await change(p,'select[name="destinationId"]','P-STADT-AACH');await input(p,'[data-action="review-note"]','Zielwerk telefonisch bestätigt');
  await click(p,'[data-action="review-release"]');await ticks(3);
  let st=stateOf(p);assert.equal(Object.keys(st.orders).length,1);const ttw=Object.values(st.orders)[0];assert.equal(ttw.destinationId,'P-STADT-AACH');assert.equal(st.documents['DOC-TTW-1'].status,'Ready');
  assert(p.w.location.hash.startsWith('#/dispatch'),'release navigates to dispatch');
  /* ---------- dispatch ---------- */
  await p.go('#/dispatch?order='+ttw.id);assert(q(p,'#dispatchMap .tm'),'tile map mounted');assert(q(p,'.tm-attribution')&&text(q(p,'.tm-attribution')).includes('OpenStreetMap'));
  assert.equal(qa(p,'.dispatch-table tr.stack-row').length,2);assert.equal(qa(p,'.tm-marker.pin').filter(m=>!m.className.includes('dest')&&!m.className.includes('base')).length,1,'one confirmed stack pin');
  // the queues live in the to-do drawer: collapsed by default, one chip per queue
  assert(!q(p,'.drawer'),'drawer closed by default');assert(text(q(p,'.todo-bar')).includes('Standort erforderlich'));await click(p,'[data-action="drawer-toggle"][data-key="location"]');assert(q(p,'.drawer .panel'),'drawer open');
  assert(text(q(p,'.panel')).includes('Standort erforderlich')&&text(q(p,'.panel')).includes('Polter 10'),'location-needed queue lists the unconfirmed stack');
  // confirm the second location from the dispatch queue via the place dialog
  await click(p,qa(p,'.panel [data-action="location-place"]')[0]);assert(dlg(p).open);await input(p,'#tpDialog [name="lat"]','47.838');await input(p,'#tpDialog [name="lon"]','8.835');await click(p,'#tpDialog [data-action="place-save"]');
  st=stateOf(p);assert(Object.values(st.stacks).every(s=>s.location.status==='confirmed'));assert.equal(qa(p,'.tm-marker.pin').filter(m=>/c\d/.test(m.className)).length,2);
  // focus a pin → card
  await click(p,qa(p,'.tm-marker.pin').find(m=>/c\d/.test(m.className)));await ticks(2);assert(q(p,'.focus-card'),'focus card after pin click');
  // select both stacks and publish to the fleet
  await change(p,'[data-action="dispatch-select-all"]',true);assert(text(q(p,'.selbar')).includes('2 ausgewählt'));
  await click(p,'.selbar [data-action="publish-open"]');assert(dlg(p).open&&q(p,'#tpDialog form[data-form="publish"]'));await submit(p,q(p,'#tpDialog form[data-form="publish"]'));
  st=stateOf(p);assert(Object.values(st.stacks).every(s=>s.publication.scope==='fleet'));assert(text(q(p,'.dispatch-table')).includes('Flotte'));
  // allocate stack 9 to driver U-D1
  const key9=Object.values(st.stacks).find(s=>s.tempKey==='124_501/9').key;
  await click(p,`.stack-row[data-stack="${key9}"] [data-action="dispatch-focus"]`);await click(p,'.focus-card [data-action="allocate-open"]');const af=q(p,'#tpDialog form[data-form="allocate"]');assert(af);fld(af,'driver').value='U-D1';await submit(p,af);
  st=stateOf(p);const alloc=Object.values(st.allocations)[0];assert.equal(alloc.driverId,'U-D1');assert.equal(alloc.state,'Proposed');assert(text(q(p,'.dispatch-table')).includes('Vorgeschlagen'));
  /* ---------- driver ---------- */
  await p.go('#/driver');assert(text(q(p,'.driver')).includes('Fahrer-Persona wählen'));await change(p,'.drv-pick select[name="persona"]','U-D1');
  assert(q(p,'.phone'),'phone frame');assert.equal(qa(p,'.job').length,2,'assigned + fleet-visible job');assert(!text(q(p,'.phone')).includes('Frachtsatz'),'no rates for drivers');
  await click(p,'.job [data-action="driver-accept"]');st=stateOf(p);assert.equal(Object.values(st.allocations)[0].state,'Accepted');
  await click(p,'.job [data-action="pickup-open"]');const pf=q(p,'#tpDialog form[data-form="pickup"]');assert(pf);fld(pf,'qty').value='42';fld(pf,'pieces').value='';await submit(p,pf);
  st=stateOf(p);assert.equal(Object.values(st.loads).length,1);assert.equal(st.stacks[key9].progress,'PartlyCollected');assert(text(q(p,'.job')).includes('Teilweise abgeholt'));
  // unknown quantity is not a zero
  await click(p,'.job [data-action="pickup-open"]');const pf2=q(p,'#tpDialog form[data-form="pickup"]');fld(pf2,'unknown').checked=true;fld(pf2,'qty').value='7';await submit(p,pf2);st=stateOf(p);assert.equal(Object.values(st.loads)[0].lines[1].qty,null,'unknown stays unknown');
  // cleared with explicit confirmation
  await click(p,'.job [data-action="cleared-open"]');const cf=q(p,'#tpDialog form[data-form="cleared"]');fld(cf,'confirm').checked=true;await submit(p,cf);st=stateOf(p);assert.equal(st.stacks[key9].progress,'Cleared');
  // load tab: issue note, arrive, unload
  await click(p,'.phone-tabs [data-tab="load"]');assert(text(q(p,'.phone-body')).includes('Geplant'));await click(p,'[data-action="note-open"]');const nf=q(p,'#tpDialog form[data-form="note"]');assert(nf);fld(nf,'qty_1').value='5';await submit(p,nf);
  st=stateOf(p);const load=Object.values(st.loads)[0];assert.equal(load.state,'Loaded');assert.equal(Object.values(st.notes)[0].number,'LS-2026-00001');assert.equal(Object.values(st.notes)[0].declaredLines[1].qty,5);
  await click(p,'[data-action="arrived"]');st=stateOf(p);assert.equal(Object.values(st.loads)[0].state,'Arrived');
  await click(p,'[data-action="unload-open"]');await submit(p,q(p,'#tpDialog form[data-form="unload"]'));st=stateOf(p);assert.equal(Object.values(st.loads)[0].state,'Unloaded');assert(text(q(p,'.phone-body')).includes('Werksmaß ausstehend'));
  // offline queue on the other (fleet) stack: reserve online first, then go offline and record a pickup
  await click(p,'.phone-tabs [data-tab="work"]');await click(p,'.job [data-action="driver-reserve"]');st=stateOf(p);assert(Object.values(st.allocations).some(a=>a.state==='Reserved'));
  await click(p,'[data-action="driver-online"]');assert(text(q(p,'.phone-bar')).includes('Offline'));
  await click(p,'.job [data-action="pickup-open"]');const pf3=q(p,'#tpDialog form[data-form="pickup"]');fld(pf3,'qty').value='30';await submit(p,pf3);st=stateOf(p);assert.equal(st.ui.queue.length,1);assert(text(q(p,'.phone-bar')).includes('1 ausstehend'));assert(text(q(p,'.phone-body')).includes('Ausstehende Synchronisierung'));
  const eventsBefore=st.events.length;await click(p,'[data-action="driver-online"]');st=stateOf(p);assert.equal(st.ui.queue.length,0);assert.equal(st.events.length,eventsBefore+1,'queued event applied exactly once');
  await click(p,'.phone-tabs [data-tab="docs"]');assert(text(q(p,'.phone-body')).includes('LS-2026-00001'));
  /* ---------- pin popup, photos, originals ---------- */
  await p.go('#/dispatch?stack='+key9);assert(q(p,'#dispatchMap .tm-popup .pin-card'),'pin popup card for the focused stack');assert(text(q(p,'.pin-card')).includes('Polter 9')&&q(p,'.pin-card a.nav'),'popup shows the stack and a navigation link');
  await click(p,'.pin-card [data-action="map-popup-close"]');assert(!p.w.location.hash.includes('stack='),'popup close clears the focus');
  await p.go('#/driver');await change(p,'.drv-pick select[name="persona"]','U-D1');await click(p,'.phone-tabs [data-tab="work"]');assert(q(p,'.job.hero'),'driver hero card');assert(q(p,'.job.row-card'),'other tasks listed as rows');await click(p,'.job.row-card [data-action="driver-job"]');assert(q(p,'.job.hero.done'),'tapping a row makes it the hero');await click(p,'.job.row-card [data-action="driver-job"]');
  // a pickup with a photo: the stack gets the photo, thumbnails appear, the lightbox opens
  await click(p,'.job.hero [data-action="pickup-open"]');const pf4=q(p,'#tpDialog form[data-form="pickup"]');assert(q(p,'#tpDialog .photo-btn input[type="file"]'),'camera/file input in the pickup dialog');fld(pf4,'qty').value='3';await submit(p,pf4);
  st=stateOf(p);const heroKey=q(p,'.job.hero').dataset.stack;p.js(`TransportApp.store.driverEvent({kind:'problem',stackKey:${JSON.stringify(heroKey)},problemKind:'Mengenabweichung',note:'weniger als angegeben',photos:[TransportCore.photos.illustration('t','stack','Test')]})`);p.js('TransportApp.render()');await tick();
  st=stateOf(p);assert(st.stacks[heroKey].photos.length>=1,'photo attached to the stack');assert(q(p,'.job.hero .photo'),'thumbnail in the hero card');await click(p,'.job.hero .photo');assert(q(p,'#tpDialog .photo-dialog img'),'lightbox');await click(p,'#tpDialog [data-action="dialog-close"]');
  // originals: attach a (fake) PDF to the TTW document in the review, toggle the viewer, release it to drivers
  await p.go('#/inbox/DOC-TTW-1');assert(q(p,'.rv-origbar input[data-action="original-attach"]'),'attach control');assert(!q(p,'.rv-origbar [data-action="review-original"]'));
  {const inp=q(p,'.rv-origbar input[data-action="original-attach"]');const file=new p.w.File(['%PDF-1.4 fake'],'Fuhrauftrag_3311.pdf',{type:'application/pdf'});Object.defineProperty(inp,'files',{value:[file]});inp.dispatchEvent(new p.w.Event('change',{bubbles:true}));await ticks(8);}
  st=stateOf(p);assert(st.documents['DOC-TTW-1'].original&&st.documents['DOC-TTW-1'].original.name==='Fuhrauftrag_3311.pdf','original metadata stored on the document');assert(q(p,'.rv-origbar [data-action="review-original"].active'),'viewer toggle active');assert(q(p,'.orig-view'),'original view (fallback text without pdf.js)');
  await click(p,'.rv-origbar [data-action="review-original"][data-on="0"]');assert(q(p,'.fx-sheet'),'back to the facsimile');
  assert.equal(st.documents['DOC-TTW-1'].driverOriginal,false,'commercial fields → not released by default');await change(p,'input[data-action="driver-original-toggle"]',true);st=stateOf(p);assert.equal(st.documents['DOC-TTW-1'].driverOriginal,true);
  await p.go('#/driver');assert(q(p,'.job.hero [data-action="original-open"]'),'driver may open the released original');await click(p,'.job.hero [data-action="original-open"]');assert(q(p,'#tpDialog .orig-dialog'));await ticks(4);await click(p,'#tpDialog [data-action="dialog-close"]');
  /* ---------- receipts ---------- */
  await p.go('#/receipts/tickets');await click(p,'[data-action="deliver-tickets"]');assert.equal(qa(p,'.receipts tbody tr').length,3);
  st=stateOf(p);const needs=Object.values(st.receipts).filter(r=>r.matchState==='MatchNeeded');assert(needs.length>=1);
  await click(p,`[data-action="receipt-assign-open"][data-receipt="${needs[0].id}"]`);const asf=q(p,'#tpDialog form[data-form="assign"]');assert(asf);fld(asf,'other').value=Object.values(st.loads)[0].id;await submit(p,asf);st=stateOf(p);assert.equal(st.receipts[needs[0].id].matchState,'Matched');assert.equal(st.receipts[needs[0].id].matchMethod,'manual');
  await p.go('#/receipts/ledger');assert(qa(p,'.receipts tbody tr').length>=4);assert(text(q(p,'.receipts')).includes('Fahrerschätzung'));
  await p.go('#/receipts/recon?order='+ttw.id);assert(text(q(p,'.receipts')).includes('Je Polter'));assert(q(p,'.cmp'));
  await p.go('#/receipts/notes');await click(p,'a[href="#/print/note/LS-2026-00001"]');await p.go('#/print/note/LS-2026-00001');assert(q(p,'.np-sheet')&&text(q(p,'.np-sheet')).includes('LS-2026-00001')&&text(q(p,'.np-sheet')).includes('Lieferschein'));
  /* ---------- reports ---------- */
  await p.go('#/reports');assert(qa(p,'.reports tbody tr').length>=1);await p.go('#/reports/'+ttw.id);assert(q(p,'.report-form')&&text(q(p,'.report-form')).includes('Abfuhrmeldung'));
  await click(p,'[data-action="export-json"]');assert(p.js('globalThis.__download')[0].includes(ttw.id));await click(p,'[data-action="report-sent"]');st=stateOf(p);assert(st.orders[ttw.id].reportSentAt);assert(st.audit.some(a=>a.action==='report.markedSent'));
  await click(p,'[data-action="print"]');assert(p.js('globalThis.__printed'));
  /* ---------- admin ---------- */
  await p.go('#/admin/profiles');assert(qa(p,'.profile').length===5);await p.go('#/admin/settings');const sf=q(p,'form[data-form="settings"]');fld(sf,'tolerancePct').value='1';await submit(p,sf);st=stateOf(p);assert.equal(st.settings.tolerancePct,1);
  await p.go('#/admin/users');const uf=q(p,'form[data-form="user"]');fld(uf,'name').value='Neu Fahrer';await submit(p,uf);st=stateOf(p);assert(st.users.some(u=>u.name==='Neu Fahrer'));
  await p.go('#/admin/audit');assert(qa(p,'.admin tbody tr').length>10);
  /* ---------- inbox: resend → duplicate, amendment → diff; import by text ---------- */
  await p.go('#/inbox');await click(p,'[data-action="deliver-scenario"][data-scenario="resend"]');await ticks(2);await p.go('#/inbox/DOC-TTW-RESEND');assert(text(q(p,'.review')).includes('Exakte Wiederholung'));st=stateOf(p);assert.equal(st.documents['DOC-TTW-RESEND'].status,'Duplicate');
  await click(p,'[data-action="deliver-scenario"][data-scenario="amendment"]');await ticks(2);await p.go('#/inbox/DOC-TTW-AMEND');assert(q(p,'.diff')&&text(q(p,'.diff')).includes('Polter 11')&&text(q(p,'.diff')).includes('124_501/10')&&text(q(p,'.diff')).includes('Abfuhrende'),'version diff lists the new stack, the changed stack and the header change');
  await click(p,'[data-action="review-release"]');await ticks(3);st=stateOf(p);assert.equal(st.orders[ttw.id].versions.length,2);assert.equal(st.stacks[key9].progress,'Cleared','field work preserved through the amendment');
  await p.go('#/inbox');await click(p,'[data-action="import-open"]');const imf=q(p,'#tpDialog form[data-form="import"]');assert(imf);fld(imf,'sender').value='x@neu.demo';fld(imf,'subject').value='Transportauftrag 77';fld(imf,'text').value='Transportauftrag Nr. 77\nAuftraggeber:\tNeuer Kunde GmbH\nAbfuhrbeginn:\t20.10.2026\tAbfuhrende:\t30.10.2026\nHieb\tLos\tPolter\tHolzart\tMenge\tStück\tGPS - Koordinaten\n4711\t3\t1\tFI\t20,00 fm\t12\t48,12 9,55\n';await submit(p,imf);
  st=stateOf(p);const imp=Object.values(st.documents).find(d=>d.subject==='Transportauftrag 77');assert(imp&&imp.status==='NeedsReview'&&imp.extraction.orders[0].stacks.length===1);assert(imp.extraction.orders[0].stacks[0].coords.parsed.ok,'decimal coordinate pair in one cell parsed');
  /* ---------- excerpt dialog ---------- */
  await p.go('#/inbox/DOC-TTW-1');await click(p,'[data-action="excerpt-open"]');assert(text(dlg(p)).includes('Fahrerauszug')&&text(dlg(p)).includes('redigiert'));await click(p,'#tpDialog [data-action="dialog-close"]');
  /* ---------- language ---------- */
  await change(p,'#tpLang','en');assert(text(q(p,'#tpNav')).includes('Inbox')&&text(q(p,'#tpNav')).includes('Dispatch'));assert(text(q(p,'.inbox')).includes('Deliver demo e-mails'));
  await change(p,'#tpLang','fr');assert(text(q(p,'#tpNav')).includes('Boîte de réception'));await change(p,'#tpLang','de');
  /* ---------- demo run resets and replays everything ---------- */
  await p.go('#/admin/settings');await click(p,'[data-action="demo-run"]');st=stateOf(p);assert.equal(Object.keys(st.orders).length,5);assert(st.conflicts.length>=2);assert(p.w.location.hash.startsWith('#/dispatch'));
  await p.go('#/dispatch');assert.equal(qa(p,'.dispatch-table tr.stack-row').length,0,'orders collapsed by default');assert(qa(p,'.dispatch-table tr.order-row').length>=5);
  await click(p,qa(p,'.order-row [data-action="order-toggle"]')[0]);assert(qa(p,'.dispatch-table tr.stack-row').length>0,'one order expanded');assert(q(p,'.order-row.open'));
  await click(p,'[data-action="orders-expand"][data-on="1"]');assert(qa(p,'.dispatch-table tr.stack-row').length>=20,'all expanded');await click(p,'[data-action="orders-expand"][data-on="0"]');assert.equal(qa(p,'.dispatch-table tr.stack-row').length,0,'all collapsed');
  assert(qa(p,'.tm-marker,.tm-cluster').length>0);await click(p,'[data-action="drawer-toggle"][data-key="conflicts"]');assert(text(q(p,'.panels')).includes('Konflikte'));await click(p,'[data-action="drawer-toggle"][data-key="conflicts"]');assert(!q(p,'.drawer'),'chip closes the drawer again');
  // box selection on the built-in map: Shift+drag over the whole map selects every confirmed stack and expands their orders
  {const tm=q(p,'#dispatchMap .tm');const ev=(type,x,y)=>tm.dispatchEvent(new p.w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,shiftKey:true,button:0}));ev('pointerdown',0,0);ev('pointermove',640,420);ev('pointerup',640,420);await ticks(2);
   const sel=p.js('TransportApp.ui.selection');assert(sel.length>=10,'box selection picked the stacks: '+sel.length);assert(text(q(p,'.selbar')).includes('ausgewählt'));assert(qa(p,'.dispatch-table tr.stack-row').length>0,'selected orders expanded');assert(qa(p,'.tm-marker.pin.selected').length>0,'selected pins highlighted');await click(p,'[data-action="dispatch-clear"]');}
  // map engine: no token → built-in map; the Mapbox adapter is present but idle
  assert.equal(p.js('TransportCore.mapbox.token(TransportApp.store.state.settings)'),'');assert.equal(p.js('TransportCore.mapbox.sources().length'),4);assert.equal(p.js('TransportCore.mapbox.VERSION'),'3.33.0');assert(!p.js('globalThis.mapboxgl'),'mapbox-gl not loaded without a token');assert.equal(p.js('TransportConfig.mapboxToken'),'');
  /* ---------- dashboard ---------- */
  await p.go('#/dashboard');assert(qa(p,'.dash .kpi').length>=8,'KPI cards');assert(text(q(p,'.dash')).includes('Fuhren')&&text(q(p,'.dash')).includes('Werksmaß')&&text(q(p,'.dash')).includes('Murat Kaya'));
  assert(qa(p,'.dash .widget').length>=10,'widgets');assert(qa(p,'.dash-table').length>=3,'driver, mill and assortment tables');assert(q(p,'.donut svg')&&qa(p,'.cols svg').length===2,'donut and two column charts');assert(qa(p,'.cust').length===5,'one row per customer');
  await change(p,'select[name="driver"]','U-D2');assert(text(q(p,'.dash')).includes('Jana Vogel')&&qa(p,'.widget .dash-table tbody tr').length>0);assert.equal(qa(p,'.dash-table')[0].querySelectorAll('tbody tr').length,1,'driver filter narrows the driver table');
  await change(p,'select[name="days"]','7');assert(text(q(p,'.dash-filters')).includes('ab '),'period shown');await change(p,'select[name="days"]','0');await change(p,'select[name="driver"]','');
  /* ---------- driver map: every load the driver may take; a pin picks the next task ---------- */
  await p.go('#/driver');await change(p,'.drv-pick select[name="persona"]','U-D3');await click(p,'.phone-tabs [data-tab="map"]');await ticks(2);
  assert(q(p,'#driverMap[data-all] .tm'),'driver map mounted in the phone');assert(qa(p,'#driverMap .tm-marker,#driverMap .tm-cluster').length>0,'loads on the driver map');assert(text(q(p,'.drv-map-head')).includes('mir zugeteilt'));
  const k10=Object.keys(st.stacks).find(k=>k.endsWith('124_501/10'));p.js(`const s=TransportApp.store.state.stacks[${JSON.stringify(k10)}];TransportApp.maps.driver.setView(s.confirmed.lat,s.confirmed.lon,14)`);await tick();
  const p10=qa(p,'#driverMap .tm-marker.pin').find(m=>m.dataset.id===k10);assert(p10&&/\bmine\b/.test(p10.className),'Polter 10 is a pin of the driver\'s own work');await click(p,p10);await ticks(2);
  assert(q(p,'.drv-pin-card .pin-card'),'pin card below the driver map');assert(text(q(p,'.drv-pin-card')).includes('Zuteilung')&&text(q(p,'.drv-pin-card')).includes('Ziel'));assert(!q(p,'#driverMap .tm-popup .pin-card'),'no popup inside the small phone map');
  await click(p,'.drv-pin-card [data-action="driver-pick"]');await ticks(2);assert.equal(p.js('TransportApp.ui.driverTab'),'work');assert(q(p,'.job.hero')&&q(p,'.job.hero').dataset.stack===k10,'picked stack is the hero');
  /* ---------- persistence: a fresh page reloads the workspace ---------- */
  const raw=p.w.localStorage.getItem('transport-demo-v1');assert(raw&&raw.length>50000);
  const p2=await page('https://forestry.test/transport/#/reports');p2.w.localStorage.setItem('transport-demo-v1',raw);p2.js('TransportApp.store.load();TransportApp.render()');await tick();assert(qa(p2,'.reports tbody tr').length===5,'reloaded workspace');p2.close();
  p.close();
  /* ---------- first visit: no saved workspace → the demo run is played; a saved empty workspace stays empty ---------- */
  {const f=await page('https://forestry.test/transport/',null,{firstRun:true});assert.equal(Object.keys(f.js('TransportApp.store.state.orders')).length,5,'first visit seeded');assert(/Demo-Durchlauf/.test(f.d.getElementById('tpToast').textContent),'first-visit toast');assert(f.w.localStorage.getItem('transport-demo-v1').length>50000,'seeded workspace saved');f.close();
   const e=await page('https://forestry.test/transport/');assert.equal(Object.keys(e.js('TransportApp.store.state.orders')).length,0,'saved empty workspace not reseeded');e.close();}
  console.log(JSON.stringify({passed:true,mode:'jsdom DOM contract; browser layout not tested',files:FILES.length}));
})().catch(e=>{console.error(e);process.exit(1);});
