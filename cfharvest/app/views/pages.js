/* Shell pages [M8]: Meddelanden (messages to resources + machine feedback from the game), Integrationslogg (StanForD
   files sent, HPR/FPR received), Rapporter (production follow-up) and Hjälp (glossary German ↔ Swedish product terms). */
'use strict';
CFHViews.meddelanden=(vm,v,ui)=>{
  const{esc,num,term,code}=ui,feedback=vm.orders.flatMap(o=>o.notes.map(n=>({...n,o}))).sort((a,b)=>b.round-a.round);
  return `<section class="cfh-view wide" data-view="messages" aria-labelledby="msgTitle"><div class="view-head"><h2 id="msgTitle">${term('Nachrichten','Meddelanden')}</h2></div>
  <div class="msg-compose"><label class="filter"><span>${esc('An')}</span><select data-input="msg-to">${vm.rows.map(r=>`<option value="${esc(r.id)}" ${v.msgTo===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><label class="stack grow">${esc('Nachricht')}<textarea data-input="msg-text" rows="2" maxlength="500">${esc(v.msgText||'')}</textarea></label><button type="button" class="green" data-action="msg-send" title="SV: Skicka">${esc('Senden')}</button></div>
  <h3>${esc('Gesendet')}</h3>${vm.plan.messages.length?`<ul class="msg-list">${vm.plan.messages.slice().reverse().map(m=>`<li data-message><b>${esc(vm.rows.find(r=>r.id===m.to)?.name||m.to)}</b> · ${esc('Schicht')} ${num(m.round,0)}${m.orderId?` · ${code(m.orderId)}`:''}<p data-no-translate>${esc(m.text)}</p></li>`).join('')}</ul>`:`<p class="empty-state">${esc('Noch keine Nachricht gesendet.')}</p>`}
  <h3>${esc('Rückmeldungen der Maschinen')}</h3>${feedback.length?`<ul class="notes">${feedback.map(n=>`<li class="log-${esc(n.kind)}">${esc('Schicht')} ${num(n.round,0)} · ${esc(n.o.name)} · ${esc(n.title)}</li>`).join('')}</ul>`:`<p class="empty-state">${esc('Noch keine Rückmeldung.')}</p>`}
  </section>`;
};
CFHViews.integrationslogg=(vm,v,ui)=>{
  const{esc,num,code}=ui,out=vm.plan.log.filter(l=>l.kind==='sent').map(l=>({round:l.at,dir:'out',type:l.files.map(f=>f.toUpperCase()).join(' + '),order:l.orderId,res:l.rowId,text:'an Ressource gesendet'}));
  const inc=vm.production.messages.filter(m=>m.kind==='shift').map(m=>({round:m.round,dir:'in',type:m.type,order:m.objectKey,res:m.machineKey,text:`${ui.fm(m.volume)} ${m.type==='HPR'?'gefällt':'gerückt'}`}));
  const rows=[...out,...inc].sort((a,b)=>b.round-a.round||(a.dir<b.dir?-1:1));
  return `<section class="cfh-view wide" data-view="integration" aria-labelledby="intTitle"><div class="view-head"><h2 id="intTitle">${ui.term('Integrationsprotokoll','Integrationslogg')}</h2></div>
  <div class="table-wrap"><table class="grid" data-integration><thead><tr><th>${esc('Schicht')}</th><th>${esc('Richtung')}</th><th>${esc('Nachricht')}</th><th>${esc('Arbeitsauftrag')}</th><th>${esc('Ressource')}</th><th>${esc('Inhalt')}</th></tr></thead><tbody>${rows.map(r=>`<tr data-dir="${r.dir}"><td>${num(r.round,0)}</td><td>${esc(r.dir==='out'?'Ausgehend':'Eingehend')}</td><td>${code(r.type)}</td><td>${code(r.order)}</td><td>${code(r.res||'–')}</td><td>${esc(r.text)}</td></tr>`).join('')||`<tr><td colspan="6">${esc('Noch keine Nachricht ausgetauscht.')}</td></tr>`}</tbody></table></div>
  <p class="note">${esc('Ausgehend: StanForD-Dateien (OIN, PIN, FOI, FDI) beim Senden an die Ressource. Eingehend: Produktionsmeldungen (HPR, FPR) aus den Spielschichten.')}</p></section>`;
};
CFHViews.rapporter=(vm,v,ui)=>`<section class="cfh-view wide" data-view="reports" aria-labelledby="repTitle"><div class="view-head"><h2 id="repTitle">${ui.term('Berichte','Rapporter')} › ${ui.esc('Produktionsbericht')}</h2><button type="button" data-action="list-pdf">PDF</button></div>${CFHViews.followUpTables(vm,ui)}</section>`;
CFHViews.hjalp=(vm,v,ui)=>{
  const{esc,code}=ui;
  return `<section class="cfh-view wide" data-view="help" aria-labelledby="helpTitle"><div class="view-head"><h2 id="helpTitle">${ui.term('Hilfe','Hjälp')}</h2></div>
  <h3>${esc('So planen Sie')}</h3><ol class="help-steps"><li>${esc('Aufträge in der Auftragsliste anklicken (mehrere möglich).')}</li><li>${esc('Auf eine Ressource im Kalender ziehen oder Ressource wählen und „Auf Ressource verschieben“.')}</li><li>${esc('Mit Speichern übernehmen, dann „Senden“: Der Status wird violett und der Harvester erhält OIN und PIN.')}</li><li>${esc('Zurück zum Spiel: Die gesendete Disposition gilt für die nächste Schicht.')}</li></ol>
  <h3>${esc('Statusfarben')}</h3><p class="legend-pills"><span class="pill pill-available">${esc('Frei')}</span><span class="pill pill-planned">${esc('Geplant')}</span><span class="pill pill-sent">${esc('Gesendet')}</span><span class="pill pill-team">${esc('An Team gesendet')}</span><span class="pill pill-started">${esc('Begonnen')}</span><span class="pill pill-completed">${esc('Abgeschlossen')}</span></p>
  <h3>${esc('Begriffe im Produkt')}</h3><p class="note">${esc('Die Replik ist deutsch. CFHarvest selbst ist schwedisch; die Originalbegriffe stehen klein in Klammern oder im Tooltip.')}</p>
  <div class="table-wrap"><table class="grid compact"><thead><tr><th>${esc('Deutsch')}</th><th>${esc('Schwedisch (Produkt)')}</th></tr></thead><tbody>${ui.GLOSSARY.map(([de,s])=>`<tr><td>${esc(de)}</td><td><span class="sv" lang="sv" data-no-translate>${esc(s)}</span></td></tr>`).join('')}</tbody></table></div>
  <p class="note">${esc('Demo-Replik für die Messe. Kein Produktbildschirm; alle Mengen stammen aus dem Spielstand.')} ${code('StanForD 2010')}</p></section>`;
};
