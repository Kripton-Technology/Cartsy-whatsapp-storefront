import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { AuthProvider } from './contexts/AuthContext';
import { StoreProvider } from './contexts/StoreContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Store } from './pages/Store';
import { StoreDirectory } from './pages/StoreDirectory';
import { AdminLayout } from './components/admin/AdminLayout';
import { Dashboard } from './pages/admin/Dashboard';
import { CategoryManager } from './pages/admin/CategoryManager';
import { ProductManager } from './pages/admin/ProductManager';
import { BusinessSettings } from './pages/admin/BusinessSettings';
import { Billing } from './pages/admin/Billing';
import { AccountView } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css'; // Correct path to the official styles!
import { Onboarding } from './pages/admin/Onboarding';
import { Login } from './pages/admin/Login';
import { AuthCallback } from './pages/AuthCallback';
import { AuthSuccess } from './pages/AuthSuccess';
import { Shield } from 'lucide-react';
import { useEffect } from 'react';

function SuperAdminRedirect() {
  useEffect(() => {
    const target = (import.meta as any).env?.VITE_SUPERADMIN_URL || 'http://localhost:5174';
    window.location.href = target;
  }, []);

  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center p-6 text-center text-brand-gray">
      <div className="bg-carbon-black border border-charcoal-brown p-8 rounded-3xl max-w-md w-full shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-tea-green/15 text-tea-green border border-tea-green/30 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-xl font-black text-brand-header mb-2 font-display">SuperAdmin Portal</h2>
        <p className="text-xs text-brand-slate mb-6">The platform SuperAdmin now runs as an independent site on its own dedicated port (5174).</p>
        <a
          href="http://localhost:5174"
          className="inline-block py-2.5 px-6 rounded-xl bg-tea-green text-black font-extrabold text-xs shadow-md hover:opacity-90 transition-opacity"
        >
          Open Standalone SuperAdmin
        </a>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <ThemeProvider>
            <CartProvider>
            <Routes>
              {/* Public Store Routes */}
              <Route path="/" element={<StoreDirectory />} />
              <Route path="/store/:slug" element={<Store />} />

              {/* OAuth Callback Handlers */}
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/success" element={<AuthSuccess />} />

              {/* Admin Auth */}
              <Route path="/admin/login" element={<Login />} />
              <Route path="/admin/signup" element={<Login />} />

              {/* Protected Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="products" element={<ProductManager />} />
                <Route path="categories" element={<CategoryManager />} />
                <Route path="settings" element={<BusinessSettings />} />
                <Route path="billing" element={<Billing />} />
                <Route path="account" element={<AccountView />} />
                <Route path="onboarding" element={<Onboarding />} />
              </Route>

              {/* Super Admin - Standalone External Site */}
              <Route path="/superadmin" element={<SuperAdminRedirect />} />
              <Route path="/superadmin/*" element={<SuperAdminRedirect />} />

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CartProvider>
         </ThemeProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

