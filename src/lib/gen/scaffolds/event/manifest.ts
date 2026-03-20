import type { ScaffoldManifest } from "../types";

export const eventManifest: ScaffoldManifest = {
  id: "event",
  family: "landing-page",
  label: "Event & Konferens",
  description:
    "Starter for events, conferences, festivals, and meetups with schedule, speakers, tickets/registration, and venue info.",
  buildIntents: ["website", "template"],
  tags: [
    "event",
    "evenemang",
    "konferens",
    "conference",
    "festival",
    "meetup",
    "schema",
    "talare",
    "speakers",
    "biljetter",
    "tickets",
    "seminarium",
    "workshop",
    "mässa",
  ],
  promptHints: [
    "Use this scaffold for events, conferences, festivals, meetups, and corporate gatherings.",
    "Keep the structure: hero with event name, dates, and venue; schedule section; speakers; tickets or registration; venue and practical info.",
    "Adapt talk titles, speaker bios, pricing tiers, and location details to the user's specific event.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.12 0.035 278);
  --color-foreground: oklch(0.96 0.01 95);
  --color-card: oklch(0.17 0.04 278);
  --color-card-foreground: oklch(0.96 0.01 95);
  --color-primary: oklch(0.72 0.2 252);
  --color-primary-foreground: oklch(0.12 0.04 278);
  --color-secondary: oklch(0.22 0.05 285);
  --color-secondary-foreground: oklch(0.92 0.02 95);
  --color-muted: oklch(0.24 0.03 278);
  --color-muted-foreground: oklch(0.62 0.03 95);
  --color-accent: oklch(0.58 0.22 305);
  --color-accent-foreground: oklch(0.98 0.01 95);
  --color-border: oklch(0.3 0.04 278);
  --color-ring: oklch(0.72 0.2 252);
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
      radial-gradient(ellipse at top, color-mix(in oklab, var(--color-primary) 14%, transparent) 0%, transparent 55%),
      radial-gradient(ellipse at 80% 20%, color-mix(in oklab, var(--color-accent) 10%, transparent) 0%, transparent 45%),
      linear-gradient(to bottom, var(--color-background) 0%, color-mix(in oklab, var(--color-card) 35%, var(--color-background)) 100%);
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
  title: "Event & Konferens",
  description: "Schema, talare, biljetter och praktisk information för vårt evenemang.",
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
import { ArrowRight, Calendar, Clock, MapPin, Mic2, Ticket, Users } from "lucide-react";

const scheduleItems = [
  { time: "09:30", title: "Registrering & frukost", detail: "Välkommen till [Eventnamn]" },
  { time: "10:30", title: "Keynote: Framtidens innovation", detail: "Med [Talarens namn], [Titel på företag]" },
  { time: "12:00", title: "Parallella spår & nätverk", detail: "Seminarier och workshop – välj spår" },
  { time: "14:15", title: "Panel: Hållbarhet och tech", detail: "Moderator: [Moderators namn]" },
];

const speakers = [
  { name: "[Talare 1]", role: "CTO, [Företag]", topic: "Skalbar molnarkitektur" },
  { name: "[Talare 2]", role: "Produktchef, [Företag]", topic: "AI i produktteam" },
  { name: "[Talare 3]", role: "Grundare, [Startup]", topic: "Att bygga community" },
  { name: "[Talare 4]", role: "Forskare, [Universitet]", topic: "Etik och datadrivna beslut" },
];

const tickets = [
  { name: "Standard", price: "995 kr", desc: "Full tillgång till programmet, lunch och mingel." },
  { name: "VIP", price: "2 495 kr", desc: "Förtur till platser, exklusiv middag och backstage-möten med talare." },
];

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl space-y-6">
          <Badge className="rounded-full px-3 py-1 text-sm">Evenemang 2026</Badge>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">[Eventnamn]</h1>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-muted-foreground">
            <span className="inline-flex items-center gap-2 text-sm sm:text-base">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              15–16 maj 2026
            </span>
            <span className="inline-flex items-center gap-2 text-sm sm:text-base">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              Stockholmsmässan
            </span>
          </div>
          <p className="mx-auto max-w-xl text-lg leading-8 text-muted-foreground">
            Två dagar med inspiration, experter och nätverkande. Säkra din plats innan biljetterna tar slut.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="rounded-full px-7">
              Köp biljett <Ticket className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-7">
              Se schemat <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section id="schema" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Schema</h2>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Programmet kan komma att justeras. Alla tider anges i svensk tid (CET).
          </p>
          <div className="space-y-3">
            {scheduleItems.map((item) => (
              <Card key={item.time} className="border-border/60 bg-card/80">
                <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 pb-2 sm:items-center">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="rounded-full font-mono font-medium tabular-nums">
                      {item.time}
                    </Badge>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="talare" className="bg-card/40 px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Talare</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {speakers.map((s) => (
              <Card key={s.name} className="border-border/60 bg-card/80">
                <CardHeader className="flex flex-row items-start gap-3 pb-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Mic2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{s.role}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-foreground/90">{s.topic}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="biljetter" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Biljetter</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {tickets.map((t) => (
              <Card key={t.name} className="border-border/60 bg-card/80">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <CardTitle className="text-xl">{t.name}</CardTitle>
                  <Badge className="rounded-full text-base font-semibold">{t.price}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-7 text-muted-foreground">{t.desc}</p>
                  <Button className="w-full rounded-full" size="lg">
                    Välj {t.name} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="plats" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-3xl font-semibold tracking-tight">Plats</h2>
              </div>
              <p className="text-lg font-medium">Stockholmsmässan</p>
              <p className="text-muted-foreground">
                Mässvägen 1, 125 30 Älvsjö. Nära pendeltåg och buss – följ skyltning på plats.
              </p>
              <Button variant="outline" className="mt-2 rounded-full">
                Öppna i kartan <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="flex aspect-4/3 items-center justify-center rounded-2xl border bg-card/50">
              <p className="text-sm text-muted-foreground">Kartvy / vägbeskrivning</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border bg-linear-to-br from-primary/10 via-background to-accent/10 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Varför delta?</Badge>
              <p className="text-2xl font-semibold leading-10 tracking-tight sm:text-3xl">
                "Bästa konferensen jag varit på – relevant innehåll och grymt nätverk."
              </p>
              <Separator className="max-w-32" />
              <div>
                <p className="font-medium">[Deltagarens namn]</p>
                <p className="text-sm text-muted-foreground">Deltog [år]</p>
              </div>
            </div>
            <div className="rounded-2xl bg-card/80 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Registrering</p>
              <h3 className="mt-2 text-2xl font-semibold">Bli en av oss</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Begränsat antal platser. Boka idag och få bekräftelse via e-post.
              </p>
              <Button className="mt-6 w-full rounded-full" size="lg">
                Registrera dig <ArrowRight className="ml-2 h-4 w-4" />
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
  { label: "Schema", href: "#schema" },
  { label: "Talare", href: "#talare" },
  { label: "Biljetter", href: "#biljetter" },
  { label: "Plats", href: "#plats" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Eventnamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">Köp biljett</Button>
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
            <Button className="mt-2 rounded-full">Köp biljett</Button>
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
      content: `import { ArrowUpRight, Calendar, MapPin, Ticket } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl border bg-card/80 p-8 lg:grid-cols-3">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Eventnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Konferens och mötesplats med fokus på kunskap, inspiration och möten som räknas.
          </p>
          <a href="mailto:info@example.com" className="inline-flex items-center gap-2 text-sm font-medium">
            info@example.com <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Praktiskt</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> 15–16 maj 2026</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Stockholmsmässan, Älvsjö</div>
            <div className="flex items-center gap-2"><Ticket className="h-4 w-4" /> Standard från 995 kr</div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Följ oss</p>
          <div className="space-y-2">
            {["LinkedIn", "Instagram", "YouTube"].map((link) => (
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
