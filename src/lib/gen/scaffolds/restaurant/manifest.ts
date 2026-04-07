import type { ScaffoldManifest } from "../types";

export const restaurantManifest: ScaffoldManifest = {
  id: "restaurant",
  family: "restaurant",
  label: "Restaurang",
  description:
    "Restaurant website with menu, about, opening hours, and reservation CTA. Suitable for restaurants, cafés, food trucks, and catering.",
  buildIntents: ["website"],
  tags: [
    "restaurant",
    "restaurang",
    "café",
    "kafé",
    "mat",
    "food",
    "meny",
    "menu",
    "catering",
    "pizzeria",
    "sushi",
    "bar",
    "bistro",
    "brasserie",
    "food truck",
  ],
  promptHints: [
    "This scaffold is for restaurant/food businesses. Include a prominent menu section.",
    "Use warm, inviting imagery from Unsplash (food, dining, kitchen).",
    "Opening hours should be clearly visible, preferably in the hero or a dedicated section.",
    "Include a reservation/booking CTA — this is the primary conversion action.",
    "Add an about section with the restaurant's story.",
    "Mobile experience is critical — most restaurant visitors browse on phones.",
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
  --color-primary: oklch(0.65 0.15 45);
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
  --color-ring: oklch(0.65 0.15 45);
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
  title: "[Restaurangnamn] — Meny & Bokning",
  description: "Välkommen till [Restaurangnamn]. Se vår meny och boka bord online.",
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
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import Image from "next/image";

const menuCategories = [
  { name: "Förrätt", items: [{ dish: "[Rättnamn]", price: "125 kr", desc: "Kort beskrivning av rätten." }] },
  { name: "Varmrätt", items: [{ dish: "[Rättnamn]", price: "245 kr", desc: "Kort beskrivning av rätten." }] },
  { name: "Dessert", items: [{ dish: "[Rättnamn]", price: "95 kr", desc: "Kort beskrivning av rätten." }] },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&q=80" alt="Restauranginteriör" fill className="object-cover opacity-20" priority />
        </div>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">[Restaurangnamn]</h1>
        <p className="max-w-xl text-lg text-muted-foreground">Mat lagad med kärlek, serverad med omsorg.</p>
        <div className="flex gap-4 pt-4">
          <Button size="lg">Boka bord <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <Button size="lg" variant="outline">Se menyn</Button>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl space-y-12">
          <h2 className="text-3xl font-bold tracking-tight text-center">Meny</h2>
          {menuCategories.map((cat) => (
            <div key={cat.name} className="space-y-4">
              <h3 className="text-xl font-semibold text-primary">{cat.name}</h3>
              {cat.items.map((item) => (
                <div key={item.dish} className="flex items-start justify-between border-b border-border pb-3">
                  <div><p className="font-medium">{item.dish}</p><p className="text-sm text-muted-foreground">{item.desc}</p></div>
                  <span className="shrink-0 font-semibold text-primary">{item.price}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-4xl grid gap-8 sm:grid-cols-3">
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><Clock className="h-8 w-8 text-primary" /><h3 className="font-semibold">Öppettider</h3><p className="text-sm text-muted-foreground">Mån–Fre 11–22<br/>Lör–Sön 12–23</p></CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><MapPin className="h-8 w-8 text-primary" /><h3 className="font-semibold">Hitta hit</h3><p className="text-sm text-muted-foreground">[Gatuadress]<br/>[Stad]</p></CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><Phone className="h-8 w-8 text-primary" /><h3 className="font-semibold">Kontakt</h3><p className="text-sm text-muted-foreground">[Telefonnummer]<br/>[E-post]</p></CardContent></Card>
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
import { Menu, ArrowRight } from "lucide-react";

const navItems = [
  { label: "Meny", href: "#meny" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">[Restaurangnamn]</a>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a>))}
          <Button size="sm">Boka bord <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
        </nav>
        <button type="button" className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Öppna meny"><Menu className="h-5 w-5" /></button>
      </div>
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>{item.label}</a>))}
          <Button size="sm" className="w-full">Boka bord</Button>
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
        <p className="text-lg font-bold tracking-tight">[Restaurangnamn]</p>
        <p className="text-sm text-muted-foreground">[Gatuadress], [Stad] · [Telefonnummer]</p>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} [Restaurangnamn]. Alla rättigheter förbehållna.</p>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
