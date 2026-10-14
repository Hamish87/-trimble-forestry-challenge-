/* CFHarvest replica · planning domain model (SPEC_PLANNING.md §2–§4).
   Canonical status enum, calendar capacity maths, pure plan operations and StanForD-2010-shaped emitters.
   No knowledge of the game's state shape (that is bridge.js) and no simulation: volumes come in as data. */
'use strict';
const CFHModel=(()=>{
const STATUSES=['available','planned','sent','harvesting','felled','forwarding','completed'];
// web = list label [MW]; spec = spec-sheet status [SS]; tone = calendar colour [MW] (done = [DEMO]).
const STATUS_INFO={
  available:{web:'Ledig',label:'Verfügbar',spec:'Available',tone:'free'},
  planned:{web:'Tilldelad',label:'Geplant, nicht gesendet',spec:'Planned',tone:'dimmed'},
  sent:{web:'Tilldelad',label:'An Ressource gesendet',spec:'Sent to Resource',tone:'purple'},
  harvesting:{web:'Påbörjad',label:'Ernte begonnen',spec:'Harvesting Started',tone:'yellow'},
  felled:{web:'Påbörjad',label:'Fällung beendet',spec:'Felling Ended',tone:'yellow'},
  forwarding:{web:'Påbörjad',label:'Rücken begonnen',spec:'Forwarding Started',tone:'yellow'},
  completed:{web:'Avslutad',label:'Abgeschlossen',spec:'Completed',tone:'done'}};
// Planner-triggered transitions. Production statuses are reported by HPR/FPR, never set by the planner.
const PLANNER_TRANSITIONS={available:['planned'],planned:['available','sent'],sent:['planned','available','sent']};
const rank=s=>STATUSES.indexOf(s);
function canTransition(from,to){return (PLANNER_TRANSITIONS[from]||[]).includes(to);}
function higher(a,b){return rank(a)>=rank(b)?a:b;}
/* Production-driven status from reported facts. Linear spec order: harvesting → felled → forwarding → completed. */
function deriveStatus(f){
  const harvestStarted=(f.felledByShifts||0)>.001,harvestDone=f.remaining!==undefined&&f.remaining<1;
  if(harvestDone&&(f.forestStock||0)<.1&&(harvestStarted||(f.forwarded||0)>0))return 'completed';
  if(harvestDone&&(f.forwarded||0)>.001)return 'forwarding';
  if(harvestDone&&harvestStarted)return 'felled';
  if(harvestStarted)return 'harvesting';
  if((f.forwarded||0)>.001)return 'forwarding';
  if(f.sent)return 'sent';
  if(f.planned)return 'planned';
  return 'available';
}

/* ---------- Calendar capacity (volume ÷ production rate ÷ weekly hours) [MW][VS] ---------- */
const WEEKDAYS=['mon','tue','wed','thu','fri','sat','sun'];
const CALENDAR_START=Date.UTC(2026,9,19); // Monday of the demo week; game shift n = calendar day n-1 [DEMO]
const DAY_MS=864e5,MAX_DAYS=3660;
const dayISO=i=>new Date(CALENDAR_START+i*DAY_MS).toISOString().slice(0,10);
function dayIndexOf(iso){const t=Date.parse(String(iso)+'T00:00:00Z');return Number.isFinite(t)?Math.round((t-CALENDAR_START)/DAY_MS):null;}
const weekday=i=>WEEKDAYS[((i%7)+7)%7];
function hoursOn(row,i){if(i<0)return 0;const o=row.overrides?.[i];return Math.max(0,Number(o??row.weekly?.[weekday(i)])||0);}
function weeklyTotal(row){return WEEKDAYS.reduce((a,k)=>a+Math.max(0,Number(row.weekly?.[k])||0),0);}
function startHourOfDay(row,day){let h=0;for(let d=0;d<day;d++)h+=hoursOn(row,d);return h;}
/** Working hour → fractional calendar day. End positions stay on the last working day instead of jumping over a weekend. */
function positionOf(row,hour,end=false){
  if(weeklyTotal(row)<=0)return null;let cum=0;
  for(let d=0;d<MAX_DAYS;d++){const cap=hoursOn(row,d);if(cap>0&&(end?hour<=cum+cap:hour<cum+cap))return d+Math.max(0,hour-cum)/cap;cum+=cap;}
  return MAX_DAYS;
}
function overlapOnDay(row,item,day){const s=startHourOfDay(row,day),cap=hoursOn(row,day);return Math.max(0,Math.min(item.end,s+cap)-Math.max(item.start,s));}
/** Hours a row needs for an order: each member works its own volume at its own rate; the chain waits for the slowest. */
function durationHours(order,row){
  const members=row.memberResources?.length?row.memberResources:[row];
  const hours=members.map(m=>{const rate=Number(m.rate)||0,vol=m.type==='forwarder'?order.estimatedVolume+(order.openingStock||0):order.estimatedVolume;return rate>0?vol/rate:Infinity;});
  return Math.max(...hours);
}

/* ---------- Resources, chains and rows ---------- */
function resources(snapshot,plan={}){
  const edits=plan.resources||{};
  return [...snapshot.resources,...(plan.extraResources||[])].map(r=>{const e=edits[r.id]||{};return{...r,...e,weekly:{...r.weekly,...(e.weekly||{})},manual:{...(e.manual||{})}};});
}
function chains(snapshot,plan={}){return plan.chains||snapshot.chains;}
function rows(snapshot,plan={}){
  const res=resources(snapshot,plan),plannable=res.filter(r=>r.active!==false&&r.plannable!==false);
  const chainRows=chains(snapshot,plan).map(c=>{const memberResources=c.members.map(id=>res.find(r=>r.id===id)).filter(Boolean),weekly={};for(const k of WEEKDAYS)weekly[k]=memberResources.length?Math.min(...memberResources.map(m=>Number(m.weekly[k])||0)):0;return{id:c.id,kind:'chain',name:c.name,members:c.members,memberResources,weekly,rate:memberResources.length?Math.min(...memberResources.map(m=>m.rate)):0};});
  return [...chainRows,...plannable.map(r=>({id:r.id,kind:'resource',name:r.name,type:r.type,members:[r.id],memberResources:[r],weekly:r.weekly,rate:r.rate,gameKey:r.gameKey}))];
}

/* ---------- Plan (the planner's own data; never game state) ---------- */
function emptyPlan(){return{schema:1,seq:0,assignments:[],instructions:{},edits:{},resources:{},extraResources:[],chains:null,orderBook:{},routeOrder:[],basis:null};}
function normalizePlan(p){const base=emptyPlan();if(!p||typeof p!=='object')return base;const out={...base,...p};for(const k of ['assignments','extraResources','routeOrder'])if(!Array.isArray(out[k]))out[k]=[];for(const k of ['instructions','edits','resources','orderBook'])if(!out[k]||typeof out[k]!=='object')out[k]={};out.assignments=out.assignments.filter(a=>a&&typeof a.orderId==='string'&&typeof a.rowId==='string'&&Number.isFinite(a.startHour));return out;}
const clone=x=>structuredClone(x);
function rowItems(snapshot,plan,row){
  return plan.assignments.filter(a=>a.rowId===row.id).map(a=>{const order=snapshot.orders.find(o=>o.id===a.orderId);if(!order)return null;const d=durationHours(order,row);return{...a,order,duration:d,start:a.startHour,end:a.startHour+d};}).filter(Boolean).sort((x,y)=>x.start-y.start||x.seq-y.seq);
}
/** Later items shift so a row never overlaps ("later items shift on save" [MW]). The pinned order keeps its slot on ties. */
function normalizeRow(plan,snapshot,rowId,pinned){
  const row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)return plan;
  const items=rowItems(snapshot,plan,row).sort((x,y)=>x.start-y.start||(x.orderId===pinned?-1:y.orderId===pinned?1:x.seq-y.seq));
  let cursor=-Infinity;for(const it of items){const a=plan.assignments.find(x=>x.orderId===it.orderId);if(it.start<cursor-1e-9)a.startHour=cursor;cursor=a.startHour+it.duration;}
  return plan;
}
function currentDayStart(snapshot,row){return startHourOfDay(row,snapshot.calendar.currentDay);}
function lastEnd(snapshot,plan,row){const items=rowItems(snapshot,plan,row);return items.length?Math.max(...items.map(i=>i.end)):0;}
/** Flytta till resurs: plan one or several orders onto a row, at a day or "after last planned". */
function assign(planIn,snapshot,orderIds,rowId,opts={}){
  const plan=normalizePlan(clone(planIn)),row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)throw Error('Unbekannte Ressource');
  const today=currentDayStart(snapshot,row);let at=opts.mode==='day'?Math.max(today,startHourOfDay(row,Math.max(0,opts.day|0))):null;
  for(const id of orderIds){
    const order=snapshot.orders.find(o=>o.id===id);if(!order||order.closed)continue;
    plan.assignments=plan.assignments.filter(a=>a.orderId!==id);
    const start=at??Math.max(today,lastEnd(snapshot,plan,row));
    plan.assignments.push({orderId:id,rowId,startHour:start,sent:false,sentRound:null,sentVersion:0,seq:++plan.seq});
    normalizeRow(plan,snapshot,rowId,id);at=null;
  }
  return plan;
}
function unassign(planIn,orderIds){const plan=normalizePlan(clone(planIn));plan.assignments=plan.assignments.filter(a=>!orderIds.includes(a.orderId));return plan;}
/** Insert between items: index 0 = before the first item; later items shift. */
function insertAt(planIn,snapshot,orderId,rowId,index){
  let plan=normalizePlan(clone(planIn));const row=rows(snapshot,plan).find(r=>r.id===rowId),order=snapshot.orders.find(o=>o.id===orderId);if(!row||!order||order.closed)return plan;
  plan.assignments=plan.assignments.filter(a=>a.orderId!==orderId);
  const items=rowItems(snapshot,plan,row),today=currentDayStart(snapshot,row);
  const start=index<=0?Math.max(today,items[0]?.start??today):Math.max(today,items[Math.min(index,items.length)-1].end);
  plan.assignments.push({orderId,rowId,startHour:start,sent:false,sentRound:null,sentVersion:0,seq:++plan.seq});
  return normalizeRow(plan,snapshot,rowId,orderId);
}
/** Komprimera: remove gaps, keep order. Returns the preview the planner confirms. */
function compressPreview(snapshot,plan,rowId){
  const row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)return [];
  // Pack from today's shift start; an item that already began earlier keeps its start.
  const items=rowItems(snapshot,plan,row),today=currentDayStart(snapshot,row);let cursor=Math.min(items[0]?.start??today,today);
  return items.map(it=>{const out={orderId:it.orderId,oldStart:it.start,newStart:cursor,newEnd:cursor+it.duration,row};cursor+=it.duration;return out;});
}
function compress(planIn,snapshot,rowIds){const plan=normalizePlan(clone(planIn));for(const rowId of rowIds)for(const p of compressPreview(snapshot,plan,rowId))plan.assignments.find(a=>a.orderId===p.orderId).startHour=p.newStart;return plan;}
function setEstimatedStart(planIn,snapshot,orderId,iso){
  const plan=normalizePlan(clone(planIn)),a=plan.assignments.find(x=>x.orderId===orderId),day=dayIndexOf(iso);if(!a||day===null)return plan;
  const row=rows(snapshot,plan).find(r=>r.id===a.rowId);a.startHour=Math.max(currentDayStart(snapshot,row),startHourOfDay(row,day));return normalizeRow(plan,snapshot,a.rowId,orderId);
}
/** Skicka till resurs / Starta, överför till mätdon: mark sent and generate OIN/PIN (+FOI/FDI). */
function send(planIn,snapshot,{rowIds=[],orderIds=[]}){
  const plan=normalizePlan(clone(planIn)),allRows=rows(snapshot,plan),round=snapshot.meta.round,version=snapshot.meta.requiredVersion;
  for(const a of plan.assignments){
    if(!rowIds.includes(a.rowId)&&!orderIds.includes(a.orderId))continue;
    const order=snapshot.orders.find(o=>o.id===a.orderId),row=allRows.find(r=>r.id===a.rowId);if(!order||order.closed||!row)continue;
    Object.assign(a,{sent:true,sentRound:round,sentVersion:version});
    plan.instructions[a.orderId]=instructionsFor(order,row,snapshot,plan);
  }
  return plan;
}

/* ---------- StanForD 2010-shaped JSON (demo; element names to be verified against the Skogforsk schema) ---------- */
function header(ctx,fileType){return{fileType,standard:'StanForD 2010',shape:'demo JSON',HeaderInformation:{CreationDate:ctx.createdAt||dayISO(ctx.day??0),SenderApplication:'CFHarvest Planning · demo replica',Sender:ctx.company||'Trimble Forestry demo contractor',ContractNumber:ctx.contract?.id}};}
const lengthOf=spec=>spec?Number(String(spec).replace(',','.')):null;
function toOIN(order,ctx){
  return{...header(ctx,'oin'),OperatingInstruction:{ObjectDefinition:{ObjectKey:order.id,ObjectUserID:order.id,ObjectName:order.name,ContractNumber:ctx.contract?.id,Client:order.client,LoggingForm:'Avverkning',StartDate:ctx.start||null,EndDate:ctx.end||null,SubObject:[{SubObjectKey:1,SubObjectName:order.name,SpeciesGroup:order.species,EstimatedVolume_m3sub:order.estimatedVolume}]},
    MachineDefinition:ctx.machine?{MachineKey:ctx.machine.id,StanForDCode:ctx.machine.stanford}:null,
    ProductInstructionReferences:order.assortments.filter(a=>a.pin).map(a=>({ProductKey:order.id+'-'+a.code,ProductUserID:a.code,PINVersion:order.pin.required})),
    Landings:[{LandingKey:order.landing.id,Coordinates:order.landing.point}],
    EnvironmentalRestrictions:order.bio?[{Code:order.bio.code,Text:order.bio.instruction}]:[],
    BoundaryReference:{Polygon:order.boundary,Note:'fictional game overlay'}}};
}
function toPIN(assortment,order,ctx){
  return{...header(ctx,'pin'),ProductInstruction:{ProductDefinition:{ProductKey:order.id+'-'+assortment.code,ProductUserID:assortment.code,ProductName:assortment.name,ProductVersion:order.pin.required,SpeciesGroupName:order.species,NominalLength_m:assortment.key==='saw'?lengthOf(order.pin.spec):null,DeliveryDestination:assortment.receiver,EstimatedVolume_m3sub:assortment.estimatedVolume}}};
}
function toFOI(order,ctx){return{...header(ctx,'foi'),ForwardingObjectInstruction:{ObjectDefinition:{ObjectKey:order.id,ObjectName:order.name,ContractNumber:ctx.contract?.id},MachineDefinition:ctx.forwarder?{MachineKey:ctx.forwarder.id,StanForDCode:ctx.forwarder.stanford}:null,Landings:[{LandingKey:order.landing.id,Coordinates:order.landing.point}],ExpectedVolume_m3sub:order.estimatedVolume+(order.openingStock||0)}};}
function toFDI(order,ctx){return{...header(ctx,'fdi'),ForwardingDeliveryInstruction:{Deliveries:order.assortments.filter(a=>a.pin).map((a,i)=>({DeliveryKey:i+1,ProductKey:order.id+'-'+a.code,ProductName:a.name,FromLanding:order.landing.id,Destination:a.receiver,ExpectedVolume_m3sub:a.estimatedVolume+(a.openingVolume||0)}))}};}
function instructionsFor(order,row,snapshot,plan){
  const members=row.memberResources||[],h=members.find(m=>m.type==='harvester'),f=members.find(m=>m.type==='forwarder'),a=plan.assignments.find(x=>x.orderId===order.id),start=a?positionOf(row,a.startHour):null,end=a?positionOf(row,a.startHour+durationHours(order,row),true):null;
  const ctx={contract:snapshot.meta.contract,day:snapshot.calendar.currentDay,machine:h,forwarder:f,start:start===null?null:dayISO(Math.floor(start)),end:end===null?null:dayISO(Math.max(0,Math.ceil(end)-1))};
  const files={oin:h?toOIN(order,ctx):null,pin:h?order.assortments.filter(x=>x.pin).map(x=>toPIN(x,order,ctx)):[],foi:f?toFOI(order,ctx):null,fdi:f?toFDI(order,ctx):null};
  return{round:snapshot.meta.round,pinVersion:snapshot.meta.requiredVersion,rowId:row.id,files};
}
/** HPR/FPR production messages → production follow-up (estimated, felled, forwarded, forest stock = felled − forwarded) [SS][MM]. */
function fromHPR(messages){
  const by={},get=k=>by[k]??={felled:0,felledByShifts:0,opening:0,forwarded:0,forestStock:0,reports:[],lastRound:0};
  for(const m of messages||[]){
    if(!m||!m.objectKey||!Number.isFinite(m.volume))continue;const o=get(m.objectKey);
    if(m.type==='HPR'){o.felled+=m.volume;if(m.kind==='opening')o.opening+=m.volume;else o.felledByShifts+=m.volume;}
    else if(m.type==='FPR')o.forwarded+=m.volume;else continue;
    o.reports.push(m);o.lastRound=Math.max(o.lastRound,m.round||0);
  }
  const totals={felled:0,forwarded:0,forestStock:0};
  for(const o of Object.values(by)){o.forestStock=o.felled-o.forwarded;totals.felled+=o.felled;totals.forwarded+=o.forwarded;totals.forestStock+=o.forestStock;}
  return{byObject:by,totals};
}

/* ---------- View model: snapshot (from bridge) + plan ---------- */
function dispatchPlan(snapshot,plan,allRows=rows(snapshot,plan)){
  const day=snapshot.calendar.currentDay,out={harvester:null,forwarder:null,issues:[],day};
  for(const key of ['harvester','forwarder']){
    const candidates=[];
    for(const row of allRows){if(!row.memberResources.some(m=>m.gameKey===key))continue;for(const it of rowItems(snapshot,plan,row)){const overlap=overlapOnDay(row,it,day);if(overlap>1e-9)candidates.push({it,row,overlap});}}
    candidates.sort((a,b)=>b.overlap-a.overlap||a.it.start-b.it.start);
    const pick=candidates[0];if(!pick)continue;const{it}=pick;
    if(it.order.closed)out.issues.push({orderId:it.orderId,machine:key,code:'closed'});
    else if(!it.sent)out.issues.push({orderId:it.orderId,machine:key,code:'notSent'});
    else if(it.sentVersion<snapshot.meta.requiredVersion)out.issues.push({orderId:it.orderId,machine:key,code:'outdated'});
    else out[key]=it.orderId;
  }
  return out;
}
function viewModel(snapshot,planIn){
  const plan=normalizePlan(planIn),allRows=rows(snapshot,plan),hpr=fromHPR(snapshot.production.messages);
  const rowsOut=allRows.map(row=>({...row,items:rowItems(snapshot,plan,row).map(it=>({...it,startPos:positionOf(row,it.start),endPos:positionOf(row,it.end,true),outdated:it.sent&&it.sentVersion<snapshot.meta.requiredVersion}))}));
  const orders=snapshot.orders.map(o=>{
    const a=plan.assignments.find(x=>x.orderId===o.id),row=a&&rowsOut.find(r=>r.id===a.rowId),item=row?.items.find(i=>i.orderId===o.id),p=hpr.byObject[o.id]||{felled:0,felledByShifts:0,opening:0,forwarded:0,forestStock:0,reports:[]};
    const sentOk=!!(a?.sent&&a.sentVersion>=snapshot.meta.requiredVersion);
    const status=higher(deriveStatus({planned:!!a,sent:sentOk||o.gameSent,felledByShifts:p.felledByShifts,forwarded:p.forwarded,forestStock:p.forestStock,remaining:o.remaining}),o.gameSent?'sent':'available');
    const edit=plan.edits[o.id]||{},instr=plan.instructions[o.id];
    const pinFlag=o.pin.loaded!==o.pin.spec&&!(instr&&instr.pinVersion>=o.pin.required&&a?.sent);
    const startISO=item?.startPos!=null?dayISO(Math.floor(item.startPos)):null,endISO=item?.endPos!=null?dayISO(Math.max(Math.floor(item.startPos),Math.ceil(item.endPos)-1)):null;
    return{...o,status,info:STATUS_INFO[status],assignment:a||null,row:row||null,item:item||null,followUp:p,plannedStart:startISO,plannedEnd:edit.estEnd||endISO,endManual:!!edit.estEnd,message:edit.message||'',instructions:instr||null,pinFlag,outdated:!!item?.outdated};
  });
  const dispatch=dispatchPlan(snapshot,plan,allRows);
  const orderBook=snapshot.orderBook.map(b=>({...b,confirmed:!!plan.orderBook[b.id]?.confirmed,planned:orders.filter(o=>o.assignment&&o.status!=='completed').reduce((s,o)=>s+(o.assortments.find(x=>x.key===b.assortment)?.estimatedVolume||0),0)}));
  return{...snapshot,plan,rows:rowsOut,orders,dispatch,orderBook,followUp:hpr,resourcesAll:resources(snapshot,plan),chainsAll:chains(snapshot,plan)};
}
return{STATUSES,STATUS_INFO,PLANNER_TRANSITIONS,canTransition,deriveStatus,WEEKDAYS,CALENDAR_START,dayISO,dayIndexOf,weekday,hoursOn,weeklyTotal,startHourOfDay,positionOf,overlapOnDay,durationHours,resources,chains,rows,emptyPlan,normalizePlan,rowItems,normalizeRow,assign,unassign,insertAt,compressPreview,compress,setEstimatedStart,send,toOIN,toPIN,toFOI,toFDI,instructionsFor,fromHPR,dispatchPlan,viewModel};
})();
if(typeof module!=='undefined')module.exports=CFHModel;
