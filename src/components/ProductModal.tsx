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
    const [activePhotoIdx, setActivePhotoIdx] = useState(0);

    if (!isOpen) return null;

    const allImages = (product.image_urls && product.image_urls.length > 0)
        ? product.image_urls
        : (product.image_url ? [product.image_url] : []);
    const currentImage = allImages[activePhotoIdx] || product.image_url;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl w-full max-w-3xl overflow-hidden relative flex flex-col md:flex-row my-auto transition-all">
                
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all z-20 border border-slate-200 shadow-xs active:scale-95 cursor-pointer"
                    aria-label="Close modal"
                >
                    <X size={18} />
                </button>

                {/* Left Column: Product Image */}
                <div className="w-full md:w-1/2 relative min-h-[280px] md:min-h-[420px] bg-slate-50 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col justify-between">
                    <div className="relative flex-1 min-h-[240px]">
                        {currentImage ? (
                            <img
                                src={currentImage}
                                alt={product.name}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
                                <ShoppingCart size={64} className="opacity-40" />
                            </div>
                        )}

                        {/* Stock Status Overlay */}
                        {!product.in_stock && (
                            <div className="absolute inset-0 bg-white/90 backdrop-blur-xs flex items-center justify-center">
                                <span className="text-rose-600 font-bold text-sm tracking-wider uppercase border border-rose-200 bg-rose-50 px-4 py-2 rounded-2xl shadow-xs">
                                    Out of Stock
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Photo Thumbnails if multiple */}
                    {allImages.length > 1 && (
                        <div className="p-3 bg-white flex items-center justify-center gap-2 border-t border-slate-100 z-10">
                            {allImages.map((img, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setActivePhotoIdx(idx)}
                                    className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${
                                        activePhotoIdx === idx
                                            ? 'border-slate-900 scale-105'
                                            : 'border-slate-200 opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Column: Product Information */}
                <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between bg-white">
                    <div>
                        {/* Title & Category Badge */}
                        <div className="mb-4">
                            <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 mb-2">
                                Product Details
                            </span>
                            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight font-display">
                                {product.name}
                            </h2>
                            <div className="text-2xl md:text-3xl font-black text-slate-900 mt-2 font-display">
                                GHS {money(product.price)}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-6 max-h-48 overflow-y-auto">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</p>
                            {product.description ? (
                                <p className="text-sm font-normal text-slate-700 whitespace-pre-wrap leading-relaxed">
                                    {product.description}
                                </p>
                            ) : (
                                <p className="text-sm italic text-slate-400">
                                    No description provided for this item.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Quantity & Cart Action */}
                    <div className="space-y-4 pt-2">
                        {/* Quantity Selector */}
                        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Quantity
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-800 hover:bg-slate-100 font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
                                    aria-label="Decrease quantity"
                                    type="button"
                                >
                                    −
                                </button>
                                <span className="w-8 text-center text-base font-black text-slate-900 font-display">
                                    {quantity}
                                </span>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-800 hover:bg-slate-100 font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
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
                            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer ${
                                added
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed'
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
