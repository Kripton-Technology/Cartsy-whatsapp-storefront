import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { Category, Product } from '../lib/types';
import { ProductCard } from './ProductCard';
import { ProductModal } from './ProductModal';

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  loading: boolean;
  onAddToCart: (product: Product, quantity: number) => void;
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  initialProductId?: string;
}

export function ProductGrid({
  products,
  categories,
  loading,
  onAddToCart,
  selectedCategory,
  onSelectCategory,
  initialProductId,
}: ProductGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (initialProductId && products.length > 0) {
      const match = products.find((p) => p.id === initialProductId);
      if (match) {
        setSelectedProduct(match);
      }
    }
  }, [initialProductId, products]);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-brand-steel/15 rounded-xl h-64 animate-pulse border border-brand-steel/10"
            />
          ))}
        </div>
      </div>
    );
  }

  // Filter products by search term
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    return matchesSearch;
  });

  return (
    <section className="px-4 sm:px-6 py-8" id="products">
      <div className="mb-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-display">
              Our Products
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">Tap any item to view details or add to WhatsApp order</p>
          </div>
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl leading-5 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all text-sm shadow-2xs"
            />
          </div>
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="flex overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 gap-2.5 items-center">
            <button
              onClick={() => onSelectCategory(null)}
              className={`whitespace-nowrap min-h-[44px] px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
                selectedCategory === null
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200'
              }`}
            >
              All Products
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => onSelectCategory(category.id)}
                className={`whitespace-nowrap min-h-[44px] px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
                  selectedCategory === category.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!filteredProducts || filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
          <p className="text-slate-500 text-lg">No products found matching your search.</p>
          <button
            onClick={() => {
              setSearchTerm('');
              onSelectCategory(null);
            }}
            className="mt-4 text-emerald-600 hover:underline font-bold"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={onAddToCart}
              onClick={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={onAddToCart}
        />
      )}
    </section>
  );
}
