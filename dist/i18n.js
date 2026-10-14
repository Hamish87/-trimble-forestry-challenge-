/* View-only localisation: simulation state, identifiers and calculations remain canonical. */
'use strict';
const I18n = (() => {
  const supported = ['de', 'en', 'fr'];
  const locales = {de:'de-DE', en:'en-GB', fr:'fr-FR'};
  const storageKey = 'trimble-forestry-language';
  let language = 'de';
  try { const saved = localStorage.getItem(storageKey); if (supported.includes(saved)) language = saved; } catch {}
  const catalogue = globalThis.ForestryTranslations || {};
  const clean = s => String(s).replace(/\u00ad/g, '').replace(/[\u00a0\u202f]/g, ' ');
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keys = Object.keys(catalogue).sort((a,b) => b.length-a.length);
  const matcher = new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(escape).join('|')+')(?![\\p{L}\\p{N}_])','gu');
  const textSources = new WeakMap(), attributeSources = new WeakMap();
  let observer;
  const observedAttributes = ['aria-label','title','alt','placeholder','content'];
  function numbers(source, target) {
    return source.replace(/(?<![\p{L}\p{N}_./-])\d+(?:[.,]\d+)*(?![\p{L}\p{N}_./-])/gu, token => {
      if (/^0\d/.test(token) || (token.match(/\./g)||[]).length>1 && !/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) return token;
      const value = token.includes(',') ? Number(token.replace(/\./g,'').replace(',','.')) : /^\d{1,3}(\.\d{3})+$/.test(token) ? Number(token.replace(/\./g,'')) : Number(token);
      if (!Number.isFinite(value)) return token;
      return new Intl.NumberFormat(locales[target], {maximumFractionDigits: 2}).format(value);
    });
  }
  function text(value, target=language) {
    if (!supported.includes(target)) target='de';
    if (target==='de') return String(value);
    const source=clean(value), column=target==='en'?0:1;
    // Dynamic call-to-action word order differs from German.
    let m=source.match(/^Schicht (\d+) ausführen$/);
    if(m)return target==='en'?`Run shift ${m[1]}`:`Lancer le poste ${m[1]}`;
    m=source.match(/^Schicht (\d+) planen$/);
    if(m)return target==='en'?`Plan shift ${m[1]}`:`Planifier le poste ${m[1]}`;
    let result='',last=0;
    matcher.lastIndex=0;
    for(const match of source.matchAll(matcher)) {
      result+=numbers(source.slice(last,match.index),target)+catalogue[match[0]][column];
      last=match.index+match[0].length;
    }
    result+=numbers(source.slice(last),target);
    return result.replace(/\bfm\b/g,'m³');
  }
  function translateTextNode(node) {
    if(node.parentElement?.closest('script,style,code,[data-no-translate]'))return;
    const current=node.nodeValue, saved=textSources.get(node);
    const original=saved && current===saved.output?saved.original:current;
    const output=text(original);
    textSources.set(node,{original,output});
    if(current!==output)node.nodeValue=output;
  }
  function translateAttributes(el) {
    if(el.closest?.('[data-no-translate]')||['SCRIPT','STYLE'].includes(el.tagName))return;
    const records=attributeSources.get(el)||{};
    for(const key of observedAttributes) {
      if(!el.hasAttribute(key))continue;
      if(key==='content' && el.getAttribute('name')!=='description')continue;
      const current=el.getAttribute(key),saved=records[key];
      const original=saved && current===saved.output?saved.original:current;
      const output=text(original);records[key]={original,output};
      if(current!==output)el.setAttribute(key,output);
    }
    attributeSources.set(el,records);
  }
  function localize(root) {
    if(!root)return;
    if(root.nodeType===3){translateTextNode(root);return;}
    if(root.nodeType===1)translateAttributes(root);
    const walker=document.createTreeWalker(root,1|4);
    let node;
    while((node=walker.nextNode()))node.nodeType===3?translateTextNode(node):translateAttributes(node);
  }
  function observe(){if(typeof document!=='undefined'&&document?.documentElement)observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:observedAttributes});}
  function setLanguage(value) {
    if(!supported.includes(value))return false;
    observer?.disconnect();language=value;
    try {localStorage.setItem(storageKey,value);} catch {}
    document.documentElement.lang=value;
    localize(document.documentElement);
    syncPickers();
    observe();
    document.dispatchEvent(new CustomEvent('forestry-language-change',{detail:{language:value}}));
    return true;
  }
  function syncPickers(){document.querySelectorAll('[data-language-select]').forEach(select=>{select.value=language;});}
  function init() {
    document.addEventListener('change',event=>{if(event.target.matches?.('[data-language-select]'))setLanguage(event.target.value);});
    setLanguage(language);
    observer=new MutationObserver(records=>{
      observer.disconnect();
      for(const record of records) {
        if(record.type==='characterData')translateTextNode(record.target);
        else if(record.type==='attributes')translateAttributes(record.target);
        else for(const node of record.addedNodes)localize(node);
      }
      if(typeof document!=='undefined'&&document)syncPickers();
      observe();
    });
    observe();
  }
  if(typeof document!=='undefined') {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
    else init();
  }
  return {text,setLanguage,localize,get language(){return language;},get locale(){return locales[language];},supported};
})();
if(typeof module!=='undefined')module.exports=I18n;
