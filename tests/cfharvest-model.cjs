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
console.log(JSON.stringify({passed:true,statuses:M.STATUSES.length,capacity:{nordhangChainDays:2.5,talgrundChainHours:+(600/32).toFixed(2)},stanford:['oin','pin','foi','fdi'],fromHPR:true}));
