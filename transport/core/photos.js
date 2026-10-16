/* Holztransport demo · photos. Drivers attach photos to pickups, clearances and problem reports (camera or file,
   downscaled to a JPEG data URL in the browser). For the guided demo run, deterministic SVG illustrations of
   roadside stacks stand in for camera photos; they are clearly drawn, not photographic. */
'use strict';
(function(){
function rng(seed){let s=0;for(const c of String(seed))s=(s*31+c.charCodeAt(0))>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
/* an illustrated stack: logs as circles on a forest-road background; kind: 'stack' | 'cleared' | 'blocked' | 'load' */
function illustration(seed,kind='stack',label=''){
  const r=rng(seed+kind);const W=480,H=320;const logs=kind==='cleared'?0:kind==='load'?14:8+Math.floor(r()*9);const rows=kind==='load'?3:kind==='cleared'?0:2+Math.floor(r()*2);
  let circles='';if(logs){const perRow=Math.ceil(logs/rows);const rad=Math.min(26,Math.floor(300/perRow/2.1));let n=0;for(let y=0;y<rows&&n<logs;y++){for(let x=0;x<perRow&&n<logs;x++,n++){const cx=90+x*rad*2.1+(y%2)*rad+r()*4,cy=(kind==='load'?150:225)-y*rad*1.8;const shade=200+Math.floor(r()*35);circles+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad}" fill="rgb(${shade},${shade-60},${shade-120})" stroke="#5a3a1a" stroke-width="2"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rad*0.55).toFixed(1)}" fill="none" stroke="#8a5a2a" stroke-width="1.5"/>`;}}}
  const trees=Array.from({length:7},(_,i)=>{const x=20+i*70+r()*20,h=70+r()*50;return `<polygon points="${x},${120-h} ${x-22},${125} ${x+22},${125}" fill="#2f6b3a"/><rect x="${x-4}" y="125" width="8" height="18" fill="#5a3a1a"/>`;}).join('');
  const truck=kind==='load'?`<rect x="60" y="170" width="300" height="60" rx="6" fill="#0063a3"/><rect x="330" y="150" width="90" height="80" rx="8" fill="#0b3d6b"/><circle cx="110" cy="245" r="20" fill="#222"/><circle cx="200" cy="245" r="20" fill="#222"/><circle cx="370" cy="245" r="20" fill="#222"/>`:'';
  const barrier=kind==='blocked'?`<rect x="140" y="190" width="200" height="14" fill="#d62f2f"/><rect x="140" y="190" width="200" height="14" fill="url(#stripes)"/><rect x="150" y="204" width="10" height="40" fill="#555"/><rect x="320" y="204" width="10" height="40" fill="#555"/><text x="240" y="178" font-family="Inter,Arial" font-size="18" font-weight="700" fill="#d62f2f" text-anchor="middle">GESPERRT</text>`:'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><pattern id="stripes" width="20" height="14" patternUnits="userSpaceOnUse"><rect width="10" height="14" fill="#fff"/></pattern></defs><rect width="${W}" height="${H}" fill="#9fc5e8"/><rect y="110" width="${W}" height="${H}" fill="#6a9a4a"/>${trees}<path d="M0 300 Q240 230 480 300 L480 320 L0 320 Z" fill="#8c7b65"/><path d="M0 262 Q240 215 480 262" stroke="#a89880" stroke-width="22" fill="none"/>${circles}${truck}${barrier}<rect x="10" y="${H-30}" width="${W-20}" height="22" rx="4" fill="rgba(0,0,0,.45)"/><text x="${W/2}" y="${H-14}" font-family="Inter,Arial" font-size="13" fill="#fff" text-anchor="middle">${esc(label)} · Illustration (Demo), kein Foto</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* downscale a camera/file image to a JPEG data URL (browser only) */
function fromFile(file,maxPx=1024,quality=0.72){return new Promise((resolve,reject)=>{try{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{const s=Math.min(1,maxPx/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',quality));};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Bild nicht lesbar'));};img.src=url;}catch(e){reject(e);}});}
const api={illustration,fromFile};
(globalThis.TransportCore=globalThis.TransportCore||{}).photos=api;
if(typeof module!=='undefined')module.exports=api;
})();
