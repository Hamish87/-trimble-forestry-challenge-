# Trimble Forestry challenge

Static four-stage demonstration: forest planning, harvesting, logistics and contract settlement.

## Languages

German is the default. The language selector offers German, English and French and remembers the choice in local storage. A selector is also available inside the rules and worksite-handover dialogs. Language changes update presentation without resetting the simulation, forms, map controls or open dialogs. English/French display the same solid timber volume as m³ instead of fm; currency remains EUR.

`translations.tsv` contains the German source phrases and English/French translations. Rebuild the shipped catalogue with `python scripts/build-translations.py`. The localisation layer retains original text nodes and accessibility attributes, then applies the selected catalogue to dynamic content. Machine IDs, form values, simulation state and calculations remain unchanged. Canvas labels use the same catalogue.

## Illustrated workflow

The scene panel covers forest planning, contract signing, office order entry, harvester processing, forwarder loading and truck loading. Choose a scene, explore its three process steps, or open the enlarged illustration. The panel reads existing game state, including stocks, delivered quantities and waiting time, without changing the simulation. Stage changes choose the appropriate scene automatically. All text and image descriptions support German, English and French.

The six images are AI-generated illustrations, not real machine photography, animation or CFHarvest screenshots. They were generated with the built-in image-generation tool and saved as optimised WebP files in `dist/assets/scenes/`. Exact prompts and final asset paths are recorded in `docs/scene-prompts.json`. The shipped scene code embeds those images as data URLs so cards and enlarged views do not depend on separate image requests. Edit scene behaviour in `src/scenes.js`, then run `python scripts/build-scene-images.py` to rebuild `dist/scenes.js`.

## CFHarvest replica and drone site check

`cfharvest/app/` is a demo replica of CFHarvest planning (`cfharvest/README.md`); `cfharvest/sitecheck/` is a drone pre-/post-harvest site check in the style of a drone-image analysis portal (`cfharvest/SPEC_SITECHECK.md`). Both share the game state and are reachable from the game header ("CFHarvest Planung") and the replica's order detail ("Hiebsprüfung (Drohne)"). Serve them with `npm run dev:cfharvest` on port 3001.

## Holztransport · carrier-first timber transport (separate app)

`transport/` is a standalone demonstration of the carrier-first timber transport workflow (draft specification and data model of 16 October 2026): a small haulier's mixed inbox of e-mailed transport orders, profile-driven extraction with page provenance, exception review, confirmed stack pins, publication and allocation, an offline-capable driver view, delivery notes, mill-ticket matching and quantity reconciliation. It shares nothing with the game. Read `transport/PLAN.md`, `transport/SPEC.md`, `transport/SAMPLES.md` and `transport/RESEARCH.md`; serve it with `npm run dev:transport` and open http://localhost:3002/transport/.

## Checks

- `node tests/ui-smoke.cjs` checks the full journey and handover gates using a lightweight DOM contract model.
- `node tests/journey.cjs`, `node tests/simulation.cjs` and `node tests/boundaries.cjs` check simulation invariants.
- `tests/i18n.cjs` requires jsdom 26 in the Node module search path. Install it in a temporary test directory with `npm install --prefix /tmp/forestry-qa jsdom@26 --no-audit --no-fund`, then run `NODE_PATH=/tmp/forestry-qa/node_modules node tests/i18n.cjs`. It checks all three languages across the journey, text coverage, state preservation, handover checkboxes, map controls, stored language preference and canvas label translation. It does not test browser layout.

The economics remain explicitly labelled scenario assumptions; adding languages does not validate market rates or imply CFHarvest product-language availability. The reference PDF is omitted from the GitHub import; the app retains its public Trimble product-page link.

## GitHub and Codex development

Run `npm ci`, `npm run dev` and `npm test`. Read `CODEX_HANDOFF.md` for repository import and the first task prompt. Read `docs/CFHARVEST_PLANNING_PLAN.md` for the planned workspace. This export includes the playable app and all assets; it does not include credentials or Git history.

## Generated files and reference material

`npm ci` runs the prepare step to build the embedded scene bundle. `dist/scenes.js` is generated from `src/scenes.js` and the six original WebP files, which are included. Run `npm run build` after changing those sources. Python 3 is required. The reference PDF was excluded from this GitHub import after automatic approval review rejected uploading that document; the app retains the public product-page link instead.
