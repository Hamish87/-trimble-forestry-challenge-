/* CFHarvest replica · plan store (PLAN_OVERNIGHT §2, db/SCHEMA.md §6).
   One interface for the planner's plan envelope — read() (synchronous session copy), load() → Promise<plan|null>,
   save(plan), subscribe(fn) → unsubscribe, flush(), pending(), status() — with two backends:
   - LocalStore (default): sessionStorage 'cfharvest-plan-v1', exactly the behaviour the replica always had. The plan also
     travels inside the game handoff envelopes; those stay in app.js and are not touched here.
   - SupabaseStore (?store=supabase or localStorage['cfharvest-store']='supabase'): PostgREST over fetch against schema
     `cfharvest` (Accept-Profile / Content-Profile headers), config from config.js (project URL + publishable key, never a
     service key). It keeps the session copy as well, so the handoff and a fallback lose nothing. Writes are debounced
     (300 ms), batched one request per table and sent as upserts (Prefer: resolution=merge-duplicates); only tables whose
     rows changed since the last successful write are sent. A missing config, an unreachable database or any error switches
     the store to local for the rest of the session and raises the notice "Datenbank nicht erreichbar – lokale Sitzung".
   Row ids are the seed's deterministic demo ids md5('cfh-demo:<kind>:<key>')::uuid, so the replica addresses seeded rows
   (work orders, resources, assortments …) without lookups. Production from the game (HPR/FPR) is written, never read:
   reported volumes stay game-owned (AGENTS.md). No DOM. */
'use strict';
const CFHStore=(()=>{
const PLAN_KEY='cfharvest-plan-v1',SELECT_KEY='cfharvest-store',DEBOUNCE_MS=300;
const NOTICE='Datenbank nicht erreichbar – lokale Sitzung';
const g=typeof globalThis!=='undefined'?globalThis:{};
// Sibling scripts are top-level consts (global bindings, not globalThis properties): read them as bare identifiers.
const M0=()=>typeof CFHModel!=='undefined'?CFHModel:null,A0=()=>typeof CFHAdmin!=='undefined'?CFHAdmin:null,C0=()=>typeof CFH_CONFIG!=='undefined'?CFH_CONFIG:null;

/* ---------- md5 (RFC 1321) for md5('cfh-demo:<kind>:<key>')::uuid ---------- */
const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);
const R=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
function md5(text){
  const bytes=[...unescape(encodeURIComponent(String(text)))].map(c=>c.charCodeAt(0)),len=bytes.length;
  bytes.push(0x80);while(bytes.length%64!==56)bytes.push(0);
  const bits=len*8;for(let i=0;i<8;i++)bytes.push(i<4?(bits>>>(8*i))&255:Math.floor(bits/2**(8*i))&255);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let off=0;off<bytes.length;off+=64){
    const M=[];for(let i=0;i<16;i++)M[i]=bytes[off+i*4]|(bytes[off+i*4+1]<<8)|(bytes[off+i*4+2]<<16)|(bytes[off+i*4+3]<<24);
    let A=a0,B=b0,C=c0,D=d0;
    for(let i=0;i<64;i++){
      let F,gi;
      if(i<16){F=(B&C)|(~B&D);gi=i;}else if(i<32){F=(D&B)|(~D&C);gi=(5*i+1)%16;}else if(i<48){F=B^C^D;gi=(3*i+5)%16;}else{F=C^(B|~D);gi=(7*i)%16;}
      const t=D;D=C;C=B;const x=(A+F+K[i]+M[gi])|0;B=(B+((x<<R[i])|(x>>>(32-R[i]))))|0;A=t;
    }
    a0=(a0+A)|0;b0=(b0+B)|0;c0=(c0+C)|0;d0=(d0+D)|0;
  }
  return [a0,b0,c0,d0].map(w=>[0,8,16,24].map(s=>((w>>>s)&255).toString(16).padStart(2,'0')).join('')).join('');
}
const uuidOf=h=>`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
/** md5('cfh-demo:' || key)::uuid, as seed.sql pg_temp.did(key). */
const demoId=key=>uuidOf(md5('cfh-demo:'+key));
const DEMO_TENANT=demoId('company');

/* ---------- Small helpers ---------- */
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const str=x=>x==null?'':String(x);
const nullable=x=>x==null||x===''?null:x;
const num=x=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
const r2=x=>Number.isFinite(x)?Math.round(x*100)/100:null;
const r3=x=>Number.isFinite(x)?Math.round(x*1000)/1000:null;
const slug=s=>String(s).toLowerCase().replace(/[åä]/g,'a').replace(/ö/g,'o').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
/** Europe/Berlin UTC offset (h) of a local calendar day: summer time from the last Sunday of March to the last Sunday of October. */
function berlinOffset(y,m,d){const lastSun=mo=>{const t=new Date(Date.UTC(y,mo+1,0));return t.getUTCDate()-t.getUTCDay();};const md=m*100+d;return md>=200+lastSun(2)&&md<900+lastSun(9)?2:1;}
/** Calendar day index + minutes after local midnight → UTC ISO timestamp (Europe/Berlin wall time, like the product). */
function stamp(M,day,minutes){
  const iso=M.dayISO(0),[y,m,d]=iso.split('-').map(Number),wall=Date.UTC(y,m-1,d)+day*864e5+minutes*6e4,w=new Date(wall);
  return new Date(wall-berlinOffset(w.getUTCFullYear(),w.getUTCMonth(),w.getUTCDate())*36e5).toISOString();
}
const dayOfStamp=(M,ts)=>{const t=Date.parse(ts);if(!Number.isFinite(t))return null;const w=new Date(t+2*36e5);return M.dayIndexOf(w.toISOString().slice(0,10));};
const point=p=>({type:'Point',coordinates:[Number(p[0]),Number(p[1])]});
const coords=gj=>Array.isArray(gj?.coordinates)&&gj.coordinates.length===2?gj.coordinates.map(Number):null;
const SYMBOL_TITLE={warning:'Hinweis / Warnung',turn:'Wendeplatz',unload:'Abladepunkt',protect:'Schutzbereich'};
const KIND_FILE={oin:'OIN',pin:'PIN',foi:'FOI',fdi:'FDI'};

/* ---------- Plan + snapshot → rows (SCHEMA.md §6) ---------- */
/** All row batches for one save, in foreign-key order. Each step: {table, rows, onConflict} (upsert) or
    {table, del: query} (delete), plus `key` used to skip unchanged batches. Pure: no I/O. */
function rowsFor(planIn,snapshot,{tenant=DEMO_TENANT,M=M0(),A=A0()}={}){
  const plan=M.normalizePlan(structuredClone(planIn)),T=tenant,steps=[],did=demoId;
  const up=(table,rows,onConflict='id',key=table)=>{if(rows.length)steps.push({key,table,rows,onConflict});};
  const del=(table,query,key)=>steps.push({key:key||'del:'+table,table,del:`tenant_id=eq.${T}${query?'&'+query:''}`});
  const inList=ids=>`(${ids.join(',')})`;
  const orders=snapshot?.orders||[],orderOf=id=>orders.find(o=>o.id===id);
  const allRows=snapshot?M.rows(snapshot,plan):[],resAll=snapshot?M.resources(snapshot,plan):[];
  const isChain=id=>allRows.find(r=>r.id===id)?.kind==='chain';
  const ad=A?A.data(snapshot||{},plan):null;

  /* Administration → Eigenes Unternehmen */
  if(ad){
    const c=ad.company;
    up('company',[{id:T,name:str(c.name)||'Demo-Lohnunternehmen',org_no:nullable(c.orgNo),address:nullable(c.address),phone:nullable(c.phone),email:nullable(c.email),
      country:str(c.country)||'DE',default_language:str(c.defaultLanguage)||'de',biometria_id:nullable(c.biometriaId),contact_name:nullable(c.contactName),
      contact_phone:nullable(c.contactPhone),contact_email:nullable(c.contactEmail)}]);
    up('client',ad.clients.map(x=>({id:did('client:'+x.code),tenant_id:T,code:x.code,name:str(x.name)||x.code,regions:arr(x.regions),customer_groups:arr(x.customerGroups),phone:nullable(x.phone),email:nullable(x.email)})));
    const game=ad.contracts.filter(x=>x.game),own=ad.contracts.filter(x=>!x.game);
    const cbase=x=>({id:did('contract:'+x.contractNo),tenant_id:T,client_id:did('client:'+(x.clientCode||'TRI')),contract_no:x.contractNo,name:str(x.name)||x.contractNo,valid_from:nullable(x.validFrom),valid_to:nullable(x.validTo)});
    up('contract',game.map(cbase),'id','contract:game');
    up('contract',own.map(x=>({...cbase(x),target_volume_m3:num(x.targetVolume),target_saw_m3:num(x.targetSaw),
      prices:Object.fromEntries(Object.entries(obj(x.prices)).filter(([,v])=>num(v)!=null).map(([k,v])=>[k,Number(v)])),shortfall_eur_per_m3:num(x.shortfall)})),'id','contract:own');
    const cIds=ad.contracts.map(x=>did('contract:'+x.contractNo));
    if(cIds.length){
      const cot=ad.contracts.flatMap(x=>arr(x.operationTypes).map(op=>({tenant_id:T,contract_id:did('contract:'+x.contractNo),operation_type_id:did('op:'+slug(op))})));
      steps.push({key:'contract_operation_type',table:'contract_operation_type',del:`tenant_id=eq.${T}&contract_id=in.${inList(cIds)}`,then:cot,onConflict:'contract_id,operation_type_id'});
    }
  }

  /* Administration → Ressourcen: Grunddata, Produktionsdaten, Wochenarbeitszeit, Wochenkalender, Enhetsdata */
  if(snapshot){
    up('resource',resAll.map(r=>{const b=obj(r.base),c=r.unitDataConsent&&typeof r.unitDataConsent==='object'?r.unitDataConsent:null;
      return{id:did('resource:'+r.id),tenant_id:T,code:r.id,type:['harvester','forwarder','person','truck','other'].includes(r.type)?r.type:'other',name:str(r.name)||r.id,
        stanford_code:nullable(r.stanford),manufacturer:nullable(b.manufacturer),model:nullable(r.model),model_year:num(b.year),bearing_class:nullable(b.bearingClass),
        plate_weight_kg:num(b.plateWeight)==null?null:Math.round(num(b.plateWeight)),extinguisher_checked_on:nullable(b.extinguisherChecked),aggregate_model:nullable(b.aggregate),
        phone:nullable(b.phone),email:nullable(b.email),service_packages:arr(b.servicePackages),woodforce_start_date:nullable(b.woodforceStart),
        active:r.active!==false,plannable:r.plannable!==false,is_subcontractor:!!r.subcontractor,base_rate:num(r.rate),base_rate_unit:nullable(r.unit),description:nullable(r.operation),
        unit_data_consent:c?!!c.granted:null,unit_data_consent_on:c&&c.granted?nullable(c.date):null};}));
    up('resource_weekly_hours',resAll.flatMap(r=>M.WEEKDAYS.map(wd=>({tenant_id:T,resource_id:did('resource:'+r.id),weekday:wd,hours:Math.max(0,Math.min(24,Number(r.weekly?.[wd])||0))}))),'resource_id,weekday');
    up('resource_production_rate',resAll.flatMap(r=>Object.entries(obj(r.production)).filter(([op,v])=>Number(v)>0&&M.OPERATIONS.some(o=>o.key===op))
      .map(([op,v])=>({tenant_id:T,resource_id:did('resource:'+r.id),operation_type_id:did('op:'+slug(op)),m3_per_hour:Number(v)}))),'resource_id,operation_type_id');
    const ov=resAll.map(r=>({id:did('resource:'+r.id),rows:Object.entries(obj(r.days)).filter(([d])=>Number.isInteger(Number(d))&&Number(d)>=0)
      .map(([d,h])=>({tenant_id:T,resource_id:did('resource:'+r.id),day:M.dayISO(Number(d)),hours:Math.max(0,Math.min(24,Number(h)||0)),is_manual:true}))}));
    steps.push({key:'calendar_override',table:'calendar_override',del:`tenant_id=eq.${T}&is_manual=is.true&resource_id=in.${inList(ov.map(x=>x.id))}`,then:ov.flatMap(x=>x.rows),onConflict:'resource_id,day'});
    /* Arbeitsgruppen / Ernteketten */
    const chains=M.chains(snapshot,plan);
    up('team',chains.map(c=>({id:did('team:'+c.id),tenant_id:T,code:c.id,kind:c.kind==='arbetsgrupp'?'arbetsgrupp':'drivningskedja',name:str(c.name)||c.id,forwarder_lag_days:M.chainLag(c),active:true})));
    if(chains.length)steps.push({key:'team_member',table:'team_member',del:`tenant_id=eq.${T}&team_id=in.${inList(chains.map(c=>did('team:'+c.id)))}`,
      then:chains.flatMap(c=>arr(c.members).map((m,i)=>({tenant_id:T,team_id:did('team:'+c.id),resource_id:did('resource:'+m),sort_order:i}))),onConflict:'team_id,resource_id'});
  }

  /* Administration → Benutzer / Rollen / Übertragungen / Kartenebenen / Vorlagen */
  if(ad){
    up('role',ad.roles.map(r=>({id:did('role:'+r.code),tenant_id:T,code:r.code,name_sv:r.nameSv,name_de:r.nameDe,permissions:arr(r.permissions)})));
    const users=ad.users.filter(u=>u&&u.id&&u.email);
    up('app_user',users.map(u=>({id:did('user:'+u.id),tenant_id:T,email:str(u.email),display_name:str(u.displayName)||str(u.email),phone:nullable(u.phone),language:str(u.language)||'de',
      resource_id:u.resourceId?did('resource:'+u.resourceId):null,active:u.active!==false})));
    if(users.length){
      const uIds=inList(users.map(u=>did('user:'+u.id)));
      steps.push({key:'app_user_role',table:'app_user_role',del:`tenant_id=eq.${T}&user_id=in.${uIds}`,
        then:users.flatMap(u=>arr(u.roles).map(code=>({tenant_id:T,user_id:did('user:'+u.id),role_id:did('role:'+code)}))),onConflict:'user_id,role_id'});
      steps.push({key:'app_user_resource',table:'app_user_resource',del:`tenant_id=eq.${T}&user_id=in.${uIds}`,
        then:users.flatMap(u=>arr(u.resourceAccess).map(code=>({tenant_id:T,user_id:did('user:'+u.id),resource_id:did('resource:'+code)}))),onConflict:'user_id,resource_id'});
    }
    up('resource_transfer',ad.transfers.map(t=>({id:did('transfer:'+t.id),tenant_id:T,transfer_no:t.id,resource_id:did('resource:'+t.resourceId),direction:t.direction==='in'?'in':'out',
      partner_name:str(t.partner),se_number:str(t.seNumber),valid_from:t.date,valid_to:null,note:nullable(t.note)})));
    const L=ad.layers;
    up('map_layer_config',L.order.map((k,i)=>({tenant_id:T,layer_key:k,enabled_by_default:L.on[k]!==false,sort_order:i,colour:L.colours[k]||null,fixed:k==='photo'})),'tenant_id,layer_key');
    const tpl=ad.templates.filter(t=>t&&t.id&&!t._removed);
    up('message_template',tpl.map(t=>({id:did('template:'+t.id),tenant_id:T,code:t.id,name:str(t.name),body:str(t.text).slice(0,500),active:t.active!==false})));
    del('message_template',tpl.length?`id=not.in.${inList(tpl.map(t=>did('template:'+t.id)))}`:'','message_template:prune');
  }

  /* Arbeitsplanung: assignments (calendar bars) */
  const aRows=[];
  if(snapshot)for(const row of allRows){
    const items=M.rowItems(snapshot,plan,row);
    items.forEach((it,i)=>{
      const st=M.timeOf(row,it.start),en=M.timeOf(row,it.end,true),startAt=st?stamp(M,st.day,st.minutes):stamp(M,0,M.START_CLOCK*60);
      let endAt=en?stamp(M,en.day,en.minutes):startAt;if(endAt<startAt)endAt=startAt;
      aRows.push({id:did('assignment:'+it.id),tenant_id:T,work_order_id:did('wo:'+it.orderId),resource_id:row.kind==='chain'?null:did('resource:'+row.id),team_id:row.kind==='chain'?did('team:'+row.id):null,
        sequence_no:i+1,start_at:startAt,end_at:endAt,locked_dates:!!it.lockedDates,manual_hours:Number(it.manualHours)>0?r2(Number(it.manualHours)):null,
        computed_hours:r2(it.estimated),app_start_hour:r3(it.start),status:it.sent?'sent':'planned',sent_at:it.sent?stamp(M,Math.max(0,(it.sentRound||1)-1),M.START_CLOCK*60):null,
        sent_round:it.sent?num(it.sentRound):null,sent_version:it.sent?num(it.sentVersion):null,copy_of_assignment_id:it.copyOf?did('assignment:'+it.copyOf):null});
    });
  }
  const known=new Set(aRows.map(r=>r.id));for(const r of aRows)if(r.copy_of_assignment_id&&!known.has(r.copy_of_assignment_id))r.copy_of_assignment_id=null;
  if(snapshot){up('assignment',aRows);del('assignment',aRows.length?`id=not.in.${inList(aRows.map(r=>r.id))}`:'','assignment:prune');}

  /* Extra landings (Avlägg P-A01-2 …) and planner map symbols (H-A01-S1 …) */
  const lRows=[],sRows=[];
  for(const orderId of Object.keys(plan.edits)){
    const o=orderOf(orderId),primary=o?.landing?.id||('P-'+orderId.replace(/^H-/,''));
    for(const l of M.orderLandings(o||{id:orderId,landing:{id:primary,point:[0,0]}},plan).filter(x=>!x.primary))
      lRows.push({id:did('landing:'+l.id),tenant_id:T,work_order_id:did('wo:'+orderId),code:l.id,name:`Polter ${o?.name||orderId} ${l.no}`,point:point(l.point)});
    for(const s of M.orderSymbols(o||{id:orderId},plan))
      sRows.push({id:did('symbol:'+s.code),tenant_id:T,work_order_id:did('wo:'+orderId),code:s.code,category:s.kind,title:SYMBOL_TITLE[s.kind]||s.kind,geometry:point(s.point)});
  }
  up('landing',lRows);del('landing',`code=like.P-*-*${lRows.length?`&id=not.in.${inList(lRows.map(r=>r.id))}`:''}`,'landing:prune');
  up('map_symbol',sRows);del('map_symbol',`code=like.*-S*${sRows.length?`&id=not.in.${inList(sRows.map(r=>r.id))}`:''}`,'map_symbol:prune');

  /* Skicka: generated OIN / PIN / FOI / FDI (append-only per version; never pruned) */
  const fRows=[];
  for(const [orderId,ins] of Object.entries(plan.instructions)){
    if(!ins||!ins.files)continue;const v=Number(ins.pinVersion)||1,sentAt=stamp(M,Math.max(0,(Number(ins.round)||1)-1),M.START_CLOCK*60);
    const a=plan.assignments.find(x=>x.orderId===orderId&&x.rowId===ins.rowId&&x.sent)||plan.assignments.find(x=>x.orderId===orderId&&x.sent);
    const machine=f=>{const k=f?.OperatingInstruction?.MachineDefinition?.MachineKey||f?.ForwardingObjectInstruction?.MachineDefinition?.MachineKey;return k?did('resource:'+k):null;};
    const base={tenant_id:T,work_order_id:did('wo:'+orderId),assignment_id:a&&known.has(did('assignment:'+a.id))?did('assignment:'+a.id):null,version:v,sent_at:sentAt};
    for(const k of ['oin','foi','fdi']){const f=ins.files[k];if(f)fRows.push({...base,id:did(`instruction:${orderId}:${KIND_FILE[k]}:v${v}`),kind:KIND_FILE[k],file_name:`${KIND_FILE[k]}_${orderId}_v${v}`,
      resource_id:k==='fdi'?machine(ins.files.foi):machine(f),assortment_id:null,payload:f});}
    const oinMachine=machine(ins.files.oin);
    for(const f of arr(ins.files.pin)){const code=f?.ProductInstruction?.ProductDefinition?.ProductUserID;if(!code)continue;
      fRows.push({...base,id:did(`instruction:${orderId}:PIN:${code}:v${v}`),kind:'PIN',file_name:str(f.fileName)||`PIN_${orderId}_${code}_v${v}`,resource_id:oinMachine,assortment_id:did(`as:${orderId}:${code}`),payload:f});}
  }
  up('instruction_file',fRows);

  /* Production from the game (write-only mirror of bridge.productionMessages; the seed owns the opening stock) */
  const msgs=arr(snapshot?.production?.messages).filter(m=>m&&m.kind!=='opening'&&(m.type==='HPR'||m.type==='FPR')&&m.objectKey&&Number.isFinite(m.volume));
  const pm=[],pl=[];
  for(const m of msgs){
    const key=`pm:${m.type}:r${m.round}:${m.objectKey}`,id=did(key),round=Number(m.round)||1;
    pm.push({id,tenant_id:T,kind:m.type,resource_id:m.machineKey?did('resource:'+m.machineKey):null,work_order_id:did('wo:'+m.objectKey),received_at:stamp(M,round-1,17*60),
      file_name:`${m.type}_${m.objectKey}_r${round}`,is_opening_stock:false,game_round:round,payload:m});
    const line=(code,vals)=>pl.push({id:did(`pl:${m.type}:r${m.round}:${m.objectKey}:${code}`),tenant_id:T,message_id:id,assortment_id:did(`as:${m.objectKey}:${code}`),
      felled_m3:r3(vals.felled||0),forwarded_m3:r3(vals.forwarded||0),downgraded_m3:r3(vals.downgraded||0)});
    if(m.type==='HPR'){const down=Math.max(0,Number(m.downgraded)||0),saw=Math.max(0,m.volume*.65-down),pulp=m.volume*.35; // game: saw share 0.65, downgraded saw logs → ABW
      line('SAG',{felled:saw});line('IND',{felled:pulp});if(down>0)line('ABW',{felled:down,downgraded:down});}
    else{const saw=Math.max(0,Math.min(m.volume,Number(m.sawVolume)||0));line('SAG',{forwarded:saw});line('IND',{forwarded:m.volume-saw});} // FPR: non-saw share not split further
  }
  up('production_message',pm);up('production_line',pl);
  if(snapshot)del('production_message',`game_round=not.is.null&is_opening_stock=is.false${pm.length?`&id=not.in.${inList(pm.map(r=>r.id))}`:''}`,'production_message:prune');
  return steps;
}

/* ---------- Rows → plan (load) ---------- */
/** Reverse a demo id for keys that have no business-key column (user ids, assignment ids). */
function reverseId(id,kind,candidates){for(const c of candidates)if(demoId(kind+':'+c)===id)return c;return null;}
function planFrom(db,snapshot,{M=M0(),A=A0(),userHints=[]}={}){
  const plan=M.emptyPlan(),code=new Map(db.resource.map(r=>[r.id,r.code])),team=new Map(db.team.map(t=>[t.id,t.code])),wo=new Map(db.work_order.map(w=>[w.id,w.order_no]));
  const opName=new Map(db.operation_type.map(o=>[o.id,o.name_sv])),roleCode=new Map(db.role.map(r=>[r.id,r.code])),clientCode=new Map(db.client.map(c=>[c.id,c.code]));
  const day=d=>d?String(d).slice(0,10):'';
  /* Administration */
  const c=db.company[0]||{},admin=plan.admin={company:{},clients:[],contracts:[],roles:{},users:[],transfers:[],layers:{},templates:[]};
  admin.company={name:str(c.name),orgNo:str(c.org_no),address:str(c.address),phone:str(c.phone),email:str(c.email),contactName:str(c.contact_name),country:str(c.country)||'DE',defaultLanguage:str(c.default_language)||'de',biometriaId:str(c.biometria_id)};
  if(c.contact_phone)admin.company.contactPhone=c.contact_phone;if(c.contact_email)admin.company.contactEmail=c.contact_email;
  for(const r of db.role)admin.roles[r.code]=arr(r.permissions);
  admin.clients=db.client.map(x=>({code:x.code,name:str(x.name),regions:arr(x.regions),customerGroups:arr(x.customer_groups),phone:str(x.phone),email:str(x.email)}));
  const gameNos=new Set((A?A.gameContracts(snapshot||{}):[]).map(x=>x.contractNo)),ops=id=>db.contract_operation_type.filter(x=>x.contract_id===id).map(x=>opName.get(x.operation_type_id)).filter(Boolean);
  admin.contracts=db.contract.map(x=>gameNos.has(x.contract_no)?{contractNo:x.contract_no,validFrom:day(x.valid_from),validTo:day(x.valid_to),operationTypes:ops(x.id)}
    :{contractNo:x.contract_no,name:str(x.name),clientCode:clientCode.get(x.client_id)||'',validFrom:day(x.valid_from),validTo:day(x.valid_to),operationTypes:ops(x.id),
      targetVolume:num(x.target_volume_m3),targetSaw:num(x.target_saw_m3),prices:Object.fromEntries(['SAG','IND','ABW'].map(k=>[k,num(obj(x.prices)[k])])),shortfall:num(x.shortfall_eur_per_m3)});
  const userIds=[...new Set([...(A?A.USERS.map(u=>u.id):[]),...userHints,...Array.from({length:999},(_,i)=>'user-'+String(i+1).padStart(2,'0'))])];
  admin.users=db.app_user.map(u=>({id:reverseId(u.id,'user',userIds)||u.email,email:str(u.email),displayName:str(u.display_name),phone:str(u.phone),language:str(u.language)||'de',
    roles:db.app_user_role.filter(x=>x.user_id===u.id).map(x=>roleCode.get(x.role_id)).filter(Boolean),resourceId:u.resource_id?code.get(u.resource_id)||null:null,
    resourceAccess:db.app_user_resource.filter(x=>x.user_id===u.id).map(x=>code.get(x.resource_id)).filter(Boolean),active:u.active!==false}));
  admin.transfers=db.resource_transfer.map(t=>({id:t.transfer_no,resourceId:code.get(t.resource_id)||'',direction:t.direction,partner:str(t.partner_name),seNumber:str(t.se_number),date:day(t.valid_from),note:str(t.note)}));
  if(db.map_layer_config.length){const ls=[...db.map_layer_config].sort((x,y)=>x.sort_order-y.sort_order);
    admin.layers={order:ls.map(l=>l.layer_key),on:Object.fromEntries(ls.map(l=>[l.layer_key,!!l.enabled_by_default])),colours:Object.fromEntries(ls.filter(l=>l.colour).map(l=>[l.layer_key,l.colour]))};}
  admin.templates=db.message_template.map(t=>({id:t.code,name:str(t.name),text:str(t.body),active:t.active!==false}));
  if(A)for(const t of A.TEMPLATES)if(!db.message_template.some(x=>x.code===t.id))admin.templates.push({id:t.id,_removed:true});
  /* Ressourcen */
  const snapIds=new Set((snapshot?.resources||[]).map(r=>r.id));
  for(const r of db.resource){
    const id=r.id,weekly={};for(const h of db.resource_weekly_hours.filter(x=>x.resource_id===id))weekly[h.weekday]=Number(h.hours);
    const production={};for(const p of db.resource_production_rate.filter(x=>x.resource_id===id)){const n=opName.get(p.operation_type_id);if(n)production[n]=Number(p.m3_per_hour);}
    const days={};for(const o of db.calendar_override.filter(x=>x.resource_id===id&&x.is_manual!==false)){const i=M.dayIndexOf(day(o.day));if(i!=null&&i>=0)days[i]=Number(o.hours);}
    const out=db.resource_transfer.filter(t=>t.resource_id===id).sort((x,y)=>day(x.valid_from).localeCompare(day(y.valid_from))||str(x.transfer_no).localeCompare(str(y.transfer_no))).at(-1);
    const rec={name:str(r.name),model:str(r.model),stanford:str(r.stanford_code),operation:str(r.description),rate:num(r.base_rate)??0,unit:str(r.base_rate_unit),active:r.active!==false,plannable:r.plannable!==false,
      subcontractor:!!r.is_subcontractor,weekly,production,days,base:{manufacturer:str(r.manufacturer),year:num(r.model_year),bearingClass:str(r.bearing_class),plateWeight:num(r.plate_weight_kg),
      extinguisherChecked:day(r.extinguisher_checked_on),aggregate:str(r.aggregate_model),phone:str(r.phone),email:str(r.email),servicePackages:arr(r.service_packages),woodforceStart:day(r.woodforce_start_date)}};
    if(r.is_subcontractor&&out&&out.direction==='out')rec.subcontractorName=str(out.partner_name);
    if(r.unit_data_consent!=null)rec.unitDataConsent={granted:!!r.unit_data_consent,date:r.unit_data_consent?day(r.unit_data_consent_on)||null:null};
    if(snapIds.has(r.code))plan.resources[r.code]=rec;else plan.extraResources.push({id:r.code,type:r.type,...rec,followUp:null});
  }
  if(db.team.length)plan.chains=db.team.filter(t=>t.active!==false).map(t=>({id:t.code,name:str(t.name),kind:t.kind,members:db.team_member.filter(m=>m.team_id===t.id).sort((x,y)=>x.sort_order-y.sort_order).map(m=>code.get(m.resource_id)).filter(Boolean),lag:Number(t.forwarder_lag_days)}));
  /* Arbeitsplanung: assignment uuids are md5('cfh-demo:assignment:A<n>'); the client ids A<n> are recovered by search, rows
     written by something else get fresh ids after the highest one (SCHEMA §6.2 "the adapter keeps the mapping"). */
  const as=db.assignment.filter(a=>a.status!=='cancelled'&&wo.has(a.work_order_id)&&(code.has(a.resource_id)||team.has(a.team_id)))
    .sort((x,y)=>(num(x.app_start_hour)??0)-(num(y.app_start_hour)??0)||str(x.start_at).localeCompare(str(y.start_at))||str(x.id).localeCompare(str(y.id)));
  const appId=new Map(),want=new Set(as.map(a=>a.id));
  for(let n=1;n<=ASSIGNMENT_SEARCH&&want.size;n++){const u=demoId('assignment:A'+n);if(want.has(u)){appId.set(u,'A'+n);want.delete(u);}}
  let top=Math.max(0,...[...appId.values()].map(x=>Number(x.slice(1))));for(const a of as)if(!appId.has(a.id))appId.set(a.id,'A'+(++top));
  plan.assignments=as.map(a=>{const rowId=a.resource_id?code.get(a.resource_id):team.get(a.team_id),sent=a.status==='sent';
    let startHour=num(a.app_start_hour);if(startHour==null&&snapshot){const row=M.rows(snapshot,plan).find(r=>r.id===rowId),d=dayOfStamp(M,a.start_at);startHour=row&&d!=null?M.hourAt(row,d):0;}
    const id=appId.get(a.id),x={id,orderId:wo.get(a.work_order_id),rowId,startHour:startHour??0,sent,sentRound:sent?num(a.sent_round):null,sentVersion:sent?num(a.sent_version)||0:0,seq:Number(id.slice(1)),manualHours:num(a.manual_hours)};
    if(a.copy_of_assignment_id&&appId.has(a.copy_of_assignment_id))x.copyOf=appId.get(a.copy_of_assignment_id);if(a.locked_dates)x.lockedDates=true;return x;});
  plan.seq=top;
  /* Extra landings and symbols */
  for(const l of db.landing){const m=/-(\d+)$/.exec(l.code),orderId=wo.get(l.work_order_id),p=coords(l.point);if(!m||!orderId||!p)continue;const e=plan.edits[orderId]??={};(e.landings??=[]).push({id:'L'+m[1],no:Number(m[1]),point:p});}
  for(const s of db.map_symbol){const m=/-S(\d+)$/.exec(s.code),orderId=wo.get(s.work_order_id),p=coords(s.geometry);if(!m||!orderId||!p||!M.SYMBOL_KINDS.includes(s.category))continue;const e=plan.edits[orderId]??={};(e.symbols??=[]).push({id:'S'+m[1],no:Number(m[1]),kind:s.category,point:p});}
  for(const e of Object.values(plan.edits)){e.landings?.sort((x,y)=>x.no-y.no);e.symbols?.sort((x,y)=>x.no-y.no);}
  /* Sent instruction files: latest version per order that still has a sent assignment */
  const byOrder={};for(const f of db.instruction_file){const o=wo.get(f.work_order_id);if(o)(byOrder[o]??=[]).push(f);}
  for(const [orderId,files] of Object.entries(byOrder)){
    const sentA=plan.assignments.filter(a=>a.orderId===orderId&&a.sent);if(!sentA.length)continue;
    const v=Math.max(...files.map(f=>Number(f.version)||1)),cur=files.filter(f=>(Number(f.version)||1)===v),pick=k=>cur.find(f=>f.kind===k)?.payload||null;
    const viaA=cur.map(f=>appId.get(f.assignment_id)).find(Boolean),a=sentA.find(x=>x.id===viaA)||sentA[0],d=dayOfStamp(M,cur[0].sent_at);
    plan.instructions[orderId]={round:d==null?a.sentRound||1:d+1,pinVersion:v,rowId:a.rowId,files:{oin:pick('OIN'),pin:cur.filter(f=>f.kind==='PIN').map(f=>f.payload),foi:pick('FOI'),fdi:pick('FDI')}};
  }
  return M.normalizePlan(plan);
}
const ASSIGNMENT_SEARCH=5000;
const LOAD_TABLES=['role','app_user','app_user_role','app_user_resource','client','contract','contract_operation_type','operation_type','resource','resource_weekly_hours',
  'resource_production_rate','calendar_override','team','team_member','resource_transfer','map_layer_config','message_template','assignment','landing','map_symbol','instruction_file'];

/* ---------- Backends ---------- */
function emitter(){const fns=new Set();return{on(fn){fns.add(fn);return()=>fns.delete(fn);},emit(ev){for(const fn of [...fns]){try{fn(ev);}catch(e){(g.console||{}).error?.(e);}}}};}
function LocalStore({storage}={}){
  const s=storage!==undefined?storage:(()=>{try{return g.sessionStorage;}catch{return null;}})(),ev=emitter();let state={kind:'local'};
  const api={kind:'local',remote:false,
    read(){try{return JSON.parse(s?.getItem(PLAN_KEY)||'null');}catch{return null;}},
    load(){return Promise.resolve(api.read());},
    save(plan){let ok=false;try{s.setItem(PLAN_KEY,JSON.stringify(plan));ok=true;}catch{}ev.emit({type:'saved',plan,ok,remote:false});return ok;},
    subscribe:fn=>ev.on(fn),flush:()=>Promise.resolve(true),pending:()=>false,
    status:()=>({...state}),_mark(extra){state={...state,...extra};}};
  return api;
}
const configured=c=>!!(c&&typeof c.supabaseUrl==='string'&&/^https?:\/\//.test(c.supabaseUrl.trim())&&typeof c.publishableKey==='string'&&c.publishableKey.trim());
function SupabaseStore({config,fetch:f,local=LocalStore(),context=()=>({}),debounce=DEBOUNCE_MS,timers={setTimeout:(...a)=>setTimeout(...a),clearTimeout:x=>clearTimeout(x)},M,A}={}){
  const fetchFn=f||(typeof g.fetch==='function'?g.fetch.bind(g):null),schema=(config.schema||'cfharvest').trim(),key=config.publishableKey.trim();
  const base=config.supabaseUrl.trim().replace(/\/+$/,'')+'/rest/v1/',tenant=(config.tenantId||'').trim()||DEMO_TENANT,ev=emitter();
  let mode='remote',reason=null,timer=null,queued=null,inflight=null,loadP=null;const written=new Map();
  const headers=write=>{const h={apikey:key,'Accept-Profile':schema,Accept:'application/json'};if(/^eyJ/.test(key))h.Authorization='Bearer '+key; // legacy anon JWT; sb_publishable_ keys go in apikey only
    if(write){h['Content-Profile']=schema;h['Content-Type']='application/json';}return h;};
  async function call(method,path,body,{prefer,keepalive}={}){
    if(!fetchFn)throw Error('fetch unavailable');
    const h=headers(method!=='GET');if(prefer)h.Prefer=prefer;
    const res=await fetchFn(base+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),keepalive:!!keepalive});
    if(!res||!res.ok){let t='';try{t=await res.text();}catch{}throw Error(`${method} ${path.split('?')[0]} → ${res?res.status:'no response'} ${t.slice(0,200)}`);}
    return method==='GET'?res.json():null;
  }
  function fallback(why){if(mode==='local')return;mode='local';reason=String(why?.message||why||'error');if(timer){timers.clearTimeout(timer);timer=null;}queued=null;
    (g.console||{}).warn?.('[CFHarvest] Supabase-Speicher deaktiviert:',reason);ev.emit({type:'status',status:api.status()});}
  async function load(){
    try{
      const company=await call('GET',`company?select=*&id=eq.${tenant}`);
      if(!company.length){fallback('Mandant '+tenant+' nicht in der Datenbank (seed.sql ausführen)');return null;}
      const q=t=>call('GET',`${t}?select=*&tenant_id=eq.${tenant}`),wq=call('GET',`work_order?select=id,order_no&tenant_id=eq.${tenant}`);
      const rows=await Promise.all([...LOAD_TABLES.map(q),wq]),db={company};LOAD_TABLES.forEach((t,i)=>{db[t]=rows[i];});db.work_order=rows.at(-1);
      const plan=planFrom(db,context().snapshot,{M,A,userHints:arr(local.read()?.admin?.users).map(u=>u?.id).filter(Boolean)});
      ev.emit({type:'loaded',plan,remote:true});return plan;
    }catch(e){fallback(e);return null;}
  }
  async function write(plan,opts){
    const steps=rowsFor(plan,context().snapshot,{tenant,M,A});
    for(const s of steps){
      const body=JSON.stringify([s.del||'',s.rows||s.then||[]]);if(written.get(s.key)===body)continue;
      if(s.del)await call('DELETE',`${s.table}?${s.del}`,undefined,{prefer:'return=minimal',...opts});
      const rows=s.rows||s.then;
      if(rows&&rows.length)await call('POST',`${s.table}?on_conflict=${s.onConflict||'id'}`,rows,{prefer:'resolution=merge-duplicates,return=minimal',...opts});
      written.set(s.key,body);
    }
    ev.emit({type:'saved',plan,ok:true,remote:true});return true;
  }
  function flush(opts={}){
    if(timer){timers.clearTimeout(timer);timer=null;}
    if(mode!=='remote'||!queued)return inflight||Promise.resolve(mode==='remote');
    const plan=queued;queued=null;
    const run=(inflight||Promise.resolve()).then(()=>loadP||null).then(()=>mode==='remote'?write(plan,opts):false).catch(e=>{fallback(e);return false;});
    const p=run.finally(()=>{if(inflight===p)inflight=null;});inflight=p;return run;
  }
  const api={kind:'supabase',remote:true,tenant,
    read:()=>local.read(),
    load(){if(mode!=='remote')return Promise.resolve(null);if(!loadP)loadP=load();return loadP;},
    save(plan){const ok=local.save(plan);if(mode!=='remote')return ok;queued=structuredClone(plan);if(timer)timers.clearTimeout(timer);timer=timers.setTimeout(()=>{timer=null;flush();},debounce);return ok;},
    subscribe:fn=>{const a=ev.on(fn),b=local.subscribe(e=>{if(mode!=='remote')fn(e);});return()=>{a();b();};},
    flush,pending:()=>!!(timer||queued||inflight),
    status:()=>({kind:mode==='remote'?'supabase':'local',requested:'supabase',fallback:mode!=='remote',reason,notice:mode!=='remote'?NOTICE:null,tenant})};
  return api;
}
/** Backend selection: ?store=supabase|local, else localStorage['cfharvest-store']; default local. A Supabase request without a
    config yields the LocalStore with the fallback notice. */
function requested({location:loc,localStorage:ls}={}){
  try{const q=new URLSearchParams(loc?.search||'').get('store');if(q==='supabase'||q==='local')return q;}catch{}
  try{if(ls?.getItem(SELECT_KEY)==='supabase')return 'supabase';}catch{}
  return 'local';
}
function create(opts={}){
  const loc=opts.location!==undefined?opts.location:g.location,ls=opts.localStorage!==undefined?opts.localStorage:(()=>{try{return g.localStorage;}catch{return null;}})();
  const local=LocalStore({storage:opts.sessionStorage}),config=opts.config!==undefined?opts.config:C0();
  if(requested({location:loc,localStorage:ls})!=='supabase')return local;
  if(!configured(config)){local._mark({requested:'supabase',fallback:true,reason:'config.js ohne supabaseUrl / publishableKey',notice:NOTICE});return local;}
  return SupabaseStore({config,fetch:opts.fetch,local,context:opts.context,debounce:opts.debounce,timers:opts.timers,M:opts.M,A:opts.A});
}
return{PLAN_KEY,SELECT_KEY,NOTICE,DEBOUNCE_MS,DEMO_TENANT,md5,demoId,stamp,berlinOffset,rowsFor,planFrom,LocalStore,SupabaseStore,requested,configured,create};
})();
if(typeof module!=='undefined')module.exports=CFHStore;
