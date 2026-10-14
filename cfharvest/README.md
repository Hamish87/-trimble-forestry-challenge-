# CFHarvest replica

A demonstration replica of Trimble CFHarvest's Planning web application, integrated with the INTERFORST Forst Challenge game in this repository. Read `PLAN.md` (what and why), `SPEC_PLANNING.md` (what to build), `EVIDENCE.md` (where every fact comes from).

## Run

```bash
npm run dev            # serves dist/ on :3000 — the game
npm run dev:cfharvest  # serves the repo root on :3001 — open /cfharvest/app/
```

The replica loads the game's `dist/game.js`, `dist/journey.js`, `dist/routes.js` and `dist/i18n*.js` directly; it has no simulation of its own. From the game header, "CFHarvest Planung" opens the replica with the current game state; "Zurück zum Spiel" returns with the plan applied.

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
