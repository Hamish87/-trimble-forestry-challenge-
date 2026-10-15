/* Hiebsprüfung · Drohne — application shell: game handoff (same envelope as the planning replica), project store
   (sessionStorage, never game state), view model, actions, map tools (measure, annotate, select) and rendering.
   Opened from the CFHarvest planning replica (order detail → Funktionen → Hiebsprüfung (Drohne)) or standalone. */
'use strict';
const CFHSCApp=(()=>{
const B=CFHBridge,S=CFHSiteCheck,V=CFHSCViews,UI=CFHUI,$=id=>document.getElementById(id),esc=UI.esc;
const store={get(k){try{return sessionStorage.getItem(k);}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,v);return true;}catch{return false;}}};
const tr=s=>typeof I18n!=='undefined'?I18n.text(s):s;
const NAV=[['projects','📁','Projekte'],['models','🧠','Modelle'],['notifications','🔔','Benachrichtigungen'],['subscription','💳','Abonnement'],['help','?','Hilfe']];
const defaultView=()=>({nav:'projects',search:'',tagFilter:'',showArchived:false,projectView:'grid',highlight:null,wizard:null,projectId:null,layers:{hex:false,contours:false,images:false},hexSize:1000,contourInterval:1,minConf:0,selectedHex:null,tool:'select',selected:null,measure:null,annotClass:'Habitatbaum',zoom:1,pan:[0,0],summary:true,modelMenu:false,dialog:null,compareOrder:null,report:null,modelForm:false,modelDraft:{},tier:'business'});
const St={game:null,store:S.emptyStore(),nonce:null,returnUrl:null,source:null,notices:[],view:defaultView(),vm:null,snap:null};
const api={navigate:url=>location.assign(url),print:()=>window.print(),download:(name,text,type='application/geo+json')=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}catch{}}};

/* ---------- Handoff and store ---------- */
function readIncoming(){
  let raw=store.get(B.KEYS.toReplica),src='session';const m=/(?:^#|&)cfh=([^&]*)/.exec(location.hash||'');
  if(m){try{raw=decodeURIComponent(m[1]);src='hash';}catch{}}
  const env=B.readEnvelope(raw,'to-replica');if(env&&src==='hash')store.set(B.KEYS.toReplica,raw);
  return env?{env,src}:null;
}
function hashParams(){const out={};for(const part of (location.hash||'').replace(/^#/,'').split('&')){const [k,v]=part.split('=');if(k&&k!=='cfh')out[k]=decodeURIComponent(v||'');}return out;}
function load(){
  const incoming=readIncoming(),params=hashParams();St.notices=[];
  if(incoming){St.game=incoming.env.state;St.nonce=incoming.env.nonce||null;St.returnUrl=incoming.env.returnUrl||null;St.source=incoming.src;St.lang=incoming.env.lang;}
  else{St.game=ForestJourney.start(ForestJourney.initial());St.nonce=null;St.returnUrl=null;St.source='demo';St.notices.push({kind:'warn',text:'Kein Spielstand übergeben: Demo-Spielstand Schicht 1 mit Standardauftrag.'});}
  try{St.store=S.normalizeStore(JSON.parse(store.get(S.KEY)||'null'));}catch{St.store=S.emptyStore();}
  if(St.store.basis&&St.game.history.length<St.store.basis.historyLength){St.store=S.emptyStore();St.notices.push({kind:'info',text:'Neuer Spielstand erkannt: Projekte zurückgesetzt.'});}
  try{history.replaceState(null,'',location.pathname+location.search);}catch{}
  St.params=params;
  const back=$('scReturn');if(back)back.textContent=fromGame()?'Zurück zum Spiel':'Zurück zur Planung';
}
function save(){St.store.basis={historyLength:St.game.history.length};store.set(S.KEY,JSON.stringify(St.store));}
function mutate(fn,message){St.store=S.normalizeStore(structuredClone(St.store));fn(St.store);save();render();if(message)toast(message);}
/** Opened straight from the game (dist/cfharvest-link.js, #from=game) rather than from the planning replica. */
function fromGame(){return St.params?.from==='game'&&!!St.returnUrl;}
/** Orders whose pre-harvest drone check confirmed the boundary (same rule as the replica's boundaryDigital()). */
function boundaryDigital(){return Object.entries(St.store.handover||{}).filter(([,p])=>p.pre&&p.pre.boundaryDigital&&p.pre.status!=='blocked').map(([id])=>id);}
function returnTarget(){
  // Back to the planning replica (same folder tree) by default; back to the game, with its state, when the game opened us.
  if(!fromGame())return new URL('../app/',location.href).href;
  let url=St.returnUrl;
  if(St.nonce){
    // No work order is sent here (that is the planning app's job): only the boundary choice changes, and only when the
    // drone pre-check confirmed every stand the game's machines are currently dispatched to (the replica applies the same rule).
    const next=structuredClone(St.game),digital=boundaryDigital().map(B.standIdOf).filter(Boolean),on=[next.harvester,next.forwarder].filter(Boolean);
    if(next.phase==='plan'&&on.length&&on.every(id=>digital.includes(id)))next.boundary='digital';
    const lang=(typeof I18n!=='undefined'?I18n:null)?.language||St.lang||'de';
    const json=JSON.stringify(B.envelope('to-game',next,{lang,nonce:St.nonce,applied:{}}));
    if(new URL(url,location.href).origin===location.origin)store.set(B.KEYS.toGame,json);else url+='#cfh-return='+encodeURIComponent(json);
  }
  return url;
}

/* ---------- View model ---------- */
function ctxFor(project){
  const order=St.snap.orders.find(o=>o.id===project.orderId);if(!order)return null;
  const v=St.view,all=S.resultsFor(order,St.snap,project),checklist=S.checklist(order,St.snap,project.phase,project,all),results=S.filterResults(all,v.minConf||0);
  const hexSummary=v.layers.hex?S.hexSummary(S.hexGrid(order,v.hexSize),Object.entries(results).filter(([k])=>v.layers[k]!==false).flatMap(([,l])=>l)):null;
  const contours=v.layers.contours?S.contours(order,v.contourInterval||1):null,images=v.layers.images?S.imagePoints(order,project.flight):null;
  return{project,order,results,allResults:all,checklist,hexSummary,contours,images,selectedHex:v.selectedHex};
}
function viewModel(){
  const v=St.view,snap=St.snap,st=St.store,tier=S.TIERS.find(t=>t.key===v.tier)||S.TIERS[2];
  const projectsFiltered=st.projects.filter(p=>(v.showArchived||!p.archived)&&(!v.tagFilter||p.phase===v.tagFilter)&&(!v.search||(p.name+' '+p.orderId+' '+p.tags.join(' ')).toLowerCase().includes(v.search.toLowerCase())));
  const vm={orders:snap.orders,meta:snap.meta,store:st,tier,projectsFiltered,orderOf:id=>snap.orders.find(o=>o.id===id),annotationCount:st.projects.reduce((a,p)=>a+p.annotations.length,0),ctx:null,compareCtx:null,reportCtx:null};
  const current=v.projectId&&st.projects.find(p=>p.id===v.projectId);
  if(current)vm.ctx=ctxFor(current);
  if(v.nav==='compare'&&v.compareOrder){const order=vm.orderOf(v.compareOrder),pre=S.latestProject(st,order.id,'pre'),post=S.latestProject(st,order.id,'post'),pc=pre?ctxFor(pre):null,qc=post?ctxFor(post):null;vm.compareCtx={order,pre:pc,post:qc,rows:S.compare(order,snap,pc?.results||{},qc?.results||{}).rows};}
  if(v.nav==='report'&&v.report){const order=vm.orderOf(v.report.orderId),list=v.report.compare?['pre','post'].map(ph=>S.latestProject(st,order.id,ph)).filter(Boolean):[st.projects.find(p=>p.id===v.report.projectId)].filter(Boolean);const ctxs=list.map(ctxFor).filter(Boolean);
    vm.reportCtx={order,ctxs,compareRows:v.report.compare?S.compare(order,snap,ctxs.find(c=>c.project.phase==='pre')?.results||{},ctxs.find(c=>c.project.phase==='post')?.results||{}).rows:null};}
  return vm;
}
/* ---------- Rendering ---------- */
function banner(vm){const m=vm.meta,c=m.contract;return `${St.notices.map(n=>`<p class="notice ${n.kind}">${esc(n.text)}</p>`).join('')}<div class="context"><span><b>${esc('Spielstand')}</b> ${esc('Schicht')} ${UI.num(m.round,0)} ${esc('von 4')}</span><span><b>${esc('Vertrag')}</b> ${UI.code(c.id)} · ${esc(c.name)}</span><span><b>${esc('Bodenschutz')}</b> ${UI.num(m.soil??100,0)}/100</span><span class="demo-tag">${esc('Demonstration · keine Produktoberfläche eines Herstellers')}</span></div>`;}
function navHtml(vm){const v=St.view,cur=['project','wizard','compare','report'].includes(v.nav)?'projects':v.nav,unread=vm.store.notifications.filter(n=>!n.read).length;
  return NAV.map(([k,icon,de])=>`<button type="button" data-nav="${k}" aria-current="${cur===k}"><span class="ico" aria-hidden="true">${icon}</span><span class="nav-label">${esc(de)}</span>${k==='notifications'&&unread?`<span class="badge" data-unread>${UI.num(unread,0)}</span>`:''}</button>`).join('');}
function render(){
  const ae=document.activeElement,key=ae?.dataset?.input||ae?.dataset?.dialog||null,sel=ae&&'selectionStart'in ae&&['text','search',''].includes(ae.type||'')?[ae.selectionStart,ae.selectionEnd]:null;
  St.snap=B.fromGameState(St.game);const vm=St.vm=viewModel(),v=St.view;
  $('scNav').innerHTML=navHtml(vm);$('scBanner').innerHTML=banner(vm);
  let main='';
  if(v.nav==='project'&&vm.ctx)main=V.project(vm,v,UI);
  else if(v.nav==='wizard'&&v.wizard)main=V.wizard(vm,v,UI);
  else if(v.nav==='compare'&&vm.compareCtx)main=V.compare(vm,v,UI);
  else if(v.nav==='report'&&vm.reportCtx)main=V.report(vm,v,UI);
  else if(v.nav==='models')main=V.models(vm,v,UI);
  else if(v.nav==='notifications')main=V.notifications(vm,v,UI);
  else if(v.nav==='subscription')main=V.subscription(vm,v,UI);
  else if(v.nav==='help')main=V.help(vm,v,UI);
  else{v.nav='projects';main=V.projects(vm,v,UI);}
  $('scMain').innerHTML=main;
  const dlg=$('scDialog'),html=V.dialog(vm,v,UI);dlg.innerHTML=html?`<div class="dialog-body" data-dialog-type="${esc(v.dialog.type)}">${html}</div>`:'';
  if(html&&!dlg.open){if(typeof dlg.showModal==='function'){try{dlg.showModal();}catch{dlg.setAttribute('open','');}}else dlg.setAttribute('open','');}
  if(!html&&dlg.open){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open');}
  document.body.classList.toggle('tool-active',['measure','annotate'].includes(v.tool)&&v.nav==='project');
  if(key){const el=document.querySelector(`[data-input="${key}"],[data-dialog="${key}"]`);if(el){el.focus();if(sel&&el.setSelectionRange){try{el.setSelectionRange(sel[0],sel[1]);}catch{}}}}
}
let toastTimer=null;
function toast(text){const t=$('scToast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500);}

/* ---------- Actions ---------- */
const order=id=>St.snap.orders.find(o=>o.id===id),project=id=>St.store.projects.find(p=>p.id===id);
function openProject(id){const v=St.view;v.nav='project';v.projectId=id;v.selected=null;v.measure=null;v.tool='select';v.modelMenu=false;v.zoom=1;v.pan=[0,0];render();try{window.scrollTo(0,0);}catch{}}
function runModel(projectId,key,message=true){const p=project(projectId),o=order(p.orderId),n=S.detect(o,St.snap,p.phase,key).length;St.store=S.runModel(St.store,projectId,key,n,St.snap.meta.round);St.view.layers[key]=true;save();render();if(message)toast(`${tr(S.modelOf(key).name)}: ${UI.num(n,0)} ${tr('Erkennungen')}`);}
function runAll(projectId){const p=project(projectId);for(const m of S.modelsFor(p.phase))runModel(projectId,m.key,false);toast(tr('Alle Modelle ausgeführt'));}
function createProject(w,order_){
  const flight=S.flightFor(order_,{altitudeM:Number(w.altitude)||undefined,gsdCm:Number(w.gsd)||undefined,overlapPct:Number(w.overlap)||undefined,source:w.filesSource||'demo'});if(w.files)flight.images=Number(w.files);flight.sizeMb=flight.images*S.FLIGHT.mbPerImage;
  const r=S.createProject(St.store,order_,{phase:w.phase,type:w.type,name:(w.name||'').trim()||undefined,tags:String(w.tags||'').split(',').map(x=>x.trim()).filter(Boolean),round:Number(w.round)||St.snap.meta.round,flight});
  St.store=r.store;save();if(w.withModel)runAll(r.project.id);return r.project;
}
function seedDemo(){let created=0;for(const o of St.snap.orders){if(!S.latestProject(St.store,o.id,'pre')){createProject({phase:'pre',type:'orthophoto',round:1,withModel:true},o);created++;}if(o.events.some(e=>e.kind==='harvest')&&!S.latestProject(St.store,o.id,'post')){createProject({phase:'post',type:'orthophoto',round:St.snap.meta.round,withModel:true},o);created++;}}render();toast(`${UI.num(created,0)} ${tr('Demo-Projekte angelegt')}`);}
function svgPoint(e){const svg=e.target.closest?.('svg[data-sc-map]');if(!svg)return null;try{const m=svg.getScreenCTM?.();if(m&&svg.createSVGPoint){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(m.inverse());if(Number.isFinite(q.x)&&Number.isFinite(q.y))return[+q.x.toFixed(1),+q.y.toFixed(1)];}}catch{}
  const vb=(svg.getAttribute('viewBox')||'0 0 620 350').split(' ').map(Number),r=svg.getBoundingClientRect?.();if(r&&r.width>0)return[+(vb[0]+(e.clientX-r.left)/r.width*vb[2]).toFixed(1),+(vb[1]+(e.clientY-r.top)/r.height*vb[3]).toFixed(1)];return[+(vb[0]+vb[2]/2).toFixed(1),+(vb[1]+vb[3]/2).toFixed(1)];}
function mapClick(e){
  const v=St.view,p=project(v.projectId),o=order(p.orderId),pt=svgPoint(e);if(!pt)return false;
  if(v.tool==='measure'){const pts=[...(v.measure?.points||[]),pt],mpp=S.metresPerPx(o),len=S.pathLength(pts)*mpp;v.measure={points:pts,label:`${UI.num(len,0)} m`,metres:Math.round(len)};render();return true;}
  if(v.tool==='annotate'){mutate(st=>{const pr=st.projects.find(x=>x.id===p.id);pr.annotations.push({point:pt,cls:v.annotClass,round:St.snap.meta.round});},`${tr('Annotation')}: ${tr(v.annotClass)}`);return true;}
  return false;
}
const actions={
  nav:el=>{const v=St.view;v.nav=el.dataset.nav;v.dialog=null;v.modelMenu=false;if(v.nav==='projects')v.highlight=null;render();},
  logout:()=>toast(tr('Abmelden ist in der Demo ohne Funktion.')),
  return:()=>api.navigate(returnTarget()),
  'dialog-cancel':()=>{St.view.dialog=null;render();},
  /* projects */
  'project-view':el=>{St.view.projectView=el.dataset.key;render();},
  'highlight-order':el=>{const v=St.view;v.highlight=v.highlight===el.dataset.order?null:el.dataset.order;render();},
  'open-project':el=>openProject(el.dataset.project),
  'archive-project':el=>{const id=el.dataset.project;mutate(st=>{const p=st.projects.find(x=>x.id===id);p.archived=!p.archived;},tr(project(id).archived?'Projekt wiederhergestellt':'Projekt archiviert'));},
  'seed-demo':()=>seedDemo(),
  'new-project':()=>{const v=St.view;v.nav='wizard';v.wizard={step:1,type:'orthophoto',phase:'pre',orderId:v.highlight||v.projectId&&project(v.projectId)?.orderId||St.snap.orders[0].id,round:St.snap.meta.round,files:0};render();},
  'wizard-type':el=>{St.view.wizard.type=el.dataset.key;render();},
  'wizard-next':()=>{const w=St.view.wizard;w.step=Math.min(3,w.step+1);render();},
  'wizard-back':()=>{const w=St.view.wizard;w.step=Math.max(1,w.step-1);render();},
  'wizard-cancel':()=>{St.view.wizard=null;St.view.nav='projects';render();},
  'wizard-demo-files':()=>{const w=St.view.wizard,o=order(w.orderId);w.files=S.flightFor(o,{altitudeM:Number(w.altitude)||undefined,gsdCm:Number(w.gsd)||undefined,overlapPct:Number(w.overlap)||undefined}).images;w.filesSource='demo';render();},
  'wizard-create':()=>{const w=St.view.wizard,o=order(w.orderId);if(!o||!(w.files>0))return;const tier=St.vm.tier;if(St.store.projects.filter(p=>!p.archived).length>=tier.projects){toast(tr('Projektlimit des Plans erreicht'));return;}const p=createProject(w,o);St.view.wizard=null;St.view.dialog={type:'processing',text:`${tr('Orthomosaik erstellt')}: ${UI.num(p.flight.images,0)} ${tr('Bilder')} · ${tr('Projekt bereit')}`};openProject(p.id);},
  'edit-project':()=>{St.view.dialog={type:'edit',projectId:St.view.projectId};render();},
  'edit-save':()=>{const d=St.view.dialog,dq=s=>$('scDialog').querySelector(s),name=String(dq('[data-dialog="name"]')?.value||'').trim(),tags=String(dq('[data-dialog="tags"]')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);St.view.dialog=null;mutate(st=>{const p=st.projects.find(x=>x.id===d.projectId);if(name)p.name=name.slice(0,80);p.tags=tags;},tr('Gespeichert'));},
  'project-delete':el=>{const id=el.dataset.project;St.view.dialog=null;St.view.nav='projects';St.view.projectId=null;mutate(st=>{st.projects=st.projects.filter(p=>p.id!==id);},tr('Projekt gelöscht'));},
  /* project map */
  'model-menu':()=>{St.view.modelMenu=!St.view.modelMenu;render();},
  'run-model':el=>{St.view.modelMenu=false;St.view.tool='select';runModel(St.view.projectId,el.dataset.key);},
  'run-all':()=>runAll(St.view.projectId),
  'run-custom':el=>{St.view.modelMenu=false;render();toast(tr('Eigenes Modell ausgeführt: keine Treffer in der Demo'));},
  tool:el=>{const v=St.view;v.tool=v.tool===el.dataset.key?'select':el.dataset.key;v.modelMenu=false;if(v.tool!=='measure')v.measure=null;if(v.tool==='detect')v.modelMenu=true;render();},
  'map-zoom':el=>{const v=St.view;v.zoom=el.dataset.dir==='in'?Math.min(4,v.zoom*1.5):Math.max(1,v.zoom/1.5);if(v.zoom===1)v.pan=[0,0];render();},
  'toggle-summary':()=>{St.view.summary=St.view.summary===false;render();},
  feature:el=>{const v=St.view;if(v.tool!=='select')return;v.selected={model:el.dataset.model,index:Number(el.dataset.index)};render();},
  'feature-close':()=>{St.view.selected=null;render();},
  hex:el=>{const v=St.view;if(v.tool!=='select')return;v.selectedHex=v.selectedHex===el.dataset.hex?null:el.dataset.hex;render();},
  'feature-delete':()=>{const v=St.view,sel=v.selected;if(!sel)return;v.selected=null;toast(tr('Erkennung in der Demo nicht gelöscht: Treffer werden aus dem Spielstand abgeleitet.'));render();},
  annotation:el=>{const i=Number(el.dataset.index),pid=St.view.projectId;mutate(st=>{st.projects.find(x=>x.id===pid).annotations.splice(i,1);},tr('Annotation entfernt'));},
  'measure-save':()=>{const v=St.view,m=v.measure;if(!m||m.points.length<2)return;const pid=v.projectId;v.measure=null;v.tool='select';mutate(st=>{st.projects.find(x=>x.id===pid).measurements.push({points:m.points,metres:m.metres,round:St.snap.meta.round});},`${tr('Messung gespeichert')}: ${m.label}`);},
  compare:el=>{St.view.nav='compare';St.view.compareOrder=el.dataset.order;render();},
  report:el=>{const v=St.view;v.report={orderId:el.dataset.order||project(v.projectId)?.orderId,projectId:v.projectId,compare:!!el.dataset.compare};v.nav='report';render();try{window.scrollTo(0,0);}catch{}},
  print:()=>api.print(),
  geojson:()=>{const ctx=St.vm.ctx;if(!ctx)return;const gj=S.toGeoJSON(ctx.order,ctx.project.phase,ctx.results,{round:ctx.project.round});api.download(`${ctx.project.id}.geojson`,JSON.stringify(gj,null,2));toast(`GeoJSON: ${UI.num(gj.features.length,0)} ${tr('Objekte')}`);},
  handover:()=>{const ctx=St.vm.ctx;if(!ctx)return;St.view.dialog={type:'handover',record:S.handover(ctx.order,St.snap,ctx.project.phase,ctx.project,ctx.results,St.snap.meta.round)};render();},
  'handover-confirm':()=>{const d=St.view.dialog,rec=d.record;St.view.dialog=null;mutate(st=>{(st.handover[rec.orderId]??={})[rec.phase]=rec;const p=st.projects.find(x=>x.id===St.view.projectId);if(p)p.handedOver={round:rec.round,status:rec.status};st.notifications.push({id:'N'+(++st.seq),kind:'general',title:`${tr('An die Planung übergeben')}: ${rec.orderId} · ${tr(S.PHASES[rec.phase].cfh)}`,text:tr(V.STATUS_DE[rec.status]),round:rec.round,projectId:St.view.projectId,read:false});},tr('An die Planung übergeben'));},
  /* models */
  'model-new':()=>{St.view.modelForm=true;St.view.modelDraft={kind:'object',size:'Mittel'};render();},
  'model-cancel':()=>{St.view.modelForm=false;render();},
  'model-save':()=>{const d=St.view.modelDraft;if(!d.name||!d.classes)return;St.view.modelForm=false;mutate(st=>{st.models.push({id:'M'+(++st.seq),name:String(d.name).slice(0,60),kind:d.kind||'object',size:d.size||'Mittel',classes:String(d.classes).split(',').map(x=>x.trim()).filter(Boolean),status:'annotating',version:0});},tr('Modell angelegt'));},
  'model-train':el=>{const id=el.dataset.key;if(St.vm.annotationCount<5)return;mutate(st=>{const m=st.models.find(x=>x.id===id);m.status='trained';m.version=(m.version||0)+1;st.notifications.push({id:'N'+(++st.seq),kind:'job',title:`${tr('Training abgeschlossen')}: ${m.name}`,text:`v${m.version}`,round:St.snap.meta.round,read:false});},tr('Training abgeschlossen'));},
  'model-delete':el=>{const id=el.dataset.key;mutate(st=>{st.models=st.models.filter(x=>x.id!==id);},tr('Modell gelöscht'));},
  /* notifications, subscription */
  'notify-read-all':()=>mutate(st=>{for(const n of st.notifications)n.read=true;}),
  tier:el=>{St.view.tier=el.dataset.key;render();toast(tr('Plan in der Demo gewechselt'));}
};
/* ---------- Events ---------- */
function onClick(e){
  const v=St.view,el=e.target.closest?.('[data-action],[data-nav]');
  if(v.nav==='project'&&['measure','annotate'].includes(v.tool)&&e.target.closest?.('svg[data-sc-map]')&&!el){if(mapClick(e))return;}
  if(v.modelMenu&&!e.target.closest?.('.menu')){v.modelMenu=false;if(!el)render();}
  if(!el||el.disabled)return;const a=el.dataset.nav?'nav':el.dataset.action;
  if(actions[a]){if(el.tagName==='BUTTON')e.preventDefault();actions[a](el,e);}
}
function onChange(e){
  const el=e.target,c=el.dataset?.change,v=St.view;if(!c)return;
  if(c==='tag-filter')v.tagFilter=el.value;else if(c==='show-archived')v.showArchived=el.checked;
  else if(c==='layer')v.layers[el.value]=el.checked;else if(c==='hex-size'){v.hexSize=Number(el.value);v.layers.hex=true;}
  else if(c==='contour-interval'){v.contourInterval=Number(el.value);v.layers.contours=true;}else if(c==='min-conf')v.minConf=Number(el.value)/100;
  else if(c==='annot-class')v.annotClass=el.value;
  else if(c==='wiz-order'){v.wizard.orderId=el.value;if(v.wizard.phase==='post'&&!order(el.value)?.events.some(x=>x.kind==='harvest'))v.wizard.phase='pre';}
  else if(c==='wiz-phase')v.wizard.phase=el.value;else if(c==='wiz-files'){v.wizard.files=el.files?el.files.length:0;v.wizard.filesSource='upload';}
  else if(c==='wiz-with-model')v.wizard.withModel=el.checked;
  else if(c==='model-kind')v.modelDraft.kind=el.value;else if(c==='model-size')v.modelDraft.size=el.value;
  else return;
  render();
}
function onInput(e){
  const el=e.target,d=el.dataset||{},v=St.view;
  if(d.input==='search'){v.search=el.value;render();}
  else if(d.input?.startsWith('wiz-')){const k=d.input.slice(4);v.wizard[k]=el.value;if(k==='name')return;render();}
  else if(d.input==='model-name')v.modelDraft.name=el.value;else if(d.input==='model-classes')v.modelDraft.classes=el.value;
  if(d.input==='model-name'||d.input==='model-classes'){const btn=document.querySelector('[data-action="model-save"]');if(btn)btn.disabled=!(v.modelDraft.name&&v.modelDraft.classes);}
}
function onKey(e){const v=St.view;if(e.key==='Escape'){if(v.dialog){v.dialog=null;render();}else if(v.modelMenu){v.modelMenu=false;render();}else if(v.tool!=='select'){v.tool='select';v.measure=null;render();}return;}
  if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute?.('role')==='button'&&e.target.tagName!=='BUTTON'){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}
function init(){
  load();
  document.addEventListener('click',onClick);document.addEventListener('change',onChange);document.addEventListener('input',onInput);document.addEventListener('keydown',onKey);
  document.addEventListener('forestry-language-change',()=>{render();try{I18n.localize(document.body);}catch{}});
  $('scDialog').addEventListener('close',()=>{if(St.view.dialog){St.view.dialog=null;render();}});
  render();
  // Deep link from the planning replica: #order=H-A01&phase=pre opens (or creates) that project.
  const p=St.params||{};if(p.order&&St.snap.orders.some(o=>o.id===p.order)){const phase=p.phase==='post'?'post':'pre';let pr=S.latestProject(St.store,p.order,phase);if(!pr&&p.create!=='0'){pr=createProject({phase,type:'orthophoto',round:St.snap.meta.round,withModel:p.run!=='0'},order(p.order));}if(pr)openProject(pr.id);}
  if(St.lang&&typeof I18n!=='undefined'&&I18n.supported.includes(St.lang)&&I18n.language!==St.lang)I18n.setLanguage(St.lang);
}
if(typeof document!=='undefined'&&document.getElementById('scMain'))init();
return{api,state:()=>St,vm:()=>St.vm,render,actions,init,runModel,runAll,seedDemo,createProject};
})();
