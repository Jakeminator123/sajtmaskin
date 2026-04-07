import type { ScaffoldManifest } from "../types";

export const localRetailManifest: ScaffoldManifest = {
  id: "local-retail",
  family: "local-retail",
  label: "Lokal butik",
  description:
    "Local retail store website with product showcase, opening hours, location, and news. For shops, boutiques, florists, bakeries, and similar local businesses.",
  buildIntents: ["website"],
  tags: [
    "butik",
    "affär",
    "shop",
    "retail",
    "blomsterhandel",
    "florist",
    "bageri",
    "konditori",
    "inredning",
    "leksaker",
    "present",
    "secondhand",
    "vintage",
    "bokhandel",
    "djuraffär",
    "optiker",
    "apotek",
  ],
  promptHints: [
    "This scaffold is for local retail shops. Product showcase and location are key.",
    "Opening hours must be prominently displayed.",
    "Show a curated selection of products or categories — not a full e-commerce catalog.",
    "Include address and how to find the shop (map placeholder).",
    "For shops with seasonal/rotating inventory, include a news/updates section.",
    "Use warm, inviting imagery from Unsplash (shop interiors, products).",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.13 0.004 0);
  --color-foreground: oklch(0.95 0.004 0);
  --color-card: oklch(0.17 0.004 0);
  --color-card-foreground: oklch(0.95 0.004 0);
  --color-primary: oklch(0.6 0.14 170);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.2 0.004 0);
  --color-secondary-foreground: oklch(0.9 0.004 0);
  --color-muted: oklch(0.2 0.004 0);
  --color-muted-foreground: oklch(0.6 0.004 0);
  --color-accent: oklch(0.23 0.004 0);
  --color-accent-foreground: oklch(0.9 0.004 0);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.005 25);
  --color-border: oklch(0.25 0.004 0);
  --color-input: oklch(0.22 0.004 0);
  --color-ring: oklch(0.6 0.14 170);
  --radius: 0.625rem;
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
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
  title: "[Butiksnamn] — [Stad]",
  description: "Välkommen till [Butiksnamn] i [Stad]. Upptäck vårt sortiment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark">
      <body className={\`\${inter.variable} antialiased\`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Clock, MapPin, ShoppingBag } from "lucide-react";
import Image from "next/image";

const categories = [
  { name: "[Kategori 1]", desc: "Kort beskrivning av produktsortimentet.", img: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=600&q=80" },
  { name: "[Kategori 2]", desc: "Kort beskrivning av produktsortimentet.", img: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&q=80" },
  { name: "[Kategori 3]", desc: "Kort beskrivning av produktsortimentet.", img: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=600&q=80" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80" alt="Butiksentré" fill className="object-cover opacity-15" priority />
        </div>
        <ShoppingBag className="h-10 w-10 text-primary" />
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">[Butiksnamn]</h1>
        <p className="max-w-xl text-lg text-muted-foreground">Noggrant utvalt sortiment i hjärtat av [Stad].</p>
        <Button size="lg">Besök oss <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl space-y-10">
          <h2 className="text-3xl font-bold tracking-tight text-center">Vårt sortiment</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Card key={cat.name} className="bg-card border-border overflow-hidden">
                <div className="relative h-48">
                  <Image src={cat.img} alt={cat.name} fill className="object-cover" />
                </div>
                <CardContent className="pt-4 space-y-2">
                  <h3 className="font-semibold">{cat.name}</h3>
                  <p className="text-sm text-muted-foreground">{cat.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-4xl grid gap-8 sm:grid-cols-2">
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><Clock className="h-8 w-8 text-primary" /><h3 className="font-semibold">Öppettider</h3><p className="text-sm text-muted-foreground">Mån–Fre 10–18<br/>Lör 10–16<br/>Sön stängt</p></CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><MapPin className="h-8 w-8 text-primary" /><h3 className="font-semibold">Hitta hit</h3><p className="text-sm text-muted-foreground">[Gatuadress]<br/>[Stad]</p></CardContent></Card>
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
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

const navItems = [
  { label: "Sortiment", href: "#sortiment" },
  { label: "Om oss", href: "#om" },
  { label: "Hitta hit", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">[Butiksnamn]</a>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a>))}
          <Button size="sm">Besök oss</Button>
        </nav>
        <button type="button" className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-label="Meny"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>{item.label}</a>))}
        </nav>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-12">
      <div className="mx-auto max-w-6xl flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-bold tracking-tight">[Butiksnamn]</p>
        <p className="text-sm text-muted-foreground">[Gatuadress], [Stad] · [Telefonnummer]</p>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} [Butiksnamn]</p>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
