import type { ScaffoldManifest } from "../types";

export const clinicManifest: ScaffoldManifest = {
  id: "clinic",
  family: "landing-page",
  label: "Klinik & Mottagning",
  description:
    "Starter for healthcare clinics, medical practices, and therapy centers with treatment list, team section, patient info, and appointment CTA.",
  buildIntents: ["website", "template"],
  tags: [
    "klinik",
    "mottagning",
    "läkare",
    "tandläkare",
    "tandvård",
    "vårdcentral",
    "sjukvård",
    "terapeut",
    "behandling",
    "patient",
    "hälsa",
    "clinic",
    "healthcare",
    "medical",
  ],
  promptHints: [
    "Use this scaffold for healthcare businesses: medical clinics, practices, dental care, therapy centers, and primary care.",
    "Keep the structure: hero with clinic name, treatments/services section, team section, patient information, opening hours, and appointment/contact CTA.",
    "Adapt treatments, staff names, hours, and contact details to the user's specific clinic or practice.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.15 0.018 200);
  --color-foreground: oklch(0.94 0.012 195);
  --color-card: oklch(0.20 0.022 198);
  --color-card-foreground: oklch(0.94 0.012 195);
  --color-primary: oklch(0.58 0.10 195);
  --color-primary-foreground: oklch(0.98 0.008 195);
  --color-secondary: oklch(0.24 0.02 198);
  --color-secondary-foreground: oklch(0.90 0.01 195);
  --color-muted: oklch(0.26 0.018 200);
  --color-muted-foreground: oklch(0.62 0.02 195);
  --color-accent: oklch(0.23 0.025 198);
  --color-accent-foreground: oklch(0.90 0.012 195);
  --color-border: oklch(0.28 0.02 200);
  --color-ring: oklch(0.58 0.10 195);
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
      radial-gradient(ellipse at top, color-mix(in oklab, var(--color-primary) 10%, transparent) 0%, transparent 52%),
      linear-gradient(to bottom, var(--color-background) 0%, color-mix(in oklab, var(--color-card) 38%, var(--color-background)) 100%);
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
  title: "Klinik & Mottagning",
  description: "Välkommen till vår klinik. Boka tid, se våra behandlingar och träffa vårt team.",
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
import { ArrowRight, Clock, Heart, MapPin, Phone, Stethoscope } from "lucide-react";

const treatments = [
  {
    name: "Allmänläkare",
    desc: "Hälsokontroller, akuta besvär och uppföljning av kroniska tillstånd.",
    tag: "Mottagning",
  },
  {
    name: "Hudvård",
    desc: "Konsultation och behandling av hudförändringar och estetiska åtgärder.",
    tag: "Specialist",
  },
  {
    name: "Blodprov",
    desc: "Provtagning på plats med snabb återkoppling och tydliga svar.",
    tag: "Diagnostik",
  },
  {
    name: "Vaccination",
    desc: "Grundskydd, resevaccin och säsongsrelaterade vaccinationer.",
    tag: "Förebyggande",
  },
];

const team = [
  { name: "[Dr. Förnamn Efternamn]", role: "Leg. läkare, allmänmedicin" },
  { name: "[Dr. Förnamn Efternamn]", role: "Specialist i hud- och könssjukdomar" },
  { name: "[Dr. Förnamn Efternamn]", role: "Sjuksköterska, provtagning" },
];

const hours = [
  { day: "Måndag–Fredag", time: "08:00 – 17:00" },
  { day: "Lördag", time: "10:00 – 14:00" },
  { day: "Söndag", time: "Stängt" },
];

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-24 text-center sm:px-8 sm:py-32">
        <div className="mx-auto max-w-3xl space-y-6">
          <Badge className="rounded-full px-3 py-1 text-sm">Din hälsa i fokus</Badge>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">[Kliniknamn]</h1>
          <p className="mx-auto max-w-xl text-lg leading-8 text-muted-foreground">
            Modern vård med personlig service i [Stad]. Vi tar hand om dig från första kontakt till uppföljning.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="rounded-full px-7">
              Boka tid <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-7">
              Våra behandlingar
            </Button>
          </div>
        </div>
      </section>

      <section id="behandlingar" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Behandlingar & tjänster</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {treatments.map((item) => (
              <Card key={item.name} className="border-border/60 bg-card/80">
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <Badge variant="secondary" className="rounded-full font-medium">
                    {item.tag}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="team" className="bg-card/40 px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Vårt team</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {team.map((member) => (
              <Card key={member.name} className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">{member.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="patient" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-3xl border bg-linear-to-br from-primary/10 via-background to-card/60 p-8 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
              <div className="space-y-4">
                <Badge className="rounded-full px-3 py-1">För dig som patient</Badge>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Inför ditt besök</h2>
                <p className="text-muted-foreground">
                  Ta med legitimation och eventuell remiss. Vid förkylningssymtom, kontakta oss innan du kommer till mottagningen.
                </p>
                <Separator className="max-w-48" />
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Avboka senast 24 timmar före bokad tid.</li>
                  <li>• Receptförnyelse sker via 1177 eller vid planerat besök.</li>
                  <li>• Akut? Ring 112 eller närmaste jourcentral.</li>
                </ul>
              </div>
              <Card className="border-border/60 bg-card/90">
                <CardHeader>
                  <CardTitle className="text-lg">Avgifter & försäkring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>Vi följer patientavgifter enligt Region [Namn]. Frikort och högkostnadsskydd gäller i vanlig ordning.</p>
                  <p>Har du frågor om kostnad, ring vår reception så hjälper vi dig.</p>
                </CardContent>
              </Card>
            </div>
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
              <p className="text-muted-foreground">
                Receptionen har öppet under ordinarie tider. Avvikelser vid helgdagar meddelas på webbplatsen.
              </p>
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

      <section id="kontakt" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-3xl font-semibold tracking-tight">Kontakt & hitta hit</h2>
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

      <section className="px-6 pb-8 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border bg-linear-to-br from-primary/10 via-background to-card/60 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Trygg vård</Badge>
              <p className="text-2xl font-semibold leading-10 tracking-tight sm:text-3xl">
                "Professionellt bemötande och tydlig information – vi känner oss alltid välkomna."
              </p>
              <Separator className="max-w-32" />
              <div>
                <p className="font-medium">[Patientens namn]</p>
                <p className="text-sm text-muted-foreground">Patient sedan [år]</p>
              </div>
            </div>
            <div className="rounded-2xl bg-card/80 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Boka besök</p>
              <h3 className="mt-2 text-2xl font-semibold">Vi tar emot nya patienter</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Ring receptionen eller boka online. Vid akuta besvär, vänligen kontakta 1177 för rådgivning.
              </p>
              <Button className="mt-6 w-full rounded-full" size="lg">
                Boka tid <ArrowRight className="ml-2 h-4 w-4" />
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
  { label: "Behandlingar", href: "#behandlingar" },
  { label: "Vårt team", href: "#team" },
  { label: "Öppettider", href: "#oppettider" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Kliniknamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">
            Boka tid
          </Button>
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
      content: `import { ArrowUpRight, Clock, MapPin, Phone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl border bg-card/80 p-8 lg:grid-cols-3">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Kliniknamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Legitimerad vårdpersonal, modern utrustning och ett tryggt bemötande för hela familjen.
          </p>
          <a href="mailto:info@example.com" className="inline-flex items-center gap-2 text-sm font-medium">
            info@example.com <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Kontakt</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> [08-123 45 67]
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> [Gatuadress 12], [Stad]
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Mån–Fre 08–17, Lör 10–14
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Mer information</p>
          <div className="space-y-2">
            {["Integritetspolicy", "Patientavgifter", "1177.se"].map((link) => (
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
