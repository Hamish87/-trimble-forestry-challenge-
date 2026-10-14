# CFHarvest replica — plan

A working replica of Trimble CFHarvest, built as a **separate application inside this repository**, integrated with the INTERFORST game through shared state, **Planning functionality first**. Reverse-engineering is done from public evidence (`EVIDENCE.md`), the published apps, and the StanForD standard, with [REA](https://github.com/morluto/rea) as the inspection toolkit wired into this dev environment.

## 1. Outcome

`cfharvest/app/` serves a CFHarvest-Webb-style planning workspace (Uppdragslista · Kalender · Karta · Resurser · Beställningar · Administration) that plans the game's three stands onto a harvester/forwarder chain, sends the work order to the machine (OIN/PIN), and shows production follow-up fed by the game's shift simulation. A visitor can open it from the game header, plan a shift in "CFHarvest", return, run the shift, and see the follow-up update. Later milestones add the on-board and field apps.

## 2. Scope and rules

- CFHarvest is a Trimble product and this work is done by a Trimble Forestry employee for a Trimble trade-fair demonstration. Keep it that way: work from **public documentation, the official training videos, the spec sheets, app-store artifacts you are licensed to run, the StanForD public standard, and any CFHarvest tenant you are authorised to use**. Do not bypass authentication, licensing, or rate limits; do not pull data from other customers' tenants; do not redistribute vendor binaries or the reference PDF (the earlier GitHub import review already rejected uploading it — keep that stance).
- The replica is a **demo**, labelled as such, in the same spirit as `AGENTS.md`: documented capabilities are reproduced faithfully; where a screen detail is not evidenced, we design it and tag it `[DEMO]` in `SPEC_PLANNING.md`.
- Nothing in the replica duplicates the simulation. `dist/game.js` and `dist/journey.js` remain the single source of volumes, costs and statuses.

## 3. Development environment

### 3.1 Repository layout

```
cfharvest/
  PLAN.md             this file
  EVIDENCE.md         index of every public source, with what each is good for
  SPEC_PLANNING.md    functional spec of the Planning app (evidence-tagged)
  README.md           how to run, how it hooks into the game
  evidence/
    specs/            downloaded PDFs (spec sheet, solution overview)
    screenshots/      frames from the 12 training videos, named <videoId>-<mm-ss>.png
    video-notes/      one markdown per video: screen, controls, statuses, flow
    apk/              REA evidence bundles from inspecting the CFHarvest APK you obtained from your own device (never the APK itself — gitignored)
  findings/           REA outputs and analysis notes (JSON evidence + md)
  app/                the replica (buildless HTML/CSS/JS, like the game)
  scripts/            setup-rea.sh, capture helpers
```

### 3.2 REA setup (reverse-engineering toolkit)

REA is an MCP server + CLI for inspecting binaries, JavaScript/web apps, Android packages and runtime behaviour. Requirements: Node ≥ 22.19 (the repo's `engines` says ≥ 20; use 22 LTS for REA). Static JS and web-bundle analysis needs no native engine; APK analysis needs a JDK 17+ and the pinned JADX jar; native analysis (not needed here) would need Ghidra.

```bash
# one-time, from repo root
bash cfharvest/scripts/setup-rea.sh        # installs rea-agents globally, runs `rea doctor`
npx -y rea-agents@latest setup             # registers the MCP server with detected agents (Claude Code, Codex, Cursor…)
```

`.mcp.json` at the repo root registers REA for Claude Code so the architect/coder agents can call it directly:

```json
{ "mcpServers": { "rea": { "command": "npx", "args": ["-y", "rea-agents@latest", "mcp"] } } }
```

Pin `rea-agents@<version>` once the first evidence bundle is produced so results stay reproducible.

### 3.3 Which REA workflows we use, on what

| Target | REA workflow | What it yields for the replica |
|---|---|---|
| CFHarvest Web (your authorised tenant, open in Chrome with `--remote-debugging-port`) | `inspect_web_page`, `analyze_web_bundle`, `observe_web_session`, `capture_web_screenshot`, `export_web_scripts` (docs: `browser-observation.md`, `website-script-export.md`) | Real DOM structure of Uppdragslista/Kalender/Karta, route and endpoint *names*, status vocabulary, column sets, CSS tokens. Passive observation only; no credential handling. |
| CFHarvest Android APK (pulled from your own Play-licensed device via `adb`) | `inspect_android_package` (JADX headless), `apktool` resources (docs: `android-analysis.md`, `apktool-resource-analysis.md`) | String tables = the complete UI label catalogue in every language the app ships; screen/activity inventory; the shape of work-order/resource JSON the mobile app expects. |
| Training videos (public) | not REA — `scripts/capture-frames.sh` (yt-dlp + ffmpeg) | Frames into `evidence/screenshots/`; notes into `evidence/video-notes/` |
| Spec sheets (public PDF) | not REA — `pdftotext` | Feature and status lists already folded into `SPEC_PLANNING.md` |

Every REA call returns an Evidence record; export bundles with `export_evidence_bundle` into `findings/` and reference the Evidence ID from the spec line it supports.

## 4. Phases

### Phase 0 — Foundations (done 2026-10-14)
- [x] Folder, plan, evidence index, Planning spec
- [x] REA registered in the dev environment (`.mcp.json`, `scripts/setup-rea.sh`)
- [x] `AGENTS.md` points agents at this folder
- [ ] Push to GitHub (blocked from the agent session: repository not in the session's authorised sources — push from a local checkout or add the repo to the session)

### Phase 2 status (done 2026-10-14, milestone 1 merged on `main`)
Built by an Opus coder from this plan and `SPEC_PLANNING.md`, reviewed and verified in real Chromium at 360 px and 1024 px by the architect. All acceptance items pass in `tests/cfharvest-ui.cjs`. Handoff: `dist/cfharvest-link.js` wraps `render()`, exposes `window.ForestChallenge`, and exchanges a nonce-protected envelope via `sessionStorage` (same origin) or a URL fragment (two-server setup). Known limitations and `[DEMO]` decisions are listed in `README.md` and the coder's notes in the merge commit; chief follow-ups: "Kopiera" (one order on several machines), StanForD field names to be checked against the Skogforsk schema, the "not sent" warning repeats once per machine of a chain, calendar capacity assumptions (Mon 19 Oct 2026 = shift 1, Mon–Fri 8 h) to be confirmed against video 5.

### Phase 1 — Evidence capture (parallel with Phase 2; feeds its polish)
1. Download the two PDFs to `evidence/specs/`.
2. Capture frames and write notes for videos 6 (Uppdragslistan), 5 (Veckokalender), 7 (Sortiment & PIN), 3 (Drivningskedjor), 2 (Skapa resurser), 11 (Planeringsverktyget) — the planning set. Resolve the open questions in `SPEC_PLANNING.md §7`.
3. If you have a CFHarvest tenant: REA web observation of Arbetsplanering; record route names, list columns, calendar item rendering, status colours. Store evidence bundle in `findings/web/`.
4. From your own device: `adb pull` the CFHarvest APK → REA `inspect_android_package` → extract `strings.xml` per locale into `findings/apk/strings-<locale>.json`. This gives the authentic label catalogue for SV/FI/DA/EN.
5. Update `SPEC_PLANNING.md` tags from `[DEMO]` to evidenced where the capture confirms a detail.

### Phase 2 — Planning replica, milestone 1 (build from `SPEC_PLANNING.md`)
Deliverables in `cfharvest/app/`:
- `index.html` — shell with Arbetsplanering / Beställningar / Administration navigation, Trimble blues, language switch (DE/EN/FR from the game catalogue; SV labels kept as the authentic UI vocabulary)
- `bridge.js` — `fromGameState(state)` / `applyPlan(state, plan)` adapter; the *only* file that knows about the game's state shape
- `model.js` — entities from `SPEC_PLANNING.md §2`, canonical status enum, StanForD emitters `toOIN/toPIN/toFOI/toFDI`, `fromHPR`
- `views/uppdragslista.js` — the assignment list: columns, multi-client search, status, Flytta till resurs, Funktioner toolbar
- `views/kalender.js` — resource/chain rows, day/week/month zoom, capacity-sized items, dimmed/purple/yellow states, Skicka till resurs, Komprimera, Avplanera, insert-between
- `views/karta.js` — reuses the game's orthophoto and `routes.js` polygons; green circles with cluster counts; landings (upplag) and symbols
- `views/order-panel.js` — side panel: tabs Arbetsorder / Övrig info / Område / Sortiment / Avlägg; estimated dates; Funktioner; "Starta, överför till mätdon" → emits OIN/PIN and sets status `sent`
- `views/bestallningar.js` — order book with Uppföljning mot beställning
- `views/admin.js` — Resurser (Grunddata / Produktionsdata / Veckokalender tabs), Drivningskedjor; Användare/Roller minimal
- `style.css` — own stylesheet; share colour tokens with `dist/style.css`
- Tests in `tests/cfharvest-*.cjs` (same lightweight DOM-contract style as the game): bridge round-trip, status transitions, calendar capacity maths, OIN/PIN shape, list ↔ map ↔ calendar selection sync

Integration points in the game (minimal, additive): a header button in `dist/index.html` ("CFHarvest Planung"), `app.js` exposes `state` getter/setter on `window.ForestChallenge` for the bridge, and the shift receipt shows a "Produktionsmeldung an CFHarvest gesendet" line. Nothing else in `dist/` changes for this milestone.

Acceptance:
- Open replica from game at round 1 → the three stands appear as work orders with the contract's assortments and volumes; H-01/F-01 appear as a drivningskedja.
- Plan Nordhang to the chain for day 1, Skicka till resurs → item purple; return to game → `handoverMode==='digital'`, harvester/forwarder set, handover dialog pre-confirmed version.
- Run the shift → return to replica → follow-up shows felled/forwarded/forest stock matching the receipt to the m³; status `harvesting` (yellow).
- Round 3 spec change creates PIN v2 on the order; a machine still on v1 is flagged.
- All existing `npm test` suites still pass; new `cfharvest-*` suites pass; DE/EN/FR switch works in the replica.

### Phase 3 — On-board (Maskin) replica
Planning menu with assigned orders in route order, five mandatory tabs turning green, Starta → OIN/PIN load, route drawing, Skotningsanmälan, Slutvärdering, status flow Harvested/Forwarded/Completed (`SPEC_PLANNING.md §2.7`, Manual Maskin). Replaces the game's current handover dialog as the machine-side view.

### Phase 4 — Field (Mobil) replica
Site pre-planning (routes from landing to site, signs, unloading and turning points), production notifications, sample plots and final audits (Play listing, Manual Mobil).

### Phase 5 — Polish from evidence
Reconcile every `[DEMO]` tag against captured screens; adopt the authentic label catalogue from the APK strings; status colours and column order from video 6.

## 5. Execution model

- **Architect (Fable 5.1)**: owns this plan and the spec, decomposes work, briefs coders, reviews diffs against the spec and acceptance list, runs `npm test`, merges.
- **Coders (Opus)**: one agent per deliverable group, each in its own git worktree, briefed with the exact spec sections and files it owns. Coders do not edit files outside their brief; integration edits to `dist/` are owned by one agent only to avoid conflicts.
- Order of work: (A) game toggle simplification (`docs/GAME_SIMPLIFICATION_PLAN.md`) and (B) replica milestone 1 run in parallel — A owns `dist/app.js`, `dist/journey-ui.js`, `dist/style.css`, `translations.tsv`, tests; B owns `cfharvest/app/**` and the three additive integration points, which it adds in a single small commit the architect rebases last.

## 6. Risks

- Public evidence is Swedish-only and video-only for the UI → mitigate with Phase 1 captures and the APK string catalogue; keep `[DEMO]` tags honest.
- Calendar capacity maths is the part most likely to look wrong at a trade fair → validate against the "1 h + 1 m³ blocks months" rule in Viktiga steg.
- Two tracks touching `dist/app.js` → ownership rule in §5.
- Vendor material licensing → only links and our own notes/frames in the repo; PDFs under `evidence/specs/` are gitignored unless confirmed redistributable.
