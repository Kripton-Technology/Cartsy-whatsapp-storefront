const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getSaToken(): string {
  return sessionStorage.getItem('sa_token') || localStorage.getItem('sa_token') || '';
}

export function setSaToken(token: string, remember: boolean = true) {
  sessionStorage.setItem('sa_token', token);
  if (remember) {
    localStorage.setItem('sa_token', token);
  } else {
    localStorage.removeItem('sa_token');
  }
}

export function clearSaToken() {
  sessionStorage.removeItem('sa_token');
  localStorage.removeItem('sa_token');
}

async function saRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSaToken();
  const url = `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-superadmin-token': token,
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface SAProduct {
  id: string;
  name: string;
  price: number | string;
  in_stock: boolean;
  image_url: string | null;
  created_at: string;
}

export interface SACategory {
  id: string;
  name: string;
  active: boolean;
}

export interface SAStore {
  id: string;
  business_name: string;
  slug: string;
  whatsapp_number: string;
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | string | null;
  trial_ends_at: string | null;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  paystack_transaction_reference: string | null;
  created_at: string;
  updated_at?: string;
  on_hold: boolean;
  active?: boolean;
  product_count: number;
  admin_count: number;
  owner_email: string | null;
  products?: SAProduct[];
  categories?: SACategory[];
  is_sponsored?: boolean;
  sponsored_expires_at?: string | null;
  institution_id?: string | null;
  cohort_id?: string | null;
}

export interface SAPayment {
  store_id: string;
  business_name: string;
  slug: string;
  subscription_status: string | null;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  paystack_transaction_reference: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at?: string;
  owner_email: string | null;
}

export interface SAStats {
  total_stores: number;
  active_stores: number;
  trialing_stores: number;
  expired_stores: number;
  on_hold_stores: number;
  total_products: number;
  total_categories: number;
}

// ── Phase 2 Types ────────────────────────────────────────────────────────────

export interface SAInstitution {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_email: string | null;
  active: boolean;
  revenue_split_pct: number;
  created_at: string;
  updated_at: string;
  cohorts_count?: number;
  codes_total?: number;
  codes_claimed?: number;
  sponsored_stores?: number;
}

export interface SACohort {
  id: string;
  institution_id: string;
  name: string;
  year: number;
  graduation_date: string | null;
  active: boolean;
  access_code_prefix: string;
  created_at: string;
}

export interface SAAccessCode {
  id: string;
  cohort_id: string;
  code: string;
  graduate_name: string | null;
  graduate_phone: string | null;
  graduate_email: string | null;
  course: string | null;
  status: 'issued' | 'redeemed' | 'expired' | 'revoked';
  store_id: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
  store_name?: string | null;
  store_slug?: string | null;
  store_whatsapp?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
}

export interface SAGraduate {
  id: string;
  cohort_id: string;
  code: string;
  graduate_name: string | null;
  graduate_phone: string | null;
  graduate_email: string | null;
  course: string | null;
  status: 'issued' | 'redeemed' | 'expired' | 'revoked';
  store_id: string | null;
  claimed_at: string | null;
  expires_at: string;
  created_at: string;
  // Institution & Cohort
  institution_id: string;
  institution_name: string;
  institution_slug: string;
  institution_logo: string | null;
  cohort_name: string;
  cohort_year: number;
  // Aligned Store
  store_name: string | null;
  store_slug: string | null;
  store_whatsapp: string | null;
  store_is_sponsored: boolean | null;
  store_subscription_status: string | null;
  store_sponsored_expires_at: string | null;
  store_created_at: string | null;
  // Aligned Owner
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

export interface SALedgerEntry {
  id: string;
  store_id: string | null;
  institution_id: string;
  access_code_id: string | null;
  amount_total: number;
  amount_cartsy: number;
  amount_institution: number;
  status: 'pending' | 'paid';
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
  // Joined fields
  institution_name?: string;
  business_name?: string;
}

export interface SAInstitutionStats {
  institution: { id: string; name: string; slug: string; revenue_split_pct: number; active: boolean };
  graduates: number;
  codes_redeemed: number;
  codes_revoked: number;
  stores_live: number;
  total_orders_count: number;
  money_owed_to_school: number;
  money_paid_to_school: number;
  total_gross_generated: number;
}

// ── API client ───────────────────────────────────────────────────────────────

export const saApi = {
  login: (password: string) =>
    saRequest<{ success: boolean; token: string }>('/api/superadmin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  verify: () => saRequest<{ valid: boolean }>('/api/superadmin/verify'),

  getStats: () => saRequest<SAStats>('/api/superadmin/stats'),

  getStores: () => saRequest<SAStore[]>('/api/superadmin/stores'),

  getStore: (id: string) => saRequest<SAStore>(`/api/superadmin/stores/${id}`),

  updateStore: (id: string, data: Partial<SAStore>) =>
    saRequest<SAStore>(`/api/superadmin/stores/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  extendTrial: (id: string, days: number = 14) =>
    saRequest<SAStore>(`/api/superadmin/stores/${id}/extend-trial`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  deleteStore: (id: string) =>
    saRequest<{ success: boolean; deleted: { id: string; business_name: string } }>(`/api/superadmin/stores/${id}`, {
      method: 'DELETE',
    }),

  getPayments: () => saRequest<SAPayment[]>('/api/superadmin/payments'),

  recordPayment: (data: {
    store_id: string;
    transaction_reference: string;
    subscription_code?: string;
    customer_code?: string;
    subscription_status?: string;
  }) =>
    saRequest<{ success: boolean; store: SAStore }>('/api/superadmin/payments/record', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getSettings: () => saRequest<Record<string, string>>('/api/superadmin/settings'),

  updateSetting: (key: string, value: string) =>
    saRequest<{ success: boolean; key: string; value: string }>('/api/superadmin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ key, value }),
    }),

  deleteSetting: (key: string) =>
    saRequest<{ success: boolean; key: string }>(`/api/superadmin/settings/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),

  // ── Phase 2: Institution SaaS ──────────────────────────────────────────────

  getInstitutions: () => saRequest<SAInstitution[]>('/api/superadmin/institutions'),

  createInstitution: (data: {
    name: string;
    slug: string;
    logo_url?: string;
    contact_email?: string;
    revenue_split_pct?: number;
  }) =>
    saRequest<SAInstitution>('/api/superadmin/institutions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateInstitution: (id: string, data: Partial<SAInstitution>) =>
    saRequest<SAInstitution>(`/api/superadmin/institutions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getInstitutionStats: (id: string) =>
    saRequest<SAInstitutionStats>(`/api/superadmin/institutions/${id}/stats`),

  getCohorts: (institutionId: string) =>
    saRequest<SACohort[]>(`/api/superadmin/institutions/${institutionId}/cohorts`),

  createCohort: (
    institutionId: string,
    data: { name: string; year: number; graduation_date?: string; access_code_prefix?: string }
  ) =>
    saRequest<SACohort>(`/api/superadmin/institutions/${institutionId}/cohorts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateAccessCodes: (cohortId: string, count: number = 50) =>
    saRequest<{ generated: number; expires_at: string; sample: string[] }>(
      `/api/superadmin/cohorts/${cohortId}/access-codes/generate`,
      { method: 'POST', body: JSON.stringify({ count }) }
    ),

  getAccessCodes: (cohortId: string) =>
    saRequest<SAAccessCode[]>(`/api/superadmin/cohorts/${cohortId}/access-codes`),

  getGraduates: (params?: { institution_id?: string; cohort_id?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.institution_id) q.set('institution_id', params.institution_id);
    if (params?.cohort_id) q.set('cohort_id', params.cohort_id);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return saRequest<SAGraduate[]>(`/api/superadmin/graduates${qs ? `?${qs}` : ''}`);
  },

  importGraduates: (
    cohortId: string,
    data: {
      graduates?: Array<{ name: string; phone?: string; email?: string; course?: string }>;
      csv_text?: string;
    }
  ) =>
    saRequest<{ success: boolean; total_submitted: number; created: number; errors: any[] }>(
      `/api/superadmin/cohorts/${cohortId}/graduates/bulk`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  revokeAccessCode: (codeId: string) =>
    saRequest<{ success: boolean; access_code: SAAccessCode }>(
      `/api/superadmin/access-codes/${codeId}/revoke`,
      { method: 'PATCH' }
    ),

  getLedger: (params?: { status?: string; institution_id?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return saRequest<SALedgerEntry[]>(`/api/superadmin/ledger${q ? `?${q}` : ''}`);
  },

  payLedgerEntry: (id: string) =>
    saRequest<SALedgerEntry>(`/api/superadmin/ledger/${id}/pay`, { method: 'PATCH' }),

  generateLedger: (period_start: string, period_end: string) =>
    saRequest<{ created: number; total_stores: number }>('/api/superadmin/ledger/generate', {
      method: 'POST',
      body: JSON.stringify({ period_start, period_end }),
    }),
};
