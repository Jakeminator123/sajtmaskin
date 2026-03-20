import type { ScaffoldManifest } from "../types";

export const schoolManifest: ScaffoldManifest = {
  id: "school",
  family: "content-site",
  label: "Utbildning & Skola",
  description:
    "Starter for schools, courses, academies, and educational organizations with course catalog, teacher profiles, enrollment info, and FAQ.",
  buildIntents: ["website"],
  tags: [
    "skola",
    "utbildning",
    "kurs",
    "kurser",
    "akademi",
    "gymnasium",
    "universitet",
    "förskola",
    "lärare",
    "folkbildning",
    "studieförbund",
    "school",
    "education",
    "course",
    "learning",
  ],
  promptHints: [
    "Use this scaffold for schools, course providers, academies, study associations, and other educational organizations.",
    "Keep the learning-focused structure: hero with school or program name, course catalog, teacher profiles, enrollment dates and application CTA, and FAQ.",
    "Adapt course names, teacher bios, schedules, and enrollment windows to the user's institution and programs.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0.012 85);
  --color-foreground: oklch(0.17 0.02 75);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.19 0.02 75);
  --color-primary: oklch(0.7 0.14 78);
  --color-primary-foreground: oklch(0.18 0.03 75);
  --color-secondary: oklch(0.96 0.02 85);
  --color-secondary-foreground: oklch(0.22 0.02 75);
  --color-muted: oklch(0.95 0.015 85);
  --color-muted-foreground: oklch(0.44 0.02 75);
  --color-accent: oklch(0.93 0.04 78);
  --color-accent-foreground: oklch(0.22 0.03 75);
  --color-destructive: oklch(0.55 0.2 25);
  --color-destructive-foreground: oklch(0.98 0.005 25);
  --color-border: oklch(0.9 0.02 85);
  --color-input: oklch(0.92 0.018 85);
  --color-ring: oklch(0.7 0.14 78);
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
      radial-gradient(circle at top right, color-mix(in oklab, var(--color-primary) 12%, white) 0%, transparent 28%);
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
  title: "[Skolnamn] — Kurser & utbildning",
  description: "Webbplats för skola, kursverksamhet eller utbildningsorganisation med kurskatalog, lärare och ansökan.",
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
import { Separator } from "@/components/ui/separator";
import { GraduationCap, BookOpen, Clock, MapPin, Phone, ArrowRight, Users } from "lucide-react";

const courses = [
  { title: "Webbdesign Grundkurs", hours: "40 timmar", blurb: "HTML, CSS och responsiv layout. Du bygger en enkel portföljsajt och lär dig publicera på webben." },
  { title: "Digital Marknadsföring", hours: "32 timmar", blurb: "SoMe, annonsering och analys. Praktiska övningar utifrån verkliga case och enkla mätverktyg." },
  { title: "Programmering för Nybörjare", hours: "48 timmar", blurb: "Grunder i programmering med fokus på problemlösning, variabler och enkla projekt i en modern miljö." },
  { title: "Grafisk Design", hours: "36 timmar", blurb: "Komposition, typografi och färg. Du skapar affischer och enkla varumärkesytor med digitala verktyg." },
];
const teachers = [
  { name: "[Förnamn Efternamn]", role: "[Titel / ämne]", initials: "FE" },
  { name: "[Förnamn Efternamn]", role: "[Titel / ämne]", initials: "FE" },
  { name: "[Förnamn Efternamn]", role: "[Titel / ämne]", initials: "FE" },
];
const faq = [
  { q: "Hur ansöker jag till en kurs?", a: "Fyll i intresseanmälan under Ansökan eller ring oss. Vi återkommer med bekräftelse och betalningsinformation." },
  { q: "Behöver jag tidigare erfarenhet?", a: "Våra grundkurser kräver inga förkunskaper. För fördjupning kan vissa kurser rekommendera genomgången grundkurs." },
  { q: "Kan jag få studiestöd?", a: "Kontakta CSN eller din arbetsgivare för studiestöd. Vi kan utfärda intyg för antagen kursdeltagare." },
  { q: "Var hålls lektionerna?", a: "Undervisning sker [på plats / digitalt / hybrid]. Exakta tider och salar meddelas i välkomstbrevet." },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 py-28 text-center">
        <Badge variant="secondary" className="text-sm">
          <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Utbildning & kurser
        </Badge>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          [Skolnamn]
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Vi erbjuder [kort beskrivning av erbjudande]. Här hittar du vår kurskatalog, lärare och allt du behöver för att söka en plats.
        </p>
        <div className="flex gap-4 pt-4">
          <Button size="lg" asChild>
            <a href="#ansokan">
              Ansök till hösten <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#kurser">Se kurser</a>
          </Button>
        </div>
      </section>
      {/* Kurskatalog */}
      <section id="kurser" className="scroll-mt-20 px-6 py-20 bg-secondary/40">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Våra kurser</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {courses.map((c) => (
              <Card key={c.title}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{c.title}</CardTitle>
                    <Badge variant="outline" className="font-normal">
                      <Clock className="mr-1 h-3 w-3" /> {c.hours}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{c.blurb}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Lärare */}
      <section id="larare" className="scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-5xl space-y-10">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Möt lärarna</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((t, i) => (
              <Card key={\`\${t.name}-\${i}\`} className="text-center">
                <CardContent className="pt-6 flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Ansökan */}
      <section id="ansokan" className="scroll-mt-20 px-6 py-20 bg-secondary/40">
        <div className="mx-auto max-w-3xl space-y-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <Clock className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Ansökan & terminer</h2>
          </div>
          <Card>
            <CardContent className="space-y-6 pt-6 text-left">
              <div className="flex flex-wrap gap-2">
                <Badge>Antagning hösttermin</Badge>
                <Badge variant="outline">15 aug – 5 sep 2026</Badge>
              </div>
              <Separator />
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-medium text-foreground shrink-0">Hösttermin 2026:</span>
                  <span>Start vecka 36 · sista ansökningsdag 5 sep</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-foreground shrink-0">Vårtermin 2027:</span>
                  <span>Start vecka 3 · ansökan öppnar 1 nov 2026</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-foreground shrink-0">Introkväll:</span>
                  <span>28 aug 2026 kl. 18:00 — anmäl dig via kontakt nedan</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Button size="lg">
            Skicka intresseanmälan <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>
      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-3xl space-y-8">
          <h2 className="text-center text-3xl font-bold tracking-tight">Vanliga frågor</h2>
          <div className="space-y-4">
            {faq.map((item) => (
              <Card key={item.q}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{item.q}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      {/* Kontakt */}
      <section id="kontakt" className="scroll-mt-20 px-6 py-20 bg-secondary/40">
        <div className="mx-auto max-w-5xl space-y-8">
          <h2 className="text-center text-3xl font-bold tracking-tight">Kontakt</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardContent className="flex gap-4 pt-6">
                <MapPin className="h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">Besök oss</p>
                  <p className="text-muted-foreground">[Gatuadress 1]</p>
                  <p className="text-muted-foreground">[123 45] [Ort]</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex gap-4 pt-6">
                <Phone className="h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">Ring oss</p>
                  <p className="text-muted-foreground">[08-123 45 67]</p>
                  <p className="text-muted-foreground">info@[skola].se</p>
                </div>
              </CardContent>
            </Card>
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, ArrowRight } from "lucide-react";

const navItems = [
  { label: "Kurser", href: "#kurser" },
  { label: "Lärare", href: "#larare" },
  { label: "Ansökan", href: "#ansokan" },
  { label: "Kontakt", href: "#kontakt" },
];
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">
          [Skolnamn]
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
          <Button size="sm" asChild>
            <a href="#ansokan">
              Ansök <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </a>
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
          <Button size="sm" className="w-full" asChild>
            <a href="#ansokan" onClick={() => setMobileOpen(false)}>
              Ansök <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </a>
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
            <p className="text-lg font-bold tracking-tight">[Skolnamn]</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Utbildning och kurser för dig som vill utvecklas. Vi kombinerar tydlig struktur med engagerade lärare.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Kontakt</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>[Gatuadress 1]</p>
              <p>[123 45] [Ort]</p>
              <p>info@[skola].se</p>
              <p>Tel: [08-123 45 67]</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Organisation</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Org.nr: [XXXXXX-XXXX]</p>
              <p>Godkänd för [F skatt / moms / annat]</p>
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} [Skolnamn]. Alla rättigheter förbehållna.
          </p>
          <a
            href="mailto:info@[skola].se"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="h-3.5 w-3.5" /> info@[skola].se
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
