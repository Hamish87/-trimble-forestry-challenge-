/* CFHarvest replica · planning domain model (SPEC_PLANNING.md §2–§4).
   Canonical status enum, calendar capacity maths, pure plan operations and StanForD-2010-shaped emitters.
   No knowledge of the game's state shape (that is bridge.js) and no simulation: volumes come in as data.
   Milestone 2: assignments have their own id, so one work order can sit on several resources (Kopiera [M60][MW]);
   operations can be staged (no overlap resolution) and are resolved by commit() = Spara [M52][M68]. */
'use strict';
const CFHModel=(()=>{
const STATUSES=['available','planned','sent','harvesting','felled','forwarding','completed'];
/* web = Swedish list label [MW]; de = German replica label; title = long status text of the order title [M73][M76][V6-1:10];
   spec = spec-sheet status [SS]; tone = legacy colour key (kept for milestone 1 callers). */
const STATUS_INFO={
  available:{web:'Ledig',de:'Frei',label:'Verfügbar',title:'Arbeitsauftrag an CFHarvest gesendet (planbar)',titleSv:'Arbetsorder skickad till CFHarvest (Planerbar)',spec:'Available',tone:'free'},
  planned:{web:'Tilldelad',de:'Geplant',label:'Geplant, nicht gesendet',title:'Arbeitsauftrag geplant',titleSv:'Arbetsorder planerad',spec:'Planned',tone:'dimmed'},
  sent:{web:'Tilldelad',de:'Gesendet',label:'An Ressource gesendet',title:'Arbeitsauftrag an Ressource gesendet',titleSv:'Arbetsorder skickad till resurs',spec:'Sent to Resource',tone:'purple'},
  harvesting:{web:'Påbörjad',de:'Begonnen',label:'Ernte begonnen',title:'Ernte begonnen',titleSv:'Avverkning startad',spec:'Harvesting Started',tone:'yellow'},
  felled:{web:'Påbörjad',de:'Begonnen',label:'Fällung beendet',title:'Fällung beendet',titleSv:'Avverkning avslutad',spec:'Felling Ended',tone:'yellow'},
  forwarding:{web:'Påbörjad',de:'Begonnen',label:'Rücken begonnen',title:'Rücken begonnen',titleSv:'Skotning Startad',spec:'Forwarding Started',tone:'yellow'},
  completed:{web:'Avslutad',de:'Abgeschlossen',label:'Abgeschlossen',title:'Abgeschlossen',titleSv:'Avslutad',spec:'Completed',tone:'done'}};
// Maßnahmen with production data per resource [M22]. Keys are the Swedish product terms; de = replica label.
const OPERATIONS=[{key:'Slutavverkning',de:'Endnutzung',group:'drivning'},{key:'Första gallring',de:'Erstdurchforstung',group:'drivning'},{key:'Gallring',de:'Durchforstung',group:'drivning'}];
const opLabel=k=>OPERATIONS.find(o=>o.key===k)?.de||k;
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

/* ---------- Calendar capacity [M23][M30][M72][VS] ---------- */
const WEEKDAYS=['mon','tue','wed','thu','fri','sat','sun'];
const CALENDAR_START=Date.UTC(2026,9,19); // Monday of the demo week; game shift n = calendar day n-1 [DEMO]
const DAY_MS=864e5,MAX_DAYS=3660,START_CLOCK=9; // working day starts 09:00 [M72]
const dayISO=i=>new Date(CALENDAR_START+i*DAY_MS).toISOString().slice(0,10);
function dayIndexOf(iso){const t=Date.parse(String(iso)+'T00:00:00Z');return Number.isFinite(t)?Math.round((t-CALENDAR_START)/DAY_MS):null;}
const weekday=i=>WEEKDAYS[((i%7)+7)%7];
const mondayOf=i=>i-(((i%7)+7)%7);
/** Hours on calendar day i: Veckokalender override (days) → Veckoarbetstid (weekly). Chains work the hours all members have. */
function hoursOn(row,i){
  if(i<0)return 0;const ms=row.memberResources;
  if(ms&&ms.length>1)return Math.min(...ms.map(m=>hoursOn(m,i)));
  const src=ms&&ms.length===1&&ms[0]!==row?ms[0]:row,o=src.days?.[i]??row.overrides?.[i];
  return Math.max(0,Number(o??src.weekly?.[weekday(i)])||0);
}
function weeklyTotal(row){const ms=row.memberResources;if(ms&&ms.length>1)return WEEKDAYS.reduce((a,k)=>a+Math.min(...ms.map(m=>Math.max(0,Number(m.weekly?.[k])||0))),0);return WEEKDAYS.reduce((a,k)=>a+Math.max(0,Number(row.weekly?.[k])||0),0);}
/** Any working hours at all (weekly pattern or a Veckokalender day override)? */
function hasCapacity(row){if(weeklyTotal(row)>0)return true;const ms=row.memberResources?.length?row.memberResources:[row];return ms.length===1&&Object.values(ms[0].days||{}).some(v=>Number(v)>0);}
function startHourOfDay(row,day){let h=0;for(let d=0;d<day;d++)h+=hoursOn(row,d);return h;}
/** Working hour → fractional calendar day. End positions stay on the last working day instead of jumping over a weekend. */
function positionOf(row,hour,end=false){
  if(!hasCapacity(row))return null;let cum=0;
  for(let d=0;d<MAX_DAYS;d++){const cap=hoursOn(row,d);if(cap>0&&(end?hour<=cum+cap:hour<cum+cap))return d+Math.max(0,hour-cum)/cap;cum+=cap;}
  return MAX_DAYS;
}
/** Working hour → calendar day + clock time (day starts 09:00 and consumes that day's hours) [M72]. */
function timeOf(row,hour,end=false){
  if(!hasCapacity(row))return null;let cum=0;
  for(let d=0;d<MAX_DAYS;d++){const cap=hoursOn(row,d);if(cap>0&&(end?hour<=cum+cap+1e-9:hour<cum+cap-1e-9)){const into=Math.max(0,Math.min(cap,hour-cum)),mins=Math.round((START_CLOCK+into)*60);return{day:d,iso:dayISO(d),into,minutes:mins,clock:String(Math.floor(mins/60)%24).padStart(2,'0')+':'+String(mins%60).padStart(2,'0')};}cum+=cap;}
  return null;
}
/** Calendar day + clock time (minutes after midnight) → working hour on that row. Before 09:00 = day start. */
function hourAt(row,day,minutes=START_CLOCK*60){const cap=hoursOn(row,day),into=Math.max(0,Math.min(cap,(minutes-START_CLOCK*60)/60));return startHourOfDay(row,day)+into;}
/** Working hours between two calendar positions (used by "Lås start- och slutdatumen"). */
function hourAtPosition(row,pos){const d=Math.floor(pos),f=pos-d;return startHourOfDay(row,d)+f*hoursOn(row,d);}
function overlapOnDay(row,item,day){const s=startHourOfDay(row,day),cap=hoursOn(row,day);return Math.max(0,Math.min(item.end,s+cap)-Math.max(item.start,s));}
/** Working days a span of working hours occupies on a row ("2,5 Tage"): sum per day of hours used / that day's hours. */
function workDays(row,start,end){
  if(!(end>start)||!hasCapacity(row))return 0;let cum=0,days=0;
  for(let d=0;d<MAX_DAYS&&cum<end;d++){const cap=hoursOn(row,d);if(cap>0){const used=Math.max(0,Math.min(end,cum+cap)-Math.max(start,cum));days+=used/cap;}cum+=cap;}
  return days;
}
/** Working hour shifted by n working days on a row (same share of the day; 0-hour days do not count) [DEMO: chain lag]. */
function addWorkingDays(row,hour,n){
  const pos=positionOf(row,hour);if(pos==null||!(n>0))return hour;let d=Math.floor(pos),left=Math.round(n);const f=pos-d;
  for(let guard=0;left>0&&guard<MAX_DAYS;guard++){d++;if(hoursOn(row,d)>0)left--;}
  return startHourOfDay(row,d)+f*hoursOn(row,d);
}
/** Working hour at the end of the day column before `boundary` (bar end snapped to a day column). */
const hourAtBoundary=(row,boundary)=>startHourOfDay(row,Math.max(0,boundary|0));
/** Production rate of a resource for a Maßnahme (Produktionsdata [M22]); falls back to the general rate. */
function rateFor(m,op){const v=Number(m?.production?.[op]);return v>0?v:Number(m?.rate)||0;}
/** Arbetsmängd of a member for an order: the forwarder also moves the opening forest stock. */
const workVolume=(order,m)=>m.type==='forwarder'?order.estimatedVolume+(order.openingStock||0):order.estimatedVolume;
/** Uppskattad arbetstid per member [M72]: Σ Arbetsmängd ÷ production rate; the chain waits for the slowest member. */
function estimate(order,row){
  const members=row.memberResources?.length?row.memberResources:[row];
  const lines=members.map(m=>{const rate=rateFor(m,order.operation),vol=workVolume(order,m);return{resourceId:m.id,resource:m.name,type:m.type,operation:order.operation,volume:vol,rate,hours:rate>0?vol/rate:Infinity};});
  return{lines,hours:Math.max(...lines.map(l=>l.hours))};
}
function durationHours(order,row){return estimate(order,row).hours;}

/* ---------- Resources, chains and rows ---------- */
function resources(snapshot,plan={}){
  const edits=plan.resources||{};
  return [...snapshot.resources,...(plan.extraResources||[])].map(r=>{const e=edits[r.id]||{};return{...r,...e,weekly:{...r.weekly,...(e.weekly||{})},production:{...(r.production||{}),...(e.production||{})},days:{...(r.days||{}),...(e.days||{})},manual:{...(e.manual||{})}};});
}
function chains(snapshot,plan={}){return plan.chains||snapshot.chains;}
/** "Vorlauf Harvester -> Forwarder" of a chain in working days (product: the forwarder is planned a few days after the harvester) [DEMO default 1]. */
const DEFAULT_LAG=1;
function chainLag(c){const v=c?.lag==null||c.lag===''?NaN:Number(c.lag);return Number.isFinite(v)&&v>=0?Math.min(30,Math.round(v)):DEFAULT_LAG;}
function rows(snapshot,plan={}){
  const res=resources(snapshot,plan),plannable=res.filter(r=>r.active!==false&&r.plannable!==false);
  const chainRows=chains(snapshot,plan).map(c=>{const memberResources=c.members.map(id=>res.find(r=>r.id===id)).filter(Boolean),weekly={};for(const k of WEEKDAYS)weekly[k]=memberResources.length?Math.min(...memberResources.map(m=>Number(m.weekly[k])||0)):0;return{id:c.id,kind:'chain',name:c.name,members:c.members,memberResources,weekly,lag:chainLag(c),rate:memberResources.length?Math.min(...memberResources.map(m=>m.rate)):0};});
  return [...chainRows,...plannable.map(r=>({id:r.id,kind:'resource',name:r.name,type:r.type,stanford:r.stanford,members:[r.id],memberResources:[r],weekly:r.weekly,rate:r.rate,gameKey:r.gameKey}))];
}

/* ---------- Plan (the planner's own data; never game state) ---------- */
function emptyPlan(){return{schema:1,seq:0,assignments:[],instructions:{},edits:{},resources:{},extraResources:[],chains:null,orderBook:{},routeOrder:[],messages:[],log:[],pinRemoved:{},admin:{},basis:null};}
function normalizePlan(p){
  const base=emptyPlan();if(!p||typeof p!=='object')return base;const out={...base,...p};
  for(const k of ['assignments','extraResources','routeOrder','messages','log'])if(!Array.isArray(out[k]))out[k]=[];
  for(const k of ['instructions','edits','resources','orderBook','pinRemoved','admin'])if(!out[k]||typeof out[k]!=='object')out[k]={};
  out.seq=Number.isFinite(out.seq)?out.seq:0;
  out.assignments=out.assignments.filter(a=>a&&typeof a.orderId==='string'&&typeof a.rowId==='string'&&Number.isFinite(a.startHour));
  const used=new Set();for(const a of out.assignments){if(typeof a.id!=='string'||used.has(a.id))a.id='A'+(++out.seq);used.add(a.id);if(!Number.isFinite(a.seq))a.seq=out.seq;}
  for(const e of Object.values(out.edits))if(e&&typeof e==='object'){if('landings'in e)e.landings=normObjects(e.landings,'L',2);if('symbols'in e)e.symbols=normObjects(e.symbols,'S',1).map(s=>({...s,kind:SYMBOL_KINDS.includes(s.kind)?s.kind:SYMBOL_KINDS[0]}));}
  out.routeOrder=[...new Set(out.routeOrder.filter(x=>typeof x==='string'))];
  return out;
}
/* ---------- Map objects on an order: extra landings (Avlägg) and map symbols [M73][MM][DEMO] ----------
   Stored in plan.edits[orderId].landings / .symbols as {id, no, point:[x,y], kind?}. Coordinates are orthophoto image
   units like every other game geometry (no georeference). Milestone-2 plans stored bare [x,y] points: they are converted. */
const SYMBOL_KINDS=['warning','turn','unload','protect'];
const isPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function normObjects(list,prefix,first){
  const out=[];for(const [i,x] of (Array.isArray(list)?list:[]).entries()){const o=isPoint(x)?{no:first+i,point:x}:x&&typeof x==='object'&&isPoint(x.point)?{...x}:null;if(!o)continue;
    if(!Number.isInteger(o.no)||out.some(y=>y.no===o.no))o.no=Math.max(first-1,...out.map(y=>y.no))+1;o.id=prefix+o.no;out.push(o);}
  return out;
}
const nextNo=(list,first)=>Math.max(first-1,...list.map(x=>x.no))+1;
/** All landings of an order: the game's landing (P-A01) first, then the planner's extra ones (P-A01-2 …). */
function orderLandings(order,plan){
  const extra=normObjects(plan?.edits?.[order.id]?.landings,'L',2);
  return [{key:'primary',id:order.landing.id,point:order.landing.point,primary:true},...extra.map(x=>({key:x.id,id:order.landing.id+'-'+x.no,point:x.point,primary:false,no:x.no}))];
}
/** Map symbols of an order (Hinweis/Warnung · Wendeplatz · Abladepunkt · Schutzbereich), code "H-A01-S1". */
function orderSymbols(order,plan){return normObjects(plan?.edits?.[order.id]?.symbols,'S',1).map(x=>({...x,key:x.id,kind:SYMBOL_KINDS.includes(x.kind)?x.kind:SYMBOL_KINDS[0],code:order.id+'-S'+x.no}));}
function addLanding(planIn,orderId,point){
  const plan=normalizePlan(clone(planIn)),e=plan.edits[orderId]??={},list=e.landings=normObjects(e.landings,'L',2);if(!isPoint(point))return plan;
  const no=nextNo(list,2);list.push({id:'L'+no,no,point:point.map(n=>+Number(n).toFixed(1))});plan.lastObject={orderId,kind:'landing',id:'L'+no};return plan;
}
function addSymbol(planIn,orderId,kind,point){
  const plan=normalizePlan(clone(planIn)),e=plan.edits[orderId]??={},list=e.symbols=normObjects(e.symbols,'S',1);if(!isPoint(point))return plan;
  const no=nextNo(list,1);list.push({id:'S'+no,no,kind:SYMBOL_KINDS.includes(kind)?kind:SYMBOL_KINDS[0],point:point.map(n=>+Number(n).toFixed(1))});plan.lastObject={orderId,kind:'symbol',id:'S'+no};return plan;
}
/** Move a landing/symbol (patch.point) or change a symbol's kind (patch.kind). */
function updateMapObject(planIn,orderId,kind,id,patch={}){
  const plan=normalizePlan(clone(planIn)),list=plan.edits[orderId]?.[kind==='symbol'?'symbols':'landings']||[],o=list.find(x=>x.id===id);if(!o)return plan;
  if(isPoint(patch.point))o.point=patch.point.map(n=>+Number(n).toFixed(1));if(kind==='symbol'&&SYMBOL_KINDS.includes(patch.kind))o.kind=patch.kind;return plan;
}
function removeMapObject(planIn,orderId,kind,id){const plan=normalizePlan(clone(planIn)),e=plan.edits[orderId],k=kind==='symbol'?'symbols':'landings';if(e?.[k])e[k]=e[k].filter(x=>x.id!==id);return plan;}
/** Löpnummer / route sequence ("Ordna om löpande nummer" [M48]): order ids in driving order, 1..n. */
function setRouteOrder(planIn,ids){const plan=normalizePlan(clone(planIn));plan.routeOrder=[...new Set((ids||[]).filter(x=>typeof x==='string'))];return plan;}
const clone=x=>structuredClone(x);
function itemDuration(order,row,a){return Number(a.manualHours)>0?Number(a.manualHours):durationHours(order,row);}
function rowItems(snapshot,plan,row){
  return plan.assignments.filter(a=>a.rowId===row.id).map(a=>{const order=snapshot.orders.find(o=>o.id===a.orderId);if(!order)return null;const d=itemDuration(order,row,a);return{...a,order,duration:d,estimated:durationHours(order,row),start:a.startHour,end:a.startHour+d};}).filter(Boolean).sort((x,y)=>x.start-y.start||x.seq-y.seq);
}
function newItem(plan,orderId,rowId,startHour,extra={}){const id='A'+(++plan.seq);return{id,orderId,rowId,startHour,sent:false,sentRound:null,sentVersion:0,seq:plan.seq,manualHours:null,...extra};}
const pinnedSet=p=>p instanceof Set?p:new Set(p==null?[]:Array.isArray(p)?p:[p]);
/** Later items shift so a row never overlaps ("later items shift on save" [MW][M68]). Pinned items (by item or order id)
    are the planner's latest drops: they form anchor blocks (contiguous pinned items). An unpinned item that starts inside
    a block is queued behind the whole block; one that started earlier keeps its place, so a bar dropped into a gap lands
    after the bar it overlaps and before the bars that follow. Then one sequential pass removes all overlaps. */
function normalizeRow(plan,snapshot,rowId,pinned){
  const row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)return plan;const pin=pinnedSet(pinned),isPin=it=>pin.has(it.id)||pin.has(it.orderId);
  const items=rowItems(snapshot,plan,row),anchors=items.filter(isPin).sort((x,y)=>x.start-y.start||(y.touched||0)-(x.touched||0)),blocks=[];
  for(const a of anchors){const b=blocks.at(-1);if(b&&a.start<=b.end+1e-9)b.end+=a.duration;else blocks.push({start:a.start,end:a.start+a.duration});}
  const key=it=>{if(isPin(it))return[it.start,0,-(it.touched||0)];const b=blocks.find(b=>it.start>=b.start-1e-9&&it.start<b.end-1e-9);return[b?b.end:it.start,1,it.seq];};
  const sorted=items.map(it=>({it,k:key(it)})).sort((x,y)=>x.k[0]-y.k[0]||x.k[1]-y.k[1]||x.k[2]-y.k[2]||x.it.start-y.it.start);
  let cursor=-Infinity;for(const{it}of sorted){const a=plan.assignments.find(x=>x.id===it.id);if(a.startHour<cursor-1e-9)a.startHour=cursor;cursor=a.startHour+it.duration;}
  return plan;
}
/** Spara: resolve every staged overlap (staged items keep their slot, later items shift right) and drop the stage marks. */
function commit(planIn,snapshot){
  const plan=normalizePlan(clone(planIn)),staged=new Set(plan.assignments.filter(a=>a.staged).map(a=>a.id));
  for(const r of rows(snapshot,plan))normalizeRow(plan,snapshot,r.id,staged);
  for(const a of plan.assignments){delete a.staged;delete a.touched;}
  return plan;
}
const hasOverlap=(snapshot,plan,row)=>{const it=rowItems(snapshot,plan,row);return it.some((x,i)=>i&&x.start<it[i-1].end-1e-9);};
function currentDayStart(snapshot,row){return startHourOfDay(row,snapshot.calendar.currentDay);}
function lastEnd(snapshot,plan,row){const items=rowItems(snapshot,plan,row);return items.length?Math.max(...items.map(i=>i.end)):0;}
function touch(plan,a,stage){if(stage){a.staged=true;a.touched=++plan.seq;}return a;}
/** Flytta till resurs / Välj datum / drop from the list: plan one or several orders onto a row. mode 'day' starts the
    first order on that day (opts.minutes = clock time), 'after' = Lägg till som sista; later orders of the batch follow
    in sequence [M51][M47]. Moving an order removes its other assignments. opts.stage = no overlap resolution until Spara. */
function assign(planIn,snapshot,orderIds,rowId,opts={}){
  const plan=normalizePlan(clone(planIn)),row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)throw Error('Unbekannte Ressource');
  const today=currentDayStart(snapshot,row);let at=opts.mode==='day'?Math.max(today,hourAt(row,Math.max(0,opts.day|0),opts.minutes)):null;
  for(const id of orderIds){
    const order=snapshot.orders.find(o=>o.id===id);if(!order||order.closed)continue;
    plan.assignments=plan.assignments.filter(a=>a.orderId!==id);
    const start=at??Math.max(today,lastEnd(snapshot,plan,row));
    const a=touch(plan,newItem(plan,id,rowId,start),opts.stage);plan.assignments.push(a);
    if(!opts.stage)normalizeRow(plan,snapshot,rowId,a.id);
    at=opts.mode==='day'?start+durationHours(order,row):null;
  }
  return plan;
}
function unassign(planIn,orderIds){const plan=normalizePlan(clone(planIn));plan.assignments=plan.assignments.filter(a=>!orderIds.includes(a.orderId));return plan;}
function removeItems(planIn,itemIds){const plan=normalizePlan(clone(planIn));plan.assignments=plan.assignments.filter(a=>!itemIds.includes(a.id));return plan;}
/** Calendar bar dropped on another resource [M60]: Flytta moves the bar, Kopiera keeps it and adds a copy (forwarder
    working for several harvesters [MW]). lock = Lås start- och slutdatumen: same start and end dates on the new row.
    Otherwise the bar starts on opts.day. Returns the plan; the new/moved item id is plan.lastItem. */
function moveItem(planIn,snapshot,itemId,rowId,opts={}){
  const plan=normalizePlan(clone(planIn)),src=plan.assignments.find(a=>a.id===itemId),all=rows(snapshot,plan),target=all.find(r=>r.id===rowId);
  if(!src||!target)return plan;const order=snapshot.orders.find(o=>o.id===src.orderId);if(!order||order.closed)return plan;
  // Without the lock the duration is recomputed from the target's rates (manual working time dropped); with the lock the
  // calendar dates are kept and the matching working time is set manually.
  const from=all.find(r=>r.id===src.rowId),today=currentDayStart(snapshot,target);let start,manual=null;
  if(opts.lock&&from){const it=rowItems(snapshot,plan,from).find(i=>i.id===itemId),s=positionOf(from,it.start),e=positionOf(from,it.end,true);
    start=s==null?today:hourAtPosition(target,s);const end=e==null?null:hourAtPosition(target,e);if(end!=null&&end>start)manual=end-start;start=Math.max(today,start);}
  else start=opts.day!=null?Math.max(today,hourAt(target,Math.max(0,opts.day|0),opts.minutes)):Math.max(today,lastEnd(snapshot,plan,target));
  let a;
  if(opts.copy){a=touch(plan,newItem(plan,src.orderId,rowId,start,{manualHours:manual,copyOf:src.id}),opts.stage);plan.assignments.push(a);}
  else{a=src;Object.assign(a,{rowId,startHour:start,manualHours:manual,sent:false,sentRound:null,sentVersion:0});touch(plan,a,opts.stage);}
  if(!opts.stage)normalizeRow(plan,snapshot,rowId,a.id);
  plan.lastItem=a.id;return plan;
}
/** Insert between items: index 0 = before the first item; later items shift (now, or on Spara when staged).
    Works for an order from the list (orderId) and for an existing bar (opts.itemId, also reordering within a row). */
function insertAt(planIn,snapshot,orderId,rowId,index,opts={}){
  let plan=normalizePlan(clone(planIn));const row=rows(snapshot,plan).find(r=>r.id===rowId);
  const existing=opts.itemId?plan.assignments.find(a=>a.id===opts.itemId):null,oid=existing?existing.orderId:orderId,order=snapshot.orders.find(o=>o.id===oid);
  if(!row||!order||order.closed)return plan;
  if(existing)plan.assignments=plan.assignments.filter(a=>a.id!==existing.id);else plan.assignments=plan.assignments.filter(a=>a.orderId!==oid);
  const items=rowItems(snapshot,plan,row),today=currentDayStart(snapshot,row);
  const start=index<=0?Math.max(today,items[0]?.start??today):Math.max(today,items[Math.min(index,items.length)-1].end);
  let a;
  if(existing){a=Object.assign(existing,{rowId,startHour:start});if(existing.rowId!==rowId)Object.assign(a,{sent:false,sentRound:null,sentVersion:0});}
  else a=newItem(plan,oid,rowId,start);
  touch(plan,a,opts.stage);plan.assignments.push(a);plan.lastItem=a.id;
  if(opts.stage)return plan;
  return normalizeRow(plan,snapshot,rowId,a.id);
}
/** Komprimera [M64][M65][M67]: remove gaps, keep order. opts.from/to = calendar day interval (items starting inside it),
    opts.newStartDay = "Set new start date for working sites". Without opts: whole row, packed from today. */
function compressPreview(snapshot,plan,rowId,opts={}){
  const row=rows(snapshot,plan).find(r=>r.id===rowId);if(!row)return [];
  const today=currentDayStart(snapshot,row),lo=opts.from!=null?startHourOfDay(row,opts.from):-Infinity,hi=opts.to!=null?startHourOfDay(row,opts.to+1):Infinity;
  const all=rowItems(snapshot,plan,row),items=all.filter(it=>it.start>=lo-1e-9&&it.start<hi-1e-9);if(!items.length)return [];
  let cursor;
  if(opts.newStartDay!=null)cursor=Math.max(today,startHourOfDay(row,opts.newStartDay));
  else if(opts.from!=null)cursor=items[0].start; // without a new start date the first order keeps its start
  else cursor=Math.min(items[0].start,today); // pack from today's shift start; an item that already began earlier keeps its start
  return items.map(it=>{const out={orderId:it.orderId,itemId:it.id,oldStart:it.start,newStart:cursor,newEnd:cursor+it.duration,row};cursor+=it.duration;return out;});
}
function compress(planIn,snapshot,rowIds,opts={}){const plan=normalizePlan(clone(planIn));for(const rowId of rowIds)for(const p of compressPreview(snapshot,plan,rowId,opts)){const a=plan.assignments.find(x=>x.id===p.itemId);a.startHour=p.newStart;touch(plan,a,opts.stage);}if(!opts.stage)for(const rowId of rowIds)normalizeRow(plan,snapshot,rowId);return plan;}
function setEstimatedStart(planIn,snapshot,orderId,iso){
  const plan=normalizePlan(clone(planIn)),a=plan.assignments.filter(x=>x.orderId===orderId).sort((x,y)=>x.startHour-y.startHour)[0],day=dayIndexOf(iso);if(!a||day===null)return plan;
  const row=rows(snapshot,plan).find(r=>r.id===a.rowId);a.startHour=Math.max(currentDayStart(snapshot,row),startHourOfDay(row,day));return normalizeRow(plan,snapshot,a.rowId,a.id);
}
/** Quick-edit Uppdatera [M72]: start date + clock time and the manual working-time override. */
function updateItem(planIn,snapshot,itemId,{day,minutes,manualHours,stage}={}){
  const plan=normalizePlan(clone(planIn)),a=plan.assignments.find(x=>x.id===itemId);if(!a)return plan;const row=rows(snapshot,plan).find(r=>r.id===a.rowId);if(!row)return plan;
  if(day!=null)a.startHour=Math.max(currentDayStart(snapshot,row),hourAt(row,day,minutes));
  if(manualHours!==undefined)a.manualHours=Number(manualHours)>0?Number(manualHours):null;
  touch(plan,a,stage);if(!stage)normalizeRow(plan,snapshot,a.rowId,a.id);return plan;
}
/** Bar right edge dragged to a day column: the end snaps to the end of day `endDay-1` (whole days), and the resulting working
    time becomes the manual working time (same field as the quick edit's "Manuelle Arbeitszeit") [M72]. Days without hours
    add nothing, so snapping onto a weekend keeps Friday's end. At least the rest of the start day stays. */
function resizeHours(row,item,endDay){
  let b=Math.max(Math.floor(positionOf(row,item.start)??0)+1,endDay|0),h=hourAtBoundary(row,b)-item.start;
  for(let guard=0;h<=1e-9&&guard<MAX_DAYS;guard++){b++;h=hourAtBoundary(row,b)-item.start;}
  return +h.toFixed(4);
}
function resizeItem(planIn,snapshot,itemId,endDay,{stage}={}){
  const plan=normalizePlan(clone(planIn)),a=plan.assignments.find(x=>x.id===itemId);if(!a)return plan;const row=rows(snapshot,plan).find(r=>r.id===a.rowId);if(!row)return plan;
  const it=rowItems(snapshot,plan,row).find(i=>i.id===itemId);if(!it)return plan;a.manualHours=resizeHours(row,it,endDay);
  touch(plan,a,stage);if(!stage)normalizeRow(plan,snapshot,a.rowId,a.id);return plan;
}
/** Bar dragged horizontally within its row: new start day (09:00), duration kept (incl. a manual working time). */
function shiftItem(planIn,snapshot,itemId,day,{stage}={}){return updateItem(planIn,snapshot,itemId,{day:Math.max(0,day|0),stage});}
/** Rate or working-time change of a resource: bars on every row that uses it are re-flowed. Unsent bars that followed their
    predecessor directly keep following it; others keep their start unless the predecessor now runs into them. Sent bars
    stay where they are. before = plan with the old master data. Returns the plan (moved bars staged) and plan.reflowed =
    ids of bars whose start or duration changed. */
function reflow(before,planIn,snapshot,resourceIds,{stage=true}={}){
  const plan=normalizePlan(clone(planIn)),old=normalizePlan(before),ids=new Set([].concat(resourceIds)),changed=new Set();
  const oldRows=rows(snapshot,old);
  for(const row of rows(snapshot,plan)){
    if(!row.members.some(m=>ids.has(m)))continue;const oldRow=oldRows.find(r=>r.id===row.id);if(!oldRow)continue;
    const prevItems=rowItems(snapshot,old,oldRow),items=rowItems(snapshot,plan,row);let prevOldEnd=null,cursor=-Infinity;
    for(const it of items){
      const o=prevItems.find(x=>x.id===it.id),a=plan.assignments.find(x=>x.id===it.id),attached=!!o&&prevOldEnd!=null&&Math.abs(o.start-prevOldEnd)<1e-6;
      let start=a.startHour;if(!a.sent)start=attached?cursor:Math.max(start,cursor);
      if(Math.abs(start-a.startHour)>1e-9){a.startHour=start;touch(plan,a,stage);changed.add(a.id);}
      if(!o||Math.abs(o.duration-it.duration)>1e-9)changed.add(a.id);
      prevOldEnd=o?o.end:null;cursor=start+it.duration;
    }
  }
  plan.reflowed=[...changed];return plan;
}
/** Skicka till resurs [M53]: mark sent and generate OIN/PIN (+FOI/FDI). Selection by row, order or single item. */
function send(planIn,snapshot,{rowIds=[],orderIds=[],itemIds=[]}){
  const plan=normalizePlan(clone(planIn)),allRows=rows(snapshot,plan),round=snapshot.meta.round,version=snapshot.meta.requiredVersion;
  for(const a of plan.assignments){
    if(!rowIds.includes(a.rowId)&&!orderIds.includes(a.orderId)&&!itemIds.includes(a.id))continue;
    const order=snapshot.orders.find(o=>o.id===a.orderId),row=allRows.find(r=>r.id===a.rowId);if(!order||order.closed||!row)continue;
    Object.assign(a,{sent:true,sentRound:round,sentVersion:version});
    const prev=plan.instructions[a.orderId],next=instructionsFor(order,row,snapshot,plan,a);
    if(prev&&prev.pinVersion===next.pinVersion)for(const k of ['oin','foi','fdi'])next.files[k]=next.files[k]||prev.files[k];
    if(prev&&prev.pinVersion===next.pinVersion&&!next.files.pin.length)next.files.pin=prev.files.pin;
    plan.instructions[a.orderId]=next;
    plan.log.push({at:round,kind:'sent',orderId:a.orderId,rowId:a.rowId,pinVersion:version,files:Object.entries(next.files).flatMap(([k,v])=>Array.isArray(v)?v.map(()=>k):v?[k]:[])});
  }
  return plan;
}

/* ---------- StanForD 2010-shaped JSON (demo; element names to be verified against the Skogforsk schema) ---------- */
function header(ctx,fileType){return{fileType,standard:'StanForD 2010',shape:'demo JSON',HeaderInformation:{CreationDate:ctx.createdAt||dayISO(ctx.day??0),SenderApplication:'CFHarvest Planning · demo replica',Sender:ctx.company||'Trimble Forestry demo contractor',ContractNumber:ctx.contract?.id}};}
const lengthOf=spec=>spec?Number(String(spec).replace(',','.')):null;
const pinFileName=(order,a,version)=>`${a.code}_${String(order.name).replace(/\s+/g,'_')}_${order.pin?.spec&&a.key==='saw'?String(order.pin.spec).replace(',','-')+'m_':''}v${version}`;
/** Landings in the OIN/FOI: ctx.landings (game landing + planner's extra landings, orderLandings()) or the game landing. */
const landingsOf=(order,ctx)=>(ctx.landings||[{id:order.landing.id,point:order.landing.point}]).map(l=>({LandingKey:l.id,Coordinates:l.point}));
function toOIN(order,ctx){
  return{...header(ctx,'oin'),OperatingInstruction:{ObjectDefinition:{ObjectKey:order.id,ObjectUserID:order.id,ObjectName:order.name,ContractNumber:ctx.contract?.id,Client:order.client,LoggingForm:order.operation||'Avverkning',StartDate:ctx.start||null,EndDate:ctx.end||null,SubObject:[{SubObjectKey:1,SubObjectName:order.name,SpeciesGroup:order.species,EstimatedVolume_m3sub:order.estimatedVolume}]},
    MachineDefinition:ctx.machine?{MachineKey:ctx.machine.id,StanForDCode:ctx.machine.stanford}:null,
    ProductInstructionReferences:order.assortments.filter(a=>a.pin).map(a=>({ProductKey:order.id+'-'+a.code,ProductUserID:a.code,PINVersion:order.pin.required})),
    Landings:landingsOf(order,ctx),
    EnvironmentalRestrictions:order.bio?[{Code:order.bio.code,Text:order.bio.instruction}]:[],
    MapSymbols:(ctx.symbols||[]).map(s=>({SymbolKey:s.code,Type:s.kind,Coordinates:s.point})),
    BoundaryReference:{Polygon:order.boundary,Note:'fictional game overlay'}}};
}
function toPIN(assortment,order,ctx){
  return{...header(ctx,'pin'),fileName:pinFileName(order,assortment,order.pin.required),ProductInstruction:{ProductDefinition:{ProductKey:order.id+'-'+assortment.code,ProductUserID:assortment.code,ProductName:assortment.name,ProductVersion:order.pin.required,SpeciesGroupName:order.species,NominalLength_m:assortment.key==='saw'?lengthOf(order.pin.spec):null,DeliveryDestination:assortment.receiver,EstimatedVolume_m3sub:assortment.estimatedVolume}}};
}
function toFOI(order,ctx){return{...header(ctx,'foi'),ForwardingObjectInstruction:{ObjectDefinition:{ObjectKey:order.id,ObjectName:order.name,ContractNumber:ctx.contract?.id},MachineDefinition:ctx.forwarder?{MachineKey:ctx.forwarder.id,StanForDCode:ctx.forwarder.stanford}:null,Landings:landingsOf(order,ctx),ExpectedVolume_m3sub:order.estimatedVolume+(order.openingStock||0)}};}
function toFDI(order,ctx){return{...header(ctx,'fdi'),ForwardingDeliveryInstruction:{Deliveries:order.assortments.filter(a=>a.pin).map((a,i)=>({DeliveryKey:i+1,ProductKey:order.id+'-'+a.code,ProductName:a.name,FromLanding:order.landing.id,Destination:a.receiver,ExpectedVolume_m3sub:a.estimatedVolume+(a.openingVolume||0)}))}};}
function instructionsFor(order,row,snapshot,plan,item){
  const members=row.memberResources||[],h=members.find(m=>m.type==='harvester'),f=members.find(m=>m.type==='forwarder'),a=item||plan.assignments.find(x=>x.orderId===order.id&&x.rowId===row.id)||plan.assignments.find(x=>x.orderId===order.id);
  const dur=a?itemDuration(order,row,a):0,start=a?positionOf(row,a.startHour):null,end=a?positionOf(row,a.startHour+dur,true):null;
  const removed=plan.pinRemoved?.[order.id]||{},pinned=order.assortments.filter(x=>x.pin&&!removed[x.key]);
  const ctx={contract:snapshot.meta.contract,day:snapshot.calendar.currentDay,landings:orderLandings(order,plan),symbols:orderSymbols(order,plan),machine:h,forwarder:f,start:start===null?null:dayISO(Math.floor(start)),end:end===null?null:dayISO(Math.max(0,Math.ceil(end)-1))};
  const files={oin:h?toOIN(order,ctx):null,pin:h?pinned.map(x=>toPIN(x,order,ctx)):[],foi:f?toFOI(order,ctx):null,fdi:f?toFDI(order,ctx):null};
  return{round:snapshot.meta.round,pinVersion:snapshot.meta.requiredVersion,rowId:row.id,files};
}
/** PIN files an order would send now, and assortments with volume but no PIN [M53] ("Några sortiment saknar PIN-filer"). */
function pinStatus(order,plan){
  const removed=plan.pinRemoved?.[order.id]||{},v=order.pin.required;
  const files=order.assortments.filter(a=>a.pin&&!removed[a.key]).map(a=>pinFileName(order,a,v));
  const missing=order.assortments.filter(a=>(a.estimatedVolume>0||(order.stand?.byGrade?.[a.key]?.felled||0)>.05)&&(!a.pin||removed[a.key])).map(a=>a.key);
  return{files,missing};
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

/* ---------- On-board (Maskin) client, Phase 3 (Manual Maskin [MM]) ----------
   The machine side lives in plan.machine (travels with the plan through the plan store and the game envelopes):
   { orders: { <orderId>: { tabs:{<res>:[tab…]}, startMsg:{<res>:text}, started:{<res>:{round,files,pinVersion}}, status,
     plots:[…], evaluation, route:{<res>:{drawing,points:[{point,produced}]}} } }, reports:[…], loaded:{<res>:{orderId,pinVersion,files,round}}, log:[…] }.
   Status flow [MM]: harvester "Starta" sent → harvesting; "Avsluta avverkningen" → felled; forwarder "Starta" → forwarding;
   forwarder Slutvärdering saved with "Nej" → completed. The machine status is combined with the production-derived status
   (the higher one wins), so the planning app's pills and bars follow it.
   Manual production reports (per assortment m³) become HPR/FPR messages of kind 'manual' (fromMachineReport, same shape as
   bridge.productionMessages). Precedence: the game stays the simulation source. A manual report belongs to the next shift
   the game will simulate (game history length + 1); once the game has results for that shift (any HPR/FPR of kind 'shift'
   with the same round), the manual reports of that shift are dropped (mergeProduction). Manual reports are for the demo
   between shifts. */
const MACHINE_TABS=[['order','Arbeitsauftrag','Arbetsorder'],['info','Sonstige Infos','Övrig info'],['area','Gebiet','Område'],['products','Sortimente','Sortiment'],['landings','Polterplätze','Avlägg']];
const MACHINE_TRANSITIONS={harvesterStart:{from:['sent'],to:'harvesting'},fellingEnd:{from:['harvesting'],to:'felled'},forwarderStart:{from:['sent','harvesting','felled'],to:'forwarding'},finalNo:{from:['forwarding'],to:'completed'}};
const GRADE_KEYS=['saw','pulp','down'];
function machineData(plan){
  const m=plan&&plan.machine&&typeof plan.machine==='object'?plan.machine:{};
  return{orders:m.orders&&typeof m.orders==='object'?m.orders:{},reports:Array.isArray(m.reports)?m.reports:[],loaded:m.loaded&&typeof m.loaded==='object'?m.loaded:{},log:Array.isArray(m.log)?m.log:[],seq:Number.isFinite(m.seq)?m.seq:0};
}
function machineOrder(plan,orderId){const o=machineData(plan).orders[orderId]||{};return{tabs:o.tabs||{},startMsg:o.startMsg||{},started:o.started||{},status:STATUSES.includes(o.status)?o.status:null,plots:Array.isArray(o.plots)?o.plots:[],evaluation:o.evaluation||null,route:o.route||{}};}
/** Mutable machine part of a cloned plan (creates the containers). */
function machineEdit(plan,orderId){const m=plan.machine=machineData(plan);m.orders={...m.orders};m.reports=[...m.reports];m.log=[...m.log];m.loaded={...m.loaded};if(orderId){const o=m.orders[orderId]=structuredClone(machineOrder(plan,orderId));return{m,o};}return{m,o:null};}
function markTab(planIn,orderId,resourceId,tab){
  const plan=normalizePlan(clone(planIn));if(!MACHINE_TABS.some(t=>t[0]===tab))return plan;const{o}=machineEdit(plan,orderId);
  const seen=new Set(o.tabs[resourceId]||[]);seen.add(tab);o.tabs[resourceId]=MACHINE_TABS.map(t=>t[0]).filter(k=>seen.has(k));return plan;
}
function tabsSeen(plan,orderId,resourceId){return machineOrder(plan,orderId).tabs[resourceId]||[];}
const tabsComplete=(plan,orderId,resourceId)=>MACHINE_TABS.every(t=>tabsSeen(plan,orderId,resourceId).includes(t[0]));
/** Files the machine pulls on "Starta, överför till mätdon": harvester OIN + PIN, forwarder FOI + FDI (from the last Skicka). */
function machineFiles(instructions,type,orderId){
  if(!instructions||!instructions.files)return[];const f=instructions.files,v=Number(instructions.pinVersion)||1,out=[];
  if(type==='harvester'){if(f.oin)out.push({kind:'OIN',name:`OIN_${orderId}_v${v}`,version:v});for(const p of f.pin||[])out.push({kind:'PIN',name:p.fileName||`PIN_${orderId}_v${v}`,version:Number(p.ProductInstruction?.ProductDefinition?.ProductVersion)||v});}
  else if(type==='forwarder'){if(f.foi)out.push({kind:'FOI',name:`FOI_${orderId}_v${v}`,version:v});if(f.fdi)out.push({kind:'FDI',name:`FDI_${orderId}_v${v}`,version:v});}
  return out;
}
function machineLog(m,entry){m.log.push({seq:++m.seq,...entry});}
/** Status change requested on the machine. current = the order's shared status (view model). Unknown or not allowed → plan unchanged with plan.machineError. */
function machineTransition(planIn,orderId,action,current,ctx={}){
  const plan=normalizePlan(clone(planIn)),t=MACHINE_TRANSITIONS[action];
  if(!t||!t.from.includes(current)){plan.machineError=`${action}: ${current}`;return plan;}
  const{m,o}=machineEdit(plan,orderId);o.status=higher(t.to,o.status||'available');
  machineLog(m,{round:ctx.round??null,orderId,resourceId:ctx.resourceId||null,from:current,to:t.to,action});return plan;
}
/** "Starta, överför till mätdon": the five tabs must have been opened; harvester from status sent, forwarder from sent/harvesting/felled. */
function canStart(plan,orderId,resource,status){
  if(!resource||!tabsComplete(plan,orderId,resource.id))return false;if(machineOrder(plan,orderId).started[resource.id])return false;
  return(resource.type==='forwarder'?MACHINE_TRANSITIONS.forwarderStart:MACHINE_TRANSITIONS.harvesterStart).from.includes(status);
}
function loadFiles(m,orderId,resource,instructions,round){const files=machineFiles(instructions,resource.type,orderId);m.loaded[resource.id]={orderId,pinVersion:instructions?Number(instructions.pinVersion)||1:null,files,round:round??null};return files;}
function machineStart(planIn,orderId,resource,{status,instructions,round,message}={}){
  if(!canStart(planIn,orderId,resource,status)){const p=normalizePlan(clone(planIn));p.machineError='start';return p;}
  const plan=machineTransition(planIn,orderId,resource.type==='forwarder'?'forwarderStart':'harvesterStart',status,{round,resourceId:resource.id});
  const{m,o}=machineEdit(plan,orderId),files=loadFiles(m,orderId,resource,instructions,round);
  o.started[resource.id]={round:round??null,files:files.map(f=>f.name),pinVersion:instructions?Number(instructions.pinVersion)||1:null};
  machineLog(m,{round:round??null,orderId,resourceId:resource.id,action:'transfer',files:files.map(f=>f.name)});
  if(message&&String(message).trim()){o.startMsg[resource.id]=String(message).trim().slice(0,500);plan.messages.push({to:'crew',from:resource.id,orderId,text:o.startMsg[resource.id],round:round??null,kind:'start'});}
  return plan;
}
/** Funktioner → Överför till mätdon: pull the currently sent files again (e.g. after the planner re-sent a new PIN version). */
function machineTransfer(planIn,orderId,resource,{instructions,round}={}){
  const plan=normalizePlan(clone(planIn)),{m}=machineEdit(plan,orderId),files=loadFiles(m,orderId,resource,instructions,round);
  machineLog(m,{round:round??null,orderId,resourceId:resource.id,action:'transfer',files:files.map(f=>f.name)});return plan;
}
/** PIN version the harvester's measuring device (mätdon) holds for an order: the last transfer, else the game's loaded grade. */
function machinePinVersion(plan,order,resource){const l=machineData(plan).loaded[resource.id];if(l&&l.orderId===order.id&&l.pinVersion)return l.pinVersion;return resource.gameKey==='harvester'?order.pin?.machineVersion??null:null;}
/** Manual production report → HPR/FPR message in the shape fromHPR consumes (bridge.productionMessages). */
function fromMachineReport(r){
  if(!r||!['HPR','FPR'].includes(r.type)||!r.orderId)return null;const products={};let volume=0;
  for(const k of GRADE_KEYS){const v=Math.max(0,Number(r.products?.[k])||0);products[k]=v;volume+=v;}
  return{type:r.type,kind:'manual',round:Number(r.round)||1,machineKey:r.resourceId||null,objectKey:r.orderId,volume,products,reportId:r.id,source:r.source||'manual'};
}
function addMachineReport(planIn,report){
  const plan=normalizePlan(clone(planIn)),msg=fromMachineReport(report);if(!msg||!(msg.volume>0)){plan.machineError='report';return plan;}
  const{m}=machineEdit(plan,report.orderId),id='MR'+(++m.seq);
  m.reports.push({id,type:report.type,resourceId:report.resourceId||null,orderId:report.orderId,round:msg.round,products:msg.products,source:report.source||'manual',piles:report.piles||null,point:report.point||null});
  machineLog(m,{round:msg.round,orderId:report.orderId,resourceId:report.resourceId||null,action:'report',type:report.type,volume:msg.volume,reportId:id});plan.lastReport=id;return plan;
}
const manualMessages=plan=>machineData(plan).reports.map(fromMachineReport).filter(Boolean);
/** Game shift results overwrite manual reports of the same shift. */
function mergeProduction(gameMessages,manual){const rounds=new Set((gameMessages||[]).filter(m=>m&&m.kind==='shift').map(m=>m.round));return[...(gameMessages||[]),...(manual||[]).filter(m=>!rounds.has(m.round))];}
function overwrittenReports(gameMessages,plan){const rounds=new Set((gameMessages||[]).filter(m=>m&&m.kind==='shift').map(m=>m.round));return machineData(plan).reports.filter(r=>rounds.has(r.round)).map(r=>r.id);}
/** Provytemätning: sample plot (id, stems/ha, mean dbh cm). Goes out as quality report (HQC harvester / FQC forwarder). */
function addPlot(planIn,orderId,plot){
  const plan=normalizePlan(clone(planIn)),stems=Number(plot.stems),dbh=Number(plot.dbh),id=String(plot.plotId||'').trim().slice(0,20);
  if(!id||!(stems>0)||!(dbh>0)){plan.machineError='plot';return plan;}
  const{m,o}=machineEdit(plan,orderId);o.plots.push({plotId:id,stems,dbh,resourceId:plot.resourceId||null,round:plot.round??null,quality:plot.type==='forwarder'?'FQC':'HQC'});
  machineLog(m,{round:plot.round??null,orderId,resourceId:plot.resourceId||null,action:'plot',plotId:id});return plan;
}
/** Planned vs reported volume (Slutvärdering warning): deviation above tol (default 10 %) warns. */
function volumeCheck(planned,reported,tol=.1){const p=Number(planned)||0,r=Number(reported)||0,diff=r-p,pct=p>0?diff/p:(r>0?1:0);return{planned:p,reported:r,diff,pct,warn:Math.abs(pct)>tol};}
/** Slutvärdering: Tillägg/avdrag, avverkad/kvarvarande areal and the question whether more work follows. "Nej" → completed;
    saving closes the order on this machine either way. */
function finalEvaluation(planIn,orderId,resource,{more,adjustments=[],workedArea,comment='',status,round,checks}={}){
  if(!['yes','no'].includes(more)){const p=normalizePlan(clone(planIn));p.machineError='evaluation';return p;}
  let plan=more==='no'?machineTransition(planIn,orderId,'finalNo',status,{round,resourceId:resource.id}):normalizePlan(clone(planIn));
  if(plan.machineError)return plan;
  const{m,o}=machineEdit(plan,orderId),area=Number(workedArea);
  o.evaluation={more,resourceId:resource.id,round:round??null,workedArea:Number.isFinite(area)&&area>=0?area:null,comment:String(comment||'').slice(0,500),
    adjustments:(adjustments||[]).filter(a=>a&&String(a.text||'').trim()&&Number.isFinite(Number(a.amount))).map(a=>({kind:a.kind==='deduction'?'deduction':'addition',text:String(a.text).trim().slice(0,80),amount:Number(a.amount)})),checks:checks||null};
  machineLog(m,{round:round??null,orderId,resourceId:resource.id,action:'evaluation',more});return plan;
}
/** Rita rutt / Sluta rita rutt: route drawing on or off; while on, each point records the production reported so far. */
function setRouteDrawing(planIn,orderId,resourceId,on){const plan=normalizePlan(clone(planIn)),{o}=machineEdit(plan,orderId),r=o.route[resourceId]||{drawing:false,points:[]};o.route[resourceId]={...r,drawing:!!on};return plan;}
function addRoutePoint(planIn,orderId,resourceId,point,produced){
  const plan=normalizePlan(clone(planIn));if(!isPoint(point))return plan;const{o}=machineEdit(plan,orderId),r=o.route[resourceId]||{drawing:true,points:[]};
  if(!r.drawing)return plan;o.route[resourceId]={...r,points:[...r.points,{point:point.map(n=>+Number(n).toFixed(1)),produced:+(Number(produced)||0).toFixed(1)}]};return plan;
}
/** Planering list of a resource: sent orders on a row that contains the resource, in route order (Löpnummer) then calendar order. */
function machineOrders(vm,resourceId){
  const route=vm.plan.routeOrder||[],out=[];
  for(const o of vm.orders){const items=o.assignments.filter(it=>it.sent&&vm.rows.find(r=>r.id===it.rowId)?.members.includes(resourceId));if(!items.length)continue;
    const ev=machineOrder(vm.plan,o.id).evaluation;out.push({order:o,item:items[0],closed:o.status==='completed'||!!(ev&&ev.resourceId===resourceId)});}
  const idx=x=>{const i=route.indexOf(x.order.id);return i<0?1e6:i;};
  return out.sort((a,b)=>idx(a)-idx(b)||(a.item.startPos??1e9)-(b.item.startPos??1e9)||a.order.id.localeCompare(b.order.id));
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
/** Status pill [M40][M54][M70][V6-2:12]: text = assigned resource/team names, class = status colour. */
function pillOf(status,items,rowsOut,o){
  const names=[...new Set(items.map(it=>rowsOut.find(r=>r.id===it.rowId)?.name||it.rowId))];
  if(status==='available')return{cls:'available',text:null,sv:'Ledig',star:true};
  if(status==='completed')return{cls:'completed',text:null,sv:'Avslutad'};
  if(['harvesting','felled','forwarding'].includes(status)){const machines=names.length?names:[...new Set((o.followUp.reports||[]).filter(r=>r.kind!=='opening').map(r=>r.type==='HPR'?'H-01':'F-01'))];return{cls:'started',text:machines.join(', '),sv:'Påbörjad'};}
  if(status==='sent')return{cls:items.some(it=>it.sent&&rowsOut.find(r=>r.id===it.rowId)?.kind==='chain')?'team':'sent',text:names.join(', '),sv:'Skickad'};
  return{cls:'planned',text:names.join(', '),sv:'Tilldelad'};
}
/** Member bars of a chain item [M59][DEMO]: greyed projections on each member row. The harvester starts with the chain; a
    forwarder starts `lag` working days later; each member runs its own estimate (own rate, own volume), scaled by a manual
    working time on the chain bar. Hours are on the member's own calendar. */
function memberSpans(chainRow,item,memberRows){
  const out=[];if(item.startPos==null)return out;
  const est=estimate(item.order,chainRow),scale=item.manualHours>0&&item.estimated>0&&Number.isFinite(item.estimated)?item.duration/item.estimated:1;
  for(const m of chainRow.memberResources){
    const row=memberRows.find(r=>r.id===m.id);if(!row)continue;const line=est.lines.find(l=>l.resourceId===m.id);if(!line||!Number.isFinite(line.hours)||!hasCapacity(row))continue;
    let start=hourAtPosition(row,item.startPos);const lag=m.type==='forwarder'?chainRow.lag:0;if(lag>0)start=addWorkingDays(row,start,lag);
    const duration=line.hours*scale,end=start+duration;
    out.push({id:item.id+'@'+m.id,itemId:item.id,orderId:item.orderId,order:item.order,chainId:chainRow.id,resourceId:m.id,ghost:true,lag,volume:line.volume,rate:line.rate,
      start,end,duration,manualHours:item.manualHours,sent:item.sent,sentVersion:item.sentVersion,staged:item.staged,
      startPos:positionOf(row,start),endPos:positionOf(row,end,true),startTime:timeOf(row,start),endTime:timeOf(row,end,true),workDays:workDays(row,start,end)});
  }
  return out;
}
/** Double booking on a member row [DEMO]: a direct bar overlapping a chain's member bar, or member bars of two different
    chain bars overlapping. Warning only; planning stays possible. day = first calendar day of the overlap. */
function conflictsOf(rowsOut){
  const out=[],seen=new Set(),chainItems=rowsOut.filter(c=>c.kind==='chain').flatMap(c=>c.items);
  for(const r of rowsOut){
    if(r.kind!=='resource')continue;const entries=[...r.items.map(it=>({it,ghost:false})),...(r.ghosts||[]).map(it=>({it,ghost:true}))];
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const x=entries[i],y=entries[j];if(!x.ghost&&!y.ghost)continue;if(x.ghost&&y.ghost&&x.it.chainId===y.it.chainId)continue;
      const s=Math.max(x.it.start,y.it.start),e=Math.min(x.it.end,y.it.end);if(e-s<=1e-6)continue;
      const pos=positionOf(r,s),day=pos==null?null:Math.floor(pos);
      for(const z of [x,y]){z.it.conflict=true;if(z.ghost)for(const ci of chainItems)if(ci.id===z.it.itemId)ci.conflict=true;}
      const key=r.id+':'+day;if(seen.has(key))continue;seen.add(key);
      out.push({resourceId:r.id,resource:r.name,day,iso:day==null?null:dayISO(day),items:[x.ghost?x.it.itemId:x.it.id,y.ghost?y.it.itemId:y.it.id]});
    }
  }
  return out.sort((a,b)=>(a.day??0)-(b.day??0)||a.resourceId.localeCompare(b.resourceId));
}
function lanes(entries){const ends=[];for(const e of entries.sort((a,b)=>a.startPos-b.startPos)){let l=ends.findIndex(x=>x<=e.startPos+1e-9);if(l<0){l=ends.length;ends.push(0);}ends[l]=e.endPos;e.lane=l;}return Math.max(1,ends.length);}
function viewModel(snapshot,planIn){
  const plan=normalizePlan(planIn),allRows=rows(snapshot,plan),production={...snapshot.production,messages:mergeProduction(snapshot.production.messages,manualMessages(plan))},hpr=fromHPR(production.messages);
  const driving=(order,row)=>{const est=estimate(order,row);return est.lines.reduce((x,y)=>y.hours>x.hours?y:x,est.lines[0]);};
  const rowsOut=allRows.map(row=>({...row,items:rowItems(snapshot,plan,row).map(it=>({...it,volume:driving(it.order,row)?.volume??it.order.estimatedVolume,workDays:workDays(row,it.start,it.end),startPos:positionOf(row,it.start),endPos:positionOf(row,it.end,true),startTime:timeOf(row,it.start),endTime:timeOf(row,it.end,true),outdated:it.sent&&it.sentVersion<snapshot.meta.requiredVersion}))}));
  for(const r of rowsOut){r.overlap=r.items.some((x,i)=>i&&x.start<r.items[i-1].end-1e-9);r.ghosts=[];}
  const memberRows=rowsOut.filter(r=>r.kind==='resource');
  for(const c of rowsOut)if(c.kind==='chain')for(const it of c.items)for(const g of memberSpans(c,it,memberRows)){g.outdated=it.outdated;memberRows.find(x=>x.id===g.resourceId).ghosts.push(g);}
  const conflicts=conflictsOf(rowsOut);
  for(const r of rowsOut){r.mirrors=r.ghosts; // milestone-2 name kept for callers
    const placed=[...r.items,...r.ghosts].filter(e=>e.startPos!=null).map(e=>({e,startPos:e.startPos,endPos:Math.max(e.endPos,e.startPos+.02)}));r.lanes=lanes(placed);for(const p of placed)p.e.lane=p.lane;}
  const orders=snapshot.orders.map(o=>{
    const items=rowsOut.flatMap(r=>r.items.filter(i=>i.orderId===o.id)).sort((x,y)=>(x.startPos??1e9)-(y.startPos??1e9)),a=items[0]?plan.assignments.find(x=>x.id===items[0].id):null,row=a&&rowsOut.find(r=>r.id===a.rowId),item=items[0]||null;
    const p=hpr.byObject[o.id]||{felled:0,felledByShifts:0,opening:0,forwarded:0,forestStock:0,reports:[]};
    const sentOk=items.length>0&&items.every(i=>i.sent&&i.sentVersion>=snapshot.meta.requiredVersion);
    const status=higher(higher(deriveStatus({planned:items.length>0,sent:sentOk||o.gameSent,felledByShifts:p.felledByShifts,forwarded:p.forwarded,forestStock:p.forestStock,remaining:o.remaining}),o.gameSent?'sent':'available'),machineOrder(plan,o.id).status||'available');
    const edit=plan.edits[o.id]||{},instr=plan.instructions[o.id];
    const pinFlag=o.pin.loaded!==o.pin.spec&&!(instr&&instr.pinVersion>=o.pin.required&&items.some(i=>i.sent));
    const starts=items.filter(i=>i.startPos!=null),startISO=starts.length?dayISO(Math.floor(starts[0].startPos)):null,endISO=starts.length?dayISO(Math.max(...starts.map(i=>Math.max(Math.floor(i.startPos),Math.ceil(i.endPos)-1)))):null;
    const full={...o,status,info:STATUS_INFO[status],operationLabel:opLabel(o.operation),assignment:a||null,assignments:items,row:row||null,item,followUp:p,plannedStart:startISO,plannedEnd:edit.estEnd||endISO,endManual:!!edit.estEnd,message:edit.message||'',instructions:instr||null,pinFlag,outdated:items.some(i=>i.outdated),sentAny:items.some(i=>i.sent),
      availableFrom:o.window?.fromShift?dayISO(o.window.fromShift-1):null,availableTo:o.window?.toShift?dayISO(o.window.toShift-1):null,label:[o.clientCode,o.contractId,o.id,o.name].join(' - '),pins:pinStatus(o,plan)};
    full.pill=pillOf(status,items,rowsOut,full);return full;
  });
  const dispatch=dispatchPlan(snapshot,plan,allRows);
  const orderBook=snapshot.orderBook.map(b=>({...b,confirmed:!!plan.orderBook[b.id]?.confirmed,limits:{min:plan.orderBook[b.id]?.min??90,max:plan.orderBook[b.id]?.max??110},comment:plan.orderBook[b.id]?.comment||'',planned:orders.filter(o=>o.assignment&&o.status!=='completed').reduce((s,o)=>s+(o.assortments.find(x=>x.key===b.assortment)?.estimatedVolume||0),0)}));
  return{...snapshot,production,plan,rows:rowsOut,orders,dispatch,orderBook,followUp:hpr,machine:machineData(plan),conflicts,resourcesAll:resources(snapshot,plan),chainsAll:chains(snapshot,plan).map(c=>({...c,lag:chainLag(c)})),staged:plan.assignments.filter(a=>a.staged).length};
}
return{STATUSES,STATUS_INFO,OPERATIONS,opLabel,PLANNER_TRANSITIONS,canTransition,deriveStatus,WEEKDAYS,CALENDAR_START,START_CLOCK,dayISO,dayIndexOf,weekday,mondayOf,hoursOn,weeklyTotal,hasCapacity,startHourOfDay,positionOf,timeOf,hourAt,hourAtPosition,overlapOnDay,workDays,addWorkingDays,hourAtBoundary,rateFor,estimate,durationHours,resources,chains,chainLag,DEFAULT_LAG,rows,emptyPlan,normalizePlan,rowItems,normalizeRow,commit,hasOverlap,assign,unassign,removeItems,moveItem,insertAt,compressPreview,compress,setEstimatedStart,updateItem,resizeHours,resizeItem,shiftItem,reflow,memberSpans,conflictsOf,send,toOIN,toPIN,toFOI,toFDI,instructionsFor,SYMBOL_KINDS,orderLandings,orderSymbols,addLanding,addSymbol,updateMapObject,removeMapObject,setRouteOrder,pinStatus,pinFileName,fromHPR,dispatchPlan,viewModel,
  MACHINE_TABS,MACHINE_TRANSITIONS,machineData,machineOrder,markTab,tabsSeen,tabsComplete,machineFiles,machineTransition,canStart,machineStart,machineTransfer,machinePinVersion,fromMachineReport,addMachineReport,manualMessages,mergeProduction,overwrittenReports,addPlot,volumeCheck,finalEvaluation,setRouteDrawing,addRoutePoint,machineOrders};
})();
if(typeof module!=='undefined')module.exports=CFHModel;
