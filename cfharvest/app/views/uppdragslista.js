/* Uppdragslista — assignment list [MW][V6]: columns, multi-client search, status, Flytta till resurs, Funktioner. */
'use strict';
CFHViews.columns=[
  {key:'name',label:'Name / Hieb'},{key:'client',label:'Auftraggeber'},{key:'status',label:'Status'},{key:'resource',label:'Ressource / Team'},
  {key:'operation',label:'Maßnahme'},{key:'volume',label:'Geschätzte Menge'},{key:'assortments',label:'Sortimente'},
  {key:'start',label:'Geplanter Start'},{key:'end',label:'Geplantes Ende'},{key:'readiness',label:'Offene Prüfungen'}];
CFHViews.filterOrders=(vm,v)=>{
  const q=String(v.search||'').trim().toLowerCase(),tr=s=>typeof I18n!=='undefined'?I18n.text(s).toLowerCase():String(s).toLowerCase();
  let list=vm.orders.filter(o=>(!v.clients||v.clients.includes(o.client))&&(!q||[o.id,o.name,tr(o.name),o.landing.id,o.row?.id||''].some(x=>String(x).toLowerCase().includes(q))));
  const key=v.sort?.key||'id',dir=v.sort?.dir||1,val={name:o=>o.name,client:o=>o.client,status:o=>CFHModel.STATUSES.indexOf(o.status),resource:o=>o.row?.id||'~',operation:o=>o.operation,volume:o=>o.estimatedVolume,assortments:o=>o.assortments.length,start:o=>o.plannedStart||'9999',end:o=>o.plannedEnd||'9999',readiness:o=>o.readiness.filter(r=>r.level!=='ok').length,id:o=>o.id};
  if(v.routeMode&&vm.plan.routeOrder.length){const pos=o=>{const i=vm.plan.routeOrder.indexOf(o.id);return i<0?99:i;};return list.sort((a,b)=>pos(a)-pos(b));}
  const f=val[key]||val.id;return list.sort((a,b)=>{const x=f(a),y=f(b);return(x<y?-1:x>y?1:0)*dir;});
};
CFHViews.uppdragslista=(vm,v,ui)=>{
  const{esc,num,sv,code,date,status,readinessBadge,resourceLabel}=ui;
  const cols=CFHViews.columns.filter(c=>v.columns[c.key]!==false),list=CFHViews.filterOrders(vm,v),clients=[...new Set(vm.orders.map(o=>o.client))];
  const checked=v.checked.filter(id=>vm.orders.some(o=>o.id===id));
  const cell=(o,k)=>({
    name:`<button class="link" data-action="open-order" data-order="${esc(o.id)}">${code(o.id)} · ${esc(o.name)}</button>${o.closed?' <span class="flag block">GESPERRT</span>':''}`,
    client:`${esc(o.client)}<br><small>${code(o.contractId)}</small>`,
    status:status(o),
    resource:resourceLabel(o),
    operation:`${sv(o.operation)}<br><small>${esc(o.operationLabel)}</small>`,
    volume:`${ui.fm(o.estimatedVolume)}${o.openingStock?`<br><small>+ ${ui.fm(o.openingStock)} ${esc('Waldlager')}</small>`:''}`,
    assortments:o.assortments.filter(a=>a.pin).map(a=>`<span class="chip" title="${esc(a.name)}">${code(a.code)}</span>`).join(' '),
    start:date(o.plannedStart),
    end:`${date(o.plannedEnd)}${o.endManual?` <small>${esc('manuell')}</small>`:''}`,
    readiness:readinessBadge(o)})[k];
  const sortMark=k=>v.sort?.key===k?(v.sort.dir>0?' ▲':' ▼'):'';
  return `<section class="cfh-view" data-view="list" aria-labelledby="listTitle">
  <div class="view-head"><h2 id="listTitle">${sv('Uppdragslista')} <small>${esc('Auftragsliste')}</small></h2><button class="ghost" data-action="hide-view" data-view-key="list" title="${esc('Ansicht ausblenden')}">${sv('Göm')}</button></div>
  <div class="toolbar">
    <label class="search"><span>${esc('Suche')}</span><input type="search" data-input="search" value="${esc(v.search)}" placeholder="${esc('Auftrag, Hieb oder Ressource')}"></label>
    <details class="multi" ${v.clientsOpen?'open':''}><summary data-action="toggle-clients">${esc('Auftraggeber')} (${num((v.clients||clients).length,0)}/${num(clients.length,0)})</summary><div class="multi-list">${clients.map(c=>`<label><input type="checkbox" data-change="client" value="${esc(c)}" ${!v.clients||v.clients.includes(c)?'checked':''}> ${esc(c)}</label>`).join('')}<small>${esc('Suche über mehrere Auftraggeber')}</small></div></details>
    <div class="menu"><button data-action="func-toggle" aria-expanded="${!!v.funcOpen}">${sv('Funktioner')} ▾</button>${v.funcOpen?`<div class="menu-list" role="menu">
      <button role="menuitem" data-action="select-all">${esc('Alle auswählen')}</button>
      <button role="menuitem" data-action="reset-list">${esc('Sortierung und Filter zurücksetzen')}</button>
      <button role="menuitem" data-action="route-mode">${esc(v.routeMode?'Reihenfolge fertig':'Reihenfolge auf der Karte ändern')}</button>
      <fieldset><legend>${esc('Spalten bearbeiten')}</legend>${CFHViews.columns.map(c=>`<label><input type="checkbox" data-change="column" value="${c.key}" ${v.columns[c.key]!==false?'checked':''}> ${esc(c.label)}</label>`).join('')}</fieldset></div>`:''}</div>
    <button class="primary" data-action="move-open" ${checked.length?'':'disabled'}>${sv('Flytta till resurs')}</button>
    <button data-action="unplan-open" data-scope="checked" ${checked.some(id=>vm.orders.find(o=>o.id===id)?.assignment)?'':'disabled'}>${sv('Avplanera')}</button>
    <span class="hint">${checked.length?num(checked.length,0)+' '+esc('ausgewählt'):esc('Zeilen auswählen, dann planen')}</span>
  </div>
  <div class="table-wrap"><table class="grid"><thead><tr><th class="check"><input type="checkbox" data-change="check-all" aria-label="${esc('Alle auswählen')}" ${checked.length&&checked.length===list.length?'checked':''}></th>${v.routeMode?`<th>${esc('Reihenfolge')}</th>`:''}${cols.map(c=>`<th><button class="sort" data-action="sort" data-key="${c.key}">${esc(c.label)}${sortMark(c.key)}</button></th>`).join('')}</tr></thead>
  <tbody>${list.map((o,i)=>`<tr class="${o.id===v.selected?'selected':''} tone-row-${o.info.tone}" data-row-order="${esc(o.id)}" draggable="${o.closed?'false':'true'}"><td class="check"><input type="checkbox" data-change="check" value="${esc(o.id)}" aria-label="${esc('Auftrag auswählen')}: ${esc(o.name)}" ${checked.includes(o.id)?'checked':''}></td>${v.routeMode?`<td class="route-cell"><b>${num(i+1,0)}</b><button class="ghost" data-action="route-up" data-order="${esc(o.id)}" aria-label="${esc('Nach oben')}" ${i?'':'disabled'}>↑</button><button class="ghost" data-action="route-down" data-order="${esc(o.id)}" aria-label="${esc('Nach unten')}" ${i<list.length-1?'':'disabled'}>↓</button></td>`:''}${cols.map(c=>`<td data-col="${c.key}">${cell(o,c.key)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length+1}">${esc('Keine Aufträge für diese Suche.')}</td></tr>`}</tbody></table></div>
  </section>`;
};
