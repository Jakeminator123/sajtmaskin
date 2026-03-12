# app/checkout/page.tsx

Reason: Commerce or pricing reference

```text
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Shield, CreditCard } from "lucide-react";
import { PRODUCTS } from "@/lib/products";
import Link from "next/link";
import Image from "next/image";
import Checkout from "@/components/checkout";

export default function CheckoutPage() {
  const product = PRODUCTS[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to store
            </Link>
            <h1 className="text-xl font-semibold">Secure Checkout</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Order Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  Order Summary
                </CardTitle>
                <CardDescription>Review your purchase details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <Image
                      src={
                        product.images?.[0] ||
                        "/placeholder.svg?height=80&width=80&query=headphones"
                      }
                      alt={product.name}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm tex

// ... truncated
```
