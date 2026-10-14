/* CFHarvest replica · small rendering helpers shared by the views.
   German source text is written into the DOM and translated by the game's I18n layer (dist/i18n.js).
   Language policy (SPEC_PLANNING.md, milestone 2): German first. Where the spec marks a Swedish product term, it is shown as
   a small muted caption "(Uppdragslista)" or as a tooltip "SV: Uppdragslista"; both stay Swedish in every language
   (captions are data-no-translate; tooltip text after "SV: " matches no catalogue key). */
'use strict';
const CFHUI=(()=>{
const DIST='../../dist/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Numbers are written in German format; I18n converts them for EN/FR exactly as in the game.
const num=(n,d=1)=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:d}).format(Math.abs(Number(n)||0)<.05&&d<=1?0:Number(n)||0);
const fm=n=>num(n)+' fm';
const vol=n=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(n)||0)+' fm'; // "662,0 m³" style [V6-2:12]
const ha=n=>n==null?'–':new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(Number(n)||0)+' ha';
const locale=()=>(typeof I18n!=='undefined'?I18n:null)?.locale||'de-DE';
const sv=t=>`<span class="sv" lang="sv" data-no-translate>${esc(t)}</span>`;
const code=t=>`<span class="code" data-no-translate>${esc(t)}</span>`;
/** German label with the Swedish product term as a muted caption (or only as tooltip when tip=true). */
function term(de,svTerm,{tip=false,tag='span',cls=''}={}){
  if(!svTerm||svTerm===de)return `<${tag} class="term ${cls}">${esc(de)}</${tag}>`;
  return tip?`<${tag} class="term ${cls}" title="SV: ${esc(svTerm)}">${esc(de)}</${tag}>`:`<${tag} class="term ${cls}">${esc(de)} <small class="sv-cap" lang="sv" data-no-translate>(${esc(svTerm)})</small></${tag}>`;
}
/** Title attribute text: German tooltip, optionally with the Swedish product term. */
const tip=(de,svTerm)=>esc(svTerm&&svTerm!==de?`${de} · SV: ${svTerm}`:de);
/** Icon button: icon + optional visible German label; title/aria-label German (+ SV term in the tooltip). */
function ibtn(action,icon,de,svTerm,{label=false,attrs='',cls='',disabled=false}={}){
  return `<button type="button" class="ibtn ${cls}" ${action?`data-action="${action}"`:''} title="${tip(de,svTerm)}" aria-label="${esc(de)}" ${attrs} ${disabled?'disabled':''}><span class="ico" aria-hidden="true">${icon}</span>${label?`<span class="ibtn-label">${esc(typeof label==='string'?label:de)}</span>`:''}</button>`;
}
function date(iso,style='short'){
  if(!iso)return '<span class="muted">–</span>';
  const d=new Date(iso+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return '–';
  const opts=style==='short'?{day:'numeric',month:'short',year:'numeric'}:style==='num'?{day:'2-digit',month:'2-digit',year:'numeric'}:style;
  return `<span class="date" data-no-translate>${esc(new Intl.DateTimeFormat(locale(),{timeZone:'UTC',...opts}).format(d))}</span>`;
}
const dateText=(iso,opts={day:'2-digit',month:'2-digit',year:'numeric'})=>iso?new Intl.DateTimeFormat(locale(),{timeZone:'UTC',...opts}).format(new Date(iso+'T00:00:00Z')):'–';
/** Status pill [M40][M70]: text = assigned resources, colour = status; available = "Frei *" (tooltip SV Ledig). */
function pill(o){
  const p=o.pill,statusText=o.info.label;
  if(p.cls==='available')return `<span class="pill pill-available" data-status="${o.status}" title="${tip(statusText,p.sv)}">${esc('Frei')}${p.star?' <span title="'+esc('Kartendaten vorhanden')+'">*</span>':''}</span>`;
  if(p.cls==='completed')return `<span class="pill pill-completed" data-status="${o.status}" title="${tip(statusText,p.sv)}">${esc('Abgeschlossen')}</span>`;
  return `<span class="pill pill-${p.cls}" data-status="${o.status}" title="${tip(statusText,p.sv)}">${esc(p.text||'–')}</span>`;
}
/** Order label "client - contract - order nr - name" [M38]; codes stay as they are, the stand name is translated. */
const orderLabel=o=>`<span class="lbl-code" data-no-translate>${esc([o.clientCode,o.contractId,o.id].join(' - '))} - </span>${esc(o.name)}`;
const orderLabelText=o=>`${[o.clientCode,o.contractId,o.id].join(" - ")} - ${o.name}`; // German source; I18n translates titles and toasts
const pct=(a,b)=>b>0?Math.max(0,Math.min(100,a/b*100)):0;
function readinessBadge(o){
  const blocks=o.readiness.filter(r=>r.level==='block').length,warns=o.readiness.filter(r=>r.level==='warn').length+(o.pinFlag?1:0);
  const cls=blocks?'block':warns?'warn':'ok';
  return `<span class="ready ready-${cls}">${blocks?'⛔ ':warns?'! ':'✓ '}${blocks?esc('Gesperrt'):warns?num(warns,0)+' '+esc(warns===1?'offene Prüfung':'offene Prüfungen'):esc('Bereit')}</span>`;
}
function resourceLabel(o){if(!o.row)return '<span class="muted">–</span>';return `${esc(o.row.name)} <small>${code('('+o.row.id+')')}</small>`;}
const rowName=r=>r.kind==='chain'?`${esc(r.name)} ${code('('+r.id+')')}`:`${esc(r.name)} ${code('('+(r.stanford||r.id)+')')}`;
function json(obj){return `<pre class="json"><code>${esc(JSON.stringify(obj,null,2))}</code></pre>`;}
/** Glossary of the Swedish product terms used as captions (Hilfe page). */
const GLOSSARY=[['Arbeitsplanung','Arbetsplanering'],['Auftragsliste','Uppdragslista'],['Aufträge auf der Karte','Uppdrag på kartan'],['Kalender','Kalender'],['Ressourcen','Resurser'],['Bestellungen','Beställningar'],
  ['Auf Ressource verschieben','Flytta till resurs'],['An Ressource senden','Skicka till resurs'],['Ausplanen','Avplanera'],['Komprimieren','Komprimera'],['Datum wählen','Välj datum'],['Als letzten hinzufügen','Lägg till som sista'],['Verschieben','Flytta'],['Kopieren','Kopiera'],['Speichern','Spara'],['Zurücksetzen','Återställ'],
  ['Frei','Ledig'],['Geplant','Tilldelad'],['Begonnen','Påbörjad'],['Abgeschlossen','Avslutad'],['Erntekette','Drivningskedja'],['Arbeitsgruppe','Arbetsgrupp'],['Endnutzung','Slutavverkning'],['Durchforstung','Gallring'],['Erstdurchforstung','Första gallring'],
  ['Arbeitsauftrag','Arbetsorder'],['Polterplatz','Avlägg'],['Sortiment','Sortiment'],['Wochenkalender','Veckokalender'],['Wochenarbeitszeit','Veckoarbetstid'],['Stammdaten','Grunddata'],['Produktionsdaten','Produktionsdata']];
return{DIST,esc,num,fm,vol,ha,sv,code,term,tip,ibtn,date,dateText,pill,orderLabel,orderLabelText,pct,readinessBadge,resourceLabel,rowName,json,locale,GLOSSARY};
})();
const CFHViews={};
if(typeof module!=='undefined')module.exports={CFHUI,CFHViews};
