/* Holztransport demo · application shell: hash router, header, persona and language, action dispatch (data-action
   and data-form), dialogs, toasts, map mounting, PDF/text import, demo run. Views are pure HTML producers. */
'use strict';
(function(){
const TC=globalThis.TransportCore,TV=globalThis.TransportViews;const S=TV.shared;const {esc,t,fmt}=S;
const store=TC.store.create();const I=TC.i18n;
const ui={inboxFilter:'all',dispatch:{},selection:[],driverTab:'work',tiles:'osm',mapStyle:(globalThis.TransportConfig&&globalThis.TransportConfig.mapboxStyle)||'outdoors',place:null,ledgerBasis:'',auditQ:'',editUser:null,mapFitted:false,focusSeen:null,reviewOriginal:false,driverJob:null,drawer:null,mapTall:false,boxMode:false,expanded:{},dash:{days:'0',driver:''},split:null};
/* the split view (map left, Polter right) is on by default on wide screens; the toggle is remembered per browser */
const PREF_KEY='transport-demo-ui';try{const pref=JSON.parse((typeof localStorage!=='undefined'&&localStorage.getItem(PREF_KEY))||'{}');if(typeof pref.split==='boolean')ui.split=pref.split;}catch(e){}
function splitOn(){return ui.split==null?(typeof window!=='undefined'&&window.innerWidth>=1100):!!ui.split;}
function savePref(){try{localStorage.setItem(PREF_KEY,JSON.stringify({split:ui.split}));}catch(e){}}
const ORIG=TC.originals,PH=TC.photos;
let drafts={};let dialogFn=null;let map=null,mapEl=null,placeMap=null,placeEl=null,driverMap=null,driverEl=null;
/* map engine: Mapbox GL JS when a public token is configured and the library loaded, else the built-in tile map (PLAN D13) */
let mapboxFailed=false;
const mapToken=()=>TC.mapbox?TC.mapbox.token(store.state.settings):'';
const mapboxActive=()=>!!(mapToken()&&!mapboxFailed&&globalThis.mapboxgl);
function createMap(el,opts){if(mapboxActive())return TC.mapbox.create(el,Object.assign({style:ui.mapStyle,onAuthError:()=>{if(mapboxFailed)return;mapboxFailed=true;toast(t('Mapbox-Token abgelehnt — eingebaute Karte wird verwendet'),'error');resetMaps();render();}},opts));return TC.tilemap.create(el,Object.assign({tiles:ui.tiles},opts));}
function resetMaps(){for(const m of [map,placeMap,driverMap])if(m)try{m.destroy();}catch(e){}map=placeMap=driverMap=null;for(const e of [mapEl,placeEl,driverEl])if(e)e.remove();mapEl=placeEl=driverEl=null;ui.mapFitted=false;ui.lastFocus=null;}
function loadMapbox(){const tok=mapToken();if(!tok||mapboxFailed||!TC.mapbox||typeof document==='undefined')return;if(globalThis.mapboxgl){globalThis.mapboxgl.accessToken=tok;return;}TC.mapbox.load(tok).then(()=>{resetMaps();render();}).catch(e=>{console.warn(e);mapboxFailed=true;});}
const $=sel=>document.querySelector(sel);
const api={navigate:h=>{if(location.hash!==h)location.hash=h;render();},print:()=>window.print(),download:(name,text)=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();}catch(e){console.warn(e);}},confirm:msg=>typeof window.confirm==='function'?window.confirm(msg):true};
function route(){const h=location.hash.replace(/^#\/?/,'');const [path,qs]=h.split('?');const parts=path.split('/').filter(Boolean);const query={};new URLSearchParams(qs||'').forEach((v,k)=>{query[k]=v;});return {name:parts[0]||'inbox',parts,query,hash:h};}
function setQuery(patch){const r=route();const q=Object.assign({},r.query,patch);for(const k of Object.keys(q))if(q[k]===undefined||q[k]==='')delete q[k];const qs=new URLSearchParams(q).toString();api.navigate('#/'+r.parts.join('/')+(qs?'?'+qs:''));}
const newDraft=()=>({page:null,highlight:null,fields:{},lines:{},destinationId:'',note:''});
function ctx(){const state=store.state;const user=state.users.find(u=>u.id===state.ui.persona)||state.users[0];return {state,store,route:route(),ui,draft:id=>(drafts[id]=drafts[id]||newDraft()),persona:state.ui.persona,user,now:store.clock(),canSeeRates:TC.model.can(user,'seeRates')||state.settings.driverSeesRates,t,mapboxActive:mapboxActive(),split:splitOn()};}
/* ---------- header ---------- */
function header(c){
  const {state}=c;const needs=Object.values(state.documents).filter(d=>d.status==='NeedsReview').length;const loc=Object.values(state.stacks).filter(s=>s.location.status!=='confirmed'&&s.progress!=='Blocked').length+state.conflicts.filter(x=>!x.resolved).length;const match=Object.values(state.receipts).filter(r=>r.matchState!=='Matched').length;
  const items=[['inbox',t('Posteingang'),needs,'email'],['dispatch',t('Disposition'),loc,'map_marker_multiple'],['driver',t('Mobil'),state.ui.queue.length,'phone_mobile'],['receipts',t('Belege & Abgleich'),match,'clipboard_check'],['dashboard',t('Dashboard'),0,'dashboard'],['reports',t('Berichte'),0,'document'],['admin',t('Verwaltung'),0,'settings'],['help',t('Hilfe'),0,'help_outlined']];
  $('#tpNav').innerHTML=items.map(([k,l,n,ic])=>`<a href="#/${k}" class="${c.route.name===k?'active':''}" title="${l}"><i class="modus-icons" aria-hidden="true">${ic}</i><span class="lbl">${l}</span>${n?` <span class="cnt cnt-red">${n}</span>`:''}</a>`).join('');
  const roles=c.user.roles.map(r=>t({admin:'Administrator',dispatcher:'Disponent',driver:'Fahrer'}[r])).join(' + ');
  $('#tpPersona').innerHTML=`<label>${t('Persona')} ${S.select('persona',state.users.map(u=>[u.id,`${u.name} · ${t(u.title)}`]),state.ui.persona,'data-action="persona-switch"')}</label>`;
  $('#tpLang').value=I?I.lang():'de';
  /* static shell text is German in index.html; it follows the UI language here (the catalogue returns the German when a language has no entry) */
  for(const [sel,txt] of [['.tp-brand small',t('Disposition · Carrier-first · Demo')],['.tp-lang>span',t('Sprache')],['.tp-footer span:first-child',t('Demo eines vorgeschlagenen Arbeitsablaufs · keine Aussage über bestehende LOGIBALL- oder Trimble-Fähigkeiten · Dokumente sind anonymisierte Nachbildungen der Beispielsammlung · Kartenkacheln © OpenStreetMap-Mitwirkende')],['.tp-footer span:last-child',t('PLANEN. FAHREN. ABRECHNEN.')]]){const el=$(sel);if(el&&el.textContent!==txt)el.textContent=txt;}
  $('#tpLang').setAttribute('aria-label',t('Sprache wählen'));$('#tpNav').setAttribute('aria-label',t('Hauptnavigation'));document.title=t('Holztransport · Disposition · Demo | Trimble Forestry');
  $('#tpBanner').innerHTML=`<span><strong>${esc(S.party(state,state.carrierId))}</strong> · ${esc(roles)}</span><span>${state.ui.online===false?`<i class="modus-icons" aria-hidden="true">wifi_off</i> `+S.pill('amber',t('Offline (Gerät des Fahrers)'),'small'):`<i class="modus-icons ok" aria-hidden="true">wifi</i> `+S.pill('green',t('Online'),'small')} ${state.ui.queue.length?S.pill('amber',`${state.ui.queue.length} ${t('ausstehend')}`,'small'):''}</span><span class="muted small">${t('Demo')} · ${esc(t('vorgeschlagener Arbeitsablauf, keine Aussage über bestehende Produktfähigkeiten'))} · ${Object.keys(state.documents).length} ${t('Dokumente')} · ${Object.keys(state.orders).length} ${t('Aufträge')}</span>`;
}
/* ---------- render ---------- */
function render(){
  const c=ctx();const r=c.route;document.documentElement.lang=I?I.lang():'de';header(c);const main=$('#tpMain');document.body.classList.toggle('print-route',r.name==='print');
  let html;try{switch(r.name){case 'inbox':html=TV.inbox.render(c);break;case 'dispatch':html=TV.dispatch.render(c);break;case 'driver':html=TV.driver.render(c);break;case 'receipts':html=TV.receipts.render(c);break;case 'admin':html=TV.admin.render(c);break;case 'reports':html=TV.reports.render(c);break;case 'dashboard':html=TV.dashboard.render(c);break;case 'print':html=r.parts[1]==='note'?TV.reports.printNote(c,r.parts[2]):c.state.orders[r.parts[2]]?TV.reports.orderReport(c,c.state.orders[r.parts[2]],true):S.empty(t('Nicht gefunden'));break;case 'help':html=help(c);break;default:html=TV.inbox.render(c);}}catch(e){console.error(e);html=`${S.alert('amber',`${esc(t('Darstellungsfehler'))}: ${esc(e.message)}`)}`;}
  main.innerHTML=html;afterRender(c);
}
function afterRender(c){
  const el=$('#dispatchMap');if(el)mountDispatchMap(c,el);
  const dmAll=$('#driverMap[data-all]');if(dmAll&&!dmAll.closest('dialog'))mountDriverMap(dmAll);
  const oc=$('#originalCanvas');if(oc)renderOriginal(oc.closest('.orig-view'));
  const hl=$('.fx-line.hl');if(hl&&hl.scrollIntoView)hl.scrollIntoView({block:'center'});
  const focusRow=$('.stack-row.focus');if(focusRow&&c.route.query.stack!==ui.focusSeen){ui.focusSeen=c.route.query.stack;if(!c.split&&focusRow.scrollIntoView)focusRow.scrollIntoView({block:'center'});} /* the split view shows the card beside the map, so the page stays where it is */
}
function markersFor(c){
  const {state}=c;const customers=[...new Set(Object.values(state.orders).map(o=>o.customerId))];const filtered=TV.dispatch.applyFilters(c,Object.values(state.stacks));const ms=[];
  for(const st of filtered){if(!st.confirmed)continue;const o=state.orders[st.orderId];const ci=customers.indexOf(o.customerId)%6;const due=S.dueClass(o,c.now);
    ms.push({id:st.key,lat:st.confirmed.lat,lon:st.confirmed.lon,title:`${S.party(state,o.customerId)} · ${st.tempKey} · ${fmt.qty(st.planned.qty,st.planned.unit)} · ${S.statusLabel('stack',st.progress)}`,className:`pin c${ci} p-${st.progress.toLowerCase()} ${due} ${c.route.query.stack===st.key||(ui.selection||[]).includes(st.key)?'selected':''} ${st.publication.scope!=='none'?'published':''}`,label:S.shortRef(st),html:`<span class="tm-pin"><b>${esc(S.shortRef(st))}</b></span>`,onClick:()=>setQuery({stack:st.key})});}
  const dests=new Set(Object.values(state.orders).map(o=>o.destinationId).filter(Boolean));for(const id of dests){const p=state.parties.find(x=>x.id===id);if(p&&p.lat!=null)ms.push({id:'dest-'+id,lat:p.lat,lon:p.lon,title:`${t('Zielwerk')}: ${p.name}`,className:'pin dest',html:`<span class="tm-pin dest" title="${esc(p.name)}">⌂</span>`,noCluster:true,button:false});}
  const base=state.parties.find(p=>p.id===state.carrierId);if(base)ms.push({id:'base',lat:base.lat,lon:base.lon,title:base.name,className:'pin base',html:'<span class="tm-pin base">▲</span>',noCluster:true,button:false});
  return ms;
}
function mountDispatchMap(c,container){
  if(!mapEl){mapEl=document.createElement('div');mapEl.className='map-inner';}
  container.appendChild(mapEl);
  if(!map){map=createMap(mapEl,{lat:48.3,lon:9.7,zoom:8,clusterBelow:11,onBoxSelect:(keys,o)=>{const set=new Set(o&&o.additive?ui.selection:[]);for(const k of keys)set.add(k);ui.selection=[...set];for(const k of keys){const st=store.state.stacks[k];if(st)ui.expanded[st.orderId]=true;}render();if(keys.length)toast(`${keys.length} ${t('Polter auf der Karte ausgewählt')}`);}});}
  if(map.setBoxMode)map.setBoxMode(ui.boxMode);
  const ms=markersFor(c);map.setMarkers(ms);
  const pts=ms.filter(m=>!m.id.startsWith('dest-')&&m.id!=='base').map(m=>[m.lat,m.lon]);
  if(!ui.mapFitted&&pts.length){map.fitBounds(pts,13);ui.mapFitted=true;}
  const focus=c.route.query.stack&&c.state.stacks[c.route.query.stack];if(focus&&focus.confirmed&&ui.lastFocus!==focus.key){ui.lastFocus=focus.key;map.setView(focus.confirmed.lat,focus.confirmed.lon,Math.max(map.state.zoom,14));}
  if(focus&&focus.confirmed&&!c.split)map.setPopup({key:focus.key,lat:focus.confirmed.lat,lon:focus.confirmed.lon,html:TV.dispatch.pinCard(c,focus)});else map.setPopup(null); /* in the split view the pane beside the map carries the card */
}
/* original documents: render a stored PDF page (or image) into the review canvas / the original dialog */
async function renderOriginal(view){
  if(!view||!ORIG)return;const docId=view.dataset.doc,page=Number(view.dataset.page||1);const canvas=view.querySelector('canvas'),fb=view.querySelector('.orig-fallback');const rec=await ORIG.get(docId);
  if(!rec){if(fb)fb.textContent=t('Kein Original im Browser-Speicher — bitte erneut hinterlegen.');return;}
  if(!/pdf/i.test(rec.type)){const url=await ORIG.objectUrl(docId);if(canvas)canvas.hidden=true;if(fb)fb.innerHTML=`<img class="orig-img" src="${url}" alt="${t('Original')}">`;return;}
  if(!globalThis.pdfjsLib){if(fb)fb.textContent=t('PDF-Anzeige nicht verfügbar (pdf.js nicht geladen) — Nachbildung verwenden.');return;}
  try{const r=await ORIG.renderPage(docId,page,canvas,Math.min(900,view.clientWidth||800));if(fb)fb.textContent=r?`${t('Seite')} ${Math.min(page,r.pages)} / ${r.pages}`:'';}catch(e){if(fb)fb.textContent=t('Original konnte nicht gerendert werden')+': '+e.message;}
}
async function renderOriginalPages(container){
  if(!container||!ORIG)return;const docId=container.dataset.doc;const rec=await ORIG.get(docId);if(!rec){container.innerHTML=`<div class="empty">${esc(t('Kein Original im Browser-Speicher.'))}</div>`;return;}
  if(!/pdf/i.test(rec.type)){const url=await ORIG.objectUrl(docId);container.innerHTML=`<img class="orig-img" src="${url}" alt="${t('Original')}">`;return;}
  if(!globalThis.pdfjsLib){container.innerHTML=`<div class="empty">${esc(t('PDF-Anzeige nicht verfügbar (pdf.js nicht geladen) — Nachbildung verwenden.'))}</div>`;return;}
  const doc=await ORIG.pdf(docId);if(!doc)return;container.innerHTML='';for(let n=1;n<=doc.numPages;n++){const wrap=document.createElement('div');wrap.className='orig-page';const cv=document.createElement('canvas');wrap.appendChild(cv);const cap=document.createElement('div');cap.className='muted small';cap.textContent=`${t('Seite')} ${n} / ${doc.numPages}`;wrap.appendChild(cap);container.appendChild(wrap);await ORIG.renderPage(docId,n,cv,Math.min(900,container.clientWidth||800));}
}
async function readPhotos(files){const out=[];if(!files||!PH)return out;for(const f of [...files].slice(0,4)){try{out.push(await PH.fromFile(f));}catch(e){console.warn(e);}}return out;}
function fitMap(){if(!map)return;const c=ctx();const pts=markersFor(c).filter(m=>!m.id.startsWith('dest-')&&m.id!=='base').map(m=>[m.lat,m.lon]);map.fitBounds(pts,13);}
/* ---------- dialogs & toast ---------- */
function dialog(fn){dialogFn=fn;renderDialog();const d=$('#tpDialog');if(!d.open)d.showModal();relayout();if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>relayout());}
function relayout(){for(const m of [map,placeMap,driverMap])if(m)try{m.render();}catch(e){}}
function renderDialog(){const d=$('#tpDialog');if(!dialogFn)return;d.innerHTML=dialogFn(ctx());const pm=d.querySelector('#placeMap');if(pm)mountPlaceMap(pm);const dm=d.querySelector('#driverMap');if(dm)mountDriverMap(dm);const op=d.querySelector('.orig-pages[data-doc]');if(op&&op.querySelector('.orig-fallback'))renderOriginalPages(op);}
function closeDialog(){const d=$('#tpDialog');dialogFn=null;if(d.open)d.close();d.innerHTML='';}
let toastTimer=null;function toast(msg,kind='ok'){const el=$('#tpToast');el.textContent=msg;el.className='tp-toast show '+kind;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.className='tp-toast';},4500);}
function mountPlaceMap(container){if(!placeEl){placeEl=document.createElement('div');placeEl.className='map-inner';}container.appendChild(placeEl);
  if(!placeMap){placeMap=createMap(placeEl,{zoom:13,cluster:false,onPlace:p=>{ui.place.lat=Math.round(p.lat*1e5)/1e5;ui.place.lon=Math.round(p.lon*1e5)/1e5;renderDialog();}});}
  placeMap.setPlaceMode(true);const p=ui.place||{};const c=ctx();const st=p.stackKey?c.state.stacks[p.stackKey]:null;
  let center=null;if(p.lat!=null)center=[p.lat,p.lon];else if(st&&st.confirmed)center=[st.confirmed.lat,st.confirmed.lon];else{const prof=c.state.profiles.find(x=>x.id===(st?c.state.orders[st.orderId].profileId:(c.state.documents[p.docId]||{}).profileId));if(prof&&prof.region)center=[prof.region.lat,prof.region.lon];}
  if(center&&!p.centered){placeMap.setView(center[0],center[1],p.lat!=null?15:12);p.centered=true;}
  const ms=[];if(p.lat!=null)ms.push({id:'new',lat:p.lat,lon:p.lon,className:'pin new',html:'<span class="tm-pin new"><b>+</b></span>',noCluster:true,button:false});
  for(const s of Object.values(c.state.stacks))if(s.confirmed&&(!st||s.key!==st.key))ms.push({id:s.key,lat:s.confirmed.lat,lon:s.confirmed.lon,className:'pin faint',label:S.shortRef(s),html:`<span class="tm-pin faint"><b>${esc(S.shortRef(s))}</b></span>`,noCluster:true,button:false,title:s.tempKey});
  placeMap.setMarkers(ms);
}
function mountDriverMap(container){if(!driverEl){driverEl=document.createElement('div');driverEl.className='map-inner';}container.appendChild(driverEl);
  if(!driverMap)driverMap=createMap(driverEl,{zoom:9,clusterBelow:10});
  const c=ctx();const me=store.state.ui.persona;
  if(container.dataset.all==='1'){ /* the phone's map tab: every load the driver may take */
    const drv=store.state.users.find(u=>u.id===me);if(!drv)return;if(ui.driverMapPersona!==me){ui.driverMapPersona=me;ui.driverMapFitted=false;ui.driverMapStack=null;}
    const dl=store.state.ui.downloaded[me];let work=store.visibleWork(me).filter(w=>w.stack.confirmed&&w.stack.progress!=='Cleared');if(store.state.ui.online===false&&dl)work=work.filter(w=>dl.stackKeys.includes(w.stack.key)||w.allocation);
    const ms=work.map(w=>{const st=w.stack,o=c.state.orders[st.orderId];const mine=!!w.allocation;return {id:st.key,lat:st.confirmed.lat,lon:st.confirmed.lon,title:`${S.party(c.state,o.customerId)} · ${st.tempKey} · ${fmt.qty(st.planned.qty,st.planned.unit)}`,className:`pin ${mine?'mine':'shared'} p-${st.progress.toLowerCase()} ${S.dueClass(o,c.now)} ${ui.driverMapStack===st.key?'selected':''} published`,label:S.shortRef(st),ci:mine?0:5,html:`<span class="tm-pin"><b>${esc(S.shortRef(st))}</b></span>`,onClick:()=>{ui.driverMapStack=st.key;render();}};});
    const dests=new Set(work.map(w=>w.order.destinationId).filter(Boolean));for(const id of dests){const p=c.state.parties.find(x=>x.id===id);if(p&&p.lat!=null)ms.push({id:'dest-'+id,lat:p.lat,lon:p.lon,title:`${t('Zielwerk')}: ${p.name}`,className:'pin dest',html:`<span class="tm-pin dest" title="${esc(p.name)}">⌂</span>`,noCluster:true,button:false});}
    const base=c.state.parties.find(x=>x.id===c.state.carrierId);if(base)ms.push({id:'base',lat:base.lat,lon:base.lon,title:base.name,className:'pin base',html:'<span class="tm-pin base">▲</span>',noCluster:true,button:false});
    driverMap.setMarkers(ms);if(driverMap.setBoxMode)driverMap.setBoxMode(false);
    const pts=work.map(w=>[w.stack.confirmed.lat,w.stack.confirmed.lon]);if(!ui.driverMapFitted&&pts.length){driverMap.fitBounds(pts,12);ui.driverMapFitted=true;}
    driverMap.setPopup(null); /* the phone shows the selected stack's card below the map, not as a popup */
    return;}
  const st=ui.driverMapStack?store.state.stacks[ui.driverMapStack]:null;ui.driverMapFitted=false;
  if(st&&st.confirmed){driverMap.setView(st.confirmed.lat,st.confirmed.lon,14);driverMap.setMarkers([{id:st.key,lat:st.confirmed.lat,lon:st.confirmed.lon,className:'pin c0',label:S.shortRef(st),html:`<span class="tm-pin"><b>${esc(S.shortRef(st))}</b></span>`,noCluster:true,button:false}]);driverMap.setPopup({key:st.key,lat:st.confirmed.lat,lon:st.confirmed.lon,html:TV.dispatch.pinCard(c,st,{driver:me})});}}
function openPlace(){ui.place.centered=false;dialog(c=>TV.dispatch.placeDialog(c,ui.place.stackKey||null,ui.place.docId?{docId:ui.place.docId,tempKey:ui.place.tempKey}:null));}
/* ---------- helpers ---------- */
function draftToDecisions(d){const out={fields:{},lines:d.lines,destinationId:d.destinationId||undefined,note:d.note||undefined};for(const [k,v] of Object.entries(d.fields||{}))if(v!==''&&v!=null)out.fields[k]=v;return out;}
function currentDocId(){const r=route();return r.name==='inbox'?r.parts[1]:null;}
function fail(e){console.error(e);toast(e.message||String(e),'error');}
function withRender(fn){return (d,el,ev)=>{try{fn(d,el,ev);}catch(e){fail(e);}render();};}
/* ---------- actions ---------- */
const actions={
  'deliver-demo':withRender(()=>{const n=store.apply('deliverDemoMail').length;toast(`${n} ${t('Demo-E-Mails zugestellt')}`);}),
  'deliver-scenario':withRender(d=>{const doc=store.apply('deliverScenario',d.scenario);toast(`${t('Zugestellt')}: ${doc.subject}`);api.navigate('#/inbox/'+doc.id);}),
  'deliver-tickets':withRender(()=>{const n=store.apply('deliverTickets').length;toast(`${n} ${t('Werksscheine zugestellt')}`);}),
  'import-open':()=>dialog(c=>TV.inbox.importDialog(c)),
  'inbox-open':d=>api.navigate('#/inbox/'+d.doc),
  'inbox-filter':withRender((d,el)=>{ui.inboxFilter=el.value;}),
  'review-page':withRender(d=>{const dr=ctx().draft(d.doc);dr.page=Number(d.page);dr.highlight=null;}),
  'review-highlight':withRender(d=>{const id=currentDocId();if(!id)return;const dr=ctx().draft(id);dr.page=Number(d.page);dr.highlight={page:Number(d.page),line:Number(d.lineNo)};}),
  'review-field':(d,el)=>{const id=currentDocId();if(!id)return;ctx().draft(id).fields[d.field]=el.value;},
  'review-destination':withRender((d,el)=>{const id=currentDocId();ctx().draft(id).destinationId=el.value;}),
  'review-note':(d,el)=>{const id=currentDocId();if(id)ctx().draft(id).note=el.value;},
  'review-line-accept':withRender(d=>{ctx().draft(d.doc).lines[d.stack]={location:{method:d.method}};}),
  'review-line-skip':withRender(d=>{ctx().draft(d.doc).lines[d.stack]={accept:false};}),
  'review-line-reset':withRender(d=>{delete ctx().draft(d.doc).lines[d.stack];}),
  'review-line-place':d=>{ui.place={docId:d.doc,tempKey:d.stack,page:null,pin:null,lat:null,lon:null,note:''};openPlace();},
  'review-line-focus':d=>{const tr=document.querySelector(`.stacks tr[data-stack="${CSS.escape?CSS.escape(d.stack):d.stack}"]`);if(tr&&tr.scrollIntoView){tr.scrollIntoView({block:'center'});tr.classList.add('flash');}},
  'review-release':d=>{try{const dr=ctx().draft(d.doc);const r=store.apply('review',d.doc,draftToDecisions(dr));delete drafts[d.doc];toast(`${t('Freigegeben')}: ${r.order.id}${r.changes?' · '+t('Version')+' '+r.order.versions.length:''}`);api.navigate('#/dispatch?order='+r.order.id);}catch(e){fail(e);}},
  'review-duplicate':withRender(d=>{store.apply('markDuplicate',d.doc);}),
  'review-fail':withRender(d=>{store.apply('failDocument',d.doc,t('manuell erfassen'));}),
  'review-retry':withRender(d=>{store.apply('retryDocument',d.doc);}),
  'excerpt-open':d=>dialog(c=>TV.inbox.excerptDialog(c,d.doc)),
  'place-page':d=>{ui.place.page=Number(d.page);renderDialog();},
  'place-pin':d=>{ui.place.pin=d.pin;renderDialog();},
  'place-coord':(d,el)=>{ui.place[el.name]=el.value===''?null:Number(el.value);ui.place.centered=false;renderDialog();},
  'place-save':withRender(d=>{const p=ui.place;const note=($('#tpDialog [name=note]')||{}).value||'';if(p.lat==null)throw new Error(t('Noch kein Punkt gewählt'));if(d.stack){store.apply('confirmLocation',d.stack,{method:d.method,lat:p.lat,lon:p.lon,note,fromPage:p.page});toast(t('Standort bestätigt'));}else{ctx().draft(d.doc).lines[d.temp]={location:{method:d.method,lat:p.lat,lon:p.lon,note,fromPage:p.page}};}closeDialog();}),
  'dispatch-filter':withRender((d,el)=>{ui.dispatch[el.name]=el.value;}),
  'dispatch-select':withRender((d,el)=>{ui.selection=el.checked?[...new Set([...ui.selection,d.stack])]:ui.selection.filter(k=>k!==d.stack);}),
  'dispatch-select-order':withRender((d,el)=>{const keys=store.state.orders[d.order].stackKeys;ui.selection=el.checked?[...new Set([...ui.selection,...keys])]:ui.selection.filter(k=>!keys.includes(k));}),
  'dispatch-select-all':withRender((d,el)=>{const c=ctx();const keys=TV.dispatch.applyFilters(c,Object.values(c.state.stacks)).map(s=>s.key);ui.selection=el.checked?keys:[];}),
  'dispatch-clear':withRender(()=>{ui.selection=[];}),
  'dispatch-focus':d=>setQuery({stack:d.stack||undefined}),
  'publish-open':d=>{const keys=d.stack?[d.stack]:ui.selection;if(!keys.length)return toast(t('Keine Polter ausgewählt'),'error');dialog(c=>TV.dispatch.publishDialog(c,keys));},
  'allocate-open':d=>{const keys=d.stack?[d.stack]:ui.selection;if(!keys.length)return toast(t('Keine Polter ausgewählt'),'error');dialog(c=>TV.dispatch.allocateDialog(c,keys,d.reassign||''));},
  'unpublish':withRender(()=>{store.apply('unpublish',ui.selection);}),
  'block-selected':withRender(()=>{for(const k of ui.selection)store.apply('block',k,t('durch Disposition blockiert'),true);}),
  'block-toggle':withRender(d=>{store.apply('block',d.stack,t('durch Disposition blockiert'),d.on==='1');}),
  'resolve-stack':withRender(d=>{store.apply('resolveStack',d.stack,t('durch Disposition erledigt'));}),
  'problem-clear':withRender(d=>{store.apply('setStackField',d.stack,'problem',null);}),
  'location-confirm':withRender(d=>{store.apply('confirmLocation',d.stack,{method:d.method});toast(t('Standort bestätigt'));}),
  'location-place':d=>{ui.place={stackKey:d.stack,page:null,pin:null,lat:null,lon:null,note:''};openPlace();},
  'withdraw':withRender(d=>{store.apply('withdraw',d.alloc);}),
  'conflict-resolve':withRender(d=>{store.apply('resolveConflict',d.conflict,d.resolution);}),
  'map-zoom':d=>{if(map)map.zoomBy(Number(d.dir));},
  'map-fit':()=>fitMap(),
  'map-source':(d,el)=>{if(mapboxActive())ui.mapStyle=el.value;else ui.tiles=el.value;for(const m of [map,placeMap,driverMap])if(m)m.setSource(el.value);},
  'drawer-toggle':withRender(d=>{ui.drawer=ui.drawer===d.key?null:d.key;}),
  'dash-filter':(d,el)=>{ui.dash=ui.dash||{};ui.dash[el.name]=el.value;render();},
  'map-tall':withRender(()=>{ui.mapTall=!ui.mapTall;}),
  'map-split':d=>{ui.split=d.on==='1'?true:d.on==='0'?false:!splitOn();savePref();if(d.stack&&route().query.stack!==d.stack)setQuery({stack:d.stack});else render();},
  'map-box':withRender(()=>{ui.boxMode=!ui.boxMode;if(map&&map.setBoxMode)map.setBoxMode(ui.boxMode);}),
  'order-toggle':withRender(d=>{ui.expanded[d.order]=!TV.dispatch.isOpen(ctx(),store.state.orders[d.order]);}),
  'orders-expand':withRender(d=>{const on=d.on==='1';ui.expanded={};for(const id of Object.keys(store.state.orders))ui.expanded[id]=on;}),
  'persona-switch':withRender((d,el)=>{if(el.value)store.apply('setPersona',el.value);}),
  'lang-switch':withRender((d,el)=>{if(I)I.setLang(el.value);}),
  'driver-online':withRender(()=>{const on=store.state.ui.online===false;store.setOnline(on);toast(on?t('Online — Warteschlange übertragen'):t('Offline — Aktionen werden lokal gespeichert'));}),
  'driver-download':withRender(()=>{const r=store.download(store.state.ui.persona);toast(`${r.stackKeys.length} ${t('Polter heruntergeladen')}`);}),
  'driver-sync':withRender(()=>{const r=store.sync();toast(`${r.synced} ${t('übertragen')}, ${r.duplicates} ${t('Wiederholungen ignoriert')}, ${r.conflicts} ${t('Konflikte')}`);}),
  'driver-tab':withRender(d=>{ui.driverTab=d.tab;}),
  'driver-accept':withRender(d=>{const r=store.apply('accept',d.alloc);if(!r.ok)toast(r.conflict.message,'error');else toast(t('Zuteilung angenommen'));}),
  'driver-reserve':withRender(d=>{store.apply('reserve',d.stack);toast(t('Reserviert'));}),
  'driver-map':d=>{ui.driverMapStack=d.stack;dialog(c=>TV.driver.mapDialog(c,c.state.stacks[d.stack]));},
  'pickup-open':d=>dialog(c=>TV.driver.pickupDialog(c,c.state.stacks[d.stack])),
  'cleared-open':d=>dialog(c=>TV.driver.clearedDialog(c,c.state.stacks[d.stack])),
  'problem-open':d=>dialog(c=>TV.driver.problemDialog(c,c.state.stacks[d.stack])),
  'note-open':d=>dialog(c=>TV.driver.noteDialog(c,c.state.loads[d.load])),
  'arrived':withRender(d=>{store.driverEvent({kind:'arrived',loadId:d.load});}),
  'unload-open':d=>dialog(c=>TV.driver.unloadDialog(c,c.state.loads[d.load])),
  'ticket-photo-open':d=>dialog(c=>TV.driver.ticketDialog(c,c.state.loads[d.load])),
  'receipt-assign-open':d=>dialog(c=>TV.receipts.assignDialog(c,c.state.receipts[d.receipt])),
  'receipt-dispute':withRender(d=>{store.apply('disputeReceipt',d.receipt,t('durch Disposition strittig gestellt'));}),
  'recon-order':(d,el)=>setQuery({order:el.value}),
  'ledger-filter':withRender((d,el)=>{ui.ledgerBasis=el.value;}),
  'load-reconciled':withRender(d=>{store.apply('markLoadReconciled',d.load,t('geprüft'));}),
  'export-json':d=>{api.download(`${d.order}-export.json`,JSON.stringify(store.exportOrder(d.order),null,2));toast(t('Export erstellt — nicht versendet'));},
  'report-sent':withRender(d=>{const ch=$('#reportChannel');store.apply('markReportSent',d.order,ch?ch.value:t('manuell'));toast(t('Als gesendet markiert (Audit-Eintrag)'));}),
  'print':()=>api.print(),
  'user-edit':withRender(d=>{ui.editUser=d.user||null;}),
  'user-remove':withRender(d=>{store.apply('removeUser',d.user);}),
  'audit-filter':withRender((d,el)=>{ui.auditQ=el.value;}),
  'demo-run':withRender(()=>{if(!api.confirm(t('Alle Daten zurücksetzen und den Demo-Durchlauf abspielen?')))return;store.reset();drafts={};ui.selection=[];ui.mapFitted=false;TC.tour.run(store);toast(t('Demo-Durchlauf abgespielt'));api.navigate('#/dispatch');}),
  'data-reset':withRender(()=>{if(!api.confirm(t('Alle Daten dieses Arbeitsbereichs löschen?')))return;store.reset();drafts={};ui.selection=[];ui.mapFitted=false;toast(t('Zurückgesetzt'));}),
  'review-original':withRender(d=>{ui.reviewOriginal=d.on==='1';}),
  'original-attach':async(d,el)=>{const f=el.files&&el.files[0];if(!f)return;try{const rec=await ORIG.store(d.doc,f);let pages=null;try{const doc=await ORIG.pdf(d.doc);pages=doc?doc.numPages:null;}catch(e){}store.apply('setDocumentOriginal',d.doc,{name:rec.name,size:rec.size,type:rec.type,pages});ui.reviewOriginal=true;toast(t('Original im Browser hinterlegt'));}catch(e){fail(e);}render();},
  'driver-original-toggle':withRender((d,el)=>{store.apply('setDriverOriginal',d.doc,el.checked);}),
  'original-open':d=>dialog(c=>TV.driver.originalDialog(c,d.doc)),
  'photo-open':d=>dialog(()=>TV.driver.photoDialog(ctx(),d.src,d.caption,d.credit,d.page)),
  'map-popup-close':()=>{if(ui.driverMapStack&&route().name==='driver'){ui.driverMapStack=null;render();return;}setQuery({stack:undefined});},
  'driver-job':withRender(d=>{ui.driverJob=d.stack;}),
  'driver-pick':withRender(d=>{const st=store.state.stacks[d.stack];if(!st)return;const me=store.state.ui.persona;const a=Object.values(store.state.allocations).find(x=>x.stackKey===st.key&&x.driverId===me&&['Proposed','Accepted','Reserved'].includes(x.state));
    try{if(a&&a.state==='Proposed'){const r=store.apply('accept',a.id);if(!r.ok){toast(r.conflict.message,'error');return;}}else if(!a){store.apply('reserve',st.key);}
      ui.driverJob=st.key;ui.driverTab='work';toast(t('Als nächste Aufgabe gewählt'));}catch(e){toast(e.message||String(e),'error');}}),
  'dialog-close':()=>closeDialog(),
  'noop':()=>{}
};
/* ---------- forms ---------- */
const num=v=>v===''||v==null?null:Number(String(v).replace(',','.'));const F=(f,name)=>f.querySelector(`[name="${name}"]`)||{value:'',checked:false,files:null};const radio=(f,name,fallback)=>{const el=f.querySelector(`[name="${name}"]:checked`);return el?el.value:fallback;};
const forms={
  import:async f=>{const sender=F(f,'sender').value.trim(),subject=F(f,'subject').value.trim();let pages=[];const file=f.pdf&&F(f,'pdf').files&&F(f,'pdf').files[0];
    if(file&&globalThis.pdfjsLib){pages=await pdfPages(file);}else{const txt=F(f,'text').value;pages=txt.split(/\n---+\n|\f/).map((blk,i)=>({n:i+1,kind:'text',lines:blk.split('\n').map(l=>l.replace(/ {3,}/g,'\t').trimEnd()).filter(l=>l.trim())})).filter(p=>p.lines.length);}
    if(!pages.length)throw new Error(t('Kein Text gefunden'));const doc={id:'DOC-IMP-'+Date.now().toString(36).toUpperCase(),sender,senderName:sender,subject,receivedAt:store.clock(),attachments:[{name:file?file.name:'import.txt',pages}],source:file?'upload':'paste',note:t('manueller Import')};
    const rec=store.apply('importDocument',doc);if(file&&ORIG){try{const saved=await ORIG.store(rec.id,file,{pages:pages.length});store.apply('setDocumentOriginal',rec.id,{name:saved.name,size:saved.size,type:saved.type,pages:pages.length});}catch(e){console.warn(e);}}closeDialog();api.navigate('#/inbox/'+rec.id);toast(`${t('Importiert')}: ${rec.status}`);},
  publish:f=>{const keys=F(f,'keys').value.split('|').filter(Boolean);const scope=radio(f,'scope','fleet');const targets=scope==='group'?[F(f,'group').value]:scope==='named'?[...f.querySelectorAll('[name=driver]:checked')].map(x=>x.value):[];if(scope==='named'&&!targets.length)throw new Error(t('Mindestens einen Fahrer wählen'));store.apply('publish',keys,scope,targets);closeDialog();ui.selection=[];toast(`${keys.length} ${t('Polter veröffentlicht')}`);},
  allocate:f=>{const keys=F(f,'keys').value.split('|').filter(Boolean);const driver=F(f,'driver').value,truck=F(f,'truck').value||undefined;const kind=radio(f,'share','whole');const share=kind==='whole'?{kind:'whole'}:kind==='loads'?{kind:'loads',value:Number(F(f,'loads').value)||1}:{kind:'qty',value:num(F(f,'qty').value)};
    if(F(f,'reassign').value){store.apply('withdraw',F(f,'reassign').value,{driverId:driver,truckId:truck});}
    else{const st=store.state;const clash=keys.map(k=>st.stacks[k]).filter(Boolean).find(x=>Object.values(st.allocations).some(a=>a.stackKey===x.key&&['Proposed','Accepted','Reserved'].includes(a.state)&&(!a.share||a.share.kind==='whole')));
      if(clash){const who=Object.values(st.allocations).filter(a=>a.stackKey===clash.key&&['Proposed','Accepted','Reserved'].includes(a.state)).map(a=>S.userName(st,a.driverId)).join(', ');toast(`${S.stackRef(clash)}: ${t('bereits ganz zugeteilt an')} ${who} — ${t('Zuerst zurückziehen oder „Neu zuteilen“ verwenden.')}`,'error');return;}
      for(const k of keys)store.apply('allocate',k,driver,truck,share);}
    closeDialog();ui.selection=[];toast(t('Zugeteilt'));},
  pickup:async f=>{const st=store.state.stacks[F(f,'stack').value];const unknown=F(f,'unknown').checked;const qty=unknown?null:num(F(f,'qty').value);const photos=await readPhotos(F(f,'photo').files);const r=store.driverEvent({kind:'pickup',stackKey:st.key,truckId:F(f,'truck').value,qty,unit:qty!=null?(st.planned.unit||null):null,pieces:num(F(f,'pieces').value),note:F(f,'note').value||null,photos});closeDialog();toast(r.queued?t('Abholung lokal gespeichert — ausstehende Synchronisierung'):t('Abholung erfasst'));},
  cleared:async f=>{if(!F(f,'confirm').checked)throw new Error(t('Bitte bestätigen'));const photos=await readPhotos(F(f,'photo').files);const r=store.driverEvent({kind:'cleared',stackKey:F(f,'stack').value,photos});closeDialog();toast(r.queued?t('Räumung lokal gespeichert'):t('Polter als geräumt gemeldet'));},
  problem:async f=>{const photos=await readPhotos(F(f,'photo').files);const r=store.driverEvent({kind:'problem',stackKey:F(f,'stack').value,problemKind:F(f,'kind').value,note:F(f,'note').value||null,photo:photos.length>0,photos});closeDialog();toast(r.queued?t('Meldung lokal gespeichert'):t('Problem gemeldet'));},
  note:f=>{const l=store.state.loads[F(f,'load').value];const lines=l.lines.map((x,i)=>({stackKey:x.stackKey,qty:num(F(f,'qty_'+i).value),unit:x.unit,pieces:num(F(f,'pcs_'+i).value)}));const r=store.driverEvent({kind:'note_issued',loadId:l.id,form:radio(f,'form','generated'),customerNoteNo:F(f,'customerNoteNo').value||null,declaredLines:lines,transportComplete:F(f,'transportComplete').checked,eudrRef:F(f,'eudrRef').value||null,destinationId:F(f,'destination').value||null});closeDialog();toast(r.queued?t('Lieferschein lokal gespeichert'):t('Lieferschein ausgestellt'));},
  unload:f=>{const r=store.driverEvent({kind:'unloaded',loadId:F(f,'load').value,acceptance:radio(f,'acceptance','accepted'),reason:F(f,'reason').value||null,newDestinationId:F(f,'newDestination').value||null,photo:F(f,'photo').checked});closeDialog();toast(t('Abladung gemeldet'));},
  ticket:f=>{const qty=num(F(f,'qty').value),net=num(F(f,'net').value),gross=num(F(f,'gross').value),tare=num(F(f,'tare').value);const measured=qty!=null?[{species:null,assortment:null,lengthM:null,qty:{value:qty,unit:F(f,'unit').value,raw:String(F(f,'qty').value)},method:'Werksmaß (Foto)'}]:[];const weigh=net!=null?{net:{value:net,unit:'kg',raw:String(net)},...(gross!=null?{gross:{value:gross,unit:'kg',raw:String(gross)}}:{}),...(tare!=null?{tare:{value:tare,unit:'kg',raw:String(tare)}}:{})}:null;if(!measured.length&&!weigh)throw new Error(t('Menge oder Nettogewicht eintragen'));store.driverEvent({kind:'ticket_photo',loadId:F(f,'load').value,ticketNo:F(f,'ticketNo').value,measuredLines:measured,weighbridge:weigh});closeDialog();toast(t('Werksschein erfasst und der Fuhre zugeordnet'));},
  assign:f=>{const sel=f.querySelector('[name=load]:checked');const load=sel?sel.value:F(f,'other').value;if(!load)throw new Error(t('Fuhre wählen'));store.apply('assignReceipt',F(f,'receipt').value,load);closeDialog();toast(t('Zugeordnet'));},
  user:f=>{const roles=[...f.querySelectorAll('[name=role]:checked')].map(x=>x.value);if(!roles.length)throw new Error(t('Mindestens eine Rolle'));const id=F(f,'id').value||('U-'+(store.state.users.length+1));store.apply('upsertUser',{id,name:F(f,'name').value.trim(),title:F(f,'title').value.trim(),roles,truckId:F(f,'truck').value||null,groupId:F(f,'group').value||null});ui.editUser=null;toast(t('Gespeichert'));},
  truck:f=>{store.apply('upsertTruck',{id:'T-'+(store.state.trucks.length+1),reg:F(f,'reg').value.trim(),kind:F(f,'kind').value.trim(),capacity:{value:num(F(f,'cap').value),unit:F(f,'unit').value}});toast(t('Gespeichert'));},
  synonym:f=>{store.apply('addProfileSynonym',F(f,'profile').value,F(f,'key').value,F(f,'syn').value.trim());toast(t('Synonym gelernt'));},
  settings:f=>{store.apply('setSetting','tolerancePct',num(F(f,'tolerancePct').value));store.apply('setSetting','retentionMonths',num(F(f,'retentionMonths').value));store.apply('setSetting','localExpiryDays',num(F(f,'localExpiryDays').value));store.apply('setSetting','driverSeesRates',F(f,'driverSeesRates').checked);const tokEl=F(f,'mapboxToken');if(tokEl){const before=store.state.settings.mapboxToken||'';const tok=tokEl.value.trim();if(tok!==before){store.apply('setSetting','mapboxToken',tok);mapboxFailed=false;resetMaps();loadMapbox();}}toast(t('Gespeichert'));}
};
/* pdf.js text layer → lines with tab-separated cells (progressive enhancement). Glyph runs closer than 1.5 pt form one
   word; words further apart than 14 pt become separate cells. A row whose words are column labels of the stack table
   (TC.extract.headerColumns) anchors a column grid: every row below it is split at the midpoints between the header
   labels, so empty cells survive and right-aligned numbers stay in their column. Pages without any text are scans;
   pages that are mostly one image with at most four short lines are map pages. No OCR, no rendering. */
async function pdfPages(file){const lib=globalThis.pdfjsLib;const buf=await file.arrayBuffer();const pdf=await lib.getDocument({data:buf}).promise;const pages=[];
  const HC=TC.extract.headerColumns;const OPS=lib.OPS||{};const imgOps=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintJpegXObject,OPS.paintImageXObjectRepeat].filter(x=>x!=null));
  for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n);const tc=await pg.getTextContent();const items=tc.items.filter(it=>it.str&&it.str.trim()).map(it=>({x:it.transform[4],y:it.transform[5],w:it.width,s:it.str}));
    let hasImage=false;try{const ops=await pg.getOperatorList();hasImage=ops.fnArray.some(f=>imgOps.has(f));}catch(e){hasImage=false;}
    const rows=[];for(const it of items.sort((a,b)=>b.y-a.y||a.x-b.x)){const row=rows.find(r=>Math.abs(r.y-it.y)<3);if(row)row.items.push(it);else rows.push({y:it.y,items:[it]});}
    let grid=null;const lines=[];
    for(const r of rows){r.items.sort((a,b)=>a.x-b.x);
      const words=[];for(const it of r.items){const last=words[words.length-1];if(last&&it.x-(last.x+last.w)<=1.5){last.s+=it.s;last.w=it.x+it.w-last.x;}else words.push({x:it.x,w:it.w,s:it.s});}
      if(words.length>=3&&HC(words.map(w=>w.s).join('\t')).count>=3){grid=words.map(w=>({start:w.x,end:w.x+w.w}));lines.push(words.map(w=>w.s).join('\t'));continue;}
      if(grid){const cells=grid.map(()=>[]);const bounds=grid.slice(1).map((g,i)=>(grid[i].end+g.start)/2);for(const w of words){const mid=w.x+w.w/2;let col=0;while(col<bounds.length&&mid>bounds[col])col++;cells[col].push(w.s);}lines.push(cells.map(c=>c.join(' ')).join('\t'));continue;}
      let out='',last=null;for(const w of words){if(last)out+=w.x-(last.x+last.w)>14?'\t':' ';out+=w.s;last=w;}lines.push(out);}
    const text=lines.filter(l=>l.trim());
    pages.push({n,kind:text.length?(hasImage&&text.length<=4&&text.every(l=>l.length<=80)?'map':'text'):'scan',lines:text});}
  return pages;}
/* ---------- help ---------- */
function help(c){return `<section class="help"><h2>${t('Hilfe')}</h2><p>${esc(t('Dieses Demo zeigt den carrier-first Arbeitsablauf für Holztransport: E-Mail-PDF → Extraktion → Ausnahmen prüfen → an Flotte oder Fahrer veröffentlichen → Abholungen erfassen → Räumung bestätigen → Lieferschein ausstellen → Werksschein erfassen → Mengen abgleichen.'))}</p>
  <ol>${['Posteingang: „Demo-E-Mails zustellen“, dann ein Dokument öffnen. Die Originalseite steht neben den vorgeschlagenen Feldern; Ausnahmen blockieren nur die betroffene Zeile.','Standorte: gedruckte Koordinaten bestätigen, Lesarten übernehmen oder aus dem Kartenbild platzieren — nie stillschweigend.','Disposition: veröffentlichen (Flotte, Gruppe, Fahrer) und zuteilen (ganzer Polter, Fuhren, Menge).','Mobil: Fahrer-Persona wählen, herunterladen, offline gehen, Abholung erfassen, Polter geräumt melden, Lieferschein ausstellen, Ankunft und Abladung melden, wieder online gehen.','Belege & Abgleich: Werksscheine zustellen; Zuordnung über Lieferschein-Nr. oder Kennzeichen + Zeitfenster; Mengenbuch und Abgleich zeigen die Wald-Werk-Differenz.','Berichte: Abfuhrmeldung/Fertigmeldung aus der Historie; „Als gesendet markieren“ ist eine bewusste Handlung.'].map(x=>`<li>${esc(t(x))}</li>`).join('')}</ol>
  <h3>${t('Glossar')}</h3>${S.kv([['Polter',t('Holzstapel an der Waldstraße; die kleinste Einheit der Abfuhr. Eine Polternummer allein ist nicht eindeutig.')],['Hieb / Los',t('Hiebsmaßnahme und Verkaufslos als Kontext der Polternummer.')],['fm / rm / LDG',t('Festmeter (fester Holzinhalt), Raummeter (geschichtetes Volumen), Ladungen — nicht austauschbar.')],['Lieferschein',t('Begleitpapier je Fuhre, unmittelbar nach dem Beladen auszustellen.')],['Werkseingangsschein / Wiegeschein',t('Beleg des Werks mit Werksmaß oder Brutto/Tara/Netto; schließt die Fuhre, nicht den Polter.')],['Abfuhrmeldung / Fertigmeldung',t('Bericht an den Auftraggeber mit Fuhren, Soll und Differenz.')],['ELDATsmart',t('Deutscher Datenstandard Wald–Werk (KWF/AGR): Holzbereitstellung, Transportauftrag, Lieferschein, Messprotokoll, Abrechnung.')]])}
  <p class="muted small">${esc(t('Demo-Hinweis: Dokumente sind anonymisierte Nachbildungen der Beispielsammlung; keine Daten verlassen den Browser (außer Kartenkacheln).'))} <a href="README.md">README</a> · <a href="SPEC.md">SPEC</a> · <a href="RESEARCH.md">RESEARCH</a></p></section>`;}
/* ---------- events ---------- */
function onClick(ev){const el=ev.target.closest('[data-action]');if(!el)return;if(el.tagName==='SELECT'||el.tagName==='INPUT'||el.tagName==='TEXTAREA')return;if(el.hasAttribute('disabled'))return;const a=actions[el.dataset.action];if(!a)return;ev.preventDefault();try{a(el.dataset,el,ev);}catch(e){fail(e);}}
function onChange(ev){const el=ev.target.closest('[data-action]');if(!el)return;if(!(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='radio'||el.type==='date'||el.type==='number'||el.type==='file'))return;const a=actions[el.dataset.action];if(a)try{a(el.dataset,el,ev);}catch(e){fail(e);}}
let inputTimer=null;function onInput(ev){const el=ev.target.closest('[data-action]');if(!el||!(el.tagName==='INPUT'&&['text','search','number','date',''].includes(el.type)||el.tagName==='TEXTAREA'))return;const a=actions[el.dataset.action];if(!a)return;const live=['review-field','review-note','place-coord'];if(live.includes(el.dataset.action)){a(el.dataset,el,ev);return;}clearTimeout(inputTimer);inputTimer=setTimeout(()=>{try{a(el.dataset,el,ev);}catch(e){fail(e);}},250);}
async function onSubmit(ev){const f=ev.target.closest('form[data-form]');if(!f)return;ev.preventDefault();const fn=forms[f.dataset.form];if(!fn)return;try{await fn(f);}catch(e){fail(e);}render();}
function onKey(ev){if(ev.key==='Enter'&&ev.target.closest('li.doc[data-action]')){ev.target.closest('li.doc').click();}}
function boot(){document.addEventListener('click',onClick);document.addEventListener('change',onChange);document.addEventListener('input',onInput);document.addEventListener('submit',onSubmit);document.addEventListener('keydown',onKey);window.addEventListener('hashchange',render);window.addEventListener('resize',()=>relayout());
  const d=$('#tpDialog');d.addEventListener('click',ev=>{if(ev.target===d)closeDialog();});d.addEventListener('close',()=>{dialogFn=null;});
  $('#tpLang').addEventListener('change',ev=>{if(I)I.setLang(ev.target.value);render();});
  if(globalThis.pdfjsLib&&globalThis.pdfjsLib.GlobalWorkerOptions)globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  if(!store.restored&&!Object.keys(store.state.documents||{}).length){TC.tour.run(store);ui.mapFitted=false;toast(t('Demo-Durchlauf beim ersten Aufruf geladen – zurücksetzen unter Verwaltung'));}
  loadMapbox();store.subscribe(()=>{});render();}
globalThis.TransportApp={store,render,ui,api,actions,forms,ctx,get drafts(){return drafts;},get maps(){return {dispatch:map,place:placeMap,driver:driverMap};},dialog,closeDialog,toast,route};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
