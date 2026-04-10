import type { ScaffoldManifest } from "../types";

export const ecommerceManifest: ScaffoldManifest = {
  id: "ecommerce",
  family: "ecommerce",
  label: "E-handel",
  description:
    "Storefront starter with product grid, category filtering, product detail page, cart drawer, and checkout-ready layout.",
  allowedBuildIntents: ["website", "template"],
  tags: [
    "ecommerce",
    "shop",
    "store",
    "products",
    "cart",
    "webshop",
    "storefront",
    "retail",
    "checkout",
    "e-handel",
    "produkter",
    "kundvagn",
  ],
  promptHints: [
    "Use this scaffold for online stores, product catalogs, and webshops.",
    "This scaffold includes a product list, category pages, product detail pages, and a client-side cart drawer.",
    "Adapt product categories, imagery, and pricing to the user's niche. Replace all placeholder names.",
  ],
  qualityChecklist: [
    "Store name replaces [Butiksnamn] everywhere — header, hero badge, footer, metadata.",
    "Product names, categories, and prices are specific to the user's niche.",
    "Category and product images use descriptive placeholder text matching the niche.",
    "Hero section communicates the store's unique selling proposition, not generic copy.",
    "Navigation includes relevant links for the store type (not generic Hem/Produkter).",
    "Color scheme adapted from neutral to match the product category's visual identity.",
  ],
  research: {
    upgradeTargets: [
      "Persist cart state in localStorage and keep quantity changes between reloads.",
      "Add faceted filtering (price range, tags) with URL-based state in category pages.",
      "Add a checkout flow with address, delivery method, and payment summary steps.",
      "Show related products and recently viewed items on product pages.",
      "Generate structured data (JSON-LD Product + BreadcrumbList) for category and product pages.",
    ],
    referenceTemplates: [
      { id: "ecommerce-blazity-enterprise-ecommerce-starter", title: "Blazity Enterprise Ecommerce Starter", categorySlug: "ecommerce", qualityScore: 96, strengths: ["verified Next.js codebase", "product catalog patterns", "checkout flow"] },
      { id: "ecommerce-stripe-subscription-starter", title: "Stripe Subscription Starter", categorySlug: "ecommerce", qualityScore: 96, strengths: ["verified Next.js codebase", "payment integration", "subscription billing"] },
      { id: "ecommerce-your-next-store-commerce-with-next-js-and-stripe", title: "Your Next Store — Commerce with Stripe", categorySlug: "ecommerce", qualityScore: 96, strengths: ["verified Next.js codebase", "storefront architecture", "cart and checkout"] },
    ],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.13 0.004 0);
  --color-card: oklch(0.97 0 0);
  --color-card-foreground: oklch(0.13 0.004 0);
  --color-popover: oklch(0.97 0 0);
  --color-popover-foreground: oklch(0.13 0.004 0);
  --color-primary: oklch(0.58 0.16 258);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.94 0.004 0);
  --color-secondary-foreground: oklch(0.2 0.004 0);
  --color-muted: oklch(0.94 0.004 0);
  --color-muted-foreground: oklch(0.46 0.004 0);
  --color-accent: oklch(0.94 0.004 0);
  --color-accent-foreground: oklch(0.2 0.004 0);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0 0);
  --color-border: oklch(0.88 0.004 0);
  --color-input: oklch(0.88 0.004 0);
  --color-ring: oklch(0.58 0.16 258);
  --color-chart-1: oklch(0.6 0.004 0);
  --color-chart-2: oklch(0.65 0.15 160);
  --color-chart-3: oklch(0.55 0.18 30);
  --color-chart-4: oklch(0.62 0.2 290);
  --color-chart-5: oklch(0.7 0.18 60);
  --radius: 0.625rem;
}

@layer base {
  body {
    @apply bg-background text-foreground antialiased;
    background-image:
      radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 10%, white) 0%, transparent 28%);
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
      path: "app/om/page.tsx",
      content: `export default function OmPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Om oss</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        [Kort butikspresentation — ersätt med er historia, värderingar och kontaktuppgifter.]
      </p>
    </div>
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
          <Button asChild size="lg" className="rounded-full">
            <Link href="/products">
              Handla nu <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <Link href="/categories">Kategorier</Link>
          </Button>
        </div>
      </section>

      {/* Categories */}
      <section id="kategorier" className="mx-auto max-w-6xl px-6 py-16">
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
      path: "app/products/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";

const products = [
  { id: "1", name: "[Produktnamn 1]", price: "[Pris]", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop", category: "[Kategori 1]" },
  { id: "2", name: "[Produktnamn 2]", price: "[Pris]", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop", category: "[Kategori 2]" },
  { id: "3", name: "[Produktnamn 3]", price: "[Pris]", image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500&h=500&fit=crop", category: "[Kategori 3]" },
  { id: "4", name: "[Produktnamn 4]", price: "[Pris]", image: "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=500&h=500&fit=crop", category: "[Kategori 1]" },
  { id: "5", name: "[Produktnamn 5]", price: "[Pris]", image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500&h=500&fit=crop", category: "[Kategori 2]" },
  { id: "6", name: "[Produktnamn 6]", price: "[Pris]", image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=500&h=500&fit=crop", category: "[Kategori 3]" },
];

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Alla produkter</h1>
        <p className="text-muted-foreground">Utforska hela sortimentet och filtrera vidare per kategori.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link key={product.id} href={\`/product/\${product.id}\`} className="group">
            <Card className="overflow-hidden transition-shadow hover:shadow-md">
              <div className="relative aspect-square overflow-hidden bg-muted">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <CardContent className="space-y-2 p-4">
                <Badge variant="outline" className="rounded-full">{product.category}</Badge>
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-muted-foreground">{product.price}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/categories/page.tsx",
      content: `import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";

const categories = [
  { name: "[Kategori 1]", slug: "category-1", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=500&fit=crop" },
  { name: "[Kategori 2]", slug: "category-2", image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=500&fit=crop" },
  { name: "[Kategori 3]", slug: "category-3", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=500&fit=crop" },
];

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Kategorier</h1>
        <p className="text-muted-foreground">Välj en kategori för att se relevanta produkter.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link key={category.slug} href={\`/category/\${category.slug}\`} className="group">
            <Card className="overflow-hidden transition-shadow hover:shadow-md">
              <div className="relative aspect-4/3 overflow-hidden">
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <CardContent className="p-4">
                <p className="font-medium">{category.name}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/category/[slug]/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const categoryProducts: Record<string, { title: string; description: string; products: Array<{ id: string; name: string; price: string; image: string; badge?: string }> }> = {
  "category-1": {
    title: "[Kategori 1]",
    description: "Utforska våra mest populära produkter i denna kategori.",
    products: [
      { id: "1", name: "[Produktnamn 1]", price: "[Pris]", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop", badge: "Nyhet" },
      { id: "4", name: "[Produktnamn 4]", price: "[Pris]", image: "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=500&h=500&fit=crop" },
    ],
  },
  "category-2": {
    title: "[Kategori 2]",
    description: "Noggrant utvalda produkter för vardag och premiumbehov.",
    products: [
      { id: "2", name: "[Produktnamn 2]", price: "[Pris]", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop" },
      { id: "5", name: "[Produktnamn 5]", price: "[Pris]", image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500&h=500&fit=crop", badge: "Bästsäljare" },
    ],
  },
  "category-3": {
    title: "[Kategori 3]",
    description: "Produkter för dig som vill kombinera funktion och stil.",
    products: [
      { id: "3", name: "[Produktnamn 3]", price: "[Pris]", image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=500&h=500&fit=crop" },
      { id: "6", name: "[Produktnamn 6]", price: "[Pris]", image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=500&h=500&fit=crop" },
    ],
  },
};

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryProducts[slug] ?? categoryProducts["category-1"];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{category.title}</h1>
          <p className="max-w-2xl text-muted-foreground">{category.description}</p>
        </div>
        <Button variant="outline" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filter (kommer snart)
        </Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {category.products.map((product) => (
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
              <CardContent className="space-y-2 p-4">
                <p className="font-medium">{product.name}</p>
                <p className="text-sm text-muted-foreground">{product.price}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/product/[id]/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const products: Record<string, { name: string; price: string; description: string; category: string; image: string; bullets: string[] }> = {
  "1": {
    name: "[Produktnamn 1]",
    price: "[Pris]",
    description: "Kort produktbeskrivning som lyfter värde, material och användningsområde.",
    category: "[Kategori 1]",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1000&h=1000&fit=crop",
    bullets: ["Snabb leverans", "14 dagars returrätt", "Trygg betalning"],
  },
  "2": {
    name: "[Produktnamn 2]",
    price: "[Pris]",
    description: "Kort produktbeskrivning som hjälper kunden att förstå varför produkten passar.",
    category: "[Kategori 2]",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1000&h=1000&fit=crop",
    bullets: ["Populärt val", "Premiumkvalitet", "Fri frakt över [Belopp]"],
  },
  "3": {
    name: "[Produktnamn 3]",
    price: "[Pris]",
    description: "Kort produktbeskrivning med fokus på nytta och kvalitet.",
    category: "[Kategori 3]",
    image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1000&h=1000&fit=crop",
    bullets: ["Kundfavorit", "Snabb support", "Säker checkout"],
  },
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products[id];

  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <div className="relative aspect-square bg-muted">
            <Image src={product.image} alt={product.name} fill className="object-cover" />
          </div>
        </Card>
        <div className="space-y-6">
          <div className="space-y-3">
            <Badge variant="outline" className="rounded-full">{product.category}</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
            <p className="text-2xl font-semibold">{product.price}</p>
            <p className="text-muted-foreground">{product.description}</p>
          </div>
          <div className="space-y-2">
            {product.bullets.map((item) => (
              <p key={item} className="text-sm text-muted-foreground">• {item}</p>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg">Lägg i varukorgen</Button>
            <Button size="lg" variant="outline">Köp nu</Button>
          </div>
          <Link
            href="/products"
            className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Tillbaka till produkter
          </Link>
        </div>
      </div>
      <section className="mt-16 space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Relaterade produkter</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(products)
            .filter(([productId]) => productId !== id)
            .map(([productId, item]) => (
              <Link key={productId} href={\`/product/\${productId}\`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-2 p-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.price}</p>
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
      path: "components/cart-drawer.tsx",
      content: `"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

const cartItems = [
  { id: "1", name: "[Produktnamn 1]", price: 499, quantity: 1 },
  { id: "2", name: "[Produktnamn 2]", price: 799, quantity: 2 },
];

const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
const totalPrice = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

export function CartDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={\`Öppna varukorg (\${itemCount})\`}>
          <ShoppingBag className="h-4 w-4" />
          {itemCount > 0 && (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 rounded-full px-1 text-[10px]">{itemCount}</Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Din varukorg</SheetTitle>
          <SheetDescription>Exempeldata — ersätt med riktig state eller API-data.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
          {cartItems.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.price} kr/st</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center gap-1 rounded-md border p-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm">{item.quantity}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
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
            <Button className="w-full">Till kassan</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
import { Menu, Search } from "lucide-react";
import { CartDrawer } from "@/components/cart-drawer";

const navItems = [
  { label: "Hem", href: "/" },
  { label: "Produkter", href: "/products" },
  { label: "Kategorier", href: "/categories" },
  { label: "Om oss", href: "/om" },
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
          <CartDrawer />
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
    { label: "Kategori 1", href: "/category/category-1" },
    { label: "Kategori 2", href: "/category/category-2" },
  ],
  Info: [
    { label: "Om oss", href: "/om" },
    { label: "Produkter", href: "/products" },
    { label: "Kategorier", href: "/categories" },
    { label: "Hem", href: "/" },
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
