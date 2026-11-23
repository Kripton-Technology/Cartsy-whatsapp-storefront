import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';
import {
  Save,
  Upload,
  Copy,
  Check,
  Bell,
  Share2,
  Smartphone,
  Globe,
} from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import { checkPushSubscriptionStatus, enablePushNotifications, isIOS, isStandalone } from '../../lib/pushManager';
import type { StorePlatform } from '../../lib/types';

const AVAILABLE_PLATFORMS: { id: StorePlatform['platform']; label: string; placeholder: string }[] = [
  { id: 'instagram', label: 'Instagram', placeholder: '@yourstore' },
  { id: 'tiktok', label: 'TikTok', placeholder: '@yourstore' },
  { id: 'snapchat', label: 'Snapchat', placeholder: 'yourstore' },
  { id: 'facebook', label: 'Facebook', placeholder: 'yourstore.gh' },
  { id: 'other', label: 'Other Social Link', placeholder: 'https://...' },
];

export function BusinessSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ logo: boolean; banner: boolean }>({ logo: false, banner: false });
  const { uploadFile } = useStorage();

  const [formData, setFormData] = useState({
    business_name: '',
    slug: '',
    whatsapp_number: '',
    tagline: '',
    logo_url: '',
    hero_banner_url: '',
    location: '',
    facebook_url: '',
    instagram_url: '',
  });

  const [platforms, setPlatforms] = useState<Record<string, { enabled: boolean; handle: string }>>({
    instagram: { enabled: false, handle: '' },
    tiktok: { enabled: false, handle: '' },
    snapchat: { enabled: false, handle: '' },
    facebook: { enabled: false, handle: '' },
    other: { enabled: false, handle: '' },
  });

  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  // Store custom accent color (Storefront is predominantly white + accent color)
  const [themeColor, setThemeColor] = useState<string>('#059669');
  const [rawDeliverySettings, setRawDeliverySettings] = useState<Record<string, any>>({});

  useEffect(() => {
    loadData();
    checkPushSubscriptionStatus().then(setPushEnabled);
  }, []);

  async function loadData() {
    try {
      const [data, existingPlatforms] = await Promise.all([
        adminApi.getBusinessInfo(),
        adminApi.getPlatforms().catch(() => [] as StorePlatform[]),
      ]);

      if (data) {
        setThemeColor(data.delivery_settings?.theme_color || '#059669');
        setRawDeliverySettings(data.delivery_settings || {});
        setFormData({
          business_name: data.business_name || '',
          slug: data.slug || '',
          whatsapp_number: data.whatsapp_number || '',
          tagline: data.tagline || '',
          logo_url: data.logo_url || '',
          hero_banner_url: data.hero_banner_url || '',
          location: data.location || '',
          facebook_url: data.facebook_url || '',
          instagram_url: data.instagram_url || '',
        });
      }

      if (existingPlatforms && existingPlatforms.length > 0) {
        setPlatforms((prev) => {
          const updated = { ...prev };
          existingPlatforms.forEach((p) => {
            if (updated[p.platform]) {
              updated[p.platform] = { enabled: true, handle: p.handle || '' };
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await adminApi.saveBusinessInfo({
        ...formData,
        delivery_settings: {
          ...rawDeliverySettings,
          theme_color: themeColor,
        },
      });

      // Save platform checklist and handles
      const activePlatforms: StorePlatform[] = Object.entries(platforms)
        .filter(([_, val]) => val.enabled)
        .map(([platform, val]) => ({
          platform: platform as StorePlatform['platform'],
          handle: val.handle.trim(),
        }));

      await adminApi.savePlatforms(activePlatforms);

      alert('Settings & social links saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(error instanceof Error ? error.message : 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo_url' | 'hero_banner_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const storageKey = type === 'logo_url' ? 'logo' : 'banner';
    setUploading((prev) => ({ ...prev, [storageKey]: true }));

    const url = await uploadFile(file, 'branding');
    if (url) {
      setFormData((prev) => ({ ...prev, [type]: url }));
    }
    setUploading((prev) => ({ ...prev, [storageKey]: false }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const res = await enablePushNotifications();
      setPushMessage(res.message);
      if (res.success) {
        setPushEnabled(true);
      }
    } catch (e: any) {
      setPushMessage(e.message || 'Failed to enable notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://usecartsy.me';
  const storeSlug = formData.slug || 'yourstore';
  const baseStoreLink = `${siteOrigin}/s/${storeSlug}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-steel/20 border-b-brand-cream"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-brand-header font-display">Store Settings</h1>
        <p className="text-xs sm:text-sm text-brand-slate mt-1">
          Manage your social storefront, links, notifications and appearance
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* ── 1. Store Link & Identity (ST-2) ── */}
        <div className="bg-brand-steel/10 rounded-2xl border border-brand-steel/15 p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-brand-steel/15">
            <Globe className="w-5 h-5 text-tea-green" />
            <h2 className="text-base font-bold text-brand-header font-display">Store Link & Address</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-1">
                Store Link Slug *
              </label>
              <div className="flex rounded-xl overflow-hidden border border-brand-steel/20 bg-brand-dark/45 focus-within:ring-2 focus-within:ring-brand-cream">
                <span className="px-3 py-2 text-xs text-brand-slate/70 bg-brand-steel/10 border-r border-brand-steel/20 flex items-center">
                  usecartsy.me/s/
                </span>
                <input
                  type="text"
                  name="slug"
                  required
                  value={formData.slug}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-transparent text-xs text-brand-header outline-none font-mono font-bold"
                  placeholder="sweetcrumbs"
                />
              </div>
              <p className="text-[11px] text-brand-slate/70 mt-1">
                Slugs are unique and changeable at most once every 30 days.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-1">
                Store Location *
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-brand-dark/45 border border-brand-steel/20 text-brand-header rounded-xl focus:ring-2 focus:ring-brand-cream text-xs outline-none"
                placeholder="East Legon, Accra"
              />
            </div>
          </div>
        </div>

        {/* ── 2. Tracked Social Links (ST-1, ST-9) ── */}
        <div className="bg-brand-steel/10 rounded-2xl border border-brand-steel/15 p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-brand-steel/15">
            <div className="flex items-center gap-3">
              <Share2 className="w-5 h-5 text-tea-green" />
              <div>
                <h2 className="text-base font-bold text-brand-header font-display">
                  Social Posting Platforms & Tracked Links
                </h2>
                <p className="text-xs text-brand-slate">
                  Tick the platforms you post on. Cartsy gives you a tracked link for each so you see order sources.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {AVAILABLE_PLATFORMS.map((plat) => {
              const current = platforms[plat.id] || { enabled: false, handle: '' };
              const trackedUrl = `${baseStoreLink}?src=${plat.id}`;

              return (
                <div
                  key={plat.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    current.enabled
                      ? 'bg-brand-dark/70 border-tea-green/40 shadow-sm'
                      : 'bg-brand-dark/30 border-brand-steel/15'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={current.enabled}
                        onChange={(e) =>
                          setPlatforms((prev) => ({
                            ...prev,
                            [plat.id]: { ...prev[plat.id], enabled: e.target.checked },
                          }))
                        }
                        className="w-4 h-4 rounded text-tea-green focus:ring-tea-green bg-brand-dark border-brand-steel/40"
                      />
                      <span className="text-xs font-bold text-brand-header">{plat.label}</span>
                    </label>

                    {current.enabled && (
                      <div className="flex items-center gap-2 flex-1 max-w-sm">
                        <input
                          type="text"
                          placeholder={plat.placeholder}
                          value={current.handle}
                          onChange={(e) =>
                            setPlatforms((prev) => ({
                              ...prev,
                              [plat.id]: { ...prev[plat.id], handle: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-1.5 bg-brand-dark border border-brand-steel/20 rounded-lg text-xs text-brand-header outline-none focus:ring-1 focus:ring-brand-cream"
                        />

                        <button
                          type="button"
                          onClick={() => handleCopyLink(trackedUrl, plat.id)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tea-green/15 text-tea-green border border-tea-green/30 hover:bg-tea-green/25 text-xs font-extrabold transition-all"
                        >
                          {copiedLink === plat.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedLink === plat.id ? 'Copied' : 'Copy Tracked Link'}
                        </button>
                      </div>
                    )}
                  </div>

                  {current.enabled && (
                    <div className="mt-2 text-[11px] font-mono text-brand-slate flex items-center gap-1">
                      <span className="text-brand-slate/60">Share URL:</span>
                      <span className="text-brand-cream truncate">{trackedUrl}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* General WhatsApp Link */}
            <div className="p-3.5 rounded-xl border border-brand-steel/15 bg-brand-dark/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-brand-header">General WhatsApp Link</span>
                <p className="text-[11px] text-brand-slate font-mono">{baseStoreLink}?src=whatsapp</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyLink(`${baseStoreLink}?src=whatsapp`, 'wa')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-extrabold transition-all self-start sm:self-auto"
              >
                {copiedLink === 'wa' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink === 'wa' ? 'Copied' : 'Copy WhatsApp Link'}
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. PWA Push Notifications (PW-1, PW-2, PW-5) ── */}
        <div className="bg-brand-steel/10 rounded-2xl border border-brand-steel/15 p-6 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-brand-steel/15">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-tea-green" />
              <div>
                <h2 className="text-base font-bold text-brand-header font-display">
                  Order Push Notifications (PWA)
                </h2>
                <p className="text-xs text-brand-slate">
                  Get instant phone alerts the moment an order is tapped, even before WhatsApp opens.
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                pushEnabled
                  ? 'bg-tea-green/15 text-tea-green border-tea-green/30'
                  : 'bg-brand-steel/15 text-brand-slate border-brand-steel/30'
              }`}
            >
              {pushEnabled ? 'Alerts Active' : 'Not Subscribed'}
            </span>
          </div>

          <div className="space-y-3">
            {isIOS() && !isStandalone() && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-brand-header space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  iPhone / iOS Setup Note:
                </div>
                <p className="text-brand-slate">
                  Apple requires Cartsy to be added to your Home Screen before web push notifications can run.
                  Tap Safari's <strong>Share</strong> button at the bottom, tap <strong>"Add to Home Screen"</strong>, then launch Cartsy from your home screen.
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <div>
                <h4 className="text-xs font-bold text-brand-header">Instant Order Sound & Banner Alerts</h4>
                <p className="text-[11px] text-brand-slate">
                  One alert per order with customer name and total amount.
                </p>
              </div>

              <button
                type="button"
                disabled={pushLoading}
                onClick={handleTogglePush}
                className="px-4 py-2 rounded-xl bg-tea-green hover:bg-[#a0e2a9] text-black font-extrabold text-xs shadow-md transition-all disabled:opacity-50"
              >
                {pushLoading ? 'Connecting...' : pushEnabled ? 'Push Alerts Active' : 'Enable Push Alerts'}
              </button>
            </div>

            {pushMessage && (
              <div className="text-xs text-brand-cream bg-brand-dark/60 p-2.5 rounded-lg border border-brand-steel/20">
                {pushMessage}
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Basic Info & WhatsApp Number (OF-1) ── */}
        <div className="bg-brand-steel/10 rounded-2xl border border-brand-steel/15 p-6 backdrop-blur-md space-y-4">
          <h2 className="text-base font-bold text-brand-header font-display pb-3 border-b border-brand-steel/15">
            Store Profile & WhatsApp Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-1">
                Business Name *
              </label>
              <input
                type="text"
                name="business_name"
                required
                value={formData.business_name}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-brand-dark/45 border border-brand-steel/20 text-brand-header rounded-xl text-xs focus:ring-2 focus:ring-brand-cream outline-none"
                placeholder="My Store"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-1">
                WhatsApp Order Number * (OF-1)
              </label>
              <input
                type="text"
                name="whatsapp_number"
                required
                value={formData.whatsapp_number}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-brand-dark/45 border border-brand-steel/20 text-brand-header rounded-xl text-xs focus:ring-2 focus:ring-brand-cream outline-none"
                placeholder="024XXXXXXX or +233..."
              />
              <p className="text-[11px] text-brand-slate/75 mt-1">Used for customer tap-and-send order checkout.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-1">
                Short Description / Tagline
              </label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-brand-dark/45 border border-brand-steel/20 text-brand-header rounded-xl text-xs focus:ring-2 focus:ring-brand-cream outline-none"
                placeholder="Cakes, pastries and custom bakes delivered in Accra"
              />
            </div>
          </div>
        </div>

        {/* ── 5. Branding & Photos (Section 8) ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">Store Accent Color</h2>
              <p className="text-xs text-slate-500 mt-0.5">Choose your store's signature brand color. Your storefront remains clean & predominantly white with this color used for buttons, badges & active highlights.</p>
            </div>
            <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0" style={{ backgroundColor: themeColor }}>
              <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { name: 'Emerald', hex: '#059669' },
              { name: 'Ocean Blue', hex: '#2563EB' },
              { name: 'Royal Indigo', hex: '#6366F1' },
              { name: 'Sunset Rose', hex: '#E11D48' },
              { name: 'Warm Amber', hex: '#D97706' },
              { name: 'Classic Slate', hex: '#0F172A' },
            ].map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => setThemeColor(preset.hex)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left cursor-pointer ${themeColor.toLowerCase() === preset.hex.toLowerCase() ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <span className="w-5 h-5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: preset.hex }} />
                <span className="text-xs font-semibold text-slate-800">{preset.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs font-semibold text-slate-600">Custom Hex:</span>
            <input
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 p-0.5 bg-white"
            />
            <input
              type="text"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#059669"
              className="w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* ── 6. Logo & Banner ── */}
        <div className="bg-brand-steel/10 rounded-2xl border border-brand-steel/15 p-6 backdrop-blur-md space-y-4">
          <h2 className="text-base font-bold text-brand-header font-display pb-3 border-b border-brand-steel/15">
            Logo & Banner
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-2">
                Store Logo (Auto-compressed to WebP)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e, 'logo_url')}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="w-full px-4 py-3 bg-brand-steel/10 text-brand-cream rounded-xl hover:bg-brand-steel/20 cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-brand-steel/20 font-bold text-xs transition-all"
              >
                <Upload size={16} />
                {uploading.logo ? 'Compressing & Uploading...' : 'Upload Logo'}
              </label>
              {formData.logo_url && (
                <div className="mt-3 w-16 h-16 rounded-xl border border-brand-steel/20 overflow-hidden bg-brand-dark/45 p-1">
                  <img src={formData.logo_url} alt="Logo" className="w-full h-full object-contain" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-slate uppercase tracking-wider mb-2">
                Hero Banner
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e, 'hero_banner_url')}
                className="hidden"
                id="banner-upload"
              />
              <label
                htmlFor="banner-upload"
                className="w-full px-4 py-3 bg-brand-steel/10 text-brand-cream rounded-xl hover:bg-brand-steel/20 cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-brand-steel/20 font-bold text-xs transition-all"
              >
                <Upload size={16} />
                {uploading.banner ? 'Compressing & Uploading...' : 'Upload Banner'}
              </label>
              {formData.hero_banner_url && (
                <div className="mt-3 w-full h-24 rounded-xl border border-brand-steel/20 overflow-hidden bg-brand-dark/45">
                  <img src={formData.hero_banner_url} alt="Banner" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-tea-green hover:bg-[#a0e2a9] disabled:opacity-50 text-black px-6 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-lg transition-all"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
