/* CFHarvest replica · application shell: game handoff, plan store, selection sync (list ↔ map ↔ calendar), actions.
   All planning values are derived from the received game state via CFHBridge; nothing here simulates. */
'use strict';
const CFHApp=(()=>{
const B=CFHBridge,M=CFHModel,UI=CFHUI,V=CFHViews,$=id=>document.getElementById(id),esc=UI.esc;
const store={get(k){try{return sessionStorage.getItem(k);}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,v);return true;}catch{return false;}}};
const PHASES={forest:'Waldplanung',plan:'Schicht in Planung',receipt:'Schichtbericht',logistics:'Logistik',logisticsReceipt:'Abfuhrbericht',settlement:'Abrechnung',result:'Ergebnis'};
const defaultView=()=>({nav:'planning',selected:null,checked:[],search:'',clients:null,clientsOpen:false,sort:{key:'id',dir:1},columns:{},funcOpen:false,routeMode:false,zoom:'day',calOffset:0,rowChecked:[],insertMode:false,mapZoom:2,landingMode:false,hidden:{},panel:{orderId:null,tab:'order',draft:{},filesOpen:false},dialog:null,adminTab:'resources',adminResource:'H-01',adminResTab:'base',adminDraft:{},weekSel:[],bookFilter:{}});
const S={game:null,plan:M.emptyPlan(),returnUrl:null,nonce:null,source:null,notices:[],view:defaultView(),vm:null,snap:null};
const api={navigate:url=>location.assign(url),print:()=>window.print()};

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
    let plan=e.plan;if(!plan){try{plan=JSON.parse(store.get(B.KEYS.plan)||'null');}catch{plan=null;}}S.plan=M.normalizePlan(plan);}
  else{S.game=ForestJourney.start(ForestJourney.initial());S.nonce=null;S.returnUrl=null;S.source='demo';S.plan=M.emptyPlan();S.notices.push({kind:'warn',text:'Kein Spielstand übergeben: Demo-Spielstand Schicht 1 mit Standardauftrag.'});}
  if(S.plan.basis&&S.game.history.length<S.plan.basis.historyLength){S.plan=M.emptyPlan();S.notices.push({kind:'info',text:'Neuer Spielstand erkannt: Planung zurückgesetzt.'});}
}
function savePlan(){S.plan.basis={historyLength:S.game.history.length,contractId:B.fromGameState(S.game).meta.contract.id};store.set(B.KEYS.plan,JSON.stringify(S.plan));}
function returnPreview(){
  const vm=S.vm,d=vm.dispatch,name=id=>vm.orders.find(o=>o.id===id)?.name||id;
  if(!vm.meta.canApply)return{apply:false,lines:['Im Spiel wird gerade keine Schicht geplant. Der Spielstand bleibt unverändert; die Planung bleibt gespeichert.']};
  const lines=[];if(d.harvester)lines.push(['H-01',name(d.harvester)]);if(d.forwarder)lines.push(['F-01',name(d.forwarder)]);
  return{apply:lines.length>0,lines:lines.length?lines:['Für heute ist keine gesendete Planung vorhanden. Der Spielstand bleibt unverändert.'],issues:d.issues};
}
function returnToGame(){
  const vm=S.vm,next=S.nonce?B.applyPlan(S.game,vm.dispatch):S.game;savePlan();
  let url=S.returnUrl||new URL('../../dist/',location.href).href;
  if(S.nonce){const env=B.envelope('to-game',next,{plan:S.plan,lang:(typeof I18n!=='undefined'?I18n:null)?.language||'de',nonce:S.nonce,applied:{harvester:vm.dispatch.harvester,forwarder:vm.dispatch.forwarder}}),json=JSON.stringify(env);
    if(new URL(url,location.href).origin===location.origin)store.set(B.KEYS.toGame,json);else url=url+'#cfh-return='+encodeURIComponent(json);
    store.set(B.KEYS.toReplica,JSON.stringify(B.envelope('to-replica',next,{plan:S.plan,lang:env.lang,nonce:S.nonce,returnUrl:S.returnUrl})));}
  api.navigate(url);
}

/* ---------- Rendering ---------- */
function focusKey(el){if(!el||el===document.body)return null;const d=el.dataset||{};return d.input?'input:'+d.input:d.draft?'draft:'+d.draft:d.admin?'admin:'+d.admin:d.action?['a',d.action,d.order,d.tab,d.zoom,d.row,d.index,d.key,d.viewKey].join(':'):d.change?['c',d.change,el.value].join(':'):null;}
function restoreFocus(key,sel){if(!key)return;for(const el of document.querySelectorAll('[data-input],[data-draft],[data-admin],[data-action],[data-change]'))if(focusKey(el)===key){el.focus();if(sel&&el.setSelectionRange){try{el.setSelectionRange(sel[0],sel[1]);}catch{}}return;}}
function banner(vm){
  const m=vm.meta,c=m.contract;
  return `${S.notices.map(n=>`<p class="notice ${n.kind}">${esc(n.text)}</p>`).join('')}<div class="context"><span><b>${esc('Spielstand')}</b> ${esc('Schicht')} ${UI.num(m.round,0)} ${esc('von 4')} · ${esc(PHASES[m.phase]||m.phase)}</span><span><b>${esc('Vertrag')}</b> ${UI.code(c.id)} · ${esc(c.name)}</span><span><b>${esc('Übergabe im Spiel')}</b> ${esc(m.handoverMode==='digital'?'digital':'manuell')}</span><span class="demo-tag">${esc('Demonstration · keine CFHarvest-Produktoberfläche')}</span></div>`;
}
function dialogHtml(vm){
  const d=S.view.dialog;if(!d)return '';const name=id=>esc(vm.orders.find(o=>o.id===id)?.name||id);
  const actions=(confirm,label,sv=true)=>`<div class="dialog-actions"><button data-action="dialog-cancel">${esc('Abbrechen')}</button><button class="primary" data-action="${confirm}">${sv?UI.sv(label):esc(label)}</button></div>`;
  if(d.type==='move'){const today=vm.calendar.currentDay,row=vm.rows[0];return `<h3>${UI.sv('Flytta till resurs')}</h3><p>${d.orders.map(name).join(', ')}</p>
    <label class="stack">${esc('Ressource / Drivningskedja')}<select data-dialog="row">${vm.rows.map(r=>`<option value="${esc(r.id)}">${esc(r.id)} · ${esc(r.kind==='chain'?r.members.join(' + '):r.name)}</option>`).join('')}</select></label>
    <fieldset><legend>${esc('Start')}</legend><label><input type="radio" name="moveMode" data-dialog="mode" value="after" checked> ${esc('Nach dem letzten geplanten Auftrag')}</label><label><input type="radio" name="moveMode" data-dialog="mode" value="day"> ${esc('Am Tag')}</label>
    <select data-dialog="day" data-no-translate aria-label="${esc(tr('Starttag'))}">${Array.from({length:28},(_,i)=>`<option value="${i}" ${i<today?'disabled':''} ${i===today?'selected':''}>${esc(new Intl.DateTimeFormat(UI.locale(),{timeZone:'UTC',weekday:'short',day:'numeric',month:'long'}).format(new Date(M.dayISO(i)+'T00:00:00Z')))}${i<4?' · '+esc(tr('Schicht'))+' '+(i+1):''}</option>`).join('')}</select></fieldset>
    <p class="note">${esc('Später geplante Aufträge der Ressource rücken nach.')}</p>${actions('move-confirm','Spara')}`;}
  if(d.type==='compress')return `<h3>${UI.sv('Komprimera')}</h3><p>${esc('Lücken schließen, Reihenfolge bleibt. Neue Termine:')}</p><ul class="preview">${d.preview.map(p=>`<li>${UI.code(p.row.id)} · ${name(p.orderId)}: ${UI.date(M.dayISO(Math.floor(M.positionOf(p.row,p.newStart))))} – ${UI.date(M.dayISO(Math.max(0,Math.ceil(M.positionOf(p.row,p.newEnd,true))-1)))}</li>`).join('')||`<li>${esc('Keine Aufträge.')}</li>`}</ul>${actions('compress-confirm','Bekräfta')}`;
  if(d.type==='unplan')return `<h3>${UI.sv('Avplanera')}</h3><p>${esc('Planung entfernen für:')} ${d.orders.map(name).join(', ')}</p>${d.orders.some(id=>vm.orders.find(o=>o.id===id)?.assignment?.sent)?`<p class="flag warn wide">${esc('Bereits gesendet: Maschinenteam informieren.')}</p>`:''}${actions('unplan-confirm','Bekräfta')}`;
  if(d.type==='return'){const p=returnPreview();return `<h3>${esc('Zurück zum Spiel')}</h3>${p.apply?`<p>${esc('Wird ins Spiel übernommen:')}</p><ul class="preview">${p.lines.map(([m,n])=>`<li>${UI.code(m)} → ${esc(n)}</li>`).join('')}</ul><p class="note">${esc('Digitaler Arbeitsauftrag gilt als vom Maschinenteam bestätigt; aktuelle Sortimentsvorgabe und laufende Meldungen sind gesetzt.')}</p>`:`<p>${esc(p.lines[0])}</p>`}${(p.issues||[]).map(i=>`<p class="flag warn wide">${name(i.orderId)}: ${esc({notSent:'geplant, aber nicht an die Ressource gesendet',outdated:'neue PIN-Version noch nicht gesendet',closed:'Hieb gesperrt'}[i.code])}</p>`).join('')}${S.nonce?'':`<p class="note">${esc('Demo-Spielstand: Das Spiel startet ohne Übernahme.')}</p>`}${actions('return-confirm','Zurück zum Spiel',false)}`;}
  return '';
}
function render(){
  const ae=document.activeElement,key=focusKey(ae),sel=ae&&'selectionStart'in ae&&ae.type!=='checkbox'&&ae.type!=='radio'?[ae.selectionStart,ae.selectionEnd]:null;
  S.snap=B.fromGameState(S.game);S.vm=M.viewModel(S.snap,S.plan);const vm=S.vm,v=S.view;
  if(v.selected&&!vm.orders.some(o=>o.id===v.selected))v.selected=null;
  document.querySelectorAll('[data-nav]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.nav===v.nav)));
  $('cfhBanner').innerHTML=banner(vm);
  let main='';
  if(v.nav==='planning'){
    const hidden=Object.keys(v.hidden).filter(k=>v.hidden[k]),names={list:'Uppdragslista',calendar:'Kalender',map:'Uppdrag på kartan',resources:'Resurser'};
    main=`<div class="planning-bar"><h1>${UI.sv('Arbetsplanering')} <small>${esc('Arbeitsplanung')}</small></h1>${hidden.length?`<span class="hint">${esc('Ausgeblendet:')}</span>${hidden.map(k=>`<button data-action="show-view" data-view-key="${k}">${UI.sv(names[k])}</button>`).join('')}`:''}</div>
    <div class="planning-grid">${v.hidden.list?'':V.uppdragslista(vm,v,UI)}${v.hidden.map?'':V.karta(vm,v,UI)}${v.hidden.calendar?'':V.kalender(vm,v,UI)}${v.hidden.resources?'':V.resurser(vm,v,UI)}</div>`;
  }else if(v.nav==='orders')main=V.bestallningar(vm,v,UI);else main=V.admin(vm,v,UI);
  $('cfhMain').innerHTML=main;
  const panel=$('cfhPanel'),open=!!v.panel.orderId&&vm.orders.some(o=>o.id===v.panel.orderId);
  panel.hidden=!open;panel.innerHTML=open?V.orderPanel(vm,v,UI):'';document.body.classList.toggle('panel-open',open);
  const dlg=$('cfhDialog'),html=dialogHtml(vm);dlg.innerHTML=html?`<div class="dialog-body">${html}</div>`:'';
  if(html&&!dlg.open){if(typeof dlg.showModal==='function'){try{dlg.showModal();}catch{dlg.setAttribute('open','');}}else dlg.setAttribute('open','');}
  if(!html&&dlg.open){if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open');}
  document.body.classList.toggle('landing-mode',!!v.landingMode);
  restoreFocus(key,sel);
}
let toastTimer=null;
function toast(text){const t=$('cfhToast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500);}
function changePlan(next,message){S.plan=next;savePlan();render();if(message)toast(message);}

/* ---------- Actions ---------- */
const orderName=id=>S.vm.orders.find(o=>o.id===id)?.name||id;
const tr=s=>typeof I18n!=='undefined'?I18n.text(s):s;
const actions={
  nav:el=>{S.view.nav=el.dataset.nav;S.view.funcOpen=false;render();},
  'select-order':el=>{S.view.selected=el.dataset.order;render();},
  'open-order':el=>{S.view.selected=el.dataset.order;const same=S.view.panel.orderId===el.dataset.order;S.view.panel={orderId:el.dataset.order,tab:el.dataset.tab||(same?S.view.panel.tab:'order'),draft:same?S.view.panel.draft:{},filesOpen:same&&S.view.panel.filesOpen};render();},
  'close-panel':()=>{S.view.panel={orderId:null,tab:'order',draft:{},filesOpen:false};render();},
  'panel-tab':el=>{S.view.panel.tab=el.dataset.tab;render();},
  'func-toggle':()=>{S.view.funcOpen=!S.view.funcOpen;render();},
  'toggle-clients':(el,e)=>{e?.preventDefault();S.view.clientsOpen=!S.view.clientsOpen;render();},
  'select-all':()=>{S.view.checked=V.filterOrders(S.vm,S.view).map(o=>o.id);S.view.funcOpen=false;render();},
  'reset-list':()=>{Object.assign(S.view,{search:'',clients:null,sort:{key:'id',dir:1},columns:{},funcOpen:false,routeMode:false});render();},
  'route-mode':()=>{S.view.routeMode=!S.view.routeMode;S.view.funcOpen=false;if(S.view.routeMode&&!S.plan.routeOrder.length)S.plan.routeOrder=V.filterOrders(S.vm,S.view).map(o=>o.id);savePlan();render();},
  'route-up':el=>moveRoute(el.dataset.order,-1),'route-down':el=>moveRoute(el.dataset.order,1),
  sort:el=>{const k=el.dataset.key;S.view.sort=S.view.sort.key===k?{key:k,dir:-S.view.sort.dir}:{key:k,dir:1};render();},
  'move-open':()=>{const orders=S.view.checked.filter(id=>S.vm.orders.some(o=>o.id===id&&!o.closed));if(!orders.length)return toast(tr('Gesperrte Hiebe können nicht geplant werden.'));S.view.dialog={type:'move',orders};render();},
  'move-confirm':()=>{const q=s=>$('cfhDialog').querySelector(s),rowId=q('[data-dialog="row"]').value,mode=q('[data-dialog="mode"]:checked')?.value||'after',day=Number(q('[data-dialog="day"]').value);const orders=S.view.dialog.orders;S.view.dialog=null;S.view.checked=[];S.view.selected=orders[0];changePlan(M.assign(S.plan,S.snap,orders,rowId,{mode,day}),`${orders.map(id=>tr(orderName(id))).join(', ')} → ${rowId}`);},
  'dialog-cancel':()=>{S.view.dialog=null;render();},
  'cal-zoom':el=>{S.view.zoom=el.dataset.zoom;render();},
  'cal-prev':()=>{S.view.calOffset=Math.max(0,S.view.calOffset-(S.view.zoom==='day'?7:28));render();},
  'cal-next':()=>{S.view.calOffset+=S.view.zoom==='day'?7:28;render();},
  'cal-today':()=>{const d=S.vm.calendar.currentDay;S.view.calOffset=Math.max(0,d-(d%7));render();},
  'cal-send':()=>{const rows=S.view.rowChecked;changePlan(M.send(S.plan,S.snap,{rowIds:rows}),tr('Route an Ressource gesendet')+': '+rows.join(', '));},
  'compress-open':()=>{S.view.dialog={type:'compress',rows:[...S.view.rowChecked],preview:S.view.rowChecked.flatMap(r=>M.compressPreview(S.snap,S.plan,r))};render();},
  'compress-confirm':()=>{const rows=S.view.dialog.rows;S.view.dialog=null;changePlan(M.compress(S.plan,S.snap,rows),tr('Kalender komprimiert'));},
  'unplan-open':el=>{const orders=(el.dataset.scope==='checked'?S.view.checked:[S.view.selected]).filter(id=>S.vm.orders.find(o=>o.id===id)?.assignment);if(orders.length){S.view.dialog={type:'unplan',orders};render();}},
  'unplan-confirm':()=>{const orders=S.view.dialog.orders;S.view.dialog=null;S.view.checked=[];changePlan(M.unassign(S.plan,orders),tr('Planung entfernt'));},
  'insert-mode':()=>{S.view.insertMode=!S.view.insertMode;render();},
  insert:el=>{const id=S.view.selected;if(!id)return;S.view.insertMode=false;changePlan(M.insertAt(S.plan,S.snap,id,el.dataset.row,Number(el.dataset.index)),`${tr(orderName(id))} → ${el.dataset.row}`);},
  'hide-view':el=>{S.view.hidden[el.dataset.viewKey]=true;render();},
  'show-view':el=>{S.view.hidden[el.dataset.viewKey]=false;render();},
  'map-zoom-in':()=>{S.view.mapZoom=Math.min(3,S.view.mapZoom+1);render();},
  'map-zoom-out':()=>{S.view.mapZoom=Math.max(0,S.view.mapZoom-1);render();},
  'map-print':()=>api.print(),
  'map-add-landing':()=>{if(!S.view.selected&&!S.view.panel.orderId)return;S.view.landingMode=true;if(S.view.mapZoom<2)S.view.mapZoom=2;S.view.hidden.map=false;render();toast(tr('In die Karte klicken, um den Lagerplatz zu setzen.'));},
  'panel-save':()=>{savePanel();render();toast(tr('Gespeichert'));},
  'panel-start':()=>{const id=S.view.panel.orderId;savePanel();if(V.startBlockers(M.viewModel(S.snap,S.plan).orders.find(o=>o.id===id)).length)return render();S.view.panel.filesOpen=true;changePlan(M.send(S.plan,S.snap,{orderIds:[id]}),tr('OIN/PIN an die Maschine übertragen'));},
  'panel-func':el=>{const o=S.vm.orders.find(x=>x.id===S.view.panel.orderId),g=o.stand.byGrade;toast({forwarding:`${tr('Skotningsanmälan')}: ${UI.num(o.followUp.forestStock)} ${tr('fm Waldlager zum Rücken bereit')}`,rereport:`${tr('Produktionsmeldungen erneut angefordert')} · ${tr('Schicht')} ${o.followUp.lastRound||'–'}`,close:tr('Auftrag abgeschlossen: alle Mengen gerückt.'),labels:`${tr('Polterzettel')} ${o.landing.id}: ${UI.num(g.saw.roadside+g.pulp.roadside+g.down.roadside)} fm · ${tr('Demo, kein Druck')}`}[el.dataset.func]||'');},
  'book-confirm':el=>{S.plan.orderBook[el.dataset.book]={confirmed:true};savePlan();render();toast(tr('Bestellung bestätigt'));},
  'book-order':el=>{S.view.nav='planning';actions['open-order'](el);},
  'admin-tab':el=>{S.view.adminTab=el.dataset.tab;S.view.adminDraft={};render();},
  'admin-res':el=>{S.view.adminResource=el.dataset.res;S.view.adminDraft={};S.view.weekSel=[];render();},
  'admin-res-tab':el=>{S.view.adminResTab=el.dataset.tab;S.view.adminDraft={};render();},
  'admin-save':()=>{const id=S.view.adminResource,d=S.view.adminDraft,patch={};for(const k of ['name','model','stanford'])if(d[k]!==undefined)patch[k]=String(d[k]).slice(0,60);if(d.active!==undefined)patch.active=!!d.active;if(d.rate!==undefined&&Number(d.rate)>0)patch.rate=Number(d.rate);
    const extra=S.plan.extraResources.find(r=>r.id===id);if(extra)Object.assign(extra,patch);else S.plan.resources[id]={...(S.plan.resources[id]||{}),...patch};S.view.adminDraft={};changePlan(S.plan,tr('Gespeichert'));},
  'admin-new':()=>{const n=S.plan.extraResources.length+1,id='R-'+String(n).padStart(2,'0');S.plan.extraResources.push({id,type:'crew',name:'Arbeitsgruppe '+id,model:'',stanford:'',operation:'Holzernte',rate:10,unit:'fm/h',weekly:{mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0},active:true,plannable:true,subcontractor:false,followUp:null});S.view.adminResource=id;S.view.adminResTab='base';changePlan(S.plan,tr('Neue Ressource angelegt · nicht mit dem Spiel verbunden'));},
  'week-apply':()=>{const id=S.view.adminResource,h=Math.max(0,Math.min(24,Number(S.view.adminDraft.hours??8)||0)),r=S.vm.resourcesAll.find(x=>x.id===id),extra=S.plan.extraResources.find(x=>x.id===id),e=extra||(S.plan.resources[id]??={});e.weekly={...(e.weekly||{})};e.manual={...(e.manual||{})};for(const d of S.view.weekSel){e.weekly[d]=h;if(!extra)e.manual[d]=h!==B.MASTER.find(x=>x.id===id)?.weekly[d];}if(!r)return;S.view.weekSel=[];changePlan(S.plan,tr('Wochenkalender gespeichert'));},
  'week-reset':()=>{const id=S.view.adminResource;if(S.plan.resources[id]){delete S.plan.resources[id].weekly;delete S.plan.resources[id].manual;}S.view.weekSel=[];changePlan(S.plan,tr('Gespeichert'));},
  refresh:()=>{load();S.view.panel.draft={};S.view.adminDraft={};render();toast(tr('Aktualisiert'));},
  return:()=>{S.view.dialog={type:'return'};render();},
  'return-confirm':()=>{S.view.dialog=null;returnToGame();},
};
function moveRoute(id,delta){const r=S.plan.routeOrder.length?S.plan.routeOrder:S.vm.orders.map(o=>o.id),i=r.indexOf(id),j=i+delta;if(i<0||j<0||j>=r.length)return;[r[i],r[j]]=[r[j],r[i]];S.plan.routeOrder=[...r];savePlan();render();}
function savePanel(){
  const id=S.view.panel.orderId,d=S.view.panel.draft,o=S.vm.orders.find(x=>x.id===id);if(!o)return;let plan=S.plan;
  if(d.estStart&&d.estStart!==o.plannedStart)plan=M.setEstimatedStart(plan,S.snap,id,d.estStart);
  const edits=plan.edits[id]={...(plan.edits[id]||{})};
  if(d.estEnd!==undefined){const auto=M.viewModel(S.snap,{...plan,edits:{...plan.edits,[id]:{...edits,estEnd:undefined}}}).orders.find(x=>x.id===id).plannedEnd;if(d.estEnd&&d.estEnd!==auto)edits.estEnd=d.estEnd;else delete edits.estEnd;}
  if(d.message!==undefined)edits.message=String(d.message).slice(0,500);
  S.plan=plan;S.view.panel.draft={};savePlan();
}
function placeLanding(e){
  const id=S.view.panel.orderId||S.view.selected,o=S.vm.orders.find(x=>x.id===id),svg=e.target.closest('svg.cfh-map');if(!o||!svg)return;
  let pt=null;try{const m=svg.getScreenCTM?.();if(m&&svg.createSVGPoint){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(m.inverse());pt=[+q.x.toFixed(1),+q.y.toFixed(1)];}}catch{}
  const list=(S.plan.edits[id]??={}).landings??=[];if(!pt||!pt.every(Number.isFinite))pt=[o.landing.point[0]+14*(list.length+1),o.landing.point[1]-10];list.push(pt);
  S.view.landingMode=false;changePlan(S.plan,`${tr('Avlägg')} · ${o.landing.id}-${list.length+1}`);
}

/* ---------- Events ---------- */
function onClick(e){
  if(S.view.landingMode&&e.target.closest?.('svg.cfh-map')){placeLanding(e);return;}
  const el=e.target.closest?.('[data-action],[data-nav]');
  if(el&&!el.disabled){const a=el.dataset.nav?'nav':el.dataset.action;if(S.view.funcOpen&&!el.closest('.menu'))S.view.funcOpen=false;if(actions[a]){if(el.tagName==='BUTTON'||el.tagName==='SUMMARY')e.preventDefault();actions[a](el,e);}return;}
  const row=e.target.closest?.('tr[data-row-order]');if(row&&!e.target.closest('input,button,a,label')){S.view.selected=row.dataset.rowOrder;render();}
  if(S.view.funcOpen&&!e.target.closest?.('.menu')){S.view.funcOpen=false;render();}
}
function onChange(e){
  const el=e.target,c=el.dataset?.change,v=S.view;if(!c)return;
  if(c==='check'){v.checked=el.checked?[...new Set([...v.checked,el.value])]:v.checked.filter(x=>x!==el.value);}
  else if(c==='check-all'){v.checked=el.checked?V.filterOrders(S.vm,v).map(o=>o.id):[];}
  else if(c==='client'){const all=[...new Set(S.vm.orders.map(o=>o.client))],cur=v.clients||all;v.clients=el.checked?[...new Set([...cur,el.value])]:cur.filter(x=>x!==el.value);}
  else if(c==='column'){v.columns[el.value]=el.checked;}
  else if(c==='row'){v.rowChecked=el.checked?[...new Set([...v.rowChecked,el.value])]:v.rowChecked.filter(x=>x!==el.value);}
  else if(c==='week-day'){v.weekSel=el.checked?[...new Set([...v.weekSel,el.value])]:v.weekSel.filter(x=>x!==el.value);}
  else if(c==='book-filter'){v.bookFilter={...v.bookFilter,[el.dataset.key]:el.value};}
  else if(c==='chain-member'){const chains=structuredClone(S.vm.chainsAll),ch=chains.find(x=>x.id===el.dataset.chain);ch.members=el.checked?[...new Set([...ch.members,el.value])]:ch.members.filter(x=>x!==el.value);if(!ch.members.length){render();return toast(tr('Eine Drivningskedja braucht mindestens eine Ressource.'));}S.plan.chains=chains;S.plan.assignments=S.plan.assignments.filter(a=>a.rowId!==ch.id||ch.members.length);savePlan();}
  render();
}
function onInput(e){
  const el=e.target,d=el.dataset||{};
  if(d.input==='search'){S.view.search=el.value;render();}
  else if(d.draft)S.view.panel.draft[d.draft]=el.value;
  else if(d.admin)S.view.adminDraft[d.admin]=el.type==='checkbox'?el.checked:el.value;
}
function onKey(e){
  if(e.key==='Escape'){if(S.view.dialog){S.view.dialog=null;render();}else if(S.view.landingMode){S.view.landingMode=false;render();}else if(S.view.panel.orderId)actions['close-panel']();return;}
  if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute?.('role')==='button'&&e.target.tagName!=='BUTTON'){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
}
function onDragStart(e){const row=e.target.closest?.('tr[data-row-order]');if(row&&e.dataTransfer){e.dataTransfer.setData('text/plain',row.dataset.rowOrder);e.dataTransfer.effectAllowed='move';}}
function onDragOver(e){if(e.target.closest?.('[data-drop-row]'))e.preventDefault();}
function onDrop(e){const t=e.target.closest?.('[data-drop-row]'),id=e.dataTransfer?.getData('text/plain');if(!t||!id)return;e.preventDefault();const r=t.getBoundingClientRect(),day=Number(t.dataset.off)+Math.floor((e.clientX-r.left)/Math.max(1,r.width)*Number(t.dataset.days));S.view.selected=id;changePlan(M.assign(S.plan,S.snap,[id],t.dataset.dropRow,{mode:'day',day}),`${tr(orderName(id))} → ${t.dataset.dropRow}`);}
function init(){
  load();
  document.addEventListener('click',onClick);document.addEventListener('change',onChange);document.addEventListener('input',onInput);document.addEventListener('keydown',onKey);
  document.addEventListener('dragstart',onDragStart);document.addEventListener('dragover',onDragOver);document.addEventListener('drop',onDrop);
  document.addEventListener('forestry-language-change',()=>render());
  $('cfhDialog').addEventListener('close',()=>{if(S.view.dialog){S.view.dialog=null;render();}});
  render();
  if(S.lang&&typeof I18n!=='undefined'&&I18n.supported.includes(S.lang)&&I18n.language!==S.lang)I18n.setLanguage(S.lang);
}
// Scripts sit at the end of <body>, so the shell already exists.
if(typeof document!=='undefined'&&document.getElementById('cfhMain'))init();
return{api,state:()=>S,vm:()=>S.vm,render,actions,init};
})();
