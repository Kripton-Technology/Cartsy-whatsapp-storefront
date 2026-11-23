import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../lib/api';
import {
  Package, Tags, Store, ExternalLink, Copy, Check,
  TrendingUp, ShoppingBag,
  Settings, CreditCard, ArrowUpRight,
  Plus, Search, SlidersHorizontal, ArrowLeft,
  ChevronRight, Eye, Sparkles, AlertCircle, CheckCircle2, Share2, QrCode, Smartphone, Clock, GraduationCap
} from 'lucide-react';
import { useStore } from '../../contexts/StoreContext';
import type { AdminDashboardStats } from '../../lib/types';
import { money } from '../../lib/format';

type NavTab = 'overview' | 'catalog' | 'stock' | 'store';
type FilterTab = 'all' | 'in_stock' | 'out_of_stock';

export function Dashboard() {
  const { store } = useStore();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  const [activeNavTab, setActiveNavTab] = useState<NavTab>('overview');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handlePrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true);
    }
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsAppInstalled(true);
        setInstallPrompt(null);
      }
    } else {
      alert('To install Cartsy on your device, open your browser menu and choose "Add to Home Screen" or "Install App".');
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const statsData = await adminApi.getDashboardStats();
        setStats(statsData);
        if (statsData.recent_products && statsData.recent_products.length > 0) {
          setSelectedProductId(statsData.recent_products[0].id);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const storeUrl = store ? `${window.location.origin}/store/${store.slug}` : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredProducts = useMemo(() => {
    if (!stats?.recent_products) return [];
    return stats.recent_products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category_name && p.category_name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (activeFilter === 'in_stock') return matchesSearch && p.in_stock;
      if (activeFilter === 'out_of_stock') return matchesSearch && !p.in_stock;
      return matchesSearch;
    });
  }, [stats?.recent_products, activeFilter, searchQuery]);

  const expiryInfo = useMemo(() => {
    if (!store) return null;
    const expiryStr = (store as any).is_sponsored && (store as any).sponsored_expires_at
      ? (store as any).sponsored_expires_at
      : store.trial_ends_at;
    if (!expiryStr) return null;
    const expiryDate = new Date(expiryStr);
    const diffMs = expiryDate.getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const isGrace = daysLeft <= 0 && daysLeft >= -7;
    const isExpired = daysLeft < -7;
    const isSponsored = !!(store as any).is_sponsored;
    return { daysLeft, isGrace, isExpired, isSponsored, date: expiryDate };
  }, [store]);

  const selectedProduct = useMemo(() => {
    if (!stats?.recent_products) return null;
    return stats.recent_products.find((p) => p.id === selectedProductId) || stats.recent_products[0] || null;
  }, [stats?.recent_products, selectedProductId]);

  const inStockProducts = useMemo(() => stats?.recent_products?.filter(p => p.in_stock) ?? [], [stats]);
  const outOfStockProducts = useMemo(() => stats?.recent_products?.filter(p => !p.in_stock) ?? [], [stats]);
  const stockHealthPct = Math.round(((stats?.in_stock_products ?? 0) / Math.max(stats?.products ?? 1, 1)) * 100);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-brand-steel/10 rounded-2xl w-1/3 backdrop-blur-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-44 bg-brand-steel/10 rounded-[2rem] backdrop-blur-md" />
            ))}
          </div>
          <div className="h-96 bg-brand-steel/10 rounded-[2.5rem] backdrop-blur-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 transition-all duration-200">

      {/* ─── Top Bar & Navigation Pills ────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-800 font-bold">
            <ArrowLeft className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-slate-900">
                {activeNavTab === 'overview' && 'Catalog Overview'}
                {activeNavTab === 'catalog' && 'Product Catalog'}
                {activeNavTab === 'stock' && 'Stock Health'}
                {activeNavTab === 'store' && 'Store Link'}
              </h1>
              <span className="bg-emerald-50 text-emerald-700 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                {store?.business_name || 'Store Admin'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {activeNavTab === 'overview' && 'Manage inventory, monitor health, and access live store link.'}
              {activeNavTab === 'catalog' && 'Browse and filter your full product catalog.'}
              {activeNavTab === 'stock' && 'Monitor in-stock and out-of-stock items.'}
              {activeNavTab === 'store' && 'Share your live store link with customers.'}
            </p>
          </div>
        </div>

        {/* Center: Tab Pills */}
        <div className="bg-white p-1 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-1 self-start lg:self-center overflow-x-auto max-w-full">
          {[
            { id: 'overview', label: 'Overview', icon: Sparkles },
            { id: 'catalog', label: 'Catalog', icon: Package },
            { id: 'stock', label: 'Stock', icon: TrendingUp },
            { id: 'store', label: 'Store Link', icon: Store },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeNavTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveNavTab(tab.id as NavTab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {!isAppInstalled && (
            <button
              onClick={handleInstallApp}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3.5 py-2.5 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 transition-all active:scale-95"
              title="Install Cartsy on your phone for instant push alerts (PW-1)"
            >
              <Smartphone className="w-4 h-4" />
              <span>Install App</span>
            </button>
          )}
          <button
            onClick={copyToClipboard}
            className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
          </button>
          <Link
            to="/admin/products"
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Product</span>
          </Link>
        </div>
      </div>

      {/* ─── Plan Expiry & Grace Period Alert Banner (BL-3, BL-4) ────── */}
      {expiryInfo && store?.subscription_status !== 'active' && (
        <>
          {expiryInfo.isGrace && (
            <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-100">
                    Your {expiryInfo.isSponsored ? 'sponsored program' : 'trial'} has ended. You are in a 7-day grace period.
                  </p>
                  <p className="text-xs text-amber-300/80">
                    Your storefront remains live for {Math.max(0, 7 + expiryInfo.daysLeft)} more days. Subscribe to maintain uninterrupted service.
                  </p>
                </div>
              </div>
              <Link
                to="/admin/billing"
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-brand-dark text-xs font-black rounded-xl transition-all shrink-0"
              >
                Upgrade to Paid
              </Link>
            </div>
          )}

          {!expiryInfo.isGrace && expiryInfo.daysLeft <= 14 && expiryInfo.daysLeft > 0 && (
            <div className={`p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border ${
              expiryInfo.daysLeft <= 1
                ? 'bg-red-500/15 border-red-500/30 text-red-200'
                : expiryInfo.daysLeft <= 7
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                : 'bg-brand-cream/10 border-brand-cream/20 text-brand-cream'
            }`}>
              <div className="flex items-center gap-3">
                {expiryInfo.isSponsored ? (
                  <GraduationCap className="w-5 h-5 shrink-0 text-brand-cream" />
                ) : (
                  <Clock className="w-5 h-5 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-bold text-brand-header">
                    {expiryInfo.daysLeft <= 1
                      ? `Urgent: Your ${expiryInfo.isSponsored ? 'sponsorship' : 'free trial'} ends tomorrow!`
                      : `Reminder: ${expiryInfo.daysLeft} days remaining on your ${expiryInfo.isSponsored ? 'sponsored program' : 'trial'}.`}
                  </p>
                  <p className="text-xs text-brand-slate">
                    Subscribe today to ensure continuous order processing and custom storefront access.
                  </p>
                </div>
              </div>
              <Link
                to="/admin/billing"
                className="px-4 py-2 bg-brand-cream hover:bg-white text-brand-dark text-xs font-bold rounded-xl transition-all shrink-0"
              >
                View Plans
              </Link>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: OVERVIEW
      ═══════════════════════════════════════════════════════ */}
      {activeNavTab === 'overview' && (
        <>
          {/* Stat Cards (Dokani Aesthetic) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Products</span>
                <svg className="w-12 h-6 text-amber-500" viewBox="0 0 56 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 20 L14 14 L24 24 L36 8 L46 16 L54 4" />
                </svg>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-black text-slate-900 font-display">{stats?.products ?? 0}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">↑ Catalog</span>
              </div>
              <p className="text-xs text-slate-500">Active items in catalog</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Categories</span>
                <span className="font-bold text-slate-900">{stats?.categories ?? 0} groups</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categories</span>
                <svg className="w-12 h-6 text-blue-500" viewBox="0 0 56 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 24 L14 16 L26 22 L36 12 L46 18 L54 8" />
                </svg>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-black text-slate-900 font-display">{stats?.categories ?? 0}</span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Organized</span>
              </div>
              <p className="text-xs text-slate-500">Top catalog groupings</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1">
                {(stats?.products_by_category || []).slice(0, 4).map((c, idx) => (
                  <div key={idx} className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.max(15, (c.count / Math.max(stats?.products || 1, 1)) * 100)}%` }} title={`${c.name}: ${c.count}`} />
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Stock Items</span>
                <svg className="w-12 h-6 text-emerald-600" viewBox="0 0 56 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 22 L12 18 L22 24 L34 10 L44 14 L54 6" />
                </svg>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-black text-slate-900 font-display">{stats?.in_stock_products ?? 0}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">{stockHealthPct}% Available</span>
              </div>
              <p className="text-xs text-slate-500">Ready for WhatsApp checkout</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-rose-600 font-medium">Out of Stock</span>
                <span className="font-bold text-rose-600">{stats?.out_of_stock_products ?? 0} items</span>
              </div>
            </div>

            <Link
              to="/admin/orders"
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-emerald-300 hover:shadow-sm transition-all duration-200 block group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Orders & Backups</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {stats?.new_orders_count ?? 0} New
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-black text-slate-900 font-display">{stats?.orders_count ?? 0}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">WhatsApp Backup</span>
              </div>
              <p className="text-xs text-slate-500">Orders saved with push alerts</p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform">
                <span>Manage Orders</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>

          {/* Split Panel */}
          <div className="bg-white rounded-2xl p-5 sm:p-7 border border-slate-200/80 shadow-xs relative overflow-hidden">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Product list */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                      <span>Product Catalog</span>
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                        {(stats?.recent_products?.length ?? 0)} Items
                      </span>
                    </h3>
                    <Link to="/admin/products" className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1">
                      Manage All <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {(stats?.recent_products ?? []).length > 0 ? (
                      (stats?.recent_products ?? []).map((p) => {
                        const isSelected = selectedProduct?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedProductId(p.id)}
                            className={`p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                              isSelected
                                ? 'bg-emerald-50/60 border-emerald-300 shadow-xs'
                                : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/60'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-4 h-4 text-slate-400" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{p.name}</p>
                                <p className="text-[11px] text-slate-500">{p.category_name || 'Uncategorized'}</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="text-xs font-extrabold text-slate-900 font-display">GHS {money(p.price)}</p>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold mt-0.5 ${p.in_stock ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                {p.in_stock ? 'In Stock' : 'Out'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-10 text-slate-500 text-xs">No products yet.</div>
                    )}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Direct Checkout</span>
                  <Link to="/admin/settings" className="hover:text-slate-900 transition-colors flex items-center gap-1 font-bold">Settings <ChevronRight className="w-3 h-3" /></Link>
                </div>
              </div>

              {/* Right: Spotlight */}
              <div className="lg:col-span-7 bg-slate-50/70 rounded-2xl p-5 sm:p-6 border border-slate-200/80 flex flex-col justify-between">
                {selectedProduct ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-emerald-200">Spotlight Item</span>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-display mt-2">{selectedProduct.name}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Category: {selectedProduct.category_name || 'Uncategorized'}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${selectedProduct.in_stock ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {selectedProduct.in_stock ? 'Available' : 'Out of Stock'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase">Price</p>
                        <p className="text-lg font-black text-slate-900 font-display mt-1">GHS {money(selectedProduct.price)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase">Added On</p>
                        <p className="text-sm font-bold text-slate-900 mt-1">{new Date(selectedProduct.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-xs">
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase">WhatsApp Checkout</p>
                        <p className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1">✓ Instant Order</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                      <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-8 h-8 text-slate-400" />}
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <h4 className="text-sm font-bold text-slate-900">{selectedProduct.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">Customers ordering this item on WhatsApp will directly generate an itemized cart message to your WhatsApp number.</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="bg-white hover:bg-slate-50 text-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-200 shadow-xs transition-all">
                        <Eye className="w-3.5 h-3.5 text-slate-600" /> View on Store
                      </a>
                      <Link to="/admin/products" className="bg-slate-900 text-white hover:bg-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95">
                        <Settings className="w-3.5 h-3.5" /> Edit Product Catalog
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-500">
                    <ShoppingBag className="w-12 h-12 text-slate-400 mb-3" />
                    <p className="text-sm font-bold">Select a product to view spotlight details.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom nav shortcuts */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Products', desc: 'Catalog & stock control', icon: Package, path: '/admin/products', color: 'text-purple-600 bg-purple-50' },
              { label: 'Categories', desc: 'Group & organize items', icon: Tags, path: '/admin/categories', color: 'text-blue-600 bg-blue-50' },
              { label: 'Store Settings', desc: 'Branding & WhatsApp number', icon: Settings, path: '/admin/settings', color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Billing & Plan', desc: 'Subscription status', icon: CreditCard, path: '/admin/billing', color: 'text-amber-600 bg-amber-50' },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="bg-white rounded-2xl p-4 border border-slate-200/80 hover:border-slate-300 hover:shadow-xs transition-all group flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">{item.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{item.desc}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: CATALOG — full searchable / filterable product list
      ═══════════════════════════════════════════════════════ */}
      {activeNavTab === 'catalog' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 px-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" /> Filter:
              </span>
              {[
                { id: 'all', label: 'All Items', count: stats?.products ?? 0 },
                { id: 'in_stock', label: 'In Stock', count: stats?.in_stock_products ?? 0 },
                { id: 'out_of_stock', label: 'Out of Stock', count: stats?.out_of_stock_products ?? 0 },
              ].map((f) => {
                const active = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id as FilterTab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      active ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{f.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs font-semibold rounded-xl pl-9 pr-3 py-2 outline-none focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          {/* Product Grid */}
          <div className="bg-white rounded-2xl p-5 sm:p-7 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                All Products
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  {filteredProducts.length} Items
                </span>
              </h3>
              <Link to="/admin/products" className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1">
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-300 hover:shadow-xs transition-all group"
                  >
                    <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500">{p.category_name || 'Uncategorized'}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-extrabold text-slate-900">GHS {money(p.price)}</span>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${p.in_stock ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          {p.in_stock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Package className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-sm font-bold">No products match your filter.</p>
                <p className="text-xs mt-1">Try changing the filter or search term.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: STOCK — in-stock vs out-of-stock breakdown
      ═══════════════════════════════════════════════════════ */}
      {activeNavTab === 'stock' && (
        <div className="space-y-5">
          {/* Stock Health Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-brand-steel/10 backdrop-blur-xl rounded-[2rem] p-5 border border-brand-steel/15 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-brand-slate uppercase tracking-wider">Total Products</span>
                <div className="w-9 h-9 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black text-brand-header font-display">{stats?.products ?? 0}</span>
              <p className="text-xs text-brand-slate mt-1">Across all categories</p>
            </div>

            <div className="bg-emerald-500/5 backdrop-blur-xl rounded-[2rem] p-5 border border-emerald-500/20 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">In Stock</span>
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black text-emerald-400 font-display">{stats?.in_stock_products ?? 0}</span>
              <p className="text-xs text-brand-slate mt-1">{stockHealthPct}% of catalog available</p>
            </div>

            <div className="bg-rose-500/5 backdrop-blur-xl rounded-[2rem] p-5 border border-rose-500/20 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-rose-400 uppercase tracking-wider">Out of Stock</span>
                <div className="w-9 h-9 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black text-rose-400 font-display">{stats?.out_of_stock_products ?? 0}</span>
              <p className="text-xs text-brand-slate mt-1">Needs restocking</p>
            </div>
          </div>

          {/* Health Bar */}
          <div className="bg-brand-steel/10 backdrop-blur-xl rounded-2xl p-5 border border-brand-steel/15 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-extrabold text-brand-header">Stock Health</span>
              <span className="text-xs font-bold text-brand-slate">{stockHealthPct}% in stock</span>
            </div>
            <div className="w-full h-3 bg-brand-steel/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${stockHealthPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-brand-slate mt-2">
              <span className="text-emerald-400 font-bold">{stats?.in_stock_products ?? 0} available</span>
              <span className="text-rose-400 font-bold">{stats?.out_of_stock_products ?? 0} unavailable</span>
            </div>
          </div>

          {/* Two column lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* In Stock */}
            <div className="bg-brand-steel/10 backdrop-blur-2xl rounded-[2.5rem] p-5 border border-emerald-500/15 shadow-2xl">
              <h3 className="text-sm font-extrabold text-emerald-400 flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4" /> In Stock ({inStockProducts.length})
              </h3>
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {inStockProducts.length > 0 ? inStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/10 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-brand-steel/20 overflow-hidden flex-shrink-0 flex items-center justify-center border border-brand-steel/20">
                      {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-4 h-4 text-brand-slate/50" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-brand-header truncate">{p.name}</p>
                      <p className="text-[10px] text-brand-slate">{p.category_name || 'Uncategorized'}</p>
                    </div>
                    <span className="text-xs font-extrabold text-brand-cream flex-shrink-0">GHS {money(p.price)}</span>
                  </div>
                )) : (
                  <p className="text-xs text-brand-slate text-center py-8">No in-stock products.</p>
                )}
              </div>
            </div>

            {/* Out of Stock */}
            <div className="bg-brand-steel/10 backdrop-blur-2xl rounded-[2.5rem] p-5 border border-rose-500/15 shadow-2xl">
              <h3 className="text-sm font-extrabold text-rose-400 flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4" /> Out of Stock ({outOfStockProducts.length})
              </h3>
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {outOfStockProducts.length > 0 ? outOfStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-2xl bg-rose-500/5 border border-rose-500/15 hover:bg-rose-500/10 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-brand-steel/20 overflow-hidden flex-shrink-0 flex items-center justify-center border border-brand-steel/20">
                      {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-4 h-4 text-brand-slate/50" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-brand-header truncate">{p.name}</p>
                      <p className="text-[10px] text-brand-slate">{p.category_name || 'Uncategorized'}</p>
                    </div>
                    <Link to="/admin/products" className="text-[10px] font-bold text-rose-400 hover:underline flex-shrink-0">Restock</Link>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400/40 mx-auto mb-2" />
                    <p className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>All products in stock!</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: STORE LINK — share panel
      ═══════════════════════════════════════════════════════ */}
      {activeNavTab === 'store' && (
        <div className="space-y-5">
          {/* Big Link Card */}
          <div className="bg-brand-steel/10 backdrop-blur-2xl rounded-[2.5rem] p-6 sm:p-10 border border-brand-steel/20 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-cream/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
            <div className="relative z-10 max-w-xl mx-auto text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                <Store className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-brand-header font-display">{store?.business_name || 'Your Store'}</h2>
                <p className="text-xs text-brand-slate mt-1">Share this link with your customers to let them browse and order via WhatsApp.</p>
              </div>

              {/* URL Display */}
              <div className="bg-brand-steel/15 border border-brand-steel/20 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-xs font-bold text-brand-cream truncate flex-1 text-left">{storeUrl || 'Store URL not available'}</span>
                <button
                  onClick={copyToClipboard}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-brand-cream text-brand-dark hover:opacity-90 shadow-md shadow-brand-cream/20'}`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-cream text-brand-dark hover:opacity-90 px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-cream/20 transition-all active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" /> Open Store
                </a>
                <button
                  onClick={copyToClipboard}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-steel/15 text-brand-header border border-brand-steel/20 hover:bg-brand-steel/25 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                >
                  <Share2 className="w-4 h-4 text-brand-cream" /> Share Link
                </button>
              </div>
            </div>
          </div>

          {/* Store Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-brand-steel/10 backdrop-blur-xl rounded-[2rem] p-5 border border-brand-steel/15 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-4 h-4 text-brand-cream" />
                <span className="text-xs font-extrabold text-brand-slate uppercase tracking-wider">Store Slug</span>
              </div>
              <p className="text-sm font-bold text-brand-header font-mono">{store?.slug ?? '—'}</p>
              <p className="text-[11px] text-brand-slate mt-1">Your unique store identifier</p>
            </div>
            <div className="bg-brand-steel/10 backdrop-blur-xl rounded-[2rem] p-5 border border-brand-steel/15 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-extrabold text-brand-slate uppercase tracking-wider">Products Listed</span>
              </div>
              <p className="text-3xl font-black text-brand-header font-display">{stats?.products ?? 0}</p>
              <p className="text-[11px] text-brand-slate mt-1">Visible to customers</p>
            </div>
            <div className="bg-brand-steel/10 backdrop-blur-xl rounded-[2rem] p-5 border border-brand-steel/15 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-extrabold text-brand-slate uppercase tracking-wider">Stock Health</span>
              </div>
              <p className="text-3xl font-black text-emerald-400 font-display">{stockHealthPct}%</p>
              <p className="text-[11px] text-brand-slate mt-1">{stats?.in_stock_products ?? 0} items available</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
