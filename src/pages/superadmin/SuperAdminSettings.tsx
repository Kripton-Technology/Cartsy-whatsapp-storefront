import { useEffect, useState } from 'react';
import { saApi } from '../../lib/saApi';
import {
  Settings, ToggleLeft, ToggleRight, CheckCircle, AlertTriangle, RefreshCw,
  CreditCard, Link as LinkIcon, PlusCircle, Trash2, DollarSign, Clock, Phone, Bell
} from 'lucide-react';

export function SuperAdminSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // New setting modal/form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Core settings form state
  const [coreForm, setCoreForm] = useState<{
    monthly_subscription_price: string;
    trial_period_days: string;
    support_whatsapp_number: string;
    platform_announcement: string;
  }>({
    monthly_subscription_price: '200',
    trial_period_days: '14',
    support_whatsapp_number: '',
    platform_announcement: '',
  });

  const load = () => {
    setLoading(true);
    saApi.getSettings()
      .then(data => {
        setSettings(data);
        setCoreForm({
          monthly_subscription_price: data['monthly_subscription_price'] || '200',
          trial_period_days: data['trial_period_days'] || '14',
          support_whatsapp_number: data['support_whatsapp_number'] || '',
          platform_announcement: data['platform_announcement'] || '',
        });
      })
      .catch(err => showToast(`Failed to load settings: ${err.message}`, 'err'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const paystackMode = settings['paystack_mode'] || 'test';
  const isLive = paystackMode === 'live';

  const togglePaystackMode = async () => {
    const newMode = isLive ? 'test' : 'live';
    setSavingKey('paystack_mode');
    try {
      await saApi.updateSetting('paystack_mode', newMode);
      setSettings(prev => ({ ...prev, paystack_mode: newMode }));
      showToast(`Paystack switched to ${newMode.toUpperCase()} mode`, 'ok');
    } catch (err: any) {
      showToast(err.message, 'err');
    } finally {
      setSavingKey(null);
    }
  };

  const saveCoreSetting = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await saApi.updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
      showToast(`Saved ${key} to database`, 'ok');
    } catch (err: any) {
      showToast(`Failed to save: ${err.message}`, 'err');
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleanKey) {
      showToast('Setting key is required', 'err');
      return;
    }

    setSavingKey(cleanKey);
    try {
      await saApi.updateSetting(cleanKey, newValue.trim());
      setSettings(prev => ({ ...prev, [cleanKey]: newValue.trim() }));
      setNewKey('');
      setNewValue('');
      setShowAddForm(false);
      showToast(`Added "${cleanKey}" to database`, 'ok');
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'err');
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm(`Are you sure you want to delete setting "${key}"?`)) return;
    setSavingKey(key);
    try {
      await saApi.deleteSetting(key);
      setSettings(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      showToast(`Deleted "${key}"`, 'ok');
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'err');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 ${
            toast.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Platform Settings</h1>
          <p className="text-white/40 text-sm mt-1">Live configuration saved directly to PostgreSQL</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white text-xs font-semibold transition-all hover:bg-white/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Paystack Mode Toggle Card */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-white/8">
          <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">Payment Processor Gateway (Paystack)</h2>
            <p className="text-xs text-white/35">Toggle between Sandbox Test and Production Live payments</p>
          </div>
        </div>

        {loading ? (
          <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
        ) : (
          <div className={`rounded-2xl p-5 border transition-all ${isLive ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-amber-500/8 border-amber-500/25'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-black text-white text-base">
                  {isLive ? '🟢 LIVE Production Mode' : '🟡 TEST Sandbox Mode'}
                </p>
                <p className="text-xs text-white/40 mt-0.5">
                  {isLive
                    ? 'Customers are charged real money via Live Paystack API keys.'
                    : 'Sandbox simulated payments. No real cards or Mobile Money will be debited.'}
                </p>
              </div>
              <button
                onClick={togglePaystackMode}
                disabled={savingKey === 'paystack_mode'}
                className={`flex-shrink-0 transition-all ${savingKey === 'paystack_mode' ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
              >
                {isLive ? (
                  <ToggleRight className="w-12 h-12 text-emerald-400" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-amber-400" />
                )}
              </button>
            </div>

            <button
              onClick={togglePaystackMode}
              disabled={savingKey === 'paystack_mode'}
              className={`w-full py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                isLive
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
              } disabled:opacity-50`}
            >
              {savingKey === 'paystack_mode' ? (
                <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Updating Database...</>
              ) : isLive ? (
                '⬅ Switch Database to TEST Mode'
              ) : (
                '⬆ Switch Database to LIVE Mode'
              )}
            </button>
          </div>
        )}

        {isLive && !loading && (
          <div className="bg-rose-500/8 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-300">Live Gateway is Active</p>
              <p className="text-xs text-rose-400/70 mt-1">
                Make sure the live Paystack credentials (<code className="bg-white/5 px-1 rounded">PAYSTACK_SECRET_KEY</code>) match your live business account.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Core Platform Rules & Pricing */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-white/8">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">Platform Defaults & Parameters</h2>
            <p className="text-xs text-white/35">Configured values used across storefronts and merchant admin</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Monthly Price */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-2">
            <div className="flex items-center gap-2 text-white/60 text-xs font-bold">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Monthly Subscription Fee (GHS)
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={coreForm.monthly_subscription_price}
                onChange={(e) => setCoreForm(prev => ({ ...prev, monthly_subscription_price: e.target.value }))}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500 font-mono"
              />
              <button
                onClick={() => saveCoreSetting('monthly_subscription_price', coreForm.monthly_subscription_price)}
                disabled={savingKey === 'monthly_subscription_price'}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {savingKey === 'monthly_subscription_price' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Trial Days */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-2">
            <div className="flex items-center gap-2 text-white/60 text-xs font-bold">
              <Clock className="w-4 h-4 text-blue-400" />
              Default Trial Period (Days)
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={coreForm.trial_period_days}
                onChange={(e) => setCoreForm(prev => ({ ...prev, trial_period_days: e.target.value }))}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500 font-mono"
              />
              <button
                onClick={() => saveCoreSetting('trial_period_days', coreForm.trial_period_days)}
                disabled={savingKey === 'trial_period_days'}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {savingKey === 'trial_period_days' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Support WhatsApp */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-2">
            <div className="flex items-center gap-2 text-white/60 text-xs font-bold">
              <Phone className="w-4 h-4 text-emerald-400" />
              SuperAdmin Support WhatsApp
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 233205957329"
                value={coreForm.support_whatsapp_number}
                onChange={(e) => setCoreForm(prev => ({ ...prev, support_whatsapp_number: e.target.value }))}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500 font-mono"
              />
              <button
                onClick={() => saveCoreSetting('support_whatsapp_number', coreForm.support_whatsapp_number)}
                disabled={savingKey === 'support_whatsapp_number'}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {savingKey === 'support_whatsapp_number' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Announcement */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-2">
            <div className="flex items-center gap-2 text-white/60 text-xs font-bold">
              <Bell className="w-4 h-4 text-amber-400" />
              Broadcast System Announcement
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional alert shown to merchants"
                value={coreForm.platform_announcement}
                onChange={(e) => setCoreForm(prev => ({ ...prev, platform_announcement: e.target.value }))}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-violet-500"
              />
              <button
                onClick={() => saveCoreSetting('platform_announcement', coreForm.platform_announcement)}
                disabled={savingKey === 'platform_announcement'}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {savingKey === 'platform_announcement' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Database Settings Table */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-black text-white">All Database Key-Value Records</h2>
            <p className="text-xs text-white/35">Stored in <code className="text-violet-400">superadmin_settings</code></p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-300 hover:bg-violet-600/25 text-xs font-bold transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Setting
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddSetting} className="mb-4 p-4 rounded-2xl bg-white/[0.03] border border-violet-500/30 space-y-3">
            <h4 className="text-xs font-bold text-violet-300">New Database Setting Entry</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Key (e.g. currency_symbol)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                required
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500 font-mono"
              />
              <input
                type="text"
                placeholder="Value (e.g. GHS)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                required
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-violet-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-white/50 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingKey !== null}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Insert Setting
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(settings).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3 bg-white/[0.03] rounded-xl border border-white/8 hover:bg-white/[0.04] transition-all">
                <span className="text-xs font-mono font-bold text-violet-300">{key}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-semibold px-3 py-1 rounded-lg ${
                    value === 'live' ? 'bg-emerald-500/15 text-emerald-400' :
                    value === 'test' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-white/5 text-white/70'
                  }`}>
                    {value}
                  </span>
                  {key !== 'paystack_mode' && (
                    <button
                      onClick={() => handleDeleteSetting(key)}
                      disabled={savingKey === key}
                      title="Delete setting"
                      className="p-1.5 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {Object.keys(settings).length === 0 && (
              <p className="text-xs text-white/25 text-center py-6">No settings configured in the database yet.</p>
            )}
          </div>
        )}
      </div>

      {/* External Paystack Link */}
      <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-6 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">External Paystack Merchant Dashboard</h2>
          <p className="text-xs text-white/35 mt-0.5">Directly inspect Paystack charges, webhooks, and payouts</p>
        </div>
        <a
          href="https://dashboard.paystack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-[#00C3F7]/10 border border-[#00C3F7]/25 text-[#00C3F7] text-xs font-bold rounded-xl hover:bg-[#00C3F7]/20 transition-all shadow-md shadow-[#00C3F7]/10"
        >
          <LinkIcon className="w-4 h-4" /> Open Paystack
        </a>
      </div>
    </div>
  );
}
