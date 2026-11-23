import type { BusinessInfo } from '../lib/types';
import { Zap } from 'lucide-react';

interface HeroProps {
  business: BusinessInfo | null;
}

export function Hero({ business }: HeroProps) {
  if (!business) return null;

  return (
    <section className="relative w-full overflow-hidden">
      {/* VibeUI Ambient Radial Mesh */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-brand-cream/10 via-emerald-500/5 to-transparent blur-3xl -z-10" />

      {business.hero_banner_url && (
        <div className="relative h-48 sm:h-64 w-full overflow-hidden bg-slate-100">
          <img
            src={business.hero_banner_url}
            alt="Hero banner"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />
        </div>
      )}

      <div className="px-4 py-8 sm:px-6 sm:py-10 bg-white border-b border-slate-200/80">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3 shadow-2xs">
            <Zap className="w-3.5 h-3.5 text-emerald-600" />
            <span>Direct WhatsApp Ordering</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight font-display mb-2">
            {business.business_name}
          </h2>

          {business.tagline && (
            <p className="text-slate-700 text-base sm:text-lg font-semibold mb-3">
              {business.tagline}
            </p>
          )}

          <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-2xl">
            Browse our catalog, build your cart, and tap to order directly into our WhatsApp. Fast, simple, and no account required.
          </p>
        </div>
      </div>
    </section>
  );
}
