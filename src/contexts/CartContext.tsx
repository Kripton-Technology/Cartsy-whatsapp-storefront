import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Product } from '../lib/types';
import { toAmount } from '../lib/format';

export interface CartItem extends Product {
  cartQuantity: number;
  selectedOption?: string;
}

interface CartContextType {
  items: CartItem[];
  currentStoreSlug: string | null;
  setCurrentStoreSlug: (slug: string) => void;
  addToCart: (product: Product, quantity: number, selectedOption?: string) => void;
  removeFromCart: (productId: string, selectedOption?: string) => void;
  updateQuantity: (productId: string, quantity: number, selectedOption?: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function getStorageKey(slug: string | null) {
  return slug ? `cartsy_cart_${slug}` : 'cartsy_cart_default';
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Infer slug from initial window path if on store route
  const getInitialSlug = () => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/(?:s|store)\/([^/]+)/);
    return match ? match[1] : null;
  };

  const [currentStoreSlug, setCurrentStoreSlug] = useState<string | null>(getInitialSlug());
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(getStorageKey(getInitialSlug()));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Reload cart whenever store slug changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(getStorageKey(currentStoreSlug));
      setItems(saved ? JSON.parse(saved) : []);
    } catch (e) {
      console.warn('Failed to load cart from localStorage:', e);
      setItems([]);
    }
  }, [currentStoreSlug]);

  // Persist items to localStorage whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = getStorageKey(currentStoreSlug);
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save cart to localStorage:', e);
    }
  }, [items, currentStoreSlug]);

  const addToCart = (product: Product, quantity: number, selectedOption?: string) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.id === product.id && item.selectedOption === selectedOption
      );

      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, cartQuantity: item.cartQuantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, cartQuantity: quantity, selectedOption }];
    });
  };

  const removeFromCart = (productId: string, selectedOption?: string) => {
    setItems((prev) =>
      prev.filter((item) => !(item.id === productId && item.selectedOption === selectedOption))
    );
  };

  const updateQuantity = (productId: string, quantity: number, selectedOption?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId, selectedOption);
    } else {
      setItems((prev) =>
        prev.map((item) =>
          item.id === productId && item.selectedOption === selectedOption
            ? { ...item, cartQuantity: quantity }
            : item
        )
      );
    }
  };

  const clearCart = () => {
    setItems([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(getStorageKey(currentStoreSlug));
      } catch {}
    }
  };

  const getTotalPrice = () => {
    return items.reduce((total, item) => {
      let price = toAmount(item.price);
      if (item.selectedOption && item.options) {
        const opt = item.options.find(o => o.name === item.selectedOption);
        if (opt && opt.price) price = toAmount(opt.price);
      }
      return total + price * item.cartQuantity;
    }, 0);
  };

  const getTotalItems = () => {
    return items.reduce((total, item) => total + item.cartQuantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        currentStoreSlug,
        setCurrentStoreSlug,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getTotalPrice,
        getTotalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
