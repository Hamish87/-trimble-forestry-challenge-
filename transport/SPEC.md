# Holztransport · Carrier-first — functional specification

A separate demo application in `transport/` that implements the **Carrier-first timber transport** workflow
(draft v0.2, 16 Oct 2026) and its companion **Customer-agnostic data model — transport order to mill receipt**
(draft v0.1). It is not part of the Forst Challenge game and shares no state with it; it only lives in the same
repository and follows the same buildless HTML/CSS/JS conventions and Trimble colours.

Source keys used in this document:

| Key | Source |
|---|---|
| **[WF §n]** | Carrier-first timber transport — Draft workflow specification v0.2, section n (1 Receive … 7 Deliver and reconcile; "Simple screens", "MVP boundary", "Extraction and data rules", "Reliability", "Sample pack") |
| **[DM]** | Customer-agnostic data model — transport order to mill receipt v0.1 (records, quantity ledger, state models, label dictionary) |
| **[S-MENGEN] [S-PELLET] [S-HTL] [S-BAYSF] [S-TTW]** | the five supplied sample PDFs, reviewed in `SAMPLES.md` |
| **[ELDAT]** | ELDATsmart record types and practice, see `RESEARCH.md §1` |
| **[RES]** | other research findings in `RESEARCH.md` |
| **[DEMO]** | our design decision where the sources are silent; everything simulated is tagged this way |

## 1. Scope and honesty rules

- The app is a product/engineering **demonstration** of a proposed workflow. Header, footer and every export say
  so. It is not a statement of existing LOGIBALL or Trimble capabilities [WF p1][DM p1]. No vendor UI is copied.
- Nothing is uploaded to a server and no AI model runs. "Extraction" is a deterministic rule engine driven by
  **customer profiles** (`data/customers.js`) over the text lines of each page (`core/extract.js`). The five sample
  documents are fixtures (`data/samples.js`): their structure, references, quantities and anomalies are kept verbatim,
  **natural persons, phone numbers, e-mail addresses and bank data are removed, private company names are replaced
  by fictional ones, and dates are shifted into the demo period** (`SAMPLES.md`). The original PDFs are not in the
  repository. [DEMO]
- Optional progressive enhancement: when pdf.js is reachable from its CDN, a real PDF can be dropped into the inbox
  and its text layer (with positions) runs through the same engine. Scanned pages without a text layer are
  classified as "Scan — Text manuell erfassen" and go to review; no OCR runs in the browser. [DEMO]
- Document text is **data, never instructions** [WF Reliability][DM p5]: it is rendered as text, never as HTML,
  never used to trigger any action (no mailto, no links from document content).
- Quantities are never converted silently [WF Data rules][DM Quantity management]. fm, rm, m³, t, Stück and LDG stay
  distinct; a derived value always shows the factor version next to it.
- The map shows OpenStreetMap tiles with attribution [RES §3]. Pins are **dispatcher-confirmed** or marked as
  unconfirmed; the demo never presents a fixture position as a real stack location.

## 2. Workspace, roles, personas [WF Simple screens and permissions]

One carrier = one isolated workspace. The demo tenant is **Musterholz Transporte GmbH** (fictional, Oberschwaben)
with the inbound address `auftrag@musterholz-transporte.demo`. A header persona switch plays the three roles [DEMO]:

| Role | May |
|---|---|
| Administrator | manage users, trucks, driver groups, customer profiles, retention; everything below |
| Disponent | review documents, confirm locations, publish, allocate, resolve conflicts, match tickets, export reports |
| Fahrer | see assigned work and fleet-visible work they are authorised for; record pickups, clearance, problems, delivery notes, arrival, ticket photos; never sees freight rates or restricted fields |

One person can hold all three roles (owner-driver persona "Inhaber (Disposition + Fahrer)"). Customers have no
accounts.

## 3. Entities (`core/model.js`) [DM One database]

| Record | Fields | Source |
|---|---|---|
| Party | id, roles (customer, carrier, mill, receivingSite, forestManager), name, address, contacts (role, name, phone — demo placeholders), aliases (sender domains, letterhead strings) | [DM] |
| SourceDocument | id, carrierId, sender, subject, receivedAt, attachments[{name, pages[{n, kind text/scan/map, lines[{text,y,x}]}]}], docClasses per page, contentHash, version, status Received/NeedsReview/Ready/Failed/Duplicate/Superseded, extraction {orderIds, exceptions}, reviewedBy/At | [WF §1–2][DM] |
| TransportOrder | id (internal `TA-2026-nnnn`), customerId, carrierId, references {orderNo, purchaseNo, consignmentNo, partieNo, kaufNo, hieb, los, raw[]}, documentType (as printed), collectionWindow {from, to, raw}, destination (partyId, raw), pickupKind roadside/industrial, contacts[], instructions[], restricted {freightRate, price, paymentTerms}, measurementBasis, certification, status, versions[], sourceRefs[] | [WF Data rules][DM] |
| OrderStackLine | key `orderId/hieb/los/polter` or `orderId/ladenummer`, references {hieb, los, polter, ladenummer, pos}, timber {species, assortment, grade, lengthM, raw}, planned {qty, unit, raw}, pieces, breakdown[] (species/grade shares, informational), location {raw, format, crs, parsed, confidence, status}, confirmedLocation {lat, lon, method, by, at}, progress Available/PartlyCollected/Cleared/Blocked, publication {scope none/fleet/group/named, targets[]}, sourceRef {page, region} | [WF §2–3][DM] |
| Allocation | id, stackKey, driverId, truckId, share {kind whole/loads/qty, value}, state Proposed/Accepted/Reserved/Withdrawn/Reassigned, by, at | [WF §4] |
| Load (Fuhre) | id `F-nnnn`, orderId, truckId, trailer, driverId, loadedAt, arrivedAt, unloadedAt, destinationId, state Planned/Loaded/Arrived/Unloaded/Measured/Reconciled + Rejected/Diverted/Disputed, lines[{stackKey, qty, unit, basis}], deliveryNoteId, receiptIds[] | [DM] |
| CollectionEvent | id (client UUID), allocationId/stackKey, loadId, driverId, kind pickup/cleared/problem/arrived/photo, eventTime, receivedTime, qty/unit/pieces (optional), note, problemKind, sync pending/acked/conflict | [WF §5–6] |
| DeliveryNote | id `LS-2026-nnnnn`, loadId, numbers {carrier, customer, recipient}, issuedAt, declaredLines[], vehicle, driver, destination, form generated/photo, signature | [DM] |
| MillReceipt | id, ticketNo, millId, siteId, arrivedAt, unloadedAt, vehicleReg, referencedDeliveryNotes[], weighbridge {gross, tare, net, unit}, measuredLines[{species, assortment, grade, lengthM, qty, unit, method}], deductions[], acceptance accepted/rejected/partial, source email/photo/eldat, matchState Matched/MatchNeeded/Disputed, loadId | [DM] |
| QuantityEntry | id, basis ordered/driverEstimate/deliveryNote/millMeasured/weighbridgeNet, qty, unit, method, scope {orderId, stackKey, loadId, receiptId}, source {docId, page, region} or {eventId}, confidence, createdAt, derived {factorId, from} | [DM Quantity management] |
| Quota (Kontingent) | id, customerId, millId, period, qty, unit, receivedToDate | [DM, "to confirm"] |
| CustomerProfile | id, partyId, labels {canonical → synonyms[]}, units, measurementBasis, referenceFormats, decimal, documentClasses[], layouts[], reviewedDocuments (full review until > 0) | [DM Customer profile] |
| Exception | code, severity block/warn/info, scope document/order/line, message, suggestion (never auto-applied), resolvedBy/At | [WF §2, Data rules] |
| AuditEntry | at, who, action, before, after, ref | [WF MVP: audit trail] |
| Conflict | id, kind doubleClaim/pickupAfterWithdrawal/contradictoryQuantity/clearedTwice/revisionDuringWork, refs, resolution | [WF Reliability] |

Identity is scoped [WF Data rules]: a stack number alone is never a key; the key always carries carrier, customer and
order/felling/lot context. A stack appearing in another order is flagged `E-OVERLAP` and never merged.

## 4. State models [WF Data rules][DM State models]

- **Intake**: Received → Needs review → Ready. Side states: Failed (retry / manual entry), Duplicate (exact resend:
  no live work created, linked to the original), Superseded (an amendment replaced it after review).
- **Stack progress**: Available → Partly collected → Cleared; Blocked as exception (dispatcher sets/unsets).
- **Publication** (separate from progress and from allocation): none → fleet / group / named drivers.
- **Allocation**: Proposed → Accepted (driver) or Reserved (driver takes shared work; needs connectivity) →
  Withdrawn / Reassigned by dispatch. Only one Accepted/Reserved allocation per stack share at a time.
- **Load**: Planned → Loaded (delivery note issued) → Arrived → Unloaded → Measured → Reconciled; exceptions
  Rejected, Diverted, Disputed. Delivered-awaiting-measurement = Unloaded without a receipt.
- **Order**: Open → Collection complete (every stack Cleared or resolved by dispatch) → Delivery complete (every load
  Unloaded or resolved) → Receipts complete → Reconciled. Paused, Cancelled, Superseded stay in history.
- A mill ticket closes the **load**, not the stack. Stack clearance is the driver's explicit action [DM].
- A pickup records collection, not delivery; a load leaving the forest does not finish the stack [WF §5–6].

## 5. Extraction, validation and review [WF §2, Data rules][DM How AI reads]

### 5.1 Page classification
Classes: `order`, `order_continuation` (Polterinfo, Sortenzusammenfassung, terms page), `map`, `delivery_note_form`
(blank form), `collection_report_form` (Abfuhrmeldung/Fertigmeldung), `amendment`, `mill_ticket`, `other`. One PDF
may carry several classes [DM]. A map page or a blank form never becomes an order [WF §1][S-BAYSF][S-TTW].

### 5.2 Field extraction
Each proposed field is `{value, raw, unit, page, region, confidence, source: text|ocr|manual}` [DM]. Header labels come
from the customer profile's synonyms; the canonical set is the label dictionary [DM p5–6]: document type and number
(Holzbereitstellung Nr. · Fuhrauftrag Nr. · Frachtauftrag · Transportauftrag · Transportmeldung Nr.), issuer
(Auftraggeber · letterhead), carrier (Frachtführer · Fuhrunternehmer · Spedition), destination (Zielwerk · Empfänger /
Zielwerk · Lieferadresse · Empfänger), references (Partie-Nr. · Kauf-Nr. · Verkaufsnummer · Auftrag + Los · Hieb- /
Losnummer · Polter-Nr · Kunden-Partie), collection window (Abfuhrzeitraum … bis · Abfuhrbeginn / Abfuhrende ·
Abholdatum · abzuschließen bis), stack hierarchy (Fowj / Hieb / Los / Polter · Pos.), quantity (Menge fm/rm · Fm ca. ·
Stück · Stückzahl · LDG), timber (Holzart · Baumart · Sortiment · Sorte · Länge · Güte), measurement basis
(Abrechnungsmaß: WA), pickup location (GPS-Koordinaten · GPS-Koord. X/Y · Abholadresse), contacts (Revierleiter ·
Disponent · Einsatzleiter · Ansprechpartner vor Ort · Kontakt), restricted commercial (Frachtsatz · Preis ·
Zahlungsziel · Skonto), certification (PEFC · FSC), loading slots (Ladenummern + weekday), completion (Abfuhr restlos
beendet am · Fertigmeldung).

Stack tables are parsed from the header line of the table (column names → positions); breakdown lines
("Polterinfo", species/grade shares, "Sortenzusammenfassung", "Summe je Los", "Zwischensumme", "Gesamt") are kept as
**informational** lines and never counted as stacks or volume [WF Data rules][S-TTW][S-MENGEN].

Preserve source meaning: leading zeroes (`0727603001`), German decimal notation (`230,636`) and mixed notation
(`15.00 fm` beside `148,02 fm` [S-MENGEN]) are kept in `raw`; `value` is the normalised number. Unexplained codes
(`BC`, `NFI`, `Kappholz`) are kept as printed and shown with "nicht aufgelöst" instead of being expanded [WF].

### 5.3 Validation rules → exceptions
| Code | Rule | Severity / scope | Sample |
|---|---|---|---|
| E-DUP | contentHash equals an earlier document → Duplicate, no live work | info / document | resend scenario |
| E-AMEND | same customer + order number, different content → proposed version diff; pickups kept | warn / order | revision scenario |
| E-NOID | no customer order number → internal reference assigned, no invented customer reference | warn / order | [S-PELLET] has a barcode only |
| E-TOTAL | printed total ≠ sum of lines → both kept; info within the tolerance, warn beyond it | info–warn / order | [S-HTL] 98,89 vs 98,88 fm (info) |
| E-LOTSUM | lot/grouped summary inconsistent with lines → lines win for stacks, summary kept as printed | warn / order | [S-MENGEN] "Summe je Los" groups 9407/9211/9408 together, two lots missing |
| E-COORD-FMT | coordinate string malformed (seconds ≥ 60, mixed separators, unknown system) → flagged, suggestion offered, never auto-applied | block / line | [S-MENGEN] `09° 21' 1244,7"` |
| E-COORD-RANGE | parsed coordinate outside Germany / implausibly far from the issuer's region or axis order swapped | block / line | synthetic |
| E-COORD-NONE | no coordinate, no address → Location needed | block / line | [S-HTL][S-TTW][S-BAYSF] |
| E-MAP-ONLY | only a printed map → dispatcher places pin from the map image | block / line | [S-HTL][S-TTW] |
| E-LEN | header length ≠ line length | warn / order | [S-TTW] "3m-lang" vs 4,00 |
| E-INSTR | conflicting instructions (weekly vs month-end report) | warn / order | [S-TTW] |
| E-UNIT | unit missing or ambiguous; vehicle capacity ≠ ordered quantity | warn / line | [S-PELLET] 5 LDG vs 90 m³ truck |
| E-SPECIES | species/assortment missing | info / line | [S-HTL] columns empty |
| E-BLANKFORM | blank delivery-note or report form found → supporting material | info / document | [S-BAYSF][S-TTW] |
| E-OVERLAP | same physical stack (customer + hieb/los/polter) already in another open order | warn / line | synthetic |
| E-WINDOW | collection window reversed (info), missing or in the past (warn) | info–warn / order | [S-HTL] "bis" before "vom" in the text layer; [S-MENGEN] none printed |
| E-RESTRICTED | commercial field found → stored, hidden from drivers, redacted in driver excerpts | info / order | [S-TTW][S-BAYSF][S-PELLET] |
| E-NEWCUST | first document of a customer → full review | info / document | all five |
| E-SCAN | page has no text layer → manual capture | block / document | [S-MENGEN][S-PELLET][S-BAYSF] |
| E-ADDR | an office/mill address would be the only location → never used as pickup | block / line | guard (the model refuses `method:'address'` for roadside stacks) |
| E-DEST | destination (Zielwerk/Empfänger) not printed or only on a form page → confirm before release | warn / order | [S-TTW] blank Zielwerk, page 5 names the issuer; [S-MENGEN] [S-HTL] |
| E-CARRIER | carrier not printed; delivery to our inbox counts as addressing | info / order | [S-MENGEN][S-HTL] |
| E-PIECES | piece count printed as 0 → kept as "0 (laut Dokument)", never a confirmed zero | info / line | [S-MENGEN] |
| E-MAP | map page found → supporting evidence, not a coordinate source | info / document | [S-HTL][S-TTW] |
| E-NOORDER | neither order nor mill ticket recognised → classify manually | warn / document | guard |

Blocking exceptions block **the affected line** (or order header), not the inbox; complete lines of the same order
may be released separately [WF §2].

### 5.4 Review screen behaviour
Original page facsimile beside the proposed fields; clicking a field highlights its region on the page; each field
shows confidence and source; the dispatcher accepts, edits (audit entry) or rejects. "Freigeben" moves the document
to Ready and creates/updates the order; blocked lines stay in "Standort erforderlich". Dispatcher corrections update
the customer profile (synonym learned, unit default) [DM].

## 6. Location handling [WF §3, Data rules]

- `core/coords.js` parses: DMS (`09° 19' 29,1"`), decimal degrees, UTM 32/33 (`32U 512345 5412345`, `E/N`),
  Gauss-Krüger zones 2–5 (7-digit easting starting with the zone), and returns `{crs, lat, lon, verdicts[]}` or a
  failure with reason. Plausibility: axis order, numeric ranges for Germany, distance to the issuer's region
  (customer profile `region`), seconds/minutes < 60 [RES §2]. Malformed input yields a **suggestion** (e.g.
  "Sekundenwert ÷ 100 ergibt eine plausible Lage") that needs explicit approval.
- Raw string, declared format and declared CRS are stored; the reviewed location is stored as WGS84.
- Work without a confirmed pickup point stays in **Standort erforderlich** and is never a precise pin. The
  destination is a separate location. An office, forest-manager or mill address is never a pickup point (E-ADDR).
- Placing from a map image: the dispatcher sees the map page facsimile and the live map side by side and clicks to
  place; confidence `manual-from-map`; the pin says "aus Kartenbild platziert".
- A pin or road route is not proof of truck access [WF MVP]; the pin popup says so and offers the Revier contact.

## 7. Screens

### 7.1 Shell [DEMO]
Dark-blue Trimble bar: Posteingang (badge: needs review) · Disposition · Mobil · Belege & Abgleich · Verwaltung ·
Berichte; tenant name; persona switch (Administrator · Disponent · Fahrer: name); online/offline indicator (for the
driver persona); language DE/EN/FR; "Demo" tag. Footer: demo disclaimer and data provenance line.

### 7.2 Posteingang & Prüfung [WF §1–2]
**Originals.** A document's original file (PDF or photo) is kept **in the browser** (IndexedDB, memory fallback) when a
PDF is imported or attached with „Original hinterlegen"; nothing is uploaded and the sample originals are not in the
repository (they contain personal data). The review toggles between the facsimile and the original rendered page by
page with pdf.js; „Original für Fahrer freigegeben" (default off when commercial fields were detected) decides whether
drivers open the original or the redacted excerpt. [DEMO]

Left: document list (sender, subject, received, pages, class chips, status, exceptions count), filters (status,
customer), "Demo-E-Mails zustellen" (delivers the five fixtures as five e-mails, plus the resend and the amendment
scenario on demand), "PDF/Text importieren" (drop a PDF when pdf.js is available, or paste text lines). Right: the
review workspace (§5.4) with page tabs, class per page, the proposed order header, stack lines table (status pill per
line), exceptions panel, version diff for amendments (added / changed / removed lines; pickups preserved note),
"Freigeben", "Als Duplikat ablegen", "Manuell erfassen". Documents of a new customer show the "Vollprüfung" banner.

### 7.3 Disposition — Karte & Liste [WF §3–4]
Split view: map (pins per confirmed stack with customer colour, deadline ring, progress arc; clusters at low zoom;
destination markers; "Standort erforderlich" list in a side panel) and list (order → stacks; columns: customer,
reference, Hieb/Los/Polter, species/assortment, planned qty/unit, pieces, deadline, location status, publication,
allocation, progress). Filters: customer, due date, driver, availability. Actions on selection: Veröffentlichen
(Flotte / Gruppe / Fahrer), Zuteilen (driver, truck, share: whole / n loads / qty), Zurückziehen, Neu zuteilen,
Blockieren, Standort bestätigen / platzieren, Fahrerauszug (driver-safe excerpt). Panels: offene Arbeit, blockierte
Polter, Räumungsmeldungen, Konflikte, Pending sync counts, "zuletzt aktualisiert". Clicking a pin opens a **pin card**
anchored to the marker: stack reference, customer and order, timber, planned-vs-collected progress bar, deadline,
destination, location and how it was confirmed, problem flag, district contact as a tel: link, photos (lightbox), a
navigation link to the pin (external maps app, with the reminder that a pin is no proof of truck access) and the
dispatcher actions. Backgrounds: OpenStreetMap, basemap.de (BKG, CC BY 4.0), OpenTopoMap, none. [DEMO]

### 7.4 Mobil — „Meine Arbeit" [WF §5]
Phone-frame on desktop, full width below 700 px. Truck-driver first: the **hero card** shows the task at hand (next
accepted or reserved stack; tap another row to switch) with the three facts that matter at the wheel (quantity,
deadline, distance), a progress bar, one big **Navigation starten** button (external maps app), the district contact
as a call link, and thumb-sized primary actions; the other tasks are compact rows. Pickup, clearance and problem dialogs
take **photos** (camera or file, downscaled in the browser) that attach to the stack and appear in the hero, the pin
card and the dispatch focus card. **Original öffnen** shows the stored original document when the dispatcher released
it for drivers, otherwise the redacted excerpt. [DEMO] Header: driver, truck, connectivity toggle (Online / Offline),
"zuletzt aktualisiert", pending-sync badge. "Herunterladen" stores assigned jobs, confirmed locations, driver-safe
excerpts and contacts for offline use. Job cards (not office forms): customer, reference, stack, quantity/unit,
deadline, distance from a chosen base, open/partly/cleared pill, map thumbnail, contacts, excerpt. Primary actions:
**Abholung erfassen** (stack, load, qty if known with unit, pieces optional; unknown stays unknown, never 0),
**Polter geräumt** (explicit confirmation, scope of this instruction), **Problem melden** (Zufahrt blockiert · Holz
nicht gefunden · falscher Standort · Mengenabweichung; note; photo placeholder). Load flow: **Lieferschein
ausstellen** (pre-filled; or "Kundenformular fotografiert"), **Ankunft melden**, **Abladung** (accepted / rejected /
diverted / partial with reason), **Werksschein fotografieren** (creates a photo-sourced receipt for matching).
Fleet-visible work: "Übernehmen" reserves (needs connectivity; offline → "Verbindung nötig"). Offline actions show
"Ausstehende Synchronisierung" until acknowledged; reconnecting replays the queue once.

### 7.5 Belege & Abgleich [WF §7][DM]
Tabs: Lieferscheine (list, print A4), Werksscheine (Matched / Zuordnung erforderlich / Disputed; sources e-mail,
photo, ELDAT; "Zuordnen" dialog with candidates by delivery-note number, then vehicle + mill + arrival window + order
reference; never by stack number alone), Mengenbuch (the ledger, filter by basis/scope, derived values with factor
version), Abgleich (per load: driver estimate vs delivery note vs mill ticket; per stack and order: ordered vs
collected vs received with deviation reasons; per quota: received vs quota with overshoot warning), Ausnahmen
(differences above tolerance). "Demo-Werksscheine zustellen" delivers three tickets: exact note match, vehicle and
window match, unmatched.

### 7.6 Verwaltung [WF Simple screens]
Benutzer & Rollen, Fahrzeuge, Fahrergruppen, Kundenprofile (synonyms, units, formats, document classes, reviewed
count, region), Werke (parties), Umrechnungsfaktoren (versioned, informational), Aufbewahrung (retention text),
Audit-Trail, Daten zurücksetzen.

### 7.7 Berichte & Export [WF §6][S-TTW]
Per order: Abfuhrmeldung / Fertigmeldung (TTW-style form filled from events: Fuhre Nr, Datum, FZ-Nr, Vol. gesch.
FM/RM, Stückzahl, Verwendung im Werk, Summe / Soll / Differenz, Gründe für Mengenabweichungen, "Abfuhr restlos beendet
am"), collection/completion report with source-document links and collection history, JSON export. Sending is a
deliberate action: "Als gesendet markieren" with an audit entry; nothing is e-mailed.

### 7.8 Lieferschein (print) [S-BAYSF][ELDAT]
A4 page: carrier note number, customer note number (if prescribed), recipient/Werk, Polter-Nr, Spedition,
Kunden-Partie-Nr, Forstbetrieb/Revier, Anlieferdatum, KFZ-Kennzeichen, Fahrer, Schätzmaß + unit, Stückzahl, Baumart,
Sorte, Länge, "Transport abgeschlossen", Annahme (date, time, signature of recipient). Field set follows the BaySF
form and the ELDAT delivery-note header/position fields [RESEARCH §1].

## 8. Offline operation, sync and conflicts [WF Reliability]
- Events carry a client-generated id, `eventTime` and, once acknowledged, `receivedTime`. Replays are idempotent.
- The driver device holds downloaded work; new shared-work reservations need connectivity.
- Conflicts never resolve by last-update-wins: double claims, a pickup after withdrawal, contradictory quantities for
  the same load, a stack cleared twice, a revision during fieldwork → Conflict records for dispatch with both sides.
- Reassignment/cancellation reaching a disconnected driver is shown as uncertain ("nicht bestätigt — Fahrer
  kontaktieren"). Removed access takes effect on reconnection; local-data expiry is a separate setting.

## 9. Permissions and redaction [WF Simple screens]
Drivers never see `restricted` fields; driver-safe excerpts are facsimiles with restricted regions blacked out and
unrelated orders removed. Hiding the extracted fields alone is insufficient, so the excerpt is generated per page from
the page lines with the restricted lines replaced by a "█ redigiert" block.

## 10. Acceptance scenarios (release acceptance [WF p8]) → tests
| # | Scenario | Test |
|---|---|---|
| A1 | Each sample PDF becomes correctly grouped draft work or an explicit exception; no uncertain pin is confirmed | `tests/transport-model.cjs` §1 |
| A2 | Resend creates no duplicate live work; amendment preserves pickup history and highlights changes | §2 |
| A3 | Fleet-wide and named publication respect permissions; allocation prevents overlapping connected claims | §3 |
| A4 | Partial pickup leaves the stack open; explicit clearance closes only its scope; pickup ≠ delivered | §4 |
| A5 | Offline actions survive reconnection and appear once; contradictory updates surface | §5 |
| A6 | Completion export links back to instruction and history; not sent automatically | §6 |
| A7 | Mill ticket matches by delivery-note number, or vehicle + arrival window; unmatched → review; differences visible | §7 |
| A8 | Screens: inbox, review, dispatch, mobile, receipts, admin, report render and act in DE/EN/FR | `tests/transport-ui.cjs` |

## 11. Not in the MVP [WF MVP boundary]
Procurement ERP, timber purchasing and settlement, freight invoicing, automatic fleet optimisation, live vehicle
tracking, customer portal, universal georeferencing of scanned maps, truck-safe forestry navigation (the pin popup
says a pin is not proof of access), mill settlement (Werksabrechnung), ELDATsmart message sending (import of an
ELDAT-shaped ticket is simulated as JSON only).

## 12. Open decisions carried from the sources [WF p9–10][DM p6–7]
Pilot carrier rules for shared work, partial loads and who may declare a stack cleared · map/navigation approach and
offline coverage · hosting, retention, driver-access controls, customer report requirements · real delivery notes and
mill tickets from pilot mills (the pack has none completed) · quota practice · ELDATsmart messages vs PDFs · overlap
with LOGIBALL Timber Flow · quantity-difference tolerances (the demo uses 0,5 % as a placeholder, labelled).
