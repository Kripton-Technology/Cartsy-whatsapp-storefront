import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Store, CreditCard, Settings, LogOut, LayoutDashboard, Database } from 'lucide-react';
import { getSaToken, clearSaToken, saApi } from '../../lib/saApi';

export function SuperAdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getSaToken();
    if (!token) {
      navigate('/superadmin', { replace: true });
      return;
    }

    saApi.verify()
      .then(() => setChecking(false))
      .catch(() => {
        clearSaToken();
        navigate('/superadmin', { replace: true });
      });
  }, [navigate]);

  const handleLogout = () => {
    clearSaToken();
    navigate('/superadmin');
  };

  const navItems = [
    { path: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/superadmin/stores', label: 'All Stores', icon: Store },
    { path: '/superadmin/payments', label: 'Payments', icon: CreditCard },
    { path: '/superadmin/settings', label: 'Settings', icon: Settings },
  ];

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-tea-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex text-white font-sans antialiased">
      {/* Sidebar */}
      <aside className="w-64 bg-carbon-black border-r border-charcoal-brown flex flex-col fixed h-full z-20">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-charcoal-brown justify-between bg-carbon-black">
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-xl bg-tea-green/15 border border-tea-green/30 flex items-center justify-center mr-3 shadow-md">
              <Shield className="w-5 h-5 text-tea-green" />
            </div>
            <div>
              <p className="text-sm font-black text-white leading-tight">Super Admin</p>
              <p className="text-[10px] text-muted-teal font-semibold tracking-wider uppercase">Live Control</p>
            </div>
          </div>
        </div>

        {/* Database Status indicator */}
        <div className="px-5 py-3 border-b border-charcoal-brown bg-black/40">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tea-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-tea-green"></span>
            </span>
            <span className="text-[11px] font-medium text-tea-green flex items-center gap-1">
              <Database className="w-3 h-3" /> Neon Postgres Live
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${active
                  ? 'bg-tea-green text-black font-extrabold shadow-sm'
                  : 'text-muted-teal hover:text-white hover:bg-charcoal-brown/50'
                  }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-black' : 'text-muted-teal'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Store links & Logout */}
        <div className="p-4 border-t border-charcoal-brown space-y-2 bg-carbon-black">
          <Link
            to="/admin"
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-muted-teal hover:text-white hover:bg-charcoal-brown/40 transition-all"
          >
            <Store className="w-4 h-4" />
            Merchant Admin View
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen overflow-auto relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
