/* Holztransport demo · the carrier workspace: parties (customer, carrier, mills, sites, forest managers), users and
   roles, trucks, driver groups, quotas. Everything fictional except the two public bodies the specification names as
   scenarios (Stadt Mengen, Bayerische Staatsforsten). Persons are demo placeholders. */
'use strict';
(function(){
const PARTIES=[
  {id:'P-CARRIER',roles:['carrier'],name:'Musterholz Transporte GmbH',address:'Industriestraße 12, 88339 Bad Waldsee',lat:47.92,lon:9.75,inbox:'auftrag@musterholz-transporte.demo'},
  {id:'P-MENGEN',roles:['customer','forestManager'],name:'Stadt Mengen (Stadtforst)',address:'Hauptstr. 90, 88512 Mengen',lat:48.0497,lon:9.3297,contacts:[{role:'Forstrevier',name:'Revierleitung Stadtwald (Demo)',phone:'+49 7572 000-00'}]},
  {id:'P-WALDKONTOR',roles:['customer'],name:'Waldkontor Nord GmbH',address:'Schmiedekoppel 7–9, 23847 Kastorf',lat:53.75,lon:10.56,contacts:[{role:'Disposition',name:'Disposition Waldkontor (Demo)',phone:'+49 4501 000-00'}]},
  {id:'P-SAEGEWERK-BARUTH',roles:['receivingSite','pickupSite'],name:'Sägewerk Baruth AG',address:'An der Birkenpfuhlheide 1, 15837 Baruth/Mark',lat:52.045,lon:13.405},
  {id:'P-PELLETWERK-ANHALT',roles:['mill','receivingSite'],name:'Pelletwerk Anhalt GmbH',address:'Einsteinstraße 17, 06785 Oranienbaum',lat:51.80,lon:12.40,contacts:[{role:'Werkseingang',name:'Waage Pelletwerk (Demo)',phone:'+49 34904 000-00'}]},
  {id:'P-KRAFFT',roles:['customer'],name:'Holzhandel Krafft-Ebnat KG',address:'Ebnater Hauptstr. 23, 73432 Aalen-Ebnat',lat:48.80,lon:10.18,contacts:[{role:'Revierleiter',name:'Revierleiter Mietingen (Demo)',phone:'+49 151 000000-00'}]},
  {id:'P-SAEGEWERK-POLSINGEN',roles:['mill','receivingSite'],name:'Sägewerk Polsingen GmbH',address:'Frankenstraße 29, 91805 Polsingen',lat:48.93,lon:10.80,contacts:[{role:'Werkseingang',name:'Rundholzplatz Polsingen (Demo)',phone:'+49 9093 000-00'}]},
  {id:'P-BAYSF',roles:['customer','forestManager'],name:'Bayerische Staatsforsten · Forstbetrieb Kaisheim',address:'Hauptstraße, 86687 Kaisheim',lat:48.77,lon:10.80,contacts:[{role:'Disposition',name:'BaySF Disposition Regensburg (Demo)',phone:'+49 941 000-00'},{role:'Revierleiter 14 Auernheim',name:'Revierleitung Auernheim (Demo)',phone:'+49 175 000000-0'}]},
  {id:'P-SAEGEWERK-KOESCHING',roles:['mill','receivingSite'],name:'Sägewerk Kösching GmbH',address:'Einsteinstraße, 85092 Kösching',lat:48.81,lon:11.50,contacts:[{role:'Werkseingang',name:'Waage Kösching (Demo)',phone:'+49 8456 000-00'}]},
  {id:'P-ACHENTAL',roles:['customer','mill'],name:'Holzwerke Achental GmbH',address:'Altenmais 9, 94244 Teisnach',lat:49.04,lon:12.99,contacts:[{role:'Disponent',name:'Disposition Holzwerke (Demo)',phone:'+49 9403 000-00'}]},
  {id:'P-REVIER-AACH',roles:['forestManager'],name:'Revier Stadt Aach',address:'Hauptstraße, 78267 Aach',lat:47.845,lon:8.852,contacts:[{role:'Einsatzleiter/Revierleiter',name:'Revierleitung Aach (Demo)',phone:'+49 7774 000-00'},{role:'Ansprechpartner vor Ort',name:'Forstwirt vor Ort (Demo)',phone:'+49 160 000000-0'}]}
];
const USERS=[
  {id:'U-OWNER',name:'Lena Baur',title:'Inhaberin · Disposition + Fahrerin',roles:['admin','dispatcher','driver'],truckId:'T-1',groupId:'G-SUED'},
  {id:'U-DISPO',name:'Tobias Renz',title:'Disponent',roles:['dispatcher']},
  {id:'U-D1',name:'Murat Kaya',title:'Fahrer',roles:['driver'],truckId:'T-2',groupId:'G-SUED'},
  {id:'U-D2',name:'Jana Vogel',title:'Fahrerin',roles:['driver'],truckId:'T-3',groupId:'G-SUED'},
  {id:'U-D3',name:'Stefan Hörmann',title:'Fahrer',roles:['driver'],truckId:'T-4',groupId:'G-NORD'}
];
const TRUCKS=[
  {id:'T-1',reg:'RV-MH 101',kind:'Rundholz-Lkw mit Anhänger',capacity:{value:25,unit:'fm'},note:'Kran'},
  {id:'T-2',reg:'RV-MH 202',kind:'Rundholz-Lkw mit Anhänger',capacity:{value:25,unit:'fm'},note:'Kran'},
  {id:'T-3',reg:'RV-MH 303',kind:'Schubboden-Sattelzug',capacity:{value:90,unit:'m3'},note:'Hackgut/Kappholz'},
  {id:'T-4',reg:'RV-MH 404',kind:'Rundholz-Lkw mit Anhänger',capacity:{value:27,unit:'fm'},note:'Kran, Kurzholz'}
];
const GROUPS=[{id:'G-SUED',name:'Gruppe Süd',members:['U-OWNER','U-D1','U-D2']},{id:'G-NORD',name:'Gruppe Nord',members:['U-D3']}];
const QUOTAS=[{id:'Q-1',customerId:'P-WALDKONTOR',millId:'P-PELLETWERK-ANHALT',period:'2026-10',qty:20,unit:'ldg',note:'Demo-Kontingent (Praxis mit Pilotkunden zu bestätigen)'}];
const SETTINGS={tolerancePct:0.5,toleranceNote:'Platzhalter — Schwellen werden mit Pilotkunden vereinbart',retentionMonths:24,localExpiryDays:14,driverSeesRates:false};
const api={PARTIES,USERS,TRUCKS,GROUPS,QUOTAS,SETTINGS,party:id=>PARTIES.find(p=>p.id===id)||null,user:id=>USERS.find(u=>u.id===id)||null,truck:id=>TRUCKS.find(t=>t.id===id)||null};
(globalThis.TransportData=globalThis.TransportData||{}).fleet=api;
if(typeof module!=='undefined')module.exports=api;
})();
