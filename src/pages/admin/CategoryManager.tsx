import { useState, useEffect } from 'react';
import { adminApi } from '../../lib/api';
import type { Category } from '../../lib/types';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export function CategoryManager() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        active: true,
    });

    useEffect(() => {
        loadCategories();
    }, []);

    async function loadCategories() {
        try {
            const data = await adminApi.getCategories();
            setCategories(data);
        } catch (error) {
            console.error('Error loading categories:', error);
        } finally {
            setLoading(false);
        }
    }

    const openModal = (category?: Category) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                name: category.name,
                active: category.active,
            });
        } else {
            setEditingCategory(null);
            setFormData({
                name: '',
                active: true,
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        try {
            if (editingCategory) {
                await adminApi.updateCategory(editingCategory.id, {
                    name: formData.name,
                    active: formData.active,
                });
            } else {
                await adminApi.createCategory({ name: formData.name });
            }

            setIsModalOpen(false);
            loadCategories();
        } catch (error) {
            console.error('Error saving category:', error);
            alert('Failed to save category');
        }
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await adminApi.updateCategory(id, { active: !currentStatus });
            loadCategories();
        } catch (error) {
            console.error('Error toggling category status:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this category? Products in this category will become uncategorized.')) {
            return;
        }

        try {
            await adminApi.deleteCategory(id);
            loadCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
            alert('Failed to delete category');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
                <div className="relative">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-b-emerald-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 font-display">Categories</h1>
                    <p className="text-slate-500 text-xs mt-1">Manage your storefront product categories</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs active:scale-95"
                >
                    <Plus size={16} />
                    Add Category
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4 text-center">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {categories.map((category) => (
                            <tr key={category.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-6 py-4">
                                    <span className="font-bold text-slate-900 text-sm">{category.name}</span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={() => handleToggleActive(category.id, category.active)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${category.active
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                            }`}
                                    >
                                        {category.active ? 'Active' : 'Hidden'}
                                    </button>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => openModal(category)}
                                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="Edit category"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(category.id)}
                                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Delete category"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {categories.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-6 py-12 text-center text-slate-500 text-xs">
                                    No categories found. Click "Add Category" to create one.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Category Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
                    <form
                        onSubmit={handleSave}
                        className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden relative"
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white flex-shrink-0">
                            <h2 className="text-xl font-bold text-slate-900 font-display">
                                {editingCategory ? 'Edit Category' : 'Add New Category'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Form Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                                        placeholder="e.g., Electronics, Fashion"
                                        autoFocus
                                    />
                                </div>

                                {editingCategory && (
                                    <div className="pt-2">
                                        <label className="flex items-center gap-3 cursor-pointer select-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={formData.active}
                                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                                />
                                                <div className={`block w-10 h-6 rounded-full transition-colors ${formData.active ? 'bg-emerald-600' : 'bg-slate-300'}`}></div>
                                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-xs ${formData.active ? 'translate-x-4' : ''}`}></div>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-700">Active (Visible in storefront)</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-100 font-bold text-xs transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-bold text-xs transition-colors shadow-xs"
                            >
                                {editingCategory ? 'Save Changes' : 'Create Category'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
