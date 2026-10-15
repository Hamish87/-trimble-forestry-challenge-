/* CFHarvest replica link (cfharvest/PLAN.md Phase 2 integration). Loaded after app.js; app.js itself is untouched.
   - wraps the global render() to add a "CFHarvest Planung" header button and a production-report line on shift receipts;
   - hands the game state to cfharvest/app/ and applies the returned state (sessionStorage, or a URL fragment when the
     replica runs on another origin, e.g. the two-server dev setup), guarded by a one-time nonce;
   - exposes window.ForestChallenge = { getState, setState };
   - adds one "Maschine (Maskin)" link to the handover dialog's title bar that opens the on-board client cfharvest/machine/
     with the same to-replica envelope (Phase 3).
   The game itself shows none of this by default: the header button, the receipt line, the plan banner and the
   handover-dialog link appear only with ?cfharvest=1 in the game URL (or localStorage['cfharvest-link']='1');
   the state exchange (window.ForestChallenge, the return envelope) keeps working either way.
   `state` and `render` are global bindings of app.js (classic scripts share one global scope), so they can be read and
   reassigned here directly. Strings are translated locally: dist/i18n.js builds its matcher before this script runs. */
'use strict';
(()=>{
  if(typeof render!=='function'||typeof state==='undefined')return;
  const KEYS={toReplica:'cfharvest-handoff-v1',toGame:'cfharvest-return-v1',plan:'cfharvest-plan-v1',nonce:'cfharvest-nonce-v1',pending:'cfharvest-pending-v1'};
  const SCHEMA=1,PHASES=['forest','plan','receipt','logistics','logisticsReceipt','settlement','result'];
  const STRINGS={
    'CFHarvest Planung':['CFHarvest Planning','Planification CFHarvest'],
    'Arbeitsplanung in der CFHarvest-Demo-Replik öffnen':['Open work planning in the CFHarvest demo replica','Ouvrir la planification dans la réplique de démonstration CFHarvest'],
    'Produktionsmeldung (HPR/FPR) an CFHarvest übertragen':['Production report (HPR/FPR) transferred to CFHarvest','Rapport de production (HPR/FPR) transmis à CFHarvest'],
    'In CFHarvest ansehen':['View in CFHarvest','Voir dans CFHarvest'],
    'Disposition aus CFHarvest übernommen':['Dispatch taken over from CFHarvest','Affectation reprise de CFHarvest'],
    'Digitaler Arbeitsauftrag bestätigt':['Digital work order confirmed','Ordre de travail numérique confirmé'],
    'Maschine':['Machine','Machine'],
    'Arbeitsauftrag im Bordrechner der Maschine öffnen (Demo)':['Open the work order in the machine\'s on-board computer (demo)','Ouvrir l’ordre de travail dans l’ordinateur de bord de la machine (démo)']};
  const SHOW=(()=>{try{if(/[?&]cfharvest(=|&|$)/.test(location.search))return true;}catch{}try{return localStorage.getItem('cfharvest-link')==='1';}catch{return false;}})();
  const lang=()=>(typeof I18n!=='undefined'?I18n:null)?.language||'de';
  const t=s=>{const row=STRINGS[s];return lang()==='en'?row?.[0]??s:lang()==='fr'?row?.[1]??s:s;};
  const tn=s=>typeof I18n!=='undefined'?I18n.text(s):s; // game phrases such as stand names
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const store={get(k){try{return sessionStorage.getItem(k);}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,v);return true;}catch{return false;}},del(k){try{sessionStorage.removeItem(k);}catch{}}};
  const isState=s=>!!s&&typeof s==='object'&&Array.isArray(s.stands)&&s.stands.length===state.stands.length&&s.stands.every((x,i)=>x&&x.id===state.stands[i].id&&['volume','remaining','stock','roadside'].every(k=>Number.isFinite(x[k])))&&Number.isInteger(s.round)&&s.round>=1&&s.round<=4&&PHASES.includes(s.phase)&&Array.isArray(s.history);
  let applied=null;

  function replicaUrl(){
    const p=location.pathname,i=p.lastIndexOf('/dist/');
    if(i>=0)return location.origin+p.slice(0,i)+'/cfharvest/app/'; // repo root served (npm run dev:cfharvest → /dist/)
    if(location.port==='3000')return location.protocol+'//'+location.hostname+':3001/cfharvest/app/'; // dist/ served on :3000
    return new URL('../cfharvest/app/',location.href).href;
  }
  function randomNonce(){try{return crypto.randomUUID();}catch{return Date.now().toString(36)+Math.random().toString(36).slice(2);}}
  /** On-board client next to the planning replica (…/cfharvest/machine/). */
  function machineUrl(){return replicaUrl().replace(/\/cfharvest\/app\/$/,'/cfharvest/machine/');}
  function open(target){
    const nonce=randomNonce();let plan=null;try{plan=JSON.parse(store.get(KEYS.plan)||'null');}catch{}
    const env={schema:SCHEMA,kind:'to-replica',state:structuredClone(state),plan,lang:lang(),returnUrl:location.href.split('#')[0],nonce,sentAt:new Date().toISOString()},json=JSON.stringify(env);
    store.set(KEYS.nonce,nonce);store.set(KEYS.toReplica,json);store.set(KEYS.pending,json);
    let url=target==='machine'?machineUrl():replicaUrl();if(new URL(url,location.href).origin!==location.origin)url+='#cfh='+encodeURIComponent(json);
    api.navigate(url);
  }
  /** Returned plan from the replica (same-origin sessionStorage or #cfh-return= fragment). Only accepted with our nonce. */
  function takeReturn(){
    let raw=store.get(KEYS.toGame);const m=/(?:^#|&)cfh-return=([^&]*)/.exec(location.hash||'');
    if(m){try{raw=decodeURIComponent(m[1]);}catch{}try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
    store.del(KEYS.toGame);if(!raw)return null;
    try{const env=JSON.parse(raw),nonce=store.get(KEYS.nonce);if(env?.schema!==SCHEMA||env.kind!=='to-game'||!nonce||env.nonce!==nonce||!isState(env.state))return null;return env;}catch{return null;}
  }
  /** Back button from the replica without "Zurück zum Spiel": restore the state that was handed over. */
  function takePending(){
    const raw=store.get(KEYS.pending);store.del(KEYS.pending);if(!raw)return null;
    try{const env=JSON.parse(raw);return env?.kind==='to-replica'&&env.nonce===store.get(KEYS.nonce)&&isState(env.state)?env:null;}catch{return null;}
  }
  function setState(next){if(!isState(next))throw Error('Ungültiger Spielstand.');state=structuredClone(next);render();return true;}
  function getState(){return structuredClone(state);}

  function decorate(){
    if(!SHOW)return;
    const header=document.querySelector('header'),anchor=document.getElementById('handoverButton');
    let btn=document.getElementById('cfharvestButton');
    if(!btn&&header){btn=document.createElement('button');btn.id='cfharvestButton';btn.className='handover-header cfh-link-button';btn.type='button';btn.setAttribute('data-no-translate','');btn.addEventListener('click',()=>open());if(anchor)anchor.after(btn);else header.append(btn);}
    if(btn){btn.textContent=t('CFHarvest Planung');btn.title=t('Arbeitsplanung in der CFHarvest-Demo-Replik öffnen');}
    const app=document.getElementById('app');if(!app)return;
    if(state.phase==='receipt'){
      const box=app.querySelector('.material-balance');
      if(box&&!box.querySelector('.cfh-hpr-line')){const span=document.createElement('span');span.className='cfh-hpr-line';span.setAttribute('data-no-translate','');box.append(span);}
      const line=box?.querySelector('.cfh-hpr-line');if(line){line.innerHTML=`✓ ${esc(t('Produktionsmeldung (HPR/FPR) an CFHarvest übertragen'))} <button type="button" class="cfh-link-inline">${esc(t('In CFHarvest ansehen'))}</button>`;line.querySelector('button').onclick=()=>open();}
    }
    app.querySelector('.cfh-applied')?.remove();
    if(applied&&state.phase==='plan'&&state.round===applied.round){
      const names=[['H-01',applied.harvester],['F-01',applied.forwarder]].filter(x=>x[1]).map(([m,id])=>m+' → '+esc(tn(state.stands.find(s=>s.id===id)?.name||id))).join(' · ');
      const p=document.createElement('p');p.className='cfh-applied plan-ready';p.setAttribute('data-no-translate','');p.setAttribute('role','status');
      p.innerHTML=`<b>${esc(t('Disposition aus CFHarvest übernommen'))}:</b> ${names}${state.handoverMode==='digital'?' · '+esc(t('Digitaler Arbeitsauftrag bestätigt')):''}`;
      app.querySelector('.shift-brief')?.after(p);
    }else if(applied&&state.phase!=='plan')applied=null;
  }
  const style=document.createElement('style');
  style.textContent='header .cfh-link-button{margin-left:0}.cfh-hpr-line{color:#0063a3;font-weight:600}.cfh-link-inline{margin-left:6px;border:1px solid #b8d2e3;background:#f3f8fc;color:#003f6b;border-radius:5px;padding:3px 8px;font-size:12px;cursor:pointer}.cfh-applied{margin:0 0 18px}.handover-titlebar .cfh-machine-link{margin:0 8px 0 auto;padding:6px 12px;font-weight:700}.cfh-machine-link small{font-style:italic;color:#516b7e}';
  document.head.append(style);

  /** Handover dialog (dist/handover.js renderHandover): one "Maschine (Maskin)" button in the title bar. */
  function decorateHandover(){
    if(!SHOW)return;
    const bar=document.querySelector('#handoverContent .handover-titlebar');if(!bar||bar.querySelector('#cfhMachineLink'))return;
    const b=document.createElement('button');b.type='button';b.id='cfhMachineLink';b.className='cfh-link-inline cfh-machine-link';b.setAttribute('data-no-translate','');
    b.innerHTML=`${esc(t('Maschine'))} <small lang="sv">(Maskin)</small>`;b.title=t('Arbeitsauftrag im Bordrechner der Maschine öffnen (Demo)');b.onclick=()=>open('machine');
    const closeBtn=bar.querySelector('#closeHandover');if(closeBtn)closeBtn.before(b);else bar.append(b);
  }
  if(typeof renderHandover==='function'){const rh=renderHandover;renderHandover=function(){const out=rh.apply(this,arguments);try{decorateHandover();}catch(e){console.error(e);}return out;};}
  const original=render;
  render=function(){const out=original.apply(this,arguments);try{decorate();}catch(e){console.error(e);}return out;};
  const api={open,replicaUrl,machineUrl,navigate:url=>location.assign(url),KEYS,decorate,visible:SHOW};
  window.ForestChallenge={getState,setState};
  window.CFHarvestLink=api;
  document.addEventListener('forestry-language-change',()=>{try{decorate();}catch{}});
  window.addEventListener('pageshow',e=>{if(e.persisted)store.del(KEYS.pending);});

  const ret=takeReturn();
  if(ret){
    store.del(KEYS.pending);if(ret.plan&&typeof ret.plan==='object')store.set(KEYS.plan,JSON.stringify(ret.plan));
    const s=ret.state,a=ret.applied||{},sid=x=>{const m=/^H-([A-Z])01$/.exec(String(x||''));return m?m[1].toLowerCase():null;};
    applied=s.phase==='plan'&&(a.harvester||a.forwarder)?{round:s.round,harvester:sid(a.harvester),forwarder:sid(a.forwarder)}:null;
    setState(s);
    if(ret.lang&&(typeof I18n!=='undefined'?I18n:null)?.supported?.includes(ret.lang)&&I18n.language!==ret.lang)I18n.setLanguage(ret.lang);
  }else{const back=takePending();if(back)setState(back.state);else decorate();}
})();
