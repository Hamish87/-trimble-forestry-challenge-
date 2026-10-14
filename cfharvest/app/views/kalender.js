/* Kalender — resource calendar / Gantt [M38][M52][M55][M56–M59][M64][M67][M71]: toolbar, zoom D/V/MÅN/3MÅN, period,
   month/week/day bands (today green, weekends shaded), purple bars "client - contract - order nr - name", chain bars solid
   on the chain row and greyed, hatched, non-interactive member bars on each member row (forwarder after the chain lag),
   orange selection outline, hover tooltip "560 fm · 20 h · 2,5 Tage", right-edge resize handle ("✎ manuell" badge when the
   working time is manual), red conflict outline + warning line for double bookings, Återställ (n) + Spara.
   Bars are drop targets and drag sources (app.js); button alternatives sit in the toolbar. */
'use strict';
CFHViews.ZOOMS={day:{days:7,de:'T',title:'Tag',sv:'D'},week:{days:21,de:'W',title:'Woche',sv:'V'},month:{days:31,de:'M',title:'Monat',sv:'MÅN'},quarter:{days:92,de:'3M',title:'3 Monate',sv:'3MÅN'}};
CFHViews.isoWeek=i=>{const d=new Date(CFHModel.CALENDAR_START+i*864e5),t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/864e5+1)/7);};
CFHViews.calWindow=v=>{const zoom=CFHViews.ZOOMS[v.zoom]?v.zoom:'week';return{zoom,days:CFHViews.ZOOMS[zoom].days,off:Math.max(0,v.calStart|0)};};
CFHViews.calRows=(vm,v)=>vm.rows.filter(r=>(!v.rowsShown||v.rowsShown.includes(r.id))&&(!v.plannedOnly||r.items.length||(r.ghosts||[]).length));
/** Dispatch issues once per order and issue (a chain reports the same order for its harvester and its forwarder). */
CFHViews.uniqueIssues=issues=>(issues||[]).filter((i,k,all)=>all.findIndex(x=>x.orderId===i.orderId&&x.code===i.code)===k);
CFHViews.barTone=(o,it)=>['harvesting','felled','forwarding'].includes(o.status)?'started':o.status==='completed'?'completed':it.sent&&!it.outdated?'sent':'planned';
/** Hover text [M71]: label, Maßnahme, "560 fm · 20 h · 2,5 Tage" (volume of the member that drives the duration, working
    hours, working days on this row), start - end, and the manual-working-time note. */
CFHViews.barTitle=(o,it,ui)=>[ui.orderLabelText(o),o.operationLabel,`${ui.fm(it.volume??o.estimatedVolume)} · ${ui.num(it.duration)} h · ${ui.num(it.workDays??0,2)} Tage`,`${ui.dateText(it.startTime?.iso)} ${it.startTime?.clock||''} - ${ui.dateText(it.endTime?.iso)} ${it.endTime?.clock||''}`,...(it.manualHours?['Manuelle Arbeitszeit']:[])].join('\n');
CFHViews.kalender=(vm,v,ui)=>{
  const{esc,num,term,tip,ibtn,code}=ui,M=CFHModel,{zoom,days,off}=CFHViews.calWindow(v),today=vm.calendar.currentDay;
  const X=p=>(p-off)/days*100,clip=(a,b)=>{const l=Math.max(0,X(a)),r=Math.min(100,X(b));return r>l?{l,w:r-l}:null;};
  const shown=CFHViews.calRows(vm,v),checkedRows=v.rowChecked.filter(id=>vm.rows.some(r=>r.id===id)),selItem=vm.rows.flatMap(r=>r.items).find(i=>i.id===v.selItem);
  const dayW=100/days,isWeekend=i=>[5,6].includes(((i%7)+7)%7),flash=v.flash?.ids||[];
  // Header bands: month/year, ISO week, day numbers [M38][M59]
  let months='',weeks='',dayCells='';
  {let i=off;while(i<off+days){const d=new Date(M.CALENDAR_START+i*864e5),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1),j=Math.round((next-M.CALENDAR_START)/864e5),c=clip(i,j);if(c)months+=`<span class="band-cell" style="left:${c.l}%;width:${c.w}%" data-no-translate>${d.getUTCMonth()+1}/${d.getUTCFullYear()}</span>`;i=j;}}
  for(let i=M.mondayOf(off);i<off+days;i+=7){const c=clip(i,i+7);if(c)weeks+=`<span class="band-cell" style="left:${c.l}%;width:${c.w}%" title="${esc('Kalenderwoche')}">${num(CFHViews.isoWeek(i),0)}</span>`;}
  for(let i=off;i<off+days;i++){const d=new Date(M.CALENDAR_START+i*864e5);dayCells+=`<span class="band-cell day ${i===today?'today':''} ${isWeekend(i)?'weekend':''}" style="left:${X(i)}%;width:${dayW}%" ${i===today?`title="${esc('Heute')}"`:''}>${days<=31?`<span data-no-translate>${d.getUTCDate()}</span>`:''}</span>`;}
  const row=r=>{
    let bg='';const ms=r.memberResources?.length?r.memberResources:[r];
    for(let i=off;i<off+days;i++){const h=M.hoursOn(r,i);if(h===0)bg+=`<span class="cal-off" style="left:${X(i)}%;width:${dayW}%"></span>`;
      // Veckokalender override (yellow in Administration [M30]) on this row or a member: marked so the changed capacity is visible here too.
      if(ms.some(m=>m.days&&m.days[i]!=null))bg+=`<span class="cal-ov" data-ov-day="${i}" style="left:${X(i)}%;width:${dayW}%" title="${esc('Wochenkalender: manuell geändert')} · ${num(h)} h"><span class="cal-ov-h" data-no-translate>${num(h)} h</span></span>`;}
    const t=clip(today,today+1);if(t)bg+=`<span class="cal-today" style="left:${t.l}%;width:${t.w}%"></span>`;
    let bars='';
    // Member bars of chain planning: greyed and hatched, no drag, resize or selection; hover says which chain planned them.
    for(const g of r.ghosts||[]){const c=g.startPos!=null&&clip(g.startPos,Math.max(g.endPos,g.startPos+.02));if(!c)continue;const o=vm.orders.find(x=>x.id===g.orderId);
      bars+=`<span class="cal-item ghost ${g.conflict?'conflict':''} ${flash.includes(g.itemId)?'reflow':''}" data-ghost-of="${esc(g.itemId)}" data-chain="${esc(g.chainId)}" data-order="${esc(o.id)}" aria-disabled="true" style="left:${c.l}%;width:${c.w}%;top:${6+g.lane*30}px" title="${esc('geplant über Erntekette')} ${esc(g.chainId)}\n${esc(CFHViews.barTitle(o,g,ui))}${g.lag?`\n${esc('Vorlauf Harvester → Forwarder')}: ${num(g.lag,0)} ${esc(g.lag===1?'Tag':'Tage')}`:''}"><span class="cal-item-text">${ui.orderLabel(o)}</span></span>`;}
    for(const it of r.items){
      if(it.startPos==null){bars+=`<span class="cal-warn">${esc('Keine Kapazität im Wochenkalender')}</span>`;continue;}
      const c=clip(it.startPos,Math.max(it.endPos,it.startPos+.02));if(!c)continue;const o=vm.orders.find(x=>x.id===it.orderId),tone=CFHViews.barTone(o,it),prog=ui.pct(o.followUp.felledByShifts,o.estimatedVolume);
      const endVisible=X(it.endPos)<=100+1e-9; // the handle sits on the real end, not on a clipped window edge
      bars+=`<div role="button" tabindex="0" class="cal-item tone-${tone} ${it.id===v.selItem?'selected':''} ${it.staged?'unsaved':''} ${it.outdated?'outdated':''} ${r.kind==='chain'?'chain':''} ${it.conflict?'conflict':''} ${it.manualHours?'manual':''} ${flash.includes(it.id)?'reflow':''}" data-action="select-item" data-item="${esc(it.id)}" data-order="${esc(o.id)}" data-row="${esc(r.id)}" data-tone="${tone}" draggable="true" aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight" style="left:${c.l}%;width:${c.w}%;top:${6+it.lane*30}px" title="${esc(CFHViews.barTitle(o,it,ui))}"><span class="cal-item-text">${ui.orderLabel(o)}</span>${it.manualHours?`<span class="cal-badge" data-manual-badge title="${esc('Manuelle Arbeitszeit')}: ${num(it.manualHours)} h">✎<span class="badge-word"> ${esc('manuell')}</span></span>`:''}${it.outdated?`<span class="cal-flag">${esc('neue PIN-Version senden')}</span>`:''}${prog>0?`<span class="cal-progress" style="width:${prog}%"></span>`:''}${endVisible?`<span class="cal-resize" data-resize="${esc(it.id)}" title="${esc('Rechten Rand ziehen: Dauer in ganzen Tagen ändern')}"></span>`:''}</div>`;
    }
    for(const rep of vm.calendar.reports.filter(x=>r.kind==='resource'&&x.machine===r.id)){const c=clip(rep.day,rep.day+1);if(c)bars+=`<span class="cal-report" style="left:${c.l}%;width:${c.w}%" title="${esc('Gemeldete Produktion')}">${code(rep.type)} ${ui.fm(rep.volume)}</span>`;}
    const insertFor=v.insertMode&&(selItem||vm.orders.find(o=>o.id===v.selected&&!o.closed));
    if(insertFor){const own=r.items.filter(i=>i.id!==v.selItem),pts=[own[0]?.startPos??M.positionOf(r,M.startHourOfDay(r,today)),...own.map(i=>i.endPos)];
      pts.forEach((p,i)=>{if(p==null)return;const x=X(p);if(x>=0&&x<=100)bars+=`<button type="button" class="cal-insert" data-action="insert" data-row="${esc(r.id)}" data-index="${i}" style="left:${x}%" aria-label="${esc('Hier einfügen')}: ${esc(r.name)} ${num(i+1,0)}" title="${esc('Hier einfügen')}">+</button>`;});}
    const reports=r.kind==='resource'&&vm.calendar.reports.some(x=>x.machine===r.id);
    const sub=r.kind==='chain'?`${term('Erntekette','Drivningskedja',{tip:true})} · ${esc(r.members.join(' + '))}`:`${esc(r.type==='harvester'?'Harvester':r.type==='forwarder'?'Forwarder':'Ressource')}`;
    return `<div class="cal-row ${checkedRows.includes(r.id)?'checked':''} ${r.overlap?'overlap':''}" data-cal-row="${esc(r.id)}"><div class="cal-label"><label><input type="checkbox" data-change="row" value="${esc(r.id)}" ${checkedRows.includes(r.id)?'checked':''} aria-label="${esc('Ressource auswählen')}: ${esc(r.name)}"> <span class="row-name">${ui.rowName(r)}</span></label><small>${sub}</small>${r.overlap?`<small class="warn-text">${esc('Überschneidung · wird beim Speichern verschoben')}</small>`:''}</div><div class="cal-track" data-drop-row="${esc(r.id)}" data-off="${off}" data-days="${days}" style="height:${12+r.lanes*30+(reports?18:0)}px">${bg}${bars}</div></div>`;
  };
  const d=vm.dispatch,name=id=>esc(vm.orders.find(o=>o.id===id)?.name||id),issueText={notSent:'geplant, aber nicht an die Ressource gesendet',outdated:'neue PIN-Version noch nicht gesendet',closed:'Hieb gesperrt'};
  const resSearch=String(v.resSearch||'').toLowerCase(),resList=vm.rows.filter(r=>!resSearch||(r.name+' '+r.id+' '+(r.stanford||'')).toLowerCase().includes(resSearch));
  const picker=`<details class="multi res-picker" ${v.resMenuOpen?'open':''}><summary data-action="res-menu">${term('Ressourcen','Resurser',{tip:true})} <small>${num(shown.length,0)}/${num(vm.rows.length,0)}</small></summary><div class="multi-list"><input type="search" data-input="res-search" value="${esc(v.resSearch||'')}" placeholder="${esc('Suchen')}" aria-label="${esc('Ressource suchen')}"><button type="button" class="small" data-action="res-all">✓ ${esc('Alle wählen')}</button>${resList.map(r=>`<label><input type="checkbox" data-change="res-shown" value="${esc(r.id)}" ${!v.rowsShown||v.rowsShown.includes(r.id)?'checked':''}> ${ui.rowName(r)}</label>`).join('')}</div></details>`;
  const staged=vm.staged;
  return `<section class="cfh-view" data-view="calendar" aria-labelledby="calTitle">
  <div class="view-head"><h2 id="calTitle">${term('Kalender','Kalender')}</h2><button class="ghost small" data-action="hide-view" data-view-key="calendar" title="${esc('Ansicht ausblenden')}" aria-label="${esc('Ansicht ausblenden')}">✕</button></div>
  <div class="toolbar cal-toolbar" role="toolbar" aria-label="${esc('Kalender')}">
    ${ibtn('send-open','✈','An Ressource senden','Skicka till resurs',{label:'Senden',cls:'green'})}${ibtn('cal-today','📅','Dieses Datum anzeigen','Visa detta datum')}${ibtn('refresh','⟳','Aktualisieren')}${ibtn('compress-open','≡','Komprimieren','Komprimera')}
    ${ibtn('','⬇','Export ist nicht Teil der Demo',null,{disabled:true})}${ibtn('res-menu','🔻','Ressourcen filtern',null,{attrs:`aria-expanded="${!!v.resMenuOpen}"`})}
    ${ibtn('insert-mode','↔','Zwischen Aufträgen einfügen',null,{attrs:`aria-pressed="${!!v.insertMode}"`,disabled:!(selItem||vm.orders.some(o=>o.id===v.selected&&!o.closed))})}
    ${ibtn('edit-item','✎','Auftrag im Kalender bearbeiten',null,{disabled:!selItem})}${ibtn('move-item','⇆','Auf andere Ressource verschieben oder kopieren','Flytta / Kopiera',{disabled:!selItem})}
    ${ibtn('item-earlier','◂','Früher einreihen',null,{disabled:!selItem})}${ibtn('item-later','▸','Später einreihen',null,{disabled:!selItem})}${ibtn('unplan-open','⛓','Ausplanen','Avplanera',{attrs:'data-scope="item"',disabled:!selItem})}
    ${ibtn('','📊','Im Produkt nicht beobachtet',null,{disabled:true})}${ibtn('','🌲','Im Produkt nicht beobachtet',null,{disabled:true})}
    <span class="segmented" role="group" aria-label="${esc('Zeitmaßstab')}">${Object.entries(CFHViews.ZOOMS).map(([k,z])=>`<button type="button" data-action="cal-zoom" data-zoom="${k}" aria-pressed="${zoom===k}" title="${tip(z.title,z.sv)}">${esc(z.de)}</button>`).join('')}</span>
    <span class="period" data-period>${esc('Zeitraum')}: ${ui.date(M.dayISO(off))}, ${num(days,0)} ${esc('Tage')}</span>
    <span class="nav-group">${ibtn('cal-prev-big','◀◀','Weit zurück')}${ibtn('cal-prev','◀','Zurück')}${ibtn('cal-next','▶','Weiter')}${ibtn('cal-next-big','▶▶','Weit vor')}</span>
    <span class="toolbar-right"><button type="button" data-action="planned-only" aria-pressed="${!!v.plannedOnly}" title="${tip('Nur Ressourcen mit geplanten Aufträgen','Planerad')}">${esc('Geplant')}</button>
    <button type="button" data-action="stage-reset" ${staged?'':'disabled'} title="${tip('Ungespeicherte Änderungen verwerfen','Återställ')}">↶ ${esc('Zurücksetzen')} (<span data-staged-count>${num(staged,0)}</span>)</button>
    <button type="button" class="green" data-action="stage-save" ${staged?'':'disabled'} title="${tip('Änderungen speichern','Spara')}">💾 ${esc('Speichern')}</button></span>
  </div>
  <p class="dispatch-line"><b>${esc('Heute')} · ${esc('Schicht')} ${num(vm.meta.round,0)}:</b> ${code('H-01')} → ${d.harvester?name(d.harvester):esc('keine gesendete Planung')} · ${code('F-01')} → ${d.forwarder?name(d.forwarder):esc('keine gesendete Planung')}${CFHViews.uniqueIssues(d.issues).map(i=>` <span class="flag warn">${name(i.orderId)}: ${esc(issueText[i.code])}</span>`).join('')}</p>
  <div class="cal-scroll"><div class="cal" data-zoom="${zoom}" style="--days:${days}"><div class="cal-head"><div class="cal-label head">${picker}</div><div class="cal-bands"><div class="band months">${months}</div><div class="band weeks">${weeks}</div><div class="band days">${dayCells}</div></div></div>${shown.map(row).join('')||`<p class="note pad">${esc('Keine Ressource ausgewählt.')}</p>`}</div></div>
  ${(vm.conflicts||[]).length?`<div class="conflicts" role="status" data-conflicts>${vm.conflicts.map(c=>`<p class="conflict-line" data-conflict="${esc(c.resourceId)}:${esc(c.iso||'')}"><span aria-hidden="true">⚠ </span><b>${esc('Konflikt')}:</b> ${code(c.resourceId)} ${esc('ist am')} <span class="date" data-no-translate>${esc(ui.dateText(c.iso,{day:'2-digit',month:'2-digit'}))}</span> ${esc('doppelt verplant')}</p>`).join('')}<p class="note">${esc('Nur eine Warnung: die Planung bleibt möglich.')}</p></div>`:''}
  <div class="legend"><span><i class="lg-planned"></i>${esc('Geplant, nicht gesendet')}</span><span><i class="lg-sent"></i>${esc('An Ressource gesendet')}</span><span><i class="lg-started"></i>${esc('Begonnen')}</span><span><i class="lg-completed"></i>${esc('Abgeschlossen')}</span><span><i class="lg-ghost"></i>${esc('geplant über Erntekette')}</span><span><i class="lg-conflict"></i>${esc('Konflikt')}</span><span><i class="lg-unsaved"></i>${esc('Nicht gespeichert')}</span><span><b class="lg-manual">✎</b> ${esc('Manuelle Arbeitszeit')}</span><span><i class="lg-report"></i>${esc('Gemeldete Produktion (HPR/FPR)')}</span><span><i class="lg-override"></i>${esc('Wochenkalender: manuell geändert')}</span></div>
  <p class="note">${esc('Dauer = Arbeitsmenge ÷ Leistung je Maßnahme, verteilt auf die Tagesstunden des Wochenkalenders (Start 09:00, Tage ohne Stunden werden übersprungen). Spielschicht n = Kalendertag n. Aufträge aus der Liste oder Balken auf eine Ressource ziehen; Doppelklick auf einen Balken öffnet die Bearbeitung.')}</p>
  <p class="note">${esc('Rechten Balkenrand ziehen (oder Umschalt + Pfeiltaste): Dauer in ganzen Tagen ändern, das setzt die manuelle Arbeitszeit. Ernteketten: der Forwarder beginnt nach dem Vorlauf; graue Balken der Mitglieder sind nicht bearbeitbar.')}</p>
  </section>`;
};
