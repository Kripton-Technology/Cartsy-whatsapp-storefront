import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';
import type { Product, Category } from '../../lib/types';
import { Plus, Edit2, Trash2, X, Image as ImageIcon, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStorage } from '../../hooks/useStorage';
import { money } from '../../lib/format';

export function ProductManager() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const { uploadFile } = useStorage();

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        price: string;
        image_url: string;
        image_urls: string[];
        category_id: string;
        in_stock: boolean;
    }>({
        name: '',
        description: '',
        price: '',
        image_url: '',
        image_urls: [],
        category_id: '',
        in_stock: true,
    });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [productsData, categoriesData] = await Promise.all([
                adminApi.getProducts(),
                adminApi.getCategories()
            ]);

            setProducts(productsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    }

    const openModal = (product?: Product) => {
        if (!product && products.length >= 50) {
            alert('Store limit reached: Maximum 50 products per store (Section 8 limits). Please remove an existing item to add more.');
            return;
        }

        setCurrentStep(1);
        if (product) {
            setEditingProduct(product);
            const urls = (product.image_urls && product.image_urls.length > 0)
                ? product.image_urls
                : (product.image_url ? [product.image_url] : []);
            setFormData({
                name: product.name,
                description: product.description || '',
                price: Number(product.price || 0).toFixed(2),
                image_url: product.image_url || (urls[0] || ''),
                image_urls: urls,
                category_id: product.category_id || '',
                in_stock: product.in_stock,
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                image_url: '',
                image_urls: [],
                category_id: categories.length > 0 ? categories[0].id : '',
                in_stock: true,
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);

        try {
            const primaryImage = formData.image_urls[0] || formData.image_url || null;
            const productData = {
                name: formData.name,
                description: formData.description || null,
                price: parseFloat(formData.price),
                image_url: primaryImage,
                image_urls: formData.image_urls,
                category_id: formData.category_id || null,
                in_stock: formData.in_stock,
            };

            if (editingProduct) {
                await adminApi.updateProduct(editingProduct.id, productData);
            } else {
                await adminApi.createProduct({ ...productData, display_order: products.length + 1 });
            }

            setIsModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Failed to save product');
        } finally {
            setUploading(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (formData.image_urls.length >= 4) {
            alert('Maximum 4 photos per product allowed (Section 8). Please remove a photo to upload another.');
            return;
        }

        setUploading(true);
        const url = await uploadFile(file, 'products');
        if (url) {
            setFormData((prev) => ({
                ...prev,
                image_url: prev.image_url || url,
                image_urls: [...prev.image_urls, url],
            }));
        }
        setUploading(false);
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setFormData((prev) => {
            const nextUrls = prev.image_urls.filter((_, idx) => idx !== indexToRemove);
            return {
                ...prev,
                image_urls: nextUrls,
                image_url: nextUrls[0] || '',
            };
        });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this product?')) {
            return;
        }

        try {
            await adminApi.deleteProduct(id);
            loadData();
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Failed to delete product');
        }
    };

    const toggleStock = async (id: string, currentStock: boolean) => {
        try {
            await adminApi.updateProduct(id, { in_stock: !currentStock });
            loadData();
        } catch (error) {
            console.error('Error toggling stock status:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-brand-dark">
                <div className="relative">
                    <div className="animate-spin rounded-full h-12 w-12 border-2 border-brand-steel/20 border-b-brand-cream"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 font-display">Products</h1>
                    <p className="text-slate-500 text-xs mt-1">Manage your store catalog and inventory</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs active:scale-95"
                >
                    <Plus size={16} />
                    Add Product
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-4 w-16">Image</th>
                                <th className="px-6 py-4">Product Name</th>
                                <th className="px-6 py-4">Price</th>
                                <th className="px-6 py-4">Category</th>
                                <th className="px-6 py-4 text-center">Stock Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {products.map((product) => {
                                const category = categories.find(c => c.id === product.category_id);

                                return (
                                    <tr key={product.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-200">
                                                {product.image_url ? (
                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="w-6 h-6 text-slate-400" />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                                            <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">{product.description || 'No description'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-extrabold text-slate-900 font-display">GHS {money(product.price)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
                                                {category ? category.name : 'Uncategorized'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => toggleStock(product.id, product.in_stock)}
                                                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${product.in_stock
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                                    }`}
                                            >
                                                {product.in_stock ? 'In Stock' : 'Out of Stock'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openModal(product)}
                                                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                    title="Edit product"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Delete product"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {products.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-brand-slate">
                                        No products found. Start by adding a new product to your store.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
                    <form
                        onSubmit={handleSave}
                        className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] overflow-hidden relative"
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white flex-shrink-0">
                            <h2 className="text-xl font-bold text-slate-900 font-display">
                                {editingProduct ? 'Edit Product' : 'Add New Product'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Progress Stepper */}
                        <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                            {[
                                { step: 1, label: 'Details' },
                                { step: 2, label: 'Pricing' },
                                { step: 3, label: 'Media' },
                                { step: 4, label: 'Review' }
                            ].map((s, idx, arr) => (
                                <div key={s.step} className="flex items-center flex-1 last:flex-none">
                                    <button
                                        type="button"
                                        disabled={s.step > currentStep && !editingProduct}
                                        onClick={() => {
                                            if (s.step === 2 && !formData.name.trim()) return;
                                            if (s.step === 3 && (!formData.name.trim() || !formData.price || parseFloat(formData.price) < 0)) return;
                                            if (s.step === 4 && (!formData.name.trim() || !formData.price || parseFloat(formData.price) < 0)) return;
                                            setCurrentStep(s.step);
                                        }}
                                        className="flex items-center gap-2 group focus:outline-none"
                                    >
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all border ${
                                            currentStep === s.step
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                                : currentStep > s.step
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-white text-slate-400 border-slate-200'
                                        }`}>
                                            {currentStep > s.step ? '✓' : s.step}
                                        </div>
                                        <span className={`text-xs font-bold transition-colors hidden sm:inline ${
                                            currentStep === s.step ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-800'
                                        }`}>
                                            {s.label}
                                        </span>
                                    </button>
                                    
                                    {idx < arr.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-4 transition-colors ${
                                            currentStep > s.step ? 'bg-emerald-200' : 'bg-slate-200'
                                        }`} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {currentStep === 1 && (
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Product Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                            placeholder="e.g., Wireless Headphones"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={5}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none transition-all"
                                            placeholder="Describe your product (features, materials, size, etc.)..."
                                        />
                                    </div>
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Price (GHS) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            min="0"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-mono"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
                                        <select
                                            value={formData.category_id}
                                            onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                        >
                                            <option value="">Uncategorized</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 pt-2">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={formData.in_stock}
                                                    onChange={(e) => setFormData({ ...formData, in_stock: e.target.checked })}
                                                />
                                                <div className={`block w-10 h-6 rounded-full transition-colors ${formData.in_stock ? 'bg-emerald-600' : 'bg-slate-300'}`}></div>
                                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-xs ${formData.in_stock ? 'translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-700">In Stock & Available for Order</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-sm font-semibold text-slate-700">
                                                Product Photos ({formData.image_urls.length}/4)
                                            </label>
                                            <span className="text-[11px] text-slate-400">Auto-compressed WebP &lt;200KB</span>
                                        </div>
                                        {formData.image_urls.length < 4 && (
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImageUpload}
                                                    className="hidden"
                                                    id="product-image-upload"
                                                />
                                                <label
                                                    htmlFor="product-image-upload"
                                                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-emerald-500 font-bold transition-all text-xs"
                                                >
                                                    <Upload size={16} />
                                                    {uploading ? 'Compressing & Uploading...' : `Upload Photo (${formData.image_urls.length}/4)`}
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Image Previews Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {formData.image_urls.map((imgUrl, idx) => (
                                            <div key={idx} className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 aspect-square group">
                                                <img src={imgUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(idx)}
                                                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors shadow-xs"
                                                    title="Remove photo"
                                                >
                                                    <X size={12} />
                                                </button>
                                                {idx === 0 && (
                                                    <span className="absolute bottom-1.5 left-1.5 bg-slate-900/80 text-[9px] font-extrabold px-1.5 py-0.5 rounded text-white">
                                                        Main
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                        {formData.image_urls.length === 0 && (
                                            <div className="col-span-full border border-slate-200 rounded-xl h-44 flex flex-col items-center justify-center bg-slate-50">
                                                <ImageIcon className="w-10 h-10 text-slate-400 mb-2" />
                                                <span className="text-xs text-slate-500 font-medium">No Photos Uploaded Yet (Up to 4)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {currentStep === 4 && (
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row gap-6 items-center md:items-start bg-slate-50/60 p-6 rounded-2xl border border-slate-200/80">
                                        {/* Card Mockup */}
                                        <div className="w-64 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex-shrink-0">
                                            <div className="h-44 bg-slate-100 relative overflow-hidden flex items-center justify-center border-b border-slate-200">
                                                {formData.image_url ? (
                                                    <img src={formData.image_url} alt={formData.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ImageIcon className="w-12 h-12 text-slate-400" />
                                                )}
                                                {formData.in_stock ? (
                                                    <span className="absolute top-3 right-3 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">In Stock</span>
                                                ) : (
                                                    <span className="absolute top-3 right-3 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Out of Stock</span>
                                                )}
                                            </div>
                                            <div className="p-4 space-y-2">
                                                <span className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
                                                    {categories.find(c => c.id === formData.category_id)?.name || 'Uncategorized'}
                                                </span>
                                                <h3 className="font-bold text-slate-900 text-sm truncate">{formData.name || 'Product Name'}</h3>
                                                <p className="text-xs text-slate-500 line-clamp-2 min-h-[2rem]">{formData.description || 'No description provided.'}</p>
                                                <div className="font-black text-slate-900 text-base pt-1 font-display">GHS {money(parseFloat(formData.price || '0'))}</div>
                                            </div>
                                        </div>

                                        {/* Details Summary */}
                                        <div className="flex-1 w-full space-y-4">
                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Final Review</h4>
                                            <div className="divide-y divide-slate-200 text-sm">
                                                <div className="py-2.5 flex justify-between gap-4">
                                                    <span className="text-slate-500">Product Name</span>
                                                    <span className="text-slate-900 font-semibold text-right">{formData.name}</span>
                                                </div>
                                                <div className="py-2.5 flex justify-between gap-4">
                                                    <span className="text-slate-500">Price</span>
                                                    <span className="text-slate-900 font-bold">GHS {money(parseFloat(formData.price || '0'))}</span>
                                                </div>
                                                <div className="py-2.5 flex justify-between gap-4">
                                                    <span className="text-slate-500">Category</span>
                                                    <span className="text-slate-900 font-medium">{categories.find(c => c.id === formData.category_id)?.name || 'Uncategorized'}</span>
                                                </div>
                                                <div className="py-2.5 flex justify-between gap-4">
                                                    <span className="text-slate-500">Availability</span>
                                                    <span className={formData.in_stock ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                                                        {formData.in_stock ? 'In Stock' : 'Out of Stock'}
                                                    </span>
                                                </div>
                                                <div className="py-2.5 flex justify-between gap-4">
                                                    <span className="text-slate-500">Has Image</span>
                                                    <span className={formData.image_url ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                                                        {formData.image_url ? 'Yes' : 'No'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-slate-50 flex-shrink-0">
                            <div>
                                {currentStep > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setCurrentStep(currentStep - 1)}
                                        className="px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-100 font-bold text-xs transition-colors flex items-center gap-1"
                                    >
                                        <ChevronLeft size={16} />
                                        Back
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-100 font-bold text-xs transition-colors"
                                >
                                    Cancel
                                </button>
                                {currentStep < 4 ? (
                                    <button
                                        type="button"
                                        disabled={
                                            (currentStep === 1 && !formData.name.trim()) ||
                                            (currentStep === 2 && (!formData.price || parseFloat(formData.price) < 0)) ||
                                            uploading
                                        }
                                        onClick={() => setCurrentStep(currentStep + 1)}
                                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-bold text-xs transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                                    >
                                        Next
                                        <ChevronRight size={16} />
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={uploading}
                                        className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
                                    >
                                        {editingProduct ? 'Save Changes' : 'Create Product'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
