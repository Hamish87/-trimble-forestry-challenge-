/* CFHarvest replica · Administration master data (PLAN_OVERNIGHT §4, SPEC_PLANNING §1/§6, db/SCHEMA.md).
   Defaults mirror cfharvest/db/seed.sql (same ids and codes: company, roles administrator/planner/mobile, users planer and
   h-01, client TRI, contracts V-26-014/015 from the game, operation types). Edits live in plan.admin (the plan envelope in
   sessionStorage, which travels to the game and back) and are merged over the defaults by key, so the seed stays the
   source of truth for anything the planner has not changed. Field names are the camelCase of the schema columns; fields
   the schema has no column for are listed in SCHEMA_GAPS. No DOM, no game state: the snapshot comes in as data. */
'use strict';
const CFHAdmin=(()=>{
/* ---------- Seed (db/seed.sql) ---------- */
const COMPANY={name:'Demo-Lohnunternehmen',orgNo:'',address:'Forstweg 1 · Demo',phone:'',email:'dispo@demo.invalid',contactName:'Disposition (Demo)',country:'DE',defaultLanguage:'de',biometriaId:'90010+00000',preCreated:true};
/* Role matrix keys: the seed's permission keys plus the four admin areas this section adds (marked [DEMO] in the report). */
const PERMISSIONS=[
  {key:'plan.read',de:'Planung ansehen'},{key:'plan.write',de:'Planen und speichern'},{key:'plan.send',de:'An Ressource senden'},{key:'orderbook.write',de:'Bestellungen bearbeiten'},{key:'messages.write',de:'Nachrichten senden'},
  {key:'admin.resources',de:'Ressourcen verwalten'},{key:'admin.calendar',de:'Wochenkalender pflegen'},{key:'admin.teams',de:'Arbeitsgruppen und Ernteketten'},{key:'admin.users',de:'Benutzer und Rollen'},{key:'admin.contracts',de:'Verträge'},
  {key:'admin.company',de:'Eigenes Unternehmen'},{key:'admin.transfers',de:'Ressourcenübertragungen'},{key:'admin.layers',de:'Kartenebenen'},{key:'admin.templates',de:'Nachrichtenvorlagen'},
  {key:'plan.read.own',de:'Eigene Aufträge ansehen (Maschine)'},{key:'production.report',de:'Produktion melden (HPR/FPR)'}];
const ROLES=[
  {code:'administrator',nameSv:'Administratör',nameDe:'Administrator',permissions:['admin.resources','admin.calendar','admin.teams','admin.users','admin.contracts','admin.company','admin.transfers','admin.layers','admin.templates','plan.read','plan.write','plan.send','orderbook.write','messages.write']},
  {code:'planner',nameSv:'Planerare',nameDe:'Planer',permissions:['plan.read','plan.write','plan.send','orderbook.write','messages.write']},
  {code:'mobile',nameSv:'Mobil/Maskin',nameDe:'Mobil/Maschine',permissions:['plan.read.own','production.report','messages.write']}];
const LANGUAGES=[['de','Deutsch'],['en','Englisch'],['fr','Französisch'],['sv','Schwedisch']];
const USERS=[
  {id:'planer',email:'planer@demo.invalid',displayName:'Demo-Lohnunternehmen - Planer',phone:'',language:'de',roles:['administrator','planner'],resourceId:null,resourceAccess:['H-01','F-01','L-01','L-02'],active:true},
  {id:'h-01',email:'h-01@demo.invalid',displayName:'Fahrer Harvester H-01',phone:'',language:'de',roles:['mobile'],resourceId:'H-01',resourceAccess:['H-01'],active:true}];
const CLIENTS=[{code:'TRI',name:'Trimble Messe · Auftraggeber (Spielszenario)',regions:['01 - Demo-Revier'],customerGroups:['Privatwald'],phone:'',email:'einkauf@demo.invalid'}];
const CONTRACT_PERIOD=['2026-10-19','2026-10-30']; // seed valid_from/to [DEMO]: shifts 1–4 + haulage window
const TEMPLATES=[
  {id:'MT-01',name:'Arbeitsauftrag gesendet',text:'Neuer Arbeitsauftrag {Auftrag} für {Ressource} ab {Datum}. Bitte die PIN-Datei laden und die Hiebsgrenze prüfen.',active:true},
  {id:'MT-02',name:'Rückegasse und Schutzbereich',text:'Bei {Auftrag} bitte zuerst die Rückegasse 3 nutzen und den Schutzbereich aussparen.',active:true},
  {id:'MT-03',name:'Rückmeldung erbeten',text:'Bitte den Stand der Arbeiten bei {Auftrag} bis Schichtende melden.',active:true}];
/* Map layers (Kartskikt): key order = order of the map's layer switcher (🗂); on = shown when a map opens; colour = the
   layer's accent colour (null = drawn in status colours). Keys are those of CFHViews.MAP_LAYERS; the defaults reproduce the
   map before Kartskikt existed. The z-order of the drawing stays fixed (stands under landings, symbols and positions). */
const LAYERS=[
  {key:'photo',on:true,colour:null,fixed:true},{key:'stands',on:true,colour:'#bff0cc'},{key:'landings',on:true,colour:'#eef7ff'},{key:'symbols',on:true,colour:null},
  {key:'protect',on:true,colour:'#ffd369'},{key:'neighbours',on:true,colour:null},{key:'routes',on:false,colour:'#52d5ff'},{key:'machines',on:true,colour:null}];
/** Schema columns this screen needs and cfharvest/db/schema.sql does not have yet (for the report and SCHEMA.md). */
const SCHEMA_GAPS=['company.settings.biometriaId (no column)','company.settings.contactName','app_user resource access (join table, SCHEMA §8.6)','resource_transfer table','map_layer config (company.settings.mapLayers)','message_template table','resource.settings.unitDataConsent'];

/* ---------- Helpers ---------- */
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const clean=s=>String(s??'').trim();
/** Seed list overlaid with edited records (same key = merged, new key = appended); removed keys are dropped. */
function mergeList(seed,edits,key){
  const out=seed.map(x=>structuredClone(x));
  for(const e of arr(edits)){if(!e||typeof e!=='object'||e[key]==null)continue;const i=out.findIndex(x=>x[key]===e[key]);if(e._removed){if(i>=0)out.splice(i,1);continue;}if(i>=0)out[i]={...out[i],...e};else out.push(structuredClone(e));}
  return out;
}
/** plan.admin with every part present (older plans have none). */
function normalize(a){a=obj(a);return{company:obj(a.company),clients:arr(a.clients),contracts:arr(a.contracts),roles:obj(a.roles),users:arr(a.users),transfers:arr(a.transfers),layers:obj(a.layers),templates:arr(a.templates)};}
/** Game contracts (dist/journey.js via the bridge snapshot) as Avtal records; the economic fields stay game-owned. */
function gameContracts(snapshot){
  const list=arr(snapshot?.contracts).length?snapshot.contracts:snapshot?.meta?.contract?[snapshot.meta.contract]:[];
  return list.map(c=>({contractNo:c.id,name:c.name,clientCode:'TRI',validFrom:CONTRACT_PERIOD[0],validTo:CONTRACT_PERIOD[1],operationTypes:['Slutavverkning'],targetVolume:c.volume??null,targetSaw:c.saw??null,
    prices:{SAG:c.prices?.saw??null,IND:c.prices?.pulp??null,ABW:c.prices?.down??null},shortfall:c.shortfallRate??null,game:true}));
}
/** Layer configuration: order (all keys, photo first), on (default visibility), colours. */
function layers(plan){
  const cfg=obj(normalize(plan?.admin).layers),keys=LAYERS.map(l=>l.key);
  const order=['photo',...[...new Set([...arr(cfg.order).filter(k=>keys.includes(k)&&k!=='photo'),...keys.filter(k=>k!=='photo')])]];
  const on={},colours={};for(const l of LAYERS){on[l.key]=typeof cfg.on?.[l.key]==='boolean'?cfg.on[l.key]:l.on;colours[l.key]=l.colour&&/^#[0-9a-f]{6}$/i.test(cfg.colours?.[l.key]||'')?cfg.colours[l.key].toLowerCase():l.colour;}
  return{order,on,colours};
}
/** All admin master data for the views. snapshot = bridge snapshot (or a view model, which spreads it). */
function data(snapshot,plan){
  const a=normalize(plan?.admin);
  const roles=ROLES.map(r=>({...r,permissions:Array.isArray(a.roles[r.code])?a.roles[r.code].filter(k=>PERMISSIONS.some(p=>p.key===k)):[...r.permissions]}));
  const transfers=a.transfers.filter(t=>t&&t.id).slice().sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.id).localeCompare(String(y.id)));
  return{company:{...COMPANY,...a.company},clients:mergeList(CLIENTS,a.clients,'code'),contracts:mergeList(gameContracts(snapshot),a.contracts,'contractNo').map(c=>({...c,activeInGame:c.contractNo===snapshot?.meta?.contract?.id})),
    roles,users:mergeList(USERS,a.users,'id'),transfers,layers:layers(plan),templates:mergeList(TEMPLATES,a.templates,'id')};
}

/* ---------- Validation (German messages; "Pflichtangabe" = SV "Obligatorisk uppgift") ---------- */
const REQUIRED='Pflichtangabe';
const BIOMETRIA=/^\d{5}\+\d{5}$/;
const isBiometria=s=>BIOMETRIA.test(clean(s));
const normSE=s=>clean(s).toUpperCase().replace(/[\s-]/g,'');
const isSE=s=>/^SE\d{10}(01)?$/.test(normSE(s));
const isEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(s));
const isVat=s=>!clean(s)||/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(clean(s).toUpperCase().replace(/[\s.-]/g,''));
function validateCompany(c){const e={};if(!clean(c.name))e.name=REQUIRED;if(!clean(c.biometriaId))e.biometriaId=REQUIRED;else if(!isBiometria(c.biometriaId))e.biometriaId='Format NNNNN+00000';if(!isVat(c.orgNo))e.orgNo='Format z. B. DE123456789';if(clean(c.email)&&!isEmail(c.email))e.email='Ungültige E-Mail-Adresse';return e;}
function validateUser(u,users=[]){const e={};if(!clean(u.displayName))e.displayName=REQUIRED;if(!clean(u.email))e.email=REQUIRED;else if(!isEmail(u.email))e.email='Ungültige E-Mail-Adresse';else if(users.some(x=>x.id!==u.id&&clean(x.email).toLowerCase()===clean(u.email).toLowerCase()))e.email='E-Mail-Adresse bereits vergeben';
  if(!arr(u.roles).length)e.roles=REQUIRED;if(arr(u.roles).includes('mobile')&&!u.resourceId)e.resourceId='Für Mobil/Maschine eine Maschine wählen';return e;}
function validateContract(c,contracts=[],isNew=false){const e={};if(!clean(c.contractNo))e.contractNo=REQUIRED;else if(isNew&&contracts.some(x=>x.contractNo===clean(c.contractNo)))e.contractNo='Vertragsnummer bereits vergeben';
  if(!clean(c.clientCode))e.clientCode=REQUIRED;if(!clean(c.name))e.name=REQUIRED;if(!c.validFrom)e.validFrom=REQUIRED;if(!c.validTo)e.validTo=REQUIRED;if(c.validFrom&&c.validTo&&c.validTo<c.validFrom)e.validTo='Ende vor Beginn';if(!arr(c.operationTypes).length)e.operationTypes=REQUIRED;return e;}
function validateClient(c,clients=[]){const e={};if(!clean(c.code))e.code=REQUIRED;else if(clients.some(x=>x.code===clean(c.code).toUpperCase()))e.code='Kürzel bereits vergeben';if(!clean(c.name))e.name=REQUIRED;return e;}
function validateTransfer(t){const e={};if(!t.resourceId)e.resourceId=REQUIRED;if(!['out','in'].includes(t.direction))e.direction=REQUIRED;if(!clean(t.partner))e.partner=REQUIRED;if(!clean(t.seNumber))e.seNumber=REQUIRED;else if(!isSE(t.seNumber))e.seNumber='Format SE + 10 Ziffern (+ 01)';if(!t.date)e.date=REQUIRED;return e;}
function validateTemplate(t){const e={};if(!clean(t.name))e.name=REQUIRED;if(!clean(t.text))e.text=REQUIRED;return e;}

/* ---------- Pure operations on a plan (return a new plan) ---------- */
const withAdmin=(plan,fn)=>{const p=structuredClone(plan);p.admin=normalize(p.admin);fn(p.admin,p);return p;};
/** Upsert a keyed record into an edit list. */
const upsert=(list,key,rec)=>{const i=list.findIndex(x=>x[key]===rec[key]);if(i>=0)list[i]={...list[i],...rec};else list.push(rec);};
const nextId=(prefix,ids,width=2)=>{let n=1;const set=new Set(ids);while(set.has(prefix+String(n).padStart(width,'0')))n++;return prefix+String(n).padStart(width,'0');};
function saveCompany(plan,c){return withAdmin(plan,a=>{a.company={...a.company,...c,biometriaId:clean(c.biometriaId??a.company.biometriaId??COMPANY.biometriaId),orgNo:clean(c.orgNo??a.company.orgNo??'').toUpperCase()};});}
function saveUser(plan,u){return withAdmin(plan,a=>upsert(a.users,'id',{...u,email:clean(u.email),displayName:clean(u.displayName),roles:[...new Set(arr(u.roles))],resourceAccess:[...new Set(arr(u.resourceAccess))],resourceId:u.resourceId||null,active:u.active!==false}));}
function setUserActive(plan,id,active){return withAdmin(plan,a=>upsert(a.users,'id',{id,active:!!active}));}
function saveRoles(plan,matrix){return withAdmin(plan,a=>{for(const [code,perms] of Object.entries(obj(matrix)))if(ROLES.some(r=>r.code===code))a.roles[code]=[...new Set(arr(perms))];});}
function saveContract(plan,c){return withAdmin(plan,a=>upsert(a.contracts,'contractNo',{...c,contractNo:clean(c.contractNo),name:clean(c.name),operationTypes:[...new Set(arr(c.operationTypes))]}));}
function saveClient(plan,c){return withAdmin(plan,a=>upsert(a.clients,'code',{...c,code:clean(c.code).toUpperCase(),name:clean(c.name)}));}
function saveTemplate(plan,t){return withAdmin(plan,a=>upsert(a.templates,'id',{...t,_removed:false,name:clean(t.name),text:String(t.text??'').slice(0,500)}));}
function removeTemplate(plan,id){return withAdmin(plan,a=>{a.templates=a.templates.filter(x=>x.id!==id);if(TEMPLATES.some(x=>x.id===id))a.templates.push({id,_removed:true});});}
function saveLayers(plan,cfg){return withAdmin(plan,a=>{a.layers={order:arr(cfg.order),on:obj(cfg.on),colours:obj(cfg.colours)};});}
/** Resursöverföring: transfer list entry + the resource's subcontractor flag (resource.is_subcontractor). */
function addTransfer(plan,t){return withAdmin(plan,(a,p)=>{const id=nextId('RT-',a.transfers.map(x=>x.id));a.transfers.push({id,resourceId:t.resourceId,direction:t.direction,partner:clean(t.partner),seNumber:normSE(t.seNumber),date:t.date,note:clean(t.note).slice(0,200)});
  const latest=a.transfers.filter(x=>x.resourceId===t.resourceId).sort((x,y)=>String(x.date).localeCompare(String(y.date))||String(x.id).localeCompare(String(y.id))).at(-1);
  const sub=latest.direction==='out',extra=arr(p.extraResources).find(x=>x.id===t.resourceId);if(extra)extra.subcontractor=sub;else{p.resources=obj(p.resources);p.resources[t.resourceId]={...(p.resources[t.resourceId]||{}),subcontractor:sub,subcontractorName:sub?latest.partner:''};}});}
/** Fill {Auftrag} {Ressource} {Datum} placeholders of a message template; unknown values keep the placeholder. */
function fill(text,ctx={}){return String(text||'').replace(/\{(Auftrag|Ressource|Datum)\}/g,(m,k)=>ctx[k]?String(ctx[k]):m);}
return{COMPANY,PERMISSIONS,ROLES,LANGUAGES,USERS,CLIENTS,TEMPLATES,LAYERS,SCHEMA_GAPS,REQUIRED,normalize,mergeList,gameContracts,layers,data,
  isBiometria,isSE,isEmail,isVat,validateCompany,validateUser,validateContract,validateClient,validateTransfer,validateTemplate,
  saveCompany,saveUser,setUserActive,saveRoles,saveContract,saveClient,saveTemplate,removeTemplate,saveLayers,addTransfer,nextId,fill};
})();
if(typeof module!=='undefined')module.exports=CFHAdmin;
