/* Holztransport demo · Mobil „Meine Arbeit" (SPEC §7.4): phone frame with the driver persona, online/offline
   toggle, download, pending-sync badge, job cards (no office forms, no rates), pickup / cleared / problem actions,
   the current load flow (delivery note, arrival, unloading, mill-ticket photo) and documents. */
'use strict';
(function(){
const S=globalThis.TransportViews.shared;const {esc,t,fmt,pill,statusPill,button,select,kv,table,empty}=S;
const C=()=>globalThis.TransportCore.coords;
function driverOf(ctx){const u=ctx.user;return u&&u.roles.includes('driver')?u:null;}
function render(ctx){
  const {state}=ctx;const drv=driverOf(ctx);const drivers=state.users.filter(u=>u.roles.includes('driver'));
  const picker=`<div class="drv-pick"><label>${t('Fahrer (Persona)')} ${select('persona',[['',t('– wählen –')],...drivers.map(d=>[d.id,d.name+(d.truckId?' · '+S.truckReg(state,d.truckId):'')])],drv?drv.id:'','data-action="persona-switch"')}</label><span class="muted small">${esc(t('Die Fahreransicht zeigt nur zugeteilte und freigegebene Arbeit; Frachtsätze bleiben verborgen.'))}</span></div>`;
  if(!drv)return `<section class="driver">${picker}${empty(t('Fahrer-Persona wählen, um die mobile Ansicht zu sehen.'))}</section>`;
  const tab=ctx.ui.driverTab||'work';const online=state.ui.online!==false;const q=state.ui.queue.length;const dl=state.ui.downloaded[drv.id];
  const body=tab==='work'?workTab(ctx,drv,dl):tab==='map'?mapTab(ctx,drv,dl):tab==='load'?loadTab(ctx,drv):tab==='docs'?docsTab(ctx,drv):moreTab(ctx,drv,dl);
  return `<section class="driver">${picker}
    <div class="phone"><div class="phone-bar"><strong>${esc(drv.name)}</strong> <span class="muted">${esc(S.truckReg(state,drv.truckId))}</span>
      ${button(online?`<i class="modus-icons" aria-hidden="true">wifi</i> ${t('Online')}`:`<i class="modus-icons" aria-hidden="true">wifi_off</i> ${t('Offline')}`,'driver-online',{},online?'small online':'small offline')}${q?`<span class="pill pill-amber small" title="${t('Ausstehende Synchronisierung')}">${q} ${t('ausstehend')}</span>`:''}</div>
      <div class="phone-sub muted small">${dl?`${t('Daten vom')} ${fmt.dt(dl.at)}`:esc(t('noch nicht heruntergeladen'))} · ${t('letzte Übertragung')} ${fmt.time(state.ui.lastSync)} ${button(`<i class="modus-icons" aria-hidden="true">cloud_download</i> ${t('Herunterladen')}`,'driver-download',{},'link small',online?'':'disabled')} ${button(`<i class="modus-icons" aria-hidden="true">sync</i> ${t('Synchronisieren')}`,'driver-sync',{},'link small',online&&q?'':'disabled')}</div>
      <nav class="phone-tabs">${[['work',t('Meine Arbeit'),'list_bulleted'],['map',t('Karte'),'map'],['load',t('Fuhre'),'delivery_truck'],['docs',t('Belege'),'document'],['more',t('Mehr'),'menu']].map(([k,l,ic])=>button(`<i class="modus-icons" aria-hidden="true">${ic}</i><span>${l}</span>`,'driver-tab',{tab:k},k===tab?'tab active':'tab')).join('')}</nav>
      <div class="phone-body">${body}</div>
      <div class="phone-foot muted small">${online?esc(t('Verbunden — Aktionen werden sofort quittiert.')):esc(t('Offline — Aktionen werden lokal gespeichert und beim Verbinden einmalig übertragen.'))}</div></div></section>`;
}
function distanceKm(state,st){const base=state.parties.find(p=>p.id===state.carrierId);if(!st.confirmed||!base)return null;return C().haversineKm(base.lat,base.lon,st.confirmed.lat,st.confirmed.lon);}
const M=()=>globalThis.TransportCore.model;
function docOf(state,o){return state.documents[o.documentIds[o.documentIds.length-1]]||null;}
function originalButton(ctx,o,cls='small link'){const d=docOf(ctx.state,o);if(!d)return '';if(d.original&&d.driverOriginal)return button(`<i class="modus-icons" aria-hidden="true">file_type_pdf</i> ${t('Original öffnen')}`,'original-open',{doc:d.id},cls);return button(`<i class="modus-icons" aria-hidden="true">document</i> ${t('Auszug')}`,'excerpt-open',{doc:d.id},cls);}
function rank(w){const a=w.allocation,st=w.stack;if(a&&['Accepted','Reserved'].includes(a.state)&&st.progress!=='Cleared')return 0;if(a&&a.state==='Proposed')return 1;if(w.shared&&st.progress!=='Cleared')return 2;return 3;}
/* the big card for the task the driver is on now: one glance, thumb-sized actions */
function heroCard(ctx,w,dl){
  const {state}=ctx;const st=w.stack,o=w.order,a=w.allocation;const dist=distanceKm(state,st);const active=a&&['Accepted','Reserved'].includes(a.state);
  const contact=(o.contacts||[]).find(c=>/Revier|Einsatz|vor Ort/i.test(c.role))||(o.contacts||[])[0];const es=M().ledgerFor(state,{stackKey:st.key});const col=M().sumBasis(es,'driverEstimate');
  const stale=dl&&!dl.stackKeys.includes(st.key);
  return `<article class="job hero${active?' active':''}${st.progress==='Cleared'?' done':''}" data-stack="${esc(st.key)}">
    <header><span class="hero-kicker">${esc(t(active?'Jetzt dran':a&&a.state==='Proposed'?'Neue Zuteilung':w.shared?'Für die Flotte sichtbar':'Erledigt'))}</span><div class="hero-pills">${statusPill('stack',st.progress,'small')}${w.shared?pill('blue',t('Flottenarbeit'),'small'):a?statusPill('alloc',a.state,'small'):''}${a&&a.deliveredToDriver===false?pill('amber',t('Änderung durch Disposition'),'small'):''}${stale?pill('amber',t('nicht im Download'),'small'):''}</div></header>
    <h3 class="hero-title">${S.stackRef(st)}</h3>
    <div class="hero-sub">${esc(S.party(state,o.customerId)||o.issuer||'')} · ${S.orderRef(o)}</div>
    <div class="hero-facts"><div><b>${fmt.qty(st.planned.qty,st.planned.unit)}</b><span>${esc(t('Menge'))}${st.pieces.value?` · ${st.pieces.value} ${t('Stück')}`:''}</span></div><div><b class="${S.dueClass(o,ctx.now)}">${S.deadline(o)}</b><span>${esc(t('Frist'))}</span></div><div><b>${dist!=null?fmt.num(dist,0)+' km':'–'}</b><span>${esc(t('ab Standort'))}</span></div></div>
    <div class="hero-facts2">${S.timber(st)}${a&&a.share&&a.share.kind!=='whole'?` · ${t('Anteil')}: ${esc(a.share.value)} ${esc(t(a.share.kind==='loads'?'Fuhren':a.share.kind))}`:''}<br><span class="muted">${t('Ziel')}: ${esc(S.party(state,o.destinationId)||o.destination||t('unbestätigt'))}</span></div>
    ${S.progressBar(col?col.value:null,st.planned.qty,st.planned.unit)}
    ${st.location.status==='confirmed'?`<div class="hero-nav">${st.confirmed?S.navLinks(st.confirmed.lat,st.confirmed.lon,t('Navigation starten')):''}${button(`<i class="modus-icons" aria-hidden="true">map</i> ${t('Karte')}`,'driver-map',{stack:st.key},'small')}</div>`:`<div class="hero-nav warn-text small">${esc(t('Standort noch nicht bestätigt — Disposition'))}</div>`}
    ${contact?`<div class="hero-contact small">${esc(contact.role)}: ${S.telLink(contact.value)}</div>`:''}
    ${st.problem?`<div class="hero-contact small warn-text">⚠ ${esc(st.problem.kind)}${st.problem.note?' — '+esc(st.problem.note):''}</div>`:''}
    <div class="hero-actions">
      ${claimed(ctx,a)?`<div class="row"><span class="pill pill-red">${esc(t('Doppelanspruch'))}</span> <span class="muted small">${esc(t('Disposition entscheidet'))}</span></div>`:a&&a.state==='Proposed'?button(`<i class="modus-icons" aria-hidden="true">check_bold</i> ${t('Annehmen')}`,'driver-accept',{alloc:a.id},'big primary'):''}
      ${w.shared&&!a&&st.progress!=='Cleared'?button(`<i class="modus-icons" aria-hidden="true">check_bold</i> ${t('Übernehmen')}`,'driver-reserve',{stack:st.key},'big primary',state.ui.online===false?'disabled title="'+esc(t('Verbindung nötig'))+'"':''):''}
      ${active&&st.progress!=='Cleared'?button(`<i class="modus-icons" aria-hidden="true">delivery_truck</i> ${t('Abholung erfassen')}`,'pickup-open',{stack:st.key},'big primary')+button(`<i class="modus-icons" aria-hidden="true">check_circle</i> ${t('Polter geräumt')}`,'cleared-open',{stack:st.key},'big')+button(`<i class="modus-icons" aria-hidden="true">warning</i> ${t('Problem melden')}`,'problem-open',{stack:st.key},'big warn'):''}
    </div>
    <div class="row wrap hero-more">${originalButton(ctx,o)}${S.photoStrip(M().stackPhotos(state,st.key),{max:4})}</div>
    ${eventsOf(ctx,st)}</article>`;
}
/* a Proposed allocation whose acceptance was rejected while a double-claim conflict is open: the dispatcher decides, the driver waits */
function claimed(ctx,a){return !!(a&&a.state==='Proposed'&&(a.history||[]).some(h=>h.event==='accept-rejected')&&ctx.state.conflicts.some(c=>!c.resolved&&c.kind==='doubleClaim'&&c.refs&&Array.isArray(c.refs.allocations)&&c.refs.allocations.includes(a.id)));}
function jobRow(ctx,w){
  const {state}=ctx;const st=w.stack,o=w.order,a=w.allocation;
  return `<article class="job row-card${st.progress==='Cleared'?' done':''}" data-stack="${esc(st.key)}"><button type="button" class="row-main" data-action="driver-job" data-stack="${esc(st.key)}"><strong>${S.stackRef(st)}</strong><span class="muted small">${esc(S.party(state,o.customerId)||'')} · ${fmt.qty(st.planned.qty,st.planned.unit)} · ${t('Frist')} ${S.deadline(o)}</span></button>
    <div class="row-side">${statusPill('stack',st.progress,'small')}${claimed(ctx,a)?`<span class="pill pill-red small" title="${esc(t('Disposition entscheidet'))}">${esc(t('Doppelanspruch'))}</span>`:a&&a.state==='Proposed'?button(t('Annehmen'),'driver-accept',{alloc:a.id},'small primary'):''}${w.shared&&!a&&st.progress!=='Cleared'?button(t('Übernehmen'),'driver-reserve',{stack:st.key},'small primary',state.ui.online===false?'disabled':''):''}</div></article>`;
}
function eventsOf(ctx,st){const {state}=ctx;const evs=[...state.events.filter(e=>e.stackKey===st.key),...state.ui.queue.filter(e=>e.stackKey===st.key)].slice(-4);if(!evs.length)return '';return `<ul class="job-events small">${evs.map(e=>`<li>${esc(t({pickup:'Abholung',cleared:'geräumt',problem:'Problem'}[e.kind]||e.kind))}${e.qty!=null?` ${fmt.qty(e.qty,e.unit)}`:''} · ${fmt.dt(e.eventTime)} ${statusPill('sync',e.sync,'small')}</li>`).join('')}</ul>`;}
function workTab(ctx,drv,dl){
  const {state}=ctx;let work=ctx.store.visibleWork(drv.id);
  if(state.ui.online===false&&dl)work=work.filter(w=>dl.stackKeys.includes(w.stack.key)).concat(work.filter(w=>!dl.stackKeys.includes(w.stack.key)&&w.allocation));
  work.sort((x,y)=>rank(x)-rank(y)||(x.order.window.to||'9').localeCompare(y.order.window.to||'9'));
  let hero=work.find(w=>w.stack.key===ctx.ui.driverJob)||work[0]||null;const rest=work.filter(w=>w!==hero);
  return `${state.ui.online===false&&!dl?`${S.alert('amber',`${esc(t('Offline ohne Download: Arbeit zuerst online herunterladen.'))}`)}`:''}
    ${hero?heroCard(ctx,hero,dl):`<div class="empty">${esc(t('Keine Arbeit zugeteilt oder freigegeben.'))}</div>`}
    ${rest.length?`<h3 class="list-head">${t('Weitere Aufgaben')} <span class="muted">(${rest.length})</span></h3>${rest.map(w=>jobRow(ctx,w)).join('')}`:''}`;
}
/* the driver's map: every load he may take (assigned + fleet/group-visible, with a confirmed location); a pin opens the card with „Jetzt dran“ */
function mapTab(ctx,drv,dl){
  const {state}=ctx;let work=ctx.store.visibleWork(drv.id).filter(w=>w.stack.confirmed&&w.stack.progress!=='Cleared');
  if(state.ui.online===false&&dl)work=work.filter(w=>dl.stackKeys.includes(w.stack.key)||w.allocation);
  const mine=work.filter(w=>w.allocation).length,shared=work.length-mine;const sel=ctx.ui.driverMapStack?work.find(w=>w.stack.key===ctx.ui.driverMapStack):null;
  return `<div class="drv-map-head small"><strong>${work.length} ${t('Polter')}</strong> · ${mine} ${t('mir zugeteilt')} · ${shared} ${t('für die Flotte verfügbar')}</div>
    <div id="driverMap" class="map drv-map" data-all="1" role="application" aria-label="${esc(t('Karte der verfügbaren Polter'))}"></div>
    <div class="legend"><span class="lg"><i class="pin-dot mine"></i>${t('mir zugeteilt')}</span><span class="lg"><i class="pin-dot shared"></i>${t('Flotte / Gruppe')}</span><span class="lg"><i class="pin-dot dest"></i>${t('Zielwerk')}</span></div>
    ${sel?`<div class="drv-pin-card">${globalThis.TransportViews.dispatch.pinCard(ctx,sel.stack,{driver:drv.id,pick:true})}</div>`:`<p class="muted small">${esc(t('Pin antippen: Details, Navigation und „Jetzt dran“ — so wird der Polter die nächste Aufgabe (Vorschläge werden angenommen, Flottenarbeit reserviert).'))}</p>`}`;
}
function loadTab(ctx,drv){
  const {state}=ctx;const loads=Object.values(state.loads).filter(l=>l.driverId===drv.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if(!loads.length)return empty(t('Noch keine Fuhre. Eine Abholung erfassen beginnt die Fuhre dieses Fahrzeugs.'));
  return loads.map(l=>loadCard(ctx,l)).join('');
}
function loadCard(ctx,l){
  const {state}=ctx;const o=state.orders[l.orderId];const note=l.deliveryNoteId?state.notes[l.deliveryNoteId]:null;const rec=l.receiptIds.map(id=>state.receipts[id]);const eld=globalThis.TransportCore.model.ELDAT_STATUS[l.state];
  const actions=l.state==='Planned'?button(t('Lieferschein ausstellen'),'note-open',{load:l.id},'small primary'):l.state==='Loaded'?button(t('Ankunft melden'),'arrived',{load:l.id},'small primary'):l.state==='Arrived'||l.state==='Diverted'?button(t('Abladung melden'),'unload-open',{load:l.id},'small primary'):['Unloaded','Disputed'].includes(l.state)&&!rec.length?button(t('Werksschein fotografieren'),'ticket-photo-open',{load:l.id},'small primary'):'';
  return `<article class="job load${['Measured','Reconciled'].includes(l.state)?' done':''}"><header><strong>${esc(l.id)}</strong> ${statusPill('load',l.state,'small')}${eld?`<span class="muted small" title="ELDATsmart Lieferschein-Status (Orientierung)">ELDAT ${eld.code}</span>`:''}</header>
    <div class="job-ref">${S.orderRef(o)} · ${esc(S.party(state,o.customerId)||'')}</div>
    <div class="job-facts small">${t('Ziel')}: ${esc(S.party(state,l.destinationId)||o.destination||t('unbestätigt'))}${l.divertedFrom?` <span class="muted">(${t('umgeleitet von')} ${esc(S.party(state,l.divertedFrom)||'')})</span>`:''} · ${esc(S.truckReg(state,l.truckId))}</div>
    <ul class="small">${l.lines.map(x=>`<li>${S.stackRef(state.stacks[x.stackKey]||{refs:{},tempKey:x.stackKey})}: ${x.qty!=null?fmt.qty(x.qty,x.unit):`<em>${esc(t('Menge unbekannt'))}</em>`}${x.pieces!=null?` · ${x.pieces} ${t('Stück')}`:''}</li>`).join('')}</ul>
    ${note?`<div class="job-facts small">${t('Lieferschein')} <strong>${esc(note.number)}</strong>${note.customerNumber?` · ${t('Kundenformular')} ${esc(note.customerNumber)}`:''} · ${fmt.dt(note.issuedAt)} <a class="btn link small" href="#/print/note/${esc(note.id)}">${t('Anzeigen')}</a></div>`:''}
    ${l.arrivedAt?`<div class="job-facts small">${t('Ankunft')} ${fmt.dt(l.arrivedAt)}${l.unloadedAt?` · ${t('Abladung')} ${fmt.dt(l.unloadedAt)} (${esc(t(l.acceptance||''))})`:''}</div>`:''}
    ${S.photoStrip(l.photos||[],{max:4})}
    ${rec.length?rec.map(r=>`<div class="job-facts small">${t('Werksschein')} ${esc(r.ticketNo||'')} ${statusPill('match',r.matchState,'small')} ${r.weighbridge&&r.weighbridge.net?fmt.qty(r.weighbridge.net.value,r.weighbridge.net.unit):''} ${r.measuredLines.map(m=>fmt.qty(m.qty.value,m.qty.unit)).join(', ')}</div>`).join(''):(['Unloaded'].includes(l.state)?`<div class="job-facts small muted">${esc(t('Abgeladen — Werksmaß ausstehend (Werksschein kann Tage später kommen).'))}</div>`:'')}
    <div class="row wrap">${actions}</div></article>`;
}
function docsTab(ctx,drv){
  const {state}=ctx;const notes=Object.values(state.notes).filter(n=>n.driverId===drv.id);const recs=Object.values(state.receipts).filter(r=>r.source==='photo'&&state.loads[r.loadId]&&state.loads[r.loadId].driverId===drv.id);
  return `<h3>${t('Lieferscheine')}</h3>${notes.length?`<ul class="list">${notes.map(n=>`<li><strong>${esc(n.number)}</strong> · ${fmt.dt(n.issuedAt)} · ${esc(n.destination||'')} <a class="btn link small" href="#/print/note/${esc(n.id)}">${t('Anzeigen')}</a></li>`).join('')}</ul>`:`<p class="muted">${esc(t('Noch keine Lieferscheine.'))}</p>`}
    <h3>${t('Fotografierte Werksscheine')}</h3>${recs.length?`<ul class="list">${recs.map(r=>`<li>${esc(r.ticketNo||'–')} · ${esc(r.millName||'')} → ${esc(r.loadId)}</li>`).join('')}</ul>`:`<p class="muted">${esc(t('Keine.'))}</p>`}`;
}
function moreTab(ctx,drv,dl){
  const {state}=ctx;const work=ctx.store.visibleWork(drv.id);const contacts=[...new Map(work.flatMap(w=>(w.order.contacts||[]).map(c=>[c.role+c.value,{...c,order:w.order}]))).values()];
  return `<h3>${t('Kontakte')}</h3>${contacts.length?`<ul class="list">${contacts.map(c=>`<li><strong>${esc(c.role)}</strong>: ${esc(c.value)} <span class="muted small">${S.orderRef(c.order)}</span></li>`).join('')}</ul>`:`<p class="muted">${esc(t('Keine Kontakte in der aktuellen Arbeit.'))}</p>`}
    <h3>${t('Offline-Daten')}</h3>${kv([[t('Download'),dl?fmt.dt(dl.at):t('keiner')],[t('Polter im Download'),dl?String(dl.stackKeys.length):'–'],[t('Lokale Daten verfallen nach'),`${state.settings.localExpiryDays} ${t('Tagen')}`],[t('Ausstehende Aktionen'),String(state.ui.queue.length)]])}
    <p class="muted small">${esc(t('Entzogener Zugriff wirkt beim nächsten Verbinden; der Verfall lokaler Daten ist eine eigene Einstellung. Der Standort des Geräts wird nur für eine erklärte Aufgabe erfasst — keine Dauerortung.'))}</p>`;
}
/* dialogs */
function pickupDialog(ctx,st){const {state}=ctx;const o=state.orders[st.orderId];const unit=st.planned.unit||'fm';const label=globalThis.TransportCore.units.UNITS[unit]?globalThis.TransportCore.units.UNITS[unit].label:unit;
  return `<form method="dialog" class="dlg" data-form="pickup"><h2>${t('Abholung erfassen')} <small class="muted">${S.stackRef(st)}</small></h2><p class="muted small">${esc(t('Eine Abholung erfasst die Aufnahme am Polter, nicht die Lieferung und nicht die Werksannahme. Eine Teilabholung lässt den Polter offen.'))}</p>
    <label><input type="checkbox" name="unknown"> ${t('Menge unbekannt (wird nicht als 0 gewertet)')}</label>
    <label>${t('Menge')} (${esc(label)}) <input type="number" name="qty" step="0.01" min="0" placeholder="${esc(t('Schätzung'))}"></label>
    <label>${t('Stück')} <input type="number" name="pieces" min="0" placeholder="${esc(t('optional'))}"></label>
    <label>${t('Fahrzeug')} ${select('truck',state.trucks.map(x=>[x.id,x.reg+' · '+x.kind]),ctx.user.truckId||state.trucks[0].id)}</label>
    <label>${t('Hinweis')} <input name="note" placeholder="${esc(t('optional'))}"></label>${S.photoInput('photo')}
    <input type="hidden" name="stack" value="${esc(st.key)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Erfassen')}</button></div></form>`;}
function clearedDialog(ctx,st){const {state}=ctx;const o=state.orders[st.orderId];
  return `<form method="dialog" class="dlg" data-form="cleared"><h2>${t('Polter geräumt melden')}</h2><p>${esc(t('Ich bestätige, dass das Holz dieser Anweisung vollständig abgefahren ist:'))} <strong>${S.stackRef(st)}</strong>, ${S.orderRef(o)}, ${esc(S.party(state,o.customerId)||'')}.</p><p class="muted small">${esc(t('Die Räumung gilt nur für den Umfang dieses Auftrags — nicht für fremdes Holz am selben Lagerplatz. Sie ist kein Liefernachweis.'))}</p>
    <label><input type="checkbox" name="confirm" required> ${t('Vollständig abgefahren')}</label>${S.photoInput('photo')}<input type="hidden" name="stack" value="${esc(st.key)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Geräumt melden')}</button></div></form>`;}
function problemDialog(ctx,st){return `<form method="dialog" class="dlg" data-form="problem"><h2>${t('Problem melden')} <small class="muted">${S.stackRef(st)}</small></h2>
    <label>${t('Art')} ${select('kind',[t('Zufahrt blockiert'),t('Holz nicht gefunden'),t('falscher Standort'),t('Mengenabweichung'),t('Sonstiges')],t('Zufahrt blockiert'))}</label><label>${t('Hinweis')} <textarea name="note" rows="3"></textarea></label>${S.photoInput('photo')}
    <input type="hidden" name="stack" value="${esc(st.key)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Melden')}</button></div></form>`;}
function noteDialog(ctx,l){const {state}=ctx;const o=state.orders[l.orderId];const dests=state.parties.filter(p=>(p.roles||[]).some(r=>['mill','receivingSite'].includes(r)));
  return `<form method="dialog" class="dlg" data-form="note"><h2>${t('Lieferschein ausstellen')} <small class="muted">${esc(l.id)}</small></h2><p class="muted small">${esc(t('Je Fuhre ein Lieferschein unmittelbar nach dem Beladen. Vorbelegt aus der Zuteilung; alternativ das Kundenformular fotografieren — der Datensatz bleibt derselbe.'))}</p>
    <fieldset><legend>${t('Form')}</legend><label><input type="radio" name="form" value="generated" checked> ${t('App-Lieferschein')}</label><label><input type="radio" name="form" value="photo"> ${t('Kundenformular fotografiert')}</label></fieldset>
    <label>${t('Kunden-Lieferscheinnummer')} <input name="customerNoteNo" placeholder="${esc(t('z. B. 2026A01508 oder Ladenummer'))}"></label>
    <label>${t('Ziel')} ${select('destination',[['',t('– laut Auftrag –')],...dests.map(p=>[p.id,p.name])],l.destinationId||'')}</label>
    <h4>${t('Deklarierte Mengen')}</h4>${l.lines.map((x,i)=>`<label>${S.stackRef(state.stacks[x.stackKey]||{refs:{},tempKey:x.stackKey})} <input type="number" step="0.01" min="0" name="qty_${i}" value="${x.qty!=null?x.qty:''}" placeholder="${esc(t('Schätzmaß'))}"> ${esc(x.unit||'')} <input type="number" min="0" name="pcs_${i}" value="${x.pieces!=null?x.pieces:''}" placeholder="${esc(t('Stück'))}" style="width:5em"></label>`).join('')}
    <label><input type="checkbox" name="transportComplete"> ${t('Transport abgeschlossen (Polterabfuhr beendet)')}</label>
    <label>${t('EUDR-Referenz (optional)')} <input name="eudrRef" placeholder="DDS-Referenz des Waldbesitzers"></label>
    <input type="hidden" name="load" value="${esc(l.id)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Ausstellen')}</button></div></form>`;}
function unloadDialog(ctx,l){const {state}=ctx;const dests=state.parties.filter(p=>(p.roles||[]).some(r=>['mill','receivingSite'].includes(r)));
  return `<form method="dialog" class="dlg" data-form="unload"><h2>${t('Abladung melden')} <small class="muted">${esc(l.id)}</small></h2>
    <fieldset><legend>${t('Ergebnis')}</legend>${[['accepted',t('angenommen')],['partial',t('teilweise abgeladen')],['rejected',t('abgelehnt')],['diverted',t('umgeleitet an anderes Werk')]].map(([v,lbl],i)=>`<label><input type="radio" name="acceptance" value="${v}" ${i===0?'checked':''}> ${lbl}</label>`).join('')}</fieldset>
    <label>${t('Grund')} <input name="reason" placeholder="${esc(t('bei Ausnahme'))}"></label><label>${t('Neues Ziel (bei Umleitung)')} ${select('newDestination',[['',t('–')],...dests.map(p=>[p.id,p.name])],'')}</label><label><input type="checkbox" name="photo"> ${t('Foto beigefügt (Demo-Platzhalter)')}</label>
    <input type="hidden" name="load" value="${esc(l.id)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Melden')}</button></div></form>`;}
function ticketDialog(ctx,l){const {state}=ctx;
  return `<form method="dialog" class="dlg" data-form="ticket"><h2>${t('Werksschein fotografieren')} <small class="muted">${esc(l.id)}</small></h2><p class="muted small">${esc(t('Demo: statt eines Fotos die Werte des Papierbelegs eintragen. Der Beleg wird direkt dieser Fuhre zugeordnet (Fahrerfoto).'))}</p>
    <label>${t('Belegnummer')} <input name="ticketNo" required></label>
    <fieldset><legend>${t('Werksmaß oder Wiegung')}</legend><label>${t('Menge')} <input type="number" step="0.01" min="0" name="qty"> ${select('unit',[['fm','fm'],['rm','rm'],['m3','m³'],['t','t']],'fm')}</label><label>${t('Netto')} (kg) <input type="number" min="0" name="net"></label><label>${t('Brutto')} (kg) <input type="number" min="0" name="gross"></label><label>${t('Tara')} (kg) <input type="number" min="0" name="tare"></label></fieldset>
    <input type="hidden" name="load" value="${esc(l.id)}"><div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Erfassen')}</button></div></form>`;}
function mapDialog(ctx,st){const {state}=ctx;const o=state.orders[st.orderId];return `<div class="dlg wide"><h2>${S.stackRef(st)} <small class="muted">${esc(S.party(state,o.customerId)||'')}</small></h2><div id="driverMap" class="map"></div><p class="small">${S.locationText(st)} ${st.confirmed?S.navLinks(st.confirmed.lat,st.confirmed.lon,t('Navigation starten')):''}</p><p class="muted small">${esc(t('Ein Pin ist kein Nachweis, dass ein beladener Holz-Lkw den Polter erreicht; Forstwege und Tonnagegrenzen vor Ort prüfen. Revier:'))} ${S.telLink((o.contacts.find(c=>/Revier|vor Ort/i.test(c.role))||{}).value||'–')}</p><div class="dlg-actions">${button(t('Schließen'),'dialog-close',{},'primary')}</div></div>`;}
function originalDialog(ctx,docId){const d=ctx.state.documents[docId];if(!d)return '';return `<div class="dlg wide orig-dialog"><h2>📄 ${t('Original')} <small class="muted">${esc(d.subject)}</small></h2><p class="muted small">${esc(t('Die Originaldatei wird aus dem Browser-Speicher gerendert; sie wurde nie hochgeladen.'))}${d.original?` · ${esc(d.original.name)} · ${Math.round((d.original.size||0)/1024)} KB`:''}</p><div class="orig-pages" data-doc="${esc(d.id)}">${d.original?`<div class="orig-fallback muted">${esc(t('Original wird gerendert …'))}</div>`:`<div class="empty">${esc(t('Kein Original hinterlegt.'))}</div>`}</div><div class="dlg-actions">${button(t('Schließen'),'dialog-close',{},'primary')}</div></div>`;}
function photoDialog(ctx,src,caption,credit,page){return `<div class="dlg wide photo-dialog"><img src="${esc(src)}" alt="${esc(t('Foto'))}" referrerpolicy="no-referrer"><div class="row"><span class="muted small">${esc(caption||'')}${credit?`<br>${esc(credit)}${page?` · <a href="${esc(page)}" target="_blank" rel="noopener">${t('Quelle')}</a>`:''}`:''}</span><span class="grow"></span>${button(t('Schließen'),'dialog-close',{},'primary')}</div></div>`;}
const api={render,pickupDialog,clearedDialog,problemDialog,noteDialog,unloadDialog,ticketDialog,mapDialog,originalDialog,photoDialog,heroCard,jobRow,loadCard};
(globalThis.TransportViews=globalThis.TransportViews||{}).driver=api;
if(typeof module!=='undefined')module.exports=api;
})();
