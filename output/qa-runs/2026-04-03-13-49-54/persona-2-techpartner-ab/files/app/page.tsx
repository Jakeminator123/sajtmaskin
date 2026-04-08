import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";

import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  PhoneCall,
} from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createMetadata } from "@/lib/seo";
import { heroStats, services, siteConfig, testimonials } from "@/lib/site-data";

export const metadata: Metadata = createMetadata({
  title: "Hem",
  description:
    "TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm med tydliga paket, senior kompetens och snabb start.",
  path: "/",
});

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: siteConfig.name,
  url: siteConfig.siteUrl,
  telephone: siteConfig.phoneDisplay,
  email: siteConfig.email,
  description: siteConfig.description,
  areaServed: "Stockholm",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Storgatan 12",
    postalCode: "411 38",
    addressLocality: "Göteborg",
    addressCountry: "SE",
  },
  sameAs: [siteConfig.linkedinUrl, siteConfig.githubUrl],
  serviceType: [
    "Systemutveckling",
    "Molnlösningar",
    "IT-säkerhet",
    "Förvaltning och support",
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <div className="flex flex-col">
        <section className="pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
              <div className="space-y-8">
                <Badge
                  variant="secondary"
                  className="rounded-full border border-border/80 bg-card px-4 py-1.5 text-sm text-secondary-foreground"
                >
                  För företag i Stockholm
                </Badge>

                <div className="space-y-6">
                  <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                    Moderna IT-lösningar för framtidens företag
                  </h1>
                  <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                    TechPartner AB hjälper CTO:er och IT-chefer att bygga,
                    modernisera och förvalta teknik med tydlig riktning. Ni får
                    en senior partner som tar ansvar för både leverans, drift
                    och säkerhet utan onödigt krångel.
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
                    <Link href="/#kontakt">Kontakta oss</Link>
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {heroStats.map((stat) => (
                    <Card
                      key={stat.label}
                      className="rounded-3xl border-border/80 bg-card/85 shadow-sm"
                    >
                      <CardContent className="space-y-2 p-5">
                        <p className="text-lg font-semibold tracking-tight text-foreground">
                          {stat.value}
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {stat.label}
                        </p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {stat.description}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="surface-panel grid-mask overflow-hidden rounded-[2rem] shadow-xl">
                  <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5]">
                    <Image
                      src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=900&fit=crop&q=80"
                      alt="Skandinavisk kontorsmiljö med utvecklingsteam i Stockholm"
                      fill
                      priority
                      className="object-cover"
                      sizes="(min-width: 1024px) 45vw, 100vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-background/10" />
                  </div>
                </div>

                <Card className="absolute -left-4 bottom-8 hidden w-56 rounded-3xl border-border/80 bg-card/95 shadow-lg lg:block">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-sm font-medium text-foreground">
                      Från idé till drift
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Vi täcker hela kedjan och tar ansvar för att teknikval,
                      leverans och förvaltning hänger ihop.
                    </p>
                  </CardContent>
                </Card>

                <Card className="absolute -right-4 top-8 hidden w-56 rounded-3xl border-border/80 bg-primary text-primary-foreground shadow-lg lg:block">
                  <CardContent className="space-y-2 p-5">
                    <p className="text-sm font-medium">Säkerhet som standard</p>
                    <p className="text-sm leading-relaxed text-primary-foreground/85">
                      Risker, rättigheter och driftsäkerhet vägs in tidigt i
                      varje leverans.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              label="Tjänster"
              title="Tjänster som täcker hela kedjan"
              description="Vi kombinerar utveckling, molnkompetens och säkerhet i samma leverans. Det gör besluten enklare, tempot jämnare och resultatet mer hållbart när verksamheten växer."
              align="center"
            />

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {services.map((service) => (
                <Card
                  key={service.id}
                  className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                      <service.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-xl">{service.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {service.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:items-center">
            <div className="space-y-6">
              <SectionHeading
                label="Om oss"
                title="En techpartner som gör det enkelt att fatta rätt beslut"
                description="TechPartner AB kombinerar senior utveckling med praktisk molnkompetens och ett säkerhetstänk i varje leverans. Vi jobbar transparent med tydlig plan, löpande avstämningar och mätbara resultat."
              />
              <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Vi är vana att samarbeta med interna team och tar rollen som
                förstärkning eller helhetsleverantör beroende på vad situationen
                kräver. Basen finns i Göteborg, men vi hjälper företag i
                Stockholm och resten av Sverige med samma raka arbetssätt och
                samma höga krav på kvalitet.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Tydlig plan och ansvarsfördelning från start",
                  "Senior kompetens i leveransnära roller",
                  "Säkerhet och drift som en del av helheten",
                  "Stöd för både projekt och långsiktig förvaltning",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/85 p-4 shadow-sm"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel overflow-hidden rounded-[2rem] shadow-xl">
              <div className="relative aspect-[5/4]">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=800&fit=crop&q=80"
                  alt="Seniora utvecklare vid whiteboard i ljust nordiskt kontor"
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              label="Socialt bevis"
              title="Kunder som väljer kvalitet och tydlighet"
              description="Många av våra uppdrag börjar i ett behov av mer struktur, bättre kontroll och snabbare leveransförmåga. Det som får samarbetet att fortsätta är att tekniken blir enklare att lita på i vardagen."
              align="center"
            />

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                <Card
                  key={testimonial.name}
                  className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardContent className="space-y-5 p-6">
                    <div className="inline-flex rounded-full bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
                      {testimonial.company}
                    </div>
                    <p className="text-pretty text-base leading-relaxed text-foreground">
                      ”{testimonial.quote}”
                    </p>
                    <div className="border-t border-border/70 pt-4">
                      <p className="font-medium text-foreground">
                        {testimonial.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
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
                    Redo att ta nästa steg?
                  </h2>
                  <p className="max-w-2xl text-pretty text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
                    Boka ett kostnadsfritt första samtal så går vi igenom mål,
                    nuläge och ett förslag på upplägg. Ni får en konkret bild av
                    vad som är rimligt att göra först och hur snabbt vi kan
                    komma vidare.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button
                    asChild
                    size="lg"
                    className="rounded-full bg-accent px-6 text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 active:scale-95"
                  >
                    <Link href="/kontakt">Boka tid</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-full border-primary-foreground/20 bg-transparent px-6 text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-foreground/8 active:scale-95"
                  >
                    <Link href="/priser">Se priser</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="kontakt"
          className="border-t border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div className="space-y-8">
              <SectionHeading
                label="Kontakt"
                title="Kontakta TechPartner AB"
                description="Boka ett första samtal så går vi igenom nuläge, mål och vilka risker som är viktigast att ta höjd för. Ni får ett tydligt nästa steg och ett förslag som går att ta ställning till."
              />

              <div className="grid gap-4">
                <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <PhoneCall className="mt-1 h-5 w-5 text-primary" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Telefon</p>
                      <a
                        href={siteConfig.phoneHref}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {siteConfig.phoneDisplay}
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <Mail className="mt-1 h-5 w-5 text-primary" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">E-post</p>
                      <a
                        href={siteConfig.emailHref}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {siteConfig.email}
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <MapPin className="mt-1 h-5 w-5 text-primary" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Adress</p>
                      <a
                        href={siteConfig.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {siteConfig.address}
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <Clock3 className="mt-1 h-5 w-5 text-primary" />
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Öppettider</p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {siteConfig.hours}. Bokade möten utanför tider går bra
                        vid behov.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-6">
              <div className="surface-panel overflow-hidden rounded-[2rem] shadow-xl">
                <a
                  href={siteConfig.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <div className="relative aspect-[5/4]">
                    <Image
                      src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=800&fit=crop&q=80"
                      alt="Stilren karta över Storgatan 12 i Göteborg med kontorsläge"
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 50vw, 100vw"
                    />
                  </div>
                </a>
              </div>

              <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <p className="font-medium text-foreground">
                    Besöksadress och digitalt samarbete
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Vi tar gärna möten på plats eller digitalt beroende på vad
                    som passar ert team bäst. Boka gärna tid innan besök så att
                    rätt person är på plats och förberedd på ert ärende.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      className="rounded-full transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                    >
                      <Link href="/kontakt">Boka tid</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                    >
                      <a
                        href={siteConfig.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Visa besöksadress
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}