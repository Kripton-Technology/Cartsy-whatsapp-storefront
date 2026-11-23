import { useState, useEffect } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { adminApi } from '../../lib/api';
import { CreditCard, CheckCircle, AlertTriangle, Calendar, Clock, Sparkles, GraduationCap } from 'lucide-react';

export function Billing() {
  const { store, refetch } = useStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
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
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifyRef, setVerifyRef] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [claimingCode, setClaimingCode] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadBillingStatus();
  }, [store?.id]);

  async function loadBillingStatus() {
    try {
      setLoading(true);
      const data = await adminApi.getBillingStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('[Billing] Error loading status:', err);
      setError('Failed to load billing status.');
    } finally {
      setLoading(false);
    }
  }

  const handleClaimCode = async () => {
    if (!accessCode.trim()) return;
    setError(null);
    setClaimSuccess(null);
    setClaimingCode(true);

    try {
      const res = await adminApi.claimAccessCode(accessCode.trim());
      setClaimSuccess(`Sponsored by ${res.institution_name}! You now have 6 months free access.`);
      setAccessCode('');
      await loadBillingStatus();
      await refetch();
    } catch (err: any) {
      console.error('[Claim Code] Error:', err);
      setError(err.message || 'Failed to claim access code.');
    } finally {
      setClaimingCode(false);
    }
  };

  const loadPaystackScript = () => {
    return new Promise<boolean>((resolve) => {
      if ((window as any).PaystackPop) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v2/inline.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async () => {
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      // 1. Initialize subscription on backend
      const data = await adminApi.subscribe();

      if (data.authorization_url && !data.access_code) {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
          || (window.navigator as any).standalone 
          || document.referrer.includes('android-app://');

        if (isStandalone) {
          // In standalone app mode, redirect directly to prevent popup blocking
          window.location.href = data.authorization_url;
        } else {
          // Standard browser: try opening a new tab
          const opened = window.open(data.authorization_url, '_blank');
          if (!opened) {
            // Popup blocker active, fallback to direct redirect
            window.location.href = data.authorization_url;
          } else {
            setInfo('Redirected to the hosted subscription payment page in a new tab. Please complete the subscription payment there. Once paid, refresh this page to update your status.');
          }
        }
        setSubmitting(false);
        return;
      }

      console.log('[Paystack Setup] Resuming transaction with access_code:', data.access_code);

      // 2. Load Paystack Inline script (only needed if using popup/inline flow)
      const scriptLoaded = await loadPaystackScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Paystack payment gateway. Please check your internet connection.');
      }

      // 3. Open Paystack Inline Pop V2
      const popup = new (window as any).PaystackPop();
      popup.resumeTransaction(data.access_code, {
        onSuccess: async (response: any) => {
          console.log('[Paystack Success]', response);
          // Wait 2 seconds for webhook processing, then refetch
          setTimeout(async () => {
            await refetch();
            await loadBillingStatus();
            window.location.reload();
          }, 2000);
        },
        onCancel: () => {
          setSubmitting(false);
        }
      });
    } catch (err: any) {
      console.error('[Billing] Subscription error:', err);
      setError(err.message || 'An error occurred while setting up subscription.');
      setSubmitting(false);
    }
  };

  const handleVerifyReference = async () => {
    if (!verifyRef.trim()) return;
    setError(null);
    setInfo(null);
    setVerifying(true);

    try {
      const res = await adminApi.verifySubscription(verifyRef.trim());
      if (res.success) {
        setInfo(res.message || 'Payment verified successfully! Your subscription is now active.');
        setVerifyRef('');
        const data = await adminApi.getBillingStatus();
        setStatus(data);
        await refetch();
      } else {
        setError(res.message || 'Failed to verify payment. Please check your reference and try again.');
      }
    } catch (err: any) {
      console.error('[Billing Verify] Error:', err);
      setError(err.message || 'Failed to verify payment reference. Please ensure it is a valid reference.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-b-emerald-600"></div>
      </div>
    );
  }

  const isExpired = status ? !status.is_active : false;
  const isTrial = status?.subscription_status === 'trialing';

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">Billing & Plan</h1>
        <p className="text-slate-500 mt-2">Manage your premium SaaS store subscription</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
          <div>
            <h4 className="font-bold text-slate-900">Action Required</h4>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {info && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          <div>
            <h4 className="font-bold text-slate-900">Payment Redirected</h4>
            <p className="text-sm mt-0.5">{info}</p>
          </div>
        </div>
      )}

      {claimSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800">
          <GraduationCap className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          <div>
            <h4 className="font-bold text-slate-900">Institution Sponsorship Activated</h4>
            <p className="text-sm mt-0.5">{claimSuccess}</p>
          </div>
        </div>
      )}

      {/* Sponsored Banner if active */}
      {status?.is_sponsored && (
        <div className="mb-8 p-6 bg-emerald-50/70 border border-emerald-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center shrink-0 shadow-xs">
              <GraduationCap className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Sponsored Program
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mt-1">
                Powered by {status.institution_name || 'Partner Institution'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Full 6-month graduate sponsorship. No payment required during sponsorship.
              </p>
            </div>
          </div>
          <div className="sm:text-right">
            <span className="text-2xl font-black text-slate-900 font-display">
              {status.days_left} days left
            </span>
            <p className="text-xs text-slate-500">
              Expires {status.sponsored_expires_at ? new Date(status.sponsored_expires_at).toLocaleDateString() : 'soon'}
            </p>
          </div>
        </div>
      )}

      {/* Main Billing Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Plan Details Card */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="px-3 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full uppercase tracking-wider">
                  {isTrial ? 'Trial Version' : 'Professional Plan'}
                </span>
                <h2 className="text-2xl font-bold text-slate-900 mt-3 font-display">WhatsApp Premium Merchant</h2>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-slate-900 font-display">GHS 200</span>
                <span className="text-slate-500 text-sm"> / month</span>
              </div>
            </div>

            <p className="text-slate-500 mb-8 leading-relaxed text-sm">
              Unlock unlimited products, automated WhatsApp catalog sync, direct checkout routing, and customized layout styling.
            </p>

            <div className="space-y-3.5 mb-8">
              {[
                'Unlimited products and categories',
                'Instantly route orders to WhatsApp',
                'Full store customizations and logos',
                'Advanced customer checkout flows',
                'Secure payment routing via Paystack',
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-slate-700">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            {status?.subscription_status === 'active' ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Your subscription is active and in good standing.</p>
                  {status.paystack_subscription_code && (
                    <p className="text-xs text-emerald-600 mt-0.5">Code: {status.paystack_subscription_code}</p>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={submitting}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Initializing Security Gateway...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Activate Subscription (GHS 200 / Month)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Subscription Status Details */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-6 font-display">Status Overview</h3>

            <div className="space-y-6">
              {/* Account Status Detail */}
              <div>
                <span className="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Account Status</span>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${status?.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                  <span className="font-bold text-slate-900 capitalize">
                    {status?.is_sponsored
                      ? 'Sponsored'
                      : status?.subscription_status === 'trialing'
                      ? 'Free Trial'
                      : status?.subscription_status || 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Time Remaining */}
              {(status?.is_sponsored ? status?.sponsored_expires_at : status?.trial_ends_at) && (
                <div>
                  <span className="text-xs text-slate-500 block font-semibold uppercase tracking-wider">
                    {status?.is_sponsored
                      ? 'Sponsorship Remaining'
                      : isExpired
                      ? 'Trial Expired'
                      : 'Trial Period Remaining'}
                  </span>
                  <div className="flex items-center gap-2.5 mt-2">
                    <Clock className={`w-5 h-5 ${isExpired ? 'text-rose-500' : 'text-emerald-600'}`} />
                    <span className="font-extrabold text-slate-900 text-lg font-display">
                      {status?.days_left} {status?.days_left === 1 ? 'day' : 'days'} left
                    </span>
                  </div>
                </div>
              )}

              {/* Renewal Date */}
              {(status?.is_sponsored ? status?.sponsored_expires_at : status?.trial_ends_at) && (
                <div>
                  <span className="text-xs text-slate-500 block font-semibold uppercase tracking-wider">
                    {status?.is_sponsored ? 'Sponsored Until' : isExpired ? 'Ended On' : 'Trial Ends On'}
                  </span>
                  <div className="flex items-center gap-2.5 mt-2 text-slate-700">
                    <Calendar className="w-5 h-5 text-slate-400" />
                    <span className="text-sm font-semibold">
                      {new Date(
                        (status?.is_sponsored ? status?.sponsored_expires_at : status?.trial_ends_at) as string
                      ).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isExpired && (
            <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-800">
              <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs leading-normal">
                Subscriptions are billed in local GHS currency. Make a payment today to unlock editing your products and storefront features instantly.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Have an Institution Code? */}
      {!status?.is_sponsored && (
        <div className="mt-8 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900 font-display">Have an Institution Access Code?</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            If you graduated from a partner school or institution, enter your code below to activate 6 months of free sponsored access.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="e.g., KNUST-2025-A1B2"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 font-mono tracking-wider"
            />
            <button
              onClick={handleClaimCode}
              disabled={claimingCode || !accessCode.trim()}
              className="px-6 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-slate-800 shadow-xs"
            >
              {claimingCode ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Validating...</span>
                </>
              ) : (
                'Claim Sponsorship'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Verify Transaction Reference Fallback */}
      {status?.subscription_status !== 'active' && (
        <div className="mt-8 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <h3 className="text-lg font-bold text-slate-900 mb-2 font-display">Already paid?</h3>
          <p className="text-xs text-slate-500 mb-4">
            If you have completed your payment on Paystack but your subscription status hasn't updated, please enter your transaction reference below to verify it manually.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="e.g., T123456789012345"
              value={verifyRef}
              onChange={(e) => setVerifyRef(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500"
            />
            <button
              onClick={handleVerifyReference}
              disabled={verifying || !verifyRef.trim()}
              className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xs"
            >
              {verifying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent"></div>
                  <span>Verifying...</span>
                </>
              ) : (
                'Verify Payment'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
