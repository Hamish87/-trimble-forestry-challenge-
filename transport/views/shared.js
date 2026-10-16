/* Holztransport demo · shared view helpers: escaping, formatting, status pills, page facsimiles, exception lists,
   tables. Views return HTML strings; document text always passes through esc(). */
'use strict';
(function(){
const req=(ns,name,path)=>(globalThis[ns]&&globalThis[ns][name])||(typeof require!=='undefined'?require(path):null);
const U=req('TransportCore','units','../core/units.js'),X=req('TransportCore','extract','../core/extract.js');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(k,...a)=>{const i=globalThis.TransportCore&&globalThis.TransportCore.i18n;return i?i.t(k,...a):k;};
const lang=()=>{const i=globalThis.TransportCore&&globalThis.TransportCore.i18n;return i?i.lang():'de';};
const fmt={
  num:(v,d)=>U.formatNumber(v,lang(),d),qty:(v,u,d)=>v==null?'–':U.formatQty(v,u,lang(),d),
  date:iso=>{if(!iso)return '–';const d=new Date(iso.length<=10?iso+'T00:00:00':iso);if(isNaN(d))return esc(iso);return d.toLocaleDateString(lang()==='en'?'en-GB':lang()==='fr'?'fr-FR':'de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});},
  dt:iso=>{if(!iso)return '–';const d=new Date(iso);if(isNaN(d))return esc(iso);return d.toLocaleString(lang()==='en'?'en-GB':lang()==='fr'?'fr-FR':'de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});},
  time:iso=>{if(!iso)return '–';const d=new Date(iso);return isNaN(d)?esc(iso):d.toLocaleTimeString(lang()==='en'?'en-GB':'de-DE',{hour:'2-digit',minute:'2-digit'});},
  pct:v=>v==null?'–':(v>0?'+':'')+U.formatNumber(v,lang(),1)+' %',
  conf:c=>c==null?'–':Math.round(c*100)+' %'
};
const LABELS={
  intake:{Received:['Eingegangen','grey'],NeedsReview:['Prüfung nötig','amber'],Ready:['Freigegeben','green'],Failed:['Fehlgeschlagen','red'],Duplicate:['Duplikat','grey'],Superseded:['Ersetzt','grey']},
  stack:{Available:['Verfügbar','blue'],PartlyCollected:['Teilweise abgeholt','amber'],Cleared:['Geräumt','green'],Blocked:['Blockiert','red']},
  load:{Planned:['Geplant','grey'],Loaded:['Beladen · Lieferschein','blue'],Arrived:['Angekommen','blue'],Unloaded:['Abgeladen · Werksmaß ausstehend','amber'],Measured:['Vermessen','green'],Reconciled:['Abgeglichen','green'],Rejected:['Abgelehnt','red'],Diverted:['Umgeleitet','amber'],Disputed:['Strittig','red']},
  order:{Open:['Offen','blue'],CollectionComplete:['Abfuhr abgeschlossen','amber'],DeliveryComplete:['Lieferung abgeschlossen','amber'],ReceiptsComplete:['Werksscheine vollständig','green'],Reconciled:['Abgeglichen','green'],Paused:['Pausiert','grey'],Cancelled:['Storniert','grey'],Superseded:['Ersetzt','grey']},
  alloc:{Proposed:['Vorgeschlagen','grey'],Accepted:['Angenommen','green'],Reserved:['Reserviert','blue'],Withdrawn:['Zurückgezogen','red'],Reassigned:['Neu zugeteilt','amber'],Done:['Erledigt','green']},
  location:{needed:['Standort erforderlich','red'],proposed:['Gedruckt · unbestätigt','amber'],address:['Werksadresse','blue'],confirmed:['Standort bestätigt','green']},
  match:{Matched:['Zugeordnet','green'],MatchNeeded:['Zuordnung erforderlich','amber'],Disputed:['Strittig','red']},
  sync:{pending:['Ausstehende Synchronisierung','amber'],acked:['Übertragen','green'],conflict:['Konflikt','red']},
  severity:{block:['blockiert','red'],warn:['prüfen','amber'],info:['Hinweis','grey']},
  cls:{order:['Auftrag','blue'],order_continuation:['Folgeseite','grey'],amendment:['Änderung','amber'],map:['Karte','grey'],delivery_note_form:['Lieferschein-Formular (leer)','grey'],collection_report_form:['Abfuhrmeldung-Formular','grey'],mill_ticket:['Werksbeleg','green'],other:['Sonstiges','grey']}
};
const pill=(kind,text,extra='')=>`<span class="pill pill-${kind} ${extra}">${esc(text)}</span>`;
function statusPill(group,status,extra){const e=(LABELS[group]||{})[status];return e?pill(e[1],t(e[0]),extra):pill('grey',status||'–',extra);}
const statusLabel=(group,status)=>{const e=(LABELS[group]||{})[status];return e?t(e[0]):status;};
const confBadge=c=>c==null?'':`<span class="conf ${c>=0.9?'hi':c>=0.7?'mid':'lo'}" title="${t('Konfidenz')}">${fmt.conf(c)}</span>`;
const srcBadge=s=>s?`<span class="src src-${esc(s)}">${esc(s==='ocr'?'OCR':s==='text'?'Text':s==='manual'?t('manuell'):s)}</span>`:'';
const button=(label,action,data={},cls='',attrs='')=>`<button type="button" class="${cls}" data-action="${esc(action)}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')} ${attrs}>${label}</button>`;
const select=(name,options,value,attrs='')=>`<select name="${esc(name)}" ${attrs}>${options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}"${String(v)===String(value)?' selected':''}>${esc(l)}</option>`;}).join('')}</select>`;
const empty=text=>`<div class="empty">${esc(text)}</div>`;
const kv=rows=>`<dl class="kv">${rows.filter(r=>r).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v==null||v===''?'<span class="muted">–</span>':v}</dd>`).join('')}</dl>`;
const table=(heads,rows,cls='')=>`<table class="tbl ${cls}"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${heads.length}" class="muted">${esc(t('Keine Einträge'))}</td></tr>`}</tbody></table>`;
const party=(state,id)=>(state.parties.find(p=>p.id===id)||{}).name||null;const userName=(state,id)=>(state.users.find(u=>u.id===id)||{}).name||id||'–';const truckReg=(state,id)=>(state.trucks.find(x=>x.id===id)||{}).reg||'–';
function stackRef(st){const r=st.refs||{};if(st.kind==='industrial')return `${t('Ladenummer')} ${esc(r.ladenummer||'–')}${r.weekday?' · '+esc(t(r.weekday)):''}`;const parts=[];if(r.hieb)parts.push(`${t('Hieb')} ${esc(r.hieb)}`);if(r.los)parts.push(`${t('Los')} ${esc(r.los)}`);if(r.orderLos&&!r.hieb)parts.push(esc(r.orderLos));if(r.polter)parts.push(`${t('Polter')} ${esc(r.polter)}`);if(r.pos&&!r.polter)parts.push(`Pos. ${esc(r.pos)}`);return parts.join(' · ')||esc(st.tempKey);}
function timber(st){const tb=st.timber||{};return [tb.species,tb.assortment,tb.lengthM!=null?fmt.num(tb.lengthM)+' m':null,tb.grade].filter(Boolean).map(esc).join(' · ')||`<span class="muted">${esc(t('nicht gedruckt'))}</span>`;}
function orderRef(o){return `${esc(o.documentType||t('Auftrag'))}${o.documentNumber?' '+esc(o.documentNumber):''}`;}
function deadline(o){return o&&o.window&&o.window.to?fmt.date(o.window.to):'–';}
function dueClass(o,nowIso){if(!o||!o.window||!o.window.to)return '';const d=(new Date(o.window.to)-new Date(nowIso||Date.now()))/86400000;return d<0?'due-over':d<3?'due-soon':'';}
/* Page facsimile: lines in reading order, tab cells as columns, optional highlight of one line and redaction of lines. */
function facsimile(page,opts={}){
  const hl=opts.highlightLine;const red=new Set(opts.redactLines||[]);
  const body=page.lines.map((l,li)=>{const cells=X.cells(l);const txt=red.has(li)?`<span class="redacted">█ ${esc(t('redigiert'))}</span>`:cells.map(c=>`<span class="cell">${esc(c)||'&nbsp;'}</span>`).join('');return `<div class="fx-line${hl===li?' hl':''}${red.has(li)?' red':''}" data-line="${li}" ${opts.lineAction?`data-action="${esc(opts.lineAction)}" data-page="${page.n}" data-line-no="${li}"`:''}>${txt}</div>`;}).join('');
  const ribbon=`<div class="fx-ribbon">${esc(t('Nachbildung · anonymisiert'))} · ${esc(page.kind==='scan'?t('Scan (OCR-Nachbildung)'):page.kind==='map'?t('Kartenseite'):t('Textebene'))} · ${esc(t('Seite'))} ${page.n}</div>`;
  if(page.kind==='map')return `<div class="fx-sheet fx-map">${ribbon}${mapPage(page,opts)}</div>`;
  return `<div class="fx-sheet${page.kind==='scan'?' fx-scan':''}">${ribbon}${body}</div>`;
}
function mapPage(page,opts={}){
  const pins=(page.pins||[]).map(p=>`<button type="button" class="fx-pin${opts.activePin===p.label?' active':''}" style="left:${(p.fx*100).toFixed(1)}%;top:${(p.fy*100).toFixed(1)}%" data-action="${esc(opts.pinAction||'noop')}" data-pin="${esc(p.label)}" title="${esc(p.label)}"><span>${esc(p.label)}</span></button>`).join('');
  return `<div class="fx-mapimg" role="img" aria-label="${esc(t('Schematische Kartenseite'))}: ${esc(page.title||'')}"><div class="fx-maptitle">${esc(page.title||'')}</div><div class="fx-mapgrid"></div>${pins}<div class="fx-mapnote">${esc(t('Kartenbild aus dem Dokument — Bildnachweis, keine Koordinatenquelle. Pins sind Beschriftungen der Vorlage.'))}</div>${(page.lines||[]).map(l=>`<div class="fx-mapcaption">${esc(l.replace(/\t/g,' '))}</div>`).join('')}</div>`;
}
function exceptions(list,opts={}){
  if(!list||!list.length)return `<div class="ok-box">${esc(t('Keine Ausnahmen'))}</div>`;
  const order={block:0,warn:1,info:2};const xs=list.slice().sort((a,b)=>order[a.severity]-order[b.severity]);
  return `<ul class="exc">${xs.map(e=>`<li class="exc-${e.severity}" data-exc="${esc(e.id)}">${statusPill('severity',e.severity)} <code>${esc(e.code)}</code> <span class="exc-scope muted">${esc(t(e.scope==='line'?'Zeile':e.scope==='order'?'Auftrag':'Dokument'))}</span> ${esc(e.message)}${e.page?` <span class="muted">(${esc(t('Seite'))} ${e.page})</span>`:''}${e.stack&&opts.stackAction?` ${button(t('Zeile'),opts.stackAction,{stack:e.stack},'link')}`:''}</li>`).join('')}</ul>`;
}
function fieldCell(f,opts={}){if(!f)return `<span class="muted">${esc(t('nicht gedruckt'))}</span>`;const v=f.value===''||f.value==null?`<span class="muted">${esc(t('leer'))}</span>`:esc(f.value);return `<span class="fld" ${f.page!=null?`data-action="${esc(opts.action||'review-highlight')}" data-page="${f.page}" data-line-no="${f.line}"`:''} title="${esc(f.raw||'')}">${v}</span> ${confBadge(f.confidence)} ${srcBadge(f.source)}`;}
function locationText(st){if(st.confirmed)return `${fmt.num(st.confirmed.lat,4)}, ${fmt.num(st.confirmed.lon,4)} · ${esc(methodLabel(st.confirmed.method))}`;if(st.location&&st.location.address)return esc(st.location.address);if(st.location&&st.location.raw)return `<span class="raw">${esc(st.location.raw)}</span>`;return `<span class="muted">${esc(t('keine Koordinate gedruckt'))}</span>`;}
const METHODS={printed:'gedruckte Koordinate bestätigt',suggestion:'Lesart bestätigt',manual:'manuell gesetzt',address:'Werksadresse','manual-from-map':'aus Kartenbild platziert'};
const methodLabel=m=>t(METHODS[m]||m||'–');
const api={esc,t,lang,fmt,LABELS,pill,statusPill,statusLabel,confBadge,srcBadge,button,select,empty,kv,table,party,userName,truckReg,stackRef,timber,orderRef,deadline,dueClass,facsimile,mapPage,exceptions,fieldCell,locationText,methodLabel};
(globalThis.TransportViews=globalThis.TransportViews||{}).shared=api;
if(typeof module!=='undefined')module.exports=api;
})();
