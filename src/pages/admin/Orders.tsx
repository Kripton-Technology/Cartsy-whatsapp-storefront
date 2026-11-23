import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api';
import type { Order, OrderStatus } from '../../lib/types';
import { money } from '../../lib/format';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ChevronDown,
  RefreshCw,
  Eye,
  MapPin,
} from 'lucide-react';

const STATUS_OPTIONS: OrderStatus[] = [
  'New',
  'Received',
  'Preparing',
  'Ready',
  'Out for delivery',
  'Completed',
  'Cancelled',
];

const SOURCE_OPTIONS = ['all', 'instagram', 'tiktok', 'snapchat', 'facebook', 'whatsapp', 'direct'];

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getOrders({
        status: statusFilter === 'all' ? undefined : statusFilter,
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        search: searchQuery.trim() || undefined,
      });
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter, sourceFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      setUpdatingId(orderId);
      const updated = await adminApi.updateOrderStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err) {
      console.error('Failed to update order status:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  // Check if an order is still marked New and is over 5 minutes old
  const isOrderDelayedNew = (order: Order) => {
    if (order.status !== 'New') return false;
    const createdAt = new Date(order.created_at).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return createdAt < fiveMinutesAgo;
  };

  const sendWhatsAppStatusUpdate = (order: Order) => {
    if (!order.customer_phone) {
      alert('This customer did not provide a phone number.');
      return;
    }

    let phone = order.customer_phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0') && phone.length === 10) {
      phone = '233' + phone.slice(1);
    }

    let statusDesc = '';
    switch (order.status) {
      case 'Received':
        statusDesc = 'We have confirmed and received your order! 🙌';
        break;
      case 'Preparing':
        statusDesc = 'Your items are being prepared and packaged with care. 📦';
        break;
      case 'Ready':
        statusDesc = 'Your order is ready for pickup or dispatch! 🛍️';
        break;
      case 'Out for delivery':
        statusDesc = 'Your order is on the way to your delivery location! 🚚';
        break;
      case 'Completed':
        statusDesc = 'Your order has been completed! We hope you love your purchase. ✨';
        break;
      case 'Cancelled':
        statusDesc = 'Your order has been cancelled. Please contact us for details.';
        break;
      default:
        statusDesc = 'Your order is currently marked as ' + order.status + '.';
    }

    const trackUrl = `${window.location.origin}/track?order=${order.order_number}`;
    const text = `👋 Hi *${order.customer_name}*,\n\nUpdate on your order *#${order.order_number}*:\nStatus: *${order.status}*\n\n${statusDesc}\n\n🔍 *Track your order in real-time here:*\n${trackUrl}\n\nThank you for shopping with us!`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'New':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Received':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Preparing':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Ready':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Out for delivery':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getSourceBadge = (source: string) => {
    const s = source?.toLowerCase() || 'direct';
    switch (s) {
      case 'instagram':
        return 'bg-pink-50 text-pink-700 border-pink-200';
      case 'tiktok':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'snapchat':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'facebook':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'whatsapp':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-slate-900">Orders & Backups</h1>
              <p className="text-xs text-slate-500">
                Never lose an order • Real-time WhatsApp order backups and tracking
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadOrders}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white border border-slate-200/80 p-3 sm:p-4 rounded-2xl shadow-xs">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer or #order..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </form>

        {/* Status Filter */}
        <div className="sm:col-span-4 relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full appearance-none px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer transition-all"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Source Filter */}
        <div className="sm:col-span-3 relative">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="w-full appearance-none px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 capitalize cursor-pointer transition-all"
          >
            {SOURCE_OPTIONS.map((src) => (
              <option key={src} value={src}>
                {src === 'all' ? 'All Channels' : src}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Orders Table & Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Orders List */}
        <div className="lg:col-span-7 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-200/80 shadow-xs" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200 shadow-xs">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 font-display">No Orders Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                When customers tap buy on your store, orders appear here instantly with tiny text backups and push alerts.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isDelayed = isOrderDelayedNew(order);
              const isSelected = selectedOrder?.id === order.id;

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                      : isDelayed
                      ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          #{order.order_number}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStatusBadge(order.status)}`}>
                          {order.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${getSourceBadge(order.source)}`}>
                          {order.source}
                        </span>
                        {isDelayed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Customer may not have sent on WhatsApp
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 font-display">
                        {order.customer_name}
                      </h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="truncate max-w-[220px]">{order.location}</span>
                      </p>
                      {order.customer_phone && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendWhatsAppStatusUpdate(order);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-200 transition-colors mt-1"
                          title="Send WhatsApp update to customer"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp Update
                        </button>
                      )}
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-sm font-extrabold text-slate-900 font-display">
                        GHS {money(order.total)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      {order.status === 'New' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(order.id, 'Received');
                          }}
                          disabled={updatingId === order.id}
                          className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-all"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark Received
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Order Detail Sidebar */}
        <div className="lg:col-span-5">
          {selectedOrder ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-5 sticky top-6 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Order Details
                  </span>
                  <h3 className="text-lg font-black text-slate-900 font-display">
                    #{selectedOrder.order_number}
                  </h3>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">Placed on</div>
                  <div className="text-xs font-semibold text-slate-900">
                    {new Date(selectedOrder.created_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              {/* Status Update Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Update Order Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleStatusChange(selectedOrder.id, st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        selectedOrder.status === st
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                {selectedOrder.customer_phone && (
                  <button
                    type="button"
                    onClick={() => sendWhatsAppStatusUpdate(selectedOrder)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98] mt-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Send Status Update to Customer</span>
                  </button>
                )}
              </div>

              {/* Customer & Location */}
              <div className="bg-slate-50/70 border border-slate-200/80 p-3.5 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer Name:</span>
                  <span className="font-bold text-slate-900">{selectedOrder.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Location:</span>
                  <span className="font-semibold text-slate-900 text-right max-w-[200px]">
                    {selectedOrder.location}
                  </span>
                </div>
                {selectedOrder.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone:</span>
                    <span className="font-semibold text-slate-900">{selectedOrder.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Traffic Channel:</span>
                  <span className="font-semibold text-emerald-700 capitalize">{selectedOrder.source}</span>
                </div>
                {selectedOrder.notes && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block mb-1">Notes:</span>
                    <p className="text-slate-800 italic bg-white p-2 rounded-lg border border-slate-200/60">
                      "{selectedOrder.notes}"
                    </p>
                  </div>
                )}
              </div>

              {/* Order Items Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Items ({selectedOrder.items?.length || 0})
                </h4>
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl divide-y divide-slate-200/60 overflow-hidden">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.name} {item.selected_option ? `(${item.selected_option})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.qty} × GHS {money(item.price)}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 font-display">
                        GHS {money(item.qty * item.price)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center px-2 pt-2 text-sm font-black text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-slate-900 font-mono">GHS {money(selectedOrder.total)}</span>
                </div>
              </div>

              {/* WhatsApp message customer button (OM-4) */}
              {selectedOrder.customer_phone && (
                <a
                  href={`https://wa.me/${selectedOrder.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hello ${selectedOrder.customer_name}, regarding your order #${selectedOrder.order_number}: `
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-black font-extrabold py-2.5 px-4 rounded-xl text-xs shadow-xs transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message Customer on WhatsApp
                </a>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center p-12 bg-white border border-slate-200/80 rounded-2xl text-center min-h-[360px] shadow-xs">
              <Eye className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-xs text-slate-500 font-medium">Select an order from the list to view full details and update status.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
