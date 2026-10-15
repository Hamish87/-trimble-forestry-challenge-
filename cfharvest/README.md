# CFHarvest replica

A demonstration replica of Trimble CFHarvest's Planning web application, integrated with the INTERFORST Forst Challenge game in this repository. Read `PLAN.md` (what and why), `SPEC_PLANNING.md` (what to build), `EVIDENCE.md` (where every fact comes from).

## Run

```bash
npm run dev            # serves dist/ on :3000 — the game
npm run dev:cfharvest  # serves the repo root on :3001 — open /cfharvest/app/
```

The replica loads the game's `dist/game.js`, `dist/journey.js`, `dist/routes.js` and `dist/i18n*.js` directly; it has no simulation of its own. From the game header, "CFHarvest Planung" opens the replica with the current game state; "Zurück zum Spiel" returns with the plan applied.

### How the game and the replica exchange state

- `dist/cfharvest-link.js` (one `<script>` after `app.js`; `app.js` is untouched) wraps the global `render()`, adds the header button and the "Produktionsmeldung (HPR/FPR) an CFHarvest übertragen" receipt line, and exposes `window.ForestChallenge = { getState, setState }`. `state` and `render` are global bindings of the classic scripts, so `setState` really reassigns the game state and re-renders.
- Opening the replica writes `{schema:1, kind:'to-replica', state, plan, lang, returnUrl, nonce}` to `sessionStorage['cfharvest-handoff-v1']`. When the replica runs on another origin (two-server setup: game on :3000, repo root on :3001) the same JSON travels in the URL fragment `#cfh=…`, which the replica strips immediately.
- "Zurück zum Spiel" runs `CFHBridge.applyPlan(state, dispatch)` for today's sent plan and returns `kind:'to-game'` via `sessionStorage['cfharvest-return-v1']` or `#cfh-return=…`. The game applies it only if the one-time nonce it stored matches, so a crafted link cannot inject a state. Pressing the browser's Back button instead restores the handed-over state once.
- The planner's own data (assignments, sends, StanForD files, master-data edits) lives in `sessionStorage['cfharvest-plan-v1']` and rides along in both envelopes; it is reset when a new game is detected.

### Files and tests

`bridge.js` (only file that knows the game's state shape; `applyPlan` also accepts `boundaryDigital` from the drone site check) · `model.js` (status enum, capacity maths, plan operations incl. Kopiera and staged changes, `toOIN/toPIN/toFOI/toFDI`, `fromHPR`) · `ui.js` (helpers, `term()` German label + Swedish caption, status pills) · `views/*.js` (HTML only: `uppdragslista`, `kalender`, `karta`, `resurser`, `dialogs`, `order-detail`, `bestallningar`, `admin`, `pages`) · `app.js` (shell, handoff, plan store, actions, drag and drop, splitters) · `i18n-cfharvest.js` (DE→EN/FR phrases merged before `dist/i18n.js`). Tests: `tests/cfharvest-bridge.cjs`, `tests/cfharvest-model.cjs`, `tests/cfharvest-ui.cjs` (jsdom, needs `jsdom` from `npm ci`; the UI test reads the script list from `index.html`), all part of `npm test`.

### Planning in milestone 2 (how the screens behave)

- **Arbeitsplanung**: pick views (Auftragsliste · Aufträge auf der Karte · Kalender · Ressourcen); they sit left to right with draggable ↔ splitters and stack below 900 px. Choice is remembered per browser (`localStorage`).
- **Planning**: click list rows (orange selection), then either drag them onto a calendar row/day, or choose "Ressource wählen" and "Auf Ressource verschieben (n)" → "Datum wählen" (OK / Als letzten hinzufügen). Calendar changes are **staged**: dashed bars, "Zurücksetzen (n)" and "Speichern". Speichern resolves overlaps (a bar dropped into a gap stays after the bar it overlaps; later bars move right) and writes the plan envelope.
- **Bars**: drag to another resource → dialog "Arbeitsauftrag auf Ressource verschoben" (Start- und Enddatum sperren · Verschieben · Kopieren); drag within a row to reorder; double-click (or ✎) for the quick edit with estimate table, Wochenarbeitszeit, manual working time and calculated end. Button alternatives: ⇆, ◂ ▸, ↔ "Zwischen Aufträgen einfügen", ⛓ Ausplanen.
- **Drag and drop** uses HTML5 drag events for the mouse and Pointer Events for touch/pen (hold ~350 ms to pick up, so scrolling still works).
- **Senden** opens "An Ressource senden" (per resource, PIN file names, banner when an assortment has no PIN); staged changes are saved first. The pill turns purple (teal when sent to a chain) and the list shows ➦.

## Drone site check (`sitecheck/`)

A second app in this folder: **Hiebsprüfung · Drohne**, a drone-image analysis portal in the style of the public Biodrone Portal (reviewed with REA, `EVIDENCE.md §H`, `findings/biodrone/`) applied to the CFHarvest pre-harvest check and post-harvest audit. Spec: `SPEC_SITECHECK.md`.

```bash
npm run dev:cfharvest   # serves the repo root on :3001 — open /cfharvest/sitecheck/
```

Open it from the planning replica (order detail → Funktionen → Hiebsprüfung (Drohne), or the "Hiebsprüfung öffnen" buttons); standalone it uses the demo game state. Projects = flights before or after the harvest; AI models derive their detections from the game state (habitat trees, protected zones, boundary deviation/overcut, skid trails, stumps, ruts, timber remnants); hexagon statistics, measurements, annotations, GeoJSON export and a printable report. "An CFHarvest übergeben" writes `sessionStorage['cfharvest-sitecheck-v1']`, which the replica shows in the order detail (Prüfungen vor dem Start, Hänsyn, Utfört Arbete); a confirmed drone boundary makes the replica return `boundary:'digital'` to the game. Files: `model.js` (detections, hexagons, contours, checklists, comparison, exports, store) · `views.js` · `app.js` · `style.css` (on top of `../app/style.css`) · `i18n-sitecheck.js`. Test: `tests/cfharvest-sitecheck.cjs`.

## Reverse-engineering toolkit

```bash
bash cfharvest/scripts/setup-rea.sh     # install REA CLI, run doctor
npx -y rea-agents@latest setup          # register the REA MCP server with your agents
```

`.mcp.json` at the repo root already registers REA for Claude Code. See `PLAN.md §3.3` for which REA workflow applies to which artifact and the lawful-scope rules in `PLAN.md §2`.

## Folder

```
PLAN.md · EVIDENCE.md · SPEC_PLANNING.md
evidence/{specs,screenshots,video-notes,apk}   captured sources (binaries and vendor PDFs are gitignored)
findings/                                     REA evidence bundles and analysis notes
app/                                          the planning replica
sitecheck/                                    the drone site check (SPEC_SITECHECK.md)
scripts/                                      setup-rea.sh, capture-frames.sh
```

Language: the replica is **German first** (EN/FR via the game's switch). Where `SPEC_PLANNING.md` marks a Swedish product term (view names, Flytta/Skicka/Avplanera/Komprimera, status words, tab names), it is shown as a small muted caption "(Uppdragslista)" or as a tooltip "SV: …" and stays Swedish in every language. The Komprimera dialog keeps the product's English title, as observed. The Hilfe page lists the German ↔ Swedish glossary.
