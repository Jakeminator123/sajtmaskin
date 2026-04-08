import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ShieldCheck, Target, User as Users2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sharedKeywords, siteConfig, team, timeline, values } from "@/lib/site-data";

const ogImage =
  "/placeholder.svg?height=630&width=1200&text=TechPartner+AB+om+oss";

const valueIcons = [Target, Users2, ShieldCheck, CheckCircle2];

export const metadata: Metadata = {
  title: "Om oss — TechPartner AB och teamet bakom våra leveranser i Stockholm",
  description:
    "Lär känna TechPartner AB, vårt arbetssätt och teamet bakom lösningar inom systemutveckling, moln och IT-säkerhet för företag i Stockholm.",
  keywords: [...sharedKeywords, "om TechPartner AB", "team systemutveckling"],
  alternates: {
    canonical: "/om-oss",
  },
  openGraph: {
    title: "Om oss — TechPartner AB och teamet bakom våra leveranser i Stockholm",
    description:
      "Lär känna TechPartner AB, vårt arbetssätt och teamet bakom lösningar inom systemutveckling, moln och IT-säkerhet för företag i Stockholm.",
    url: `${siteConfig.url}/om-oss`,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Om oss på TechPartner AB",
      },
    ],
    locale: "sv_SE",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/60 bg-gradient-to-b from-background to-muted/60">
        <div className="section-shell grid gap-12 py-18 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge className="rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-none">
              Om oss
            </Badge>
            <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Vi bygger långsiktiga teknikpartnerskap för företag som vill framåt med kontroll.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              TechPartner AB är ett konsultbolag med fokus på systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm.
              Vårt sätt att arbeta är nära, tydligt och affärsorienterat, så att tekniska beslut blir enklare att genomföra och lättare att förankra i organisationen.
            </p>
            <Button asChild size="lg" className="rounded-full">
              <Link href="/kontakt">
                Kontakta oss
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="/placeholder.svg?height=760&width=920&text=Ledningsgrupp+och+teknikteam+i+ljus+skandinavisk+studio"
              alt="Ledningsgrupp och teknikteam i ljus skandinavisk studio"
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
            <span className="section-label">Vår historia</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Från tekniska specialistuppdrag till ett tydligt partnererbjudande
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Under åren har vi följt hur teknikavdelningar ställs inför högre krav på tempo, säkerhet och stabilitet samtidigt.
              Därför har vi byggt ett erbjudande som kombinerar rådgivning, genomförande och förvaltning i samma samarbetspartner.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {timeline.map((item) => (
              <Card
                key={item.year}
                className="rounded-[1.75rem] border-border/70 bg-card/95 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                  {item.year}
                </p>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Teamet</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Människor som kombinerar teknikdjup med affärsförståelse
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Vårt team består av seniora profiler som är vana vid att arbeta nära beslutsfattare och interna utvecklingsteam.
              Det gör att vi kan växla mellan strategi, praktiskt genomförande och stöd i vardagens prioriteringar utan att tappa helheten.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {team.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden rounded-[1.75rem] border-border/70 bg-card/95 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <Image
                  src={member.image}
                  alt={member.name}
                  width={420}
                  height={520}
                  className="h-72 w-full object-cover"
                />
                <div className="p-6">
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    {member.name}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-primary">{member.role}</p>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {member.bio}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Värderingar och arbetssätt</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Så skapar vi lugn i komplexa teknikmiljöer
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Vi tror att bra teknikarbete kräver både spetskompetens och ett sätt att samarbeta som gör beslut begripliga.
              Därför bygger vi våra leveranser runt tydlighet, ansvar och praktisk nytta för verksamheten.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {values.map((value, index) => {
              const Icon = valueIcons[index];

              return (
                <Card
                  key={value.title}
                  className="rounded-[1.75rem] border-border/70 bg-card/95 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="icon-chip">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight text-foreground">
                    {value.title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {value.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-8 lg:px-12 lg:py-14">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div className="space-y-4">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill du veta hur vi kan stötta just ditt team?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Vi tar gärna ett första möte där vi går igenom nuläge, prioriteringar och den tekniska riktning som krävs för nästa fas.
                  Efter mötet får du en tydlig rekommendation som går att agera på direkt.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row lg:justify-end">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/kontakt">Boka tid</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/priser">Se våra paket</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}