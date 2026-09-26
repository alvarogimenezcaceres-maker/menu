-- =====================================================================
-- 3D Restaurant Menu — canonical PostgreSQL 17 schema (Deliverable #7)
-- Pooled multi-tenancy: every tenant-owned row carries tenant_id + RLS.
-- Money stored in minor units (e.g. JPY/PYG 0 decimals, USD 2) + ISO currency.
-- NOTE: in the Payload implementation these tables are generated from
-- collections; this file is the reference model + RLS/Index source of truth
-- applied as a custom migration.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------- enums ----------
CREATE TYPE member_role      AS ENUM ('tenant_owner','tenant_admin','editor','viewer');
CREATE TYPE publish_status   AS ENUM ('draft','published','archived');
CREATE TYPE media_kind       AS ENUM ('image','capture_photo','model_glb','model_usdz','poster','other');
CREATE TYPE model_source     AS ENUM ('upload','photogrammetry','ai_generated');
CREATE TYPE model_status     AS ENUM ('pending','processing','ready','failed');
CREATE TYPE capture_status   AS ENUM ('uploading','queued','processing','succeeded','failed','cancelled');
CREATE TYPE job_type         AS ENUM ('reconstruct','ai_generate','optimize','poster');
CREATE TYPE sub_status       AS ENUM ('trialing','active','past_due','cancelled');
CREATE TYPE allergen         AS ENUM ('gluten','crustaceans','eggs','fish','peanuts','soy','milk',
                                      'nuts','celery','mustard','sesame','sulphites','lupin','molluscs');

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- wrapped as IMMUTABLE so it can feed a generated column (array_to_string is only STABLE)
CREATE OR REPLACE FUNCTION dish_search_doc(n text, d text, ing text[]) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('simple'::regconfig, f_unaccent(coalesce(n,''))), 'A') ||
         setweight(to_tsvector('simple'::regconfig, f_unaccent(coalesce(d,''))), 'B') ||
         setweight(to_tsvector('simple'::regconfig, f_unaccent(coalesce(array_to_string(ing,' '),''))), 'C')
$$;

-- =====================================================================
-- PLATFORM / BILLING
-- =====================================================================
CREATE TABLE plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,            -- free | pro | business
  name          text NOT NULL,
  limits        jsonb NOT NULL DEFAULT '{}',     -- {"restaurants":1,"dishes":50,"gen3dPerMonth":5,"storageGb":2,"customDomain":false}
  price_minor   bigint NOT NULL DEFAULT 0,
  currency      char(3) NOT NULL DEFAULT 'USD',
  is_public     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          citext UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9](-?[a-z0-9])*$'),
  plan_id       uuid REFERENCES plans(id),
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id            uuid NOT NULL REFERENCES plans(id),
  status             sub_status NOT NULL DEFAULT 'trialing',
  provider           text NOT NULL DEFAULT 'manual',   -- manual|stripe|mercadopago|pagopar|killbill
  provider_ref       text,
  current_period_end timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON subscriptions (tenant_id);

CREATE TABLE usage_counters (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric      text NOT NULL,                  -- gen3d | storage_bytes | menu_views
  period      date NOT NULL,                  -- first day of month
  value       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, metric, period)
);

-- =====================================================================
-- IDENTITY
-- =====================================================================
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE NOT NULL,
  name              text,
  password_hash     text,                     -- managed by Payload auth
  is_platform_admin boolean NOT NULL DEFAULT false,
  locale            text NOT NULL DEFAULT 'es',
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'editor',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX ON memberships (user_id);

-- =====================================================================
-- MEDIA (single table for every stored object)
-- =====================================================================
CREATE TABLE media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind         media_kind NOT NULL,
  bucket       text NOT NULL,
  storage_key  text NOT NULL,
  mime         text NOT NULL,
  bytes        bigint NOT NULL CHECK (bytes >= 0),
  sha256       char(64),
  width        int,
  height       int,
  alt          text,
  variants     jsonb NOT NULL DEFAULT '{}',  -- {"w400":"key", "w800":"key", "avif":...}
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_key)
);
CREATE INDEX ON media (tenant_id, kind);

-- =====================================================================
-- RESTAURANTS / MENU
-- =====================================================================
CREATE TABLE restaurants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            citext UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9](-?[a-z0-9])*$' AND length(slug) BETWEEN 2 AND 63),
  description     text,
  logo_id         uuid REFERENCES media(id) ON DELETE SET NULL,
  cover_id        uuid REFERENCES media(id) ON DELETE SET NULL,
  currency        char(3) NOT NULL DEFAULT 'USD',
  default_locale  text NOT NULL DEFAULT 'es',
  locales         text[] NOT NULL DEFAULT '{es}',
  theme           jsonb NOT NULL DEFAULT '{}',   -- {"primary":"#E11D48","font":"Inter","radius":"0.75rem","preset":"sushi-dark"}
  contact         jsonb NOT NULL DEFAULT '{}',   -- phone, whatsapp, address, geo, hours
  seo             jsonb NOT NULL DEFAULT '{}',
  status          publish_status NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX ON restaurants (tenant_id);

CREATE TABLE custom_domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  restaurant_id      uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  hostname           citext UNIQUE NOT NULL,
  verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurant_tables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label          text NOT NULL,                 -- "8", "Terraza 3"
  code           text NOT NULL,                 -- used in ?table=
  sig_secret     text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'), -- HMAC for Phase-2 orders
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

CREATE TABLE categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  slug           citext NOT NULL,
  description    text,
  cover_id       uuid REFERENCES media(id) ON DELETE SET NULL,   -- section banner photo
  i18n           jsonb NOT NULL DEFAULT '{}',   -- {"en":{"name":"Starters"}}
  position       int NOT NULL DEFAULT 0,        -- or fractional text key for Payload orderable
  is_visible     boolean NOT NULL DEFAULT true,
  available_from time,
  available_to   time,                           -- e.g. breakfast menu
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);
CREATE INDEX ON categories (restaurant_id, position);

CREATE TABLE dishes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  restaurant_id      uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id        uuid REFERENCES categories(id) ON DELETE SET NULL,
  name               text NOT NULL,
  slug               citext NOT NULL,
  description        text,
  ingredients        text[] NOT NULL DEFAULT '{}',
  allergens          allergen[] NOT NULL DEFAULT '{}',
  tags               text[] NOT NULL DEFAULT '{}',      -- vegan, spicy, chef-pick
  price_minor        bigint CHECK (price_minor >= 0),        -- NULL = price pending ("a confirmar")
  options            jsonb NOT NULL DEFAULT '[]',        -- [{"group":"Sabor","multiple":false,"choices":["Durazno","Frutilla"]}]
  compare_at_minor   bigint,
  i18n               jsonb NOT NULL DEFAULT '{}',
  plate_diameter_cm  numeric(5,1) DEFAULT 27.0,          -- real-world AR scale
  active_model_id    uuid,                                -- FK added below
  position           int NOT NULL DEFAULT 0,
  is_available       boolean NOT NULL DEFAULT true,      -- "sold out" toggle
  status             publish_status NOT NULL DEFAULT 'draft',
  search             tsvector GENERATED ALWAYS AS (dish_search_doc(name, description, ingredients)) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (restaurant_id, slug),
  CONSTRAINT published_needs_price CHECK (status <> 'published' OR price_minor IS NOT NULL)
);
CREATE INDEX ON dishes (restaurant_id, category_id, position) WHERE deleted_at IS NULL;
CREATE INDEX ON dishes USING gin (search);
CREATE INDEX ON dishes USING gin (name gin_trgm_ops);

CREATE TABLE dish_photos (
  dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media(id)  ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position   int NOT NULL DEFAULT 0,
  PRIMARY KEY (dish_id, media_id)
);

-- =====================================================================
-- 3D PIPELINE
-- =====================================================================
CREATE TABLE captures (                     -- a photo set submitted for reconstruction
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dish_id       uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  status        capture_status NOT NULL DEFAULT 'uploading',
  photo_count   int NOT NULL DEFAULT 0,
  options       jsonb NOT NULL DEFAULT '{}',  -- {"quality":"standard","removePlate":false,"targetTris":40000}
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON captures (dish_id);

CREATE TABLE capture_photos (
  capture_id  uuid NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  media_id    uuid NOT NULL REFERENCES media(id)    ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  seq         int NOT NULL,
  PRIMARY KEY (capture_id, media_id)
);

CREATE TABLE models_3d (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dish_id        uuid NOT NULL REFERENCES dishes(id)  ON DELETE CASCADE,
  capture_id     uuid REFERENCES captures(id) ON DELETE SET NULL,
  version        int NOT NULL DEFAULT 1,
  source         model_source NOT NULL,
  status         model_status NOT NULL DEFAULT 'pending',
  glb_id         uuid REFERENCES media(id) ON DELETE SET NULL,
  usdz_id        uuid REFERENCES media(id) ON DELETE SET NULL,
  poster_id      uuid REFERENCES media(id) ON DELETE SET NULL,
  triangles      int,
  glb_bytes      bigint,
  bbox_m         jsonb,                       -- {"x":0.27,"y":0.08,"z":0.27}
  viewer_opts    jsonb NOT NULL DEFAULT '{}', -- camera-orbit, exposure, env
  validation     jsonb,                       -- glTF-Validator report summary
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dish_id, version)
);
ALTER TABLE dishes ADD CONSTRAINT dishes_active_model_fk
  FOREIGN KEY (active_model_id) REFERENCES models_3d(id) ON DELETE SET NULL;

CREATE TABLE processing_jobs (              -- user-visible status; pg-boss holds the queue
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type          job_type NOT NULL,
  capture_id    uuid REFERENCES captures(id) ON DELETE CASCADE,
  model_id      uuid REFERENCES models_3d(id) ON DELETE CASCADE,
  boss_job_id   uuid,
  stage         text,                         -- sfm | mvs | mesh | texture | cleanup | optimize | upload
  progress      smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts      smallint NOT NULL DEFAULT 0,
  error         text,
  gpu_seconds   int,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON processing_jobs (tenant_id, created_at DESC);

-- =====================================================================
-- ANALYTICS / AUDIT
-- =====================================================================
CREATE TABLE menu_events (
  id             bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id      uuid NOT NULL,
  restaurant_id  uuid NOT NULL,
  dish_id        uuid,
  table_code     text,
  event          text NOT NULL,               -- menu_view | dish_open | model_view | ar_start | ar_placed | qr_scan
  session_hash   text,                        -- daily-salted, no PII
  ua_class       text,                        -- ios | android | desktop
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE menu_events_default PARTITION OF menu_events DEFAULT;
CREATE INDEX ON menu_events (restaurant_id, created_at);

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid,
  user_id     uuid,
  action      text NOT NULL,                  -- dish.update, restaurant.publish
  entity      text NOT NULL,
  entity_id   uuid,
  diff        jsonb,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_logs (tenant_id, created_at DESC);

-- ---------- updated_at triggers ----------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','restaurants','categories','dishes','captures','subscriptions'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- =====================================================================
-- ROW LEVEL SECURITY
--   app_rw      : used by Payload/web; must SET LOCAL app.tenant_id per tx
--   menu_reader : public menu reads; published rows only, all tenants
--   ops         : migrations/platform admin (BYPASSRLS)
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rw')      THEN CREATE ROLE app_rw NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='menu_reader') THEN CREATE ROLE menu_reader NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ops')         THEN CREATE ROLE ops NOLOGIN BYPASSRLS; END IF;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['restaurants','custom_domains','restaurant_tables','categories','dishes','dish_photos',
                           'media','captures','capture_photos','models_3d','processing_jobs','subscriptions',
                           'usage_counters','menu_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO app_rw USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
  END LOOP;
END $$;

-- public read policies (published only)
CREATE POLICY public_read ON restaurants TO menu_reader USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY public_read ON categories  TO menu_reader USING (is_visible AND EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_id AND r.status='published'));
CREATE POLICY public_read ON dishes      TO menu_reader USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY public_read ON dish_photos TO menu_reader USING (true);
CREATE POLICY public_read ON models_3d   TO menu_reader USING (status = 'ready');
CREATE POLICY public_read ON media       TO menu_reader USING (kind IN ('image','model_glb','model_usdz','poster'));
CREATE POLICY public_read ON custom_domains TO menu_reader USING (verified_at IS NOT NULL);
CREATE POLICY public_insert ON menu_events TO menu_reader WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO app_rw, menu_reader;
GRANT SELECT ON restaurants, categories, dishes, dish_photos, models_3d, media, custom_domains TO menu_reader;
GRANT INSERT ON menu_events TO menu_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;

-- =====================================================================
-- PHASE 2 (reserved names; each will carry tenant_id + RLS):
--   customers, customer_auth (Better Auth tables), orders, order_items,
--   payments, payment_provider_accounts, reservations, loyalty_accounts,
--   loyalty_ledger, whatsapp_threads, franchises (tenant hierarchy via
--   tenants.parent_id), webhooks, api_keys
-- =====================================================================
