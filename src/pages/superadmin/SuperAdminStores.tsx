import { useEffect, useState } from 'react';
import { saApi, type SAStore, type SAProduct } from '../../lib/saApi';
import { StatusBadge } from './SuperAdminDashboard';
import {
  Store, Search, Package, Phone, ExternalLink,
  CheckCircle, XCircle, PauseCircle, PlayCircle, RefreshCw,
  Edit3, Trash2, ShieldAlert, Save, X, PlusCircle
} from 'lucide-react';

export function SuperAdminStores() {
  const [stores, setStores] = useState<SAStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedStore, setSelectedStore] = useState<SAStore | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<SAStore>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Store products preview
  const [storeProducts, setStoreProducts] = useState<SAProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const load = () => {
    setLoading(true);
    saApi.getStores()
      .then(data => {
        setStores(data);
        if (selectedStore) {
          const updated = data.find(s => s.id === selectedStore.id);
          if (updated) setSelectedStore(updated);
        }
      })
      .catch(err => showToast(`Failed to load stores: ${err.message}`, 'err'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // When store is selected, load its detailed products
  const handleSelectStore = async (store: SAStore) => {
    setSelectedStore(store);
    setIsEditing(false);
    setEditForm({
      business_name: store.business_name,
      slug: store.slug,
      whatsapp_number: store.whatsapp_number,
      subscription_status: store.subscription_status || 'trialing',
      paystack_transaction_reference: store.paystack_transaction_reference || '',
      paystack_subscription_code: store.paystack_subscription_code || '',
    });

    setLoadingProducts(true);
    try {
      const detailed = await saApi.getStore(store.id);
      setSelectedStore(detailed);
      setStoreProducts(detailed.products || []);
    } catch {
      setStoreProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleQuickAction = async (action: 'activate' | 'cancel' | 'hold' | 'unhold') => {
    if (!selectedStore) return;
    setActionLoading(action);
    try {
      let patch: Partial<SAStore> = {};
      if (action === 'activate') patch = { subscription_status: 'active' };
      else if (action === 'cancel') patch = { subscription_status: 'canceled' };
      else if (action === 'hold') patch = { on_hold: true };
      else if (action === 'unhold') patch = { on_hold: false };

      const updated = await saApi.updateStore(selectedStore.id, patch);
      setStores(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      setSelectedStore(prev => prev ? { ...prev, ...updated } : prev);
      showToast(`Store updated: ${action.toUpperCase()}`, 'ok');
    } catch (err: any) {
      showToast(`Action failed: ${err.message}`, 'err');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendTrial = async (days: number) => {
    if (!selectedStore) return;
    setActionLoading(`extend-${days}`);
    try {
      const updated = await saApi.extendTrial(selectedStore.id, days);
      setStores(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      setSelectedStore(prev => prev ? { ...prev, ...updated } : prev);
      showToast(`Trial extended by +${days} days!`, 'ok');
    } catch (err: any) {
      showToast(`Failed to extend trial: ${err.message}`, 'err');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedStore) return;
    setSaveLoading(true);
    try {
      const updated = await saApi.updateStore(selectedStore.id, editForm);
      setStores(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
      setSelectedStore(prev => prev ? { ...prev, ...updated } : prev);
      setIsEditing(false);
      showToast('Store details saved to database!', 'ok');
    } catch (err: any) {
      showToast(`Failed to save: ${err.message}`, 'err');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteStore = async () => {
    if (!selectedStore) return;
    if (deleteConfirmText.trim() !== selectedStore.slug) {
      showToast(`Please type "${selectedStore.slug}" to confirm deletion.`, 'err');
      return;
    }

    setDeleteLoading(true);
    try {
      await saApi.deleteStore(selectedStore.id);
      showToast(`Store "${selectedStore.business_name}" deleted.`, 'ok');
      setStores(prev => prev.filter(s => s.id !== selectedStore.id));
      setSelectedStore(null);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'err');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = stores.filter(s => {
    const q = search.toLowerCase();
    const matchSearch =
      s.business_name.toLowerCase().includes(q) ||
      (s.owner_email || '').toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      (s.whatsapp_number || '').includes(q);

    if (filterStatus === 'all') return matchSearch;
    const isTrial = s.trial_ends_at ? new Date(s.trial_ends_at) > new Date() : false;
    const isLiveActive = !s.on_hold && s.subscription_status === 'active';
    const isLiveTrial = !s.on_hold && s.subscription_status === 'trialing' && isTrial;
    const isPastDueOrUnpaid = ['past_due', 'unpaid', 'canceled'].includes(s.subscription_status || '');
    const isOffline = s.on_hold || isPastDueOrUnpaid || (!isLiveActive && !isLiveTrial);

    if (filterStatus === 'active') return matchSearch && isLiveActive;
    if (filterStatus === 'trialing') return matchSearch && isLiveTrial;
    if (filterStatus === 'hold') return matchSearch && s.on_hold;
    if (filterStatus === 'inactive') return matchSearch && (isOffline && !s.on_hold);
    return matchSearch;
  });

  const isSelectedStoreTrialActive = selectedStore?.trial_ends_at ? new Date(selectedStore.trial_ends_at) > new Date() : false;
  const isSelectedStorePaymentDue = ['canceled', 'past_due', 'unpaid'].includes(selectedStore?.subscription_status || '');
  const isSelectedStoreLive = selectedStore
    ? !selectedStore.on_hold && !isSelectedStorePaymentDue && (selectedStore.subscription_status === 'active' || isSelectedStoreTrialActive)
    : false;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 ${
            toast.type === 'ok' ? 'bg-violet-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Merchant Stores</h1>
          <p className="text-white/40 text-sm mt-1">Live read, write, and database mutation</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white text-xs font-semibold transition-all hover:bg-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search by store name, slug, email, or WhatsApp phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 text-sm outline-none focus:border-violet-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['all', 'active', 'trialing', 'hold', 'inactive'].map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold capitalize transition-all ${
                filterStatus === f
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-white/[0.03] border border-white/8 text-white/40 hover:text-white/70'
              }`}
            >
              {f === 'all' ? 'All Stores' : f === 'hold' ? 'On Hold' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Stores List (7 cols) */}
        <div className="lg:col-span-7 bg-white/[0.02] border border-white/8 rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              {filtered.length} Store{filtered.length === 1 ? '' : 's'} Found
            </span>
            <span className="text-xs text-white/30">Click a store to inspect & edit</span>
          </div>

          <div className="divide-y divide-white/5 max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/5 rounded w-2/5" />
                    <div className="h-2 bg-white/5 rounded w-1/3" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="px-5 py-16 text-center text-white/30 text-sm">No stores match your search or filter.</div>
            ) : (
              filtered.map((store) => (
                <div
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={`px-5 py-4 flex items-center gap-4 cursor-pointer transition-all ${
                    selectedStore?.id === store.id
                      ? 'bg-violet-500/10 border-l-4 border-violet-500'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
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
                      <Package className="w-3 h-3" /> {store.product_count}
                    </span>
                    <StatusBadge
                      status={store.subscription_status}
                      onHold={store.on_hold}
                      trialEndsAt={store.trial_ends_at}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail & Mutation Panel (5 cols) */}
        <div className="lg:col-span-5 bg-white/[0.02] border border-white/8 rounded-3xl p-6 flex flex-col h-fit">
          {selectedStore ? (
            <div className="space-y-6">
              {/* Header of Detail */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                    <Store className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-lg">{selectedStore.business_name}</h3>
                    <p className="text-xs text-violet-400 font-mono">/{selectedStore.slug}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isEditing
                      ? 'bg-white/10 text-white'
                      : 'bg-violet-500/15 text-violet-300 border border-violet-500/25 hover:bg-violet-500/25'
                  }`}
                >
                  {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  {isEditing ? 'Cancel' : 'Edit Database'}
                </button>
              </div>

              {/* Edit Mode vs View Mode */}
              {isEditing ? (
                <div className="space-y-4 bg-white/[0.02] p-4 rounded-2xl border border-white/8">
                  <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wider">Update Store Fields</h4>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase">Business Name</label>
                    <input
                      type="text"
                      value={editForm.business_name || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, business_name: e.target.value }))}
                      className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase">Store Slug (URL)</label>
                    <input
                      type="text"
                      value={editForm.slug || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, slug: e.target.value }))}
                      className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase">WhatsApp Number</label>
                    <input
                      type="text"
                      value={editForm.whatsapp_number || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, whatsapp_number: e.target.value }))}
                      className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase">Subscription Status</label>
                    <select
                      value={editForm.subscription_status || 'trialing'}
                      onChange={(e) => setEditForm(prev => ({ ...prev, subscription_status: e.target.value }))}
                      className="w-full mt-1 bg-[#14141d] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500"
                    >
                      <option value="trialing">trialing</option>
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="unpaid">unpaid</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase">Paystack Txn Reference</label>
                    <input
                      type="text"
                      placeholder="Optional reference"
                      value={editForm.paystack_transaction_reference || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, paystack_transaction_reference: e.target.value }))}
                      className="w-full mt-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500 font-mono"
                    />
                  </div>

                  <button
                    onClick={handleSaveEdit}
                    disabled={saveLoading}
                    className="w-full mt-3 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-violet-600/20"
                  >
                    {saveLoading ? (
                      <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save Changes to Database
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: 'Store ID', value: selectedStore.id },
                    { label: 'Owner Email', value: selectedStore.owner_email || '—' },
                    { label: 'WhatsApp', value: selectedStore.whatsapp_number || '—', icon: Phone },
                    { label: 'Products', value: `${selectedStore.product_count} items`, icon: Package },
                    { label: 'Status', value: selectedStore.subscription_status || 'inactive' },
                    {
                      label: 'Trial Ends',
                      value: selectedStore.trial_ends_at
                        ? new Date(selectedStore.trial_ends_at).toLocaleDateString()
                        : '—'
                    },
                    { label: 'Sub Code', value: selectedStore.paystack_subscription_code || '—' },
                    {
                      label: 'Txn Ref',
                      value: selectedStore.paystack_transaction_reference
                        ? `${selectedStore.paystack_transaction_reference.slice(0, 22)}...`
                        : '—'
                    },
                    { label: 'Registered', value: new Date(selectedStore.created_at).toLocaleDateString() },
                  ].map(item => (
                    <div key={item.label} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider flex-shrink-0 mt-0.5">
                        {item.label}
                      </span>
                      <span className="text-white/80 font-semibold text-right font-mono break-all">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Live Storefront Status Banner */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 text-xs ${
                  isSelectedStoreLive
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : selectedStore.on_hold
                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isSelectedStoreLive
                      ? 'bg-emerald-400 animate-pulse'
                      : selectedStore.on_hold
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                />
                <div className="flex-1">
                  <p className="font-bold">
                    {isSelectedStoreLive
                      ? 'Storefront is LIVE for Customers'
                      : selectedStore.on_hold
                      ? 'Storefront & Account are ON HOLD'
                      : 'Storefront is OFFLINE (Unpaid / Expired)'}
                  </p>
                  <p className="text-[11px] opacity-75 mt-0.5">
                    {isSelectedStoreLive
                      ? 'Customers can browse products and checkout on WhatsApp.'
                      : selectedStore.on_hold
                      ? `Visitors at /store/${selectedStore.slug} see the On-Hold holding screen.`
                      : 'Trial ended or subscription unpaid. Public catalog is paused.'}
                  </p>
                </div>
              </div>

              {/* View Storefront Link */}
              <a
                href={`/store/${selectedStore.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 py-2.5 rounded-xl hover:bg-violet-500/20 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View Public Storefront (Live Preview)
              </a>

              {/* Quick Action Buttons */}
              <div className="space-y-2 border-t border-white/8 pt-4">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">
                  Quick Database Actions
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleQuickAction('activate')}
                    disabled={!!actionLoading || selectedStore.subscription_status === 'active'}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all disabled:opacity-40"
                  >
                    {actionLoading === 'activate' ? (
                      <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    Activate
                  </button>

                  <button
                    onClick={() => handleQuickAction('cancel')}
                    disabled={!!actionLoading || selectedStore.subscription_status === 'canceled'}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-40"
                  >
                    {actionLoading === 'cancel' ? (
                      <div className="w-3 h-3 border border-rose-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    Cancel Sub
                  </button>

                  <button
                    onClick={() => handleQuickAction('hold')}
                    disabled={!!actionLoading || selectedStore.on_hold}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40"
                  >
                    {actionLoading === 'hold' ? (
                      <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <PauseCircle className="w-3.5 h-3.5" />
                    )}
                    Put on Hold
                  </button>

                  <button
                    onClick={() => handleQuickAction('unhold')}
                    disabled={!!actionLoading || !selectedStore.on_hold}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40"
                  >
                    {actionLoading === 'unhold' ? (
                      <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    Remove Hold
                  </button>
                </div>

                {/* Extend Trial */}
                <div className="pt-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase whitespace-nowrap">Extend Trial:</span>
                  {[7, 14, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => handleExtendTrial(days)}
                      disabled={!!actionLoading}
                      className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-[11px] font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3 text-violet-400" />
                      +{days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Products in Store Preview */}
              <div className="border-t border-white/8 pt-4 space-y-2">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">
                  Catalog Items ({storeProducts.length})
                </span>
                {loadingProducts ? (
                  <div className="space-y-1">
                    {[...Array(2)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
                  </div>
                ) : storeProducts.length === 0 ? (
                  <p className="text-xs text-white/30 italic">No products created by this merchant yet.</p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {storeProducts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                        <span className="text-white/80 truncate max-w-[200px]">{p.name}</span>
                        <span className="text-violet-400 font-mono font-bold">GHS {Number(p.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger Zone: Delete Store */}
              <div className="border-t border-rose-500/20 pt-4">
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Store from Database
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-24 text-white/20 text-center">
              <Store className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-semibold">Select a store from the list to view and mutate database records</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedStore && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">Permanently Delete Store?</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              This will remove <strong className="text-white">{selectedStore.business_name}</strong> and cascade delete all its products, categories, and merchant permissions from the database. This action cannot be undone.
            </p>
            <div>
              <label className="text-[10px] font-bold text-white/40 uppercase">
                Type <strong className="text-rose-400 font-mono">{selectedStore.slug}</strong> to confirm:
              </label>
              <input
                type="text"
                placeholder={selectedStore.slug}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full mt-1.5 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-rose-500 font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStore}
                disabled={deleteLoading || deleteConfirmText.trim() !== selectedStore.slug}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {deleteLoading ? (
                  <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
