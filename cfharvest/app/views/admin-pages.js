/* Administration pages added for PLAN_OVERNIGHT §4: Användare/Roller, Avtal, Eget företag, Resursöverföringar,
   Kartskikt, Meddelande mallar, and the admin dialogs (Ny resurs with type picker, Pausa/Aktivera licens, Skicka
   meddelande to a user). Data: CFHAdmin.data(vm, vm.plan) = db/seed.sql defaults merged with plan.admin edits.
   Only the menu names, Ny · Spara · Uppdatera, Typ, Aktiv, Pausa/Aktivera licens, Tillgång till resurser, Godkänn and the
   role names are documented product terms [M8][M28][MW]; field labels inside these screens are German replica labels. */
'use strict';
/** Entity data typed by the planner (names, e-mails, texts) is not UI text: never translated. */
CFHViews.dat=(ui,s)=>`<span data-no-translate>${ui.esc(s)}</span>`;
CFHViews.adminForm=v=>v.admin.form||{};
CFHViews.adminButtons=(ui,isNew,extra='')=>`<div class="form-actions">${isNew?`<button type="button" class="green" data-action="admin-form-save" title="SV: Spara">${ui.esc('Speichern')}</button>`:`<button type="button" class="green" data-action="admin-form-save" title="SV: Uppdatera">${ui.esc('Aktualisieren')}</button>`}${extra}</div>`;
CFHViews.adminNew=(ui,label)=>`<button type="button" data-action="admin-new-rec" title="SV: Ny">+ ${ui.esc(label)}</button>`;
/** Current record of a list page (users, contracts, templates) or the form defaults (transfers): shared with app.js. */
CFHViews.adminRecord=(vm,v,page)=>{
  const ad=CFHAdmin.data(vm,vm.plan),sel=v.admin.sel||{},M=CFHModel;
  if(page==='users'){const id=sel.users??ad.users[0]?.id,isNew=id==='__new'||!ad.users.some(u=>u.id===id);return{ad,isNew,list:ad.users,rec:isNew?{id:'',displayName:'',email:'',phone:'',language:'de',roles:[],resourceId:null,resourceAccess:[],active:true}:ad.users.find(u=>u.id===id)};}
  if(page==='contracts'){const list=ad.contracts,id=sel.contracts??(list.find(c=>c.activeInGame)||list[0])?.contractNo,isNew=id==='__new'||!list.some(c=>c.contractNo===id);
    return{ad,isNew,list,rec:isNew?{contractNo:'',name:'',clientCode:ad.clients[0]?.code||'',validFrom:M.dayISO(vm.calendar.currentDay),validTo:'',operationTypes:['Slutavverkning'],targetVolume:null,targetSaw:null,prices:{},shortfall:null}:list.find(c=>c.contractNo===id)};}
  if(page==='templates'){const list=ad.templates,id=sel.templates??list[0]?.id,isNew=id==='__new'||!list.some(t=>t.id===id);return{ad,isNew,list,rec:isNew?{id:'',name:'',text:'',active:true}:list.find(t=>t.id===id)};}
  if(page==='transfers')return{ad,isNew:true,list:ad.transfers,rec:{resourceId:vm.resourcesAll[0]?.id||'',direction:'out',partner:'',seNumber:'',date:M.dayISO(vm.calendar.currentDay),note:''}};
  if(page==='company')return{ad,isNew:false,list:[],rec:ad.company};
  return{ad,isNew:false,list:[],rec:{}};
};
/** Template picker used by every "Nachricht senden" box (Meddelande mallar). */
CFHViews.templateSelect=(vm,ui,scope)=>{const tpls=CFHAdmin.data(vm,vm.plan).templates.filter(t=>t.active!==false);if(!tpls.length)return '';
  return `<label class="tpl-pick"><span>${ui.term('Vorlage','Meddelande mallar',{tip:true})}</span><select data-change="msg-template" data-scope="${scope}" aria-label="${ui.esc('Nachrichtenvorlage wählen')}"><option value="">${ui.esc('Vorlage wählen')}</option>${tpls.map(t=>`<option value="${ui.esc(t.id)}" data-no-translate>${ui.esc(t.name)}</option>`).join('')}</select></label>`;};

/* ---------- Användare + roles (Administratör · Planerare · Mobil/Maskin) ---------- */
CFHViews.adminUsers=(vm,v,ui)=>{
  const{esc,term,code}=ui,a=v.admin,A=CFHAdmin,F=CFHViews.adminField,dat=s=>CFHViews.dat(ui,s),ad=A.data(vm,vm.plan),users=ad.users,roles=ad.roles,res=vm.resourcesAll;
  const{rec,isNew}=CFHViews.adminRecord(vm,v,'users');
  const f={...rec,...CFHViews.adminForm(v)},err=A.validateUser(f,users),roleName=c=>{const r=roles.find(x=>x.code===c);return r?term(r.nameDe,r.nameSv,{tip:true}):esc(c);};
  const resName=id=>res.find(r=>r.id===id)?.name||id;
  const list=`<div class="admin-list"><div class="list-head">${CFHViews.adminNew(ui,'Neuer Benutzer')}</div><div class="table-wrap"><table class="grid compact" data-user-table><thead><tr><th>${esc('Name')}</th><th class="col-opt">${esc('E-Mail')}</th><th>${esc('Rollen')}</th><th>${esc('Maschine')}</th><th title="SV: Aktiv">${esc('Aktiv')}</th></tr></thead><tbody>
    ${users.map(u=>`<tr class="${u.id===rec.id&&!isNew?'sel':''} ${u.active===false?'paused':''}" data-user="${esc(u.id)}"><td><button class="link" data-action="admin-sel" data-page="users" data-id="${esc(u.id)}">${dat(u.displayName)}</button></td><td class="col-opt">${dat(u.email)}</td><td>${u.roles.map(roleName).join(', ')}</td><td>${u.resourceId?code(u.resourceId):'–'}</td><td class="${u.active!==false?'ok':'bad'}" data-active="${u.active!==false}" aria-label="${esc(u.active!==false?'Aktiv':'Deaktiviert')}">${u.active!==false?'✓':'✗'}</td></tr>`).join('')}</tbody></table></div></div>`;
  const form=`<div class="sub-head"><h3>${isNew?esc('Neuer Benutzer'):dat(rec.displayName)} ${!isNew?code('('+rec.id+')'):''}${!isNew&&rec.active===false?` <small class="bad">${esc('Deaktiviert')}</small>`:''}</h3></div>
    <dl class="fields form" data-user-form>
    ${F(ui,'displayName','Name',null,`<input data-af="displayName" value="${esc(f.displayName)}" autocomplete="off">`,{req:true,err:err.displayName})}
    ${F(ui,'email','E-Mail (Anmeldename)',null,`<input type="email" data-af="email" value="${esc(f.email)}" autocomplete="off">`,{req:true,err:err.email})}
    ${F(ui,'phone','Telefon',null,`<input type="tel" data-af="phone" value="${esc(f.phone||'')}">`)}
    ${F(ui,'language','Sprache',null,`<select data-change="af" data-af="language">${A.LANGUAGES.map(([k,de])=>`<option value="${k}" ${f.language===k?'selected':''}>${esc(de)}</option>`).join('')}</select>`)}
    ${F(ui,'roles','Rollen',null,`<div class="check-list">${roles.map(r=>`<label class="check"><input type="checkbox" data-change="af-list" data-af="roles" value="${r.code}" ${f.roles.includes(r.code)?'checked':''}> ${term(r.nameDe,r.nameSv)}</label>`).join('')}</div>`,{req:true,err:err.roles})}
    ${F(ui,'resourceId','Maschine (Mobil/Maschine)',null,`<select data-change="af" data-af="resourceId"><option value="">–</option>${res.filter(r=>r.type!=='truck').map(r=>`<option value="${esc(r.id)}" ${f.resourceId===r.id?'selected':''}>${esc(r.name)} (${esc(r.id)})</option>`).join('')}</select>`,{err:err.resourceId,hint:esc('Die Maschine, an der sich der Fahrer im Bordcomputer anmeldet.')})}
    ${F(ui,'resourceAccess','Zugriff auf Ressourcen','Tillgång till resurser',`<div class="check-list">${res.map(r=>`<label class="check"><input type="checkbox" data-change="af-list" data-af="resourceAccess" value="${esc(r.id)}" ${f.resourceAccess.includes(r.id)?'checked':''}> ${esc(r.name)}</label>`).join('')}</div>`)}
    </dl>
    ${CFHViews.adminButtons(ui,isNew,isNew?'':`<button type="button" class="${rec.active===false?'green':'orange'}" data-action="user-active" data-id="${esc(rec.id)}">${esc(rec.active===false?'Reaktivieren':'Deaktivieren')}</button><button type="button" data-action="user-msg-open" data-id="${esc(rec.id)}" ${rec.active===false?'disabled':''} title="${ui.tip('Nachricht senden','Skicka meddelande')}">✉ ${esc('Nachricht senden')}</button>`)}
    ${!isNew&&f.resourceAccess.length?`<p class="note">${esc('Zugriff auf')}: ${f.resourceAccess.map(id=>esc(resName(id))).join(', ')}</p>`:''}`;
  const perms=A.PERMISSIONS,locked=(r,p)=>r.code==='administrator'&&p.key==='admin.users';
  const matrix=`<h3 class="section-head">${esc('Rollen und Rechte')}</h3><div class="table-wrap"><table class="grid compact role-matrix" data-role-matrix><thead><tr><th>${esc('Recht')}</th>${roles.map(r=>`<th data-role="${r.code}">${term(r.nameDe,r.nameSv)}</th>`).join('')}</tr></thead><tbody>
    ${perms.map(p=>`<tr data-perm="${esc(p.key)}"><th scope="row">${esc(p.de)} <small>${code(p.key)}</small></th>${roles.map(r=>`<td><input type="checkbox" data-change="role-perm" data-role="${r.code}" value="${esc(p.key)}" ${r.permissions.includes(p.key)?'checked':''} ${locked(r,p)?'disabled title="'+esc('Mindestens ein Administrator muss Benutzer verwalten können.')+'"':''} aria-label="${esc(r.nameDe)}: ${esc(p.de)}"></td>`).join('')}</tr>`).join('')}
    <tr class="sum"><th scope="row">${esc('Benutzer mit dieser Rolle')}</th>${roles.map(r=>`<td>${ui.num(users.filter(u=>u.active!==false&&u.roles.includes(r.code)).length,0)}</td>`).join('')}</tr></tbody></table></div>
    <p class="note">${esc('Keine Anmeldung in dieser Demo: Benutzer und Rechte sind Stammdaten, die Replik setzt sie nicht durch.')}</p>`;
  return `<div class="admin-split">${list}<div class="admin-detail">${form}</div></div>${matrix}`;
};

/* ---------- Avtal: client, contract number, period, contracted operation types; orders reference a contract ---------- */
CFHViews.adminContracts=(vm,v,ui)=>{
  const{esc,num,term,code,date}=ui,a=v.admin,A=CFHAdmin,F=CFHViews.adminField,M=CFHModel,dat=s=>CFHViews.dat(ui,s),ad=A.data(vm,vm.plan),list=ad.contracts,clients=ad.clients;
  const{rec,isNew}=CFHViews.adminRecord(vm,v,'contracts');
  const f={...rec,...CFHViews.adminForm(v)},err=A.validateContract(f,list,isNew),newClient=f.clientCode==='__new',cf=a.clientForm||{},cErr=newClient?A.validateClient(cf,clients):{};
  const orders=c=>vm.orders.filter(o=>o.contractId===c.contractNo),clientName=code=>clients.find(c=>c.code===code)?.name||code,name=c=>c.game?esc(c.name):dat(c.name);
  const opName=k=>{const op=M.OPERATIONS.find(o=>o.key===k);return op?term(op.de,op.key,{tip:true}):esc(k);};
  const table=`<div class="admin-list"><div class="list-head">${CFHViews.adminNew(ui,'Neuer Vertrag')}</div><div class="table-wrap"><table class="grid compact" data-contract-table><thead><tr><th title="SV: Kontrakt nr.">${esc('Vertrags-Nr.')}</th><th title="SV: Uppdragsgivare">${esc('Auftraggeber')}</th><th class="col-opt">${esc('Name')}</th><th>${esc('Zeitraum')}</th><th title="SV: Åtgärd">${esc('Maßnahmen')}</th><th title="${esc('Arbeitsaufträge')}">${esc('Aufträge')}</th></tr></thead><tbody>
    ${list.map(c=>`<tr class="${c.contractNo===rec.contractNo&&!isNew?'sel':''}" data-contract="${esc(c.contractNo)}"><td><button class="link" data-action="admin-sel" data-page="contracts" data-id="${esc(c.contractNo)}"><span data-no-translate>${esc(c.contractNo)}</span></button>${c.activeInGame?` <small class="badge-game" title="${esc('Dieser Vertrag gilt im laufenden Spiel.')}">${esc('im Spiel')}</small>`:''}</td><td>${code(c.clientCode)}</td><td class="col-opt">${name(c)}</td><td class="nowrap">${date(c.validFrom,'num')} –<br>${date(c.validTo,'num')}</td><td>${c.operationTypes.map(opName).join(', ')||'–'}</td><td data-order-count>${num(orders(c).length,0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  const ro=!isNew&&rec.game,eco=(key,de,val,unit)=>F(ui,key,de,null,ro?`<span>${val==null?'–':num(val,2)} ${esc(unit)}</span>`:`<input type="number" min="0" step="0.5" class="num-in" data-af="${key}" value="${esc(f[key]??'')}"> ${esc(unit)}`);
  const priceRow=ro?`<span data-no-translate>${['SAG','IND','ABW'].map(k=>`${k} ${num(rec.prices?.[k]??0,2)} €`).join(' · ')}</span>`:['SAG','IND','ABW'].map(k=>`<label class="inline">${code(k)} <input type="number" min="0" step="0.5" class="num-in" data-af="price-${k}" value="${esc(f['price-'+k]??f.prices?.[k]??'')}"> €/fm</label>`).join(' ');
  const form=`<div class="sub-head"><h3>${isNew?esc('Neuer Vertrag'):`${code(rec.contractNo)} ${name(rec)}`}</h3></div>
    ${ro?`<p class="note">${esc('Vertrag aus dem Spiel: Mengen und Preise kommen aus der Vertragswahl in der Waldplanung und sind hier nur lesbar.')}</p>`:''}
    <dl class="fields form" data-contract-form>
    ${F(ui,'contractNo','Vertrags-Nr.','Kontrakt nr.',isNew?`<input data-af="contractNo" value="${esc(f.contractNo)}" autocomplete="off">`:code(rec.contractNo),{req:true,err:err.contractNo})}
    ${F(ui,'clientCode','Auftraggeber','Uppdragsgivare',ro?`${code(rec.clientCode)} ${dat(clientName(rec.clientCode))}`:`<select data-change="af" data-af="clientCode">${clients.map(c=>`<option value="${esc(c.code)}" ${f.clientCode===c.code?'selected':''} data-no-translate>${esc(c.code)} · ${esc(c.name)}</option>`).join('')}<option value="__new" ${newClient?'selected':''}>+ ${esc('Neuer Auftraggeber')}</option></select>`,{req:true,err:err.clientCode})}
    ${newClient?`<div class="sub-form" data-client-form>${F(ui,'clientCode','Kürzel',null,`<input data-cf="code" value="${esc(cf.code||'')}" maxlength="6" autocomplete="off">`,{req:true,err:cErr.code})}${F(ui,'clientName','Name des Auftraggebers',null,`<input data-cf="name" value="${esc(cf.name||'')}" autocomplete="off">`,{req:true,err:cErr.name})}</div>`:''}
    ${F(ui,'name','Bezeichnung',null,ro?name(rec):`<input data-af="name" value="${esc(f.name)}" autocomplete="off">`,{req:true,err:err.name})}
    ${F(ui,'validFrom','Gültig ab',null,`<input type="date" data-af="validFrom" value="${esc(f.validFrom||'')}">`,{req:true,err:err.validFrom})}
    ${F(ui,'validTo','Gültig bis',null,`<input type="date" data-af="validTo" value="${esc(f.validTo||'')}">`,{req:true,err:err.validTo})}
    ${F(ui,'operationTypes','Vertragsmaßnahmen','Åtgärd',`<div class="check-list">${M.OPERATIONS.map(op=>`<label class="check"><input type="checkbox" data-change="af-list" data-af="operationTypes" value="${esc(op.key)}" ${f.operationTypes.includes(op.key)?'checked':''}> ${term(op.de,op.key)}</label>`).join('')}</div>`,{req:true,err:err.operationTypes})}
    ${eco('targetVolume','Vertragsmenge',f.targetVolume,'fm')}${eco('targetSaw','davon Sägeholz',f.targetSaw,'fm')}
    ${F(ui,'prices','Preise je Sortiment',null,priceRow)}${eco('shortfall','Mengenausgleich bei Unterlieferung',f.shortfall,'€/fm')}
    </dl>${CFHViews.adminButtons(ui,isNew)}
    ${!isNew?`<h4>${esc('Arbeitsaufträge zu diesem Vertrag')}</h4>${orders(rec).length?`<ul class="ref-list" data-contract-orders>${orders(rec).map(o=>`<li><button type="button" class="link" data-action="open-order" data-order="${esc(o.id)}">${ui.orderLabel(o)}</button> · ${ui.pill(o)}</li>`).join('')}</ul>`:`<p class="empty-state">${esc('Kein Arbeitsauftrag verweist auf diesen Vertrag.')}</p>`}`:''}`;
  return `<div class="admin-split">${table}<div class="admin-detail">${form}</div></div><p class="note">${esc('Arbeitsaufträge verweisen über die Vertrags-Nr. auf einen Vertrag. Die Aufträge des Spiels gehören zum Vertrag, der in der Waldplanung gewählt wurde.')}</p>`;
};

/* ---------- Eget företag (pre-created by the vendor) ---------- */
CFHViews.adminCompany=(vm,v,ui)=>{
  const{esc}=ui,A=CFHAdmin,F=CFHViews.adminField,c=A.data(vm,vm.plan).company,f={...c,...CFHViews.adminForm(v)},err=A.validateCompany(f);
  const inp=(k,type='text',extra='')=>`<input type="${type}" data-af="${k}" value="${esc(f[k]??'')}" ${extra}>`;
  return `<div class="admin-detail narrow" data-company-form><p class="flag info wide" data-precreated>${esc('Vom Hersteller angelegt: Trimble richtet das Unternehmen vor dem Start ein. Hier pflegen Sie Kontaktdaten und Kennungen.')}</p>
    <dl class="fields form">
    ${F(ui,'name','Firmenname',null,inp('name'),{req:true,err:err.name})}
    ${F(ui,'orgNo','USt-IdNr.',null,inp('orgNo','text','placeholder="DE123456789" autocomplete="off"'),{err:err.orgNo})}
    ${F(ui,'address','Anschrift',null,inp('address'))}
    ${F(ui,'contactName','Ansprechpartner',null,inp('contactName'))}
    ${F(ui,'phone','Telefon',null,inp('phone','tel'))}
    ${F(ui,'email','E-Mail',null,inp('email','email'),{err:err.email})}
    ${F(ui,'country','Staat',null,`<select data-change="af" data-af="country">${[['DE','Deutschland'],['AT','Österreich'],['CH','Schweiz'],['SE','Schweden'],['FI','Finnland']].map(([k,de])=>`<option value="${k}" ${f.country===k?'selected':''}>${esc(de)}</option>`).join('')}</select>`)}
    ${F(ui,'defaultLanguage','Standardsprache',null,`<select data-change="af" data-af="defaultLanguage">${A.LANGUAGES.map(([k,de])=>`<option value="${k}" ${f.defaultLanguage===k?'selected':''}>${esc(de)}</option>`).join('')}</select>`)}
    ${F(ui,'biometriaId','Biometria-Firmen-ID',null,inp('biometriaId','text','placeholder="NNNNN+00000" inputmode="numeric" autocomplete="off" data-no-translate'),{req:true,err:err.biometriaId,hint:esc('Format NNNNN+00000: Kennung bei Biometria, der schwedischen Holzvermessung.')})}
    </dl>${CFHViews.adminButtons(ui,false)}</div>`;
};

/* ---------- Resursöverföringar: resource to / from a subcontractor ---------- */
CFHViews.adminTransfers=(vm,v,ui)=>{
  const{esc,date,code}=ui,A=CFHAdmin,F=CFHViews.adminField,dat=s=>CFHViews.dat(ui,s),ad=A.data(vm,vm.plan),res=vm.resourcesAll,M=CFHModel;
  const f={...CFHViews.adminRecord(vm,v,'transfers').rec,...CFHViews.adminForm(v)},err=A.validateTransfer(f);
  const dir=d=>esc(d==='out'?'an Subunternehmer':'vom Subunternehmer zurück'),resName=id=>res.find(r=>r.id===id)?.name||id;
  const at=res.filter(r=>r.subcontractor);
  return `<div class="admin-split"><div class="admin-detail" data-transfer-form><h3>${esc('Neue Übertragung')}</h3><dl class="fields form">
    ${F(ui,'resourceId','Ressource',null,`<select data-change="af" data-af="resourceId">${res.map(r=>`<option value="${esc(r.id)}" ${f.resourceId===r.id?'selected':''}>${esc(r.name)} (${esc(r.id)})</option>`).join('')}</select>`,{req:true,err:err.resourceId})}
    ${F(ui,'direction','Richtung',null,`<div class="check-list">${['out','in'].map(d=>`<label class="check"><input type="radio" name="tr-dir" data-change="af" data-af="direction" value="${d}" ${f.direction===d?'checked':''}> ${dir(d)}</label>`).join('')}</div>`,{req:true,err:err.direction})}
    ${F(ui,'partner','Subunternehmer',null,`<input data-af="partner" value="${esc(f.partner)}" autocomplete="off">`,{req:true,err:err.partner})}
    ${F(ui,'seNumber','SE-Nummer',null,`<input data-af="seNumber" value="${esc(f.seNumber)}" placeholder="SE556677889901" autocomplete="off">`,{req:true,err:err.seNumber,hint:esc('Schwedische Organisations- bzw. USt-Nummer des Subunternehmers.')})}
    ${F(ui,'date','Datum',null,`<input type="date" data-af="date" value="${esc(f.date)}">`,{req:true,err:err.date})}
    ${F(ui,'note','Bemerkung',null,`<input data-af="note" value="${esc(f.note)}" maxlength="200">`)}
    </dl><div class="form-actions"><button type="button" class="green" data-action="admin-form-save" title="SV: Spara">${esc('Übertragung speichern')}</button></div>
    <p class="note">${esc('Die Ressource bleibt planbar und wird als Subunternehmer-Ressource gekennzeichnet. Eine Rückübertragung hebt die Kennzeichnung auf.')}</p></div>
    <div class="admin-list"><h3>${esc('Übertragungen')}</h3><div class="table-wrap"><table class="grid compact" data-transfer-table><thead><tr><th>${esc('Nr.')}</th><th>${esc('Datum')}</th><th>${esc('Ressource')}</th><th>${esc('Richtung')}</th><th>${esc('Subunternehmer')}</th><th>${esc('SE-Nummer')}</th><th>${esc('Bemerkung')}</th></tr></thead><tbody>
    ${ad.transfers.slice().reverse().map(t=>`<tr data-transfer="${esc(t.id)}"><td>${code(t.id)}</td><td>${date(t.date)}</td><td>${esc(resName(t.resourceId))}</td><td>${dir(t.direction)}</td><td>${dat(t.partner)}</td><td>${code(t.seNumber)}</td><td>${t.note?dat(t.note):'–'}</td></tr>`).join('')||`<tr><td colspan="7" class="muted">${esc('Noch keine Übertragung.')}</td></tr>`}</tbody></table></div>
    <h4>${esc('Derzeit beim Subunternehmer')}</h4>${at.length?`<ul class="ref-list" data-at-sub>${at.map(r=>`<li>${esc(r.name)} ${code('('+r.id+')')}${r.subcontractorName?` · ${dat(r.subcontractorName)}`:''}</li>`).join('')}</ul>`:`<p class="empty-state">${esc('Keine Ressource übertragen.')}</p>`}</div></div>`;
};

/* ---------- Kartskikt: default layers, order and colours of the map's 🗂 switcher ---------- */
CFHViews.adminLayers=(vm,v,ui)=>{
  const{esc,term}=ui,a=v.admin,saved=CFHAdmin.layers(vm.plan),cfg=a.layerDraft||saved,names=CFHViews.MAP_LAYERS,def=CFHAdmin.LAYERS;
  const label=k=>{const l=names.find(x=>x.key===k);return l?term(l.de,l.sv,{tip:true}):esc(k);};
  const dirty=JSON.stringify(cfg)!==JSON.stringify(saved);
  const rows=cfg.order.map((k,i)=>{const fixed=def.find(l=>l.key===k)?.fixed,colourable=def.find(l=>l.key===k)?.colour;return `<tr data-layer-row="${esc(k)}"><td>${fixed?'–':`${ui.num(i,0)}`}</td><th scope="row">${label(k)}${fixed?` <small class="muted">${esc('Grundlage, immer zuerst')}</small>`:''}</th>
    <td><input type="checkbox" data-change="layer-on" value="${esc(k)}" ${cfg.on[k]?'checked':''} aria-label="${esc('Standardmäßig eingeschaltet')}"></td>
    <td>${colourable?`<input type="color" data-change="layer-colour" value="${esc(cfg.colours[k])}" data-key="${esc(k)}" aria-label="${esc('Farbe')}"> <code data-no-translate>${esc(cfg.colours[k])}</code>`:`<small class="muted">${esc('Statusfarben')}</small>`}</td>
    <td class="nowrap">${fixed?'':`${ui.ibtn('layer-move','↑','Nach oben',null,{attrs:`data-key="${esc(k)}" data-dir="-1"`,disabled:i<=1})}${ui.ibtn('layer-move','↓','Nach unten',null,{attrs:`data-key="${esc(k)}" data-dir="1"`,disabled:i>=cfg.order.length-1})}`}</td></tr>`;}).join('');
  return `<div class="table-wrap"><table class="grid compact layer-table" data-layer-table><thead><tr><th>#</th><th>${esc('Kartenebene')}</th><th>${esc('Standardmäßig an')}</th><th>${esc('Farbe')}</th><th>${esc('Reihenfolge')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="form-actions"><button type="button" class="green" data-action="layer-save" ${dirty?'':'disabled'} title="SV: Spara">${esc('Speichern')}</button><button type="button" data-action="layer-reset">${esc('Auf Standard zurücksetzen')}</button>${dirty?`<small class="warn-text" data-layer-dirty>${esc('Nicht gespeichert')}</small>`:''}</div>
    <p class="note">${esc('Der Kartenebenen-Schalter (🗂) der Planungskarte und der Auftragskarte zeigt die Ebenen in dieser Reihenfolge. „Standardmäßig an“ gilt für jede neu geöffnete Karte; Planer können Ebenen in der Karte weiterhin ein- und ausschalten. Farben gelten für Umrisse und Symbole der Ebene; Bestände behalten ihre Statusfüllung.')}</p>`;
};

/* ---------- Meddelande mallar: templates used by every "Nachricht senden" ---------- */
CFHViews.adminTemplates=(vm,v,ui)=>{
  const{esc,code}=ui,a=v.admin,A=CFHAdmin,F=CFHViews.adminField,dat=s=>CFHViews.dat(ui,s),list=A.data(vm,vm.plan).templates;
  const{rec,isNew}=CFHViews.adminRecord(vm,v,'templates'),f={...rec,...CFHViews.adminForm(v)},err=A.validateTemplate(f);
  const o=vm.orders.find(x=>x.assignment)||vm.orders[0],row=o?.row||vm.rows[0],ctx={Auftrag:o?ui.orderLabelText(o):'',Ressource:row?.name||'',Datum:ui.dateText(o?.plannedStart||CFHModel.dayISO(vm.calendar.currentDay))};
  const table=`<div class="admin-list"><div class="list-head">${CFHViews.adminNew(ui,'Neue Vorlage')}</div><div class="table-wrap"><table class="grid compact" data-template-table><thead><tr><th>${esc('Name')}</th><th>${esc('Text')}</th><th title="SV: Aktiv">${esc('Aktiv')}</th></tr></thead><tbody>
    ${list.map(t=>`<tr class="${t.id===rec.id&&!isNew?'sel':''}" data-template="${esc(t.id)}"><td><button class="link" data-action="admin-sel" data-page="templates" data-id="${esc(t.id)}">${dat(t.name)}</button></td><td class="clip">${dat(t.text)}</td><td class="${t.active!==false?'ok':'bad'}">${t.active!==false?'✓':'✗'}</td></tr>`).join('')||`<tr><td colspan="3" class="muted">${esc('Keine Vorlage.')}</td></tr>`}</tbody></table></div></div>`;
  const form=`<div class="sub-head"><h3>${isNew?esc('Neue Vorlage'):dat(rec.name)} ${!isNew?code('('+rec.id+')'):''}</h3></div><dl class="fields form" data-template-form>
    ${F(ui,'name','Name',null,`<input data-af="name" value="${esc(f.name)}" maxlength="60" autocomplete="off">`,{req:true,err:err.name})}
    ${F(ui,'text','Text',null,`<textarea data-af="text" rows="4" maxlength="500" data-no-translate>${esc(f.text)}</textarea>`,{req:true,err:err.text,hint:`${esc('Platzhalter')} <span data-no-translate>{Auftrag} {Ressource} {Datum}</span>`})}
    ${F(ui,'active','Aktiv','Aktiv',`<label class="check"><input type="checkbox" data-change="af-check" data-af="active" ${f.active!==false?'checked':''}> ${esc('in „Nachricht senden“ anbieten')}</label>`)}
    </dl>${CFHViews.adminButtons(ui,isNew,isNew?'':`<button type="button" class="orange" data-action="tpl-delete" data-id="${esc(rec.id)}" title="SV: Radera">${esc('Löschen')}</button>`)}
    ${f.text?`<h4>${esc('Vorschau')}</h4><p class="tpl-preview" data-tpl-preview data-no-translate>${esc(A.fill(f.text,ctx))}</p>`:''}`;
  return `<div class="admin-split">${table}<div class="admin-detail">${form}</div></div>`;
};

/* ---------- Admin dialogs ---------- */
CFHViews.adminDialog=(vm,v,ui)=>{
  const d=v.dialog;if(!d)return '';const{esc,num,term,code}=ui;
  const head=(de,svTerm)=>`<div class="dlg-head"><h3>${term(de,svTerm)}</h3><button type="button" class="ghost close" data-action="dialog-cancel" aria-label="${esc('Schließen')}">✕</button></div>`;
  const buttons=list=>`<div class="dialog-actions">${list.map(([action,de,svTerm,cls=''])=>`<button type="button" class="${cls}" data-action="${action}" ${svTerm?`title="${ui.tip(de,svTerm)}"`:''}>${esc(de)}</button>`).join('')}</div>`;
  if(d.type==='res-new'){const t=CFHViews.RESOURCE_TYPES;return `${head('Neue Ressource','Ny')}<fieldset class="type-pick" data-type-pick><legend>${term('Ressourcentyp wählen','Typ',{tip:true})}</legend>${t.map(x=>`<label class="type-tile ${d.rtype===x.key?'on':''}"><input type="radio" name="res-type" data-change="res-new-type" value="${x.key}" ${d.rtype===x.key?'checked':''}> ${x.sv?term(x.de,x.sv):esc(x.de)}</label>`).join('')}</fieldset>
    <div class="dlg-grid"><label class="stack">${esc('Name')} *<input data-dialog="rname" value="${esc(d.name||'')}" autocomplete="off"></label><label class="stack">${esc('StanForD-Code')}<input data-dialog="rstanford" value="${esc(d.stanford||'')}" inputmode="numeric"></label></div>
    ${d.error?`<p class="required-msg" data-err="rname" title="SV: Obligatorisk uppgift">${esc(d.error)}</p>`:''}
    <p class="note">${esc('Neue Ressourcen sind planbar (Lkw nicht), aber nicht mit dem Spiel verbunden: Leistungen und Stunden sind Startwerte zum Anpassen.')}</p>
    ${buttons([['dialog-cancel','Abbrechen','Avbryt'],['res-new-create','Anlegen','Ny','green']])}`;}
  if(d.type==='licence'){const r=vm.resourcesAll.find(x=>x.id===d.resId);if(!r)return '';const pause=r.active!==false,row=vm.rows.find(x=>x.id===r.id),n=(row?.items.length||0)+(row?.ghosts?.length||0),chains=vm.chainsAll.filter(c=>c.members.includes(r.id));
    return `${head(pause?'Lizenz pausieren':'Lizenz aktivieren',pause?'Pausa licens':'Aktivera licens')}<p data-licence-question>${esc(pause?'Lizenz pausieren für':'Lizenz aktivieren für')} <b>${esc(r.name)}</b> ${code('('+r.id+')')}?</p>
    ${pause?`<p>${esc('Die Ressource erscheint dann nicht mehr bei „Ressource wählen“ und im Kalender. Geplante Aufträge bleiben gespeichert und erscheinen wieder, sobald die Lizenz aktiv ist.')}</p>${n?`<p class="flag warn wide" data-licence-planned>${num(n,0)} ${esc(n===1?'geplanter Balken wird ausgeblendet.':'geplante Balken werden ausgeblendet.')}</p>`:''}${chains.length?`<p class="note">${esc('Mitglied der Erntekette')}: ${chains.map(c=>code(c.id)).join(', ')}</p>`:''}`:`<p>${esc('Die Ressource wird wieder planbar und erscheint im Kalender.')}</p>`}
    ${buttons([['dialog-cancel','Abbrechen','Avbryt'],['licence-confirm',pause?'Pausieren':'Aktivieren',pause?'Pausa licens':'Aktivera licens',pause?'orange':'green']])}`;}
  if(d.type==='user-msg'){const u=CFHAdmin.data(vm,vm.plan).users.find(x=>x.id===d.userId);if(!u)return '';return `${head('Nachricht senden','Skicka meddelande')}<p>${esc('An')}: <b>${CFHViews.dat(ui,u.displayName)}</b> · ${CFHViews.dat(ui,u.email)}</p>
    ${CFHViews.templateSelect(vm,ui,'user')}<label class="stack">${esc('Nachricht')}<textarea data-dialog="umsg" rows="4" maxlength="500" data-no-translate>${esc(d.text||'')}</textarea></label>
    ${buttons([['dialog-cancel','Abbrechen','Avbryt'],['user-msg-send','Senden','Skicka','green']])}`;}
  return '';
};
