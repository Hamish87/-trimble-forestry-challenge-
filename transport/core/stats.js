/* Holztransport demo · dashboard figures (SPEC §7.8). Pure functions over the workspace state; every number comes from
   the same records as the reports: ordered quantities from stacks, collected from pickup events (driver estimate),
   declared from delivery notes, received from matched mill tickets (Werksmaß) and net weights. Units are summed per
   unit and never converted silently — the fm equivalent is a separately labelled derivation with the versioned
   factors it used. Node-loadable for tests. */
'use strict';
(function(){
const U=()=>globalThis.TransportCore.units;
const LIVE=['Proposed','Accepted','Reserved'];
const round=x=>Math.round(x*1000)/1000;
function addQty(acc,qty,unit){if(qty==null||unit==null||!isFinite(qty))return acc;acc[unit]=round((acc[unit]||0)+qty);return acc;}
function total(acc){return Object.values(acc).reduce((a,b)=>a+b,0);}
/* derived solid-cubic-metre equivalent over the units that have a versioned factor; units without one (e.g. LDG) are
   listed in `excluded` and left out of the value; null when nothing is convertible */
function fmEquivalent(byUnit){
  let fm=0,any=false;const used=new Set(),excluded=[];
  for(const [u,q] of Object.entries(byUnit||{})){if(u==='fm'){fm+=q;any=true;continue;}
    let f=U().factorFor(u,'fm');if(f){fm+=q*f.factor;used.add(f.id);any=true;continue;}
    if(u==='kg'){const kt=U().factorFor('kg','t'),tf=U().factorFor('t','fm');if(kt&&tf){fm+=q*kt.factor*tf.factor;used.add(kt.id);used.add(tf.id);any=true;continue;}}
    if(u==='t'){const tf=U().factorFor('t','fm');if(tf){fm+=q*tf.factor;used.add(tf.id);any=true;continue;}}
    excluded.push(u);}
  return any?{value:round(fm),factors:[...used],excluded}:null;
}
/* share of a quantity set against another: fm equivalent when both have one, else the single common unit */
function ratioPct(part,whole){const pf=fmEquivalent(part),wf=fmEquivalent(whole);if(pf&&wf&&wf.value>0&&!wf.excluded.length)return Math.round(pf.value/wf.value*1000)/10;const wu=Object.keys(whole||{});if(wu.length===1&&whole[wu[0]]>0){if(Object.entries(part||{}).some(([u,q])=>u!==wu[0]&&q>0))return null;return Math.round(((part||{})[wu[0]]||0)/whole[wu[0]]*1000)/10;}return null;}
const day=iso=>iso?String(iso).slice(0,10):null;
function compute(state,opts={}){
  /* the period and the daily series end at the latest recorded activity when that lies after "now" (demo data is dated ahead) */
  const realNow=opts.now||new Date().toISOString();const latest=[...state.events.map(e=>e.eventTime),...Object.values(state.loads).map(l=>l.loadedAt||l.createdAt),...Object.values(state.notes).map(n=>n.issuedAt),...Object.values(state.receipts).map(r=>r.arrivedAt)].filter(Boolean).map(String).sort().pop()||null;
  const now=latest&&latest>realNow?latest:realNow;const days=Number(opts.days)||0;const from=days?new Date(new Date(now).getTime()-days*86400000).toISOString():null;const drv=opts.driverId||null;
  const inPeriod=iso=>!from||(iso&&String(iso)>=from);
  const stacks=Object.values(state.stacks),orders=Object.values(state.orders);
  const loads=Object.values(state.loads).filter(l=>inPeriod(l.loadedAt||l.createdAt)&&(!drv||l.driverId===drv));
  const pickups=state.events.filter(e=>e.kind==='pickup'&&inPeriod(e.eventTime)&&(!drv||e.driverId===drv));
  const cleared=state.events.filter(e=>e.kind==='cleared'&&inPeriod(e.eventTime)&&(!drv||e.driverId===drv));
  const problems=state.events.filter(e=>e.kind==='problem'&&inPeriod(e.eventTime)&&(!drv||e.driverId===drv));
  const notes=Object.values(state.notes).filter(n=>inPeriod(n.issuedAt)&&(!drv||n.driverId===drv));
  const receipts=Object.values(state.receipts).filter(r=>r.matchState==='Matched'&&state.loads[r.loadId]&&inPeriod(r.arrivedAt)&&(!drv||state.loads[r.loadId].driverId===drv));
  const allocs=Object.values(state.allocations).filter(a=>LIVE.includes(a.state)&&(!drv||a.driverId===drv));
  const sumPick=xs=>xs.reduce((acc,e)=>addQty(acc,e.qty,e.unit),{});
  const sumNotes=ns=>ns.reduce((acc,n)=>{for(const l of n.declaredLines||[])addQty(acc,l.qty,l.unit);return acc;},{});
  const sumReceipts=rs=>rs.reduce((acc,r)=>{for(const m of r.measuredLines||[])if(m.qty)addQty(acc,m.qty.value,m.qty.unit);return acc;},{});
  const netKg=rs=>rs.reduce((a,r)=>a+(r.weighbridge&&r.weighbridge.net&&r.weighbridge.net.unit==='kg'?r.weighbridge.net.value||0:0),0);
  const ordered=stacks.reduce((acc,s)=>addQty(acc,s.planned.qty,s.planned.unit),{});
  const collected=sumPick(pickups),declared=sumNotes(notes),received=sumReceipts(receipts);
  const fleet={
    loads:loads.length,loadsByState:loads.reduce((m,l)=>{m[l.state]=(m[l.state]||0)+1;return m;},{}),
    pickups:pickups.length,ordered,collected,declared,received,netT:round(netKg(receipts)/1000),
    collectedFm:fmEquivalent(collected),orderedFm:fmEquivalent(ordered),declaredFm:fmEquivalent(declared),receivedFm:fmEquivalent(received),
    stacks:stacks.length,stacksCleared:stacks.filter(s=>s.progress==='Cleared').length,stacksPartly:stacks.filter(s=>s.progress==='PartlyCollected').length,stacksBlocked:stacks.filter(s=>s.progress==='Blocked').length,
    locationNeeded:stacks.filter(s=>s.location.status!=='confirmed'&&s.progress!=='Blocked').length,
    allocations:allocs.length,conflicts:state.conflicts.filter(c=>!c.resolved).length,problems:stacks.filter(s=>s.problem).length,
    ticketsMatched:receipts.length,ticketsOpen:Object.values(state.receipts).filter(r=>r.matchState!=='Matched').length,
    completionPct:ratioPct(collected,ordered)};
  /* drivers */
  const drivers=state.users.filter(u=>u.roles.includes('driver')&&(!drv||u.id===drv)).map(u=>{
    const mine=Object.values(state.allocations).filter(a=>a.driverId===u.id&&LIVE.includes(a.state));
    const allocVol=mine.reduce((acc,a)=>{const s=state.stacks[a.stackKey];if(!s)return acc;const q=a.share&&a.share.kind==='qty'?a.share.value:s.planned.qty;return addQty(acc,q,s.planned.unit);},{});
    const p=pickups.filter(e=>e.driverId===u.id),ls=loads.filter(l=>l.driverId===u.id),ns=notes.filter(n=>n.driverId===u.id);
    const times=[...p,...cleared.filter(e=>e.driverId===u.id),...problems.filter(e=>e.driverId===u.id)].map(e=>e.eventTime).filter(Boolean).sort();
    const col=sumPick(p);
    return {id:u.id,name:u.name,truckId:u.truckId||null,truck:(state.trucks.find(t=>t.id===u.truckId)||{}).reg||null,allocatedStacks:mine.length,allocatedVolume:allocVol,allocatedFm:fmEquivalent(allocVol),loads:ls.length,pickups:p.length,collected:col,collectedFm:fmEquivalent(col),declared:sumNotes(ns),cleared:cleared.filter(e=>e.driverId===u.id).length,problems:problems.filter(e=>e.driverId===u.id).length,lastActivity:times[times.length-1]||null};
  });
  /* mills / destinations */
  const millIds=[...new Set([...loads.map(l=>l.destinationId),...notes.map(n=>n.destinationId),...receipts.map(r=>r.millId)].filter(Boolean))];
  const mills=millIds.map(id=>{const party=state.parties.find(p=>p.id===id)||{id,name:id};const ls=loads.filter(l=>l.destinationId===id),ns=notes.filter(n=>n.destinationId===id),rs=receipts.filter(r=>r.millId===id);
    const dec=sumNotes(ns),rec=sumReceipts(rs);
    /* deviation only over loads that carry both a delivery note and a matched ticket, in their one common unit */
    const paired=ls.filter(l=>l.deliveryNoteId&&state.notes[l.deliveryNoteId]&&(l.receiptIds||[]).some(id=>rs.some(r=>r.id===id)));const pd=sumNotes(paired.map(l=>state.notes[l.deliveryNoteId])),pr=sumReceipts(rs.filter(r=>paired.some(l=>l.id===r.loadId)));
    let deviationPct=null;const units=Object.keys(pd).filter(u=>pr[u]!=null);if(units.length===1&&pd[units[0]]>0)deviationPct=Math.round((pr[units[0]]-pd[units[0]])/pd[units[0]]*1000)/10;
    return {id,name:party.name,loads:ls.length,pairedLoads:paired.length,unloaded:ls.filter(l=>['Unloaded','Measured','Reconciled'].includes(l.state)).length,declared:dec,received:rec,netT:round(netKg(rs)/1000),tickets:rs.length,deviationPct};}).sort((a,b)=>b.loads-a.loads);
  /* customers (Auftraggeber) */
  const customers=[...new Set(orders.map(o=>o.customerId))].map(id=>{const party=state.parties.find(p=>p.id===id)||{id,name:id};const os=orders.filter(o=>o.customerId===id);const ss=stacks.filter(s=>os.some(o=>o.id===s.orderId));
    const ord=ss.reduce((acc,s)=>addQty(acc,s.planned.qty,s.planned.unit),{});const p=pickups.filter(e=>os.some(o=>o.id===(state.stacks[e.stackKey]||{}).orderId));const col=sumPick(p);
    const ns=notes.filter(n=>os.some(o=>o.id===(state.loads[n.loadId]||{}).orderId));const rs=receipts.filter(r=>os.some(o=>o.id===(state.loads[r.loadId]||{}).orderId));
    const of=fmEquivalent(ord),cf=fmEquivalent(col);const pct=ratioPct(col,ord);
    return {id,name:party.name,orders:os.length,stacks:ss.length,cleared:ss.filter(s=>s.progress==='Cleared').length,open:ss.filter(s=>s.progress!=='Cleared'&&s.progress!=='Blocked').length,ordered:ord,collected:col,declared:sumNotes(ns),received:sumReceipts(rs),loads:loads.filter(l=>os.some(o=>o.id===l.orderId)).length,completionPct:pct,orderedFm:of,collectedFm:cf};}).sort((a,b)=>(b.collectedFm?b.collectedFm.value:0)-(a.collectedFm?a.collectedFm.value:0));
  /* timber grades: species · assortment · grade (· length) */
  const gradeKey=tb=>[tb.species||'?',tb.assortment||null,tb.grade||null,tb.lengthM!=null?tb.lengthM+' m':null].filter(Boolean).join(' · ');
  const gmap=new Map();for(const s of stacks){const k=gradeKey(s.timber||{});if(!gmap.has(k))gmap.set(k,{key:k,species:(s.timber||{}).species||'?',ordered:{},collected:{},stacks:0});const g=gmap.get(k);g.stacks++;addQty(g.ordered,s.planned.qty,s.planned.unit);}
  for(const e of pickups){const s=state.stacks[e.stackKey];if(!s)continue;const g=gmap.get(gradeKey(s.timber||{}));if(g)addQty(g.collected,e.qty,e.unit);}
  const grades=[...gmap.values()].map(g=>Object.assign(g,{collectedFm:fmEquivalent(g.collected),orderedFm:fmEquivalent(g.ordered)})).sort((a,b)=>(b.collectedFm?b.collectedFm.value:total(b.collected))-(a.collectedFm?a.collectedFm.value:total(a.collected)));
  const species=[...grades.reduce((m,g)=>{const v=g.collectedFm?g.collectedFm.value:0;m.set(g.species,(m.get(g.species)||0)+v);return m;},new Map())].map(([name,fm])=>({name,fm:round(fm)})).filter(x=>x.fm>0).sort((a,b)=>b.fm-a.fm);
  /* daily series for the last N days (default 14) */
  const span=Math.max(7,Math.min(days||14,60));const daily=[];for(let i=span-1;i>=0;i--){const d=day(new Date(new Date(now).getTime()-i*86400000).toISOString());const lp=pickups.filter(e=>day(e.eventTime)===d);const cf=fmEquivalent(sumPick(lp));daily.push({day:d,loads:Object.values(state.loads).filter(l=>(!drv||l.driverId===drv)&&day(l.loadedAt||l.createdAt)===d).length,pickups:lp.length,collectedFm:cf?cf.value:0,notes:notes.filter(n=>day(n.issuedAt)===d).length});}
  return {now,realNow,anchoredToActivity:now!==realNow,days,from,driverId:drv,fleet,drivers,mills,customers,grades,species,daily};
}
const api={compute,fmEquivalent,ratioPct,addQty,total};
(globalThis.TransportCore=globalThis.TransportCore||{}).stats=api;
})();
