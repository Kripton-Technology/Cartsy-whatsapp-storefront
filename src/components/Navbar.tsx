import { MessageCircle, ShoppingCart, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BusinessInfo } from '../lib/types';

interface NavbarProps {
  business: BusinessInfo | null;
  cartItemsCount: number;
  onCartClick: () => void;
}

export function Navbar({ business, cartItemsCount, onCartClick }: NavbarProps) {
  if (!business) return null;

  const handleWhatsAppClick = () => {
    const whatsappUrl = `https://wa.me/${business.whatsapp_number.replace(/[^0-9]/g, '')}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="w-full px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {business.logo_url && (
              <img
                src={business.logo_url}
                alt="Business logo"
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-slate-200 shadow-xs"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 truncate tracking-tight font-display">
                {business.business_name}
              </h1>
              {business.tagline && (
                <p className="text-xs text-slate-500 truncate">
                  {business.tagline}
                </p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <Link
              to="/track"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-200 shadow-xs"
              title="Track your order status"
            >
              <Truck size={16} className="text-emerald-600" />
              <span className="hidden sm:inline">Track Order</span>
            </Link>

            <button
              onClick={onCartClick}
              className="relative flex items-center justify-center w-10 h-10 text-slate-700 bg-white hover:bg-slate-50 rounded-xl transition-colors border border-slate-200 shadow-xs"
              aria-label="View Shopping Cart"
            >
              <ShoppingCart size={19} />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                  {cartItemsCount > 99 ? '99+' : cartItemsCount}
                </span>
              )}
            </button>
            <button
              onClick={handleWhatsAppClick}
              className="flex-shrink-0 flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs active:scale-95"
            >
              <MessageCircle size={16} />
              <span className="hidden xs:inline">Order via WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
