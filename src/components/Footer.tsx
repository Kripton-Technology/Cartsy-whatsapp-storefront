import { MessageCircle, MapPin, Facebook, Instagram, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BusinessInfo } from '../lib/types';

interface FooterProps {
  business: BusinessInfo | null;
}

export function Footer({ business }: FooterProps) {
  if (!business) return null;

  const handleSocialClick = (url: string | null) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <footer className="bg-white text-slate-600 border-t border-slate-200/80 py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Contact Us</h3>
            <a
              href={`https://wa.me/${business.whatsapp_number.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-emerald-600 hover:underline transition-all mb-3 min-h-[44px] py-1"
            >
              <MessageCircle size={20} />
              <span className="font-semibold">{business.whatsapp_number}</span>
            </a>

            {business.location && (
              <div className="flex items-start gap-3 text-slate-500">
                <MapPin size={20} className="flex-shrink-0 mt-0.5 text-slate-400" />
                <span>{business.location}</span>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Follow Us</h3>
            <div className="flex gap-4">
              {business.facebook_url && (
                <button
                  onClick={() => handleSocialClick(business.facebook_url)}
                  className="w-11 h-11 flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-full transition-all active:scale-95 cursor-pointer border border-slate-200/60"
                  aria-label="Facebook"
                >
                  <Facebook size={20} />
                </button>
              )}
              {business.instagram_url && (
                <button
                  onClick={() => handleSocialClick(business.instagram_url)}
                  className="w-11 h-11 flex items-center justify-center bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-full transition-all active:scale-95 cursor-pointer border border-slate-200/60"
                  aria-label="Instagram"
                >
                  <Instagram size={20} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-8">
          <p className="text-slate-400 text-center text-sm">
            © {new Date().getFullYear()} {business.business_name}. All rights reserved.
          </p>
          <p className="text-slate-400 text-center text-xs mt-2">
            Powered by Cartsy
          </p>
          <div className="flex items-center justify-center gap-3 text-xs font-semibold text-slate-500 mt-2">
            <Link to="/track" className="hover:text-slate-900 hover:underline">
              Track Your Order
            </Link>
            <span>•</span>
            <Link to="/" className="hover:text-slate-900 hover:underline">
              Explore Stores
            </Link>
          </div>
          {(business as any).is_sponsored && (
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full mt-3 font-semibold mx-auto w-fit">
              <GraduationCap className="w-4 h-4 text-emerald-600" />
              <span>Graduate Store • Sponsored by {(business as any).institution_name || 'Partner Institution'}</span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
