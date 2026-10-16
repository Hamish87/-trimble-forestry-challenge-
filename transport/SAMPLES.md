# Sample pack review — the five supplied transport orders

Reviewed 16 October 2026 from the PDFs attached to the workflow specification ("NEEDS REVIEW — historical supplied
examples, not proof of current market practice"). Two files have a text layer (KRAFFT/HTL, TTW); three are scans
(Stadt Mengen, pellet plant, BaySF) and were rendered and transcribed by hand. The file set contains each document
twice (Notion attachment id and original file name); duplicates were confirmed by hash.

## 0. How the fixtures mirror the documents

| Kept verbatim | Changed |
|---|---|
| Document structure, labels, column order, page order and page classes · every reference number, quantity, unit, piece count, coordinate string (including the malformed ones), breakdown share, total and subtotal · instructions and their conflicts · which fields are blank | Natural persons, phone/fax numbers, e-mail addresses, bank data, registration numbers → removed or demo placeholders · private company names → fictional names (table below) · dates → shifted so that collection windows fall in October/November 2026 (the day/month arithmetic of each document is preserved, e.g. the reversed "bis/vom" order) · the addressee of every order is the demo carrier, because the scenario is one carrier's mixed inbox |

| Sample | Issuer in the sample | Fixture issuer | Carrier in the sample | Destination in the sample → fixture |
|---|---|---|---|---|
| S-MENGEN | Stadt Mengen (Stadtforst) | Stadt Mengen (public body, kept) | Schilling Schwendi GmbH Co.KG | none printed → none |
| S-PELLET | claus rodenberg waldkontor gmbh (timber trader, Kastorf) | Waldkontor Nord GmbH | KER Kaiser Entsorgung & Recycling GmbH | Pelletsproduktion Sachsen-Anhalt Nord GmbH, Oranienbaum → Pelletwerk Anhalt GmbH, Oranienbaum; pickup KLENK HOLZ AG, Baruth/Mark → Sägewerk Baruth AG |
| S-HTL | KRAFFT KG, Aalen-Ebnat (timber trader) | Holzhandel Krafft-Ebnat KG | addressed to Lacker Sägewerk GmbH, Polsingen (the buyer; the file name says HTL 14452) | Lacker Sägewerk → Sägewerk Polsingen GmbH |
| S-BAYSF | Bayerische Staatsforsten, Forstbetrieb Kaisheim | Bayerische Staatsforsten, Forstbetrieb Kaisheim (public enterprise, kept) | Burzler Holz GmbH Transporte-Handel | Binder Holz Deutschland GmbH, Kösching → Sägewerk Kösching GmbH |
| S-TTW | Holz-Achatz GmbH, Teisnach (Auftraggeber); Revier Stadt Aach | Holzwerke Achental GmbH; Revier Stadt Aach | TTW Waldpflege GmbH, Wolfegg | "Zielwerk" blank on page 1; page 5 lists the Auftraggeber under Empfänger/Zielwerk → kept blank + flagged |

## 1. S-MENGEN — `6706_fehlende_Lossummen_Transportauftrag.pdf` (1 page, scan)

"Transportmeldung" Nr. 2009-102 vom 29.09.2009, Blatt 1, Verladeart LKW, footer `abfuhr32.fmg11/V20090924 © Savcor IT GmbH`.
Table "Folgende Polter sind abzufahren": Fowj · Hieb · Los · Polter · Menge · Stück · Holzart · GPS-Koord. X · GPS-Koord. Y.

| Fowj | Hieb | Los | Polter | Menge | Stück | Holzart | X | Y |
|---|---|---|---|---|---|---|---|---|
| 2009 | 9110 | 991 | 35 | 15.00 fm | 3 | FI | 09° 19' 29,1" | 48° 01' 09,0" |
| 2009 | 9211 | 990 | 8 | 0.10 fm | 0 | FI | 09° 21' 1244,7" | 48° 05' 307,5" |
| 2009 | 9211 | 990 | 9 | 10.00 fm | 0 | FI | 09° 21' 1244,8" | 48° 05' 307,3" |
| 2009 | 9211 | 990 | 12 | 20.00 fm | 0 | FI | 09° 21' 1245,2" | 48° 05' 305,5" |
| 2009 | 9211 | 990 | 18 | 5.00 fm | 0 | FI | 09° 20' 1226,1" | 48° 05' 290,7" |
| 2009 | 9407 | 990 | 8 | 52.92 fm | 96 | FI | 09° 19' 1135,8" | 48° 01' 55,6" |
| 2009 | 9407 | 990 | 22 | 15.00 fm | 0 | FI | 09° 19' 1134,1" | 48° 01' 54,0" |
| 2009 | 9407 | 990 | 24 | 5.00 fm | 0 | FI | 09° 19' 1131,2" | 48° 01' 50,6" |
| 2009 | 9408 | 990 | 1 | 20.00 fm | 1 | FI | 09° 17' 1038,9" | 48° 00' 03,8" |
| 2009 | 9408 | 990 | 9 | 5.00 fm | 1 | FI | 09° 17' 1032,0" | 48° 00' 06,7" |

"Summe je Los": 2009 9407 990 **133.02 fm 98** (89,87 %) · 2009 9110 991 **15.00 fm 3** (10,13 %). "Gesamtsumme: 148,02 fm 101".

Findings → fixture expectations:
- Line items sum to 148,02 fm and 101 pieces: total check passes.
- The lot summary is wrong: Hieb 9407 lines sum to 72,92 fm / 96 pieces; 133,02 fm / 98 is the sum of all Los-990 lines
  across Hiebe 9407, 9211 and 9408, and lots 9211/990 and 9408/990 have no summary line ("fehlende Lossummen").
  → `E-LOTSUM` warning; the ten stack lines stay authoritative; the summary is kept as printed.
- Decimal notation is mixed: line quantities use a dot (`15.00`), the total uses a comma (`148,02`) → both kept raw.
- Coordinates: only Polter 35 is well-formed DMS (9,3248° E, 48,0192° N, 3,4 km south of Mengen — plausible). The other
  nine have "seconds" of 1031–1245 or 290–307 → `E-COORD-FMT`, blocking the line. Dividing the seconds by 100 gives
  plausible positions (e.g. 09° 21' 12,447" 48° 05' 3,075") → offered as a **suggestion that must be approved**, never
  applied silently.
- Stück 0 with 10 fm (Polter 9) is kept as printed (a count of 0 is not confirmed; shown as "0 (laut Dokument)").
- Polter 8 of Hieb 9211 and Polter 8 of Hieb 9407 share a stack number → shows why a stack number alone is not unique.
- Scan without text layer → `E-SCAN` (fixture lines are the transcription, source `ocr`, confidence 0,86).

## 2. S-PELLET — `TransportauftragPelletwerkmitEKLadenummern.pdf` (1 page, scan, fax layout)

Timber trader's fax "Transportauftrag" of 09.02.2017 to the carrier. Fields: Abholdatum 13.02.–17.02.2017 · Abholadresse
(a sawmill in Baruth/Mark — an **industrial pickup**, no roadside stack) · Menge **5 LDG** · Ladenummern Montag
0727603001 · Dienstag 0727603002 · Mittwoch 0727603003 · Donnerstag 0727603004 · Freitag 0727603005 · Material Kappholz ·
Fahrzeugart Schubboden LKW (90 m³) · Lieferdatum 13.02.–17.02.2017 · Lieferadresse (pellet plant, Oranienbaum) · Kontakt ·
Preis 160,00 €/LDG · Zahlungsziel 14 Tage netto · a terms paragraph (Standzeitregelung 2 Std., Ladungssicherung, …) ·
barcode `$CR$90110` · no order number.

Findings → fixture expectations: one order with **five stack lines of kind `industrial`**, one per weekday loading
number with the leading zero preserved; planned quantity 1 LDG each; 90 m³ is vehicle capacity, not quantity
(`E-UNIT` info); no customer order number → internal reference, barcode kept as raw reference (`E-NOID`); price and
payment terms → `restricted` (`E-RESTRICTED`); pickup location is the site address (allowed for industrial pickups,
confidence `address`), destination separate; collection window = delivery window.

## 3. S-HTL — `HTL_14452TransportAuftrag_Nr_6142.pdf` (3 pages, text layer + two map pages)

"Holzbereitstellung Nr. 6.142 vom 22.12.2015, Blatt 1 von 3", reference `0421021/011173600234`, Revierleiter block (removed),
"Folgende Polter sind abzufahren: Abfuhrzeitraum: 22.12.2015 bis 05.01.2016" (the text layer emits "05.01.2016bis22.12.2015").
Table Hieb · Los · Polter · Sortiment · Holzart · Menge · Stück · GPS-Koordinaten · Länge (m): Hieb 5816, Los 57,
Polter 1 (10,82 fm, 10 St) · 4 (11,59 fm, 13) · 5 (14,84 fm, 13) · 6 (23,98 fm, 22) · 7 (37,66 fm, 42); Sortiment,
Holzart, GPS and Länge empty. "Zwischensumme: 100 98,88 fm · Gesamt: 100 98,88 fm". Footer `abfuhr32net..sbw/V201405202 ©
Savcor IT GmbH`. Pages 2–3: topographic map excerpts titled "Hieb-/Losnummer: 5816/57" with red dashed stack outlines
labelled 5816/1 … 5816/7 at two scales.

Findings → fixture expectations: five stack lines, pieces 100 ✓, volume 98,89 fm vs printed 98,88 fm → `E-TOTAL`
warning (difference 0,01), both kept; blank GPS → `E-COORD-NONE` blocking each line; map pages linked to the order by
the Hieb/Los label and offered for "aus Kartenbild platzieren" (`E-MAP-ONLY`); species/assortment empty → `E-SPECIES`;
window order in the text layer reversed → parsed from both dates, `E-WINDOW` info; the addressee is a sawmill (the
buyer) and the carrier is not printed → carrier field "nicht gedruckt" (the fixture is delivered to the demo carrier's
inbox).

## 4. S-BAYSF — `Frachtauftrag_Lieferschein.pdf` (2 pages, scan)

Page 1 "Frachtauftrag 072614P0003 / 000001" (barcode 072614P0003): Spedition (carrier) · Lieferant Forstbetrieb Kaisheim ·
Empfänger (sawmill, Kösching) · Auftrag vom 24.04.2007, abzuschließen bis 14.05.2007 · Anlieferung/Zeitfenster "gesprizt" (sic)
· Ansprechpartner BaySF Disposition (removed) · **Frachtsatz Netto 8,80 EUR pro 1 FM** · Kunden-Partie blank · Revier 14
Auernheim, Kostenstelle 7023 · Revierleiter (removed) · **Polter-Nr 072614P0003**, Gesamtmenge ca. 77,0 FM · Pos 001
Fichte SL 5,0 m 26,0 fm · Pos 002 Fichte SL 5,0 m 51,0 fm · Summe 77,0 · handwritten mark · "Seite 1/3", print date.
Page 2: blank **Lieferschein 2006A01508** form (valid 01.01.–31.12.2006): Empfänger/Werk, Polter-Nr `|_|_|_|_|_|_|P|_|_|_|_|`,
Spedition, Kunden-Partie-Nr, Forstbetrieb, Revier, Anlieferdatum, KFZ Kennzeichen, Fahrer, Schätzmaß Fm, Stückzahl,
Transport abgeschlossen ☐ ja, Baumart (Fichte (Ta) · Kiefer (Lä) · Eiche · Buche (sonst. Laubh.)), Sorte (L Langholz · SL
Standardlänge · IL/IS Industrieholz · IE Energieholz), Länge (2 · 3 · 4 · 5 Meter · Andere), Ablageort (Rundholzaufgabe ·
Zwischenlager · Waggon-Nr · Verladebahnhof), Annahmedatum, Uhrzeit, Unterschrift Empfänger; copies weiß/grün/gelb/rosa.

Findings → fixture expectations: one order, one Polter `072614P0003` with two positions (positions are lines of one
stack, 77,0 fm total; total check ✓); no coordinates and no map → `E-COORD-NONE`, Revier contact for confirmation;
freight rate → `restricted`; the blank form → `E-BLANKFORM` info, page class `delivery_note_form`, never an order; the
form's field set is the template for the app's own Lieferschein (SPEC §7.8); the Polter-Nr format `dddddd P dddd` becomes
the customer profile's reference format.

## 5. S-TTW — `TransportauftragTTW.pdf` (5 pages, text layer + two map pages)

Page 1 "Fuhrauftrag Nr. 3311" — Auftraggeber (timber works) · Frachtführer (carrier) · Revier: Stadt Aach · Zielwerk: blank ·
Partie-Nr 124_501 · Kauf-Nr blank · Abrechnungsmaß **WA** · Sorte **Ind. Schichtholz 3m-lang** · Frachtsatz blank ·
Abfuhrbeginn 23.08.2017 · Abfuhrende 06.09.2017 · Priorität normal · Zertifiziert nach PEFC Nummer HW-CoC-0220-13 ·
Bemerkung **"test"** · Disponent / Einsatzleiter/Revierleiter / Ansprechpartner vor Ort (removed). Polterliste (Auftrag + Los ·
Polter · Baumart · Menge · Stück · GPS-Koordinaten · Länge · Güte): **Polter 9** FI 230,636 rm, Länge 4,00, Güte BC, GPS blank
with Polterinfo NFI 93 %/85 % 182,318 · FFI 93 %/15 % 32,174 · NTA 7 %/85 % 13,723 · FTA 7 %/15 % 2,422; **Polter 10** FI
234,060 rm, 4,00, BC, with Polterinfo BFI 10 % 23,406 · DFI 90 % 210,654. "Sortenzusammenfassung Los 501" lists the six
codes and "Summe: 464,696 rm". Page 2: instructions — separate Partien, fill the attached Abfuhrbericht at every pickup,
**fax the report weekly** and on completion, "poltergenaue Abfuhr", credit notes twice a month (14 days, 2 % Skonto), a
copy of the order on every truck, **"Lieferscheine sind unmittelbar nach dem Beladen auszufüllen"**, early notice when the
deadline cannot be met, legal rules for roundwood transport. Pages 3–4: maps with pins 9 and 10 at two scales. Page 5:
"Abfuhrmeldung / Fertigmeldung" form — **"Abfuhrmeldung jeweils am Monatsende senden"** · Gesamtmasse laut Auftrag 464,696 rm ·
rows Fuhre Nr 1–10 (Datum · FZ-Nr. · Vol. gesch. FM/RM · Stückzahl · Verwend. im Werk · Bemerkung) · Summe · Soll · Differenz ·
Gründe für Mengenabweichungen · Abfuhr restlos beendet am · "Wenn Posten vollständig abgefahren, letzte Fuhre einringeln".

Findings → fixture expectations: **two** stack lines (9 and 10), 464,696 rm; the six Polterinfo lines and the
Sortenzusammenfassung are informational breakdowns (`breakdown[]`), not stacks (A1); header "3m-lang" vs line length
4,00 → `E-LEN`; weekly vs month-end reporting → `E-INSTR`, both shown; blank GPS + map pages → `E-COORD-NONE` +
`E-MAP-ONLY`; Zielwerk blank while page 5 prints the Auftraggeber under "Empfänger / Zielwerk" → destination unconfirmed;
Frachtsatz blank but the field exists → `restricted` slot; PEFC number kept; the "Bemerkung: test" is kept and the
fixture is tagged as a test document; the Abfuhrmeldung form is the template for the report export (SPEC §7.7).

## 6. Cross-document observations
- Two issuers print the same software footer (`abfuhr32`, Savcor IT GmbH, 2009 and 2014 versions): the HTL and Mengen
  layouts share column vocabulary (Hieb · Los · Polter · Menge · Stück · GPS) → one shared layout entry in two profiles.
- "GPS-Koordinaten" columns exist in four of five documents and are filled in one; location review is the normal case.
- Units differ per customer: fm (Mengen, HTL, BaySF), rm (TTW), LDG (pellet). Measurement basis is printed once (WA).
- No completed delivery note or mill ticket exists in the pack; the demo's receipts are synthetic and say so.
