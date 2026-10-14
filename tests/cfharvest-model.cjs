// CFHarvest replica model: status enum and transitions, calendar capacity maths, plan operations, StanForD emitters.
const assert=require('node:assert/strict');
global.ForestGame=require('../dist/game.js');global.ForestJourney=require('../dist/journey.js');global.WorksiteRoutes=require('../dist/routes.js');
const g=global.ForestGame,j=global.ForestJourney,M=require('../cfharvest/app/model.js'),B=require('../cfharvest/app/bridge.js');
const close=(a,b,tol=1e-9,msg='')=>assert(Math.abs(a-b)<=tol,`${msg} ${a} != ${b}`);
const ids=x=>x.map(i=>i.orderId);

/* Status enum, labels, planner transitions, production-driven derivation. */
assert.deepEqual(M.STATUSES,['available','planned','sent','harvesting','felled','forwarding','completed']);
assert.deepEqual(M.STATUSES.map(s=>M.STATUS_INFO[s].web),['Ledig','Tilldelad','Tilldelad','Påbörjad','Påbörjad','Påbörjad','Avslutad']);
assert.deepEqual(M.STATUSES.map(s=>M.STATUS_INFO[s].tone),['free','dimmed','purple','yellow','yellow','yellow','done']);
assert(M.canTransition('available','planned')&&M.canTransition('planned','sent')&&M.canTransition('planned','available')&&M.canTransition('sent','available'));
assert(!M.canTransition('available','sent')&&!M.canTransition('sent','harvesting')&&!M.canTransition('harvesting','planned')&&!M.canTransition('completed','available'));
const D=f=>M.deriveStatus({remaining:500,...f});
assert.equal(D({}),'available');assert.equal(D({planned:true}),'planned');assert.equal(D({planned:true,sent:true}),'sent');
assert.equal(D({sent:true,felledByShifts:160,forwarded:150,forestStock:10}),'harvesting','concurrent forwarding stays harvesting until felling ends');
assert.equal(D({felledByShifts:560,remaining:0,forwarded:0,forestStock:560}),'felled');
assert.equal(D({felledByShifts:560,remaining:0,forwarded:300,forestStock:260}),'forwarding');
assert.equal(D({felledByShifts:560,remaining:0,forwarded:560,forestStock:0}),'completed');
assert.equal(D({forwarded:80,forestStock:0}),'forwarding','opening stock forwarded before harvesting');

/* Calendar capacity: volume ÷ rate ÷ weekly hours, weekends skipped. */
const week={mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0},row={weekly:week};
assert.equal(M.dayISO(0),'2026-10-19');assert.equal(M.weekday(0),'mon');assert.equal(M.weekday(5),'sat');assert.equal(M.dayIndexOf('2026-10-26'),7);
assert.equal(M.hoursOn(row,5),0);assert.equal(M.startHourOfDay(row,7),40);assert.equal(M.weeklyTotal(row),40);
assert.equal(M.positionOf(row,0),0);assert.equal(M.positionOf(row,20,true),2.5);assert.equal(M.positionOf(row,8),1,'start on the boundary opens the next day');assert.equal(M.positionOf(row,8,true),1,'end on the boundary stays on the day');
assert.equal(M.positionOf(row,40,true),5,'Friday evening');assert.equal(M.positionOf(row,40),7,'next start is Monday');
assert.equal(M.positionOf({weekly:{...week,mon:0,tue:0,wed:0,thu:0,fri:0}},1),null);
close(M.overlapOnDay(row,{start:20,end:28},2),4);close(M.overlapOnDay(row,{start:20,end:28},3),4);assert.equal(M.overlapOnDay(row,{start:20,end:28},4),0);
// "1 h + 1 m³" (Viktiga steg): unrealistic master data makes a small order block the calendar for months.
const slow={weekly:{mon:1,tue:1,wed:1,thu:1,fri:1,sat:0,sun:0},rate:1,type:'harvester'};assert(M.positionOf(slow,M.durationHours({estimatedVolume:120},slow),true)>150,'blocks months');

/* Rows and durations from the game snapshot (28 fm/h harvester, 32 fm/h forwarder, 8 h shifts). */
const s=j.start(j.initial()),snap=B.fromGameState(s),rows=M.rows(snap,M.emptyPlan()),K=rows.find(r=>r.id==='K-01'),H=rows.find(r=>r.id==='H-01'),F=rows.find(r=>r.id==='F-01');
assert.deepEqual(rows.map(r=>r.id),['K-01','H-01','F-01'],'trucks are not plannable rows');assert.equal(K.rate,28);assert.deepEqual(K.weekly,week);
const [a,b,c]=snap.orders;
close(M.durationHours(a,K),20);close(M.durationHours(b,K),600/32,1e-9,'Talgrund chain waits for forwarding incl. 80 fm opening stock');close(M.durationHours(b,H),520/28);close(M.durationHours(b,F),600/32);close(M.durationHours(c,K),15);
close(M.positionOf(K,M.durationHours(a,K),true),2.5,1e-9,'560 fm Nordhang spans 2.5 shift days');

/* Plan operations. */
let plan=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});
plan=M.assign(plan,snap,['H-C01'],'K-01',{mode:'after'});
let items=M.rowItems(snap,plan,K);assert.deepEqual(ids(items),['H-A01','H-C01']);close(items[1].start,20);
plan=M.assign(plan,snap,['H-B01'],'K-01',{mode:'day',day:0});items=M.rowItems(snap,plan,K);
assert.deepEqual(ids(items),['H-B01','H-A01','H-C01'],'planning on an occupied day pushes later items');close(items[1].start,600/32);close(items[2].start,600/32+20);
plan=M.unassign(plan,['H-B01']);items=M.rowItems(snap,plan,K);close(items[0].start,600/32,1e-9,'gap stays after Avplanera');close(items[1].start,600/32+20);
plan=M.assign(plan,snap,['H-C01'],'K-01',{mode:'day',day:5});close(M.rowItems(snap,plan,K)[1].start,M.startHourOfDay(K,7),1e-9,'Saturday has no hours: start moves to Monday');
const preview=M.compressPreview(snap,plan,'K-01');assert.deepEqual(preview.map(p=>[p.orderId,p.newStart]),[['H-A01',0],['H-C01',20]]);
plan=M.compress(plan,snap,['K-01']);assert.deepEqual(ids(M.rowItems(snap,plan,K)),['H-A01','H-C01']);close(M.rowItems(snap,plan,K)[0].start,0);close(M.rowItems(snap,plan,K)[1].start,20,1e-9,'Komprimera removes gaps, keeps order');
plan=M.insertAt(plan,snap,'H-B01','K-01',1);assert.deepEqual(ids(M.rowItems(snap,plan,K)),['H-A01','H-B01','H-C01']);close(M.rowItems(snap,plan,K)[2].start,20+600/32);
plan=M.insertAt(plan,snap,'H-C01','K-01',0);assert.deepEqual(ids(M.rowItems(snap,plan,K)),['H-C01','H-A01','H-B01'],'insert before the first item');
plan=M.setEstimatedStart(plan,snap,'H-B01','2026-10-26');close(M.rowItems(snap,plan,K).find(i=>i.orderId==='H-B01').start,40);
const later=structuredClone(s);later.round=3;const snap3=B.fromGameState(later);
const past=M.assign(M.emptyPlan(),snap3,['H-A01'],'K-01',{mode:'day',day:0});close(past.assignments[0].startHour,16,1e-9,'cannot plan before today (shift 3)');
const closed=structuredClone(s);closed.stands[2].closed=true;assert.equal(M.assign(M.emptyPlan(),B.fromGameState(closed),['H-C01'],'K-01',{mode:'after'}).assignments.length,0,'closed blocks are not planned');
assert.throws(()=>M.assign(M.emptyPlan(),snap,['H-A01'],'X-99',{}));
assert.deepEqual(M.normalizePlan({assignments:[{orderId:'H-A01'},null,{orderId:'H-A01',rowId:'K-01',startHour:0}]}).assignments.length,1);

/* Send → status, dispatch for today, StanForD files. */
let p1=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});let vm=M.viewModel(snap,p1);
assert.equal(vm.orders[0].status,'planned');assert.equal(vm.orders[1].status,'available');assert.deepEqual(vm.dispatch.issues.map(i=>i.code),['notSent','notSent']);assert.equal(vm.dispatch.harvester,null);
p1=M.send(p1,snap,{rowIds:['K-01']});vm=M.viewModel(snap,p1);
assert.equal(vm.orders[0].status,'sent');assert.equal(vm.orders[0].info.tone,'purple');assert.deepEqual([vm.dispatch.harvester,vm.dispatch.forwarder],['H-A01','H-A01']);
assert.equal(vm.orders[0].plannedStart,'2026-10-19');assert.equal(vm.orders[0].plannedEnd,'2026-10-21');
const f=vm.orders[0].instructions.files;assert.equal(vm.orders[0].instructions.pinVersion,1);
assert.equal(f.oin.fileType,'oin');assert.equal(f.oin.standard,'StanForD 2010');assert.equal(f.oin.OperatingInstruction.ObjectDefinition.ObjectKey,'H-A01');assert.equal(f.oin.HeaderInformation.ContractNumber,'V-26-014');assert.equal(f.oin.OperatingInstruction.MachineDefinition.StanForDCode,'90001');
assert.deepEqual(f.oin.OperatingInstruction.ProductInstructionReferences.map(r=>[r.ProductKey,r.PINVersion]),[['H-A01-SAG',1],['H-A01-IND',1]]);assert.equal(f.oin.OperatingInstruction.EnvironmentalRestrictions[0].Code,'BIO-01');
assert.deepEqual(f.pin.map(x=>[x.fileType,x.ProductInstruction.ProductDefinition.ProductUserID,x.ProductInstruction.ProductDefinition.ProductVersion,x.ProductInstruction.ProductDefinition.NominalLength_m,x.ProductInstruction.ProductDefinition.DeliveryDestination]),[['pin','SAG',1,5.1,'Sägewerk'],['pin','IND',1,null,'Industrieabnehmer']]);
assert.equal(f.foi.fileType,'foi');assert.equal(f.foi.ForwardingObjectInstruction.MachineDefinition.MachineKey,'F-01');assert.deepEqual(f.fdi.ForwardingDeliveryInstruction.Deliveries.map(d=>[d.ProductKey,d.FromLanding,d.Destination]),[['H-A01-SAG','P-A01','Sägewerk'],['H-A01-IND','P-A01','Industrieabnehmer']]);
JSON.parse(JSON.stringify(f));
const hOnly=M.send(M.assign(M.emptyPlan(),snap,['H-B01'],'H-01',{mode:'after'}),snap,{rowIds:['H-01']}).instructions['H-B01'].files;assert(hOnly.oin&&hOnly.pin.length===2&&!hOnly.foi&&!hOnly.fdi);
const fOnly=M.send(M.assign(M.emptyPlan(),snap,['H-B01'],'F-01',{mode:'after'}),snap,{orderIds:['H-B01']}).instructions['H-B01'].files;assert(!fOnly.oin&&!fOnly.pin.length&&fOnly.foi&&fOnly.fdi);
close(fOnly.fdi.ForwardingDeliveryInstruction.Deliveries.reduce((x,d)=>x+d.ExpectedVolume_m3sub,0),600,1e-9,'FDI covers the 80 fm opening stock');
// Round 3: the round-1 send is outdated, PIN v2 needed; H-01 still has the v1 spec loaded.
let vm3=M.viewModel(snap3,p1);assert.equal(vm3.orders[0].outdated,true);assert(vm3.orders[0].pinFlag);assert.deepEqual(vm3.dispatch.issues.map(i=>i.code),['outdated','outdated']);assert.equal(vm3.orders[0].status,'planned');
const p3=M.send(p1,snap3,{orderIds:['H-A01']});vm3=M.viewModel(snap3,p3);assert.equal(vm3.orders[0].instructions.pinVersion,2);assert.equal(vm3.orders[0].instructions.files.pin[0].ProductInstruction.ProductDefinition.NominalLength_m,4.1);assert(!vm3.orders[0].pinFlag);assert.equal(vm3.dispatch.harvester,'H-A01');
// Dispatch picks the item with most hours on today's shift.
let mix=M.assign(M.emptyPlan(),snap,['H-C01'],'K-01',{mode:'day',day:0});mix=M.assign(mix,snap,['H-A01'],'K-01',{mode:'after'});mix=M.send(mix,snap,{rowIds:['K-01']});
const mixed=structuredClone(s);mixed.round=2;assert.equal(M.viewModel(B.fromGameState(mixed),mix).dispatch.harvester,'H-C01','shift 2: Südrevier 7 h vs Nordhang 1 h');
const day3={...snap,calendar:{...snap.calendar,currentDay:2}};assert.equal(M.dispatchPlan(day3,mix).harvester,'H-A01','shift 3: only Nordhang');
assert.equal(M.viewModel(snap,mix).dispatch.harvester,'H-C01');

/* Production follow-up from HPR/FPR. */
const hpr=M.fromHPR([{type:'HPR',kind:'opening',round:0,objectKey:'X',volume:80},{type:'HPR',kind:'shift',round:1,objectKey:'X',volume:100},{type:'FPR',round:1,objectKey:'X',volume:150},{type:'FPR',round:2,objectKey:'Y',volume:10},{type:'XYZ',objectKey:'X',volume:999},{type:'HPR',objectKey:'X',volume:NaN}]);
assert.deepEqual([hpr.byObject.X.felled,hpr.byObject.X.opening,hpr.byObject.X.felledByShifts,hpr.byObject.X.forwarded,hpr.byObject.X.forestStock],[180,80,100,150,30]);
assert.equal(hpr.byObject.Y.forestStock,-10,'negative forest stock when the forwarder reports more than the harvester [MM]');assert.equal(hpr.totals.forestStock,20);
// Order book "planned" = estimated assortment volume of planned orders.
const book=M.viewModel(snap,p1).orderBook;close(book[0].planned,560*.65);close(book[1].planned,560*.35);assert.equal(book[2].planned,0);
/* ---------- Milestone 2: copy, staged insert-between + Spara, manual override, weekends, clock times, overrides ---------- */
// Assignment ids; legacy plans without ids get one.
assert.match(M.normalizePlan({assignments:[{orderId:'H-A01',rowId:'K-01',startHour:0}]}).assignments[0].id,/^A\d+$/);
// Kopiera: the bar stays on F-01 and a copy appears on H-01 (one order on several resources) [M60][MW].
let cp=M.assign(M.emptyPlan(),snap,['H-B01'],'F-01',{mode:'day',day:0});const srcId=cp.assignments[0].id;
cp=M.moveItem(cp,snap,srcId,'H-01',{day:2,copy:true});
assert.equal(cp.assignments.length,2,'copy keeps the original');assert.deepEqual(cp.assignments.map(a=>a.rowId).sort(),['F-01','H-01']);
assert.notEqual(cp.lastItem,srcId);close(cp.assignments.find(a=>a.id===cp.lastItem).startHour,16,1e-9,'copy starts on the drop day');
let cvm=M.viewModel(snap,cp);assert.equal(cvm.orders[1].assignments.length,2);assert.equal(cvm.orders[1].pill.cls,'planned');assert.equal(cvm.orders[1].pill.text,'Forwarder F-01, Harvester H-01','names in start order');
cp=M.send(cp,snap,{rowIds:['F-01']});cvm=M.viewModel(snap,cp);assert.equal(cvm.orders[1].status,'planned','sent only when every copy is sent');
cp=M.send(cp,snap,{rowIds:['H-01']});cvm=M.viewModel(snap,cp);assert.equal(cvm.orders[1].status,'sent');assert.equal(cvm.orders[1].pill.cls,'sent');
const merged=cvm.orders[1].instructions.files;assert(merged.oin&&merged.foi&&merged.pin.length===2,'files of both machines are kept');
// Flytta (no copy) moves the bar and resets "sent".
let mv=M.moveItem(cp,snap,srcId,'K-01',{day:7});assert.equal(mv.assignments.length,2);assert.equal(mv.assignments.find(a=>a.id===srcId).rowId,'K-01');assert.equal(mv.assignments.find(a=>a.id===srcId).sent,false);
// Lås start- och slutdatumen: same calendar start/end on the target row.
let lk=M.assign(M.emptyPlan(),snap,['H-A01'],'H-01',{mode:'day',day:1});const lkId=lk.assignments[0].id;lk=M.moveItem(lk,snap,lkId,'F-01',{lock:true});
const Fr=M.rows(snap,lk).find(r=>r.id==='F-01'),lkIt=M.rowItems(snap,lk,Fr)[0];close(M.positionOf(Fr,lkIt.start),1);close(M.positionOf(Fr,lkIt.end,true),3.5,1e-9,'locked end date kept although F-01 is faster');assert(lkIt.manualHours>0);
// Insert between, staged: the inserted bar overlaps until Spara; Spara shifts the later bars right [M68].
let st=M.assign(M.emptyPlan(),snap,['H-A01','H-C01'],'K-01',{mode:'day',day:0});
assert.deepEqual(ids(M.rowItems(snap,st,K)),['H-A01','H-C01']);close(M.rowItems(snap,st,K)[1].start,20,1e-9,'batch follows in sequence');
st=M.insertAt(st,snap,'H-B01','K-01',1,{stage:true});assert(M.hasOverlap(snap,st,K),'staged insert overlaps');assert.equal(M.viewModel(snap,st).staged,1);
const vmStaged=M.viewModel(snap,st).rows.find(r=>r.id==='K-01');assert(vmStaged.overlap&&vmStaged.lanes===2,'overlap shown in a second lane');
st=M.commit(st,snap);items=M.rowItems(snap,st,K);assert.deepEqual(ids(items),['H-A01','H-B01','H-C01']);close(items[1].start,20);close(items[2].start,20+600/32,1e-9,'Spara shifts later bars');
assert(!st.assignments.some(a=>a.staged),'Spara clears the stage marks');
// Reorder within a row: move the first bar behind the last one.
let ro=M.insertAt(st,snap,null,'K-01',3,{itemId:st.assignments.find(a=>a.orderId==='H-A01').id,stage:true});ro=M.commit(ro,snap);assert.deepEqual(ids(M.rowItems(snap,ro,K)),['H-B01','H-C01','H-A01']);
// Drop from the list onto an occupied day, staged: the dropped orders keep their slot, existing ones move behind them.
let dl=M.assign(M.emptyPlan(),snap,['H-C01'],'K-01',{mode:'day',day:0});dl=M.assign(dl,snap,['H-A01','H-B01'],'K-01',{mode:'day',day:0,stage:true});dl=M.commit(dl,snap);assert.deepEqual(ids(M.rowItems(snap,dl,K)),['H-A01','H-B01','H-C01']);
// Manual working time ("Manuell arbetstid") overrides the estimate [M72].
let ov=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});const ovId=ov.assignments[0].id;ov=M.updateItem(ov,snap,ovId,{manualHours:56});
let ovIt=M.rowItems(snap,ov,K)[0];assert.equal(ovIt.duration,56);close(ovIt.estimated,20);close(M.positionOf(K,ovIt.end,true),9,1e-9,'56 h = 7 working days → ends Friday of week 2');
ov=M.updateItem(ov,snap,ovId,{manualHours:null});assert.equal(M.rowItems(snap,ov,K)[0].duration,20,'clearing the override restores the estimate');
// Start time and Beräknad sluttidpunkt: day starts 09:00; 20 h with 8 h days → Wednesday 13:00.
ov=M.updateItem(ov,snap,ovId,{day:0,minutes:9*60});let t=M.timeOf(K,M.rowItems(snap,ov,K)[0].end,true);assert.deepEqual([t.iso,t.clock],['2026-10-21','13:00']);
ov=M.updateItem(ov,snap,ovId,{day:0,minutes:15*60});ovIt=M.rowItems(snap,ov,K)[0];close(ovIt.start,6);t=M.timeOf(K,ovIt.end,true);assert.deepEqual([t.iso,t.clock],['2026-10-22','11:00'],'15:00 start: 2 h Mon + 8 + 8 + 2 h Thu');
assert.deepEqual([M.timeOf(K,8,true).clock,M.timeOf(K,8).clock,M.timeOf(K,8).iso],['17:00','09:00','2026-10-20']);
// Weekend skipping: a 30 h job started Thursday runs Thu, Fri, (Sat/Sun 0 h), Mon, Tue.
let wk=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:3});wk=M.updateItem(wk,snap,wk.assignments[0].id,{manualHours:30});const wkIt=M.rowItems(snap,wk,K)[0];
t=M.timeOf(K,wkIt.end,true);assert.deepEqual([t.iso,t.clock],['2026-10-27','15:00']);assert.equal(M.positionOf(K,wkIt.start+16),7,'hour 17 of the job opens Monday');
// Veckokalender override: Saturday 8 h on H-01 only; the chain still needs both members → stays 0 h.
const ovPlan={...M.emptyPlan(),resources:{'H-01':{days:{5:8}}}},ovRows=M.rows(snap,ovPlan);
assert.equal(M.hoursOn(ovRows.find(r=>r.id==='H-01'),5),8);assert.equal(M.hoursOn(ovRows.find(r=>r.id==='K-01'),5),0);assert.equal(M.hoursOn(ovRows.find(r=>r.id==='H-01'),12),0);
// Produktionsdata per Maßnahme; chain = slowest member.
const est=M.estimate(b,K);assert.deepEqual(est.lines.map(l=>[l.resourceId,l.rate,l.volume]),[['H-01',28,520],['F-01',32,600]]);close(est.hours,600/32);
const fast={...M.emptyPlan(),resources:{'F-01':{production:{Slutavverkning:64}}}};close(M.durationHours(b,M.rows(snap,fast).find(r=>r.id==='K-01')),520/28,1e-9,'faster forwarder → harvester is now the bottleneck');
assert.equal(M.rateFor({rate:5,production:{Gallring:20}},'Gallring'),20);assert.equal(M.rateFor({rate:5},'Gallring'),5);
// Komprimera within an interval with a new start date.
let cz=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:2});cz=M.assign(cz,snap,['H-C01'],'K-01',{mode:'day',day:9});
const czp=M.compressPreview(snap,cz,'K-01',{from:0,to:20,newStartDay:0});assert.deepEqual(czp.map(p=>[p.orderId,p.newStart]),[['H-A01',0],['H-C01',20]]);
const czq=M.compressPreview(snap,cz,'K-01',{from:0,to:20});assert.deepEqual(czq.map(p=>[p.orderId,p.newStart]),[['H-A01',16],['H-C01',36]],'without a new start date the first order keeps its start');
assert.deepEqual(M.compressPreview(snap,cz,'K-01',{from:8,to:20}).map(p=>p.orderId),['H-C01'],'only items starting inside the interval');
// PIN status: removing a PIN file makes the assortment "missing" [M53].
const ps=M.pinStatus(a,M.emptyPlan());assert.deepEqual(ps.missing,[]);assert.equal(ps.files.length,2);assert.match(ps.files[0],/^SAG_Nordhang_5-1m_v1$/);
assert.deepEqual(M.pinStatus(a,{pinRemoved:{'H-A01':{saw:true}}}).missing,['saw']);
console.log(JSON.stringify({passed:true,statuses:M.STATUSES.length,capacity:{nordhangChainDays:2.5,talgrundChainHours:+(600/32).toFixed(2)},stanford:['oin','pin','foi','fdi'],fromHPR:true}));
