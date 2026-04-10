import type { ScaffoldManifest } from "../types";

export const landingPageManifest: ScaffoldManifest = {
  id: "landing-page",
  family: "landing-page",
  label: "Landing Page",
  description:
    "Polished one-page or multi-section layout for local businesses, service companies, and product launches.",
  allowedBuildIntents: ["website", "template"],
  tags: [
    "landing",
    "marketing",
    "company",
    "agency",
    "services",
    "startup",
    "business",
    "one-page",
  ],
  promptHints: [
    "Use this scaffold for local businesses, company sites, campaign pages, and service-led websites.",
    "Keep the overall rhythm: strong hero, content sections that match the actual business, and a clear CTA.",
    "Replace all scaffold copy, section types, and imagery to genuinely reflect the user's business — a bakery should feel warm, a law firm authoritative, a startup energetic.",
  ],
  qualityChecklist: [
    "Hero headline is specific to user's business — not generic marketing filler.",
    "All bracket placeholders replaced with real, relevant content.",
    "CTA button text matches what the business actually offers.",
    "Testimonial section uses realistic names/roles, not [Kundens namn].",
    "Color palette adapted from neutral grays to a vivid, brand-appropriate scheme.",
    "At least 3 distinct content sections with alternating visual rhythm.",
  ],
  research: {
    upgradeTargets: [
      "Add a stats/social-proof row with concrete numbers relevant to the user's industry.",
      "Include a sticky CTA or floating action when the user scrolls past the hero.",
      "Add smooth scroll-to-section behavior for in-page navigation links.",
      "Use next/image with proper sizing for all hero and section images.",
      "Generate metadata with title, description, and OG tags matching the user's business.",
    ],
    referenceTemplates: [
      { id: "saas-paddle-billing-subscription-starter", title: "Paddle Billing Subscription Starter", categorySlug: "saas", qualityScore: 96, strengths: ["verified Next.js codebase", "pricing and CTA patterns", "section hierarchy"] },
      { id: "cms-next-js-waitlist-with-notion-cms", title: "Next.js Waitlist with Notion CMS", categorySlug: "cms", qualityScore: 96, strengths: ["verified Next.js codebase", "content-first landing pattern", "waitlist CTA flow"] },
      { id: "cms-basehub-marketing-website", title: "BaseHub Marketing Website", categorySlug: "cms", qualityScore: 88, strengths: ["verified Next.js codebase", "marketing page structure", "content hierarchy"] },
    ],
  },
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.15 0.004 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.18 0.004 0);
  --color-primary: oklch(0.58 0.16 258);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0.004 0);
  --color-secondary-foreground: oklch(0.22 0.004 0);
  --color-muted: oklch(0.955 0 0);
  --color-muted-foreground: oklch(0.45 0.004 0);
  --color-accent: oklch(0.93 0.004 0);
  --color-accent-foreground: oklch(0.2 0.004 0);
  --color-border: oklch(0.91 0.004 0);
  --color-ring: oklch(0.58 0.16 258);
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
      radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 10%, white) 0%, transparent 28%),
      linear-gradient(to bottom, color-mix(in oklab, var(--color-accent) 20%, white) 0%, transparent 24%);
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
  title: "[Företagsnamn]",
  description: "[Meta-beskrivning anpassad till verksamheten]",
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
import { ArrowRight, BadgeCheck, Clock3, Handshake, Sparkles } from "lucide-react";

const offers = [
  {
    title: "[Erbjudande 1]",
    description: "[Beskriv det viktigaste erbjudandet eller styrkan — anpassa till verksamheten.]",
    icon: Sparkles,
  },
  {
    title: "[Erbjudande 2]",
    description: "[Beskriv en annan styrka, tjänst eller unik fördel som besökaren bryr sig om.]",
    icon: BadgeCheck,
  },
  {
    title: "[Erbjudande 3]",
    description: "[Beskriv en tredje aspekt — öppettider, läge, kvalitet, erfarenhet eller liknande.]",
    icon: Clock3,
  },
];

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-20 sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <Badge className="rounded-full px-3 py-1 text-sm">[Kort slagord]</Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                [Huvudrubrik som speglar verksamheten]
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                [Kort ingress som beskriver vad företaget erbjuder och varför besökaren ska stanna.]
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                [Primär CTA] <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                [Sekundär CTA]
              </Button>
            </div>
            <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 1]</p>
                <p>[Kort förklaring]</p>
              </div>
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 2]</p>
                <p>[Kort förklaring]</p>
              </div>
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 3]</p>
                <p>[Kort förklaring]</p>
              </div>
            </div>
          </div>

          <Card className="overflow-hidden border-primary/15 bg-card/90 shadow-xl shadow-primary/10">
            <CardHeader className="space-y-5 p-7">
              <Badge variant="secondary" className="w-fit rounded-full">[Etikett]</Badge>
              <div className="space-y-3">
                <CardTitle className="text-2xl">[Sidopanelens rubrik]</CardTitle>
                <p className="text-sm leading-7 text-muted-foreground">
                  [Kort sammanfattning av vad verksamheten erbjuder eller varför kunden ska välja just dem.]
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-7 pt-0">
              {["[Fördel 1]", "[Fördel 2]", "[Fördel 3]"].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-secondary/70 p-4">
                  <Handshake className="mt-0.5 h-5 w-5 text-primary" />
                  <p className="text-sm leading-6">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-4xl border bg-card/70 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">[Förtroendesignal]</p>
          <div className="flex flex-wrap gap-4 text-sm text-foreground/80">
            <span>[Kategori 1]</span>
            <span>[Kategori 2]</span>
            <span>[Kategori 3]</span>
            <span>[Kategori 4]</span>
          </div>
        </div>
      </section>

      <section id="erbjudande" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">[Sektionsetikett]</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">[Rubrik för erbjudandesektion]</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv kort vad verksamheten erbjuder eller vad som gör den unik.]
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {offers.map((offer) => (
              <Card key={offer.title} className="rounded-[1.6rem] border bg-card/85 shadow-sm">
                <CardHeader className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <offer.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{offer.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">{offer.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="om" className="bg-card/50 px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">[Sektionsetikett]</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">[Rubrik om verksamheten eller processen]</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv hur företaget arbetar, varför kunden kan lita på dem, eller ge bakgrund.]
            </p>
          </div>
          <div className="space-y-5">
            {["[Punkt 1 — t.ex. kvalitet, erfarenhet eller unikhet]", "[Punkt 2 — t.ex. process eller leverans]", "[Punkt 3 — t.ex. garanti eller kundlöfte]"].map((step, index) => (
              <div key={step} className="rounded-[1.6rem] border bg-background/80 p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <p className="font-medium">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="kontakt" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-4xl border bg-linear-to-br from-primary/10 via-background to-accent/40 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">[Social proof]</Badge>
              <p className="text-2xl font-semibold leading-10 tracking-tight sm:text-3xl">
                “[Kundcitat eller kort rekommendation som speglar verksamheten.]”
              </p>
              <Separator className="max-w-32" />
              <div>
                <p className="font-medium">[Kundens namn]</p>
                <p className="text-sm text-muted-foreground">[Roll eller relation]</p>
              </div>
            </div>
            <div className="rounded-[1.6rem] bg-background/85 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">[Kontakt]</p>
              <h3 className="mt-2 text-2xl font-semibold">[CTA-rubrik]</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                [Kort text som uppmanar besökaren att ta nästa steg.]
              </p>
              <Button className="mt-6 w-full rounded-full" size="lg">
                [CTA-knapptext] <ArrowRight className="ml-2 h-4 w-4" />
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
  { label: "[Sektion 1]", href: "#erbjudande" },
  { label: "[Sektion 2]", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Företagsnamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">[CTA]</Button>
        </nav>

        <button
          type="button"
          aria-label="Öppna meny"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          onClick={() => setOpen((value) => !value)}
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
            <Button className="mt-2 rounded-full">[CTA]</Button>
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
      content: `import { ArrowUpRight } from "lucide-react";

const columns = {
  "[Kolumn 1]": ["[Länk 1]", "[Länk 2]", "[Länk 3]", "[Länk 4]"],
  "[Kolumn 2]": ["[Länk 1]", "[Länk 2]", "[Länk 3]", "[Länk 4]"],
};

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/80 p-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            [Kort företagsbeskrivning i footern.]
          </p>
          <a href="mailto:hello@example.com" className="inline-flex items-center gap-2 text-sm font-medium">
            hello@example.com <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        {Object.entries(columns).map(([title, links]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {links.map((link) => (
                <a key={link} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {link}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
`,
    },
  ],
};
