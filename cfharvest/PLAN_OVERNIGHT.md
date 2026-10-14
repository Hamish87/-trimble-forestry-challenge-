# Overnight plan — 14/15 Oct 2026

Owner asleep; architect (Fable) runs Opus coders in worktrees, verifies each piece in real Chromium, merges to `main`, and keeps the Mac clone (`~/github/trimble-forestry-challenge`) updated so a single `git push origin main` in the morning publishes everything to Vercel. Nothing here changes the game simulation.

## 0. Already built but not yet on Vercel (push first in the morning)
Milestone 2 (`main` ≥ `2dbb9dd`): German-first UI, drag-and-drop, duration = volume ÷ machine rate consuming daily hours, chain bars mirrored on member rows, manual working-time override, Skicka/Avplanera/Komprimera dialogs, order detail, Beställningar, admin resources/Wochenkalender/Erntekette.

## 1. Calendar fidelity (first, because it's what you saw)
- **Bar length is capacity-driven and visibly so**: bar spans the working days needed for Σ(volume ÷ m³/h per Maßnahme) at the resource's daily hours; weekends/0-hour days are skipped but the bar stays continuous; the hover tooltip shows "560 fm · 20 h · 2,5 Tage". Verify against the product rule "1 h + 1 m³ blocks months".
- **Manual adjustment on the bar**: drag the right edge to lengthen/shorten → sets the order's manual working time (same field as the editor's "Manuelle Arbeitszeit"), shows the resulting hours while dragging, Speichern persists; a small "✎ manuell" badge on overridden bars; reset in the editor.
- **Moving a bar in time** (drag horizontally within its row) keeps duration; moving across rows re-computes duration from the target machine's rate unless "Start- und Enddatum sperren" is ticked (as the product dialog offers).
- **Team / Erntekette planning done right**: planning to a chain puts the solid bar on the chain row and **greyed, non-interactive** bars on each member row (hatched grey, no drag, tooltip "geplant über Erntekette K-01"); the harvester's bar starts first and the forwarder's greyed bar is offset by the configurable lag (product: forwarder "planeras … några dagar efter skördaren"); planning to a single machine shows it only there; Kopiera to the other machine creates an independent bar. Member rows show capacity consumed by the chain so a second order can't double-book a machine (conflict highlighted in red, as a warning only).
- **Rate per Maßnahme per resource** editable in Administration → Ressourcen → Produktionsdaten (Slutavverkning / Gallring / Första gallring); changing it re-flows unsaved bars.
- Tests: model cases for edge-drag override, lock-dates move, chain offset, conflict detection; UI test for the resize gesture (pointer events).

## 2. Real data layer — schema + Supabase
- Write `cfharvest/db/schema.sql` (Postgres): `company`, `app_user`, `role`, `resource` (type, StanForD code, service package, production rates per måtgärd, weekly hours), `calendar_override` (resource × date → hours), `team` + `team_member` (arbetsgrupp / drivningskedja), `contract`, `client`, `work_order` (all Grunddata and Arbetets utförande fields from SPEC §3.7, status enum, priority, allowed period), `work_order_status_history`, `assortment` (mottagningsplats, sortiment code, sort group, volume category, planned m³, PIN version/file name, measurement method/place), `landing`, `map_symbol`, `assignment` (work_order × resource/team, sequence, start/end, locked flag, manual hours, sent_at, copy_of), `production_message` (HPR/FPR/HQC: resource, order, assortment, felled/forwarded m³, timestamp), `order_book` (Beställning) + `order_line` (per mottagningsplats/sortiment with agreed volume, alarm limits), `message`. Views for production follow-up (felled, forwarded, forest stock, roadside) and Beställning follow-up. Row-level security off for the demo, one `tenant_id` column everywhere for later.
- ER diagram in `cfharvest/db/SCHEMA.md` (Mermaid) with the StanForD field mapping for OIN/PIN/FOI/FDI/HPR/FPR.
- Supabase: use the connected Supabase account. If an existing project is suitable, apply the migration there under a `cfharvest` schema; otherwise create a project named `cfharvest-replica` (free tier). Seed from the game's three stands and the demo resources.
- Replica adapter `cfharvest/app/store.js`: same interface as today's sessionStorage plan store, with a Supabase REST backend behind a flag (`?store=supabase`, publishable key from `cfharvest/app/config.js`, never a service key). Default stays local so Vercel keeps working without the backend; switch the default once verified.

## 3. Map as a planning surface
- Select orders on the map (click / shift-click / lasso) → they become the list selection → "Auf Ressource verschieben" and drag-to-calendar work from the map too.
- Draw landings (Avlägg), points and route sequence directly on the map; "Löpnummer auf der Karte ordnen" (product: "Ordna om löpande nummer").
- Layer switcher (Bestände, Avlägg, Schutzbereiche/Hänsyn, Routen, Ernteketten-Position) and legend, mirroring the product's 🗂/💡 buttons; stand polygons coloured by status.
- Basemap: keep the game's orthophoto for the demo; add an optional OSM raster basemap with attribution behind a flag for real coordinates (licensing noted in SPEC).

## 4. Administration completion
Avtal (contracts with client, operation types), Eget företag, Användare/Roller with role matrix (Administratör · Planerare · Mobil/Maskin), Resursöverföringar (subcontractor transfer), Kartskikt (layer config), Meddelande mallar — all backed by the schema in §2; the remaining items stay listed-but-disabled with the reason shown.

## 5. If time remains — on-board (Maskin) app, Phase 3
Operator view at `cfharvest/machine/`: Planering list in route order, five mandatory tabs turning green, "Starta, överför till mätdon" (loads OIN/PIN), route drawing, Skotningsanmälan, Slutvärdering; status flow Harvested → Forwarded → Completed feeding the production tables and the game's receipt.

## Working rules overnight
- One coder per section, worktree isolation, strict file ownership; architect merges only when `npm test` is green and the real-browser check matches the product captures.
- Every merge: signed commits attributed to Claude <noreply@anthropic.com>; bundle + working-tree sync to the Mac; project status doc updated.
- Morning handoff: `git push origin main` from the Mac; Vercel redeploys.
