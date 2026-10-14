/* Work-order side panel [MW][MM]: tabs Arbetsorder / Övrig info / Område / Sortiment / Avlägg, editable estimated dates,
   manual message, Funktioner (mostly disabled until started) and "Starta, överför till mätdon" → OIN/PIN (+FOI/FDI). */
'use strict';
CFHViews.PANEL_TABS=[['order','Arbetsorder'],['info','Övrig info'],['area','Område'],['products','Sortiment'],['landings','Avlägg']];
CFHViews.startBlockers=o=>[!o.assignment&&'Ressource fehlt',!o.plannedStart&&'Geplanter Start fehlt',o.closed&&'Hieb gesperrt'].filter(Boolean);
CFHViews.orderPanel=(vm,v,ui)=>{
  const{esc,num,sv,code,date,status,json}=ui,o=vm.orders.find(x=>x.id===v.panel.orderId);if(!o)return '';
  const tab=CFHViews.PANEL_TABS.some(t=>t[0]===v.panel.tab)?v.panel.tab:'order',started=CFHModel.STATUSES.indexOf(o.status)>=3,felledEnded=['felled','forwarding','completed'].includes(o.status);
  const blockers=CFHViews.startBlockers(o),req=o.pin.required,instr=o.instructions;
  const field=(label,value,required=false,missing=false)=>`<div class="field ${required?'required':''} ${missing?'missing':''}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  let body='';
  if(tab==='order')body=`<dl class="fields">
    ${field('Auftragsnummer',code(o.id))}${field('Hieb',esc(o.name))}${field('Auftraggeber',esc(o.client))}${field('Vertrag',`${code(o.contractId)} · ${esc(vm.meta.contract.name)}${vm.meta.contract.provisional?` <span class="flag warn">${esc('Vertrag im Spiel noch nicht übernommen')}</span>`:''}`)}
    ${field('Maßnahme',`${sv(o.operation)} · ${esc(o.operationLabel)}`)}${field('Status',status(o))}
    ${field('Ressource / Team',ui.resourceLabel(o),true,!o.assignment)}
    ${field('Geplanter Start',`<input type="date" data-draft="estStart" value="${esc(v.panel.draft.estStart??o.plannedStart??'')}" ${o.assignment?'':'disabled'} aria-label="${esc('Geplanter Start')}">`,true,!o.plannedStart)}
    ${field('Geplantes Ende',`<input type="date" data-draft="estEnd" value="${esc(v.panel.draft.estEnd??o.plannedEnd??'')}" ${o.assignment?'':'disabled'} aria-label="${esc('Geplantes Ende')}">${o.endManual?` <small>${esc('manuell')}</small>`:''}`)}
    ${field('Baumarten',esc(o.species))}${field('Gelände',esc(o.terrain))}
    ${field('Nachricht an die Ressource',`<textarea data-draft="message" rows="2" aria-label="${esc('Nachricht an die Ressource')}">${esc(v.panel.draft.message??o.message)}</textarea>`)}</dl>`;
  if(tab==='info')body=`<h4>${esc('Hinweise des Auftraggebers')}</h4>${o.bio?`<article class="bio-card"><b>${code(o.bio.code)} · ${esc(o.bio.title)}</b><small>${esc(o.bio.status)}</small><p>${esc(o.bio.instruction)}</p><p><b>${esc(o.bio.restriction)}</b></p><small>${esc(o.bio.location)}</small></article>`:''}
    <ul class="checks">${o.readiness.map(r=>`<li class="lvl-${r.level}">${r.level==='ok'?'✓':r.level==='block'?'⛔':r.level==='warn'?'!':'i'} ${esc(r.text)}${r.key==='survey'?` · ${num(r.value,0)} %`:''}</li>`).join('')}</ul>
    <h4>${esc('Rückmeldungen der Maschine')}</h4>${o.notes.length?`<ul class="notes">${o.notes.map(n=>`<li class="log-${esc(n.kind)}">${esc('Schicht')} ${num(n.round,0)} · ${esc(n.title)}</li>`).join('')}</ul>`:`<p class="muted">${esc('Noch keine Rückmeldung.')}</p>`}`;
  if(tab==='area')body=`<div class="table-wrap"><table class="grid compact"><thead><tr><th>${esc('Abteilung')}</th><th>${esc('Geschätzte Menge')}</th><th>${esc('Waldlager zu Beginn')}</th><th>${esc('Noch stehend')}</th></tr></thead><tbody><tr><td>${esc('Abt.')} 1 · ${esc(o.name)}</td><td>${ui.fm(o.estimatedVolume)}</td><td>${ui.fm(o.openingStock)}</td><td>${ui.fm(o.remaining)}</td></tr></tbody><tfoot><tr><th>${esc('Summe')}</th><th>${ui.fm(o.estimatedVolume)}</th><th>${ui.fm(o.openingStock)}</th><th>${ui.fm(o.remaining)}</th></tr></tfoot></table></div>
    <dl class="fields">${field('Maßnahme',`${sv(o.operation)} · ${esc(o.operationLabel)}`)}${field('Stubbenbehandlung',esc('Nein'))}${field('Reisigentnahme',esc('Nein'))}${field('Vorerkundung',num(o.surveyCoverage,0)+' %')}${field('Hiebsgrenze',esc(o.boundaryChecked?'abgeglichen':'nicht abgeglichen'))}</dl>`;
  if(tab==='products'){const f=o.stand.byGrade;body=`${o.pinFlag?`<p class="flag ${o.pin.cutting==='cached'?'block':'warn'} wide" data-pin-flag>${code('H-01')} ${esc('arbeitet noch mit')} ${code('PIN v'+(o.pin.machineVersion||'?'))} (${esc(o.pin.loaded)} m) · ${esc('Auftrag verlangt')} ${code('PIN v'+req)} (${esc(o.pin.spec)} m)${o.pin.cutting==='cached'?` · ${esc('Abwertungsrisiko')}`:''}</p>`:''}
    <div class="table-wrap"><table class="grid compact"><thead><tr><th>${sv('Sortiment')}</th><th>${esc('Lieferort')}</th><th>${esc('Geschätzt')}</th><th>${esc('Gefällt')}</th><th>${esc('Gerückt')}</th><th>${esc('Waldlager')}</th><th>${code('PIN')}</th></tr></thead><tbody>
    ${o.assortments.map(a=>`<tr><td>${code(a.code)} ${esc(a.name)}</td><td>${esc(a.receiver)}</td><td>${a.pin?ui.fm(a.estimatedVolume):'–'}</td><td>${ui.fm(f[a.key].felled)}</td><td>${ui.fm(f[a.key].forwarded)}</td><td>${ui.fm(f[a.key].forestStock)}</td><td>${a.pin?`${code('v'+req)}${a.lengthSpec?` · ${esc(a.lengthSpec)} m`:''}`:`<small>${esc('kein Sortimentsauftrag')}</small>`}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">${esc('Gefällt, gerückt und Waldlager aus den Produktionsmeldungen (HPR/FPR) der Spielschichten.')}</p>`;}
  if(tab==='landings'){const l=o.landing,extra=vm.plan.edits[o.id]?.landings||[];body=`<div class="table-wrap"><table class="grid compact"><thead><tr><th>${sv('Avlägg')}</th><th>${esc('Sägeholz')}</th><th>${esc('Industrieholz')}</th><th>${esc('Abgewertet')}</th><th>${esc('Angeliefert')}</th></tr></thead><tbody><tr><td>${code(l.id)}</td><td>${ui.fm(l.roadsideGrades.saw||0)}</td><td>${ui.fm(l.roadsideGrades.pulp||0)}</td><td>${ui.fm(l.roadsideGrades.down||0)}</td><td>${ui.fm(l.delivered)}</td></tr>${extra.map((p,i)=>`<tr><td>${code(l.id+'-'+(i+2))}</td><td colspan="4"><small>${esc('Zusätzlicher Lagerplatz in der Karte')}</small></td></tr>`).join('')}</tbody></table></div><button data-action="map-add-landing">${esc('Avlägg setzen')}</button>`;}
  const funcs=[['forwarding','Skotningsanmälan',started],['rereport','Återrapportera',started],['close','Avsluta order',o.status==='completed'],['labels','Skriv ut vältlappar',felledEnded],['pdf','PDF-rapport',false]];
  const files=instr?.files;
  return `<div class="panel-head"><div><p class="eyebrow">${sv('Arbetsorder')}</p><h3>${code(o.id)} · ${esc(o.name)}</h3>${status(o)}</div><button class="ghost close" data-action="close-panel" aria-label="${esc('Auftrag schließen')}">✕</button></div>
  <div class="tabs" role="tablist">${CFHViews.PANEL_TABS.map(([k,l])=>`<button role="tab" data-action="panel-tab" data-tab="${k}" aria-selected="${k===tab}">${sv(l)}</button>`).join('')}</div>
  <div class="panel-body">${body}</div>
  <div class="panel-foot">
    <details class="funcs"><summary>${sv('Funktioner')}</summary>${funcs.map(([k,l,on])=>`<button data-action="panel-func" data-func="${k}" ${on?'':'disabled'}>${sv(l)}</button>`).join('')}<small>${esc('Meist erst nach Start verfügbar.')}</small></details>
    <div class="panel-actions"><button data-action="panel-save">${sv('Spara')}</button>
    <button class="primary" data-action="panel-start" ${blockers.length?'disabled':''}>${sv('Starta, överför till mätdon')}</button></div>
    ${blockers.length?`<p class="flag warn wide">${blockers.map(b=>esc(b)).join(' · ')}</p>`:''}
    ${files?`<details class="files" ${v.panel.filesOpen?'open':''}><summary>${esc('Erzeugte StanForD-Dateien')} · ${esc('Schicht')} ${num(instr.round,0)} · ${code('PIN v'+instr.pinVersion)}</summary>
      ${files.oin?`<h5>${code('OIN')} · ${code('H-01')}</h5>${json(files.oin)}`:''}${files.pin.map(p=>`<h5>${code('PIN')} · ${code(p.ProductInstruction.ProductDefinition.ProductKey)}</h5>${json(p)}`).join('')}${files.foi?`<h5>${code('FOI')} · ${code('F-01')}</h5>${json(files.foi)}`:''}${files.fdi?`<h5>${code('FDI')} · ${code('F-01')}</h5>${json(files.fdi)}`:''}</details>`:''}
  </div>`;
};
