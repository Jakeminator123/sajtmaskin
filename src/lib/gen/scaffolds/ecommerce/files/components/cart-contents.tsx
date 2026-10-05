"use client";

import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2 } from "lucide-react";
import { findProduct, formatPrice } from "../lib/product-catalog";
import { MAX_QUANTITY } from "../lib/cart-state";
import { useCart } from "./cart-provider";

export function CartContents() {
  const cart = useCart();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Lokal demokorg — inga beställningar, betalningar eller lagerreservationer skapas.
      </p>
      {!cart.storageAvailable ? (
        <p role="status" className="text-muted-foreground text-sm">
          Lokal lagring är inte tillgänglig. Korgen fungerar här men kanske inte sparas efter
          omladdning.
        </p>
      ) : null}
      {!cart.ready ? (
        <p role="status">Läser demokorgen…</p>
      ) : cart.items.length === 0 ? (
        <p>Varukorgen är tom.</p>
      ) : null}
      {cart.items.map((item) => {
        const product = findProduct(item.id);
        if (!product) return null;
        return (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatPrice(product.priceMinor)} / st (demopris)
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Ta bort ${product.name}`}
                disabled={!cart.ready}
                onClick={() => cart.remove(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Minska antal för ${product.name}`}
                  disabled={!cart.ready}
                  onClick={() => cart.changeQuantity(item.id, -1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span aria-label={`Antal ${product.name}`}>{item.quantity}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Öka antal för ${product.name}`}
                  disabled={!cart.ready || item.quantity >= MAX_QUANTITY}
                  onClick={() => cart.changeQuantity(item.id, 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm font-semibold">
                {formatPrice(product.priceMinor * item.quantity)}
              </p>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between border-t pt-4">
        <span>Demototal</span>
        <span aria-label="Demototal">{formatPrice(cart.priceMinor)}</span>
      </div>
      <Button type="button" className="w-full" disabled>
        Till kassan (inte ansluten)
      </Button>
      <p className="text-muted-foreground text-sm">
        Checkout, frakt, skatt och servervaliderade priser kräver en riktig integration.
      </p>
    </div>
  );
}
