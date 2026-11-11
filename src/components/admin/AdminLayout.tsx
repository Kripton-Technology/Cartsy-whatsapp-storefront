import { Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { ThemeToggle } from '../ThemeToggle';
import {
    LayoutDashboard,
    Package,
    Tags,
    Settings,
    LogOut,
    Store,
    Eye,
    UserCircle,
    CreditCard,
    ShieldAlert,
    Megaphone,
    X,
    Calendar,
} from 'lucide-react';

export function AdminLayout() {
    const { user, loading: authLoading, signOut } = useAuth();
    const { store, stores, loading: storeLoading, isSubscriptionActive, isOnHold, daysLeftOfTrial, subscriptionStatus } = useStore();
    const location = useLocation();
    const navigate = useNavigate();

    // ── Platform announcement banner ──────────────────────────────────────────
    const [announcement, setAnnouncement] = useState<string>('');
    const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

    useEffect(() => {
        // Only fetch once per mount; dismiss state is per-session
        const dismissed = sessionStorage.getItem('admin_announcement_dismissed');
        if (dismissed) {
            setBannerDismissed(true);
            return;
        }
        fetch('/api/platform-info')
            .then(r => r.json())
            .then((d: { announcement?: string }) => {
                if (d.announcement && d.announcement.trim()) {
                    setAnnouncement(d.announcement.trim());
                }
            })
            .catch(() => { /* non-critical – silently ignore */ });
    }, []);

    const dismissBanner = () => {
        setBannerDismissed(true);
        sessionStorage.setItem('admin_announcement_dismissed', '1');
    };
    // ─────────────────────────────────────────────────────────────────────────

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/admin/login', { replace: true });
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    // Redirect to onboarding if the authenticated user has no stores yet
    useEffect(() => {
        if (!user || authLoading || storeLoading) return;
        if (location.pathname === '/admin/onboarding') return;

        if (stores.length === 0) {
            navigate('/admin/onboarding', { replace: true });
        }
    }, [user, authLoading, storeLoading, stores.length, location.pathname, navigate]);

    const loading = authLoading || storeLoading;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-dark">
                <div className="relative">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-steel/20 border-b-brand-cream"></div>
                </div>
            </div>
        );
    }

    if (!user || !user.emailVerified) {
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    const storeSlug = store?.slug ?? null;

    const navigation = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Products', href: '/admin/products', icon: Package },
        { name: 'Categories', href: '/admin/categories', icon: Tags },
        { name: 'Store Settings', href: '/admin/settings', icon: Settings },
        { name: 'Billing & Plan', href: '/admin/billing', icon: CreditCard },
        { name: 'Account', href: '/admin/account', icon: UserCircle },
    ];

    const showPaywall = !isSubscriptionActive && 
                        !isOnHold &&
                        location.pathname !== '/admin/billing' && 
                        location.pathname !== '/admin/onboarding' && 
                        stores.length > 0;

    const currentPageName = navigation.find((n) => n.href === location.pathname)?.name || 'Admin';
    const todayFormatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date());

    return (
        <div className="min-h-screen bg-brand-dark flex text-brand-gray">
            {/* Sidebar */}
            <aside className="w-64 bg-carbon-black border-r border-brand-steel/20 flex flex-col hidden md:flex">
                <div className="h-16 flex items-center px-6 border-b border-brand-steel/15 bg-carbon-black justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-cream/15 border border-brand-cream/30 flex items-center justify-center text-brand-cream">
                            <Store className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="text-base font-extrabold text-brand-header tracking-tight">Admin Portal</span>
                            <span className="block text-[10px] text-brand-slate uppercase font-semibold">Dokani Panel</span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1.5">
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all ${isActive
                                    ? 'bg-brand-cream text-black shadow-sm font-extrabold'
                                    : 'text-brand-slate hover:bg-brand-steel/15 hover:text-brand-header'
                                    }`}
                            >
                                <div className="flex items-center truncate">
                                    <item.icon
                                        className={`flex-shrink-0 -ml-0.5 mr-3 h-4 w-4 ${isActive ? 'text-black' : 'text-brand-slate'
                                            }`}
                                    />
                                    <span className="truncate">{item.name}</span>
                                </div>
                                {item.name === 'Billing & Plan' && subscriptionStatus === 'trialing' && daysLeftOfTrial > 0 && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isActive
                                        ? 'bg-black/20 text-black'
                                        : 'bg-brand-cream/10 text-brand-cream border border-brand-cream/20'
                                        }`}>
                                        {daysLeftOfTrial}d left
                                    </span>
                                )}
                            </Link>
                        );
                    })}

                    <div className="pt-4 mt-4 border-t border-brand-steel/15">
                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            className="flex items-center px-3.5 py-2.5 text-xs font-bold rounded-xl text-brand-slate hover:bg-brand-steel/15 hover:text-brand-header transition-all"
                        >
                            <Eye className="flex-shrink-0 -ml-0.5 mr-3 h-4 w-4 text-brand-slate" />
                            <span>Customer Storefront</span>
                        </Link>
                    </div>
                </nav>

                <div className="p-4 border-t border-brand-steel/15 flex items-center justify-between gap-3 bg-carbon-black">
                    <ThemeToggle />
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex items-center justify-center flex-1 px-3 py-2 text-xs font-bold text-brand-slate rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
                    >
                        <LogOut className="flex-shrink-0 -ml-1 mr-2 h-4 w-4 text-brand-slate hover:text-red-400" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-brand-dark pb-[90px] md:pb-0">
                {/* Desktop Top Header Bar (Dokani Style) */}
                <header className="hidden md:flex items-center justify-between h-16 px-6 bg-carbon-black border-b border-brand-steel/15 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-brand-slate font-medium">Dashboard</span>
                        <span className="text-brand-slate/50">/</span>
                        <span className="text-brand-header font-bold">{currentPageName}</span>
                        {store?.business_name && (
                            <span className="ml-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-cream/15 text-brand-cream border border-brand-cream/25">
                                ● {store.business_name}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-charcoal-brown/40 border border-brand-steel/20 text-brand-slate text-xs font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-brand-cream" />
                            <span>{todayFormatted}</span>
                        </div>

                        <ThemeToggle />

                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-bold text-brand-header bg-charcoal-brown/50 hover:bg-charcoal-brown px-3 py-1.5 rounded-xl border border-brand-steel/30 transition-all"
                        >
                            <Eye className="w-3.5 h-3.5 text-brand-cream" />
                            <span>Preview Store</span>
                        </Link>

                        <div className="flex items-center gap-2 pl-2 border-l border-brand-steel/20">
                            <div className="w-8 h-8 rounded-full bg-brand-cream text-black flex items-center justify-center font-black text-xs">
                                {user?.email ? user.email.slice(0, 1).toUpperCase() : 'A'}
                            </div>
                            <div className="text-left leading-none">
                                <span className="block text-xs font-bold text-brand-header truncate max-w-[120px]">
                                    {user?.email?.split('@')[0] || 'Merchant'}
                                </span>
                                <span className="text-[10px] text-brand-slate font-semibold">Merchant Admin</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between bg-carbon-black border-b border-brand-steel/20 px-4 py-3 sticky top-0 z-20">
                    <div className="flex items-center">
                        <Store className="w-6 h-6 text-brand-cream mr-2" />
                        <span className="text-lg font-bold text-brand-header">Admin</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            className="flex items-center gap-1.5 text-sm font-semibold text-brand-header bg-charcoal-brown/50 px-3 py-1.5 rounded-full border border-brand-steel/30 transition-colors"
                        >
                            <Eye className="w-4 h-4 text-brand-cream" />
                            <span>View Store</span>
                        </Link>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-brand-dark">
              {/* Platform announcement banner */}
              {announcement && !bannerDismissed && (
                <div className="sticky top-0 z-30 bg-amber-500/95 backdrop-blur-sm border-b border-amber-400/60 px-4 py-2.5 flex items-start gap-3 shadow-md">
                  <Megaphone className="w-4 h-4 text-amber-900 flex-shrink-0 mt-0.5" />
                  <p className="flex-1 text-xs font-semibold text-amber-900 leading-snug">{announcement}</p>
                  <button
                    type="button"
                    onClick={dismissBanner}
                    aria-label="Dismiss announcement"
                    className="flex-shrink-0 text-amber-900/70 hover:text-amber-900 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

                    {isOnHold ? (
                        <div className="min-h-[80vh] flex items-center justify-center p-6 md:p-8">
                            <div className="bg-brand-steel/10 rounded-3xl border border-amber-500/25 p-8 max-w-lg w-full text-center backdrop-blur-md shadow-2xl">
                                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <ShieldAlert className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-extrabold text-brand-header tracking-tight font-display mb-3">Account & Store On Hold</h2>
                                <p className="text-brand-slate text-sm leading-relaxed mb-6">
                                    Your store account has been placed on hold by the administrator. Your public customer storefront is offline and order routing is suspended until everything is settled.
                                </p>
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 font-semibold mb-6">
                                    Customer storefront is temporarily offline
                                </div>
                                <a
                                    href="mailto:support@example.com"
                                    className="block w-full py-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:opacity-90 text-brand-dark font-extrabold rounded-2xl transition duration-200 shadow-lg"
                                >
                                    Contact Support
                                </a>
                            </div>
                        </div>
                    ) : showPaywall ? (
                        <div className="min-h-[80vh] flex items-center justify-center p-6 md:p-8">
                            <div className="bg-brand-steel/10 rounded-3xl border border-brand-steel/15 p-8 max-w-lg w-full text-center backdrop-blur-md shadow-2xl">
                                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <ShieldAlert className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-extrabold text-brand-header tracking-tight font-display mb-3">Subscription Required</h2>
                                <p className="text-brand-slate text-sm leading-relaxed mb-6">
                                    Your store's trial or premium subscription has ended or is unpaid. Your public customer storefront has been put on hold until an active subscription is in place.
                                </p>
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 font-semibold mb-6">
                                    Storefront is paused. Subscribe now to reactivate your store immediately.
                                </div>
                                <button
                                    onClick={() => navigate('/admin/billing')}
                                    className="w-full py-4 bg-gradient-to-r from-brand-cream to-brand-cream/90 hover:from-brand-cream/95 hover:to-brand-cream text-brand-dark font-extrabold rounded-2xl transition duration-200 shadow-lg shadow-brand-cream/10"
                                >
                                    Activate Professional Plan
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Outlet />
                    )}
                </div>

                {/* Mobile Navigation Bar */}
                <div
                    className="md:hidden fixed bottom-0 left-0 right-0 bg-brand-dark/95 border-t border-brand-steel/20 flex justify-between items-center px-2 pt-2 pb-6 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.4)] backdrop-blur-md"
                    style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
                >
                    {navigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`flex flex-col items-center p-2 rounded-lg min-w-[64px] ${isActive ? 'text-brand-cream font-bold' : 'text-brand-slate hover:text-brand-header'
                                    }`}
                            >
                                <item.icon className={`h-6 w-6 mb-1 ${isActive ? 'text-brand-cream' : ''}`} />
                                <span className="text-[10px] font-semibold text-center leading-none">{item.name}</span>
                            </Link>
                        );
                    })}
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex flex-col items-center p-2 rounded-lg min-w-[64px] text-red-400 hover:text-red-300 cursor-pointer active:bg-red-500/10"
                    >
                        <LogOut className="h-6 w-6 mb-1 text-red-400" />
                        <span className="text-[10px] font-semibold text-center leading-none">Sign Out</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
