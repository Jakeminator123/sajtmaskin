import type { ScaffoldManifest } from "../types";

export const tradesmanManifest: ScaffoldManifest = {
  id: "tradesman",
  family: "tradesman",
  label: "Hantverkare",
  description:
    "Tradesman website with service areas, quote request form, references, and trust signals. For builders, plumbers, electricians, painters, roofers, and similar.",
  buildIntents: ["website"],
  tags: [
    "hantverkare",
    "bygg",
    "byggare",
    "snickare",
    "målare",
    "elektriker",
    "rörmokare",
    "VVS",
    "takläggare",
    "plumber",
    "electrician",
    "painter",
    "renovering",
    "markarbete",
    "golvläggare",
    "kakel",
    "badrum",
    "kök",
  ],
  promptHints: [
    "This scaffold targets tradespeople. Trust and credibility are key — show certifications, insurance, and references.",
    "Primary CTA is requesting a free quote/estimate.",
    "Include a clear list of services/areas of work.",
    "Photo gallery of completed projects builds trust.",
    "Service area (geographic coverage) should be mentioned.",
    "Use professional, trustworthy imagery from Unsplash (construction, tools, finished work).",
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
  --color-primary: oklch(0.6 0.16 145);
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
  --color-ring: oklch(0.6 0.16 145);
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
  title: "[Företagsnamn] — [Bransch] i [Stad]",
  description: "[Företagsnamn] erbjuder professionella hantverkstjänster i [Stad] med omnejd.",
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
import { ArrowRight, Shield, Star, Wrench, Phone } from "lucide-react";
import Image from "next/image";

const services = [
  { title: "[Tjänst 1]", desc: "Kort beskrivning av vad tjänsten innebär." },
  { title: "[Tjänst 2]", desc: "Kort beskrivning av vad tjänsten innebär." },
  { title: "[Tjänst 3]", desc: "Kort beskrivning av vad tjänsten innebär." },
  { title: "[Tjänst 4]", desc: "Kort beskrivning av vad tjänsten innebär." },
];

const trustPoints = [
  { icon: Shield, label: "Försäkrad & certifierad" },
  { icon: Star, label: "4.9 av 5 i kundbetyg" },
  { icon: Wrench, label: "20+ års erfarenhet" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1920&q=80" alt="Hantverkare i arbete" fill className="object-cover opacity-15" priority />
        </div>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">Professionellt hantverk i [Stad]</h1>
        <p className="max-w-xl text-lg text-muted-foreground">Kvalitetsarbete med garanti. Kostnadsfri offert inom 24h.</p>
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          {trustPoints.map((tp) => (<div key={tp.label} className="flex items-center gap-2 text-sm text-muted-foreground"><tp.icon className="h-4 w-4 text-primary" />{tp.label}</div>))}
        </div>
        <div className="flex gap-4 pt-4">
          <Button size="lg">Begär offert <ArrowRight className="ml-2 h-4 w-4" /></Button>
          <Button size="lg" variant="outline"><Phone className="mr-2 h-4 w-4" /> Ring oss</Button>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl space-y-10">
          <h2 className="text-3xl font-bold tracking-tight text-center">Våra tjänster</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <Card key={s.title} className="bg-card border-border">
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 text-center bg-secondary/30">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Behöver du hjälp med ett projekt?</h2>
          <p className="text-muted-foreground">Ring oss eller fyll i formuläret så återkommer vi med en kostnadsfri offert.</p>
          <Button size="lg">Begär offert <ArrowRight className="ml-2 h-4 w-4" /></Button>
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
import { Menu, Phone } from "lucide-react";

const navItems = [
  { label: "Tjänster", href: "#tjanster" },
  { label: "Projekt", href: "#projekt" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">[Företagsnamn]</a>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a>))}
          <Button size="sm"><Phone className="mr-1.5 h-3.5 w-3.5" /> Ring oss</Button>
        </nav>
        <button type="button" className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-label="Meny"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>{item.label}</a>))}
          <Button size="sm" className="w-full"><Phone className="mr-1.5 h-3.5 w-3.5" /> Ring oss</Button>
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
        <p className="text-lg font-bold tracking-tight">[Företagsnamn]</p>
        <p className="text-sm text-muted-foreground">Verksam i [Stad] med omnejd · [Telefonnummer]</p>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} [Företagsnamn]</p>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
