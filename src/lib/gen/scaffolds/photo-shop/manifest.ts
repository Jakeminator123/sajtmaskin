import type { ScaffoldManifest } from "../types";

export const photoShopManifest: ScaffoldManifest = {
  id: "photo-shop",
  family: "photo-shop",
  label: "Photo Shop",
  description:
    "Curated product-photography storefront with editorial grid, sidebar navigation, cart drawer, product detail with gallery, and a refined monochrome design system.",
  buildIntents: ["website", "template"],
  tags: [
    "photo",
    "photography",
    "shop",
    "storefront",
    "ecommerce",
    "gallery",
    "editorial",
    "minimal",
    "curated",
    "products",
    "cart",
    "portfolio-shop",
  ],
  promptHints: [
    "Use this scaffold for visually-driven product storefronts where photography and curation matter — fashion, art prints, lifestyle goods, design objects.",
    "The layout uses a 12-column base grid with generous spacing, a fixed sidebar for navigation, and a large editorial product grid. Preserve this rhythm.",
    "Color palette is intentionally monochrome (oklch neutrals). Introduce accent color sparingly through product imagery, not through UI chrome.",
    "Product cards should be image-first with minimal text overlay. Use the LatestProductCard pattern: large hero card spanning 2 columns, then alternating 1-column cards.",
    "Cart is a drawer (vaul), not a separate page. Keep add-to-cart interactions inline on product pages.",
    "Footer inverts foreground/background and uses the store logo as a large typographic element.",
    "CRITICAL: The scaffold provides lib/types.ts (Product type) and lib/cart-context.tsx (CartProvider + useCart hook). Import from these files — never use useCart or Product without importing them first.",
    "Do NOT import Metadata from 'next' AND declare a local Metadata — pick one.",
  ],
  qualityChecklist: [
    "Store name replaces 'ACME Store' in metadata, header logo, and footer.",
    "Product grid uses the editorial 2-col + 1-col alternating pattern from the scaffold.",
    "Sidebar navigation lists real product categories, not placeholder text.",
    "Product detail page includes a multi-image gallery with desktop/mobile variants.",
    "Cart drawer opens/closes smoothly and shows item count in the header.",
    "Design tokens in globals.css use oklch monochrome palette — no stray hex or hsl colors.",
    "The 12-column base-grid utility is used for page-level layout.",
    "Typography uses tight line-height (1.2) and negative letter-spacing throughout.",
    "Every component that uses useCart imports it from @/lib/cart-context.",
    "Every component that references Product imports the type from @/lib/types.",
    "No duplicate Metadata identifiers — use import type { Metadata } from 'next' only once per file.",
  ],
  research: {
    upgradeTargets: [
      "Add product variant selection with color swatches and size picker.",
      "Implement client-side cart persistence via localStorage or cookies.",
      "Add product filtering by category, color, and price range with URL state (nuqs).",
      "Include structured data (JSON-LD Product + BreadcrumbList) on product pages.",
      "Add a checkout flow with shipping and payment summary.",
    ],
    referenceTemplates: [],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --spacing-sides: var(--sides);
  --spacing-top-spacing: var(--top-spacing);

  --font-family-sans: var(--font-geist-sans), sans-serif;
  --font-family-mono: var(--font-geist-mono), monospace;

  --text-xs--line-height: 1.2;
  --text-sm--line-height: 1.2;
  --text-base--line-height: 1.2;
  --text-lg--line-height: 1.2;
  --text-xl--line-height: 1.2;
  --text-2xl--line-height: 1.2;

  --text-xs--letter-spacing: -0.015em;
  --text-sm--letter-spacing: -0.015em;
  --text-base--letter-spacing: -0.015em;
  --text-lg--letter-spacing: -0.015em;
  --text-xl--letter-spacing: -0.015em;
  --text-2xl--letter-spacing: -0.015em;

  --radius: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

:root {
  --background: oklch(0.9542 0 0);
  --foreground: oklch(0.1457 0 0);
  --card: oklch(0.9079 0 0);
  --card-foreground: oklch(0.1457 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.1457 0 0);
  --primary: oklch(0.2044 0 0);
  --primary-foreground: oklch(0.9848 0 0);
  --secondary: oklch(0.96 0 0);
  --secondary-foreground: oklch(0.2044 0 0);
  --muted: oklch(0.9079 0 0);
  --muted-foreground: oklch(0.5547 0 0);
  --accent: oklch(0.9234 0 0);
  --accent-foreground: oklch(0.2044 0 0);
  --destructive: oklch(0.5802 0.2375 28.48);
  --border: oklch(0.7974 0 0);
  --input: oklch(0.9234 0 0);
  --ring: oklch(0.7079 0 0);

  --radius: 0.5rem;
  --sides: 1rem;
  --top-spacing: 5rem;
}

@media (width >= 768px) {
  :root {
    --sides: 1.5rem;
    --top-spacing: 9rem;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}

@layer utilities {
  .base-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--sides);
  }

  .base-gap {
    gap: var(--sides);
  }

  .scrollbar-hide {
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  .text-balance {
    text-wrap: balance;
  }
}

html, body, * {
  overscroll-behavior: none;
  scroll-behavior: smooth;
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "[Store Name]",
  description: "[Store tagline — one sentence about what you sell]",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={\`\${geistSans.variable} \${geistMono.variable} antialiased min-h-screen\`}
      >
        <main>{children}</main>
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import Image from "next/image";
import Link from "next/link";

const FEATURED_PRODUCTS = [
  {
    id: "1",
    title: "[Product Name]",
    handle: "product-1",
    price: "1 299 kr",
    image: "/placeholder.svg?height=800&width=600&text=Featured+Product",
  },
  {
    id: "2",
    title: "[Product Name]",
    handle: "product-2",
    price: "899 kr",
    image: "/placeholder.svg?height=600&width=600&text=Product+2",
  },
  {
    id: "3",
    title: "[Product Name]",
    handle: "product-3",
    price: "1 599 kr",
    image: "/placeholder.svg?height=600&width=600&text=Product+3",
  },
  {
    id: "4",
    title: "[Product Name]",
    handle: "product-4",
    price: "749 kr",
    image: "/placeholder.svg?height=600&width=600&text=Product+4",
  },
];

export default function Home() {
  const [hero, ...rest] = FEATURED_PRODUCTS;

  return (
    <div className="p-sides pt-top-spacing">
      <div className="base-grid">
        {/* Sidebar */}
        <aside className="col-span-4 hidden md:block">
          <nav className="sticky top-top-spacing space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Collections
            </h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/shop" className="hover:underline">All</Link></li>
              <li><Link href="/shop/new-arrivals" className="hover:underline">New Arrivals</Link></li>
              <li><Link href="/shop/bestsellers" className="hover:underline">Bestsellers</Link></li>
            </ul>
          </nav>
        </aside>

        {/* Product grid */}
        <section className="col-span-12 md:col-span-8">
          <div className="grid grid-cols-2 base-gap">
            {/* Hero card — spans full width */}
            <Link href={\`/product/\${hero.handle}\`} className="group col-span-2 relative overflow-hidden rounded-lg">
              <Image
                src={hero.image}
                alt={hero.title}
                width={1200}
                height={800}
                className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute bottom-4 left-4">
                <p className="text-sm font-medium text-white drop-shadow-md">{hero.title}</p>
                <p className="text-xs text-white/80 drop-shadow-md">{hero.price}</p>
              </div>
            </Link>

            {/* Remaining cards — 1 column each */}
            {rest.map((product) => (
              <Link key={product.id} href={\`/product/\${product.handle}\`} className="group relative overflow-hidden rounded-lg">
                <Image
                  src={product.image}
                  alt={product.title}
                  width={600}
                  height={600}
                  className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <div className="absolute bottom-3 left-3">
                  <p className="text-sm font-medium text-white drop-shadow-md">{product.title}</p>
                  <p className="text-xs text-white/80 drop-shadow-md">{product.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "lib/types.ts",
      content: `export interface Product {
  id: string;
  handle: string;
  title: string;
  description: string;
  price: string;
  compareAtPrice?: string;
  images: { src: string; alt: string }[];
  category?: string;
  tags?: string[];
  variants?: { id: string; title: string; price: string; available: boolean }[];
}

export interface CartItem {
  product: Product;
  variantId?: string;
  quantity: number;
}
`,
    },
    {
      path: "lib/cart-context.tsx",
      content: `"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Product, CartItem } from "./types";

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addItem: (product: Product, variantId?: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const addItem = useCallback((product: Product, variantId?: string) => {
    setItems((prev) => {
      const key = variantId ?? product.id;
      const existing = prev.find(
        (item) => (item.variantId ?? item.product.id) === key,
      );
      if (existing) {
        return prev.map((item) =>
          (item.variantId ?? item.product.id) === key
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [...prev, { product, variantId, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string) => {
    setItems((prev) =>
      prev.filter(
        (item) => (item.variantId ?? item.product.id) !== (variantId ?? productId),
      ),
    );
  }, []);

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantId?: string) => {
      if (quantity <= 0) {
        removeItem(productId, variantId);
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          (item.variantId ?? item.product.id) === (variantId ?? productId)
            ? { ...item, quantity }
            : item,
        ),
      );
    },
    [removeItem],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext value={{ items, itemCount, isOpen, open, close, toggle, addItem, removeItem, updateQuantity, clearCart }}>
      {children}
    </CartContext>
  );
}
`,
    },
  ],
};
