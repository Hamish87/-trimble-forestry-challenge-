# Hiebsprüfung · Drohne — functional specification (drone pre-/post-harvest site check)

A separate demo application in `cfharvest/sitecheck/` that reproduces the workflow of a drone-image analysis portal
(reverse-engineered from the public Biodrone Portal, see `EVIDENCE.md §H` and `findings/biodrone/`) and applies it to
the CFHarvest harvest-site checks: the **pre-harvest check** before a work order is sent (Hänsyn · Säkerhet ·
Terrängplanering · Avlägg) and the **post-harvest audit** (Slutvärdering) after the machines have reported.

Source keys: **[B-WEB]** biodroneportal.com public pages observed with REA (evidence ids in `findings/biodrone/rea-evidence-2026-10-15.json`),
**[B-SRC]** the portal's publicly served source map (functional inventory in `findings/biodrone/FUNCTIONAL_INVENTORY.md`),
**[B-SITE]** biodrone.ai use-case pages, **[MM]/[MOB]** CFHarvest machine and mobile manuals, **[PLAY]** CFHarvest Play listing,
**[DEMO]** our design decision. Everything the portal does with real imagery is simulated here from the game state.

## 1. Scope and honesty rules

- The app is a Trimble Forestry trade-fair demo, labelled as such in header, footer and every report. It is **not** a
  Biodrone product screen and not a CFHarvest product screen; no vendor code, image or text is copied. [DEMO]
- No file is uploaded or analysed. "Befliegung" counts files or generates a demo flight; "KI-Modell ausführen" derives
  every detection deterministically from the game state (stand facts, shift history, incidents, soil score). [DEMO]
- Geometry is the game orthophoto's image space (620×350 px). Metres are scaled per stand so that the stand polygon
  equals the work order's area in hectares; exports say so (`crs.properties.note`). The photo is real NRW imagery with
  fictional overlays and is never presented as georeferenced or as Baden-Württemberg cadastral data (AGENTS.md).
- Volumes, areas, stock and incidents come from `dist/game.js` through `cfharvest/app/bridge.js`; the module never
  simulates and never writes game state. Its only effect on the game is indirect: a confirmed drone boundary lets the
  planning replica return `boundary:'digital'` (§6).

## 2. Entities (model.js)

| Entity | Fields | Source |
|---|---|---|
| Project | id `P-A01-pre-01`, orderId, standId, name, phase `pre`/`post`, type `orthophoto`/`single`, tags, round, flight {altitudeM, gsdCm, overlapPct, images, sizeMb, source}, status, jobs [{modelKey,status,round,count}], annotations [{point,cls,round}], measurements [{points,metres,round}], archived, handedOver | Project card/wizard fields [B-SRC §4b–c]: title, description→tags, image_mode, gsd, area, progress; `single_image` = digital sample plots |
| Model (base) | key, name, kind `object`/`segmentation`, geom, phases, classes, cfh (CFHarvest tab), object size Klein/Mittel/Groß, version, colour | Base models vs custom models, object size 1/5/25 m, class list [B-SRC §4e, CreateModelModal] |
| Custom model | id, name, kind, size, classes, status `annotating`/`trained`, version | `is_trained`, training versions [B-SRC §2] |
| Detection (feature) | model, class, geometry (Point/LineString/Polygon), confidence, attributes (heightM, areaHa, lengthM, depthCm, volumeFm, retained, violated …) | detections GeoJSON properties classname/confidence/height/area/diameter [B-SRC §2 Detections] |
| Hexagon cell | id, points, areaHa, total, classes, density | hexagon aggregates count/area/mean height, default 1000 m² [B-SRC §2 Hexagons] |
| Notification | id, kind `job`/`general`, title, text, round, projectId, read | job notifications with status [B-SRC §2] |
| Tier | Starter 59 $/15 GB/2 projects/500 images · Pro 129 $/50 GB/10/1500 · Business 299 $/1 TB/20/3000 + digital sample plots | register page [B-WEB ev_57355b73…] |
| Handover record | orderId, phase, round, status `ready`/`open`/`blocked`, items, counts, boundaryDigital, evaluation (post) | our contract with the planning replica [DEMO] |

Store: `sessionStorage['cfharvest-sitecheck-v1']` = `{schema, seq, projects, models, notifications, handover, basis}`;
reset when a newer game is detected (`basis.historyLength`). Game handoff envelope: the same
`cfharvest-handoff-v1` the planning replica stores (or `#cfh=` fragment), so the three apps share one game state.

## 3. Detection models and how results are derived [DEMO, deterministic]

| Model (phase) | Classes | Derivation from game state |
|---|---|---|
| Habitatbäume (pre, post) | Habitatbaum, Höhlenbaum, Hochstubben; post: Habitatbaum beschädigt | BIO-01 habitat tree at its map position (marked, code), plus ⌈2.4 trees/ha⌉ seeded points inside the stand outside the protected zone. Post: after a biotope incident (survey ignored → stand closed) the trees in/around the zone are "beschädigt" (at least the nearest). |
| Schutzzonen und Feuchtflächen (pre, post) | Schutzzone, Feuchtfläche, Horst-Sperrzone, Unerkundete Teilfläche | Circle around the BIO object (class from its title); when survey coverage < 100 %, an "unerkundete Teilfläche" polygon whose area = gap % × stand area. Post: `violated` after an incident. |
| Hiebsgrenze (pre, post) | Hiebsgrenze, Abweichung zur Altskizze, Überhieb | Stand polygon (perimeter, area, `checked` = game `boundaryChecked`); Nordhang shows the old-sketch deviation polygon from `routes.neighbour` while unchecked; post: an "Überhieb" strip when the game reported neighbour timber (12 fm → area = 12 fm ÷ fm/ha of the stand). |
| Rückegassen, Zufahrt und Polterplatz (pre, post) | Rückegasse ×n, Zufahrt, Polterplatz, Wendeplatz | Harvester route columns, forwarder access, landing `P-x01`, turning point from `dist/routes.js`. |
| Stöcke (post) | Stock | count = felled volume ÷ mean stem volume per species (Fichte 0.9 · Fichte/Kiefer 0.8 · Buche 1.3 fm); scattered in the harvested part = stand clipped from the west by felled/(opening stock + estimate). |
| Fahrspuren und Bodenschäden (post) | Fahrspur leicht/mittel/tief | one line per used forwarder-route segment (share = forwarded/felled); severity from wet terrain (+1), soil score < 70 (+1), < 40 (+1), > 2 forwarding shifts (+1); depth 6/16/32 cm. |
| Holzreste und Polter (post) | Waldlager, Polter | ⌈forest stock / 15 fm⌉ piles inside the harvested part; one Polter at the landing with the roadside volume. |
| Schadholz und Windwurf (pre, post) | Windwurf, Kronenbruch | No storm event in the scenario: the model runs and finds nothing (shown honestly as 0). [B-SITE: windthrow/storm damage is the portal's headline use case] |

Determinism: a seeded generator keyed by order id and model (`rng`), so a report is reproducible for the same game state.

## 4. Screens

### 4.1 Shell [B-WEB][B-SRC §1]
Dark-blue Trimble bar: Projekte · Modelle · Benachrichtigungen (unread badge) · Abonnement · Hilfe; tenant
"Demo-Lohnunternehmen · Business-Plan"; language DE/EN/FR (game switch); "Zurück zu CFHarvest" (returns to the
planning replica). Banner: shift, contract, soil score, demo tag. Portal counterparts: Projects / Models / bell /
Subscription / organisation switch; the admin area (users, organisations, demo projects) is out of scope. [DEMO]

### 4.2 Projekte [B-SRC §4b]
Search, phase filter (tags), "Archivierte anzeigen", Kacheln | Karte toggle, "＋ Neues Projekt". Cards: thumbnail of
the stand, name, order code, phase badge, images · cm/px · shift · type, progress bar "n/N Modelle ausgeführt",
handover status, tags, Öffnen / Archivieren. Map view: stands with project counts; clicking a stand filters the cards
(portal: clustered pins + list). Empty state offers "Demo-Befliegungen für alle Arbeitsaufträge anlegen" (pre projects
for every order, post projects where a shift has run, all models run). [DEMO]

### 4.3 Neues Projekt (wizard, 3 steps) [B-SRC §4c]
1 Projekttyp: Orthomosaik-Projekt / Einzelbild-Projekt (digitale Probeflächen, Business plan). 2 Details: name,
Arbeitsauftrag, phase (post only after the first shift on that stand), shift of the flight, altitude, GSD, overlap,
tags; estimated image count from the order area (62 images/ha [DEMO]). 3 Bilder hochladen: drop zone counting files
(JPG/TIFF with GPS EXIF; nothing is uploaded) or "Demo-Befliegung verwenden"; storage/plan limits with a warning when
the plan's image limit is exceeded; "Erweiterte Optionen: nach dem Anlegen alle Modelle ausführen" (portal: create
project and run detection). "Projekt anlegen" → processing dialog → project ready, notification "Orthomosaik erstellt".

### 4.4 Projekt (map view) [B-SRC §4d]
- Left panel **Ebenen**: Bilddaten (Orthomosaik with cm/px, Drohnenbilder = capture positions with heading arrows) ·
  Analyse (Hiebsfläche/AOI, Konturen (modelliert) with Grob 2 m / Mittel 1 m / Fein 0,5 m / Sehr fein 0,25 m from the
  game's modelled terrain, Hexagon-Raster 500/1000/2500 m², Mindest-Konfidenz slider) · KI-Modelle (one row per base
  model: checkbox, colour, count, ▶ run / ↻ re-run, "Alle Modelle ausführen") · Eigene Ebenen (Annotationen,
  Messungen) · Befliegung facts. Portal counterparts: IMAGERY/ANALYSIS groups, Contours detail level, hexagon size,
  detection filter by confidence/height/area.
- Toolbar: **KI-Modell ausführen ▾** (Basismodelle with "Analysiert" tag, Eigene Modelle) · Im Bereich erkennen (the
  area is the stand in the demo) · Messen (click points, distance in m, Speichern) · Annotieren (class select, click to
  add, click a marker to remove; counts towards custom-model training) · Auswählen · zoom · Zusammenfassung toggle.
- Map: orthophoto framed on the stand, boundary, layers, 50 m scale bar, status line "Bildkoordinaten, nicht
  georeferenziert". Clicking a detection opens its details (class, confidence, height, area, length, depth, volume,
  retained/violated); clicking a hexagon shows objects, area, density/ha and per-class counts.
- Right panel **Zusammenfassung**: the phase checklist (§5) with status pill, detections table (class, count,
  area/length/volume), hexagon statistics, buttons "➦ An CFHarvest übergeben", "Bericht", "GeoJSON".
- "⇄ Vorher / Nachher" appears once the order has a project in the other phase; "✎ Bearbeiten" edits name/tags/deletes.

### 4.5 Vergleich (Vorher / Nachher) [DEMO; B-SRC §7 notes the portal has no change detection]
Two maps side by side (latest pre and post project of the order) and a table: Fläche (ha), Habitatbäume (erhalten),
Schutzzonen (unberührt), Stöcke, Überhieb (fm), Fahrspuren tief (m), Waldlager (fm) with deltas; Bericht.

### 4.6 Bericht [B-SRC §3 exports: PDF/DOCX reports with map snapshot]
Print-ready page: Trimble header, order, contract, area, shift; per project the map, checklist with status, detection
table; comparison table when both phases exist; demo disclaimer. "Drucken / PDF" = browser print.

### 4.7 Modelle [B-SRC §4e]
Table of the 8 base models (type, classes, object size, phases, CFHarvest tab, version). Eigene Modelle: create (name,
type Objekterkennung/Flächensegmentierung, object size, classes), "Trainieren" enabled at ≥ 5 annotations across
projects (portal: ≥ 10 annotations over 6 tiles), trained models get a version and appear in the model picker but find
nothing in the demo; delete.

### 4.8 Benachrichtigungen, Abonnement, Hilfe [B-WEB][B-SRC §4f]
Notification list with unread state and "Projekt öffnen"; subscription page with the three public tiers, storage and
project usage of the demo tenant (38 MB per image [DEMO]), "Plan wählen (Demo)"; help with the workflow and a glossary
(Orthomosaik, Hexagon-Raster, Digitale Probeflächen, Vorprüfung, Nachprüfung, GeoJSON).

## 5. Checklists [MM][MOB][PLAY][DEMO]

**Vorprüfung** (before "Skicka till resurs"): flight present · Hiebsgrenze (warn on old-sketch deviation →
Område) · Vorerkundung (warn with the unsurveyed % → Hänsyn) · Habitatbäume markiert (→ Hänsyn) · Schutzzonen
(Horst-Sperrzone = warn → Säkerhet) · Rückegassen/Zufahrt/Polterplatz (→ Avlägg) · Schadholz (info until run →
Säkerhet) · Übergabe status (block when the stand is closed). Status: ready / open / blocked.

**Nachprüfung** (Slutvärdering, after the first shift): flight after the harvest · abgeerntete Fläche vs. plan with
stump count and felled share · Hiebsgrenze eingehalten (block on Überhieb with fm and ha) · Habitatbäume erhalten (block
when damaged) · Schutzzonen unberührt (block when violated) · Fahrspuren (warn on deep ruts; length, severity counts,
soil score) · Holzreste (warn when forest stock remains; Polter volume). The handover record carries an `evaluation`
{retentionLeft, retentionDamaged, stumps, overcutFm, deepRutsM, forestStockFm} = the manual's "lämnad naturvård"
answers [MM].

## 6. Integration with the planning replica (`cfharvest/app`)

- Order detail → Funktionen → **Hiebsprüfung (Drohne)** [DEMO, 16th menu entry] and "Hiebsprüfung öffnen" buttons open
  `../sitecheck/#order=<id>&phase=pre|post` (post when the order has harvest history). The deep link opens the latest
  project of that phase or creates one with all models run.
- The replica reads the handover store read-only: Arbetsorder tab "Prüfungen vor dem Start" shows the Drohnen-Vorprüfung
  (open items only), the Hänsyn tab the full pre-check, "Utfört Arbete" the Drohnen-Nachprüfung with the evaluation.
- On "Zurück zum Spiel" the replica passes `boundaryDigital` (orders whose pre-check confirmed the boundary and is not
  blocked) to `CFHBridge.applyPlan`; when every dispatched stand is covered the game gets `boundary:'digital'` — the
  drone boundary layer replaces the field boundary walk, exactly like the game's "Geprüfte Hiebsgrenze an Bord" option.
- "Zurück zu CFHarvest" in the site check returns to the replica, which still holds the game envelope.

## 7. Not replicated (documented gaps)
Matrix/simple hexagon classification with €/m² harvest-difficulty classes and saved filter templates, CHM/DSM raster
layers and colour bar, single-image carousel and per-image detection editing, annotation tiles with box/circle/polygon
tools, model evaluation charts (precision/recall/F1, version rollback), organisations, Stripe checkout, admin area,
WMS/WFS publishing, MapTiler base maps. All are listed in `findings/biodrone/FUNCTIONAL_INVENTORY.md`.
