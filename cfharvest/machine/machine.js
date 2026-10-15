/* CFHarvest replica · on-board (Maskin) client, Phase 3 (cfharvest/PLAN_OVERNIGHT.md §5, ForestX "Manual Maskin" [MM]).
   A separate operator app for the harvester / forwarder cab: Planering list in route order, the five mandatory tabs that
   turn green when viewed, "Starta, överför till mätdon", map with route drawing, Funktioner (Överför till mätdon,
   Skotningsanmälan, Provytemätning, Slutvärdering, Avsluta avverkningen) and Statusändringar.
   Shares everything with the planning app: game state from the same handoff envelope (read only, never written), the plan
   from the same plan store (store.js), all domain logic from model.js (machine helpers) and bridge.js. The game remains the
   simulation source: manual reports here are for the demo between shifts and are overwritten by the game's shift results
   for the same shift (CFHModel.mergeProduction). Touch first: large targets, landscape tablet 1024×768 / 1280×800. */
'use strict';
const CFHMachine=(()=>{
const B=CFHBridge,M=CFHModel,UI=CFHUI,V=CFHViews,$=id=>document.getElementById(id),esc=UI.esc,code=UI.code,term=UI.term;
const session={get(k){try{return sessionStorage.getItem(k);}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,v);return true;}catch{return false;}}};
const local={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const RES_KEY='cfharvest-machine-resource';
const S={game:null,source:null,returnUrl:null,plan:M.emptyPlan(),snap:null,vm:null,notices:[],
  view:{resource:null,screen:'list',filter:'open',orderId:null,section:'tabs',tab:'order',func:null,form:{},mode:'manual',pileSel:[],plot:{},evaluation:{},message:'',mapMode:'status',layers:false,legend:false}};
const PS=CFHStore.create({context:()=>({snapshot:S.snap})});
const api={navigate:url=>location.assign(url)};
const tr=s=>typeof I18n!=='undefined'?I18n.text(s):s;
const GRADES=[['saw','SAG'],['pulp','IND'],['down','ABW']];

/* ---------- Load: game state from the handoff envelope (or the demo state), plan from the plan store ---------- */
function safeReturnUrl(u){try{const x=new URL(u,location.href);return /^https?:$/.test(x.protocol)&&x.hostname===location.hostname?x.href.split('#')[0]:null;}catch{return null;}}
function readIncoming(){
  let raw=session.get(B.KEYS.toReplica);const m=/(?:^#|&)cfh=([^&]*)/.exec(location.hash||'');
  if(m){try{raw=decodeURIComponent(m[1]);}catch{}try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
  const env=B.readEnvelope(raw,'to-replica');if(env&&m)session.set(B.KEYS.toReplica,raw);return env;
}
function load(){
  const env=readIncoming(),stored=PS.read();S.notices=[];let plan=null;
  if(env){S.game=env.state;S.source='game';S.returnUrl=safeReturnUrl(env.returnUrl);plan=env.plan||null;if(!plan||(stored&&(Number(stored.savedAt)||0)>(Number(plan.savedAt)||0)))plan=stored||plan;}
  else{S.game=ForestJourney.start(ForestJourney.initial());S.source='demo';S.returnUrl=null;plan=stored&&stored.basis&&stored.basis.demo?stored:null;
    S.notices.push({kind:'warn',text:'Kein Spielstand übergeben: Demo-Spielstand Schicht 1 mit Standardauftrag.'});}
  S.plan=M.normalizePlan(plan);
  if(S.plan.basis&&S.game.history.length<S.plan.basis.historyLength){S.plan=M.emptyPlan();S.notices.push({kind:'info',text:'Neuer Spielstand erkannt: Planung zurückgesetzt.'});}
  for(const a of S.plan.assignments){delete a.staged;delete a.touched;}
  const n=PS.status().notice;if(n)S.notices.push({kind:'warn',text:n});
  let res=null;try{res=new URLSearchParams(location.search).get('res');}catch{}S.view.resource=res||local.get(RES_KEY)||'H-01';
}
/** Save a machine change through the plan store (same envelope the planning app reads; newer savedAt wins there). */
function save(next,message){
  for(const k of ['machineError','lastReport','lastObject','lastItem','reflowed'])delete next[k];
  next.basis={historyLength:S.game.history.length,contractId:S.snap.meta.contract.id,...(S.source==='demo'?{demo:true}:{})};next.savedAt=Date.now();
  S.plan=next;PS.save(next);render();if(message)toast(message);
}
/** Apply a model operation; a refused operation (plan.machineError) shows a reason and changes nothing. */
function apply(next,message,fail){if(next.machineError){render();toast(tr(fail||'Nicht möglich'));return false;}save(next,message);return true;}

/* ---------- Derived data ---------- */
const machines=()=>S.vm.resourcesAll.filter(r=>['harvester','forwarder'].includes(r.type)&&r.active!==false);
function resource(){const all=machines();let r=all.find(x=>x.id===S.view.resource);if(!r){r=all[0];S.view.resource=r?.id||null;}return r;}
const order=id=>S.vm.orders.find(o=>o.id===id);
const round=()=>S.game.history.length+1; // the shift the game will simulate next: manual reports belong to it
const isH=r=>r?.type==='harvester';
const statusIdx=s=>M.STATUSES.indexOf(s);
/** Harvested / forwarded per assortment: game shifts (HPR/FPR) + manual reports still in force. Forest stock = harvested − forwarded. */
function grades(o){
  const man={HPR:{saw:0,pulp:0,down:0},FPR:{saw:0,pulp:0,down:0}};
  for(const m of S.vm.production.messages)if(m.kind==='manual'&&m.objectKey===o.id)for(const [k] of GRADES)man[m.type][k]+=m.products?.[k]||0;
  return o.assortments.map(a=>{const g=o.stand.byGrade[a.key]||{felled:0,forwarded:0},harvested=g.felled+man.HPR[a.key],forwarded=g.forwarded+man.FPR[a.key];return{...a,harvested,forwarded,stock:harvested-forwarded,manualH:man.HPR[a.key],manualF:man.FPR[a.key]};});
}
/** Progress of this machine on the order: harvester = felled by shifts vs the order volume; forwarder = forwarded vs order volume + opening stock. */
function progress(o,r){const done=isH(r)?o.followUp.felledByShifts:o.followUp.forwarded,total=isH(r)?o.estimatedVolume:o.estimatedVolume+(o.openingStock||0);return{done,total,pct:UI.pct(done,total)};}
function started(o,r){return !!M.machineOrder(S.plan,o.id).started[r.id]||statusIdx(o.status)>=statusIdx(isH(r)?'harvesting':'forwarding');}
const pinGrade=(o,v)=>v===1?o.pin.v1:v===2?o.pin.v2:o.pin.loaded;
/** PIN warnings exactly like the game's round-3 case (planning: Sortiment tab flag): the device holds an older PIN than the
    order requires; and the planner's last send is older than the order's current version. */
function pinWarnings(o,r){
  const out=[];if(!isH(r))return out;
  const l=M.machineData(S.plan).loaded[r.id],own=l&&l.orderId===o.id&&l.pinVersion,req=o.pin.required,cached=o.pin.cutting==='cached'&&!own;
  if(own?own<req:r.gameKey==='harvester'&&o.pin.loaded!==o.pin.spec){
    const v=own||o.pin.machineVersion,g=own?pinGrade(o,own):o.pin.loaded;
    out.push({level:cached?'block':'warn',html:`${code(r.id)} ${esc('arbeitet noch mit')} ${code('PIN v'+(v||'?'))} (${esc(g)} m) · ${esc('Auftrag verlangt')} ${code('PIN v'+req)} (${esc(o.pin.spec)} m)${cached?` · ${esc('Abwertungsrisiko')}`:''}`});
  }
  const sent=o.instructions?.pinVersion;if(sent!=null&&sent<req)out.push({level:'warn',html:`${esc('Gesendete Dateien sind veraltet')}: ${code('PIN v'+sent)} · ${esc('Die Planung muss den Auftrag neu senden.')}`});
  return out;
}
const pinFlags=(o,r)=>pinWarnings(o,r).map(w=>`<p class="flag ${w.level} wide m-pin-flag" data-pin-flag>${w.html}</p>`).join('');
function startBlock(o,r){
  const seen=M.tabsSeen(S.plan,o.id,r.id).length,mo=M.machineOrder(S.plan,o.id);
  if(mo.started[r.id])return 'Bereits gestartet.';
  if(seen<5)return `${tr('Erst alle fünf Pflichtreiter öffnen')} (${seen}/5).`;
  if(!M.canStart(S.plan,o.id,r,o.status))return isH(r)?`${tr('Starten nur im Status „An Ressource gesendet“.')} ${tr('Aktueller Status')}: ${tr(o.info.label)}.`:`${tr('Der Forwarder startet nach dem Senden, solange der Auftrag nicht gerückt wird.')} ${tr('Aktueller Status')}: ${tr(o.info.label)}.`;
  return null;
}
function volumeChecks(o){const f=o.followUp;return{harvest:M.volumeCheck(o.estimatedVolume,f.felledByShifts),forward:M.volumeCheck(o.estimatedVolume+(o.openingStock||0),f.forwarded)};}

/* ---------- Rendering ---------- */
function headerHtml(){
  const r=resource();
  return `<span class="m-login">${esc('Angemeldet als')}</span><span class="segmented m-res-switch" role="group" aria-label="${esc('Ressource wählen')}">${machines().map(x=>`<button type="button" data-action="resource" data-res="${esc(x.id)}" aria-pressed="${x.id===r?.id}" title="${esc(x.name)}">${code(x.id)}</button>`).join('')}</span>${r?`<span class="m-res-name">${esc(r.name)}</span>`:''}`;
}
function banner(){
  const m=S.vm.meta;
  return `${S.notices.map(n=>`<p class="notice ${n.kind}">${esc(n.text)}</p>`).join('')}<div class="context"><span><b>${esc('Spielstand')}</b> ${esc('Schicht')} ${UI.num(m.round,0)} ${esc('von 4')}</span><span><b>${esc('Vertrag')}</b> ${code(m.contract.id)}</span><span><b>${esc('Nächste Meldung für')}</b> ${esc('Schicht')} ${UI.num(round(),0)}</span><span class="demo-tag">${esc('Demonstration · keine CFHarvest-Produktoberfläche')}</span></div>`;
}
function listHtml(r){
  const all=r?M.machineOrders(S.vm,r.id):[],f=S.view.filter,shown=all.filter(x=>f==='all'||(f==='open'?!x.closed:x.closed)),n=k=>all.filter(x=>k==='all'||(k==='open'?!x.closed:x.closed)).length;
  const seg=[['open','Offen'],['closed','Abgeschlossen'],['all','Alle']];
  return `<section class="m-screen" data-screen="list" aria-labelledby="mListTitle">
  <div class="m-head"><h1 id="mListTitle">${term('Planung','Planering')}</h1><span class="segmented m-filter" role="group" aria-label="${esc('Filter')}">${seg.map(([k,de])=>`<button type="button" data-action="filter" data-key="${k}" aria-pressed="${f===k}">${esc(de)} (${UI.num(n(k),0)})</button>`).join('')}</span></div>
  <p class="hint">${esc('Arbeitsaufträge dieser Maschine in Fahrreihenfolge, oberster zuerst.')}</p>
  ${shown.length?`<ol class="m-orders" data-orders>${shown.map((x,i)=>{const o=x.order,p=progress(o,r),row=S.vm.rows.find(q=>q.id===x.item.rowId);return `<li><button type="button" class="m-order ${x.closed?'closed':''}" data-action="open-order" data-order="${esc(o.id)}" data-status="${esc(o.status)}">
    <span class="m-seq" aria-hidden="true">${UI.num(i+1,0)}</span><span class="m-order-main"><b>${esc(o.name)}</b><small>${UI.orderLabel(o)} · ${esc(o.operationLabel)} · ${UI.fm(o.estimatedVolume)}</small><small>${esc('Geplant')}: ${UI.date(o.plannedStart)} – ${UI.date(o.plannedEnd)} · ${row?UI.rowName(row):''}</small>
    <span class="m-bar" aria-hidden="true"><span style="width:${p.pct.toFixed(1)}%"></span></span></span><span class="m-order-side">${UI.pill(o)}<small>${esc(o.info.label)}</small></span></button></li>`;}).join('')}</ol>`
  :`<p class="empty-state">${esc(all.length?'Keine Aufträge in diesem Filter.':'Keine gesendeten Arbeitsaufträge für diese Maschine.')} ${all.length?'':`<a href="../app/">${esc('In der Planung einplanen und senden.')}</a>`}</p>`}
  </section>`;
}
const field=(de,sv,value)=>`<div class="field"><dt>${term(de,sv,{tip:true})}</dt><dd>${value}</dd></div>`,dash='<span class="muted">–</span>';
function tabBody(o,r,tab){
  const edit=S.vm.plan.edits[o.id]||{};
  if(tab==='order')return `<dl class="fields m-fields">${field('Arbeitsauftrags-Nr.','Arbetsorder nr.',code(o.id))}${field('Name','Namn',esc(o.name))}${field('Vertrags-Nr.','Kontrakt nr.',code(o.contractId))}${field('Auftraggeber','Uppdragsgivare',esc(o.client))}
    ${field('Maßnahme','Åtgärd',term(o.operationLabel,o.operation,{tip:true}))}${field('Baumarten','Trädslag',esc(o.species))}${field('Fläche (ha)','Areal (ha)',UI.ha(o.areaHa))}${field('Menge (fm)','Kvantitet (m³)',UI.fm(o.estimatedVolume))}
    ${field('Waldlager zu Beginn','Skogslager',UI.fm(o.openingStock))}${field('Geplanter Zeitraum','Planerad period',o.plannedStart?`${UI.date(o.plannedStart)} – ${UI.date(o.plannedEnd)}`:dash)}${field('Status','Status',`${UI.pill(o)} <small>${esc(o.info.title)}</small>`)}${field('Gelände','Terräng',esc(o.terrain))}</dl>
    <h4>${esc('Prüfungen vor dem Start')}</h4><ul class="checks">${o.readiness.map(x=>`<li class="lvl-${x.level}">${x.level==='ok'?'✓':x.level==='block'?'⛔':x.level==='warn'?'!':'i'} ${esc(x.text)}${x.key==='survey'?` · ${UI.num(x.value,0)} %`:''}</li>`).join('')}</ul>`;
  if(tab==='info')return `<dl class="fields m-fields one">${field('Information an den Unternehmer','Information till Entreprenör',edit.infoContractor?`<span data-no-translate>${esc(edit.infoContractor)}</span>`:dash)}${field('Beschreibung der Maßnahme (Forstsystem)','Beskrivning av åtgärd (Skogssystem)',`${esc(o.operationLabel)} · ${esc(o.species)} · ${esc(o.terrain)}`)}
    ${o.bio?field('Rücksichten','Hänsyn',`${code(o.bio.code)} ${esc(o.bio.title)}<br><small>${esc(o.bio.instruction)}</small><br><b>${esc(o.bio.restriction)}</b>`):''}</dl>
    <h4>${esc('Rückmeldungen der Maschine')}</h4>${o.notes.length?`<ul class="notes">${o.notes.map(n=>`<li class="log-${esc(n.kind)}">${esc('Schicht')} ${UI.num(n.round,0)} · ${esc(n.title)}</li>`).join('')}</ul>`:`<p class="muted">${esc('Noch keine Rückmeldung.')}</p>`}`;
  if(tab==='area')return `<div class="table-wrap"><table class="grid m-grid"><thead><tr><th>${esc('Abteilung')}</th><th>${esc('Fläche (ha)')}</th><th>${esc('Geschätzte Menge')}</th><th>${esc('Noch stehend')}</th></tr></thead><tbody><tr><td>${esc('Abt.')} 1 · ${esc(o.name)}</td><td>${UI.ha(o.areaHa)}</td><td>${UI.fm(o.estimatedVolume)}</td><td>${UI.fm(o.remaining)}</td></tr></tbody></table></div>
    <dl class="fields m-fields">${field('Gelände','Terräng',esc(o.terrain))}${field('Vorerkundung','Terrängplanering',`${UI.num(o.surveyCoverage,0)} %`)}${field('Hiebsgrenze','Gräns',esc(o.boundaryChecked?'Hiebsgrenze abgeglichen':'Hiebsgrenze nicht abgeglichen'))}</dl><p class="note">${esc('Die Hiebsgrenze ist fiktiv und keine Katasterangabe.')}</p>`;
  if(tab==='products'){const g=grades(o);return `<div class="table-wrap"><table class="grid m-grid" data-products><thead><tr><th>${esc('Sortiment')}</th><th>${esc('Lieferort')}</th><th>${code('PIN')}</th><th>${esc('Im Auftrag (fm)')}</th><th title="SV: Skördare">${esc('Geerntet (fm)')}</th><th title="SV: Skotare">${esc('Gerückt (fm)')}</th><th title="SV: Skogslager">${esc('Waldlager (fm)')}</th></tr></thead><tbody>
    ${g.map(a=>`<tr data-assortment="${esc(a.key)}" data-harvested="${a.harvested}" data-forwarded="${a.forwarded}"><td>${code(a.code)} ${esc(a.name)}</td><td>${esc(a.receiver)}</td><td>${a.pin&&!S.vm.plan.pinRemoved?.[o.id]?.[a.key]?`<span data-no-translate>${esc(M.pinFileName(o,a,o.pin.required))}</span>`:dash}</td><td>${UI.fm(a.estimatedVolume)}</td><td>${UI.fm(a.harvested)}</td><td>${UI.fm(a.forwarded)}</td><td class="${a.stock<-.05?'bad':''}">${UI.fm(a.stock)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th>${esc('Summe')}</th><th></th><th></th><th>${UI.fm(o.estimatedVolume)}</th><th>${UI.fm(g.reduce((s,a)=>s+a.harvested,0))}</th><th>${UI.fm(g.reduce((s,a)=>s+a.forwarded,0))}</th><th>${UI.fm(g.reduce((s,a)=>s+a.stock,0))}</th></tr></tfoot></table></div>
    ${pinFlags(o,r)}<p class="note">${esc('Waldlager = geerntet − gerückt. Werte aus den Spielschichten (HPR/FPR) und manuellen Meldungen dieser Demo.')}</p>`;}
  if(tab==='landings'){const lands=M.orderLandings(o,S.vm.plan),syms=M.orderSymbols(o,S.vm.plan),l=o.landing;
    return `<div class="table-wrap"><table class="grid m-grid"><thead><tr><th>${term('Polterplatz','Avlägg',{tip:true})}</th><th>${esc('Sägeholz')}</th><th>${esc('Industrieholz')}</th><th>${esc('Abgewertet')}</th><th>${esc('Angeliefert')}</th></tr></thead><tbody>${lands.map(x=>x.primary?`<tr><td>${code(x.id)}</td><td>${UI.fm(l.roadsideGrades.saw||0)}</td><td>${UI.fm(l.roadsideGrades.pulp||0)}</td><td>${UI.fm(l.roadsideGrades.down||0)}</td><td>${UI.fm(l.delivered)}</td></tr>`:`<tr><td>${code(x.id)}</td><td colspan="4"><small>${esc('Zusätzlicher Lagerplatz in der Karte')}</small></td></tr>`).join('')}</tbody></table></div>
    <h4>${esc('Kartensymbole')}</h4>${syms.length?`<ul class="m-symbols">${syms.map(s=>`<li>${code(s.code)} · ${esc(V.MAP_SYMBOLS.find(k=>k.key===s.kind)?.de||s.kind)}</li>`).join('')}</ul>`:`<p class="muted">${esc('Keine Kartensymbole gesetzt.')}</p>`}`;}
  return '';
}
function startPanel(o,r){
  const mo=M.machineOrder(S.plan,o.id),seen=M.tabsSeen(S.plan,o.id,r.id),block=startBlock(o,r),files=M.machineFiles(o.instructions,r.type,o.id),loaded=M.machineData(S.plan).loaded[r.id],own=loaded&&loaded.orderId===o.id;
  const msg=S.view.message??'';
  return `<aside class="m-start" data-start-panel>
    <h3>${term('Start','Starta')}</h3>
    <p class="m-gate ${seen.length===5?'ok':''}" data-gate>${seen.length===5?'✓':'!'} ${esc('Pflichtreiter geöffnet')}: ${UI.num(seen.length,0)}/5</p>
    <div class="m-files" data-files><h4>${esc(isH(r)?'Dateien vom Planungssystem (OIN, PIN)':'Dateien vom Planungssystem (FOI, FDI)')}</h4>${files.length?`<ul>${files.map(f=>`<li>${code(f.kind)} <span data-no-translate>${esc(f.name)}</span> · ${code('v'+f.version)}</li>`).join('')}</ul>`:`<p class="muted">${esc('Keine Dateien gesendet.')}</p>`}
      ${own?`<p class="m-loaded" data-loaded>✓ ${esc('Im Messgerät geladen')}: ${loaded.files.map(f=>`<span data-no-translate>${esc(f.name)}</span>`).join(', ')||'–'}</p>`:''}</div>
    ${pinFlags(o,r)}
    <label class="stack">${term('Startnachricht an das Team','Startmeddelande')}<textarea data-msg rows="2" maxlength="500" data-no-translate placeholder="${esc('optional')}">${esc(msg)}</textarea></label>
    <button type="button" class="m-big" data-action="send-message" ${String(msg).trim()?'':'disabled'}>✉ ${esc('Nachricht senden')}</button>
    ${mo.startMsg[r.id]?`<p class="hint" data-start-msg>${esc('Gesendet')}: <span data-no-translate>${esc(mo.startMsg[r.id])}</span></p>`:''}
    <button type="button" class="m-big green" data-action="start" ${block?'disabled':''}>▶ ${esc('Starten, an Messgerät übertragen')} <small class="sv-cap" lang="sv" data-no-translate>(Starta, överför till mätdon)</small></button>
    ${block?`<p class="hint" data-start-hint>${esc(block)}</p>`:''}
  </aside>`;
}
function tabsHtml(o,r){
  const seen=M.tabsSeen(S.plan,o.id,r.id),tab=S.view.tab;
  return `<div class="m-order-grid"><div class="m-tabs-panel"><div class="m-tabs" role="tablist" aria-label="${esc('Pflichtreiter')}">${M.MACHINE_TABS.map(([k,de,sv])=>`<button type="button" role="tab" data-action="tab" data-tab="${k}" aria-selected="${k===tab}" class="${seen.includes(k)?'seen':''}" title="SV: ${esc(sv)}">${seen.includes(k)?'✓ ':''}${esc(de)}</button>`).join('')}</div>
    <div class="m-tab-body" role="tabpanel" data-tab-body="${esc(tab)}">${tabBody(o,r,tab)}</div></div>${startPanel(o,r)}</div>`;
}
/* Map: orthophoto, stand polygon, landings and symbols, planned routes, drawn route, machine positions (simulated or last route
   point), forest-stock piles for "Skotningsanmälan from piles". Image coordinates (the orthophoto is not georeferenced). */
function piles(o){
  const path=o.routes?.harvester;if(!path||typeof WorksiteRoutes==='undefined')return[];
  return grades(o).filter(a=>a.stock>.05).map((a,i)=>({key:a.key,code:a.code,name:a.name,volume:a.stock,point:WorksiteRoutes.at(path,[.35,.6,.85][i]||.5)}));
}
function mapHtml(o,r,{pilesMode=false}={}){
  const R=typeof WorksiteRoutes!=='undefined'?WorksiteRoutes:null,xs=o.boundary.map(p=>p[0]),ys=o.boundary.map(p=>p[1]),pad=40,AR=1.75;
  let w=Math.max(Math.max(...xs)-Math.min(...xs)+2*pad,(Math.max(...ys)-Math.min(...ys)+2*pad)*AR);w=Math.min(w,620);const h=w/AR;
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,box=[Math.max(0,Math.min(620-w,cx-w/2)),Math.max(0,Math.min(350-h,cy-h/2)),w,h],u=w/620;
  const mo=M.machineOrder(S.plan,o.id),mode=S.view.mapMode,tone=mode==='status'?o.pill.cls:mode==='op'?'op':'species';
  const pts=a=>a.map(p=>p.join(',')).join(' ');
  let s=`<rect x="${box[0]-w}" y="${box[1]-h}" width="${3*w}" height="${3*h}" fill="#0b3a5a"/>${R?`<image href="${esc(UI.DIST+R.imageUrl)}" x="0" y="0" width="620" height="350" preserveAspectRatio="none"/><rect x="0" y="0" width="620" height="350" fill="#00253d" fill-opacity=".12"/>`:''}`;
  for(const x of S.vm.orders)if(x.id!==o.id)s+=`<polygon class="m-other" points="${pts(x.boundary)}" stroke-width="${1.2*u}"/>`;
  s+=V.standSvg(o,UI,{label:false,interactive:false,tone});
  if(o.bio)s+=`<circle class="m-protect" cx="${o.bio.point[0]}" cy="${o.bio.point[1]}" r="${o.bio.radius}" stroke-width="${1.5*u}"><title>${esc(o.bio.code)} · ${esc(o.bio.title)}</title></circle>`;
  if(o.routes)s+=`<g class="map-routes">${o.routes.harvester?`<polyline class="route-h" points="${pts(o.routes.harvester)}" stroke-width="${1.6*u}"/>`:''}${o.routes.forwarder?`<polyline class="route-f" points="${pts(o.routes.forwarder)}" stroke-width="${2*u}"/>`:''}</g>`;
  for(const l of M.orderLandings(o,S.vm.plan)){const[x,y]=l.point;s+=`<g class="map-landing ${l.primary?'':'extra'}"><rect x="${x-7*u}" y="${y-7*u}" width="${14*u}" height="${14*u}" rx="${2*u}" stroke-width="${1.5*u}"/><text x="${x+10*u}" y="${y+4*u}" font-size="${10*u}" data-no-translate>${esc(l.id)}</text></g>`;}
  for(const sym of M.orderSymbols(o,S.vm.plan))s+=V.symbolSvg(sym,UI,{u,orderId:o.id,interactive:false});
  for(const [rid,rt] of Object.entries(mo.route)){if(!rt.points?.length)continue;const p=rt.points.map(x=>x.point);
    s+=`<g class="m-drawn ${rid.startsWith('F')?'fwd':''}" data-drawn="${esc(rid)}">${p.length>1?`<polyline points="${pts(p)}" stroke-width="${3*u}"/>`:''}${rt.points.map((x,i)=>`<circle cx="${x.point[0]}" cy="${x.point[1]}" r="${4*u}"><title>${esc(rid)} · ${esc('Punkt')} ${i+1} · ${UI.fm(x.produced)}</title></circle>`).join('')}</g>`;}
  for(const m of machines()){const rt=mo.route[m.id],last=rt?.points?.at(-1)?.point,pos=last||(m.gameKey?V.machinePos(o,m.gameKey):null);if(!pos)continue;
    s+=`<g class="m-machine ${m.type==='forwarder'?'fwd':''} ${m.id===r.id?'me':''}" data-machine="${esc(m.id)}"><title>${esc(m.name)} · ${esc(last?'Position aus gezeichneter Route':'Position simuliert aus dem Spielstand')}</title><rect x="${pos[0]-9*u}" y="${pos[1]-9*u}" width="${18*u}" height="${18*u}" rx="${3*u}" stroke-width="${1.5*u}"/><text x="${pos[0]}" y="${pos[1]+4.5*u}" text-anchor="middle" font-size="${12*u}" data-no-translate>${m.type==='forwarder'?'F':'H'}</text></g>`;}
  if(pilesMode)for(const p of piles(o)){const sel=S.view.pileSel.includes(p.key),[x,y]=p.point;
    s+=`<g class="m-pile ${sel?'selected':''}" data-action="pile" data-key="${esc(p.key)}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc('Haufen')} ${esc(p.code)}"><circle cx="${x}" cy="${y}" r="${14*u}" stroke-width="${2*u}"/><text x="${x}" y="${y-18*u}" text-anchor="middle" font-size="${10*u}" data-no-translate>${esc(p.code)} ${UI.num(p.volume)} fm</text></g>`;}
  const drawing=!!mo.route[r.id]?.drawing;
  return `<div class="m-map-wrap ${drawing?'drawing':''}"><svg class="cfh-map m-map" viewBox="${box.join(' ')}" role="group" aria-label="${esc('Karte des Auftrags')}" data-map="${pilesMode?'piles':'route'}">${s}</svg></div>`;
}
function mapSection(o,r){
  const mo=M.machineOrder(S.plan,o.id),rt=mo.route[r.id]||{drawing:false,points:[]},p=progress(o,r),modes=[['status','Status'],['op','Maßnahme'],['species','Baumart']];
  return `<div class="m-map-tools"><button type="button" class="m-big ${rt.drawing?'orange':''}" data-action="route-toggle" aria-pressed="${!!rt.drawing}">${rt.drawing?'■ '+esc('Zeichnen beenden'):'✎ '+esc('Route zeichnen')} <small class="sv-cap" lang="sv" data-no-translate>(${rt.drawing?'Sluta rita rutt':'Rita rutt'})</small></button>
    <span class="menu"><button type="button" class="m-icon" data-action="legend" aria-expanded="${S.view.legend}" title="${esc('Ansicht')}" aria-label="${esc('Ansicht')}">💡</button>${S.view.legend?`<div class="menu-list m-menu" data-map-modes>${modes.map(([k,de])=>`<button type="button" data-action="map-mode" data-key="${k}" aria-pressed="${S.view.mapMode===k}">${esc(de)}</button>`).join('')}<small>${esc(S.view.mapMode==='status'?o.info.label:S.view.mapMode==='op'?o.operationLabel:o.species)}</small></div>`:''}</span>
    <span class="menu"><button type="button" class="m-icon" data-action="layers" aria-expanded="${S.view.layers}" title="${esc('Ressourcen des Benutzers')}" aria-label="${esc('Ressourcen des Benutzers')}">🗂</button>${S.view.layers?`<div class="menu-list m-menu" data-map-resources>${machines().map(m=>`<span>${code(m.id)} ${esc(m.name)}</span>`).join('')}<small>${esc('Positionen simuliert, keine GPS-Meldung.')}</small></div>`:''}</span>
    <span class="hint">${esc(rt.drawing?'In die Karte tippen: jeder Punkt speichert die bis dahin gemeldete Produktion.':`${UI.num(rt.points.length,0)} ${tr('Routenpunkte')}`)}</span></div>
    ${mapHtml(o,r)}
    <div class="m-progress" data-progress="${p.pct.toFixed(1)}"><span>${esc(isH(r)?'Geerntet':'Gerückt')}: <b>${UI.fm(p.done)}</b> / ${UI.fm(p.total)} (${UI.num(p.pct,0)} %)</span><span class="m-bar big"><span style="width:${p.pct.toFixed(1)}%"></span></span></div>
    <p class="note">${esc('Luftbild: Geobasis NRW (dl-de/zero-2-0) · Hiebe fiktiv · Bildkoordinaten, nicht georeferenziert.')}</p>`;
}
const FUNCS=[['transfer','An Messgerät übertragen','Överför till mätdon'],['report','Produktion melden','Produktionsrapport'],['forwarding','Rückemeldung','Skotningsanmälan'],['plot','Probeflächenmessung','Provytemätning'],['evaluation','Schlussbewertung','Slutvärdering'],['end','Ernte beenden','Avsluta avverkningen']];
function funcState(o,r,k){
  const st=started(o,r),s=o.status;
  if(k==='transfer')return st?null:'Erst den Auftrag starten.';
  if(k==='report')return !isH(r)?'Nur für den Harvester (HPR).':['harvesting','felled'].includes(s)?null:'Erst die Ernte starten.';
  if(k==='forwarding')return isH(r)?'Nur für den Forwarder (FPR).':s==='forwarding'?null:'Erst das Rücken starten.';
  if(k==='plot')return st?null:'Erst den Auftrag starten.';
  if(k==='evaluation')return isH(r)?'Durch den Forwarder nach dem Rücken.':s==='forwarding'?null:s==='completed'?'Auftrag abgeschlossen.':'Erst das Rücken starten.';
  if(k==='end')return !isH(r)?'Nur für den Harvester.':s==='harvesting'?null:s==='sent'?'Erst die Ernte starten.':'Ernte bereits beendet.';
  return null;
}
function reportForm(o,r,fwd){
  const f=S.view.form,mode=fwd?S.view.mode:'manual',pl=piles(o);
  const mine=M.machineData(S.plan).reports.filter(x=>x.orderId===o.id&&x.resourceId===r.id),over=new Set(M.overwrittenReports(S.snap.production.messages,S.plan));
  const val=k=>mode==='piles'?(S.view.pileSel.includes(k)?(pl.find(p=>p.key===k)?.volume||0):0):f[k]??'';
  return `<div class="m-func-body" data-func-body="${fwd?'forwarding':'report'}"><h3>${fwd?term('Rückemeldung','Skotningsanmälan'):term('Produktion melden','Produktionsrapport')} · ${code(fwd?'FPR':'HPR')}</h3>
    ${fwd?`<span class="segmented m-mode" role="group" aria-label="${esc('Erfassung')}"><button type="button" data-action="report-mode" data-key="manual" aria-pressed="${mode==='manual'}">${esc('Manuell je Sortiment')}</button><button type="button" data-action="report-mode" data-key="piles" aria-pressed="${mode==='piles'}">${esc('Aus Haufen in der Karte')}</button></span>`:''}
    ${mode==='piles'?`${mapHtml(o,r,{pilesMode:true})}<p class="hint">${esc(pl.length?'Haufen in der Karte antippen, um sie zu übernehmen.':'Kein Waldlager zum Rücken vorhanden.')}</p>`:''}
    <div class="m-form-grid">${GRADES.map(([k,c])=>{const a=o.assortments.find(x=>x.key===k);return `<label class="stack">${code(c)} ${esc(a?.name||c)} (fm)<input type="number" inputmode="decimal" min="0" step="0.1" data-form="${k}" value="${esc(mode==='piles'?(+val(k)).toFixed(1):val(k))}" ${mode==='piles'?'readonly':''}></label>`;}).join('')}</div>
    <button type="button" class="m-big green" data-action="report-save">${esc(fwd?'Rückemeldung senden':'Produktion senden')} (${code(fwd?'FPR':'HPR')})</button>
    <p class="note">${esc('Die Spielschicht ist die Simulation: Ergebnisse der Schicht ersetzen manuelle Meldungen derselben Schicht.')} ${esc('Diese Meldung gilt für Schicht')} ${UI.num(round(),0)}.</p>
    ${mine.length?`<div class="table-wrap"><table class="grid m-grid" data-reports><thead><tr><th>${esc('Schicht')}</th><th>${esc('Meldung')}</th><th>${esc('Menge')}</th><th>${esc('Quelle')}</th><th>${esc('Status')}</th></tr></thead><tbody>${mine.map(x=>`<tr data-report="${esc(x.id)}" class="${over.has(x.id)?'muted':''}"><td>${UI.num(x.round,0)}</td><td>${code(x.type)}</td><td>${UI.fm(GRADES.reduce((s,[k])=>s+(x.products[k]||0),0))}</td><td>${esc(x.source==='piles'?'Aus Haufen':'Manuell')}</td><td>${esc(over.has(x.id)?'durch Spielschicht ersetzt':'gültig')}</td></tr>`).join('')}</tbody></table></div>`:''}
  </div>`;
}
function plotForm(o,r){
  const p=S.view.plot,plots=M.machineOrder(S.plan,o.id).plots;
  return `<div class="m-func-body" data-func-body="plot"><h3>${term('Probeflächenmessung','Provytemätning')} · ${code(isH(r)?'HQC':'FQC')}</h3>
    <div class="m-form-grid"><label class="stack">${esc('Probefläche')}<input type="text" data-plot="plotId" maxlength="20" value="${esc(p.plotId??'P'+(plots.length+1))}"></label><label class="stack">${esc('Stämme je ha')}<input type="number" inputmode="numeric" min="1" step="1" data-plot="stems" value="${esc(p.stems??'')}"></label><label class="stack">${esc('Mittlerer BHD (cm)')}<input type="number" inputmode="decimal" min="1" step="0.1" data-plot="dbh" value="${esc(p.dbh??'')}"></label></div>
    <button type="button" class="m-big green" data-action="plot-save">${esc('Probefläche speichern')}</button>
    ${plots.length?`<div class="table-wrap"><table class="grid m-grid" data-plots><thead><tr><th>${esc('Probefläche')}</th><th>${esc('Stämme je ha')}</th><th>${esc('Mittlerer BHD (cm)')}</th><th>${esc('Maschine')}</th><th>${esc('Meldung')}</th></tr></thead><tbody>${plots.map(x=>`<tr><td><span data-no-translate>${esc(x.plotId)}</span></td><td>${UI.num(x.stems,0)}</td><td>${UI.num(x.dbh)}</td><td>${code(x.resourceId||'–')}</td><td>${code(x.quality)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`;
}
function evaluationForm(o,r){
  const e=S.view.evaluation,c=volumeChecks(o),adj=e.adj||[{kind:'addition',text:'',amount:''},{kind:'deduction',text:'',amount:''}],ordered=o.areaHa,worked=e.area??ordered,rest=ordered!=null&&worked!==''&&Number.isFinite(Number(worked))?Math.max(0,ordered-Number(worked)):null;
  const line=(de,x)=>`<li class="${x.warn?'warn':'ok'}" data-check>${x.warn?'!':'✓'} ${esc(de)}: ${esc('geplant')} ${UI.fm(x.planned)} · ${esc('gemeldet')} ${UI.fm(x.reported)} (${x.pct>=0?'+':'−'}${UI.num(Math.abs(x.pct*100),0)} %)</li>`;
  const warn=c.harvest.warn||c.forward.warn;
  return `<div class="m-func-body" data-func-body="evaluation"><h3>${term('Schlussbewertung','Slutvärdering')}</h3>
    ${warn?`<p class="flag warn wide" data-volume-warning>! ${esc('Geplante und gemeldete Mengen weichen ab. Bitte vor dem Speichern prüfen.')}</p>`:''}
    <ul class="checks m-checks">${line('Ernte',c.harvest)}${line('Rücken',c.forward)}</ul>
    <h4>${term('Zu- und Abschläge','Tillägg/Avdrag')}</h4><div class="m-adj">${adj.map((a,i)=>`<div class="m-adj-row"><select data-eval="adj-kind" data-i="${i}" aria-label="${esc('Art')}"><option value="addition" ${a.kind!=='deduction'?'selected':''}>${esc('Zuschlag')}</option><option value="deduction" ${a.kind==='deduction'?'selected':''}>${esc('Abschlag')}</option></select><input type="text" data-eval="adj-text" data-i="${i}" maxlength="80" placeholder="${esc('Grund')}" value="${esc(a.text)}" aria-label="${esc('Grund')}"><input type="number" data-eval="adj-amount" data-i="${i}" step="1" placeholder="€" value="${esc(a.amount)}" aria-label="${esc('Betrag (€)')}"></div>`).join('')}</div>
    <h4>${term('Bearbeitete / verbleibende Fläche','Avverkad/kvarvarande areal')}</h4><div class="m-form-grid"><label class="stack">${esc('Bearbeitete Fläche (ha)')}<input type="number" inputmode="decimal" min="0" step="0.1" data-eval="area" value="${esc(worked??'')}"></label><div class="stack"><span>${esc('Beauftragte Fläche (ha)')}</span><b>${UI.ha(ordered)}</b></div><div class="stack"><span>${esc('Verbleibende Fläche (ha)')}</span><b data-rest-area>${rest==null?'–':UI.ha(rest)}</b></div></div>
    <fieldset class="m-yesno"><legend>${esc('Wird auf dem Objekt noch weiter gearbeitet?')}</legend>${[['yes','Ja'],['no','Nein']].map(([k,de])=>`<label class="m-radio ${e.more===k?'on':''}"><input type="radio" name="more" value="${k}" data-eval="more" ${e.more===k?'checked':''}> ${esc(de)}</label>`).join('')}<small>${esc('Nein schließt den Auftrag ab (Status „Abgeschlossen“). Speichern schließt den Auftrag auf dieser Maschine.')}</small></fieldset>
    <label class="stack">${esc('Kommentar')}<textarea data-eval="comment" rows="2" maxlength="500" data-no-translate>${esc(e.comment||'')}</textarea></label>
    <button type="button" class="m-big green" data-action="evaluation-save" ${e.more?'':'disabled'}>${esc('Schlussbewertung speichern')}</button></div>`;
}
function functionsSection(o,r){
  const f=S.view.func;let body='';
  if(f&&!funcState(o,r,f)){
    if(f==='transfer'){const files=M.machineFiles(o.instructions,r.type,o.id);body=`<div class="m-func-body" data-func-body="transfer"><h3>${term('An Messgerät übertragen','Överför till mätdon')}</h3>${pinFlags(o,r)}<ul>${files.map(x=>`<li>${code(x.kind)} <span data-no-translate>${esc(x.name)}</span> · ${code('v'+x.version)}</li>`).join('')||`<li>${esc('Keine Dateien gesendet.')}</li>`}</ul><button type="button" class="m-big green" data-action="transfer" ${files.length?'':'disabled'}>${esc('Jetzt übertragen')}</button></div>`;}
    else if(f==='report')body=reportForm(o,r,false);
    else if(f==='forwarding')body=reportForm(o,r,true);
    else if(f==='plot')body=plotForm(o,r);
    else if(f==='evaluation')body=evaluationForm(o,r);
    else if(f==='end')body=`<div class="m-func-body" data-func-body="end"><h3>${term('Ernte beenden','Avsluta avverkningen')}</h3><p>${esc('Ernte auf diesem Auftrag beenden? Der Status wird „Fällung beendet“; der Forwarder kann weiter rücken.')}</p>${(()=>{const x=volumeChecks(o).harvest;return x.warn?`<p class="flag warn wide" data-volume-warning>! ${esc('Geerntete Menge weicht von der geplanten ab')}: ${UI.fm(x.reported)} / ${UI.fm(x.planned)}</p>`:'';})()}<button type="button" class="m-big orange" data-action="end-confirm">${esc('Ernte beenden')}</button></div>`;
  }
  return `<div class="m-func-grid" role="group" aria-label="${esc('Funktionen')}">${FUNCS.map(([k,de,sv])=>{const why=funcState(o,r,k);return `<button type="button" class="m-tile ${f===k?'active':''}" data-action="func" data-func="${k}" ${why?'disabled':''} aria-pressed="${f===k}"><b>${esc(de)}</b><small class="sv-cap" lang="sv" data-no-translate>(${esc(sv)})</small>${why?`<small class="m-why">${esc(why)}</small>`:''}</button>`;}).join('')}</div>${body}`;
}
const ACTION_TEXT={harvesterStart:'Ernte begonnen',fellingEnd:'Fällung beendet',forwarderStart:'Rücken begonnen',finalNo:'Abgeschlossen'};
function statusRows(o){
  const rows=[...o.events.map(e=>({round:e.round,seq:0,text:e.kind==='handover'?`${tr('Übergabe bestätigt')} · PIN v${e.version}`:`${e.kind==='harvest'?'HPR':'FPR'} · ${tr(e.kind==='harvest'?'gefällt':'gerückt')} ${UI.fm(e.volume)}`,res:e.machine||'',src:'Spiel'})),
    ...S.vm.plan.log.filter(l=>l.orderId===o.id&&l.kind==='sent').map(l=>({round:l.at,seq:0,text:tr('An Ressource gesendet'),res:l.rowId,src:'Planung'})),
    ...M.machineData(S.plan).log.filter(l=>l.orderId===o.id).map(l=>({round:l.round,seq:l.seq,res:l.resourceId,src:'Maschine',status:l.to,
      files:l.action==='transfer'?l.files||[]:null,
      text:l.to?`${tr('Status')}: ${tr(M.STATUS_INFO[l.to].title)}`:l.action==='transfer'?tr('An Messgerät übertragen'):l.action==='report'?`${l.type} · ${tr('manuell gemeldet')} ${UI.fm(l.volume)}`:l.action==='plot'?`${tr('Probefläche erfasst')}: ${l.plotId}`:l.action==='evaluation'?`${tr('Schlussbewertung gespeichert')} · ${tr(l.more==='no'?'Nein':'Ja')}`:l.action}))];
  return rows.sort((a,b)=>(a.round??0)-(b.round??0)||(a.src==='Maschine')-(b.src==='Maschine')||a.seq-b.seq);
}
function statusSection(o){
  const rows=statusRows(o);
  return `<div class="table-wrap"><table class="grid m-grid" data-status-log><thead><tr><th>${esc('Schicht')}</th><th>${esc('Änderung')}</th><th>${esc('Ressource')}</th><th>${esc('Quelle')}</th></tr></thead><tbody>${rows.map(x=>`<tr ${x.status?`data-status-change="${esc(x.status)}"`:''}><td>${UI.num(x.round,0)}</td><td>${esc(x.text)}${x.files?`: ${x.files.map(f=>`<span data-no-translate>${esc(f)}</span>`).join(', ')||'–'}`:''}</td><td>${x.res?code(x.res):dash}</td><td>${esc(x.src)}</td></tr>`).join('')||`<tr><td colspan="4">${esc('Noch keine Statusänderung.')}</td></tr>`}</tbody></table></div>
    <p>${esc('Aktueller Status')}: ${UI.pill(o)} <small>${esc(o.info.title)}</small> <small class="sv-cap" lang="sv" data-no-translate>(${esc(o.info.titleSv)})</small></p>`;
}
const SECTIONS=[['tabs','Auftrag','Arbetsorder'],['map','Karte','Karta'],['functions','Funktionen','Funktioner'],['status','Statusänderungen','Statusändringar']];
function orderHtml(o,r){
  const sec=S.view.section,body=sec==='map'?mapSection(o,r):sec==='functions'?functionsSection(o,r):sec==='status'?statusSection(o):tabsHtml(o,r);
  return `<section class="m-screen" data-screen="order" data-order="${esc(o.id)}" aria-labelledby="mOrderTitle">
    <div class="m-order-head"><button type="button" class="m-big ghost" data-action="back">‹ ${esc('Planung')}</button><h1 id="mOrderTitle">${esc(o.name)} <small>${UI.orderLabel(o)}</small></h1><span class="m-order-status">${UI.pill(o)}<small>${esc(o.info.title)}</small></span></div>
    <nav class="m-sections" aria-label="${esc('Auftrag')}">${SECTIONS.map(([k,de,sv])=>`<button type="button" data-action="section" data-key="${k}" aria-current="${k===sec}">${esc(de)} <small class="sv-cap" lang="sv" data-no-translate>(${esc(sv)})</small></button>`).join('')}</nav>
    <div class="m-section" data-section="${esc(sec)}">${body}</div></section>`;
}
function render(){
  const ae=document.activeElement,fk=ae?.dataset?Object.entries(ae.dataset).map(x=>x.join('=')).join('&'):null;
  S.snap=B.fromGameState(S.game);S.vm=M.viewModel(S.snap,S.plan);const r=resource(),v=S.view;
  $('mResource').innerHTML=headerHtml();$('mBanner').innerHTML=banner();
  const ret=$('mReturn');if(ret)ret.hidden=!S.returnUrl;
  let o=v.screen==='order'?order(v.orderId):null;
  if(o&&r&&!M.machineOrders(S.vm,r.id).some(x=>x.order.id===o.id))o=null;
  if(!o){v.screen='list';v.orderId=null;}
  $('mMain').innerHTML=o?orderHtml(o,r):listHtml(r);
  if(fk)for(const el of document.querySelectorAll('[data-form],[data-plot],[data-eval],[data-msg]'))if(Object.entries(el.dataset).map(x=>x.join('=')).join('&')===fk){el.focus();break;}
}
let toastTimer=null;
function toast(text){const t=$('mToast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4500);}

/* ---------- Actions ---------- */
const cur=()=>({o:order(S.view.orderId),r:resource()});
function openOrder(id){const v=S.view,r=resource();Object.assign(v,{screen:'order',orderId:id,section:'tabs',tab:'order',func:null,form:{},mode:'manual',pileSel:[],plot:{},evaluation:{},message:''});
  // Viewing a tab is what turns it green: the first tab is on screen when the order opens.
  if(r&&!M.tabsSeen(S.plan,id,r.id).includes('order'))save(M.markTab(S.plan,id,r.id,'order'));else render();try{window.scrollTo(0,0);}catch{}}
function numbers(){const out={};for(const [k] of GRADES){const x=Number(String(S.view.form[k]??'').replace(',','.'));out[k]=Number.isFinite(x)&&x>0?x:0;}return out;}
const actions={
  resource:el=>{S.view.resource=el.dataset.res;local.set(RES_KEY,el.dataset.res);S.view.func=null;render();toast(`${tr('Angemeldet als')} ${el.dataset.res}`);},
  filter:el=>{S.view.filter=el.dataset.key;render();},
  'open-order':el=>openOrder(el.dataset.order),
  back:()=>{S.view.screen='list';S.view.orderId=null;render();},
  section:el=>{S.view.section=el.dataset.key;S.view.legend=false;S.view.layers=false;render();},
  tab:el=>{const{o,r}=cur();S.view.tab=el.dataset.tab;if(o&&r&&!M.tabsSeen(S.plan,o.id,r.id).includes(el.dataset.tab))save(M.markTab(S.plan,o.id,r.id,el.dataset.tab));else render();},
  'send-message':()=>{const{o,r}=cur(),text=S.view.message;S.view.message='';if(!apply(M.machineMessage(S.plan,o.id,r.id,text,S.vm.meta.round),tr('Nachricht gesendet'),'Bitte eine Nachricht eingeben.'))S.view.message=text;},
  start:()=>{const{o,r}=cur(),files=M.machineFiles(o.instructions,r.type,o.id),text=S.view.message;S.view.message='';
    if(!apply(M.machineStart(S.plan,o.id,r,{status:o.status,instructions:o.instructions,round:S.vm.meta.round,message:text}),`${tr(isH(r)?'Ernte begonnen':'Rücken begonnen')} · ${files.length?`${files.length} ${tr('Dateien an Messgerät übertragen')}`:tr('Keine Dateien gesendet.')}`,'Starten nicht möglich')){S.view.message=text;render();}},
  func:el=>{S.view.func=S.view.func===el.dataset.func?null:el.dataset.func;S.view.form={};S.view.pileSel=[];S.view.mode='manual';render();},
  transfer:()=>{const{o,r}=cur(),files=M.machineFiles(o.instructions,r.type,o.id);apply(M.machineTransfer(S.plan,o.id,r,{instructions:o.instructions,round:S.vm.meta.round}),`${tr('An Messgerät übertragen')}: ${files.length} ${tr('Dateien')}`);},
  'report-mode':el=>{S.view.mode=el.dataset.key;S.view.pileSel=[];S.view.form={};render();},
  pile:el=>{const k=el.dataset.key,sel=S.view.pileSel;S.view.pileSel=sel.includes(k)?sel.filter(x=>x!==k):[...sel,k];render();},
  'report-save':()=>{const{o,r}=cur(),fwd=!isH(r),piles_=fwd&&S.view.mode==='piles';let products=numbers();
    if(piles_){const pl=piles(o);products={saw:0,pulp:0,down:0};for(const k of S.view.pileSel)products[k]=+(pl.find(p=>p.key===k)?.volume||0).toFixed(2);}
    const sum=GRADES.reduce((s,[k])=>s+products[k],0),rt=M.machineOrder(S.plan,o.id).route[r.id],point=rt?.drawing?rt.points.at(-1)?.point||null:null;
    if(!(sum>0))return toast(tr(piles_?'Bitte mindestens einen Haufen wählen.':'Bitte eine Menge eingeben.'));
    if(apply(M.addMachineReport(S.plan,{type:fwd?'FPR':'HPR',resourceId:r.id,orderId:o.id,round:round(),products,source:piles_?'piles':'manual',piles:piles_?[...S.view.pileSel]:null,point}),`${fwd?'FPR':'HPR'} ${tr('gemeldet')}: ${UI.fm(sum)}`)){S.view.form={};S.view.pileSel=[];render();}},
  'plot-save':()=>{const{o,r}=cur(),p=S.view.plot,plots=M.machineOrder(S.plan,o.id).plots;
    if(apply(M.addPlot(S.plan,o.id,{plotId:p.plotId??'P'+(plots.length+1),stems:p.stems,dbh:String(p.dbh??'').replace(',','.'),resourceId:r.id,round:S.vm.meta.round,type:r.type}),tr('Probefläche gespeichert'),'Bitte Probefläche, Stämme je ha und BHD angeben.'))S.view.plot={};},
  'evaluation-save':()=>{const{o,r}=cur(),e=S.view.evaluation,c=volumeChecks(o);
    const ok=apply(M.finalEvaluation(S.plan,o.id,r,{more:e.more,adjustments:(e.adj||[]),workedArea:e.area??o.areaHa,comment:e.comment,status:o.status,round:S.vm.meta.round,checks:{harvest:c.harvest.pct,forward:c.forward.pct}}),
      `${tr('Schlussbewertung gespeichert')}${e.more==='no'?' · '+tr('Auftrag abgeschlossen'):''}${c.harvest.warn||c.forward.warn?' · '+tr('Mengenabweichung vermerkt'):''}`,'Schlussbewertung nicht möglich');
    if(ok){S.view.evaluation={};S.view.func=null;S.view.screen='list';S.view.orderId=null;render();}},
  'end-confirm':()=>{const{o,r}=cur();if(apply(M.machineTransition(S.plan,o.id,'fellingEnd',o.status,{round:S.vm.meta.round,resourceId:r.id}),tr('Fällung beendet')))S.view.func=null;render();},
  'route-toggle':()=>{const{o,r}=cur(),on=!M.machineOrder(S.plan,o.id).route[r.id]?.drawing;save(M.setRouteDrawing(S.plan,o.id,r.id,on),tr(on?'Route zeichnen: in die Karte tippen.':'Zeichnen beendet'));},
  'map-mode':el=>{S.view.mapMode=el.dataset.key;render();},
  legend:()=>{S.view.legend=!S.view.legend;S.view.layers=false;render();},
  layers:()=>{S.view.layers=!S.view.layers;S.view.legend=false;render();},
  return:()=>{if(S.returnUrl){const go=()=>api.navigate(S.returnUrl);if(PS.pending()){const t=setTimeout(go,3000);PS.flush().then(()=>{clearTimeout(t);go();});}else go();}}
};
function onClick(e){
  const el=e.target.closest?.('[data-action]');
  if(el&&!el.disabled&&actions[el.dataset.action]){e.preventDefault?.();actions[el.dataset.action](el,e);return;}
  const svg=e.target.closest?.('svg.m-map[data-map="route"]');
  if(svg){const{o,r}=cur();if(!o||!r||!M.machineOrder(S.plan,o.id).route[r.id]?.drawing)return;const pt=V.svgPoint(svg,e.clientX,e.clientY);if(!pt)return;
    const done=progress(o,r).done,next=M.addRoutePoint(S.plan,o.id,r.id,pt,done);save(next,`${tr('Routenpunkt')} ${M.machineOrder(next,o.id).route[r.id].points.length} · ${UI.fm(done)}`);}
}
function onInput(e){
  const el=e.target,d=el.dataset||{},v=S.view;
  if(d.form){v.form={...v.form,[d.form]:el.value};}
  else if(d.plot){v.plot={...v.plot,[d.plot]:el.value};}
  else if(d.msg!==undefined){const had=!!String(v.message||'').trim();v.message=el.value;if(had!==!!el.value.trim()){const b=document.querySelector('[data-action="send-message"]');if(b)b.disabled=!el.value.trim();}}
  else if(d.eval){const ev=v.evaluation,i=Number(d.i);
    if(d.eval==='more'){ev.more=el.value;render();return;}
    if(d.eval.startsWith('adj-')){const adj=ev.adj=(ev.adj||[{kind:'addition',text:'',amount:''},{kind:'deduction',text:'',amount:''}]).map(a=>({...a}));adj[i][d.eval.slice(4)]=el.value;}
    else if(d.eval==='area'){ev.area=el.value;const o=order(v.orderId),out=document.querySelector('[data-rest-area]');if(out&&o?.areaHa!=null){const x=Number(String(el.value).replace(',','.'));out.textContent=Number.isFinite(x)&&el.value!==''?UI.ha(Math.max(0,o.areaHa-x)):'–';}}
    else ev[d.eval]=el.value;}
}
function onKey(e){if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute?.('role')==='button'&&e.target.tagName!=='BUTTON'){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}if(e.key==='Escape'&&(S.view.legend||S.view.layers)){S.view.legend=false;S.view.layers=false;render();}}
function init(){
  load();
  document.addEventListener('click',onClick);document.addEventListener('input',onInput);document.addEventListener('change',e=>{if(e.target.dataset?.eval)onInput(e);});document.addEventListener('keydown',onKey);
  document.addEventListener('forestry-language-change',()=>{render();try{I18n.localize(document.body);}catch{}});
  PS.subscribe(ev=>{if(ev.type==='status'&&ev.status.notice&&!S.notices.some(n=>n.text===ev.status.notice)){S.notices.push({kind:'warn',text:ev.status.notice});render();}});
  window.addEventListener('pagehide',()=>{if(PS.pending())PS.flush({keepalive:true});});
  render();
  const lang=B.readEnvelope(session.get(B.KEYS.toReplica),'to-replica')?.lang;if(lang&&typeof I18n!=='undefined'&&I18n.supported.includes(lang)&&I18n.language!==lang)I18n.setLanguage(lang);
}
if(typeof document!=='undefined'&&document.getElementById('mMain'))init();
return{api,state:()=>S,vm:()=>S.vm,render,actions,init,store:PS};
})();
