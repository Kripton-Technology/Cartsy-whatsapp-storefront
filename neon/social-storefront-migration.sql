-- Migration: Social Media Storefront Core (Phase 1)
-- Stores table extensions
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS delivery_settings jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS quiet_hours jsonb DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00"}',
ADD COLUMN IF NOT EXISTS slug_changed_at timestamptz,
ADD COLUMN IF NOT EXISTS institution_id uuid,
ADD COLUMN IF NOT EXISTS cohort_id uuid,
ADD COLUMN IF NOT EXISTS is_closed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS closed_message text DEFAULT '';

-- Social platforms ticked by store
CREATE TABLE IF NOT EXISTS store_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_platforms_store_platform_unique UNIQUE (store_id, platform)
);

CREATE INDEX IF NOT EXISTS store_platforms_store_id_idx ON store_platforms(store_id);

-- Product table extensions (up to 4 photos, options, lead times)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS lead_time_days integer DEFAULT 0;

-- Orders table (compact order backups, < 1 KB target)
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
);

CREATE INDEX IF NOT EXISTS orders_store_id_idx ON orders(store_id);
CREATE INDEX IF NOT EXISTS orders_store_status_idx ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_public_token_idx ON orders(public_token);

-- Order status audit events
CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events(order_id);

-- Web push subscriptions for sellers
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_store_id_idx ON push_subscriptions(store_id);

-- Daily counters per store, day and source (keeps storage tiny, AN-4)
CREATE TABLE IF NOT EXISTS daily_stats (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'direct',
  visits integer NOT NULL DEFAULT 0,
  cart_adds integer NOT NULL DEFAULT 0,
  orders_started integer NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, date, source)
);

CREATE INDEX IF NOT EXISTS daily_stats_store_date_idx ON daily_stats(store_id, date);
