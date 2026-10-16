/* Holztransport demo · store. One JSON workspace per carrier in localStorage, every mutation through apply(action)
   with an audit trail, driver actions as events with client ids (idempotent replay), an offline queue with
   "Pending sync" until acknowledged, conflicts surfaced instead of last-update-wins (SPEC §8). */
'use strict';
(function(){
const req=(ns,name,path)=>(globalThis[ns]&&globalThis[ns][name])||(typeof require!=='undefined'?require(path):null);
const M=req('TransportCore','model','./model.js'),SAMPLES=req('TransportData','samples','../data/samples.js');
const KEY='transport-demo-v1';
function create(opts={}){
  const storage=opts.storage||(typeof window!=='undefined'&&typeof localStorage!=='undefined'?localStorage:null);const key=opts.key||KEY;const listeners=new Set();
  let state=null;let seqEvent=0;
  let clockValue=null;const clock=opts.clock||(()=>clockValue||new Date().toISOString());
  function fresh(){const s=M.initialState({settings:opts.settings});s.clock=clock;return s;}
  function load(){if(storage){try{const raw=storage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed&&parsed.schema===1){state=parsed;state.clock=clock;return state;}}}catch(e){/* corrupt or unavailable storage → start fresh */}}state=fresh();return state;}
  function save(){if(!storage)return;try{const {clock:_c,...plain}=state;storage.setItem(key,JSON.stringify(plain));}catch(e){/* quota or private mode: keep working in memory */}}
  function reset(){state=fresh();save();emit({type:'reset'});return state;}
  function emit(action){for(const fn of listeners)fn(state,action);}
  function subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
  const by=()=>state.ui.persona;
  const newEventId=()=>'EV-'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+(++seqEvent));
  /* Driver events: online → applied and acknowledged at once; offline → queued as pending. */
  function driverEvent(ev){
    const e=Object.assign({id:newEventId(),eventTime:clock(),driverId:by(),sync:'pending'},ev);
    if(state.ui.online===false){state.ui.queue.push(e);save();emit({type:'queued',event:e});return {queued:true,event:e};}
    const r=M.applyEvent(state,e);save();emit({type:'event',event:r.event});return {queued:false,event:r.event,duplicate:r.duplicate};
  }
  function sync(){
    if(state.ui.online===false)return {synced:0,conflicts:0};
    const q=state.ui.queue.splice(0);let conflicts=0,synced=0,duplicates=0;
    for(const e of q){const r=M.applyEvent(state,e);if(r.duplicate)duplicates++;else{synced++;conflicts+=r.event.conflicts.length;}}
    for(const a of Object.values(state.allocations))if(a.driverId===by()&&a.deliveredToDriver===false)a.deliveredToDriver=true;
    state.ui.lastSync=clock();state.ui.lastRefresh=clock();save();emit({type:'sync',synced,conflicts,duplicates});return {synced,conflicts,duplicates};
  }
  function setOnline(on){state.ui.online=!!on;state.ui.offlineDrivers=state.ui.offlineDrivers||[];const me=by();if(on){state.ui.offlineDrivers=state.ui.offlineDrivers.filter(d=>d!==me);sync();}else{if(!state.ui.offlineDrivers.includes(me))state.ui.offlineDrivers.push(me);save();emit({type:'online',online:false});}}
  function download(driverId){const work=M.visibleWorkFor(state,driverId);state.ui.downloaded[driverId]={at:clock(),stackKeys:work.map(w=>w.stack.key),docIds:[...new Set(work.map(w=>w.order.documentIds).flat())]};save();emit({type:'download'});return state.ui.downloaded[driverId];}
  /* Dispatcher/admin actions. */
  const actions={
    deliverDemoMail(){const have=new Set(Object.keys(state.documents));const out=[];for(const d of SAMPLES.DOCS)if(!have.has(d.id))out.push(M.ingestDocument(state,d,{by:'system',source:'email'}));return out;},
    deliverScenario(name){const d=SAMPLES.SCENARIOS[name]();if(state.documents[d.id])return state.documents[d.id];return M.ingestDocument(state,d,{by:'system',source:'email'});},
    deliverTickets(){const loads=Object.values(state.loads).map(l=>({id:l.id,truckId:l.truckId,destinationId:l.destinationId,arrivedAt:l.arrivedAt,deliveryNoteNo:l.deliveryNoteId?state.notes[l.deliveryNoteId].number:null}));const out=[];for(const d of SAMPLES.millTickets({loads}))if(!state.documents[d.id])out.push(M.ingestDocument(state,d,{by:'system',source:'email'}));return out;},
    importDocument(doc){return M.ingestDocument(state,doc,{by:by(),source:doc.source||'upload'});},
    review(docId,decisions){return M.reviewDocument(state,docId,decisions||{},by());},
    markDuplicate(docId,ofId){const d=state.documents[docId];const before=d.status;d.status='Duplicate';d.duplicateOf=ofId||d.duplicateOf;M.audit(state,by(),'document.markedDuplicate',docId,before,'Duplicate');return d;},
    failDocument(docId,reason){const d=state.documents[docId];d.status='Failed';d.failReason=reason;M.audit(state,by(),'document.failed',docId,null,reason);return d;},
    retryDocument(docId){const d=state.documents[docId];d.status='NeedsReview';d.failReason=null;M.audit(state,by(),'document.retried',docId,null,null);return d;},
    confirmLocation(key,loc){return M.confirmLocation(state,key,Object.assign({by:by()},loc));},
    clearLocation(key){return M.clearLocation(state,key,by());},
    publish(stackKeys,scope,targets){return M.publish(state,{stackKeys,scope,targets,by:by()});},
    unpublish(stackKeys){for(const k of stackKeys){const st=state.stacks[k];const before=st.publication;st.publication={scope:'none',targets:[]};M.audit(state,by(),'stack.unpublished',k,before,st.publication);}},
    allocate(stackKey,driverId,truckId,share){return M.allocate(state,{stackKey,driverId,truckId,share,by:by()});},
    accept(allocId){return M.acceptAllocation(state,allocId,by());},
    reserve(stackKey){return M.reserve(state,{stackKey,driverId:by(),by:by()});},
    withdraw(allocId,reassignTo){return M.withdrawAllocation(state,allocId,by(),reassignTo);},
    block(key,reason,on=true){return M.blockStack(state,key,by(),reason,on);},
    resolveStack(key,note){return M.resolveStack(state,key,by(),note);},
    resolveConflict(id,resolution){return M.resolveConflict(state,id,by(),resolution);},
    assignReceipt(receiptId,loadId){return M.assignReceipt(state,receiptId,loadId,by());},
    disputeReceipt(receiptId,note){const r=state.receipts[receiptId];r.matchState='Disputed';r.disputeNote=note;M.audit(state,by(),'receipt.disputed',receiptId,null,note);return r;},
    markReportSent(orderId,channel){return M.markReportSent(state,orderId,by(),channel);},
    markLoadReconciled(loadId,note){const l=state.loads[loadId];l.reconciledBy=by();l.reconciledNote=note||null;if(l.state==='Measured')l.state='Reconciled';M.audit(state,by(),'load.reconciled',loadId,null,note);M.deriveOrderStatus(state,l.orderId);return l;},
    setPersona(userId){state.ui.persona=userId;state.ui.online=!(state.ui.offlineDrivers||[]).includes(userId);},
    setSetting(k,v){const before=state.settings[k];state.settings[k]=v;M.audit(state,by(),'settings.changed',k,before,v);},
    upsertUser(u){const i=state.users.findIndex(x=>x.id===u.id);if(i>=0)state.users[i]=Object.assign(state.users[i],u);else state.users.push(u);M.audit(state,by(),'user.upserted',u.id,null,u);},
    removeUser(id){const before=state.users.find(x=>x.id===id);state.users=state.users.filter(x=>x.id!==id);M.audit(state,by(),'user.removed',id,before,null);},
    upsertTruck(t){const i=state.trucks.findIndex(x=>x.id===t.id);if(i>=0)state.trucks[i]=Object.assign(state.trucks[i],t);else state.trucks.push(t);M.audit(state,by(),'truck.upserted',t.id,null,t);},
    updateProfile(id,patch){const p=state.profiles.find(x=>x.id===id);const before=structuredClone(p);Object.assign(p,patch);M.audit(state,by(),'profile.updated',id,before,patch);return p;},
    addProfileSynonym(id,key,syn){const p=state.profiles.find(x=>x.id===id);p.labels[key]=p.labels[key]||[];if(!p.labels[key].includes(syn))p.labels[key].push(syn);M.audit(state,by(),'profile.synonymLearned',id,null,{key,syn});return p;},
    setStackField(key,field,value){const st=state.stacks[key];const before=structuredClone(st[field]);if(field==='planned')st.planned=Object.assign({},st.planned,value);else st[field]=value;M.audit(state,by(),'stack.edited',key,before,st[field]);return st;}
  };
  function apply(type,...args){if(!actions[type])throw new Error('unknown action '+type);const r=actions[type](...args);save();emit({type,args});return r;}
  const store={get state(){return state;},load,save,reset,subscribe,apply,driverEvent,sync,setOnline,download,clock,setClockValue(v){clockValue=v;},actions:Object.keys(actions),KEY:key,
    model:M,report:id=>M.collectionReport(state,id),reconcileOrder:id=>M.reconcileOrder(state,id),reconcileLoad:id=>M.reconcileLoad(state,id),reconcileQuotas:()=>M.reconcileQuotas(state),exportOrder:id=>M.exportOrder(state,id),excerpt:id=>M.driverExcerpt(state,id),visibleWork:id=>M.visibleWorkFor(state,id)};
  load();return store;
}
const api={create,KEY};
(globalThis.TransportCore=globalThis.TransportCore||{}).store=api;
if(typeof module!=='undefined')module.exports=api;
})();
