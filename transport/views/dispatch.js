/* Holztransport demo · Disposition — Karte & Liste (SPEC §7.3): confirmed stacks as pins, orders → stack rows with
   location, publication, allocation and progress, filters, selection actions, the "Standort erforderlich" queue,
   conflicts, problem and clearance reports, sync status. The map itself is mounted by app.js into #dispatchMap. */
'use strict';
(function(){
const S=globalThis.TransportViews.shared;const {esc,t,fmt,pill,statusPill,statusLabel,button,select,kv,table,empty,exceptions}=S;
function filters(ctx,stacks){
  const {state}=ctx;const f=ctx.ui.dispatch||{};const customers=[...new Set(Object.values(state.orders).map(o=>o.customerId))].map(id=>[id,S.party(state,id)||id]);
  const drivers=state.users.filter(u=>u.roles.includes('driver')).map(u=>[u.id,u.name]);
  return `<div class="filters">
    <label>${t('Kunde')} ${select('customer',[['',t('Alle')],...customers],f.customer||'','data-action="dispatch-filter"')}</label>
    <label>${t('Fällig')} ${select('due',[['',t('Alle')],['over',t('überfällig')],['7',t('in 7 Tagen')],['14',t('in 14 Tagen')]],f.due||'','data-action="dispatch-filter"')}</label>
    <label>${t('Fahrer')} ${select('driver',[['',t('Alle')],['none',t('ohne Zuteilung')],...drivers],f.driver||'','data-action="dispatch-filter"')}</label>
    <label>${t('Verfügbarkeit')} ${select('progress',[['',t('Alle')],['Available',t('Verfügbar')],['PartlyCollected',t('Teilweise abgeholt')],['Cleared',t('Geräumt')],['Blocked',t('Blockiert')]],f.progress||'','data-action="dispatch-filter"')}</label>
    <label>${t('Standort')} ${select('location',[['',t('Alle')],['confirmed',t('bestätigt')],['open',t('offen')]],f.location||'','data-action="dispatch-filter"')}</label>
    <label class="grow">${t('Suche')} <input name="q" value="${esc(f.q||'')}" data-action="dispatch-filter" placeholder="${esc(t('Referenz, Polter, Kunde'))}"></label>
    <span class="muted">${stacks.length} ${t('Polter')}</span></div>`;
}
function applyFilters(ctx,all){
  const {state}=ctx;const f=ctx.ui.dispatch||{};const now=new Date(ctx.now);
  return all.filter(st=>{const o=state.orders[st.orderId];if(f.customer&&o.customerId!==f.customer)return false;if(f.progress&&st.progress!==f.progress)return false;if(f.location==='confirmed'&&st.location.status!=='confirmed')return false;if(f.location==='open'&&st.location.status==='confirmed')return false;
    if(f.due){if(!o.window.to)return false;const d=(new Date(o.window.to)-now)/86400000;if(f.due==='over'&&d>=0)return false;if(f.due!=='over'&&d>Number(f.due))return false;}
    if(f.driver){const as=Object.values(state.allocations).filter(a=>a.stackKey===st.key&&['Proposed','Accepted','Reserved'].includes(a.state));if(f.driver==='none'&&as.length)return false;if(f.driver!=='none'&&!as.some(a=>a.driverId===f.driver))return false;}
    if(f.q){const hay=[st.tempKey,S.party(state,o.customerId),o.documentNumber,o.documentType,st.timber.species,st.timber.assortment].join(' ').toLowerCase();if(!hay.includes(f.q.toLowerCase()))return false;}
    return true;});
}
function allocCell(ctx,st){
  const {state}=ctx;const as=Object.values(state.allocations).filter(a=>a.stackKey===st.key&&!['Done'].includes(a.state)&&!(['Withdrawn','Reassigned'].includes(a.state)&&a.deliveredToDriver));
  if(!as.length)return `<span class="muted">–</span>`;
  return as.map(a=>`<div class="alloc">${statusPill('alloc',a.state,'small')} ${esc(S.userName(state,a.driverId))}${a.truckId?` · ${esc(S.truckReg(state,a.truckId))}`:''}${a.share&&a.share.kind!=='whole'?` · ${esc(a.share.value)} ${esc(t(a.share.kind==='loads'?'Fuhren':a.share.kind))}`:''}${a.deliveredToDriver===false?` <span class="pill pill-amber small" title="${esc(t('Fahrer offline — Änderung noch nicht bestätigt; direkt kontaktieren'))}">${esc(t('nicht bestätigt'))}</span>`:''}${['Proposed','Accepted','Reserved'].includes(a.state)?` ${button(t('Zurückziehen'),'withdraw',{alloc:a.id},'link small')} ${button(t('Neu zuteilen'),'allocate-open',{stack:st.key,reassign:a.id},'link small')}`:''}</div>`).join('');
}
function pubCell(ctx,st){const {state}=ctx;const p=st.publication;if(!p||p.scope==='none')return `<span class="muted">–</span>`;const target=p.scope==='fleet'?t('Flotte'):p.scope==='group'?p.targets.map(g=>(state.groups.find(x=>x.id===g)||{}).name||g).join(', '):p.targets.map(u=>S.userName(state,u)).join(', ');return `${pill(p.scope==='fleet'?'blue':'grey',target,'small')}`;}
function locCell(ctx,st){
  const btns=[];if(st.location.status!=='confirmed'){if(st.location.parsed&&st.location.parsed.ok)btns.push(button(t('Gedruckte bestätigen'),'location-confirm',{stack:st.key,method:'printed'},'small'));if(st.location.parsed&&st.location.parsed.suggestion)btns.push(button(t('Lesart übernehmen'),'location-confirm',{stack:st.key,method:'suggestion'},'small'));btns.push(button(t('Platzieren'),'location-place',{stack:st.key},'small'));}
  else btns.push(button(t('ändern'),'location-place',{stack:st.key},'link small'));
  return `${statusPill('location',st.location.status,'small')}<div class="muted small">${S.locationText(st)}</div><div class="row wrap">${btns.join('')}</div>`;
}
function progressCell(ctx,st){
  const {state}=ctx;const M=globalThis.TransportCore.model;const es=M.ledgerFor(state,{stackKey:st.key});const col=M.sumBasis(es,'driverEstimate');
  return `${statusPill('stack',st.progress,'small')}${col?`<div class="muted small">${t('abgeholt')} ${fmt.qty(col.value,col.unit)} / ${fmt.qty(st.planned.qty,st.planned.unit)}</div>`:''}${st.problem?`<div class="warn-text small">⚠ ${esc(st.problem.kind)}${st.problem.note?' — '+esc(st.problem.note):''}</div>`:''}${st.blocked?`<div class="bad small">${esc(st.blocked.reason||'')}</div>`:''}${st.versionNote?`<div class="muted small">${esc(st.versionNote)}</div>`:''}`;
}
function orderHeader(ctx,o){
  const {state}=ctx;const sel=ctx.ui.selection||[];const keys=o.stackKeys;const all=keys.every(k=>sel.includes(k));
  return `<tr class="order-row ${S.dueClass(o,ctx.now)}" data-order="${esc(o.id)}"><td><input type="checkbox" data-action="dispatch-select-order" data-order="${esc(o.id)}" ${all?'checked':''} aria-label="${t('Auftrag auswählen')}"></td>
    <td colspan="3"><strong>${S.orderRef(o)}</strong> · ${esc(S.party(state,o.customerId)||o.issuer||'')} <span class="muted">${esc(o.id)}</span> ${o.versions.length>1?pill('amber',t('Version')+' '+o.versions.length,'small'):''}<br><span class="muted small">${t('Ziel')}: ${o.destination?esc(o.destination):`<span class="warn-text">${esc(t('unbestätigt'))}</span>`} · ${t('Abfuhr')} ${fmt.date(o.window.from)} – ${fmt.date(o.window.to)}${o.restricted&&(o.restricted.freightRate||o.restricted.paymentTerms)&&ctx.canSeeRates?` · 🔒 ${esc(o.restricted.freightRate||'')} ${esc(o.restricted.paymentTerms||'')}`:''}</span></td>
    <td colspan="4">${statusPill('order',o.status)} <a class="btn small" href="#/reports/${esc(o.id)}">${t('Bericht')}</a> <a class="btn small" href="#/inbox/${esc(o.documentIds[0])}">${t('Dokument')}</a> ${button(t('Fahrerauszug'),'excerpt-open',{doc:o.documentIds[o.documentIds.length-1]},'small')}</td></tr>`;
}
function stackRow(ctx,st){
  const {state}=ctx;const o=state.orders[st.orderId];const sel=(ctx.ui.selection||[]).includes(st.key);const focus=ctx.route.query.stack===st.key;
  return `<tr class="stack-row${focus?' focus':''}${st.progress==='Blocked'?' blocked':''}" data-stack="${esc(st.key)}"><td><input type="checkbox" data-action="dispatch-select" data-stack="${esc(st.key)}" ${sel?'checked':''} aria-label="${t('Polter auswählen')}"></td>
    <td>${button(S.stackRef(st),'dispatch-focus',{stack:st.key},'link')}<div class="muted small">${S.timber(st)}</div></td>
    <td class="num">${fmt.qty(st.planned.qty,st.planned.unit)}${st.pieces.value!=null?`<div class="muted small">${st.pieces.value} ${t('Stück')}${st.pieces.value===0?'*':''}</div>`:''}</td>
    <td class="${S.dueClass(o,ctx.now)}">${S.deadline(o)}</td>
    <td>${locCell(ctx,st)}</td><td>${pubCell(ctx,st)}</td><td>${allocCell(ctx,st)}</td><td>${progressCell(ctx,st)}</td></tr>`;
}
function queuePanel(ctx){
  const {state}=ctx;const open=Object.values(state.stacks).filter(st=>st.location.status!=='confirmed'&&st.progress!=='Blocked');
  const conflicts=state.conflicts.filter(c=>!c.resolved);const problems=Object.values(state.stacks).filter(st=>st.problem);
  const cleared=state.events.filter(e=>e.kind==='cleared').slice(-6).reverse();const pending=state.ui.queue.length;
  return `<div class="panels">
    <section class="panel"><h3>${t('Standort erforderlich')} <span class="cnt cnt-red">${open.length}</span></h3>${open.length?`<ul class="list">${open.map(st=>`<li><strong>${S.stackRef(st)}</strong> <span class="muted">${esc(S.party(state,state.orders[st.orderId].customerId)||'')}</span><div class="muted small">${S.locationText(st)}</div><div class="row wrap">${st.location.parsed&&st.location.parsed.ok?button(t('Gedruckte bestätigen'),'location-confirm',{stack:st.key,method:'printed'},'small'):''}${st.location.parsed&&st.location.parsed.suggestion?button(t('Lesart übernehmen'),'location-confirm',{stack:st.key,method:'suggestion'},'small'):''}${button(state.orders[st.orderId].mapPages.length?t('Aus Kartenbild platzieren'):t('Manuell platzieren'),'location-place',{stack:st.key},'small')}${button(t('Blockieren'),'block-toggle',{stack:st.key,on:'1'},'small link')}</div></li>`).join('')}</ul>`:`<p class="muted">${esc(t('Alle Polter haben einen bestätigten Standort.'))}</p>`}<p class="muted small">${esc(t('Ohne bestätigten Abholort erscheint keine Arbeit als präziser Pin. Büro-, Revier- oder Werksadressen werden nie als Abholort verwendet.'))}</p></section>
    <section class="panel"><h3>${t('Konflikte')} <span class="cnt ${conflicts.length?'cnt-red':'cnt-grey'}">${conflicts.length}</span></h3>${conflicts.length?`<ul class="list">${conflicts.map(c=>`<li><code>${esc(c.id)}</code> ${pill('red',esc(t({doubleClaim:'Doppelanspruch',pickupAfterWithdrawal:'Abholung nach Entzug',pickupAfterClearance:'Abholung nach Räumung',clearedTwice:'Doppelte Räumung',revisionDuringWork:'Änderung während Feldarbeit',contradictoryQuantity:'Widersprüchliche Menge'}[c.kind]||c.kind)),'small')} ${esc(c.message)}<div class="row wrap">${button(t('Bestätigt — so lassen'),'conflict-resolve',{conflict:c.id,resolution:'kept'},'small')}${button(t('Korrigiert'),'conflict-resolve',{conflict:c.id,resolution:'corrected'},'small')}</div></li>`).join('')}</ul>`:`<p class="muted">${esc(t('Keine offenen Konflikte. Widersprüche werden nie per „letzte Änderung gewinnt“ aufgelöst.'))}</p>`}</section>
    <section class="panel"><h3>${t('Problemmeldungen')} <span class="cnt ${problems.length?'cnt-amber':'cnt-grey'}">${problems.length}</span></h3>${problems.length?`<ul class="list">${problems.map(st=>`<li><strong>${S.stackRef(st)}</strong>: ${esc(st.problem.kind)}${st.problem.note?' — '+esc(st.problem.note):''} <span class="muted small">${esc(S.userName(state,st.problem.by))} · ${fmt.dt(st.problem.at)}${st.problem.photo?' · 📷':''}</span><div class="row wrap">${button(st.progress==='Blocked'?t('Freigeben'):t('Blockieren'),'block-toggle',{stack:st.key,on:st.progress==='Blocked'?'0':'1'},'small')}${button(t('Erledigt'),'problem-clear',{stack:st.key},'small link')}</div></li>`).join('')}</ul>`:`<p class="muted">${esc(t('Keine Problemmeldungen.'))}</p>`}</section>
    <section class="panel"><h3>${t('Räumungsmeldungen')}</h3>${cleared.length?`<ul class="list">${cleared.map(e=>{const st=state.stacks[e.stackKey];return `<li>${st?S.stackRef(st):esc(e.stackKey)} · ${esc(S.userName(state,e.driverId))} · ${fmt.dt(e.eventTime)} <span class="muted small">(${t('empfangen')} ${fmt.dt(e.receivedTime)})</span></li>`;}).join('')}</ul>`:`<p class="muted">${esc(t('Noch keine Räumung gemeldet.'))}</p>`}</section>
    <section class="panel"><h3>${t('Synchronisierung')}</h3><p>${pending?`${pill('amber',pending+' '+t('ausstehend'),'small')} `:pill('green',t('alles übertragen'),'small')} <span class="muted small">${t('letzte Übertragung')}: ${fmt.dt(state.ui.lastSync)} · ${t('Ereignisse')}: ${state.events.length}</span></p><p class="muted small">${esc(t('Offline erfasste Aktionen zeigen „Ausstehende Synchronisierung“, bis sie quittiert sind; Wiederholungen sind durch Ereignis-IDs unschädlich.'))}</p></section>
  </div>`;
}
function selectionBar(ctx){
  const sel=ctx.ui.selection||[];if(!sel.length)return `<div class="selbar muted">${esc(t('Polter auswählen, um zu veröffentlichen, zuzuteilen oder zu blockieren.'))}</div>`;
  return `<div class="selbar"><strong>${sel.length} ${t('ausgewählt')}</strong> ${button(t('Veröffentlichen'),'publish-open',{},'primary')} ${button(t('Zuteilen'),'allocate-open',{},'')} ${button(t('Veröffentlichung aufheben'),'unpublish',{},'')} ${button(t('Blockieren'),'block-selected',{},'')} ${button(t('Auswahl leeren'),'dispatch-clear',{},'link')}</div>`;
}
function focusCard(ctx){
  const {state}=ctx;const key=ctx.route.query.stack;const st=key?state.stacks[key]:null;if(!st)return '';const o=state.orders[st.orderId];const M=globalThis.TransportCore.model;const loads=Object.values(state.loads).filter(l=>l.lines.some(x=>x.stackKey===st.key));
  return `<section class="card focus-card"><header><h3>${S.stackRef(st)} <span class="muted">${esc(o.id)}</span></h3>${button('✕','dispatch-focus',{stack:''},'ghost')}</header>
    ${kv([[t('Kunde'),esc(S.party(state,o.customerId)||'')],[t('Auftrag'),`${S.orderRef(o)} · ${statusPill('order',o.status,'small')}`],[t('Holz'),S.timber(st)],[t('Menge'),`${fmt.qty(st.planned.qty,st.planned.unit)} <span class="muted">(${esc(st.planned.raw||'')})</span>`],[t('Stück'),st.pieces.value==null?null:String(st.pieces.value)+(st.pieces.value===0?' *':'')],[t('Frist'),S.deadline(o)],[t('Standort'),`${statusPill('location',st.location.status,'small')} ${S.locationText(st)}${st.confirmed?`<div class="muted small">${t('bestätigt von')} ${esc(S.userName(state,st.confirmed.by))} · ${fmt.dt(st.confirmed.at)}${st.confirmed.note?' · '+esc(st.confirmed.note):''}</div>`:''}`],[t('Veröffentlichung'),pubCell(ctx,st)],[t('Zuteilung'),allocCell(ctx,st)],[t('Fortschritt'),progressCell(ctx,st)],[t('Fuhren'),loads.length?loads.map(l=>`<a href="#/receipts/loads?load=${esc(l.id)}">${esc(l.id)}</a> ${statusPill('load',l.state,'small')}`).join('<br>'):null],[t('Quelle'),`<a href="#/inbox/${esc(st.sourceRef.docId)}">${esc(st.sourceRef.docId)}</a> · ${t('Seite')} ${st.sourceRef.page}, ${t('Zeile')} ${st.sourceRef.line+1}`]])}
    <div class="row wrap"><strong class="small">${t('Fotos')}</strong>${S.photoStrip(M.stackPhotos(state,st.key),{max:8,emptyText:t('noch kein Foto')})}</div>
    <p class="muted small">${esc(t('Ein Pin oder eine Straßenroute ist kein Nachweis, dass ein beladener Holz-Lkw den Polter erreicht. Bei Zweifel Revier kontaktieren:'))} ${S.telLink((o.contacts.find(c=>/Revier|Einsatz|vor Ort/i.test(c.role))||{}).value||'–')} ${st.confirmed?S.navLinks(st.confirmed.lat,st.confirmed.lon):''}</p>
    <div class="row wrap">${button(t('Veröffentlichen'),'publish-open',{stack:st.key},'small primary')}${button(t('Zuteilen'),'allocate-open',{stack:st.key},'small')}${button(st.progress==='Blocked'?t('Blockierung aufheben'):t('Blockieren'),'block-toggle',{stack:st.key,on:st.progress==='Blocked'?'0':'1'},'small')}${st.progress!=='Cleared'?button(t('Durch Disposition erledigt'),'resolve-stack',{stack:st.key},'small link'):''}</div></section>`;
}
/* the card shown in the map popup when a pin is clicked (also used by the driver's map dialog) */
function pinCard(ctx,st,opts={}){
  const {state}=ctx;const o=state.orders[st.orderId];const M=globalThis.TransportCore.model;const es=M.ledgerFor(state,{stackKey:st.key});const col=M.sumBasis(es,'driverEstimate');
  const contact=(o.contacts||[]).find(c=>/Revier|Einsatz|vor Ort/i.test(c.role))||(o.contacts||[])[0];const driver=opts.driver;const alloc=driver?Object.values(state.allocations).find(a=>a.stackKey===st.key&&a.driverId===driver&&['Accepted','Reserved'].includes(a.state)):null;
  const customers=[...new Set(Object.values(state.orders).map(x=>x.customerId))];const ci=customers.indexOf(o.customerId)%6;
  return `<article class="pin-card" data-stack="${esc(st.key)}"><header><span class="pin-dot c${ci}"></span><strong>${S.stackRef(st)}</strong>${statusPill('stack',st.progress,'small')}${button('✕','map-popup-close',{},'ghost small','aria-label="'+esc(t('Schließen'))+'"')}</header>
    <div class="pc-sub">${esc(S.party(state,o.customerId)||o.issuer||'')} · ${S.orderRef(o)}</div>
    <div class="pc-facts">${S.timber(st)}</div>
    ${S.progressBar(col?col.value:null,st.planned.qty,st.planned.unit)}
    <div class="pc-facts small"><span class="${S.dueClass(o,ctx.now)}">${t('Frist')} ${S.deadline(o)}</span> · ${t('Ziel')} ${esc(S.party(state,o.destinationId)||o.destination||t('unbestätigt'))}${st.pieces.value?` · ${st.pieces.value} ${t('Stück')}`:''}</div>
    <div class="pc-facts small muted">${S.locationText(st)}</div>
    ${st.problem?`<div class="pc-facts small warn-text">⚠ ${esc(st.problem.kind)}${st.problem.note?' — '+esc(st.problem.note):''}</div>`:''}
    ${contact?`<div class="pc-facts small">${esc(contact.role)}: ${S.telLink(contact.value)}</div>`:''}
    ${S.photoStrip(M.stackPhotos(state,st.key),{max:4,emptyText:t('noch kein Foto')})}
    <div class="row wrap pc-actions">${st.confirmed?S.navLinks(st.confirmed.lat,st.confirmed.lon):''}${driver?(alloc&&st.progress!=='Cleared'?button(t('Abholung'),'pickup-open',{stack:st.key},'small primary')+button(t('Geräumt'),'cleared-open',{stack:st.key},'small')+button(t('Problem'),'problem-open',{stack:st.key},'small'):''):button(t('Details'),'dispatch-focus',{stack:st.key,focus:'1'},'small')+button(t('Veröffentlichen'),'publish-open',{stack:st.key},'small')+button(t('Zuteilen'),'allocate-open',{stack:st.key},'small')}</div>
    <div class="pc-note muted small">${esc(t('Ein Pin ist kein Nachweis der Lkw-Befahrbarkeit.'))}</div></article>`;
}
function render(ctx){
  const {state}=ctx;const all=Object.values(state.stacks);const stacks=applyFilters(ctx,all);const orders=[...new Set(stacks.map(s=>s.orderId))].map(id=>state.orders[id]).sort((a,b)=>(a.window.to||'9').localeCompare(b.window.to||'9'));
  const rows=[];for(const o of orders){rows.push(orderHeader(ctx,o));for(const k of o.stackKeys){const st=state.stacks[k];if(stacks.includes(st))rows.push(stackRow(ctx,st));}}
  const legend=`<div class="legend">${[...new Set(Object.values(state.orders).map(o=>o.customerId))].map((id,i)=>`<span class="lg"><i class="pin-dot c${i%6}"></i>${esc(S.party(state,id)||id)}</span>`).join('')}<span class="lg"><i class="pin-dot dest"></i>${t('Zielwerk')}</span><span class="lg"><i class="pin-dot cleared"></i>${t('geräumt')}</span></div>`;
  return `<section class="dispatch">
    ${filters(ctx,stacks)}
    <div class="dispatch-grid">
      <div class="map-col"><div class="map-tools">${button('+','map-zoom',{dir:'1'},'','aria-label="'+t('Vergrößern')+'"')}${button('−','map-zoom',{dir:'-1'},'','aria-label="'+t('Verkleinern')+'"')}${button(t('Alle anzeigen'),'map-fit',{},'')}<label>${t('Hintergrund')} ${select('tiles',globalThis.TransportCore.tilemap.sources().map(([k,l])=>[k,t(l)]),ctx.ui.tiles||'osm','data-action="map-source"')}</label><span class="muted small">${t('zuletzt aktualisiert')}: ${fmt.time(ctx.now)}</span></div>
        <div id="dispatchMap" class="map" role="application" aria-label="${t('Karte der bestätigten Polter')}"></div>${legend}
        ${focusCard(ctx)}
        ${queuePanel(ctx)}</div>
      <div class="list-col">${selectionBar(ctx)}${orders.length?table([`<input type="checkbox" data-action="dispatch-select-all" aria-label="${t('Alle auswählen')}" ${stacks.length&&stacks.every(s=>(ctx.ui.selection||[]).includes(s.key))?'checked':''}>`,t('Polter'),t('Menge'),t('Frist'),t('Standort'),t('Veröffentlicht'),t('Zuteilung'),t('Fortschritt')],rows,'dispatch-table'):empty(Object.keys(state.orders).length?t('Keine Polter in diesem Filter.'):t('Noch keine freigegebenen Aufträge. Im Posteingang Dokumente prüfen und freigeben.'))}</div>
    </div></section>`;
}
/* Dialogs */
function publishDialog(ctx,keys){
  const {state}=ctx;const drivers=state.users.filter(u=>u.roles.includes('driver'));
  return `<form method="dialog" class="dlg" data-form="publish"><h2>${t('Veröffentlichen')} <small class="muted">${keys.length} ${t('Polter')}</small></h2>
    <p class="muted">${esc(t('Sichtbarkeit ist keine Zuteilung: eine flottenweite Karte macht Arbeit auffindbar; eine Zuteilung benennt, wer abholen soll.'))}</p>
    <fieldset><legend>${t('Sichtbar für')}</legend><label><input type="radio" name="scope" value="fleet" checked> ${t('Gesamte Flotte')}</label><label><input type="radio" name="scope" value="group"> ${t('Fahrergruppe')} ${select('group',state.groups.map(g=>[g.id,g.name]),state.groups[0]?state.groups[0].id:'')}</label><label><input type="radio" name="scope" value="named"> ${t('Benannte Fahrer')}</label><div class="checks">${drivers.map(d=>`<label><input type="checkbox" name="driver" value="${esc(d.id)}"> ${esc(d.name)}</label>`).join('')}</div></fieldset>
    <input type="hidden" name="keys" value="${esc(keys.join('|'))}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Veröffentlichen')}</button></div></form>`;
}
function allocateDialog(ctx,keys,reassign){
  const {state}=ctx;const drivers=state.users.filter(u=>u.roles.includes('driver'));const sts=keys.map(k=>state.stacks[k]).filter(Boolean);
  return `<form method="dialog" class="dlg" data-form="allocate"><h2>${reassign?t('Neu zuteilen'):t('Zuteilen')} <small class="muted">${sts.map(s=>S.stackRef(s)).join(', ')}</small></h2>
    <label>${t('Fahrer')} ${select('driver',drivers.map(d=>[d.id,d.name+(d.truckId?' · '+S.truckReg(state,d.truckId):'')]),drivers[0].id)}</label>
    <label>${t('Fahrzeug')} ${select('truck',[['',t('Stammfahrzeug des Fahrers')],...state.trucks.map(x=>[x.id,x.reg+' · '+x.kind])],'')}</label>
    <fieldset><legend>${t('Umfang')}</legend><label><input type="radio" name="share" value="whole" checked> ${t('ganzer Polter')}</label><label><input type="radio" name="share" value="loads"> ${t('Anzahl Fuhren')} <input type="number" name="loads" min="1" value="1" style="width:5em"></label><label><input type="radio" name="share" value="qty"> ${t('Menge')} <input type="number" name="qty" min="0" step="0.1" style="width:7em"> ${esc(sts[0]&&sts[0].planned.unit?S.fmt.qty(null,null)&&globalThis.TransportCore.units.UNITS[sts[0].planned.unit].label:'')}</label></fieldset>
    <p class="muted small">${esc(t('Mehrere Lkw können an einem Auftrag arbeiten; die Zuteilung benennt Polter und Anteil. Die Annahme durch den Fahrer verhindert, dass zwei verbundene Fahrer dieselbe Zuteilung beanspruchen.'))}</p>
    <input type="hidden" name="keys" value="${esc(keys.join('|'))}"><input type="hidden" name="reassign" value="${esc(reassign||'')}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Zuteilen')}</button></div></form>`;
}
function placeDialog(ctx,stackKey,draftDoc){
  const {state}=ctx;const st=state.stacks[stackKey];const d=draftDoc?state.documents[draftDoc.docId]:(st?state.documents[st.sourceRef.docId]:null);const pages=d?d.attachments.flatMap(a=>a.pages).filter(p=>p.kind==='map'):[];
  const label=st?S.stackRef(st):esc(draftDoc?draftDoc.tempKey:'');const pd=ctx.ui.place||{};
  return `<div class="dlg wide place"><h2>${t('Standort platzieren')} <small class="muted">${label}</small></h2>
    <p class="muted small">${esc(t('Links die Kartenseite des Dokuments (Bildnachweis), rechts die Karte: klicken, um den Pin zu setzen. Ohne Kartenseite: Lage nach Rücksprache mit dem Revier manuell setzen. Der Pin gilt erst nach „Übernehmen“.'))}</p>
    <div class="place-grid"><div class="place-doc">${pages.length?`<nav class="rv-pages">${pages.map(p=>button(`${t('Seite')} ${p.n}`,'place-page',{page:p.n},(pd.page||pages[0].n)===p.n?'tab active':'tab')).join('')}</nav>${S.facsimile(pages.find(p=>p.n===(pd.page||pages[0].n))||pages[0],{activePin:pd.pin,pinAction:'place-pin'})}`:`<div class="empty">${esc(t('Keine Kartenseite im Dokument. Lage manuell setzen und Rücksprache dokumentieren.'))}</div>`}</div>
      <div class="place-map"><div id="placeMap" class="map small"></div><div class="row"><span class="muted small">${pd.lat!=null?`${t('gewählt')}: ${fmt.num(pd.lat,5)}, ${fmt.num(pd.lon,5)}`:esc(t('noch kein Punkt gewählt'))}</span></div>
        <label>${t('Breite')} <input name="lat" type="number" step="0.00001" value="${pd.lat!=null?pd.lat:''}" data-action="place-coord"></label> <label>${t('Länge')} <input name="lon" type="number" step="0.00001" value="${pd.lon!=null?pd.lon:''}" data-action="place-coord"></label>
        <label>${t('Vermerk')} <input name="note" value="${esc(pd.note||'')}" placeholder="${esc(pages.length?t('aus Kartenseite platziert'):t('telefonisch mit Revier bestätigt'))}"></label></div></div>
    <div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}${button(t('Übernehmen'),'place-save',{stack:stackKey||'',doc:draftDoc?draftDoc.docId:'',temp:draftDoc?draftDoc.tempKey:'',method:pages.length?'manual-from-map':'manual'},'primary',pd.lat==null?'disabled':'')}</div></div>`;
}
const api={render,applyFilters,publishDialog,allocateDialog,placeDialog,queuePanel,pinCard};
(globalThis.TransportViews=globalThis.TransportViews||{}).dispatch=api;
if(typeof module!=='undefined')module.exports=api;
})();
