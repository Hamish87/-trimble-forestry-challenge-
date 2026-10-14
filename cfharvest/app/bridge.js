/* CFHarvest replica · bridge to the INTERFORST game (SPEC_PLANNING.md §5).
   The ONLY replica file that knows the game's `state` shape. Pure functions: it reads ForestGame / ForestJourney /
   WorksiteRoutes and never simulates. Volumes, costs and statuses all come from the game state. */
'use strict';
const CFHBridge=(()=>{
const SCHEMA=1;
// Storage keys shared with dist/cfharvest-link.js (keep in sync).
const KEYS={toReplica:'cfharvest-handoff-v1',toGame:'cfharvest-return-v1',plan:'cfharvest-plan-v1'};
// Bare identifiers: the game's modules are top-level consts (global bindings, not globalThis properties).
const G=()=>ForestGame,J=()=>typeof ForestJourney!=='undefined'?ForestJourney:null,R=()=>WorksiteRoutes;
const GRADES=['saw','pulp','down'];
// Assortments of the game contract; delivery points as in ForestJourney.haul (saw → Sägewerk, otherwise Industrieabnehmer).
const ASSORTMENTS={saw:{key:'saw',code:'SAG',name:'Sägeholz',group:'Stammholz',receiver:'Sägewerk',pin:true},pulp:{key:'pulp',code:'IND',name:'Industrieholz',group:'Industrieholz',receiver:'Industrieabnehmer',pin:true},down:{key:'down',code:'ABW',name:'Abgewertet',group:'Industrieholz',receiver:'Industrieabnehmer',pin:false}};
/* Planning master data taken from the game's published model assumptions (dist/index.html, rules dialog):
   one shift = 8 booked hours; base output 28 fm/h harvester, 32 fm/h forwarder. Used only for calendar capacity.
   Produktionsdata per Maßnahme [M22]: Slutavverkning = the game rates; the two thinning rates are [DEMO] values that no
   game order uses. Grunddata fields [M11] are [DEMO] master data (no machine brand is implied). */
const SHIFT_HOURS=8,WEEK={mon:SHIFT_HOURS,tue:SHIFT_HOURS,wed:SHIFT_HOURS,thu:SHIFT_HOURS,fri:SHIFT_HOURS,sat:0,sun:0};
const MASTER=[
  {id:'H-01',type:'harvester',gameKey:'harvester',name:'Harvester H-01',model:'Radharvester · Demo',stanford:'90001',operation:'Holzernte',rate:28,unit:'fm/h',production:{'Slutavverkning':28,'Första gallring':14,'Gallring':20},weekly:{...WEEK},active:true,plannable:true,subcontractor:false,
    base:{manufacturer:'Demo-Hersteller',year:2022,bearingClass:'B',plateWeight:21500,extinguisherChecked:'2026-03-12',aggregate:'Demo-Aggregat 60',phone:'',email:'h-01@demo.invalid',servicePackages:['Fernwartung'],woodforceStart:'2026-01-05'}},
  {id:'F-01',type:'forwarder',gameKey:'forwarder',name:'Forwarder F-01',model:'Forwarder · Demo',stanford:'90002',operation:'Rücken',rate:32,unit:'fm/h',production:{'Slutavverkning':32,'Första gallring':18,'Gallring':24},weekly:{...WEEK},active:true,plannable:true,subcontractor:false,
    base:{manufacturer:'Demo-Hersteller',year:2021,bearingClass:'B',plateWeight:18900,extinguisherChecked:'',aggregate:'',phone:'',email:'f-01@demo.invalid',servicePackages:[],woodforceStart:'2026-01-05'}},
  {id:'L-01',type:'truck',name:'Lkw L-01',model:'Holz-Lkw · Demo',stanford:'',operation:'Abfuhr',rate:25,unit:'fm/Tour',weekly:{...WEEK},active:true,plannable:false,subcontractor:true,base:{manufacturer:'',year:null,bearingClass:'',plateWeight:null,extinguisherChecked:'',aggregate:'',phone:'',email:'',servicePackages:[],woodforceStart:''}},
  {id:'L-02',type:'truck',name:'Lkw L-02',model:'Holz-Lkw · Demo',stanford:'',operation:'Abfuhr',rate:25,unit:'fm/Tour',weekly:{...WEEK},active:true,plannable:false,subcontractor:true,base:{manufacturer:'',year:null,bearingClass:'',plateWeight:null,extinguisherChecked:'',aggregate:'',phone:'',email:'',servicePackages:[],woodforceStart:''}}];
const CHAINS=[{id:'K-01',name:'H-01/F-01',kind:'drivningskedja',members:['H-01','F-01']}];
const CLIENT='Auftraggeber (Spielszenario)',CLIENT_CODE='TRI';
/* [DEMO] stand facts the game does not model: area (ha). All three game stands are planned as final fellings
   (Slutavverkning / Endnutzung), so the game's 28/32 fm/h rates apply unchanged. */
const STAND_FACTS={a:{areaHa:1.9},b:{areaHa:2.4},c:{areaHa:2.1}};
const CONTACTS=[{group:'Waldbesitzer',name:'Waldbesitzer (Spielszenario)',role:'Eigentümer',address:'Forstweg 1 · Demo',phone:'',email:'',language:'Deutsch',messages:true},
  {group:'Auftraggeber',name:'Holzeinkauf (Spielszenario)',role:'Einkäufer',address:'',phone:'',email:'einkauf@demo.invalid',language:'Deutsch',messages:true}];
const orderId=id=>'H-'+String(id).toUpperCase()+'01',landingId=id=>'P-'+String(id).toUpperCase()+'01';
function standIdOf(ref){if(typeof ref!=='string')return null;const m=/^H-([A-Z])01$/.exec(ref);return m?m[1].toLowerCase():/^[a-z]$/.test(ref)?ref:null;}
const requiredVersion=s=>s.round>=3?2:1; // same rule as dist/handover.js and ForestGame.validate
const sum=a=>a.reduce((x,y)=>x+y,0);
const PHASES=['forest','plan','receipt','logistics','logisticsReceipt','settlement','result'];

/** Minimal shape check before trusting a handed-over object as game state. */
function isGameState(s){
  return !!s&&typeof s==='object'&&Array.isArray(s.stands)&&s.stands.length>0&&s.stands.every(x=>x&&/^[a-z]$/.test(x.id)&&['volume','remaining','stock','roadside'].every(k=>Number.isFinite(x[k])))&&Number.isInteger(s.round)&&s.round>=1&&s.round<=4&&PHASES.includes(s.phase)&&Array.isArray(s.history)&&s.handoverAccepted&&typeof s.handoverAccepted==='object'&&s.handoverVersions&&typeof s.handoverVersions==='object';
}
function contractOf(s){
  if(s.journey?.contract)return{...s.journey.contract,provisional:false};
  if(s.journey&&J())return{...J().contracts[s.journey.contractType],provisional:true};
  return{id:J()?.contracts.standard.id||'V-26-014',name:'Standardauftrag',...G().targets(s),provisional:true};
}
// Saw share of an estimate, read from the game's own opening stock split (no constant duplicated here).
function sawShare(){const st=G().initial().stands.find(x=>x.initialStock>0);return st?st.stockGrades.saw/st.initialStock:.65;}
const world=(anchor,[x,y])=>[+(anchor[0]+anchor[2]*x).toFixed(2),+(anchor[1]+anchor[2]*y).toFixed(2)];
function deliveredByGrade(s,id){const out={saw:0,pulp:0,down:0};for(const l of s.journey?.logistics?.loads||[])if(l.site===id&&l.volume>0&&out[l.grade]!==undefined)out[l.grade]+=l.volume;return out;}

/** HPR/FPR production messages reconstructed from the game's shift history (the simulated machine reports). */
function productionMessages(s){
  const msgs=[],initial=G().initial();
  for(const st of s.stands)if(st.initialStock>0){const g=initial.stands.find(x=>x.id===st.id)?.stockGrades||{};msgs.push({type:'HPR',kind:'opening',round:0,machineKey:null,objectKey:orderId(st.id),volume:st.initialStock,products:{saw:g.saw||0,pulp:g.pulp||0,down:g.down||0}});}
  for(const r of s.history){
    msgs.push({type:'HPR',kind:'shift',round:r.round,machineKey:'H-01',objectKey:orderId(r.harvestOrigin),volume:r.harvest,downgraded:r.downgraded,neighbourVolume:r.neighbourVolume||0});
    if(r.fleet?.f?.paid>0||r.forwarded>0)msgs.push({type:'FPR',kind:'shift',round:r.round,machineKey:'F-01',objectKey:orderId(r.forwardOrigin),volume:r.forwarded,sawVolume:r.sawForwarded});
  }
  return msgs;
}
function readiness(s,st){
  const out=[],b=G().biodiversity[st.id];
  if(st.closed)out.push({key:'closed',level:'block',text:'Hieb gesperrt'});
  if(st.surveyCoverage<100)out.push({key:'survey',level:'warn',text:'Vorerkundung unvollständig',value:st.surveyCoverage});
  else out.push({key:'survey',level:'ok',text:'Vorerkundung dokumentiert',value:st.surveyCoverage});
  out.push(s.boundaryChecked?.[st.id]?{key:'boundary',level:'ok',text:'Hiebsgrenze abgeglichen'}:{key:'boundary',level:'warn',text:'Hiebsgrenze nicht abgeglichen'});
  if(b)out.push({key:'bio',level:'info',text:b.code+' · '+b.title});
  const accepted=s.handoverAccepted?.[st.id]&&s.handoverVersions?.[st.id]>=requiredVersion(s);
  out.push(accepted?{key:'handover',level:'ok',text:'Übergabe bestätigt'}:{key:'handover',level:'info',text:'Übergabe offen'});
  return out;
}

/** Game state → CFHarvest planning snapshot { orders, resources, chains, calendar, orderBook, production, meta }. */
function fromGameState(s){
  const game=G(),routes=R(),contract=contractOf(s),share=sawShare(),req=requiredVersion(s);
  const orders=s.stands.map(st=>{
    const site=routes.sites[st.id],anchor=site.anchor,bioDef=game.biodiversity[st.id],hz=site.hazard;
    const delivered=deliveredByGrade(s,st.id),byGrade={};
    for(const g of GRADES){const roadside=st.roadsideGrades?.[g]||0,forestStock=st.stockGrades?.[g]||0,forwarded=roadside+delivered[g];byGrade[g]={felled:forestStock+forwarded,forwarded,forestStock,roadside,delivered:delivered[g]};}
    const felled=st.initialStock+st.volume-st.remaining,forwarded=st.roadside+(st.delivered||0);
    const spec=game.gradeSpec(s,st.id),v1=game.gradeSpec({round:1},st.id),v2=game.gradeSpec({round:3},st.id),loaded=s.loadedGrade;
    const machineVersion=loaded===spec?req:loaded===v1?1:loaded===v2?2:null;
    const openingShare=st.initialStock?{saw:(st.initialStock*share),pulp:st.initialStock*(1-share)}:{saw:0,pulp:0};
    const assortments=GRADES.map(g=>({...ASSORTMENTS[g],estimatedVolume:g==='saw'?st.volume*share:g==='pulp'?st.volume*(1-share):0,openingVolume:openingShare[g]||0,lengthSpec:g==='saw'?spec:null}));
    const accepted=!!(s.handoverAccepted?.[st.id]&&s.handoverVersions?.[st.id]>=req);
    const events=[];if(s.handoverRound?.[st.id])events.push({round:s.handoverRound[st.id],kind:'handover',version:s.handoverVersions?.[st.id]||0});
    for(const r of s.history){if(r.harvestOrigin===st.id&&r.harvest>0)events.push({round:r.round,kind:'harvest',machine:'H-01',volume:r.harvest});if(r.forwardOrigin===st.id&&r.forwarded>0)events.push({round:r.round,kind:'forward',machine:'F-01',volume:r.forwarded});}
    return{id:orderId(st.id),standId:st.id,name:st.name,client:CLIENT,clientCode:CLIENT_CODE,contractId:contract.id,operation:'Slutavverkning',operationLabel:'Endnutzung',species:st.species,terrain:st.terrain,
      areaHa:STAND_FACTS[st.id]?.areaHa??null,window:{fromShift:1,toShift:4},predecessor:null,contacts:structuredClone(CONTACTS),events,
      estimatedVolume:st.volume,openingStock:st.initialStock,remaining:st.remaining,closed:!!st.closed,surveyCoverage:st.surveyCoverage,boundaryChecked:!!s.boundaryChecked?.[st.id],
      assortments,
      landing:{id:landingId(st.id),point:world(anchor,site.polter),roadside:st.roadside,roadsideGrades:{...st.roadsideGrades},delivered:st.delivered||0},
      boundary:site.boundary.map(p=>world(anchor,p)),centroid:world(anchor,[sum(site.boundary.map(p=>p[0]))/site.boundary.length,sum(site.boundary.map(p=>p[1]))/site.boundary.length]),
      bio:bioDef?{code:bioDef.code,title:bioDef.title,status:bioDef.status,location:bioDef.location,instruction:bioDef.instruction,restriction:bioDef.restriction,point:world(anchor,[hz.x,hz.z]),radius:hz.r*anchor[2]}:null,
      readiness:readiness(s,st),
      handover:{mode:s.handoverMode,accepted,version:s.handoverVersions?.[st.id]||0,required:req,round:s.handoverRound?.[st.id]||null},
      gameSent:s.handoverMode==='digital'&&accepted,
      dispatch:{harvester:s.harvester===st.id,forwarder:s.forwarder===st.id},
      notes:s.history.filter(r=>r.harvestOrigin===st.id||r.forwardOrigin===st.id).flatMap(r=>(r.logs||[]).map(l=>({round:r.round,kind:l.kind,title:l.title}))),
      pin:{required:req,spec,v1,v2,loaded,machineVersion,cutting:s.cutting},
      stand:{felled,forwarded,forestStock:st.stock,roadside:st.roadside,delivered:st.delivered||0,byGrade}};
  });
  const fleet={h:{shifts:0,work:0,idle:0,paid:0,last:null},f:{shifts:0,work:0,idle:0,paid:0,last:null}};
  for(const r of s.history)for(const k of ['h','f']){const x=r.fleet?.[k];if(!x)continue;if(x.paid>0)fleet[k].shifts++;fleet[k].work+=x.work;fleet[k].idle+=x.idle;fleet[k].paid+=x.paid;if(x.paid>0)fleet[k].last={round:r.round,orderId:orderId(k==='h'?r.harvestOrigin:r.forwardOrigin),status:x.status};}
  const resources=MASTER.map(m=>({...structuredClone(m),followUp:m.gameKey?{...fleet[m.gameKey==='harvester'?'h':'f'],current:orderId(s[m.gameKey]),lastSite:(m.gameKey==='harvester'?s.lastH:s.lastF)?orderId(m.gameKey==='harvester'?s.lastH:s.lastF):null}:{shifts:0,work:0,idle:0,paid:0,last:null,tours:(s.journey?.logistics?.loads||[]).filter(l=>l.truck===m.id).length}}));
  const calendar={currentDay:s.round-1,shiftDays:[0,1,2,3],shiftHours:SHIFT_HOURS,
    reports:s.history.flatMap(r=>[{day:r.round-1,machine:'H-01',type:'HPR',orderId:orderId(r.harvestOrigin),volume:r.harvest},...(r.fleet?.f?.paid>0||r.forwarded>0?[{day:r.round-1,machine:'F-01',type:'FPR',orderId:orderId(r.forwardOrigin),volume:r.forwarded}]:[])])};
  const deliveredTotal=g=>sum(orders.map(o=>o.stand.byGrade[g].delivered));
  const orderBook=GRADES.map(g=>({id:'B-'+contract.id+'-'+ASSORTMENTS[g].code,contractId:contract.id,contractName:contract.name,client:CLIENT,assortment:g,name:ASSORTMENTS[g].name,code:ASSORTMENTS[g].code,receiver:ASSORTMENTS[g].receiver,
    ordered:g==='saw'?contract.saw:g==='pulp'?contract.volume-contract.saw:0,price:contract.prices?.[g]??null,period:'Schicht 1–4 + Abfuhrfenster',
    harvested:sum(orders.map(o=>o.stand.byGrade[g].felled)),forwarded:sum(orders.map(o=>o.stand.byGrade[g].forwarded)),delivered:deliveredTotal(g),orders:orders.map(o=>o.id),provisional:contract.provisional}));
  const messages=productionMessages(s),last=s.history.at(-1);
  return{
    meta:{round:s.round,phase:s.phase,requiredVersion:req,contract,client:CLIENT,handoverMode:s.handoverMode,cutting:s.cutting,reporting:s.reporting,loadedGrade:s.loadedGrade,
      dispatch:{harvester:orderId(s.harvester),forwarder:orderId(s.forwarder)},journey:!!s.journey,documentation:s.journey?.documentation||null,canApply:s.phase==='plan'},
    orders,resources,chains:structuredClone(CHAINS),calendar,orderBook,
    production:{messages,totals:{felled:sum(orders.map(o=>o.stand.felled)),forwarded:sum(orders.map(o=>o.stand.forwarded)),forestStock:sum(orders.map(o=>o.stand.forestStock)),roadside:sum(orders.map(o=>o.stand.roadside)),delivered:sum(orders.map(o=>o.stand.delivered)),neighbourVolume:s.neighbourVolume||0},
      lastShift:last?{round:last.round,harvest:last.harvest,forwarded:last.forwarded,harvestOrigin:orderId(last.harvestOrigin),forwardOrigin:orderId(last.forwardOrigin),forestStock:sum(s.stands.map(x=>x.stock))}:null}};
}

/** Planned dispatch → new game state, exactly as the operator would confirm it in dist/handover.js.
    plan = { harvester, forwarder } as work-order ids (H-A01) or stand ids (a). Machines without a planned order keep
    their game assignment. Digital mode is only switched on when every dispatched stand is confirmed, so the result
    always passes ForestGame.validate. Outside the planning phase the state is returned unchanged. */
function applyPlan(state,plan){
  const next=structuredClone(state);if(next.phase!=='plan'||!plan)return next;
  const req=requiredVersion(next),usable=id=>!!id&&next.stands.some(x=>x.id===id&&!x.closed);
  const h=standIdOf(plan.harvester),f=standIdOf(plan.forwarder),planned=[];
  if(usable(h)){next.harvester=h;planned.push(h);}
  if(usable(f)){next.forwarder=f;planned.push(f);}
  if(!planned.length)return next;
  for(const id of new Set(planned)){next.handoverAccepted[id]=true;next.handoverRound[id]=next.round;next.handoverVersions[id]=req;}
  if(usable(h))next.cutting='current'; // the current PIN travelled with the work order
  next.reporting='live';
  const confirmed=id=>next.handoverAccepted[id]&&next.handoverVersions[id]>=req;
  if(confirmed(next.harvester)&&confirmed(next.forwarder))next.handoverMode='digital';
  return next;
}
/** Handoff envelope used by both directions (dist/cfharvest-link.js writes the same shape). */
function envelope(kind,state,extra={}){return{schema:SCHEMA,kind,state,...extra};}
function readEnvelope(raw,kind){try{const p=typeof raw==='string'?JSON.parse(raw):raw;if(!p||p.schema!==SCHEMA||p.kind!==kind||!isGameState(p.state))return null;return p;}catch{return null;}}
return{SCHEMA,KEYS,ASSORTMENTS,MASTER,CHAINS,CLIENT_CODE,SHIFT_HOURS,orderId,landingId,standIdOf,requiredVersion,isGameState,fromGameState,applyPlan,productionMessages,envelope,readEnvelope};
})();
if(typeof module!=='undefined')module.exports=CFHBridge;
