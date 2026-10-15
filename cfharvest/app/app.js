/* CFHarvest replica · application shell: game handoff, plan store with staged changes (Återställ/Spara), selection sync
   (list ↔ map ↔ calendar), actions, dialogs, drag and drop (HTML5 drag events for mouse, Pointer Events with long press for
   touch/pen) and the view splitters. All planning values are derived from the received game state via CFHBridge. */
'use strict';
const CFHApp=(()=>{
const B=CFHBridge,M=CFHModel,UI=CFHUI,V=CFHViews,$=id=>document.getElementById(id),esc=UI.esc;
const store={get(k){try{return sessionStorage.getItem(k);}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,v);return true;}catch{return false;}}};
const local={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const config={longPress:350}; // touch: hold to pick up a row or bar, so normal scrolling keeps working
const PHASES={forest:'Waldplanung',plan:'Schicht in Planung',receipt:'Schichtbericht',logistics:'Logistik',logisticsReceipt:'Abfuhrbericht',settlement:'Abrechnung',result:'Ergebnis'};
const VIEW_KEYS=['list','map','calendar','resources'],VIEW_NAMES={list:['Auftragsliste','Uppdragslista'],map:['Aufträge auf der Karte','Uppdrag på kartan'],calendar:['Kalender','Kalender'],resources:['Ressourcen','Resurser']};
const NAV=[['orders','🛒','Bestellungen','Beställningar'],['planning','📋','Arbeitsplanung','Arbetsplanering'],['messages','✉','Nachrichten','Meddelanden'],['admin','⚙','Administration','Administration',true],['integration','⇄','Integrationsprotokoll','Integrationslogg'],['reports','📊','Berichte','Rapporter'],['help','?','Hilfe','Hjälp',true]];
function savedViews(){try{const x=JSON.parse(local.get('cfharvest-views-v1')||'null');if(Array.isArray(x)&&x.length&&x.every(k=>VIEW_KEYS.includes(k)))return x;}catch{}return ['list','calendar'];}
const defaultView=()=>({nav:'planning',views:savedViews(),viewMenu:false,widths:{list:1.3,map:1,calendar:1.5,resources:1},opFilter:'drivning',pickRow:'',checked:[],selected:null,selItem:null,search:'',filtersOpen:false,filters:{},columns:{},colMenu:false,sort:{key:'seq',dir:1},page:0,pageSize:12,
  zoom:'week',calStart:null,rowChecked:[],rowsShown:null,resMenuOpen:false,resSearch:'',plannedOnly:false,insertMode:false,mapZoom:2,mapPan:[0,0],mapLayers:{},mapLegend:false,mapLayerMenu:false,landingMode:false,dialog:null,
  detail:{orderId:null,tab:'order',draft:{},showMap:true,funcOpen:false},menu:null,admin:{page:'resources',resource:'H-01',tab:'base',typeFilter:'',draft:{},weekSel:[],weekStart:null,weekSpan:7,chainDraft:{}},
  book:{},bookDraft:{},bookMessage:'',msgTo:'K-01',msgText:'',canUndo:false});
/* base = saved plan (sessionStorage, travels to the game); plan = working plan incl. staged calendar changes. */
const S={game:null,base:M.emptyPlan(),plan:M.emptyPlan(),history:[],returnUrl:null,nonce:null,source:null,notices:[],view:defaultView(),vm:null,snap:null,drag:null,lastBar:null,suppressClick:false,siteCheck:null};
const SITECHECK_KEY='cfharvest-sitecheck-v1'; // written by cfharvest/sitecheck (drone pre-/post-harvest check); read-only here
function readSiteCheck(){try{const x=JSON.parse(store.get(SITECHECK_KEY)||'null');if(!x||x.schema!==1)return null;if(x.basis&&S.game&&S.game.history.length<x.basis.historyLength)return null;return{orders:x.handover&&typeof x.handover==='object'?x.handover:{}};}catch{return null;}}
function siteCheckUrl(orderId,phase){return new URL(`../sitecheck/#order=${encodeURIComponent(orderId)}&phase=${phase}`,location.href).href;}
/** Orders whose drone pre-check confirmed the harvest boundary → applyPlan sets boundary 'digital' (no field boundary check). */
function boundaryDigital(){const sc=S.siteCheck?.orders||{};return Object.entries(sc).filter(([,p])=>p.pre&&p.pre.boundaryDigital&&p.pre.status!=='blocked').map(([id])=>id);}
const api={navigate:url=>location.assign(url),print:()=>window.print(),download:(name,text)=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}catch{}}};
const tr=s=>typeof I18n!=='undefined'?I18n.text(s):s;

/* ---------- Handoff ---------- */
function safeReturnUrl(u){try{const x=new URL(u,location.href);return /^https?:$/.test(x.protocol)&&x.hostname===location.hostname?x.href.split('#')[0]:null;}catch{return null;}}
function readIncoming(){
  let raw=store.get(B.KEYS.toReplica),src='session';const m=/(?:^#|&)cfh=([^&]*)/.exec(location.hash||'');
  if(m){try{raw=decodeURIComponent(m[1]);src='hash';}catch{}try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
  const env=B.readEnvelope(raw,'to-replica');if(env&&src==='hash')store.set(B.KEYS.toReplica,raw);
  return env?{env,src}:null;
}
function load(){
  const incoming=readIncoming();S.notices=[];
  if(incoming){const e=incoming.env;S.game=e.state;S.nonce=typeof e.nonce==='string'?e.nonce:null;S.returnUrl=safeReturnUrl(e.returnUrl);S.source=incoming.src;S.lang=e.lang;
    let plan=e.plan;if(!plan){try{plan=JSON.parse(store.get(B.KEYS.plan)||'null');}catch{plan=null;}}S.base=M.normalizePlan(plan);}
  else{S.game=ForestJourney.start(ForestJourney.initial());S.nonce=null;S.returnUrl=null;S.source='demo';S.base=M.emptyPlan();S.notices.push({kind:'warn',text:'Kein Spielstand übergeben: Demo-Spielstand Schicht 1 mit Standardauftrag.'});}
  if(S.base.basis&&S.game.history.length<S.base.basis.historyLength){S.base=M.emptyPlan();S.notices.push({kind:'info',text:'Neuer Spielstand erkannt: Planung zurückgesetzt.'});}
  for(const a of S.base.assignments){delete a.staged;delete a.touched;}
  S.plan=S.base;S.history=[];S.siteCheck=readSiteCheck();
}
function savePlan(){S.base.basis={historyLength:S.game.history.length,contractId:B.fromGameState(S.game).meta.contract.id};store.set(B.KEYS.plan,JSON.stringify(S.base));}
/** Stage a calendar change: counted in Återställ (n), resolved on Spara. */
function stage(next,message){S.history.push(S.plan);S.plan=next;S.view.canUndo=true;render();if(message)toast(message);}
/** Spara: resolve overlaps (later bars shift right) and persist. */
function commitStaged(){if(!S.history.length&&!S.plan.assignments.some(a=>a.staged))return false;S.base=M.commit(S.plan,S.snap||B.fromGameState(S.game));S.plan=S.base;S.history=[];S.view.canUndo=false;savePlan();return true;}
function resetStaged(){S.plan=S.base;S.history=[];S.view.canUndo=false;}
/** Immediate change (admin, sends, order book …): applied to the saved and the working plan alike. */
function mutate(fn,message){const apply=p=>{const x=M.normalizePlan(structuredClone(p));fn(x);return x;};const staged=S.plan!==S.base;S.base=apply(S.base);S.plan=staged?apply(S.plan):S.base;S.history=S.history.map(apply);savePlan();render();if(message)toast(message);}
function returnPreview(){
  const vm=S.vm,d=vm.dispatch,name=id=>vm.orders.find(o=>o.id===id)?.name||id;
  if(!vm.meta.canApply)return{apply:false,lines:['Im Spiel wird gerade keine Schicht geplant. Der Spielstand bleibt unverändert; die Planung bleibt gespeichert.']};
  const lines=[];if(d.harvester)lines.push(['H-01',name(d.harvester)]);if(d.forwarder)lines.push(['F-01',name(d.forwarder)]);
  return{apply:lines.length>0,lines:lines.length?lines:['Für heute ist keine gesendete Planung vorhanden. Der Spielstand bleibt unverändert.'],issues:d.issues};
}
function returnToGame(){
  if(commitStaged())S.vm=M.viewModel(S.snap,S.plan);
  const vm=S.vm,next=S.nonce?B.applyPlan(S.game,{...vm.dispatch,boundaryDigital:boundaryDigital()}):S.game;savePlan();
  let url=S.returnUrl||new URL('../../dist/',location.href).href;
  if(S.nonce){const env=B.envelope('to-game',next,{plan:S.base,lang:(typeof I18n!=='undefined'?I18n:null)?.language||'de',nonce:S.nonce,applied:{harvester:vm.dispatch.harvester,forwarder:vm.dispatch.forwarder}}),json=JSON.stringify(env);
    if(new URL(url,location.href).origin===location.origin)store.set(B.KEYS.toGame,json);else url=url+'#cfh-return='+encodeURIComponent(json);
    store.set(B.KEYS.toReplica,JSON.stringify(B.envelope('to-replica',next,{plan:S.base,lang:env.lang,nonce:S.nonce,returnUrl:S.returnUrl})));}
  api.navigate(url);
}

/* ---------- Rendering ---------- */
const FOCUS_KEYS=['input','draft','admin','adminBase','adminProd','adminWeek','dialog'];
function focusKey(el){if(!el||el===document.body)return null;const d=el.dataset||{};for(const k of FOCUS_KEYS)if(d[k])return k+':'+d[k]+':'+(d.key||'')+':'+(d.book||d.chain||'');return d.action?['a',d.action,d.order,d.item,d.tab,d.zoom,d.row,d.index,d.key,d.viewKey,d.page,d.size].join(':'):d.change?['c',d.change,el.value,d.key,d.order].join(':'):null;}
function restoreFocus(key,sel){if(!key)return;for(const el of document.querySelectorAll('[data-input],[data-draft],[data-admin],[data-admin-base],[data-admin-prod],[data-admin-week],[data-dialog],[data-action],[data-change]'))if(focusKey(el)===key){el.focus();if(sel&&el.setSelectionRange){try{el.setSelectionRange(sel[0],sel[1]);}catch{}}return;}}
function banner(vm){
  const m=vm.meta,c=m.contract;
  return `${S.notices.map(n=>`<p class="notice ${n.kind}">${esc(n.text)}</p>`).join('')}<div class="context"><span><b>${esc('Spielstand')}</b> ${esc('Schicht')} ${UI.num(m.round,0)} ${esc('von 4')} · ${esc(PHASES[m.phase]||m.phase)}</span><span><b>${esc('Vertrag')}</b> ${UI.code(c.id)} · ${esc(c.name)}</span><span><b>${esc('Übergabe im Spiel')}</b> ${esc(m.handoverMode==='digital'?'digital':'manuell')}</span><span class="demo-tag">${esc('Demonstration · keine CFHarvest-Produktoberfläche')}</span></div>`;
}
function navHtml(){
  const v=S.view,cur=v.nav==='order'?'planning':v.nav;
  return NAV.map(([k,icon,de,svTerm,drop])=>{
    const btn=`<button type="button" ${drop?`data-action="nav-menu" data-key="${k}" aria-expanded="${v.menu===k}"`:`data-nav="${k}"`} aria-current="${cur===k}" title="${UI.tip(de,svTerm)}"><span class="ico" aria-hidden="true">${icon}</span><span class="nav-label">${esc(de)}</span>${drop?' ▾':''}</button>`;
    if(!drop)return btn;
    const items=k==='admin'?V.ADMIN_MENU.map(([p,l,s,on])=>`<button type="button" role="menuitem" data-action="admin-page" data-key="${p}" ${on?'':'disabled'} title="${UI.tip(on?l:l+' · in dieser Demo nicht umgesetzt',s)}">${esc(l)}</button>`).join(''):`<button type="button" role="menuitem" data-action="help-page">${esc('Hilfe und Begriffe')}</button><button type="button" role="menuitem" data-action="help-page">${esc('Über diese Demo')}</button>`;
    return `<span class="nav-drop">${btn}${v.menu===k?`<div class="menu-list nav-menu" role="menu">${items}</div>`:''}</span>`;
  }).join('');
}
function planningHtml(vm,v){
  const views=VIEW_KEYS.filter(k=>v.views.includes(k)),names=views.map(k=>VIEW_NAMES[k][0]);
  const checked=v.checked.filter(id=>vm.orders.some(o=>o.id===id));
  const render={list:()=>V.uppdragslista(vm,v,UI),map:()=>V.karta(vm,v,UI),calendar:()=>V.kalender(vm,v,UI),resources:()=>V.resurser(vm,v,UI)};
  const panes=views.map((k,i)=>`${i?`<div class="splitter" role="separator" aria-orientation="vertical" tabindex="0" data-split="${views[i-1]}|${k}" aria-label="${esc('Breite anpassen')}" title="${esc('Breite anpassen')}"></div>`:''}<div class="pane" data-pane="${k}" style="flex-grow:${v.widths[k]||1}">${render[k]()}</div>`).join('');
  return `<div class="planning-bar">
    <details class="multi view-select" ${v.viewMenu?'open':''}><summary data-action="view-menu" title="SV: Select views">${esc('Ansichten')}: ${names.map(n=>esc(n)).join(', ')||esc('keine')}</summary><div class="multi-list">${VIEW_KEYS.map(k=>`<label><input type="checkbox" data-change="view-toggle" value="${k}" ${v.views.includes(k)?'checked':''}> ${UI.term(VIEW_NAMES[k][0],VIEW_NAMES[k][1])}</label>`).join('')}</div></details>
    <span class="segmented" role="group" aria-label="${esc('Maßnahmenfilter')}">${V.OP_FILTERS.map(([k,de,s])=>`<button type="button" data-action="op-filter" data-key="${k}" aria-pressed="${v.opFilter===k}" title="SV: ${esc(s)}">${esc(de)}</button>`).join('')}</span>
    <span class="bar-right"><label class="pick-row"><span class="sr-only">${esc('Ressource wählen')}</span><select data-change="pick-row" title="${UI.tip('Ressource wählen','Välj resurs')}"><option value="">${esc('Ressource wählen')} ▾</option>${vm.rows.map(r=>`<option value="${esc(r.id)}" ${v.pickRow===r.id?'selected':''}>${esc(r.name)} (${esc(r.kind==='chain'?r.id:r.stanford||r.id)})</option>`).join('')}</select></label>
    <button type="button" class="green" data-action="move-open" ${checked.length?'':'disabled'} title="${UI.tip('Auf Ressource verschieben','Flytta till resurs')}">➦ ${esc('Auf Ressource verschieben')} (<span data-move-count>${UI.num(checked.length,0)}</span>)</button></span>
  </div>
  ${vm.staged?`<div class="stage-bar" role="status"><span>${UI.num(vm.staged,0)} ${esc('ungespeicherte Änderungen')}</span><button type="button" data-action="stage-reset">↶ ${esc('Zurücksetzen')}</button><button type="button" class="green" data-action="stage-save">💾 ${esc('Speichern')}</button></div>`:''}
  <div class="planning-grid" data-views="${views.join(' ')}">${panes||`<p class="empty-state">${esc('Bitte mindestens eine Ansicht wählen.')}</p>`}</div>`;
}
function sendGroups(d){
  const vm=S.vm,{days,off}=V.calWindow(S.view),shown=V.calRows(vm,S.view).map(r=>r.id);
  return vm.rows.filter(r=>!d.filter||shown.includes(r.id)).map(row=>({row,items:row.items.filter(it=>!d.filter||(it.startPos!=null&&it.endPos>off&&it.startPos<off+days)).map(it=>({it,o:vm.orders.find(o=>o.id===it.orderId)}))})).filter(g=>g.items.length);
}
function unplanList(d){const vm=S.vm;if(d.items)return d.items.map(id=>vm.rows.flatMap(r=>r.items).find(i=>i.id===id)).filter(Boolean).map(it=>({o:vm.orders.find(o=>o.id===it.orderId),row:vm.rows.find(r=>r.id===it.rowId),sent:it.sent}));return d.orders.map(id=>vm.orders.find(o=>o.id===id)).filter(Boolean).map(o=>({o,row:o.row,sent:o.sentAny}));}
const minutesOf=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?Number(m[1])*60+Number(m[2]):M.START_CLOCK*60;};
function editPreview(d){
  const vm=S.vm,it=vm.rows.flatMap(r=>r.items).find(i=>i.id===d.itemId);if(!it)return{};const row=vm.rows.find(r=>r.id===it.rowId),dr=d.draft||{};
  const sdate=dr.sdate??it.startTime?.iso??M.dayISO(vm.calendar.currentDay),stime=dr.stime??it.startTime?.clock??'09:00',day=M.dayIndexOf(sdate);
  const start=Math.max(M.startHourOfDay(row,vm.calendar.currentDay),M.hourAt(row,day??vm.calendar.currentDay,minutesOf(stime)));
  let manualOn=dr.manualOn??!!it.manualHours,manual=Number(dr.manual??(it.manualHours||+it.estimated.toFixed(1)));
  if(d.endTouched){const eDay=M.dayIndexOf(dr.edate??it.endTime?.iso),end=eDay==null?null:M.hourAt(row,eDay,minutesOf(dr.etime??it.endTime?.clock));if(end!=null&&end>start){manualOn=true;manual=+(end-start).toFixed(2);}}
  const hours=manualOn&&manual>0?manual:it.estimated,endT=M.timeOf(row,start+hours,true);
  return{manualOn,manual,sdate,stime,edate:endT?.iso||'',etime:endT?.clock||'',hours,start,day,endText:endT?`${UI.dateText(endT.iso)} ${endT.clock}`:'–'};
}
function updateEditPreview(){const d=S.view.dialog;if(d?.type!=='edit')return;const p=editPreview(d),q=s=>$('cfhDialog').querySelector(s);if(!q('[data-calc-end]'))return;
  q('[data-calc-end]').textContent=p.endText;q('[data-calc-hours]').textContent=UI.num(p.hours);
  if(!d.endTouched){q('[data-dialog="edate"]').value=p.edate;q('[data-dialog="etime"]').value=p.etime;}else{q('[data-dialog="manual"]').value=p.manual;q('[data-dialog="manualOn"]').checked=p.manualOn;}}
function render(){
  const ae=document.activeElement,key=focusKey(ae),sel=ae&&'selectionStart'in ae&&!['checkbox','radio','number','date','time','email'].includes(ae.type)?[ae.selectionStart,ae.selectionEnd]:null;
  S.snap=B.fromGameState(S.game);S.vm=M.viewModel(S.snap,S.plan);S.vm.staged=S.history.length;S.vm.siteCheck=S.siteCheck;const vm=S.vm,v=S.view;
  if(v.calStart==null)v.calStart=Math.max(0,M.mondayOf(vm.calendar.currentDay));
  if(v.selected&&!vm.orders.some(o=>o.id===v.selected))v.selected=null;
  if(v.selItem&&!vm.rows.some(r=>r.items.some(i=>i.id===v.selItem)))v.selItem=null;
  v.checked=v.checked.filter(id=>vm.orders.some(o=>o.id===id&&!o.closed));
  $('cfhNav').innerHTML=navHtml();$('cfhBanner').innerHTML=banner(vm);
  let main='';
  if(v.nav==='order'&&vm.orders.some(o=>o.id===v.detail.orderId))main=V.orderDetail(vm,v,UI);
  else if(v.nav==='orders')main=V.bestallningar(vm,v,UI);
  else if(v.nav==='admin')main=V.admin(vm,v,UI);
  else if(v.nav==='messages')main=V.meddelanden(vm,v,UI);
  else if(v.nav==='integration')main=V.integrationslogg(vm,v,UI);
  else if(v.nav==='reports')main=V.rapporter(vm,v,UI);
  else if(v.nav==='help')main=V.hjalp(vm,v,UI);
  else{v.nav='planning';main=planningHtml(vm,v);}
  $('cfhMain').innerHTML=main;
  const dlg=$('cfhDialog'),html=V.dialog(vm,v,UI,{sendGroups,unplanList,editPreview,returnPreview,demo:!S.nonce});dlg.innerHTML=html?`<div class="dialog-body" data-dialog-type="${esc(v.dialog.type)}">${html}</div>`:'';
  if(html&&!dlg.open){if(typeof dlg.showModal==='function'){try{dlg.showModal();}catch{dlg.setAttribute('open','');}}else dlg.setAttribute('open','');}
  if(!html&&dlg.open){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open');}
  document.body.classList.toggle('landing-mode',!!v.landingMode);
  restoreFocus(key,sel);
}
let toastTimer=null;
function toast(text){const t=$('cfhToast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500);}

/* ---------- Actions ---------- */
const order=id=>S.vm.orders.find(o=>o.id===id),rowById=id=>S.vm.rows.find(r=>r.id===id),itemById=id=>S.vm.rows.flatMap(r=>r.items).find(i=>i.id===id);
const names=ids=>ids.map(id=>order(id)?.name||id).join(', ');
const dq=s=>$('cfhDialog').querySelector(s);
function openEdit(itemId){const it=itemById(itemId);if(!it)return;S.view.selItem=itemId;S.view.selected=it.orderId;S.view.dialog={type:'edit',itemId,draft:{},msgOpen:false};render();}
function openOrder(id,tab){const v=S.view;v.selected=id;v.nav='order';v.menu=null;v.detail={orderId:id,tab:tab||'order',draft:{},showMap:v.detail.showMap!==false,funcOpen:false};render();try{window.scrollTo(0,0);}catch{}}
function moveWithin(delta){const it=itemById(S.view.selItem);if(!it)return;const row=rowById(it.rowId),idx=row.items.findIndex(i=>i.id===it.id),to=idx+delta;if(to<0||to>row.items.length-1)return;stage(M.insertAt(S.plan,S.snap,null,row.id,to,{itemId:it.id,stage:true}),tr('Reihenfolge geändert')+' · '+tr('Speichern nicht vergessen'));}
function planOrders(ids,rowId,opts,how){const plan=M.assign(S.plan,S.snap,ids,rowId,{...opts,stage:true});S.view.selected=ids[0];S.view.checked=[];stage(plan,`${names(ids)} → ${rowById(rowId)?.name||rowId}${how?' · '+how:''}`);}
function placeLanding(e){
  const id=S.view.nav==='order'?S.view.detail.orderId:S.view.selected,o=order(id),svg=e.target.closest('svg.cfh-map');if(!o||!svg)return;
  let pt=null;try{const m=svg.getScreenCTM?.();if(m&&svg.createSVGPoint){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(m.inverse());pt=[+q.x.toFixed(1),+q.y.toFixed(1)];}}catch{}
  S.view.landingMode=false;mutate(plan=>{const list=(plan.edits[id]??={}).landings??=[];if(!pt||!pt.every(Number.isFinite))pt=[o.landing.point[0]+14*(list.length+1),o.landing.point[1]-10];list.push(pt);},`${tr('Polterplatz')} · ${o.landing.id}-${(S.base.edits[id]?.landings?.length||0)+2}`);
}
const actions={
  nav:el=>{const v=S.view;v.nav=el.dataset.nav;v.menu=null;v.dialog=null;render();},
  'nav-menu':el=>{S.view.menu=S.view.menu===el.dataset.key?null:el.dataset.key;render();},
  'admin-page':el=>{const v=S.view;v.nav='admin';v.admin.page=el.dataset.key;v.admin.draft={};v.admin.weekSel=[];v.menu=null;render();},
  'help-page':()=>{S.view.nav='help';S.view.menu=null;render();},
  logout:()=>toast(tr('Abmelden ist in der Demo ohne Funktion.')),
  'view-menu':(el,e)=>{e?.preventDefault();S.view.viewMenu=!S.view.viewMenu;render();},
  'hide-view':el=>{S.view.views=S.view.views.filter(k=>k!==el.dataset.viewKey);local.set('cfharvest-views-v1',JSON.stringify(S.view.views));render();},
  'op-filter':el=>{S.view.opFilter=el.dataset.key;S.view.page=0;render();},
  'move-open':()=>{const v=S.view,ids=v.checked.filter(id=>order(id)&&!order(id).closed);if(!ids.length)return toast(tr('Gesperrte Hiebe können nicht geplant werden.'));if(!v.pickRow){toast(tr('Bitte zuerst eine Ressource wählen.'));document.querySelector('[data-change="pick-row"]')?.focus();return;}v.dialog={type:'date',orders:ids,rowId:v.pickRow,dateISO:M.dayISO(S.vm.calendar.currentDay)};render();},
  'date-ok':()=>{const d=S.view.dialog,day=M.dayIndexOf(dq('[data-dialog="date"]')?.value)??S.vm.calendar.currentDay;S.view.dialog=null;planOrders(d.orders,d.rowId,{mode:'day',day});},
  'date-last':()=>{const d=S.view.dialog;S.view.dialog=null;planOrders(d.orders,d.rowId,{mode:'after'},tr('als letzter'));},
  'dialog-cancel':()=>{S.view.dialog=null;render();},
  /* list toolbar */
  'filter-toggle':()=>{S.view.filtersOpen=!S.view.filtersOpen;render();},
  'filter-clear':()=>{Object.assign(S.view,{filters:{},search:'',page:0,opFilter:'drivning'});render();},
  'col-menu':()=>{S.view.colMenu=!S.view.colMenu;render();},
  'sort-reset':()=>{S.view.sort={key:'seq',dir:1};render();},
  'select-all':()=>{const ids=V.filterOrders(S.vm,S.view).filter(o=>!o.closed).map(o=>o.id);S.view.checked=S.view.checked.length===ids.length?[]:ids;render();},
  renumber:()=>{const list=V.filterOrders(S.vm,S.view).map(o=>o.id);mutate(p=>{p.routeOrder=list;},tr('Laufende Nummern neu geordnet'));},
  undo:()=>{if(!S.history.length)return;S.plan=S.history.pop();S.view.canUndo=S.history.length>0;render();toast(tr('Rückgängig'));},
  'list-pdf':()=>api.print(),
  page:el=>{S.view.page=Math.max(0,Number(el.dataset.page)||0);render();},
  'page-size':el=>{S.view.pageSize=el.dataset.size==='all'?'all':Number(el.dataset.size);S.view.page=0;render();},
  sort:el=>{const k=el.dataset.key;S.view.sort=S.view.sort.key===k?{key:k,dir:-S.view.sort.dir}:{key:k,dir:1};render();},
  'open-order':el=>openOrder(el.dataset.order,el.dataset.tab),
  'select-order':el=>{const v=S.view,id=el.dataset.order;v.selected=id;if(!v.checked.includes(id))v.checked=order(id)?.closed?[]:[id];render();},
  /* calendar */
  'select-item':el=>{const id=el.dataset.item,now=Date.now(),dbl=S.lastBar&&S.lastBar.id===id&&now-S.lastBar.t<450;S.lastBar={id,t:now};if(dbl){S.lastBar=null;return openEdit(id);}S.view.selItem=id;S.view.selected=el.dataset.order;render();},
  'send-open':()=>{const v=S.view,d={type:'send',filter:true,sel:[],notify:{}};const groups=sendGroups(d),rows=v.rowChecked.length?v.rowChecked:null;
    d.sel=groups.flatMap(g=>g.items).filter(({it})=>(!it.sent||it.outdated)&&(!rows||rows.includes(it.rowId))).map(({it})=>it.id);if(!d.sel.length&&v.selItem)d.sel=[v.selItem];v.dialog=d;render();},
  'send-exclude':el=>{const d=S.view.dialog;d.sel=d.sel.filter(x=>x!==el.dataset.item);render();},
  'send-confirm':()=>{const d=S.view.dialog,ids=[...d.sel];if(!ids.length)return toast(tr('Kein Auftrag ausgewählt.'));S.view.dialog=null;const saved=commitStaged();S.base=M.send(S.base,S.snap,{itemIds:ids});S.plan=S.base;savePlan();render();toast(`${tr('An Ressource gesendet')}: ${ids.length} · OIN/PIN${saved?' · '+tr('Änderungen gespeichert'):''}`);},
  'cal-today':()=>{S.view.calStart=Math.max(0,M.mondayOf(S.vm.calendar.currentDay));render();},
  refresh:()=>{const inc=readIncoming();if(inc)S.game=inc.env.state;S.siteCheck=readSiteCheck();S.view.detail.draft={};S.view.admin.draft={};render();toast(tr('Aktualisiert'));},
  'compress-open':()=>{const v=S.view,{days,off}=V.calWindow(v),rows=v.rowChecked.length?[...v.rowChecked]:V.calRows(S.vm,v).filter(r=>r.items.length).map(r=>r.id);v.dialog={type:'compress',rows,from:M.dayISO(Math.max(off,S.vm.calendar.currentDay)),to:M.dayISO(off+days-1),newStart:false};render();},
  'compress-confirm':()=>{const d=S.view.dialog,from=M.dayIndexOf(dq('[data-dialog="from"]')?.value),to=M.dayIndexOf(dq('[data-dialog="to"]')?.value),ns=!!dq('[data-dialog="newstart"]')?.checked;S.view.dialog=null;
    stage(M.compress(S.plan,S.snap,d.rows,{from:from??undefined,to:to??undefined,newStartDay:ns&&from!=null?from:undefined,stage:true}),tr('Kalender komprimiert')+' · '+tr('Speichern nicht vergessen'));},
  'res-menu':(el,e)=>{e?.preventDefault();S.view.resMenuOpen=!S.view.resMenuOpen;render();},
  'res-all':()=>{S.view.rowsShown=null;render();},
  'insert-mode':()=>{S.view.insertMode=!S.view.insertMode;render();},
  insert:el=>{const v=S.view;v.insertMode=false;const idx=Number(el.dataset.index),row=el.dataset.row;
    if(v.selItem){stage(M.insertAt(S.plan,S.snap,null,row,idx,{itemId:v.selItem,stage:true}),tr('Eingefügt')+' · '+tr('Speichern nicht vergessen'));return;}
    const id=v.selected;if(!id)return;stage(M.insertAt(S.plan,S.snap,id,row,idx,{stage:true}),`${order(id)?.name} → ${rowById(row)?.name} · ${tr('Speichern nicht vergessen')}`);},
  'edit-item':()=>openEdit(S.view.selItem),
  'move-item':()=>{const it=itemById(S.view.selItem);if(!it)return;const other=S.vm.rows.find(r=>r.id!==it.rowId);S.view.dialog={type:'moved',itemId:it.id,rowId:other?.id,dateISO:it.startTime?.iso,lock:true};render();},
  'moved-move':()=>movedConfirm(false),'moved-copy':()=>movedConfirm(true),
  'item-earlier':()=>moveWithin(-1),'item-later':()=>moveWithin(1),
  'unplan-open':el=>{const v=S.view;if(el.dataset.scope==='item'){if(v.selItem){v.dialog={type:'unplan',items:[v.selItem]};render();}return;}const ids=v.checked.filter(id=>order(id)?.assignment);if(ids.length){v.dialog={type:'unplan',orders:ids};render();}},
  'unplan-confirm':()=>{const d=S.view.dialog;S.view.dialog=null;S.view.checked=[];if(d.items){S.view.selItem=null;stage(M.removeItems(S.plan,d.items),tr('Planung entfernt')+' · '+tr('Speichern nicht vergessen'));}else stage(M.unassign(S.plan,d.orders),tr('Planung entfernt')+' · '+tr('Speichern nicht vergessen'));},
  'cal-zoom':el=>{S.view.zoom=el.dataset.zoom;render();},
  'cal-prev':()=>{const{days}=V.calWindow(S.view);S.view.calStart=Math.max(0,S.view.calStart-Math.max(7,Math.round(days/3/7)*7));render();},
  'cal-next':()=>{const{days}=V.calWindow(S.view);S.view.calStart+=Math.max(7,Math.round(days/3/7)*7);render();},
  'cal-prev-big':()=>{const{days}=V.calWindow(S.view);S.view.calStart=Math.max(0,S.view.calStart-days);render();},
  'cal-next-big':()=>{const{days}=V.calWindow(S.view);S.view.calStart+=days;render();},
  'planned-only':()=>{S.view.plannedOnly=!S.view.plannedOnly;render();},
  'stage-save':()=>{commitStaged();render();toast(tr('Gespeichert'));},
  'stage-reset':()=>{resetStaged();render();toast(tr('Änderungen verworfen'));},
  /* map */
  'map-zoom-in':()=>{S.view.mapZoom=Math.min(3,S.view.mapZoom+1);S.view.mapPan=[0,0];render();},
  'map-zoom-out':()=>{S.view.mapZoom=Math.max(0,S.view.mapZoom-1);S.view.mapPan=[0,0];render();},
  'map-pan':el=>{const p=S.view.mapPan||[0,0];S.view.mapPan=[Math.max(-1,Math.min(1,p[0]+.2*Number(el.dataset.dx))),Math.max(-1,Math.min(1,p[1]+.2*Number(el.dataset.dy)))];render();},
  'map-pan-reset':()=>{S.view.mapPan=[0,0];render();},
  'map-print':()=>api.print(),
  'map-layers':()=>{S.view.mapLayerMenu=!S.view.mapLayerMenu;render();},
  'map-legend':()=>{S.view.mapLegend=!S.view.mapLegend;render();},
  'map-add-landing':()=>{const v=S.view,id=v.nav==='order'?v.detail.orderId:v.selected;if(!id)return;v.landingMode=!v.landingMode;if(v.nav==='order')v.detail.showMap=true;else{if(v.mapZoom<2)v.mapZoom=2;if(!v.views.includes('map'))v.views=[...v.views,'map'];}render();if(v.landingMode)toast(tr('In die Karte klicken, um den Polterplatz zu setzen.'));},
  /* order detail */
  'detail-back':()=>{S.view.nav='planning';render();},
  'detail-tab':el=>{S.view.detail.tab=el.dataset.tab;S.view.detail.funcOpen=false;render();},
  'detail-map':()=>{S.view.detail.showMap=S.view.detail.showMap===false;render();},
  'detail-func-menu':()=>{S.view.detail.funcOpen=!S.view.detail.funcOpen;render();},
  'detail-save':()=>{const id=S.view.detail.orderId,d=S.view.detail.draft;mutate(p=>{const e=p.edits[id]??={};for(const k of ['infoContractor','infoClient'])if(d[k]!==undefined)e[k]=String(d[k]).slice(0,1000);for(const [k,val] of Object.entries(d))if(k.startsWith('vol-')&&Number.isFinite(Number(val)))(e.volumes??={})[k.slice(4)]=Math.max(0,Number(val));});S.view.detail.draft={};toast(tr('Gespeichert'));},
  'open-sitecheck':el=>api.navigate(siteCheckUrl(el.dataset.order,el.dataset.phase==='post'?'post':'pre')),
  'pin-toggle':el=>{const id=S.view.detail.orderId,k=el.dataset.key;mutate(p=>{const r=p.pinRemoved[id]??={};if(r[k])delete r[k];else r[k]=true;},tr(S.base.pinRemoved?.[id]?.[k]?'PIN-Datei wiederhergestellt':'PIN-Datei entfernt'));},
  'detail-func':el=>{const v=S.view,o=order(v.detail.orderId);v.detail.funcOpen=false;const f=el.dataset.func,g=o.stand.byGrade;
    if(f==='message'){v.nav='messages';v.msgTo=o.row?.id||v.msgTo;v.msgText=tr(o.name)+': ';render();return;}
    if(f==='drone'){render();return api.navigate(siteCheckUrl(o.id,o.events.some(e=>e.kind==='harvest')?'post':'pre'));}
    if(['summary-pdf','save-pdf'].includes(f)){render();return api.print();}
    if(f==='save-file'){render();return api.download(`${o.id}-stanford.json`,JSON.stringify(o.instructions,null,2));}
    render();toast({control:tr('Kontrollmessungen')+': '+tr('keine Messdaten in der Demo'),scale:tr('Waagenkontrolle')+': '+tr('keine Messdaten in der Demo'),forecast:`${tr('Rückeprognose')}: ${UI.num(o.followUp.forestStock)} ${tr('fm Waldlager zum Rücken bereit')}`,forwarding:`${tr('Rückemeldung')}: ${UI.num(o.followUp.forestStock)} ${tr('fm Waldlager zum Rücken bereit')}`,evaluation:tr('Schlussbewertung')+': '+tr('Demo, kein Formular'),close:tr('Auftrag abgeschlossen: alle Mengen gerückt.'),labels:`${tr('Polterzettel')} ${o.landing.id}: ${UI.num(g.saw.roadside+g.pulp.roadside+g.down.roadside)} fm · ${tr('Demo, kein Druck')}`,edit:tr('Felder in den Reitern bearbeiten und speichern.')}[f]||'');},
  /* quick edit */
  'edit-message':()=>{const d=S.view.dialog;d.msgOpen=!d.msgOpen;render();},
  'edit-message-send':()=>{const d=S.view.dialog,it=itemById(d.itemId),text=String(dq('[data-dialog="message"]')?.value||'').trim();if(!text)return;d.msgOpen=false;d.message='';mutate(p=>{p.messages.push({to:it.rowId,orderId:it.orderId,text:text.slice(0,500),round:S.vm.meta.round});},tr('Nachricht gesendet'));},
  'edit-delete':()=>{const d=S.view.dialog;S.view.dialog=null;S.view.selItem=null;stage(M.removeItems(S.plan,[d.itemId]),tr('Aus dem Kalender gelöscht')+' · '+tr('Speichern nicht vergessen'));},
  'edit-update':()=>{const d=S.view.dialog,p=editPreview(d);S.view.dialog=null;stage(M.updateItem(S.plan,S.snap,d.itemId,{day:p.day??S.vm.calendar.currentDay,minutes:minutesOf(p.stime),manualHours:p.manualOn?p.manual:null,stage:true}),tr('Aktualisiert')+' · '+tr('Speichern nicht vergessen'));},
  /* order book */
  'book-search':()=>{render();toast(tr('Gefiltert'));},
  'book-region':()=>{S.view.book.region=!S.view.book.region;render();},
  'book-kind':el=>{S.view.book.kind=el.dataset.kind;render();},
  'book-basis':el=>{S.view.book.basis=el.dataset.basis;render();},
  'book-edit':el=>{S.view.book.edit=S.view.book.edit===el.dataset.book?null:el.dataset.book;render();},
  'book-confirm':()=>{mutate(p=>{for(const b of S.vm.orderBook)if(b.ordered)p.orderBook[b.id]={...(p.orderBook[b.id]||{}),confirmed:true};},tr('Bestellung bestätigt'));},
  'book-save':()=>{const dr=S.view.bookDraft;mutate(p=>{for(const [id,x] of Object.entries(dr)){const e=p.orderBook[id]={...(p.orderBook[id]||{})};if(x.min!==undefined&&Number.isFinite(Number(x.min)))e.min=Number(x.min);if(x.max!==undefined&&Number.isFinite(Number(x.max)))e.max=Number(x.max);if(x.comment!==undefined)e.comment=String(x.comment).slice(0,200);}if(S.view.bookMessage)p.messages.push({to:'client',text:S.view.bookMessage.slice(0,500),round:S.vm.meta.round});});S.view.bookDraft={};S.view.bookMessage='';toast(tr('Gespeichert'));},
  'book-order':el=>openOrder(el.dataset.order),
  /* administration */
  'admin-res':el=>{const a=S.view.admin;a.resource=el.dataset.res;a.draft={};render();},
  'admin-res-tab':el=>{const a=S.view.admin;a.tab=el.dataset.tab;a.draft={};render();},
  'admin-new':()=>{const n=S.base.extraResources.length+1,id='R-'+String(n).padStart(2,'0');S.view.admin.resource=id;S.view.admin.tab='base';mutate(p=>{p.extraResources.push({id,type:'crew',name:'Arbeitsgruppe '+id,model:'',stanford:'',operation:'Holzernte',rate:10,unit:'fm/h',production:{},weekly:{mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0},active:true,plannable:true,subcontractor:false,followUp:null,base:{manufacturer:'',year:null,bearingClass:'',plateWeight:null,extinguisherChecked:'',aggregate:'',phone:'',email:'',servicePackages:[],woodforceStart:''}});},tr('Neue Ressource angelegt · nicht mit dem Spiel verbunden'));},
  'admin-save':()=>{const a=S.view.admin,id=a.resource,d=a.draft,r=S.vm.resourcesAll.find(x=>x.id===id);if(!r)return;const patch={};
    for(const k of ['name','model','stanford'])if(d[k]!==undefined)patch[k]=String(d[k]).slice(0,60);if(d.active!==undefined)patch.active=!!d.active;
    if(d.base)patch.base={...(r.base||{}),...d.base};
    if(d.production){patch.production={...(r.production||{})};for(const [k,val] of Object.entries(d.production))if(Number(val)>0)patch.production[k]=Number(val);if(patch.production.Slutavverkning)patch.rate=patch.production.Slutavverkning;}
    if(d.week){const w={...r.weekly},h=k=>Math.max(0,Math.min(24,Number(d.week[k])||0));if(d.week.workday!==undefined)for(const k of ['mon','tue','wed','thu','fri'])w[k]=h('workday');if(d.week.sat!==undefined)w.sat=h('sat');if(d.week.sun!==undefined)w.sun=h('sun');patch.weekly=w;}
    a.draft={};mutate(p=>{const extra=p.extraResources.find(x=>x.id===id);if(extra)Object.assign(extra,patch);else p.resources[id]={...(p.resources[id]||{}),...patch};},tr('Gespeichert'));},
  'week-prev':()=>{const a=S.view.admin;a.weekStart=(a.weekStart??M.mondayOf(S.vm.calendar.currentDay))-(a.weekSpan||7);render();},
  'week-next':()=>{const a=S.view.admin;a.weekStart=(a.weekStart??M.mondayOf(S.vm.calendar.currentDay))+(a.weekSpan||7);render();},
  'week-today':()=>{S.view.admin.weekStart=null;render();},
  'week-span':el=>{S.view.admin.weekSpan=Number(el.dataset.span);render();},
  'week-cell':el=>{const a=S.view.admin,k=el.dataset.key;a.weekSel=a.weekSel.includes(k)?a.weekSel.filter(x=>x!==k):[...a.weekSel,k];render();},
  'week-apply':()=>{const a=S.view.admin,h=Math.max(0,Math.min(24,Number(a.draft.hours??8)||0)),sel=[...a.weekSel];a.weekSel=[];
    mutate(p=>{for(const key of sel){const [id,dayS]=key.split(':'),day=Number(dayS),r=S.vm.resourcesAll.find(x=>x.id===id);if(!r)continue;const extra=p.extraResources.find(x=>x.id===id),e=extra||(p.resources[id]??={});e.days={...(e.days||{})};if(h===Number(r.weekly[M.weekday(day)]))delete e.days[day];else e.days[day]=h;}},tr('Wochenkalender gespeichert'));},
  'week-reset':()=>{const a=S.view.admin,sel=[...a.weekSel];a.weekSel=[];mutate(p=>{for(const key of sel){const [id,day]=key.split(':'),e=p.extraResources.find(x=>x.id===id)||p.resources[id];if(e?.days)delete e.days[day];}},tr('Wochenkalender gespeichert'));},
  'chain-new':()=>{const chains=structuredClone(S.vm.chainsAll),n=chains.length+1,id='K-'+String(n).padStart(2,'0'),first=S.vm.resourcesAll.find(r=>r.plannable!==false&&r.active!==false);if(!first)return;mutate(p=>{p.chains=[...chains,{id,name:'Erntekette '+id,kind:'drivningskedja',members:[first.id]}];},tr('Neue Erntekette angelegt'));},
  'chain-save':()=>{const dr=S.view.admin.chainDraft||{};S.view.admin.chainDraft={};mutate(p=>{p.chains=structuredClone(S.vm.chainsAll).map(c=>dr[c.id]!==undefined&&String(dr[c.id]).trim()?{...c,name:String(dr[c.id]).trim().slice(0,40)}:c);},tr('Gespeichert'));},
  /* messages */
  'msg-send':()=>{const v=S.view,text=String(v.msgText||'').trim();if(!text)return toast(tr('Bitte eine Nachricht eingeben.'));v.msgText='';mutate(p=>{p.messages.push({to:v.msgTo,text:text.slice(0,500),round:S.vm.meta.round});},tr('Nachricht gesendet'));},
  return:()=>{S.view.dialog={type:'return'};render();},
  'return-confirm':()=>{S.view.dialog=null;returnToGame();},
};
function movedConfirm(copy){const d=S.view.dialog,rowId=dq('[data-dialog="row"]')?.value||d.rowId,day=M.dayIndexOf(dq('[data-dialog="date"]')?.value),lock=!!dq('[data-dialog="lock"]')?.checked;S.view.dialog=null;
  const plan=M.moveItem(S.plan,S.snap,d.itemId,rowId,{day:day??undefined,lock,copy,stage:true});S.view.selItem=plan.lastItem||d.itemId;stage(plan,`${tr(copy?'Kopiert nach':'Verschoben nach')} ${rowById(rowId)?.name||rowId} · ${tr('Speichern nicht vergessen')}`);}

/* ---------- Drag and drop: list rows and calendar bars onto calendar rows ---------- */
function payloadFor(target){
  const row=target.closest?.('tr[data-row-order]');
  if(row){if(row.getAttribute('draggable')!=='true')return null;const id=row.dataset.rowOrder,v=S.view,ids=v.checked.includes(id)?S.vm.orders.filter(o=>v.checked.includes(o.id)&&!o.closed).map(o=>o.id):[id];const o=order(ids[0]);return{kind:'orders',ids,label:tr(o.operationLabel)+(ids.length>1?` (${ids.length})`:'')};}
  const bar=target.closest?.('.cal-item[data-item]');if(bar){const it=itemById(bar.dataset.item);if(!it)return null;return{kind:'item',id:it.id,rowId:it.rowId,label:UI.orderLabelText(order(it.orderId)).replace(/ - ([^-]+)$/,(m,n)=>' - '+tr(n))};}
  return null;
}
function dropInfo(track,clientX){const r=track.getBoundingClientRect(),off=Number(track.dataset.off)||0,days=Number(track.dataset.days)||7;const f=r.width>0?Math.max(0,Math.min(.9999,(clientX-r.left)/r.width)):0,pos=off+f*days;return{rowId:track.dataset.dropRow,day:Math.max(S.vm.calendar.currentDay,Math.floor(pos)),pos};}
let hl=null;
function highlight(track,info){
  if(hl&&hl.track!==track)clearHighlight();
  const off=Number(track.dataset.off)||0,days=Number(track.dataset.days)||7;
  if(!hl){track.classList.add('drop-hover');track.closest('.cal-row')?.classList.add('drop-hover');const m=document.createElement('span');m.className='drop-day';track.append(m);hl={track,marker:m};}
  hl.marker.style.left=((info.day-off)/days*100)+'%';hl.marker.style.width=(100/days)+'%';hl.marker.textContent=UI.dateText(M.dayISO(info.day),{day:'2-digit',month:'2-digit'});
}
function clearHighlight(){if(!hl)return;hl.track.classList.remove('drop-hover');hl.track.closest('.cal-row')?.classList.remove('drop-hover');hl.marker.remove();hl=null;}
function ghost(text,x,y){const g=$('cfhGhost');if(!g)return null;g.textContent=text;g.classList.add('show');if(x!=null){g.style.left=(x+14)+'px';g.style.top=(y+10)+'px';}return g;}
function hideGhost(){const g=$('cfhGhost');if(g){g.classList.remove('show');g.style.left='-9999px';}}
function performDrop(p,info){
  if(!p||!info?.rowId||!rowById(info.rowId))return;
  if(p.kind==='orders'){planOrders(p.ids,info.rowId,{mode:'day',day:info.day},tr('Speichern nicht vergessen'));return;}
  const it=itemById(p.id);if(!it)return;
  if(it.rowId===info.rowId){const row=rowById(it.rowId),others=row.items.filter(x=>x.id!==it.id),idx=others.filter(x=>x.startPos!=null&&(x.startPos+x.endPos)/2<info.pos).length;
    S.view.selItem=it.id;stage(M.insertAt(S.plan,S.snap,null,row.id,idx,{itemId:it.id,stage:true}),tr('Reihenfolge geändert')+' · '+tr('Speichern nicht vergessen'));return;}
  S.view.selItem=it.id;S.view.dialog={type:'moved',itemId:it.id,rowId:info.rowId,dateISO:M.dayISO(info.day),lock:true};render();
}
function onDragStart(e){
  if(P){e.preventDefault?.();return;}
  const p=payloadFor(e.target);if(!p)return;S.drag=p;document.body.classList.add('dragging');
  const dt=e.dataTransfer;if(dt){try{dt.setData('text/plain',JSON.stringify(p));dt.effectAllowed='copyMove';}catch{}const g=ghost(p.label,-9999,-9999);try{if(g&&dt.setDragImage)dt.setDragImage(g,12,12);}catch{}}
}
function onDragOver(e){const track=e.target.closest?.('[data-drop-row]');if(!track||!S.drag)return;e.preventDefault();if(e.dataTransfer)try{e.dataTransfer.dropEffect='move';}catch{}highlight(track,dropInfo(track,e.clientX));}
function onDrop(e){
  const track=e.target.closest?.('[data-drop-row]');if(!track)return;e.preventDefault();
  let p=S.drag;if(!p){try{p=JSON.parse(e.dataTransfer?.getData('text/plain')||'null');}catch{p=null;}}
  const info=dropInfo(track,e.clientX);clearHighlight();hideGhost();S.drag=null;document.body.classList.remove('dragging');performDrop(p,info);
}
function onDragEnd(){clearHighlight();hideGhost();S.drag=null;document.body.classList.remove('dragging');}
/* Pointer Events path for touch and pen: long press picks up, move shows the ghost and the drop target, release drops. */
let P=null;
function startPointerDrag(){if(!P)return;P.active=true;document.body.classList.add('dragging');ghost(P.payload.label,P.x,P.y);try{navigator.vibrate?.(15);}catch{}}
function hitTrack(x,y){const el=document.elementFromPoint?.(x,y);return el?.closest?.('[data-drop-row]')||null;}
function onPointerDown(e){
  const split=e.target.closest?.('.splitter');if(split)return splitStart(e,split);
  if(e.pointerType==='mouse'||e.button>0)return; // mouse uses native HTML5 drag and drop
  if(e.target.closest?.('input,select,textarea,a,button:not(.cal-item)'))return;
  const payload=payloadFor(e.target);if(!payload)return;
  P={id:e.pointerId,x:e.clientX,y:e.clientY,payload,active:false,timer:null};
  if(config.longPress<=0)startPointerDrag();else P.timer=setTimeout(startPointerDrag,config.longPress);
}
function onPointerMove(e){
  if(SP)return splitMove(e);
  if(!P||e.pointerId!==P.id)return;
  if(!P.active){if(Math.hypot(e.clientX-P.x,e.clientY-P.y)>10){clearTimeout(P.timer);P=null;}return;}
  e.preventDefault?.();ghost(P.payload.label,e.clientX,e.clientY);const track=hitTrack(e.clientX,e.clientY);if(track)highlight(track,dropInfo(track,e.clientX));else clearHighlight();
}
function onPointerUp(e){
  if(SP)return splitEnd();
  if(!P||e.pointerId!==P.id)return;clearTimeout(P.timer);const was=P;P=null;
  if(was.active){const track=hitTrack(e.clientX,e.clientY),info=track?dropInfo(track,e.clientX):null;clearHighlight();hideGhost();document.body.classList.remove('dragging');S.suppressClick=true;setTimeout(()=>{S.suppressClick=false;},400);if(info)performDrop(was.payload,info);}
}
function onPointerCancel(){if(SP)return splitEnd();if(P){clearTimeout(P.timer);P=null;}clearHighlight();hideGhost();document.body.classList.remove('dragging');}
/* ---------- View splitters (Pointer Events + keyboard) [M37] ---------- */
let SP=null;
function splitStart(e,split){e.preventDefault?.();const l=split.previousElementSibling,r=split.nextElementSibling;if(!l||!r)return;SP={split,l,r,x:e.clientX,lw:l.getBoundingClientRect().width,rw:r.getBoundingClientRect().width,lg:Number(l.style.flexGrow)||1,rg:Number(r.style.flexGrow)||1};try{split.setPointerCapture?.(e.pointerId);}catch{}split.classList.add('active');}
function splitMove(e){const s=SP,total=s.lw+s.rw;if(total<=0)return;const lw=Math.max(200,Math.min(total-200,s.lw+e.clientX-s.x)),g=s.lg+s.rg;s.l.style.flexGrow=String(g*lw/total);s.r.style.flexGrow=String(g*(total-lw)/total);}
function splitEnd(){const s=SP;SP=null;s.split.classList.remove('active');const w=S.view.widths;w[s.l.dataset.pane]=Number(s.l.style.flexGrow)||1;w[s.r.dataset.pane]=Number(s.r.style.flexGrow)||1;}
function splitKey(e,split){const [a,b]=split.dataset.split.split('|'),w=S.view.widths,step=e.key==='ArrowLeft'?-.15:.15;const na=Math.max(.3,(w[a]||1)+step),nb=Math.max(.3,(w[b]||1)-step);w[a]=na;w[b]=nb;render();document.querySelector(`[data-split="${a}|${b}"]`)?.focus();}

/* ---------- Events ---------- */
function onClick(e){
  if(S.suppressClick){S.suppressClick=false;e.preventDefault();return;}
  const v=S.view;
  if(v.landingMode&&e.target.closest?.('svg.cfh-map')){placeLanding(e);return;}
  const el=e.target.closest?.('[data-action],[data-nav]');
  const closeMenus=()=>{let changed=false;if(v.menu&&!e.target.closest('.nav-drop')){v.menu=null;changed=true;}if(v.colMenu&&!e.target.closest('.menu')){v.colMenu=false;changed=true;}if(v.detail.funcOpen&&!e.target.closest('.menu')){v.detail.funcOpen=false;changed=true;}if(v.viewMenu&&!e.target.closest('.view-select')){v.viewMenu=false;changed=true;}if(v.resMenuOpen&&!e.target.closest('.res-picker')&&el?.dataset.action!=='res-menu'){v.resMenuOpen=false;changed=true;}return changed;};
  if(el&&!el.disabled){const a=el.dataset.nav?'nav':el.dataset.action;closeMenus();if(actions[a]){if(el.tagName==='BUTTON'||el.tagName==='SUMMARY')e.preventDefault();actions[a](el,e);}return;}
  const row=e.target.closest?.('tr[data-row-order]');
  if(row&&!e.target.closest('input,button,a,label,select')){closeMenus();const id=row.dataset.rowOrder;v.selected=id;if(!order(id)?.closed)v.checked=v.checked.includes(id)?v.checked.filter(x=>x!==id):[...v.checked,id];render();return;}
  if(closeMenus())render();
}
function onDblClick(e){const bar=e.target.closest?.('.cal-item[data-item]');if(bar){e.preventDefault();S.lastBar=null;openEdit(bar.dataset.item);}}
function onChange(e){
  const el=e.target,c=el.dataset?.change,v=S.view;if(!c)return;
  if(c==='check'){v.checked=el.checked?[...new Set([...v.checked,el.value])]:v.checked.filter(x=>x!==el.value);v.selected=el.value;}
  else if(c==='seq'){const id=el.dataset.order,n=Math.max(1,Math.round(Number(el.value)||0));const cur=S.vm.plan.routeOrder.length?S.vm.plan.routeOrder.filter(x=>x!==id):V.filterOrders(S.vm,{...v,sort:{key:'seq',dir:1}}).map(o=>o.id).filter(x=>x!==id);if(!el.value){mutate(p=>{p.routeOrder=p.routeOrder.filter(x=>x!==id);});return;}cur.splice(Math.min(n-1,cur.length),0,id);mutate(p=>{p.routeOrder=cur;},tr('Ordnungsnummer gesetzt'));return;}
  else if(c==='column')v.columns[el.value]=el.checked;
  else if(c==='filter'){v.filters={...v.filters,[el.dataset.key]:el.value};v.page=0;}
  else if(c==='view-toggle'){const set=new Set(v.views);if(el.checked)set.add(el.value);else set.delete(el.value);v.views=VIEW_KEYS.filter(k=>set.has(k));local.set('cfharvest-views-v1',JSON.stringify(v.views));}
  else if(c==='pick-row')v.pickRow=el.value;
  else if(c==='row')v.rowChecked=el.checked?[...new Set([...v.rowChecked,el.value])]:v.rowChecked.filter(x=>x!==el.value);
  else if(c==='res-shown'){const all=S.vm.rows.map(r=>r.id),cur=v.rowsShown||all;const next=el.checked?[...new Set([...cur,el.value])]:cur.filter(x=>x!==el.value);v.rowsShown=next.length===all.length?null:all.filter(x=>next.includes(x));}
  else if(c==='map-layer')v.mapLayers={photo:true,overlay:true,landings:true,...v.mapLayers,[el.value]:el.checked};
  else if(c==='send-item'){const d=v.dialog;d.sel=el.checked?[...new Set([...d.sel,el.value])]:d.sel.filter(x=>x!==el.value);}
  else if(c==='send-row'){const d=v.dialog,ids=rowById(el.value)?.items.map(i=>i.id)||[];d.sel=el.checked?[...new Set([...d.sel,...ids])]:d.sel.filter(x=>!ids.includes(x));}
  else if(c==='send-filter'){const d=v.dialog;d.filter=el.checked;}
  else if(c==='send-notify'){const d=v.dialog;d.notify={...d.notify,[el.value]:el.checked};}
  else if(c==='admin-type')v.admin.typeFilter=el.value;
  else if(c==='admin-package'){const a=v.admin,r=S.vm.resourcesAll.find(x=>x.id===a.resource),cur=a.draft.base?.servicePackages??r?.base?.servicePackages??[];a.draft.base={...(a.draft.base||{}),servicePackages:el.checked?[...new Set([...cur,el.value])]:cur.filter(x=>x!==el.value)};}
  else if(c==='chain-member'){const chains=structuredClone(S.vm.chainsAll),ch=chains.find(x=>x.id===el.dataset.chain);ch.members=el.checked?[...new Set([...ch.members,el.value])]:ch.members.filter(x=>x!==el.value);if(!ch.members.length){render();return toast(tr('Eine Erntekette braucht mindestens eine Ressource.'));}mutate(p=>{p.chains=chains;});return;}
  else if(c==='book'){v.book={...v.book,[el.dataset.key]:el.value};}
  else if(c==='book-limit'){const k=el.dataset.key,val=Number(el.value);if(!Number.isFinite(val))return;mutate(p=>{for(const b of S.vm.orderBook)p.orderBook[b.id]={...(p.orderBook[b.id]||{}),[k]:val};});return;}
  else return;
  render();
}
function onInput(e){
  const el=e.target,d=el.dataset||{},v=S.view;
  if(d.input==='search'){v.search=el.value;v.page=0;render();}
  else if(d.input==='filter'){v.filters={...v.filters,[d.key]:el.value};v.page=0;render();}
  else if(d.input==='res-search'){v.resSearch=el.value;render();}
  else if(d.input==='chain-name')(v.admin.chainDraft??={})[d.chain]=el.value;
  else if(d.input==='book-detail')(v.bookDraft[d.book]??={})[d.key]=el.value;
  else if(d.input==='book-message')v.bookMessage=el.value;
  else if(d.input==='msg-to')v.msgTo=el.value;
  else if(d.input==='msg-text')v.msgText=el.value;
  else if(d.draft){v.detail.draft[d.draft]=el.value;const cnt=document.querySelector(`[data-count="${d.draft}"]`);if(cnt)cnt.textContent=`${el.value.length}/1000 Zeichen`;}
  else if(d.admin)v.admin.draft[d.admin]=el.type==='checkbox'?el.checked:el.value;
  else if(d.adminBase)v.admin.draft.base={...(v.admin.draft.base||{}),[d.adminBase]:el.type==='number'?(el.value===''?'':Number(el.value)):el.value};
  else if(d.adminProd)v.admin.draft.production={...(v.admin.draft.production||{}),[d.adminProd]:el.value};
  else if(d.adminWeek)v.admin.draft.week={...(v.admin.draft.week||{}),[d.adminWeek]:el.value};
  else if(d.dialog&&v.dialog?.type==='edit'){const dl=v.dialog;(dl.draft??={})[d.dialog]=el.type==='checkbox'?el.checked:el.value;if(['edate','etime'].includes(d.dialog))dl.endTouched=true;if(['manual','manualOn','sdate','stime'].includes(d.dialog))dl.endTouched=false;if(d.dialog==='message')dl.message=el.value;updateEditPreview();}
}
function onKey(e){
  const v=S.view;
  if(e.key==='Escape'){if(v.dialog){v.dialog=null;render();}else if(v.landingMode){v.landingMode=false;render();}else if(v.menu||v.colMenu||v.detail.funcOpen){v.menu=null;v.colMenu=false;v.detail.funcOpen=false;render();}return;}
  const split=e.target.closest?.('.splitter');if(split&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();return splitKey(e,split);}
  const row=e.target.matches?.('tr[data-row-order]')?e.target:null;if(row&&(e.key===' '||e.key==='Enter')){e.preventDefault();row.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
  if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute?.('role')==='button'&&e.target.tagName!=='BUTTON'){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
}
function onMapMove(e){const svg=e.target.closest?.('svg.cfh-map');if(!svg)return;const out=svg.parentElement?.querySelector('[data-map-coords]');if(!out)return;try{const m=svg.getScreenCTM?.();if(!m||!svg.createSVGPoint)return;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(m.inverse());out.textContent=`Bildkoordinaten: x ${Math.round(q.x)} · y ${Math.round(q.y)}`;}catch{}}
function init(){
  load();
  document.addEventListener('click',onClick);document.addEventListener('dblclick',onDblClick);document.addEventListener('change',onChange);document.addEventListener('input',onInput);document.addEventListener('keydown',onKey);
  document.addEventListener('dragstart',onDragStart);document.addEventListener('dragover',onDragOver);document.addEventListener('drop',onDrop);document.addEventListener('dragend',onDragEnd);
  document.addEventListener('pointerdown',onPointerDown);document.addEventListener('pointermove',e=>{onPointerMove(e);if(!P&&!SP)onMapMove(e);});document.addEventListener('pointerup',onPointerUp);document.addEventListener('pointercancel',onPointerCancel);
  document.addEventListener('touchmove',e=>{if(P?.active||SP)e.preventDefault();},{passive:false});
  document.addEventListener('contextmenu',e=>{if(P)e.preventDefault();});
  // dist/i18n.js fires this event on first load before its MutationObserver exists: translate the re-render explicitly.
  document.addEventListener('forestry-language-change',()=>{render();try{I18n.localize(document.body);}catch{}});
  window.addEventListener('pageshow',e=>{if(e.persisted){S.siteCheck=readSiteCheck();render();}});
  $('cfhDialog').addEventListener('close',()=>{if(S.view.dialog){S.view.dialog=null;render();}});
  render();
  if(S.lang&&typeof I18n!=='undefined'&&I18n.supported.includes(S.lang)&&I18n.language!==S.lang)I18n.setLanguage(S.lang);
}
// Scripts sit at the end of <body>, so the shell already exists.
if(typeof document!=='undefined'&&document.getElementById('cfhMain'))init();
return{api,config,state:()=>S,vm:()=>S.vm,render,actions,init,commitStaged};
})();
