/* Holztransport demo · minimal slippy map without dependencies (PLAN.md D3). Web-Mercator maths, raster tiles from
   OpenStreetMap (attribution shown; grid fallback when tiles cannot load), HTML markers, grid clustering at low zoom,
   pan by pointer, zoom by wheel/buttons/double-click, click-to-place mode, scale bar. Works in jsdom (no layout →
   fixed size) so the projection and marker logic are testable. */
'use strict';
(function(){
const TILE=256;
const SOURCES={
  osm:{url:(z,x,y)=>`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,attribution:'© OpenStreetMap-Mitwirkende',maxZoom:19},
  none:{url:null,attribution:'Kein Kartenhintergrund (offline)',maxZoom:19}
};
const clampLat=lat=>Math.max(-85.0511,Math.min(85.0511,lat));
function project(lat,lon,z){const n=Math.pow(2,z)*TILE;const x=(lon+180)/360*n;const r=clampLat(lat)*Math.PI/180;const y=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n;return {x,y};}
function unproject(x,y,z){const n=Math.pow(2,z)*TILE;const lon=x/n*360-180;const t=Math.PI*(1-2*y/n);const lat=180/Math.PI*Math.atan(Math.sinh(t));return {lat,lon};}
function metresPerPixel(lat,z){return 156543.03392*Math.cos(lat*Math.PI/180)/Math.pow(2,z);}
function boundsCenterZoom(points,w,h,pad=40,maxZoom=16){
  if(!points.length)return {lat:51,lon:10,zoom:6};if(points.length===1)return {lat:points[0][0],lon:points[0][1],zoom:Math.min(maxZoom,14)};
  const lats=points.map(p=>p[0]),lons=points.map(p=>p[1]);const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
  let zoom=maxZoom;for(;zoom>1;zoom--){const a=project(maxLat,minLon,zoom),b=project(minLat,maxLon,zoom);if(b.x-a.x<=w-2*pad&&b.y-a.y<=h-2*pad)break;}
  return {lat:(minLat+maxLat)/2,lon:(minLon+maxLon)/2,zoom};
}
function create(el,opts={}){
  const doc=el.ownerDocument;const state={lat:opts.lat??48.6,lon:opts.lon??9.6,zoom:opts.zoom??8,source:SOURCES[opts.tiles||'osm']||SOURCES.osm,markers:[],placeMode:false,width:opts.width||0,height:opts.height||0,tilesFailed:0,tilesOk:0};
  el.classList.add('tm');el.innerHTML='<div class="tm-tiles"></div><div class="tm-markers"></div><div class="tm-scale"></div><div class="tm-attribution"></div><div class="tm-place-hint" hidden>Klicken, um den Polter zu platzieren</div>';
  const tilesEl=el.querySelector('.tm-tiles'),markersEl=el.querySelector('.tm-markers'),scaleEl=el.querySelector('.tm-scale'),attrEl=el.querySelector('.tm-attribution'),hintEl=el.querySelector('.tm-place-hint');
  attrEl.textContent=state.source.attribution;
  const size=()=>({w:el.clientWidth||state.width||640,h:el.clientHeight||state.height||420});
  const tileCache=new Map();
  function render(){
    const {w,h}=size();const c=project(state.lat,state.lon,state.zoom);const left=c.x-w/2,top=c.y-h/2;const z=state.zoom,n=Math.pow(2,z);
    const x0=Math.floor(left/TILE),x1=Math.floor((left+w)/TILE),y0=Math.max(0,Math.floor(top/TILE)),y1=Math.min(n-1,Math.floor((top+h)/TILE));
    const keep=new Set();
    if(state.source.url){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const xx=((x%n)+n)%n;const key=`${z}/${xx}/${y}`;keep.add(key);let img=tileCache.get(key);
      if(!img){img=doc.createElement('img');img.className='tm-tile';img.alt='';img.decoding='async';img.src=state.source.url(z,xx,y);img.addEventListener('error',()=>{img.classList.add('failed');state.tilesFailed++;});img.addEventListener('load',()=>{state.tilesOk++;});tileCache.set(key,img);tilesEl.appendChild(img);}
      img.style.transform=`translate(${Math.round(x*TILE-left)}px,${Math.round(y*TILE-top)}px)`;}}
    for(const [key,img] of tileCache)if(!keep.has(key)){img.remove();tileCache.delete(key);}
    el.classList.toggle('tm-no-tiles',!state.source.url);
    renderMarkers(left,top,w,h);
    const mpp=metresPerPixel(state.lat,z);const targets=[25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000];const metres=targets.find(t=>t/mpp>=60)||100000;scaleEl.style.width=Math.round(metres/mpp)+'px';scaleEl.textContent=metres>=1000?(metres/1000)+' km':metres+' m';
    if(opts.onMove)opts.onMove({lat:state.lat,lon:state.lon,zoom:z});
  }
  function renderMarkers(left,top,w,h){
    markersEl.innerHTML='';const z=state.zoom;const placed=state.markers.map(m=>{const p=project(m.lat,m.lon,z);return Object.assign({},m,{px:p.x-left,py:p.y-top});}).filter(m=>m.px>-60&&m.py>-60&&m.px<w+60&&m.py<h+60);
    const clusterOn=opts.cluster!==false&&z<(opts.clusterBelow||12);const groups=new Map();
    for(const m of placed){if(!clusterOn||m.noCluster){groups.set(m.id,[m]);continue;}const gk=Math.floor(m.px/56)+':'+Math.floor(m.py/56);if(!groups.has(gk))groups.set(gk,[]);groups.get(gk).push(m);}
    for(const [gk,ms] of groups){
      if(ms.length>1){const cx=ms.reduce((a,m)=>a+m.px,0)/ms.length,cy=ms.reduce((a,m)=>a+m.py,0)/ms.length;const d=doc.createElement('button');d.type='button';d.className='tm-cluster';d.textContent=String(ms.length);d.style.transform=`translate(${Math.round(cx)}px,${Math.round(cy)}px)`;d.title=ms.map(m=>m.title||m.id).join(', ');d.dataset.count=ms.length;d.addEventListener('click',ev=>{ev.stopPropagation();api.setView(ms[0].lat,ms[0].lon,Math.min(state.zoom+3,state.source.maxZoom));});markersEl.appendChild(d);continue;}
      const m=ms[0];const d=doc.createElement(m.button===false?'div':'button');if(m.button!==false)d.type='button';d.className='tm-marker '+(m.className||'');d.style.transform=`translate(${Math.round(m.px)}px,${Math.round(m.py)}px)`;d.dataset.id=m.id;if(m.title)d.title=m.title;d.innerHTML=m.html||'<span class="tm-pin"></span>';
      if(m.onClick)d.addEventListener('click',ev=>{ev.stopPropagation();m.onClick(m,ev);});markersEl.appendChild(d);
    }
  }
  // interaction
  let drag=null;
  el.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;drag={x:ev.clientX,y:ev.clientY,lat:state.lat,lon:state.lon,moved:false};el.setPointerCapture&&el.setPointerCapture(ev.pointerId);});
  el.addEventListener('pointermove',ev=>{if(!drag)return;const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;const c=project(drag.lat,drag.lon,state.zoom);const p=unproject(c.x-dx,c.y-dy,state.zoom);state.lat=p.lat;state.lon=p.lon;render();});
  const endDrag=ev=>{if(!drag)return;const moved=drag.moved;drag=null;if(!moved&&state.placeMode&&opts.onPlace&&ev.type==='pointerup'){const r=el.getBoundingClientRect();const {w,h}=size();const c=project(state.lat,state.lon,state.zoom);const p=unproject(c.x-w/2+(ev.clientX-r.left),c.y-h/2+(ev.clientY-r.top),state.zoom);opts.onPlace(p);}};
  el.addEventListener('pointerup',endDrag);el.addEventListener('pointercancel',endDrag);
  el.addEventListener('wheel',ev=>{ev.preventDefault();api.zoomBy(ev.deltaY<0?1:-1);},{passive:false});
  el.addEventListener('dblclick',ev=>{ev.preventDefault();api.zoomBy(1);});
  const api={
    state,render,project:(lat,lon)=>{const {w,h}=size();const c=project(state.lat,state.lon,state.zoom),p=project(lat,lon,state.zoom);return {x:p.x-c.x+w/2,y:p.y-c.y+h/2};},
    setView(lat,lon,zoom){state.lat=lat;state.lon=lon;if(zoom!=null)state.zoom=Math.max(2,Math.min(state.source.maxZoom,zoom));render();},
    zoomBy(d){state.zoom=Math.max(2,Math.min(state.source.maxZoom,state.zoom+d));render();},
    fitBounds(points,maxZoom){const {w,h}=size();const v=boundsCenterZoom(points,w,h,40,maxZoom||15);api.setView(v.lat,v.lon,v.zoom);},
    setMarkers(ms){state.markers=ms.slice();render();},
    setPlaceMode(on){state.placeMode=!!on;el.classList.toggle('tm-placing',!!on);hintEl.hidden=!on;},
    setSource(name){state.source=SOURCES[name]||SOURCES.osm;attrEl.textContent=state.source.attribution;for(const img of tileCache.values())img.remove();tileCache.clear();render();},
    destroy(){el.innerHTML='';}
  };
  render();return api;
}
const api={TILE,SOURCES,project,unproject,metresPerPixel,boundsCenterZoom,create};
(globalThis.TransportCore=globalThis.TransportCore||{}).tilemap=api;
if(typeof module!=='undefined')module.exports=api;
})();
