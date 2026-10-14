// Decision-toggle contract test (jsdom; no browser layout is simulated).
// Guards that every rendered badge comes from choiceMeta(), that toggles write the same state keys the dropdowns did,
// that the live planning total moves by exactly the badge difference, and that the preview equals the booked ledger.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('dist/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{url:'https://forestry.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,c=dom.getInternalVMContext();w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLCanvasElement.prototype.getContext=()=>null;
for(const file of ['game','journey','routes','flyover','handover','journey-ui','app'])vm.runInContext(fs.readFileSync('dist/'+file+'.js','utf8'),c);
const js=code=>vm.runInContext(code,c),json=x=>JSON.stringify(x),close=(a,b,msg)=>assert(Math.abs(a-b)<.005,`${msg}: ${a} != ${b}`);
const euro=n=>js(`euro(${n})`),signed=(n,per='')=>js(`signedEuro(${n},${json(per)})`);
const stageTotal=()=>js(`state.phase==='plan'?ForestGame.previewCost(state).total:state.phase==='forest'?ForestJourney.planPreview(state).cost:state.phase==='logistics'?ForestJourney.haulPreview(state).estimate:ForestJourney.settlementPreview(state).cost`);
const current=(scope,key)=>js(scope==='journey'?`state.journey.${key}`:`state.${key}`);
const groups=()=>[...d.querySelectorAll('fieldset.decision-toggle')];
const radios=(scope,key)=>[...d.querySelectorAll(`button[role="radio"][data-scope="${scope}"][data-choice="${key}"]`)];
const norm=s=>s.replace(/\s+/g,' ').trim(),text=el=>norm(el.textContent);
let decisions=0,options=0,clicks=0,keys=0,ledgers=0;const covered=new Set();
function press(type,target){target.dispatchEvent(new w.KeyboardEvent('keydown',{key:type,bubbles:true,cancelable:true}));keys++;}
function checkRendered(scope,key){
 const buttons=radios(scope,key),value=current(scope,key);assert(buttons.length>=2,key);
 const group=buttons[0].closest('fieldset');assert.equal(group.getAttribute('role'),'radiogroup');assert.equal(d.getElementById(group.getAttribute('aria-labelledby')),group.querySelector('legend'));
 assert.deepEqual(buttons.filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.value),[value],key+' aria-checked');
 assert.deepEqual(buttons.filter(b=>b.tabIndex===0).map(b=>b.value),[value],key+' roving tabindex');
 for(const b of buttons){
  const meta=js(`choiceMeta(${json(scope)},${json(key)},${json(b.value)},state)`),badges=b.querySelectorAll('.badge');
  assert.equal(b.type,'button');assert.equal(b.classList.contains('on'),b.value===value);
  const cost=b.querySelector('[data-badge="cost"]');assert(cost,key+' cost badge');
  assert.equal(cost.textContent,signed(meta.cost),`${key}=${b.value} euro badge`);assert(cost.textContent.endsWith(euro(Math.abs(Math.abs(meta.cost)<.5?0:meta.cost))),`${key}=${b.value} uses euro()`);
  const risks=[...b.querySelectorAll('[data-badge="risk"]')];assert.equal(risks.length,meta.risk.length,`${key}=${b.value} risk count`);
  risks.forEach((r,i)=>{assert(text(r).startsWith('Risiko'),'risk badge names the risk');if(meta.risk[i].value!==undefined)assert(text(r).includes(norm(signed(meta.risk[i].value,meta.risk[i].per||''))),`${key} risk amount`);assert(text(r).includes(meta.risk[i].label));});
  for(const [type,field] of [['rate','rate'],['bonus','bonus']]){const el=b.querySelector(`[data-badge="${type}"]`);assert.equal(!!el,!!meta[field],`${key}=${b.value} ${type}`);if(el)assert.equal(text(el),norm(signed(meta[field].value,meta[field].per||'')+' '+meta[field].label));}
  assert.equal(!!b.querySelector('[data-badge="note"]'),!!meta.note);
  assert.equal(text(b.querySelector('.toggle-why')),meta.reason);assert(meta.reason&&meta.reason.split(/\s+/).length<=5,`${key}=${b.value} reason ≤ 5 words`);
  assert.equal(badges.length,1+meta.risk.length+!!meta.rate+!!meta.bonus+!!meta.note);options++;
 }
 assert.equal(d.querySelector('[data-plan-total]').textContent,euro(stageTotal()),key+' total chip');
}
function exercise(scope,key){
 checkRendered(scope,key);decisions++;const firstVisit=!covered.has(scope+':'+key);covered.add(scope+':'+key);
 const original=current(scope,key),values=radios(scope,key).map(b=>b.value);
 for(const value of values){
  const before=current(scope,key),costs=Object.fromEntries(values.map(v=>[v,js(`choiceMeta(${json(scope)},${json(key)},${json(v)},state).cost`)])),totalBefore=stageTotal();
  radios(scope,key).find(b=>b.value===value).click();clicks++;
  assert.equal(current(scope,key),value,`click sets ${key}`);checkRendered(scope,key);
  assert.equal(d.activeElement.dataset.choice,key,'focus restored');assert.equal(d.activeElement.value,value);
  close(stageTotal()-totalBefore,costs[before]-costs[value],`${key}: ${before}→${value} total moves by the badge difference`);
 }
 // Keyboard (once per decision): arrows move and select with wrap-around, Home/End jump, Enter/Space select the focused option.
 if(firstVisit){const first=values[0],last=values.at(-1);radios(scope,key).find(b=>b.value===first).click();
 press('ArrowRight',d.activeElement);assert.equal(current(scope,key),values[1]);assert.equal(d.activeElement.value,values[1]);
 press('ArrowLeft',d.activeElement);assert.equal(current(scope,key),first);
 press('ArrowUp',d.activeElement);assert.equal(current(scope,key),last,'wraps');press('ArrowDown',d.activeElement);assert.equal(current(scope,key),first,'wraps');
 press('End',d.activeElement);assert.equal(current(scope,key),last);press('Home',d.activeElement);assert.equal(current(scope,key),first);
 const other=radios(scope,key).find(b=>b.value===last);other.focus();press('Enter',other);assert.equal(current(scope,key),last);
 const again=radios(scope,key).find(b=>b.value===first);again.focus();press(' ',again);assert.equal(current(scope,key),first);}
 radios(scope,key).find(b=>b.value===original).click();assert.equal(current(scope,key),original);
}
function exerciseScreen(label){const list=groups().map(g=>{const b=g.querySelector('button[role="radio"]');return [b.dataset.scope,b.dataset.choice];});assert(list.length,label+' has decisions');assert.equal(d.querySelectorAll('select[data-journey]').length,0);for(const [scope,k] of list)exercise(scope,k);return list.map(x=>x[1]);}
function acknowledge(){js("for(const id of ['a','b','c']){state.handoverAccepted[id]=true;state.handoverVersions[id]=state.round>=3?2:1;}");}
// The harvest preview is exactly the planned part of the booked ledger (§4.3), whatever the incidents.
const conditional=new Set(['Korrektur nach Kontrollmessung','Hiebsstopp, Sicherung und Untersuchung','Nachbarbäume · Ersatz, Dokumentation und Klärung','Nachsortierung / Reklamation']);
function checkLedger(){acknowledge();if(js('ForestGame.validate(state)'))return;const r=JSON.parse(js('JSON.stringify((()=>{const p=ForestGame.previewCost(state),o=ForestGame.calculate(state).outcome;return {p,o:{cost:o.cost,costItems:o.costItems}};})())'));
 assert.deepEqual(r.o.costItems.filter(x=>!conditional.has(x.label)),r.p.items.map(({label,value})=>({label,value})),'preview items = booked planned items');
 close(r.o.cost-r.p.total,r.o.costItems.filter(x=>conditional.has(x.label)).reduce((a,b)=>a+b.value,0),'ledger = preview + conditional');ledgers++;}
// Exhibition constraints that live in CSS: 44 px touch targets, Trimble blue selection, amber reserved for risk badges.
const css=fs.readFileSync('dist/style.css','utf8');assert(/\.toggle\{[^}]*min-height:44px/.test(css),'touch target');assert(/\.toggle\.on\{[^}]*background:#0063a3;border-color:#003f6b/.test(css),'Trimble blue selection');assert(/\.badge\.risk\{[^}]*background:#fff1d1/.test(css));assert(!/\.decision-field/.test(css),'dropdown CSS removed');
(async()=>{
 // 1 · Waldplanung
 for(const improved of [false,true]){js(`state=ForestJourney.initial(${improved});render()`);const k=exerciseScreen('Waldplanung');assert.deepEqual(k,['contractType','preparation','documentation']);
  for(const type of ['standard','premium'])for(const prep of ['records','field']){js(`state=ForestJourney.choose(ForestJourney.choose(state,'contractType','${type}'),'preparation','${prep}')`);assert.equal(js('ForestJourney.planPreview(state).cost'),js('ForestJourney.start(state).journey.plan.cost'));ledgers++;}}
 // 2 · Holzernte: four shifts across stands, stale settings, survey gaps, closed sites and the express commitment.
 for(const [h,f] of [['a','a'],['b','b'],['c','a'],['a','c']]){
  js(`state=ForestJourney.start(ForestJourney.initial());state.harvester='${h}';state.forwarder='${f}';render()`);
  for(let round=1;round<=4;round++){
   js(`state.round=${round};state.loadedGrade=${round===3?"'5,1'":'state.loadedGrade'};render()`);const k=exerciseScreen('Schicht '+round);
   assert.equal(k.includes('priority'),round===4);for(const x of ['handoverMode','forwardStart','reporting','cutting','quality','pace','boundary','survey'])assert(k.includes(x),x);
   for(const variant of ["{}","{forwardStart:'stock',reporting:'live'}","{forwardStart:'late',quality:'check',cutting:'cached',boundary:'unchecked'}","{survey:'ignore',handoverMode:'manual',priority:'express'}","{survey:'inspect',boundary:'field',priority:'express',pace:'fast'}"]){const saved=js('JSON.stringify(state)');js(`Object.assign(state,${variant})`);checkLedger();js(`state=JSON.parse(${json(saved)})`);}
  }
 }
 js("state=ForestJourney.start(ForestJourney.initial());state.stands.find(x=>x.id==='b').closed=true;state.closedSites=['b'];render()");exerciseScreen('Schicht mit gesperrtem Hieb');
 // Click-through: the harvest toggles drive a real shift and the booked planned costs equal the live total.
 js("state=ForestJourney.start(ForestJourney.initial());render()");radios('game','cutting').find(b=>b.value==='current').click();radios('game','forwardStart').find(b=>b.value==='stock').click();const planned=stageTotal();
 d.getElementById('run').click();assert.equal(js('state.phase'),'receipt');const booked=js('state.history.at(-1).costItems').filter(x=>!conditional.has(x.label)).reduce((a,b)=>a+b.value,0);close(booked,planned,'shift ledger matches the live total');
 // 3 · Logistik and 4 · Abrechnung across contracts, preparation and earlier choices.
 for(const type of ['standard','premium'])for(const prep of ['records','field'])for(const harvest of ['digital','manual']){
  js(`(()=>{let s=ForestJourney.initial();s=ForestJourney.choose(ForestJourney.choose(s,'contractType','${type}'),'preparation','${prep}');s=ForestJourney.start(s);for(let r=1;r<=4;r++){if('${harvest}'==='digital')Object.assign(s,{handoverMode:'digital',cutting:'current',reporting:'live',boundary:'digital',survey:'protect'});if(r===4)s.harvester=s.forwarder='b';for(const id of ['a','b','c']){s.handoverAccepted[id]=true;s.handoverVersions[id]=r>=3?2:1;}s=ForestGame.nextShift(ForestGame.calculate(s).next);}state=s;render();})()`);
  assert.equal(js('state.phase'),'logistics');assert.deepEqual(exerciseScreen('Logistik'),['haulMode','access','deliveryDocs']);
  for(const haulMode of ['matched','estimate'])for(const access of ['checked','unchecked'])for(const docs of ['linked','paper']){const r=js(`(()=>{let s=ForestJourney.choose(ForestJourney.choose(ForestJourney.choose(state,'haulMode','${haulMode}'),'access','${access}'),'deliveryDocs','${docs}');const p=ForestJourney.haulPreview(s),n=ForestJourney.haul(s);return {estimate:p.estimate,cost:n.journey.logistics.cost,failed:n.journey.logistics.failed};})()`);close(r.cost-r.estimate,r.failed?js('ForestJourney.COSTS.failedAccess'):0,'haul ledger = preview + failed trip');ledgers++;}
  radios('journey','deliveryDocs').find(b=>b.value==='paper').click();d.getElementById('runHaul').click();d.getElementById('toSettlement').click();assert.equal(js('state.phase'),'settlement');
  assert.deepEqual(exerciseScreen('Abrechnung'),['reconciliation','closeout']);
  for(const rec of ['match','accept'])for(const close_ of ['document','force']){const r=js(`(()=>{const s=ForestJourney.choose(ForestJourney.choose(state,'reconciliation','${rec}'),'closeout','${close_}');return {p:ForestJourney.settlementPreview(s).cost,c:ForestJourney.settle(s).journey.settlement.cost};})()`);close(r.c,r.p,'settlement ledger = preview');ledgers++;}
 }
 for(const k of ['handoverMode','forwardStart','reporting','cutting','quality','pace','boundary','survey','priority'])assert(covered.has('game:'+k),k);for(const k of ['contractType','preparation','documentation','haulMode','access','deliveryDocs','reconciliation','closeout'])assert(covered.has('journey:'+k),k);
 console.log(JSON.stringify({passed:true,decisionGroups:decisions,optionsChecked:options,clicks,keyboardEvents:keys,previewLedgerChecks:ledgers,decisionKeys:covered.size,mode:'jsdom DOM contract; browser layout not tested'}));dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
