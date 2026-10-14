# CFHarvest planning workspace plan

## Purpose

Add a map-led operational planning workspace to the existing INTERFORST game. Help visitors see how a shared work order connects resources, forestry instructions, handover, production, timber inventory, transport and completion.

## Evidence and limits

ForestX describes CFHarvest as a web-based daily planning and operational control system with mixed fleets, production follow-up, inventory visibility, forecasts, traceability, and web/onboard/mobile workflows. The HedeDanmark case describes office workload visibility, task status, map position and felling boundaries. These sources establish workflow capabilities; they do not establish the complete current screen layout or public backend API.

Sources reviewed 14 October 2026:
- https://forestx.se/en/home/
- https://forestx.se/en/cf-harvest-en/
- https://forestx.se/en/hededanmark-cfharvest-made-our-work-flow-completely-digitized/
- https://forestx.se/en/sydved-chooses-cfharvest-from-trimble-forestx-implements-the-system/

GitHub inspection found mytechnotalent/rea, a Reverse Engineering Assistant for software artifacts. It is not a tool for retrieving a private CFHarvest UI from a marketing page. No CFHarvest repository was returned by the repository search. No REA binary was installed or run, and no private CFHarvest source was analysed.

## First milestone

Create a connected work-order list, map, machine schedule and digital handover inspector using the existing three-block scenario and simulation. Keep German default, English/French throughout and Trimble blues. The first milestone should remain playable through all four existing journey stages.

## Screen composition

- Toolbar: date/shift, district, contractor, status filters and language.
- Work-order list: block, priority, planned volume, assortments, readiness and open checks.
- Main map: fictional block boundaries, extraction routes, roadside stacks, simulated machine positions and protected areas.
- Schedule: harvester and forwarder rows, with relocation, handover, waiting and productive intervals.
- Selected-job inspector: instructions, assortment specifications, hazards, documents and handover.
- Performance strip: planned/actual production, forest stock, roadside stock, idle time and delivery progress.

Selection of a work order, map feature or machine synchronises the other panels. Drag-and-drop is a proposed demo interaction, not a verified CFHarvest feature; provide accessible alternative controls.

## Operational behaviour

Reuse the existing simulation to assign machines and start times, preview constraints, and run a shift. Detect overlapping assignments, missing or stale handover, unavailable working stock, outdated cutting instructions and restricted areas. Separate planned, reported and simulated positions and quantities.

The existing consequences remain: early forwarder dispatch causes waiting/cost; wrong assortments can downgrade timber; manual handover adds travel/delay; unverified boundaries and incomplete inspection expose incident risk. Connect logistics and settlement through the same work-order reference.

## Map credibility

Investigate a licensed Baden-Württemberg basemap for the later regional map milestone. Distinguish fictional game polygons from verified cadastral boundaries; show source/date and survey coverage. The current NRW aerial image must not be relabelled Baden-Württemberg. Verify source licence and availability before implementation.

## Tradefair flow

Select a block → inspect constraints → assign machines → hand over digitally → run the shift → compare results. Keep the six illustrations available as supporting explanations.

## Acceptance

- Map, work-order list, inspector and schedule show the same selected assignment.
- Forecasts and shift results come from simulation state.
- Planning constraints are visible and affect dispatch or results consistently.
- No volume is manufactured, forwarded twice or counted as delivered prematurely.
- Existing handover, incident, logistics, settlement and language flows still work.
- The workspace is usable on exhibition screens and tablets, with keyboard controls.
- Verify functional tests and browser layout where supported before publishing.
