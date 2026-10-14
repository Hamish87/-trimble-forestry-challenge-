/* Uppdrag på kartan — the game's orthophoto and stand overlays (dist/routes.js): green circles clustered with counts at
   small scale, polygons at large scale, Avlägg (landings), BIO symbols; Göm karta, print, add landing [SS][MW]. */
'use strict';
CFHViews.MAP_LEVELS=[{name:'Übersicht',box:[-620,-350,1860,1050],cluster:300,r:46},{name:'Revier',box:[0,0,620,350],cluster:45,r:15},{name:'Bestand',box:[0,0,620,350],polygons:true},{name:'Detail',box:null,polygons:true}];
CFHViews.clusters=(orders,radius)=>{
  const out=[];for(const o of orders){const [x,y]=o.centroid,c=out.find(c=>Math.hypot(c.x-x,c.y-y)<radius);if(c){c.items.push(o);c.x=(c.x*(c.items.length-1)+x)/c.items.length;c.y=(c.y*(c.items.length-1)+y)/c.items.length;}else out.push({x,y,items:[o]});}
  return out;
};
CFHViews.karta=(vm,v,ui)=>{
  const{esc,num,sv,code}=ui,R=WorksiteRoutes,level=Math.max(0,Math.min(3,v.mapZoom|0)),L=CFHViews.MAP_LEVELS[level];
  const sel=vm.orders.find(o=>o.id===v.selected);
  let box=L.box;if(!box){const t=sel||vm.orders[0],xs=t.boundary.map(p=>p[0]),ys=t.boundary.map(p=>p[1]),pad=24;box=[Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)-Math.min(...xs)+2*pad,Math.max(...ys)-Math.min(...ys)+2*pad];}
  const img=`${ui.DIST}${R.imageUrl}`,route=vm.plan.routeOrder;
  let body=`<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#0b3a5a"/><image href="${esc(img)}" x="0" y="0" width="620" height="350" preserveAspectRatio="none"/><rect x="0" y="0" width="620" height="350" fill="#00253d" fill-opacity=".12"/>`;
  if(!L.polygons){
    if(level===0)body+=`<rect x="0" y="0" width="620" height="350" fill="none" stroke="#a5dcf6" stroke-dasharray="12 8" stroke-width="3"/>`;
    for(const c of CFHViews.clusters(vm.orders,L.cluster)){
      const one=c.items.length===1?c.items[0]:null,isSel=c.items.some(o=>o.id===v.selected);
      body+=one?`<g class="map-circle ${isSel?'selected':''}" data-action="select-order" data-order="${esc(one.id)}" tabindex="0" role="button" aria-label="${esc(one.name)}"><circle cx="${c.x}" cy="${c.y}" r="${L.r}"/></g>`
        :`<g class="map-circle cluster ${isSel?'selected':''}" data-action="map-zoom-in" tabindex="0" role="button" aria-label="${esc('Gruppe vergrößern')}: ${num(c.items.length,0)} ${esc('Aufträge')}"><circle cx="${c.x}" cy="${c.y}" r="${L.r*1.25}"/><text x="${c.x}" y="${c.y+L.r*.4}" text-anchor="middle" font-size="${L.r*1.1}">${num(c.items.length,0)}</text></g>`;
    }
  }else{
    for(const o of vm.orders){
      const site=R.sites[o.standId],[ax,ay,k]=site.anchor,pts=o.boundary.map(p=>p.join(',')).join(' '),seq=route.indexOf(o.id);
      body+=`<g class="map-stand tone-${o.info.tone} ${o.id===v.selected?'selected':''}" data-action="select-order" data-order="${esc(o.id)}" tabindex="0" role="button" aria-label="${esc(o.name)}"><polygon points="${pts}"/></g>`;
      body+=`<g transform="translate(${ax} ${ay}) scale(${k})" class="map-overlay" aria-hidden="true">${R.neighbour(o.standId)}</g>`;
      const [lx,ly]=o.landing.point;body+=`<g class="map-landing"><rect x="${lx-5}" y="${ly-5}" width="10" height="10" rx="2"/><text x="${lx+8}" y="${ly+4}">${esc(o.landing.id)}</text></g>`;
      for(const p of vm.plan.edits[o.id]?.landings||[])body+=`<g class="map-landing extra"><rect x="${p[0]-4}" y="${p[1]-4}" width="8" height="8" rx="1"/></g>`;
      if(o.bio){const [bx,by]=o.bio.point;body+=`<g class="map-bio" data-action="open-order" data-order="${esc(o.id)}" data-tab="info" role="button" tabindex="0" aria-label="${esc(o.bio.code)}"><circle cx="${bx}" cy="${by}" r="${Math.max(9,o.bio.radius)}"/><text x="${bx}" y="${by+4}" text-anchor="middle">!</text><text class="bio-code" x="${bx}" y="${by-Math.max(9,o.bio.radius)-3}" text-anchor="middle">${esc(o.bio.code)}</text></g>`;}
      const [cx,cy]=o.centroid;body+=`<g class="map-label" aria-hidden="true"><rect x="${cx-48}" y="${cy-11}" width="96" height="22" rx="3"/><text x="${cx}" y="${cy+4}" text-anchor="middle">${esc(o.name)}</text></g>`;
      if(seq>=0)body+=`<g class="map-seq" aria-hidden="true"><circle cx="${cx-56}" cy="${cy}" r="9"/><text x="${cx-56}" y="${cy+4}" text-anchor="middle">${num(seq+1,0)}</text></g>`;
      if(o.dispatch.harvester)body+=`<g class="map-machine h"><rect x="${cx-7}" y="${cy-36}" width="14" height="14" rx="2"/><text x="${cx}" y="${cy-25}" text-anchor="middle">H</text></g>`;
      if(o.dispatch.forwarder)body+=`<g class="map-machine f"><rect x="${cx+10}" y="${cy-36}" width="14" height="14" rx="2"/><text x="${cx+17}" y="${cy-25}" text-anchor="middle">F</text></g>`;
    }
  }
  return `<section class="cfh-view" data-view="map" aria-labelledby="mapTitle">
  <div class="view-head"><h2 id="mapTitle">${sv('Uppdrag på kartan')} <small>${esc('Aufträge auf der Karte')}</small></h2><button class="ghost" data-action="hide-view" data-view-key="map" title="${esc('Ansicht ausblenden')}">${sv('Göm karta')}</button></div>
  <div class="toolbar"><button data-action="map-zoom-out" aria-label="${esc('Verkleinern')}" ${level?'':'disabled'}>−</button><span class="zoom-level">${esc(L.name)}</span><button data-action="map-zoom-in" aria-label="${esc('Vergrößern')}" ${level<3?'':'disabled'}>+</button>
    <button data-action="map-add-landing" ${sel?'':'disabled'}>${esc('Avlägg setzen')}</button><button data-action="map-print">${esc('Drucken')}</button></div>
  <svg class="cfh-map" viewBox="${box.join(' ')}" role="group" aria-label="${esc('Echtes Luftbild mit fiktiven Hieben')}" data-map-level="${level}">${body}</svg>
  <div class="legend"><span><i class="map-key-circle"></i>${esc('Auftrag (Anzahl bei Gruppierung)')}</span><span><i class="map-key-landing"></i>${sv('Avlägg')} · ${esc('Polter')}</span><span><i class="map-key-bio"></i>${esc('Schutzbereich')}</span><span>H / F · ${esc('Disposition im Spiel')}</span></div>
  ${R.attribution()}
  </section>`;
};
