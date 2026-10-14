// CFHarvest replica bridge: game state → planning snapshot, plan → game state. Pure Node, no DOM.
const assert=require('node:assert/strict'),fs=require('node:fs');
global.ForestGame=require('../dist/game.js');global.ForestJourney=require('../dist/journey.js');global.WorksiteRoutes=require('../dist/routes.js');
const g=global.ForestGame,j=global.ForestJourney,M=global.CFHModel=require('../cfharvest/app/model.js'),B=require('../cfharvest/app/bridge.js');
const close=(a,b,tol=1e-7,msg='')=>assert(Math.abs(a-b)<=tol,`${msg} ${a} != ${b}`);
const sum=a=>a.reduce((x,y)=>x+y,0);
const started=(type='standard',prepared=false)=>{let s=j.initial(prepared);s=j.choose(s,'contractType',type);return j.start(s);};

/* Snapshot at round 1, before and after the contract is accepted. */
let forest=j.initial(),snap=B.fromGameState(forest);
assert.equal(snap.meta.contract.provisional,true);assert.equal(snap.meta.contract.id,'V-26-014');assert.equal(snap.meta.canApply,false);
let s=started(),before=structuredClone(s);snap=B.fromGameState(s);assert.deepEqual(s,before,'fromGameState must not mutate the game state');
assert.equal(snap.meta.contract.provisional,false);
assert.deepEqual(snap.orders.map(o=>[o.id,o.standId,o.name,o.estimatedVolume,o.contractId]),[['H-A01','a','Nordhang',560,'V-26-014'],['H-B01','b','Talgrund',520,'V-26-014'],['H-C01','c','Südrevier',420,'V-26-014']]);
for(const o of snap.orders){close(sum(o.assortments.map(a=>a.estimatedVolume)),o.estimatedVolume);assert.deepEqual(o.assortments.map(a=>[a.code,a.receiver,a.pin]),[['SAG','Sägewerk',true],['IND','Industrieabnehmer',true],['ABW','Industrieabnehmer',false]]);assert.equal(o.boundary.length,6);assert.equal(o.landing.id,'P-'+o.standId.toUpperCase()+'01');assert(o.bio.code.startsWith('BIO-0'));}
close(snap.orders[0].assortments[0].estimatedVolume,560*.65,1e-9,'saw share from the game opening stock split');
assert.equal(snap.orders[1].openingStock,80);
assert(snap.orders[1].readiness.some(r=>r.key==='survey'&&r.level==='warn'&&r.value===65),'Talgrund survey gap');
assert(snap.orders[0].readiness.some(r=>r.key==='boundary'&&r.level==='warn'),'Nordhang boundary unchecked');
assert.deepEqual(snap.orderBook.map(b=>[b.id,b.ordered,b.receiver,b.price]),[['B-V-26-014-SAG',360,'Sägewerk',78],['B-V-26-014-IND',240,'Industrieabnehmer',34],['B-V-26-014-ABW',0,'Industrieabnehmer',26]]);
const premium=B.fromGameState(started('premium'));assert.deepEqual(premium.orderBook.slice(0,2).map(b=>[b.contractId,b.ordered,b.price]),[['V-26-015',460,84],['V-26-015',260,34]]);
assert.deepEqual(snap.resources.filter(r=>r.plannable).map(r=>[r.id,r.type,r.rate,r.gameKey]),[['H-01','harvester',28,'harvester'],['F-01','forwarder',32,'forwarder']]);
assert.deepEqual(snap.chains.map(c=>[c.id,c.members]),[['K-01',['H-01','F-01']]]);
assert.equal(snap.calendar.currentDay,0);assert.deepEqual(snap.calendar.shiftDays,[0,1,2,3]);
assert.equal(B.fromGameState(g.initial()).meta.contract.provisional,true,'plain game without journey still maps');

/* PIN versions: round ≥3 is v2; the machine's loaded spec reveals the PIN version still on board. */
let p=snap.orders[0].pin;assert.deepEqual([p.required,p.spec,p.loaded,p.machineVersion],[1,'5,1','5,1',1]);
assert.equal(snap.orders[1].pin.machineVersion,null,'Talgrund: H-01 holds another order’s PIN');
const r3=structuredClone(s);r3.round=3;p=B.fromGameState(r3).orders[0].pin;assert.deepEqual([p.required,p.spec,p.v1,p.v2,p.loaded,p.machineVersion],[2,'4,1','5,1','4,1','5,1',1]);
r3.loadedGrade='4,1';assert.equal(B.fromGameState(r3).orders[0].pin.machineVersion,2);

/* applyPlan matches what dist/handover.js does when the operator confirms. */
const accept=fs.readFileSync('dist/handover.js','utf8').match(/state\.handoverAccepted\[id\]=true;[^}]*?(?=render\(\))/)[0];
const confirmLikeHandover=new Function('state','id',accept);
for(const round of [1,2,3,4]){
  const base=structuredClone(s);base.round=round;const snapshot=structuredClone(base);
  const out=B.applyPlan(base,{harvester:'H-A01',forwarder:'H-A01'});assert.deepEqual(base,snapshot,'applyPlan must not mutate');
  const expected=structuredClone(base);confirmLikeHandover(expected,'a');
  for(const k of ['handoverAccepted','handoverRound','handoverVersions'])assert.deepEqual(out[k],expected[k],k+' round '+round);
  assert.deepEqual([out.harvester,out.forwarder,out.handoverMode,out.cutting,out.reporting],['a','a','digital','current','live']);
  assert.equal(g.validate(out),null,'validate round '+round);
}
let split=B.applyPlan(s,{harvester:'b',forwarder:'c'});assert.equal(g.validate(split),null);assert.deepEqual([split.harvester,split.forwarder,split.handoverMode,split.handoverVersions.b,split.handoverVersions.c],['b','c','digital',1,1]);
let partial=B.applyPlan(s,{harvester:'H-B01'});assert.equal(partial.harvester,'b');assert.equal(partial.forwarder,'a');assert.equal(partial.handoverMode,'manual','forwarder stand not confirmed → stay manual');assert.equal(g.validate(partial),null);
let fwdOnly=B.applyPlan(s,{forwarder:'H-C01'});assert.equal(fwdOnly.cutting,s.cutting,'no PIN travelled to the harvester');assert.equal(g.validate(fwdOnly),null);
const closed=structuredClone(s);closed.stands[1].closed=true;assert.equal(B.applyPlan(closed,{harvester:'H-B01',forwarder:'H-B01'}).harvester,'a','closed blocks are never dispatched');
for(const phase of ['forest','receipt','logistics','result']){const x=structuredClone(s);x.phase=phase;assert.deepEqual(B.applyPlan(x,{harvester:'H-B01',forwarder:'H-B01'}),x,'unchanged in phase '+phase);}
assert.deepEqual(B.applyPlan(s,null),s);assert.deepEqual(B.applyPlan(s,{harvester:'H-Z01',forwarder:'nope'}),s);
assert.equal(B.standIdOf('H-C01'),'c');assert.equal(B.standIdOf('b'),'b');assert.equal(B.standIdOf('<img>'),null);

/* Production follow-up: HPR/FPR messages reproduce the game's material balance in every scenario. */
let scenarios=0;
function checkBalance(state,label){
  const sn=B.fromGameState(state),hpr=M.fromHPR(sn.production.messages);
  for(const o of sn.orders){const st=state.stands.find(x=>x.id===o.standId),f=hpr.byObject[o.id]||{felled:0,forwarded:0,forestStock:0};
    close(f.felled,o.stand.felled,1e-7,label+' felled '+o.id);close(f.forwarded,o.stand.forwarded,1e-7,label+' forwarded '+o.id);close(f.forestStock,st.stock,1e-7,label+' forest stock '+o.id);
    close(sum(Object.values(o.stand.byGrade).map(x=>x.felled)),o.stand.felled,1e-6,label+' grades '+o.id);close(o.stand.felled-o.stand.forwarded,st.stock,1e-7);}
  close(hpr.totals.forestStock,sum(state.stands.map(x=>x.stock)),1e-7,label+' total');close(sn.production.totals.forwarded,state.forwarded,1e-6,label+' forwarded total');
  if(state.history.length){const last=state.history.at(-1);assert.equal(sn.production.lastShift.harvest,last.harvest);assert.equal(sn.production.lastShift.forwarded,last.forwarded);}
  scenarios++;return sn;
}
for(const harvester of ['a','b','c'])for(const forwarder of ['a','b','c'])for(const forwardStart of ['early','stock','late'])for(const survey of ['protect','ignore']){
  let x=started();Object.assign(x,{harvester,forwarder,forwardStart,survey});const n=g.calculate(x).next;const sn=checkBalance(n,[harvester,forwarder,forwardStart,survey].join('/'));
  const h=sn.orders.find(o=>o.standId===harvester);assert.equal(h.notes.length>0,true,'machine feedback from shift logs');
}
// Whole journey through haulage: delivered volumes come from the delivery notes.
let full=started('standard',true);
for(let round=1;round<=4;round++){const sn=B.fromGameState(full),stand=round===4?'b':'a';let plan=M.assign(M.emptyPlan(),sn,['H-'+stand.toUpperCase()+'01'],'K-01',{mode:'day',day:round-1});plan=M.send(plan,sn,{rowIds:['K-01']});const d=M.viewModel(sn,plan).dispatch;assert.equal(d.harvester,'H-'+stand.toUpperCase()+'01');full=B.applyPlan(full,d);assert.equal(g.validate(full),null,'campaign round '+round);full=g.calculate(full).next;assert.equal(full.history.at(-1).downgraded,0,'PIN sent with the order: no downgrade');checkBalance(full,'round '+round);full=g.nextShift(full);}
full=j.haul(full);const hauled=checkBalance(full,'after haul');
for(const b of hauled.orderBook)close(b.delivered,full.journey.logistics.delivered[b.assortment],1e-7,'delivered '+b.assortment);
close(hauled.production.totals.delivered,full.journey.logistics.volume,1e-7);

/* Handoff envelope. */
const env=B.envelope('to-replica',s,{nonce:'n1'});assert.equal(B.readEnvelope(JSON.stringify(env),'to-replica').nonce,'n1');
assert.equal(B.readEnvelope(JSON.stringify(env),'to-game'),null);assert.equal(B.readEnvelope('{bad','to-replica'),null);assert.equal(B.readEnvelope(JSON.stringify({...env,schema:2}),'to-replica'),null);
assert.equal(B.isGameState({...s,round:9}),false);assert.equal(B.isGameState({...s,stands:[{id:'<x>'}]}),false);assert.equal(B.isGameState(s),true);
console.log(JSON.stringify({passed:true,productionScenarios:scenarios,applyPlanMatchesHandoverJs:true,campaign:{forwarded:g.round(full.forwarded),delivered:g.round(full.journey.logistics.volume)}}));
