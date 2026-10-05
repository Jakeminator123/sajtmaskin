"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  cartStorageKey,
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

export function CartProvider({
  children,
  storageScope = "/",
}: {
  children: ReactNode;
  storageScope?: string;
}) {
  const storageKey = cartStorageKey(storageScope);
  // A changed project scope remounts atomically, before any storage read/write.
  return (
    <ScopedCartProvider key={storageKey} storageKey={storageKey}>
      {children}
    </ScopedCartProvider>
  );
}

function ScopedCartProvider({ children, storageKey }: { children: ReactNode; storageKey: string }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    try {
      setItems(readCartStorage(window.localStorage.getItem(storageKey)));
    } catch {
      setStorageAvailable(false);
    } finally {
      setReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      setStorageAvailable(false);
    }
  }, [items, ready, storageKey]);

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
