/* Holztransport demo · domain model (SPEC §3–§4, §8–§9). Entities, ids, state machines, review → order creation,
   amendments with preserved field work, locations, publication and allocation, driver events (idempotent), loads,
   delivery notes, mill receipts and matching, the quantity ledger, reconciliation, reports and driver-safe redaction.
   All functions mutate the given state object and return a result; the store wraps them with audit and persistence. */
'use strict';
(function(){
const req=(ns,name,path)=>(globalThis[ns]&&globalThis[ns][name])||(typeof require!=='undefined'?require(path):null);
const U=req('TransportCore','units','./units.js'),C=req('TransportCore','coords','./coords.js'),X=req('TransportCore','extract','./extract.js');
const CUST=req('TransportData','customers','../data/customers.js'),FLEET=req('TransportData','fleet','../data/fleet.js');
const INTAKE=['Received','NeedsReview','Ready','Failed','Duplicate','Superseded'];
const STACK=['Available','PartlyCollected','Cleared','Blocked'];
const LOAD=['Planned','Loaded','Arrived','Unloaded','Measured','Reconciled','Rejected','Diverted','Disputed'];
const ORDER=['Open','CollectionComplete','DeliveryComplete','ReceiptsComplete','Reconciled','Paused','Cancelled','Superseded'];
const ALLOC=['Proposed','Accepted','Reserved','Withdrawn','Reassigned','Done'];
/* ELDATsmart Lieferschein status codes (RESEARCH §1) shown beside the load state for orientation. */
const ELDAT_STATUS={Planned:{code:110,label:'Fahre ins Revier'},Loaded:{code:120,label:'Lieferschein erstellt'},Arrived:{code:140,label:'Am Lieferort angekommen'},Unloaded:{code:50,label:'Angenommen'},Measured:{code:50,label:'Angenommen'},Reconciled:{code:50,label:'Angenommen'},Rejected:{code:60,label:'Abgelehnt'},Diverted:{code:140,label:'Am Lieferort angekommen (umgeleitet)'},Disputed:{code:50,label:'Angenommen (strittig)'}};
const pad=(n,w)=>String(n).padStart(w,'0');
function nextId(state,kind){state.seq[kind]=(state.seq[kind]||0)+1;const n=state.seq[kind];const y=(state.clock?state.clock():new Date().toISOString()).slice(0,4);
  return {order:`TA-${y}-${pad(n,4)}`,load:`F-${pad(n,4)}`,note:`LS-${y}-${pad(n,5)}`,receipt:`WE-${pad(n,4)}`,alloc:`ZU-${pad(n,4)}`,conflict:`K-${pad(n,3)}`,audit:`A-${pad(n,5)}`,event:`EV-${pad(n,5)}`,version:`V${n}`}[kind];}
function now(state){return state.clock?state.clock():new Date().toISOString();}
function initialState(opts={}){
  const profiles=structuredClone(CUST.PROFILES);
  return {schema:1,seq:{},carrierId:'P-CARRIER',parties:structuredClone(FLEET.PARTIES),users:structuredClone(FLEET.USERS),trucks:structuredClone(FLEET.TRUCKS),groups:structuredClone(FLEET.GROUPS),quotas:structuredClone(FLEET.QUOTAS),settings:Object.assign(structuredClone(FLEET.SETTINGS),opts.settings||{}),profiles,
    documents:{},orders:{},stacks:{},allocations:{},loads:{},events:[],eventIds:{},notes:{},receipts:{},ledger:[],conflicts:[],audit:[],factors:structuredClone(U.FACTORS),
    ui:{persona:'U-DISPO',online:true,queue:[],lastSync:null,lastRefresh:null,downloaded:{}}};
}
function audit(state,who,action,ref,before,after){state.audit.push({id:nextId(state,'audit'),at:now(state),who,action,ref:ref||null,before:before===undefined?null:before,after:after===undefined?null:after});}
function conflict(state,kind,refs,message){const c={id:nextId(state,'conflict'),kind,refs,message,at:now(state),resolved:false,resolution:null};state.conflicts.push(c);return c;}
const party=(state,id)=>state.parties.find(p=>p.id===id)||null;const user=(state,id)=>state.users.find(u=>u.id===id)||null;const truck=(state,id)=>state.trucks.find(t=>t.id===id)||null;
const profile=(state,id)=>state.profiles.find(p=>p.id===id)||state.profiles.find(p=>p.id==='unknown');
const partyByName=(state,name)=>state.parties.find(p=>name&&(p.name===name||name.includes(p.name)||p.name.includes(name)))||null;
/* ---------- Intake ---------- */
function ingestDocument(state,doc,opts={}){
  const existing=Object.values(state.documents);const prof0=X.extractDocument(doc,{profiles:state.profiles,existingDocs:existing,existingStacks:existingStackIndex(state),now:now(state),tolerancePct:state.settings.tolerancePct,reviewedCount:undefined});
  const prof=profile(state,prof0.profileId);const extraction=X.extractDocument(doc,{profiles:state.profiles,existingDocs:existing,existingStacks:existingStackIndex(state),now:now(state),tolerancePct:state.settings.tolerancePct,reviewedCount:prof.reviewedDocuments});
  const rec={id:doc.id,sender:doc.sender,senderName:doc.senderName,subject:doc.subject,receivedAt:doc.receivedAt||now(state),storedAt:now(state),attachments:doc.attachments,note:doc.note||null,sample:doc.sample||null,scenario:doc.scenario||null,source:opts.source||'email',
    profileId:extraction.profileId,partyId:extraction.partyId,contentHash:extraction.contentHash,pages:extraction.pages,extraction,documentNumberNormalized:extraction.orders[0]&&extraction.orders[0].documentNumber?extraction.orders[0].documentNumber.normalized:null,
    status:'Received',duplicateOf:extraction.duplicateOf||null,amendmentOf:extraction.amendmentOf||null,orderIds:[],receiptIds:[],reviewedBy:null,reviewedAt:null,decisions:{},
    original:opts.original||null,driverOriginal:!extraction.exceptions.some(e=>e.code==='E-RESTRICTED')};
  if(rec.duplicateOf){rec.status='Duplicate';}
  else if(extraction.tickets.length){for(const t of extraction.tickets){const r=createReceipt(state,t,'email',rec.id);rec.receiptIds.push(r.id);}rec.status=rec.receiptIds.every(id=>state.receipts[id].matchState==='Matched')?'Ready':'NeedsReview';}
  else if(extraction.orders.length)rec.status='NeedsReview';
  else rec.status=extraction.exceptions.some(e=>e.severity==='block')?'Failed':'NeedsReview';
  state.documents[rec.id]=rec;audit(state,opts.by||'system','document.received',rec.id,null,{status:rec.status,hash:rec.contentHash});
  return rec;
}
function existingStackIndex(state){return Object.values(state.stacks).map(s=>{const o=state.orders[s.orderId];return {key:(o?o.profileId:'')+'|'+[s.refs.hieb,s.refs.los,s.refs.polter].join('/'),orderId:s.orderId,orderDocNo:o?o.documentNumberNormalized:null};});}
/* "Freigeben": the dispatcher's decisions turn the proposal into live records. decisions = {fields:{key:value}, lines:{tempKey:{accept:true|false, location:{lat,lon,method,note}}}, destinationId, note} */
function reviewDocument(state,docId,decisions={},by='U-DISPO'){
  const rec=state.documents[docId];if(!rec)throw new Error('document '+docId);if(rec.status==='Duplicate')throw new Error('Duplikat kann nicht freigegeben werden');
  const prop=rec.extraction.orders[0];if(!prop)throw new Error('kein Auftrag im Dokument');
  const prof=profile(state,rec.profileId);
  const header=proposedHeader(state,rec,prop,decisions);
  let order,changes=null;
  if(rec.amendmentOf&&state.documents[rec.amendmentOf]&&state.documents[rec.amendmentOf].orderIds[0]){
    order=state.orders[state.documents[rec.amendmentOf].orderIds[0]];changes=applyAmendment(state,order,rec,prop,header,decisions,by);
  } else {
    order=Object.assign({id:nextId(state,'order'),createdAt:now(state),status:'Open',versions:[],documentIds:[rec.id],profileId:rec.profileId,customerId:prof.partyId,carrierId:state.carrierId,stackKeys:[],reportSentAt:null,resolved:{}},header);
    order.versions.push({n:1,docId:rec.id,at:now(state),diff:null});state.orders[order.id]=order;
    for(const s of prop.stacks){const d=(decisions.lines||{})[s.tempKey]||{};if(d.accept===false)continue;createStack(state,order,rec,s,d,by);}
  }
  rec.status='Ready';rec.reviewedBy=by;rec.reviewedAt=now(state);rec.decisions=decisions;if(!rec.orderIds.includes(order.id))rec.orderIds.push(order.id);
  prof.reviewedDocuments=(prof.reviewedDocuments||0)+1;learnProfile(prof,rec,decisions);
  deriveOrderStatus(state,order.id);audit(state,by,'document.released',rec.id,null,{orderId:order.id,changes});
  return {order,changes};
}
function proposedHeader(state,rec,prop,decisions){
  const f=k=>prop[k]&&prop[k].value?prop[k].value:null;const fields=decisions.fields||{};const v=(k,fallback)=>fields[k]!==undefined?fields[k]:fallback;
  const destName=v('destination',f('destination'));const destParty=decisions.destinationId?party(state,decisions.destinationId):partyByName(state,destName);
  return {documentType:v('documentType',f('documentType')),documentNumber:v('documentNumber',f('documentNumber')),documentNumberNormalized:prop.documentNumber?prop.documentNumber.normalized:null,
    customerRef:{partieNo:v('partieNo',prop.references.partieNo&&prop.references.partieNo.value||null),kaufNo:v('kaufNo',prop.references.kaufNo&&prop.references.kaufNo.value||null),polterNo:prop.references.polterNo&&prop.references.polterNo.value||null,other:prop.references.other.map(x=>({label:x.label,value:x.value}))},
    issuer:v('issuer',f('issuer')),carrier:v('carrier',f('carrier')),destination:destName||null,destinationPrinted:f('destination'),destinationId:destParty?destParty.id:null,destinationConfirmed:!!(decisions.destinationId||fields.destination),pickupAddress:f('pickupAddress'),kind:prop.kind,
    window:{from:v('windowFrom',prop.window.from),to:v('windowTo',prop.window.to),raw:prop.window.raw},measurementBasis:f('measurementBasis'),assortmentHeader:f('assortmentHeader'),certification:f('certification'),priority:f('priority'),
    restricted:{freightRate:prop.restricted.freightRate?prop.restricted.freightRate.value:null,paymentTerms:prop.restricted.paymentTerms?prop.restricted.paymentTerms.value:null},
    contacts:prop.contacts.map(c=>({role:c.label,value:c.value})),remarks:prop.remarks.filter(r=>r.value).map(r=>({label:r.label,value:r.value})),instructions:prop.instructions.map(i=>({text:i.value,restricted:!!i.restricted,page:i.page,line:i.line})),
    summaries:prop.summaries,mapPages:prop.mapPages,quantityTotal:prop.quantityTotal?prop.quantityTotal.value:null,note:decisions.note||null};
}
function stackKeyFor(order,s){return order.id+'/'+s.tempKey;}
function createStack(state,order,rec,s,d,by){
  const key=stackKeyFor(order,s);
  const st={key,orderId:order.id,docId:rec.id,kind:s.kind,refs:Object.assign({},s.refs),tempKey:s.tempKey,
    timber:{species:s.timber.species.value,assortment:s.timber.assortment.value,lengthM:s.timber.lengthM.value,grade:s.timber.grade.value,raw:[s.timber.species.raw,s.timber.assortment.raw,s.timber.lengthM.raw,s.timber.grade.raw].filter(Boolean).join(' · ')},
    planned:{qty:d.qty!==undefined?d.qty:s.planned.value,unit:d.unit||s.planned.unit,raw:s.planned.raw,derivedFromTotal:!!s.planned.derivedFromTotal},pieces:{value:s.pieces.value,raw:s.pieces.raw,confirmed:false},breakdown:s.breakdown,
    location:{raw:[s.coords.xRaw,s.coords.yRaw].filter(Boolean).join(' / ')||null,format:s.coords.parsed?s.coords.parsed.format:null,crs:s.coords.parsed?s.coords.parsed.crs:null,parsed:s.coords.parsed?{ok:s.coords.parsed.ok,lat:s.coords.parsed.lat,lon:s.coords.parsed.lon,verdicts:s.coords.parsed.verdicts,suggestion:s.coords.parsed.suggestion}:null,address:s.coords.address||null,status:'needed'},
    confirmed:null,progress:'Available',blocked:null,problem:null,publication:{scope:'none',targets:[]},sourceRef:{docId:rec.id,page:s.page,line:s.line},createdAt:now(state),resolved:false,eudrRef:null,photos:[]};
  if(s.kind==='industrial'&&s.coords.address){const pickup=state.parties.find(p=>(p.roles||[]).includes('pickupSite')&&s.coords.address.includes(p.name));st.location.status='address';if(pickup){st.confirmed={lat:pickup.lat,lon:pickup.lon,method:'address',by,at:now(state),note:'Werksadresse (industrielle Abholung)'};st.location.status='confirmed';}}
  else if(s.coords.parsed&&s.coords.parsed.ok){st.location.status='proposed';}
  if(d.location){confirmLocation(state,key,Object.assign({by},d.location),st);}
  state.stacks[key]=st;order.stackKeys.push(key);
  addLedger(state,{basis:'ordered',qty:st.planned.qty,unit:st.planned.unit,method:order.measurementBasis||null,scope:{orderId:order.id,stackKey:key},source:{docId:rec.id,page:s.page,line:s.line},confidence:s.planned.confidence,raw:st.planned.raw});
  return st;
}
function learnProfile(prof,rec,decisions){const f=decisions.fields||{};if(f.destination&&!prof.learned)prof.learned={};if(decisions.learnUnit)prof.units.quantity=decisions.learnUnit;prof.lastReviewedAt=rec.reviewedAt;}
/* Amendment: proposed version vs live order. Pickups, clearance and allocations survive; removed stacks with field work become conflicts. */
function diffOrders(state,order,prop){
  const header=[];const cmp=(field,before,after)=>{if((before||null)!==(after||null))header.push({field,before:before||null,after:after||null});};
  const f=k=>prop[k]&&prop[k].value?prop[k].value:null;
  cmp('Abfuhrbeginn',order.window.from,prop.window.from);cmp('Abfuhrende',order.window.to,prop.window.to);cmp('Zielwerk (gedruckt)',order.destinationPrinted,f('destination'));cmp('Sorte',order.assortmentHeader,f('assortmentHeader'));cmp('Bemerkung',(order.remarks.find(r=>/Bemerkung/.test(r.label))||{}).value,(prop.remarks.find(r=>/Bemerkung/.test(r.label))||{}).value);
  const live=order.stackKeys.map(k=>state.stacks[k]);const added=[],changed=[],removed=[];
  for(const s of prop.stacks){const cur=live.find(x=>x.tempKey===s.tempKey);if(!cur){added.push(s);continue;}const ch=[];if((cur.planned.qty??null)!==(s.planned.value??null))ch.push({field:'Menge',before:U.formatQty(cur.planned.qty,cur.planned.unit),after:U.formatQty(s.planned.value,s.planned.unit)});if((cur.timber.lengthM??null)!==(s.timber.lengthM.value??null))ch.push({field:'Länge',before:cur.timber.lengthM,after:s.timber.lengthM.value});if(ch.length)changed.push({key:cur.key,tempKey:cur.tempKey,changes:ch,proposal:s});}
  for(const cur of live)if(!prop.stacks.some(s=>s.tempKey===cur.tempKey))removed.push(cur);
  return {header,added,changed,removed};
}
function applyAmendment(state,order,rec,prop,header,decisions,by){
  const diff=diffOrders(state,order,prop);const before=structuredClone({window:order.window,destination:order.destination});
  order.window=header.window;order.assortmentHeader=header.assortmentHeader;order.remarks=header.remarks;order.instructions=header.instructions;order.summaries=header.summaries;order.documentIds.push(rec.id);
  if(header.destination&&!order.destinationConfirmed){order.destination=header.destination;order.destinationId=header.destinationId;}
  for(const s of diff.added){const d=(decisions.lines||{})[s.tempKey]||{};if(d.accept!==false)createStack(state,order,rec,s,d,by);}
  for(const c of diff.changed){const st=state.stacks[c.key];const prev=structuredClone(st.planned);st.planned={qty:c.proposal.planned.value,unit:c.proposal.planned.unit,raw:c.proposal.planned.raw};st.timber.lengthM=c.proposal.timber.lengthM.value;st.versionNote=`geändert mit ${rec.id}`;addLedger(state,{basis:'ordered',qty:st.planned.qty,unit:st.planned.unit,scope:{orderId:order.id,stackKey:st.key},source:{docId:rec.id,page:c.proposal.page,line:c.proposal.line},confidence:c.proposal.planned.confidence,raw:st.planned.raw,supersedes:prev});audit(state,by,'stack.amended',st.key,prev,st.planned);}
  for(const st of diff.removed){const work=state.events.some(e=>e.stackKey===st.key&&['pickup','cleared'].includes(e.kind));if(work){conflict(state,'revisionDuringWork',{stackKey:st.key,docId:rec.id},`Polter ${st.tempKey} fehlt in der geänderten Fassung, hat aber erfasste Abholungen/Räumung — Disposition entscheidet`);st.versionNote=`in ${rec.id} nicht mehr enthalten (Feldarbeit vorhanden)`;}else{st.progress='Blocked';st.blocked={reason:'in geänderter Fassung entfallen',docId:rec.id};st.versionNote=`in ${rec.id} entfallen`;}}
  const v={n:order.versions.length+1,docId:rec.id,at:now(state),diff:{header:diff.header,added:diff.added.map(s=>s.tempKey),changed:diff.changed.map(c=>({tempKey:c.tempKey,changes:c.changes})),removed:diff.removed.map(s=>s.tempKey)}};
  order.versions.push(v);const prevDoc=state.documents[rec.amendmentOf];if(prevDoc)prevDoc.status='Superseded';audit(state,by,'order.amended',order.id,before,{window:order.window,version:v.n});
  return v.diff;
}
/* ---------- Locations ---------- */
function confirmLocation(state,key,loc,stackObj){
  const st=stackObj||state.stacks[key];if(!st)throw new Error('stack '+key);
  if(loc.method==='address'&&st.kind!=='industrial')throw new Error('Eine Adresse ist kein Abholort für Waldpolter (E-ADDR)');
  let lat=loc.lat,lon=loc.lon;
  if(loc.method==='printed'){if(!st.location.parsed||!st.location.parsed.ok)throw new Error('gedruckte Koordinate ist nicht plausibel');lat=st.location.parsed.lat;lon=st.location.parsed.lon;}
  if(loc.method==='suggestion'){const sg=st.location.parsed&&st.location.parsed.suggestion;if(!sg)throw new Error('kein Vorschlag vorhanden');lat=sg.lat;lon=sg.lon;}
  if(lat==null||lon==null||!C.inGermany(lat,lon))throw new Error('Lage fehlt oder liegt außerhalb Deutschlands');
  const before=st.confirmed;st.confirmed={lat,lon,method:loc.method,by:loc.by||'U-DISPO',at:now(state),note:loc.note||null,fromPage:loc.fromPage||null};st.location.status='confirmed';
  audit(state,loc.by||'U-DISPO','stack.locationConfirmed',key,before,st.confirmed);return st;
}
function clearLocation(state,key,by){const st=state.stacks[key];const before=st.confirmed;st.confirmed=null;st.location.status=st.location.parsed&&st.location.parsed.ok?'proposed':'needed';audit(state,by,'stack.locationCleared',key,before,null);}
/* ---------- Publication and allocation ---------- */
function publish(state,{stackKeys,scope,targets=[],by}){
  const done=[];for(const k of stackKeys){const st=state.stacks[k];if(!st)continue;if(st.location.status!=='confirmed')throw new Error(`Polter ${st.tempKey}: Standort nicht bestätigt — keine Veröffentlichung`);if(st.progress==='Blocked')throw new Error(`Polter ${st.tempKey} ist blockiert`);const before=structuredClone(st.publication);st.publication={scope,targets:scope==='fleet'?[]:[...targets],at:now(state),by};done.push(k);audit(state,by,'stack.published',k,before,st.publication);}
  return done;
}
function allocate(state,{stackKey,driverId,truckId,share,by}){
  const st=state.stacks[stackKey];if(!st)throw new Error('stack');if(st.location.status!=='confirmed')throw new Error('Standort nicht bestätigt');
  const u=user(state,driverId);if(!u||!u.roles.includes('driver'))throw new Error('kein Fahrer');
  const a={id:nextId(state,'alloc'),stackKey,orderId:st.orderId,driverId,truckId:truckId||u.truckId||null,share:share||{kind:'whole'},state:'Proposed',by,at:now(state),deliveredToDriver:deliverable(state,driverId),history:[]};
  state.allocations[a.id]=a;audit(state,by,'allocation.created',a.id,null,{stackKey,driverId,share:a.share});return a;
}
/* The demo simulates one device: the offline toggle belongs to the current persona. A change reaches a driver at once unless that driver's device is the one offline. */
function deliverable(state,driverId){return !(state.ui.online===false&&state.ui.persona===driverId)&&!(state.ui.offlineDrivers||[]).includes(driverId);}
function activeAllocations(state,stackKey){return Object.values(state.allocations).filter(a=>a.stackKey===stackKey&&['Accepted','Reserved'].includes(a.state));}
function acceptAllocation(state,allocId,driverId,opts={}){
  const a=state.allocations[allocId];if(!a)throw new Error('allocation');if(a.driverId!==driverId)throw new Error('nicht diesem Fahrer zugeteilt');
  const others=activeAllocations(state,a.stackKey).filter(o=>o.id!==a.id&&o.share.kind==='whole'||(o.share.kind!=='whole'&&a.share.kind==='whole'));
  if(others.length){const c=conflict(state,'doubleClaim',{stackKey:a.stackKey,allocations:[a.id,...others.map(o=>o.id)]},`Polter ${state.stacks[a.stackKey].tempKey}: ${others.length+1} Fahrer beanspruchen dieselbe Zuteilung — Disposition entscheidet`);a.state='Proposed';a.history.push({at:now(state),event:'accept-rejected',conflict:c.id});return {ok:false,conflict:c};}
  a.state='Accepted';a.acceptedAt=now(state);a.history.push({at:now(state),event:'accepted'});audit(state,driverId,'allocation.accepted',a.id,null,null);return {ok:true,allocation:a};
}
function reserve(state,{stackKey,driverId,truckId,by}){
  if(state.ui.online===false)throw new Error('Verbindung nötig: Reservierung geteilter Arbeit nur online');
  const st=state.stacks[stackKey];if(!visibleTo(state,st,driverId))throw new Error('nicht sichtbar');
  if(activeAllocations(state,stackKey).some(a=>a.share.kind==='whole'))throw new Error('bereits reserviert/zugeteilt');
  const u=user(state,driverId);const a={id:nextId(state,'alloc'),stackKey,orderId:st.orderId,driverId,truckId:truckId||u.truckId,share:{kind:'whole'},state:'Reserved',by:driverId,at:now(state),deliveredToDriver:true,history:[{at:now(state),event:'reserved'}]};
  state.allocations[a.id]=a;audit(state,driverId,'allocation.reserved',a.id,null,{stackKey});return a;
}
function withdrawAllocation(state,allocId,by,reassignTo){
  const a=state.allocations[allocId];if(!a)throw new Error('allocation');const before=a.state;a.state=reassignTo?'Reassigned':'Withdrawn';a.withdrawnAt=now(state);a.deliveredToDriver=deliverable(state,a.driverId);a.history.push({at:now(state),event:a.state,by});
  audit(state,by,'allocation.'+a.state.toLowerCase(),a.id,before,a.state);let next=null;if(reassignTo){next=allocate(state,{stackKey:a.stackKey,driverId:reassignTo.driverId,truckId:reassignTo.truckId,share:a.share,by});}
  return {allocation:a,next};
}
function visibleTo(state,st,driverId){const u=user(state,driverId);if(!u)return false;if(Object.values(state.allocations).some(a=>a.stackKey===st.key&&a.driverId===driverId&&['Proposed','Accepted','Reserved'].includes(a.state)))return true;const p=st.publication;if(p.scope==='fleet')return true;if(p.scope==='group')return p.targets.some(g=>(state.groups.find(x=>x.id===g)||{members:[]}).members.includes(driverId));if(p.scope==='named')return p.targets.includes(driverId);return false;}
/* A driver's work: stacks allocated to them (open or already done) plus fleet-visible stacks nobody has taken. A finished
   allocation keeps the stack in the driver's own list instead of re-offering it as shared work. */
function visibleWorkFor(state,driverId){const mine=st=>Object.values(state.allocations).filter(a=>a.stackKey===st.key&&a.driverId===driverId&&['Proposed','Accepted','Reserved','Done'].includes(a.state)).sort((a,b)=>(a.state==='Done')-(b.state==='Done'))[0]||null;
  return Object.values(state.stacks).filter(st=>st.progress!=='Blocked'&&(visibleTo(state,st,driverId)||mine(st))).map(st=>{const a=mine(st);return {stack:st,order:state.orders[st.orderId],allocation:a,shared:!a};});}
/* ---------- Driver events (idempotent) ---------- */
function applyEvent(state,ev){
  if(!ev.id)throw new Error('event id required');if(state.eventIds[ev.id])return {duplicate:true,event:state.events.find(e=>e.id===ev.id)};
  const e=Object.assign({},ev,{receivedTime:now(state),sync:'acked',conflicts:[]});state.eventIds[e.id]=true;state.events.push(e);
  const st=e.stackKey?state.stacks[e.stackKey]:null;
  if(Array.isArray(e.photos)&&e.photos.length){const target=st||(e.loadId?state.loads[e.loadId]:null);if(target){target.photos=target.photos||[];for(const url of e.photos)target.photos.push({url,by:e.driverId,at:e.eventTime,kind:e.kind,eventId:e.id});}}
  switch(e.kind){
    case 'pickup':{if(!st)throw new Error('stack');const alloc=Object.values(state.allocations).find(a=>a.stackKey===st.key&&a.driverId===e.driverId);
      if(alloc&&['Withdrawn','Reassigned'].includes(alloc.state)){const c=conflict(state,'pickupAfterWithdrawal',{eventId:e.id,stackKey:st.key,allocationId:alloc.id},`Abholung an Polter ${st.tempKey} durch ${user(state,e.driverId)?.name} nach Entzug der Zuteilung (${alloc.state}) — Disposition prüft`);e.conflicts.push(c.id);}
      if(st.progress==='Cleared'){const c=conflict(state,'pickupAfterClearance',{eventId:e.id,stackKey:st.key},`Abholung an Polter ${st.tempKey} nach gemeldeter Räumung — widersprüchlich`);e.conflicts.push(c.id);}
      let load=e.loadId?state.loads[e.loadId]:null;if(!load&&!e.newLoad)load=openLoadFor(state,e.driverId,e.truckId,st.orderId);if(!load){load=createLoad(state,{orderId:st.orderId,truckId:e.truckId,driverId:e.driverId,destinationId:state.orders[st.orderId].destinationId,at:e.eventTime});}e.loadId=load.id;
      load.lines.push({stackKey:st.key,qty:e.qty??null,unit:e.unit||st.planned.unit||null,pieces:e.pieces??null,eventId:e.id,basis:'driverEstimate'});
      if(e.qty!=null)addLedger(state,{basis:'driverEstimate',qty:e.qty,unit:e.unit||st.planned.unit,scope:{orderId:st.orderId,stackKey:st.key,loadId:load.id},source:{eventId:e.id},confidence:0.6,raw:e.qtyRaw||null});
      if(st.progress!=='Cleared'){st.progress='PartlyCollected';}
      break;}
    case 'cleared':{if(!st)throw new Error('stack');if(st.progress==='Cleared'&&st.clearedBy&&st.clearedBy!==e.driverId){const c=conflict(state,'clearedTwice',{eventId:e.id,stackKey:st.key},`Polter ${st.tempKey} zweimal als geräumt gemeldet (${user(state,st.clearedBy)?.name}, ${user(state,e.driverId)?.name})`);e.conflicts.push(c.id);}
      st.progress='Cleared';st.clearedAt=e.eventTime;st.clearedBy=e.driverId;st.clearedScope='dieser Auftrag/diese Anweisung';
      for(const a of Object.values(state.allocations))if(a.stackKey===st.key&&['Accepted','Reserved','Proposed'].includes(a.state)){a.state='Done';}
      deriveOrderStatus(state,st.orderId);break;}
    case 'problem':{if(!st)throw new Error('stack');st.problem={kind:e.problemKind,note:e.note||null,photo:!!e.photo,by:e.driverId,at:e.eventTime,eventId:e.id};break;}
    case 'note_issued':{const load=state.loads[e.loadId];if(!load)throw new Error('load');if(e.destinationId)load.destinationId=e.destinationId;const note=issueDeliveryNote(state,load,e);e.noteId=note.id;break;}
    case 'arrived':{const load=state.loads[e.loadId];if(!load)throw new Error('load');if(load.state==='Planned')throw new Error('Lieferschein vor Ankunft ausstellen');load.state='Arrived';load.arrivedAt=e.eventTime;break;}
    case 'unloaded':{const load=state.loads[e.loadId];if(!load)throw new Error('load');load.unloadedAt=e.eventTime;load.acceptance=e.acceptance||'accepted';load.acceptanceReason=e.reason||null;
      if(e.acceptance==='rejected')load.state='Rejected';else if(e.acceptance==='diverted'){load.state='Diverted';if(e.newDestinationId){load.divertedFrom=load.destinationId;load.destinationId=e.newDestinationId;}}else if(e.acceptance==='partial')load.state='Disputed';else load.state='Unloaded';
      deriveOrderStatus(state,load.orderId);break;}
    case 'ticket_photo':{const load=state.loads[e.loadId];if(!load)throw new Error('load');const r=createReceipt(state,{ticketNo:e.ticketNo,millName:party(state,load.destinationId)?.name||'',vehicleReg:truck(state,load.truckId)?.reg||'',arrivedAt:load.arrivedAt,deliveryNoteRef:load.deliveryNoteId?state.notes[load.deliveryNoteId].number:'',weighbridge:e.weighbridge||null,measuredLines:e.measuredLines||[],acceptance:'accepted'},'photo',null,load.id);e.receiptId=r.id;break;}
    default:throw new Error('unknown event kind '+e.kind);
  }
  return {duplicate:false,event:e};
}
function openLoadFor(state,driverId,truckId,orderId){return Object.values(state.loads).find(l=>l.driverId===driverId&&l.state==='Planned'&&l.orderId===orderId&&(!truckId||!l.truckId||l.truckId===truckId))||null;}
function createLoad(state,{orderId,truckId,driverId,destinationId,at}){const l={id:nextId(state,'load'),orderId,truckId:truckId||null,trailer:null,driverId,destinationId:destinationId||null,state:'Planned',createdAt:at||now(state),loadedAt:null,arrivedAt:null,unloadedAt:null,lines:[],deliveryNoteId:null,receiptIds:[],acceptance:null};state.loads[l.id]=l;return l;}
function issueDeliveryNote(state,load,e){
  const order=state.orders[load.orderId];const lines=(e.declaredLines&&e.declaredLines.length?e.declaredLines:load.lines.map(l=>({stackKey:l.stackKey,qty:l.qty,unit:l.unit,pieces:l.pieces}))).map(l=>Object.assign({},l,{stack:state.stacks[l.stackKey]?state.stacks[l.stackKey].tempKey:l.stackKey}));
  const note={id:nextId(state,'note'),loadId:load.id,orderId:order.id,number:null,customerNumber:e.customerNoteNo||null,recipientNumber:null,issuedAt:e.eventTime,form:e.form||'generated',vehicleReg:truck(state,load.truckId)?.reg||null,trailer:load.trailer,driverId:e.driverId,destinationId:load.destinationId,destination:order.destination,customer:order.issuer,customerRef:order.customerRef,declaredLines:lines,species:[...new Set(lines.map(l=>state.stacks[l.stackKey]?.timber.species).filter(Boolean))].join(', ')||null,assortment:order.assortmentHeader||[...new Set(lines.map(l=>state.stacks[l.stackKey]?.timber.assortment).filter(Boolean))].join(', ')||null,signature:e.signature||null,transportComplete:!!e.transportComplete,eudrRef:e.eudrRef||null};
  note.number=note.id;state.notes[note.id]=note;load.deliveryNoteId=note.id;load.state='Loaded';load.loadedAt=e.eventTime;
  for(const l of lines)if(l.qty!=null)addLedger(state,{basis:'deliveryNote',qty:l.qty,unit:l.unit,scope:{orderId:order.id,stackKey:l.stackKey,loadId:load.id,noteId:note.id},source:{eventId:e.id},confidence:0.7,raw:null});
  return note;
}
/* ---------- Mill receipts ---------- */
function createReceipt(state,t,source,docId,loadId){
  const mill=partyByName(state,t.millName);const r={id:nextId(state,'receipt'),ticketNo:t.ticketNo||null,millId:mill?mill.id:null,millName:t.millName||null,arrivedAt:t.arrivedAt||null,unloadedAt:t.unloadedAt||null,vehicleReg:t.vehicleReg||null,referencedDeliveryNotes:t.deliveryNoteRef?[t.deliveryNoteRef]:[],weighbridge:t.weighbridge||null,measuredLines:t.measuredLines||[],deductions:t.deductions||null,acceptance:t.acceptance||'accepted',source,docId:docId||null,loadId:null,matchState:'MatchNeeded',matchMethod:null,candidates:[],createdAt:now(state),orderRef:t.orderRef||null};
  state.receipts[r.id]=r;if(loadId){attachReceipt(state,r,state.loads[loadId],'driver-photo');}else matchReceipt(state,r.id);return r;
}
function matchReceipt(state,receiptId){
  const r=state.receipts[receiptId];const loads=Object.values(state.loads);r.candidates=[];
  const byNote=r.referencedDeliveryNotes.map(n=>Object.values(state.notes).find(x=>x.number===n||x.customerNumber===n)).filter(Boolean);
  if(byNote.length===1){attachReceipt(state,r,state.loads[byNote[0].loadId],'delivery-note');return r;}
  if(byNote.length>1){r.candidates=byNote.map(n=>n.loadId);r.matchState='MatchNeeded';return r;}
  if(r.vehicleReg&&r.arrivedAt){const tr=state.trucks.find(t=>t.reg.replace(/\s/g,'')===r.vehicleReg.replace(/\s/g,''));
    if(tr){const ta=new Date(r.arrivedAt).getTime();const cands=loads.filter(l=>l.truckId===tr.id&&(!r.millId||l.destinationId===r.millId)&&['Loaded','Arrived','Unloaded','Disputed','Diverted'].includes(l.state)).filter(l=>{const ref=l.arrivedAt||l.loadedAt;return ref&&Math.abs(new Date(ref).getTime()-ta)<=4*3600*1000;});
      if(cands.length===1){attachReceipt(state,r,cands[0],'vehicle-window');return r;}r.candidates=cands.map(l=>l.id);}}
  r.matchState='MatchNeeded';return r;
}
function attachReceipt(state,r,load,method){
  if(!load)return;r.loadId=load.id;r.matchState='Matched';r.matchMethod=method;if(!load.receiptIds.includes(r.id))load.receiptIds.push(r.id);if(['Unloaded','Arrived','Loaded','Disputed','Diverted'].includes(load.state))load.state='Measured';if(r.unloadedAt&&!load.unloadedAt)load.unloadedAt=r.unloadedAt;
  const order=state.orders[load.orderId];
  for(const ml of r.measuredLines)addLedger(state,{basis:'millMeasured',qty:ml.qty.value,unit:ml.qty.unit,method:ml.method||'Werksmaß',scope:{orderId:load.orderId,loadId:load.id,receiptId:r.id},source:{docId:r.docId,page:ml.page,line:ml.line},confidence:0.95,raw:ml.qty.raw});
  if(r.weighbridge&&r.weighbridge.net)addLedger(state,{basis:'weighbridgeNet',qty:r.weighbridge.net.value,unit:r.weighbridge.net.unit,method:'Gewicht',scope:{orderId:load.orderId,loadId:load.id,receiptId:r.id},source:{docId:r.docId},confidence:0.95,raw:r.weighbridge.net.raw});
  if(order)deriveOrderStatus(state,order.id);if(r.docId&&state.documents[r.docId]){const d=state.documents[r.docId];if(d.receiptIds.every(id=>state.receipts[id].matchState==='Matched'))d.status='Ready';}
}
function assignReceipt(state,receiptId,loadId,by){const r=state.receipts[receiptId];const before=r.loadId;attachReceipt(state,r,state.loads[loadId],'manual');audit(state,by,'receipt.assigned',receiptId,before,loadId);return r;}
/* ---------- Ledger and reconciliation ---------- */
function addLedger(state,entry){const e=Object.assign({id:'Q-'+pad(state.ledger.length+1,5),createdAt:now(state),derived:null},entry);state.ledger.push(e);return e;}
function ledgerFor(state,scope){return state.ledger.filter(q=>Object.entries(scope).every(([k,v])=>q.scope[k]===v));}
function sumBasis(entries,basis,unit){const xs=entries.filter(q=>q.basis===basis&&q.qty!=null&&(!unit||q.unit===unit));if(!xs.length)return null;const units=[...new Set(xs.map(q=>q.unit))];return {value:Math.round(xs.reduce((a,q)=>a+q.qty,0)*1000)/1000,unit:units.length===1?units[0]:null,entries:xs.map(q=>q.id),mixed:units.length>1};}
function compareQty(a,b,targetUnit){if(!a||!b||a.value==null||b.value==null)return null;const da=a.unit===targetUnit?{value:a.value,unit:a.unit}:U.derive({value:a.value,unit:a.unit},targetUnit),db=b.unit===targetUnit?{value:b.value,unit:b.unit}:U.derive({value:b.value,unit:b.unit},targetUnit);if(!da||!db)return {comparable:false,reason:'keine Umrechnung hinterlegt'};return {comparable:true,unit:targetUnit,a:da,b:db,diff:Math.round((db.value-da.value)*1000)/1000,pct:da.value?Math.round((db.value-da.value)/da.value*1000)/10:null,derived:[da.factorId,db.factorId].filter(Boolean)};}
function reconcileLoad(state,loadId){
  const load=state.loads[loadId];const es=ledgerFor(state,{loadId});const target=load.lines.find(l=>l.unit)?.unit||state.stacks[load.lines[0]?.stackKey]?.planned.unit||'fm';
  const est=sumBasis(es,'driverEstimate'),note=sumBasis(es,'deliveryNote'),mill=sumBasis(es,'millMeasured'),weigh=sumBasis(es,'weighbridgeNet');
  const out={loadId,unit:target,driverEstimate:est,deliveryNote:note,millMeasured:mill,weighbridgeNet:weigh,comparisons:{},exceptions:[]};
  const tol=state.settings.tolerancePct;
  if(note&&mill){out.comparisons.noteVsMill=compareQty(note,mill,target);}if(est&&note)out.comparisons.estimateVsNote=compareQty(est,note,target);if(note&&weigh)out.comparisons.noteVsWeight=compareQty(note,weigh,target);if(est&&mill&&!note)out.comparisons.estimateVsMill=compareQty(est,mill,target);
  for(const [k,c] of Object.entries(out.comparisons))if(c&&c.comparable&&c.pct!=null&&Math.abs(c.pct)>tol)out.exceptions.push({kind:k,diff:c.diff,pct:c.pct,unit:c.unit,derived:c.derived});
  return out;
}
function reconcileOrder(state,orderId){
  const order=state.orders[orderId];const rows=[];const tol=state.settings.tolerancePct;
  for(const k of order.stackKeys){const st=state.stacks[k];const es=ledgerFor(state,{stackKey:k});const ordered=sumBasis(es.filter(q=>!q.supersedes||true),'ordered');const latestOrdered=es.filter(q=>q.basis==='ordered').pop();const collected=sumBasis(es,'driverEstimate'),declared=sumBasis(es,'deliveryNote');
    const loads=Object.values(state.loads).filter(l=>l.lines.some(x=>x.stackKey===k));const receipts=loads.flatMap(l=>l.receiptIds.map(id=>state.receipts[id]));
    const row={stackKey:k,tempKey:st.tempKey,progress:st.progress,ordered:latestOrdered?{value:latestOrdered.qty,unit:latestOrdered.unit}:null,collected,declared,loads:loads.map(l=>l.id),receipts:receipts.map(r=>r.id),reasons:[],deviation:null};
    if(st.problem)row.reasons.push(`Problem: ${st.problem.kind}${st.problem.note?' — '+st.problem.note:''}`);for(const c of state.conflicts.filter(c=>c.refs&&c.refs.stackKey===k&&!c.resolved))row.reasons.push('Konflikt: '+c.message);
    if(row.ordered&&collected&&st.progress==='Cleared'){const cmp=compareQty(row.ordered,collected,row.ordered.unit);if(cmp&&cmp.comparable){row.deviation=cmp;if(cmp.pct!=null&&Math.abs(cmp.pct)>tol)row.reasons.push(`Abweichung bestellt/abgeholt ${cmp.pct} %`);}}
    rows.push(row);}
  const loads=Object.values(state.loads).filter(l=>l.orderId===orderId);const received=sumBasis(ledgerFor(state,{orderId}),'millMeasured'),weight=sumBasis(ledgerFor(state,{orderId}),'weighbridgeNet');
  const orderedTotal=U.sum(rows.map(r=>r.ordered)),collectedTotal=U.sum(rows.map(r=>r.collected)),declaredTotal=U.sum(loads.map(l=>sumBasis(ledgerFor(state,{loadId:l.id}),'deliveryNote')));
  return {orderId,status:order.status,rows,totals:{ordered:orderedTotal,collected:collectedTotal,declared:declaredTotal,received,weight},loads:loads.map(l=>reconcileLoad(state,l.id))};
}
function reconcileQuotas(state){return state.quotas.map(q=>{const rec=Object.values(state.receipts).filter(r=>r.matchState==='Matched'&&r.millId===q.millId&&state.orders[state.loads[r.loadId]?.orderId]?.customerId===q.customerId);const loads=rec.length;const inUnit=q.unit==='ldg'?{value:loads,unit:'ldg'}:sumBasis(state.ledger.filter(l=>rec.some(r=>r.id===l.scope.receiptId)),'millMeasured',q.unit);return {quota:q,received:inUnit,pct:inUnit&&q.qty?Math.round(inUnit.value/q.qty*100):0,warn:inUnit?inUnit.value/q.qty>=0.9:false};});}
/* ---------- Order status ---------- */
function deriveOrderStatus(state,orderId){
  const o=state.orders[orderId];if(!o||['Paused','Cancelled','Superseded'].includes(o.status))return o;const stacks=o.stackKeys.map(k=>state.stacks[k]).filter(s=>s.progress!=='Blocked'||!s.blocked||s.blocked.reason!=='in geänderter Fassung entfallen');
  const collection=stacks.length>0&&stacks.every(s=>s.progress==='Cleared'||s.resolved);const loads=Object.values(state.loads).filter(l=>l.orderId===orderId);
  const delivery=collection&&loads.length>0&&loads.every(l=>['Unloaded','Measured','Reconciled','Rejected','Diverted'].includes(l.state)||l.resolved);
  const receipts=delivery&&loads.filter(l=>!['Rejected'].includes(l.state)).every(l=>l.receiptIds.length>0);
  const open=state.conflicts.some(c=>!c.resolved&&c.refs&&(c.refs.orderId===orderId||(c.refs.stackKey&&state.stacks[c.refs.stackKey]?.orderId===orderId)));
  const reconciled=receipts&&!open&&loads.every(l=>reconcileLoad(state,l.id).exceptions.length===0||l.reconciledBy);
  const before=o.status;o.status=reconciled?'Reconciled':receipts?'ReceiptsComplete':delivery?'DeliveryComplete':collection?'CollectionComplete':'Open';if(reconciled)loads.forEach(l=>{if(l.state==='Measured')l.state='Reconciled';});
  if(before!==o.status)audit(state,'system','order.status',orderId,before,o.status);return o;
}
function resolveStack(state,key,by,note){const st=state.stacks[key];st.resolved=true;st.resolvedNote=note||null;audit(state,by,'stack.resolved',key,null,note);deriveOrderStatus(state,st.orderId);}
function blockStack(state,key,by,reason,on=true){const st=state.stacks[key];const before=st.progress;if(on){st.blocked={reason,by,at:now(state)};st.prevProgress=st.progress;st.progress='Blocked';}else{st.blocked=null;st.progress=st.prevProgress||'Available';}audit(state,by,on?'stack.blocked':'stack.unblocked',key,before,st.progress);}
function resolveConflict(state,id,by,resolution){const c=state.conflicts.find(x=>x.id===id);c.resolved=true;c.resolution=resolution;c.resolvedBy=by;c.resolvedAt=now(state);audit(state,by,'conflict.resolved',id,null,resolution);const sk=c.refs&&c.refs.stackKey;if(sk&&state.stacks[sk])deriveOrderStatus(state,state.stacks[sk].orderId);}
/* ---------- Reports, export, redaction ---------- */
function collectionReport(state,orderId){
  const o=state.orders[orderId];const loads=Object.values(state.loads).filter(l=>l.orderId===orderId).sort((a,b)=>(a.loadedAt||a.createdAt).localeCompare(b.loadedAt||b.createdAt));
  const rows=loads.map((l,i)=>{const est=sumBasis(ledgerFor(state,{loadId:l.id}),'driverEstimate');const note=l.deliveryNoteId?state.notes[l.deliveryNoteId]:null;return {nr:i+1,loadId:l.id,date:(l.loadedAt||l.createdAt).slice(0,10),vehicle:truck(state,l.truckId)?.reg||'–',estimate:est,pieces:l.lines.reduce((a,x)=>a+(x.pieces||0),0)||null,destination:party(state,l.destinationId)?.name||o.destination||'–',note:note?note.number:null,state:l.state,remark:l.acceptanceReason||(l.state==='Rejected'?'abgelehnt':l.state==='Diverted'?'umgeleitet':'')};});
  const soll=U.sum(o.stackKeys.map(k=>{const s=state.stacks[k];return {value:s.planned.qty,unit:s.planned.unit};}));const summe=U.sum(rows.map(r=>r.estimate));
  const diff=soll.map(s=>{const m=summe.find(x=>x.unit===s.unit);return {unit:s.unit,soll:s.value,summe:m?m.value:0,diff:Math.round(((m?m.value:0)-s.value)*1000)/1000};});
  const reasons=[...new Set(o.stackKeys.flatMap(k=>{const st=state.stacks[k];const r=[];if(st.problem)r.push(`Polter ${st.tempKey}: ${st.problem.kind}${st.problem.note?' — '+st.problem.note:''}`);return r;}).concat(state.conflicts.filter(c=>!c.resolved&&c.refs&&c.refs.stackKey&&state.stacks[c.refs.stackKey]?.orderId===orderId).map(c=>c.message)))];
  const finished=o.status!=='Open'&&o.stackKeys.every(k=>state.stacks[k].progress==='Cleared'||state.stacks[k].resolved)?o.stackKeys.map(k=>state.stacks[k].clearedAt).filter(Boolean).sort().pop()||null:null;
  return {order:o,customer:party(state,o.customerId),carrier:party(state,o.carrierId),rows,soll,summe,diff,reasons,finishedAt:finished,sources:o.documentIds.map(id=>({docId:id,subject:state.documents[id]?.subject,pages:state.documents[id]?.pages.map(p=>p.n)})),history:state.events.filter(e=>o.stackKeys.includes(e.stackKey)||loads.some(l=>l.id===e.loadId)).map(e=>({id:e.id,kind:e.kind,eventTime:e.eventTime,receivedTime:e.receivedTime,by:e.driverId,stack:e.stackKey?state.stacks[e.stackKey]?.tempKey:null,loadId:e.loadId||null})),sentAt:o.reportSentAt||null,kind:finished?'Fertigmeldung':'Abfuhrmeldung'};
}
function markReportSent(state,orderId,by,channel){const o=state.orders[orderId];const before=o.reportSentAt;o.reportSentAt=now(state);o.reportChannel=channel||'manuell';audit(state,by,'report.markedSent',orderId,before,o.reportSentAt);}
function exportOrder(state,orderId){const o=state.orders[orderId];return {schema:'transport-demo-export-1',exportedAt:now(state),order:o,stacks:o.stackKeys.map(k=>state.stacks[k]),allocations:Object.values(state.allocations).filter(a=>a.orderId===orderId),loads:Object.values(state.loads).filter(l=>l.orderId===orderId),deliveryNotes:Object.values(state.notes).filter(n=>n.orderId===orderId),receipts:Object.values(state.receipts).filter(r=>state.loads[r.loadId]?.orderId===orderId),ledger:ledgerFor(state,{orderId}),events:state.events.filter(e=>o.stackKeys.includes(e.stackKey)),sources:o.documentIds.map(id=>{const d=state.documents[id];return {docId:id,subject:d.subject,receivedAt:d.receivedAt,contentHash:d.contentHash,pages:d.pages};}),report:collectionReport(state,orderId),disclaimer:'Demo-Export · nicht automatisch versendet'};}
/* Driver-safe excerpt: restricted lines (rates, terms, conditions) replaced, map and form pages kept, other orders dropped. */
function driverExcerpt(state,docId){
  const d=state.documents[docId];if(!d)return null;const prop=d.extraction.orders[0];const restrictedLines=new Set();
  if(prop){for(const f of [prop.restricted.freightRate,prop.restricted.paymentTerms])if(f)restrictedLines.add(f.page+':'+f.line);for(const i of prop.instructions)if(i.restricted)restrictedLines.add(i.page+':'+i.line);}
  const pages=d.attachments.flatMap(a=>a.pages).map(p=>({n:p.n,kind:p.kind,title:p.title||null,pins:p.pins||null,lines:p.lines.map((l,li)=>restrictedLines.has(p.n+':'+li)?'█ redigiert (kommerzielle Angabe)':l.replace(/\b(\d{1,3}(?:[.,]\d{2})?)\s*(EUR|€)(\s*(pro|\/)\s*\S+)?/gi,'█ redigiert'))}));
  return {docId,subject:d.subject,pages,redactedLines:restrictedLines.size,generatedAt:now(state),note:'Fahrerauszug — geprüft, kommerzielle Angaben geschwärzt'};
}
function setDocumentOriginal(state,docId,meta,by){const d=state.documents[docId];if(!d)throw new Error('document');const before=d.original;d.original=meta?{name:meta.name,size:meta.size,type:meta.type,pages:meta.pages||null,storedAt:meta.storedAt||now(state)}:null;audit(state,by,'document.original',docId,before,d.original);return d;}
function setDriverOriginal(state,docId,allowed,by){const d=state.documents[docId];if(!d)throw new Error('document');const before=d.driverOriginal;d.driverOriginal=!!allowed;audit(state,by,'document.driverOriginal',docId,before,d.driverOriginal);return d;}
function stackPhotos(state,key){const st=state.stacks[key];if(!st)return [];return (st.photos||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));}
function can(stateOrUser,action){const u=stateOrUser&&stateOrUser.roles?stateOrUser:null;if(!u)return false;const r=u.roles;const map={review:'dispatcher',publish:'dispatcher',allocate:'dispatcher',resolve:'dispatcher',match:'dispatcher',report:'dispatcher',admin:'admin',drive:'driver',seeRates:'dispatcher'};return r.includes(map[action])||r.includes('admin')&&action!=='drive';}
const api={INTAKE,STACK,LOAD,ORDER,ALLOC,ELDAT_STATUS,initialState,nextId,audit,party,user,truck,profile,ingestDocument,reviewDocument,diffOrders,confirmLocation,clearLocation,publish,allocate,acceptAllocation,reserve,withdrawAllocation,activeAllocations,openLoadFor,visibleTo,visibleWorkFor,applyEvent,createLoad,createReceipt,matchReceipt,assignReceipt,addLedger,ledgerFor,sumBasis,compareQty,reconcileLoad,reconcileOrder,reconcileQuotas,deriveOrderStatus,resolveStack,blockStack,resolveConflict,collectionReport,markReportSent,exportOrder,driverExcerpt,setDocumentOriginal,setDriverOriginal,stackPhotos,can,existingStackIndex};
(globalThis.TransportCore=globalThis.TransportCore||{}).model=api;
if(typeof module!=='undefined')module.exports=api;
})();
