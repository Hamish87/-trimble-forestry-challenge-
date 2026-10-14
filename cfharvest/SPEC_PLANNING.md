# CFHarvest Planning (web) — functional specification for the replica

Scope: the **Planning** application only (ForestX "CFHarvest Webb"). On-board (Maskin) and Field (Mobil) are specified only where Planning hands off to them. Every statement carries a source tag: **[SS]** Trimble spec sheet, **[MW]** Manual Webb, **[MM]** Manual Maskin, **[VS]** Viktiga steg, **[V6]** video 6 Uppdragslistan, **[PLAY]** Play-store listing, **[DEMO]** our own design decision for the replica, not evidenced. Keep the tags when you extend this file; they are what make the replica defensible.

## 1. Purpose and users

The web client is where a contractor (or forest company planner) manages users and resources, plans production, creates work orders and receives orders from clients. [MW]
Roles: **Administratör** (company, users, resources), **Planerare** (plans work orders to resources, prints vältlappar/pile labels), **Mobil/Maskin** (operators and pre-planners; machine and mobile logins). [MW][VS]
Planning receives working-site data from an upstream forest-management system (CFForest) via CF-HUB as JSON/XML messages. [SS] In the replica the game is the upstream system. [DEMO]

## 2. Domain model

Entities and the fields the manuals name. Field names in Swedish are kept because they are the real UI labels and should appear in the replica's SV catalogue; DE/EN/FR are the game's languages.

### 2.1 Company (Eget företag) [MW]
Pre-created by the vendor with VAT number; contractor completes contact details. Company ID from Biometria is required before sending measurement data (format `NNNNN+00000`). [VS]

### 2.2 User (Användare) [MW]
`name`, `cfharvestId` (username), address, postal code, city, citizenship, language skills, phone, employment details, location, `roles[]`. Can be deactivated/reactivated. Messages can be sent to one or all users. Account locks after >3 failed logins.

### 2.3 Resource (Resurs) [MW][VS]
A machine or person. Created from a **resource type** (harvester, forwarder, person/crew, truck…). Tabs:
- **Grunddata** (mandatory): identity, machine model, **StanForD code** (the machine's GPX number; needed for production reporting), subcontractor flag + SE number, client-specific machine numbers (e.g. Sydved), **service package / åtgärdstyp** (which operation types the resource may be planned for).
- **Produktionsdata** (mandatory): general production figures per operation type (m³/h etc.), not per site.
- **Veckoarbetstid / Veckokalender** (mandatory): weekly working hours per day; blue = from settings, yellow = manual override; multi-select days with Ctrl, enter hours, **Godkänn**. Unrealistic values ("1 h + 1 m³") make a small order block the calendar for months — the calendar is **capacity-driven**. [VS]
- **Enhetsdata**: consent to share device data.
- **Licens**: Aktivera/Pausa with start/pause dates; `Aktiv` column shows green check / red cross.

### 2.4 Team / chain (Arbetsgrupp / Drivningskedja) [MW]
A named group of resources sharing work directives. Two kinds: **arbetsgrupp** (people) and **drivningskedja** (machine chain, typically one harvester + one forwarder). A resource may belong to several groups.

### 2.5 Contract (Avtal) [MW]
Agreements with clients listing contracted operation types (harvesting, forest services).

### 2.6 Work order / working site (Arbetsorder / Uppdrag / Trakt) [SS][MW][MM]
The central object. Received from the client or created in-app. Carries:
- Administration & contract info (client, contract ref, dates) [SS]
- **Products** — what is to be felled: assortments with receiving location (mottagningsplats), estimated volume; each assortment needs a **PIN** file [SS][MM]
- **Deliveries** — what is to be forwarded [SS]
- **Storage locations / Avlägg (landings)** — created on the map [SS][MM]
- **Stand boundaries** (polygon) and custom map symbols [SS]
- **Övrig info** — client instructions + operator notes back [MM]
- **Område** — departments, volume per department, totals, operation type, stump treatment, GROT removal [MM]
- Estimated start/end dates (editable in side panel), manual messages [MW]
- Assigned resource or chain; route sequence position [MW]

### 2.7 Work-order status [SS][MW][MM]
Spec-sheet status set (On Board app adapts to it): **Available → Planned → Sent to Resource → Harvesting Started → Felling Ended → Forwarding Started** (→ Completed). [SS]
Web list labels: **Ledig** (available), **Tilldelad** (assigned), **Påbörjad** (started). [MW]
Calendar colours: **dimmed** = planned, not sent; **purple** = sent to resource; **yellow** = started. [MW]
Machine side: "Avsluta avverkningen" → Harvested; forwarder start → Forwarded; forwarder final evaluation → Completed. [MM]

Replica canonical enum [DEMO, reconciling the three]: `available | planned | sent | harvesting | felled | forwarding | completed`.

### 2.8 Order (Beställning) [MW][SS]
A client's demand: client, areas, **mottagningsplats** (delivery site), assortment, period, ordered volume. **Uppföljning mot beställning** shows per assortment: ordered, harvested, forwarded, planned volume and the work orders meant to fulfil it. Orders can be confirmed; reports export to Excel/PDF.

### 2.9 Production follow-up [SS]
Per site and per product, automatically updated when a production message (HPR/FPR) arrives: **estimated volume, felled volume, forwarded volume, forest stock = felled − forwarded**. Negative forest stock occurs if the forwarder reports a different assortment than the harvester. [MM]

## 3. Screens

### 3.1 Shell [MW][DEMO]
Top navigation: **Arbetsplanering** (default), **Beställningar**, **Administration** (Eget företag, Användare, Roller, Resurser, Arbetsgrupper/Drivningskedjor, Avtal). Language selector reusing the game's DE/EN/FR catalogue plus SV labels for authenticity. [DEMO]

### 3.2 Arbetsplanering — four resizable/hideable views [MW]
1. **Uppdragslista** (assignment list) — grid of all work orders. Columns [MW][V6]: name/trakt, client (search across multiple clients), status (Ledig/Tilldelad/Påbörjad), assigned machine or team, operation type, estimated volume, assortments, planned start/end, readiness/open checks. Toolbar **Funktioner**: edit columns, reset sorting/filters, select all, reorder route sequence on map. Selecting rows enables **Flytta till resurs**.
2. **Kalender** — one row per resource (or chain), zoom days/weeks/months, multi-select resources. Icons: **Skicka till resurs**, **Visa detta datum**, **Komprimera**. Items are capacity-sized (volume ÷ production rate ÷ weekly hours). [MW][VS]
3. **Uppdrag på kartan** — orders as green circles, clustered with counts, actual polygons at larger scale; base maps and overlays shared with all CFH apps [SS]; add points and **upplag** (landings), hide map (**Göm karta**), print. [MW]
4. **Resurser** — follow-up of resources and orders. [MW]

Selection sync: choosing an order in the list highlights it on the map and in the calendar; choosing a calendar item opens the order. [MW][DEMO]

### 3.3 Planning interactions [MW]
- **Plan to resource**: select orders → **Flytta till resurs** (choose resource/chain, start date, or "after last planned"), or drag from list to a calendar row. Save. Then **Skicka till resurs** sends the route plan; item turns purple.
- **Alt 1 chain planning**: dropping on a drivningskedja plans both harvester and forwarder. **Alt 2 single resource**: plan per machine; drag to another machine and choose **Kopiera** to share. Both can mix.
- **Insert between items**: drag into a gap; later items shift on save.
- **Avplanera**: unplan one or many, confirm.
- **Komprimera**: remove gaps in a resource's calendar keeping order; confirm new start/end.
- **Work-order side panel**: open from list name or double-click calendar item; edit estimated start/end, manual messages; **Data** button for details; map with tabs; **Funktioner** (forwarding notice, re-report, close order, print pile labels, PDF report — mostly greyed until started).
- **Starta, överför till mätdon** (from the order, after filling required red fields) generates and sends **OIN + PIN** to the harvester. [VS][MM]

### 3.4 Beställningar [MW]
Filter client → areas → mottagningsplats → assortment → period. Table: ordered / harvested / forwarded / planned volume per assortment, linked work orders. Confirm order. Export Excel/PDF.

### 3.5 Administration [MW]
CRUD screens for §2.1–2.5 with the tabs and mandatory-field rules above. **Ny** / **Spara** / **Uppdatera** / **Bekräfta** button vocabulary.

## 4. Planning → machine handoff (what the replica must emit)

When an order is **sent** and **started**, Planning produces StanForD 2010 instruction files [SS][VS][MM]:
- Harvester: **OIN** (object/administration instruction) + **PIN** (product instructions, one per assortment) — the harvester creates its object *from the OIN, never typed by hand* [VS].
- Forwarder: **FOI** (administration) + **FDI** (delivery instruction) [SS].
Production returns as **HPR** / **FPR** at intervals; quality as **HQC/FQC** [SS][MM]. CFHarvest validates that the PIN set on the order matches the PIN referenced in the HPR — a mismatch blocks the HPR [VS].

Replica: implement `toOIN(order)`, `toPIN(assortment)`, `toFOI/FDI(order)` producing StanForD-2010-shaped JSON (and optionally XML via the public schema) and `fromHPR(production)` to drive §2.9. The game's `ForestGame.calculate` output is the simulated HPR/FPR source. [DEMO]

## 5. Integration with the game (planning milestone)

| Game concept (`dist/game.js`, `dist/journey.js`) | CFHarvest replica concept |
|---|---|
| `definitions` stands a/b/c (Nordhang, Talgrund, Südrevier) | Three **work orders** from one client contract `journey.contract.id` (V-26-014/015) |
| `journey.contract` volume/saw targets and prices | **Beställning** per assortment (Sägeholz → sawlog, Industrieholz → pulp) with mottagningsplats "Sägewerk"/"Industrieabnehmer" |
| `harvester`/`forwarder` assignment per round | **Planning to a drivningskedja** (H-01 + F-01 chain) in the Kalender; the four shifts are four calendar days |
| `handoverMode: 'digital'` + `handoverAccepted` | **Skicka till resurs** then operator confirmation (status sent → harvesting) |
| `gradeSpec` 5,1/4,1/3,1 and `cutting: 'current'` | **PIN** per assortment; the round-3 spec change is a new PIN version; "cached" = old PIN still on machine |
| `calculate()` → `harvest`, `forwarded`, `stockGrades`, `roadsideGrades` | **HPR/FPR** production messages → production follow-up: felled, forwarded, forest stock, roadside |
| `stands[].closed`, `boundaryChecked`, `surveyCoverage`, `biodiversity` | Order readiness/open checks, map symbols (BIO-01..03), stand boundary layer |
| `journey.logistics.loads` | Deliveries per mottagningsplats in Beställningar follow-up |

Integration contract [DEMO]: the replica reads and writes the **same `state` object** the game uses (exposed on `window` by `app.js`) through a small adapter `cfharvest/app/bridge.js` with pure functions `fromGameState(state) → {orders, resources, chains, calendar, orderBook, production}` and `applyPlan(state, plan) → state` (sets `harvester`, `forwarder`, `handoverMode`, `cutting` …). No duplicate simulation. Opening the replica from the game header ("CFHarvest Planung öffnen") and returning keeps the journey intact.

## 6. Non-goals for milestone 1
Machine client UI, mobile app, silviculture planning tool, real map tiles beyond the game's existing orthophoto, authentication, multi-tenant, real Biometria/VIOL3, Excel/PDF export (stub), drag-and-drop on touch (provide button alternatives).

## 7. Open questions to verify from the videos
- Exact Uppdragslista column order and default sort [V6]
- Whether the calendar shows volume or hours on an item
- Colour palette of statuses beyond dimmed/purple/yellow
- What "readiness check" (Play what's-new) looks like in web vs mobile
