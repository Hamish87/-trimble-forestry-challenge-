# Holztransport · Carrier-first — plan

A **separate application inside this repository** (`transport/`) that demonstrates the carrier-first timber transport
workflow from the two draft specifications of 16 October 2026 (workflow v0.2, data model v0.1) and the five sample
transport orders supplied with them. It is independent of the Forst Challenge game and of the CFHarvest replica:
no shared state, no shared scripts, only the same repository, hosting pipeline and visual language (Trimble blues,
buildless HTML/CSS/JS, German first with EN/FR).

Read `SPEC.md` (what to build, evidence-tagged), `SAMPLES.md` (what the five sample PDFs contain and how the fixtures
mirror them) and `RESEARCH.md` (ELDATsmart, market, technical building blocks, with sources).

## 1. Outcome

A dispatcher opens `transport/`, delivers the five demo e-mails, reviews each proposed order beside its page
facsimile, resolves the exceptions the spec calls out (duplicate, amendment, malformed coordinates, missing lot
totals, blank forms, conflicting instructions, missing locations), confirms or places pins, publishes work to the
fleet or named drivers, allocates stacks, then switches to the driver persona, goes offline, records pickups and
clearance, issues a delivery note, reports arrival, photographs a mill ticket, reconnects, and finally matches the
mill tickets and reads the forest-to-mill reconciliation and the Abfuhrmeldung/Fertigmeldung export. Every quantity
is traceable to a page region or a driver event.

## 2. Scope and rules

- Demo, labelled as such everywhere; proposed workflow, not a statement of LOGIBALL or Trimble capabilities.
- The sample PDFs stay out of the repository. Fixtures keep their structure, references, quantities and anomalies;
  natural persons and contact data are removed, private companies are renamed, dates are shifted to October 2026
  (`SAMPLES.md §0`). Public bodies (Stadt Mengen, Bayerische Staatsforsten) keep their names because the
  specification cites them as scenarios; flip `data/samples.js` if that should change.
- Document text is untrusted data: rendered as text, never interpreted, never a trigger.
- No network calls except map tiles (OpenStreetMap, attributed) and the optional pdf.js CDN script; both degrade
  gracefully (grid background / "PDF-Import nicht verfügbar").
- The app never converts quantities silently and never substitutes an address for a roadside pickup point.

## 3. Repository layout

```
transport/
  PLAN.md · SPEC.md · SAMPLES.md · RESEARCH.md · README.md
  index.html            shell, script list (the UI test reads it)
  style.css             Trimble blues + status palette
  assets/trimble-logo.svg
  core/
    i18n.js             DE source phrases → EN/FR; t(), number/date formatting; language switch (own, no game code)
    units.js            unit vocabulary (fm, rm, m³, t, kg, Stück, LDG), versioned factors, derived values
    coords.js           coordinate parsing (DMS, decimal, UTM 32/33, GK 2–5), plausibility verdicts, suggestions
    extract.js          page classification, label-synonym field extraction, table parsing, validation → exceptions
    model.js            entities, ids, state machines, ledger, matching, reconciliation, reports, redaction
    store.js            localStorage persistence, event log with idempotent ids, offline queue, conflicts, audit
    tilemap.js          minimal slippy map (OSM raster tiles, pins, clusters, click-to-place, no dependency)
  data/
    customers.js        customer profiles — labels, units, formats, regions (data, not code)
    fleet.js            demo carrier: users, trucks, driver groups, mills/parties, factors, quotas
    samples.js          the five sample documents as page/line fixtures + resend, amendment, mill-ticket scenarios
  views/
    inbox.js · dispatch.js · driver.js · receipts.js · admin.js · reports.js · shared.js (pills, tables, facsimile)
  app.js                hash router, state/actions, persona, rendering
tests/
  transport-model.cjs   extraction on fixtures, coords, units, state machines, ledger, matching, offline replay
  transport-ui.cjs      jsdom DOM contract across the screens in DE/EN/FR
```

## 4. Architecture

Buildless classic scripts sharing a `Transport` namespace (`TransportCore`, `TransportData`, `TransportViews`,
`TransportApp`), the pattern the other apps in this repository use, so tests can run the files in a `vm` context
without a bundler. State is one JSON document per carrier workspace in `localStorage['transport-demo-v1']`:
`{schema, seq, parties, profiles, documents, orders, stacks, allocations, loads, events, notes, receipts, ledger,
quotas, conflicts, audit, ui}`. All mutations go through `store.apply(event)`; driver actions are events with client
ids so the offline queue and the acknowledged log use the same path. Views are pure functions of state → HTML; the
app re-renders the active route on every applied event. The map is the only imperative component.

## 5. Phases

### Phase 0 — Research and documents (done 16 Oct 2026)
- [x] Read the two Notion exports and the sample pack (text layers; scans rendered and transcribed)
- [x] Repository conventions (buildless, jsdom DOM-contract tests, site assembly, Vercel redirects)
- [x] Research: ELDATsmart record types and practice · market (LOGIBALL Timber Flow, NavLog, carriers' practice,
      mill intake) · technical building blocks (map tiles and licences, coordinate systems, pdf.js, offline patterns,
      document-AI provenance) → `RESEARCH.md`
- [x] `SPEC.md`, `SAMPLES.md`, this plan
- [x] `RESEARCH.md` condensed from the three research reports (§4 maps each finding to where it shows in the app)

### Phase 1 — Core and fixtures (done 16 Oct 2026)
`core/units.js`, `core/coords.js`, `core/extract.js`, `core/model.js`, `core/store.js`; `data/*`. Acceptance: the five
fixtures extract to the expected orders and exceptions (SPEC §10 A1), resend → duplicate, amendment → diff with
pickups preserved (A2), allocation conflicts (A3), partial pickup / clearance / load states (A4), offline replay (A5),
export links (A6), ticket matching (A7) — all in `tests/transport-model.cjs`.

### Phase 2 — Screens (done 16 Oct 2026; real-browser pass at 800 px in the Claude browser pane, 1280/390 px still to do)
`index.html`, `style.css`, `core/i18n.js`, `core/tilemap.js`, `views/*`, `app.js`: Posteingang & Prüfung, Disposition
(Karte & Liste), Mobil „Meine Arbeit", Belege & Abgleich, Verwaltung, Berichte, Lieferschein print. Acceptance:
`tests/transport-ui.cjs` drives the end-to-end tour in DE/EN/FR; a real-browser pass at 1280 px and 390 px.

### Phase 3 — Repository integration and hosting (done 16 Oct 2026; own Vercel project `holztransport-demo`, root directory `transport`, see README "Hosting")
`package.json` (`dev:transport` on :3002, tests in `npm test`), `scripts/assemble-site.sh` (copy `transport/`),
`vercel.json` (`/transport` redirect), `README.md`, `AGENTS.md` (third track and file ownership).

### Phase 4 — Optional enhancements
pdf.js import of a real PDF text layer with positions (the engine already takes page lines with x/y) · basemap.de
tile option · Tesseract.js OCR behind a flag · ELDAT XML import of a transport order or Werksdaten file · a Supabase
schema mirroring `core/model.js` for a multi-device pilot (the CFHarvest replica shows the pattern in `cfharvest/db/`).

### Phase 5 — Reconcile with evidence
Replace `[DEMO]` tags in `SPEC.md` where pilot material (real delivery notes, mill tickets, carrier rules) arrives;
set the tolerance and pilot thresholds with the carriers instead of the placeholders.

## 6. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Folder `transport/`, app name "Holztransport · Disposition (Demo)" | descriptive, no product name, parallel to `cfharvest/` |
| D2 | Fully standalone: own i18n, own map, own logo copy; no `dist/*` script | "separate to the Forst Challenge"; the folder can be served alone |
| D3 | Own minimal tile map instead of Leaflet | no runtime dependency, projection maths testable in Node, offline-tolerant; Leaflet remains a drop-in option (RESEARCH §3) |
| D4 | OpenStreetMap raster tiles by default | key-free, attribution only; low-volume demo use is within the tile usage policy; basemap.de noted as the German alternative |
| D5 | Rule-based extraction driven by customer profiles | demonstrates "customer differences live in data, not code"; deterministic for tests; the same engine later takes real OCR/Document-AI output |
| D6 | Fixtures anonymised and re-dated; originals not committed | personal data in the samples; the specification calls them historical examples |
| D7 | Driver view simulated in a phone frame with an offline toggle | the spec's mobile behaviour (download, pending sync, idempotent replay) is demonstrable without a native app |
| D8 | Tolerance 0,5 % placeholder, labelled | the spec says thresholds are agreed with pilots, not invented |
| D9 | Tests in the repository's jsdom DOM-contract style, part of `npm test` | consistent with the other tracks |
| D10 | UI on Trimble Modus Web Components 2.0 (pinned 1.20.0 from jsDelivr, light-DOM components; Modus tokens, Open Sans, Modus Icons 1.0) with `:not(:defined)` fallbacks | Trimble branding; buildless-compatible (ESM loader); the app still works offline/without the CDN (RESEARCH §3.7) |
| D11 | Originals (PDF/photo) stay in the browser (IndexedDB), released to drivers per document; photos attach to driver events; demo photos are illustrations | personal data in the sample pack; driver needs the original and site evidence; no server |
| D12 | First visit without a saved workspace plays the Demo-Durchlauf automatically; a saved empty workspace (after reset) stays empty | the shared demo link must open on populated screens, not an empty inbox |
| D13 | Map engine behind one interface (`core/tilemap.js` built-in, `core/mapbox.js` Mapbox GL JS 3.33.0 loaded on demand when a public token is set in `config.js` or the workspace settings); box selection on both; Mapbox auth errors fall back to the tile map | robust vector basemap for the demo without making the app depend on an account; token is public by design, restricted by URL |

## 7. Execution model and ownership

Third track in `AGENTS.md`: the transport track owns `transport/**` and `tests/transport-*.cjs` and makes only additive
edits to `package.json`, `scripts/assemble-site.sh`, `vercel.json`, `README.md`, `AGENTS.md`. It touches nothing in
`dist/` or `cfharvest/`.

## 8. Risks

- Rule-based extraction looks smarter than it is → every proposed field shows confidence and source; the review
  screen is the product, not the extraction.
- Fixture facsimiles could be mistaken for the originals → "Nachbildung · anonymisiert" ribbon on every page.
- Map tiles need the network at a trade fair → grid fallback, pins and lists still work.
- Scope creep towards a full TMS → `SPEC.md §11` list is enforced in review.

## 9. Verification

`node tests/transport-model.cjs`, `node tests/transport-ui.cjs` (both in `npm test`); `npm run dev:transport` and a
manual tour in Chromium at 1280 px and 390 px; the fixture extraction results are asserted number by number against
`SAMPLES.md`.
