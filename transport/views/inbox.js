/* Holztransport demo · Posteingang & Prüfung (SPEC §7.2, §5.4): document list with intake status and exception
   counts; review workspace with the page facsimile beside the proposed fields, per-line location decisions,
   exceptions, version diff for amendments, release / duplicate / manual actions. */
'use strict';
(function(){
const S=globalThis.TransportViews.shared;const {esc,t,fmt,pill,statusPill,statusLabel,button,select,kv,table,empty,facsimile,exceptions,fieldCell,confBadge}=S;
function docCounts(d){const ex=d.extraction.exceptions;return {block:ex.filter(e=>e.severity==='block').length,warn:ex.filter(e=>e.severity==='warn').length,info:ex.filter(e=>e.severity==='info').length};}
function listItem(ctx,d,active){
  const c=docCounts(d);const cls=[...new Set(d.pages.map(p=>p.cls))];
  return `<li class="doc${active?' active':''}" data-action="inbox-open" data-doc="${esc(d.id)}" role="button" tabindex="0">
    <div class="doc-top"><strong>${esc(d.senderName||d.sender)}</strong>${statusPill('intake',d.status)}</div>
    <div class="doc-subject">${esc(d.subject)}</div>
    <div class="doc-meta muted">${fmt.dt(d.receivedAt)} · ${d.pages.length} ${t('Seiten')} · ${esc(d.attachments.map(a=>a.name).join(', '))}</div>
    <div class="doc-chips">${d.original?pill('blue','📎 '+(/pdf/i.test(d.original.type||'')?'PDF':t('Bild')),'small'):''}${cls.map(k=>statusPill('cls',k,'small')).join(' ')}${d.duplicateOf?pill('grey',t('Wiederholung von')+' '+d.duplicateOf,'small'):''}${d.amendmentOf?pill('amber',t('Änderung zu')+' '+d.amendmentOf,'small'):''}</div>
    <div class="doc-exc">${c.block?`<span class="cnt cnt-red" title="${t('blockiert')}">${c.block}</span>`:''}${c.warn?`<span class="cnt cnt-amber" title="${t('prüfen')}">${c.warn}</span>`:''}${c.info?`<span class="cnt cnt-grey" title="${t('Hinweis')}">${c.info}</span>`:''}${d.orderIds.length?`<span class="muted">→ ${d.orderIds.map(esc).join(', ')}</span>`:''}${d.receiptIds.length?`<span class="muted">→ ${d.receiptIds.map(esc).join(', ')}</span>`:''}</div>
  </li>`;
}
function render(ctx){
  const {state,route}=ctx;const docs=Object.values(state.documents).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
  const filter=ctx.ui.inboxFilter||'all';const shown=docs.filter(d=>filter==='all'||(filter==='tickets'?d.receiptIds.length>0:d.status===filter));
  const allDelivered=['DOC-MENGEN-1','DOC-PELLET-1','DOC-HTL-1','DOC-BAYSF-1','DOC-TTW-1'].every(id=>state.documents[id]);
  const active=route.parts[1]?state.documents[route.parts[1]]:null;
  const counts={NeedsReview:docs.filter(d=>d.status==='NeedsReview').length,Ready:docs.filter(d=>d.status==='Ready').length,Duplicate:docs.filter(d=>d.status==='Duplicate').length,Failed:docs.filter(d=>d.status==='Failed').length};
  return `<section class="inbox">
    <aside class="inbox-list">
      <div class="toolbar">
        ${button(t('Demo-E-Mails zustellen'),'deliver-demo',{},'primary',allDelivered?'disabled':'')}
        <details class="menu"><summary>${t('Szenario')}</summary><div>${button(t('Erneut gesendeter Auftrag'),'deliver-scenario',{scenario:'resend'},'',state.documents['DOC-TTW-RESEND']||!state.documents['DOC-TTW-1']?'disabled':'')}${button(t('Geänderte Fassung'),'deliver-scenario',{scenario:'amendment'},'',state.documents['DOC-TTW-AMEND']||!state.documents['DOC-TTW-1']?'disabled':'')}${button(t('Werksscheine der Werke'),'deliver-tickets',{},'',state.documents['DOC-WE-POLSINGEN-1']?'disabled':'')}</div></details>
        ${button(t('PDF/Text importieren'),'import-open',{},'')}
      </div>
      <div class="filters"><label>${t('Status')} ${select('inboxFilter',[['all',t('Alle')+` (${docs.length})`],['NeedsReview',t('Prüfung nötig')+` (${counts.NeedsReview})`],['Ready',t('Freigegeben')+` (${counts.Ready})`],['Duplicate',t('Duplikat')+` (${counts.Duplicate})`],['Failed',t('Fehlgeschlagen')+` (${counts.Failed})`],['tickets',t('Werksbelege')]],filter,'data-action="inbox-filter"')}</label>
        <span class="muted">${t('Posteingang')}: <code>${esc(state.parties.find(p=>p.id===state.carrierId).inbox)}</code></span></div>
      <ul class="docs">${shown.length?shown.map(d=>listItem(ctx,d,active&&active.id===d.id)).join(''):`<li class="muted pad">${esc(docs.length?t('Keine Dokumente in diesem Filter'):t('Noch keine E-Mails. „Demo-E-Mails zustellen“ liefert die fünf Beispielaufträge.'))}</li>`}</ul>
    </aside>
    <div class="inbox-review">${active?review(ctx,active):empty(t('Dokument links auswählen. Die Prüfung zeigt die Originalseite neben den vorgeschlagenen Feldern; nur Ausnahmen brauchen Aufmerksamkeit.'))}</div>
  </section>`;
}
function review(ctx,d){
  const {state}=ctx;const draft=ctx.draft(d.id);const ex=d.extraction;const prop=ex.orders[0];const pages=d.attachments.flatMap(a=>a.pages);const pageNo=draft.page||pages[0].n;const page=pages.find(p=>p.n===pageNo)||pages[0];
  const prof=state.profiles.find(p=>p.id===d.profileId);const readOnly=d.status!=='NeedsReview';
  const pageMeta=d.pages.find(p=>p.n===page.n)||{};
  const header=`<header class="rv-head">
    <div><h2>${esc(d.subject)}</h2><div class="muted">${esc(d.senderName||'')} &lt;${esc(d.sender)}&gt; · ${fmt.dt(d.receivedAt)} · ${t('Kunde')}: <strong>${esc(prof?prof.name:'–')}</strong> · ${t('Hash')} <code>${esc(d.contentHash)}</code></div></div>
    <div class="rv-status">${statusPill('intake',d.status)}${d.reviewedBy?`<span class="muted">${t('geprüft von')} ${esc(S.userName(state,d.reviewedBy))} · ${fmt.dt(d.reviewedAt)}</span>`:''}</div>
  </header>
  ${ex.exceptions.some(e=>e.code==='E-NEWCUST')&&!readOnly?`<div class="banner banner-info">${esc(t('Erstes Dokument dieses Kunden: Vollprüfung aller Felder. Korrekturen werden im Kundenprofil gelernt.'))}</div>`:''}
  ${d.duplicateOf?`<div class="banner banner-grey">${esc(t('Exakte Wiederholung von'))} <a href="#/inbox/${esc(d.duplicateOf)}">${esc(d.duplicateOf)}</a> — ${esc(t('keine neue Arbeit angelegt. Das Original bleibt maßgeblich.'))}</div>`:''}
  ${d.amendmentOf?`<div class="banner banner-amber">${esc(t('Geänderte Fassung von'))} <a href="#/inbox/${esc(d.amendmentOf)}">${esc(d.amendmentOf)}</a>${state.documents[d.amendmentOf]&&state.documents[d.amendmentOf].orderIds[0]?` → ${esc(state.documents[d.amendmentOf].orderIds[0])}`:''}. ${esc(t('Freigeben übernimmt die Änderungen als neue Version; erfasste Abholungen und Räumungen bleiben erhalten.'))}</div>`:''}`;
  const tabs=`<nav class="rv-pages">${pages.map(p=>{const m=d.pages.find(x=>x.n===p.n)||{};return button(`${t('Seite')} ${p.n} <small>${esc(statusLabel('cls',m.cls))}</small>`,'review-page',{doc:d.id,page:p.n},p.n===page.n?'tab active':'tab');}).join('')}</nav>`;
  const hasOrig=!!d.original;const showOrig=hasOrig&&!!ctx.ui.reviewOriginal;
  const origBar=`<div class="row rv-origbar">${hasOrig?button(t('Nachbildung'),'review-original',{on:'0'},showOrig?'tab':'tab active')+button(`📄 ${t('Original (PDF)')}`,'review-original',{on:'1'},showOrig?'tab active':'tab')+`<span class="muted small">${esc(d.original.name||'')}${d.original.size?` · ${Math.round(d.original.size/1024)} KB`:''}${d.original.pages?` · ${d.original.pages} ${t('Seiten')}`:''}</span>`:`<label class="btn small attach">📎 ${t('Original hinterlegen')}<input type="file" accept="application/pdf,image/*" data-action="original-attach" data-doc="${esc(d.id)}" hidden></label><span class="muted small">${esc(t('Die Datei bleibt im Browser (IndexedDB); nichts wird hochgeladen oder eingecheckt.'))}</span>`}</div>`;
  const body=showOrig?`<div class="orig-view" data-doc="${esc(d.id)}" data-page="${page.n}"><canvas id="originalCanvas" width="10" height="10" aria-label="${esc(t('Original'))} ${esc(t('Seite'))} ${page.n}"></canvas><div class="orig-fallback muted small">${esc(t('Original wird gerendert …'))}</div></div>`:facsimile(page,{highlightLine:draft.highlight&&draft.highlight.page===page.n?draft.highlight.line:undefined,lineAction:'review-highlight'});
  const left=`<div class="rv-left">${tabs}<div class="rv-pagemeta muted">${esc(t('Klassifizierung'))}: ${statusPill('cls',pageMeta.cls)} ${confBadge(pageMeta.confidence)} ${pageMeta.signals&&pageMeta.signals.length?'· '+esc(pageMeta.signals.join(', ')):''}</div>${origBar}${body}</div>`;
  let right='';
  if(prop)right=proposal(ctx,d,prop,draft,readOnly);
  else if(ex.tickets.length)right=ticketPanel(ctx,d);
  else right=`<div class="rv-right">${exceptions(ex.exceptions)}<p class="muted">${esc(t('Kein Auftrag und kein Werksbeleg in diesem Dokument.'))}</p></div>`;
  return `<article class="review" data-doc="${esc(d.id)}">${header}<div class="rv-body">${left}${right}</div></article>`;
}
function proposal(ctx,d,prop,draft,readOnly){
  const {state}=ctx;const f=k=>prop[k];const fields=draft.fields||{};
  const val=(k,fallback)=>fields[k]!==undefined?fields[k]:(fallback==null?'':fallback);
  const dests=state.parties.filter(p=>(p.roles||[]).some(r=>['mill','receivingSite'].includes(r)));
  const destGuess=draft.destinationId||(prop.destination&&prop.destination.value?(state.parties.find(p=>prop.destination.value.includes(p.name)||p.name.includes(prop.destination.value))||{}).id:'')||'';
  const dis=readOnly?'disabled':'';
  const headerKv=kv([
    [t('Belegart'),fieldCell(f('documentType'))],
    [t('Auftragsnummer'),`${fieldCell(f('documentNumber'))}${f('documentNumber')?'':` <span class="pill pill-amber small">${esc(t('interne Referenz wird vergeben'))}</span>`}`],
    [t('Auftraggeber'),`${fieldCell(f('issuer'))}<input class="edit" data-action="review-field" data-field="issuer" value="${esc(val('issuer',f('issuer')&&f('issuer').value))}" ${dis} aria-label="${t('Auftraggeber')}">`],
    [t('Frachtführer'),fieldCell(f('carrier'))],
    [t('Zielwerk / Empfänger'),`${fieldCell(f('destination'))}<div class="row">${select('destinationId',[['',t('– Ziel bestätigen –')],...dests.map(p=>[p.id,p.name])],destGuess,`data-action="review-destination" ${dis}`)}</div>`],
    prop.kind==='industrial'?[t('Abholadresse (Werk)'),fieldCell(f('pickupAddress'))]:null,
    [t('Abfuhrzeitraum'),`<span class="fld" ${prop.window.page!=null?`data-action="review-highlight" data-page="${prop.window.page}" data-line-no="${prop.window.line}"`:''}>${prop.window.raw?esc(prop.window.raw):`<span class="muted">${esc(t('nicht gedruckt'))}</span>`}</span><div class="row"><input type="date" data-action="review-field" data-field="windowFrom" value="${esc(val('windowFrom',prop.window.from))}" ${dis} aria-label="${t('von')}"> – <input type="date" data-action="review-field" data-field="windowTo" value="${esc(val('windowTo',prop.window.to))}" ${dis} aria-label="${t('bis')}"></div>`],
    [t('Referenzen'),[prop.references.partieNo&&prop.references.partieNo.value?`Partie ${fieldCell(prop.references.partieNo)}`:null,prop.references.kaufNo&&prop.references.kaufNo.value?`Kauf ${fieldCell(prop.references.kaufNo)}`:null,prop.references.polterNo&&prop.references.polterNo.value?`Polter-Nr ${fieldCell(prop.references.polterNo)}`:null,...prop.references.other.map(o=>`${esc(o.label)} ${fieldCell(o)}`)].filter(Boolean).join('<br>')||null],
    [t('Abrechnungsmaß'),fieldCell(f('measurementBasis'))],
    [t('Sorte / Material (Kopf)'),fieldCell(f('assortmentHeader'))],
    [t('Zertifizierung'),fieldCell(f('certification'))],
    [t('Priorität'),fieldCell(f('priority'))],
    [`🔒 ${t('Kommerziell (nur Disposition)')}`,`${prop.restricted.freightRate?`${t('Frachtsatz')}: ${fieldCell(prop.restricted.freightRate)}`:''} ${prop.restricted.paymentTerms?`· ${t('Zahlungsziel')}: ${fieldCell(prop.restricted.paymentTerms)}`:''}`||null],
    [t('Kontakte'),prop.contacts.length?prop.contacts.map(c=>`<span class="muted">${esc(c.label)}:</span> ${fieldCell(c)}`).join('<br>'):null],
    [t('Bemerkungen'),prop.remarks.filter(r=>r.value).length?prop.remarks.filter(r=>r.value).map(r=>`<span class="muted">${esc(r.label)}:</span> ${fieldCell(r)}`).join('<br>'):null]
  ]);
  const instr=prop.instructions.length?`<details class="rv-instr"><summary>${t('Anweisungen')} (${prop.instructions.length})${prop.instructions.some(i=>i.restricted)?` · 🔒 ${prop.instructions.filter(i=>i.restricted).length} ${t('kommerziell')}`:''}</summary><ul>${prop.instructions.map(i=>`<li class="${i.restricted?'restricted':''}" data-action="review-highlight" data-page="${i.page}" data-line-no="${i.line}">${i.restricted?'🔒 ':''}${esc(i.value)}</li>`).join('')}</ul></details>`:'';
  const rows=prop.stacks.map(s=>stackRow(ctx,d,s,draft,readOnly));
  const summaries=summaryBlock(prop);
  const diff=d.amendmentOf&&state.documents[d.amendmentOf]&&state.documents[d.amendmentOf].orderIds[0]?amendmentDiff(ctx,d,prop):'';
  const blocked=prop.stacks.filter(s=>{const dec=(draft.lines||{})[s.tempKey]||{};return dec.accept!==false&&!dec.location&&!(s.kind==='industrial'&&s.coords.address);});
  const release=`<label class="chk small"><input type="checkbox" data-action="driver-original-toggle" data-doc="${esc(d.id)}" ${d.driverOriginal?'checked':''}> ${t('Original für Fahrer freigegeben')}${d.extraction.exceptions.some(e=>e.code==='E-RESTRICTED')?` <span class="muted">(${esc(t('enthält kommerzielle Angaben'))})</span>`:''}</label>`;
  const actions=readOnly?`<div class="rv-actions"><span class="muted">${esc(t('Dokument ist abgeschlossen.'))}</span> ${d.orderIds.length?`<a class="btn" href="#/dispatch?order=${esc(d.orderIds[0])}">${t('Zur Disposition')}</a> <a class="btn" href="#/reports/${esc(d.orderIds[0])}">${t('Bericht')}</a>`:''} ${button(t('Fahrerauszug'),'excerpt-open',{doc:d.id})} ${release}</div>`
    :`<div class="rv-actions"><label class="grow">${t('Prüfvermerk')} <input data-action="review-note" value="${esc(draft.note||'')}" placeholder="${esc(t('z. B. Zielwerk telefonisch bestätigt'))}"></label>
      ${button(t('Freigeben'),'review-release',{doc:d.id},'primary')} ${button(t('Als Duplikat ablegen'),'review-duplicate',{doc:d.id})} ${button(t('Fehlgeschlagen → manuell'),'review-fail',{doc:d.id})} ${button(t('Fahrerauszug'),'excerpt-open',{doc:d.id})} ${release}
      <div class="muted small">${blocked.length?esc(t('Freigabe möglich: Zeilen ohne bestätigten Standort bleiben in „Standort erforderlich“ und werden nicht veröffentlicht.'))+` (${blocked.length})`:esc(t('Alle Zeilen haben eine Standortentscheidung.'))}</div></div>`;
  return `<div class="rv-right">
    <h3>${t('Vorgeschlagener Auftrag')} <small class="muted">${esc(t('Wert · Konfidenz · Quelle; Klick markiert die Zeile auf der Seite'))}</small></h3>${headerKv}${instr}
    <h3>${t('Polterzeilen')} <small class="muted">(${prop.stacks.length})</small></h3>
    ${table([`${t('Referenz')}`,t('Holz'),t('Menge'),t('Stück'),t('Lage (gedruckt)'),t('Standortentscheidung')],rows,'stacks')}
    ${summaries}${diff}
    <h3>${t('Ausnahmen')}</h3>${exceptions(d.extraction.exceptions,{stackAction:'review-line-focus'})}
    ${actions}</div>`;
}
function stackRow(ctx,d,s,draft,readOnly){
  const dec=(draft.lines||{})[s.tempKey]||{};const p=s.coords.parsed;const dis=readOnly?'disabled':'';
  let locCell;
  if(s.kind==='industrial')locCell=`${esc(s.coords.address||'')} ${pill('blue',t('Werksadresse'),'small')}`;
  else if(!s.coords.xRaw&&!s.coords.yRaw)locCell=`<span class="muted">${esc(t('keine Koordinate gedruckt'))}</span>`;
  else locCell=`<span class="raw" data-action="review-highlight" data-page="${s.coords.page}" data-line-no="${s.coords.line}">${esc(s.coords.xRaw)} / ${esc(s.coords.yRaw)}</span><br>${p?p.verdicts.map(v=>`<span class="verdict v-${v.level}">${esc(v.message)}</span>`).join('<br>'):''}${p&&p.ok?`<br><span class="muted">${esc(p.format.toUpperCase())} ${esc(p.crs)} → ${fmt.num(p.lat,5)}, ${fmt.num(p.lon,5)}</span>`:''}`;
  let decision;
  if(dec.accept===false)decision=`${pill('grey',t('nicht übernommen'),'small')} ${button(t('zurück'),'review-line-reset',{doc:d.id,stack:s.tempKey},'link',dis)}`;
  else if(dec.location)decision=`${pill('green',t('Standort bestätigt'),'small')} <span class="muted">${esc(S.methodLabel(dec.location.method))}${dec.location.lat!=null?` · ${fmt.num(dec.location.lat,4)}, ${fmt.num(dec.location.lon,4)}`:''}</span> ${button(t('zurück'),'review-line-reset',{doc:d.id,stack:s.tempKey},'link',dis)}`;
  else if(s.kind==='industrial'&&s.coords.address)decision=`${pill('green',t('Werksadresse gilt als Abholort'),'small')}`;
  else decision=`${pill('red',t('Standort erforderlich'),'small')}<div class="row wrap">${p&&p.ok?button(t('Gedruckte Koordinate bestätigen'),'review-line-accept',{doc:d.id,stack:s.tempKey,method:'printed'},'small',dis):''}${p&&p.suggestion?button(t('Lesart übernehmen')+' ('+esc(p.suggestion.note.split(':')[1]?p.suggestion.note.split(':')[1].split('ergibt')[0].trim():t('Vorschlag'))+')','review-line-accept',{doc:d.id,stack:s.tempKey,method:'suggestion'},'small',dis):''}${button(t('Auf Karte platzieren'),'review-line-place',{doc:d.id,stack:s.tempKey},'small',dis)}${button(t('Zeile nicht übernehmen'),'review-line-skip',{doc:d.id,stack:s.tempKey},'small link',dis)}</div>`;
  const bd=s.breakdown.length?`<details class="bd"><summary>${s.breakdown.length} ${t('Aufgliederungszeilen (informativ, keine Polter)')}</summary><ul>${s.breakdown.map(b=>`<li data-action="review-highlight" data-page="${b.page}" data-line-no="${b.line}">${esc(b.code||b.ref||'')} ${b.share?esc(b.share)+' ':''}${fmt.qty(b.qty.value,b.qty.unit)}</li>`).join('')}</ul></details>`:'';
  return `<tr data-stack="${esc(s.tempKey)}" class="${dec.accept===false?'skipped':''}"><td><strong data-action="review-highlight" data-page="${s.page}" data-line-no="${s.line}">${S.stackRef({kind:s.kind,refs:s.refs,tempKey:s.tempKey})}</strong>${s.refs.fowj?`<br><span class="muted">Fowj ${esc(s.refs.fowj)}</span>`:''}${bd}</td>
    <td>${S.timber({timber:{species:s.timber.species.value,assortment:s.timber.assortment.value,lengthM:s.timber.lengthM.value,grade:s.timber.grade.value}})}</td>
    <td class="num">${s.planned.value!=null?`<span title="${esc(s.planned.raw)}">${fmt.qty(s.planned.value,s.planned.unit)}</span>${s.planned.unit?'':` ${pill('amber',t('Einheit fehlt'),'small')}`}${s.planned.derivedFromTotal?` <span class="muted small">${esc(t('aus Gesamtmenge'))}</span>`:''}`:`<span class="muted">–</span>`} ${confBadge(s.planned.confidence)}</td>
    <td class="num">${s.pieces.value==null?'<span class="muted">–</span>':s.pieces.value===0?`<span title="${esc(t('laut Dokument; keine bestätigte Null'))}">0*</span>`:s.pieces.value}</td>
    <td>${locCell}</td><td>${decision}</td></tr>`;
}
function summaryBlock(prop){
  const tot=prop.summaries.totals,lots=prop.summaries.lots,codes=prop.summaries.codes;if(!tot.length&&!lots.length&&!codes.length)return '';
  return `<details class="rv-sum"><summary>${t('Gedruckte Summen und Zusammenfassungen')} <small class="muted">${esc(t('werden geprüft, nie überschrieben'))}</small></summary>
    ${tot.length?`<div><strong>${t('Summen')}:</strong> ${tot.map(x=>`<span data-action="review-highlight" data-page="${x.page}" data-line-no="${x.line}" class="fld">${esc(x.label)} ${fmt.qty(x.qty.value,x.qty.unit)}${x.pieces!=null?` · ${x.pieces} ${t('Stück')}`:''}</span>`).join(' · ')}</div>`:''}
    ${lots.length?`<div><strong>${t('Lossummen')}:</strong> ${lots.map(x=>`<span data-action="review-highlight" data-page="${x.page}" data-line-no="${x.line}" class="fld">${x.ref?`${esc(x.ref.hieb||'')}/${esc(x.ref.los||'')}`:esc(x.label||'')} ${fmt.qty(x.qty.value,x.qty.unit)}${x.pieces!=null?` · ${x.pieces}`:''}${x.pct?` ${esc(x.pct)}`:''}</span>`).join(' · ')}</div>`:''}
    ${codes.length?`<div><strong>${t('Sortenzusammenfassung')}:</strong> ${codes.map(x=>`${esc(x.code)} ${fmt.qty(x.qty.value,x.qty.unit)}`).join(' · ')}</div>`:''}</details>`;
}
function amendmentDiff(ctx,d,prop){
  const {state}=ctx;const M=globalThis.TransportCore.model;const order=state.orders[state.documents[d.amendmentOf].orderIds[0]];if(!order)return '';
  const diff=M.diffOrders(state,order,prop);
  return `<div class="diff"><h3>${t('Versionsvergleich')} <small class="muted">${esc(order.id)} · ${t('Version')} ${order.versions.length} → ${order.versions.length+1}</small></h3>
    ${diff.header.length?`<ul>${diff.header.map(h=>`<li><strong>${esc(h.field)}</strong>: <del>${esc(h.before||'–')}</del> → <ins>${esc(h.after||'–')}</ins></li>`).join('')}</ul>`:''}
    <ul>${diff.added.map(s=>`<li class="d-add">+ ${esc(t('neu'))}: ${S.stackRef({kind:s.kind,refs:s.refs,tempKey:s.tempKey})} ${fmt.qty(s.planned.value,s.planned.unit)}</li>`).join('')}
    ${diff.changed.map(c=>`<li class="d-chg">~ ${esc(c.tempKey)}: ${c.changes.map(x=>`${esc(x.field)} <del>${esc(x.before)}</del> → <ins>${esc(x.after)}</ins>`).join(', ')}</li>`).join('')}
    ${diff.removed.map(s=>`<li class="d-del">− ${esc(s.tempKey)} ${esc(t('entfällt'))}${state.events.some(e=>e.stackKey===s.key&&['pickup','cleared'].includes(e.kind))?` <strong>${esc(t('hat Feldarbeit → Konflikt zur Entscheidung'))}</strong>`:''}</li>`).join('')}</ul>
    ${!diff.header.length&&!diff.added.length&&!diff.changed.length&&!diff.removed.length?`<p class="muted">${esc(t('Keine inhaltlichen Unterschiede erkannt.'))}</p>`:''}
    <p class="muted small">${esc(t('Erfasste Abholungen, Räumungen und Zuteilungen bleiben erhalten; das Ziel eines Fahrers wird nicht stillschweigend geändert.'))}</p></div>`;
}
function ticketPanel(ctx,d){
  const {state}=ctx;const tk=d.extraction.tickets[0];const rec=d.receiptIds.map(id=>state.receipts[id]);
  return `<div class="rv-right"><h3>${t('Werksbeleg')}</h3>${kv([[t('Belegnummer'),esc(tk.ticketNo||'–')],[t('Werk'),esc(tk.millName||'–')],[t('Lieferschein-Nr.'),tk.deliveryNoteRef?esc(tk.deliveryNoteRef):`<span class="muted">${esc(t('nicht angegeben'))}</span>`],[t('Kennzeichen'),esc(tk.vehicleReg||'–')],[t('Ankunft / Entladung'),`${fmt.dt(tk.arrivedAt)} / ${fmt.dt(tk.unloadedAt)}`],[t('Wiegung'),tk.weighbridge?Object.entries(tk.weighbridge).map(([k,q])=>`${esc(t({gross:'Brutto',tare:'Tara',net:'Netto'}[k]))} ${fmt.qty(q.value,q.unit)}`).join(' · '):null],[t('Werksmaß'),tk.measuredLines.length?tk.measuredLines.map(l=>`${esc(l.species||'')} ${esc(l.assortment||'')} ${l.lengthM!=null?fmt.num(l.lengthM)+' m':''} ${fmt.qty(l.qty.value,l.qty.unit)} (${esc(l.method||'')})`).join('<br>'):null],[t('Annahme'),esc(tk.acceptance)]])}
    <h3>${t('Zuordnung')}</h3>${rec.map(r=>`<p>${statusPill('match',r.matchState)} ${r.loadId?`→ ${esc(r.loadId)} <span class="muted">(${esc(t({ 'delivery-note':'über Lieferschein-Nr.','vehicle-window':'über Kennzeichen + Zeitfenster',manual:'manuell','driver-photo':'Fahrerfoto'}[r.matchMethod]||r.matchMethod||''))})</span>`:`<span class="muted">${esc(t('kein eindeutiger Treffer — Zuordnung in Belege & Abgleich'))}</span>`} <a class="btn small" href="#/receipts/tickets?receipt=${esc(r.id)}">${t('Öffnen')}</a></p>`).join('')}
    <h3>${t('Ausnahmen')}</h3>${exceptions(d.extraction.exceptions)}</div>`;
}
/* Import dialog (paste text lines; optional PDF when pdf.js is present). */
function importDialog(ctx){
  const pdf=!!globalThis.pdfjsLib;
  return `<form method="dialog" class="dlg" data-form="import"><h2>${t('Dokument importieren')}</h2>
    <p class="muted">${esc(t('Textzeilen einfügen (eine Zeile je Dokumentzeile, Zellen durch Tab oder drei Leerzeichen, Seiten durch eine Zeile „---“ trennen). Der Text wird nur als Daten behandelt.'))}${pdf?' '+esc(t('Oder eine PDF ablegen: die Textebene wird mit Positionen gelesen (kein OCR).')):' '+esc(t('PDF-Import ist nicht verfügbar (pdf.js nicht geladen).'))}</p>
    <label>${t('Absender (E-Mail)')} <input name="sender" value="" placeholder="disposition@kunde.demo" required></label>
    <label>${t('Betreff')} <input name="subject" value="" required></label>
    ${pdf?`<label>${t('PDF-Datei')} <input type="file" name="pdf" accept="application/pdf"></label>`:''}
    <label>${t('Text')} <textarea name="text" rows="12" placeholder="Fuhrauftrag Nr. 4711&#10;Auftraggeber:&#9;…"></textarea></label>
    <div class="dlg-actions">${button(t('Abbrechen'),'dialog-close',{},'')}<button type="submit" class="primary">${t('Importieren')}</button></div></form>`;
}
function excerptDialog(ctx,docId){
  const ex=ctx.store.excerpt(docId);if(!ex)return '';
  return `<div class="dlg wide"><h2>${t('Fahrerauszug')} <small class="muted">${esc(ex.subject)}</small></h2><p class="muted">${esc(ex.note)} · ${ex.redactedLines} ${t('Zeilen geschwärzt')}. ${esc(t('Hinweis: Felder auszublenden reicht nicht — der Auszug wird aus den Seitenzeilen neu erzeugt.'))}</p>
    <div class="excerpt">${ex.pages.map(p=>facsimile({n:p.n,kind:p.kind,lines:p.lines,title:p.title,pins:p.pins},{})).join('')}</div>
    <div class="dlg-actions">${button(t('Drucken'),'print',{},'')}${button(t('Schließen'),'dialog-close',{},'primary')}</div></div>`;
}
const api={render,review,importDialog,excerptDialog,docCounts};
(globalThis.TransportViews=globalThis.TransportViews||{}).inbox=api;
if(typeof module!=='undefined')module.exports=api;
})();
