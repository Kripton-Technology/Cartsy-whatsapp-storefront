import { ShoppingCart, Plus, Check } from 'lucide-react';
import { useState, useRef } from 'react';
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

  // VibeUI Spotlight Cursor Effect
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

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
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative bg-white rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden flex flex-col h-full border border-slate-200/80 group ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      }`}
    >
      {/* VibeUI Spotlight Radial Glow */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-2xl z-0"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 0, 0, 0.03), transparent 45%)`,
        }}
      />

      {/* Product Thumbnail */}
      <div className="relative h-48 sm:h-52 w-full bg-slate-50 overflow-hidden border-b border-slate-100 z-10">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
            <ShoppingCart size={40} className="opacity-40" />
          </div>
        )}

        {!product.in_stock && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-xs flex items-center justify-center z-20">
            <span className="text-rose-600 font-bold text-xs uppercase tracking-wider border border-rose-200 bg-rose-50 px-3 py-1 rounded-xl shadow-xs">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between z-10 bg-white">
        <div>
          <h3 className="text-base font-bold text-slate-900 mb-1.5 line-clamp-2 group-hover:text-emerald-700 transition-colors font-display">
            {product.name}
          </h3>

          {product.description && (
            <p className="text-xs font-normal text-slate-500 mb-3 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}
        </div>

        <div className="pt-2">
          {/* Price Tag */}
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-lg sm:text-xl font-black text-slate-900 font-display">
              GHS {money(product.price)}
            </span>
          </div>

          {/* Quantity Selector Overlay */}
          {showQuantitySelector && (
            <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[11px] font-bold text-slate-600 uppercase mb-1.5">Select Quantity:</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setQuantity(Math.max(1, quantity - 1)); }}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-bold transition-all flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  value={quantity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 text-center text-sm font-bold bg-white border border-slate-200 text-slate-900 rounded-lg outline-none py-1"
                  min="1"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setQuantity(quantity + 1); }}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-bold transition-all flex items-center justify-center"
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
            className={`w-full font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer ${
              added
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed'
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
              className="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-1.5 rounded-lg transition-colors text-xs"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
