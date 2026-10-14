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
// Drop into a running bar's day (gap drop): the dropped bar lands after the bar it overlaps, later bars shift.
let gd=M.assign(M.emptyPlan(),snap,['H-A01','H-C01'],'K-01',{mode:'day',day:0});gd=M.assign(gd,snap,['H-B01'],'K-01',{mode:'day',day:2,stage:true});
assert.deepEqual(ids(M.rowItems(snap,gd,K)),['H-A01','H-B01','H-C01']);gd=M.commit(gd,snap);items=M.rowItems(snap,gd,K);
assert.deepEqual(ids(items),['H-A01','H-B01','H-C01']);close(items[0].start,0,1e-9,'earlier bar keeps its start');close(items[1].start,20);close(items[2].start,20+600/32);
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
/* ---------- Calendar fidelity (PLAN_OVERNIGHT §1) ---------- */
// Working days of a span ("560 fm · 20 h · 2,5 Tage"); weekends count nothing.
close(M.workDays(K,0,20),2.5);close(M.workDays(K,32,52),2.5,1e-9,'Friday + Monday half: weekend not counted');
let fv=M.viewModel(snap,M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0}));let fvIt=fv.rows.find(r=>r.id==='K-01').items[0];
assert.equal(fvIt.volume,560);close(fvIt.duration,20);close(fvIt.workDays,2.5);
assert.equal(M.viewModel(snap,M.assign(M.emptyPlan(),snap,['H-B01'],'K-01',{mode:'day',day:0})).rows[0].items[0].volume,600,'chain bar shows the volume of its slowest member (forwarder incl. opening stock)');
// "1 h + 1 m³" product rule on the real rows: H-01 at 1 fm/h and 1 h per weekday blocks the calendar for years.
const tiny={...M.emptyPlan(),resources:{'H-01':{production:{Slutavverkning:1},rate:1,weekly:{mon:1,tue:1,wed:1,thu:1,fri:1,sat:0,sun:0}}}};
const tinyRow=M.rows(snap,tiny).find(r=>r.id==='H-01'),tinyIt=M.viewModel(snap,M.assign(tiny,snap,['H-C01'],'H-01',{mode:'day',day:0})).rows.find(r=>r.id==='H-01').items[0];
close(tinyIt.duration,420);close(tinyIt.workDays,420);assert(tinyIt.endPos>500,'420 working days ≈ 84 weeks');assert.equal(M.weeklyTotal(tinyRow),5);
// Edge drag: the end snaps to a day column and becomes the manual working time.
let rz=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});const rzId=rz.assignments[0].id;
rz=M.resizeItem(rz,snap,rzId,5,{stage:true});let rzIt=M.rowItems(snap,rz,K)[0];assert.equal(rzIt.manualHours,40);assert.equal(rzIt.duration,40);close(rzIt.estimated,20);assert(rz.assignments[0].staged,'edge drag is staged');
close(M.positionOf(K,rzIt.end,true),5,1e-9,'ends Friday evening');
assert.equal(M.resizeItem(rz,snap,rzId,6).assignments[0].manualHours,40,'snapping onto Saturday keeps Friday’s end (0 h day)');
assert.equal(M.resizeItem(rz,snap,rzId,0).assignments[0].manualHours,8,'at least the start day');
assert.equal(M.resizeItem(rz,snap,rzId,4).assignments[0].manualHours,32,'shorten to 4 days');
let rzLate=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});rzLate=M.updateItem(rzLate,snap,rzLate.assignments[0].id,{day:0,minutes:15*60});
assert.equal(M.resizeItem(rzLate,snap,rzLate.assignments[0].id,1).assignments[0].manualHours,2,'15:00 start: rest of Monday = 2 h');
rz=M.commit(rz,snap);assert.equal(M.rowItems(snap,rz,K)[0].manualHours,40,'Spara keeps the manual working time');
assert.equal(M.rowItems(snap,M.updateItem(rz,snap,rzId,{manualHours:null}),K)[0].duration,20,'reset to the computed value');
// Moving within the row keeps the duration (also a manual one); snap to the day.
let sh=M.shiftItem(rz,snap,rzId,7,{stage:true});let shIt=M.rowItems(snap,sh,K)[0];close(shIt.start,40);assert.equal(shIt.duration,40);assert(sh.assignments[0].staged);
let sh2=M.assign(M.emptyPlan(),snap,['H-C01'],'H-01',{mode:'day',day:0});sh2=M.shiftItem(sh2,snap,sh2.assignments[0].id,2);close(M.rowItems(snap,sh2,H)[0].start,16);close(M.rowItems(snap,sh2,H)[0].duration,15);
// Across rows: duration recomputed from the target's rate; with "Start- und Enddatum sperren" the dates stay (manual hours).
let xr=M.assign(M.emptyPlan(),snap,['H-A01'],'H-01',{mode:'day',day:0});const xrId=xr.assignments[0].id;xr=M.updateItem(xr,snap,xrId,{manualHours:30});
const xrFree=M.moveItem(xr,snap,xrId,'F-01',{day:0});const xrFreeIt=M.rowItems(snap,xrFree,F)[0];assert.equal(xrFreeIt.manualHours,null);close(xrFreeIt.duration,560/32,1e-9,'F-01 rate');
const xrLock=M.moveItem(xr,snap,xrId,'F-01',{lock:true,day:9});const xrLockIt=M.rowItems(snap,xrLock,F)[0];close(xrLockIt.start,0,1e-9,'locked: drop day ignored');close(xrLockIt.manualHours,30);close(M.positionOf(F,xrLockIt.end,true),3.75);
const xrChain=M.moveItem(M.assign(M.emptyPlan(),snap,['H-B01'],'H-01',{mode:'day',day:0}),snap,null,'K-01',{});assert.equal(xrChain.assignments[0].rowId,'H-01','unknown item: unchanged');
const toChain=M.assign(M.emptyPlan(),snap,['H-B01'],'H-01',{mode:'day',day:0}),toChainP=M.moveItem(toChain,snap,toChain.assignments[0].id,'K-01',{day:0});close(M.rowItems(snap,toChainP,K)[0].duration,600/32,1e-9,'chain: slowest member');
// Chain planning: member bars (greyed) – harvester with the chain start, forwarder after the lag, each with its own rate.
assert.equal(M.chainLag(snap.chains[0]),1);assert.equal(M.chainLag({}),1);assert.equal(M.chainLag({lag:0}),0);assert.equal(M.chainLag({lag:'3'}),3);assert.equal(K.lag,1);
const ghostsOf=(pl,id,sn=snap)=>M.viewModel(sn,pl).rows.find(r=>r.id===id).ghosts;
let ch=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:0});
let gh=ghostsOf(ch,'H-01')[0],gf=ghostsOf(ch,'F-01')[0];
assert.equal(gh.chainId,'K-01');assert.equal(gh.ghost,true);close(gh.startPos,0);close(gh.endPos,2.5);close(gh.duration,20);
close(gf.startPos,1,1e-9,'forwarder one working day later');close(gf.duration,17.5,1e-9,'560 fm ÷ 32 fm/h');close(gf.endPos,3+1.5/8);close(gf.workDays,17.5/8);
assert.equal(M.viewModel(snap,ch).rows.find(r=>r.id==='K-01').ghosts.length,0,'no ghosts on the chain row');
const lag2={...ch,chains:[{...snap.chains[0],lag:2}]};close(ghostsOf(lag2,'F-01')[0].startPos,2);close(ghostsOf({...ch,chains:[{...snap.chains[0],lag:0}]},'F-01')[0].startPos,0);
assert.equal(M.viewModel(snap,lag2).chainsAll[0].lag,2);
const fri=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:4});close(ghostsOf(fri,'H-01')[0].startPos,4);close(ghostsOf(fri,'F-01')[0].startPos,7,1e-9,'Friday + 1 working day = Monday');
const tg=M.assign(M.emptyPlan(),snap,['H-B01'],'K-01',{mode:'day',day:0});close(ghostsOf(tg,'H-01')[0].duration,520/28);close(ghostsOf(tg,'F-01')[0].duration,600/32);assert.equal(ghostsOf(tg,'F-01')[0].volume,600);
const tgFast={...tg,resources:{'F-01':{production:{Slutavverkning:64}}}};close(ghostsOf(tgFast,'F-01')[0].duration,600/64,1e-9,'forwarder member runs its own rate');close(M.viewModel(snap,tgFast).rows[0].items[0].duration,520/28);
const chMan=M.updateItem(ch,snap,ch.assignments[0].id,{manualHours:40});close(ghostsOf(chMan,'H-01')[0].duration,40);close(ghostsOf(chMan,'F-01')[0].duration,35,1e-9,'manual chain time scales the members');
// Conflicts: a direct bar on a member machine overlapping the chain's member bar (warning only).
let cf=M.assign(ch,snap,['H-C01'],'H-01',{mode:'day',day:1});let cfv=M.viewModel(snap,cf);
assert.deepEqual(cfv.conflicts.map(c=>[c.resourceId,c.day,c.iso]),[['H-01',1,'2026-10-20']]);
assert(cfv.rows.find(r=>r.id==='K-01').items[0].conflict&&cfv.rows.find(r=>r.id==='H-01').items[0].conflict&&cfv.rows.find(r=>r.id==='H-01').ghosts[0].conflict,'both bars marked');
assert(!cfv.rows.find(r=>r.id==='F-01').ghosts[0].conflict);assert.equal(cfv.orders.find(o=>o.id==='H-C01').status,'planned','planning still allowed');
let cfF=M.assign(ch,snap,['H-C01'],'F-01',{mode:'day',day:0});cfF=M.updateItem(cfF,snap,cfF.assignments.find(a=>a.rowId==='F-01').id,{manualHours:8});
assert.deepEqual(M.viewModel(snap,cfF).conflicts,[],'F-01 busy on day 0 only: the lag keeps the chain clear');
cfF=M.updateItem(cfF,snap,cfF.assignments.find(a=>a.rowId==='F-01').id,{manualHours:9});assert.deepEqual(M.viewModel(snap,cfF).conflicts.map(c=>[c.resourceId,c.iso]),[['F-01','2026-10-20']]);
const twoChains={...M.assign(ch,snap,[],'K-01',{}),chains:[...snap.chains,{id:'K-02',name:'H-01 solo',kind:'drivningskedja',members:['H-01']}]};
const tc=M.assign(twoChains,snap,['H-C01'],'K-02',{mode:'day',day:1});assert.deepEqual(M.viewModel(snap,tc).conflicts.map(c=>[c.resourceId,c.day]),[['H-01',1]],'member bars of two chains');
const seqOk=M.assign(ch,snap,['H-C01'],'K-01',{mode:'after'});assert.deepEqual(M.viewModel(snap,seqOk).conflicts,[],'chain bars in sequence never conflict with themselves');
// Rate change re-flow: contiguous unsent bars keep following; a bar after a gap only moves when run into; sent bars stay.
let rf=M.assign(M.emptyPlan(),snap,['H-A01','H-C01'],'H-01',{mode:'day',day:0});rf=M.assign(rf,snap,['H-B01'],'H-01',{mode:'day',day:7});
const idOf=(pl,o)=>pl.assignments.find(a=>a.orderId===o).id,startOf=(pl,o)=>pl.assignments.find(a=>a.orderId===o).startHour;
assert.deepEqual([startOf(rf,'H-A01'),startOf(rf,'H-C01'),startOf(rf,'H-B01')],[0,20,40]);
const slower={...rf,resources:{'H-01':{production:{Slutavverkning:14},rate:14}}};let rfOut=M.reflow(rf,slower,snap,'H-01');
assert.deepEqual([startOf(rfOut,'H-A01'),startOf(rfOut,'H-C01'),startOf(rfOut,'H-B01')],[0,40,70]);assert.deepEqual([...rfOut.reflowed].sort(),[idOf(rf,'H-A01'),idOf(rf,'H-B01'),idOf(rf,'H-C01')].sort());
assert(rfOut.assignments.find(a=>a.orderId==='H-C01').staged,'moved bars are staged');assert(!rfOut.assignments.find(a=>a.orderId==='H-A01').staged);
const faster={...rf,resources:{'H-01':{production:{Slutavverkning:56},rate:56}}};rfOut=M.reflow(rf,faster,snap,['H-01']);
assert.deepEqual([startOf(rfOut,'H-A01'),startOf(rfOut,'H-C01'),startOf(rfOut,'H-B01')],[0,10,40],'contiguous bar follows, bar after a gap keeps its start');
const rfSent=M.send(rf,snap,{orderIds:['H-C01']});rfOut=M.reflow(rfSent,{...rfSent,resources:slower.resources},snap,'H-01');
assert.deepEqual([startOf(rfOut,'H-A01'),startOf(rfOut,'H-C01'),startOf(rfOut,'H-B01')],[0,20,50],'sent bar stays');
assert.deepEqual(M.reflow(rf,{...rf,resources:{'F-01':{production:{Slutavverkning:10}}}},snap,'F-01').reflowed,[],'other resource: nothing on H-01 changes');
/* Map objects (PLAN_OVERNIGHT §3): legacy [x,y] landings converted, numbering, symbols, update/remove, route order, OIN/FOI. */
{const o=snap.orders[0],legacy=M.normalizePlan({edits:{'H-A01':{landings:[[10,20]]}}});
assert.deepEqual(legacy.edits['H-A01'].landings,[{no:2,point:[10,20],id:'L2'}],'milestone-2 point converted');
let mp=M.addLanding(legacy,'H-A01',[30.04,40]);assert.deepEqual(mp.lastObject,{orderId:'H-A01',kind:'landing',id:'L3'});assert.deepEqual(legacy.edits['H-A01'].landings.length,1,'pure');
assert.deepEqual(M.orderLandings(o,mp).map(l=>[l.id,l.point]),[['P-A01',o.landing.point],['P-A01-2',[10,20]],['P-A01-3',[30,40]]]);
mp=M.addSymbol(mp,'H-A01','turn',[5,5]);mp=M.addSymbol(mp,'H-A01','bogus',[6,6]);assert.deepEqual(M.orderSymbols(o,mp).map(s=>[s.code,s.kind]),[['H-A01-S1','turn'],['H-A01-S2','warning']]);
mp=M.updateMapObject(mp,'H-A01','symbol','S2',{kind:'protect',point:[7,8]});assert.deepEqual(M.orderSymbols(o,mp)[1].point,[7,8]);assert.equal(M.orderSymbols(o,mp)[1].kind,'protect');
mp=M.removeMapObject(mp,'H-A01','landing','L2');mp=M.addLanding(mp,'H-A01',[1,1]);assert.deepEqual(M.orderLandings(o,mp).map(l=>l.id),['P-A01','P-A01-3','P-A01-4'],'names stay stable after a delete');
assert.deepEqual(M.setRouteOrder(mp,['H-C01','H-A01','H-C01',3]).routeOrder,['H-C01','H-A01']);
const ctx={contract:snap.meta.contract,landings:M.orderLandings(o,mp),symbols:M.orderSymbols(o,mp)};
assert.deepEqual(M.toOIN(o,ctx).OperatingInstruction.Landings.map(l=>l.LandingKey),['P-A01','P-A01-3','P-A01-4']);assert.deepEqual(M.toOIN(o,ctx).OperatingInstruction.MapSymbols.map(s=>s.Type),['turn','protect']);
assert.deepEqual(M.toFOI(o,ctx).ForwardingObjectInstruction.Landings.length,3);assert.deepEqual(M.toOIN(o,{}).OperatingInstruction.Landings.map(l=>l.LandingKey),['P-A01'],'without ctx: the game landing');
const sent=M.send(M.assign(mp,snap,['H-A01'],'K-01',{mode:'day',day:0}),snap,{orderIds:['H-A01']});assert.deepEqual(sent.instructions['H-A01'].files.oin.OperatingInstruction.Landings.length,3,'send carries the landings');
assert(Array.isArray(o.routes.harvester)&&o.routes.harvester.length>2&&o.routes.forwarder.length>2,'bridge: routes in image units');}
console.log(JSON.stringify({passed:true,statuses:M.STATUSES.length,capacity:{nordhangChainDays:2.5,talgrundChainHours:+(600/32).toFixed(2)},stanford:['oin','pin','foi','fdi'],fromHPR:true}));
