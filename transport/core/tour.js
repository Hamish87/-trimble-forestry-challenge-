/* Holztransport demo · guided demo run ("Demo-Durchlauf"). Replays the whole carrier-first journey on a fresh
   workspace with a controlled clock: deliver the five sample e-mails, review them (accepting or placing locations as a
   dispatcher would, never silently), handle the resend, publish and allocate, drive as the drivers (offline and
   online), issue delivery notes, arrive, unload, receive mill tickets, apply the amendment, mark the report sent.
   Every step is a named function so the UI can stop at any point and the tests can assert each outcome. [DEMO] */
'use strict';
(function(){
const req=(ns,name,path)=>(globalThis[ns]&&globalThis[ns][name])||(typeof require!=='undefined'?require(path):null);
const SAMPLES=req('TransportData','samples','../data/samples.js');
const T=(d,t)=>`2026-10-${String(d).padStart(2,'0')}T${t}:00+02:00`;
const STEPS=[
 {id:'deliver',title:'Demo-E-Mails zustellen',run(s){s.setClock(T(13,'12:00'));s.store.apply('deliverDemoMail');}},
 {id:'review-mengen',title:'Stadt Mengen prüfen und freigeben',run(s){s.setClock(T(13,'13:05'));const d=s.doc('DOC-MENGEN-1');const lines={};for(const st of d.extraction.orders[0].stacks){const p=st.coords.parsed;if(p&&p.ok)lines[st.tempKey]={location:{method:'printed'}};else if(p&&p.suggestion&&!['9408/990/1','9408/990/9'].includes(st.tempKey))lines[st.tempKey]={location:{method:'suggestion',note:'Lesart „Sekunden ÷ 100“ nach Rücksprache Stadtforst bestätigt'}};}
   s.store.apply('review','DOC-MENGEN-1',{lines,note:'Lossummen laut Dokument widersprüchlich — Polterzeilen maßgeblich'});}},
 {id:'review-pellet',title:'Pelletwerk-Auftrag freigeben',run(s){s.setClock(T(13,'13:20'));s.store.apply('review','DOC-PELLET-1',{destinationId:'P-PELLETWERK-ANHALT'});}},
 {id:'review-htl',title:'Holzbereitstellung 6.142 freigeben (Lage aus Kartenbild)',run(s){s.setClock(T(13,'13:40'));const lines={};for(const [k,[lat,lon]] of Object.entries(SAMPLES.DEMO_PLACEMENTS['DOC-HTL-1']))lines[k]={location:{method:'manual-from-map',lat,lon,fromPage:2,note:'aus Kartenseite 2 platziert'}};s.store.apply('review','DOC-HTL-1',{lines,destinationId:'P-SAEGEWERK-POLSINGEN',fields:{destination:'Sägewerk Polsingen GmbH'}});}},
 {id:'review-baysf',title:'Frachtauftrag BaySF freigeben (Lage nach Rücksprache Revier)',run(s){s.setClock(T(13,'14:10'));const [lat,lon]=SAMPLES.DEMO_PLACEMENTS['DOC-BAYSF-1']['072614P0003'];s.store.apply('review','DOC-BAYSF-1',{lines:{'072614P0003':{location:{method:'manual',lat,lon,note:'Lage telefonisch mit Revier 14 Auernheim bestätigt'}}}});}},
 {id:'review-ttw',title:'Fuhrauftrag 3311 freigeben (Zielwerk bestätigt)',run(s){s.setClock(T(13,'14:30'));const lines={};for(const [k,[lat,lon]] of Object.entries(SAMPLES.DEMO_PLACEMENTS['DOC-TTW-1']))lines[k]={location:{method:'manual-from-map',lat,lon,fromPage:3,note:'aus Kartenseite 3 platziert'}};s.store.apply('review','DOC-TTW-1',{lines,destinationId:'P-ACHENTAL',fields:{destination:'Holzwerke Achental GmbH'},note:'Zielwerk = Auftraggeber laut Seite 5, telefonisch bestätigt; Meldeintervall wöchentlich vereinbart'});}},
 {id:'resend',title:'Erneut gesendeter Fuhrauftrag → Duplikat',run(s){s.setClock(T(14,'09:05'));s.store.apply('deliverScenario','resend');}},
 {id:'publish',title:'Veröffentlichen (Flotte, Gruppe, Fahrer)',run(s){s.setClock(T(14,'10:00'));const o=s.orders();s.store.apply('publish',o.htl.stackKeys,'named',['U-D1']);s.store.apply('publish',o.ttw.stackKeys,'fleet');s.store.apply('publish',o.pellet.stackKeys,'group',['G-SUED']);s.store.apply('publish',o.mengen.stackKeys.filter(k=>s.state.stacks[k].location.status==='confirmed'),'group',['G-SUED']);s.store.apply('publish',o.baysf.stackKeys,'named',['U-D3']);}},
 {id:'allocate',title:'Zuteilen',run(s){s.setClock(T(14,'10:20'));const o=s.orders();for(const k of o.htl.stackKeys)s.store.apply('allocate',k,'U-D1','T-2',{kind:'whole'});
   s.store.apply('allocate',o.pellet.stackKeys[0],'U-D2','T-3',{kind:'whole'});s.store.apply('allocate',o.pellet.stackKeys[1],'U-D2','T-3',{kind:'whole'});
   const ttw9=o.ttw.stackKeys.find(k=>s.state.stacks[k].tempKey==='124_501/9');s.store.apply('allocate',ttw9,'U-D1','T-2',{kind:'loads',value:3});s.store.apply('allocate',ttw9,'U-D3','T-4',{kind:'loads',value:3});
   const m35=o.mengen.stackKeys.find(k=>s.state.stacks[k].tempKey==='9110/991/35');s.store.apply('allocate',m35,'U-D2','T-3',{kind:'whole'});s.store.apply('allocate',o.baysf.stackKeys[0],'U-D3','T-4',{kind:'whole'});s.store.apply('allocate',o.baysf.stackKeys[0],'U-D2','T-3',{kind:'whole'}); /* dispatcher error: the same whole stack twice */}},
 {id:'accept',title:'Fahrer nehmen an · Doppelanspruch wird sichtbar',run(s){s.setClock(T(14,'17:00'));const allocs=Object.values(s.state.allocations);
   s.as('U-D1');for(const a of allocs.filter(a=>a.driverId==='U-D1'&&a.state==='Proposed'))s.store.apply('accept',a.id);
   s.as('U-D2');for(const a of allocs.filter(a=>a.driverId==='U-D2'&&a.state==='Proposed'))s.store.apply('accept',a.id);
   s.as('U-D3');for(const a of allocs.filter(a=>a.driverId==='U-D3'&&a.state==='Proposed'))s.store.apply('accept',a.id); // the BaySF stack was given to two drivers as a whole → doubleClaim conflict
   s.as('U-DISPO');}},
 {id:'reserve',title:'Flottenarbeit reservieren (nur online)',run(s){s.setClock(T(14,'17:30'));const o=s.orders();const ttw10=o.ttw.stackKeys.find(k=>s.state.stacks[k].tempKey==='124_501/10');s.as('U-D3');s.store.apply('reserve',ttw10);s.as('U-D1');try{s.store.apply('reserve',ttw10);}catch(e){s.log.push('Zweite Reservierung abgewiesen: '+e.message);}s.as('U-DISPO');}},
 {id:'drive-offline',title:'Fahrer 1 offline: Abholungen, Räumung, Lieferschein',run(s){const o=s.orders();const k=t=>o.htl.stackKeys.find(x=>s.state.stacks[x].tempKey===t);s.as('U-D1');s.setClock(T(19,'06:40'));s.store.download('U-D1');s.store.setOnline(false);
   s.store.driverEvent({kind:'pickup',stackKey:k('5816/57/1'),truckId:'T-2',qty:10.5,unit:'fm',pieces:10,eventTime:T(19,'07:35')}); // queued: no load id yet
   s.store.driverEvent({kind:'cleared',stackKey:k('5816/57/1'),eventTime:T(19,'07:50')});
   s.store.driverEvent({kind:'pickup',stackKey:k('5816/57/4'),truckId:'T-2',qty:11,unit:'fm',pieces:13,eventTime:T(19,'08:20')}); // joins the open load of this truck trip
   s.store.driverEvent({kind:'cleared',stackKey:k('5816/57/4'),eventTime:T(19,'08:30')});
   s.pending=s.state.ui.queue.length;}},
 {id:'sync',title:'Wieder online: Warteschlange einmalig übertragen',run(s){s.as('U-D1');s.setClock(T(19,'09:05'));s.store.setOnline(true);const q=s.state.events.filter(e=>e.driverId==='U-D1');s.log.push(`${q.length} Ereignisse übertragen`);
   s.ids.loadHtl1=Object.values(s.state.loads).find(l=>l.driverId==='U-D1'&&l.state==='Planned').id; // the load exists only once the queue was applied
   s.store.driverEvent({kind:'note_issued',loadId:s.ids.loadHtl1,eventTime:T(19,'09:10'),transportComplete:false});}},
 {id:'deliver-htl',title:'Ankunft und Abladung im Sägewerk',run(s){s.as('U-D1');s.store.driverEvent({kind:'arrived',loadId:s.ids.loadHtl1,eventTime:T(21,'10:30')});s.store.driverEvent({kind:'unloaded',loadId:s.ids.loadHtl1,acceptance:'accepted',eventTime:T(21,'11:10')});s.as('U-DISPO');}},
 {id:'drive-pellet',title:'Fahrerin 2: Ladenummer Montag → Pelletwerk',run(s){const o=s.orders();s.as('U-D2');s.setClock(T(19,'05:30'));const r=s.store.driverEvent({kind:'pickup',stackKey:o.pellet.stackKeys[0],truckId:'T-3',qty:1,unit:'ldg',eventTime:T(19,'06:15')});s.ids.loadPellet=r.event.loadId;
   s.store.driverEvent({kind:'cleared',stackKey:o.pellet.stackKeys[0],eventTime:T(19,'06:20')});s.store.driverEvent({kind:'note_issued',loadId:s.ids.loadPellet,eventTime:T(19,'06:25'),form:'photo',customerNoteNo:'0727603001'});
   s.store.driverEvent({kind:'arrived',loadId:s.ids.loadPellet,eventTime:T(20,'08:50')});s.store.driverEvent({kind:'unloaded',loadId:s.ids.loadPellet,acceptance:'accepted',eventTime:T(20,'09:40')});s.as('U-DISPO');}},
 {id:'partial',title:'Teilabholung lässt Polter offen · Problemmeldung',run(s){const o=s.orders();const k=t=>o.htl.stackKeys.find(x=>s.state.stacks[x].tempKey===t);s.as('U-D1');s.setClock(T(22,'07:00'));const r=s.store.driverEvent({kind:'pickup',stackKey:k('5816/57/5'),truckId:'T-2',qty:8,unit:'fm',pieces:7,eventTime:T(22,'07:45')});s.ids.loadHtl2=r.event.loadId;
   s.store.driverEvent({kind:'note_issued',loadId:s.ids.loadHtl2,eventTime:T(22,'07:55')});s.store.driverEvent({kind:'arrived',loadId:s.ids.loadHtl2,eventTime:T(22,'13:40')});s.store.driverEvent({kind:'unloaded',loadId:s.ids.loadHtl2,acceptance:'accepted',eventTime:T(22,'14:05')});
   s.as('U-D3');const ttw10=o.ttw.stackKeys.find(x=>s.state.stacks[x].tempKey==='124_501/10');s.store.driverEvent({kind:'problem',stackKey:ttw10,problemKind:'Zufahrt blockiert',note:'Forstweg nach Regen gesperrt, Schranke zu',eventTime:T(22,'09:15')});
   const ttw9=o.ttw.stackKeys.find(x=>s.state.stacks[x].tempKey==='124_501/9');s.as('U-D1');const r2=s.store.driverEvent({kind:'pickup',stackKey:ttw9,truckId:'T-2',qty:42,unit:'rm',eventTime:T(23,'07:30')});s.ids.loadTtw=r2.event.loadId;s.as('U-DISPO');}},
 {id:'withdraw-offline',title:'Entzug erreicht offline Fahrerin nicht sofort → Konflikt',run(s){const o=s.orders();const m35=o.mengen.stackKeys.find(k=>s.state.stacks[k].tempKey==='9110/991/35');s.as('U-D2');s.setClock(T(23,'06:00'));s.store.setOnline(false);
   s.as('U-DISPO');const a=Object.values(s.state.allocations).find(x=>x.stackKey===m35&&x.driverId==='U-D2');s.store.apply('withdraw',a.id,{driverId:'U-D3',truckId:'T-4'});
   s.as('U-D2');s.store.driverEvent({kind:'pickup',stackKey:m35,truckId:'T-3',qty:14,unit:'fm',pieces:3,eventTime:T(23,'07:10')});s.setClock(T(23,'08:30'));s.store.setOnline(true);s.as('U-DISPO');}},
 {id:'tickets',title:'Werksscheine zustellen und zuordnen',run(s){s.setClock(T(22,'17:35'));s.store.apply('deliverTickets');}},
 {id:'amendment',title:'Geänderter Fuhrauftrag → Versionsvergleich, Abholungen bleiben',run(s){s.setClock(T(23,'16:20'));s.store.apply('deliverScenario','amendment');s.setClock(T(23,'16:45'));const lines={};const [lat,lon]=[47.834,8.851];lines['124_501/11']={location:{method:'manual-from-map',lat,lon,fromPage:3,note:'neuer Polter aus Kartenseite platziert'}};s.store.apply('review','DOC-TTW-AMEND',{lines,destinationId:'P-ACHENTAL'});}},
 {id:'report',title:'Abfuhrmeldung erzeugen und als gesendet markieren',run(s){s.setClock(T(23,'17:00'));const o=s.orders();s.store.apply('markReportSent',o.htl.id,'E-Mail an Kunden (manuell)');}}
];
function run(store,opts={}){
  const until=opts.until||null;const log=[];const s={store,log,ids:{},get state(){return store.state;},
    setClock(iso){store.setClockValue&&store.setClockValue(iso);},as(u){store.apply('setPersona',u);},
    doc(id){return store.state.documents[id];},
    orders(){const byDoc=id=>store.state.orders[store.state.documents[id].orderIds[0]];return {mengen:byDoc('DOC-MENGEN-1'),pellet:byDoc('DOC-PELLET-1'),htl:byDoc('DOC-HTL-1'),baysf:byDoc('DOC-BAYSF-1'),ttw:byDoc('DOC-TTW-1')};}};
  const done=[];for(const step of STEPS){step.run(s);done.push(step.id);log.push('✓ '+step.title);if(until&&step.id===until)break;}
  store.apply('setPersona','U-DISPO');store.save();return {steps:done,log,ids:s.ids};
}
const api={STEPS,run};
(globalThis.TransportCore=globalThis.TransportCore||{}).tour=api;
if(typeof module!=='undefined')module.exports=api;
})();
