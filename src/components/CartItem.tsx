import { Trash2, Plus, Minus } from 'lucide-react';
import { CartItem as CartItemType } from '../contexts/CartContext';
import { money, toAmount } from '../lib/format';

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function CartItemComponent({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  return (
    <div className="flex gap-4 py-4 border-b border-slate-100 items-center">
      <div className="w-20 h-20 bg-slate-50 rounded-xl flex-shrink-0 overflow-hidden border border-slate-200 shadow-2xs">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-900 text-sm truncate">
          {item.name}
        </h3>
        {item.selectedOption && (
          <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 inline-block mt-0.5">
            {item.selectedOption}
          </span>
        )}
        <p className="text-slate-900 font-extrabold text-sm mt-1 font-display">
          GHS {money(item.price)}
        </p>
        <p className="text-slate-500 text-xs mt-0.5 font-medium">
          Total: GHS {money(toAmount(item.price) * item.cartQuantity)}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <button
          onClick={() => onRemove(item.id)}
          className="w-8 h-8 flex items-center justify-center text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 size={16} />
        </button>

        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() =>
              onUpdateQuantity(item.id, Math.max(1, item.cartQuantity - 1))
            }
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-200/60 text-slate-800 transition-colors cursor-pointer"
            aria-label="Decrease quantity"
          >
            <Minus size={14} />
          </button>
          <span className="w-7 text-center text-xs font-bold text-slate-900">
            {item.cartQuantity}
          </span>
          <button
            onClick={() => onUpdateQuantity(item.id, item.cartQuantity + 1)}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-200/60 text-slate-800 transition-colors cursor-pointer"
            aria-label="Increase quantity"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
