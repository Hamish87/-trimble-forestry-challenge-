// CFHarvest replica plan store (cfharvest/app/store.js): LocalStore round trip, backend selection, and the SupabaseStore against
// a fake fetch that behaves like PostgREST (in-memory tables, eq/in/not.in/like/is filters, merge-duplicates upserts). Checks URLs,
// profile headers, debounce, batching, payload shapes per SCHEMA.md §6, a save → load round trip, delete mirroring, the fallback to
// the local session on a 500, on an empty config and on an empty database, and the replica page itself in jsdom.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
global.ForestGame=require('../dist/game.js');global.ForestJourney=require('../dist/journey.js');global.WorksiteRoutes=require('../dist/routes.js');
const g=global.ForestGame,j=global.ForestJourney;
const M=global.CFHModel=require('../cfharvest/app/model.js'),A=global.CFHAdmin=require('../cfharvest/app/admin-model.js'),B=require('../cfharvest/app/bridge.js'),S=require('../cfharvest/app/store.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),tick=()=>new Promise(r=>setImmediate(r));
const did=k=>{const h=crypto.createHash('md5').update('cfh-demo:'+k).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const T=did('company');
const warnings=[],warn=console.warn;console.warn=(...a)=>{if(String(a[0]).startsWith('[CFHarvest]'))warnings.push(a.join(' '));else warn(...a);}; // fallbacks are expected here

/* ---------- Fake PostgREST ---------- */
function memStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),get length(){return m.size;},key:i=>[...m.keys()][i]??null};}
function matches(row,col,expr){
  let neg=false;if(expr.startsWith('not.')){neg=true;expr=expr.slice(4);}
  const v=row[col];let ok;
  if(expr.startsWith('eq.'))ok=String(v)===expr.slice(3);
  else if(expr.startsWith('in.('))ok=expr.slice(4,-1).split(',').includes(String(v));
  else if(expr.startsWith('like.'))ok=new RegExp('^'+expr.slice(5).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$').test(String(v));
  else if(expr.startsWith('is.'))ok=expr==='is.null'?v==null:v===(expr==='is.true');
  else throw Error('unsupported filter '+col+'='+expr);
  return neg?!ok:ok;
}
function fakeRest(seed={},{fail}={}){
  const db=structuredClone(seed),calls=[];
  async function fetch(url,init={}){
    const u=new URL(url),method=init.method||'GET',table=u.pathname.split('/').pop(),body=init.body?JSON.parse(init.body):undefined,call={url,method,table,headers:init.headers||{},body,keepalive:init.keepalive};calls.push(call);
    if(fail&&fail(call))return{ok:false,status:500,text:async()=>'{"message":"boom"}',json:async()=>({})};
    assert.equal(u.pathname.split('/').slice(0,-1).join('/'),'/rest/v1','REST path');
    const rows=db[table]??=[],filters=[...u.searchParams].filter(([k])=>!['select','on_conflict'].includes(k)),keep=r=>filters.every(([k,v])=>matches(r,k,v));
    if(method==='GET')return{ok:true,status:200,json:async()=>structuredClone(rows.filter(keep)),text:async()=>''};
    if(method==='DELETE'){db[table]=rows.filter(r=>!keep(r));return{ok:true,status:204,json:async()=>null,text:async()=>''};}
    if(method==='POST'){const on=(u.searchParams.get('on_conflict')||'id').split(',');
      for(const r of body){const i=rows.findIndex(x=>on.every(c=>String(x[c])===String(r[c])));if(i>=0)rows[i]={...rows[i],...r};else rows.push({...r});}
      return{ok:true,status:201,json:async()=>null,text:async()=>''};}
    throw Error('method '+method);
  }
  return{fetch,db,calls,reset(){calls.length=0;}};
}
// Seeded rows the store only references (seed.sql): tenant, Maßnahmen, work orders.
const SEED={company:[{id:T,tenant_id:T,name:'Demo-Lohnunternehmen',country:'DE',default_language:'de',biometria_id:'90010+00000',contact_name:'Disposition (Demo)'}],
  operation_type:M.OPERATIONS.map((o,i)=>({id:did('op:'+['slutavverkning','forsta_gallring','gallring'][i]),tenant_id:T,code:['slutavverkning','forsta_gallring','gallring'][i],name_sv:o.key,name_de:o.de})),
  work_order:['H-A01','H-B01','H-C01'].map(no=>({id:did('wo:'+no),tenant_id:T,order_no:no}))};
const CONFIG={supabaseUrl:'https://demo-ref.supabase.co/',publishableKey:'sb_publishable_TESTKEY',schema:'cfharvest',tenantId:''};

/* ---------- Game state with one shift played (production) and a plan touching every mapped part ---------- */
let state=j.start(j.choose(j.initial(),'contractType','standard'));state=g.calculate(state).next;
const snap=B.fromGameState(state),ctx=()=>({snapshot:snap});
function buildPlan(){
  let p=M.assign(M.emptyPlan(),snap,['H-A01'],'K-01',{mode:'day',day:1});
  p=M.assign(p,snap,['H-B01'],'H-01',{mode:'day',day:3});
  p=M.send(p,snap,{rowIds:['K-01']});
  const b=p.assignments.find(a=>a.orderId==='H-B01');p=M.moveItem(p,snap,b.id,'F-01',{copy:true});p=M.commit(p,snap);
  p=M.addLanding(p,'H-A01',[130.04,205.5]);p=M.addSymbol(p,'H-A01','protect',[100,120]);p=M.addSymbol(p,'H-B01','turn',[350,90]);
  p=A.saveCompany(p,{name:'Forst Müller GmbH',biometriaId:'12345+00000',contactName:'Frau Test'});
  p=A.saveUser(p,{id:'user-01',email:'neu@demo.invalid',displayName:'Neue Planerin',phone:'',language:'de',roles:['planner'],resourceAccess:['H-01','F-01'],resourceId:null});
  p=A.saveRoles(p,{planner:['plan.read','plan.write']});
  p=A.saveClient(p,{code:'HOL',name:'Holz AG'});
  p=A.saveContract(p,{contractNo:'V-26-099',name:'Eigenvertrag',clientCode:'HOL',validFrom:'2026-11-01',validTo:'2026-11-30',operationTypes:['Gallring'],targetVolume:100,targetSaw:null,prices:{SAG:70,IND:null,ABW:null},shortfall:null});
  p=A.saveContract(p,{contractNo:'V-26-014',validFrom:'2026-10-19',validTo:'2026-11-06',operationTypes:['Slutavverkning','Gallring']});
  p=A.addTransfer(p,{resourceId:'L-01',direction:'out',partner:'Fuhr GmbH',seNumber:'SE 123456-7890',date:'2026-10-20'});
  p=A.saveTemplate(p,{id:'MT-04',name:'Wetter',text:'Sturmwarnung für {Ressource}',active:true});p=A.removeTemplate(p,'MT-03');
  p=A.saveLayers(p,{order:['photo','routes','stands','landings','symbols','protect','neighbours','machines'],on:{routes:true,neighbours:false},colours:{stands:'#123456'}});
  p.resources['H-01']={weekly:{...snap.resources[0].weekly,sat:6},production:{...snap.resources[0].production,Gallring:22},days:{2:4,9:0},unitDataConsent:{granted:false,date:null}};
  p.extraResources.push({id:'R-01',type:'person',name:'Motorsäge R-01',model:'',stanford:'',operation:'Holzernte',rate:3,unit:'fm/h',production:{'Slutavverkning':3},weekly:{mon:8,tue:8,wed:8,thu:8,fri:8,sat:0,sun:0},active:true,plannable:true,subcontractor:false,followUp:null,
    unitDataConsent:{granted:true,date:'2026-10-20'},base:{manufacturer:'',year:null,bearingClass:'',plateWeight:null,extinguisherChecked:'',aggregate:'',phone:'',email:'',servicePackages:[],woodforceStart:''}});
  p.chains=[{id:'K-01',name:'H-01/F-01',kind:'drivningskedja',members:['H-01','F-01'],lag:2}];
  return M.normalizePlan(p);
}
const plan=buildPlan();

(async()=>{
 const results=[];
 /* 1. md5 demo ids = Postgres md5(text)::uuid; Europe/Berlin timestamps. */
 for(const k of ['company','wo:H-A01','assignment:A1','as:H-A01:SAG','käse'])assert.equal(S.demoId(k),did(k));
 assert.equal(S.DEMO_TENANT,'f4c51e67-2faa-9000-8bd0-6b3185938fe1','same uuid as psql: select md5(\'cfh-demo:company\')::uuid');
 assert.equal(S.stamp(M,0,9*60),'2026-10-19T07:00:00.000Z','19.10.2026 09:00 CEST');assert.equal(S.stamp(M,7,9*60),'2026-10-26T08:00:00.000Z','26.10.2026 09:00 CET');
 results.push('md5 ids + Berlin time');

 /* 2. LocalStore: today's sessionStorage behaviour, synchronous. */
 const ss=memStorage(),local=S.LocalStore({storage:ss}),seen=[];const off=local.subscribe(e=>seen.push(e.type));
 assert.equal(local.read(),null);assert.equal(local.save(plan),true);assert.equal(ss.getItem('cfharvest-plan-v1'),JSON.stringify(plan),'same key and JSON as before');
 assert.deepEqual(local.read(),plan);assert.deepEqual(await local.load(),plan);assert.deepEqual(seen,['saved']);off();local.save(plan);assert.equal(seen.length,1,'unsubscribe');
 assert.equal(local.pending(),false);assert.equal(await local.flush(),true);assert.deepEqual(local.status(),{kind:'local'});
 assert.equal(S.LocalStore({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}}).save(plan),false,'blocked storage does not throw');
 results.push('LocalStore round trip');

 /* 3. Selection: default local, ?store=supabase, localStorage flag, ?store=local wins; empty config → local + notice. */
 const ls=memStorage(),loc=search=>({search});
 assert.equal(S.create({location:loc(''),localStorage:ls,sessionStorage:memStorage(),config:CONFIG}).kind,'local');
 assert.equal(S.create({location:loc('?store=supabase'),localStorage:ls,sessionStorage:memStorage(),config:CONFIG,fetch:fakeRest().fetch}).kind,'supabase');
 ls.setItem('cfharvest-store','supabase');assert.equal(S.create({location:loc(''),localStorage:ls,sessionStorage:memStorage(),config:CONFIG,fetch:fakeRest().fetch}).kind,'supabase');
 assert.equal(S.create({location:loc('?store=local'),localStorage:ls,sessionStorage:memStorage(),config:CONFIG}).kind,'local');
 const shipped=require('../cfharvest/app/config.js');assert.deepEqual(shipped,{supabaseUrl:'',publishableKey:'',schema:'cfharvest',tenantId:''},'config.js ships empty');
 const noCfg=S.create({location:loc('?store=supabase'),localStorage:memStorage(),sessionStorage:memStorage(),config:shipped});
 assert.equal(noCfg.kind,'local');assert.equal(noCfg.status().fallback,true);assert.equal(noCfg.status().notice,'Datenbank nicht erreichbar – lokale Sitzung');
 assert.equal(noCfg.save(plan),true,'still saves locally');
 assert(!/service_role|secret/i.test(fs.readFileSync('cfharvest/app/config.js','utf8').replace(/NEVER put a service_role \/ secret key here/,'')),'no service key in config.js');
 results.push('backend selection + empty config notice');

 /* 4. SupabaseStore: load, profile headers, debounce, batching, payload shapes. */
 let rest=fakeRest(SEED),sess=memStorage(),events=[];
 let st=S.SupabaseStore({config:CONFIG,fetch:rest.fetch,local:S.LocalStore({storage:sess}),context:ctx});st.subscribe(e=>events.push(e.type));
 const first=await st.load();
 assert.equal(rest.calls[0].url,`https://demo-ref.supabase.co/rest/v1/company?select=*&id=eq.${T}`,'trailing slash trimmed, tenant = demo company');
 for(const c of rest.calls){assert.equal(c.method,'GET');assert.equal(c.headers['Accept-Profile'],'cfharvest');assert.equal(c.headers.apikey,'sb_publishable_TESTKEY');assert.equal(c.headers.Authorization,undefined,'publishable keys go in apikey only');assert(c.url.includes(`tenant_id=eq.${T}`)||c.table==='company');}
 assert(rest.calls.some(c=>c.table==='assignment')&&rest.calls.some(c=>c.table==='instruction_file'),'loads the planning tables');
 assert.equal(first.assignments.length,0,'seeded but unplanned database → nothing planned');assert.equal(st.status().kind,'supabase');
 rest.reset();
 const p1=structuredClone(plan);p1.assignments=p1.assignments.slice(0,1);
 st.save(p1);st.save(structuredClone(plan));const p3=structuredClone(plan);st.save(p3);
 assert.equal(rest.calls.length,0,'debounced: nothing sent synchronously');assert.equal(st.pending(),true);
 assert.deepEqual(JSON.parse(sess.getItem('cfharvest-plan-v1')),p3,'session copy written at once');
 await wait(150);assert.equal(rest.calls.length,0,'still inside the 300 ms window');
 await wait(250);await st.flush();assert.equal(st.pending(),false);
 const posts=rest.calls.filter(c=>c.method==='POST'),byTable=t=>posts.filter(c=>c.table===t);
 for(const t of ['assignment','landing','map_symbol','instruction_file','production_message','production_line','resource','app_user'])assert.equal(byTable(t).length,1,'one batched upsert for '+t);
 for(const c of rest.calls.filter(c=>c.method!=='GET')){assert.equal(c.headers['Content-Profile'],'cfharvest');assert.equal(c.headers['Accept-Profile'],'cfharvest');assert.equal(c.headers['Content-Type'],'application/json');}
 for(const c of posts){assert.equal(c.headers.Prefer,'resolution=merge-duplicates,return=minimal');assert(/\?on_conflict=/.test(c.url));for(const r of c.body)if('tenant_id'in r)assert.equal(r.tenant_id,T);}
 assert.equal(byTable('company')[0].body[0].id,T);assert.equal(byTable('company')[0].body[0].biometria_id,'12345+00000');assert(!('tenant_id'in byTable('company')[0].body[0]),'company.tenant_id is generated');
 // assignments: the last plan wins; chain bar → team_id, copy → copy_of_assignment_id.
 const aBody=byTable('assignment')[0].body;assert.equal(aBody.length,plan.assignments.length,'debounce sent the last plan');
 const aK=aBody.find(r=>r.team_id),src=plan.assignments.find(a=>a.rowId==='K-01');
 assert.deepEqual(Object.keys(aK).sort(),['app_start_hour','computed_hours','copy_of_assignment_id','end_at','id','locked_dates','manual_hours','resource_id','sent_at','sent_round','sent_version','sequence_no','start_at','status','team_id','tenant_id','work_order_id']);
 assert.deepEqual([aK.id,aK.work_order_id,aK.team_id,aK.resource_id,aK.status,aK.sent_round,aK.sequence_no,aK.app_start_hour],[did('assignment:'+src.id),did('wo:H-A01'),did('team:K-01'),null,'sent',src.sentRound,1,src.startHour]);
 assert(aK.start_at.endsWith('Z')&&aK.start_at<aK.end_at&&aK.sent_at.endsWith('Z'));close1(aK.computed_hours,M.durationHours(snap.orders[0],M.rows(snap,plan).find(r=>r.id==='K-01')));
 const copy=aBody.find(r=>r.copy_of_assignment_id);assert.equal(copy.resource_id,did('resource:F-01'));assert.equal(copy.copy_of_assignment_id,did('assignment:'+plan.assignments.find(a=>a.orderId==='H-B01'&&a.rowId==='H-01').id));
 assert(rest.calls.some(c=>c.method==='DELETE'&&c.table==='assignment'&&c.url.includes('id=not.in.(')),'assignments are mirrored (prune)');
 // landings / symbols: GeoJSON points, codes P-A01-2 and H-A01-S1.
 assert.deepEqual(byTable('landing')[0].body,[{id:did('landing:P-A01-2'),tenant_id:T,work_order_id:did('wo:H-A01'),code:'P-A01-2',name:'Polter Nordhang 2',point:{type:'Point',coordinates:[130,205.5]}}]);
 assert.deepEqual(byTable('map_symbol')[0].body.map(r=>[r.code,r.category,r.geometry.type,r.work_order_id]),[['H-A01-S1','protect','Point',did('wo:H-A01')],['H-B01-S1','turn','Point',did('wo:H-B01')]]);
 // instruction files: OIN + PIN (per assortment) + FOI + FDI of the order sent on K-01.
 const fBody=byTable('instruction_file')[0].body;assert.deepEqual(fBody.map(r=>r.kind).sort(),['FDI','FOI','OIN','PIN','PIN']);
 const pin=fBody.find(r=>r.kind==='PIN'&&r.assortment_id===did('as:H-A01:SAG'));assert(pin,'PIN → assortment SAG');assert.equal(pin.resource_id,did('resource:H-01'));assert.equal(pin.payload.fileName,pin.file_name);
 assert.equal(fBody.find(r=>r.kind==='FOI').resource_id,did('resource:F-01'));assert(fBody.every(r=>r.assignment_id===aK.id&&r.work_order_id===did('wo:H-A01')&&r.version===1));
 // production (write-only): the shift's HPR/FPR, lines per assortment; the seed's opening stock is not touched.
 const pm=byTable('production_message')[0].body,pl=byTable('production_line')[0].body,shift=state.history[0];
 assert.deepEqual(pm.map(m=>[m.kind,m.game_round,m.is_opening_stock]),[['HPR',1,false],['FPR',1,false]]);assert(!pm.some(m=>m.id===did('pm:opening:H-B01')));
 const hpr=pm[0];assert.equal(hpr.id,did('pm:HPR:r1:'+B.orderId(shift.harvestOrigin)));assert.equal(hpr.resource_id,did('resource:H-01'));
 const felled=pl.filter(l=>l.message_id===hpr.id);close1(felled.reduce((a,l)=>a+l.felled_m3,0),shift.harvest,1e-2);
 const fpr=pl.filter(l=>l.message_id===pm[1].id);close1(fpr.reduce((a,l)=>a+l.forwarded_m3,0),shift.forwarded,1e-2);assert(fpr.every(l=>l.felled_m3===0));
 assert(rest.calls.some(c=>c.method==='DELETE'&&c.table==='production_message'&&c.url.includes('game_round=not.is.null')),'old game production is mirrored away');
 // admin tables
 assert.deepEqual(byTable('resource_transfer')[0].body.map(r=>[r.transfer_no,r.resource_id,r.direction,r.partner_name,r.se_number,r.valid_from]),[['RT-01',did('resource:L-01'),'out','Fuhr GmbH','SE1234567890','2026-10-20']]);
 assert.deepEqual(byTable('map_layer_config')[0].body.slice(0,3).map(r=>[r.layer_key,r.sort_order,r.enabled_by_default,r.colour]),[['photo',0,true,null],['routes',1,true,'#52d5ff'],['stands',2,true,'#123456']]);
 assert.deepEqual(byTable('message_template')[0].body.map(r=>r.code),['MT-01','MT-02','MT-04']);
 const resBody=byTable('resource')[0].body;assert.deepEqual(resBody.find(r=>r.code==='R-01').type,'person');assert.equal(resBody.find(r=>r.code==='H-01').unit_data_consent,false);assert.equal(resBody.find(r=>r.code==='L-01').is_subcontractor,true,'transfer out → subcontractor');
 assert.equal(byTable('calendar_override')[0].body.find(r=>r.resource_id===did('resource:H-01')&&r.day==='2026-10-21').hours,4);
 assert.equal(byTable('team')[0].body[0].forwarder_lag_days,2);
 assert.deepEqual(byTable('app_user_resource')[0].body.filter(r=>r.user_id===did('user:user-01')).map(r=>r.resource_id),[did('resource:H-01'),did('resource:F-01')]);
 assert.deepEqual(events.filter(e=>e==='saved').length,1,'one remote save event');
 results.push('URLs, profile headers, debounce, batched upserts, payload shapes');

 /* 5. Only changed tables are sent again; unplanning deletes the row. */
 rest.reset();st.save(plan);await st.flush();assert.equal(rest.calls.length,0,'unchanged plan → no requests');
 const less=structuredClone(plan);less.assignments=less.assignments.filter(a=>a.rowId!=='F-01'); // Avplanera of the copied bar
 st.save(less);await st.flush();
 assert.deepEqual([...new Set(rest.calls.map(c=>c.table))],['assignment'],'only the assignment table');
 assert.equal(rest.db.assignment.length,less.assignments.length,'Avplanera removes the row');
 results.push('change detection + delete mirroring');

 /* 6. Round trip: a second session loads the same plan from the database. */
 st.save(plan);await st.flush();
 const st2=S.SupabaseStore({config:CONFIG,fetch:rest.fetch,local:S.LocalStore({storage:memStorage()}),context:ctx}),back=await st2.load();
 assert.deepEqual(back.assignments.map(a=>[a.id,a.orderId,a.rowId,+a.startHour.toFixed(3),a.sent,a.sentRound,a.sentVersion,a.copyOf||null]),
   plan.assignments.map(a=>[a.id,a.orderId,a.rowId,+a.startHour.toFixed(3),a.sent,a.sentRound,a.sent?a.sentVersion:0,a.copyOf||null]).sort((x,y)=>x[3]-y[3]||x[0].localeCompare(y[0])),'assignments incl. ids and Kopiera link');
 assert.equal(back.seq>=Math.max(...plan.assignments.map(a=>Number(a.id.slice(1)))),true);
 assert.deepEqual(back.edits['H-A01'].landings,plan.edits['H-A01'].landings);assert.deepEqual(back.edits['H-A01'].symbols,plan.edits['H-A01'].symbols);assert.deepEqual(back.edits['H-B01'].symbols,plan.edits['H-B01'].symbols);
 assert.deepEqual(back.instructions['H-A01'],plan.instructions['H-A01'],'sent OIN/PIN/FOI/FDI');
 const ad0=A.data(snap,plan),ad1=A.data(snap,back);
 for(const k of ['company','roles','users','transfers','layers'])assert.deepEqual(ad1[k],ad0[k],'admin '+k);
 const tpl=x=>x.templates.map(({_removed,...t})=>t);assert.deepEqual(tpl(ad1),tpl(ad0),'admin templates (MT-03 removed, MT-04 added)');
 assert.deepEqual(ad1.contracts.map(c=>[c.contractNo,c.validFrom,c.validTo,c.operationTypes]),ad0.contracts.map(c=>[c.contractNo,c.validFrom,c.validTo,c.operationTypes]),'contracts');
 const cl=x=>x.clients.map(c=>[c.code,c.name,c.regions||[],c.customerGroups||[],c.email||'']);assert.deepEqual(cl(ad1),cl(ad0),'clients');
 const r0=M.resources(snap,plan),r1=M.resources(snap,back),pick=r=>({id:r.id,name:r.name,weekly:r.weekly,production:r.production,days:r.days,active:r.active,plannable:r.plannable,subcontractor:!!r.subcontractor,base:r.base,consent:r.unitDataConsent||null});
 assert.deepEqual(r1.map(pick),r0.map(pick),'resources: Grunddata, Produktionsdaten, weekly hours, Wochenkalender, consent, new resource');
 assert.deepEqual(M.chains(snap,back),M.chains(snap,plan),'chains incl. lag');
 assert.deepEqual(M.viewModel(snap,back).rows.map(r=>r.items.map(i=>[i.id,+i.start.toFixed(3),+i.end.toFixed(3)])),M.viewModel(snap,plan).rows.map(r=>r.items.map(i=>[i.id,+i.start.toFixed(3),+i.end.toFixed(3)])),'same calendar');
 results.push('save → load round trip');

 /* 7. Fallback to local on a 500: notice, event, no further requests, the session copy keeps working. */
 rest=fakeRest(SEED,{fail:c=>c.method==='POST'&&c.table==='assignment'});const sess2=memStorage(),ev2=[];
 st=S.SupabaseStore({config:CONFIG,fetch:rest.fetch,local:S.LocalStore({storage:sess2}),context:ctx,debounce:5});st.subscribe(e=>ev2.push(e));
 await st.load();st.save(plan);await wait(20);await st.flush();
 assert.equal(st.status().fallback,true);assert.equal(st.status().kind,'local');assert.equal(st.status().notice,'Datenbank nicht erreichbar – lokale Sitzung');assert.match(st.status().reason,/assignment → 500/);
 assert(ev2.some(e=>e.type==='status'&&e.status.notice),'subscribers hear the fallback');
 const n=rest.calls.length;st.save(less);await wait(20);await st.flush();assert.equal(rest.calls.length,n,'no requests after the fallback');
 assert.deepEqual(JSON.parse(sess2.getItem('cfharvest-plan-v1')),less,'local session continues');assert(ev2.some(e=>e.type==='saved'&&e.remote===false),'local save events after fallback');
 // unreachable at load (network error) → same fallback, load resolves null
 const down=S.SupabaseStore({config:CONFIG,fetch:async()=>{throw new TypeError('Failed to fetch');},local:S.LocalStore({storage:memStorage()}),context:ctx});
 assert.equal(await down.load(),null);assert.equal(down.status().notice,'Datenbank nicht erreichbar – lokale Sitzung');
 // empty database (schema without seed): tolerated, nothing written, local behaviour
 const empty=fakeRest({}),es=S.SupabaseStore({config:CONFIG,fetch:empty.fetch,local:S.LocalStore({storage:memStorage()}),context:ctx,debounce:5});
 assert.equal(await es.load(),null);assert.equal(es.status().fallback,true);es.save(plan);await wait(20);await es.flush();assert(empty.calls.every(c=>c.method==='GET'),'nothing seeded or written');assert.deepEqual(es.read(),plan);
 // legacy anon JWT keys also go in Authorization
 const jwt=fakeRest(SEED);await S.SupabaseStore({config:{...CONFIG,publishableKey:'eyJhbGciOiJIUzI1NiJ9.e30.x'},fetch:jwt.fetch,local:S.LocalStore({storage:memStorage()}),context:ctx}).load();assert.equal(jwt.calls[0].headers.Authorization,'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x');
 assert.equal(warnings.length,3,'each fallback is logged once with its reason');
 results.push('fallback on 500, network error, empty database');

 /* 8. The replica page: store selected from the URL, notice in the banner, plan loaded from and written to the database. */
 const {JSDOM}=require('jsdom');
 const files=[...fs.readFileSync('cfharvest/app/index.html','utf8').matchAll(/<script src="([^"]+)"/g)].map(m=>path.normalize(path.join('cfharvest/app',m[1])));
 async function replica(url,{config,rest:r}={}){
   const html=fs.readFileSync('cfharvest/app/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
   const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,c=dom.getInternalVMContext();
   w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLCanvasElement.prototype.getContext=()=>null;
   if(r)w.fetch=r.fetch;
   for(const f of files){let src=fs.readFileSync(f,'utf8');if(config&&f.endsWith('config.js'))src=`const CFH_CONFIG=${JSON.stringify(config)};`;vm.runInContext(src,c,{filename:f});}
   await tick();return{w,d:w.document,js:code=>vm.runInContext(code,c),close:()=>w.close()};
 }
 let page=await replica('https://forestry.test/cfharvest/app/?store=supabase');
 assert.match(page.d.getElementById('cfhBanner').textContent,/Datenbank nicht erreichbar – lokale Sitzung/,'notice visible with the shipped empty config.js');
 assert.equal(page.js('CFHApp.store.kind'),'local');page.close();
 page=await replica('https://forestry.test/cfharvest/app/');assert.doesNotMatch(page.d.getElementById('cfhBanner').textContent,/Datenbank/,'default local: no notice');assert.equal(page.js('CFHApp.store.kind'),'local');page.close();
 // configured: the demo session (no handoff plan) takes the database plan; a change is written back after the debounce.
 const demoSnap=B.fromGameState(j.start(j.initial())),seeded=fakeRest(SEED);
 st=S.SupabaseStore({config:CONFIG,fetch:seeded.fetch,local:S.LocalStore({storage:memStorage()}),context:()=>({snapshot:demoSnap}),debounce:1});
 st.save(M.assign(M.emptyPlan(),demoSnap,['H-C01'],'H-01',{mode:'day',day:0}));await wait(10);await st.flush();
 seeded.reset();page=await replica('https://forestry.test/cfharvest/app/?store=supabase',{config:CONFIG,rest:seeded});await wait(20);await tick();
 assert.equal(page.js('CFHApp.store.kind'),'supabase');assert(seeded.calls.length&&seeded.calls.every(c=>c.method==='GET'),'opening only reads');
 assert.equal(page.js('JSON.stringify(CFHApp.state().plan.assignments.map(a=>[a.orderId,a.rowId]))'),'[["H-C01","H-01"]]','database plan loaded');
 assert(page.d.querySelector('[data-cal-row="H-01"] .cal-item[data-order="H-C01"]'),'bar on the calendar');
 assert.match(page.d.getElementById('cfhToast').textContent,/Planung aus der Datenbank geladen/);assert.doesNotMatch(page.d.getElementById('cfhBanner').textContent,/nicht erreichbar/);
 // a planner edit through the app (Enhetsdata consent = immediate plan change): session copy at once, database after 300 ms
 seeded.reset();
 page.js("(()=>{const el=document.createElement('input');el.type='checkbox';el.value='H-01';el.checked=false;el.dataset.change='unit-consent';document.body.appendChild(el);el.dispatchEvent(new Event('change',{bubbles:true}));})()");
 assert.equal(JSON.parse(page.w.sessionStorage.getItem('cfharvest-plan-v1')).resources['H-01'].unitDataConsent.granted,false,'session copy at once');
 assert.equal(seeded.calls.length,0,'debounced');assert.equal(page.js('CFHApp.store.pending()'),true);
 await wait(400);await page.js('CFHApp.store.flush()');
 const resPost=seeded.calls.find(c=>c.method==='POST'&&c.table==='resource');assert(resPost,'written after the debounce');
 assert.equal(resPost.body.find(r=>r.code==='H-01').unit_data_consent,false,'consent revoked in the database'); page.close();
 results.push('replica page: notice, database plan, debounced write');

 console.log(JSON.stringify({passed:true,store:results}));
})().catch(e=>{console.error(e);process.exit(1);});
function close1(a,b,tol=1e-6){assert(Math.abs(a-b)<=tol,`${a} != ${b}`);}
