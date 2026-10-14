/* Uppdrag på kartan [M41][M42][M73] — the map as a planning surface (PLAN_OVERNIGHT §3).
   The game's orthophoto and stand overlays (dist/routes.js): green circles clustered with counts at small scale, stand
   polygons coloured by status with black label boxes "client name order-nr" at large scale; map controls pan ▲◀▶▼,
   zoom +/−, lasso, measure, landing (Avlägg), map symbol, route sequence ("Ordna om löpande nummer"), print; scale bar,
   coordinate readout, layers (🗂) and legend (💡). Clicking/shift-clicking/lassoing stands selects them in the list; a
   selected stand drags onto a calendar row (app.js). The order detail map uses the same layers, legend and tools.
   The map is image space: the orthophoto is not georeferenced. An OSM raster basemap is behind ?basemap=osm and is used
   only when orders carry lat/lng (o.geo); the game orders do not, so the flag shows an explanatory empty state. */
'use strict';
// Scale labels are [DEMO] approximations: the orthophoto is not georeferenced in the game.
CFHViews.MAP_LEVELS=[{name:'Übersicht',scale:'≈ 1:50 000',box:[-620,-350,1860,1050],cluster:300,r:46},{name:'Revier',scale:'≈ 1:10 000',box:[0,0,620,350],cluster:45,r:15},{name:'Bestand',scale:'≈ 1:5 000',box:[0,0,620,350],polygons:true},{name:'Detail',scale:'≈ 1:2 000',box:null,polygons:true}];
/* Orthophoto scale from the game: dist/routes.js labels 31,25 site units as "ca. 31.25 × anchor × 1.331 m", and site
   units × anchor = image units, so one orthophoto image unit ≈ 1,331 m. Distances and the scale bar use this factor. */
CFHViews.M_PER_UNIT=1.331;
CFHViews.MAP_SYMBOLS=[{key:'warning',de:'Hinweis/Warnung',icon:'!'},{key:'turn',de:'Wendeplatz',icon:'↻'},{key:'unload',de:'Abladepunkt',icon:'↓'},{key:'protect',de:'Schutzbereich',icon:'⊘'}];
CFHViews.MAP_LAYERS=[{key:'photo',de:'Luftbild'},{key:'stands',de:'Bestände'},{key:'landings',de:'Polterplätze',sv:'Avlägg'},{key:'symbols',de:'Symbole'},{key:'protect',de:'Schutzbereiche',sv:'Hänsyn'},{key:'neighbours',de:'Nachbarflächen'},{key:'routes',de:'Routen'},{key:'machines',de:'Ernteketten-Position'}];
/** Visible layers = Kartskikt defaults (Administration, plan.admin.layers) overridden by the planner's switches in this session. */
CFHViews.mapLayerState=(v,plan)=>({...(typeof CFHAdmin!=='undefined'?CFHAdmin.layers(plan).on:{photo:true,stands:true,landings:true,symbols:true,protect:true,neighbours:true,routes:false,machines:true}),...(v.mapLayers||{})});
/** Layer keys in Kartskikt order (the switcher's order) and the accent colours as CSS custom properties. */
CFHViews.mapLayerOrder=plan=>typeof CFHAdmin!=='undefined'?CFHAdmin.layers(plan).order:CFHViews.MAP_LAYERS.map(l=>l.key);
CFHViews.mapLayerStyle=plan=>{if(typeof CFHAdmin==='undefined')return '';const c=CFHAdmin.layers(plan).colours;return Object.entries(c).filter(([,x])=>x).map(([k,x])=>`--lc-${k}:${x}`).join(';');};
CFHViews.MAP_TOOL_HINTS={lasso:'Rechteck aufziehen: alle Aufträge darin werden ausgewählt (mit Umschalt hinzufügen).',measure:'Zwei Punkte anklicken: Entfernung in Metern.',landing:'In die Karte klicken, um den Polterplatz zu setzen.',symbol:'Symbol wählen und in die Karte klicken.',seq:'Aufträge in Fahrreihenfolge anklicken, um sie zu nummerieren. Erneut klicken entfernt die Nummer.',move:'Neue Position in die Karte klicken.'};
CFHViews.clusters=(orders,radius)=>{
  const out=[];for(const o of orders){const [x,y]=o.centroid,c=out.find(c=>Math.hypot(c.x-x,c.y-y)<radius);if(c){c.items.push(o);c.x=(c.x*(c.items.length-1)+x)/c.items.length;c.y=(c.y*(c.items.length-1)+y)/c.items.length;}else out.push({x,y,items:[o]});}
  return out;
};
CFHViews.mapBox=(vm,v)=>{
  const level=Math.max(0,Math.min(3,v.mapZoom|0)),L=CFHViews.MAP_LEVELS[level],sel=vm.orders.find(o=>o.id===v.selected);
  let box=L.box;if(!box){const t=sel||vm.orders[0],xs=t.boundary.map(p=>p[0]),ys=t.boundary.map(p=>p[1]),pad=24;box=[Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)-Math.min(...xs)+2*pad,Math.max(...ys)-Math.min(...ys)+2*pad];}
  const [px,py]=v.mapPan||[0,0];return{level,L,box:[box[0]+px*box[2],box[1]+py*box[3],box[2],box[3]]};
};
/* ---------- Geometry helpers (shared with app.js) ---------- */
/** Client (screen) point → map (viewBox) point for an <svg> with the default preserveAspectRatio (xMidYMid meet). */
CFHViews.svgPoint=(svg,x,y)=>{
  const vb=String(svg?.getAttribute?.('viewBox')||'').split(/[\s,]+/).map(Number),r=svg?.getBoundingClientRect?.();
  if(vb.length!==4||!vb.every(Number.isFinite)||!r||!(r.width>0&&r.height>0)||!Number.isFinite(x)||!Number.isFinite(y))return null;
  const s=Math.min(r.width/vb[2],r.height/vb[3]),ox=r.left+(r.width-vb[2]*s)/2,oy=r.top+(r.height-vb[3]*s)/2;
  return[+(vb[0]+(x-ox)/s).toFixed(1),+(vb[1]+(y-oy)/s).toFixed(1)];
};
CFHViews.pointInPolygon=([x,y],poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
/** Stand under a map point, else null. */
CFHViews.orderAt=(orders,pt)=>pt?orders.find(o=>CFHViews.pointInPolygon(pt,o.boundary))||null:null;
CFHViews.nearestOrder=(orders,pt)=>pt?[...orders].sort((a,b)=>Math.hypot(a.centroid[0]-pt[0],a.centroid[1]-pt[1])-Math.hypot(b.centroid[0]-pt[0],b.centroid[1]-pt[1]))[0]||null:null;
/** Orders whose centroid lies inside the rectangle a–b (lasso). */
CFHViews.ordersInRect=(orders,a,b)=>{const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);return orders.filter(o=>o.centroid[0]>=x0&&o.centroid[0]<=x1&&o.centroid[1]>=y0&&o.centroid[1]<=y1);};
CFHViews.distanceM=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*CFHViews.M_PER_UNIT;
/** Simulated machine position on the planned route (bridge: o.simulated = share of the route done). */
CFHViews.machinePos=(o,key)=>{const path=o.routes?.[key],t=o.simulated?.[key];if(!path||t==null||typeof WorksiteRoutes==='undefined')return null;return WorksiteRoutes.at(path,t);};
/* ---------- SVG parts ---------- */
/** Stand drawing shared with the order detail page. */
CFHViews.standLabel=(o,ui)=>{const{esc}=ui,[cx,cy]=o.centroid,text=`${o.clientCode} ${o.name} ${o.id}`,w=Math.max(70,text.length*5.6);return `<g class="map-label" aria-hidden="true"><rect x="${cx-w/2}" y="${cy-10}" width="${w}" height="20" rx="2"/><text x="${cx}" y="${cy+4}" text-anchor="middle"><tspan data-no-translate>${esc(o.clientCode)} </tspan>${esc(o.name)}<tspan data-no-translate> ${esc(o.id)}</tspan></text></g>`;};
CFHViews.standSvg=(o,ui,{label=true,selected=false,active=false,tone='',interactive=true,drag=false}={})=>{
  const{esc}=ui,pts=o.boundary.map(p=>p.join(',')).join(' ');
  const g=`<g class="map-stand ${tone?'pill-'+tone:''} ${selected?'selected':''} ${active?'active':''}" data-order="${esc(o.id)}" ${interactive?`data-action="select-order" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${esc(o.name)}"`:''} ${drag&&!o.closed?'data-map-drag':''}><polygon points="${pts}"/></g>`;
  return label?g+CFHViews.standLabel(o,ui):g;
};
CFHViews.symbolSvg=(s,ui,{u=1,orderId,interactive=true,selected=false}={})=>{
  const{esc}=ui,[x,y]=s.point,k=CFHViews.MAP_SYMBOLS.find(m=>m.key===s.kind)||CFHViews.MAP_SYMBOLS[0],r=8*u;
  const shape=s.kind==='warning'?`<path d="M${x},${y-r*1.2} L${x+r*1.1},${y+r*.8} L${x-r*1.1},${y+r*.8} Z"/>`:s.kind==='unload'?`<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}" rx="${r*.25}"/>`:s.kind==='protect'?`<circle cx="${x}" cy="${y}" r="${r*2.2}" class="sym-area"/><circle cx="${x}" cy="${y}" r="${r}"/>`:`<circle cx="${x}" cy="${y}" r="${r}"/>`;
  return `<g class="map-symbol sym-${esc(s.kind)} ${selected?'selected':''}" ${interactive?`data-action="map-obj" data-order="${esc(orderId)}" data-obj-kind="symbol" data-obj="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(k.de)} ${esc(s.code)}"`:''}><title>${esc(k.de)} · ${esc(s.code)}</title>${shape}<text x="${x}" y="${y+r*.45}" text-anchor="middle" font-size="${r*1.2}" aria-hidden="true">${esc(k.icon)}</text></g>`;
};
/** Scale bar in map units (bottom left of the view box): a round length in metres from the orthophoto scale. */
CFHViews.scaleBar=(box,ui)=>{
  const u=box[2]/620,target=box[2]*.15*CFHViews.M_PER_UNIT,nice=[5,10,20,50,100,200,500,1000,2000].filter(n=>n<=target).pop()||5,len=nice/CFHViews.M_PER_UNIT,x=box[0]+box[2]*.98-len-34*u,y=box[1]+box[3]-9*u; // bottom right (status line sits bottom left)
  return `<g class="map-scalebar" aria-hidden="true" data-scale-m="${nice}"><rect x="${x-3*u}" y="${y-11*u}" width="${len+36*u}" height="${15*u}" rx="${2*u}"/><path d="M${x},${y-5*u} V${y} H${x+len} V${y-5*u}" stroke-width="${1.5*u}"/><text x="${x+len+4*u}" y="${y}" font-size="${8*u}" data-no-translate>${ui.num(nice,0)} m</text></g>`;
};
/** Map content for a set of orders. scope 'main' = planning map (stands select and drag), 'detail' = order detail. */
CFHViews.mapBody=(vm,v,ui,{orders,box,L,level=2,scope='main',layers=CFHViews.mapLayerState(v,vm.plan)})=>{
  const{esc,num}=ui,R=typeof WorksiteRoutes!=='undefined'?WorksiteRoutes:null,u=box[2]/620,main=scope==='main',route=vm.plan.routeOrder||[];
  const isSel=o=>main?(v.checked||[]).includes(o.id)||o.id===v.selected:false,img=R?`${ui.DIST}${R.imageUrl}`:'';
  let body=`<rect x="${box[0]-box[2]}" y="${box[1]-box[3]}" width="${box[2]*3}" height="${box[3]*3}" fill="#0b3a5a"/>${layers.photo&&R?`<image href="${esc(img)}" x="0" y="0" width="620" height="350" preserveAspectRatio="none"/><rect x="0" y="0" width="620" height="350" fill="#00253d" fill-opacity=".12"/>`:''}`;
  const seqLine=pts=>pts.length>1?`<polyline class="map-route-seq" points="${pts.map(p=>p.join(',')).join(' ')}" stroke-width="${Math.max(1.5,3*u)}" aria-hidden="true"/>`:'';
  const routed=route.map(id=>orders.find(o=>o.id===id)).filter(Boolean);
  if(L&&!L.polygons){
    if(level===0)body+=`<rect x="0" y="0" width="620" height="350" fill="none" stroke="#a5dcf6" stroke-dasharray="12 8" stroke-width="3"/>`;
    const cl=CFHViews.clusters(orders,L.cluster);
    if(level>0)body+=seqLine(routed.map(o=>o.centroid));
    if(layers.stands)for(const c of cl){
      const one=c.items.length===1?c.items[0]:null,sel=c.items.some(isSel),seq=one?route.indexOf(one.id):-1;
      body+=one?`<g class="map-circle ${sel?'selected':''} ${one.id===v.selected?'active':''} pill-${esc(one.pill.cls)}" data-action="select-order" data-order="${esc(one.id)}" ${one.closed?'':'data-map-drag'} tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(one.name)}"><circle cx="${c.x}" cy="${c.y}" r="${L.r}"/></g>${seq>=0?`<g class="map-seq" data-seq="${esc(one.id)}" aria-hidden="true"><circle cx="${c.x+L.r}" cy="${c.y-L.r}" r="9"/><text x="${c.x+L.r}" y="${c.y-L.r+4}" text-anchor="middle">${num(seq+1,0)}</text></g>`:''}`
        :`<g class="map-circle cluster ${sel?'selected':''}" data-action="map-zoom-in" tabindex="0" role="button" aria-label="${esc('Gruppe vergrößern')}: ${num(c.items.length,0)} ${esc('Aufträge')}"><circle cx="${c.x}" cy="${c.y}" r="${L.r*1.25}"/><text x="${c.x}" y="${c.y+L.r*.4}" text-anchor="middle" font-size="${L.r*1.1}">${num(c.items.length,0)}</text></g>`;
    }
    return `<g class="map-layers" style="${CFHViews.mapLayerStyle(vm.plan)}">${body}</g>`;
  }
  let neigh='',stands='',protect='',routes='',landings='',symbols='',labels='',seq='',machines='';
  const obj=v.mapObj;
  for(const o of orders){
    const site=R?.sites?.[o.standId],[cx,cy]=o.centroid,si=route.indexOf(o.id);
    if(layers.neighbours&&site){const [ax,ay,k]=site.anchor;neigh+=`<g transform="translate(${ax} ${ay}) scale(${k})" class="map-overlay" aria-hidden="true">${R.neighbour(o.standId)}</g>`;}
    if(layers.stands){stands+=CFHViews.standSvg(o,ui,{label:false,selected:isSel(o),active:main&&o.id===v.selected,tone:o.pill.cls,interactive:main,drag:main});labels+=CFHViews.standLabel(o,ui);}
    if(layers.protect&&o.bio){const [bx,by]=o.bio.point,br=Math.max(9,o.bio.radius);protect+=`<g class="map-bio" data-action="open-order" data-order="${esc(o.id)}" data-tab="consider" role="button" tabindex="0" aria-label="${esc(o.bio.code)}"><circle cx="${bx}" cy="${by}" r="${br}"/><text x="${bx}" y="${by+4}" text-anchor="middle">!</text><text class="bio-code" x="${bx}" y="${by-br-3}" text-anchor="middle" data-no-translate>${esc(o.bio.code)}</text></g>`;}
    if(layers.routes&&o.routes)routes+=`<g class="map-routes" data-routes="${esc(o.id)}" aria-hidden="true"><polyline class="route-f" points="${o.routes.forwarder.map(p=>p.join(',')).join(' ')}"/><polyline class="route-h" points="${o.routes.harvester.map(p=>p.join(',')).join(' ')}"/></g>`;
    if(layers.landings)for(const l of CFHModel.orderLandings(o,vm.plan)){const [lx,ly]=l.point;
      landings+=l.primary?`<g class="map-landing" data-landing="${esc(l.id)}"><title>${esc('Polterplatz')} ${esc(l.id)}</title><rect x="${lx-5}" y="${ly-5}" width="10" height="10" rx="2"/><text x="${lx+8}" y="${ly+4}" data-no-translate>${esc(l.id)}</text></g>`
        :`<g class="map-landing extra ${obj&&obj.orderId===o.id&&obj.kind==='landing'&&obj.id===l.key?'selected':''}" data-landing="${esc(l.id)}" data-action="map-obj" data-order="${esc(o.id)}" data-obj-kind="landing" data-obj="${esc(l.key)}" role="button" tabindex="0" aria-label="${esc('Polterplatz')} ${esc(l.id)}"><title>${esc('Polterplatz')} ${esc(l.id)}</title><rect x="${lx-5}" y="${ly-5}" width="10" height="10" rx="2"/><text x="${lx+8}" y="${ly+4}" data-no-translate>${esc(l.id)}</text></g>`;}
    if(layers.symbols)for(const s of CFHModel.orderSymbols(o,vm.plan))symbols+=CFHViews.symbolSvg(s,ui,{orderId:o.id,selected:!!obj&&obj.orderId===o.id&&obj.kind==='symbol'&&obj.id===s.id});
    if(main&&si>=0)seq+=`<g class="map-seq" data-seq="${esc(o.id)}" aria-hidden="true"><circle cx="${cx-62}" cy="${cy}" r="9"/><text x="${cx-62}" y="${cy+4}" text-anchor="middle">${num(si+1,0)}</text></g>`;
    if(layers.machines)for(const [key,cls,code,name] of [['harvester','h','H','Harvester H-01'],['forwarder','f','F','Forwarder F-01']]){const p=CFHViews.machinePos(o,key);if(!p)continue;const chain=o.row?.kind==='chain'?` · ${o.row.name} (${o.row.id})`:'';
      machines+=`<g class="map-machine ${cls}" data-machine="${key}" data-order="${esc(o.id)}"><title>${esc(name)}${esc(chain)} · ${esc('simulierte Position aus dem Spielstand, keine GPS-Meldung')}</title><rect x="${p[0]-7}" y="${p[1]-7}" width="14" height="14" rx="2"/><text x="${p[0]}" y="${p[1]+4}" text-anchor="middle" data-no-translate>${code}</text></g>`;}
  }
  const g=(k,s)=>s?`<g data-layer="${k}">${s}</g>`:'';
  body+=g('neighbours',neigh)+g('stands',stands)+g('protect',protect)+g('routes',routes)+(main?seqLine(routed.map(o=>[o.centroid[0]-62,o.centroid[1]])):'')+g('landings',landings)+g('symbols',symbols)+labels+seq+g('machines',machines);
  const m=v.measure;if(m&&m.scope===scope&&m.a){const r=4*u;body+=`<g class="map-measure" aria-hidden="true"><circle cx="${m.a[0]}" cy="${m.a[1]}" r="${r}"/>${m.b?`<line x1="${m.a[0]}" y1="${m.a[1]}" x2="${m.b[0]}" y2="${m.b[1]}" stroke-width="${2*u}"/><circle cx="${m.b[0]}" cy="${m.b[1]}" r="${r}"/><text x="${(m.a[0]+m.b[0])/2}" y="${(m.a[1]+m.b[1])/2-6*u}" text-anchor="middle" font-size="${11*u}" data-no-translate>${num(CFHViews.distanceM(m.a,m.b),0)} m</text>`:''}</g>`;}
  return `<g class="map-layers" style="${CFHViews.mapLayerStyle(vm.plan)}">${body}</g>`+CFHViews.scaleBar(box,ui);
};
/** Legend (💡): status colours as the pills, map objects, routes, simulated positions, image-space note, OSM attribution. */
CFHViews.mapLegend=ui=>{
  const{esc,num}=ui,sw=(cls,de)=>`<span><i class="map-key-stand pill-${cls}"></i>${esc(de)}</span>`;
  return `<div class="map-pop legend-pop" data-map-legend><b>${esc('Legende')}</b>
    <span class="legend-head">${esc('Bestände nach Status (wie die Statusfelder)')}</span>
    ${sw('available','Frei')}${sw('planned','Geplant, nicht gesendet')}${sw('sent','An Ressource gesendet')}${sw('team','An Team gesendet')}${sw('started','Begonnen')}${sw('completed','Abgeschlossen')}
    <span><i class="map-key-selected"></i>${esc('Ausgewählt')}</span>
    <span><i class="map-key-circle"></i>${esc('Auftrag (Anzahl bei Gruppierung)')}</span>
    <span><i class="map-key-landing"></i>${ui.term('Polterplatz','Avlägg',{tip:true})} · <i class="map-key-landing extra"></i>${esc('zusätzlicher Polterplatz')}</span>
    ${CFHViews.MAP_SYMBOLS.map(s=>`<span><b class="map-key-sym sym-${s.key}" aria-hidden="true">${esc(s.icon)}</b>${esc(s.de)}</span>`).join('')}
    <span><i class="map-key-bio"></i>${esc('Schutzbereich aus dem Spiel (BIO)')}</span>
    <span><i class="map-key-route h"></i>${esc('Harvester-Route')} · <i class="map-key-route f"></i>${esc('Forwarder-Route')}</span>
    <span><i class="map-key-seq"></i>${esc('Laufende Nummer und Fahrreihenfolge')}</span>
    <span>H / F · ${esc('simulierte Maschinenposition aus dem Spielstand, keine GPS-Meldung')}</span>
    <small>${esc('Die Karte ist das Luftbild in Bildkoordinaten, nicht georeferenziert')}: 1 ${esc('Bildpunkt')} ≈ ${num(CFHViews.M_PER_UNIT,2)} m. ${esc('Maßstab und Messung sind Näherungen.')}</small>
    <small>${esc('OpenStreetMap-Grundkarte nur mit ?basemap=osm und georeferenzierten Aufträgen')} · <span data-osm-attribution>© ${esc('OpenStreetMap-Mitwirkende')}</span> · ODbL</small></div>`;
};
/** Layer switcher (🗂). */
CFHViews.mapLayerPop=(v,ui,plan)=>{const L=CFHViews.mapLayerState(v,plan),order=CFHViews.mapLayerOrder(plan);return `<div class="map-pop layer-pop" data-map-layers><b>${ui.esc('Kartenebenen')}</b>${[...CFHViews.MAP_LAYERS].sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key)).map(l=>`<label><input type="checkbox" data-change="map-layer" value="${l.key}" ${L[l.key]?'checked':''}> ${ui.term(l.de,l.sv)}</label>`).join('')}</div>`;};
/** Tool bar above a map (tools, hint line with the symbol palette, editor line for a picked landing/symbol) and the
    overlay inside it (layers 🗂, legend 💡, status line with scale, coordinates and the measured distance).
    The tool bar sits outside the picture so it stays usable when the map pane is narrow. Returns {bar, overlay}. */
CFHViews.mapChrome=(vm,v,ui,{scope,L,level=2})=>{
  const{esc,num,ibtn}=ui,main=scope==='main',tool=v.mapToolScope===scope?v.mapTool:null,tb=(t,icon,de,svTerm,dis=false)=>ibtn('map-tool',icon,de,svTerm,{attrs:`data-tool="${t}" data-scope="${scope}" aria-pressed="${tool===t}"`,disabled:dis,cls:'tool-'+t});
  const poly=!L||L.polygons;
  const tools=`<div class="toolbar map-toolbar" role="toolbar" aria-label="${esc('Kartenwerkzeuge')}">${main?tb('lasso','⬚','Auswahlrechteck (Lasso)'):''}${tb('measure','📏','Strecke messen',null,!poly)}${tb('landing','📍','Polterplatz setzen','Avlägg',!poly)}${tb('symbol','⚑','Kartensymbol setzen',null,!poly)}${main?tb('seq','⤭','Löpnummer auf der Karte ordnen','Ordna om löpande nummer',level===0):''}${ibtn('','⬠','Polygon zeichnen ist nicht Teil der Demo',null,{disabled:true})}${main?ibtn('map-print','🖨','Drucken'):''}</div>`;
  const palette=tool==='symbol'?`<span class="symbol-pop" role="group" aria-label="${esc('Kartensymbol wählen')}">${CFHViews.MAP_SYMBOLS.map(s=>`<button type="button" class="small" data-action="map-symbol-kind" data-kind="${s.key}" aria-pressed="${(v.symbolKind||'warning')===s.key}"><b class="map-key-sym sym-${s.key}" aria-hidden="true">${esc(s.icon)}</b>${esc(s.de)}</button>`).join('')}</span>`:'';
  const hint=tool?`<div class="map-hint" role="status" data-map-hint><span>${esc(CFHViews.MAP_TOOL_HINTS[tool]||'')}</span>${palette}<button type="button" class="small" data-action="map-tool-off">${esc('Fertig')}</button></div>`:'';
  let objPop='';const ob=v.mapObj;
  if(ob&&ob.scope===scope){const o=vm.orders.find(x=>x.id===ob.orderId),item=o&&(ob.kind==='symbol'?CFHModel.orderSymbols(o,vm.plan):CFHModel.orderLandings(o,vm.plan)).find(x=>x.key===ob.id);
    if(item)objPop=`<div class="map-obj-bar" data-obj-pop><b>${esc(ob.kind==='symbol'?'Kartensymbol':'Polterplatz')} <span data-no-translate>${esc(ob.kind==='symbol'?item.code:item.id)}</span></b><small>${esc(o.name)}</small>
      ${ob.kind==='symbol'?`<label>${esc('Art')} <select data-change="map-obj-kind">${CFHViews.MAP_SYMBOLS.map(s=>`<option value="${s.key}" ${item.kind===s.key?'selected':''}>${esc(s.de)}</option>`).join('')}</select></label>`:''}
      <button type="button" class="small" data-action="map-obj-move">✥ ${esc('Verschieben')}</button><button type="button" class="small" data-action="map-obj-delete">🗑 ${esc('Löschen')}</button><button type="button" class="small ghost" data-action="map-obj-close">${esc('Schließen')}</button></div>`;}
  const corner=`<div class="map-ctrl corner">${ibtn('map-layers','🗂','Kartenebenen',null,{attrs:`aria-expanded="${!!v.mapLayerMenu}"`})}${ibtn('map-legend','💡','Legende',null,{attrs:`aria-expanded="${!!v.mapLegend}"`})}</div>`;
  const m=v.measure&&v.measure.scope===scope&&v.measure.b?`<span data-measure>${esc('Strecke')}: ${num(CFHViews.distanceM(v.measure.a,v.measure.b),0)} m</span>`:'';
  const status=`<div class="map-status"><span title="${esc('Näherung, das Luftbild ist nicht georeferenziert')}">${esc('Maßstab')} ${L?`${esc(L.scale)} · ${esc(L.name)}`:`1 ${esc('Bildpunkt')} ≈ ${num(CFHViews.M_PER_UNIT,2)} m`}</span><span data-map-coords>${esc('Bildkoordinaten')}: –</span>${m}</div>`;
  return{bar:tools+hint+objPop,overlay:corner+(v.mapLayerMenu?CFHViews.mapLayerPop(v,ui,vm.plan):'')+(v.mapLegend?CFHViews.mapLegend(ui):'')+status};
};
/* ---------- OpenStreetMap basemap behind ?basemap=osm (Web Mercator raster tiles) ---------- */
CFHViews.osmProject=(lat,lng,z)=>{const n=2**z*256,s=Math.sin(lat*Math.PI/180);return[(lng+180)/360*n,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n];};
/** View for orders carrying o.geo.boundary = [[lat,lng] …]: zoom so the stands fit ~760×430 px, tiles that cover it. */
CFHViews.osmView=(orders,w=760,h=430)=>{
  const geo=orders.filter(o=>Array.isArray(o.geo?.boundary)&&o.geo.boundary.length>2);if(!geo.length)return null;const pts=geo.flatMap(o=>o.geo.boundary);
  let z=18,b;for(;z>1;z--){const xy=pts.map(([la,ln])=>CFHViews.osmProject(la,ln,z)),xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]);b=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];if(b[2]-b[0]<=w*.8&&b[3]-b[1]<=h*.8)break;}
  const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,box=[cx-w/2,cy-h/2,w,h],tiles=[];
  for(let tx=Math.floor(box[0]/256);tx<=Math.floor((box[0]+w)/256);tx++)for(let ty=Math.floor(box[1]/256);ty<=Math.floor((box[1]+h)/256);ty++)if(ty>=0&&ty<2**z)tiles.push({x:tx,y:ty,href:`https://tile.openstreetmap.org/${z}/${((tx%2**z)+2**z)%2**z}/${ty}.png`});
  return{z,box,tiles,orders:geo.map(o=>({o,pts:o.geo.boundary.map(([la,ln])=>CFHViews.osmProject(la,ln,z))}))};
};
CFHViews.kartaOsm=(vm,v,ui)=>{
  const{esc}=ui,view=CFHViews.osmView(vm.orders),head=`<div class="view-head"><h2 id="mapTitle">${ui.term('Aufträge auf der Karte','Uppdrag på kartan')}</h2><button class="ghost small" data-action="hide-view" data-view-key="map" title="${esc('Ansicht ausblenden')}" aria-label="${esc('Ansicht ausblenden')}">✕</button></div>`;
  const attribution=`<p class="map-attribution" data-osm-attribution>${esc('Grundkarte')}: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${esc('OpenStreetMap-Mitwirkende')}</a> · ODbL</p>`;
  if(!view)return `<section class="cfh-view" data-view="map" data-basemap="osm" aria-labelledby="mapTitle">${head}<div class="map-empty" data-basemap-empty><p><b>${esc('OpenStreetMap-Grundkarte angefordert')}</b> <span class="code" data-no-translate>?basemap=osm</span></p><p>${esc('Die Arbeitsaufträge dieser Demo haben keine Geokoordinaten: Bestände, Polterplätze und Routen liegen in Bildkoordinaten des Luftbilds. Ohne Georeferenzierung kann die Grundkarte sie nicht lagerichtig zeigen.')}</p><button type="button" data-action="map-basemap" data-basemap="photo">${esc('Luftbild verwenden')}</button></div>${attribution}</section>`;
  const body=view.tiles.map(t=>`<image href="${esc(t.href)}" x="${t.x*256}" y="${t.y*256}" width="256" height="256"/>`).join('')+view.orders.map(({o,pts})=>`<g class="map-stand pill-${esc(o.pill.cls)} ${(v.checked||[]).includes(o.id)||o.id===v.selected?'selected':''}" data-action="select-order" data-order="${esc(o.id)}" role="button" tabindex="0" aria-label="${esc(o.name)}"><polygon points="${pts.map(p=>p.join(',')).join(' ')}"/></g>`).join('');
  return `<section class="cfh-view" data-view="map" data-basemap="osm" aria-labelledby="mapTitle">${head}<div class="map-wrap"><svg class="cfh-map" viewBox="${view.box.join(' ')}" role="group" aria-label="OpenStreetMap" data-map-scope="osm">${body}</svg></div>${attribution}</section>`;
};
CFHViews.karta=(vm,v,ui)=>{
  if(v.basemap==='osm')return CFHViews.kartaOsm(vm,v,ui);
  const{esc,term,ibtn}=ui,R=WorksiteRoutes,{level,L,box}=CFHViews.mapBox(vm,v),tool=v.mapToolScope==='main'?v.mapTool:null;
  const body=CFHViews.mapBody(vm,v,ui,{orders:vm.orders,box,L,level,scope:'main'});
  const chrome=CFHViews.mapChrome(vm,v,ui,{scope:'main',L,level});
  return `<section class="cfh-view" data-view="map" aria-labelledby="mapTitle">
  <div class="view-head"><h2 id="mapTitle">${term('Aufträge auf der Karte','Uppdrag på kartan')}</h2><button class="ghost small" data-action="hide-view" data-view-key="map" title="${esc('Ansicht ausblenden')}" aria-label="${esc('Ansicht ausblenden')}">✕</button></div>
  ${chrome.bar}
  <div class="map-wrap" data-map-tool="${esc(tool||'')}">
  <svg class="cfh-map" viewBox="${box.join(' ')}" role="group" aria-label="${esc('Echtes Luftbild mit fiktiven Hieben')}" data-map-level="${level}" data-map-scope="main">${body}</svg>
  <div class="map-ctrl pan" role="group" aria-label="${esc('Karte verschieben')}"><span></span>${ibtn('map-pan','▲','Nach Norden verschieben',null,{attrs:'data-dx="0" data-dy="-1"'})}<span></span>${ibtn('map-pan','◀','Nach Westen verschieben',null,{attrs:'data-dx="-1" data-dy="0"'})}${ibtn('map-pan-reset','•','Karte zentrieren')}${ibtn('map-pan','▶','Nach Osten verschieben',null,{attrs:'data-dx="1" data-dy="0"'})}<span></span>${ibtn('map-pan','▼','Nach Süden verschieben',null,{attrs:'data-dx="0" data-dy="1"'})}<span></span></div>
  <div class="map-ctrl zoom">${ibtn('map-zoom-in','+','Vergrößern',null,{disabled:level>=3})}${ibtn('map-zoom-out','−','Verkleinern',null,{disabled:!level})}</div>
  ${chrome.overlay}
  </div>
  <p class="note map-note">${esc('Klick wählt einen Auftrag, Umschalt+Klick fügt hinzu, das Auswahlrechteck wählt alle darin. Ausgewählte Bestände in den Kalender ziehen.')}</p>
  ${R.attribution()}
  </section>`;
};
