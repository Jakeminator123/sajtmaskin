import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  MapPin,
  Phone,
  Settings2,
  ShieldCheck,
  Star,
  Code2,
  Mail,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createMetadata } from "@/lib/metadata";
import { createPlaceholderSrc, services, siteConfig, testimonials } from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "TechPartner AB — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "TechPartner AB hjälper företag i Stockholm med systemutveckling, moln och IT-säkerhet. Vi skapar trygga plattformar med tydlig affärsnytta och långsiktigt ansvar.",
  keywords: [
    "systemutveckling Stockholm",
    "molnlösningar Stockholm",
    "IT-säkerhet Stockholm",
    "teknikkonsult företag",
    "TechPartner AB",
  ],
});

const serviceIcons = [Code2, Cloud, ShieldCheck, Settings2];

const stats = [
  {
    value: "30+",
    label: "genomförda leveranser",
    text: "Från interna plattformar till kundnära digitala tjänster.",
  },
  {
    value: "99,9 %",
    label: "målbild för stabil drift",
    text: "Med fokus på observability, rutiner och tydligt ansvar.",
  },
  {
    value: "48 h",
    label: "till första workshop",
    text: "När behovet är akut kan vi snabbt komma igång med rätt personer.",
  },
];

const contactItems = [
  {
    icon: Phone,
    title: "Telefon",
    value: siteConfig.phone,
    href: siteConfig.phoneHref,
    text: "Ring oss om ni vill bolla ett aktuellt projekt eller en konkret teknisk utmaning.",
  },
  {
    icon: Mail,
    title: "E-post",
    value: siteConfig.email,
    href: siteConfig.emailHref,
    text: "Skicka gärna en kort beskrivning av nuläge, mål och önskad tidplan så förbereder vi nästa steg.",
  },
  {
    icon: MapPin,
    title: "Adress",
    value: siteConfig.address,
    href: "https://maps.google.com/?q=Storgatan+12,+411+38+Goteborg",
    text: "Vi arbetar främst med företag i Stockholm och håller även möten på plats hos kund vid behov.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/60">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center space-y-8 animate-fade-in motion-reduce:animate-none">
            <Badge variant="secondary" className="w-fit">
              Senior teknikpartner för växande företag
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Moderna IT-lösningar för framtidens företag
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                TechPartner AB hjälper CTO:er och IT-chefer att bygga robusta
                digitala plattformar med rätt tempo och tydlig styrning. Vi tar
                ansvar från analys och lösningsdesign till leverans, förvaltning
                och långsiktig förbättring.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/kontakt">
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/priser">Se priser och paket</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[1.25rem] border border-border bg-card p-4 shadow-sm"
                >
                  <p className="text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm font-medium">{stat.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {stat.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-fade-in motion-reduce:animate-none">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
              <div className="relative aspect-[4/5] sm:aspect-[16/11]">
                <Image
                  src={createPlaceholderSrc(
                    1200,
                    900,
                    "Nordic technology team in bright Scandinavian office",
                  )}
                  alt="TechPartner AB:s team arbetar tillsammans i ett ljust kontor"
                  fill
                  priority
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/25 to-transparent" />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Card className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Molnarkitektur
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-semibold">
                    Skalbara miljöer med bättre kontroll på kostnad och drift
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <CardHeader className="pb-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Säker leverans
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-base font-semibold">
                    Tydliga processer för kvalitet, spårbarhet och riskreducering
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Tjänster och erbjudanden</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Specialistkompetens där teknik, affär och säkerhet möts
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi går in där behoven är som störst och bygger upp ett arbetssätt
              som håller även när verksamheten växer. Målet är inte bara att
              lösa dagens problem, utan att skapa bättre förutsättningar för
              nästa beslut.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service, index) => {
              const Icon = serviceIcons[index];

              return (
                <Card
                  key={service.slug}
                  className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {service.title}
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {service.description}
                    </p>
                    <ul className="space-y-2">
                      {service.highlights.slice(0, 2).map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  900,
                  700,
                  "Scandinavian business meeting technology consultants and client",
                )}
                alt="Möte mellan TechPartner AB och kund i en ljus konferensmiljö"
                fill
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <Badge variant="outline" className="w-fit">
              Kort om oss
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              En teknikpartner som tar ansvar hela vägen
            </h2>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              TechPartner AB arbetar med företag som behöver komma framåt utan
              att kompromissa med kvalitet eller säkerhet. Vi kombinerar
              affärsförståelse, senior utvecklingskompetens och ett lugnt,
              tydligt arbetssätt som gör komplexa frågor enklare att hantera.
            </p>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              För många kunder fungerar vi som ett förlängt teknikledarskap,
              ibland som operativ leveranspartner och ibland som ett stöd i
              större förändringsresor. Det viktiga är att ni får rätt nivå av
              stöd och ett samarbete som håller över tid.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Senior kompetens från start",
                "Tydliga rekommendationer och prioriteringar",
                "Säkerhet och driftbarhet inbyggt i leveransen",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.25rem] border border-border bg-muted/70 p-4 text-sm font-medium"
                >
                  {item}
                </div>
              ))}
            </div>

            <Button
              asChild
              variant="outline"
              className="w-fit active:scale-95 transition-all duration-200"
            >
              <Link href="/om-oss">Läs mer om oss</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Socialt bevis</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Förtroende från team med höga krav på leverans
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Våra kunder anlitar oss när teknikval behöver bli tydliga, när
              utvecklingsarbetet behöver få bättre struktur eller när säkerhet
              måste bli en självklar del av vardagen. Samarbetet bygger på
              tydlighet, ansvar och ett tempo som går att lita på.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-4">
                    <Image
                      src={createPlaceholderSrc(64, 64, testimonial.imageQuery)}
                      alt={`Porträtt av ${testimonial.name}`}
                      width={64}
                      height={64}
                      className="rounded-full object-cover"
                    />
                    <div>
                      <h3 className="font-semibold">{testimonial.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1 text-primary" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {testimonial.quote}
                  </p>

                  <div className="rounded-xl bg-secondary px-4 py-3 text-sm font-medium">
                    Resultat: {testimonial.result}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground shadow-sm sm:px-10 lg:px-14 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  Redo att få mer kontroll över utveckling, moln och säkerhet?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-primary-foreground/85">
                  Vi börjar gärna med ett första samtal där vi går igenom nuläge,
                  prioriteringar och vilken typ av stöd som skapar mest värde för
                  er just nu. Efter mötet får ni en tydlig bild av möjliga nästa
                  steg.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="active:scale-95 transition-all duration-200"
                >
                  <Link href="/kontakt">Boka ett möte</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 active:scale-95 transition-all duration-200"
                >
                  <Link href="/priser">Se paket</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="kontakt" className="pb-16 sm:pb-24 lg:pb-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <Badge variant="outline">Kontakt</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Prata med oss om ert nästa tekniksteg
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Oavsett om ni står inför en ny satsning, ett migreringsprojekt
                eller ett behov av bättre styrning i befintliga system kan vi
                hjälpa er att komma vidare. Börja med att höra av er så tar vi
                det därifrån.
              </p>
            </div>

            <div className="grid gap-4">
              {contactItems.map((item) => (
                <Card key={item.title} className="border-border bg-card shadow-sm">
                  <CardContent className="flex gap-4 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <a
                        href={item.href}
                        target={item.href.startsWith("http") ? "_blank" : undefined}
                        rel={
                          item.href.startsWith("http") ? "noreferrer" : undefined
                        }
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.value}
                      </a>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {item.text}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="relative overflow-hidden rounded-[1.5rem]">
              <div className="relative aspect-[4/3]">
                <Image
                  src={createPlaceholderSrc(
                    1000,
                    700,
                    "Modern Scandinavian office building entrance professional business",
                  )}
                  alt="Entré till ett modernt kontor i skandinavisk stil"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <h3 className="text-xl font-semibold tracking-tight">
                Vårt arbetssätt är nära, tydligt och anpassat efter er vardag
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground">
                {siteConfig.locationNote}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] bg-muted p-4">
                  <p className="text-sm font-medium">Öppettider</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {siteConfig.hours}. För planerade workshops och större
                    genomgångar bokar vi tid efter era förutsättningar.
                  </p>
                </div>
                <div className="rounded-[1.25rem] bg-muted p-4">
                  <p className="text-sm font-medium">Första steg</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Ett inledande möte fokuserar på nuläge, mål och risker. Efter
                    det kan vi rekommendera lämpligt paket eller projektupplägg.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}