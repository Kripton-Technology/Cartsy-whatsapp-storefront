import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { saApi, type SAStore, type SAStats } from '../../lib/saApi';
import {
  Store, CreditCard, TrendingUp, AlertCircle, Package, ArrowUpRight,
  RefreshCw, CheckCircle, PauseCircle, PlayCircle, Layers
} from 'lucide-react';

export function SuperAdminDashboard() {
  const [stores, setStores] = useState<SAStore[]>([]);
  const [stats, setStats] = useState<SAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [storesData, statsData] = await Promise.all([
        saApi.getStores(),
        saApi.getStats().catch(() => null),
      ]);
      setStores(storesData);
      if (statsData) {
        setStats(statsData);
      } else {
        const total = storesData.length;
        const active = storesData.filter(s => s.subscription_status === 'active').length;
        const trialing = storesData.filter(s => s.subscription_status === 'trialing').length;
        const expired = storesData.filter(s => !s.subscription_status || (s.subscription_status !== 'active' && s.subscription_status !== 'trialing')).length;
        const onHold = storesData.filter(s => s.on_hold).length;
        const totalProducts = storesData.reduce((acc, s) => acc + (s.product_count || 0), 0);
        setStats({
          total_stores: total,
          active_stores: active,
          trialing_stores: trialing,
          expired_stores: expired,
          on_hold_stores: onHold,
          total_products: totalProducts,
          total_categories: 0,
        });
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleHold = async (store: SAStore) => {
    setActionLoading(store.id);
    try {
      const updated = await saApi.updateStore(store.id, { on_hold: !store.on_hold });
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, ...updated } : s));
      loadData();
    } catch (err: any) {
      alert(`Error updating store: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const statCards = [
    { label: 'Total Stores', value: stats?.total_stores ?? stores.length, icon: Store, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    { label: 'Active Subscriptions', value: stats?.active_stores ?? 0, icon: CreditCard, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'On Trial', value: stats?.trialing_stores ?? 0, icon: TrendingUp, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { label: 'Expired / Inactive', value: stats?.expired_stores ?? 0, icon: AlertCircle, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    { label: 'Stores on Hold', value: stats?.on_hold_stores ?? 0, icon: PauseCircle, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { label: 'Catalog Products', value: stats?.total_products ?? 0, icon: Package, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Super Admin Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Live database synchronization and control center</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white text-xs font-semibold transition-all hover:bg-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Live Data
        </button>
      </div>

      {/* Stat Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white/[0.03] rounded-3xl animate-pulse border border-white/8" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white/[0.03] border border-white/8 rounded-3xl p-5 hover:bg-white/[0.05] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{card.label}</span>
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${card.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-3xl font-black text-white">{card.value}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* On Hold Alert if any */}
      {(stats?.on_hold_stores || 0) > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-5 py-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300 font-semibold">
            {stats?.on_hold_stores} store{(stats?.on_hold_stores || 0) > 1 ? 's are' : ' is'} currently on hold and blocked from accessing their merchant admin.
          </p>
          <Link to="/superadmin/stores" className="ml-auto text-xs font-bold text-amber-400 hover:underline flex items-center gap-1">
            Manage Stores <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/superadmin/stores"
          className="p-5 rounded-3xl bg-gradient-to-br from-violet-600/15 to-indigo-600/5 border border-violet-500/20 hover:border-violet-500/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <Store className="w-6 h-6 text-violet-400" />
            <ArrowUpRight className="w-4 h-4 text-violet-400/50 group-hover:text-violet-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-base">Store Management</h3>
          <p className="text-xs text-white/40 mt-1">Activate, hold, extend trials, or edit store attributes directly in the database.</p>
        </Link>

        <Link
          to="/superadmin/payments"
          className="p-5 rounded-3xl bg-gradient-to-br from-emerald-600/15 to-teal-600/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            <ArrowUpRight className="w-4 h-4 text-emerald-400/50 group-hover:text-emerald-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-base">Payment Records</h3>
          <p className="text-xs text-white/40 mt-1">Inspect Paystack codes, manual receipts, and link offline subscriptions.</p>
        </Link>

        <Link
          to="/superadmin/settings"
          className="p-5 rounded-3xl bg-gradient-to-br from-cyan-600/15 to-blue-600/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <Layers className="w-6 h-6 text-cyan-400" />
            <ArrowUpRight className="w-4 h-4 text-cyan-400/50 group-hover:text-cyan-400 transition-colors" />
          </div>
          <h3 className="font-bold text-white text-base">Platform Settings</h3>
          <p className="text-xs text-white/40 mt-1">Toggle Paystack live/test modes, configure pricing, trials, and support details.</p>
        </Link>
      </div>

      {/* Recent Stores */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">All Registered Stores</h2>
            <p className="text-xs text-white/35">Directly connected to PostgreSQL</p>
          </div>
          <Link to="/superadmin/stores" className="text-xs text-violet-400 hover:underline flex items-center gap-1 font-semibold">
            View & Edit All ({stores.length}) <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-white/5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-1/3" />
                  <div className="h-2 bg-white/5 rounded w-1/4" />
                </div>
              </div>
            ))
          ) : stores.length === 0 ? (
            <div className="p-8 text-center text-white/30 text-sm">No stores registered in the database yet.</div>
          ) : (
            stores.slice(0, 8).map((store) => (
              <div key={store.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-all">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Store className="w-4 h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{store.business_name}</p>
                    {store.on_hold && (
                      <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        HOLD
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/35 truncate">
                    /{store.slug} {store.owner_email ? `• ${store.owner_email}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-white/40 flex items-center gap-1 font-mono">
                    <Package className="w-3.5 h-3.5" /> {store.product_count}
                  </span>
                  <StatusBadge status={store.subscription_status} onHold={store.on_hold} trialEndsAt={store.trial_ends_at} />
                  <button
                    onClick={() => handleToggleHold(store)}
                    disabled={actionLoading === store.id}
                    title={store.on_hold ? 'Remove hold' : 'Put store on hold'}
                    className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
                      store.on_hold
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-amber-400 hover:border-amber-500/20'
                    }`}
                  >
                    {actionLoading === store.id ? (
                      <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : store.on_hold ? (
                      <PlayCircle className="w-3.5 h-3.5" />
                    ) : (
                      <PauseCircle className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <Link
                    to={`/store/${store.slug}`}
                    target="_blank"
                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    title="Open Storefront"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({
  status,
  onHold,
  trialEndsAt,
}: {
  status: string | null;
  onHold?: boolean;
  trialEndsAt?: string | null;
}) {
  const isTrialExpired = status === 'trialing' && trialEndsAt ? new Date(trialEndsAt) <= new Date() : false;

  if (onHold) {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center gap-1">
        <PauseCircle className="w-3 h-3" /> Store On Hold
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Live Active
      </span>
    );
  }
  if (status === 'trialing') {
    if (isTrialExpired) {
      return (
        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Trial Expired (Offline)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" /> Live Trial
      </span>
    );
  }
  if (status === 'canceled') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center gap-1">
        <PauseCircle className="w-3 h-3" /> Canceled (Offline)
      </span>
    );
  }
  if (status === 'past_due' || status === 'unpaid') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> Payment Due (Offline)
      </span>
    );
  }
  return <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-white/40 border border-white/10">Offline</span>;
}
