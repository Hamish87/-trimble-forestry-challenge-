/* Holztransport demo · the sample pack as fixtures. Facsimiles of the five supplied transport orders (SAMPLES.md):
   structure, labels, references, quantities, coordinate strings (including malformed ones), breakdowns, totals and
   instructions are kept verbatim; natural persons and contact data are removed, private companies renamed, dates
   shifted to October/November 2026, and every order is addressed to the demo carrier. Pages carry their lines in
   reading order; cells inside a line are separated by tabs, as a text layer or OCR table would deliver them.
   kind: 'text' (PDF text layer) · 'scan' (no text layer; lines are the OCR-style transcription) · 'map' (image). */
'use strict';
(function(){
const CARRIER=['Musterholz Transporte GmbH','Industriestraße 12','88339 Bad Waldsee'];
const page=(n,kind,lines,extra={})=>Object.assign({n,kind,lines},extra);
const DOCS=[
 {id:'DOC-MENGEN-1',scenario:'base',sample:'S-MENGEN',sender:'forstverwaltung@mengen.demo',senderName:'Stadt Mengen · Forstverwaltung',subject:'Transportmeldung 2026-102 · Abfuhr Stadtwald',receivedAt:'2026-10-12T08:14:00+02:00',
  attachments:[{name:'Transportmeldung_2026-102.pdf',pages:[page(1,'scan',[
   'Stadt Mengen\tHauptstr. 90\t88512 Mengen',
   'Stadt Mengen · Miteinander eine Menge mehr.',
   ...CARRIER,
   'Transportmeldung',
   'vom :\t12.10.2026\tBlatt\t1',
   'Nr.:\t2026 - 102',
   'Verladeart:\tLKW',
   'Folgende Polter sind abzufahren:',
   'Fowj\tHieb\tLos\tPolter\tMenge\tStück\tHolzart\tGPS- Koord. X\tGPS- Koord. Y',
   '2026\t9110\t991\t35\t15.00 fm\t3\tFI\t09° 19\' 29,1"\t48° 01\' 09,0"',
   '2026\t9211\t990\t8\t0.10 fm\t0\tFI\t09° 21\' 1244,7"\t48° 05\' 307,5"',
   '2026\t9211\t990\t9\t10.00 fm\t0\tFI\t09° 21\' 1244,8"\t48° 05\' 307,3"',
   '2026\t9211\t990\t12\t20.00 fm\t0\tFI\t09° 21\' 1245,2"\t48° 05\' 305,5"',
   '2026\t9211\t990\t18\t5.00 fm\t0\tFI\t09° 20\' 1226,1"\t48° 05\' 290,7"',
   '2026\t9407\t990\t8\t52.92 fm\t96\tFI\t09° 19\' 1135,8"\t48° 01\' 55,6"',
   '2026\t9407\t990\t22\t15.00 fm\t0\tFI\t09° 19\' 1134,1"\t48° 01\' 54,0"',
   '2026\t9407\t990\t24\t5.00 fm\t0\tFI\t09° 19\' 1131,2"\t48° 01\' 50,6"',
   '2026\t9408\t990\t1\t20.00 fm\t1\tFI\t09° 17\' 1038,9"\t48° 00\' 03,8"',
   '2026\t9408\t990\t9\t5.00 fm\t1\tFI\t09° 17\' 1032,0"\t48° 00\' 06,7"',
   'Summe je Los:',
   '2026\t9407\t990\t\t133.02 fm\t98\t( 89,87 % der Gesamtsumme)',
   '2026\t9110\t991\t\t15.00 fm\t3\t( 10,13 % der Gesamtsumme)',
   'Gesamtsumme:',
   '\t\t\t\t148,02 fm\t101',
   'abfuhr32.fmg11/V20090924'
  ],{ocrConfidence:0.86})]}],
  note:'Nachbildung · anonymisiert · umdatiert'},
 {id:'DOC-PELLET-1',scenario:'base',sample:'S-PELLET',sender:'disposition@waldkontor-nord.demo',senderName:'Waldkontor Nord GmbH · Disposition',subject:'Transportauftrag Pelletwerk · KW 43',receivedAt:'2026-10-12T10:02:00+02:00',
  attachments:[{name:'Transportauftrag_Pelletwerk_KW43.pdf',pages:[page(1,'scan',[
   'Pelletwerk',
   'Waldkontor Nord GmbH\tSchmiedekoppel 7-9',
   '\tD-23847 Kastorf',
   '\tFon: +49-(0)4501-000 00 (Demo)',
   'Empfänger / to:\tMusterholz Transporte GmbH',
   'zu Händen / attention:\tDisposition',
   'Faxnummer / fax no:\t+49 7524 000-00 (Demo)',
   'Absender / from:\tWaldkontor Nord GmbH',
   'Datum / date:\t12.10.2026',
   'Transportauftrag',
   'Abholdatum:\t19.10. - 23.10.2026',
   'Abholadresse:\tSägewerk Baruth AG, An der Birkenpfuhlheide 1, 15837 Baruth/Mark',
   'Menge:\t5 LDG',
   'Ladenummern:\tMontag:\t0727603001',
   '\tDienstag:\t0727603002',
   '\tMittwoch:\t0727603003',
   '\tDonnerstag:\t0727603004',
   '\tFreitag:\t0727603005',
   'Material:\tKappholz',
   'Fahrzeugart:\tSchubboden LKW (90 m³)',
   'Lieferdatum:\t19.10. - 23.10.2026',
   'Lieferadresse:\tPelletwerk Anhalt GmbH, Einsteinstraße 17, 06785 Oranienbaum',
   'Kontakt:\tWerkslogistik Pelletwerk (Demo)',
   'Preis:\t160,00€/ LDG',
   'Zahlungsziel:\t14 Tage netto',
   'Falls die vorgeschriebenen Termine für Be- und Entladung nicht eingehalten werden können, ist die Disposition unverzüglich zu informieren! Gewichts- und Kubaturkontrolle erfolgt in den jeweiligen Produktionswerken, so dass nur die von uns schriftlich bestätigten Gewichte bzw. Kubaturen zur Akzeptanz von Frachtkosten herangezogen werden.',
   'Ausrüstung Fahrer: Sicherheitsschuhe, Warnweste, Handschuhe, Augen- und Ohrenschutz. Es herrscht generelles Rauchverbot in den Werken. Abdeckplanen dürfen keine Löcher oder Risse aufweisen! Standzeitregelung – 2 Std. für Beladung bzw. Entladung frei, sofern ein Ladefenster gebucht worden ist.',
   'Die Ladungssicherung erfolgt durch den Fahrer, ausreichend Spanngurte, Kantenschoner und Antirutschmatten sind mitzuführen. Die Entladung der Ware darf nur an die angegebene Empfängeradresse erfolgen. Der Frachtführer haftet selbst für eventuelle Überladungen der Fahrzeuge.',
   'Mit freundlichen Grüßen',
   'i.A. (Unterschrift)',
   '$CR$90110',
   'Internet: www.waldkontor-nord.demo · E-Mail: info@waldkontor-nord.demo',
   'HR-Nr.: (entfernt) · Geschäftsführer: (entfernt) · Bankverbindung: (entfernt)'
  ],{ocrConfidence:0.9})]}],
  note:'Nachbildung · anonymisiert · umdatiert'},
 {id:'DOC-HTL-1',scenario:'base',sample:'S-HTL',sender:'logistik@krafft-ebnat.demo',senderName:'Holzhandel Krafft-Ebnat KG',subject:'Holzbereitstellung Nr. 6.142 · Hieb 5816 Los 57',receivedAt:'2026-10-13T07:48:00+02:00',
  attachments:[{name:'HTL_14452_Holzbereitstellung_6142.pdf',pages:[page(1,'text',[
   'Holzhandel Krafft-Ebnat KG\tEbnater Hauptstr. 23\t73432 Aalen-Ebnat',
   'Holzhandel Krafft-Ebnat KG',
   'Ebnater Hauptstr. 23, D-73432 Aalen-Ebnat',
   'Sägewerk Polsingen GmbH',
   'Frankenstraße 29',
   '91805 Polsingen',
   '0421021/011173600234',
   'Holzbereitstellung Nr.\t6.142',
   'vom:\t13.10.2026\tBlatt 1 von 3',
   'Revierleiter:\tRevierleitung Mietingen (Demo)',
   'Grabenweg 12',
   '88487 Mietingen',
   'Tel.:\t+49 7392 000-00 (Demo)',
   'Mobil:\t+49 151 000000-00 (Demo)',
   'E-Mail:\trevier.mietingen@demo.invalid',
   'Bemerkung:',
   'Bem. Logistik:',
   'Folgende Polter sind abzufahren:\tAbfuhrzeitraum: 27.10.2026 bis 13.10.2026',
   'Hieb\tLos\tPolter\tSortiment\tHolzart\tMenge\tStück\tGPS - Koordinaten\tLänge (m)',
   '5816\t57\t1\t\t\t10,82 fm\t10\t\t',
   '5816\t57\t4\t\t\t11,59 fm\t13\t\t',
   '5816\t57\t5\t\t\t14,84 fm\t13\t\t',
   '5816\t57\t6\t\t\t23,98 fm\t22\t\t',
   '5816\t57\t7\t\t\t37,66 fm\t42\t\t',
   'Zwischensumme:\t100\t98,88 fm',
   'Gesamt:\t100\t98,88 fm',
   'abfuhr32net..sbw/V201405202'
  ]),page(2,'map',['Hieb- / Losnummer:\t5816/57'],{title:'Kartenausschnitt 1 : 25 000',pins:[{label:'5816/1',fx:0.46,fy:0.44},{label:'5816/4',fx:0.50,fy:0.47},{label:'5816/5',fx:0.49,fy:0.42},{label:'5816/6',fx:0.53,fy:0.45},{label:'5816/7',fx:0.52,fy:0.49}]}),
   page(3,'map',['Hieb- / Losnummer:\t5816/57'],{title:'Kartenausschnitt 1 : 10 000',pins:[{label:'5816/1',fx:0.38,fy:0.40},{label:'5816/4',fx:0.52,fy:0.50},{label:'5816/5',fx:0.47,fy:0.33},{label:'5816/6',fx:0.62,fy:0.44},{label:'5816/7',fx:0.58,fy:0.58}]})]}],
  note:'Nachbildung · anonymisiert · umdatiert'},
 {id:'DOC-BAYSF-1',scenario:'base',sample:'S-BAYSF',sender:'logistik@baysf.demo',senderName:'Bayerische Staatsforsten · Disposition',subject:'Frachtauftrag 072614P0003 / 000001',receivedAt:'2026-10-13T11:21:00+02:00',
  attachments:[{name:'Frachtauftrag_072614P0003.pdf',pages:[page(1,'scan',[
   '072614P0003',
   'Bayerische Staatsforsten · Nachhaltig Wirtschaften.',
   'Bayerische Staatsforsten, Tillystraße 2, 93053 Regensburg',
   'Frachtauftrag',
   '072614P0003 / 000001',
   'Spedition',
   ...CARRIER,
   'Auftrag vom\t05.10.2026',
   'abzuschließen bis\t26.10.2026',
   'Anlieferung/Zeitfenster',
   'gesprizt',
   'Ansprechpartner BaySF Disposition',
   'BaySF Disposition Regensburg (Demo)',
   'Tel.: +49 941 000-00 · Fax: - · Email: logistik@baysf.demo',
   'Lieferant',
   'Forstbetrieb Kaisheim',
   'Hauptstraße',
   'D-86687 Kaisheim',
   'Frachtsatz Netto\t8,80 EUR pro 1 FM',
   'Empfänger',
   'Sägewerk Kösching GmbH',
   'Einsteinstraße',
   'D-85092 Kösching',
   'Kunden-Partie:',
   'Kontaktdaten zuständiges Revier',
   'Revier:\t14 Auernheim',
   'Kostenstelle:\t7023',
   'gesprizt',
   'Revierleiter:\tRevierleitung Auernheim (Demo)',
   'Mobiltel:\t+49 175 000000-0',
   'Tel.\t+49 9142 000-00\tFax: +49 9142 000-01',
   'Polter-Nr:\t072614P0003\tGesamtmenge ca.:\t77,0 FM',
   'Pos.\tBaumart\tSorte\tLänge\tFm ca.\tHinweis/Ergänzungen',
   '001\tFichte\tSL\t5,0\t26,0\t',
   '002\tFichte\tSL\t5,0\t51,0\t(handschriftliche Markierung)',
   'Summe\t\t\t\t77,0\t',
   'Regensburg, 12.10.2026',
   'Datum, Unterschrift Auftragnehmer',
   'Transportauftrag unterschrieben an die Dispozentrale Regensburg Fax: +49 (0) 941 000-01 zurücksenden. Mit der Unterschrift werden die Bedingungen anerkannt.',
   'Druck vom: 12.10.2026 / 16:45:40\tSeite 1 / 3'
  ],{ocrConfidence:0.84}),page(2,'scan',[
   'Dieser Lieferschein ist gültig vom 01.01.2026 – 31.12.2026. Abgelaufene Lieferscheine dürfen nicht verwendet werden.',
   'Lieferschein',
   '2026A01508',
   'Bayerische Staatsforsten · Nachhaltig Wirtschaften.',
   'Empfänger / Werk: ____________\tPolter-Nr: |_|_|_|_|_|_|P|_|_|_|_|',
   'Spedition\t________\tKFZ Kennzeichen\t________',
   'Kunden-Partie-Nr.\t________\tFahrer\t________',
   'Forstbetrieb\t________\tSchätzmaß\t_____ Fm',
   'Revier\t________\tStückzahl\t_____',
   'Anlieferdatum\t________\tTransport abgeschlossen\t☐ ja',
   'Baumart\tSorte\tLänge',
   '☐ Fichte (Ta)\t☐ L Langholz\t☐ 2 Meter ☐ 3 Meter',
   '☐ Kiefer (Lä)\t☐ SL Standardlänge\t☐ 4 Meter ☐ 5 Meter',
   '☐ Eiche\t☐ IL/IS Industrieholz\tAndere:',
   '☐ Buche (sonst. Laubh.)\t☐ IE Energieholz',
   'Ablageort',
   '☐ Rundholzaufgabe',
   '☐ Zwischenlager',
   '☐ Waggon-Nr.\t________',
   'Verladebahnhof\t________',
   'Annahmedatum ________\tUhrzeit ________\tUnterschrift Empfänger ________',
   'Verteilung Durchschreibesätze: weiß für Empfänger, grün für BaySF, gelb für Frächter, rosa verbleibt im Block'
  ],{ocrConfidence:0.88})]}],
  note:'Nachbildung · anonymisiert · umdatiert'},
 ttw('DOC-TTW-1','base','Fuhrauftrag Nr. 3311 · Partie 124_501 · Zielwerk Stadt Aach','2026-10-12T14:35:00+02:00',{})
];
function ttwPages(v){
 const polter10=v.amend?'180,000 rm':'234,060 rm',info10=v.amend?['10\tBFI\t10,00 %\t18,000 rm','10\tDFI\t90,00 %\t162,000 rm']:['10\tBFI\t10,00 %\t23,406 rm','10\tDFI\t90,00 %\t210,654 rm'];
 const p1=[
   'Fuhrauftrag Nr. 3311',
   'Auftraggeber:\tWaldpflege Oberschwaben GmbH','\tForstweg 10','\t88364 Wolfegg',
   'Frachtführer :\tMusterholz Transporte GmbH','\tIndustriestraße 12','\t88339 Bad Waldsee',
   'Revier:',
   'Zielwerk:\tStadt Aach','\tHauptstraße','\t78267 Aach',
   'Partie-Nr:\t124_501\tKauf-Nr.:',
   'Abrechnungsmaß:\tWA',
   'Sorte:\tInd. Schichtholz 3m-lang\tFrachtsatz:',
   `Abfuhrbeginn:\t19.10.2026\tAbfuhrende:\t${v.amend?'16.11.2026':'02.11.2026'}\tPriorität:\tnormal`,
   'Zertifiziert nach PEFC Nummer HW-CoC-0220-13',
   v.amend?'Bemerkung:\tÄnderung zu Fuhrauftrag 3311 vom 12.10.2026: Polter 10 Menge geändert, Polter 11 neu, Abfuhrende verlängert. test':'Bemerkung:\ttest',
   'Disponent:\tEinsatzleiter/Revierleiter:\tAnsprechpartner vor Ort:',
   'Disposition Waldpflege (Demo)\tEinsatzleitung Waldpflege (Demo)\tForstwirt vor Ort (Demo)',
   '+49 7527 000-00\t+49 160 000000-1\t+49 160 000000-0',
   'Polterliste:',
   'Auftrag + Los\tPolter\tBaumart\tLänge\tGüte\tMenge\tStück\tGPS - Koordinaten',
   '124_501\t9\tFI\t4,00\tBC\t230,636 rm\t0\t',
   'Polterinfo:',
   '9\tNFI\t93,00 % / 85,00 %\t182,318 rm','9\tFFI\t93,00 % / 15,00 %\t32,174 rm','9\tNTA\t7,00 % / 85,00 %\t13,723 rm','9\tFTA\t7,00 % / 15,00 %\t2,422 rm',
   `124_501\t10\tFI\t4,00\tBC\t${polter10}\t0\t`,
   'Polterinfo:',...info10,
   ...(v.amend?['124_501\t11\tFI\t4,00\tBC\t60,500 rm\t0\t','Polterinfo:','11\tNFI\t100,00 %\t60,500 rm']:[]),
   'Sortenzusammenfassung Los : 501',
   'FFI\t32,174 rm',`NFI\t${v.amend?'242,817 rm':'182,318 rm'}`,'FTA\t2,422 rm','NTA\t13,723 rm',`BFI\t${v.amend?'18,000 rm':'23,406 rm'}`,`DFI\t${v.amend?'162,000 rm':'210,654 rm'}`,
   `Summe:\t${v.amend?'471,136 rm':'464,696 rm'}`,
   `Partie-Nr:\t124_501\tKauf-Nr.:\tAuftragsdatum:\t${v.amend?'15.10.2026':'12.10.2026'}`,
   'Seite 1 von 5'];
 const p2=[
   'Bitte achten Sie auf eine saubere Trennung von unterschiedlichen Partien und füllen Sie bei jeder Abfuhr den anhängenden Abfuhrbericht aus.',
   'Der Abfuhrbericht ist wöchentlich und nach erfolgter Erledigung des Auftrages an unseren Disponenten (s.o) zu faxen.',
   'Wir erwarten eine poltergenaue Abfuhr.',
   'Die Gutschriften werden zwei Mal pro Monat erstellt, diese werden mit Zahlungsziel 14 Tage und 2 % Skontoabzug ausbezahlt.',
   'Auf jedem eingesetzten LKW ist eine Kopie des Abfuhrauftrags mitzuführen. Lieferscheine sind unmittelbar nach dem Beladen auszufüllen.',
   'Falls eine fristgerechte Abfuhr nicht möglich sein sollte, erwarten wir eine frühzeitige Information darüber.',
   'Die für den Rundholztransport gültigen gesetzlichen Bestimmungen sind zwingend zu beachten!',
   `Partie-Nr:\t124_501\tKauf-Nr.:\tAuftragsdatum:\t${v.amend?'15.10.2026':'12.10.2026'}`,
   'Seite 2 von 5'];
 const p5=[
   'Waldpflege Oberschwaben GmbH\tTel: +49 7527 000-00\tFax: +49 7527 000-01',
   'Abfuhrmeldung / Fertigmeldung',
   'Abfuhrmeldung jeweils am Monatsende senden / Fertigmeldung senden, wenn Auftrag abgeschlossen ist.',
   'Auftragsname/Nr.:\t124_501\tVerkaufsnummer:',
   `Gesamtmasse laut Auftrag:\t${v.amend?'471,136 rm':'464,696 rm'}\tGesamtstückzahl laut Auftrag:\t0`,
   'Forstort:\t\tFuhrauftrag Nr.\t3311',
   'Empfänger / Zielwerk:\tStadt Aach\tFuhrunternehmer:\tMusterholz Transporte GmbH',
   'Sorte:\tInd. Schichtholz 3m-lang\tVerantwortlicher Fahrer:',
   'Fuhre Nr\tDatum\tFZ-Nr.\tVol. gesch. FM/RM\tStückzahl\tVerwend. im Werk\tBemerkung\tAnlage\tLager',
   ...Array.from({length:10},(_,i)=>`${i+1}\t\t\t\t\t\t\t\t`),
   `Summe:\t\tSoll:\t${v.amend?'471,136':'464,696'}\tDifferenz:`,
   'Gründe für Mengenabweichungen:',
   'Bemerkung:',
   'Abfuhr restlos beendet am:',
   'Hinweis für Fahrer: Wenn Posten vollständig abgefahren, letzte Fuhre einringeln.',
   'Datum, Unterschrift',
   'Seite 5 von 5'];
 const maps=[page(3,'map',['Fuhrauftrag Nr. 3311\tPartie 124_501'],{title:'Kartenausschnitt 1 : 25 000',pins:[{label:'9',fx:0.76,fy:0.49},{label:'10',fx:0.25,fy:0.51}]}),page(4,'map',['Fuhrauftrag Nr. 3311\tPartie 124_501'],{title:'Kartenausschnitt 1 : 50 000',pins:[{label:'9',fx:0.60,fy:0.48},{label:'10',fx:0.42,fy:0.50}]})];
 return [page(1,'text',p1),page(2,'text',p2),...maps,page(5,'text',p5)];
}
function ttw(id,scenario,subject,receivedAt,v){return {id,scenario,sample:'S-TTW',sender:'disposition@waldpflege-oberschwaben.demo',senderName:'Waldpflege Oberschwaben GmbH · Disposition',subject,receivedAt,attachments:[{name:v.amend?'Fuhrauftrag_3311_Aenderung.pdf':'Fuhrauftrag_3311.pdf',pages:ttwPages(v)}],note:'Nachbildung · anonymisiert · umdatiert'+(v.amend?' · Änderungsszenario [DEMO]':'')};}
/* Scenario documents on demand (SPEC §7.2): exact resend and a revised order. */
const SCENARIOS={
 resend:()=>ttw('DOC-TTW-RESEND','resend','WG: Fuhrauftrag Nr. 3311 · Partie 124_501','2026-10-14T09:05:00+02:00',{}),
 amendment:()=>ttw('DOC-TTW-AMEND','amendment','Fuhrauftrag Nr. 3311 · Änderung · Partie 124_501','2026-10-15T16:20:00+02:00',{amend:true})
};
/* Mill tickets (DM step 7): one matches by delivery-note number, one by vehicle + mill + arrival window, one not at
   all. ctx = {loads:[{id,truckReg,destinationId,arrivedAt,deliveryNoteNo}]} lets the vehicle/window ticket follow the
   actual arrival time of the pellet load recorded in the demo, when there is one. */
function millTickets(ctx={}){
 const loads=ctx.loads||[];const pellet=loads.find(l=>l.destinationId==='P-PELLETWERK-ANHALT'&&l.arrivedAt);
 const arr=pellet?new Date(new Date(pellet.arrivedAt).getTime()+25*60000):new Date('2026-10-20T09:15:00+02:00');
 const stamp=d=>`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 const unl=new Date(arr.getTime()+25*60000);
 const ls1=(loads.find(l=>l.destinationId==='P-SAEGEWERK-POLSINGEN')||{}).deliveryNoteNo||'LS-2026-00001';
 return [
  {id:'DOC-WE-POLSINGEN-1',scenario:'ticket',sender:'werkseingang@saegewerk-polsingen.demo',senderName:'Sägewerk Polsingen GmbH · Werkseingang',subject:`Werkseingangsschein 2026-04471 · ${ls1}`,receivedAt:'2026-10-21T17:30:00+02:00',attachments:[{name:'WES_2026-04471.pdf',pages:[page(1,'text',[
   'Sägewerk Polsingen GmbH\tFrankenstraße 29\t91805 Polsingen','Werkseingangsschein Nr.\t2026-04471',
   'Lieferant:\tHolzhandel Krafft-Ebnat KG\tAuftrag:\tHolzbereitstellung 6.142 / Hieb 5816 Los 57','Spediteur:\tMusterholz Transporte GmbH',
   `Lieferschein-Nr.:\t${ls1}`,'Kennzeichen:\tRV-MH 202','Ankunft:\t21.10.2026 10:42\tEntladung:\t21.10.2026 11:05',
   'Vermessung:\tWerksmaß (Einzelstammvermessung, Rinde abgezogen)','Holzart\tSortiment\tLänge\tMenge\tMaß','FI\tSL\t4,0 m\t23,10 fm\tWerksmaß','Rindenabzug:\tenthalten','Annahme:\tangenommen'])]}],note:'synthetisch [DEMO] — die Beispielsammlung enthält keinen Werksschein'},
  {id:'DOC-WG-ANHALT-1',scenario:'ticket',sender:'waage@pelletwerk-anhalt.demo',senderName:'Pelletwerk Anhalt GmbH · Waage',subject:'Wiegeschein 77120 · RV-MH 303',receivedAt:'2026-10-20T12:10:00+02:00',attachments:[{name:'Wiegeschein_77120.pdf',pages:[page(1,'text',[
   'Pelletwerk Anhalt GmbH\tEinsteinstraße 17\t06785 Oranienbaum','Wiegeschein Nr.\t77120','Kennzeichen:\tRV-MH 303','Lieferant:\tWaldkontor Nord GmbH','Material:\tKappholz','Lieferschein-Nr.:',
   `Ankunft:\t${stamp(arr)}\tEntladung:\t${stamp(unl)}`,'Erstwiegung (Brutto):\t38.540 kg','Zweitwiegung (Tara):\t15.120 kg','Netto:\t23.420 kg','Annahme:\tangenommen'])]}],note:'synthetisch [DEMO]'},
  {id:'DOC-WE-POLSINGEN-2',scenario:'ticket',sender:'werkseingang@saegewerk-polsingen.demo',senderName:'Sägewerk Polsingen GmbH · Werkseingang',subject:'Werkseingangsschein 2026-04490',receivedAt:'2026-10-22T17:30:00+02:00',attachments:[{name:'WES_2026-04490.pdf',pages:[page(1,'text',[
   'Sägewerk Polsingen GmbH\tFrankenstraße 29\t91805 Polsingen','Werkseingangsschein Nr.\t2026-04490','Spediteur:\tMusterholz Transporte GmbH','Lieferschein-Nr.:\tLS-2026-00017','Kennzeichen:\tUL-XY 777','Ankunft:\t22.10.2026 14:03',
   'Holzart\tSortiment\tLänge\tMenge\tMaß','FI\tSL\t4,0 m\t24,55 fm\tWerksmaß','Annahme:\tangenommen'])]}],note:'synthetisch [DEMO]'}
 ];
}
/* Demo placements for the stacks without printed coordinates, used only by the guided demo run ("aus Kartenbild
   platziert" by the demo dispatcher). Positions are approximate forest locations near the issuer's Revier. [DEMO] */
const DEMO_PLACEMENTS={
 'DOC-HTL-1':{'5816/57/1':[48.158,9.905],'5816/57/4':[48.161,9.912],'5816/57/5':[48.163,9.902],'5816/57/6':[48.166,9.915],'5816/57/7':[48.169,9.908]},
 'DOC-TTW-1':{'124_501/9':[47.831,8.869],'124_501/10':[47.838,8.835]},
 'DOC-BAYSF-1':{'072614P0003':[48.955,10.915]}
};
const api={DOCS,SCENARIOS,millTickets,DEMO_PLACEMENTS,byId:id=>DOCS.find(d=>d.id===id)||null};
(globalThis.TransportData=globalThis.TransportData||{}).samples=api;
if(typeof module!=='undefined')module.exports=api;
})();
