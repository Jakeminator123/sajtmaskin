# app/page.tsx

Reason: Useful structural reference

```text
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, ShoppingCart } from "lucide-react";
import { PRODUCTS } from "@/lib/products";
import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  const product = PRODUCTS[0]; // Get our single product

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">AudioStore</h1>
            <Badge variant="secondary" className="text-sm">
              Free Shipping
            </Badge>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 lg:py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Product Image */}
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden bg-muted">
                <Image
                  src={
                    product.images?.[0] ||
                    "/placeholder.svg?height=500&width=500&query=premium headphones"
                  }
                  alt={product.name}
                  width={500}
                  height={500}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute top-4 left-4">
                <Badge className="bg-primary text-primary-foreground">
                  Best Seller
                </Badge>
              </div>
            </div>

            {/* Product Details */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                  <span className="text-sm text-muted-foreground">
                    (4.9/5 from 2,847 reviews)
                  </span>
                </div>
                <h2 classNam

// ... truncated
```
