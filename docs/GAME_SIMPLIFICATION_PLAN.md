# Game simplification plan — decision toggles with live euro impact

Status: proposal · Author: planning pass 2026-10-14 · Target: `dist/app.js`, `dist/journey-ui.js`, `dist/game.js`, `dist/journey.js`, `translations.tsv`

## 1. The problem with the current workflow

Every decision in the game is a `<select>` dropdown with a paragraph of explanation underneath:

- Harvest shifts (`selectChoice` in `app.js`): handover, forwarder start, reporting, cutting, quality, pace, boundary, survey, priority.
- Journey stages (`journeyChoice` in `journey-ui.js`): contract, preparation, documentation (planning); haul mode, access, delivery docs (logistics); reconciliation, closeout (settlement).

Two things make this slow for a trade-fair visitor who has roughly a minute at the stand:

1. **The cost of a choice is buried in prose.** The hint text says things like *"Prüfung: 120 €"* or *"Vor-Ort-Paket … 405 €"*, but the visitor has to read a full sentence to find the number, and the number for the *other* option is in a different sentence. There is no at-a-glance "this costs me X, that costs me Y".
2. **A dropdown hides the alternatives.** The visitor sees one selected label; the trade-off only appears if they open the menu and read. Nothing shows what changes when they switch.

The game's economics are fully deterministic — every decision already maps to a computable euro figure in `game.js`/`journey.js`. We are simply not surfacing it.

## 2. The target experience

Replace each dropdown with a **row of choice toggles** (a segmented control). Each option is a button that shows, on its face:

- the **option label** (short),
- a **euro badge**: the direct cost or saving of picking it, as `−405 €` / `+0 €` / `+6 €/fm`,
- where relevant, a **risk badge**: the conditional amount this choice exposes you to, as `Risiko −3.200 €`,
- a **one-line reason** ("why").

Above the decision column, a **live planning total** updates the instant a toggle changes: "Geplante Kosten dieser Schicht: 1.340 €" with a small delta animation (`+120 €`) when a toggle pushes it up or down. The selected toggle is visually filled (Trimble blue); others are outlined.

The visitor never reads a paragraph to compare. They see two or three buttons, each with a price and a five-word reason, and the total moves as they tap. That is the whole simplification.

### Visual sketch (one decision)

```
Längenvorgabe am Harvester
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ Geladene Einstellung           │  │ Aktuellen Auftrag prüfen       │
│ +0 €        Risiko −2.700 €    │  │ −80 €                          │
│ Schnell, aber evtl. veraltet   │  │ 0,25 h, fängt Fehllängen ab    │
└───────────────────────────────┘  └───────────────────────────────┘
        (selected = filled)                 (outlined)
```

## 3. The euro model — one honest number per option

> **Implemented 2026-10-14 (see commits on `main`).** Badge convention as built: each option's euro badge is the difference in the stage's *planned cost* between that option and a fixed **reference option** in its row (the one showing `+0 €`), with every other decision as currently set — computed by diffing `ForestGame.previewCost` / `ForestJourney.planPreview|haulPreview|settlementPreview`, never hard-coded. The live total therefore moves by exactly the badge difference when you switch. Corrections the implementation found against the tables below: forwarder start and production reporting **do** change booked forwarder hours (e.g. "Ab Stunde 4" saves 560 € vs "Sofort"); manual handover and paper-map boundary costs depend on what else is planned (the 180 € call-out is charged once per shift, so paper map shows −75 € or −255 €); haul-by-stock also changes the number of trips, so it can show a large saving; "Als erledigt melden" is booked as a certain 350 € whenever open items exist (shown as direct cost then, +0 € otherwise); risk badges appear only when the scenario can actually trigger (boundary only with the harvester on Nordhang and unchecked, biotope only with a survey gap, downgrade only with a stale length setting, as a computed estimate). The harvester/forwarder site pickers remain dropdowns — they are assignments, not cost decisions.

The single most important design rule: **be explicit about which euros are certain and which are at risk.** Mixing a guaranteed −80 € with a possible −5.200 € into one number would mislead. We use three badge types:

- **Direct €** (certain this shift/stage): shown as the primary badge. Drives the live total.
- **Risk €** (only if the scenario triggers): shown as a secondary amber badge, never added to the certain total. Phrased "Risiko −X €".
- **Wert €/fm** (revenue rate, not a shift cost): shown for contract/price choices as "+6 €/fm Sägeholz".

The table below is the authoritative mapping, derived directly from the current code. Build the UI from this; do not re-derive numbers by hand.

### 3a. Waldplanung (journey — `journey.js` `start`)

| Decision | Option | Direct € | Risk € (if triggered) | Reason (why) |
|---|---|---|---|---|
| `contractType` | Standard 600/360 | +0 € | Fehlmenge 2 €/fm | Sichere Zusage, kleiner Ausgleich |
| | Mehrmenge 720/460 | +0 € | Fehlmenge 6 €/fm | +6 €/fm Sägeholz, höheres Fehlmengenrisiko |
| `preparation` | Aktenstand | +0 € | Risiko −3.200 € Grenze, −5.200 € Biotop | Nichts geklärt, Lücken offen |
| | Vor Ort prüfen | −405 € | — | Grenze + Erkundung geklärt, Vorfälle vermieden |
| `documentation` | Papier & Telefon | +0 € | — | Manuelle Übergabe bindet Revierzeit je Schicht |
| | Digitaler Auftrag | +0 € | — | Aktuelle Sortimente + Live-Meldungen, Übergabe bestätigen |

Note on `preparation`: the −405 € is certain; the two risk amounts are what the −405 € buys down. Show both risk badges stacked on the "Aktenstand" option so the trade is obvious. `documentation=digital` has no planning-stage cost but changes harvest-shift costs (it pre-sets `handoverMode`, `reporting`, `cutting`) — express this with a forward-looking note badge, "spart Übergabezeit in der Ernte", not a euro figure, because the saving depends on later shifts.

### 3b. Holzernte, je Schicht (`game.js` `calculate`/`schedule`)

| Decision | Option | Direct € | Risk € | Reason |
|---|---|---|---|---|
| `handoverMode` | Manuell | ~ −115 bis −340 €/Hieb* | — | Revierleitung fährt vor Ort, Wartezeit |
| | Digital | +0 € | — | Bestätigter Auftrag an Bord, keine Anfahrt |
| `forwardStart` | Sofort | risk Leerlauf −140 €/h | — | Volle Schicht gebucht, evtl. kein Holz |
| | Nach Bestand | +0 € | — | Startet, wenn rückbares Holz da ist |
| | Ab Stunde 4 | +0 € | — | Spät, aber gegen Leerlauf abgesichert |
| `reporting` | Am Schichtende | +0 € | — | Forwarder-Disposition sieht Bestand spät |
| | Laufend | +0 € | — | Aktuelle Mengen, bessere Disposition |
| `cutting` | Geladene Einstellung | +0 € | Risiko −~2.700 €** | Schnell, kann veraltet sein |
| | Aktuellen Auftrag prüfen | −80 € | — | 0,25 h, fängt Fehllängen ab |
| `quality` | Keine Kontrollmessung | +0 € | — | Kein Zusatzaufwand |
| | Kontrollmessung | −60 € | — | 0,5 h, deckt falsche Einstellung früh auf |
| `pace` | Schonend | +0 € | — | −14 % Durchsatz, schont Boden |
| | Normal | +0 € | — | Referenztempo |
| | Volllast | +0 € | — | +15 % Durchsatz, belastet Schutzwert |
| `boundary` | Papierkarte + Abgleich | −75 €/Hieb (1 h) | — | Grenze vor Ort geklärt |
| | Digital integriert | +0 € | — | Geprüfter Hiebsplan an Bord |
| | Alte Skizze | +0 € | Risiko −3.200 € | Ostgrenze unklar, Nachbarholz möglich |
| `survey` | Teilfläche aussparen | −20 % Durchsatz | — | Sicher, aber weniger Leistung |
| | Nacherkundung | −150 € (2 h) | — | Lücke geschlossen, volle Fläche nutzbar |
| | Trotzdem bearbeiten | +0 € | Risiko −5.200 € + Sperrung | Informationslücke ignoriert |
| `priority` (R4) | Keine Zusage | +0 € | — | Kein Zusatzauftrag |
| | 180 fm zusagen | −450 € | +1.400 € Bonus bei Erfüllung | Lohnt sich ab 180 fm bereitgestellt |

\* Manual handover cost is `fieldHours × 75 € + 180 € setup + machine wait`, and depends on how many stands/versions still need a visit. Compute it live from `schedule(state)` (`plan.fieldHours`, `plan.brief`) rather than hard-coding — see §4.
\** The downgrade risk = `potential saw this shift × (78−26) €/fm + 8 €/fm resort`. It is not a fixed 2.700 €; show it as a computed estimate from the current shift's expected saw volume, or round to a representative "bis ~X €".

### 3c. Logistik (`journey.js` `haulPreview`/`haul`)

| Decision | Option | Direct € | Risk € | Reason |
|---|---|---|---|---|
| `haulMode` | Nach Polterbestand | −85 € Disposition | — | Passende Tourenzahl, keine Leerfahrten |
| | Pauschal | +0 € | Risiko −240 €/Leertour | Vertragsmenge/25, evtl. zu viele Touren |
| `access` | Zufahrt prüfen | −120 € | — | Wendepunkte frei, keine Fehlfahrt |
| | Ungeprüft | +0 € | Risiko −180 € + Leertour | Talgrund-Zufahrt evtl. ungeeignet |
| `deliveryDocs` | Verknüpfen | −90 € | — | Herkunft lückenlos, saubere Abrechnung |
| | Papierliste | +0 € | Risiko: Menge hängt in Abrechnung | Ein Beleg ohne Auftragsbezug |

The live logistics total already exists as `haulPreview().estimate`; the toggles just need to recompute and display it on change (they already call `render()`).

### 3d. Abrechnung (`journey.js` `settlementPreview`/`settle`)

| Decision | Option | Direct € | Risk € | Reason |
|---|---|---|---|---|
| `reconciliation` | Belege prüfen | −80 € (verknüpft) / −180 € (Papier) | — | Strittige Menge wird abgerechnet |
| | Werkzuordnung übernehmen | +0 € | Verlust: strittige fm nicht abgerechnet | Spart Prüfkosten, lässt Erlös liegen |
| `closeout` | Dokumentieren | −120 € | — | Restaufgaben nachvollziehbar übergeben |
| | Als erledigt melden | +0 € | Risiko −350 € Nachbearbeitung | Unbelegte Vollerledigung bei Restmengen |

`settlementPreview` already returns `invoice`, `openValue`, `margin` per choice — the toggles surface the delta in those directly ("abrechenbar +X €" when switching to "prüfen").

## 4. Implementation

Keep the buildless, framework-free architecture. Three changes, no new dependencies.

### 4.1 A shared `toggleChoice` component

Add one function used by both `app.js` and `journey-ui.js`, replacing `selectChoice` and `journeyChoice`:

```js
// options: [value, title, {cost, risk, rate, reason}]
function toggleChoice(key, label, options, scope /* 'game' | 'journey' */) {
  const current = scope === 'journey' ? state.journey[key] : state[key];
  return `<fieldset class="decision-toggle" role="radiogroup" aria-label="${label}">
    <legend>${label}</legend>
    <div class="toggle-row">${options.map(([v, t, m = {}]) => `
      <button type="button" role="radio" aria-checked="${current === v}"
        class="toggle ${current === v ? 'on' : ''}" data-choice="${key}" data-scope="${scope}" value="${v}">
        <span class="toggle-title">${t}</span>
        <span class="toggle-badges">
          ${badge(m.cost)}${m.risk ? riskBadge(m.risk) : ''}${m.rate ? rateBadge(m.rate) : ''}
        </span>
        <small class="toggle-why">${m.reason || ''}</small>
      </button>`).join('')}</div>
  </fieldset>`;
}
```

- `badge(n)` → `+0 €` / `−405 €` with sign + `euro()` formatting and a neutral/positive/negative class.
- `riskBadge` → amber "Risiko …".
- `rateBadge` → "+6 €/fm".
- Binding (replaces the `onchange` handlers): a single delegated `click` on `[data-choice]` sets `state[key]` (or `state.journey` via `ForestJourney.choose`) and calls `render()`, exactly as the current dropdowns do. Keyboard: arrow keys move within the group, Space/Enter select (ARIA radiogroup pattern).

### 4.2 Make the euro figures live, not hard-coded

Do **not** paste the numbers from §3 as string literals. Add a pure function that returns the metadata object per option for the current `state`, so the badges always match the simulation:

```js
function choiceMeta(scope, key, value, state) { /* returns {cost, risk, rate, reason} */ }
```

Source the figures from the same places `calculate`/`haulPreview`/`settlementPreview` use (rates `180`, `140`, `75`; `addCost` amounts `80`, `60`, `450`; `preview.estimate` components; `shortfallRate`). For the shift-dependent ones (manual handover, downgrade risk), call `ForestGame.schedule(state)` and the current stand's expected volume so the badge reflects *this* shift, not a generic value. This keeps a single source of truth: if the economics change, the badges change with them.

### 4.3 The live planning total

- Harvest: add a sticky header to the decision column showing the sum of certain direct costs for the current toggle selection. Reuse the cost components already computed in `calculate` by extracting the cost assembly into a `previewCost(state)` helper that `calculate` also calls, so preview and actual never diverge.
- Journey stages already have previews (`haulPreview`, `settlementPreview`) and the planning cost line (`120 + field 405`). Bind those to the total chip.
- Show a transient delta (`+120 €`) on change via a CSS animation keyed off the number changing.

## 5. Internationalisation

All new strings (labels, reasons, badge words "Risiko", "Bonus", "spart …") go into `translations.tsv` as German source with EN/FR columns, then `python scripts/build-translations.py`. Euro values use the existing `euro()` `Intl.NumberFormat('de-DE', …)`, which already localises; `+`/`−` signs are added in `badge()` and are language-neutral. The reason lines must stay short enough to fit a toggle on a phone in all three languages — cap at ~5 words; verify the FR strings (usually longest) don't wrap past two lines at 360 px.

## 6. Accessibility & exhibition constraints

- Toggles are real `<button role="radio">` in a `role="radiogroup"` `<fieldset>` — keyboard and screen-reader operable, which the current `<select>` already is; do not regress this.
- Touch targets ≥ 44 px (trade-fair tablets, gloved hands).
- Colour is not the only signal: selected = filled + `aria-checked` + a check glyph; risk badge carries the word "Risiko", not just amber.
- Keep Trimble blue (`#0063a3` / `#003f6b`) for selected; amber only for risk badges.

## 7. Tests

The existing suite drives decisions by setting `state[key]`/`state.journey[key]` directly, so simulation tests (`simulation.cjs`, `journey.cjs`, `boundaries.cjs`) are unaffected — the toggles write the same state keys the dropdowns did. Update only the DOM contract tests:

- `ui-smoke.cjs` and `i18n.cjs`: change selectors from `select[data-choice]` / `[data-journey]` to `button[data-choice]` / `[data-scope]`, and assert `aria-checked` instead of `option[selected]`.
- Add a contract test: for every decision, the rendered euro badge equals `choiceMeta(...).cost` formatted by `euro()` — this is the guard that badges never drift from the model.
- Keep `node tests/ui-smoke.cjs` green through the full four-stage journey and handover gates.

## 8. Scope boundary (do not change)

- The simulation math, scoring, timber-conservation invariants, and the four-stage journey stay exactly as they are. This is a presentation change: dropdown → toggle + visible number.
- The economic figures remain labelled scenario assumptions (the rules dialog already says so). Showing them per-option does not make them product claims; keep the existing disclaimer in the rules dialog and the "alle Werte sind Spielannahmen" footer.

## 9. Suggested commit sequence

1. Add `toggleChoice`, `badge`/`riskBadge`/`rateBadge`, `choiceMeta`, `previewCost`; keep dropdowns behind nothing — swap call sites in one stage first (Waldplanung) to validate the pattern.
2. Swap the harvest-shift decisions in `app.js`.
3. Swap logistics + settlement in `journey-ui.js`.
4. Add CSS for `.decision-toggle`/`.toggle`/`.toggle-badges`; delete `.decision-field`/`select` styling once unused.
5. Extend `translations.tsv`, rebuild catalogue.
6. Update DOM/i18n tests; `npm test`; visual check on a 360 px viewport and a tablet width.
