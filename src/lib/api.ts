import type {
  AdminDashboardStats,
  AdminUser,
  BusinessInfo,
  Category,
  Order,
  OrderStatus,
  Product,
  StorePlatform,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Get the session token from cookies (handle both __Secure prefix and local)
  const cookies = document.cookie.split('; ');
  const sessionToken = cookies.find(row => row.trim().startsWith('__Secure-neon-auth.session_token='))?.split('=')[1]
    || cookies.find(row => row.trim().startsWith('neon-auth.session_token='))?.split('=')[1]
    || cookies.find(row => row.trim().startsWith('better-auth.session_token='))?.split('=')[1];

  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function storeQuery(slug?: string) {
  return slug ? `?store=${encodeURIComponent(slug)}` : '';
}

export const publicApi = {
  getAllStores: () =>
    apiRequest<BusinessInfo[]>(`/api/stores`),
  getBusinessInfo: (slug?: string) =>
    apiRequest<BusinessInfo | null>(`/api/store${storeQuery(slug)}`),
  getStorePlatforms: (slug: string) =>
    apiRequest<StorePlatform[]>(`/api/store/platforms${storeQuery(slug)}`),
  getCategories: (slug?: string) =>
    apiRequest<Category[]>(`/api/categories${storeQuery(slug)}`),
  getProducts: (slug?: string, categoryId?: string) => {
    const params = new URLSearchParams();
    if (slug) params.set('store', slug);
    if (categoryId) params.set('category', categoryId);
    const query = params.toString();
    return apiRequest<Product[]>(`/api/products${query ? `?${query}` : ''}`);
  },
  getProductById: (slug: string, productId: string) =>
    apiRequest<Product | null>(`/api/products/${productId}${storeQuery(slug)}`),
  recordVisit: (storeSlug: string, source: string) => {
    return fetch(`${API_BASE_URL}/api/stats/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: storeSlug, source }),
      keepalive: true,
    }).catch(() => {});
  },
  backupOrder: async (orderPayload: {
    order_number: string;
    public_token: string;
    store_slug: string;
    customer_name: string;
    customer_phone?: string;
    location: string;
    items: { id: string; name: string; qty: number; price: number; selected_option?: string }[];
    delivery_fee?: number;
    total: number;
    source: string;
    notes?: string;
  }) => {
    const bodyStr = JSON.stringify(orderPayload);
    // Non-blocking fire-and-forget: use sendBeacon if available, otherwise fetch with keepalive
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([bodyStr], { type: 'application/json' });
      const sent = navigator.sendBeacon(`${API_BASE_URL}/api/orders/backup`, blob);
      if (sent) return { success: true };
    }

    try {
      return await fetch(`${API_BASE_URL}/api/orders/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr,
        keepalive: true,
      }).then(r => r.json());
    } catch (e) {
      console.warn('Backup order failed silently to prevent blocking WhatsApp redirect:', e);
      return { success: false };
    }
  },
  trackOrder: (publicToken: string) =>
    apiRequest<Order>(`/api/orders/track/${publicToken}`),
};

export const authApi = {
  getSession: () => apiRequest<{ user: AdminUser | null }>('/api/auth/session'),
  login: (email: string, password: string) =>
    apiRequest<{ user: AdminUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  logout: () =>
    apiRequest<void>('/api/auth/logout', {
      method: 'POST',
    }),
};

export const adminApi = {
  getMyStores: () => apiRequest<BusinessInfo[]>('/api/admin/stores'),
  createStore: (store: Partial<BusinessInfo>) =>
    apiRequest<BusinessInfo>('/api/admin/stores', {
      method: 'POST',
      body: store,
    }),
  getDashboardStats: () => apiRequest<AdminDashboardStats>('/api/admin/dashboard'),
  getBusinessInfo: () => apiRequest<BusinessInfo | null>('/api/admin/store'),
  saveBusinessInfo: (business: Partial<BusinessInfo>) =>
    apiRequest<BusinessInfo>('/api/admin/store', {
      method: 'PUT',
      body: business,
    }),
  getPlatforms: () => apiRequest<StorePlatform[]>('/api/admin/platforms'),
  savePlatforms: (platforms: StorePlatform[]) =>
    apiRequest<StorePlatform[]>('/api/admin/platforms', {
      method: 'PUT',
      body: { platforms },
    }),
  getCategories: () => apiRequest<Category[]>('/api/admin/categories'),
  createCategory: (data: string | { name: string; active?: boolean }) =>
    apiRequest<Category>('/api/admin/categories', {
      method: 'POST',
      body: typeof data === 'string' ? { name: data } : data,
    }),
  updateCategory: (id: string, data: string | { name?: string; active?: boolean }) =>
    apiRequest<Category>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: typeof data === 'string' ? { name: data } : data,
    }),
  deleteCategory: (id: string) =>
    apiRequest<void>(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    }),
  getProducts: () => apiRequest<Product[]>('/api/admin/products'),
  createProduct: (product: Partial<Product>) =>
    apiRequest<Product>('/api/admin/products', {
      method: 'POST',
      body: product,
    }),
  updateProduct: (id: string, product: Partial<Product>) =>
    apiRequest<Product>(`/api/admin/products/${id}`, {
      method: 'PATCH',
      body: product,
    }),
  deleteProduct: (id: string) =>
    apiRequest<void>(`/api/admin/products/${id}`, {
      method: 'DELETE',
    }),
  getOrders: (filters?: { status?: string; source?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.source) params.set('source', filters.source);
    if (filters?.search) params.set('search', filters.search);
    const query = params.toString();
    return apiRequest<Order[]>(`/api/admin/orders${query ? `?${query}` : ''}`);
  },
  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    apiRequest<Order>(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status },
    }),
  getPushVapidKey: () =>
    apiRequest<{ publicKey: string }>('/api/admin/push/vapid-public-key'),
  subscribePush: (subscription: any) =>
    apiRequest<{ success: boolean }>('/api/admin/push/subscribe', {
      method: 'POST',
      body: subscription,
    }),
  unsubscribePush: (endpoint: string) =>
    apiRequest<{ success: boolean }>('/api/admin/push/unsubscribe', {
      method: 'DELETE',
      body: { endpoint },
    }),
  uploadImage: async (file: File, folder: string) => {
    const signature = await apiRequest<{
      timestamp: number;
      signature: string;
      apiKey: string;
      cloudName: string;
      folder: string;
    }>('/api/admin/uploads/signature', {
      method: 'POST',
      body: { folder },
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', signature.timestamp.toString());
    formData.append('folder', signature.folder);
    formData.append('signature', signature.signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error('Cloudinary upload failed');
    }

    const uploaded = await response.json();
    return {
      url: uploaded.secure_url as string,
      public_id: uploaded.public_id as string,
    };
  },
  getBillingStatus: () =>
    apiRequest<{
      subscription_status: string | null;
      trial_ends_at: string | null;
      paystack_subscription_code: string | null;
      paystack_customer_code: string | null;
      is_active: boolean;
      days_left: number;
      is_sponsored?: boolean;
      sponsored_expires_at?: string | null;
      institution_name?: string | null;
      institution_logo?: string | null;
    }>('/api/admin/billing/status'),
  claimAccessCode: (code: string) =>
    apiRequest<{
      success: boolean;
      institution_name: string;
      institution_logo: string | null;
      sponsored_until: string;
    }>('/api/admin/claim-access-code', {
      method: 'POST',
      body: { code },
    }),
  getSponsorship: () =>
    apiRequest<{
      is_sponsored: boolean;
      sponsored_expires_at: string | null;
      institution_id: string | null;
      cohort_id: string | null;
      institution_name: string | null;
      institution_logo: string | null;
    }>('/api/admin/sponsorship'),
  subscribe: () =>
    apiRequest<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/api/admin/billing/subscribe', {
      method: 'POST',
    }),
  verifySubscription: (reference: string) =>
    apiRequest<{
      success: boolean;
      message: string;
    }>('/api/admin/billing/verify', {
      method: 'POST',
      body: { reference },
    }),
};
