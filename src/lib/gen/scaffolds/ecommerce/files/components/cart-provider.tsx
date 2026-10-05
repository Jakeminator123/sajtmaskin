"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  CART_STORAGE_KEY,
  cartTotals,
  changeCartQuantity,
  readCartStorage,
  type CartItem,
} from "../lib/cart-state";

type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  storageAvailable: boolean;
  count: number;
  priceMinor: number;
  changeQuantity: (id: string, delta: number) => void;
  remove: (id: string) => void;
};
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    try {
      setItems(readCartStorage(window.localStorage.getItem(CART_STORAGE_KEY)));
    } catch {
      setStorageAvailable(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      setStorageAvailable(false);
    }
  }, [items, ready]);

  const value: CartContextValue = {
    items,
    ready,
    storageAvailable,
    ...cartTotals(items),
    changeQuantity: (id, delta) => {
      if (ready) setItems((current) => changeCartQuantity(current, id, delta));
    },
    remove: (id) => {
      if (ready) setItems((current) => current.filter((item) => item.id !== id));
    },
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("Cart controls require the shared CartProvider in app/layout.tsx.");
  return cart;
}
