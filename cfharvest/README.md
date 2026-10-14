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

`bridge.js` (only file that knows the game's state shape) · `model.js` (status enum, capacity maths, plan operations, `toOIN/toPIN/toFOI/toFDI`, `fromHPR`) · `ui.js` + `views/*.js` (HTML only) · `app.js` (shell, handoff, actions) · `i18n-cfharvest.js` (DE→EN/FR phrases merged before `dist/i18n.js`). Tests: `tests/cfharvest-bridge.cjs`, `tests/cfharvest-model.cjs`, `tests/cfharvest-ui.cjs` (jsdom, needs `jsdom` from `npm ci`), all part of `npm test`.

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
app/                                          the replica
scripts/                                      setup-rea.sh, capture-frames.sh
```

Status vocabulary, screen names and button labels are kept in Swedish where they are the documented product UI (Uppdragslista, Skicka till resurs, Komprimera …); the DE/EN/FR catalogue of the game supplies the surrounding text.
