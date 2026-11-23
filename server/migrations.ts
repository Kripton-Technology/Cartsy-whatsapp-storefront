import { query } from './db.js';

export async function runMigrations() {
  console.log('[Migrations] Running schema migrations...');

  try {
    // 1. Stores extensions
    await query(`
      ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS delivery_settings jsonb DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS quiet_hours jsonb DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00"}',
      ADD COLUMN IF NOT EXISTS slug_changed_at timestamptz,
      ADD COLUMN IF NOT EXISTS institution_id uuid,
      ADD COLUMN IF NOT EXISTS cohort_id uuid,
      ADD COLUMN IF NOT EXISTS is_closed boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS closed_message text DEFAULT '',
      ADD COLUMN IF NOT EXISTS paystack_transaction_reference text,
      ADD COLUMN IF NOT EXISTS on_hold boolean DEFAULT false
    `);

    // 2. Store platforms table
    await query(`
      CREATE TABLE IF NOT EXISTS store_platforms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        platform text NOT NULL,
        handle text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT store_platforms_store_platform_unique UNIQUE (store_id, platform)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS store_platforms_store_id_idx ON store_platforms(store_id)`);

    // 3. Products extensions
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 0
    `);

    // 4. Orders table
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number text NOT NULL,
        public_token text NOT NULL UNIQUE,
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        customer_name text NOT NULL,
        customer_phone text,
        location text NOT NULL,
        items jsonb NOT NULL,
        delivery_fee numeric(10, 2) NOT NULL DEFAULT 0,
        total numeric(10, 2) NOT NULL,
        source text NOT NULL DEFAULT 'direct',
        status text NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Received', 'Preparing', 'Ready', 'Out for delivery', 'Completed', 'Cancelled')),
        status_updated_at timestamptz NOT NULL DEFAULT now(),
        paid boolean NOT NULL DEFAULT false,
        payment_method text,
        notes text,
        rider jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS orders_store_id_idx ON orders(store_id)`);
    await query(`CREATE INDEX IF NOT EXISTS orders_store_status_idx ON orders(store_id, status)`);
    await query(`CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS orders_public_token_idx ON orders(public_token)`);

    // 5. Order events audit
    await query(`
      CREATE TABLE IF NOT EXISTS order_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events(order_id)`);

    // 6. Push subscriptions
    await query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE,
        p256dh text NOT NULL,
        auth text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_success_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_store_id_idx ON push_subscriptions(store_id)`);

    // 7. Daily stats (counters per store, date, source - AN-4)
    await query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        date date NOT NULL DEFAULT CURRENT_DATE,
        source text NOT NULL DEFAULT 'direct',
        visits integer NOT NULL DEFAULT 0,
        cart_adds integer NOT NULL DEFAULT 0,
        orders_started integer NOT NULL DEFAULT 0,
        PRIMARY KEY (store_id, date, source)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS daily_stats_store_date_idx ON daily_stats(store_id, date)`);

    // ── Phase 2: Institution SaaS ────────────────────────────────────────────

    // 8. Institutions
    await query(`
      CREATE TABLE IF NOT EXISTS institutions (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name              text NOT NULL,
        slug              text NOT NULL UNIQUE,
        logo_url          text,
        contact_email     text,
        active            boolean NOT NULL DEFAULT true,
        revenue_split_pct numeric(5,2) NOT NULL DEFAULT 55.00,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);

    // 9. Cohorts
    await query(`
      CREATE TABLE IF NOT EXISTS cohorts (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        institution_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        name                text NOT NULL,
        year                integer NOT NULL,
        graduation_date     date,
        active              boolean NOT NULL DEFAULT true,
        access_code_prefix  text NOT NULL DEFAULT '',
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS cohorts_institution_id_idx ON cohorts(institution_id)`);

    // 10. Graduate access codes
    await query(`
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
        expires_at      timestamptz NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      ALTER TABLE graduate_access_codes
        ADD COLUMN IF NOT EXISTS graduate_name  text,
        ADD COLUMN IF NOT EXISTS graduate_phone text,
        ADD COLUMN IF NOT EXISTS graduate_email text,
        ADD COLUMN IF NOT EXISTS course         text,
        ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'issued'
    `);
    await query(`CREATE INDEX IF NOT EXISTS access_codes_cohort_id_idx ON graduate_access_codes(cohort_id)`);
    await query(`CREATE INDEX IF NOT EXISTS access_codes_code_idx ON graduate_access_codes(code)`);
    await query(`CREATE INDEX IF NOT EXISTS access_codes_store_id_idx ON graduate_access_codes(store_id)`);
    await query(`CREATE INDEX IF NOT EXISTS access_codes_status_idx ON graduate_access_codes(status)`);

    // 11. Revenue ledger
    await query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id           uuid REFERENCES stores(id) ON DELETE SET NULL,
        institution_id     uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
        access_code_id     uuid REFERENCES graduate_access_codes(id) ON DELETE SET NULL,
        amount_total       numeric(10,2) NOT NULL DEFAULT 1000.00,
        amount_cartsy      numeric(10,2) NOT NULL DEFAULT 450.00,
        amount_institution numeric(10,2) NOT NULL DEFAULT 550.00,
        status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
        period_start       date NOT NULL,
        period_end         date NOT NULL,
        paid_at            timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      ALTER TABLE ledger_entries
        ADD COLUMN IF NOT EXISTS access_code_id uuid
    `);
    await query(`CREATE INDEX IF NOT EXISTS ledger_institution_id_idx ON ledger_entries(institution_id)`);
    await query(`CREATE INDEX IF NOT EXISTS ledger_store_id_idx ON ledger_entries(store_id)`);
    await query(`CREATE INDEX IF NOT EXISTS ledger_status_idx ON ledger_entries(status)`);

    // 12. Sponsorship columns on stores
    await query(`
      ALTER TABLE stores
        ADD COLUMN IF NOT EXISTS is_sponsored         boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS sponsored_expires_at timestamptz
    `);

    console.log('[Migrations] All migrations verified successfully.');
  } catch (error) {
    console.error('[Migrations] Migration failed:', error);
  }
}
