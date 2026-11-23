-- ============================================================
-- Cartsy Phase 2: Institution SaaS Migration
-- Run once in your Neon SQL editor (or let runMigrations() auto-apply)
-- ============================================================

-- 1. Institutions
CREATE TABLE IF NOT EXISTS institutions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  logo_url        text,
  contact_email   text,
  active          boolean NOT NULL DEFAULT true,
  revenue_split_pct numeric(5,2) NOT NULL DEFAULT 55.00,  -- institution's share
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Cohorts (graduating classes per institution)
CREATE TABLE IF NOT EXISTS cohorts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name                text NOT NULL,          -- e.g. "2025 Cohort"
  year                integer NOT NULL,
  graduation_date     date,
  active              boolean NOT NULL DEFAULT true,
  access_code_prefix  text NOT NULL DEFAULT '',  -- optional prefix for readability
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cohorts_institution_id_idx ON cohorts(institution_id);

-- 3. Graduate access codes
CREATE TABLE IF NOT EXISTS graduate_access_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  graduate_name   text,
  graduate_phone  text,
  graduate_email  text,
  course          text,
  status          text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','redeemed','expired','revoked')),
  store_id        uuid REFERENCES stores(id) ON DELETE SET NULL,
  claimed_at      timestamptz,
  expires_at      timestamptz NOT NULL,  -- graduation_date + 90 days
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_codes_cohort_id_idx ON graduate_access_codes(cohort_id);
CREATE INDEX IF NOT EXISTS access_codes_code_idx ON graduate_access_codes(code);
CREATE INDEX IF NOT EXISTS access_codes_store_id_idx ON graduate_access_codes(store_id);
CREATE INDEX IF NOT EXISTS access_codes_status_idx ON graduate_access_codes(status);

-- 4. Revenue ledger
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid REFERENCES stores(id) ON DELETE SET NULL,
  institution_id     uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  access_code_id     uuid REFERENCES graduate_access_codes(id) ON DELETE SET NULL,
  amount_total       numeric(10,2) NOT NULL DEFAULT 1000.00,  -- GHS 1,000
  amount_cartsy      numeric(10,2) NOT NULL DEFAULT 450.00,   -- 45%
  amount_institution numeric(10,2) NOT NULL DEFAULT 550.00, -- 55%
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  period_start       date NOT NULL,
  period_end         date NOT NULL,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_institution_id_idx ON ledger_entries(institution_id);
CREATE INDEX IF NOT EXISTS ledger_store_id_idx ON ledger_entries(store_id);
CREATE INDEX IF NOT EXISTS ledger_status_idx ON ledger_entries(status);

-- Ensure backwards-compatible columns if tables were already created
ALTER TABLE graduate_access_codes
  ADD COLUMN IF NOT EXISTS graduate_name  text,
  ADD COLUMN IF NOT EXISTS graduate_phone text,
  ADD COLUMN IF NOT EXISTS graduate_email text,
  ADD COLUMN IF NOT EXISTS course         text,
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'issued';

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS access_code_id uuid;

-- 5. Extend stores with sponsorship fields
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_sponsored        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsored_expires_at timestamptz;
