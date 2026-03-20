import type { ScaffoldManifest } from "../types";

export const associationManifest: ScaffoldManifest = {
  id: "association",
  family: "content-site",
  label: "Förening & Organisation",
  description:
    "Starter for associations, sports clubs, housing cooperatives, and nonprofits with member info, events, news, and contact sections.",
  buildIntents: ["website"],
  tags: [
    "förening",
    "organisation",
    "ideell",
    "nonprofit",
    "klubb",
    "brf",
    "bostadsrättsförening",
    "idrottsklubb",
    "sportklubb",
    "scoutkår",
    "medlemmar",
    "evenemang",
    "styrelse",
  ],
  promptHints: [
    "Use this scaffold for associations, clubs, cooperatives, and nonprofits.",
    "Keep the community-first structure: hero with organization name, upcoming events, news/updates, board/committee section, and membership CTA.",
    "Adapt events, news items, and board members to the user's specific organization.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0.005 145);
  --color-foreground: oklch(0.14 0.01 145);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.17 0.01 145);
  --color-primary: oklch(0.52 0.14 152);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0.01 145);
  --color-secondary-foreground: oklch(0.2 0.01 145);
  --color-muted: oklch(0.95 0.008 145);
  --color-muted-foreground: oklch(0.45 0.008 145);
  --color-accent: oklch(0.94 0.01 145);
  --color-accent-foreground: oklch(0.2 0.01 145);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.005 25);
  --color-border: oklch(0.91 0.01 145);
  --color-input: oklch(0.93 0.008 145);
  --color-ring: oklch(0.52 0.14 152);
  --radius: 0.75rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    background-image:
      radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 10%, white) 0%, transparent 26%);
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
  title: "[Föreningsnamn] — Välkommen",
  description: "Webbplats för förening, klubb eller organisation med evenemang, nyheter och kontakt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Newspaper, Users, ArrowRight, Heart } from "lucide-react";

const events = [
  { date: "12 apr", title: "Årsmöte 2026", description: "Välkommen till årets viktigaste möte. Vi går igenom verksamhetsberättelse, budget och väljer ny styrelse." },
  { date: "26 apr", title: "Vårmarknad", description: "Loppisstånd, fika och aktiviteter för hela familjen på föreningens vårmarknad." },
  { date: "10 maj", title: "Familjedag i parken", description: "En dag med lekar, grillning och gemenskap. Alla medlemmar och grannar är välkomna." },
];
const news = [
  { date: "15 mars 2026", title: "Ny hemsida lanserad", excerpt: "Vi har fått en helt ny hemsida! Här hittar du all information om föreningen, kommande evenemang och nyheter." },
  { date: "1 mars 2026", title: "Medlemsavgift 2026", excerpt: "Påminnelse: medlemsavgiften för 2026 ska vara betald senast 31 mars. Swisha till 123-456 78 90." },
  { date: "14 feb 2026", title: "Sportlovsprogram", excerpt: "Under sportlovet v.9 arrangerar vi aktiviteter varje dag. Anmäl dig via formuläret på kontaktsidan." },
];
const board = [
  { name: "Anna Lindqvist", role: "Ordförande", initials: "AL" },
  { name: "Erik Johansson", role: "Vice ordförande", initials: "EJ" },
  { name: "Maria Svensson", role: "Kassör", initials: "MS" },
  { name: "Johan Andersson", role: "Sekreterare", initials: "JA" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 py-28 text-center">
        <Badge variant="secondary" className="text-sm">
          <Heart className="mr-1.5 h-3.5 w-3.5" /> Ideell förening
        </Badge>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          [Föreningsnamn]
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Vi är en gemenskap som [beskrivning av föreningens syfte]. Tillsammans skapar vi aktiviteter, evenemang och en trygg mötesplats för alla.
        </p>
        <div className="flex gap-4 pt-4">
          <Button size="lg">
            Bli medlem <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline">
            Kontakta oss
          </Button>
        </div>
      </section>
      {/* Kommande evenemang */}
      <section className="px-6 py-20 bg-secondary/40">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Kommande evenemang</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Card key={e.title}>
                <CardHeader className="pb-3">
                  <Badge variant="outline" className="w-fit">{e.date}</Badge>
                  <CardTitle className="text-lg">{e.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{e.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Nyheter */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Newspaper className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Nyheter</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <Card key={n.title}>
                <CardContent className="pt-6 space-y-3">
                  <p className="text-xs text-muted-foreground">{n.date}</p>
                  <h3 className="font-semibold">{n.title}</h3>
                  <p className="text-sm text-muted-foreground">{n.excerpt}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Styrelsen */}
      <section className="px-6 py-20 bg-secondary/40">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Styrelsen</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {board.map((m) => (
              <Card key={m.name} className="text-center">
                <CardContent className="pt-6 flex flex-col items-center gap-3">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg bg-primary/10 text-primary">{m.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-sm text-muted-foreground">{m.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Bli medlem CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <Heart className="mx-auto h-10 w-10 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">Bli medlem idag</h2>
          <p className="text-muted-foreground">
            Gå med i vår förening och ta del av evenemang, nyheter och gemenskap. Medlemsavgiften är [belopp] kr/år.
          </p>
          <Button size="lg">
            Anmäl dig <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
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
  { label: "Om oss", href: "#om" },
  { label: "Evenemang", href: "#evenemang" },
  { label: "Nyheter", href: "#nyheter" },
  { label: "Kontakt", href: "#kontakt" },
];
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">
          [Föreningsnamn]
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <Button size="sm">
            Bli medlem <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </nav>

        <button
          type="button"
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Öppna meny"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <Button size="sm" className="w-full">
            Bli medlem <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </nav>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `import { Separator } from "@/components/ui/separator";
import { Mail } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <p className="text-lg font-bold tracking-tight">[Föreningsnamn]</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              En ideell förening som verkar för gemenskap, aktiviteter och en bättre vardag för våra medlemmar.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Kontakt</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>[Gatuadress 1]</p>
              <p>[123 45] [Ort]</p>
              <p>info@[forening].se</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Organisationsinfo</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Org.nr: [XXXXXX-XXXX]</p>
              <p>Bankgiro: [XXX-XXXX]</p>
              <p>Swish: [123-456 78 90]</p>
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} [Föreningsnamn]. Alla rättigheter förbehållna.
          </p>
          <a
            href="mailto:info@[forening].se"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="h-3.5 w-3.5" /> info@[forening].se
          </a>
        </div>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
