import { useState } from 'react';
import { X, CheckCircle, ExternalLink, MessageSquare } from 'lucide-react';
import { CartItem } from '../contexts/CartContext';
import type { BusinessInfo } from '../lib/types';
import { money, toAmount } from '../lib/format';
import { publicApi } from '../lib/api';

interface OrderModalProps {
  items: CartItem[];
  business: BusinessInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OrderModal({ items, business, isOpen, onClose, onSuccess }: OrderModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    location: '',
    note: '',
  });

  const [confirmedOrder, setConfirmedOrder] = useState<{
    orderNumber: string;
    publicToken: string;
    whatsappUrl: string;
  } | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const totalPrice = items.reduce((sum, item) => {
    let price = toAmount(item.price);
    if (item.selectedOption && item.options) {
      const opt = item.options.find((o) => o.name === item.selectedOption);
      if (opt && opt.price) price = toAmount(opt.price);
    }
    return sum + price * item.cartQuantity;
  }, 0);

  // Read traffic source from sessionStorage or url params
  const getTrafficSource = (): string => {
    if (typeof window === 'undefined') return 'direct';
    const sessionSrc = sessionStorage.getItem('cartsy_src');
    if (sessionSrc) return sessionSrc;
    const urlSrc = new URLSearchParams(window.location.search).get('src');
    if (urlSrc) {
      sessionStorage.setItem('cartsy_src', urlSrc);
      return urlSrc;
    }
    return 'direct';
  };

  const formatWhatsAppNumber = (raw: string) => {
    let clean = raw.replace(/[^0-9]/g, '');
    if (clean.startsWith('0') && clean.length === 10) {
      // Standard Ghana local format (024xxxxxxx -> 23324xxxxxxx)
      clean = '233' + clean.slice(1);
    }
    return clean;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.location.trim() || !formData.phone.trim()) {
      alert('Please fill in your name, delivery location, and WhatsApp phone number');
      return;
    }

    const rawNumber = business?.whatsapp_number;
    if (!rawNumber) {
      alert('Business WhatsApp number is not configured. Please add it to your store settings.');
      return;
    }

    const whatsappNumber = formatWhatsAppNumber(rawNumber);
    const source = getTrafficSource();

    // Generate unique order number (e.g. CR-8F92) & unguessable public tracking token
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `CR-${Date.now().toString(36).slice(-3).toUpperCase()}${randomHex}`;
    const publicToken = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 12)}`;

    // Build items text list
    let itemsList = '';
    const compactItems: { id: string; name: string; qty: number; price: number; selected_option?: string }[] = [];

    items.forEach((item, index) => {
      let price = toAmount(item.price);
      if (item.selectedOption && item.options) {
        const opt = item.options.find((o) => o.name === item.selectedOption);
        if (opt && opt.price) price = toAmount(opt.price);
      }
      const optionText = item.selectedOption ? ` (${item.selectedOption})` : '';
      itemsList += `\n${index + 1}. *${item.name}${optionText}*\n   Qty: ${item.cartQuantity} × GHS ${money(price)} = GHS ${money(price * item.cartQuantity)}`;

      compactItems.push({
        id: item.id,
        name: item.name,
        qty: item.cartQuantity,
        price,
        selected_option: item.selectedOption,
      });
    });

    const storeName = business?.business_name || 'Store';
    const sourceBadge = source && source !== 'direct' ? `\n\n📱 _Ordered via ${source.charAt(0).toUpperCase() + source.slice(1)}_` : '';
    const trackUrl = `${window.location.origin}/track?order=${orderNumber}`;

    const message = `🛍️ *NEW ORDER: ${orderNumber}*\nStore: *${storeName}*\n${itemsList}\n\n💰 *Total: GHS ${money(totalPrice)}*\n\n👤 *Customer:* ${formData.name.trim()}\n📍 *Location:* ${formData.location.trim()}\n📞 *Phone:* ${formData.phone.trim()}${formData.note ? `\n📝 *Notes:* ${formData.note.trim()}` : ''}\n\n🔍 *Track Order:* ${trackUrl}${sourceBadge}\n\nThank you!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    // OF-5: Non-blocking backup before redirect.
    // Saving must NEVER block or delay the WhatsApp redirect.
    publicApi.backupOrder({
      order_number: orderNumber,
      public_token: publicToken,
      store_slug: business?.slug || '',
      customer_name: formData.name.trim(),
      customer_phone: formData.phone.trim() || undefined,
      location: formData.location.trim(),
      items: compactItems,
      delivery_fee: 0,
      total: totalPrice,
      source,
      notes: formData.note.trim() || undefined,
    });

    // OF-3: Open WhatsApp click-to-chat
    const newWindow = window.open(whatsappUrl, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = whatsappUrl;
    }

    // OF-8: Customer sees confirmation screen with order number & reminder to press Send in WhatsApp
    setConfirmedOrder({
      orderNumber,
      publicToken,
      whatsappUrl,
    });

    onSuccess();
  };

  const handleFinish = () => {
    setConfirmedOrder(null);
    setFormData({ name: '', phone: '', location: '', note: '' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xl max-h-[92vh] overflow-y-auto">
        {confirmedOrder ? (
          /* Confirmation Screen (OF-8) */
          <div className="text-center py-4 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto animate-bounce shadow-2xs">
              <CheckCircle className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                Order Created!
              </h2>
              <div className="mt-2 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold text-sm">
                Order #{confirmedOrder.orderNumber}
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-2xl text-left space-y-2">
              <div className="flex items-start gap-2.5">
                <MessageSquare className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                  <strong>Important:</strong> Please ensure you tapped <strong>Send</strong> in WhatsApp so the seller receives your order message directly.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <a
                href={confirmedOrder.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black py-4 px-4 rounded-2xl shadow-md transition-transform active:scale-95 text-sm cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Re-open WhatsApp
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>

              <a
                href={`/track?order=${confirmedOrder.orderNumber}`}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-2xl shadow-xs transition-colors text-sm cursor-pointer"
              >
                Track Order Live
              </a>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-colors text-xs cursor-pointer"
              >
                Back to Store
              </button>
            </div>
          </div>
        ) : (
          /* Checkout Form */
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-black text-slate-900 font-display tracking-tight">Checkout</h2>
                <p className="text-xs text-slate-500 mt-0.5">Quick guest order • Sent directly to WhatsApp</p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
                aria-label="Close checkout"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl mb-5 max-h-44 overflow-y-auto">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Order Items ({items.length}):</p>
              <div className="space-y-2">
                {items.map((item) => {
                  let price = toAmount(item.price);
                  if (item.selectedOption && item.options) {
                    const opt = item.options.find((o) => o.name === item.selectedOption);
                    if (opt && opt.price) price = toAmount(opt.price);
                  }
                  return (
                    <div key={`${item.id}-${item.selectedOption || ''}`} className="flex justify-between text-xs sm:text-sm">
                      <span className="text-slate-600 font-medium">
                        {item.name} {item.selectedOption ? `(${item.selectedOption})` : ''} × {item.cartQuantity}
                      </span>
                      <span className="font-bold text-slate-900">
                        GHS {money(price * item.cartQuantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Your Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Ama Mensah"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none text-sm transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Delivery Location / Pickup *
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="e.g., East Legon, Accra / or 'Store Pickup'"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none text-sm transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Phone Number (WhatsApp) *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="e.g. 024 123 4567"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none text-sm transition-all font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Special Notes / Requests <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleInputChange}
                  placeholder="Flavour, custom notes, delivery time..."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none resize-none text-sm transition-all"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Amount</p>
                  <p className="text-xs text-slate-400">Guest checkout • No account needed</p>
                </div>
                <p className="text-2xl font-black text-slate-900 font-display">
                  GHS {money(totalPrice)}
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-black py-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-sm sm:text-base active:scale-[0.98] cursor-pointer"
              >
                <MessageSquare className="w-5 h-5" />
                Tap to Order on WhatsApp
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-colors text-sm cursor-pointer"
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
