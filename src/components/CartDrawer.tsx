import { X, ShoppingCart, MessageCircle } from 'lucide-react';
import { CartItem } from '../contexts/CartContext';
import { CartItemComponent } from './CartItem';
import { money } from '../lib/format';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalPrice: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: () => void;
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  totalPrice,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 h-screen w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-800 shadow-xs">
              <ShoppingCart size={18} />
            </div>
            <h2 className="text-lg font-black text-slate-900">Cart</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 mb-4 shadow-xs">
              <ShoppingCart size={32} />
            </div>
            <p className="text-slate-800 font-bold">Your cart is empty</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Add items to get started
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {items.map((item) => (
                <CartItemComponent
                  key={item.id}
                  item={item}
                  onUpdateQuantity={onUpdateQuantity}
                  onRemove={onRemoveItem}
                />
              ))}
            </div>

            <div className="border-t border-slate-100 p-4 sm:p-6 space-y-4 bg-slate-50/70">
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold text-slate-500">Subtotal</span>
                <span className="font-black text-slate-900 text-lg font-display">
                  GHS {money(totalPrice)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Delivery fee and options calculated at WhatsApp checkout
              </p>

              <button
                onClick={onCheckout}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-black py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-[0.98]"
              >
                <MessageCircle size={18} />
                Checkout via WhatsApp
              </button>
              <button
                onClick={onClose}
                className="w-full bg-white hover:bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl transition-colors border border-slate-200 text-xs cursor-pointer shadow-xs"
              >
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
