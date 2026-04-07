import type { ScaffoldManifest } from "../types";

export const salonManifest: ScaffoldManifest = {
  id: "salon",
  family: "salon",
  label: "Salong & Skönhet",
  description:
    "Beauty salon website with services, pricing, gallery, and booking CTA. For hair salons, barbershops, spas, nail studios, and beauty clinics.",
  buildIntents: ["website"],
  tags: [
    "frisör",
    "salong",
    "salon",
    "hår",
    "hair",
    "barber",
    "barbershop",
    "spa",
    "naglar",
    "nails",
    "beauty",
    "skönhet",
    "hudvård",
    "makeup",
    "klinik",
    "bokning",
  ],
  promptHints: [
    "This scaffold is for beauty/salon businesses. Services with prices should be prominent.",
    "Use elegant, clean imagery from Unsplash (salon interiors, beauty, hairstyling).",
    "A booking CTA is the primary conversion action — make it very visible.",
    "Include a gallery/portfolio section showcasing work.",
    "Opening hours and location should be easy to find.",
    "Consider a team section showing stylists/therapists.",
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
  --color-primary: oklch(0.7 0.12 340);
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
  --color-ring: oklch(0.7 0.12 340);
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
  title: "[Salongnamn] — Behandlingar & Bokning",
  description: "Boka din tid hos [Salongnamn]. Se våra behandlingar och priser.",
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
import { ArrowRight, Scissors, Clock, MapPin } from "lucide-react";
import Image from "next/image";

const services = [
  { name: "Klippning", price: "från 450 kr", desc: "Dam- och herrklippning." },
  { name: "Färgning", price: "från 900 kr", desc: "Helfärg, slingor och balayage." },
  { name: "Styling", price: "från 350 kr", desc: "Uppsättning och styling för alla tillfällen." },
  { name: "Behandling", price: "från 300 kr", desc: "Keratinbehandling och hårinpackning." },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image src="https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1920&q=80" alt="Salong" fill className="object-cover opacity-20" priority />
        </div>
        <Scissors className="h-10 w-10 text-primary" />
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">[Salongnamn]</h1>
        <p className="max-w-xl text-lg text-muted-foreground">Professionell hårvård i en avslappnad miljö.</p>
        <Button size="lg">Boka tid <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl space-y-10">
          <h2 className="text-3xl font-bold tracking-tight text-center">Behandlingar & Priser</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <Card key={s.name} className="bg-card border-border">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{s.name}</h3>
                    <span className="text-sm font-medium text-primary">{s.price}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-4xl grid gap-8 sm:grid-cols-2">
          <Card className="bg-card border-border"><CardContent className="pt-6 flex flex-col items-center gap-3 text-center"><Clock className="h-8 w-8 text-primary" /><h3 className="font-semibold">Öppettider</h3><p className="text-sm text-muted-foreground">Mån–Fre 09–18<br/>Lör 10–16</p></CardContent></Card>
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
  { label: "Behandlingar", href: "#behandlingar" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">[Salongnamn]</a>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a>))}
          <Button size="sm">Boka tid</Button>
        </nav>
        <button type="button" className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-label="Meny"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>{item.label}</a>))}
          <Button size="sm" className="w-full">Boka tid</Button>
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
        <p className="text-lg font-bold tracking-tight">[Salongnamn]</p>
        <p className="text-sm text-muted-foreground">[Gatuadress], [Stad] · [Telefonnummer]</p>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} [Salongnamn]</p>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
