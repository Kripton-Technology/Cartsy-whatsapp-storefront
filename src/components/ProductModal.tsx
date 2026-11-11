import { ShoppingCart, Plus, X, Check } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../lib/types';
import { money, toAmount } from '../lib/format';

interface ProductModalProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
    onAddToCart: (product: Product, quantity: number) => void;
}

export function ProductModal({ product, isOpen, onClose, onAddToCart }: ProductModalProps) {
    const [quantity, setQuantity] = useState(1);
    const [added, setAdded] = useState(false);

    if (!isOpen) return null;

    const handleAddClick = () => {
        onAddToCart(product, quantity);
        setAdded(true);
        setTimeout(() => {
            setAdded(false);
            setQuantity(1);
            onClose();
        }, 600);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto animate-fadeIn">
            <div className="bg-brand-dark/95 dark:bg-slate-900/95 light:bg-white/95 backdrop-blur-2xl rounded-3xl border border-brand-steel/30 shadow-2xl w-full max-w-3xl overflow-hidden relative flex flex-col md:flex-row my-auto transition-all">
                
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 p-2.5 bg-brand-steel/20 hover:bg-brand-steel/35 text-brand-header rounded-full transition-all z-20 border border-brand-steel/25 shadow-md active:scale-95"
                    aria-label="Close modal"
                >
                    <X size={20} />
                </button>

                {/* Left Column: Product Image */}
                <div className="w-full md:w-1/2 relative min-h-[280px] md:min-h-[420px] bg-brand-steel/10 flex-shrink-0 border-b md:border-b-0 md:border-r border-brand-steel/20">
                    {product.image_url ? (
                        <img
                            src={product.image_url}
                            alt={product.name}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-steel/20 to-brand-dark/40">
                            <ShoppingCart size={64} className="text-brand-slate/40" />
                        </div>
                    )}

                    {/* Stock Status Overlay */}
                    {!product.in_stock && (
                        <div className="absolute inset-0 bg-brand-dark/85 backdrop-blur-sm flex items-center justify-center">
                            <span className="text-rose-400 font-black text-xl tracking-widest uppercase border border-rose-500/30 bg-rose-500/10 px-4 py-2 rounded-2xl">
                                Out of Stock
                            </span>
                        </div>
                    )}
                </div>

                {/* Right Column: Product Information */}
                <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
                    <div>
                        {/* Title & Category Badge */}
                        <div className="mb-4">
                            <span className="inline-block px-3 py-1 bg-brand-cream/15 text-brand-cream text-xs font-extrabold rounded-full border border-brand-cream/30 mb-2">
                                Product Details
                            </span>
                            <h2 className="text-2xl md:text-3xl font-black text-brand-header tracking-tight font-display">
                                {product.name}
                            </h2>
                            <div className="text-2xl md:text-3xl font-black text-brand-cream mt-2 font-display">
                                GHS {money(product.price)}
                            </div>
                        </div>

                        {/* Description - Crystal Clear Contrast */}
                        <div className="bg-brand-steel/10 p-4 rounded-2xl border border-brand-steel/15 mb-6 max-h-48 overflow-y-auto">
                            <p className="text-xs font-bold text-brand-slate uppercase tracking-wider mb-1">Description</p>
                            {product.description ? (
                                <p className="text-sm font-semibold text-brand-gray whitespace-pre-wrap leading-relaxed">
                                    {product.description}
                                </p>
                            ) : (
                                <p className="text-sm italic text-brand-slate/60">
                                    No description provided for this item.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Quantity & Cart Action */}
                    <div className="space-y-4 pt-2">
                        {/* Quantity Selector */}
                        <div className="bg-brand-steel/10 rounded-2xl p-3.5 border border-brand-steel/15 flex items-center justify-between">
                            <span className="text-xs font-bold text-brand-slate uppercase tracking-wider">
                                Quantity
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="w-9 h-9 rounded-xl bg-brand-steel/20 border border-brand-steel/30 flex items-center justify-center text-brand-header hover:bg-brand-steel/40 font-bold transition-all active:scale-95 shadow-sm"
                                    aria-label="Decrease quantity"
                                    type="button"
                                >
                                    −
                                </button>
                                <span className="w-8 text-center text-base font-black text-brand-header font-display">
                                    {quantity}
                                </span>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="w-9 h-9 rounded-xl bg-brand-steel/20 border border-brand-steel/30 flex items-center justify-center text-brand-header hover:bg-brand-steel/40 font-bold transition-all active:scale-95 shadow-sm"
                                    aria-label="Increase quantity"
                                    type="button"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        {/* Add to Cart Button */}
                        <button
                            onClick={handleAddClick}
                            disabled={!product.in_stock}
                            className={`w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
                                added
                                    ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                                    : 'bg-brand-cream text-brand-dark hover:opacity-95 shadow-brand-cream/20 disabled:bg-brand-steel/30 disabled:text-brand-slate disabled:cursor-not-allowed'
                            }`}
                        >
                            {added ? (
                                <>
                                    <Check size={20} />
                                    <span>Added to Cart!</span>
                                </>
                            ) : (
                                <>
                                    <Plus size={20} />
                                    <span>Add to Cart · GHS {money(toAmount(product.price) * quantity)}</span>
                                </>
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
