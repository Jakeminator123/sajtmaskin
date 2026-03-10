import type { ScaffoldManifest } from "../types";

export const ecommerceManifest: ScaffoldManifest = {
  id: "ecommerce",
  family: "ecommerce",
  label: "E-handel",
  description:
    "Storefront starter with product grid, category filtering, product detail page, cart drawer, and checkout-ready layout.",
  buildIntents: ["website", "template"],
  tags: [
    "ecommerce",
    "shop",
    "store",
    "products",
    "cart",
    "webshop",
    "storefront",
    "retail",
  ],
  promptHints: [
    "Use this scaffold for online stores, product catalogs, and webshops.",
    "The cart drawer is a client-side sheet — keep product data in a simple array or context for now.",
    "Adapt product categories, imagery, and pricing to the user's niche. Replace all placeholder names.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0.003 250);
  --color-foreground: oklch(0.13 0.02 260);
  --color-card: oklch(0.97 0.003 250);
  --color-card-foreground: oklch(0.13 0.02 260);
  --color-popover: oklch(0.97 0.003 250);
  --color-popover-foreground: oklch(0.13 0.02 260);
  --color-primary: oklch(0.45 0.1 260);
  --color-primary-foreground: oklch(0.98 0.003 250);
  --color-secondary: oklch(0.94 0.01 260);
  --color-secondary-foreground: oklch(0.2 0.02 260);
  --color-muted: oklch(0.94 0.01 260);
  --color-muted-foreground: oklch(0.46 0.02 260);
  --color-accent: oklch(0.94 0.01 260);
  --color-accent-foreground: oklch(0.2 0.02 260);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.003 250);
  --color-border: oklch(0.88 0.01 260);
  --color-input: oklch(0.88 0.01 260);
  --color-ring: oklch(0.45 0.1 260);
  --color-chart-1: oklch(0.6 0.2 260);
  --color-chart-2: oklch(0.65 0.15 160);
  --color-chart-3: oklch(0.55 0.18 30);
  --color-chart-4: oklch(0.62 0.2 290);
  --color-chart-5: oklch(0.7 0.18 60);
  --radius: 0.625rem;
}

@layer base {
  body {
    @apply bg-background text-foreground antialiased;
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "[Butiksnamn] — Handla online",
  description: "Utforska vårt sortiment och hitta det du letar efter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={\`\${inter.variable} antialiased\`}>
        <SiteHeader />
        <main className="min-h-[80vh]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const categories = [
  { name: "[Kategori 1]", slug: "category-1", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&h=400&fit=crop" },
  { name: "[Kategori 2]", slug: "category-2", image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&h=400&fit=crop" },
  { name: "[Kategori 3]", slug: "category-3", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop" },
];

const featuredProducts = [
  { id: "1", name: "[Produktnamn 1]", price: "[Pris]", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop", badge: "Nyhet" },
  { id: "2", name: "[Produktnamn 2]", price: "[Pris]", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop" },
  { id: "3", name: "[Produktnamn 3]", price: "[Pris]", image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500&h=500&fit=crop" },
  { id: "4", name: "[Produktnamn 4]", price: "[Pris]", image: "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=500&h=500&fit=crop", badge: "Populär" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center gap-6 bg-muted/40 px-6 py-24 text-center sm:py-32">
        <Badge variant="outline" className="rounded-full px-4 py-1 text-sm">Välkommen till [Butiksnamn]</Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Upptäck vårt sortiment
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Handla enkelt online. Snabb leverans och trygga betalningar.
        </p>
        <div className="flex gap-3">
          <Button size="lg" className="rounded-full">
            Handla nu <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="rounded-full">
            Kategorier
          </Button>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Kategorier</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Link key={cat.slug} href={\`/category/\${cat.slug}\`} className="group">
              <Card className="overflow-hidden transition-shadow hover:shadow-lg">
                <div className="relative aspect-3/2 overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <CardContent className="p-4">
                  <p className="font-medium">{cat.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Utvalda produkter</h2>
          <Button variant="ghost" className="text-sm">
            Visa alla <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <Link key={product.id} href={\`/product/\${product.id}\`} className="group">
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  {product.badge && (
                    <Badge className="absolute left-3 top-3 rounded-full">{product.badge}</Badge>
                  )}
                </div>
                <CardContent className="p-4">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.price}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
`,
    },
    {
      path: "components/site-header.tsx",
      content: `"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, ShoppingBag, Search } from "lucide-react";

const navItems = [
  { label: "Hem", href: "/" },
  { label: "Produkter", href: "/products" },
  { label: "Kategorier", href: "/categories" },
  { label: "Om oss", href: "/about" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          [Butiksnamn]
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="hidden md:flex">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <ShoppingBag className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `import Link from "next/link";

const footerLinks = {
  Butik: [
    { label: "Alla produkter", href: "/products" },
    { label: "Kategorier", href: "/categories" },
    { label: "Nyheter", href: "/new" },
    { label: "Rea", href: "/sale" },
  ],
  Info: [
    { label: "Om oss", href: "/about" },
    { label: "Leverans", href: "/shipping" },
    { label: "Returer", href: "/returns" },
    { label: "Kontakt", href: "/contact" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-3">
        <div className="space-y-4">
          <p className="text-lg font-bold tracking-tight">[Butiksnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Din destination för [produkttyp]. Snabb leverans, trygga betalningar och personlig service.
          </p>
        </div>
        {Object.entries(footerLinks).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((link) => (
                <Link key={link.href} href={link.href} className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t pt-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} [Butiksnamn]. Alla rättigheter förbehållna.
      </div>
    </footer>
  );
}
`,
    },
  ],
};
