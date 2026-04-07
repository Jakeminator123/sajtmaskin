import type { ScaffoldManifest } from "../types";

export const professionalManifest: ScaffoldManifest = {
  id: "professional",
  family: "professional",
  label: "Professionella tjänster",
  description:
    "Professional services website with expertise areas, team, and contact. For lawyers, accountants, consultants, architects, and similar professional firms.",
  buildIntents: ["website"],
  tags: [
    "advokat",
    "advokatbyrå",
    "jurist",
    "revisor",
    "redovisning",
    "konsult",
    "konsultfirma",
    "arkitekt",
    "mäklare",
    "fastighetsmäklare",
    "tandläkare",
    "läkare",
    "psykolog",
    "terapeut",
    "rådgivare",
    "byrå",
    "firma",
  ],
  promptHints: [
    "This scaffold targets professional services firms. Credibility and expertise are paramount.",
    "Include expertise/practice areas clearly listed.",
    "Team section with names, titles, and optionally short bios.",
    "A contact/consultation CTA is the primary conversion.",
    "Tone should be professional and trustworthy, not casual.",
    "Use clean corporate imagery from Unsplash (office, meetings, cityscapes).",
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
  --color-primary: oklch(0.55 0.12 258);
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
  --color-ring: oklch(0.55 0.12 258);
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
  title: "[Företagsnamn] — [Bransch]",
  description: "[Företagsnamn] erbjuder professionell rådgivning och tjänster inom [branschområde].",
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
import { ArrowRight, Briefcase, Users, Award } from "lucide-react";
import Image from "next/image";

const expertiseAreas = [
  { title: "[Specialistområde 1]", desc: "Kort beskrivning av er kompetens inom området." },
  { title: "[Specialistområde 2]", desc: "Kort beskrivning av er kompetens inom området." },
  { title: "[Specialistområde 3]", desc: "Kort beskrivning av er kompetens inom området." },
];

const team = [
  { name: "[Namn]", role: "[Titel]" },
  { name: "[Namn]", role: "[Titel]" },
  { name: "[Namn]", role: "[Titel]" },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80" alt="Modern kontorsmiljö" fill className="object-cover opacity-15" priority />
        </div>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">[Företagsnamn]</h1>
        <p className="max-w-xl text-lg text-muted-foreground">Professionell rådgivning med fokus på resultat.</p>
        <Button size="lg">Boka konsultation <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Kompetensområden</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Vi har djup erfarenhet inom flera områden.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {expertiseAreas.map((area) => (
              <Card key={area.title} className="bg-card border-border">
                <CardHeader><Briefcase className="h-8 w-8 text-primary mb-2" /><CardTitle>{area.title}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">{area.desc}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Vårt team</h2>
            <p className="text-muted-foreground">Erfarna specialister som står till din tjänst.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((member) => (
              <Card key={member.name} className="bg-card border-border">
                <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-7 w-7 text-primary" />
                  </div>
                  <div><p className="font-semibold">{member.name}</p><p className="text-sm text-muted-foreground">{member.role}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <Award className="h-10 w-10 text-primary mx-auto" />
          <h2 className="text-3xl font-bold tracking-tight">Behöver du professionell hjälp?</h2>
          <p className="text-muted-foreground">Kontakta oss för en inledande konsultation — kostnadsfritt och utan förpliktelse.</p>
          <Button size="lg">Kontakta oss <ArrowRight className="ml-2 h-4 w-4" /></Button>
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
  { label: "Kompetens", href: "#kompetens" },
  { label: "Team", href: "#team" },
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
          <Button size="sm">Kontakta oss <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
        </nav>
        <button type="button" className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-label="Meny"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (<a key={item.href} href={item.href} className="block text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>{item.label}</a>))}
          <Button size="sm" className="w-full">Kontakta oss</Button>
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
        <p className="text-sm text-muted-foreground">[Gatuadress], [Stad] · [Telefonnummer] · [E-post]</p>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} [Företagsnamn]</p>
      </div>
    </footer>
  );
}
`,
    },
  ],
};
