
import Link from "next/link";
import type { Metadata } from "next";









import { processSteps, services } from "@/lib/site-data";
import Image from "next/image";
import { createMetadata } from "@/lib/seo";
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Tjänster",
  description:
    "Utforska TechPartner AB:s tjänster inom systemutveckling, molnlösningar, IT-säkerhet och förvaltning för företag i Stockholm med höga krav.",
  path: "/tjanster",
});

export default function ServicesPage() {
  return (
    <div className="flex flex-col">
      <section className="pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:items-center">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/80 bg-card px-4 py-1.5 text-sm text-secondary-foreground"
            >
              Våra tjänster
            </Badge>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Tjänster för hela resan från idé till trygg drift
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Vi hjälper företag i Stockholm att få bättre fart i utveckling,
                säkrare molnmiljöer och tydligare ansvar i drift. Oavsett om ni
                behöver förstärka ett internt team eller lägga ett helhetsansvar
                hos en partner utformar vi ett upplägg som är lätt att styra.
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
                alt="Teknisk strategi och molnarkitektur i ljust kontor"
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Erbjudande"
            title="Fyra områden som täcker de vanligaste behoven"
            description="Tjänsterna är utformade för att fungera både var för sig och som en helhet. Det ger er möjlighet att börja där behovet är störst och sedan bygga vidare utan att byta riktning."
            align="center"
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <Card
                key={service.id}
                id={service.id}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                    <service.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{service.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <ul className="space-y-2">
                    {service.deliverables.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-sm text-muted-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8 lg:items-center">
          <div className="surface-panel overflow-hidden rounded-[2rem] shadow-xl">
            <div className="relative aspect-[5/4]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=800&fit=crop&q=80"
                alt="Workshop om integrationer och säkerhet i skandinavisk miljö"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading
              label="Leveransinnehåll"
              title="Det ni faktiskt får i ett samarbete"
              description="Vi fokuserar på det som skapar verklig effekt i vardagen: tydlig arkitektur, fungerande leveransflöde och en teknisk miljö som är lätt att förstå. Varje uppdrag sätts upp så att ert team kan följa status och fatta beslut utan onödiga mellanled."
            />
            <div className="grid gap-4">
              {[
                {
                  title: "Arkitektur som går att förvalta",
                  text: "Vi väljer lösningar som håller när verksamheten växer och som inte låser fast er i onödan. Målet är att ge en stabil grund för både snabbare utveckling och lägre teknisk risk.",
                },
                {
                  title: "Integrationer med tydliga gränssnitt",
                  text: "När system behöver prata med varandra blir dokumentation, ägarskap och testbarhet extra viktiga. Vi hjälper er att strukturera integrationer så att förändringar blir enklare att planera.",
                },
                {
                  title: "Molnmiljöer med bättre kontroll",
                  text: "Behörigheter, kostnader, driftsäkerhet och deploymentflöden måste fungera tillsammans. Vi skapar en vardag där ni får bättre överblick utan att tappa tempo.",
                },
                {
                  title: "Säkerhet som en del av arbetet",
                  text: "Risker och säkerhetskrav hanteras löpande istället för att skjutas upp till slutet. Det gör att förbättringar kan införas gradvis och med bättre förankring i teamet.",
                },
              ].map((item) => (
                <Card
                  key={item.title}
                  className="rounded-3xl border-border/80 bg-card/95 shadow-sm"
                >
                  <CardContent className="space-y-2 p-5">
                    <h3 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.text}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Samarbete"
            title="Så samverkar vi med ert team"
            description="Vi är vana vid att arbeta tillsammans med interna utvecklare, produktägare och driftansvariga. Det betyder att vi kan gå in som förstärkning där det behövs mest, utan att skapa onödig friktion i befintliga processer."
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

      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground shadow-xl sm:px-10 sm:py-12 lg:px-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-primary-foreground/10 px-3 py-1 text-primary-foreground hover:bg-primary-foreground/10">
                  Nästa steg
                </Badge>
                <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Behöver ni hjälp att välja rätt startpunkt?
                </h2>
                <p className="max-w-2xl text-pretty text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
                  Vi hjälper gärna till att avgränsa vad som bör göras först och
                  vilket upplägg som passar ert läge. Ett kort första samtal
                  brukar räcka för att skapa en tydligare plan.
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