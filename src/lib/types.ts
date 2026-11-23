export interface BusinessInfo {
  id: string;
  slug?: string;
  slug_changed_at?: string | null;
  owner_id?: string;
  business_name: string;
  logo_url: string | null;
  tagline: string | null;
  hero_banner_url: string | null;
  whatsapp_number: string;
  location: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  active?: boolean;
  on_hold?: boolean;
  is_closed?: boolean;
  closed_message?: string | null;
  is_sponsored?: boolean;
  sponsored_expires_at?: string | null;
  institution_id?: string | null;
  cohort_id?: string | null;
  institution_name?: string | null;
  institution_logo?: string | null;
  delivery_settings?: Record<string, any> | null;
  quiet_hours?: { enabled: boolean; start: string; end: string } | null;
  trial_ends_at?: string | null;
  subscription_status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | null;
  created_at: string;
  updated_at: string;
}

export interface StorePlatform {
  id?: string;
  store_id?: string;
  platform: 'instagram' | 'tiktok' | 'snapchat' | 'facebook' | 'other';
  handle?: string;
}

export interface Category {
  id: string;
  store_id?: string;
  name: string;
  display_order: number;
  active: boolean;
  created_at: string;
}

export interface ProductOption {
  name: string;
  price: number;
}

export interface Product {
  id: string;
  store_id?: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  image_urls?: string[];
  image_public_id?: string | null;
  category_id: string | null;
  options?: ProductOption[];
  custom_fields?: any[];
  lead_time_days?: number;
  in_stock: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'New'
  | 'Received'
  | 'Preparing'
  | 'Ready'
  | 'Out for delivery'
  | 'Completed'
  | 'Cancelled';

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  selected_option?: string;
}

export interface Order {
  id: string;
  order_number: string;
  public_token: string;
  store_id: string;
  customer_name: string;
  customer_phone?: string | null;
  location: string;
  items: OrderItem[];
  delivery_fee: number;
  total: number;
  source: string;
  status: OrderStatus;
  status_updated_at: string;
  paid: boolean;
  payment_method?: string | null;
  notes?: string | null;
  rider?: { name?: string; phone?: string; expected_time?: string } | null;
  created_at: string;
  updated_at: string;
}

export interface DailyStat {
  store_id: string;
  date: string;
  source: string;
  visits: number;
  cart_adds: number;
  orders_started: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  display_name?: string | null;
  emailVerified?: boolean;
}

// ── Phase 2: Institution SaaS Types ─────────────────────────────────────────

export interface Institution {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  active: boolean;
  revenue_split_pct: number;
  created_at: string;
  updated_at: string;
  // aggregates (from superadmin API)
  cohorts_count?: number;
  codes_total?: number;
  codes_claimed?: number;
  sponsored_stores?: number;
}

export interface Cohort {
  id: string;
  institution_id: string;
  name: string;
  year: number;
  graduation_date: string | null;
  active: boolean;
  access_code_prefix: string;
  created_at: string;
  // aggregates
  codes_total?: number;
  codes_claimed?: number;
}

export interface AccessCode {
  id: string;
  cohort_id: string;
  code: string;
  graduate_name?: string | null;
  graduate_phone?: string | null;
  graduate_email?: string | null;
  course?: string | null;
  status: 'issued' | 'redeemed' | 'expired' | 'revoked';
  store_id: string | null;
  store_name?: string | null;
  store_slug?: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  store_id: string;
  store_name?: string;
  store_slug?: string;
  institution_id: string;
  institution_name?: string;
  amount_total: number;
  amount_cartsy: number;
  amount_institution: number;
  status: 'pending' | 'paid';
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
}

export interface SponsorshipStatus {
  is_sponsored: boolean;
  sponsored_expires_at: string | null;
  institution_id: string | null;
  cohort_id: string | null;
  institution_name: string | null;
  institution_logo: string | null;
}

export interface AdminDashboardStats {
  products: number;
  categories: number;
  in_stock_products: number;
  out_of_stock_products: number;
  orders_count?: number;
  new_orders_count?: number;
  recent_products: {
    id: string;
    name: string;
    price: number;
    in_stock: boolean;
    image_url: string | null;
    category_name: string | null;
    created_at: string;
  }[];
  recent_orders?: Order[];
  products_by_category: {
    name: string;
    count: number;
  }[];
  store_created_at: string | null;
}
