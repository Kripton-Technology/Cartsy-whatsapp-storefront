import { useEffect, useState } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
  Search,
  Package,
  CheckCircle2,
  Clock,
  Truck,
  ShoppingBag,
  MapPin,
  MessageCircle,
  Store,
  Calendar,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';
import { publicApi } from '../lib/api';
import { money } from '../lib/format';

interface OrderTimelineEvent {
  status: string;
  created_at: string;
}

interface TrackedOrder {
  id: string;
  order_number: string;
  public_token: string;
  customer_name: string;
  customer_phone?: string;
  location: string;
  items: Array<{
    id?: string;
    name: string;
    qty: number;
    price: number;
    selected_option?: string;
  }>;
  total: number;
  status: 'New' | 'Received' | 'Preparing' | 'Ready' | 'Out for delivery' | 'Completed' | 'Cancelled';
  created_at: string;
  notes?: string;
  business_name?: string;
  whatsapp_number?: string;
  store_slug?: string;
  store_logo?: string;
  events?: OrderTimelineEvent[];
}

const ORDER_STEPS = [
  { key: 'Received', label: 'Order Confirmed', desc: 'Store received your order' },
  { key: 'Preparing', label: 'Preparing', desc: 'Packaging your items' },
  { key: 'Ready', label: 'Ready', desc: 'Ready for pickup or delivery' },
  { key: 'Out for delivery', label: 'Out for Delivery', desc: 'On its way to your location' },
  { key: 'Completed', label: 'Delivered', desc: 'Successfully delivered' },
];

export function OrderTracking() {
  const [searchParams] = useSearchParams();
  const { orderNumber: paramOrderNumber } = useParams<{ orderNumber?: string }>();
  
  const initialQuery = searchParams.get('order') || paramOrderNumber || '';
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async (queryCode: string) => {
    if (!queryCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await publicApi.trackOrder(queryCode.trim());
      setOrder(data as TrackedOrder);
    } catch (err: any) {
      console.error('Failed to fetch order:', err);
      setError(err.message || 'Order not found. Please check your order number and try again.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      fetchOrder(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(searchInput);
  };

  const getStepStatus = (stepKey: string, currentStatus: string) => {
    if (currentStatus === 'Cancelled') return 'cancelled';
    const statusOrder = ['New', 'Received', 'Preparing', 'Ready', 'Shipped', 'Delivered'];
    
    // Map 'New' to same visual stage as 'Received'
    const curIdx = currentStatus === 'New' ? 0 : statusOrder.indexOf(currentStatus);
    const stepIdx = statusOrder.indexOf(stepKey);

    if (curIdx >= stepIdx) return 'completed';
    if (curIdx + 1 === stepIdx) return 'current';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-4 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs group-hover:scale-105 transition-transform">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-black text-slate-900 tracking-tight">Cartsy</span>
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Order Tracker</span>
            </div>
          </Link>

          {order?.store_slug && (
            <Link
              to={`/store/${order.store_slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Store
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Search Bar Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="max-w-xl mx-auto text-center space-y-2 mb-5">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">
              Track Your Order
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Enter your order number or tracking code to see live delivery updates
            </p>
          </div>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="e.g. CR-8F92 or tracking code..."
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-sm font-semibold transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Tracking…' : 'Track'}
            </button>
          </form>

          {error && (
            <div className="max-w-xl mx-auto mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800 font-semibold animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Order Details View */}
        {order && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Status Summary Banner */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                    Order #{order.order_number}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                      order.status === 'Completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : order.status === 'Cancelled'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : order.status === 'Out for delivery'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    ● {order.status}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-900 pt-1">
                  {order.business_name || 'Store Order'}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Placed on {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {order.whatsapp_number && (
                <a
                  href={`https://wa.me/${order.whatsapp_number.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hi, I am checking on my order #${order.order_number}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" /> Message Seller
                </a>
              )}
            </div>

            {/* Visual Stepper / Progress Timeline */}
            {order.status !== 'Cancelled' ? (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
                  Delivery Timeline
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                  {ORDER_STEPS.map((step, idx) => {
                    const statusState = getStepStatus(step.key, order.status);
                    return (
                      <div key={step.key} className="flex md:flex-col items-center gap-3 md:text-center relative group">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                            statusState === 'completed'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : statusState === 'current'
                              ? 'bg-amber-500 text-white border-amber-500 animate-pulse'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {statusState === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : idx === 3 ? (
                            <Truck className="w-5 h-5" />
                          ) : idx === 4 ? (
                            <Package className="w-5 h-5" />
                          ) : (
                            <Clock className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${statusState === 'completed' || statusState === 'current' ? 'text-slate-900' : 'text-slate-400'}`}>
                            {step.label}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-800 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <p className="font-bold text-sm">Order Cancelled</p>
                  <p className="text-xs text-rose-600 mt-0.5">This order was cancelled by the store. Please reach out to the store on WhatsApp for details.</p>
                </div>
              </div>
            )}

            {/* Order Details & Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Items Card */}
              <div className="md:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  Order Items ({Array.isArray(order.items) ? order.items.length : 1})
                </h3>

                <div className="divide-y divide-slate-100">
                  {Array.isArray(order.items) &&
                    order.items.map((it, i) => (
                      <div key={i} className="py-3 flex justify-between items-center text-xs sm:text-sm">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900">
                            {it.name} {it.selected_option && <span className="text-slate-500 font-normal">({it.selected_option})</span>}
                          </p>
                          <p className="text-slate-400 font-medium">Qty: {it.qty} × GHS {money(it.price)}</p>
                        </div>
                        <span className="font-bold font-mono text-slate-900">
                          GHS {money(it.qty * it.price)}
                        </span>
                      </div>
                    ))}
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-500">Total Amount:</span>
                  <span className="text-lg font-black font-mono text-slate-900">
                    GHS {money(order.total)}
                  </span>
                </div>
              </div>

              {/* Delivery & Customer Info Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Delivery Details
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Customer</span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{order.customer_name}</p>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Phone Number</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{order.customer_phone || 'Provided via WhatsApp'}</p>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Delivery / Pickup Address</span>
                    <p className="font-semibold text-slate-800 mt-0.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                      {order.location}
                    </p>
                  </div>

                  {order.notes && (
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[10px]">Customer Notes</span>
                      <p className="italic text-slate-600 mt-0.5 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
                        "{order.notes}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
