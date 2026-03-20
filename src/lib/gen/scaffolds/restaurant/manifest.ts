import type { ScaffoldManifest } from "../types";

export const restaurantManifest: ScaffoldManifest = {
  id: "restaurant",
  family: "landing-page",
  label: "Restaurang & Tjänster",
  description:
    "Starter for restaurants, cafés, salons, gyms, and local service businesses with menu/service list, opening hours, location, and booking CTA.",
  buildIntents: ["website", "template"],
  tags: [
    "restaurang", "restaurant", "café", "frisör", "salong", "gym",
    "klinik", "meny", "menu", "öppettider", "bokning", "lokal",
    "local", "service", "food", "dining",
  ],
  promptHints: [
    "Use this scaffold for local service businesses: restaurants, cafés, salons, gyms, clinics.",
    "Keep the structure: hero with business name, menu/services section, opening hours, location/map placeholder, and booking/contact CTA.",
    "Adapt the menu items, services, hours, and contact info to the user's specific business.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.14 0.01 55);
  --color-foreground: oklch(0.93 0.008 80);
  --color-card: oklch(0.19 0.012 55);
  --color-card-foreground: oklch(0.93 0.008 80);
  --color-primary: oklch(0.75 0.14 60);
  --color-primary-foreground: oklch(0.14 0.01 55);
  --color-secondary: oklch(0.22 0.012 55);
  --color-secondary-foreground: oklch(0.88 0.008 80);
  --color-muted: oklch(0.25 0.01 55);
  --color-muted-foreground: oklch(0.6 0.01 80);
  --color-accent: oklch(0.22 0.015 55);
  --color-accent-foreground: oklch(0.88 0.008 80);
  --color-border: oklch(0.26 0.012 55);
  --color-ring: oklch(0.75 0.14 60);
  --radius: 0.85rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    background-image:
      radial-gradient(ellipse at top, color-mix(in oklab, var(--color-primary) 8%, transparent) 0%, transparent 50%),
      linear-gradient(to bottom, var(--color-background) 0%, color-mix(in oklab, var(--color-card) 40%, var(--color-background)) 100%);
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
  title: "Restaurang & Tjänster",
  description: "Välkommen till vår restaurang. Boka bord, se vår meny och hitta hit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={inter.variable}>
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
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Clock, MapPin, Phone, UtensilsCrossed } from "lucide-react";

const menuItems = [
  { name: "Toast Skagen", desc: "Räkor, majonnäs, löjrom och dill på rostat bröd.", price: "145 kr" },
  { name: "Köttbullar", desc: "Hemlagade med potatismos, gräddsås och lingon.", price: "165 kr" },
  { name: "Laxfilé", desc: "Ugnsrostad lax med dillsås, citron och kokt potatis.", price: "195 kr" },
  { name: "Wallenbergare", desc: "Klassisk kalvfärsbiff med ärtor, pressgurka och lingon.", price: "185 kr" },
  { name: "Svampsoppa", desc: "Krämig soppa med tryffelolja och knaperbröd.", price: "125 kr" },
  { name: "Pannkakor", desc: "Tunna pannkakor med sylt och grädde.", price: "95 kr" },
];

const hours = [
  { day: "Måndag–Fredag", time: "11:00 – 22:00" },
  { day: "Lördag", time: "12:00 – 23:00" },
  { day: "Söndag", time: "12:00 – 20:00" },
];

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl space-y-6">
          <Badge className="rounded-full px-3 py-1 text-sm">Välkommen</Badge>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">[Restaurangnamn]</h1>
          <p className="mx-auto max-w-xl text-lg leading-8 text-muted-foreground">
            Genuin mat lagad med kärlek och lokala råvaror i hjärtat av [Stad]. Boka ditt bord redan idag.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="rounded-full px-7">
              Boka bord <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-7">
              Se menyn
            </Button>
          </div>
        </div>
      </section>

      <section id="meny" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Vår meny</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {menuItems.map((item) => (
              <Card key={item.name} className="border-border/60 bg-card/80">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <Badge variant="secondary" className="rounded-full font-medium">{item.price}</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="oppettider" className="bg-card/40 px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="text-3xl font-semibold tracking-tight">Öppettider</h2>
              </div>
              <p className="text-muted-foreground">Vi välkomnar dig varje dag. Köket stänger 45 minuter före stängning.</p>
            </div>
            <div className="rounded-2xl border bg-card/70 p-6">
              {hours.map((row, i) => (
                <div key={row.day}>
                  <div className="flex items-center justify-between py-3">
                    <span className="font-medium">{row.day}</span>
                    <span className="text-muted-foreground">{row.time}</span>
                  </div>
                  {i < hours.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="hitta-hit" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-3xl font-semibold tracking-tight">Hitta hit</h2>
              </div>
              <p className="text-lg text-muted-foreground">[Gatuadress 12], [123 45] [Stad]</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>[08-123 45 67]</span>
              </div>
              <Button variant="outline" className="mt-2 rounded-full">
                Öppna i kartan <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="flex aspect-4/3 items-center justify-center rounded-2xl border bg-card/50">
              <p className="text-sm text-muted-foreground">Kartvy / Google Maps-embed</p>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border bg-linear-to-br from-primary/10 via-background to-card/60 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Vad våra gäster säger</Badge>
              <p className="text-2xl font-semibold leading-10 tracking-tight sm:text-3xl">
                "Bästa köttbullarna i stan – och stämningen är alltid perfekt."
              </p>
              <Separator className="max-w-32" />
              <div>
                <p className="font-medium">[Gästens namn]</p>
                <p className="text-sm text-muted-foreground">Stammis sedan [år]</p>
              </div>
            </div>
            <div className="rounded-2xl bg-card/80 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Reservera</p>
              <h3 className="mt-2 text-2xl font-semibold">Boka ditt bord</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Ring oss eller boka direkt online. Vi ser fram emot ditt besök.
              </p>
              <Button className="mt-6 w-full rounded-full" size="lg">
                Boka bord <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
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

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "Meny", href: "#meny" },
  { label: "Öppettider", href: "#oppettider" },
  { label: "Hitta hit", href: "#hitta-hit" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Restaurangnamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">Boka bord</Button>
        </nav>

        <button
          type="button"
          aria-label="Öppna meny"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="border-t bg-background px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <Button className="mt-2 rounded-full">Boka bord</Button>
          </div>
        </div>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `import { ArrowUpRight, Clock, MapPin, Phone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl border bg-card/80 p-8 lg:grid-cols-3">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Restaurangnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Genuin matupplevelse med lokala råvaror och en varm atmosfär.
          </p>
          <a href="mailto:info@example.com" className="inline-flex items-center gap-2 text-sm font-medium">
            info@example.com <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Kontakt</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> [08-123 45 67]</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> [Gatuadress 12], [Stad]</div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> Mån–Fre 11–22, Lör 12–23</div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Följ oss</p>
          <div className="space-y-2">
            {["Instagram", "Facebook", "TripAdvisor"].map((link) => (
              <a key={link} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
