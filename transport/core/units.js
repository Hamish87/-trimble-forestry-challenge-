/* Holztransport demo · units. Quantities are never converted silently: fm, rm, m³, t, kg, Stück and LDG are distinct
   units (SPEC §1, DM "Quantity management"). A derived value always carries the versioned factor that produced it. */
'use strict';
(function(){
const UNITS={
  fm:{code:'fm',label:'fm',name:'Festmeter',kind:'volume-solid'},
  rm:{code:'rm',label:'rm',name:'Raummeter',kind:'volume-stacked'},
  m3:{code:'m3',label:'m³',name:'Kubikmeter',kind:'volume-cubic'},
  t:{code:'t',label:'t',name:'Tonnen',kind:'mass'},
  kg:{code:'kg',label:'kg',name:'Kilogramm',kind:'mass'},
  stk:{code:'stk',label:'Stück',name:'Stück',kind:'count'},
  ldg:{code:'ldg',label:'LDG',name:'Ladungen',kind:'loads'}
};
const SYNONYMS=[[/^(fm|festmeter|efm|efm\s*o\.?\s*r\.?)$/i,'fm'],[/^(rm|raummeter|srm)$/i,'rm'],[/^(m³|m3|cbm|kubikmeter)$/i,'m3'],[/^(t|to|tonnen?)$/i,'t'],[/^kg$/i,'kg'],[/^(stück|stueck|stck|st|stk|stückzahl)$/i,'stk'],[/^(ldg|ladungen?|fuhren?)$/i,'ldg']];
const METHODS={WA:'Waldmaß',WM:'Werksmaß',GEW:'Gewicht',STK:'Stückzahl',SCH:'Schätzung'};
function parseUnit(token){if(token==null)return null;const t=String(token).trim();for(const [re,code] of SYNONYMS)if(re.test(t))return code;return null;}
/* Number notation per customer profile (DM: keep German decimal notation; SPEC §5.2). decimal = 'de' (default:
   "." thousands, "," decimal → "38.540 kg" = 38540), 'mixed' (dot with exactly three digits = thousands, otherwise
   decimal → "15.00" = 15 beside "148,02"), 'en' ("." decimal, "," thousands). "0727603001" is NOT a number (leading
   zero → identifier) and stays text. Returns null when the token is not a plain quantity. */
function parseNumber(raw,decimal='de'){
  if(raw==null)return null;const s=String(raw).trim().replace(/\s/g,'');
  if(!/^[-+]?\d[\d.,]*$/.test(s))return null;
  if(/^0\d/.test(s))return null;
  let norm;
  if(decimal==='en'){norm=s.replace(/,/g,'');}
  else if(s.includes(',')){norm=s.replace(/\./g,'').replace(',','.');if((s.match(/,/g)||[]).length>1)norm=s.replace(/[.,]/g,'');}
  else if(s.includes('.')){const parts=s.split('.');
    if(parts.length>2)norm=s.replace(/\./g,'');
    else if(decimal==='de')norm=parts[1].length===3?s.replace(/\./g,''):s;
    else norm=parts[1].length===3&&parts[0].length<=3?s.replace(/\./g,''):s;}
  else norm=s;
  const n=Number(norm);return Number.isFinite(n)?n:null;
}
/* "230,636 rm" / "15.00 fm" / "5 LDG" / "77,0 FM" → {value, unit, raw} */
function parseQuantity(raw,decimal='de'){
  if(raw==null)return null;const s=String(raw).trim();const m=s.match(/^([-+]?[\d.,]+)\s*([A-Za-zäöü³]+(?:\s*o\.?\s*R\.?)?)?$/);
  if(!m)return null;const value=parseNumber(m[1],decimal);if(value==null)return null;const unit=m[2]?parseUnit(m[2]):null;if(m[2]&&!unit)return null;
  return {value,unit,raw:s};
}
const nf={de:new Intl.NumberFormat('de-DE',{maximumFractionDigits:3}),en:new Intl.NumberFormat('en-GB',{maximumFractionDigits:3}),fr:new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3})};
function formatNumber(v,lang='de',digits){if(v==null||!Number.isFinite(v))return '–';if(digits!=null)return new Intl.NumberFormat(lang==='en'?'en-GB':lang==='fr'?'fr-FR':'de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v);return (nf[lang]||nf.de).format(v);}
function formatQty(v,unit,lang='de',digits){if(v==null)return '–';const u=UNITS[unit];return formatNumber(v,lang,digits)+(u?' '+u.label:'');}
/* Versioned conversion factors — demo assumptions, shown next to every derived value (DM: "No silent conversion"). */
const FACTORS=[
  {id:'rm-fm-schichtholz-v2026-10',from:'rm',to:'fm',factor:0.7,scope:'Industrie-/Schichtholz 3–4 m, Nadelholz',version:'2026-10',note:'Demo-Annahme; mit Pilotkunden festzulegen'},
  {id:'t-fm-nadelholz-frisch-v2026-10',from:'t',to:'fm',factor:1.05,scope:'Nadelholz frisch, Werkseingang Gewicht',version:'2026-10',note:'Demo-Annahme; Raumdichte/Feuchte versioniert'},
  {id:'kg-t-v2026-10',from:'kg',to:'t',factor:0.001,scope:'Masse',version:'2026-10',note:'exakt'},
  {id:'m3-rm-schuettgut-v2026-10',from:'m3',to:'rm',factor:1,scope:'Schüttvolumen Kappholz/Hackgut (Schubboden)',version:'2026-10',note:'Demo-Annahme: 1 m³ Schüttvolumen = 1 rm'}
];
function factorFor(from,to){return FACTORS.find(f=>f.from===from&&f.to===to)||null;}
/* derive({value, unit}, 'fm') → {value, unit, factorId, from:{value,unit}} or null when no factor exists. */
function derive(q,to){if(!q||q.unit===to)return q?{value:q.value,unit:q.unit,factorId:null,from:null}:null;const f=factorFor(q.unit,to);if(!f)return null;return {value:Math.round(q.value*f.factor*1000)/1000,unit:to,factorId:f.id,from:{value:q.value,unit:q.unit}};}
function sum(items){const by={};for(const it of items){if(!it||it.value==null)continue;const u=it.unit||'?';by[u]=(by[u]||0)+it.value;}return Object.entries(by).map(([unit,value])=>({unit:unit==='?'?null:unit,value:Math.round(value*1000)/1000}));}
const api={UNITS,METHODS,FACTORS,parseUnit,parseNumber,parseQuantity,formatNumber,formatQty,factorFor,derive,sum};
(globalThis.TransportCore=globalThis.TransportCore||{}).units=api;
if(typeof module!=='undefined')module.exports=api;
})();
