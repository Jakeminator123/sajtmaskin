import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  MessageSquareMore,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pricingFaq, pricingPackages, sharedKeywords, siteConfig, values } from "@/lib/site-data";

const ogImage =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop&q=80";

const comparisonRows = [
  {
    label: "Workshops och behovsanalys",
    values: ["1 per månad", "2 per månad", "Löpande efter behov"],
  },
  {
    label: "Utvecklingskapacitet",
    values: ["2 dagar", "6 dagar", "14 dagar"],
  },
  {
    label: "Molnoptimering",
    values: ["Rådgivning", "Ingår", "Fördjupad uppföljning"],
  },
  {
    label: "Säkerhetsgranskning",
    values: ["Grundnivå", "Fördjupad", "Fördjupad + uppföljning"],
  },
  {
    label: "Lednings- och roadmapstöd",
    values: ["Vid behov", "Månadsvis", "Kvartalsvis och löpande"],
  },
  {
    label: "Svarstid",
    values: ["Inom 2 arbetsdagar", "Inom 1 arbetsdag", "Avtalad SLA"],
  },
];

const faqSupportPoints: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Snabb återkoppling",
    description:
      "Vi återkommer snabbt med en tydlig rekommendation så att ni slipper långa säljprocesser innan ni får ett konkret nästa steg.",
    icon: CalendarClock,
  },
  {
    title: "Tydliga upplägg",
    description:
      "Paketen är byggda för att vara enkla att förstå, följa upp och justera när behov, teamstorlek eller prioriteringar förändras.",
    icon: MessageSquareMore,
  },
  {
    title: "Säkerhet ingår",
    description:
      "Oavsett paketnivå är säkerhet en del av arbetssättet från början, inte något som läggs på i efterhand.",
    icon: ShieldCheck,
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: pricingFaq.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export const metadata: Metadata = {
  title: "Priser — paket för systemutveckling, moln och IT-säkerhet | TechPartner AB",
  description:
    "Se TechPartner AB:s priser och paket för systemutveckling, molnlösningar och IT-säkerhet. Välj ett upplägg som passar ditt team och din tillväxt.",
  keywords: [...sharedKeywords, "priser systemutveckling", "paket IT-säkerhet"],
  alternates: {
    canonical: "/priser",
  },
  openGraph: {
    title: "Priser — paket för systemutveckling, moln och IT-säkerhet | TechPartner AB",
    description:
      "Se TechPartner AB:s priser och paket för systemutveckling, molnlösningar och IT-säkerhet. Välj ett upplägg som passar ditt team och din tillväxt.",
    url: `${siteConfig.url}/priser`,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Priser och paket hos TechPartner AB",
      },
    ],
    locale: "sv_SE",
    type: "website",
  },
};

export default function PricesPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/60 bg-gradient-to-b from-background to-muted/60">
        <div className="section-shell grid gap-12 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge className="rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-none">
              Priser och paket
            </Badge>
            <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Tydliga upplägg för företag som vill få fart utan att tappa kontroll.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Våra paket är framtagna för att ge CTO:er och IT-chefer rätt nivå av
              stöd beroende på läge, ambition och intern kapacitet. Du kan börja
              mindre, skala upp när behovet växer och alltid räkna med ett
              upplägg som är enkelt att förstå och följa upp.
            </p>
          </div>

          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=920&h=760&fit=crop&q=80"
              alt="Teknisk planering vid bord med datorer och anteckningar"
              width={920}
              height={760}
              priority
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Prispaket</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Välj en nivå som passar nu och justera när verksamheten kräver mer
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Alla paket bygger på samma grund: tydliga ansvar, tät uppföljning
              och ett arbetssätt som gör tekniska frågor lättare att driva i
              organisationen. Skillnaden ligger i hur mycket leveranskapacitet,
              ledningsstöd och säkerhetsarbete du vill lägga in från start.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {pricingPackages.map((pkg) => (
              <Card
                key={pkg.name}
                className={`rounded-[1.75rem] border-border/70 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                  pkg.featured ? "bg-primary text-primary-foreground" : "bg-card/95"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight">
                      {pkg.name}
                    </h2>
                    <p
                      className={`mt-2 text-sm leading-6 ${
                        pkg.featured
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {pkg.description}
                    </p>
                  </div>
                  {pkg.featured ? (
                    <span className="rounded-full border border-primary-foreground/20 px-3 py-1 text-xs font-medium">
                      Mest vald
                    </span>
                  ) : null}
                </div>

                <div className="mt-8">
                  <p className="font-display text-4xl font-semibold tracking-tight">
                    {pkg.price}
                    <span
                      className={`ml-2 text-base font-medium ${
                        pkg.featured
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {pkg.billing}
                    </span>
                  </p>
                  <p
                    className={`mt-3 text-sm leading-6 ${
                      pkg.featured
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {pkg.bestFor}
                  </p>
                </div>

                <ul className="mt-8 space-y-3">
                  {pkg.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  size="lg"
                  variant={pkg.featured ? "secondary" : "outline"}
                  className={`mt-8 w-full rounded-full ${
                    pkg.featured ? "" : "bg-transparent"
                  }`}
                >
                  <Link href="/kontakt">
                    {pkg.ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Vad som ingår</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Samma kvalitet i grunden, olika nivåer av kapacitet och uppföljning
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Jämförelsen nedan gör det enklare att se hur paketen skiljer sig åt i
              praktiken. Om du är osäker hjälper vi dig gärna att välja ett
              upplägg utifrån målbild, teamstorlek och teknisk komplexitet.
            </p>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/95">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-secondary/70">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold text-foreground">
                      Innehåll
                    </th>
                    <th scope="col" className="px-6 py-4 font-semibold text-foreground">
                      Start
                    </th>
                    <th scope="col" className="px-6 py-4 font-semibold text-foreground">
                      Tillväxt
                    </th>
                    <th scope="col" className="px-6 py-4 font-semibold text-foreground">
                      Strategisk partner
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-t border-border/60">
                      <th
                        scope="row"
                        className="px-6 py-4 font-medium text-foreground"
                      >
                        {row.label}
                      </th>
                      {row.values.map((value) => (
                        <td
                          key={`${row.label}-${value}`}
                          className="px-6 py-4 text-muted-foreground"
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">FAQ</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Vanliga frågor om priser, paket och hur samarbetet fungerar
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Här hittar du svar på frågor som ofta kommer upp när företag
              jämför olika upplägg för systemutveckling, moln och IT-säkerhet.
              Vi vill göra det enkelt att förstå vad som ingår, hur vi arbetar
              och när det är läge att välja ett större eller mindre paket.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-4">
              {faqSupportPoints.map((point) => (
                <Card
                  key={point.title}
                  className="rounded-[1.75rem] border-border/70 bg-card/95 p-6"
                >
                  <div className="icon-chip">
                    <point.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground">
                    {point.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {point.description}
                  </p>
                </Card>
              ))}
            </div>

            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-2 sm:p-3">
              <Accordion type="single" collapsible className="w-full">
                {pricingFaq.map((faq, index) => (
                  <AccordionItem
                    key={faq.question}
                    value={`faq-${index}`}
                    className="px-4"
                  >
                    <AccordionTrigger className="text-left text-base font-semibold text-foreground">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-7 text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <div className="border-t border-border/60 px-4 pb-4 pt-5">
                <p className="text-sm leading-7 text-muted-foreground">
                  Hittar du inte det du söker? Vi går gärna igenom era
                  förutsättningar i ett kort första samtal och rekommenderar ett
                  upplägg som passar er nuvarande situation.
                </p>
                <Button asChild size="lg" className="mt-5 rounded-full">
                  <Link href="/kontakt">
                    Boka rådgivning
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-8 lg:px-12 lg:py-14">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div className="space-y-4">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Osäker på vilket paket som passar bäst?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Vi hjälper dig gärna att välja rätt nivå utifrån nuläge,
                  prioriteringar och hur mycket stöd ditt team behöver just nu.
                  Efter ett första möte får du ett konkret förslag med
                  rekommenderat upplägg och nästa steg.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row lg:justify-end">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/kontakt">Boka rådgivning</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/om-oss">Läs om vårt arbetssätt</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
    </div>
  );
}