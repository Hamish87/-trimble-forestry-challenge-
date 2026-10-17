/* Holztransport demo · Mapbox GL JS adapter (PLAN.md D13). Same surface as core/tilemap.js — create(el, opts) →
   setMarkers, setPopup, fitBounds, setView, panTo, zoomBy, setSource, setPlaceMode, setBoxMode, render, destroy —
   so app.js can mount either map. The library is loaded on demand from api.mapbox.com only when a public token is
   configured (config.js or Verwaltung → Einstellungen). Stacks are a clustered GeoJSON source (circle + label layers);
   fixed markers (Zielwerk, base, new pin, faint context stacks) are HTML markers; Shift+drag or the rectangle tool
   selects stacks (clusters are expanded to their leaves); an authentication error is reported once so the app can
   fall back to the tile map. */
'use strict';
(function(){
const VERSION='3.33.0';
const STYLES={outdoors:{url:'mapbox://styles/mapbox/outdoors-v12',label:'Mapbox Outdoors'},satellite:{url:'mapbox://styles/mapbox/satellite-streets-v12',label:'Mapbox Satellit'},streets:{url:'mapbox://styles/mapbox/streets-v12',label:'Mapbox Streets'},light:{url:'mapbox://styles/mapbox/light-v11',label:'Mapbox Light'}};
const DEFAULT_COLORS=['#0063a3','#8e44ad','#d35400','#16a085','#c0392b','#7f8c00'];
function colors(){try{const cs=getComputedStyle(document.documentElement);return DEFAULT_COLORS.map((c,i)=>(cs.getPropertyValue('--c'+i)||'').trim()||c);}catch(e){return DEFAULT_COLORS;}}
const token=settings=>String((settings&&settings.mapboxToken)||(globalThis.TransportConfig&&globalThis.TransportConfig.mapboxToken)||'').trim();
const sources=()=>Object.entries(STYLES).map(([k,v])=>[k,v.label]);
let loading=null;
function load(tok){
  if(globalThis.mapboxgl){globalThis.mapboxgl.accessToken=tok;return Promise.resolve(globalThis.mapboxgl);}
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{const doc=document;const css=doc.createElement('link');css.rel='stylesheet';css.href=`https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.css`;doc.head.appendChild(css);
    const s=doc.createElement('script');s.src=`https://api.mapbox.com/mapbox-gl-js/v${VERSION}/mapbox-gl.js`;s.async=true;
    s.onload=()=>{if(globalThis.mapboxgl){globalThis.mapboxgl.accessToken=tok;resolve(globalThis.mapboxgl);}else{loading=null;reject(new Error('mapbox-gl not defined after load'));}};
    s.onerror=()=>{loading=null;reject(new Error('mapbox-gl could not be loaded'));};doc.head.appendChild(s);});
  return loading;
}
/* markers arrive in the tile map's shape (className/html); the adapter reads the structured bits it needs */
const parseClass=cls=>{const c=' '+(cls||'')+' ';const ci=(c.match(/ c(\d) /)||[])[1];return {ci:ci!=null?Number(ci):0,shared:/ shared /.test(c),cleared:/ p-cleared /.test(c),selected:/ selected /.test(c),published:/ published /.test(c),due:/ due-over /.test(c)?'over':/ due-soon /.test(c)?'soon':''};};
function create(el,opts={}){
  const mapboxgl=globalThis.mapboxgl;if(!mapboxgl)throw new Error('mapbox-gl not loaded');
  const styleKey=STYLES[opts.style]?opts.style:'outdoors';const COL=colors();
  const m=new mapboxgl.Map({container:el,style:STYLES[styleKey].url,center:[opts.lon??9.6,opts.lat??48.6],zoom:opts.zoom??8,minZoom:3,maxZoom:18,boxZoom:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,attributionControl:true,language:'de'});
  m.addControl(new mapboxgl.ScaleControl({unit:'metric'}),'bottom-left');
  const state={markers:[],popup:null,placeMode:false,boxMode:false,get zoom(){return m.getZoom();},get lat(){return m.getCenter().lat;},get lon(){return m.getCenter().lng;}};
  const byId=new Map();const html=new Map();let popup=null,authFailed=false,styleReady=false;let boxing=false,start=null,boxEl=null;
  const CLUSTER=opts.cluster!==false;const clusterMaxZoom=Math.max(2,(opts.clusterBelow||12)-1);
  const feature=x=>{const p=parseClass(x.className);return {type:'Feature',geometry:{type:'Point',coordinates:[x.lon,x.lat]},properties:{id:x.id,label:x.label!=null?String(x.label):'',title:x.title||'',ci:x.ci!=null?x.ci:p.ci,cleared:x.cleared!=null?!!x.cleared:p.cleared,shared:p.shared,selected:x.selected!=null?!!x.selected:p.selected,published:p.published,due:p.due}};};
  const data=()=>({type:'FeatureCollection',features:state.markers.filter(x=>!x.noCluster).map(feature)});
  function addLayers(){
    if(m.getSource('stacks'))return;
    m.addSource('stacks',{type:'geojson',data:data(),cluster:CLUSTER,clusterRadius:42,clusterMaxZoom});
    const colorExpr=['case',['get','cleared'],'#9aa5b1',['get','shared'],'#5b7083',['match',['get','ci'],0,COL[0],1,COL[1],2,COL[2],3,COL[3],4,COL[4],5,COL[5],COL[0]]];
    m.addLayer({id:'clusters',type:'circle',source:'stacks',filter:['has','point_count'],paint:{'circle-color':COL[0],'circle-radius':['step',['get','point_count'],15,10,19,30,24],'circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
    m.addLayer({id:'cluster-count',type:'symbol',source:'stacks',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':12,'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-allow-overlap':true},paint:{'text-color':'#ffffff'}});
    m.addLayer({id:'stack-points',type:'circle',source:'stacks',filter:['!',['has','point_count']],paint:{'circle-color':colorExpr,'circle-radius':['case',['get','selected'],12,10],'circle-stroke-width':['case',['get','selected'],3,['==',['get','due'],'over'],3,1.5],'circle-stroke-color':['case',['get','selected'],'#ffb400',['==',['get','due'],'over'],'#c0392b','#ffffff'],'circle-opacity':['case',['get','published'],1,0.78]}});
    m.addLayer({id:'stack-labels',type:'symbol',source:'stacks',filter:['!',['has','point_count']],layout:{'text-field':['get','label'],'text-size':10,'text-font':['DIN Pro Bold','Arial Unicode MS Bold'],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff'}});
  }
  function applyFixed(){
    const want=new Map(state.markers.filter(x=>x.noCluster).map(x=>[x.id,x]));
    for(const [id,mk] of html)if(!want.has(id)){mk.remove();html.delete(id);}
    for(const [id,x] of want){let mk=html.get(id);const cls='tm-marker '+(x.className||'');const inner=x.html||'<span class="tm-pin"></span>';
      if(mk){const node=mk.getElement();if(node.className!==cls)node.className=cls;if(node.innerHTML!==inner)node.innerHTML=inner;mk.setLngLat([x.lon,x.lat]);}
      else{const node=document.createElement('div');node.className=cls;node.innerHTML=inner;if(x.title)node.title=x.title;mk=new mapboxgl.Marker({element:node,anchor:'center'}).setLngLat([x.lon,x.lat]).addTo(m);html.set(id,mk);}
      mk.getElement().onclick=x.onClick?ev=>{ev.stopPropagation();x.onClick(x,ev);}:null;}
  }
  function applyMarkers(){if(!styleReady)return;addLayers();m.getSource('stacks').setData(data());applyFixed();}
  function applyPopup(){const p=state.popup;if(!p){if(popup){popup.remove();popup=null;}return;}
    if(!popup)popup=new mapboxgl.Popup({closeButton:false,closeOnClick:false,maxWidth:'380px',offset:14,className:'tm-popup-gl'});
    popup.setLngLat([p.lon,p.lat]);if(popup._key!==p.key||popup._html!==p.html){popup.setHTML(p.html);popup._key=p.key;popup._html=p.html;}if(!popup.isOpen())popup.addTo(m);}
  m.on('style.load',()=>{styleReady=true;applyMarkers();applyPopup();});
  m.on('error',e=>{const err=e&&e.error;const status=err&&(err.status||err.statusCode);if(!authFailed&&(status===401||status===403||/access ?token|unauthori[sz]ed|not authorized/i.test((err&&err.message)||''))){authFailed=true;if(opts.onAuthError)opts.onAuthError(err);}});
  m.on('moveend',()=>{if(opts.onMove)opts.onMove({lat:state.lat,lon:state.lon,zoom:state.zoom});});
  m.on('click',e=>{if(boxing)return;
    if(m.getLayer('clusters')){const cl=m.queryRenderedFeatures(e.point,{layers:['clusters']})[0];if(cl){m.getSource('stacks').getClusterExpansionZoom(cl.properties.cluster_id,(err,z)=>{if(!err)m.easeTo({center:cl.geometry.coordinates,zoom:Math.min(z,18)});});return;}}
    if(m.getLayer('stack-points')){const f=m.queryRenderedFeatures(e.point,{layers:['stack-points']})[0];const mk=f?byId.get(f.properties.id):null;if(mk){if(mk.onClick)mk.onClick(mk,e.originalEvent);return;}}
    if(state.placeMode&&opts.onPlace)opts.onPlace({lat:e.lngLat.lat,lon:e.lngLat.lng});});
  m.on('mousemove',e=>{let hit=false;if(m.getLayer('stack-points'))hit=m.queryRenderedFeatures(e.point,{layers:['stack-points','clusters']}).length>0;m.getCanvas().style.cursor=(state.boxMode||state.placeMode)?'crosshair':hit?'pointer':'';});
  /* box selection: Shift+drag, or any drag while the rectangle tool is on; clusters inside the box contribute their leaves */
  const canvasEl=m.getCanvasContainer();
  const rel=e=>{const r=canvasEl.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  function onMove(e){const cur=rel(e);const x0=Math.min(start[0],cur[0]),y0=Math.min(start[1],cur[1]),x1=Math.max(start[0],cur[0]),y1=Math.max(start[1],cur[1]);boxEl.style.transform=`translate(${x0}px,${y0}px)`;boxEl.style.width=(x1-x0)+'px';boxEl.style.height=(y1-y0)+'px';}
  async function onUp(e){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);const cur=rel(e);if(boxEl){boxEl.remove();boxEl=null;}m.dragPan.enable();setTimeout(()=>{boxing=false;},0);
    const bbox=[[Math.min(start[0],cur[0]),Math.min(start[1],cur[1])],[Math.max(start[0],cur[0]),Math.max(start[1],cur[1])]];if(bbox[1][0]-bbox[0][0]<4&&bbox[1][1]-bbox[0][1]<4)return;
    const src=m.getSource('stacks');if(!src||!m.getLayer('stack-points'))return;const ids=new Set();
    for(const f of m.queryRenderedFeatures(bbox,{layers:['stack-points','clusters']})){if(f.properties.cluster){const leaves=await new Promise(res=>src.getClusterLeaves(f.properties.cluster_id,10000,0,(err,ls)=>res(err?[]:ls||[])));for(const l of leaves)ids.add(l.properties.id);}else ids.add(f.properties.id);}
    if(opts.onBoxSelect)opts.onBoxSelect([...ids],{additive:!!e.shiftKey});}
  canvasEl.addEventListener('mousedown',e=>{if(!opts.onBoxSelect||e.button!==0||!(e.shiftKey||state.boxMode))return;e.preventDefault();e.stopImmediatePropagation();boxing=true;m.dragPan.disable();start=rel(e);boxEl=document.createElement('div');boxEl.className='tm-boxselect';canvasEl.appendChild(boxEl);document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);},true);
  const api={
    state,kind:'mapbox',render(){try{m.resize();}catch(e){}},
    project(lat,lon){const p=m.project([lon,lat]);return {x:p.x,y:p.y};},
    setView(lat,lon,zoom){m.jumpTo({center:[lon,lat],zoom:zoom!=null?zoom:m.getZoom()});},
    zoomBy(d){m.easeTo({zoom:m.getZoom()+d,duration:200});},
    fitBounds(points,maxZoom){if(!points.length)return;if(points.length===1){m.jumpTo({center:[points[0][1],points[0][0]],zoom:Math.min(maxZoom||15,14)});return;}const b=new mapboxgl.LngLatBounds([points[0][1],points[0][0]],[points[0][1],points[0][0]]);for(const p of points)b.extend([p[1],p[0]]);m.fitBounds(b,{padding:48,maxZoom:maxZoom||15,duration:0});},
    setMarkers(ms){state.markers=ms.slice();byId.clear();for(const x of state.markers)byId.set(x.id,x);applyMarkers();},
    setPopup(p){state.popup=p?Object.assign({key:String(p.key||p.lat+','+p.lon)},p):null;applyPopup();},
    panTo(lat,lon){m.easeTo({center:[lon,lat],duration:300});},
    setPlaceMode(on){state.placeMode=!!on;el.classList.toggle('tm-placing',!!on);},
    setBoxMode(on){state.boxMode=!!on;el.classList.toggle('tm-boxmode',!!on);},
    setSource(name){if(!STYLES[name])return;styleReady=false;m.setStyle(STYLES[name].url);},
    destroy(){try{for(const mk of html.values())mk.remove();html.clear();if(popup)popup.remove();m.remove();}catch(e){}el.classList.remove('tm-placing','tm-boxmode');}
  };
  return api;
}
const api={VERSION,STYLES,sources,token,load,create};
(globalThis.TransportCore=globalThis.TransportCore||{}).mapbox=api;
})();
