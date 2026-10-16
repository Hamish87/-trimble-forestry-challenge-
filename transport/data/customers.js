/* Holztransport demo · customer profiles — data, not code (DM "Customer profile"). A profile holds label synonyms,
   default units and measurement basis, reference formats (leading zeroes kept), known layouts, the document classes
   the customer sends, the issuer's region for coordinate plausibility, and how many documents were already reviewed
   (the first documents of a new customer get a full review). The canonical label dictionary is the union the
   specification's label dictionary describes; profiles add their own wording. */
'use strict';
(function(){
const CANONICAL_LABELS={
  documentNumber:['Fuhrauftrag Nr.','Holzbereitstellung Nr.','Frachtauftrag','Transportauftrag Nr.','Transportmeldung Nr.','Transportauftrag','Nr.','Auftragsnummer','Auftrags-Nr.'],
  issuer:['Auftraggeber','Absender / from','Absender','Lieferant'],
  carrier:['Frachtführer','Fuhrunternehmer','Spedition','Frächter','Empfänger / to'],
  destination:['Zielwerk','Empfänger / Zielwerk','Lieferadresse','Empfänger','Werk'],
  pickupAddress:['Abholadresse','Abholort','Ladestelle'],
  partieNo:['Partie-Nr','Partie-Nr.','Kunden-Partie','Kunden-Partie-Nr.'],
  kaufNo:['Kauf-Nr.','Kauf-Nr','Verkaufsnummer'],
  orderLos:['Auftrag + Los','Hieb- / Losnummer','Hieb-/Losnummer'],
  polterNo:['Polter-Nr','Polter-Nr.','Polternummer'],
  reference:['Kostenstelle','Revier','Forstort','Barcode'],
  documentDate:['Auftragsdatum','Datum / date','Druck vom','Datum','vom'],
  windowFrom:['Abfuhrbeginn','Auftrag vom','Abholdatum','Abfuhrzeitraum','Lieferdatum'],
  windowTo:['Abfuhrende','abzuschließen bis','bis'],
  measurementBasis:['Abrechnungsmaß'],
  assortmentHeader:['Sorte','Sortiment','Material'],
  freightRate:['Frachtsatz','Frachtsatz Netto','Preis','Fracht'],
  paymentTerms:['Zahlungsziel','Skonto'],
  priority:['Priorität'],
  certification:['Zertifiziert nach PEFC Nummer','PEFC','FSC'],
  remark:['Bemerkung','Bem. Logistik','Hinweis','Anlieferung/Zeitfenster','Verladeart','Fahrzeugart'],
  contact:['Disponent','Einsatzleiter/Revierleiter','Ansprechpartner vor Ort','Revierleiter','Kontakt','Ansprechpartner BaySF Disposition','zu Händen / attention'],
  loadingSlots:['Ladenummern','Ladenummer','EK-Ladenummern'],
  quantityTotal:['Gesamtmenge ca.','Gesamtmenge','Menge','Gesamtmasse laut Auftrag'],
  totals:['Gesamtsumme','Gesamt','Summe','Zwischensumme'],
  lotSummary:['Summe je Los','Sortenzusammenfassung'],
  breakdown:['Polterinfo'],
  tableStart:['Folgende Polter sind abzufahren','Polterliste'],
  completion:['Abfuhr restlos beendet am','Fertigmeldung','Abfuhrmeldung'],
  // table columns
  colFowj:['Fowj','FWJ','Forstwirtschaftsjahr'],colHieb:['Hieb'],colLos:['Los'],colPolter:['Polter','Polter-Nr'],colPos:['Pos.','Pos'],
  colQty:['Menge','Fm ca.','Menge fm','Menge rm','Vol. gesch. FM/RM'],colPieces:['Stück','Stückzahl','Stck'],colSpecies:['Holzart','Baumart'],
  colAssortment:['Sortiment','Sorte'],colLength:['Länge (m)','Länge'],colGrade:['Güte','Qualität'],colCoords:['GPS - Koordinaten','GPS-Koordinaten','GPS Koordinaten','Koordinaten'],
  colCoordX:['GPS- Koord. X','GPS-Koord. X','Koord. X','Rechtswert','Ost'],colCoordY:['GPS- Koord. Y','GPS-Koord. Y','Koord. Y','Hochwert','Nord'],colNote:['Hinweis/Ergänzungen','Bemerkung']
};
const SPECIES={FI:'Fichte',TA:'Tanne',KI:'Kiefer',LA:'Lärche',DGL:'Douglasie',BU:'Buche',EI:'Eiche',ES:'Esche',AH:'Ahorn',BI:'Birke',ER:'Erle',PA:'Pappel',Fichte:'Fichte',Kiefer:'Kiefer',Buche:'Buche',Eiche:'Eiche',Tanne:'Tanne',Lärche:'Lärche'};
const ASSORTMENTS={L:'Langholz',SL:'Standardlänge',IL:'Industrieholz lang',IS:'Industrieholz kurz','IL/IS':'Industrieholz',IE:'Energieholz',BC:'Güteklasse B/C (wie gedruckt)'};
const PROFILES=[
  {id:'stadt-mengen',partyId:'P-MENGEN',name:'Stadt Mengen (Stadtforst)',senderDomains:['mengen.demo'],letterhead:['Stadt Mengen'],
   labels:{documentNumber:['Nr.'],documentDate:['vom']},units:{quantity:'fm'},measurementBasis:null,decimal:'mixed',
   referenceFormats:{hieb:'^\\d{4}$',los:'^\\d{3}$',polter:'^\\d{1,3}$'},layouts:['abfuhr32'],documentClasses:['order'],
   documentTypes:['Transportmeldung'],region:{lat:48.05,lon:9.33,radiusKm:25,name:'Stadtwald Mengen'},pickupKind:'roadside',reviewedDocuments:0},
  {id:'waldkontor-nord',partyId:'P-WALDKONTOR',name:'Waldkontor Nord GmbH',senderDomains:['waldkontor-nord.demo'],letterhead:['waldkontor'],
   labels:{documentNumber:[],issuer:['Absender / from'],carrier:['Empfänger / to'],windowFrom:['Abholdatum'],windowTo:['Lieferdatum'],destination:['Lieferadresse'],pickupAddress:['Abholadresse'],quantityTotal:['Menge'],loadingSlots:['Ladenummern'],assortmentHeader:['Material'],remark:['Fahrzeugart'],freightRate:['Preis'],paymentTerms:['Zahlungsziel'],contact:['Kontakt']},
   units:{quantity:'ldg'},measurementBasis:null,decimal:'de',referenceFormats:{ladenummer:'^0?\\d{9,10}$'},layouts:['fax-kv'],documentClasses:['order'],
   documentTypes:['Transportauftrag'],region:{lat:52.05,lon:13.40,radiusKm:60,name:'Baruth/Mark'},pickupKind:'industrial',reviewedDocuments:0},
  {id:'krafft-ebnat',partyId:'P-KRAFFT',name:'Holzhandel Krafft-Ebnat KG',senderDomains:['krafft-ebnat.demo'],letterhead:['KRAFFT','Krafft-Ebnat'],
   labels:{documentNumber:['Holzbereitstellung Nr.'],windowFrom:['Abfuhrzeitraum'],contact:['Revierleiter'],orderLos:['Hieb- / Losnummer']},
   units:{quantity:'fm'},measurementBasis:null,decimal:'de',referenceFormats:{hieb:'^\\d{4}$',los:'^\\d{2}$',hiebLos:'^\\d{4}/\\d{1,2}$'},layouts:['abfuhr32net'],documentClasses:['order','map'],
   documentTypes:['Holzbereitstellung'],region:{lat:48.17,lon:9.93,radiusKm:40,name:'Revier Mietingen'},pickupKind:'roadside',reviewedDocuments:0},
  {id:'baysf-kaisheim',partyId:'P-BAYSF',name:'Bayerische Staatsforsten · Forstbetrieb Kaisheim',senderDomains:['baysf.demo'],letterhead:['Bayerische Staatsforsten','BaySF'],
   labels:{documentNumber:['Frachtauftrag'],issuer:['Lieferant'],carrier:['Spedition'],destination:['Empfänger'],windowFrom:['Auftrag vom'],windowTo:['abzuschließen bis'],freightRate:['Frachtsatz Netto'],partieNo:['Kunden-Partie'],polterNo:['Polter-Nr'],quantityTotal:['Gesamtmenge ca.'],contact:['Ansprechpartner BaySF Disposition','Revierleiter'],remark:['Anlieferung/Zeitfenster']},
   units:{quantity:'fm'},measurementBasis:null,decimal:'de',referenceFormats:{polter:'^\\d{6}P\\d{4}$',deliveryNote:'^\\d{4}A\\d{5}$'},layouts:['baysf-frachtauftrag','baysf-lieferschein'],documentClasses:['order','delivery_note_form'],
   documentTypes:['Frachtauftrag'],region:{lat:48.95,lon:10.90,radiusKm:40,name:'Revier Auernheim'},pickupKind:'roadside',reviewedDocuments:0},
  {id:'waldpflege-oberschwaben',partyId:'P-WALDPFLEGE',name:'Waldpflege Oberschwaben GmbH',senderDomains:['waldpflege-oberschwaben.demo'],letterhead:['Waldpflege Oberschwaben'],
   labels:{documentNumber:['Fuhrauftrag Nr.'],issuer:['Auftraggeber'],carrier:['Frachtführer','Fuhrunternehmer'],destination:['Zielwerk','Empfänger / Zielwerk'],windowFrom:['Abfuhrbeginn'],windowTo:['Abfuhrende'],measurementBasis:['Abrechnungsmaß'],assortmentHeader:['Sorte'],freightRate:['Frachtsatz'],certification:['Zertifiziert nach PEFC Nummer'],contact:['Disponent','Einsatzleiter/Revierleiter','Ansprechpartner vor Ort'],breakdown:['Polterinfo'],lotSummary:['Sortenzusammenfassung'],completion:['Abfuhr restlos beendet am']},
   units:{quantity:'rm'},measurementBasis:'WA',decimal:'de',referenceFormats:{partie:'^\\d{3}_\\d{3}$'},layouts:['fuhrauftrag-ttw','abfuhrmeldung-ttw'],documentClasses:['order','order_continuation','map','collection_report_form'],
   documentTypes:['Fuhrauftrag'],region:{lat:47.85,lon:8.85,radiusKm:40,name:'Raum Aach (Hegau)'},pickupKind:'roadside',reviewedDocuments:0},
  {id:'unknown',partyId:null,name:'Unbekannter Absender',senderDomains:[],letterhead:[],labels:{},units:{quantity:null},measurementBasis:null,decimal:'de',referenceFormats:{},layouts:[],documentClasses:['order'],documentTypes:[],region:null,pickupKind:'roadside',reviewedDocuments:0}
];
/* Mill profiles for intake tickets (Werkseingangsschein / Wiegeschein) — same idea, different document class. */
const MILL_LABELS={
  ticketNo:['Werkseingangsschein Nr.','Wiegeschein Nr.','Beleg-Nr.','Wiegenummer','Eingangsschein'],
  deliveryNoteRef:['Lieferschein-Nr.','Lieferschein','Lieferscheinnummer','LS-Nr.'],
  vehicleReg:['Kennzeichen','KFZ-Kennzeichen','Fahrzeug'],
  arrival:['Ankunft','Eingang','Anlieferung'],unloaded:['Entladung','Abladung'],
  gross:['Brutto','Erstwiegung'],tare:['Tara','Zweitwiegung'],net:['Netto','Nettogewicht'],
  measured:['Werksmaß','Vermessung','Eingangsmaß'],method:['Messverfahren','Maß'],
  deductions:['Abzug','Rinde','Rindenabzug','Ausschuss'],acceptance:['Annahme','Status'],orderRef:['Auftrag','Partie','Kundenreferenz','Lieferant']
};
const api={CANONICAL_LABELS,SPECIES,ASSORTMENTS,PROFILES,MILL_LABELS,profileById:id=>PROFILES.find(p=>p.id===id)||PROFILES.find(p=>p.id==='unknown')};
(globalThis.TransportData=globalThis.TransportData||{}).customers=api;
if(typeof module!=='undefined')module.exports=api;
})();
