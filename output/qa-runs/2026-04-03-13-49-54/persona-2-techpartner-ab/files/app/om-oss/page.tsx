
import Link from "next/link";
import type { Metadata } from "next";


import { ArrowRight } from "lucide-react"






import { processSteps, teamMembers, values } from "@/lib/site-data";
import Image from "next/image";
import { createMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Om oss",
  description:
    "Lär känna TechPartner AB, teamet bakom lösningar inom systemutveckling, moln och IT-säkerhet för företag som vill arbeta långsiktigt och tryggt.",
  path: "/om-oss",
});

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      <section className="pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:items-center">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/80 bg-card px-4 py-1.5 text-sm text-secondary-foreground"
            >
              Om TechPartner AB
            </Badge>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Teknikpartner för företag som vill bygga tryggt och långsiktigt
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Vi hjälper företag att leverera digitala produkter och
                plattformar med hög kvalitet, säkerhet och tydlig styrning.
                Vårt fokus är långsiktiga relationer där teknikval och processer
                håller över tid, även när kraven förändras.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <Link href="/kontakt">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <Link href="/priser">Se priser</Link>
              </Button>
            </div>
          </div>

          <div className="surface-panel grid-mask overflow-hidden rounded-[2rem] shadow-xl">
            <div className="relative aspect-[5/4]">
              <Image
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1100&h=800&fit=crop&q=80"
                alt="Teamfoto i ljust nordiskt kontor med teknikfokus"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:items-start">
          <div className="space-y-6">
            <SectionHeading
              label="Vår bakgrund"
              title="Startat för att göra senior teknikkompetens enklare att använda"
              description="TechPartner AB startades för att göra det lättare för verksamheter att få tillgång till senior kompetens utan långa startsträckor. Vi har arbetat med allt från modernisering av äldre system till nyutveckling i molnet, alltid med säkerhet som grund."
            />
            <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Vi tror på små, leveransstarka team och tydliga mål som går att
              följa upp. När ansvar, prioriteringar och tekniska beslut blir
              begripliga för både ledning och utvecklingsteam blir det också
              lättare att skapa fart utan att tumma på kvalitet.
            </p>
          </div>

          <div className="grid gap-4">
            {[
              "Van vid att arbeta nära CTO:er, IT-chefer och produktansvariga.",
              "Erfarenhet av både nyutveckling och modernisering av befintliga system.",
              "Säkerhet, drift och vidareutveckling planeras från första leveransen.",
            ].map((item) => (
              <Card
                key={item}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm"
              >
                <CardContent className="p-5">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Teamet"
            title="Personer som tar ansvar i vardagen"
            description="Vi tror på ett nära samarbete där rätt kompetens kopplas till rätt fas i uppdraget. Därför är vårt team byggt för att kunna växla mellan strategi, praktisk leverans och långsiktig förbättring utan att tappa riktning."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="relative aspect-[4/4.5]">
                  <Image
                    src={member.image}
                    alt={member.alt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 33vw, 100vw"
                  />
                </div>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-xl">{member.name}</CardTitle>
                  <p className="text-sm font-medium text-primary">
                    {member.role}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {member.bio}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Så arbetar vi"
            title="Från förstudie till drift med samma tydlighet"
            description="Arbetssättet är byggt för att ge kontroll tidigt och framdrift över tid. Vi fokuserar på små steg med tydliga resultat så att ni kan fatta beslut på bra underlag istället för magkänsla."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {processSteps.map((step) => (
              <Card
                key={step.title}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                    <step.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Värderingar"
            title="Värderingar som märks i leveransen"
            description="Det viktigaste för oss är inte hur avancerad tekniken låter, utan hur väl den fungerar i verkligheten. Därför är våra värderingar nära kopplade till hur vi planerar, kommunicerar och följer upp arbetet."
            align="center"
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {values.map((value) => (
              <Card
                key={value.title}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                    <value.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{value.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {value.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground shadow-xl sm:px-10 sm:py-12 lg:px-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-primary-foreground/10 px-3 py-1 text-primary-foreground hover:bg-primary-foreground/10">
                  Långsiktigt samarbete
                </Badge>
                <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill ni lära känna oss genom ett konkret första uppdrag?
                </h2>
                <p className="max-w-2xl text-pretty text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
                  Ett första samtal räcker ofta för att se om vi passar ihop i
                  arbetssätt, ambitionsnivå och tempo. Vi berättar gärna hur vi
                  brukar lägga upp uppstarter och vad som krävs för att komma
                  vidare snabbt.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent px-6 text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 active:scale-95"
              >
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}