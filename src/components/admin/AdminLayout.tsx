import { Navigate, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import {
    LayoutDashboard,
    ShoppingBag,
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
    Menu,
    MoreHorizontal,
} from 'lucide-react';

export function AdminLayout() {
    const { user, loading: authLoading, signOut } = useAuth();
    const { store, stores, loading: storeLoading, isSubscriptionActive, isOnHold, daysLeftOfTrial, subscriptionStatus } = useStore();
    const location = useLocation();
    const navigate = useNavigate();

    // ── Mobile collapsing toolbar state ───────────────────────────────────────
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Auto-close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // ── Platform announcement banner ──────────────────────────────────────────
    const [announcement, setAnnouncement] = useState<string>('');
    const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

    useEffect(() => {
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
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
                <div className="relative">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-b-slate-900"></div>
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
        { name: 'Orders', href: '/admin/orders', icon: ShoppingBag },
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
        <div className="min-h-screen bg-[#F8FAFC] flex text-slate-800">
            {/* Desktop Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col hidden md:flex">
                <div className="h-16 flex items-center px-6 border-b border-slate-200/80 bg-white justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
                            <Store className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="text-base font-extrabold text-slate-900 tracking-tight">Admin Portal</span>
                            <span className="block text-[10px] text-slate-500 uppercase font-semibold">Cartsy Store</span>
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
                                    ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                                    }`}
                            >
                                <div className="flex items-center truncate">
                                    <item.icon
                                        className={`flex-shrink-0 -ml-0.5 mr-3 h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'
                                            }`}
                                    />
                                    <span className="truncate">{item.name}</span>
                                </div>
                                {item.name === 'Billing & Plan' && subscriptionStatus === 'trialing' && daysLeftOfTrial > 0 && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isActive
                                        ? 'bg-white/20 text-white'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}>
                                        {daysLeftOfTrial}d left
                                    </span>
                                )}
                            </Link>
                        );
                    })}

                    <div className="pt-4 mt-4 border-t border-slate-200/80">
                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center px-3.5 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 transition-all"
                        >
                            <Eye className="flex-shrink-0 -ml-0.5 mr-3 h-4 w-4 text-emerald-600" />
                            <span>Customer Storefront</span>
                        </Link>
                    </div>
                </nav>

                <div className="p-4 border-t border-slate-200/80 flex items-center justify-between gap-3 bg-white">
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex items-center justify-center flex-1 px-3 py-2 text-xs font-bold text-slate-600 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer border border-slate-200/60"
                    >
                        <LogOut className="flex-shrink-0 -ml-1 mr-2 h-4 w-4 text-slate-400 hover:text-rose-600" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8FAFC] pb-[72px] md:pb-0">
                {/* Desktop Top Header Bar */}
                <header className="hidden md:flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200/80 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium">Dashboard</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-slate-900 font-bold">{currentPageName}</span>
                        {store?.business_name && (
                            <span className="ml-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ● {store.business_name}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{todayFormatted}</span>
                        </div>

                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 transition-all"
                        >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Preview Store</span>
                        </Link>

                        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                                {user?.email ? user.email.slice(0, 1).toUpperCase() : 'A'}
                            </div>
                            <div className="text-left leading-none">
                                <span className="block text-xs font-bold text-slate-900 truncate max-w-[120px]">
                                    {user?.email?.split('@')[0] || 'Merchant'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-semibold">Merchant Admin</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Mobile Header with Collapsing Menu Button */}
                <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200/80 px-4 py-3 sticky top-0 z-30 shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs flex-shrink-0">
                            <Store className="w-4 h-4" />
                        </div>
                        <div className="leading-tight truncate">
                            <span className="block text-sm font-black text-slate-900 truncate">
                                {store?.business_name || 'Admin'}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-semibold truncate">{currentPageName}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                            to={storeSlug ? `/store/${storeSlug}` : '/'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors"
                        >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden xs:inline">Store</span>
                        </Link>

                        {/* Collapsing Toolbar Toggle Button */}
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(prev => !prev)}
                            aria-expanded={isMobileMenuOpen}
                            aria-label="Toggle navigation tabs toolbar"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                                isMobileMenuOpen
                                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-xs'
                            }`}
                        >
                            {isMobileMenuOpen ? (
                                <>
                                    <X className="w-4 h-4 text-rose-400" />
                                    <span>Close</span>
                                </>
                            ) : (
                                <>
                                    <Menu className="w-4 h-4 text-slate-700" />
                                    <span>Tabs</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Collapsible Navigation Menu Drawer */}
                {isMobileMenuOpen && (
                    <div className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-start pt-16 pb-20 px-4 animate-in fade-in duration-150">
                        <div 
                            className="fixed inset-0 -z-10" 
                            onClick={() => setIsMobileMenuOpen(false)} 
                            aria-hidden="true" 
                        />
                        <div className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 max-h-[80vh] overflow-y-auto space-y-3">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                                        {user?.email ? user.email.slice(0, 1).toUpperCase() : 'A'}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                                            {user?.email?.split('@')[0] || 'Merchant'}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-semibold">{store?.business_name || 'Store Admin'}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-1">
                                {navigation.map((item) => {
                                    const isActive = location.pathname === item.href;
                                    return (
                                        <Link
                                            key={item.name}
                                            to={item.href}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className={`flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all ${
                                                isActive
                                                    ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                                                    : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <item.icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                                                <span>{item.name}</span>
                                            </div>
                                            {item.name === 'Billing & Plan' && subscriptionStatus === 'trialing' && daysLeftOfTrial > 0 && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                    isActive ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                }`}>
                                                    {daysLeftOfTrial}d left
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                                <Link
                                    to={storeSlug ? `/store/${storeSlug}` : '/'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                                >
                                    <Eye className="w-4 h-4 text-emerald-600" />
                                    <span>View Customer Storefront</span>
                                </Link>

                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4 text-rose-600" />
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto bg-[#F8FAFC]">
                    {/* Platform announcement banner */}
                    {announcement && !bannerDismissed && (
                        <div className="sticky top-0 z-20 bg-amber-500/95 backdrop-blur-sm border-b border-amber-400/60 px-4 py-2.5 flex items-start gap-3 shadow-md">
                            <Megaphone className="w-4 h-4 text-amber-950 flex-shrink-0 mt-0.5" />
                            <p className="flex-1 text-xs font-semibold text-amber-950 leading-snug">{announcement}</p>
                            <button
                                type="button"
                                onClick={dismissBanner}
                                aria-label="Dismiss announcement"
                                className="flex-shrink-0 text-amber-950/70 hover:text-amber-950 transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {isOnHold ? (
                        <div className="min-h-[80vh] flex items-center justify-center p-6 md:p-8">
                            <div className="bg-white rounded-3xl border border-amber-200 p-8 max-w-lg w-full text-center shadow-xl">
                                <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <ShieldAlert className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight font-display mb-3">Account & Store On Hold</h2>
                                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                                    Your store account has been placed on hold by the administrator. Your public customer storefront is offline and order routing is suspended until everything is settled.
                                </p>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-bold mb-6">
                                    Customer storefront is temporarily offline
                                </div>
                                <a
                                    href="mailto:support@example.com"
                                    className="block w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl transition duration-200 shadow-md"
                                >
                                    Contact Support
                                </a>
                            </div>
                        </div>
                    ) : showPaywall ? (
                        <div className="min-h-[80vh] flex items-center justify-center p-6 md:p-8">
                            <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-lg w-full text-center shadow-xl">
                                <div className="w-16 h-16 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <ShieldAlert className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight font-display mb-3">Subscription Required</h2>
                                <p className="text-slate-600 text-sm leading-relaxed mb-6">
                                    Your store's trial or premium subscription has ended or is unpaid. Your public customer storefront has been put on hold until an active subscription is in place.
                                </p>
                                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 font-bold mb-6">
                                    Storefront is paused. Subscribe now to reactivate your store immediately.
                                </div>
                                <button
                                    onClick={() => navigate('/admin/billing')}
                                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-2xl transition duration-200 shadow-md cursor-pointer"
                                >
                                    Activate Professional Plan
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Outlet />
                    )}
                </div>

                {/* Mobile Bottom Navigation Bar with Collapsible 'More' Trigger */}
                <div
                    className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200/80 flex justify-around items-center px-2 py-1.5 z-30 shadow-lg backdrop-blur-md"
                    style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
                >
                    <Link
                        to="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition-colors ${
                            location.pathname === '/admin' ? 'text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <LayoutDashboard className={`w-5 h-5 mb-0.5 ${location.pathname === '/admin' ? 'text-slate-900' : 'text-slate-400'}`} />
                        <span className="text-[10px] leading-tight font-bold">Dashboard</span>
                    </Link>

                    <Link
                        to="/admin/orders"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition-colors ${
                            location.pathname === '/admin/orders' ? 'text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <ShoppingBag className={`w-5 h-5 mb-0.5 ${location.pathname === '/admin/orders' ? 'text-slate-900' : 'text-slate-400'}`} />
                        <span className="text-[10px] leading-tight font-bold">Orders</span>
                    </Link>

                    <Link
                        to="/admin/products"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition-colors ${
                            location.pathname === '/admin/products' ? 'text-slate-900 font-extrabold' : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        <Package className={`w-5 h-5 mb-0.5 ${location.pathname === '/admin/products' ? 'text-slate-900' : 'text-slate-400'}`} />
                        <span className="text-[10px] leading-tight font-bold">Products</span>
                    </Link>

                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(prev => !prev)}
                        className={`flex flex-col items-center py-1.5 px-3 rounded-xl transition-colors cursor-pointer ${
                            isMobileMenuOpen || ['/admin/categories', '/admin/settings', '/admin/billing', '/admin/account'].includes(location.pathname)
                                ? 'text-slate-900 font-extrabold'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        {isMobileMenuOpen ? (
                            <X className="w-5 h-5 mb-0.5 text-rose-500" />
                        ) : (
                            <MoreHorizontal className="w-5 h-5 mb-0.5 text-slate-500" />
                        )}
                        <span className="text-[10px] leading-tight font-bold">{isMobileMenuOpen ? 'Close' : 'More'}</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
