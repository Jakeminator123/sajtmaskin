"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { findProduct } from "../lib/product-catalog";
import { MAX_QUANTITY } from "../lib/cart-state";
import { useCart } from "./cart-provider";

export function AddToCart({ productId }: { productId: string }) {
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const product = findProduct(productId);
  if (!product) return null;
  const full = (cart.items.find((item) => item.id === productId)?.quantity ?? 0) >= MAX_QUANTITY;
  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={!cart.ready || full}
        onClick={() => {
          cart.changeQuantity(productId, 1);
          setAdded(true);
        }}
      >
        Lägg i varukorgen<span className="sr-only">: {product.name}</span>
      </Button>
      {added ? (
        <p role="status" className="text-muted-foreground text-sm">
          {product.name} har lagts i demokorgen.
        </p>
      ) : null}
      {full ? (
        <p className="text-muted-foreground text-sm">
          Demo begränsad till {MAX_QUANTITY} per produkt.
        </p>
      ) : null}
    </div>
  );
}
