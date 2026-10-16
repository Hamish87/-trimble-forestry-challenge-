# Project context

This is the Trimble Forestry Forst Challenge, an INTERFORST conversation-starter game. It is a buildless HTML/CSS/JavaScript app, with German as the default and English/French translations. The imported source matches Site version 10, commit a4d22bfb633fe53a809931057218813706b11326.

Read README.md, CODEX_HANDOFF.md and docs/CFHARVEST_PLANNING_PLAN.md before implementing the planning workspace.

Two active tracks (October 2026):

- **Game simplification** — `docs/GAME_SIMPLIFICATION_PLAN.md`: replace every decision dropdown with choice toggles that show the direct euro impact (certain vs. at-risk) and a one-line reason, with a live planning total. Presentation only; simulation untouched.
- **CFHarvest replica** — `cfharvest/PLAN.md`, `cfharvest/SPEC_PLANNING.md`, `cfharvest/EVIDENCE.md`: a separate Planning-app replica in `cfharvest/app/` that shares the game's state through `cfharvest/app/bridge.js`. The **drone site check** `cfharvest/sitecheck/` (`cfharvest/SPEC_SITECHECK.md`) is a second separate app of this track: a Biodrone-Portal-style drone-image analysis workflow for the CFHarvest pre-/post-harvest checks, opened from the replica's order detail. REA (reverse-engineering MCP) is registered in `.mcp.json`; `cfharvest/scripts/setup-rea.sh` installs it. Follow the lawful-scope rules in `cfharvest/PLAN.md §2`.

- **Holztransport (carrier-first timber transport)** — `transport/PLAN.md`, `transport/SPEC.md`, `transport/SAMPLES.md`, `transport/RESEARCH.md`: a **separate, standalone demo app** in `transport/` (no shared state or scripts with the game or the replica) that implements the carrier-first timber transport workflow and data model of 16 October 2026: e-mail PDF intake → profile-driven extraction with page provenance → exception review → confirmed stack locations on a map → publication and allocation to drivers → offline mobile pickups and clearance → delivery notes → mill-ticket matching → quantity ledger and reconciliation → Abfuhrmeldung/Fertigmeldung export. Fixtures are anonymised facsimiles of the five sample orders; the originals are not in the repository.

File ownership while the tracks are open: the transport track owns `transport/**` and `tests/transport-*.cjs` and makes only additive edits to `package.json`, `scripts/assemble-site.sh`, `vercel.json`, `README.md` and this file.

File ownership while both game tracks are open: the simplification track owns `dist/app.js`, `dist/journey-ui.js`, `dist/style.css`, `translations.tsv` and `tests/*`; the replica track owns `cfharvest/**` and makes only the three additive integration edits listed in `cfharvest/PLAN.md` Phase 2.

## Development

- Install: npm ci (Node 20 or newer; Python 3 is needed for build and local server).
- Serve: npm run dev, then open http://localhost:3000.
- Build catalogues and embedded artwork: npm run build.
- Verify behaviour: npm test. The existing tests verify simulation and DOM contracts (including `tests/cfharvest-sitecheck.cjs`); they do not verify browser layout.
- Serve the replica and the site check: npm run dev:cfharvest, then open http://localhost:3001/cfharvest/app/ or /cfharvest/sitecheck/.
- Serve the transport demo: npm run dev:transport, then open http://localhost:3002/transport/ (standalone; `tests/transport-model.cjs` and `tests/transport-ui.cjs` are part of `npm test`).
- Core simulation: dist/game.js. Journey and contract logic: dist/journey.js. Interface: dist/app.js and dist/journey-ui.js. Map: dist/routes.js and dist/flyover.js.
- Edit illustrated scenes in src/scenes.js; regenerate dist/scenes.js with the build command.
- Add source-language UI phrases and English/French translations to translations.tsv, then rebuild the catalogue.

## Product requirements

Keep Trimble blues, all three languages, existing game decisions and four-stage journey. Planning values must come from simulation state. Distinguish planned assignments, reported observations and simulated positions. Preserve timber conservation and the distinction between forest stock, roadside stock and delivered volumes.

ForestX public material documents capabilities, not a complete current CFHarvest UI specification. Proposed screen arrangements and scheduling interactions are our demo design. Economic parameters are scenario assumptions. Current imagery is from NRW; no unverified parcel boundary may be presented as authoritative Baden-Württemberg cadastral data.

The .openai/hosting.json identifies the original Site. GitHub commits do not automatically update that live Site. Preserve that identity for an explicitly requested Sites deployment.

## Generated files and reference material

`npm ci` runs the prepare step to build the embedded scene bundle. `dist/scenes.js` is generated from `src/scenes.js` and the six original WebP files, which are included. Run `npm run build` after changing those sources. Python 3 is required. The reference PDF was excluded from this GitHub import after automatic approval review rejected uploading that document; the app retains the public product-page link instead.
