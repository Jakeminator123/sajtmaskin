"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ShoppingBag } from "lucide-react";
import { CartContents } from "./cart-contents";
import { useCart } from "./cart-provider";

export function CartDrawer() {
  const cart = useCart();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Öppna varukorg (${cart.count})`}
        >
          <ShoppingBag className="h-4 w-4" />
          {cart.count > 0 ? (
            <Badge className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1 text-[10px]">
              {cart.count}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Din demokorg</SheetTitle>
          <SheetDescription>
            Produktdata och priser är exempel. Ingen checkout är ansluten.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto">
          <CartContents />
        </div>
      </SheetContent>
    </Sheet>
  );
}
