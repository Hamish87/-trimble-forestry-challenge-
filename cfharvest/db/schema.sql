-- =====================================================================================================
-- CFHarvest replica · real data layer (PLAN_OVERNIGHT.md §2)
-- Target: PostgreSQL 15 (Supabase). Idempotent: safe to run repeatedly; it never drops data.
--
-- Source keys in comments follow SPEC_PLANNING.md / evidence/CAPTURE_LOG.md:
--   [Mnn] manual screenshot, [V6-m:ss] training-video frame, [MW] manual text, [SS] spec sheet,
--   [VS] Viktiga steg, [MM] Manual Maskin, [DEMO] = our design decision where nothing was observed,
--   "approx." = StanForD 2010 element names recalled from the standard, to be verified against the
--   Skogforsk XSDs before any real machine exchange.
--
-- Conventions
--   * Every table has tenant_id uuid NOT NULL (= company.id of the owning contractor tenant).
--   * Surrogate uuid primary keys; the app's human ids (H-A01, H-01, F-01, K-01, P-A01, V-26-014 …)
--     live in business-key columns that are UNIQUE per tenant (order_no, code, contract_no …).
--   * Volumes are m³ (fm, solid under bark unless volume_category says otherwise), hours are decimal h.
--   * Product (Swedish) vocabulary is kept in enum values and comments so the replica teaches the
--     real terms; German labels live in the app (i18n-cfharvest.js).
--
-- Row-level security is deliberately OFF for the demo. To enable it later (Supabase):
--   ALTER TABLE cfharvest.<t> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation ON cfharvest.<t>
--     USING      (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
--     WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
--   (one policy per table; the DO block at the end of this file lists every table that needs it).
--   Role-based write rules (Administratör / Planerare / Mobil-Maskin) would be additional policies
--   joining app_user → app_user_role → role.
-- =====================================================================================================

CREATE SCHEMA IF NOT EXISTS cfharvest;
-- gen_random_uuid() is built into PostgreSQL ≥ 13; no extension needed.

-- -----------------------------------------------------------------------------------------------------
-- Enums (guarded: CREATE TYPE has no IF NOT EXISTS)
-- -----------------------------------------------------------------------------------------------------
DO $$
BEGIN
  -- Canonical work-order status (model.js STATUSES). Long texts: see cfharvest.status_title().
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'work_order_status') THEN
    CREATE TYPE cfharvest.work_order_status AS ENUM
      ('available', 'planned', 'sent', 'harvesting', 'felled', 'forwarding', 'completed');
  END IF;

  -- Admin → Resurser "Typ" filter [M28]: Harv, Person, Skotare, Skördare … ; truck/other [DEMO].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'resource_type') THEN
    CREATE TYPE cfharvest.resource_type AS ENUM ('harvester', 'forwarder', 'person', 'truck', 'other');
  END IF;

  -- Arbetsgrupper / Drivningskedjor [M8][MW].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'team_kind') THEN
    CREATE TYPE cfharvest.team_kind AS ENUM ('arbetsgrupp', 'drivningskedja');
  END IF;

  -- Veckoarbetstid weekday keys, identical to model.js WEEKDAYS.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'weekday') THEN
    CREATE TYPE cfharvest.weekday AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  END IF;

  -- Åtgärd filter Drivning · Skoglig Service [M36]; Beställningar toggle [M78–82].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'operation_class') THEN
    CREATE TYPE cfharvest.operation_class AS ENUM ('drivning', 'skoglig_service');
  END IF;

  -- Prioritet: only "Lägsta" (= lowest) is observed [V6-1:10]; the other steps are [DEMO].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'priority_level') THEN
    CREATE TYPE cfharvest.priority_level AS ENUM ('lowest', 'low', 'normal', 'high', 'highest');
  END IF;

  -- Assignment lifecycle [DEMO]; "staged" (unsaved, Återställ counter) stays client-side and is never stored.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'assignment_status') THEN
    CREATE TYPE cfharvest.assignment_status AS ENUM ('planned', 'sent', 'started', 'completed', 'cancelled');
  END IF;

  -- Inbound StanForD 2010 production/control messages. HPR, FPR, HQC, MOM are StanForD 2010 message
  -- types. FQC (forwarder quality control) is NOT a StanForD 2010 type as far as known (approx.) —
  -- kept as [DEMO] for scale/control-measurement results of forwarded loads (Vågkontroll [M75]).
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'production_kind') THEN
    CREATE TYPE cfharvest.production_kind AS ENUM ('HPR', 'FPR', 'HQC', 'FQC', 'MOM');
  END IF;

  -- Outbound instruction files generated by Skicka [M53][SS][VS].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'instruction_kind') THEN
    CREATE TYPE cfharvest.instruction_kind AS ENUM ('OIN', 'PIN', 'FOI', 'FDI');
  END IF;

  -- Kontaktuppgifter groups [V6-2:01]; 'ovrig' [DEMO].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'contact_role') THEN
    CREATE TYPE cfharvest.contact_role AS ENUM ('skogsagare', 'uppdragsgivare', 'ovrig');
  END IF;

  -- Beställning lifecycle: buttons Spara / Bekräfta [M78–82]; 'closed' [DEMO].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'order_book_status') THEN
    CREATE TYPE cfharvest.order_book_status AS ENUM ('draft', 'confirmed', 'closed');
  END IF;

  -- "Uppföljning mot: Skördare | Skotare" [M78–82].
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'followup_basis') THEN
    CREATE TYPE cfharvest.followup_basis AS ENUM ('harvester', 'forwarder');
  END IF;

  -- Volymkategori: "Under bark" observed [V6-1:45]; others approx. (StanForD m3sub / m3sob; tonnes for GROT).
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'cfharvest' AND t.typname = 'volume_category') THEN
    CREATE TYPE cfharvest.volume_category AS ENUM ('under_bark', 'over_bark', 'tonnes', 'other');
  END IF;
END
$$;

-- -----------------------------------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------------------------------
-- Long status texts of the order-detail title [M73][M76][V6-1:10] (model.js STATUS_INFO.titleSv / .title).
CREATE OR REPLACE FUNCTION cfharvest.status_title(s cfharvest.work_order_status, lang text DEFAULT 'sv')
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lang = 'de' THEN
    CASE s
      WHEN 'available'  THEN 'Arbeitsauftrag an CFHarvest gesendet (planbar)'
      WHEN 'planned'    THEN 'Arbeitsauftrag geplant'
      WHEN 'sent'       THEN 'Arbeitsauftrag an Ressource gesendet'
      WHEN 'harvesting' THEN 'Ernte begonnen'
      WHEN 'felled'     THEN 'Fällung beendet'
      WHEN 'forwarding' THEN 'Rücken begonnen'
      WHEN 'completed'  THEN 'Abgeschlossen'
    END
  ELSE
    CASE s
      WHEN 'available'  THEN 'Arbetsorder skickad till CFHarvest (Planerbar)'  -- observed [V6-1:10]
      WHEN 'planned'    THEN 'Arbetsorder planerad'                            -- [DEMO]
      WHEN 'sent'       THEN 'Arbetsorder skickad till resurs'                 -- observed [M73]
      WHEN 'harvesting' THEN 'Avverkning startad'                              -- [DEMO] (spec sheet: Harvesting Started)
      WHEN 'felled'     THEN 'Avverkning avslutad'                             -- [DEMO] (spec sheet: Felling Ended)
      WHEN 'forwarding' THEN 'Skotning Startad'                                -- observed [M76]
      WHEN 'completed'  THEN 'Avslutad'                                        -- [DEMO] (spec sheet: Completed)
    END
  END
$$;

CREATE OR REPLACE FUNCTION cfharvest.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- =====================================================================================================
-- Tenant, users, roles
-- =====================================================================================================

-- Eget företag [M8]: the contractor tenant. tenant_id is the row's own id (generated), so the
-- "tenant_id on every table" rule holds here too.
CREATE TABLE IF NOT EXISTS cfharvest.company (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid GENERATED ALWAYS AS (id) STORED NOT NULL,
  name            text NOT NULL,
  org_no          text,                       -- organisation / VAT number [DEMO]
  address         text,
  phone           text,
  email           text,
  country         text NOT NULL DEFAULT 'DE',
  default_language text NOT NULL DEFAULT 'de',  -- replica UI default is German [SPEC header]
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Företagsinställningar [M8] (not observed in detail)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Roles: Administratör · Planerare · Mobil/Maskin (PLAN_OVERNIGHT §4).
CREATE TABLE IF NOT EXISTS cfharvest.role (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code        text NOT NULL,                  -- 'administrator' | 'planner' | 'mobile'
  name_sv     text NOT NULL,                  -- 'Administratör' | 'Planerare' | 'Mobil/Maskin'
  name_de     text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',   -- role matrix keys, e.g. 'plan.write', 'admin.resources' [DEMO]
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_code_uq UNIQUE (tenant_id, code)
);

-- Resources first (app_user may be bound to a machine for the Mobil/Maskin role).
-- Admin → Resurser, Grunddata tab [M11][M22]. Fields marked * in the product are required in its UI
-- ("Obligatorisk uppgift") for machines; they stay nullable here because persons/trucks have none.
CREATE TABLE IF NOT EXISTS cfharvest.resource (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code                     text NOT NULL,          -- app id: H-01, F-01, L-01 …
  type                     cfharvest.resource_type NOT NULL,   -- Typ
  name                     text NOT NULL,          -- shown as "Name (StanForD nr)" [M55]
  stanford_code            text,                   -- Stanford-kod [M11]; machine id in OIN/HPR headers (approx.)
  manufacturer             text,                   -- Tillverkare*
  model                    text,                   -- Modell
  model_year               smallint CHECK (model_year IS NULL OR model_year BETWEEN 1950 AND 2100), -- Årsmodell*
  bearing_class            text,                   -- Bärighetsklass*
  plate_weight_kg          integer CHECK (plate_weight_kg IS NULL OR plate_weight_kg >= 0),        -- Skyltvikt* (kg)
  extinguisher_checked_on  date,                   -- Släckare kontrollerad* (date)
  aggregate_model          text,                   -- Aggregatsmodell (harvester head)
  phone                    text,                   -- Resursens tel.
  email                    text,                   -- Resursens e-post
  service_packages         text[] NOT NULL DEFAULT '{}',  -- Servicepaket ("Välj en eller flera", 0/4) [M11]
  woodforce_start_date     date,                   -- Startdatum för WoodForce*
  active                   boolean NOT NULL DEFAULT true,
  plannable                boolean NOT NULL DEFAULT true,   -- appears in Välj resurs / calendar rows [DEMO: trucks false]
  is_subcontractor         boolean NOT NULL DEFAULT false,  -- Resursöverföringar [M8] (not observed in detail)
  base_rate                numeric(10,2) CHECK (base_rate IS NULL OR base_rate >= 0), -- model.js `rate` fallback [DEMO]
  base_rate_unit           text,                   -- 'fm/h' | 'fm/Tour' [DEMO]
  description              text,                   -- model.js `model` / `operation` free text [DEMO]
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_code_uq UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS resource_stanford_uq
  ON cfharvest.resource (tenant_id, stanford_code) WHERE stanford_code IS NOT NULL AND stanford_code <> '';

CREATE TABLE IF NOT EXISTS cfharvest.app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  auth_user_id  uuid,               -- Supabase auth.users.id (no FK: other schema, may not exist locally)
  email         text NOT NULL,
  display_name  text NOT NULL,      -- header "Sydved/SEBio - Andreas Elling" [M50]
  phone         text,
  language      text NOT NULL DEFAULT 'de',
  resource_id   uuid REFERENCES cfharvest.resource(id) ON DELETE SET NULL,  -- Mobil/Maskin login bound to a machine [DEMO]
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_uq ON cfharvest.app_user (tenant_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS app_user_auth_uq  ON cfharvest.app_user (auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cfharvest.app_user_role (
  tenant_id  uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES cfharvest.app_user(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES cfharvest.role(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- =====================================================================================================
-- Clients, contracts, master data
-- =====================================================================================================

-- Uppdragsgivare (client), e.g. "SYD" Sydved [M40], replica "TRI".
CREATE TABLE IF NOT EXISTS cfharvest.client (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code        text NOT NULL,              -- list column "Uppdragsgivare": SYD / TRI
  name        text NOT NULL,
  regions     text[] NOT NULL DEFAULT '{}',  -- Beställningar area tree: "10 - North", "53 - Mitt", "55 - Syd" [M78–82]
  customer_groups text[] NOT NULL DEFAULT '{}', -- Kundgrupp values offered on work orders [DEMO]
  phone       text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_code_uq UNIQUE (tenant_id, code)
);

-- Åtgärd (Maßnahme). Keys = the Swedish product terms the app uses (model.js OPERATIONS[].key).
CREATE TABLE IF NOT EXISTS cfharvest.operation_type (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code             text NOT NULL,          -- slug: 'slutavverkning', 'forsta_gallring', 'gallring' …
  name_sv          text NOT NULL,          -- 'Slutavverkning' = model.js order.operation
  name_de          text NOT NULL,          -- 'Endnutzung'
  operation_class  cfharvest.operation_class NOT NULL DEFAULT 'drivning',
  operation_group  text,                   -- Åtgärdsgrupper, e.g. 'Virkesdrivning' [V6-1:10]
  stanford_logging_form text,              -- OIN LoggingForm code (approx.; e.g. final felling vs thinning)
  sort_order       smallint NOT NULL DEFAULT 0,
  CONSTRAINT operation_type_code_uq UNIQUE (tenant_id, code),
  CONSTRAINT operation_type_name_uq UNIQUE (tenant_id, name_sv)
);

-- Avtal (contracts with client, operation types) [M8][PLAN §4]. Prices live here and on order_line.
CREATE TABLE IF NOT EXISTS cfharvest.contract (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES cfharvest.client(id) ON DELETE NO ACTION,
  contract_no      text NOT NULL,           -- Kontrakt nr. (63511118 [V6-0:30]; replica V-26-014)
  name             text NOT NULL,
  valid_from       date,
  valid_to         date,
  target_volume_m3 numeric(12,2) CHECK (target_volume_m3 IS NULL OR target_volume_m3 >= 0),  -- [DEMO game] 600
  target_saw_m3    numeric(12,2) CHECK (target_saw_m3 IS NULL OR target_saw_m3 >= 0),        -- [DEMO game] 360
  prices           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- €/m³ by sortiment code {"SAG":78,"IND":34,"ABW":26} [DEMO game]
  shortfall_eur_per_m3 numeric(10,2),       -- "Vereinbarter Mengenausgleich" rate [DEMO game]
  currency         text NOT NULL DEFAULT 'EUR',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_no_uq UNIQUE (tenant_id, contract_no),
  CONSTRAINT contract_period_ck CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
  CONSTRAINT contract_prices_ck CHECK (jsonb_typeof(prices) = 'object')
);

CREATE TABLE IF NOT EXISTS cfharvest.contract_operation_type (
  tenant_id          uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  contract_id        uuid NOT NULL REFERENCES cfharvest.contract(id) ON DELETE CASCADE,
  operation_type_id  uuid NOT NULL REFERENCES cfharvest.operation_type(id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, operation_type_id)
);

-- Mottagningsplats (receiving place / mill), e.g. "89479 Höken", "99 Okänd Mottpl" [V6-1:45].
CREATE TABLE IF NOT EXISTS cfharvest.receiving_place (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  kind        text,                 -- 'sawmill' | 'industry' | 'energy' | 'terminal' [DEMO]
  point       jsonb,                -- GeoJSON Point [DEMO]
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receiving_place_code_uq UNIQUE (tenant_id, code)
);

-- =====================================================================================================
-- Resource capacity: production rates, weekly hours, calendar overrides, teams/chains
-- =====================================================================================================

-- Produktionsdata per åtgärd (m³/h) [M22]; Uppskattad arbetstid = Arbetsmängd ÷ rate [M72][SPEC §4].
CREATE TABLE IF NOT EXISTS cfharvest.resource_production_rate (
  tenant_id          uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  resource_id        uuid NOT NULL REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  operation_type_id  uuid NOT NULL REFERENCES cfharvest.operation_type(id) ON DELETE CASCADE,
  m3_per_hour        numeric(8,2) NOT NULL CHECK (m3_per_hour > 0),
  PRIMARY KEY (resource_id, operation_type_id)
);

-- Veckoarbetstid: hours per weekday ("Vardag 10 h/dag" [M23]; Vardag 8 · Lördag 0 · Söndag 0 [M72]).
CREATE TABLE IF NOT EXISTS cfharvest.resource_weekly_hours (
  tenant_id    uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  weekday      cfharvest.weekday NOT NULL,
  hours        numeric(4,2) NOT NULL CHECK (hours BETWEEN 0 AND 24),
  PRIMARY KEY (resource_id, weekday)
);

-- Veckokalender: per-day override (blue default / yellow override "15") [M30].
-- is_manual = true for planner overrides; false for system-derived entries (e.g. holidays) [DEMO].
CREATE TABLE IF NOT EXISTS cfharvest.calendar_override (
  tenant_id    uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  day          date NOT NULL,
  hours        numeric(4,2) NOT NULL CHECK (hours BETWEEN 0 AND 24),
  is_manual    boolean NOT NULL DEFAULT true,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, day)
);

-- Arbetsgrupper (work groups, e.g. "Patriks grupp" [M40]) and Drivningskedjor (harvesting chains,
-- shown as "H/F" names, e.g. "Rottne H11/F11 (2070898)" [M49][M55]).
CREATE TABLE IF NOT EXISTS cfharvest.team (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  code                 text NOT NULL,             -- app id: K-01
  kind                 cfharvest.team_kind NOT NULL,
  name                 text NOT NULL,             -- 'H-01/F-01'
  stanford_code        text,                      -- chains carry their own number in the product [M59] (approx.)
  forwarder_lag_days   numeric(4,1) NOT NULL DEFAULT 0 CHECK (forwarder_lag_days >= 0),
                       -- forwarder "planeras … några dagar efter skördaren" [M61]; value [DEMO]
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS cfharvest.team_member (
  tenant_id    uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES cfharvest.team(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  sort_order   smallint NOT NULL DEFAULT 0,   -- harvester first, forwarder second in a chain
  PRIMARY KEY (team_id, resource_id)
);

-- =====================================================================================================
-- Work orders (Arbetsorder) and their tabs
-- =====================================================================================================

-- One row per Arbetsorder. Columns follow the order-detail tab "Arbetsorder" [M73][V6-1:10]
-- (Grunddata + Arbetets utförande), Övrig info [V6-1:29], Sortiment header [V6-1:45] and the
-- Uppdragslista columns [V6-2:12].
CREATE TABLE IF NOT EXISTS cfharvest.work_order (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  client_id                   uuid NOT NULL REFERENCES cfharvest.client(id) ON DELETE NO ACTION,   -- Uppdragsgivare
  contract_id                 uuid REFERENCES cfharvest.contract(id) ON DELETE SET NULL,          -- Kontrakt nr.

  -- Grunddata ------------------------------------------------------------------------------------
  order_no                    text NOT NULL,      -- Arbetsorder nr. (566064-01 [V6-0:30]; replica H-A01)
  name                        text NOT NULL,      -- Namn / trakt name ("Ekhult 2:20 -22 Gallring")
  customer_group              text,               -- Kundgrupp
  certification               text NOT NULL DEFAULT 'Ingen certifiering',  -- Certifiering
  support_forms               text[] NOT NULL DEFAULT '{}',  -- Arbetsorderns stödformer (subsidy forms; type approx.)
  project_name                text,               -- Projektnamn
  silviculture_agreement      text,               -- Skogsvårdsavtal (value type not observed: text approx.)
  terrain_planning_done       boolean,            -- Terrängplanering gjord
  property_designation        text,               -- Fastighetsbeteckning ("Ulvberga 1:5")
  municipality                text,               -- Kommun
  area_ha                     numeric(10,2) CHECK (area_ha IS NULL OR area_ha >= 0),                         -- Areal (ha)
  planned_volume_m3           numeric(12,2) NOT NULL DEFAULT 0 CHECK (planned_volume_m3 >= 0),              -- Kvantitet (m³) / list "Planerad"
  forwarding_distance_m       integer CHECK (forwarding_distance_m IS NULL OR forwarding_distance_m >= 0), -- Skotningsavstånd (m)
  operation_group             text,               -- Åtgärdsgrupper ("Virkesdrivning")

  -- Arbetets utförande ---------------------------------------------------------------------------
  status                      cfharvest.work_order_status NOT NULL DEFAULT 'available',  -- Status
  priority                    cfharvest.priority_level NOT NULL DEFAULT 'lowest',        -- Prioritet ("Lägsta")
  planned_operation_date      date,               -- Planerad åtgärdstidpunkt
  permitted_from              date,               -- Tillåten åtgärdsperiod (Avverkningsanmälan) – from
  permitted_to                date,               --   … – to ("6 feb. 2023 - 15 dec. 2027")
  plannable                   boolean NOT NULL DEFAULT true,   -- Planerbar (Ja/Nej)
  cannot_be_performed         boolean NOT NULL DEFAULT false,  -- Åtgärd kan ej utföras
  restriction_description     text,               -- Beskrivning av åtgärdsbegränsning
  grot                        boolean NOT NULL DEFAULT false,  -- GROT (logging residues) Ja/Nej
  felling_end_date            date,               -- Slutdatum för avverkning
  stump_harvesting            boolean NOT NULL DEFAULT false,  -- Stubbrytning
  stump_harvesting_end_date   date,               -- Slutdatum för stubbrytning
  stump_treatment             boolean NOT NULL DEFAULT false,  -- Stubbehandling
  quality_control_required    boolean NOT NULL DEFAULT false,  -- Kvalitetskontroll krävs
  sample_plot_required        boolean NOT NULL DEFAULT false,  -- Provytemätning krävs

  -- List / planning columns ----------------------------------------------------------------------
  operation_type_id           uuid REFERENCES cfharvest.operation_type(id) ON DELETE NO ACTION,  -- Åtgärd
  available_from              date,               -- Tillgänglig för … (från); NULL = "Ej specificerad"
  available_to                date,               -- Tillgänglig för … (till); NULL = "Alltid"
  predecessor_id              uuid REFERENCES cfharvest.work_order(id) ON DELETE SET NULL,  -- Föreg. arbetsorder
  region                      text,               -- Beställningar area tree level 1 (client.regions) [M78–82]
  area                        text,               -- Område
  route_sequence_no           integer,            -- app routeOrder (global Löpnr. ordering) [DEMO]
  external_ref                text,               -- id in the client's forest system (Skogssystem) [DEMO]

  -- Övrig info [V6-1:29] -------------------------------------------------------------------------
  info_to_contractor          text CHECK (info_to_contractor IS NULL OR length(info_to_contractor) <= 1000),  -- Information till Entreprenör
  forest_system_description   text,               -- Beskrivning av åtgärd (Skogssystem), read-only import
  info_to_client              text CHECK (info_to_client IS NULL OR length(info_to_client) <= 1000),          -- Information till Uppdragsgivare

  -- Sortiment header [V6-1:45] -------------------------------------------------------------------
  dry_class                   text,               -- Torrklass
  grot_moisture_pct           numeric(5,2) CHECK (grot_moisture_pct IS NULL OR grot_moisture_pct BETWEEN 0 AND 100), -- Fuktprocent i grot
  retained_trees_description  text,               -- Längd och beskrivning av träd som blir kvar hos skogsägaren
  retained_trees              text,               -- Träd som blir kvar hos skogsägaren
  bucking_tables              text[] NOT NULL DEFAULT '{}',   -- Fördelningstabeller (names)
  species_mix                 jsonb NOT NULL DEFAULT '[]'::jsonb,
                              -- Trädslag · Trädslagskvalité · Trädslagsvolym rows: [{species, quality, volume_m3}]

  -- Spatial (GeoJSON, jsonb) ---------------------------------------------------------------------
  geometry                    jsonb,              -- stand boundary: GeoJSON Polygon | MultiPolygon
  map_symbols                 jsonb NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}'::jsonb,
                              -- planner drawing layer: GeoJSON FeatureCollection (machine routes, points,
                              -- route sequence, PLAN §3). Hänsyn objects live in cfharvest.map_symbol.
  demo_facts                  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- game-only facts (stand id, terrain, survey %) [DEMO]

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_no_uq UNIQUE (tenant_id, order_no),
  CONSTRAINT work_order_available_ck CHECK (available_from IS NULL OR available_to IS NULL OR available_from <= available_to),
  CONSTRAINT work_order_permitted_ck CHECK (permitted_from IS NULL OR permitted_to IS NULL OR permitted_from <= permitted_to),
  CONSTRAINT work_order_not_own_predecessor CHECK (predecessor_id IS NULL OR predecessor_id <> id),
  CONSTRAINT work_order_geometry_ck CHECK (geometry IS NULL OR geometry ->> 'type' IN ('Polygon', 'MultiPolygon')),
  CONSTRAINT work_order_map_symbols_ck CHECK (map_symbols ->> 'type' = 'FeatureCollection'),
  CONSTRAINT work_order_species_mix_ck CHECK (jsonb_typeof(species_mix) = 'array')
);

-- Statusändringar tab [M73]. Filled automatically by trigger work_order_status_audit.
CREATE TABLE IF NOT EXISTS cfharvest.work_order_status_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  from_status    cfharvest.work_order_status,          -- NULL on creation
  to_status      cfharvest.work_order_status NOT NULL,
  status_text    text NOT NULL,                        -- long product text at the time of change
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid REFERENCES cfharvest.app_user(id) ON DELETE SET NULL,
  source         text NOT NULL DEFAULT 'system',       -- 'planner' | 'machine' (HPR/FPR) | 'import' | 'system'
  note           text
);

-- Sortiment table [V6-1:45]: one row per Mottagningsplats × Sortiment on the order.
-- Prices are NOT stored here (they belong to contract / order_line).
CREATE TABLE IF NOT EXISTS cfharvest.assortment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id       uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  receiving_place_id  uuid NOT NULL REFERENCES cfharvest.receiving_place(id) ON DELETE NO ACTION,  -- Mottagningsplats
  sortiment_code      text NOT NULL,       -- Sortiment code ("0110", "1000"; replica SAG / IND / ABW)
  sortiment_name      text NOT NULL,       -- "Talltimmer", "Barrmav" (replica Sägeholz / Industrieholz / Abgewertet)
  sort_group          text,                -- Sort.grupp ("Barrmassaved"; replica Stammholz / Industrieholz)
  species_group       text,                -- species group for PIN/SPI (approx.)
  volume_category     cfharvest.volume_category NOT NULL DEFAULT 'under_bark',  -- Volymkategori
  planned_m3          numeric(12,2) NOT NULL DEFAULT 0 CHECK (planned_m3 >= 0),  -- På arbetsordern (m³), editable
  nominal_length_m    numeric(4,2),        -- saw-log length from the grade spec (game "5,1") → PIN (approx.)
  pin_version         integer CHECK (pin_version IS NULL OR pin_version >= 0),
  pin_file_name       text,                -- "05800_kinnared 746_GRAN_891750" [M53]; NULL = no PIN → "Några sortiment saknar PIN-filer"
  pin_removed         boolean NOT NULL DEFAULT false,  -- app pinRemoved toggle (PIN taken out in the Sortiment tab) [DEMO]
  measurement_method  text,                -- Mätmetod ("Fabriksmätning")
  measurement_place   text,                -- Mätplats ("Industrimätning")
  is_starred          boolean NOT NULL DEFAULT false,  -- row action ★ [V6-1:45] (meaning not observed)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assortment_uq UNIQUE (work_order_id, receiving_place_id, sortiment_code)
);

-- Avlägg (landing / Polterplatz) [M73][MM]: icon on the order map; target of forwarding (FOI/FDI).
CREATE TABLE IF NOT EXISTS cfharvest.landing (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  code           text NOT NULL,          -- P-A01, P-A01-2 …
  name           text NOT NULL,
  point          jsonb NOT NULL,         -- GeoJSON Point
  road_access    text,                   -- truck access note [DEMO]
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_code_uq UNIQUE (tenant_id, code),
  CONSTRAINT landing_point_ck CHECK (point ->> 'type' = 'Point')
);

-- Hänsyn (environmental / cultural considerations) shown on the order map and sent with the OIN.
-- The game's BIO-01..03 restrictions. [MW][DEMO for exact fields]
CREATE TABLE IF NOT EXISTS cfharvest.map_symbol (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  code           text NOT NULL,          -- BIO-01
  category       text NOT NULL DEFAULT 'hansyn',  -- 'hansyn' | 'biodiversity' | 'cultural' | 'hazard' | 'other'
  title          text NOT NULL,
  status         text,
  location       text,
  instruction    text,                   -- → OIN environmental restriction text (approx.)
  restriction    text,
  geometry       jsonb NOT NULL,         -- GeoJSON Point | Polygon
  radius         numeric(10,2),          -- buffer for Point symbols, in geometry units (game image units in the demo)
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_symbol_uq UNIQUE (work_order_id, code),
  CONSTRAINT map_symbol_geometry_ck CHECK (geometry ? 'type')
);

-- Kontaktuppgifter [V6-2:01]: Namn · Befattning · Adress / Avlägg · Telefon · E-post · Språk · Meddelanden.
CREATE TABLE IF NOT EXISTS cfharvest.contact (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id      uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  role               cfharvest.contact_role NOT NULL,   -- group Skogsägare / Uppdragsgivare
  name               text NOT NULL,
  position           text,               -- Befattning ("Inköpare")
  address            text,               -- Adress / Avlägg
  phone              text,
  email              text,
  language           text,               -- Språk
  receives_messages  boolean NOT NULL DEFAULT false,  -- Meddelanden
  sort_order         smallint NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================================================
-- Planning: assignments (calendar bars) and generated instruction files
-- =====================================================================================================

-- One calendar bar: a work order planned on a single resource OR a team/chain [M52][M59][M60].
-- Several assignments per work order are allowed (Kopiera: forwarder working for several harvesters [MW]).
CREATE TABLE IF NOT EXISTS cfharvest.assignment (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id          uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  resource_id            uuid REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  team_id                uuid REFERENCES cfharvest.team(id) ON DELETE CASCADE,
  sequence_no            integer,                 -- Löpnr. on that resource's route ("Ange ordningsnummer") [M48]
  start_at               timestamptz NOT NULL,    -- Startdatum (+ hh:mm; default 09:00) [M72]
  end_at                 timestamptz NOT NULL,    -- Beräknad sluttidpunkt (when computed/manual hours are consumed)
  locked_dates           boolean NOT NULL DEFAULT false,  -- "Lås start- och slutdatumen" [M60]
  manual_hours           numeric(8,2) CHECK (manual_hours IS NULL OR manual_hours > 0),  -- Manuell arbetstid [M72]
  computed_hours         numeric(8,2) CHECK (computed_hours IS NULL OR computed_hours >= 0), -- Uppskattad arbetstid (Σ m³ ÷ m³/h)
  app_start_hour         numeric(10,3),           -- replica working-hour offset from CFHModel.CALENDAR_START [DEMO]
  status                 cfharvest.assignment_status NOT NULL DEFAULT 'planned',
  sent_at                timestamptz,             -- Skicka [M53]; list ➦ icon [M40]
  sent_version           integer,                 -- PIN/handover version at send time (model.js sentVersion) [DEMO game]
  sent_round             integer,                 -- game shift at send time (model.js sentRound) [DEMO game]
  pre_notification       boolean NOT NULL DEFAULT false,  -- "Förhandsanmälan" checkbox in Skicka [M53]
  copy_of_assignment_id  uuid REFERENCES cfharvest.assignment(id) ON DELETE SET NULL,  -- Kopiera [M60]
  created_by             uuid REFERENCES cfharvest.app_user(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_target_ck CHECK (num_nonnulls(resource_id, team_id) = 1),
  CONSTRAINT assignment_period_ck CHECK (start_at <= end_at),
  CONSTRAINT assignment_not_own_copy CHECK (copy_of_assignment_id IS NULL OR copy_of_assignment_id <> id),
  CONSTRAINT assignment_sent_ck CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);

-- Outbound StanForD files produced by Skicka (OIN + PIN for harvesters, FOI + FDI for forwarders) [SS][VS].
CREATE TABLE IF NOT EXISTS cfharvest.instruction_file (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  work_order_id  uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  assignment_id  uuid REFERENCES cfharvest.assignment(id) ON DELETE SET NULL,
  resource_id    uuid REFERENCES cfharvest.resource(id) ON DELETE SET NULL,     -- receiving machine
  assortment_id  uuid REFERENCES cfharvest.assortment(id) ON DELETE SET NULL,   -- PIN only
  kind           cfharvest.instruction_kind NOT NULL,
  version        integer NOT NULL DEFAULT 1,
  file_name      text,
  payload        jsonb NOT NULL,          -- demo JSON shape (model.js toOIN/toPIN/toFOI/toFDI); real = StanForD XML
  sent_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instruction_pin_ck CHECK (kind <> 'PIN' OR assortment_id IS NOT NULL)
);

-- =====================================================================================================
-- Production (inbound HPR / FPR / HQC …) and deliveries
-- =====================================================================================================

-- One received machine message (Integrationslogg). payload keeps the parsed message.
CREATE TABLE IF NOT EXISTS cfharvest.production_message (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  kind             cfharvest.production_kind NOT NULL,
  resource_id      uuid REFERENCES cfharvest.resource(id) ON DELETE SET NULL,     -- NULL e.g. for opening stock
  work_order_id    uuid REFERENCES cfharvest.work_order(id) ON DELETE SET NULL,   -- NULL until matched (unknown ObjectKey)
  received_at      timestamptz NOT NULL DEFAULT now(),
  reported_from    timestamptz,         -- production period covered (approx.)
  reported_to      timestamptz,
  file_name        text,
  is_opening_stock boolean NOT NULL DEFAULT false,  -- volume felled before this planning period [DEMO game: Talgrund 80 m³]
  game_round       integer,                         -- game shift [DEMO game]
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Volumes per assortment carried by a message: HPR → felled (and downgraded), FPR → forwarded.
CREATE TABLE IF NOT EXISTS cfharvest.production_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES cfharvest.production_message(id) ON DELETE CASCADE,
  assortment_id   uuid NOT NULL REFERENCES cfharvest.assortment(id) ON DELETE NO ACTION,
  felled_m3       numeric(12,3) NOT NULL DEFAULT 0 CHECK (felled_m3 >= 0),
  forwarded_m3    numeric(12,3) NOT NULL DEFAULT 0 CHECK (forwarded_m3 >= 0),
  downgraded_m3   numeric(12,3) NOT NULL DEFAULT 0 CHECK (downgraded_m3 >= 0),  -- potential saw logs cut to a lower grade
  stem_count      integer CHECK (stem_count IS NULL OR stem_count >= 0),        -- HPR stems (approx.)
  log_count       integer CHECK (log_count IS NULL OR log_count >= 0),
  landing_id      uuid REFERENCES cfharvest.landing(id) ON DELETE SET NULL      -- FPR unloading landing (approx.)
);

-- Truck deliveries from a landing to a receiving place (game: Abfuhr loads LS-001 …) [DEMO].
-- Needed to keep forest stock, roadside stock and delivered volume apart (AGENTS.md).
CREATE TABLE IF NOT EXISTS cfharvest.delivery (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  delivery_no         text NOT NULL,      -- LS-001
  work_order_id       uuid NOT NULL REFERENCES cfharvest.work_order(id) ON DELETE CASCADE,
  assortment_id       uuid NOT NULL REFERENCES cfharvest.assortment(id) ON DELETE NO ACTION,
  landing_id          uuid REFERENCES cfharvest.landing(id) ON DELETE SET NULL,
  receiving_place_id  uuid REFERENCES cfharvest.receiving_place(id) ON DELETE SET NULL,
  truck_resource_id   uuid REFERENCES cfharvest.resource(id) ON DELETE SET NULL,
  volume_m3           numeric(10,2) NOT NULL CHECK (volume_m3 >= 0),
  delivered_at        timestamptz NOT NULL DEFAULT now(),
  status              text NOT NULL DEFAULT 'Angeliefert',
  CONSTRAINT delivery_no_uq UNIQUE (tenant_id, delivery_no)
);

-- =====================================================================================================
-- Beställningar (order book) [M78–M82]
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS cfharvest.order_book (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  book_no             text NOT NULL,             -- list column ID
  client_id           uuid NOT NULL REFERENCES cfharvest.client(id) ON DELETE NO ACTION,  -- Uppdragsgivare
  contract_id         uuid REFERENCES cfharvest.contract(id) ON DELETE SET NULL,          -- [DEMO] link used by the replica
  name                text,
  region              text,                      -- Region ("55 - Syd"); NULL = all
  area                text,                      -- Område; NULL = all
  period_from         date,                      -- Period
  period_to           date,
  operation_class     cfharvest.operation_class NOT NULL DEFAULT 'drivning',  -- Skoglig Service | Drivning
  status              cfharvest.order_book_status NOT NULL DEFAULT 'draft',
  followup_basis      cfharvest.followup_basis NOT NULL DEFAULT 'harvester', -- Uppföljning mot: Skördare | Skotare
  message_to_client   text,                      -- "Medd. till uppdragsgivare"
  confirmed_at        timestamptz,               -- Bekräfta
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_book_no_uq UNIQUE (tenant_id, book_no),
  CONSTRAINT order_book_period_ck CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to)
);

-- Order detail rows: Entreprenör · Mottagningsplats · Sort.grupp · Sortiment · Startdatum · Slutdatum ·
-- Plan m³ · Avtalad Volym m³ · Nedre/Övre larmgräns · Kommentar. Planerad/Skördat/Skotat/Arbetsorder m³
-- are derived (v_order_book_followup).
CREATE TABLE IF NOT EXISTS cfharvest.order_line (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  order_book_id       uuid NOT NULL REFERENCES cfharvest.order_book(id) ON DELETE CASCADE,
  contractor          text,                      -- Entreprenör (free text; the tenant itself when NULL)
  receiving_place_id  uuid NOT NULL REFERENCES cfharvest.receiving_place(id) ON DELETE NO ACTION,
  sort_group          text,
  sortiment_code      text NOT NULL,
  sortiment_name      text,
  start_date          date,
  end_date            date,
  plan_m3             numeric(12,2) NOT NULL DEFAULT 0 CHECK (plan_m3 >= 0),     -- Plan m³ / "Beställning m3"
  agreed_m3           numeric(12,2) CHECK (agreed_m3 IS NULL OR agreed_m3 >= 0), -- Avtalad Volym m³
  price_eur_per_m3    numeric(10,2) CHECK (price_eur_per_m3 IS NULL OR price_eur_per_m3 >= 0),  -- [DEMO game]
  lower_alarm_pct     numeric(6,2) NOT NULL DEFAULT 90  CHECK (lower_alarm_pct BETWEEN 0 AND 1000),  -- Nedre larmgräns
  upper_alarm_pct     numeric(6,2) NOT NULL DEFAULT 110 CHECK (upper_alarm_pct BETWEEN 0 AND 1000),  -- Övre larmgräns
  comment             text,                      -- Kommentar
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_line_uq UNIQUE (order_book_id, receiving_place_id, sortiment_code),
  CONSTRAINT order_line_period_ck CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  CONSTRAINT order_line_alarm_ck CHECK (lower_alarm_pct <= upper_alarm_pct)
);

-- =====================================================================================================
-- Meddelanden (messages) [M8][M72 ✉ Skicka meddelande][M75]
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS cfharvest.message (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  sender_user_id      uuid REFERENCES cfharvest.app_user(id) ON DELETE SET NULL,
  sender_resource_id  uuid REFERENCES cfharvest.resource(id) ON DELETE SET NULL,  -- message from a machine
  work_order_id       uuid REFERENCES cfharvest.work_order(id) ON DELETE SET NULL,
  order_book_id       uuid REFERENCES cfharvest.order_book(id) ON DELETE SET NULL, -- "Medd. till uppdragsgivare"
  subject             text,
  body                text NOT NULL CHECK (length(body) <= 4000),
  sent_at             timestamptz NOT NULL DEFAULT now(),
  game_round          integer                -- [DEMO game]
);

CREATE TABLE IF NOT EXISTS cfharvest.message_recipient (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES cfharvest.company(id) ON DELETE CASCADE,
  message_id             uuid NOT NULL REFERENCES cfharvest.message(id) ON DELETE CASCADE,
  recipient_user_id      uuid REFERENCES cfharvest.app_user(id) ON DELETE CASCADE,
  recipient_resource_id  uuid REFERENCES cfharvest.resource(id) ON DELETE CASCADE,
  recipient_team_id      uuid REFERENCES cfharvest.team(id) ON DELETE CASCADE,
  recipient_client_id    uuid REFERENCES cfharvest.client(id) ON DELETE CASCADE,
  read_at                timestamptz,
  CONSTRAINT message_recipient_one_ck CHECK (
    num_nonnulls(recipient_user_id, recipient_resource_id, recipient_team_id, recipient_client_id) = 1)
);

-- =====================================================================================================
-- Indexes: foreign keys and (tenant_id, status)
-- =====================================================================================================
CREATE INDEX IF NOT EXISTS role_tenant_ix                 ON cfharvest.role (tenant_id);
CREATE INDEX IF NOT EXISTS app_user_tenant_ix             ON cfharvest.app_user (tenant_id);
CREATE INDEX IF NOT EXISTS app_user_resource_ix           ON cfharvest.app_user (resource_id);
CREATE INDEX IF NOT EXISTS app_user_role_role_ix          ON cfharvest.app_user_role (role_id);
CREATE INDEX IF NOT EXISTS client_tenant_ix               ON cfharvest.client (tenant_id);
CREATE INDEX IF NOT EXISTS contract_client_ix             ON cfharvest.contract (client_id);
CREATE INDEX IF NOT EXISTS contract_op_type_op_ix         ON cfharvest.contract_operation_type (operation_type_id);
CREATE INDEX IF NOT EXISTS resource_tenant_type_ix        ON cfharvest.resource (tenant_id, type) WHERE active;
CREATE INDEX IF NOT EXISTS rate_op_type_ix                ON cfharvest.resource_production_rate (operation_type_id);
CREATE INDEX IF NOT EXISTS calendar_override_day_ix       ON cfharvest.calendar_override (tenant_id, day);
CREATE INDEX IF NOT EXISTS team_member_resource_ix        ON cfharvest.team_member (resource_id);
CREATE INDEX IF NOT EXISTS work_order_tenant_status_ix    ON cfharvest.work_order (tenant_id, status);
CREATE INDEX IF NOT EXISTS work_order_client_ix           ON cfharvest.work_order (client_id);
CREATE INDEX IF NOT EXISTS work_order_contract_ix         ON cfharvest.work_order (contract_id);
CREATE INDEX IF NOT EXISTS work_order_op_type_ix          ON cfharvest.work_order (operation_type_id);
CREATE INDEX IF NOT EXISTS work_order_predecessor_ix      ON cfharvest.work_order (predecessor_id);
CREATE INDEX IF NOT EXISTS wo_status_history_order_ix     ON cfharvest.work_order_status_history (work_order_id, changed_at);
CREATE INDEX IF NOT EXISTS assortment_order_ix            ON cfharvest.assortment (work_order_id);
CREATE INDEX IF NOT EXISTS assortment_place_code_ix       ON cfharvest.assortment (tenant_id, receiving_place_id, sortiment_code);
CREATE INDEX IF NOT EXISTS landing_order_ix               ON cfharvest.landing (work_order_id);
CREATE INDEX IF NOT EXISTS map_symbol_order_ix            ON cfharvest.map_symbol (work_order_id);
CREATE INDEX IF NOT EXISTS contact_order_ix               ON cfharvest.contact (work_order_id);
CREATE INDEX IF NOT EXISTS assignment_order_ix            ON cfharvest.assignment (work_order_id);
CREATE INDEX IF NOT EXISTS assignment_resource_ix         ON cfharvest.assignment (resource_id, start_at) WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignment_team_ix             ON cfharvest.assignment (team_id, start_at) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignment_tenant_status_ix    ON cfharvest.assignment (tenant_id, status);
CREATE INDEX IF NOT EXISTS assignment_copy_ix             ON cfharvest.assignment (copy_of_assignment_id);
CREATE INDEX IF NOT EXISTS instruction_file_order_ix      ON cfharvest.instruction_file (work_order_id, kind);
CREATE INDEX IF NOT EXISTS instruction_file_assignment_ix ON cfharvest.instruction_file (assignment_id);
CREATE INDEX IF NOT EXISTS prod_msg_order_ix              ON cfharvest.production_message (work_order_id, kind);
CREATE INDEX IF NOT EXISTS prod_msg_resource_ix           ON cfharvest.production_message (resource_id, received_at);
CREATE INDEX IF NOT EXISTS prod_msg_tenant_ix             ON cfharvest.production_message (tenant_id, received_at);
CREATE INDEX IF NOT EXISTS prod_line_message_ix           ON cfharvest.production_line (message_id);
CREATE INDEX IF NOT EXISTS prod_line_assortment_ix        ON cfharvest.production_line (assortment_id);
CREATE INDEX IF NOT EXISTS delivery_order_ix              ON cfharvest.delivery (work_order_id);
CREATE INDEX IF NOT EXISTS delivery_assortment_ix         ON cfharvest.delivery (assortment_id);
CREATE INDEX IF NOT EXISTS order_book_tenant_status_ix    ON cfharvest.order_book (tenant_id, status);
CREATE INDEX IF NOT EXISTS order_book_client_ix           ON cfharvest.order_book (client_id);
CREATE INDEX IF NOT EXISTS order_line_book_ix             ON cfharvest.order_line (order_book_id);
CREATE INDEX IF NOT EXISTS order_line_place_code_ix       ON cfharvest.order_line (receiving_place_id, sortiment_code);
CREATE INDEX IF NOT EXISTS message_order_ix               ON cfharvest.message (work_order_id);
CREATE INDEX IF NOT EXISTS message_tenant_sent_ix         ON cfharvest.message (tenant_id, sent_at);
CREATE INDEX IF NOT EXISTS message_recipient_msg_ix       ON cfharvest.message_recipient (message_id);
CREATE INDEX IF NOT EXISTS message_recipient_user_ix      ON cfharvest.message_recipient (recipient_user_id) WHERE recipient_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_recipient_res_ix       ON cfharvest.message_recipient (recipient_resource_id) WHERE recipient_resource_id IS NOT NULL;

-- =====================================================================================================
-- Triggers
-- =====================================================================================================

-- Statusändringar: every status change (and the creation) of a work order is logged with the long text.
-- Callers may set `SET LOCAL cfharvest.user_id = '<uuid>'` and `SET LOCAL cfharvest.change_source = 'planner'`.
CREATE OR REPLACE FUNCTION cfharvest.log_work_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user   uuid := nullif(current_setting('cfharvest.user_id', true), '')::uuid;
  v_source text := coalesce(nullif(current_setting('cfharvest.change_source', true), ''), 'system');
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO cfharvest.work_order_status_history
      (tenant_id, work_order_id, from_status, to_status, status_text, changed_by, source)
    VALUES
      (NEW.tenant_id, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
       cfharvest.status_title(NEW.status, 'sv'), v_user, v_source);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE TRIGGER work_order_status_audit
  AFTER INSERT OR UPDATE OF status ON cfharvest.work_order
  FOR EACH ROW EXECUTE FUNCTION cfharvest.log_work_order_status();

-- updated_at maintenance for every table that has the column.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'cfharvest' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON cfharvest.%I
                    FOR EACH ROW EXECUTE FUNCTION cfharvest.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END
$$;

-- =====================================================================================================
-- Views
-- =====================================================================================================

-- Production follow-up per work order × assortment (Sortiment tab columns Skördare / Skotare / Skogslager
-- [V6-1:45]; Resurser view; game receipt). Timber conservation:
--   forest_stock = felled − forwarded   (felled, lying in the stand)
--   roadside     = forwarded − delivered (at the landing)
CREATE OR REPLACE VIEW cfharvest.v_production_followup AS
WITH prod AS (
  SELECT pl.assortment_id,
         sum(pl.felled_m3)     FILTER (WHERE pm.kind = 'HPR') AS felled_m3,
         sum(pl.downgraded_m3) FILTER (WHERE pm.kind = 'HPR') AS downgraded_m3,
         sum(pl.forwarded_m3)  FILTER (WHERE pm.kind = 'FPR') AS forwarded_m3,
         max(pm.received_at)                                   AS last_report_at
  FROM cfharvest.production_line pl
  JOIN cfharvest.production_message pm ON pm.id = pl.message_id
  GROUP BY pl.assortment_id
), deliv AS (
  SELECT d.assortment_id, sum(d.volume_m3) AS delivered_m3
  FROM cfharvest.delivery d
  GROUP BY d.assortment_id
)
SELECT a.tenant_id,
       wo.id                                   AS work_order_id,
       wo.order_no,
       wo.name                                 AS work_order_name,
       wo.status,
       a.id                                    AS assortment_id,
       a.sortiment_code,
       a.sortiment_name,
       a.sort_group,
       a.receiving_place_id,
       a.planned_m3,
       coalesce(p.felled_m3, 0)                                        AS felled_m3,
       coalesce(p.forwarded_m3, 0)                                     AS forwarded_m3,
       coalesce(p.downgraded_m3, 0)                                    AS downgraded_m3,
       coalesce(p.felled_m3, 0) - coalesce(p.forwarded_m3, 0)          AS forest_stock_m3,
       coalesce(p.forwarded_m3, 0) - coalesce(dl.delivered_m3, 0)      AS roadside_m3,
       coalesce(dl.delivered_m3, 0)                                    AS delivered_m3,
       p.last_report_at
FROM cfharvest.assortment a
JOIN cfharvest.work_order wo ON wo.id = a.work_order_id
LEFT JOIN prod  p  ON p.assortment_id  = a.id
LEFT JOIN deliv dl ON dl.assortment_id = a.id;

-- Beställning follow-up per order line [M78–M82]: Beställning · Avtalad · Skördat · Skotat · Diff · Planerad ·
-- Arbetsorder. Work orders contribute when client, receiving place and sortiment match and (if set on the
-- book) region, area and contract match. "planned" = assortments of work orders with an active assignment
-- that are not completed (same rule as model.js viewModel orderBook.planned).
CREATE OR REPLACE VIEW cfharvest.v_order_book_followup AS
WITH matched AS (
  SELECT ol.id AS order_line_id, wo.id AS work_order_id, wo.order_no, wo.status,
         pf.planned_m3, pf.felled_m3, pf.forwarded_m3, pf.delivered_m3,
         EXISTS (SELECT 1 FROM cfharvest.assignment asg
                 WHERE asg.work_order_id = wo.id AND asg.status <> 'cancelled') AS has_assignment
  FROM cfharvest.order_line ol
  JOIN cfharvest.order_book ob ON ob.id = ol.order_book_id
  JOIN cfharvest.v_production_followup pf
       ON pf.tenant_id = ol.tenant_id
      AND pf.receiving_place_id = ol.receiving_place_id
      AND pf.sortiment_code = ol.sortiment_code
  JOIN cfharvest.work_order wo ON wo.id = pf.work_order_id
  WHERE wo.client_id = ob.client_id
    AND (ob.region      IS NULL OR wo.region      = ob.region)
    AND (ob.area        IS NULL OR wo.area        = ob.area)
    AND (ob.contract_id IS NULL OR wo.contract_id = ob.contract_id)
), agg AS (
  SELECT order_line_id,
         sum(felled_m3)    AS felled_m3,
         sum(forwarded_m3) AS forwarded_m3,
         sum(delivered_m3) AS delivered_m3,
         sum(planned_m3) FILTER (WHERE has_assignment AND status <> 'completed') AS planned_m3,
         sum(planned_m3)   AS work_order_m3,
         count(DISTINCT work_order_id)                    AS work_order_count,
         array_agg(DISTINCT order_no ORDER BY order_no)   AS work_orders
  FROM matched
  GROUP BY order_line_id
)
SELECT ol.tenant_id,
       ob.id                              AS order_book_id,
       ob.book_no,
       ob.status                          AS order_book_status,
       ob.followup_basis,
       ol.id                              AS order_line_id,
       ol.receiving_place_id,
       rp.name                            AS receiving_place,
       ol.sort_group,
       ol.sortiment_code,
       ol.sortiment_name,
       ol.plan_m3                         AS ordered_m3,
       ol.agreed_m3,
       coalesce(g.felled_m3, 0)           AS felled_m3,
       coalesce(g.felled_m3, 0) - ol.plan_m3                                         AS felled_diff_m3,
       round(100 * coalesce(g.felled_m3, 0) / nullif(ol.plan_m3, 0), 1)              AS felled_pct,
       coalesce(g.forwarded_m3, 0)        AS forwarded_m3,
       coalesce(g.forwarded_m3, 0) - ol.plan_m3                                      AS forwarded_diff_m3,
       round(100 * coalesce(g.forwarded_m3, 0) / nullif(ol.plan_m3, 0), 1)           AS forwarded_pct,
       coalesce(g.delivered_m3, 0)        AS delivered_m3,   -- not a product column; the game settles on delivered volume
       coalesce(g.planned_m3, 0)          AS planned_m3,
       coalesce(g.work_order_m3, 0)       AS work_order_m3,
       coalesce(g.work_order_count, 0)    AS work_order_count,
       coalesce(g.work_orders, '{}')      AS work_orders,
       ol.lower_alarm_pct,
       ol.upper_alarm_pct,
       -- alarm against the chosen follow-up basis (Skördare | Skotare); NULL when nothing is ordered
       CASE WHEN ol.plan_m3 = 0 THEN NULL
            ELSE 100 * (CASE ob.followup_basis WHEN 'harvester' THEN coalesce(g.felled_m3, 0)
                                               ELSE coalesce(g.forwarded_m3, 0) END) / ol.plan_m3
                 NOT BETWEEN ol.lower_alarm_pct AND ol.upper_alarm_pct
       END                                AS outside_alarm_limits,
       ol.price_eur_per_m3,
       ol.comment
FROM cfharvest.order_line ol
JOIN cfharvest.order_book ob ON ob.id = ol.order_book_id
JOIN cfharvest.receiving_place rp ON rp.id = ol.receiving_place_id
LEFT JOIN agg g ON g.order_line_id = ol.id;

-- =====================================================================================================
-- RLS readiness check (no-op today). Lists every cfharvest table lacking tenant_id; must return nothing.
-- To switch RLS on, loop over the same list and run the ALTER/CREATE POLICY from the header.
-- =====================================================================================================
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t.table_name, ', ') INTO missing
  FROM information_schema.tables t
  WHERE t.table_schema = 'cfharvest' AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name
                      AND c.column_name = 'tenant_id');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'cfharvest tables without tenant_id: %', missing;
  END IF;
END
$$;
