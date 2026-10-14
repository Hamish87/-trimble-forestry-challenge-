/* Beställningar — client orders and Uppföljning mot beställning [MW][SS]: ordered / harvested / forwarded / planned per
   assortment with the work orders meant to fulfil it; confirm; export stubbed (non-goal for milestone 1). */
'use strict';
CFHViews.bestallningar=(vm,v,ui)=>{
  const{esc,num,sv,code,fm}=ui,f=v.bookFilter||{},orders=vm.orders.filter(o=>!f.area||o.id===f.area);
  const clients=[...new Set(vm.orderBook.map(b=>b.client))],receivers=[...new Set(vm.orderBook.map(b=>b.receiver))];
  const rows=vm.orderBook.filter(b=>(!f.client||b.client===f.client)&&(!f.receiver||b.receiver===f.receiver)&&(!f.assortment||b.assortment===f.assortment)).map(b=>{
    if(!f.area)return b;const g=b.assortment,sum=k=>orders.reduce((s,o)=>s+o.stand.byGrade[g][k],0);
    return{...b,harvested:sum('felled'),forwarded:sum('forwarded'),delivered:sum('delivered'),planned:orders.filter(o=>o.assignment&&o.status!=='completed').reduce((s,o)=>s+(o.assortments.find(a=>a.key===g)?.estimatedVolume||0),0),orders:b.orders.filter(id=>id===f.area)};
  });
  const sel=(key,label,options)=>`<label class="filter"><span>${esc(label)}</span><select data-change="book-filter" data-key="${key}"><option value="">${esc('Alle')}</option>${options.map(([val,text])=>`<option value="${esc(val)}" ${f[key]===val?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const c=vm.meta.contract,delivered=receivers.map(r=>({r,v:vm.orderBook.filter(b=>b.receiver===r).reduce((s,b)=>s+b.delivered,0)}));
  return `<section class="cfh-view wide" data-view="orders" aria-labelledby="bookTitle">
  <div class="view-head"><h2 id="bookTitle">${sv('Beställningar')} <small>${esc('Bestellungen der Auftraggeber')}</small></h2><button disabled title="${esc('Excel/PDF-Export ist nicht Teil dieser Demo')}">${esc('Export')} · Excel / PDF</button></div>
  <div class="toolbar filters">${sel('client','Auftraggeber',clients.map(x=>[x,x]))}${sel('area','Gebiet',vm.orders.map(o=>[o.id,o.id+' · '+o.name]))}${sel('receiver','Lieferort',receivers.map(x=>[x,x]))}${sel('assortment','Sortiment',vm.orderBook.map(b=>[b.assortment,b.name]))}<span class="filter"><span>${esc('Zeitraum')}</span><b>${esc(vm.orderBook[0]?.period||'')}</b></span></div>
  <div class="contract-strip"><div><span>${esc('Vertrag')}</span><b>${code(c.id)} · ${esc(c.name)}</b>${c.provisional?`<small class="flag warn">${esc('Vertrag im Spiel noch nicht übernommen')}</small>`:''}</div><div><span>${esc('Bestellmenge')}</span><b>${fm(c.volume)}</b></div><div><span>${esc('davon Sägeholz')}</span><b>${fm(c.saw)}</b></div>${delivered.map(d=>`<div><span>${esc('Angeliefert')} · ${esc(d.r)}</span><b>${fm(d.v)}</b></div>`).join('')}</div>
  <h3>${sv('Uppföljning mot beställning')} <small>${esc('Abgleich mit der Bestellung')}</small></h3>
  <div class="table-wrap"><table class="grid"><thead><tr><th>${sv('Beställning')}</th><th>${esc('Sortiment')}</th><th>${esc('Lieferort')}</th><th>${esc('Bestellt')}</th><th>${esc('Geerntet')}</th><th>${esc('Gerückt')}</th><th>${esc('Angeliefert')}</th><th>${esc('Geplant')}</th><th>${esc('Erfüllung')}</th><th>${esc('Aufträge')}</th><th></th></tr></thead><tbody>
  ${rows.map(b=>`<tr data-book="${esc(b.id)}"><td>${code(b.id)}</td><td>${code(b.code)} ${esc(b.name)}</td><td>${esc(b.receiver)}</td><td>${b.ordered?fm(b.ordered):`<small>${esc('nicht bestellt')}</small>`}</td><td data-k="harvested">${fm(b.harvested)}</td><td data-k="forwarded">${fm(b.forwarded)}</td><td data-k="delivered">${fm(b.delivered)}</td><td data-k="planned">${fm(b.planned)}</td><td>${b.ordered?`<div class="meter" title="${esc('Gerückt gegenüber Bestellt')}"><i style="width:${ui.pct(b.forwarded,b.ordered)}%"></i></div><small>${num(ui.pct(b.forwarded,b.ordered),0)} %</small>`:'–'}</td><td>${b.orders.map(id=>`<button class="chip link" data-action="book-order" data-order="${esc(id)}">${code(id)}</button>`).join(' ')}</td><td>${b.confirmed?`<span class="ok">✓ ${esc('Bestätigt')}</span>`:`<button data-action="book-confirm" data-book="${esc(b.id)}" ${b.ordered?'':'disabled'}>${sv('Bekräfta')}</button>`}</td></tr>`).join('')||`<tr><td colspan="11">${esc('Keine Bestellung für diesen Filter.')}</td></tr>`}
  </tbody></table></div>
  <p class="note">${esc('Geerntet = gefällt laut HPR, gerückt laut FPR, angeliefert laut Lieferscheinen der Abfuhr. Geplant = geschätzte Sortimentsmenge der eingeplanten Aufträge. Holz am Polter ist noch keine Lieferung.')}</p>
  </section>`;
};
