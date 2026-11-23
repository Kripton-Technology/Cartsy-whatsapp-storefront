import { useState } from 'react';
import { 
  Store, 
  Rocket, 
  ArrowRight, 
  MessageSquare, 
  Globe, 
  Upload, 
  Image as ImageIcon, 
  MapPin, 
  Facebook, 
  Instagram, 
  ArrowLeft, 
  Tag,
  GraduationCap,
  Check
} from 'lucide-react';
import { adminApi } from '../../lib/api';
import { useStorage } from '../../hooks/useStorage';

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: '',
    slug: '',
    whatsappNumber: '',
    accessCode: '',
    tagline: '',
    location: '',
    facebookUrl: '',
    instagramUrl: '',
    logoUrl: '',
    heroBannerUrl: '',
  });
  const [uploading, setUploading] = useState<{ logo: boolean; banner: boolean }>({
    logo: false,
    banner: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { uploadFile } = useStorage();

  const handleSlugChange = (name: string) => {
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setFormData({ ...formData, businessName: name, slug });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logoUrl' | 'heroBannerUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const storageKey = type === 'logoUrl' ? 'logo' : 'banner';
    setUploading(prev => ({ ...prev, [storageKey]: true }));
    setError(null);

    try {
      const url = await uploadFile(file, 'branding');
      if (url) {
        setFormData(prev => ({ ...prev, [type]: url }));
      }
    } catch (err: any) {
      console.error('[Onboarding Upload] Error:', err);
      setError('Failed to upload image. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [storageKey]: false }));
    }
  };

  // Ghana local phone validation: starts with 0 and exactly 10 digits
  const isWhatsappValid = /^[0][0-9]{9}$/.test(formData.whatsappNumber.trim());

  const isStep1Valid = formData.businessName.trim().length > 0 && 
                       formData.slug.trim().length > 0 && 
                       isWhatsappValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStep1Valid) {
      setStep(1);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await adminApi.createStore({
        business_name: formData.businessName,
        slug: formData.slug,
        whatsapp_number: formData.whatsappNumber,
        tagline: formData.tagline || null,
        location: formData.location || null,
        facebook_url: formData.facebookUrl || null,
        instagram_url: formData.instagramUrl || null,
        logo_url: formData.logoUrl || null,
        hero_banner_url: formData.heroBannerUrl || null,
      });

      if (formData.accessCode.trim()) {
        try {
          await adminApi.claimAccessCode(formData.accessCode.trim());
        } catch (claimErr: any) {
          console.warn('[Onboarding] Could not claim access code:', claimErr.message);
        }
      }
      
      // Onboarding complete — redirect straight to the store dashboard
      // Refresh page to let StoreProvider load the newly created store
      window.location.href = '/admin';
    } catch (err: any) {
      setError(err.message || 'Failed to create store');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm p-6 md:p-10 border border-slate-200/80">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
            <Rocket className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">Let's build your store</h1>
            <p className="text-slate-500 mt-1 text-xs">Customize your premium WhatsApp storefront in seconds.</p>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === 1 ? 'bg-slate-900 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>1</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${step === 1 ? 'text-slate-900' : 'text-slate-400'}`}>Basics</span>
          </div>
          <div className="flex-1 h-[2px] bg-slate-200 mx-4 relative">
            <div className="absolute top-0 left-0 h-full bg-slate-900 transition-all duration-300" style={{ width: step === 1 ? '0%' : '100%' }}></div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === 2 ? 'bg-slate-900 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>2</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${step === 2 ? 'text-slate-900' : 'text-slate-400'}`}>Branding & Socials</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* STEP 1: BASICS */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Business Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  What's your business called?
                </label>
                <div className="relative">
                  <Store className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm"
                    placeholder="e.g. Ama's Boutique"
                  />
                </div>
              </div>

              {/* Store Slug / URL */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Your store URL slug
                </label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <div className="flex items-center w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                    <span className="text-slate-400 text-sm mr-1">/store/</span>
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      className="flex-1 bg-transparent outline-none text-slate-900 font-medium text-sm"
                      placeholder="amas-boutique"
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp Number */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  WhatsApp Number (for orders)
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm ${
                      formData.whatsappNumber.length > 0 && !isWhatsappValid 
                        ? 'border-rose-400' 
                        : 'border-slate-200'
                    }`}
                    placeholder="e.g. 0244369749"
                  />
                  {formData.whatsappNumber.length > 0 && !isWhatsappValid && (
                    <p className="mt-1.5 text-xs text-rose-500">
                      Must start with 0 and be exactly 10 digits long (no country code).
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400 italic">
                    Enter your local number starting with 0. Prepend 0, e.g. 0244369749.
                  </p>
                </div>
              </div>

              {/* Institution / Graduate Access Code */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Institution Access Code <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.accessCode}
                    onChange={(e) => setFormData({ ...formData, accessCode: e.target.value.toUpperCase() })}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 outline-none transition-all text-sm uppercase placeholder:normal-case placeholder:text-slate-400 tracking-wider font-mono"
                    placeholder="e.g. KNUST-2025-A1B2"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 pl-1">
                  Have an institution sponsorship code? Enter it for 6 months free access.
                </p>
              </div>

              {/* Next Step Button */}
              <button
                type="button"
                disabled={!isStep1Valid}
                onClick={() => setStep(2)}
                className="w-full mt-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 group active:scale-[0.99] text-sm"
              >
                Continue to Branding
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {/* STEP 2: BRANDING & SOCIALS */}
          {step === 2 && (
            <div className="space-y-5">
              
              {/* Slogan & Location Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Tagline / Slogan
                  </label>
                  <div className="relative">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.tagline}
                      onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition-colors text-sm"
                      placeholder="e.g. Trendy looks for less"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Store Location / Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition-colors text-sm"
                      placeholder="e.g. East Legon, Accra"
                    />
                  </div>
                </div>
              </div>

              {/* Logo and Banner Upload Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Logo Upload */}
                <div className="bg-slate-50/60 rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-semibold text-slate-700 mb-2">Store Logo</span>
                  {formData.logoUrl ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 mb-2 group">
                      <img src={formData.logoUrl} alt="Store logo" className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-white cursor-pointer transition-opacity">
                        Replace
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logoUrl')} />
                      </label>
                    </div>
                  ) : (
                    <label className="w-20 h-20 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors mb-2 bg-white">
                      {uploading.logo ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent"></div>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-slate-400 mb-1" />
                          <span className="text-[10px] text-slate-500">Upload</span>
                        </>
                      )}
                      <input type="file" accept="image/*" disabled={uploading.logo} className="hidden" onChange={(e) => handleUpload(e, 'logoUrl')} />
                    </label>
                  )}
                  <span className="text-[10px] text-slate-400">Square PNG/JPG recommended</span>
                </div>

                {/* Banner Upload */}
                <div className="bg-slate-50/60 rounded-xl border border-slate-200 p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-xs font-semibold text-slate-700 mb-2">Hero Banner</span>
                  {formData.heroBannerUrl ? (
                    <div className="relative w-full h-20 rounded-xl overflow-hidden border border-slate-200 mb-2 group">
                      <img src={formData.heroBannerUrl} alt="Hero banner" className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-white cursor-pointer transition-opacity">
                        Replace
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'heroBannerUrl')} />
                      </label>
                    </div>
                  ) : (
                    <label className="w-full h-20 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition-colors mb-2 bg-white">
                      {uploading.banner ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent"></div>
                      ) : (
                        <>
                          <ImageIcon className="w-5 h-5 text-slate-400 mb-1" />
                          <span className="text-[10px] text-slate-500">Upload Banner</span>
                        </>
                      )}
                      <input type="file" accept="image/*" disabled={uploading.banner} className="hidden" onChange={(e) => handleUpload(e, 'heroBannerUrl')} />
                    </label>
                  )}
                  <span className="text-[10px] text-slate-400">Landscape banner for home header</span>
                </div>
              </div>

              {/* Social Media Links */}
              <div className="space-y-3">
                <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Social Links (Optional)</span>
                
                <div className="relative">
                  <Facebook className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1877F2]" />
                  <input
                    type="url"
                    value={formData.facebookUrl}
                    onChange={(e) => setFormData({ ...formData, facebookUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition-colors text-sm"
                    placeholder="https://facebook.com/amasboutique"
                  />
                </div>

                <div className="relative">
                  <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E1306C]" />
                  <input
                    type="url"
                    value={formData.instagramUrl}
                    onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 outline-none focus:bg-white focus:border-emerald-500 transition-colors text-sm"
                    placeholder="https://instagram.com/amasboutique"
                  />
                </div>
              </div>

              {/* Wizard Footer Controls */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || uploading.logo || uploading.banner}
                  className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer text-xs active:scale-95"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Saving Store...</span>
                    </>
                  ) : (
                    <>
                      <span>Complete & Launch</span>
                      <Check className="w-4 h-4 text-emerald-400" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
