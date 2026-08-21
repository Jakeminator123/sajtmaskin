"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

const initialCartItems: CartItem[] = [
  { id: "1", name: "[Produktnamn 1]", price: 499, quantity: 1 },
  { id: "2", name: "[Produktnamn 2]", price: 799, quantity: 2 },
];

const STORAGE_KEY = "sajtmaskin-demo-cart:v1";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0
  );
}

export function CartDrawer() {
  const [cartItems, setCartItems] = useState<CartItem[]>(initialCartItems);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every(isCartItem)) setCartItems(parsed);
      }
    } catch {
      // Storage is an enhancement; the in-memory cart remains fully usable.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Private browsing or storage quotas must not break cart controls.
    }
  }, [cartItems, storageReady]);

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const changeQuantity = (id: string, delta: number) => {
    setCartItems((items) =>
      items.flatMap((item) => {
        if (item.id !== id) return [item];
        const quantity = item.quantity + delta;
        return quantity > 0 ? [{ ...item, quantity }] : [];
      }),
    );
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Öppna varukorg (${itemCount})`}
        >
          <ShoppingBag className="h-4 w-4" />
          {itemCount > 0 ? (
            <Badge className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1 text-[10px]">
              {itemCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Din varukorg</SheetTitle>
          <SheetDescription>Exempeldata — ersätt med riktig state eller API-data.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
          {cartItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">Varukorgen är tom</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Lägg till en produkt för att fortsätta till kassan.
              </p>
            </div>
          ) : null}
          {cartItems.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-muted-foreground text-xs">{item.price} kr/st</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Ta bort ${item.name}`}
                  onClick={() => changeQuantity(item.id, -item.quantity)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-1 rounded-md border p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Minska antal för ${item.name}`}
                    onClick={() => changeQuantity(item.id, -1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Öka antal för ${item.name}`}
                    onClick={() => changeQuantity(item.id, 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm font-semibold">{item.price * item.quantity} kr</p>
              </div>
            </div>
          ))}
        </div>
        <SheetFooter className="mt-4 border-t pt-4">
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Totalt</span>
              <span className="font-semibold">{totalPrice} kr</span>
            </div>
            <Button className="w-full" disabled={cartItems.length === 0}>
              Till kassan
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
