-- =====================================================================================================
-- CFHarvest replica · demo tenant seed (PLAN_OVERNIGHT.md §2). Run after schema.sql.
--
-- Source of every value: the INTERFORST game (dist/game.js definitions, biodiversity, targets; dist/journey.js
-- contracts; dist/routes.js geometry) and the replica bridge (cfharvest/app/bridge.js MASTER, CHAINS,
-- ASSORTMENTS, CONTACTS, STAND_FACTS). Values the game does not have are marked [DEMO].
--
-- Ids: deterministic uuids md5('cfh-demo:<kind>:<key>')::uuid, so the seed is idempotent
-- (ON CONFLICT DO NOTHING) and other scripts can address rows without lookups. The app's own ids
-- (H-A01, H-01, F-01, K-01, P-A01, V-26-014 …) are the business keys.
--
-- Geometry: GeoJSON in the game's image ("world") coordinates, exactly as bridge.js world() computes them.
-- The orthophoto is not georeferenced (SPEC §7a) — these are NOT WGS84 and not cadastral boundaries.
--
-- Calendar: CFHModel.CALENDAR_START = Mon 2026-10-19; game shift n = calendar day n−1 (shifts 1–4 = 19–22 Oct).
--
-- Reset the demo tenant:  DELETE FROM cfharvest.company WHERE id = md5('cfh-demo:company')::uuid;  (cascades)
-- =====================================================================================================

BEGIN;
SET LOCAL cfharvest.change_source = 'import';   -- recorded in work_order_status_history.source

CREATE OR REPLACE FUNCTION pg_temp.did(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT md5('cfh-demo:' || k)::uuid $$;

-- ---------------------------------------------------------------------------------------------- tenant
INSERT INTO cfharvest.company (id, name, org_no, address, email, country, default_language, settings,
  biometria_id, contact_name)
VALUES (pg_temp.did('company'), 'Demo-Lohnunternehmen', NULL, 'Forstweg 1 · Demo', 'dispo@demo.invalid', 'DE', 'de',
        '{"shiftHours": 8, "dayStart": "09:00", "calendarStart": "2026-10-19"}',
        '90010+00000', 'Disposition (Demo)')     -- Biometria id / contact [DEMO] = admin-model.js COMPANY
ON CONFLICT DO NOTHING;
-- Databases seeded before these columns existed: fill them once (no-op afterwards, never overwrites an edit).
UPDATE cfharvest.company SET biometria_id = '90010+00000', contact_name = coalesce(contact_name, 'Disposition (Demo)')
WHERE id = pg_temp.did('company') AND biometria_id IS NULL;

-- ---------------------------------------------------------------------------------------------- roles & users [DEMO]
INSERT INTO cfharvest.role (id, tenant_id, code, name_sv, name_de, permissions) VALUES
  (pg_temp.did('role:administrator'), pg_temp.did('company'), 'administrator', 'Administratör', 'Administrator',
   '{admin.resources,admin.calendar,admin.teams,admin.users,admin.contracts,admin.company,admin.transfers,admin.layers,admin.templates,plan.read,plan.write,plan.send,orderbook.write,messages.write}'),
  (pg_temp.did('role:planner'),       pg_temp.did('company'), 'planner',       'Planerare',     'Planer',
   '{plan.read,plan.write,plan.send,orderbook.write,messages.write}'),
  (pg_temp.did('role:mobile'),        pg_temp.did('company'), 'mobile',        'Mobil/Maskin',  'Mobil/Maschine',
   '{plan.read.own,production.report,messages.write}')
ON CONFLICT DO NOTHING;
-- The four Administration areas of PLAN_OVERNIGHT §4 (= admin-model.js ROLES). Databases seeded before they existed
-- get them once; when any of them is already present (or was removed on purpose later) nothing is touched.
UPDATE cfharvest.role
SET permissions = permissions || '{admin.company,admin.transfers,admin.layers,admin.templates}'::text[]
WHERE id = pg_temp.did('role:administrator')
  AND NOT permissions && '{admin.company,admin.transfers,admin.layers,admin.templates}'::text[];

-- ---------------------------------------------------------------------------------------------- resources
-- bridge.js MASTER. Grunddata values are [DEMO] master data (no machine brand implied).
INSERT INTO cfharvest.resource (id, tenant_id, code, type, name, stanford_code, manufacturer, model, model_year,
  bearing_class, plate_weight_kg, extinguisher_checked_on, aggregate_model, phone, email, service_packages,
  woodforce_start_date, active, plannable, is_subcontractor, base_rate, base_rate_unit, description) VALUES
  (pg_temp.did('resource:H-01'), pg_temp.did('company'), 'H-01', 'harvester', 'Harvester H-01', '90001',
   'Demo-Hersteller', 'Radharvester · Demo', 2022, 'B', 21500, '2026-03-12', 'Demo-Aggregat 60', NULL,
   'h-01@demo.invalid', '{Fernwartung}', '2026-01-05', true, true, false, 28, 'fm/h', 'Holzernte'),
  (pg_temp.did('resource:F-01'), pg_temp.did('company'), 'F-01', 'forwarder', 'Forwarder F-01', '90002',
   'Demo-Hersteller', 'Forwarder · Demo', 2021, 'B', 18900, NULL, NULL, NULL,
   'f-01@demo.invalid', '{}', '2026-01-05', true, true, false, 32, 'fm/h', 'Rücken'),
  (pg_temp.did('resource:L-01'), pg_temp.did('company'), 'L-01', 'truck', 'Lkw L-01', NULL,
   NULL, 'Holz-Lkw · Demo', NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, '{}', NULL, true, false, true, 25, 'fm/Tour', 'Abfuhr'),
  (pg_temp.did('resource:L-02'), pg_temp.did('company'), 'L-02', 'truck', 'Lkw L-02', NULL,
   NULL, 'Holz-Lkw · Demo', NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, '{}', NULL, true, false, true, 25, 'fm/Tour', 'Abfuhr')
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.app_user (id, tenant_id, email, display_name, language, resource_id) VALUES
  (pg_temp.did('user:planer'), pg_temp.did('company'), 'planer@demo.invalid', 'Demo-Lohnunternehmen - Planer', 'de', NULL),
  (pg_temp.did('user:h-01'),   pg_temp.did('company'), 'h-01@demo.invalid',   'Fahrer Harvester H-01',          'de', pg_temp.did('resource:H-01'))
ON CONFLICT DO NOTHING;

-- Resource access per user (admin-model.js USERS resourceAccess): the planner sees every machine, the driver his own.
INSERT INTO cfharvest.app_user_resource (tenant_id, user_id, resource_id)
SELECT pg_temp.did('company'), pg_temp.did('user:' || u.id), pg_temp.did('resource:' || r.code)
FROM (VALUES ('planer', 'H-01'), ('planer', 'F-01'), ('planer', 'L-01'), ('planer', 'L-02'), ('h-01', 'H-01')) AS u(id, code)
JOIN (VALUES ('H-01'), ('F-01'), ('L-01'), ('L-02')) AS r(code) USING (code)
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.app_user_role (tenant_id, user_id, role_id) VALUES
  (pg_temp.did('company'), pg_temp.did('user:planer'), pg_temp.did('role:administrator')),
  (pg_temp.did('company'), pg_temp.did('user:planer'), pg_temp.did('role:planner')),
  (pg_temp.did('company'), pg_temp.did('user:h-01'),   pg_temp.did('role:mobile'))
ON CONFLICT DO NOTHING;

-- Enhetsdata consent: the game machines report production, so they start with consent (admin views unitConsent) [DEMO].
UPDATE cfharvest.resource SET unit_data_consent = true, unit_data_consent_on = '2026-01-05'
WHERE tenant_id = pg_temp.did('company') AND code IN ('H-01', 'F-01') AND unit_data_consent IS NULL;

-- ---------------------------------------------------------------------------------------------- client, operations
INSERT INTO cfharvest.client (id, tenant_id, code, name, regions, customer_groups, email) VALUES
  (pg_temp.did('client:TRI'), pg_temp.did('company'), 'TRI', 'Trimble Messe · Auftraggeber (Spielszenario)',
   '{"01 - Demo-Revier"}', '{"Privatwald"}', 'einkauf@demo.invalid')     -- regions / customer group [DEMO]
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.operation_type (id, tenant_id, code, name_sv, name_de, operation_class, operation_group, stanford_logging_form, sort_order) VALUES
  (pg_temp.did('op:slutavverkning'),  pg_temp.did('company'), 'slutavverkning',  'Slutavverkning',  'Endnutzung',        'drivning', 'Virkesdrivning', 'FinalFelling', 1),
  (pg_temp.did('op:forsta_gallring'), pg_temp.did('company'), 'forsta_gallring', 'Första gallring', 'Erstdurchforstung', 'drivning', 'Virkesdrivning', 'Thinning',     2),
  (pg_temp.did('op:gallring'),        pg_temp.did('company'), 'gallring',        'Gallring',        'Durchforstung',     'drivning', 'Virkesdrivning', 'Thinning',     3)
ON CONFLICT DO NOTHING;   -- stanford_logging_form values are approx.

-- dist/journey.js contracts (standard is the default the game starts with; premium is the alternative offer).
INSERT INTO cfharvest.contract (id, tenant_id, client_id, contract_no, name, valid_from, valid_to,
  target_volume_m3, target_saw_m3, prices, shortfall_eur_per_m3) VALUES
  (pg_temp.did('contract:V-26-014'), pg_temp.did('company'), pg_temp.did('client:TRI'), 'V-26-014', 'Standardauftrag',
   '2026-10-19', '2026-10-30', 600, 360, '{"SAG": 78, "IND": 34, "ABW": 26}', 2),
  (pg_temp.did('contract:V-26-015'), pg_temp.did('company'), pg_temp.did('client:TRI'), 'V-26-015', 'Mehrmenge mit Preisaufschlag',
   '2026-10-19', '2026-10-30', 720, 460, '{"SAG": 84, "IND": 34, "ABW": 26}', 6)
ON CONFLICT DO NOTHING;   -- valid_from/to [DEMO]: shifts 1–4 + haulage window

INSERT INTO cfharvest.contract_operation_type (tenant_id, contract_id, operation_type_id) VALUES
  (pg_temp.did('company'), pg_temp.did('contract:V-26-014'), pg_temp.did('op:slutavverkning')),
  (pg_temp.did('company'), pg_temp.did('contract:V-26-015'), pg_temp.did('op:slutavverkning'))
ON CONFLICT DO NOTHING;

-- Delivery points as in ForestJourney.haul (saw → Sägewerk, otherwise Industrieabnehmer). Codes [DEMO].
INSERT INTO cfharvest.receiving_place (id, tenant_id, code, name, kind) VALUES
  (pg_temp.did('rp:SW-01'), pg_temp.did('company'), 'SW-01', 'Sägewerk',          'sawmill'),
  (pg_temp.did('rp:IA-01'), pg_temp.did('company'), 'IA-01', 'Industrieabnehmer', 'industry')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------- capacity
-- Produktionsdata [M22]: Slutavverkning = game rates 28 / 32 fm/h; thinning rates are [DEMO] (bridge.js MASTER).
INSERT INTO cfharvest.resource_production_rate (tenant_id, resource_id, operation_type_id, m3_per_hour) VALUES
  (pg_temp.did('company'), pg_temp.did('resource:H-01'), pg_temp.did('op:slutavverkning'),  28),
  (pg_temp.did('company'), pg_temp.did('resource:H-01'), pg_temp.did('op:forsta_gallring'), 14),
  (pg_temp.did('company'), pg_temp.did('resource:H-01'), pg_temp.did('op:gallring'),        20),
  (pg_temp.did('company'), pg_temp.did('resource:F-01'), pg_temp.did('op:slutavverkning'),  32),
  (pg_temp.did('company'), pg_temp.did('resource:F-01'), pg_temp.did('op:forsta_gallring'), 18),
  (pg_temp.did('company'), pg_temp.did('resource:F-01'), pg_temp.did('op:gallring'),        24)
ON CONFLICT DO NOTHING;

-- Veckoarbetstid: one game shift = 8 booked hours, Mon–Fri; weekend 0 (bridge.js WEEK).
INSERT INTO cfharvest.resource_weekly_hours (tenant_id, resource_id, weekday, hours)
SELECT pg_temp.did('company'), pg_temp.did('resource:' || r.code), d.wd::cfharvest.weekday,
       CASE WHEN d.wd IN ('sat', 'sun') THEN 0 ELSE 8 END
FROM (VALUES ('H-01'), ('F-01'), ('L-01'), ('L-02')) AS r(code)
CROSS JOIN (VALUES ('mon'), ('tue'), ('wed'), ('thu'), ('fri'), ('sat'), ('sun')) AS d(wd)
ON CONFLICT DO NOTHING;

-- Drivningskedja K-01 (bridge.js CHAINS); forwarder lag 1 day [DEMO, PLAN_OVERNIGHT §1].
INSERT INTO cfharvest.team (id, tenant_id, code, kind, name, forwarder_lag_days) VALUES
  (pg_temp.did('team:K-01'), pg_temp.did('company'), 'K-01', 'drivningskedja', 'H-01/F-01', 1)
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.team_member (tenant_id, team_id, resource_id, sort_order) VALUES
  (pg_temp.did('company'), pg_temp.did('team:K-01'), pg_temp.did('resource:H-01'), 0),
  (pg_temp.did('company'), pg_temp.did('team:K-01'), pg_temp.did('resource:F-01'), 1)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------- work orders
-- dist/game.js definitions: Nordhang 560 fm Fichte · Talgrund 520 fm Fichte/Kiefer (+80 fm already felled) ·
-- Südrevier 420 fm Buche. All Slutavverkning (SPEC §7a). Areas from bridge.js STAND_FACTS [DEMO].
-- Available = game shifts 1 and 4 (19.–22.10.2026). Forwarding distances [DEMO], ordered as the game's
-- terrain texts ("kurze" / — / "lange Rückewege").
INSERT INTO cfharvest.work_order (id, tenant_id, client_id, contract_id, order_no, name, customer_group, operation_group,
  property_designation, municipality, area_ha, planned_volume_m3, forwarding_distance_m,
  status, priority, plannable, grot, quality_control_required,
  operation_type_id, available_from, available_to, region, route_sequence_no,
  species_mix, geometry, map_symbols, demo_facts) VALUES
  (pg_temp.did('wo:H-A01'), pg_temp.did('company'), pg_temp.did('client:TRI'), pg_temp.did('contract:V-26-014'),
   'H-A01', 'Nordhang', 'Privatwald', 'Virkesdrivning', NULL, NULL, 1.9, 560, 150,
   'available', 'lowest', true, false, false,
   pg_temp.did('op:slutavverkning'), '2026-10-19', '2026-10-22', '01 - Demo-Revier', 1,
   '[{"species": "Fichte", "quality": null, "volume_m3": 560}]',
   '{"type": "Polygon", "coordinates": [[[51.55,71.5],[183.55,68.2],[195.1,183.7],[172,200.2],[64.75,196.9],[49.9,157.3],[51.55,71.5]]]}',
   '{"type": "FeatureCollection", "coordinateSystem": "game-image", "features": [
      {"type": "Feature", "properties": {"kind": "route", "machine": "H-01", "label": "Harvester-Route"},
       "geometry": {"type": "LineString", "coordinates": [[89.5,81.4],[89.5,177.1],[119.2,177.1],[119.2,81.4],[148.9,81.4],[148.9,177.1],[175.3,177.1],[175.3,81.4]]}},
      {"type": "Feature", "properties": {"kind": "route", "machine": "F-01", "label": "Forwarder-Route"},
       "geometry": {"type": "LineString", "coordinates": [[125.8,213.4],[125.8,193.6],[89.5,183.7],[89.5,81.4],[119.2,81.4],[119.2,177.1],[148.9,177.1],[148.9,81.4],[175.3,81.4],[175.3,183.7],[125.8,193.6],[125.8,213.4]]}}]}',
   '{"standId": "a", "terrain": "Trocken · kurze Rückewege", "surveyCoverage": 100, "harvestFactor": 1, "forwardFactor": 1.12, "initialStock": 0, "gradeSpec": {"v1": "5,1", "v2": "4,1"}}'),
  (pg_temp.did('wo:H-B01'), pg_temp.did('company'), pg_temp.did('client:TRI'), pg_temp.did('contract:V-26-014'),
   'H-B01', 'Talgrund', 'Privatwald', 'Virkesdrivning', NULL, NULL, 2.4, 520, 250,
   'available', 'lowest', true, false, false,
   pg_temp.did('op:slutavverkning'), '2026-10-19', '2026-10-22', '01 - Demo-Revier', 2,
   '[{"species": "Fichte / Kiefer", "quality": null, "volume_m3": 520}]',
   '{"type": "Polygon", "coordinates": [[[301.6,34.5],[416.15,33.05],[426.3,124.4],[410.35,144.7],[313.2,144.7],[298.7,101.2],[301.6,34.5]]]}',
   '{"type": "FeatureCollection", "coordinateSystem": "game-image", "features": [
      {"type": "Feature", "properties": {"kind": "route", "machine": "H-01", "label": "Harvester-Route"},
       "geometry": {"type": "LineString", "coordinates": [[326.25,43.2],[326.25,127.3],[352.35,127.3],[352.35,43.2],[378.45,43.2],[378.45,127.3]]}},
      {"type": "Feature", "properties": {"kind": "route", "machine": "F-01", "label": "Forwarder-Route"},
       "geometry": {"type": "LineString", "coordinates": [[365.4,159.2],[365.4,141.8],[326.25,133.1],[326.25,43.2],[352.35,43.2],[352.35,127.3],[378.45,127.3],[378.45,43.2],[378.45,133.1],[365.4,141.8],[365.4,159.2]]}}]}',
   '{"standId": "b", "terrain": "Feucht · hohe Ernteleistung", "surveyCoverage": 65, "harvestFactor": 1.25, "forwardFactor": 1, "initialStock": 80, "gradeSpec": {"v1": "4,1", "v2": "3,1"}}'),
  (pg_temp.did('wo:H-C01'), pg_temp.did('company'), pg_temp.did('client:TRI'), pg_temp.did('contract:V-26-014'),
   'H-C01', 'Südrevier', 'Privatwald', 'Virkesdrivning', NULL, NULL, 2.1, 420, 400,
   'available', 'lowest', true, false, false,
   pg_temp.did('op:slutavverkning'), '2026-10-19', '2026-10-22', '01 - Demo-Revier', 3,
   '[{"species": "Buche", "quality": null, "volume_m3": 420}]',
   '{"type": "Polygon", "coordinates": [[[301.2,201.8],[413.2,201.8],[421.6,288.6],[400.6,305.4],[312.4,305.4],[298.4,263.4],[301.2,201.8]]]}',
   '{"type": "FeatureCollection", "coordinateSystem": "game-image", "features": [
      {"type": "Feature", "properties": {"kind": "route", "machine": "H-01", "label": "Harvester-Route"},
       "geometry": {"type": "LineString", "coordinates": [[325,243.8],[325,288.6],[350.2,288.6],[350.2,243.8],[375.4,243.8],[375.4,288.6],[400.6,288.6],[400.6,243.8]]}},
      {"type": "Feature", "properties": {"kind": "route", "machine": "F-01", "label": "Forwarder-Route"},
       "geometry": {"type": "LineString", "coordinates": [[362.8,319.4],[362.8,302.6],[325,294.2],[325,243.8],[350.2,243.8],[350.2,288.6],[375.4,288.6],[375.4,243.8],[400.6,243.8],[400.6,294.2],[362.8,302.6],[362.8,319.4]]}}]}',
   '{"standId": "c", "terrain": "Trocken · lange Rückewege", "surveyCoverage": 100, "harvestFactor": 0.87, "forwardFactor": 0.85, "initialStock": 0, "gradeSpec": {"v1": "3,1", "v2": "3,1"}}')
ON CONFLICT DO NOTHING;

-- Sortiment: saw share 0.65 = the game's opening-stock split (bridge.js sawShare()); downgraded (ABW) carries no PIN.
-- PIN file names = model.js pinFileName() for PIN version 1 (game rounds 1–2). Mätmetod/Mätplats = the values
-- observed in the product [V6-1:45], assigned here [DEMO].
INSERT INTO cfharvest.assortment (id, tenant_id, work_order_id, receiving_place_id, sortiment_code, sortiment_name,
  sort_group, species_group, volume_category, planned_m3, nominal_length_m, pin_version, pin_file_name,
  measurement_method, measurement_place)
SELECT pg_temp.did('as:' || w.no || ':' || s.code), pg_temp.did('company'), pg_temp.did('wo:' || w.no),
       pg_temp.did('rp:' || s.rp), s.code, s.name, s.grp, w.species, 'under_bark',
       round(w.vol * s.share, 2),
       CASE WHEN s.code = 'SAG' THEN w.len END,
       CASE WHEN s.pin THEN 1 END,
       CASE WHEN s.pin THEN s.code || '_' || replace(w.name, ' ', '_') || '_'
                            || CASE WHEN s.code = 'SAG' THEN replace(w.spec, ',', '-') || 'm_' ELSE '' END || 'v1' END,
       'Fabriksmätning', 'Industrimätning'
FROM (VALUES ('H-A01', 'Nordhang',  'Fichte',          560::numeric, 5.1::numeric, '5,1'),
             ('H-B01', 'Talgrund',  'Fichte / Kiefer', 520,          4.1,          '4,1'),
             ('H-C01', 'Südrevier', 'Buche',           420,          3.1,          '3,1')) AS w(no, name, species, vol, len, spec)
CROSS JOIN (VALUES ('SAG', 'Sägeholz',       'Stammholz',     'SW-01', 0.65::numeric, true),
                   ('IND', 'Industrieholz',  'Industrieholz', 'IA-01', 0.35,          true),
                   ('ABW', 'Abgewertet',     'Industrieholz', 'IA-01', 0,             false)) AS s(code, name, grp, rp, share, pin)
ON CONFLICT DO NOTHING;

-- Avlägg / Polter: bridge.js landing (routes.js polter point).
INSERT INTO cfharvest.landing (id, tenant_id, work_order_id, code, name, point) VALUES
  (pg_temp.did('landing:P-A01'), pg_temp.did('company'), pg_temp.did('wo:H-A01'), 'P-A01', 'Polter Nordhang',
   '{"type": "Point", "coordinates": [125.8, 213.4]}'),
  (pg_temp.did('landing:P-B01'), pg_temp.did('company'), pg_temp.did('wo:H-B01'), 'P-B01', 'Polter Talgrund',
   '{"type": "Point", "coordinates": [365.4, 159.2]}'),
  (pg_temp.did('landing:P-C01'), pg_temp.did('company'), pg_temp.did('wo:H-C01'), 'P-C01', 'Polter Südrevier',
   '{"type": "Point", "coordinates": [362.8, 319.4]}')
ON CONFLICT DO NOTHING;

-- Hänsyn: dist/game.js biodiversity BIO-01..03; point and radius = routes.js hazard × site anchor (bridge.js bio).
INSERT INTO cfharvest.map_symbol (id, tenant_id, work_order_id, code, category, title, status, location, instruction, restriction, geometry, radius) VALUES
  (pg_temp.did('sym:BIO-01'), pg_temp.did('company'), pg_temp.did('wo:H-A01'), 'BIO-01', 'biodiversity',
   'Habitatbaum mit Höhle', 'Markiert · erhalten', 'Nordhang · westlicher Rand der Rückegasse',
   'Habitatbaum und markierten Bereich erhalten. Rückegasse außerhalb der Markierung führen.',
   'Markierter Bereich bleibt von der Nutzung ausgeschlossen.',
   '{"type": "Point", "coordinates": [69.7, 112.75]}', 14.85),
  (pg_temp.did('sym:BIO-02'), pg_temp.did('company'), pg_temp.did('wo:H-B01'), 'BIO-02', 'biodiversity',
   'Bachlauf / ungeprüfte Feuchtfläche', 'Erkundung unvollständig · 65 % erfasst', 'Talgrund · nordöstliche Teilfläche',
   'Bachlauf aussparen. Die angrenzende Teilfläche wurde wegen Zeitmangels nicht begangen. Vor Einsatz nacherkunden oder diese Fläche ausnehmen.',
   'Kenntnisnahme ist keine Erkundung und keine Freigabe der ungeprüften Teilfläche.',
   '{"type": "Point", "coordinates": [411.8, 78]}', 17.4),
  (pg_temp.did('sym:BIO-03'), pg_temp.did('company'), pg_temp.did('wo:H-C01'), 'BIO-03', 'biodiversity',
   'Horstverdacht am Altbaum', 'Teilfläche ausgeschlossen', 'Südrevier · nördliche Teilfläche',
   'Bekannte Schutzzone aussparen. Arbeiten ausschließlich außerhalb der Markierung.',
   'Geschützte Teilfläche bleibt ausgeschlossen.',
   '{"type": "Point", "coordinates": [367, 213]}', 18.2)
ON CONFLICT DO NOTHING;

-- Kontaktuppgifter: bridge.js CONTACTS (scenario placeholders), one pair per work order.
INSERT INTO cfharvest.contact (id, tenant_id, work_order_id, role, name, position, address, phone, email, language, receives_messages, sort_order)
SELECT pg_temp.did('contact:' || w.no || ':' || c.role), pg_temp.did('company'), pg_temp.did('wo:' || w.no),
       c.role::cfharvest.contact_role, c.name, c.position, c.address, NULL, c.email, 'Deutsch', true, c.ord
FROM (VALUES ('H-A01'), ('H-B01'), ('H-C01')) AS w(no)
CROSS JOIN (VALUES ('skogsagare',     'Waldbesitzer (Spielszenario)', 'Eigentümer', 'Forstweg 1 · Demo', NULL,                   0),
                   ('uppdragsgivare', 'Holzeinkauf (Spielszenario)',  'Einkäufer',  NULL,                'einkauf@demo.invalid', 1))
     AS c(role, name, position, address, email, ord)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------- production
-- Talgrund opening stock: 80 fm felled before shift 1, split 65/35 (game initial().stockGrades) — an HPR with
-- is_opening_stock, exactly like bridge.js productionMessages() kind 'opening'. No machine, game round 0.
INSERT INTO cfharvest.production_message (id, tenant_id, kind, resource_id, work_order_id, received_at, file_name,
  is_opening_stock, game_round, payload) VALUES
  (pg_temp.did('pm:opening:H-B01'), pg_temp.did('company'), 'HPR', NULL, pg_temp.did('wo:H-B01'),
   '2026-10-18 16:00:00+02', NULL, true, 0,
   '{"type": "HPR", "kind": "opening", "round": 0, "objectKey": "H-B01", "volume": 80, "products": {"saw": 52, "pulp": 28, "down": 0}}')
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.production_line (id, tenant_id, message_id, assortment_id, felled_m3) VALUES
  (pg_temp.did('pl:opening:H-B01:SAG'), pg_temp.did('company'), pg_temp.did('pm:opening:H-B01'), pg_temp.did('as:H-B01:SAG'), 52),
  (pg_temp.did('pl:opening:H-B01:IND'), pg_temp.did('company'), pg_temp.did('pm:opening:H-B01'), pg_temp.did('as:H-B01:IND'), 28)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------- Beställning
-- Standardauftrag V-26-014: 600 fm of which 360 fm Sägeholz → lines 360 SAG + 240 IND (+ ABW 0), prices 78/34/26 €
-- (game targets()). Alarm limits 90/110 % = model.js defaults. Period, region and follow-up basis [DEMO].
INSERT INTO cfharvest.order_book (id, tenant_id, book_no, client_id, contract_id, name, region, area,
  period_from, period_to, operation_class, status, followup_basis) VALUES
  (pg_temp.did('ob:B-V-26-014'), pg_temp.did('company'), 'B-V-26-014', pg_temp.did('client:TRI'), pg_temp.did('contract:V-26-014'),
   'Standardauftrag', '01 - Demo-Revier', NULL, '2026-10-19', '2026-10-30', 'drivning', 'draft', 'forwarder')
ON CONFLICT DO NOTHING;

INSERT INTO cfharvest.order_line (id, tenant_id, order_book_id, receiving_place_id, sort_group, sortiment_code, sortiment_name,
  start_date, end_date, plan_m3, agreed_m3, price_eur_per_m3, lower_alarm_pct, upper_alarm_pct) VALUES
  (pg_temp.did('ol:B-V-26-014:SAG'), pg_temp.did('company'), pg_temp.did('ob:B-V-26-014'), pg_temp.did('rp:SW-01'),
   'Stammholz', 'SAG', 'Sägeholz', '2026-10-19', '2026-10-30', 360, 360, 78, 90, 110),
  (pg_temp.did('ol:B-V-26-014:IND'), pg_temp.did('company'), pg_temp.did('ob:B-V-26-014'), pg_temp.did('rp:IA-01'),
   'Industrieholz', 'IND', 'Industrieholz', '2026-10-19', '2026-10-30', 240, 240, 34, 90, 110),
  (pg_temp.did('ol:B-V-26-014:ABW'), pg_temp.did('company'), pg_temp.did('ob:B-V-26-014'), pg_temp.did('rp:IA-01'),
   'Industrieholz', 'ABW', 'Abgewertet', '2026-10-19', '2026-10-30', 0, 0, 26, 90, 110)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------- Kartskikt, Meddelande mallar
-- admin-model.js LAYERS: switcher order, shown when a map opens, accent colour (NULL = status colours) [DEMO].
INSERT INTO cfharvest.map_layer_config (tenant_id, layer_key, enabled_by_default, sort_order, colour, fixed) VALUES
  (pg_temp.did('company'), 'photo',      true,  0, NULL,      true),
  (pg_temp.did('company'), 'stands',     true,  1, '#bff0cc', false),
  (pg_temp.did('company'), 'landings',   true,  2, '#eef7ff', false),
  (pg_temp.did('company'), 'symbols',    true,  3, NULL,      false),
  (pg_temp.did('company'), 'protect',    true,  4, '#ffd369', false),
  (pg_temp.did('company'), 'neighbours', true,  5, NULL,      false),
  (pg_temp.did('company'), 'routes',     false, 6, '#52d5ff', false),
  (pg_temp.did('company'), 'machines',   true,  7, NULL,      false)
ON CONFLICT DO NOTHING;

-- admin-model.js TEMPLATES [DEMO texts].
INSERT INTO cfharvest.message_template (id, tenant_id, code, name, body, active) VALUES
  (pg_temp.did('template:MT-01'), pg_temp.did('company'), 'MT-01', 'Arbeitsauftrag gesendet',
   'Neuer Arbeitsauftrag {Auftrag} für {Ressource} ab {Datum}. Bitte die PIN-Datei laden und die Hiebsgrenze prüfen.', true),
  (pg_temp.did('template:MT-02'), pg_temp.did('company'), 'MT-02', 'Rückegasse und Schutzbereich',
   'Bei {Auftrag} bitte zuerst die Rückegasse 3 nutzen und den Schutzbereich aussparen.', true),
  (pg_temp.did('template:MT-03'), pg_temp.did('company'), 'MT-03', 'Rückmeldung erbeten',
   'Bitte den Stand der Arbeiten bei {Auftrag} bis Schichtende melden.', true)
ON CONFLICT DO NOTHING;

-- No resource_transfer rows: the demo starts without transfers.

COMMIT;
