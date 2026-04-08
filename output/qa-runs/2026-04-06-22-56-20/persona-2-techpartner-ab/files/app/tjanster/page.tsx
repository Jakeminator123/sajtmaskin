import {
import Link from "next/link";
  ArrowRight,
  Cloud,
  Code2,
  Layers3,
  PenTool,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";








import { createMetadata, createPlaceholderSrc, deliverySteps, import Image from "next/image";
import { createMetadata } from "@/lib/metadata";

import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { services, techAreas } from "@/lib/site-data";
import { Link, ArrowRight } from "lucide-react"
  createPlaceholderSrc, services, techAreas } from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "Tjänster — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Utforska TechPartner AB:s tjänster inom systemutveckling, molnlösningar, IT-säkerhet och förvaltning för företag som vill växa tryggt.",
  keywords: [
    "tjänster systemutveckling",
    "molnlösningar företag",
    "IT-säkerhet konsult",
    "förvaltning system",
    "TechPartner AB tjänster",
  ],
});

const serviceIcons = [Code2, Cloud, ShieldCheck, Settings2];
const stepIcons = [Search, PenTool, Layers3, ShieldCheck];

export default function ServicesPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center space-y-6">
            <Badge variant="secondary" className="w-fit">
              Våra tjänster
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Tjänster som ger bättre fart, stabilitet och kontroll
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Våra uppdrag utgår från verksamhetens mål, men landar alltid i
              tydliga tekniska beslut och ett arbetssätt som håller i vardagen.
              Vi hjälper företag som behöver bygga nytt, modernisera befintliga
              plattformar eller stärka säkerhet och driftbarhet.
            </p>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Samarbetet kan börja med rådgivning, en avgränsad insats eller ett
              längre partnerskap. Oavsett upplägg arbetar vi med samma fokus på
              ansvar, tydlighet och hållbar leverans.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  1200,
                  900,
                  "Cloud architecture workshop with Scandinavian business team",
                )}
                alt="Workshop om molnarkitektur mellan kund och teknikteam"
                fill
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Tjänsteområden</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Fyra områden där vi skapar störst värde
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi arbetar ofta tvärfunktionellt mellan utveckling, moln och
              säkerhet eftersom det är där de viktigaste besluten möts. På så
              sätt får ni en lösning som fungerar som helhet, inte bara i en
              enskild del.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {services.map((service, index) => {
              const Icon = serviceIcons[index];

              return (
                <Card
                  key={service.slug}
                  id={service.slug}
                  className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight">
                      {service.title}
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {service.description}
                    </p>
                    <ul className="space-y-3">
                      {service.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-start gap-3 text-sm text-foreground"
                        >
                          <span className="mt-2 h-2 w-2 rounded-full bg-primary" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Arbetssätt</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Så genomför vi leveranser med kontroll i varje steg
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              När teknikfrågor blir komplexa behöver processen vara enkel att
              förstå. Därför arbetar vi med en modell som gör det tydligt vad som
              händer nu, vad som kommer sedan och vilka beslut som behöver tas
              längs vägen.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {deliverySteps.map((step, index) => {
              const Icon = stepIcons[index];

              return (
                <Card
                  key={step.title}
                  className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {step.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Teknik och plattformar</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tekniskt djup där det behövs som mest
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi är inte låsta vid ett enskilt verktyg eller en kortsiktig trend.
              I stället väljer vi teknik utifrån era mål, er befintliga miljö och
              den förmåga som organisationen behöver långsiktigt.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {techAreas.map((area) => (
              <Card
                key={area.title}
                className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {area.title}
                  </h3>
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {area.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {area.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-primary px-8 py-10 text-primary-foreground shadow-sm sm:px-10 lg:px-12 lg:py-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Behöver ni rätt teknikpartner för nästa fas?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-primary-foreground/85">
                  Vi hjälper er gärna att reda ut nuläge, prioriteringar och
                  vilka insatser som skapar mest effekt. Ett första möte räcker
                  ofta långt för att göra nästa steg tydligare.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/kontakt">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}