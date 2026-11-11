import { useEffect, useState } from 'react';
import { saApi, type SAPayment, type SAStore } from '../../lib/saApi';
import {
  CreditCard, RefreshCw, CheckCircle, Clock, XCircle,
  PlusCircle, Copy, Check, ShieldAlert, ArrowUpRight
} from 'lucide-react';

function PaymentStatusBadge({ status }: { status: string | null }) {
  if (status === 'active') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1 w-fit">
        <CheckCircle className="w-3 h-3" /> Active Paid
      </span>
    );
  }
  if (status === 'trialing') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1 w-fit">
        <Clock className="w-3 h-3" /> In Trial
      </span>
    );
  }
  if (status === 'canceled') {
    return (
      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center gap-1 w-fit">
        <XCircle className="w-3 h-3" /> Canceled
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-white/40 border border-white/10 w-fit">
      {status || 'Unpaid'}
    </span>
  );
}

export function SuperAdminPayments() {
  const [payments, setPayments] = useState<SAPayment[]>([]);
  const [stores, setStores] = useState<SAStore[]>([]);
  const [monthlyPrice, setMonthlyPrice] = useState<number>(200);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // Manual payment modal
  const [showModal, setShowModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subStatus, setSubStatus] = useState('active');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      saApi.getPayments(),
      saApi.getStores(),
      saApi.getSettings().catch(() => ({})),
    ])
      .then(([payData, storeData, settingsData]) => {
        setPayments(payData);
        setStores(storeData);
        const rawSettings = settingsData as Record<string, string>;
        if (rawSettings && rawSettings['monthly_subscription_price']) {
          const p = Number(rawSettings['monthly_subscription_price']);
          if (!isNaN(p) && p > 0) setMonthlyPrice(p);
        }
      })
      .catch(err => showToast(`Failed to load payment records: ${err.message}`, 'err'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !txnRef.trim()) {
      showToast('Store and transaction reference are required', 'err');
      return;
    }

    setSubmitting(true);
    try {
      await saApi.recordPayment({
        store_id: selectedStoreId,
        transaction_reference: txnRef.trim(),
        subscription_code: subCode.trim() || undefined,
        subscription_status: subStatus,
      });

      showToast('Payment record updated in database!', 'ok');
      setShowModal(false);
      setSelectedStoreId('');
      setTxnRef('');
      setSubCode('');
      load();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (storeId: string, newStatus: string) => {
    try {
      await saApi.updateStore(storeId, { subscription_status: newStatus });
      showToast(`Subscription status updated to ${newStatus}`, 'ok');
      load();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'err');
    }
  };

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    const matchSearch =
      p.business_name.toLowerCase().includes(q) ||
      (p.owner_email || '').toLowerCase().includes(q) ||
      (p.paystack_transaction_reference || '').toLowerCase().includes(q) ||
      (p.paystack_subscription_code || '').toLowerCase().includes(q);

    if (statusFilter === 'all') return matchSearch;
    if (statusFilter === 'active') return matchSearch && p.subscription_status === 'active';
    if (statusFilter === 'trialing') return matchSearch && p.subscription_status === 'trialing';
    if (statusFilter === 'canceled') return matchSearch && p.subscription_status === 'canceled';
    return matchSearch;
  });

  const activeCount = payments.filter(p => p.subscription_status === 'active').length;
  const totalRevenue = `GHS ${(activeCount * monthlyPrice).toLocaleString()}`;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast */}
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
          <h1 className="text-3xl font-black text-white tracking-tight">Payments & Subscriptions</h1>
          <p className="text-white/40 text-sm mt-1">Live Paystack transactions and manual billing records</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-xs font-bold transition-all shadow-lg shadow-violet-600/20"
          >
            <PlusCircle className="w-4 h-4" /> Record Payment
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white text-xs font-semibold transition-all hover:bg-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-5">
          <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Paid Stores</p>
          <p className="text-4xl font-black text-emerald-400">{activeCount}</p>
          <p className="text-xs text-white/30 mt-1">Active subscriptions in database</p>
        </div>
        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-5">
          <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Monthly Run Rate</p>
          <p className="text-4xl font-black text-violet-400">{totalRevenue}</p>
          <p className="text-xs text-white/30 mt-1">GHS {monthlyPrice} × {activeCount} paying merchants</p>
        </div>
        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-5">
          <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Recorded Transactions</p>
          <p className="text-4xl font-black text-white">{payments.length}</p>
          <p className="text-xs text-white/30 mt-1">With transaction reference or active billing</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by store name, email, or transaction reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-white/25 text-sm outline-none focus:border-violet-500/50 transition-all"
        />
        <div className="flex items-center gap-2">
          {['all', 'active', 'trialing', 'canceled'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold capitalize transition-all ${
                statusFilter === f
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-white/[0.03] border border-white/8 text-white/40 hover:text-white/70'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.01]">
                <th className="px-5 py-3.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Store</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Owner Email</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Status</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Paystack Reference</th>
                <th className="px-5 py-3.5 text-[10px] font-bold text-white/30 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-5 py-4"><div className="h-3 bg-white/5 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-white/25 text-sm">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.store_id} className="hover:bg-white/[0.02] transition-all">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-white">{p.business_name}</p>
                      <a
                        href={`/store/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-violet-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        /{p.slug} <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-5 py-4 text-xs text-white/60">{p.owner_email || '—'}</td>
                    <td className="px-5 py-4">
                      <PaymentStatusBadge status={p.subscription_status} />
                    </td>
                    <td className="px-5 py-4">
                      {p.paystack_transaction_reference ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-white/70 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                            {p.paystack_transaction_reference}
                          </span>
                          <button
                            onClick={() => handleCopy(p.paystack_transaction_reference!)}
                            title="Copy reference"
                            className="text-white/40 hover:text-white transition-colors"
                          >
                            {copiedRef === p.paystack_transaction_reference ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-white/30 italic">No ref logged</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {p.subscription_status !== 'active' ? (
                          <button
                            onClick={() => handleQuickStatusChange(p.store_id, 'active')}
                            className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
                          >
                            Mark Active
                          </button>
                        ) : (
                          <button
                            onClick={() => handleQuickStatusChange(p.store_id, 'canceled')}
                            className="px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all"
                          >
                            Cancel Sub
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-violet-400" />
                <h3 className="text-lg font-black text-white">Record Manual Payment</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase">Select Merchant Store</label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  required
                  className="w-full mt-1.5 bg-[#181822] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-violet-500"
                >
                  <option value="">-- Choose a store --</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.business_name} ({s.slug}) — {s.subscription_status || 'unpaid'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase">Transaction Reference</label>
                <input
                  type="text"
                  placeholder="e.g. MOMO_928374 or T829103847"
                  value={txnRef}
                  onChange={(e) => setTxnRef(e.target.value)}
                  required
                  className="w-full mt-1.5 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase">Paystack Subscription Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SUB_xxxxxx"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="w-full mt-1.5 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase">Set Subscription Status</label>
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value)}
                  className="w-full mt-1.5 bg-[#181822] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-violet-500"
                >
                  <option value="active">Active (Paid)</option>
                  <option value="trialing">Trialing</option>
                  <option value="past_due">Past Due</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-violet-600/30"
                >
                  {submitting ? (
                    <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Save Payment Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
