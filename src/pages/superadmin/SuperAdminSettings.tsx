import { useEffect, useState } from 'react';
import { saApi } from '../../lib/saApi';
import {
  ToggleLeft, ToggleRight, CheckCircle, AlertTriangle, RefreshCw,
  CreditCard, PlusCircle, Trash2, DollarSign, Clock, Phone, Bell,
  Save, ShieldCheck, KeyRound, Globe, ExternalLink
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

  // Active configuration tab for Paystack (live vs test)
  const [paystackTab, setPaystackTab] = useState<'live' | 'test'>('live');

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

  // Paystack credentials state (Live & Test)
  const [paystackForm, setPaystackForm] = useState({
    paystack_live_payment_url: '',
    paystack_live_public_key: '',
    paystack_live_secret_key: '',
    paystack_live_plan_code: '',
    paystack_test_payment_url: '',
    paystack_test_public_key: '',
    paystack_test_secret_key: '',
    paystack_test_plan_code: '',
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
        setPaystackForm({
          paystack_live_payment_url: data['paystack_live_payment_url'] || '',
          paystack_live_public_key: data['paystack_live_public_key'] || '',
          paystack_live_secret_key: data['paystack_live_secret_key'] || '',
          paystack_live_plan_code: data['paystack_live_plan_code'] || '',
          paystack_test_payment_url: data['paystack_test_payment_url'] || '',
          paystack_test_public_key: data['paystack_test_public_key'] || '',
          paystack_test_secret_key: data['paystack_test_secret_key'] || '',
          paystack_test_plan_code: data['paystack_test_plan_code'] || '',
        });
        if (data['paystack_mode'] === 'live') {
          setPaystackTab('live');
        } else {
          setPaystackTab('test');
        }
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

  const savePaystackCredentials = async (mode: 'live' | 'test') => {
    const prefix = mode === 'live' ? 'paystack_live_' : 'paystack_test_';
    const keysToSave = [
      `${prefix}payment_url`,
      `${prefix}public_key`,
      `${prefix}secret_key`,
      `${prefix}plan_code`,
    ] as const;

    setSavingKey(prefix);
    try {
      for (const key of keysToSave) {
        const val = (paystackForm as any)[key] || '';
        await saApi.updateSetting(key, val);
        setSettings(prev => ({ ...prev, [key]: val }));
      }
      showToast(`${mode.toUpperCase()} Paystack settings saved to database!`, 'ok');
    } catch (err: any) {
      showToast(`Failed to save ${mode} settings: ${err.message}`, 'err');
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
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 ${
            toast.type === 'ok' ? 'bg-slate-900' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">Platform Settings</h1>
          <p className="text-slate-500 text-xs mt-1">Live configuration saved directly to PostgreSQL</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Paystack Gateway & Credentials Manager */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Payment Processor Gateway (Paystack)</h2>
              <p className="text-xs text-slate-500">Configure Live and Sandbox setups with 1-click mode switching</p>
            </div>
          </div>

          {/* Active Mode Toggle Switch */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2 rounded-xl">
            <div className="text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Mode</span>
              <span className={`text-xs font-black ${isLive ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isLive ? '🟢 LIVE' : '🟡 TEST (Sandbox)'}
              </span>
            </div>
            <button
              onClick={togglePaystackMode}
              disabled={savingKey === 'paystack_mode'}
              title={`Click to switch to ${isLive ? 'Test' : 'Live'} mode`}
              className={`transition-all cursor-pointer ${savingKey === 'paystack_mode' ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
            >
              {isLive ? (
                <ToggleRight className="w-9 h-9 text-emerald-600" />
              ) : (
                <ToggleLeft className="w-9 h-9 text-amber-500" />
              )}
            </button>
          </div>
        </div>

        {/* Mode Status Banner */}
        <div className={`rounded-xl p-4 border flex items-start gap-3 ${
          isLive 
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
            : 'bg-amber-50/70 border-amber-200 text-amber-900'
        }`}>
          {isLive ? (
            <ShieldCheck className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-xs space-y-1">
            <p className="font-bold">
              {isLive ? 'Live Production Mode is currently active' : 'Test Sandbox Mode is currently active'}
            </p>
            <p className="text-slate-600">
              {isLive
                ? 'Store owners will be redirected to the LIVE Paystack payment page and charged real money.'
                : 'Store owners will be redirected to the TEST payment page. No real money or Mobile Money will be debited.'}
            </p>
          </div>
        </div>

        {/* Tab switcher: Live Credentials vs Test Credentials */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              onClick={() => setPaystackTab('live')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                paystackTab === 'live'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Live Setup</span>
              {isLive && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            </button>
            <button
              onClick={() => setPaystackTab('test')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                paystackTab === 'test'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Demo / Test Setup</span>
              {!isLive && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
            </button>
          </div>

          {/* Live Setup Form */}
          {paystackTab === 'live' && (
            <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Live Production Setup</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Used when Paystack Mode is set to LIVE</p>
                </div>
                <button
                  onClick={() => savePaystackCredentials('live')}
                  disabled={savingKey === 'paystack_live_'}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingKey === 'paystack_live_' ? 'Saving Live Setup...' : 'Save Live Setup'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Live Payment Page URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://paystack.com/pay/your-live-plan"
                    value={paystackForm.paystack_live_payment_url}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_live_payment_url: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Hosted payment page sellers are redirected to when subscribing in Live mode</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Live Plan Code
                  </label>
                  <input
                    type="text"
                    placeholder="PLN_xxxxxxxxx"
                    value={paystackForm.paystack_live_plan_code}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_live_plan_code: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Subscription plan code from Paystack Dashboard</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Live Public Key
                  </label>
                  <input
                    type="text"
                    placeholder="pk_live_xxxxxxxxx"
                    value={paystackForm.paystack_live_public_key}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_live_public_key: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Live Secret Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk_live_xxxxxxxxx"
                    value={paystackForm.paystack_live_secret_key}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_live_secret_key: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Used for backend transaction verification and webhooks</span>
                </div>
              </div>
            </div>
          )}

          {/* Test Setup Form */}
          {paystackTab === 'test' && (
            <div className="space-y-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Demo / Test Sandbox Setup</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Used when Paystack Mode is set to TEST</p>
                </div>
                <button
                  onClick={() => savePaystackCredentials('test')}
                  disabled={savingKey === 'paystack_test_'}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingKey === 'paystack_test_' ? 'Saving Test Setup...' : 'Save Test Setup'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    Test Payment Page URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://paystack.com/pay/your-test-plan"
                    value={paystackForm.paystack_test_payment_url}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_test_payment_url: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Hosted test payment page URL for sandbox trials</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Test Plan Code
                  </label>
                  <input
                    type="text"
                    placeholder="PLN_test_xxxxxxxxx"
                    value={paystackForm.paystack_test_plan_code}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_test_plan_code: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Test subscription plan code</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Test Public Key
                  </label>
                  <input
                    type="text"
                    placeholder="pk_test_xxxxxxxxx"
                    value={paystackForm.paystack_test_public_key}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_test_public_key: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                    Test Secret Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk_test_xxxxxxxxx"
                    value={paystackForm.paystack_test_secret_key}
                    onChange={(e) => setPaystackForm(prev => ({ ...prev, paystack_test_secret_key: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs outline-none focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Used for backend sandbox verification</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Core Platform Rules & Pricing */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Platform Rules & Subscriptions</h2>
            <p className="text-xs text-slate-500">Configure global subscription prices, trial durations, and platform details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Monthly Price */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Monthly Subscription Price (GHS)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={coreForm.monthly_subscription_price}
                onChange={(e) => setCoreForm({ ...coreForm, monthly_subscription_price: e.target.value })}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                placeholder="200"
              />
              <button
                onClick={() => saveCoreSetting('monthly_subscription_price', coreForm.monthly_subscription_price)}
                disabled={savingKey === 'monthly_subscription_price'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                {savingKey === 'monthly_subscription_price' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Default recurring charge when trial finishes.</p>
          </div>

          {/* Trial Days */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Free Trial Period (Days)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={coreForm.trial_period_days}
                onChange={(e) => setCoreForm({ ...coreForm, trial_period_days: e.target.value })}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                placeholder="14"
              />
              <button
                onClick={() => saveCoreSetting('trial_period_days', coreForm.trial_period_days)}
                disabled={savingKey === 'trial_period_days'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                {savingKey === 'trial_period_days' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Initial free days given to every newly created store.</p>
          </div>

          {/* Support WhatsApp Number */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> Platform Support WhatsApp Number
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={coreForm.support_whatsapp_number}
                onChange={(e) => setCoreForm({ ...coreForm, support_whatsapp_number: e.target.value })}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
                placeholder="233241234567"
              />
              <button
                onClick={() => saveCoreSetting('support_whatsapp_number', coreForm.support_whatsapp_number)}
                disabled={savingKey === 'support_whatsapp_number'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                {savingKey === 'support_whatsapp_number' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Used for platform help and concierge outreach.</p>
          </div>

          {/* Platform Broadcast Announcement */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-slate-400" /> Platform Announcement Banner
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={coreForm.platform_announcement}
                onChange={(e) => setCoreForm({ ...coreForm, platform_announcement: e.target.value })}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500"
                placeholder="Scheduled maintenance tonight at 11 PM GMT"
              />
              <button
                onClick={() => saveCoreSetting('platform_announcement', coreForm.platform_announcement)}
                disabled={savingKey === 'platform_announcement'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                {savingKey === 'platform_announcement' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Shown to all sellers at the top of their store admin dashboard.</p>
          </div>
        </div>
      </div>

      {/* Raw Database Settings Inspector */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">All Database Settings</h3>
            <p className="text-xs text-slate-500">Stored in <code className="text-slate-700 font-mono">superadmin_settings</code></p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Setting
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddSetting} className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-900">New Database Setting Entry</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Key (e.g. currency_symbol)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                required
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500 font-mono"
              />
              <input
                type="text"
                placeholder="Value (e.g. GHS)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                required
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingKey !== null}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Insert Setting
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(settings).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200/80 hover:bg-slate-100/70 transition-all">
                <span className="text-xs font-mono font-bold text-slate-800">{key}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border max-w-xs truncate ${
                    value === 'live' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    value === 'test' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-white text-slate-700 border-slate-200'
                  }`} title={value}>
                    {key.includes('secret') && value ? `${value.slice(0, 7)}...` : value || '<empty>'}
                  </span>
                  {key !== 'paystack_mode' && (
                    <button
                      onClick={() => handleDeleteSetting(key)}
                      disabled={savingKey === key}
                      title="Delete setting"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {Object.keys(settings).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No settings configured in the database yet.</p>
            )}
          </div>
        )}
      </div>

      {/* External Paystack Link */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">External Paystack Merchant Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">Directly inspect Paystack charges, webhooks, and payouts</p>
        </div>
        <a
          href="https://dashboard.paystack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-xs"
        >
          <ExternalLink className="w-4 h-4" /> Open Paystack
        </a>
      </div>
    </div>
  );
}
