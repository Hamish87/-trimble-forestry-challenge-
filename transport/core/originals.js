/* Holztransport demo · original documents. The PDF (or photo) a transport order arrived as stays in the browser:
   IndexedDB when available, memory otherwise. Nothing is uploaded anywhere and nothing is committed to the repository
   (the sample pack contains personal data). Pages are rendered on demand with pdf.js when it is loaded. */
'use strict';
(function(){
const DB='transport-demo-originals',STORE='files';const mem=new Map();
function openDb(){return new Promise((resolve)=>{try{if(typeof indexedDB==='undefined')return resolve(null);const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore(STORE,{keyPath:'docId'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch(e){resolve(null);}});}
async function put(rec){mem.set(rec.docId,rec);const db=await openDb();if(!db)return rec;return new Promise(resolve=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(rec);tx.oncomplete=()=>resolve(rec);tx.onerror=()=>resolve(rec);});}
async function get(docId){if(mem.has(docId))return mem.get(docId);const db=await openDb();if(!db)return null;return new Promise(resolve=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).get(docId);rq.onsuccess=()=>{if(rq.result)mem.set(docId,rq.result);resolve(rq.result||null);};rq.onerror=()=>resolve(null);});}
async function remove(docId){mem.delete(docId);const db=await openDb();if(!db)return;await new Promise(resolve=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(docId);tx.oncomplete=resolve;tx.onerror=resolve;});}
async function list(){const db=await openDb();if(!db)return [...mem.values()].map(meta);return new Promise(resolve=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).getAll();rq.onsuccess=()=>{for(const r of rq.result)mem.set(r.docId,r);resolve(rq.result.map(meta));};rq.onerror=()=>resolve([...mem.values()].map(meta));});}
const meta=r=>({docId:r.docId,name:r.name,size:r.size,type:r.type,pages:r.pages||null,storedAt:r.storedAt});
/* store a File/Blob for a document id; keeps the bytes as an ArrayBuffer */
async function toBuffer(file){if(file instanceof ArrayBuffer)return file;if(typeof file.arrayBuffer==='function')return file.arrayBuffer();if(typeof FileReader!=='undefined')return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error||new Error('Datei nicht lesbar'));r.readAsArrayBuffer(file);});if(typeof file.text==='function')return new TextEncoder().encode(await file.text()).buffer;throw new Error('Datei nicht lesbar');}
async function store(docId,file,extra={}){const data=await toBuffer(file);const rec=Object.assign({docId,name:file.name||'original',size:data.byteLength,type:file.type||'application/pdf',data,storedAt:new Date().toISOString(),pages:null},extra);return put(rec);}
/* render page n of a stored PDF into a canvas with pdf.js (returns null when pdf.js or the record is missing) */
const pdfCache=new Map();
async function pdf(docId){const rec=await get(docId);if(!rec||!globalThis.pdfjsLib||!/pdf/.test(rec.type))return null;if(pdfCache.has(docId))return pdfCache.get(docId);const doc=await globalThis.pdfjsLib.getDocument({data:rec.data.slice(0)}).promise;pdfCache.set(docId,doc);if(!rec.pages){rec.pages=doc.numPages;put(rec);}return doc;}
async function renderPage(docId,n,canvas,maxWidth){const doc=await pdf(docId);if(!doc)return null;const page=await doc.getPage(Math.min(Math.max(1,n),doc.numPages));const base=page.getViewport({scale:1});const scale=Math.min(2,(maxWidth||800)/base.width);const vp=page.getViewport({scale});canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;return {pages:doc.numPages,width:canvas.width,height:canvas.height};}
async function objectUrl(docId){const rec=await get(docId);if(!rec)return null;return URL.createObjectURL(new Blob([rec.data],{type:rec.type}));}
const api={store,get,remove,list,renderPage,pdf,objectUrl,meta};
(globalThis.TransportCore=globalThis.TransportCore||{}).originals=api;
if(typeof module!=='undefined')module.exports=api;
})();
