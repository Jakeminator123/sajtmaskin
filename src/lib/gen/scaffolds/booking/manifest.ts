import type { ScaffoldManifest } from "../types";

export const bookingManifest: ScaffoldManifest = {
  id: "booking",
  family: "landing-page",
  label: "Bokning & Tidsbokning",
  description:
    "Booking-focused starter for appointment-based businesses like salons, therapists, consultants, and clinics with service list, time slot display, and booking flow.",
  buildIntents: ["website", "app"],
  tags: [
    "bokning",
    "booking",
    "tidsbokning",
    "appointment",
    "boka",
    "tid",
    "frisör",
    "terapeut",
    "konsult",
    "klinik",
    "salon",
    "massage",
    "behandling",
  ],
  promptHints: [
    "Use this scaffold for businesses that take appointments: salons, therapists, consultants, clinics.",
    "Keep the booking-first structure: hero with 'Boka tid' CTA, service cards with duration/price, available times display, and contact section.",
    "Adapt services, prices, and time slots to the user's specific business.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.985 0.002 200);
  --color-foreground: oklch(0.15 0.004 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.18 0.004 0);
  --color-primary: oklch(0.55 0.12 185);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: oklch(0.96 0.006 185);
  --color-secondary-foreground: oklch(0.2 0.004 0);
  --color-muted: oklch(0.955 0.004 200);
  --color-muted-foreground: oklch(0.45 0.004 0);
  --color-accent: oklch(0.93 0.008 185);
  --color-accent-foreground: oklch(0.2 0.004 0);
  --color-border: oklch(0.91 0.006 200);
  --color-ring: oklch(0.55 0.12 185);
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
      radial-gradient(circle at top left, color-mix(in oklab, var(--color-primary) 8%, white) 0%, transparent 28%),
      linear-gradient(to bottom, color-mix(in oklab, var(--color-accent) 18%, white) 0%, transparent 24%);
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
  title: "Bokning & Tidsbokning",
  description: "Boka tid enkelt online. Tjänster, lediga tider och kontaktuppgifter.",
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
import { ArrowRight, Calendar, Clock, MapPin, Phone, Scissors } from "lucide-react";

const services = [
  { title: "Klippning", description: "Rådgivning, tvätt, klippning och styling.", duration: "45 min", price: "från 450 kr", icon: Scissors },
  { title: "Färgning", description: "Helhetsfärgning eller slingor anpassade efter ditt hår.", duration: "90 min", price: "från 950 kr", icon: Scissors },
  { title: "Konsultation", description: "Personlig rådgivning för stil och behandlingsplan.", duration: "30 min", price: "kostnadsfri", icon: Clock },
  { title: "Behandling", description: "Djupvårdande behandling som stärker och återställer.", duration: "60 min", price: "från 650 kr", icon: Clock },
];

const weekDays = ["Mån", "Tis", "Ons", "Tor", "Fre"];
const timeSlots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
const bookedSlots = new Set(["Mån-10:00", "Mån-14:00", "Tis-09:00", "Ons-11:00", "Ons-13:00", "Tor-10:00", "Fre-09:00", "Fre-15:00"]);

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-20 sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-6xl space-y-8 text-center">
          <Badge className="rounded-full px-3 py-1 text-sm">Välkommen</Badge>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
            Boka din tid — enkelt och snabbt
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Välj tjänst, se lediga tider och boka direkt. Vi ser till att du får den tid som passar dig bäst.
          </p>
          <div className="flex justify-center gap-3">
            <Button size="lg" className="rounded-full px-7">
              Boka tid <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-7">
              Våra tjänster
            </Button>
          </div>
        </div>
      </section>

      <section id="tjanster" className="px-6 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Tjänster</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Våra tjänster och priser</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Vi erbjuder ett brett utbud av tjänster. Välj den som passar dig och boka direkt.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <Card key={s.title} className="rounded-[1.6rem] border bg-card/85 shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-7 text-muted-foreground">{s.description}</p>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {s.duration}
                    </span>
                    <span className="font-medium">{s.price}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="boka" className="bg-card/50 px-6 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Lediga tider</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Välj en tid som passar dig</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Nedan ser du veckans tillgängliga tider. Gröna tider går att boka direkt.
            </p>
          </div>
          <div className="overflow-x-auto rounded-[1.6rem] border bg-background/80 p-5">
            <div className="grid min-w-[480px] grid-cols-6 gap-2">
              <div />
              {weekDays.map((d) => (
                <p key={d} className="text-center text-sm font-medium">{d}</p>
              ))}
              {timeSlots.map((t) => (
                <div key={t} className="contents">
                  <p className="flex items-center text-sm text-muted-foreground">{t}</p>
                  {weekDays.map((d) => {
                    const booked = bookedSlots.has(d + "-" + t);
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={booked}
                        className={
                          booked
                            ? "rounded-xl bg-muted py-2 text-xs font-medium text-muted-foreground/50 line-through"
                            : "rounded-xl bg-primary/10 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                        }
                      >
                        {booked ? "Bokad" : "Ledig"}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="om" className="px-6 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-4">
            <Badge variant="secondary" className="rounded-full">Om oss</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Professionell service sedan [år]</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Vi brinner för vårt hantverk och sätter alltid kundens upplevelse i centrum.
              Med [X] års erfarenhet erbjuder vi behandlingar av högsta kvalitet i en avslappnad miljö.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { value: "[X]+", label: "Års erfarenhet" },
              { value: "500+", label: "Nöjda kunder" },
              { value: "4.9", label: "Snittbetyg" },
              { value: "15 min", label: "Max väntetid" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border bg-card/70 p-5 text-center">
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="kontakt" className="px-6 py-16 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-4xl border bg-linear-to-br from-primary/10 via-background to-accent/40 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Kontakt</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Hör av dig eller boka direkt</h2>
              <p className="text-lg leading-8 text-muted-foreground">
                Har du frågor eller vill du boka en tid? Kontakta oss så hjälper vi dig.
              </p>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-primary" /> <span>[070-123 45 67]</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-primary" /> <span>[info@example.com]</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-primary" /> <span>[Storgatan 12, 111 22 Stockholm]</span>
                </div>
              </div>
            </div>
            <div className="rounded-[1.6rem] bg-background/85 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Öppettider</p>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  ["Måndag\u2013Fredag", "09:00\u201318:00"],
                  ["Lördag", "10:00\u201315:00"],
                  ["Söndag", "Stängt"],
                ].map(([day, hours]) => (
                  <div key={day} className="flex justify-between">
                    <span>{day}</span>
                    <span className="font-medium">{hours}</span>
                  </div>
                ))}
              </div>
              <Button className="mt-6 w-full rounded-full" size="lg">
                Boka tid nu <ArrowRight className="ml-2 h-4 w-4" />
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
  { label: "Tjänster", href: "#tjanster" },
  { label: "Boka tid", href: "#boka" },
  { label: "Om oss", href: "#om" },
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
          <Button size="sm" className="rounded-full">Boka tid</Button>
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
            <Button className="mt-2 rounded-full">Boka tid</Button>
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
      content: `import { MapPin, Phone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="px-6 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-4xl border bg-card/75 p-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-lg font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Professionella tjänster med fokus på kvalitet och personlig service.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" /> [070-123 45 67]
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> [Storgatan 12, Stockholm]
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
