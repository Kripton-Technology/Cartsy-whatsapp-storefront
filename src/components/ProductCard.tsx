import { ShoppingCart, Plus, Check } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../lib/types';
import { money } from '../lib/format';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity: number) => void;
  onClick?: () => void;
}

export function ProductCard({ product, onAddToCart, onClick }: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [showQuantitySelector, setShowQuantitySelector] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card click
    if (showQuantitySelector) {
      onAddToCart(product, quantity);
      setAdded(true);
      setTimeout(() => {
        setAdded(false);
        setQuantity(1);
        setShowQuantitySelector(false);
      }, 600);
    } else {
      setShowQuantitySelector(true);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`bg-brand-steel/10 backdrop-blur-xl rounded-2xl shadow-xl hover:shadow-2xl hover:border-brand-cream/40 transition-all duration-300 overflow-hidden flex flex-col h-full border border-brand-steel/20 group ${onClick ? 'cursor-pointer hover:-translate-y-1' : ''}`}
    >
      {/* Product Thumbnail */}
      <div className="relative h-48 sm:h-52 w-full bg-brand-steel/20 overflow-hidden border-b border-brand-steel/15">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-steel/20 to-brand-dark/40">
            <ShoppingCart size={44} className="text-brand-slate/40" />
          </div>
        )}

        {!product.in_stock && (
          <div className="absolute inset-0 bg-brand-dark/85 backdrop-blur-sm flex items-center justify-center">
            <span className="text-rose-400 font-black text-sm uppercase tracking-widest border border-rose-500/30 bg-rose-500/10 px-3 py-1 rounded-xl">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="text-base font-extrabold text-brand-header mb-1.5 line-clamp-2 group-hover:text-brand-cream transition-colors font-display">
            {product.name}
          </h3>

          {product.description && (
            <p className="text-xs font-semibold text-brand-slate mb-3 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        <div className="pt-2">
          {/* Price Tag */}
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-lg sm:text-xl font-black text-brand-cream font-display">
              GHS {money(product.price)}
            </span>
          </div>

          {/* Quantity Selector Overlay */}
          {showQuantitySelector && (
            <div className="mb-3 p-3 bg-brand-steel/15 backdrop-blur-md border border-brand-steel/20 rounded-xl">
              <p className="text-[11px] font-bold text-brand-slate uppercase mb-1.5">Select Quantity:</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setQuantity(Math.max(1, quantity - 1)); }}
                  className="w-8 h-8 rounded-lg bg-brand-steel/20 hover:bg-brand-steel/35 text-brand-header font-bold transition-all flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  value={quantity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 text-center text-sm font-bold bg-brand-steel/20 border border-brand-steel/30 text-brand-header rounded-lg outline-none py-1"
                  min="1"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setQuantity(quantity + 1); }}
                  className="w-8 h-8 rounded-lg bg-brand-steel/20 hover:bg-brand-steel/35 text-brand-header font-bold transition-all flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Add to Cart Button */}
          <button
            onClick={handleAddClick}
            disabled={!product.in_stock}
            className={`w-full font-extrabold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 ${
              added
                ? 'bg-emerald-500 text-white'
                : 'bg-brand-cream text-brand-dark hover:opacity-90 disabled:bg-brand-steel/30 disabled:text-brand-slate disabled:cursor-not-allowed'
            }`}
          >
            {added ? (
              <>
                <Check size={16} />
                <span>Added!</span>
              </>
            ) : showQuantitySelector ? (
              <>
                <Plus size={16} />
                <span>Confirm Add</span>
              </>
            ) : (
              <>
                <ShoppingCart size={16} />
                <span>Add to Cart</span>
              </>
            )}
          </button>

          {showQuantitySelector && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowQuantitySelector(false); }}
              className="w-full mt-2 bg-brand-steel/20 hover:bg-brand-steel/30 text-brand-slate font-bold py-1.5 rounded-lg transition-colors text-xs"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
