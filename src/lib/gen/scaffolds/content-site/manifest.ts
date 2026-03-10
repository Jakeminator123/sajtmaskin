import type { ScaffoldManifest } from "../types";

export const contentSiteManifest: ScaffoldManifest = {
  id: "content-site",
  family: "content-site",
  label: "Content Site",
  description:
    "Content-first website with hero, features, testimonials, and footer. Great for landing pages, portfolios, and blogs.",
  buildIntents: ["website", "template"],
  tags: [
    "landing",
    "portfolio",
    "blog",
    "marketing",
    "content",
    "company",
    "agency",
    "saas",
    "software",
    "platform",
    "pricing",
    "service",
  ],
  promptHints: [
    "This scaffold has a hero, features grid, testimonials, and footer.",
    "Modify the content and sections to match the user's business.",
    "Add or remove sections as needed. Keep the navigation and footer structure.",
    "Use Unsplash images where appropriate.",
    "For SaaS/software sites: include pricing tiers, feature comparison, trust signals, and clear CTAs.",
    "For company/brand sites: include hero, about, team, services, and contact sections.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

:root {
  --background: oklch(0.13 0.01 260);
  --foreground: oklch(0.95 0.01 260);
  --card: oklch(0.17 0.01 260);
  --card-foreground: oklch(0.95 0.01 260);
  --primary: oklch(0.65 0.2 260);
  --primary-foreground: oklch(0.98 0.005 260);
  --secondary: oklch(0.2 0.015 260);
  --secondary-foreground: oklch(0.9 0.01 260);
  --muted: oklch(0.2 0.01 260);
  --muted-foreground: oklch(0.6 0.02 260);
  --accent: oklch(0.23 0.015 260);
  --accent-foreground: oklch(0.9 0.01 260);
  --destructive: oklch(0.55 0.2 25);
  --destructive-foreground: oklch(0.98 0.005 25);
  --border: oklch(0.25 0.015 260);
  --input: oklch(0.22 0.015 260);
  --ring: oklch(0.65 0.2 260);
  --radius: 0.625rem;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
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
  title: "Norrsken Digital — Webbyrå i Stockholm",
  description: "Vi bygger moderna webbplatser och digitala upplevelser för framåtlutade företag.",
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle, Star } from "lucide-react";
import Image from "next/image";

const features = [
  {
    title: "Responsiv design",
    description: "Varje webbplats vi bygger fungerar perfekt på mobil, surfplatta och desktop.",
    icon: CheckCircle,
  },
  {
    title: "Snabb laddning",
    description: "Optimerade sidor som laddar blixtsnabbt med Next.js och edge-rendering.",
    icon: CheckCircle,
  },
  {
    title: "SEO-optimerat",
    description: "Inbyggd sökmotoroptimering så att dina kunder hittar dig på Google.",
    icon: CheckCircle,
  },
];

const testimonials = [
  {
    name: "Emma Lindqvist",
    role: "VD, Bloom Studio",
    quote: "Norrsken Digital levererade en webbplats som överträffade våra förväntningar. Proffsigt och snabbt.",
    rating: 5,
  },
  {
    name: "Johan Bergström",
    role: "Grundare, TechNova",
    quote: "Fantastisk process från start till mål. Vår nya sajt har ökat konverteringen med 40%.",
    rating: 5,
  },
  {
    name: "Sara Henriksson",
    role: "Marknadschef, GreenLoop",
    quote: "Äntligen en byrå som förstår både design och teknik. Starkt rekommenderad.",
    rating: 5,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&q=80"
            alt="Team samarbetar vid dator"
            fill
            className="object-cover opacity-15"
            priority
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          Webbyrå i Stockholm
        </Badge>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Vi bygger webbplatser som driver resultat
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Modern design, snabb teknik och strategiskt tänkande — allt för att hjälpa ditt företag växa online.
        </p>
        <div className="flex gap-4 pt-4">
          <Button size="lg">
            Boka ett möte <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline">
            Se våra projekt
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Varför välja oss?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Vi kombinerar strategi, design och teknik för att leverera webbplatser som gör skillnad.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card border-border">
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Vad våra kunder säger</h2>
            <p className="text-muted-foreground">Företag vi har hjälpt att lyckas online.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="bg-card border-border">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-card-foreground italic">"{t.quote}"</p>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">
            Redo att ta ditt företag till nästa nivå?
          </h2>
          <p className="text-muted-foreground">
            Kontakta oss idag för en kostnadsfri konsultation. Vi hjälper dig att hitta rätt lösning.
          </p>
          <Button size="lg">
            Kom igång <ArrowRight className="ml-2 h-4 w-4" />
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
  { label: "Tjänster", href: "#tjanster" },
  { label: "Projekt", href: "#projekt" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">
          Norrsken Digital
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
            Boka möte <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
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
            Boka möte <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
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
import { Github, Linkedin, Mail } from "lucide-react";

const footerLinks = {
  Tjänster: [
    { label: "Webbdesign", href: "#" },
    { label: "E-handel", href: "#" },
    { label: "SEO", href: "#" },
    { label: "Hosting", href: "#" },
  ],
  Företaget: [
    { label: "Om oss", href: "#" },
    { label: "Karriär", href: "#" },
    { label: "Blogg", href: "#" },
    { label: "Kontakt", href: "#" },
  ],
  Resurser: [
    { label: "Dokumentation", href: "#" },
    { label: "Guider", href: "#" },
    { label: "Support", href: "#" },
    { label: "Integritet", href: "#" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <p className="text-lg font-bold tracking-tight">Norrsken Digital</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Vi hjälper företag att växa online med moderna webbplatser och digitala strategier.
            </p>
            <div className="flex gap-3">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="E-post">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading} className="space-y-3">
              <p className="text-sm font-semibold">{heading}</p>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Norrsken Digital. Alla rättigheter förbehållna.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Integritetspolicy
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Villkor
            </a>
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
