/* CFHarvest replica · small rendering helpers shared by the views.
   German source text is written into the DOM and translated by the game's I18n layer (dist/i18n.js);
   Swedish product labels and codes are marked data-no-translate so they stay authentic in every language. */
'use strict';
const CFHUI=(()=>{
const DIST='../../dist/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Numbers are written in German format; I18n converts them for EN/FR exactly as in the game.
const num=(n,d=1)=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:d}).format(Math.abs(Number(n)||0)<.05&&d<=1?0:Number(n)||0);
const fm=n=>num(n)+' fm';
const locale=()=>(typeof I18n!=='undefined'?I18n:null)?.locale||'de-DE';
const sv=t=>`<span class="sv" lang="sv" data-no-translate>${esc(t)}</span>`;
const code=t=>`<span class="code" data-no-translate>${esc(t)}</span>`;
function date(iso,opts={day:'2-digit',month:'2-digit',year:'numeric'}){
  if(!iso)return '<span class="muted">–</span>';
  const d=new Date(iso+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return '–';
  return `<span class="date" data-no-translate>${esc(new Intl.DateTimeFormat(locale(),{timeZone:'UTC',...opts}).format(d))}</span>`;
}
function status(o,compact=false){return `<span class="status tone-${o.info.tone}">${sv(o.info.web)}${compact?'':`<small>${esc(o.info.label)}</small>`}</span>`;}
const pct=(a,b)=>b>0?Math.max(0,Math.min(100,a/b*100)):0;
function readinessBadge(o){
  const blocks=o.readiness.filter(r=>r.level==='block').length,warns=o.readiness.filter(r=>r.level==='warn').length+(o.pinFlag?1:0);
  const cls=blocks?'block':warns?'warn':'ok';
  return `<span class="ready ready-${cls}">${blocks?'⛔ ':warns?'! ':'✓ '}${blocks?esc('Gesperrt'):warns?num(warns,0)+' '+esc(warns===1?'offene Prüfung':'offene Prüfungen'):esc('Bereit')}</span>`;
}
function resourceLabel(o){if(!o.row)return '<span class="muted">–</span>';return `${code(o.row.id)} <small>${esc(o.row.kind==='chain'?o.row.members.join(' + '):o.row.name)}</small>`;}
function json(obj){return `<pre class="json"><code>${esc(JSON.stringify(obj,null,2))}</code></pre>`;}
return{DIST,esc,num,fm,sv,code,date,status,pct,readinessBadge,resourceLabel,json,locale};
})();
const CFHViews={};
if(typeof module!=='undefined')module.exports={CFHUI,CFHViews};
