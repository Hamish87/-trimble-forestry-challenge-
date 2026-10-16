# Holztransport · Carrier-first — demo app

A standalone demonstration of the **carrier-first timber transport** workflow for small German hauliers, built from
the draft workflow specification v0.2 and the customer-agnostic data model v0.1 of 16 October 2026 and the five
sample transport orders supplied with them. It lives in this repository next to the Forst Challenge game but shares
no state, scripts or styles with it. Read `PLAN.md` (what and why, decisions), `SPEC.md` (what to build,
evidence-tagged), `SAMPLES.md` (the sample pack and how the fixtures mirror it) and `RESEARCH.md` (ELDAT, market,
technical building blocks, with sources).

## Run

```bash
npm run dev:transport     # serves the repository root on :3002
# open http://localhost:3002/transport/
```

No build step. The app is plain HTML/CSS/JS; the only network requests are OpenStreetMap tiles (attributed) and the
optional pdf.js script for importing a real PDF's text layer. Everything else stays in the browser
(`localStorage['transport-demo-v1']`).

## Hosting

Vercel project **holztransport-demo** (team hamishbruce87-7880s-projects), connected to this GitHub repository with
Root Directory `transport` and "include source files outside the root directory" switched off, so Vercel reads only
`transport/vercel.json` (static, no build) and ignores the game site's root `vercel.json`. Production URL:
https://holztransport-demo.vercel.app/ — first production deployment made from branch `claude/elegant-hodgkin-ab437b`
on 16 Oct 2026 (git-sourced); the project's production branch is `main`, so merging the branch keeps it current, and
other branches get preview deployments. The game site keeps its own project; it also serves this app at `/transport/`.

## Tour (what a visitor does)

1. **Posteingang**: „Demo-E-Mails zustellen" delivers the five anonymised sample orders. Open one: the page facsimile
   stands beside the proposed fields; every field shows confidence and source; clicking a field highlights its line.
   Exceptions block only the affected stack line (malformed coordinates, missing location, wrong lot totals,
   differing lengths, conflicting instructions, blank forms, commercial fields). Confirm printed coordinates, adopt a
   suggested reading, place a pin from the document's map page, or leave the line in „Standort erforderlich". Freigeben.
   „Szenario" delivers an exact resend (→ Duplikat) and a revised order (→ version diff, field work preserved).
   „PDF/Text importieren" runs the same extraction on pasted text or, with pdf.js, on a dropped PDF's text layer; the
   dropped file stays in the browser as the document's original (also „Original hinterlegen" on any document) and can be
   viewed page by page beside the extracted fields and released to drivers.
2. **Disposition**: confirmed stacks on the map (clusters, customer colours, deadline rings; click a pin for the card with
   progress, contacts, photos and a navigation link), the order/stack list,
   filters, publication (Flotte / Gruppe / Fahrer), allocation (ganzer Polter / Fuhren / Menge), withdraw and
   reassign, block, the „Standort erforderlich" queue, conflicts, problem and clearance reports, driver-safe excerpts.
3. **Mobil**: choose a driver persona; the hero card shows the task at hand with navigation, call and big action
   buttons; download work, go offline, record pickups with photos (unknown quantity stays unknown), report „Polter
   geräumt", report problems, open the original order (when released) or the excerpt, issue the delivery note, report
   arrival and unloading, photograph the mill ticket, reconnect: the queue is transmitted once; conflicts (double claim, pickup after withdrawal) surface
   for dispatch instead of „last update wins".
4. **Belege & Abgleich**: delivery notes (A4 print), mill tickets („Demo-Werksscheine zustellen": one matches by note
   number, one by vehicle + mill + arrival window, one needs manual matching), the quantity ledger, reconciliation per
   load / per stack and order / per quota, exceptions above the (placeholder) tolerance.
5. **Berichte**: Abfuhrmeldung / Fertigmeldung in the layout of the sample form, JSON export with source links,
   „Als gesendet markieren" as a deliberate action.
6. **Verwaltung**: users and roles, vehicles, groups, customer profiles (label synonyms, units, formats — data, not
   code), parties, versioned conversion factors, settings, audit trail, reset and the guided **Demo-Durchlauf**.

## Files

```
index.html · style.css · app.js            shell, router, actions, dialogs, map mounting
core/i18n.js, core/i18n-long.js             DE → EN/FR catalogue (t())
core/units.js                               fm/rm/m³/t/kg/Stück/LDG, German/mixed notation, versioned factors
core/coords.js                              DMS · decimal · UTM 32/33 · Gauss-Krüger 2–5, plausibility, suggestions
core/extract.js                             page classification, profile-driven field/table extraction, validation
core/model.js                               entities, state machines, review → order, amendments, events, matching, ledger
core/store.js                               persistence, idempotent event log, offline queue, audit, dispatcher actions
core/tour.js                                the guided demo run (also used by the tests)
core/tilemap.js                             dependency-free slippy map
data/customers.js · data/fleet.js · data/samples.js   profiles, workspace seed, anonymised sample fixtures
views/shared.js · inbox.js · dispatch.js · driver.js · receipts.js · admin.js · reports.js
```

Tests: `node tests/transport-model.cjs` (extraction of all samples, coordinates, A1–A7 acceptance through the store)
and `node tests/transport-ui.cjs` (jsdom DOM contract across every screen, DE/EN/FR); both run in `npm test`.

## Honesty notes

- Demo of a proposed workflow; not a statement of existing LOGIBALL or Trimble capabilities.
- The sample PDFs are not in the repository. Fixtures keep their structure, references, quantities and anomalies;
  natural persons and contact data are removed, private companies renamed, dates shifted (`SAMPLES.md §0`).
- „Extraction" is a deterministic rule engine driven by customer profiles, not an AI model; confidences are
  illustrative. Document text is treated as data only.
- Quantities are never converted silently; a pin is not proof of truck access; tolerances are placeholders to be
  agreed with pilot carriers.
