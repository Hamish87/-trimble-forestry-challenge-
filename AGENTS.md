# Project context

This is the Trimble Forestry Forst Challenge, an INTERFORST conversation-starter game. It is a buildless HTML/CSS/JavaScript app, with German as the default and English/French translations. The imported source matches Site version 10, commit a4d22bfb633fe53a809931057218813706b11326.

Read README.md, CODEX_HANDOFF.md and docs/CFHARVEST_PLANNING_PLAN.md before implementing the planning workspace.

## Development

- Install: npm ci (Node 20 or newer; Python 3 is needed for build and local server).
- Serve: npm run dev, then open http://localhost:3000.
- Build catalogues and embedded artwork: npm run build.
- Verify behaviour: npm test. The existing tests verify simulation and DOM contracts; they do not verify browser layout.
- Core simulation: dist/game.js. Journey and contract logic: dist/journey.js. Interface: dist/app.js and dist/journey-ui.js. Map: dist/routes.js and dist/flyover.js.
- Edit illustrated scenes in src/scenes.js; regenerate dist/scenes.js with the build command.
- Add source-language UI phrases and English/French translations to translations.tsv, then rebuild the catalogue.

## Product requirements

Keep Trimble blues, all three languages, existing game decisions and four-stage journey. Planning values must come from simulation state. Distinguish planned assignments, reported observations and simulated positions. Preserve timber conservation and the distinction between forest stock, roadside stock and delivered volumes.

ForestX public material documents capabilities, not a complete current CFHarvest UI specification. Proposed screen arrangements and scheduling interactions are our demo design. Economic parameters are scenario assumptions. Current imagery is from NRW; no unverified parcel boundary may be presented as authoritative Baden-Württemberg cadastral data.

The .openai/hosting.json identifies the original Site. GitHub commits do not automatically update that live Site. Preserve that identity for an explicitly requested Sites deployment.

## Generated files and reference material

`npm ci` runs the prepare step to build the embedded scene bundle. `dist/scenes.js` is generated from `src/scenes.js` and the six original WebP files, which are included. Run `npm run build` after changing those sources. Python 3 is required. The reference PDF was excluded from this GitHub import after automatic approval review rejected uploading that document; the app retains the public product-page link instead.
