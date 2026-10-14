/* Uppdrag på kartan [M41][M42][M73] — the game's orthophoto and stand overlays (dist/routes.js): green circles clustered
   with counts at small scale, stand polygons with black label boxes "client name order-nr" at large scale; map controls
   pan ▲◀▶▼, zoom +/−, measure, pin, polygon, print; scale label, coordinate readout, layers and legend. */
'use strict';
// Scale labels are [DEMO] approximations: the orthophoto is not georeferenced in the game.
CFHViews.MAP_LEVELS=[{name:'Übersicht',scale:'≈ 1:50 000',box:[-620,-350,1860,1050],cluster:300,r:46},{name:'Revier',scale:'≈ 1:10 000',box:[0,0,620,350],cluster:45,r:15},{name:'Bestand',scale:'≈ 1:5 000',box:[0,0,620,350],polygons:true},{name:'Detail',scale:'≈ 1:2 000',box:null,polygons:true}];
CFHViews.clusters=(orders,radius)=>{
  const out=[];for(const o of orders){const [x,y]=o.centroid,c=out.find(c=>Math.hypot(c.x-x,c.y-y)<radius);if(c){c.items.push(o);c.x=(c.x*(c.items.length-1)+x)/c.items.length;c.y=(c.y*(c.items.length-1)+y)/c.items.length;}else out.push({x,y,items:[o]});}
  return out;
};
CFHViews.mapBox=(vm,v)=>{
  const level=Math.max(0,Math.min(3,v.mapZoom|0)),L=CFHViews.MAP_LEVELS[level],sel=vm.orders.find(o=>o.id===v.selected);
  let box=L.box;if(!box){const t=sel||vm.orders[0],xs=t.boundary.map(p=>p[0]),ys=t.boundary.map(p=>p[1]),pad=24;box=[Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)-Math.min(...xs)+2*pad,Math.max(...ys)-Math.min(...ys)+2*pad];}
  const [px,py]=v.mapPan||[0,0];return{level,L,box:[box[0]+px*box[2],box[1]+py*box[3],box[2],box[3]]};
};
/** Stand drawing shared with the order detail page. */
CFHViews.standSvg=(o,ui,{label=true,selected=false,tone='',interactive=true}={})=>{
  const{esc}=ui,pts=o.boundary.map(p=>p.join(',')).join(' '),[cx,cy]=o.centroid;
  let g=`<g class="map-stand ${tone?'pill-'+tone:''} ${selected?'selected':''}" ${interactive?`data-action="select-order" data-order="${esc(o.id)}" tabindex="0" role="button" aria-label="${esc(o.name)}"`:''}><polygon points="${pts}"/></g>`;
  if(label){const text=`${o.clientCode} ${o.name} ${o.id}`,w=Math.max(70,text.length*5.6);g+=`<g class="map-label" aria-hidden="true"><rect x="${cx-w/2}" y="${cy-10}" width="${w}" height="20" rx="2"/><text x="${cx}" y="${cy+4}" text-anchor="middle"><tspan data-no-translate>${esc(o.clientCode)} </tspan>${esc(o.name)}<tspan data-no-translate> ${esc(o.id)}</tspan></text></g>`;}
  return g;
};
CFHViews.karta=(vm,v,ui)=>{
  const{esc,num,term,ibtn}=ui,R=WorksiteRoutes,{level,L,box}=CFHViews.mapBox(vm,v),layers={photo:true,overlay:true,landings:true,...(v.mapLayers||{})};
  const sel=vm.orders.find(o=>o.id===v.selected),img=`${ui.DIST}${R.imageUrl}`,route=vm.plan.routeOrder;
  let body=`<rect x="${box[0]-box[2]}" y="${box[1]-box[3]}" width="${box[2]*3}" height="${box[3]*3}" fill="#0b3a5a"/>${layers.photo?`<image href="${esc(img)}" x="0" y="0" width="620" height="350" preserveAspectRatio="none"/><rect x="0" y="0" width="620" height="350" fill="#00253d" fill-opacity=".12"/>`:''}`;
  if(!L.polygons){
    if(level===0)body+=`<rect x="0" y="0" width="620" height="350" fill="none" stroke="#a5dcf6" stroke-dasharray="12 8" stroke-width="3"/>`;
    for(const c of CFHViews.clusters(vm.orders,L.cluster)){
      const one=c.items.length===1?c.items[0]:null,isSel=c.items.some(o=>o.id===v.selected);
      body+=one?`<g class="map-circle ${isSel?'selected':''}" data-action="select-order" data-order="${esc(one.id)}" tabindex="0" role="button" aria-label="${esc(one.name)}"><circle cx="${c.x}" cy="${c.y}" r="${L.r}"/></g>`
        :`<g class="map-circle cluster ${isSel?'selected':''}" data-action="map-zoom-in" tabindex="0" role="button" aria-label="${esc('Gruppe vergrößern')}: ${num(c.items.length,0)} ${esc('Aufträge')}"><circle cx="${c.x}" cy="${c.y}" r="${L.r*1.25}"/><text x="${c.x}" y="${c.y+L.r*.4}" text-anchor="middle" font-size="${L.r*1.1}">${num(c.items.length,0)}</text></g>`;
    }
  }else{
    for(const o of vm.orders){
      const site=R.sites[o.standId],[ax,ay,k]=site.anchor,seq=route.indexOf(o.id),[cx,cy]=o.centroid;
      body+=CFHViews.standSvg(o,ui,{label:false,selected:o.id===v.selected,tone:o.pill.cls});
      if(layers.overlay)body+=`<g transform="translate(${ax} ${ay}) scale(${k})" class="map-overlay" aria-hidden="true">${R.neighbour(o.standId)}</g>`;
      if(layers.landings){const [lx,ly]=o.landing.point;body+=`<g class="map-landing"><rect x="${lx-5}" y="${ly-5}" width="10" height="10" rx="2"/><text x="${lx+8}" y="${ly+4}" data-no-translate>${esc(o.landing.id)}</text></g>`;
        for(const p of vm.plan.edits[o.id]?.landings||[])body+=`<g class="map-landing extra"><rect x="${p[0]-4}" y="${p[1]-4}" width="8" height="8" rx="1"/></g>`;}
      if(o.bio&&layers.overlay){const [bx,by]=o.bio.point;body+=`<g class="map-bio" data-action="open-order" data-order="${esc(o.id)}" data-tab="consider" role="button" tabindex="0" aria-label="${esc(o.bio.code)}"><circle cx="${bx}" cy="${by}" r="${Math.max(9,o.bio.radius)}"/><text x="${bx}" y="${by+4}" text-anchor="middle">!</text><text class="bio-code" x="${bx}" y="${by-Math.max(9,o.bio.radius)-3}" text-anchor="middle" data-no-translate>${esc(o.bio.code)}</text></g>`;}
      body+=CFHViews.standSvg(o,ui,{label:true,interactive:false}).replace(/^<g class="map-stand[^]*?<\/g>/,'');
      if(seq>=0)body+=`<g class="map-seq" aria-hidden="true"><circle cx="${cx-62}" cy="${cy}" r="9"/><text x="${cx-62}" y="${cy+4}" text-anchor="middle">${num(seq+1,0)}</text></g>`;
      if(o.dispatch.harvester)body+=`<g class="map-machine h"><rect x="${cx-7}" y="${cy-36}" width="14" height="14" rx="2"/><text x="${cx}" y="${cy-25}" text-anchor="middle">H</text></g>`;
      if(o.dispatch.forwarder)body+=`<g class="map-machine f"><rect x="${cx+10}" y="${cy-36}" width="14" height="14" rx="2"/><text x="${cx+17}" y="${cy-25}" text-anchor="middle">F</text></g>`;
    }
  }
  const legend=v.mapLegend?`<div class="map-pop legend-pop"><b>${esc('Legende')}</b><span><i class="map-key-circle"></i>${esc('Auftrag (Anzahl bei Gruppierung)')}</span><span><i class="map-key-landing"></i>${term('Polterplatz','Avlägg',{tip:true})}</span><span><i class="map-key-bio"></i>${esc('Schutzbereich')}</span><span>H / F · ${esc('Disposition im Spiel')}</span></div>`:'';
  const layerPop=v.mapLayerMenu?`<div class="map-pop layer-pop"><b>${esc('Kartenebenen')}</b>${[['photo','Luftbild'],['overlay','Nachbarflächen und Schutzbereiche'],['landings','Polterplätze']].map(([k,l])=>`<label><input type="checkbox" data-change="map-layer" value="${k}" ${layers[k]?'checked':''}> ${esc(l)}</label>`).join('')}</div>`:'';
  return `<section class="cfh-view" data-view="map" aria-labelledby="mapTitle">
  <div class="view-head"><h2 id="mapTitle">${term('Aufträge auf der Karte','Uppdrag på kartan')}</h2><button class="ghost small" data-action="hide-view" data-view-key="map" title="${esc('Ansicht ausblenden')}" aria-label="${esc('Ansicht ausblenden')}">✕</button></div>
  <div class="map-wrap">
  <svg class="cfh-map" viewBox="${box.join(' ')}" role="group" aria-label="${esc('Echtes Luftbild mit fiktiven Hieben')}" data-map-level="${level}">${body}</svg>
  <div class="map-ctrl pan" role="group" aria-label="${esc('Karte verschieben')}"><span></span>${ibtn('map-pan','▲','Nach Norden verschieben',null,{attrs:'data-dx="0" data-dy="-1"'})}<span></span>${ibtn('map-pan','◀','Nach Westen verschieben',null,{attrs:'data-dx="-1" data-dy="0"'})}${ibtn('map-pan-reset','•','Karte zentrieren')}${ibtn('map-pan','▶','Nach Osten verschieben',null,{attrs:'data-dx="1" data-dy="0"'})}<span></span>${ibtn('map-pan','▼','Nach Süden verschieben',null,{attrs:'data-dx="0" data-dy="1"'})}<span></span></div>
  <div class="map-ctrl zoom">${ibtn('map-zoom-in','+','Vergrößern',null,{disabled:level>=3})}${ibtn('map-zoom-out','−','Verkleinern',null,{disabled:!level})}</div>
  <div class="map-ctrl tools">${ibtn('','📏','Messen ist nicht Teil der Demo',null,{disabled:true})}${ibtn('map-add-landing','📍','Polterplatz setzen','Avlägg',{disabled:!sel,attrs:`aria-pressed="${!!v.landingMode}"`})}${ibtn('','⬠','Polygon zeichnen ist nicht Teil der Demo',null,{disabled:true})}${ibtn('map-print','🖨','Drucken')}</div>
  <div class="map-ctrl corner">${ibtn('map-layers','🗂','Kartenebenen',null,{attrs:`aria-expanded="${!!v.mapLayerMenu}"`})}${ibtn('map-legend','💡','Legende',null,{attrs:`aria-expanded="${!!v.mapLegend}"`})}</div>
  ${layerPop}${legend}
  <div class="map-status"><span title="${esc('Näherung, das Luftbild ist nicht georeferenziert')}">${esc('Maßstab')} ${esc(L.scale)} · ${esc(L.name)}</span><span data-map-coords>${esc('Bildkoordinaten')}: –</span></div>
  </div>
  ${R.attribution()}
  </section>`;
};
