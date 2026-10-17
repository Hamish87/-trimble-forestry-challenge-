/* Holztransport demo · dashboard view (SPEC §7.8): fleet overview for the dispatcher — KPI cards, drivers, mills,
   customers, timber grades and daily columns. Figures come from core/stats.js; charts are inline SVG/CSS so the
   page stays buildless and testable. Quantities are shown per unit; the fm equivalent is labelled as derived. */
'use strict';
(function(){
const S=globalThis.TransportViews.shared;const {esc,t,fmt,pill,button,select,table,empty}=S;
const ST=()=>globalThis.TransportCore.stats;
const qtyList=by=>{const es=Object.entries(by||{}).filter(([,q])=>q);return es.length?es.map(([u,q])=>fmt.qty(q,u)).join(' · '):'–';};
const fmText=f=>f?`≈ ${fmt.qty(f.value,'fm')}${f.excluded&&f.excluded.length?` <span class="muted">(${t('ohne')} ${f.excluded.map(u=>esc(u.toUpperCase()==='LDG'?'LDG':u)).join(', ')})</span>`:''}`:'';
const unitLabel=u=>u==='ldg'?'LDG':u;
const cnt=(n,one,many)=>`${n} ${t(n===1?one:many)}`;
/* --- widgets --- */
function kpi(label,value,sub,tone){return `<div class="kpi ${tone?'kpi-'+tone:''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub?`<div class="kpi-sub muted small">${sub}</div>`:''}</div>`;}
function barList(items,opts={}){ /* items: [{label, value, text, tone}] */
  const max=Math.max(...items.map(i=>i.value||0),0);if(!items.length)return `<p class="muted small">${esc(opts.emptyText||t('Keine Daten im Zeitraum.'))}</p>`;
  return `<div class="barlist">${items.map(i=>`<div class="bl-row"><div class="bl-label ellipsis" title="${esc(String(i.label))}">${i.label}</div><div class="bl-val num small">${i.text!=null?i.text:fmt.num(i.value)}</div><div class="bl-bar"><i class="${i.tone||''}" style="width:${max?Math.max(1,Math.round((i.value||0)/max*100)):0}%"></i></div></div>`).join('')}</div>`;}
function donut(segs,opts={}){ /* segs: [{name, value}] */
  const tot=segs.reduce((a,s)=>a+s.value,0);if(!tot)return `<p class="muted small">${esc(t('Keine Daten im Zeitraum.'))}</p>`;
  const r=42,c=2*Math.PI*r;let off=0;const cols=['var(--c0)','var(--c3)','var(--c2)','var(--c1)','var(--c4)','var(--c5)'];
  const arcs=segs.map((s,i)=>{const len=s.value/tot*c;const el=`<circle r="${r}" cx="60" cy="60" fill="none" stroke="${cols[i%cols.length]}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(c-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"><title>${esc(s.name)}: ${fmt.num(s.value)}</title></circle>`;off+=len;return el;}).join('');
  return `<div class="donut"><svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="${esc(opts.label||'')}">${arcs}<text x="60" y="56" text-anchor="middle" class="donut-v">${esc(opts.center||fmt.num(tot))}</text><text x="60" y="72" text-anchor="middle" class="donut-u">${esc(opts.unit||'')}</text></svg><ul class="donut-legend">${segs.map((s,i)=>`<li><i style="background:${cols[i%cols.length]}"></i>${esc(s.name)} <span class="muted">${fmt.num(s.value)} · ${Math.round(s.value/tot*100)} %</span></li>`).join('')}</ul></div>`;}
function columns(series,opts={}){ /* series: [{day, value}] */
  const w=Math.max(220,series.length*24),h=150,pad=18;const max=Math.max(...series.map(s=>s.value),0)||1;const bw=(w-pad)/series.length;
  const bars=series.map((s,i)=>{const bh=Math.round(s.value/max*(h-30));const x=pad+i*bw+2,y=h-18-bh;return `<rect x="${x.toFixed(1)}" y="${y}" width="${(bw-4).toFixed(1)}" height="${bh}" rx="2" class="col${s.value?'':' zero'}"><title>${esc(s.label)}: ${esc(s.text||fmt.num(s.value))}</title></rect>${s.value?`<text x="${(x+(bw-4)/2).toFixed(1)}" y="${y-3}" text-anchor="middle" class="col-v">${esc(s.text||fmt.num(s.value))}</text>`:''}`;}).join('');
  const labels=series.map((s,i)=>i%Math.ceil(series.length/7)===0||i===series.length-1?`<text x="${(pad+i*bw+bw/2).toFixed(1)}" y="${h-4}" text-anchor="middle" class="col-l">${esc(s.label)}</text>`:'').join('');
  return `<div class="cols"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.label||'')}"><line x1="${pad}" y1="${h-18}" x2="${w}" y2="${h-18}" class="axis"/>${bars}${labels}</svg></div>`;}
const dayLabel=d=>{const [y,m,dd]=d.split('-');return `${Number(dd)}.${Number(m)}.`;};
const gradeLabel=key=>key.replace(/^\?/,t('Baumart nicht gedruckt')).replace(/ · \?/g,'');
/* --- page --- */
function render(ctx){
  const {state}=ctx;const f=ctx.ui.dash||{};const days=Number(f.days)||0;const drv=f.driver||'';
  const r=ST().compute(state,{now:ctx.now,days,driverId:drv||null});const F=r.fleet;
  const drivers=state.users.filter(u=>u.roles.includes('driver')).map(u=>[u.id,u.name]);
  const filters=`<div class="filters dash-filters"><label>${t('Zeitraum')} ${select('days',[['0',t('Alle Zeiten')],['7',t('letzte 7 Tage')],['14',t('letzte 14 Tage')],['30',t('letzte 30 Tage')]],String(days),'data-action="dash-filter"')}</label><label>${t('Fahrer')} ${select('driver',[['',t('Alle')],...drivers],drv,'data-action="dash-filter"')}</label><span class="muted small">${t('Stand')}: ${fmt.dt(r.now)}${r.anchoredToActivity?` (${t('letzte Aktivität')})`:''}${days?` · ${t('ab')} ${fmt.date(r.from)}`:''}</span></div>`;
  const kpis=`<div class="kpis">
    ${kpi(t('Fuhren'),String(F.loads),Object.entries(F.loadsByState).map(([k,n])=>`${n} ${S.statusLabel('load',k)}`).join(' · ')||t('keine'))}
    ${kpi(t('Abgeholt (Fahrerschätzung)'),qtyList(F.collected),`${fmText(F.collectedFm)}${F.pickups?` · ${cnt(F.pickups,'Abholung','Abholungen')}`:''}`)}
    ${kpi(t('Deklariert (Lieferscheine)'),qtyList(F.declared),fmText(F.declaredFm))}
    ${kpi(t('Werksmaß (empfangen)'),qtyList(F.received),`${cnt(F.ticketsMatched,'Werksschein','Werksscheine')}${F.ticketsOpen?` · <span class="warn-text">${F.ticketsOpen} ${t('offen')}</span>`:''}`)}
    ${kpi(t('Netto-Gewicht'),F.netT?fmt.qty(F.netT,'t'):'–',t('Waage am Werk'))}
    ${kpi(t('Bestellt'),qtyList(F.ordered),`${fmText(F.orderedFm)}${F.completionPct!=null?` · <strong>${fmt.num(F.completionPct,1)} %</strong> ${t('abgeholt')}`:''}`)}
    ${kpi(t('Polter'),`${F.stacksCleared} / ${F.stacks}`,`${t('geräumt')} · ${F.stacksPartly} ${t('teilweise')}${F.locationNeeded?` · <span class="warn-text">${F.locationNeeded} ${t('ohne Standort')}</span>`:''}`)}
    ${kpi(t('Offen'),String(F.conflicts+F.problems+F.locationNeeded+F.ticketsOpen),`${cnt(F.allocations,'Zuteilung','Zuteilungen')} · ${cnt(F.conflicts,'Konflikt','Konflikte')} · ${cnt(F.problems,'Problem','Probleme')}`,F.conflicts||F.problems?'warn':'')}
  </div>`;
  /* drivers */
  const dsort=r.drivers.slice().sort((a,b)=>(b.collectedFm?b.collectedFm.value:0)-(a.collectedFm?a.collectedFm.value:0));
  const driverTable=table([t('Fahrer'),t('Lkw'),t('zugeteilte Polter'),t('zugeteilt (Menge)'),t('Fuhren'),t('abgeholt'),t('deklariert'),t('geräumt'),t('Probleme'),t('letzte Aktivität')],dsort.map(d=>`<tr><td class="nw"><strong>${esc(d.name)}</strong></td><td class="nw">${esc(d.truck||'–')}</td><td class="num">${d.allocatedStacks}</td><td class="num nw">${qtyList(d.allocatedVolume)}</td><td class="num">${d.loads}</td><td class="num nw">${qtyList(d.collected)}${d.collectedFm&&Object.keys(d.collected).length>1?`<div class="muted small">${fmText(d.collectedFm)}</div>`:''}</td><td class="num nw">${qtyList(d.declared)}</td><td class="num">${d.cleared}</td><td class="num">${d.problems?`<span class="warn-text">${d.problems}</span>`:'0'}</td><td class="nw small muted">${d.lastActivity?fmt.dt(d.lastActivity):'–'}</td></tr>`),'small dash-table');
  const driverBars=barList(dsort.filter(d=>d.collectedFm||Object.keys(d.collected).length).map(d=>({label:esc(d.name),value:d.collectedFm?d.collectedFm.value:0,text:qtyList(d.collected)})),{emptyText:t('Noch keine Abholungen im Zeitraum.')});
  const allocBars=barList(dsort.filter(d=>d.allocatedStacks).map(d=>({label:esc(d.name),value:d.allocatedFm?d.allocatedFm.value:ST().total(d.allocatedVolume),text:`${d.allocatedStacks} ${t('Polter')} · ${qtyList(d.allocatedVolume)}`,tone:'alt'})),{emptyText:t('Keine offenen Zuteilungen.')});
  /* mills */
  const millTable=table([t('Zielwerk'),t('Fuhren'),t('abgeladen'),t('deklariert'),t('Werksmaß'),t('Netto'),t('Werksscheine'),t('Abweichung')],r.mills.map(m=>`<tr><td class="nw"><strong>${esc(m.name)}</strong></td><td class="num">${m.loads}</td><td class="num">${m.unloaded}</td><td class="num nw">${qtyList(m.declared)}</td><td class="num nw">${qtyList(m.received)}</td><td class="num nw">${m.netT?fmt.qty(m.netT,'t'):'–'}</td><td class="num">${m.tickets}</td><td class="num nw">${m.deviationPct!=null?`<span class="${Math.abs(m.deviationPct)>state.settings.tolerancePct?'bad':'ok'}">${m.deviationPct>0?'+':''}${fmt.num(m.deviationPct,1)} %</span><div class="muted small">${m.pairedLoads} ${t(m.pairedLoads===1?'Fuhre mit Beleg':'Fuhren mit Beleg')}</div>`:'<span class="muted">–</span>'}</td></tr>`),'small dash-table');
  const millBars=barList(r.mills.filter(m=>m.loads).map(m=>({label:esc(m.name),value:m.loads,text:cnt(m.loads,'Fuhre','Fuhren')})),{emptyText:t('Keine Fuhren im Zeitraum.')});
  /* customers */
  const custRows=r.customers.map(c=>`<div class="cust"><div class="cust-head"><strong>${esc(c.name)}</strong><span class="muted small">${cnt(c.orders,'Auftrag','Aufträge')} · ${c.stacks} ${t('Polter')} · ${c.cleared} ${t('geräumt')} · ${cnt(c.loads,'Fuhre','Fuhren')}</span></div>
    <div class="cust-bar"><i style="width:${Math.min(100,c.completionPct||0)}%"></i></div>
    <div class="cust-facts small"><span><b>${t('bestellt')}</b> ${qtyList(c.ordered)}</span><span><b>${t('abgeholt')}</b> ${qtyList(c.collected)}</span><span><b>${t('deklariert')}</b> ${qtyList(c.declared)}</span><span><b>${t('empfangen')}</b> ${qtyList(c.received)}</span><span class="cust-pct">${c.completionPct!=null?`<strong>${fmt.num(c.completionPct,1)} %</strong> ${t('abgeholt')}`:`<span class="muted">${t('nicht vergleichbar')}</span>`}</span></div></div>`).join('');
  /* grades */
  const gradeBars=barList(r.grades.filter(g=>Object.keys(g.collected).length).map(g=>({label:esc(gradeLabel(g.key)),value:g.collectedFm?g.collectedFm.value:ST().total(g.collected),text:qtyList(g.collected)})),{emptyText:t('Noch keine Abholungen im Zeitraum.')});
  const gradeTable=table([t('Sortiment'),t('Polter'),t('bestellt'),t('abgeholt'),t('Anteil')],r.grades.map(g=>`<tr><td>${esc(gradeLabel(g.key))}</td><td class="num">${g.stacks}</td><td class="num nw">${qtyList(g.ordered)}</td><td class="num nw">${qtyList(g.collected)}</td><td class="num nw">${(()=>{const p=ST().ratioPct(g.collected,g.ordered);return p!=null?fmt.num(p,1)+' %':'–';})()}</td></tr>`),'small dash-table');
  const speciesDonut=donut(r.species.map(s=>({name:s.name==='?'?t('ohne Angabe'):s.name,value:s.fm})),{center:fmt.num(r.species.reduce((a,s)=>a+s.fm,0),1),unit:'fm ≈',label:t('Anteil nach Baumart (fm-Äquivalent)')});
  /* daily */
  const dailyLoads=columns(r.daily.map(d=>({label:dayLabel(d.day),value:d.loads})),{label:t('Fuhren je Tag')});
  const dailyVol=columns(r.daily.map(d=>({label:dayLabel(d.day),value:d.collectedFm,text:d.collectedFm?fmt.num(d.collectedFm,1):''})),{label:t('Abgeholt je Tag (fm-Äquivalent)')});
  return `<section class="dash">
    <div class="dash-head"><h2>${t('Dashboard')} <small class="muted">${esc(S.party(state,state.carrierId)||'')}</small></h2>${filters}</div>
    ${kpis}
    <div class="dash-grid">
      <section class="widget w-2"><h3>${t('Fahrer')}</h3>${driverTable}</section>
      <section class="widget"><h3>${t('Abgeholt je Fahrer')}</h3>${driverBars}</section>
      <section class="widget"><h3>${t('Offene Zuteilungen je Fahrer')}</h3>${allocBars}</section>
      <section class="widget"><h3>${t('Fuhren je Tag')}</h3>${dailyLoads}</section>
      <section class="widget"><h3>${t('Abgeholt je Tag')} <small class="muted">${t('fm-Äquivalent')}</small></h3>${dailyVol}</section>
      <section class="widget w-2"><h3>${t('Zielwerke')}</h3>${millTable}</section>
      <section class="widget"><h3>${t('Fuhren je Zielwerk')}</h3>${millBars}</section>
      <section class="widget"><h3>${t('Anteil nach Baumart')} <small class="muted">${t('fm-Äquivalent')}</small></h3>${speciesDonut}</section>
      <section class="widget w-2"><h3>${t('Kunden / Auftraggeber')} <small class="muted">${t('bestellt → abgeholt → deklariert → empfangen')}</small></h3>${custRows||`<p class="muted small">${esc(t('Noch keine Aufträge.'))}</p>`}</section>
      <section class="widget"><h3>${t('Abgeholt je Sortiment')}</h3>${gradeBars}</section>
      <section class="widget w-3"><h3>${t('Sortimente')}</h3>${gradeTable}</section>
    </div>
    <p class="muted small">${esc(t('Mengen je Einheit aus Abholungen (Fahrerschätzung), Lieferscheinen und zugeordneten Werksscheinen; das fm-Äquivalent ist eine abgeleitete Größe mit versionierten Faktoren (Demo-Annahmen) und schließt Einheiten ohne Faktor aus. Kilometer sind noch nicht erfasst.'))}</p>
  </section>`;
}
const api={render};
(globalThis.TransportViews=globalThis.TransportViews||{}).dashboard=api;
})();
