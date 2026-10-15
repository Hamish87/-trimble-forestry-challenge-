# CFHarvest Planning (web) — functional specification for the replica (v2, evidence-backed)

Scope: the **Planning** web application ("CFHarvest Webb", route `/planning/index.html#/reserve`). Source keys: **[Mnn]** manual screenshot n and **[V6-m:ss]** video frame, both listed in `evidence/CAPTURE_LOG.md`; **[MW]** manual text, **[SS]** Trimble spec sheet, **[VS]** Viktiga steg, **[MM]** Manual Maskin. **[DEMO]** = our design decision where nothing was observed. Everything else is `[observed]`.

Replica language policy: **German is the default UI language**, with the game's EN/FR switch. The product's Swedish term is kept as a secondary label (tooltip or small caption) wherever it is a documented product term, so the replica reads as German but still teaches the real vocabulary. [DEMO — requested by product owner]

Two UI generations exist [M28 vs M8]: an older green-bar shell and a newer dark-blue icon-bar shell. The replica follows the **newer** shell for the frame and the **older** manual captures for screen content (they are the only full-screen captures of the planning views). [DEMO]

## 1. Shell [M8][M28][M36]

Top bar items (newer shell): BESTÄLLNINGAR · ARBETSPLANERING · MEDDELANDEN · ADMINISTRATION ▾ · INTEGRATIONSLOGG · RAPPORTER · HJÄLP ▾. Right end: tenant and user "Sydved/SEBio - Andreas Elling · Logga ut" [M50]. German replica labels: Bestellungen · Arbeitsplanung · Nachrichten · Administration · Integrationsprotokoll · Berichte · Hilfe.

Administration menu [M8]: Resurser · Resursöverföringar · Veckokalender · Arbetsgrupper/Drivningskedjor · Användare · Avtal · Eget företag · Företagsinställningar · Meddelande mallar · Certifieringsområden · Mål för avsatt volym för certifikat · Kartskikt · Filer · Kontrollmätningar · Ta bort arbetsorder · Frågor slutvärdering · Varningar. Milestone 2 implements Resurser, Veckokalender, Arbetsgrupper/Drivningskedjor, Användare; the rest are listed but disabled. [DEMO]

## 2. Arbetsplanering

### 2.1 View selector and filters [M36][M37][V6-0:12]
- "Select views" multi-select with checkboxes: **Uppdragslista · Uppdrag på kartan · Kalender · Resurser**. Any combination; the chosen views are laid out left-to-right in that order and separated by draggable ↔ splitters [M37]. Selection text shows the checked names joined by commas.
- Åtgärd filter segmented buttons right of the selector: **Drivning · Skoglig Service · Alla** (default Drivning) [M36].
- Far right: **"Välj resurs ▾"** dropdown listing every plannable resource, team and chain (chains appear as "H/F" names, e.g. "Rottne H11/F11") [M49], and **"➦ Flytta till resurs (n)"** where n = number of selected rows; disabled at 0 [M50][V6-0:30].

### 2.2 Uppdragslista (assignment list) [M40][M47][M48][M62][V6-0:30][V6-2:12]
Toolbar (left→right): 👁 **Visa filter** · ⊘ **Ta bort filtreringar** · 👥 **Planera till vald resurs** · ≡ "Redigera kolumner" · ⇕ sort · ⊙ select all · ⤭ "Ordna om löpande nummer" · ⚡ · 🔗 · ⛓ "Avplanera arbetsorder" · ↶ undo · search box "Sök arbetsorder…" 🔍 · **PDF** · **XLSX** · **Ny Arbetsorder**.
Pager under the toolbar: ‹ 1 2 › and page size 12 · 24 · Alla (15) [V6-0:30].

Columns (default, in order) [V6-2:12]:
| Column (SV) | German | Content |
|---|---|---|
| Löpnr. | Lfd. Nr. | sequence number box when planning a route [M48]; ➦ icon = has been sent [M40] |
| Status | Status | pill, see 2.3 |
| Uppdragsgivare | Auftraggeber | client code e.g. "SYD" |
| Kontrakt nr. | Vertrags-Nr. | e.g. 63511118 |
| Arbetsorder nr. | Arbeitsauftrags-Nr. | link, e.g. 566064-01 |
| Namn | Name | link to detail; trakt name e.g. "Ekhult 2:20 -22 Gallring" |
| Tillgänglig för … (från) | Verfügbar ab | "Ej specificerad" or date |
| Tillgänglig för … (till) | Verfügbar bis | "Alltid" or date |
| Åtgärd | Maßnahme | Gallring · Första gallring · Slutavverkning · Föryngringsavverkning … |
| Föreg. arbetsorder | Vorheriger Auftrag | predecessor reference |
| Planerad | Geplant | volume "662,0 m³" |
| Areal | Fläche | "25,7 ha" |
| Börjar | Beginn | planned start "7 nov. 2022" |
| Slutar | Ende | planned end |
Totals row: Σ Planerad and Σ Areal ("12 139,0 m³ · 158,9 ha") [V6-2:12]. Row text is bold for selected/active rows [M47]. "Ledig *" asterisk marks orders with map data [M47][inferred].

Selection: click row toggles selection (multi); selected rows get a highlighted background with orange top/bottom borders [M47]. Hover a name → tooltip with the full name [M70].

### 2.3 Status pill scheme [M40][M54][M70][V6-2:12]
The pill text is the **assigned resource/team/person name(s)**; the colour is the **status**:
| Colour | Status (canonical) | Label |
|---|---|---|
| green outline | `available` | "Ledig" |
| light purple / pink filled | `planned` (not sent) | resource names |
| solid purple filled | `sent` (Arbetsorder skickad till resurs) | resource names |
| teal filled | `sent` to a team/arbetsgrupp | team name |
| yellow filled | `started` (harvesting or forwarding started) | machine names, comma-separated |
Order detail titles carry the long status text: "(Arbetsorder skickad till resurs)", "(Arbetsorder skickad till CFHarvest (Planerbar))", "(Skotning Startad)" [M73][M76][V6-1:10]. Spec-sheet machine statuses map onto these: Available→available, Planned→planned, Sent to Resource→sent, Harvesting Started/Felling Ended/Forwarding Started→started (sub-status shown in title), Completed→completed (replica: green "Avslutad") [SS][DEMO].

### 2.4 Uppdrag på kartan (map view) [M41][M42][M73]
Orders drawn as green circles; nearby orders cluster into a larger translucent green circle with a count [M41]. Zoomed in, the actual stand polygons appear with a black label box "SYD Anders Karlsson 123" = client · name · order nr [M42]. Map controls: pan ▲◀▶▼, zoom +/−, measure, pin, polygon, print; scale label (e.g. "1:2 000 000"), lat/lng readout, layers (🗂) and legend (💡) buttons [M37][M41]. Clicking a feature selects the order in the list. [MW][DEMO for exact sync]

### 2.5 Kalender (resource calendar / Gantt) [M38][M52][M55][M56–58][M59][M64][M67][M71]
Toolbar: **✈ Skicka** (tooltip "Skicka till resurs") · 📅 "Visa detta datum" · ⟳ · ≡ "Komprimera" · ⬇ · 🔻 filter · ↔ · 📊 · 🌲 · zoom **D · V · MÅN · 3MÅN** · "Period: 27 jan. 2023, 31 dagar" · ◀◀ ◀ ▶ ▶▶. Right: **Planeradn** · **↶ Återställ (n)** · **💾 Spara** (changes are staged; Återställ count = unsaved changes) [M50][M52][M68].
Left column "Resurser": multi-select "Rottne H11 (2068989), Rottne…" with Sök and ✓ Välj alla; each row "Name (StanForD nr)" [M55]. Rows include single machines and chains ("Rottne H11/F11 (2070898)").
Header: year/month band ("1/2023", "2/2023"), ISO week numbers ("4", "5"), day numbers; today's column is green; weekends shaded [M38][M59].
Bars: purple, text "SYD - 63511126 - 563206-01 - Rönhult 1:2 -22 Ga-övr" (client - contract - order nr - name). Chain planning: the bar is solid on the chain row and **mirrored as outlined bars on each member row** [M59][M61]. Selected bar = orange outline [M71]. Hover tooltip: title, åtgärd, volume "500 m3", "06.02.2023 - 15.02.2023" [M71]. Orange bars = started [M71][inferred]. Bar length = capacity-based duration (see §4).

### 2.6 Resurser view [MW]
Follow-up per resource and order (capacity, planned volume, production). Minimal in milestone 2: table resource · dispatched order · planned days · produced m³ (from HPR/FPR). [DEMO]

## 3. Planning interactions

### 3.1 Plan orders to a resource — button path [M48][M49][M50][M51][MW]
1. Select rows (checkbox/click). 2. Choose "Välj resurs" and click **Flytta till resurs (n)**, or use toolbar "Planera till vald resurs". 3. Dialog **"Välj datum"**: "Välj startdatum för första arbetsorder" with date input + 📅; warning text "OBS! Ändring av datum kan ändra ordningen på ej startade arbetsordrar."; buttons **Avbryt · Lägg till som sista · OK** [M51]. "Lägg till som sista" appends after the resource's last planned item; OK plans from the chosen date. 4. Orders appear in the calendar as light-purple (planned, unsaved) bars; Återställ counter increments; **Spara** persists [M52][M68]. Sequence numbers can be typed in the Löpnr. boxes ("Ange ordningsnummer") and "Ordna om löpande nummer" renumbers [M46][M48].

### 3.2 Drag and drop [M47][M59][M60][M68][MW]
- **List → calendar row**: drag one or several selected rows (ghost shows the åtgärd label, move cursor) and drop on a resource row at a day; the drop day becomes the start of the first order; subsequent selected orders follow in sequence [M47][MW].
- **Calendar bar → another resource row**: on drop a dialog "Arbetsorder flyttad till resurs <name>" with ☑ "Lås start- och slutdatumen" and **Avbryt · Flytta · Kopiera** [M60]. Flytta moves; Kopiera keeps the original and creates a copy on the target (forwarder working for several harvesters) [MW].
- **Insert between**: drop a bar into a gap between two planned bars; later bars shift right on Spara [M68][MW].
- **Reorder within a row**: drag a bar before/after another bar [inferred from M68].
- Touch/keyboard fallback: the button path in 3.1 and "Zwischen Aufträgen einfügen" must remain. [DEMO]

### 3.3 Send to resource [M53][M54][M56][M69]
**Skicka** opens dialog **"Skicka till resurs"**: ☑ "Filtera enligt kalendern"; one collapsible section per resource "Rottne H11 (2068989)  Alla (1/1)  Förhandsanmälan"; inside, each planned order as a purple row with checkbox: "SYD - 63511126 - 563206-01 - Rönhult 1:2 -22 Ga-övr - Gallring-1701 m³ | 31 jan. 2023 - 8 feb. 2023 | ⊘" and a line "PIN-filer: 05800_kinnared 746_GRAN_891750"; a yellow banner "Några sortiment saknar PIN-filer" when an assortment has no PIN; buttons **Avbryt · Skicka**. After sending, the pill turns solid purple [M54] and the list shows the ➦ icon [M40]. Sending generates OIN + PIN for harvesters and FOI + FDI for forwarders [SS][VS].

### 3.4 Unplan [M62][M63]
Toolbar ⛓ "Avplanera arbetsorder" (or calendar) → dialog "Vill du flytta dessa arbetsordrar tillbaka till öppna för planering?" listing "[pill] SYD - 12 - 1233 - Anders Karlsson - Slutavverkning"; **Avbryt · Avplanera** (orange). Status returns to available.

### 3.5 Komprimera [M58][M64][M65][M67]
Calendar ≡ → dialog "Select time interval for compressed schedule" (sic, English in product): Startdatum · Slutdatum · ☐ "Set new start date for working sites" · **Avbryt · Ok**. Removes gaps for the selected resources within the interval, keeping order.

### 3.6 Order quick-edit (double-click a bar) [M72]
Modal titled "SYD - 12121212 - 1234543321  <resource>" / order name; ✉ **Skicka meddelande**; table **Åtgärd · Arbetsmängd · Uppskattad arbetstid** with a Summa row ("Slutavverkning · 500 m³ · 10 h"); **Veckoarbetstid** Vardag 8 · Lördag 0 · Söndag 0; info "Manuell arbetstid för arbetsorder är satt till 56 timmar" when overridden; **Startdatum** (date + hh:mm spinners) · **Slutdatum**; "Beräknad sluttidpunkt: 08.02.2023 01:59"; **Avbryt · Radera · Uppdatera**.

### 3.7 Order detail page (click name) [M73][M75][V6-1:10][V6-1:29][V6-1:45][V6-2:01]
Title: "SYD - 63560704 - 570858-01 - Ulvberga 1:5 -23 SL - Slutavverkning (<status text>)"; right: **Funktioner ▾** · 👁 **Göm karta / Visa karta**. Map (aerial) with stand polygon(s), landing (avlägg) icon, optional blue soil-moisture overlay; scale, layers, legend.
Tabs: **Arbetsorder · Övrig info · Område · Sortiment · Avlägg · Hänsyn · Säkerhet · Kontaktuppgifter · Föregående/nästa arbetsorder · Utfört Arbete · Tillägg/Avdrag · Provytor · Statusändringar**.
- *Arbetsorder*: **Grunddata** — Kontrakt nr. · Arbetsorder nr. · Namn · Kundgrupp · Certifiering ("Ingen certifiering") · Arbetsorderns stödformer · Projektnamn · Skogsvårdsavtal · Terrängplanering gjord · Fastighetsbeteckning · Kommun · Areal (ha) · Kvantitet (m³) · Skotningsavstånd (m) · Åtgärdsgrupper ("Virkesdrivning"). **Arbetets utförande** — Status · Prioritet ("Lägsta") · Planerad åtgärdstidpunkt · Tillåten åtgärdsperiod (Avverkningsanmälan) "6 feb. 2023 - 15 dec. 2027" · Planerbar (Ja/Nej) · Åtgärd kan ej utföras · Beskrivning av åtgärdsbegränsning · GROT (Ja/Nej) · Slutdatum för avverkning · Stubbrytning · Slutdatum för stubbrytning · Stubbehandling · Kvalitetskontroll krävs · Provytemätning krävs.
- *Övrig info*: "Information till Entreprenör" (textarea, 0/1000 tecken) · "Beskrivning av åtgärd (Skogssystem)" (read-only, from the client's system) · "Information till Uppdragsgivare" (0/1000) · "Foton" · Stäng.
- *Sortiment*: header fields Torrklass · Fuktprocent i grot · Längd och beskrivning av träd som blir kvar hos skogsägaren · Träd som blir kvar hos skogsägaren · Fördelningstabeller (bucking tables, "Visa mer"); Grovlekar (dm³); Trädslag · Trädslagskvalité · Trädslagsvolym table; **assortment table**: Mottagningsplats · Sortiment · Sort.grupp · Volymkategori ("Under bark") · På arbetsordern (m³, editable) · Skördare (m³) · Skotare (m³) · Skogslager (m³) · PIN (count) · Mätmetod ("Fabriksmätning") · Mätplats ("Industrimätning") · row actions (edit, delete, star) + "Detaljerad information".
- *Kontaktuppgifter*: Namn · Befattning · Adress / Avlägg · Telefon · E-post · Språk · Meddelanden; grouped Skogsägare / Uppdragsgivare.
- *Avlägg*: landings list; new landing on the map [MM].
- *Område*: departments, volume per department, totals, operation type, stump treatment, GROT [MM].
**Funktioner** menu [M75]: Kontrollmätningar · Vågkontroll · Skotningsprognos (disabled until data) · Skotningsanmälan · Slutvärdering · Avsluta arbetsorder ‖ Skicka meddelande · Mätdokument PDF (disabled) · Sammandrag PDF · Skriv ut vältlappar · Spara PDF · Spara till fil ‖ Redigera · Kopiera · Radera.

## 4. Capacity maths [M23][M30][M72][VS]
- Each resource has **Produktionsdata** per åtgärd (m³/h) [M22] and **Veckoarbetstid** (h per weekday; Lördag/Söndag typically 0) [M23][M72]; the **Veckokalender** grid can override hours per day (blue default, yellow override) [M30].
- Order duration: `Uppskattad arbetstid (h) = Arbetsmängd (m³) ÷ production rate (m³/h)` per åtgärd row, summed; the bar spans consecutive working days consuming the resource's daily hours until the estimate is met; weekend days with 0 h are skipped (bar visually continues) [M72][VS].
- Start time defaults 09:00; end shown as the moment the hours are consumed ("Beräknad sluttidpunkt") [M72].
- A manual override "Manuell arbetstid för arbetsorder" replaces the estimate [M72].
- For a **chain**, the bar is driven by the slowest member and both members' hours [DEMO, consistent with M59].
- Game mapping: harvester 28 fm/h · forwarder 32 fm/h base rates, 8 h weekdays [game rules]; one game shift = one calendar day.

## 5. Beställningar [M78–M82]
Filters: Uppdragsgivare (select) + Sök; area tree (client → regions "10 - North / 53 - Mitt / 55 - Syd"); Mottagningsplats · Sortiment · Start · Slut. Toggle **Skoglig Service | Drivning**; **Ny Beställning**. List: ID · Uppdragsgivare · Region · Område · Sortiment (with counts) · Period · Funktioner (Redigera). "Uppföljning mot: Skördare | Skotare"; "Gränsvärden min % max %". **Summa** table: Mottagningsplats · Sortimentsgrupp · Sortiment · Beställning m3 · Avtalad Volym · Skördat m3 · Diff kvantitet · Diff % · Skotat m3 · Diff kvantitet · Diff % · Planerad · Arbetsorder. Order detail rows: Entreprenör · Mottagningsplats · Sort.grupp · Sortiment · Startdatum · Slutdatum · Plan m³ · Planerad m³ · Avtalad Volym m³ · Skördat m³ · Skotat m³ · Arbetsorder m³ · Nedre larmgräns · Övre larmgräns · Kommentar · Virkesuttag (Visa); "Medd. till uppdragsgivare"; **XLSX · PDF · Bekräfta · Spara**.

## 6. Administration (milestone 2 subset)
- **Resurser** [M11][M22][M23]: list filtered by Typ (Harv, Person, Skotare, Skördare…) [M28]; form tabs **Grunddata · Veckoarbetstid · Enhetdata**; Grunddata: Typ · Tillverkare* · Modell · Årsmodell* · Bärighetsklass* · Skyltvikt* (kg) · Släckare kontrollerad* (date) · Stanford-kod · Aggregatsmodell · Resursens tel. · Resursens e-post · Servicepaket (multi, "Välj en eller flera") · Startdatum för WoodForce*; red "Obligatorisk uppgift" under required fields; **Produktionsdata** per åtgärd (Slutavverkning · Första gallring · Gallring); Veckoarbetstid "Vardag 10 h/dag".
- **Veckokalender** [M30]: grid resources × days with hour chips; ‹ · I dag · Vecka · Månad; blue default / yellow override; multi-select with Ctrl, enter hours, Godkänn [MW].
- **Arbetsgrupper/Drivningskedjor** [MW]: name + member resources; Ny · Uppdatera.
- **Användare / Roller** [MW]: minimal list.

## 7. Game integration (unchanged contract)
`bridge.js`: `fromGameState(state)` → orders (stands a/b/c as work orders of contract V-26-014/015, client "SYD"-style code "TRI"), resources H-01/F-01 (+ chain K-01), calendar, orderBook, production; `applyPlan(state, plan)` sets harvester/forwarder, `handoverMode:'digital'`, `cutting:'current'`, `reporting:'live'`, handover accepted/version. Sending emits OIN/PIN/FOI/FDI; `fromHPR` feeds the Sortiment table's Skördare/Skotare/Skogslager columns and the Resurser view.

## 7a. Replica decisions in milestone 2 [DEMO]
- Default views Auftragsliste + Kalender (product starts empty [V6-0:12]); calendar default zoom W = 21 days (T 7 · W 21 · M 31 · 3M 92 days).
- All three game stands are Slutavverkning/Endnutzung, so the game rates (28/32 fm/h) drive capacity; Första gallring/Gallring rates in Produktionsdata are demo values no game order uses. Areas (ha) per stand are demo values; the game has no areas.
- Client code "TRI", contract = game contract id, Arbetsorder nr. = H-A01 etc.; Tillgänglig från/till = game shifts 1 and 4.
- Calendar changes (drops, Flytta/Kopiera, insert, reorder, Avplanera, Komprimera, quick edit) are staged until Spara; Skicka and Zurück zum Spiel save first. On Spara, the staged bars are anchors: an unstaged bar that started earlier keeps its place, bars starting inside the dropped block move behind it.
- Lås start- och slutdatumen is preset (as in [M60]); when locked, the copy/moved bar keeps the calendar start and end by setting a manual working time on the new row.
- Status "Skickad" to a chain = teal pill; calendar bars stay purple. Started bars orange, pills yellow. Completed = green "Abgeschlossen".
- "Ledig *": the asterisk is shown for every game order (all have map data).
- Skicka: "Några sortiment saknar PIN-filer" appears when an assortment with volume has no PIN (downgraded wood, or a PIN removed in the Sortiment tab). "Förhandsanmälan" is a per-resource checkbox without further effect. Default selection = unsent/outdated items (of the checked calendar rows).
- Not observed, shown disabled: list ⚡ 🔗, calendar ⬇ 📊 🌲, map polygon, XLSX, Ny Arbetsorder, Ny Beställning, 13 of 17 Administration items, Funktioner Mätdokument/Kopiera/Radera. "Planeradn" is a toggle "only resources with planned orders". PDF = browser print.
- Map: scale labels are approximations and the readout shows image coordinates, because the game's orthophoto is not georeferenced.
- Map as a planning surface (PLAN_OVERNIGHT §3) [DEMO where not observed]: map and list share one selection (click selects, Shift/Ctrl+click adds or removes, lasso ⬚ or Shift+drag selects every stand whose centre lies in the rectangle); "Auf Ressource verschieben (n)" counts it; a selected stand or circle drags onto a calendar row with the same payload as list rows (mouse via Pointer Events, touch via long press). Tool bar above the map: lasso · measure 📏 (two clicks, metres) · landing 📍 (Avlägg) · map symbol ⚑ (Hinweis/Warnung, Wendeplatz, Abladepunkt, Schutzbereich) · "Löpnummer auf der Karte ordnen" ⤭ (product: Ordna om löpande nummer [M48]; clicks number the orders 1..n, list Lfd. Nr. and map badges follow, a dashed line shows the order) · polygon (disabled) · print. Extra landings (P-A01-2 …) and symbols (H-A01-S1 …) belong to the order, are saved immediately in the plan (plan store: session envelope, plus `landing` / `map_symbol` rows with the Supabase store), listed and editable in the Avlägg tab, and go into OIN `Landings`/`MapSymbols` and FOI `Landings` with the next Skicka. Layers 🗂: Luftbild · Bestände · Polterplätze · Symbole · Schutzbereiche (game BIO areas) · Nachbarflächen · Routen (harvester/forwarder routes of dist/routes.js) · Ernteketten-Position (H/F markers on the route at the harvested / forwarded share: simulated from the game state, not a GPS report). Legend 💡: status palette = pills, objects, routes, image-space note, OSM attribution. Stand polygons are coloured by status; circles stay green as in [M41]. The order detail map has the same layers, legend and landing/symbol/measure tools.
- Scale: one orthophoto image unit ≈ 1,331 m (the factor dist/routes.js uses for its site-map scale bars); the scale bar and the measure tool use it.
- Veckokalender selection as built, following the product's Ctrl multi-select [M30][MW]: a click selects that one day (clicking the only selected day again clears it); Ctrl/Cmd+click, or the "Mehrfachauswahl ohne Strg" switch for touch, adds or removes a day; Shift+click selects the range from the last clicked day on the same resource; the column head selects that day for every shown resource and the row head all shown days of a resource (with Ctrl/Cmd or the switch they are added to the selection); "Auswahl aufheben" clears it. Hours + Godkänn apply to the whole selection; "Auf Wochenarbeitszeit zurücksetzen" removes the overrides. Veckoarbetstid is edited as Werktag (Mon–Fri) · Samstag · Sonntag.
- Plan store (PLAN_OVERNIGHT §2): the plan is saved through `app/store.js`. The default is the session (sessionStorage, unchanged). `?store=supabase` (or `localStorage['cfharvest-store']='supabase'`) with a filled `app/config.js` also writes it to the `cfharvest` Postgres schema via the Supabase REST API (300 ms debounce, batched upserts) and reads it back when a session starts without a plan. Without a config, or when the database fails, the replica keeps the local session and shows "Datenbank nicht erreichbar – lokale Sitzung". The game handoff envelopes are unchanged. Mapping: `db/SCHEMA.md §6.3`; setup: `db/README.md`.
- Order detail: Säkerhet, Tillägg/Avdrag and Provytor are empty states; Hänsyn shows the game's BIO restriction; contacts are scenario placeholders.

## 8. Gaps
- Exact colour hex values (approximated from captures: purple ≈ #6f42c1, light purple ≈ #b9a7e8, teal ≈ #2bb3a3, yellow ≈ #f2c14e, green outline ≈ #2e8b57, header green ≈ #2fae5f, newer bar ≈ #0b3d6b).
- Behaviour of ⚡ and 🔗 toolbar icons not observed.
- Kalender "Planeradn" button semantics (likely "Planerad" view toggle) not observed.
- Live tenant login is required for REA observation; no public demo exists.
- Georeferencing (map). The replica's geometry (stands, landings, routes, BIO areas, map symbols) is in orthophoto image units (620 × 350, origin top left), so `?basemap=osm` shows an explanatory empty state instead of a misplaced map. To use the OSM raster basemap (implemented: Web Mercator tiles for orders that carry `geo.boundary = [[lat,lng] …]`) the following is needed: (1) the source DOP tile of the Geobasis NRW orthophoto with its georeference (GeoTIFF tags or world file, EPSG:25832 / ETRS89 UTM 32N) and the crop/scale applied to `dist/assets/forest-orthophoto.jpg`; (2) an affine transform image px → UTM 32N (6 parameters from those, or ≥ 3 ground control points read off the DOP), then UTM → WGS84 (e.g. proj4js) for every stored point; (3) storing the converted coordinates on the work order (`geo`), landings and symbols (GeoJSON in `landing.point` / `map_symbol.geometry`, cfharvest/db/schema.sql) and in OIN/FOI coordinates; (4) measure and scale from geodesic distance instead of the 1,331 m/px factor. The stands are fictional overlays, so georeferenced output must still be labelled as non-cadastral (AGENTS.md).
- OSM licensing: tile data © OpenStreetMap contributors under ODbL; the attribution "© OpenStreetMap-Mitwirkende · ODbL" with a link to openstreetmap.org/copyright is shown under the map and in the legend. tile.openstreetmap.org is volunteer-run and its tile usage policy forbids heavy or commercial use without permission: the flag is for demos only; production needs an own tile server or a commercial OSM tile provider. The orthophoto stays under dl-de/zero-2-0 (Geobasis NRW).
