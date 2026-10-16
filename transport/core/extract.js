/* Holztransport demo · extraction engine (SPEC §5). Deterministic, profile-driven: classify each page, extract the
   fixed schema per class with page/line provenance and a confidence, parse stack tables (breakdowns and summaries stay
   informational), validate (totals, lot summaries, coordinates, units, lengths, instructions, duplicates, versions)
   and emit exceptions that block a line or an order header, never the inbox. Document text is data: nothing here
   interprets it as a command or renders it as HTML. */
'use strict';
(function(){
const req=(name,path)=>(globalThis.TransportCore&&globalThis.TransportCore[name])||(globalThis.TransportData&&globalThis.TransportData[name])||(typeof require!=='undefined'?require(path):null);
const U=req('units','./units.js'),C=req('coords','./coords.js'),CUST=req('customers','../data/customers.js');
const WEEKDAYS=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const DATE_RE=/(\d{1,2})\.(\d{1,2})\.(\d{4})/g,DATE_PARTIAL_RE=/(\d{1,2})\.(\d{1,2})\.(?!\d)/g,TIME_RE=/(\d{1,2}):(\d{2})/;
const ORDER_TYPES=['Transportauftrag','Fuhrauftrag','Frachtauftrag','Holzbereitstellung','Transportmeldung','Abfuhrauftrag','Fuhrenauftrag'];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cells=line=>String(line).split(/\t| {3,}/).map(s=>s.trim());
const nonEmpty=line=>cells(line).filter(Boolean);
const cleanLabel=s=>s.replace(/[\s:.]+$/,'').trim();
const hasDate=s=>/\d{1,2}\.\d{1,2}\.(\d{4})?/.test(s);
function hash(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return ('0000000'+h.toString(16)).slice(-8);}
function contentHash(doc){return hash(doc.attachments.map(a=>a.pages.map(p=>p.lines.map(l=>String(l).replace(/\s+/g,' ').trim()).join('\n')).join('\n\f')).join('\n\f\f'));}
/* Dates: "19.10. - 23.10.2026" → ['2026-10-19','2026-10-23']; partial dates adopt the year of the following full date. */
function parseDates(str){
  const out=[];const s=String(str||'');const full=[...s.matchAll(DATE_RE)].map(m=>({i:m.index,d:+m[1],m:+m[2],y:+m[3]}));
  const partial=[...s.matchAll(DATE_PARTIAL_RE)].map(m=>({i:m.index,d:+m[1],m:+m[2]})).filter(p=>!full.some(f=>f.i===p.i));
  const all=[...full,...partial].sort((a,b)=>a.i-b.i);
  for(let k=0;k<all.length;k++){const a=all[k];let y=a.y;if(!y){const next=all.slice(k+1).find(x=>x.y);y=next?next.y:null;}if(!y||a.m<1||a.m>12||a.d<1||a.d>31)continue;out.push(`${y}-${String(a.m).padStart(2,'0')}-${String(a.d).padStart(2,'0')}`);}
  return out;
}
function parseDateTime(str){const d=parseDates(str)[0];if(!d)return null;const t=String(str).match(TIME_RE);return d+(t?`T${String(t[1]).padStart(2,'0')}:${t[2]}:00`:'T00:00:00');}
/* Merge canonical labels with the profile's own synonyms (profile wording first, longest first). */
function labelSet(profile){
  const out={};const keys=new Set([...Object.keys(CUST.CANONICAL_LABELS),...Object.keys(profile.labels||{})]);
  for(const k of keys){const own=(profile.labels||{})[k]||[],base=CUST.CANONICAL_LABELS[k]||[];out[k]=[...new Set([...own,...base])].sort((a,b)=>b.length-a.length);}
  return out;
}
const COL_KEYS=['colFowj','colHieb','colLos','colPolter','colPos','colQty','colPieces','colSpecies','colAssortment','colLength','colGrade','colCoords','colCoordX','colCoordY','colNote'];
function matchLabel(cell,synonyms){
  const c=String(cell||'').trim();if(!c)return null;
  for(const syn of synonyms){const re=new RegExp('^'+esc(syn)+'(?:\\s*:|\\.(?=\\s|$)|(?=\\s|$))\\s*(.*)$','i');const m=c.match(re);if(m)return {label:syn,rest:m[1].trim()};}
  return null;
}
function anyLabel(cell,labels,keys){for(const k of keys){const m=matchLabel(cell,labels[k]);if(m)return {key:k,...m};}return null;}
/* ---------- Page classification ---------- */
function classifyPage(pg,profile,index,pages){
  const text=pg.lines.join('\n'),first=pg.lines.slice(0,12).join('\n');const sig=[];let cls='other',conf=0.6;
  if(pg.kind==='map'){return {cls:'map',confidence:0.95,signals:['Bildseite']};}
  if(/Werkseingangsschein|Wiegeschein|Eingangsschein|Wiegenummer/i.test(text)){return {cls:'mill_ticket',confidence:0.93,signals:['Werksbeleg-Schlüsselwort']};}
  const blanks=(text.match(/_{4,}|\|_\|/g)||[]).length;
  if(/^Lieferschein\b/m.test(first)&&blanks>=4){return {cls:'delivery_note_form',confidence:0.9,signals:['Lieferschein + leere Felder ('+blanks+')']};}
  if(/Abfuhrmeldung|Fertigmeldung|Abfuhrbericht/i.test(first)&&(/Fuhre\s*Nr/i.test(text)||(/\bSoll:/.test(text)&&/Differenz/.test(text)))){return {cls:'collection_report_form',confidence:0.9,signals:['Abfuhrmeldung/Fertigmeldung-Formular']};}
  const typeHit=[...ORDER_TYPES,...(profile.documentTypes||[])].find(t=>new RegExp('(^|[\\n\\t])\\s*'+esc(t)+'\\b','i').test(text));
  const tableHit=pg.lines.some(l=>headerColumns(l).count>=3);
  if(typeHit&&/Änderung|Storno|storniert|ersetzt|geändert/i.test(first)){sig.push('Änderungshinweis');cls='amendment';conf=0.85;}
  else if(typeHit||tableHit){cls='order';conf=typeHit&&tableHit?0.95:0.82;sig.push(typeHit?'Belegart „'+typeHit+'“':'Poltertabelle');}
  else if(index>0&&pages.slice(0,index).some(p=>p._cls==='order'||p._cls==='amendment')&&(/Polterinfo|Sortenzusammenfassung|Seite \d+ von \d+|Partie-Nr/i.test(text)||pg.lines.some(l=>l.length>80))){cls='order_continuation';conf=0.8;sig.push('Folgeseite');}
  if(pg.lines.length<=3&&/Hieb-?\s*\/\s*Losnummer|Maßstab/i.test(text)){cls='map';conf=0.85;sig.push('Kartenbeschriftung');}
  return {cls,confidence:conf,signals:sig};
}
function headerColumns(line){
  const cs=cells(line);const cols=[];let count=0;
  cs.forEach((c,i)=>{if(!c)return;for(const k of COL_KEYS){if(CUST.CANONICAL_LABELS[k].some(s=>cleanLabel(s).toLowerCase()===cleanLabel(c).toLowerCase())){cols[i]=k;count++;return;}}});
  return {cols,count,cells:cs};
}
/* ---------- Key/value extraction ---------- */
function F(value,raw,page,line,cell,confidence,source,extra){return Object.assign({value,raw,page,line,cell:cell==null?null:cell,confidence:Math.round(confidence*100)/100,source},extra||{});}
const VALUE_KIND={documentNumber:'ref',partieNo:'ref',kaufNo:'ref',orderLos:'ref',polterNo:'ref',windowFrom:'date',windowTo:'date',documentDate:'date',issuer:'party',carrier:'party',destination:'party',pickupAddress:'party'};
const kindOk=(k,v)=>{const kind=VALUE_KIND[k]||'text';if(!v)return true;if(kind==='ref')return /\d/.test(v)&&v.split(/\s+/).length<=4;if(kind==='date')return hasDate(v);return true;};
const SKIP_KV=new Set(['totals','lotSummary','breakdown','tableStart','colFowj','colHieb','colLos','colPolter','colPos','colQty','colPieces','colSpecies','colAssortment','colLength','colGrade','colCoords','colCoordX','colCoordY','colNote']);
function extractKV(pg,labels,profile,used){
  const fields={};const keys=Object.keys(labels).filter(k=>!SKIP_KV.has(k));const src=pg.kind==='scan'?'ocr':'text';const base=pg.kind=='scan'?(pg.ocrConfidence||0.85):0.97;
  const isLabelCell=c=>!!anyLabel(c,labels,keys);const isStopCell=c=>isLabelCell(c)||!!anyLabel(c,labels,['tableStart','totals','lotSummary','breakdown']);
  const lineIsLabelsOnly=l=>{const cs=nonEmpty(l);return cs.length>0&&cs.every(c=>{const m=anyLabel(c,labels,keys);return m&&!m.rest;});};
  const add=(k,f)=>{(fields[k]=fields[k]||[]).push(f);};
  for(let li=0;li<pg.lines.length;li++){
    if(used.has(li))continue;const cs=cells(pg.lines[li]);
    for(let ci=0;ci<cs.length;ci++){
      const m=anyLabel(cs[ci],labels,keys);if(!m)continue;
      let value=m.rest,conf=base,cellRef=ci,lineRef=li;
      if(!value){ // same line, following cells
        const rest=[];for(let cj=ci+1;cj<cs.length;cj++){if(!cs[cj])continue;if(isLabelCell(cs[cj]))break;rest.push(cs[cj]);}
        if(rest.length){value=rest.join(' ');conf=base*0.97;}
      }
      if(!value&&nonEmpty(pg.lines[li]).length>=2&&lineIsLabelsOnly(pg.lines[li])&&li+1<pg.lines.length&&!lineIsLabelsOnly(pg.lines[li+1])){ // columnar labels → values below
        const below=cells(pg.lines[li+1]);const labelIdx=nonEmpty(pg.lines[li]).indexOf(cs[ci]);const v=below.filter(Boolean)[labelIdx]||below[ci]||'';
        if(v&&!isLabelCell(v)){value=v;conf=base*0.9;lineRef=li+1;cellRef=labelIdx;
          const third=li+2<pg.lines.length?cells(pg.lines[li+2]).filter(Boolean):[];if(third.length&&third.every(t=>/^[+\d][\d\s()\/-]{6,}$/.test(t))){value+=' · '+(third[labelIdx]||'');used.add(li+2);}
          used.add(li+1);}
      }
      if(!value&&(VALUE_KIND[m.key]||'text')==='ref'&&li+1<pg.lines.length&&!used.has(li+1)&&nonEmpty(pg.lines[li+1]).length<=2){ // reference printed on the line below its label
        const v=(cells(pg.lines[li+1])[ci]||'').trim();if(v&&!isStopCell(v)&&kindOk(m.key,v)&&!hasDate(v)){value=v;conf=base*0.85;lineRef=li+1;cellRef=ci;}
      }
      if(value&&!kindOk(m.key,value)){value='';}
      if(!value&&cs.filter(Boolean).length===1&&(VALUE_KIND[m.key]||'text')!=='date'){ // label alone → block below (address boxes)
        const block=[];for(let lj=li+1;lj<pg.lines.length&&block.length<3;lj++){const l=pg.lines[lj];if(!l.trim())break;const cj=cells(l);if(cj.some(isStopCell)||headerColumns(l).count>=3)break;block.push(cj.filter(Boolean).join(' '));used.add(lj);}
        if(block.length){const v=block.join(', ');if(kindOk(m.key,v)){value=v;conf=base*0.88;lineRef=li+1;}else{for(let lj=li+1;lj<=li+block.length;lj++)used.delete(lj);}}
      }
      if(['windowFrom','windowTo'].includes(m.key)&&value&&!hasDate(value))continue;
      if(!value&&!['freightRate','destination','kaufNo','partieNo','remark','paymentTerms','windowTo'].includes(m.key))continue;
      add(m.key,F(value||'',cs[ci]+(value?' → '+value:''),pg.n,lineRef,cellRef,value?conf:base*0.8,src,{label:m.label,empty:!value}));
    }
  }
  return fields;
}
/* ---------- Stack tables ---------- */
function parseTable(pg,labels,profile,used){
  const dec=profile.decimal||'de',src=pg.kind==='scan'?'ocr':'text',base=pg.kind==='scan'?(pg.ocrConfidence||0.85):0.97;
  const out={stacks:[],totals:[],lots:[],codes:[],header:null,positions:[],slots:[]};
  let hi=-1,header=null;
  for(let li=0;li<pg.lines.length;li++){const h=headerColumns(pg.lines[li]);if(h.count>=3||(h.count>=2&&h.cols.includes('colQty'))){hi=li;header=h;break;}}
  // loading slots (pellet plant): "Ladenummern: Montag: 0727603001" + following weekday lines
  for(let li=0;li<pg.lines.length;li++){const cs=cells(pg.lines[li]);const m=anyLabel(cs[0],labels,['loadingSlots']);if(!m)continue;
    let lj=li;while(lj<pg.lines.length){const cj=cells(pg.lines[lj]).filter(Boolean);const wd=cj.find(c=>WEEKDAYS.some(w=>c.toLowerCase().startsWith(w.toLowerCase())));if(lj>li&&!wd)break;if(wd){const idx=cj.indexOf(wd);const num=cj[idx+1]||'';if(/^\d{6,}$/.test(num)){out.slots.push({weekday:cleanLabel(wd),ladenummer:num,page:pg.n,line:lj,confidence:base,source:src});used.add(lj);}}lj++;}
  }
  if(hi<0)return out;
  used.add(hi);out.header={line:hi,cols:header.cols};
  const colIdx=k=>header.cols.indexOf(k);
  const qtyHeaderUnit=(()=>{const c=header.cells[colIdx('colQty')]||'';const m=c.match(/\b(fm|rm|m³|ldg)\b/i);return m?U.parseUnit(m[1]):null;})();
  const defUnit=qtyHeaderUnit||profile.units.quantity||null;
  let mode='rows',lastStack=null;
  for(let li=hi+1;li<pg.lines.length;li++){
    if(used.has(li))continue;const raw=pg.lines[li];const cs=cells(raw);const ne=cs.filter(Boolean);if(!ne.length)continue;
    const first=ne[0];
    const lot=anyLabel(first,labels,['lotSummary']);const tot=!lot&&anyLabel(first,labels,['totals']);const brk=anyLabel(first,labels,['breakdown']);
    if(brk){mode='breakdown';used.add(li);continue;}
    if(lot){mode=/Sortenzusammenfassung/i.test(first)?'codes':'lots';used.add(li);const q=ne.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit);if(q)out.lots.push({label:first,qty:q,page:pg.n,line:li});continue;}
    if(tot){used.add(li);let q=ne.slice(1).map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit)||null;let pieces=ne.slice(1).map(c=>/^\d+$/.test(c)?+c:null).find(x=>x!=null)??null;
      if(!q){const bare=ne.slice(1).map(c=>U.parseQuantity(c,dec)).find(x=>x&&!x.unit);if(bare)q={value:bare.value,unit:defUnit,raw:bare.raw,unitAssumed:true};}
      if(!q&&li+1<pg.lines.length){const nx=cells(pg.lines[li+1]).filter(Boolean);q=nx.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit)||null;if(q){pieces=nx.map(c=>/^\d+$/.test(c)?+c:null).find(x=>x!=null)??pieces;used.add(li+1);}}
      if(tot.rest){const r=U.parseQuantity(tot.rest,dec);if(r&&r.unit)q=r;}
      if(q)out.totals.push({label:cleanLabel(first),qty:q,pieces,page:pg.n,line:li,raw:raw.trim()});mode='after-total';continue;}
    if(/^Seite \d+|^Partie-Nr|^Druck vom|^Regensburg|^Datum,|^abfuhr32|^Transportauftrag unterschrieben/i.test(first))break;
    if(mode==='breakdown'){
      const q=ne.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit);const looksRow=header.cols.includes('colPolter')&&ne.length>=4&&!/%/.test(raw)&&q&&ne.indexOf(q.raw)>=2;
      if(!looksRow&&q){const share=ne.find(c=>/%/.test(c))||null;if(lastStack)lastStack.breakdown.push({ref:ne[0],code:ne[1]&&!/%/.test(ne[1])&&ne[1]!==q.raw?ne[1]:null,share,qty:q,page:pg.n,line:li,raw:raw.trim()});used.add(li);continue;}
      mode='rows';
    }
    if(mode==='lots'){const q=ne.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit);if(q){const ints=ne.filter(c=>/^\d{2,4}$/.test(c)&&c!==q.raw);const pieces=ne.slice(ne.indexOf(q.raw)+1).map(c=>/^\d+$/.test(c)?+c:null).find(x=>x!=null)??null;const ref={};const order=['colFowj','colHieb','colLos'].filter(k=>header.cols.includes(k));order.forEach((k,i)=>{if(ints[i]!=null)ref[k.slice(3).toLowerCase()]=ints[i];});out.lots.push({ref,qty:q,pieces,pct:ne.find(c=>/%/.test(c))||null,page:pg.n,line:li,raw:raw.trim()});used.add(li);continue;}}
    if(mode==='codes'){const q=ne.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit);if(q&&ne.length<=4){out.codes.push({code:ne.slice(0,ne.indexOf(q.raw)).join(' ')||ne[0],qty:q,page:pg.n,line:li});used.add(li);continue;}}
    if(mode==='after-total'){mode='rows';}
    // a stack row
    const row=rowToStack(cs,ne,header,defUnit,dec,pg,li,base,src,profile);
    if(row){ // reports often print Fowj/Hieb/Los only on the first row of a group: inherit the context, flagged
      if(lastStack&&!row.refs.hieb&&!row.refs.los&&(lastStack.refs.hieb||lastStack.refs.los)&&(row.refs.polter||row.refs.pos)){for(const k of ['fowj','hieb','los'])if(!row.refs[k]&&lastStack.refs[k])row.refs[k]=lastStack.refs[k];row.refs.inherited=true;row.confidence=Math.round(row.confidence*0.95*100)/100;}
      out.stacks.push(row);lastStack=row;used.add(li);}
  }
  // "Pos." tables (BaySF): rows are positions of one Polter named in the header fields
  if(header.cols.includes('colPos')&&!header.cols.includes('colPolter')){out.positions=out.stacks;out.stacks=[];}
  return out;
}
function rowToStack(cs,ne,header,defUnit,dec,pg,li,base,src,profile){
  const get=k=>{const i=header.cols.indexOf(k);return i>=0&&i<cs.length?cs[i]:'';};
  const positional=cs.length===header.cols.length||cs.length===header.cells.length;
  let refs={},qty=null,pieces=null,species='',assortment='',lengthM=null,grade='',coordX='',coordY='',note='',orderLos='';
  if(positional){
    refs={fowj:get('colFowj'),hieb:get('colHieb'),los:get('colLos'),polter:get('colPolter'),pos:get('colPos')};
    const firstCell=cs[0];if(header.cols[0]==null&&/^\d{3}_\d{3}$|^\d{4}\/\d{1,3}$/.test(firstCell))orderLos=firstCell;
    const qc=get('colQty');qty=U.parseQuantity(qc,dec);if(qty&&!qty.unit)qty.unit=defUnit;
    const pc=get('colPieces');pieces=/^\d+$/.test(pc)?+pc:null;species=get('colSpecies');assortment=get('colAssortment');const lc=get('colLength');lengthM=lc?U.parseNumber(lc.replace(/\s*m$/,''),dec):null;grade=get('colGrade');coordX=get('colCoordX')||get('colCoords');coordY=get('colCoordY');note=get('colNote');
  } else { // type heuristics
    const q=ne.map(c=>({c,q:U.parseQuantity(c,dec)})).find(x=>x.q&&x.q.unit);if(!q)return null;qty=q.q;
    const ints=ne.filter(c=>/^\d{1,4}$/.test(c)&&c!==q.c);const order=['colFowj','colHieb','colLos','colPolter','colPos'].filter(k=>header.cols.includes(k));
    order.forEach((k,i)=>{refs[k.slice(3).toLowerCase()]=ints[i]||'';});pieces=ints[order.length]!=null?+ints[order.length]:null;
    species=ne.find(c=>CUST.SPECIES[c])||'';coordX=ne.find(c=>/[°º]/.test(c))||'';coordY=ne.filter(c=>/[°º]/.test(c))[1]||'';
  }
  if(!qty&&pieces==null)return null;
  const hasRef=Object.values(refs).some(Boolean)||orderLos;if(!hasRef)return null;
  const sp=species?(CUST.SPECIES[species]||null):null;
  const stack={tempKey:null,kind:'roadside',refs:Object.assign({orderLos},refs),timber:{species:F(sp||species||null,species,pg.n,li,header.cols.indexOf('colSpecies'),species?base*(sp?1:0.8):0,src),assortment:F(assortment||null,assortment,pg.n,li,header.cols.indexOf('colAssortment'),assortment?base:0,src),lengthM:F(lengthM,get('colLength'),pg.n,li,header.cols.indexOf('colLength'),lengthM!=null?base:0,src),grade:F(grade||null,grade,pg.n,li,header.cols.indexOf('colGrade'),grade?base*0.9:0,src)},
    planned:qty?F(qty.value,qty.raw,pg.n,li,header.cols.indexOf('colQty'),base*(qty.unit?1:0.7),src,{unit:qty.unit}):F(null,'',pg.n,li,null,0,src,{unit:defUnit}),
    pieces:F(pieces,get('colPieces'),pg.n,li,header.cols.indexOf('colPieces'),pieces!=null?base:0,src),
    coords:{xRaw:coordX,yRaw:coordY,page:pg.n,line:li,parsed:null},breakdown:[],note,page:pg.n,line:li,confidence:base};
  if(coordX||coordY)stack.coords.parsed=C.parse(coordX,coordY,{region:profile.region||undefined});
  return stack;
}
/* ---------- Instructions ---------- */
function extractInstructions(pages,used){
  const out=[];for(const pg of pages){if(!['order','order_continuation','amendment'].includes(pg._cls))continue;pg.lines.forEach((l,li)=>{if(used.get(pg.n)&&used.get(pg.n).has(li))return;const t=l.replace(/\t/g,' ').trim();if(t.length>=55&&t.split(/\s+/).length>=8&&/[.!]/.test(t)&&!/\b\d{5}\b/.test(t)&&!/^Transportauftrag unterschrieben/.test(t)){out.push(F(t,t,pg.n,li,null,0.9,pg.kind==='scan'?'ocr':'text',{restricted:/Skonto|Zahlungsziel|Gutschrift|Frachtkosten|Preis|Standgeld/i.test(t)}));}});}
  return out;
}
/* ---------- Mill tickets ---------- */
function extractTicket(pg,profileDecimal){
  const dec=profileDecimal||'de',labels={};for(const [k,v] of Object.entries(CUST.MILL_LABELS))labels[k]=[...v].sort((a,b)=>b.length-a.length);
  const fields={};const add=(k,v,li,ci)=>{(fields[k]=fields[k]||[]).push(F(v,cells(pg.lines[li])[ci],pg.n,li,ci,0.95,'text'));};
  let measured=[];let weigh={};
  pg.lines.forEach((l,li)=>{const cs=cells(l);
    if(/^Holzart\b/.test(cs[0]||'')&&cs.some(c=>/Menge/.test(c))){for(let lj=li+1;lj<pg.lines.length;lj++){const r=cells(pg.lines[lj]).filter(Boolean);const q=r.map(c=>U.parseQuantity(c,dec)).find(x=>x&&x.unit);if(!q)break;measured.push({species:CUST.SPECIES[r[0]]||r[0],assortment:r[1]||null,lengthM:U.parseNumber((r[2]||'').replace(/\s*m$/,''),dec),qty:q,method:r[4]||null,page:pg.n,line:lj});}return;}
    cs.forEach((c,ci)=>{const m=anyLabel(c,labels,Object.keys(labels));if(!m)return;let v=m.rest;if(!v){for(let cj=ci+1;cj<cs.length;cj++){if(cs[cj]){if(anyLabel(cs[cj],labels,Object.keys(labels)))break;v=cs[cj];break;}}}
      if(['gross','tare','net'].includes(m.key)){const cands=[m.rest,...cs.slice(ci+1)].filter(Boolean);const q=cands.map(x=>U.parseQuantity(x,dec)).find(x=>x&&x.unit);if(q)weigh[m.key]=q;return;}
      add(m.key,v||'',li,ci);});
  });
  const g=k=>fields[k]&&fields[k][0]?fields[k][0].value:'';
  const millLine=pg.lines[0]||'';
  return {ticketNo:g('ticketNo'),deliveryNoteRef:g('deliveryNoteRef'),vehicleReg:g('vehicleReg'),arrivedAt:parseDateTime(g('arrival')),unloadedAt:parseDateTime(g('unloaded')),millName:cells(millLine)[0]||'',weighbridge:Object.keys(weigh).length?weigh:null,measuredLines:measured,acceptance:/abgelehnt/i.test(g('acceptance'))?'rejected':/teil/i.test(g('acceptance'))?'partial':'accepted',deductions:g('deductions'),orderRef:g('orderRef'),fields,page:pg.n};
}
/* ---------- Main ---------- */
function resolveProfile(doc,profiles){
  const domain=(doc.sender||'').split('@')[1]||'';let p=profiles.find(x=>x.senderDomains.includes(domain));
  if(!p){const first=(doc.attachments[0]?.pages[0]?.lines||[]).slice(0,8).join('\n');p=profiles.find(x=>x.letterhead.some(h=>h&&first.includes(h)));}
  return p||profiles.find(x=>x.id==='unknown');
}
function extractDocument(doc,ctx={}){
  const profiles=ctx.profiles||CUST.PROFILES;const profile=resolveProfile(doc,profiles);const labels=labelSet(profile);const now=ctx.now?new Date(ctx.now):new Date();
  const pages=doc.attachments.flatMap(a=>a.pages.map(p=>Object.assign({},p,{attachment:a.name})));
  pages.forEach((pg,i)=>{const c=classifyPage(pg,profile,i,pages);pg._cls=c.cls;pg._conf=c.confidence;pg._signals=c.signals;});
  const exceptions=[];const ex=(code,severity,scope,message,extra)=>exceptions.push(Object.assign({id:code+'-'+(exceptions.length+1),code,severity,scope,message},extra||{}));
  const result={profileId:profile.id,partyId:profile.partyId,contentHash:contentHash(doc),pages:pages.map(p=>({n:p.n,kind:p.kind,cls:p._cls,confidence:p._conf,signals:p._signals,attachment:p.attachment})),orders:[],tickets:[],exceptions};
  // duplicates / amendments against the existing inbox
  const existing=(ctx.existingDocs||[]).filter(d=>d.id!==doc.id);
  const hasText=pages.some(p=>p.lines.length);const dup=hasText?existing.find(d=>d.contentHash===result.contentHash):null; // text-less scans cannot be compared by content
  if(dup){result.duplicateOf=dup.id;ex('E-DUP','info','document',`Exakte Wiederholung von ${dup.id} (${dup.subject||''}) — keine neue Arbeit angelegt`,{ref:dup.id});}
  const orderPages=pages.filter(p=>['order','amendment'].includes(p._cls)),contPages=pages.filter(p=>p._cls==='order_continuation'),mapPages=pages.filter(p=>p._cls==='map'),formPages=pages.filter(p=>['delivery_note_form','collection_report_form'].includes(p._cls));
  const used=new Map();const usedFor=pg=>{if(!used.has(pg.n))used.set(pg.n,new Set());return used.get(pg.n);};
  for(const pg of pages){if(pg.kind==='scan')ex('E-SCAN',pg.lines.length?'info':'block','document',pg.lines.length?`Seite ${pg.n} ist ein Scan — Textebene aus OCR-Nachbildung (Konfidenz ${Math.round((pg.ocrConfidence||0.85)*100)} %), Vollprüfung empfohlen`:`Seite ${pg.n} ist ein Scan ohne Text — manuell erfassen`,{page:pg.n});}
  for(const pg of formPages)ex('E-BLANKFORM','info','document',pg._cls==='delivery_note_form'?`Seite ${pg.n}: leeres Lieferschein-Formular — Begleitmaterial, kein zweiter Auftrag und kein Liefernachweis`:`Seite ${pg.n}: Abfuhrmeldung-/Fertigmeldung-Formular — Vorlage für den Bericht, kein Auftrag`,{page:pg.n});
  for(const pg of mapPages)ex('E-MAP','info','document',`Seite ${pg.n}: Kartenseite — Bildnachweis, keine automatische Koordinatenquelle`,{page:pg.n});
  if((ctx.reviewedCount??profile.reviewedDocuments)===0&&orderPages.length)ex('E-NEWCUST','info','document',`Erstes Dokument von „${profile.name}“ — Vollprüfung aller Felder`);
  if(orderPages.length){
    const pg=orderPages[0];const u=usedFor(pg);
    const table=parseTable(pg,labels,profile,u);const kv=extractKV(pg,labels,profile,u);
    for(const cp of contPages){const u2=usedFor(cp);const t2=parseTable(cp,labels,profile,u2);table.stacks.push(...t2.stacks);table.totals.push(...t2.totals);table.lots.push(...t2.lots);table.codes.push(...t2.codes);const kv2=extractKV(cp,labels,profile,u2);for(const [k,v] of Object.entries(kv2)){if(['contact','remark','paymentTerms','certification','partieNo','kaufNo'].includes(k))(kv[k]=kv[k]||[]).push(...v);}}
    const first=k=>(kv[k]||[]).find(f=>!f.empty)||(kv[k]||[])[0]||null;
    const src=pg.kind==='scan'?'ocr':'text';
    // document type: a line equal to a known type within the first lines
    let docType=null;pg.lines.slice(0,10).forEach((l,li)=>{if(docType)return;cells(l).forEach((c,ci)=>{if(docType||!c)return;const hit=[...(profile.documentTypes||[]),...ORDER_TYPES].find(x=>new RegExp('^'+esc(x)+'\\b','i').test(c));if(hit)docType=F(hit,c,pg.n,li,ci,0.95,src);});});
    let docNo=first('documentNumber');
    if(docNo&&!docNo.value&&docType){const li=docType.line+1;const v=(pg.lines[li]||'').trim();if(v&&!anyLabel(cells(v)[0],labels,Object.keys(labels)))docNo=F(v,v,pg.n,li,0,0.9,src,{label:docNo.label});}
    if(docType&&!docNo&&/Nr\.?\s*\S+/.test(docType.raw)){const m=docType.raw.match(/Nr\.?\s*(\S+)/);docNo=F(m[1],docType.raw,pg.n,docType.line,0,0.95,src,{label:'Nr.'});}
    const order={tempId:'ORD-'+result.contentHash,documentType:docType,documentNumber:docNo?Object.assign({},docNo,{normalized:String(docNo.value||'').replace(/\s+/g,'').replace(/^(\d+)\.(\d{3})$/,'$1$2')}):null,
      issuer:first('issuer'),carrier:first('carrier'),destination:first('destination'),pickupAddress:first('pickupAddress'),
      references:{partieNo:first('partieNo'),kaufNo:first('kaufNo'),orderLos:first('orderLos'),polterNo:first('polterNo'),other:(kv.reference||[])},
      window:{from:null,to:null,raw:null},measurementBasis:first('measurementBasis'),assortmentHeader:first('assortmentHeader'),
      restricted:{freightRate:first('freightRate'),paymentTerms:first('paymentTerms')},certification:first('certification'),priority:first('priority'),
      remarks:(kv.remark||[]),contacts:(kv.contact||[]),instructions:extractInstructions([pg,...contPages],used),
      stacks:[],summaries:{totals:table.totals,lots:table.lots,codes:table.codes},mapPages:mapPages.map(p=>p.n),formPages:formPages.map(p=>({n:p.n,cls:p._cls})),pageNo:pg.n,quantityTotal:first('quantityTotal'),kind:'roadside'};
    // collection window
    const wf=(kv.windowFrom||[]).filter(f=>f.value),wt=(kv.windowTo||[]).filter(f=>f.value);
    const dates=[];for(const f of wf)for(const d of parseDates(f.value))dates.push({d,f,role:'from'});for(const f of wt)for(const d of parseDates(f.value))dates.push({d,f,role:'to'});
    if(dates.length){const fromF=dates.find(x=>x.role==='from'),toF=dates.filter(x=>x.role==='to').pop()||(dates.filter(x=>x.role==='from')[1]||null);
      let from=fromF?fromF.d:null,to=toF?toF.d:null;if(from&&to&&from>to){[from,to]=[to,from];ex('E-WINDOW','info','order',`Abfuhrzeitraum im Text in umgekehrter Reihenfolge („${fromF.f.value}“) — als ${fmtDate(from)} bis ${fmtDate(to)} gelesen`);}
      order.window={from,to,raw:[...new Set(dates.map(x=>x.f.value))].join(' · '),page:(fromF||toF).f.page,line:(fromF||toF).f.line};
      if(to&&new Date(to)<now)ex('E-WINDOW','warn','order',`Abfuhrende ${fmtDate(to)} liegt in der Vergangenheit`);
      if(from&&!to)ex('E-WINDOW','warn','order','Nur ein Datum gedruckt — Abfuhrende fehlt');
    } else ex('E-WINDOW','warn','order','Kein Abfuhrzeitraum gedruckt — mit dem Kunden klären');
    // stacks
    const hdrRefs=order.references;
    if(table.stacks.length){
      for(const s of table.stacks){s.kind='roadside';s.tempKey=[s.refs.orderLos||hdrRefs.orderLos?.value||hdrRefs.partieNo?.value||'',s.refs.hieb||'',s.refs.los||'',s.refs.polter||s.refs.pos||''].filter(Boolean).join('/');order.stacks.push(s);}
    } else if(table.positions.length&&hdrRefs.polterNo&&hdrRefs.polterNo.value){
      const p0=table.positions[0];const sumQ=U.sum(table.positions.map(p=>p.planned.value!=null?{value:p.planned.value,unit:p.planned.unit}:null));const q=sumQ[0]||{value:null,unit:null};
      const st={tempKey:hdrRefs.polterNo.value,kind:'roadside',refs:{polter:hdrRefs.polterNo.value,orderLos:''},timber:p0.timber,planned:F(q.value,order.quantityTotal?order.quantityTotal.raw:'',pg.n,hdrRefs.polterNo.line,null,0.9,src,{unit:q.unit}),pieces:F(null,'',pg.n,p0.line,null,0,src),coords:{xRaw:'',yRaw:'',page:pg.n,line:hdrRefs.polterNo.line,parsed:null},breakdown:table.positions.map(p=>({ref:p.refs.pos,code:[p.timber.species.value,p.timber.assortment.value,p.timber.lengthM.value!=null?p.timber.lengthM.value+' m':null].filter(Boolean).join(' · '),share:null,qty:{value:p.planned.value,unit:p.planned.unit,raw:p.planned.raw},page:p.page,line:p.line,raw:'Pos. '+p.refs.pos})),note:'',page:pg.n,line:hdrRefs.polterNo.line,confidence:0.9};
      order.stacks.push(st);
    } else if(table.slots.length||order.pickupAddress){
      order.kind='industrial';const total=order.quantityTotal?U.parseQuantity(order.quantityTotal.value,profile.decimal):null;const n=table.slots.length||1;const each=total&&total.value!=null&&Number.isInteger(total.value/n)?total.value/n:null;
      const slots=table.slots.length?table.slots:[{weekday:null,ladenummer:null,page:pg.n,line:order.pickupAddress?order.pickupAddress.line:0,confidence:0.8,source:src}];
      for(const sl of slots){order.stacks.push({tempKey:sl.ladenummer||'ABHOLUNG',kind:'industrial',refs:{ladenummer:sl.ladenummer,weekday:sl.weekday,orderLos:''},timber:{species:F(null,'',pg.n,sl.line,null,0,src),assortment:F(order.assortmentHeader?order.assortmentHeader.value:null,order.assortmentHeader?order.assortmentHeader.raw:'',pg.n,order.assortmentHeader?order.assortmentHeader.line:sl.line,null,order.assortmentHeader?0.9:0,src),lengthM:F(null,'',pg.n,sl.line,null,0,src),grade:F(null,'',pg.n,sl.line,null,0,src)},planned:F(each,total?total.raw:'',pg.n,order.quantityTotal?order.quantityTotal.line:sl.line,null,each!=null?0.9:0.5,src,{unit:total?total.unit:null,derivedFromTotal:true}),pieces:F(null,'',pg.n,sl.line,null,0,src),coords:{xRaw:'',yRaw:'',page:pg.n,line:sl.line,parsed:null,address:order.pickupAddress?order.pickupAddress.value:null},breakdown:[],note:'',page:pg.n,line:sl.line,confidence:sl.confidence});}
      if(total&&total.value!=null&&table.slots.length&&total.value!==table.slots.length)ex('E-UNIT','warn','order',`Menge ${order.quantityTotal.value} und ${table.slots.length} Ladenummern passen nicht zusammen`);
      const cap=(order.remarks||[]).map(r=>r.value).join(' ').match(/\((\d+)\s*m³\)/);if(cap)ex('E-UNIT','info','order',`Fahrzeugkapazität ${cap[1]} m³ ist nicht die bestellte Menge (${order.quantityTotal?order.quantityTotal.value:'–'})`);
    }
    // identity, references
    if(!order.documentNumber||!order.documentNumber.value){const bc=pg.lines.find(l=>/^\$[A-Z]{2}\$\d+/.test(l.trim()));ex('E-NOID','warn','order','Keine Kundenauftragsnummer gedruckt — interne Referenz wird vergeben, keine Kundenreferenz erfunden'+(bc?` (Barcode „${bc.trim()}“ als Rohreferenz gespeichert)`:''));if(bc)order.references.other.push(F(bc.trim(),bc.trim(),pg.n,pg.lines.indexOf(bc),0,0.7,src,{label:'Barcode'}));}
    if(!order.destination||!order.destination.value){const hint=formPages.flatMap(p=>p.lines.map((l,li)=>({l,li,p}))).find(x=>/Empfänger\s*\/\s*Zielwerk/i.test(x.l));let msg='Zielwerk/Empfänger nicht gedruckt — Ziel vor der Freigabe bestätigen';if(hint){const m=hint.l.match(/Empfänger\s*\/\s*Zielwerk:?\s*\t?([^\t]+)/i);let v=m?m[1].trim():'';if(!v||/:$/.test(v)){const idx=cells(hint.l).findIndex(c=>/Empfänger\s*\/\s*Zielwerk/i.test(c));v=(cells(hint.p.lines[hint.li+1]||'')[idx]||'').trim();}if(v&&!/:$/.test(v))msg+=` (Seite ${hint.p.n} nennt „${v}“ — identisch mit dem Auftraggeber? Keine automatische Übernahme)`;}ex('E-DEST','warn','order',msg);}
    if(!order.issuer||!order.issuer.value){const lh=profile.letterhead.find(h=>pg.lines.slice(0,6).join('\n').includes(h));if(lh)order.issuer=F(profile.name,lh,pg.n,pg.lines.findIndex(l=>l.includes(lh)),0,0.85,src,{label:'Briefkopf'});}
    if(!order.carrier||!order.carrier.value)ex('E-CARRIER','info','order','Frachtführer nicht gedruckt — Zustellung an unseren Posteingang gilt als Adressierung');
    const restrictedFound=Object.entries(order.restricted).filter(([,f])=>f).map(([k,f])=>k+(f.value?'':' (Feld leer)'));const ri=order.instructions.filter(i=>i.restricted).length;
    if(restrictedFound.length||ri)ex('E-RESTRICTED','info','order',`Kommerzielle Angaben erkannt (${[...restrictedFound,ri?ri+' Zeile(n) Konditionen':null].filter(Boolean).join(', ')}) — für Fahrer verborgen, in Fahrerauszügen geschwärzt`);
    // totals vs lines
    const tol=(ctx.tolerancePct??0.5)/100;
    const sums=U.sum(order.stacks.map(s=>s.planned.value!=null?{value:s.planned.value,unit:s.planned.unit}:null));const piecesSum=order.stacks.reduce((a,s)=>a+(s.pieces.value||0),0);
    for(const t of order.summaries.totals){const s=sums.find(x=>x.unit===t.qty.unit);if(!s)continue;const diff=Math.round((t.qty.value-s.value)*1000)/1000;if(Math.abs(diff)>0.0051){const beyond=Math.abs(diff)>tol*t.qty.value;ex('E-TOTAL',beyond?'warn':'info','order',`„${t.label}“ ${U.formatQty(t.qty.value,t.qty.unit)} ≠ Summe der Zeilen ${U.formatQty(s.value,s.unit)} (Differenz ${U.formatQty(diff,s.unit)}${beyond?'':', innerhalb der Toleranz'}) — beide Werte bleiben erhalten, keine stille Korrektur`,{page:t.page,line:t.line,printed:t.qty,computed:s});}
      if(t.pieces!=null&&piecesSum&&t.pieces!==piecesSum)ex('E-TOTAL','warn','order',`„${t.label}“ ${t.pieces} Stück ≠ Summe der Zeilen ${piecesSum} Stück`,{page:t.page,line:t.line});}
    // lot summaries vs lines
    const lotRows=order.summaries.lots.filter(l=>l.ref);if(lotRows.length){const groups={};for(const s of order.stacks){const k=[s.refs.hieb,s.refs.los].join('/');(groups[k]=groups[k]||{qty:0,pieces:0,unit:s.planned.unit}).qty+=s.planned.value||0;groups[k].pieces+=s.pieces.value||0;}
      const problems=[];for(const l of lotRows){const k=[l.ref.hieb,l.ref.los].join('/');const g=groups[k];if(!g){problems.push(`Los ${k} in der Zusammenfassung, aber ohne Zeilen`);continue;}if(Math.abs(g.qty-l.qty.value)>0.0051||(l.pieces!=null&&l.pieces!==g.pieces))problems.push(`Los ${k}: Zusammenfassung ${U.formatQty(l.qty.value,l.qty.unit)}/${l.pieces??'–'} Stück, Zeilen ${U.formatQty(Math.round(g.qty*1000)/1000,g.unit)}/${g.pieces} Stück`);}
      const missing=Object.keys(groups).filter(k=>!lotRows.some(l=>[l.ref.hieb,l.ref.los].join('/')===k));if(missing.length)problems.push(`ohne Lossumme: ${missing.join(', ')}`);
      if(problems.length)ex('E-LOTSUM','warn','order','Lossummen passen nicht zu den Polterzeilen — die Polterzeilen bleiben maßgeblich, die Zusammenfassung bleibt wie gedruckt ('+problems.join('; ')+')');}
    // header length vs line length
    const hl=order.assortmentHeader&&order.assortmentHeader.value?order.assortmentHeader.value.match(/(\d+(?:[.,]\d+)?)\s*m\b|(\d+)m-lang/i):null;
    if(hl){const hLen=U.parseNumber(hl[1]||hl[2],'de');const diff=order.stacks.filter(s=>s.timber.lengthM.value!=null&&Math.abs(s.timber.lengthM.value-hLen)>0.01);if(diff.length)ex('E-LEN','warn','order',`Kopf „${order.assortmentHeader.value}“ (${hLen} m) ≠ Zeilenlänge ${[...new Set(diff.map(s=>s.timber.lengthM.value))].join('/')} m bei Polter ${diff.map(s=>s.refs.polter).join(', ')} — nicht stillschweigend wählen`);}
    // instructions conflict
    const ins=order.instructions.map(i=>i.value).concat(formPages.flatMap(p=>p.lines));if(ins.some(t=>/wöchentlich/i.test(t))&&ins.some(t=>/Monatsende/i.test(t)))ex('E-INSTR','warn','order','Widersprüchliche Meldeintervalle: „wöchentlich“ (Seite 2) und „jeweils am Monatsende“ (Abfuhrmeldung) — beide anzeigen, Klärung mit dem Auftraggeber');
    // per-line checks
    for(const s of order.stacks){
      if(s.kind==='industrial'){if(!s.coords.address)ex('E-COORD-NONE','block','line','Abholadresse fehlt',{stack:s.tempKey});continue;}
      const p=s.coords.parsed;
      if(!s.coords.xRaw&&!s.coords.yRaw){ex(order.mapPages.length?'E-MAP-ONLY':'E-COORD-NONE','block','line',order.mapPages.length?`Polter ${s.tempKey}: keine Koordinate gedruckt — Lage aus Kartenseite ${order.mapPages.join('/')} platzieren und bestätigen`:`Polter ${s.tempKey}: keine Koordinate und keine Karte — Standort erforderlich (Adresse von Revier/Werk wird nicht als Abholort verwendet)`,{stack:s.tempKey});}
      else if(p&&!p.ok){const blocks=p.verdicts.filter(v=>v.level==='block');ex(blocks.some(v=>v.code==='outside-germany'||v.code==='axis-swapped')?'E-COORD-RANGE':'E-COORD-FMT','block','line',`Polter ${s.tempKey}: „${s.coords.xRaw} / ${s.coords.yRaw}“ — ${blocks.map(v=>v.message).join('; ')}`+(p.suggestion?` · Vorschlag: ${p.suggestion.note}`:''),{stack:s.tempKey,suggestion:p.suggestion});}
      else if(p&&p.verdicts.some(v=>v.code==='far-from-region'))ex('E-COORD-RANGE','warn','line',`Polter ${s.tempKey}: ${p.verdicts.find(v=>v.code==='far-from-region').message} — Lage bestätigen`,{stack:s.tempKey});
      if(!s.timber.species.value&&!s.timber.assortment.value)ex('E-SPECIES','info','line',`Polter ${s.tempKey}: Holzart/Sortiment nicht gedruckt`,{stack:s.tempKey});
      if(s.planned.value==null)ex('E-UNIT','warn','line',`Polter ${s.tempKey}: keine Menge lesbar`,{stack:s.tempKey});else if(!s.planned.unit)ex('E-UNIT','warn','line',`Polter ${s.tempKey}: Einheit fehlt — nicht angenommen`,{stack:s.tempKey});
      if(s.pieces.value===0)ex('E-PIECES','info','line',`Polter ${s.tempKey}: Stückzahl 0 laut Dokument — nicht als bestätigte Null gewertet`,{stack:s.tempKey});
    }
    // overlap with other open orders of the same customer
    const existingStacks=ctx.existingStacks||[];for(const s of order.stacks){const key=profile.id+'|'+[s.refs.hieb,s.refs.los,s.refs.polter].join('/');const hit=existingStacks.find(e=>e.key===key&&e.orderDocNo!==(order.documentNumber&&order.documentNumber.normalized));if(hit)ex('E-OVERLAP','warn','line',`Polter ${s.tempKey} erscheint bereits in Auftrag ${hit.orderId} — mögliche Überschneidung, nicht zusammengeführt`,{stack:s.tempKey,ref:hit.orderId});}
    // amendment detection
    if(!dup&&order.documentNumber&&order.documentNumber.normalized){const prev=existing.find(d=>d.profileId===profile.id&&d.documentNumberNormalized===order.documentNumber.normalized&&d.contentHash!==result.contentHash);if(prev){result.amendmentOf=prev.id;ex('E-AMEND','warn','order',`Geänderte Fassung von ${prev.id} („${prev.subject||''}“) — Versionsvorschlag zur Prüfung; erfasste Abholungen bleiben erhalten`,{ref:prev.id});}}
    result.orders.push(order);
  }
  for(const pg of pages.filter(p=>p._cls==='mill_ticket'))result.tickets.push(extractTicket(pg,profile.decimal));
  if(!orderPages.length&&!result.tickets.length&&!dup)ex('E-NOORDER',formPages.length||mapPages.length?'info':'warn','document',formPages.length||mapPages.length?'Nur Begleitmaterial (Karte/Formular) — kein Auftrag angelegt':'Kein Auftrag und kein Werksbeleg erkannt — manuell klassifizieren');
  return result;
}
function fmtDate(iso){if(!iso)return '–';const [y,m,d]=iso.slice(0,10).split('-');return `${d}.${m}.${y}`;}
const api={extractDocument,classifyPage,parseTable,extractKV,extractTicket,parseDates,parseDateTime,contentHash,hash,labelSet,cells,headerColumns,fmtDate,ORDER_TYPES};
(globalThis.TransportCore=globalThis.TransportCore||{}).extract=api;
if(typeof module!=='undefined')module.exports=api;
})();
