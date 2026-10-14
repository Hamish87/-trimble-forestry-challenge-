/* Kalender — resource/chain rows, day/week/month zoom, capacity-sized items, dimmed/purple/yellow states,
   Skicka till resurs, Visa detta datum, Komprimera, Avplanera, insert-between [MW][VS]. */
'use strict';
CFHViews.ZOOMS={day:{days:14},week:{days:42},month:{days:91}};
CFHViews.isoWeek=i=>{const d=new Date(CFHModel.CALENDAR_START+i*864e5),t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/864e5+1)/7);};
CFHViews.kalender=(vm,v,ui)=>{
  const{esc,num,sv,code,date}=ui,M=CFHModel,zoom=CFHViews.ZOOMS[v.zoom]?v.zoom:'day',days=CFHViews.ZOOMS[zoom].days,off=Math.max(0,v.calOffset|0),today=vm.calendar.currentDay;
  const X=p=>(p-off)/days*100,clip=(a,b)=>{const l=Math.max(0,X(a)),r=Math.min(100,X(b));return r>l?{l,w:r-l}:null;};
  const selected=vm.orders.find(o=>o.id===v.selected),checkedRows=v.rowChecked.filter(id=>vm.rows.some(r=>r.id===id));
  // Column header
  let head='';
  if(zoom==='day')for(let i=off;i<off+days;i++)head+=`<div class="cal-col ${i===today?'today':''} ${[5,6].includes(((i%7)+7)%7)?'weekend':''}" style="left:${X(i)}%;width:${100/days}%">${date(M.dayISO(i),{weekday:'short',day:'2-digit',month:'2-digit'})}${vm.calendar.shiftDays.includes(i)?`<small>${esc('Schicht')} ${num(i+1,0)}</small>`:''}</div>`;
  else if(zoom==='week'){for(let i=off-((off%7)+7)%7;i<off+days;i+=7){const c=clip(i,i+7);if(c)head+=`<div class="cal-col" style="left:${c.l}%;width:${c.w}%">${esc('KW')} ${num(CFHViews.isoWeek(i),0)}</div>`;}}
  else{let i=off;while(i<off+days){const d=new Date(M.CALENDAR_START+i*864e5),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1),j=Math.round((next-M.CALENDAR_START)/864e5),c=clip(i,j);if(c)head+=`<div class="cal-col" style="left:${c.l}%;width:${c.w}%">${date(M.dayISO(i),{month:'long',year:'numeric'})}</div>`;i=j;}}
  const toneOf=o=>o.info.tone;
  const row=r=>{
    let track='';
    if(zoom==='day')for(let i=off;i<off+days;i++)if(M.hoursOn(r,i)===0)track+=`<span class="cal-off" style="left:${X(i)}%;width:${100/days}%"></span>`;
    const t=clip(today,today+1);if(t)track+=`<span class="cal-today" style="left:${t.l}%;width:${t.w}%"></span>`;
    if(r.kind==='resource')for(const cr of vm.rows.filter(x=>x.kind==='chain'&&x.members.includes(r.id)))for(const it of cr.items){const c=it.startPos!=null&&clip(it.startPos,it.endPos);if(c)track+=`<span class="cal-ghost" style="left:${c.l}%;width:${c.w}%" title="${esc(it.order.name)} · ${esc(cr.id)}">${code(cr.id)}</span>`;}
    for(const rep of vm.calendar.reports.filter(x=>r.kind==='resource'&&x.machine===r.id)){const c=clip(rep.day,rep.day+1);if(c)track+=`<span class="cal-report" style="left:${c.l}%;width:${c.w}%" title="${esc('Gemeldete Produktion')}">${code(rep.type)} ${ui.fm(rep.volume)}</span>`;}
    r.items.forEach(it=>{
      if(it.startPos==null){track+=`<span class="cal-warn">${esc('Keine Kapazität im Wochenkalender')}</span>`;return;}
      const c=clip(it.startPos,it.endPos);if(!c)return;const o=vm.orders.find(x=>x.id===it.orderId),prog=ui.pct(o.followUp.felledByShifts,o.estimatedVolume);
      track+=`<button class="cal-item tone-${toneOf(o)} ${o.id===v.selected?'selected':''} ${it.outdated?'outdated':''}" data-action="open-order" data-order="${esc(o.id)}" data-tone="${toneOf(o)}" style="left:${c.l}%;width:${c.w}%" title="${esc(o.name)} · ${esc(o.info.label)}"><span class="cal-item-text">${esc(o.name)} · ${ui.fm(o.estimatedVolume)} · ${num(it.duration)} h</span>${it.outdated?`<span class="cal-flag">${esc('neue PIN-Version senden')}</span>`:''}<span class="cal-progress" style="width:${prog}%"></span></button>`;
    });
    if(v.insertMode&&selected&&!selected.closed){
      const pts=[r.items[0]?.startPos??M.positionOf(r,M.startHourOfDay(r,today)),...r.items.map(i=>i.endPos)];
      pts.forEach((p,i)=>{if(p==null)return;const x=X(p);if(x>=0&&x<=100)track+=`<button class="cal-insert" data-action="insert" data-row="${esc(r.id)}" data-index="${i}" style="left:${x}%" aria-label="${esc('Ausgewählten Auftrag hier einfügen')}: ${esc(r.id)} ${num(i+1,0)}">+</button>`;});
    }
    const sub=r.kind==='chain'?`${sv('Drivningskedja')} · ${esc(r.members.join(' + '))}`:`${esc(r.name)}`;
    return `<div class="cal-row ${checkedRows.includes(r.id)?'checked':''}" data-cal-row="${esc(r.id)}"><div class="cal-label"><label><input type="checkbox" data-change="row" value="${esc(r.id)}" ${checkedRows.includes(r.id)?'checked':''}> ${code(r.id)}</label><small>${sub} · ${num(r.rate,0)} fm/h</small></div><div class="cal-track" data-drop-row="${esc(r.id)}" data-off="${off}" data-days="${days}">${track}</div></div>`;
  };
  const canSend=vm.rows.filter(r=>checkedRows.includes(r.id)).some(r=>r.items.some(i=>!i.sent||i.outdated));
  const d=vm.dispatch,name=id=>esc(vm.orders.find(o=>o.id===id)?.name||id);
  const issueText={notSent:'geplant, aber nicht an die Ressource gesendet',outdated:'neue PIN-Version noch nicht gesendet',closed:'Hieb gesperrt'};
  return `<section class="cfh-view" data-view="calendar" aria-labelledby="calTitle">
  <div class="view-head"><h2 id="calTitle">${sv('Kalender')} <small>${esc('Ressourcenkalender')}</small></h2><button class="ghost" data-action="hide-view" data-view-key="calendar" title="${esc('Ansicht ausblenden')}">${sv('Göm')}</button></div>
  <div class="toolbar">
    <div class="segmented" role="group" aria-label="${esc('Zeitmaßstab')}">${[['day','Tag'],['week','Woche'],['month','Monat']].map(([k,l])=>`<button data-action="cal-zoom" data-zoom="${k}" aria-pressed="${zoom===k}">${esc(l)}</button>`).join('')}</div>
    <button data-action="cal-prev" aria-label="${esc('Zurück')}">‹</button><button data-action="cal-next" aria-label="${esc('Weiter')}">›</button>
    <button data-action="cal-today">${sv('Visa detta datum')}</button>
    <button class="primary" data-action="cal-send" ${canSend?'':'disabled'}>${sv('Skicka till resurs')}</button>
    <button data-action="compress-open" ${checkedRows.length?'':'disabled'}>${sv('Komprimera')}</button>
    <button data-action="unplan-open" data-scope="selected" ${selected?.assignment?'':'disabled'}>${sv('Avplanera')}</button>
    <button data-action="insert-mode" aria-pressed="${!!v.insertMode}" ${selected&&!selected.closed?'':'disabled'}>${esc('Zwischen Aufträgen einfügen')}</button>
  </div>
  <p class="dispatch-line"><b>${esc('Heute')} · ${esc('Schicht')} ${num(vm.meta.round,0)}:</b> ${code('H-01')} → ${d.harvester?name(d.harvester):esc('keine gesendete Planung')} · ${code('F-01')} → ${d.forwarder?name(d.forwarder):esc('keine gesendete Planung')}${d.issues.map(i=>` <span class="flag warn">${name(i.orderId)}: ${esc(issueText[i.code])}</span>`).join('')}</p>
  <div class="cal" data-zoom="${zoom}"><div class="cal-head"><div class="cal-label"><small>${esc('Ressource / Drivningskedja')}</small></div><div class="cal-cols">${head}</div></div>${vm.rows.map(row).join('')}</div>
  <div class="legend"><span><i class="tone-dimmed"></i>${esc('Geplant, nicht gesendet')}</span><span><i class="tone-purple"></i>${esc('An Ressource gesendet')}</span><span><i class="tone-yellow"></i>${esc('Begonnen')}</span><span><i class="tone-done"></i>${esc('Abgeschlossen')}</span><span><i class="ghost-key"></i>${esc('über Drivningskedja')}</span><span><i class="report-key"></i>${esc('Gemeldete Produktion (HPR/FPR)')}</span></div>
  <p class="note">${esc('Kapazität: geschätzte Menge ÷ Leistung der Ressource ÷ Wochenstunden. Spielschicht n entspricht Kalendertag n. Ohne Drag-and-drop: Auftrag wählen, dann Flytta till resurs oder Zwischen Aufträgen einfügen.')}</p>
  </section>`;
};
