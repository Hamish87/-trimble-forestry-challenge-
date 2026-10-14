/* Uppdragslista — assignment list [M40][M47][M48][M62][V6-0:30][V6-2:12]: toolbar, pager, the 14 default columns,
   totals row, multi-select with orange borders, Löpnr. sequence boxes, status pills; rows drag onto the calendar. */
'use strict';
CFHViews.LIST_COLUMNS=[
  {key:'seq',de:'Lfd. Nr.',sv:'Löpnr.'},{key:'status',de:'Status'},{key:'client',de:'Auftraggeber',sv:'Uppdragsgivare'},{key:'contract',de:'Vertrags-Nr.',sv:'Kontrakt nr.'},
  {key:'order',de:'Arbeitsauftrags-Nr.',sv:'Arbetsorder nr.'},{key:'name',de:'Name',sv:'Namn'},{key:'from',de:'Verfügbar ab',sv:'Tillgänglig för … (från)'},{key:'to',de:'Verfügbar bis',sv:'Tillgänglig för … (till)'},
  {key:'operation',de:'Maßnahme',sv:'Åtgärd'},{key:'prev',de:'Vorheriger Auftrag',sv:'Föreg. arbetsorder'},{key:'volume',de:'Geplant',sv:'Planerad'},{key:'area',de:'Fläche',sv:'Areal'},
  {key:'start',de:'Beginn',sv:'Börjar'},{key:'end',de:'Ende',sv:'Slutar'}];
CFHViews.OP_FILTERS=[['drivning','Holzernte','Drivning'],['service','Forstservice','Skoglig Service'],['all','Alle','Alla']];
CFHViews.seqOf=(vm,id)=>{const i=vm.plan.routeOrder.indexOf(id);return i<0?null:i+1;};
CFHViews.filterOrders=(vm,v)=>{
  const q=String(v.search||'').trim().toLowerCase(),tr=s=>typeof I18n!=='undefined'?I18n.text(s).toLowerCase():String(s).toLowerCase(),f=v.filters||{};
  const group=o=>CFHModel.OPERATIONS.find(x=>x.key===o.operation)?.group||'drivning';
  let list=vm.orders.filter(o=>(v.opFilter==='all'||!v.opFilter||group(o)===v.opFilter)
    &&(!q||[o.id,o.name,tr(o.name),o.contractId,o.clientCode,o.landing.id,...o.assignments.map(i=>i.rowId)].some(x=>String(x).toLowerCase().includes(q)))
    &&(!f.status||o.pill.cls===f.status)&&(!f.operation||o.operation===f.operation)&&(!f.name||[o.name,tr(o.name)].some(x=>x.toLowerCase().includes(String(f.name).toLowerCase())))&&(!f.order||o.id.toLowerCase().includes(String(f.order).toLowerCase())));
  const key=v.sort?.key||'seq',dir=v.sort?.dir||1;
  const val={seq:o=>CFHViews.seqOf(vm,o.id)??(900+vm.orders.indexOf(o)),status:o=>CFHModel.STATUSES.indexOf(o.status),client:o=>o.clientCode,contract:o=>o.contractId,order:o=>o.id,name:o=>o.name,from:o=>o.availableFrom||'',to:o=>o.availableTo||'',operation:o=>o.operation,prev:o=>o.predecessor||'',volume:o=>o.estimatedVolume,area:o=>o.areaHa||0,start:o=>o.plannedStart||'9999',end:o=>o.plannedEnd||'9999'};
  const fn=val[key]||val.seq;return list.sort((a,b)=>{const x=fn(a),y=fn(b);return(x<y?-1:x>y?1:0)*dir;});
};
CFHViews.uppdragslista=(vm,v,ui)=>{
  const{esc,num,term,tip,ibtn,date,pill,code}=ui,cols=CFHViews.LIST_COLUMNS.filter(c=>v.columns[c.key]!==false);
  const all=CFHViews.filterOrders(vm,v),size=v.pageSize==='all'?Math.max(1,all.length):Number(v.pageSize)||12,pages=Math.max(1,Math.ceil(all.length/size)),page=Math.min(v.page|0,pages-1),list=all.slice(page*size,page*size+size);
  const checked=v.checked.filter(id=>vm.orders.some(o=>o.id===id)),f=v.filters||{};
  const cell=(o,k)=>({
    seq:`<span class="seqcell"><input type="checkbox" data-change="check" value="${esc(o.id)}" aria-label="${esc('Auftrag auswählen')}: ${esc(o.name)}" ${checked.includes(o.id)?'checked':''}><input class="seqbox" type="number" min="1" inputmode="numeric" data-change="seq" data-order="${esc(o.id)}" value="${CFHViews.seqOf(vm,o.id)??''}" title="${tip('Ordnungsnummer eingeben','Ange ordningsnummer')}" aria-label="${esc('Ordnungsnummer')}: ${esc(o.name)}">${o.sentAny?`<span class="sent-ico" title="${tip('An Ressource gesendet','Skickad till resurs')}" aria-label="${esc('An Ressource gesendet')}">➦</span>`:''}</span>`,
    status:pill(o),client:code(o.clientCode),contract:code(o.contractId),
    order:`<button class="link" data-action="open-order" data-order="${esc(o.id)}">${code(o.id)}</button>`,
    name:`<button class="link" data-action="open-order" data-order="${esc(o.id)}" title="${esc(o.name)}">${esc(o.name)}</button>${o.closed?` <span class="flag block">${esc('Gesperrt')}</span>`:''}${o.pinFlag?` <span class="flag warn" title="${esc('Maschine hat eine andere PIN geladen')}">PIN</span>`:''}`,
    from:o.availableFrom?date(o.availableFrom):term('Nicht angegeben','Ej specificerad',{tip:true}),to:o.availableTo?date(o.availableTo):term('Immer','Alltid',{tip:true}),
    operation:term(o.operationLabel,o.operation,{tip:true}),prev:o.predecessor?code(o.predecessor):'<span class="muted">–</span>',
    volume:`<span class="num">${ui.vol(o.estimatedVolume)}</span>`,area:`<span class="num">${ui.ha(o.areaHa)}</span>`,start:date(o.plannedStart),end:`${date(o.plannedEnd)}${o.endManual?` <small>${esc('manuell')}</small>`:''}`})[k];
  const sortMark=k=>v.sort?.key===k?(v.sort.dir>0?' ▲':' ▼'):'';
  const filterCell=k=>k==='status'?`<select data-change="filter" data-key="status" aria-label="${esc('Status filtern')}"><option value="">${esc('Alle')}</option>${[['available','Frei'],['planned','Geplant'],['sent','Gesendet'],['team','An Team gesendet'],['started','Begonnen'],['completed','Abgeschlossen']].map(([x,l])=>`<option value="${x}" ${f.status===x?'selected':''}>${esc(l)}</option>`).join('')}</select>`
    :k==='operation'?`<select data-change="filter" data-key="operation" aria-label="${esc('Maßnahme filtern')}"><option value="">${esc('Alle')}</option>${CFHModel.OPERATIONS.map(x=>`<option value="${esc(x.key)}" ${f.operation===x.key?'selected':''}>${esc(x.de)}</option>`).join('')}</select>`
    :['name','order'].includes(k)?`<input type="search" data-input="filter" data-key="${k}" value="${esc(f[k]||'')}" aria-label="${esc('Filter')}: ${esc(CFHViews.LIST_COLUMNS.find(c=>c.key===k).de)}">`:'';
  const sumVol=all.reduce((s,o)=>s+o.estimatedVolume,0),sumHa=all.reduce((s,o)=>s+(o.areaHa||0),0);
  const anyPlanned=checked.some(id=>vm.orders.find(o=>o.id===id)?.assignment);
  return `<section class="cfh-view" data-view="list" aria-labelledby="listTitle">
  <div class="view-head"><h2 id="listTitle">${term('Auftragsliste','Uppdragslista')}</h2><button class="ghost small" data-action="hide-view" data-view-key="list" title="${esc('Ansicht ausblenden')}" aria-label="${esc('Ansicht ausblenden')}">✕</button></div>
  <div class="toolbar list-toolbar" role="toolbar" aria-label="${esc('Auftragsliste')}">
    ${ibtn('filter-toggle','👁','Filter anzeigen','Visa filter',{attrs:`aria-pressed="${!!v.filtersOpen}"`})}${ibtn('filter-clear','⊘','Filter entfernen','Ta bort filtreringar')}
    ${ibtn('move-open','👥','Für gewählte Ressource planen','Planera till vald resurs',{disabled:!checked.length})}
    <span class="menu">${ibtn('col-menu','≡','Spalten bearbeiten','Redigera kolumner',{attrs:`aria-expanded="${!!v.colMenu}"`})}${v.colMenu?`<div class="menu-list" role="menu">${CFHViews.LIST_COLUMNS.map(c=>`<label><input type="checkbox" data-change="column" value="${c.key}" ${v.columns[c.key]!==false?'checked':''}> ${term(c.de,c.sv,{tip:true})}</label>`).join('')}</div>`:''}</span>
    ${ibtn('sort-reset','⇕','Sortierung zurücksetzen')}${ibtn('select-all','⊙','Alle auswählen')}${ibtn('renumber','⤭','Laufende Nummern neu ordnen','Ordna om löpande nummer')}
    ${ibtn('','⚡','Im Produkt nicht beobachtet',null,{disabled:true})}${ibtn('','🔗','Im Produkt nicht beobachtet',null,{disabled:true})}
    ${ibtn('unplan-open','⛓','Arbeitsauftrag ausplanen','Avplanera arbetsorder',{attrs:'data-scope="checked"',disabled:!anyPlanned})}${ibtn('undo','↶','Rückgängig',null,{disabled:!v.canUndo})}
    <label class="search"><span class="sr-only">${esc('Suche')}</span><input type="search" data-input="search" value="${esc(v.search)}" placeholder="${esc('Arbeitsauftrag suchen …')}"><span aria-hidden="true">🔍</span></label>
    <button type="button" data-action="list-pdf" title="${esc('Liste drucken oder als PDF speichern')}">PDF</button><button type="button" disabled title="${esc('Export ist nicht Teil der Demo')}">XLSX</button>
    <button type="button" class="green" disabled title="${esc('Arbeitsaufträge kommen in dieser Demo aus dem Spiel')}">${term('Neuer Arbeitsauftrag','Ny Arbetsorder',{tip:true})}</button>
  </div>
  <div class="pager"><button type="button" class="ghost small" data-action="page" data-page="${page-1}" ${page?'':'disabled'} aria-label="${esc('Zurück')}">‹</button>${Array.from({length:pages},(_,i)=>`<button type="button" class="ghost small" data-action="page" data-page="${i}" aria-current="${i===page}">${i+1}</button>`).join('')}<button type="button" class="ghost small" data-action="page" data-page="${page+1}" ${page<pages-1?'':'disabled'} aria-label="${esc('Weiter')}">›</button>
    <span class="pager-sizes">${[12,24,'all'].map(sz=>`<button type="button" class="ghost small" data-action="page-size" data-size="${sz}" aria-pressed="${String(v.pageSize)===String(sz)}">${sz==='all'?`${esc('Alle')} (${num(all.length,0)})`:sz}</button>`).join('')}</span>
    <span class="hint">${checked.length?`${num(checked.length,0)} ${esc('ausgewählt')} · ${esc('in den Kalender ziehen')}`:esc('Zeilen anklicken, dann in den Kalender ziehen oder Ressource wählen')}</span></div>
  <div class="table-wrap"><table class="grid list-grid"><thead><tr>${cols.map(c=>`<th data-col="${c.key}"${c.sv?` title="SV: ${esc(c.sv)}"`:''}><button class="sort" data-action="sort" data-key="${c.key}">${esc(c.de)}${sortMark(c.key)}</button></th>`).join('')}</tr>
  ${v.filtersOpen?`<tr class="filter-row">${cols.map(c=>`<th>${filterCell(c.key)}</th>`).join('')}</tr>`:''}</thead>
  <tbody>${list.map(o=>`<tr class="${checked.includes(o.id)?'sel':''} ${o.id===v.selected?'active':''}" data-row-order="${esc(o.id)}" data-operation="${esc(o.operationLabel)}" draggable="${o.closed?'false':'true'}" tabindex="0" aria-selected="${checked.includes(o.id)}">${cols.map(c=>`<td data-col="${c.key}">${cell(o,c.key)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">${esc('Keine Aufträge für diese Suche.')}</td></tr>`}</tbody>
  <tfoot><tr class="totals-row">${cols.map((c,i)=>`<td data-col="${c.key}">${c.key==='volume'?`<b data-sum="volume">${ui.vol(sumVol)}</b>`:c.key==='area'?`<b data-sum="area">${ui.ha(sumHa)}</b>`:i===0?`<b>${esc('Summe')}</b>`:''}</td>`).join('')}</tr></tfoot></table></div>
  </section>`;
};
