// Holztransport demo (transport/): model contract. Extraction of the five anonymised sample orders (SAMPLES.md),
// coordinates, units, duplicates and amendments, publication and allocation, driver events with idempotent replay,
// loads, delivery notes, mill-ticket matching, ledger and reconciliation, reports and redaction — the release
// acceptance list of SPEC.md §10 (A1–A7). No DOM.
const assert=require('node:assert/strict');
const P='../transport/';
for(const f of ['core/i18n','core/i18n-long','core/units','core/coords','data/customers','data/fleet','data/samples','data/photos','core/extract','core/model','core/store','core/tour','core/stats'])require(P+f+'.js');
const TC=globalThis.TransportCore,TD=globalThis.TransportData;const U=TC.units,C=TC.coords,X=TC.extract,M=TC.model,S=TD.samples;
const close=(a,b,tol=1e-6,msg='')=>assert(Math.abs(a-b)<=tol,`${msg} ${a} != ${b}`);
const mem=()=>({d:{},getItem(k){return this.d[k]??null;},setItem(k,v){this.d[k]=v;},removeItem(k){delete this.d[k];}});
const codes=r=>r.exceptions.map(e=>e.code);

/* ---------- units ---------- */
assert.equal(U.parseNumber('230,636'),230.636);assert.equal(U.parseNumber('15.00','mixed'),15);assert.equal(U.parseNumber('38.540'),38540);assert.equal(U.parseNumber('0727603001'),null,'leading zero is an identifier');
assert.deepEqual(U.parseQuantity('5 LDG'),{value:5,unit:'ldg',raw:'5 LDG'});assert.equal(U.parseQuantity('77,0 FM').unit,'fm');assert.equal(U.derive({value:464.696,unit:'rm'},'fm').factorId,'rm-fm-schichtholz-v2026-10');assert.equal(U.derive({value:1,unit:'ldg'},'fm'),null,'no silent conversion without a factor');

/* ---------- coordinates ---------- */
const region={lat:48.05,lon:9.33,radiusKm:25};
let r=C.parse('09° 19\' 29,1"','48° 01\' 09,0"',{region});assert(r.ok&&r.format==='dms');close(r.lat,48.01917,1e-4);close(r.lon,9.32475,1e-4);
r=C.parse('09° 21\' 1244,7"','48° 05\' 307,5"',{region});assert(!r.ok,'seconds ≥ 60 are malformed');assert(r.verdicts.some(v=>v.code==='seconds-range'&&v.level==='block'));assert(r.suggestion&&C.inGermany(r.suggestion.lat,r.suggestion.lon),'÷100 suggestion offered, never applied');
r=C.parse('48,0192','9,3248',{region});assert(r.ok&&r.verdicts.some(v=>v.code==='axis-order-assumed'),'unambiguous latitude-first pair read with an info verdict');close(r.lat,48.0192,1e-6);close(r.lon,9.3248,1e-6);
r=C.parse('48,12 9,55','',{region});assert(r.ok&&r.format==='dd','space-separated pair in one cell');close(r.lat,48.12,1e-6);r=C.parse('9.55, 48.12','',{region});assert(r.ok,'dot-decimal pair with comma separator');close(r.lon,9.55,1e-6);
r=C.parse('32U 524300 5318600','',{region});assert(r.ok&&r.format==='utm'&&r.crs==='EPSG:25832');close(r.lat,48.02,0.01);
r=C.parse('3524300','5318600',{region});assert(r.ok&&r.format==='gk'&&r.crs==='EPSG:31467');close(r.lon,9.3246,0.01);
r=C.parse('390000','5770000',{region:{lat:52.05,lon:13.4,radiusKm:40}});assert(r.ok&&r.crs==='EPSG:25833','zone 33 assumed east of 12°E');close(r.lon,13.4,0.1);
assert(!C.parse('25,0','52,1',{region}).ok&&C.parse('25,0','52,1',{region}).verdicts.some(v=>v.code==='outside-germany'),'outside Germany blocks');
r=C.parse('9,0','52,0',{region});assert(r.ok&&r.verdicts.some(v=>v.code==='far-from-region'),'plausible but far from the issuer region → warn');
assert.deepEqual(C.parse('','',{region}).verdicts.map(v=>v.code),['none']);

/* ---------- A1: each sample becomes correctly grouped draft work or an explicit exception ---------- */
const docs=S.DOCS;const seen=[];const ex={};
for(const d of docs){const res=X.extractDocument(d,{existingDocs:seen,now:'2026-10-16T12:00:00+02:00'});ex[d.id]=res;seen.push({id:d.id,subject:d.subject,contentHash:res.contentHash,profileId:res.profileId,documentNumberNormalized:res.orders[0]&&res.orders[0].documentNumber?res.orders[0].documentNumber.normalized:null});}
// S-MENGEN
let o=ex['DOC-MENGEN-1'].orders[0];assert.equal(ex['DOC-MENGEN-1'].profileId,'stadt-mengen');assert.equal(o.documentType.value,'Transportmeldung');assert.equal(o.documentNumber.normalized,'2026-102');
assert.equal(o.stacks.length,10,'ten stack lines, the summary rows are not stacks');close(o.stacks.reduce((a,s)=>a+s.planned.value,0),148.02,1e-9);assert.equal(o.stacks.reduce((a,s)=>a+(s.pieces.value||0),0),101);
assert.equal(o.stacks.filter(s=>s.coords.parsed&&s.coords.parsed.ok).length,1,'only Polter 35 has a well-formed coordinate');assert.equal(o.stacks.filter(s=>s.coords.parsed&&!s.coords.parsed.ok&&s.coords.parsed.suggestion).length,9);
assert(codes(ex['DOC-MENGEN-1']).includes('E-LOTSUM'),'wrong lot summary flagged');assert(!codes(ex['DOC-MENGEN-1']).includes('E-TOTAL'),'line items match the printed total');assert.equal(codes(ex['DOC-MENGEN-1']).filter(c=>c==='E-COORD-FMT').length,9);
assert(ex['DOC-MENGEN-1'].exceptions.find(e=>e.code==='E-LOTSUM').message.includes('9211/990'),'missing lot totals named');assert(o.stacks.find(s=>s.tempKey==='9211/990/8').planned.raw==='0.10 fm','raw notation kept');
assert(codes(ex['DOC-MENGEN-1']).includes('E-WINDOW'),'no collection window printed');
// S-PELLET
o=ex['DOC-PELLET-1'].orders[0];assert.equal(o.kind,'industrial');assert.equal(o.stacks.length,5);assert.deepEqual(o.stacks.map(s=>s.refs.ladenummer),['0727603001','0727603002','0727603003','0727603004','0727603005'],'leading zeroes preserved');
assert(o.stacks.every(s=>s.planned.value===1&&s.planned.unit==='ldg'));assert.equal(o.quantityTotal.value,'5 LDG');assert(codes(ex['DOC-PELLET-1']).includes('E-NOID'));assert(codes(ex['DOC-PELLET-1']).includes('E-RESTRICTED'));assert(ex['DOC-PELLET-1'].exceptions.some(e=>e.code==='E-UNIT'&&/90 m³/.test(e.message)),'vehicle capacity ≠ quantity');
assert.equal(o.restricted.freightRate.value,'160,00€/ LDG');assert.equal(o.pickupAddress.value.slice(0,18),'Sägewerk Baruth AG');assert.equal(o.window.from,'2026-10-19');assert.equal(o.window.to,'2026-10-23');
// S-HTL
o=ex['DOC-HTL-1'].orders[0];assert.equal(o.documentNumber.normalized,'6142');assert.equal(o.stacks.length,5);assert.equal(o.stacks.reduce((a,s)=>a+s.pieces.value,0),100);close(o.stacks.reduce((a,s)=>a+s.planned.value,0),98.89,1e-9);
assert(ex['DOC-HTL-1'].exceptions.some(e=>e.code==='E-TOTAL'&&e.severity==='info'&&/0,01/.test(e.message)),'98,88 vs 98,89 surfaced, not corrected');assert.equal(ex['DOC-HTL-1'].pages.filter(p=>p.cls==='map').length,2);
assert.equal(codes(ex['DOC-HTL-1']).filter(c=>c==='E-MAP-ONLY').length,5,'blank GPS + map pages → place from map');assert.equal(o.window.from,'2026-10-13');assert.equal(o.window.to,'2026-10-27','reversed order in the text layer read correctly');assert(codes(ex['DOC-HTL-1']).includes('E-SPECIES'));
// S-BAYSF
o=ex['DOC-BAYSF-1'].orders[0];assert.equal(o.documentType.value,'Frachtauftrag');assert.equal(o.stacks.length,1,'positions are lines of one stack');assert.equal(o.stacks[0].tempKey,'072614P0003');assert.equal(o.stacks[0].planned.value,77);assert.equal(o.stacks[0].breakdown.length,2);
assert.equal(ex['DOC-BAYSF-1'].pages[1].cls,'delivery_note_form','the blank form is not a second order');assert(codes(ex['DOC-BAYSF-1']).includes('E-BLANKFORM'));assert.equal(ex['DOC-BAYSF-1'].orders.length,1);assert(codes(ex['DOC-BAYSF-1']).includes('E-COORD-NONE'));assert.equal(o.restricted.freightRate.value,'8,80 EUR pro 1 FM');assert.equal(o.destination.value.slice(0,22),'Sägewerk Kösching GmbH');
// S-TTW
o=ex['DOC-TTW-1'].orders[0];assert.equal(o.documentNumber.normalized,'3311');assert.equal(o.stacks.length,2,'Polterinfo and Sortenzusammenfassung are breakdowns, not stacks');close(o.stacks.reduce((a,s)=>a+s.planned.value,0),464.696,1e-9);assert.equal(o.stacks[0].breakdown.length,4);assert.equal(o.stacks[1].breakdown.length,2);assert.equal(o.summaries.codes.length,6);
assert(codes(ex['DOC-TTW-1']).includes('E-LEN'),'3m header vs 4,00 line length');assert(codes(ex['DOC-TTW-1']).includes('E-INSTR'),'weekly vs month-end report');assert(!codes(ex['DOC-TTW-1']).includes('E-DEST'),'TTW prints the Zielwerk on page 1');assert.equal(o.destination.value,'Stadt Aach');assert(codes(ex['DOC-MENGEN-1']).includes('E-DEST'),'Mengen prints no destination');assert.equal(o.measurementBasis.value,'WA');assert.equal(o.certification.value,'HW-CoC-0220-13');
assert.deepEqual(ex['DOC-TTW-1'].pages.map(p=>p.cls),['order','order_continuation','map','map','collection_report_form']);assert.equal(o.contacts.length,3);assert(o.instructions.some(i=>i.restricted),'Skonto line is commercial');
/* ---------- A2: resend → duplicate; amendment → diff with pickups preserved ---------- */
const resend=X.extractDocument(S.SCENARIOS.resend(),{existingDocs:seen});assert.equal(resend.duplicateOf,'DOC-TTW-1');assert(codes(resend).includes('E-DUP'));
const amend=X.extractDocument(S.SCENARIOS.amendment(),{existingDocs:seen});assert.equal(amend.amendmentOf,'DOC-TTW-1');assert.equal(amend.duplicateOf,undefined);assert.equal(amend.orders[0].stacks.length,3);

/* ---------- full journey through the store ---------- */
const store=TC.store.create({storage:mem()});const run=TC.tour.run(store);const st=store.state;
assert.equal(run.steps.length,TC.tour.STEPS.length);
assert.equal(st.documents['DOC-TTW-RESEND'].status,'Duplicate');assert.equal(st.documents['DOC-TTW-RESEND'].orderIds.length,0,'resend created no live work');
assert.equal(Object.keys(st.orders).length,5,'five live orders');
const ttw=st.orders[st.documents['DOC-TTW-1'].orderIds[0]];assert.equal(ttw.versions.length,2);assert.equal(st.documents['DOC-TTW-1'].status,'Superseded');assert.equal(st.documents['DOC-TTW-AMEND'].status,'Ready');
const v2=ttw.versions[1].diff;assert.deepEqual(v2.added,['124_501/11']);assert.equal(v2.changed[0].tempKey,'124_501/10');assert.equal(v2.removed.length,0);assert(v2.header.some(h=>h.field==='Abfuhrende'&&h.after==='2026-11-16'));
const ttw9=st.stacks[ttw.id+'/124_501/9'];assert.equal(ttw9.progress,'PartlyCollected','pickup on Polter 9 survived the amendment');assert(st.events.some(e=>e.kind==='pickup'&&e.stackKey===ttw9.key));assert.equal(ttw.destination,'Stadt Aach','destination kept across the revision');assert.equal(ttw.destinationId,'P-STADT-AACH');
assert.equal(st.stacks[ttw.id+'/124_501/10'].planned.qty,180);assert.equal(st.ledger.filter(q=>q.scope.stackKey===ttw.id+'/124_501/10'&&q.basis==='ordered').length,2,'ordered quantities appended, never overwritten');
/* ---------- A3: publication and allocation ---------- */
const htl=st.orders[st.documents['DOC-HTL-1'].orderIds[0]],mengen=st.orders[st.documents['DOC-MENGEN-1'].orderIds[0]],baysf=st.orders[st.documents['DOC-BAYSF-1'].orderIds[0]],pellet=st.orders[st.documents['DOC-PELLET-1'].orderIds[0]];
assert(htl.stackKeys.every(k=>st.stacks[k].publication.scope==='named'&&st.stacks[k].publication.targets.includes('U-D1')));
assert(M.visibleTo(st,st.stacks[htl.stackKeys[0]],'U-D1')&&!M.visibleTo(st,st.stacks[htl.stackKeys[0]],'U-D3'),'named publication respects permissions');
assert(M.visibleTo(st,ttw9,'U-D3'),'fleet publication is visible to every driver');
const unconfirmed=mengen.stackKeys.filter(k=>st.stacks[k].location.status!=='confirmed');assert.equal(unconfirmed.length,2);assert(unconfirmed.every(k=>st.stacks[k].publication.scope==='none'),'no unconfirmed pin is published');
assert.throws(()=>M.publish(st,{stackKeys:[unconfirmed[0]],scope:'fleet',by:'U-DISPO'}),/Standort nicht bestätigt/);
assert.throws(()=>M.confirmLocation(st,unconfirmed[0],{method:'address',lat:48,lon:9,by:'U-DISPO'}),/E-ADDR/,'an address is never a roadside pickup point');
const dc=st.conflicts.find(c=>c.kind==='doubleClaim');assert(dc,'two whole allocations accepted on the BaySF stack → conflict');assert.equal(M.activeAllocations(st?st:null,baysf.stackKeys[0]).length,1,'only one accepted allocation remains active');
{const [first,second]=dc.refs.allocations.map(id=>st.allocations[id]);const loser=first.state==='Accepted'?first:second,winner=loser===first?second:first;M.resolveConflict(st,dc.id,'U-DISPO','keep:'+winner.id);assert(dc.resolved);assert.equal(loser.state,'Withdrawn','deciding a double claim withdraws the other allocation');assert.equal(winner.state,'Accepted','the kept claim is accepted');assert.equal(M.activeAllocations(st,baysf.stackKeys[0]).length,1);}
assert(run.log.some(l=>/Zweite Reservierung abgewiesen/.test(l)),'second reservation of shared work refused');
assert.throws(()=>{st.ui.online=false;M.reserve(st,{stackKey:ttw9.key,driverId:'U-D2',by:'U-D2'});},/Verbindung nötig/);st.ui.online=true;
/* ---------- A4: partial pickup leaves the stack open; clearance closes only its scope; pickup ≠ delivered ---------- */
const s1=st.stacks[htl.id+'/5816/57/1'],s5=st.stacks[htl.id+'/5816/57/5'];assert.equal(s1.progress,'Cleared');assert.equal(s5.progress,'PartlyCollected');assert.equal(st.stacks[htl.id+'/5816/57/6'].progress,'Available');
assert.equal(s1.clearedBy,'U-D1');assert.equal(htl.status,'Open','order not complete while stacks remain');
const f1=st.loads['F-0001'];assert.deepEqual(f1.lines.map(l=>l.stackKey.split('/').pop()),['1','4'],'two pickups of one truck trip joined one load');assert.equal(f1.state,'Measured');assert.equal(st.notes[f1.deliveryNoteId].number,'LS-2026-00001');
const pelletStack=st.stacks[pellet.stackKeys[0]];assert.equal(pelletStack.progress,'Cleared');assert.equal(pellet.status,'Open');
/* ---------- A5: offline actions survive reconnection and appear once ---------- */
assert.equal(st.ui.queue.length,0);const d1events=st.events.filter(e=>e.driverId==='U-D1'&&e.kind==='pickup');assert.equal(d1events.length,4);
const before=st.events.length;const dupRes=M.applyEvent(st,st.events[0]);assert(dupRes.duplicate);assert.equal(st.events.length,before,'replay of an acknowledged event is ignored');
assert(st.events.every(e=>e.receivedTime&&e.eventTime),'both the roadside time and the receipt time are kept');
const paw=st.conflicts.find(c=>c.kind==='pickupAfterWithdrawal');assert(paw,'offline pickup after a withdrawal surfaces as a conflict instead of last-update-wins');assert(st.loads['F-0005'].lines[0].stackKey.endsWith('9110/991/35'));
/* ---------- A7: mill tickets ---------- */
const we1=Object.values(st.receipts).find(r=>r.ticketNo==='2026-04471');assert.equal(we1.matchState,'Matched');assert.equal(we1.matchMethod,'delivery-note');assert.equal(we1.loadId,'F-0001');
const wg2=Object.values(st.receipts).find(r=>r.ticketNo==='77120');assert.equal(wg2.matchState,'Matched');assert.equal(wg2.matchMethod,'vehicle-window');assert.equal(st.loads[wg2.loadId].truckId,'T-3');
const we3=Object.values(st.receipts).find(r=>r.ticketNo==='2026-04490');assert.equal(we3.matchState,'MatchNeeded');assert.equal(st.documents['DOC-WE-POLSINGEN-2'].status,'NeedsReview');
const rl=M.reconcileLoad(st,'F-0001');close(rl.deliveryNote.value,21.5);close(rl.millMeasured.value,23.1);assert(rl.exceptions.some(e=>e.kind==='noteVsMill'),'forest-to-mill difference above tolerance stays visible');
const ro=M.reconcileOrder(st,htl.id);assert.equal(ro.rows.length,5);close(ro.totals.ordered[0].value,98.89);close(ro.totals.received.value,23.1);
const rp=M.reconcileOrder(st,pellet.id);assert(rp.loads[0].comparisons.noteVsWeight&&rp.loads[0].comparisons.noteVsWeight.comparable===false,'LDG vs kg is not comparable without a factor');
assert.equal(M.reconcileQuotas(st)[0].received.value,1);
/* ---------- A6: export links back to instruction and history; sending is explicit ---------- */
const rep=M.collectionReport(st,htl.id);assert.equal(rep.kind,'Abfuhrmeldung');assert.equal(rep.rows.length,2);assert.equal(rep.sources[0].docId,'DOC-HTL-1');assert(rep.history.length>=8);assert(htl.reportSentAt,'marked sent by the demo run');
const expo=M.exportOrder(st,htl.id);assert.equal(expo.sources[0].contentHash,st.documents['DOC-HTL-1'].contentHash);assert(expo.disclaimer.includes('nicht automatisch'));
const exTtw=M.driverExcerpt(st,'DOC-TTW-1');assert.equal(exTtw.redactedLines,2);assert(exTtw.pages[1].lines.some(l=>/redigiert/.test(l)),'Skonto line redacted');assert(!exTtw.pages.flat().some(l=>/Frachtsatz:\s*\S/.test(JSON.stringify(l))));
const exBay=M.driverExcerpt(st,'DOC-BAYSF-1');assert(!exBay.pages[0].lines.some(l=>/8,80/.test(l)),'freight rate redacted');assert(exBay.pages[0].lines.some(l=>/redigiert/.test(l)));
/* ---------- photos on events, originals on documents ---------- */
const PH=TC.photos;assert(PH.illustration('a','stack','x').startsWith('data:image/svg+xml'));
const photoStacks=Object.values(st.stacks).filter(s=>s.photos.length);assert.equal(Object.values(st.stacks).filter(x=>(x.photos||[]).some(p=>p.kind!=='site')).length,4,'demo run attaches event photos to four stacks');{const conf=Object.values(st.stacks).filter(x=>x.confirmed);assert(conf.length>=20&&conf.every(x=>(x.photos||[]).some(p=>p.kind==='site'&&/^https:\/\/upload\.wikimedia\.org\//.test(p.url)&&p.thumb&&p.credit&&p.credit.license&&p.credit.page)),'every confirmed stack carries an attributed Commons site photo');const groups=new Set(conf.map(x=>x.photos.find(p=>p.kind==='site').url));assert(groups.size>=10,'photos rotate: '+groups.size);const td=globalThis.TransportData.photos;assert.equal(td.PHOTOS.length,26);assert(td.PHOTOS.every(p=>/^(CC0|CC BY|Public domain)/.test(p.license)&&p.author&&p.page),'catalogue has licence, author and page');assert.equal(td.forStack({id:'TA-2026-0002',profileId:'waldkontor'},{planned:{unit:'ldg'},timber:{assortment:'Kappholz'}},0).group,'ends');assert.equal(td.forStack({id:'TA-2026-0005',profileId:'waldpflege-oberschwaben'},{planned:{unit:'rm'},timber:{}},0).group,'stacked');}assert(photoStacks.some(s=>s.photos.some(p=>p.kind==='problem')),'problem report photo');
assert.deepEqual(M.stackPhotos(st,s1.key).filter(p=>p.kind!=='site').map(p=>p.kind),['cleared','pickup'],'newest photo first');
assert.equal(st.documents['DOC-TTW-1'].driverOriginal,false,'commercial fields → original not released to drivers by default');assert.equal(st.documents['DOC-HTL-1'].driverOriginal,true);
M.setDocumentOriginal(st,'DOC-HTL-1',{name:'HTL.pdf',size:1234,type:'application/pdf',pages:3},'U-DISPO');assert.equal(st.documents['DOC-HTL-1'].original.pages,3);M.setDriverOriginal(st,'DOC-TTW-1',true,'U-DISPO');assert.equal(st.documents['DOC-TTW-1'].driverOriginal,true);assert(st.audit.some(a=>a.action==='document.driverOriginal'));
/* ---------- persistence and audit ---------- */
const storage=mem();const s2=TC.store.create({storage});TC.tour.run(s2);const s3=TC.store.create({storage});assert.equal(Object.keys(s3.state.orders).length,5);assert.equal(s3.state.events.length,s2.state.events.length);
assert(st.audit.some(a=>a.action==='document.released'&&a.ref==='DOC-MENGEN-1'));assert(st.audit.some(a=>a.action==='stack.locationConfirmed'));assert(st.audit.some(a=>a.action==='report.markedSent'));
assert(st.profiles.find(p=>p.id==='stadt-mengen').reviewedDocuments===1,'profile learned a reviewed document');
/* ---------- i18n coverage ---------- */
const I=TC.i18n;I.setLang('en');assert.equal(I.t('Posteingang'),'Inbox');assert.equal(I.t('Standort erforderlich'),'Location needed');I.setLang('fr');assert.equal(I.t('Belege & Abgleich'),'Justificatifs & rapprochement');I.setLang('de');assert.equal(I.t('Posteingang'),'Posteingang');
/* ---------- dashboard figures (core/stats) ---------- */
{const DS=TC.stats.compute(st,{now:store.clock()});assert.equal(DS.fleet.loads,Object.keys(st.loads).length);assert.equal(DS.fleet.pickups,st.events.filter(e=>e.kind==='pickup').length);
 assert.equal(DS.fleet.collected.fm,st.events.filter(e=>e.kind==='pickup'&&e.unit==='fm').reduce((a,e)=>a+e.qty,0),'collected fm = sum of fm pickups');assert.equal(DS.fleet.netT,23.42,'weighbridge net in t');
 assert(DS.fleet.collectedFm&&DS.fleet.collectedFm.excluded.includes('ldg'),'LDG stays out of the fm equivalent');assert(Math.abs(DS.fleet.collectedFm.value-(DS.fleet.collected.fm+DS.fleet.collected.rm*0.7))<1e-6,'rm → fm with the versioned factor');
 const murat=DS.drivers.find(d=>d.id==='U-D1');assert(murat.loads===3&&murat.collected.fm===29.5&&murat.cleared===2,'driver figures come from loads and events: '+JSON.stringify([murat.loads,murat.collected,murat.cleared]));
 const pols=DS.mills.find(m=>m.id==='P-SAEGEWERK-POLSINGEN');assert(pols&&pols.received.fm===23.1&&pols.pairedLoads===1&&Math.abs(pols.deviationPct-7.4)<0.11,'mill deviation only over loads with note and ticket: '+JSON.stringify(pols));
 const wk=DS.customers.find(c=>c.id==='P-WALDKONTOR');assert.equal(wk.completionPct,20,'completion in the single common unit (LDG)');assert(DS.grades.length>=3&&DS.species[0].name==='Fichte','grades and species');assert.equal(DS.daily.length,14);
 const d7=TC.stats.compute(st,{now:store.clock(),days:7,driverId:'U-D2'});assert.equal(d7.drivers.length,1);assert(d7.fleet.loads<=DS.fleet.loads&&d7.drivers[0].id==='U-D2');
 assert.equal(TC.stats.ratioPct({fm:35},{fm:70}),50);assert.equal(TC.stats.ratioPct({ldg:1},{ldg:4}),25);assert.equal(TC.stats.ratioPct({fm:1},{ldg:4}),null,'no ratio across units without a factor');}
console.log(JSON.stringify({passed:true,samples:5,orders:Object.keys(st.orders).length,stacks:Object.keys(st.stacks).length,loads:Object.keys(st.loads).length,receipts:Object.keys(st.receipts).length,conflicts:st.conflicts.length,events:st.events.length,phrases:Object.keys(I.CATALOGUE).length+Object.keys(I.LONG).length}));
