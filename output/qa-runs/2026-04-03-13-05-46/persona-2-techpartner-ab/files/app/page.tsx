import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  CloudCog,
  Code2,
  Mail,
  MapPin,
  Phone,
  Settings2,
  ShieldCheck,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { aboutStats, clientLogos, services, sharedKeywords, siteConfig, team, testimonials } from "@/lib/site-data";

const ogImage =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop&q=80";

export const metadata: Metadata = {
  title:
    "TechPartner AB — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "TechPartner AB hjälper företag i Stockholm med systemutveckling, molnlösningar och IT-säkerhet. Få en trygg teknikpartner med tydliga paket.",
  keywords: sharedKeywords,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title:
      "TechPartner AB — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
    description:
      "TechPartner AB hjälper företag i Stockholm med systemutveckling, molnlösningar och IT-säkerhet. Få en trygg teknikpartner med tydliga paket.",
    url: siteConfig.url,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
      },
    ],
    locale: "sv_SE",
    type: "website",
  },
};

const serviceIcons: Record<string, LucideIcon> = {
  code: Code2,
  cloud: CloudCog,
  shield: ShieldCheck,
  operations: Settings2,
};

const heroMetrics = [
  {
    title: "Affärskritiska projekt",
    value: "System som håller för verkligheten",
    icon: BarChart3,
  },
  {
    title: "Molnplattformar",
    value: "Azure, AWS och Google Cloud",
    icon: CloudCog,
  },
  {
    title: "Trygg leverans",
    value: "Säkerhet och uppföljning från start",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-background via-background to-muted/60">
        <div className="section-shell grid gap-14 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-32">
          <div className="space-y-8">
            <Badge className="rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-none">
              För CTO:er och IT-chefer i Stockholm
            </Badge>

            <div className="space-y-6">
              <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Moderna IT-lösningar för framtidens företag
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                TechPartner AB hjälper företag i Stockholm att bygga och vidareutveckla affärskritiska system, moderna molnplattformar och robusta säkerhetsrutiner.
                Vi kombinerar strategiskt tänkande med operativ leverans så att din organisation kan fatta beslut snabbare och leverera tryggare.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/kontakt">
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link href="/priser">Se priser och paket</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {heroMetrics.map((metric) => (
                <div
                  key={metric.title}
                  className="panel-surface p-4 transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="icon-chip mb-4">
                    <metric.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{metric.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="panel-surface overflow-hidden p-3">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=940&h=760&fit=crop&q=80"
                alt="Teknikkonsulter framför stora skärmar i ljus skandinavisk kontorsmiljö"
                width={940}
                height={760}
                priority
                className="h-full w-full rounded-[1.35rem] object-cover"
              />
            </div>

            <Card className="absolute -bottom-6 left-4 max-w-xs rounded-[1.75rem] border-border/70 bg-card/95 p-5 shadow-sm sm:left-8">
              <p className="text-sm font-semibold text-foreground">
                Strategiskt stöd när tempot behöver upp
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Vi går in där tekniken är viktig för affären och hjälper team att få kontroll över prioriteringar, kapacitet och risk.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section
        id="tjanster"
        className="scroll-mt-28 bg-background py-16 sm:py-24 lg:py-28"
      >
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Tjänster</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Tre kärnområden och ett långsiktigt stöd runt hela leveransen
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Vårt erbjudande är byggt för företag som behöver både specialistkompetens och tydlig riktning.
              Vi går in där det gör mest nytta, från nyutveckling till molnmodernisering och säkerhetsarbete.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {services.map((service) => {
              const Icon = serviceIcons[service.icon];

              return (
                <Card
                  key={service.title}
                  className="rounded-[1.75rem] border-border/70 bg-card/95 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="icon-chip">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight text-foreground">
                    {service.title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {service.description}
                  </p>
                  <ul className="mt-5 space-y-3">
                    {service.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-3 text-sm text-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=760&h=840&fit=crop&q=80"
              alt="Teknikteam i modernt konferensrum med ljusa material och skandinavisk design"
              width={760}
              height={840}
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <span className="section-label">Om oss</span>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Ett erfaret team som gillar tydlighet i komplexa miljöer
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Vi arbetar nära ledning och teknikteam för att skapa lösningar som är hållbara både tekniskt och organisatoriskt.
                För oss handlar ett bra partnerskap om raka rekommendationer, genomförbar planering och ett arbetssätt som gör vardagen enklare för kunden.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {aboutStats.map((stat) => (
                <div key={stat.label} className="panel-surface p-5">
                  <p className="font-display text-2xl font-semibold text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/om-oss">Läs mer om oss</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell space-y-12">
          <div className="max-w-3xl space-y-4">
            <span className="section-label">Socialt bevis</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Förtroende byggs i leveransen, inte i löften
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Våra kunder anlitar oss när teknikval påverkar affär, säkerhet och tempo i organisationen.
              Det betyder att samarbetet måste vara lika tryggt i styrrummet som i det dagliga utvecklingsarbetet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {clientLogos.map((logo) => (
              <div
                key={logo.name}
                className="panel-surface flex items-center justify-center p-6"
              >
                <Image
                  src={logo.image}
                  alt={logo.name}
                  width={180}
                  height={80}
                  className="h-10 w-auto opacity-80"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="rounded-[1.75rem] border-border/70 bg-card/95 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex gap-1">
                  {Array.from({ length: testimonial.rating }).map((_, index) => (
                    <Star
                      key={`${testimonial.name}-${index}`}
                      className="h-4 w-4 fill-primary text-primary"
                    />
                  ))}
                </div>
                <p className="mt-5 text-sm leading-7 text-foreground">
                  “{testimonial.quote}”
                </p>
                <div className="mt-5 border-t border-border/60 pt-5">
                  <h3 className="font-semibold text-foreground">{testimonial.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {testimonial.role}, {testimonial.company}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary text-primary-foreground">
            <div className="grid gap-8 px-6 py-10 sm:px-8 md:px-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-14 lg:py-14">
              <div className="space-y-4">
                <span className="inline-flex w-fit rounded-full border border-primary-foreground/20 px-3 py-1 text-sm text-primary-foreground/80">
                  Nästa steg
                </span>
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Behöver du en teknikpartner som kan ta ansvar från analys till genomförande?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Vi börjar gärna med ett första möte där vi går igenom nuläge, mål och risker.
                  Därefter får du ett konkret förslag på hur vi kan stötta ditt team, oavsett om behovet gäller utveckling, moln eller säkerhet.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row lg:flex-col lg:items-start">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/kontakt">Boka ett första möte</Link>
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

      <section
        id="kontakt"
        className="scroll-mt-28 bg-background py-16 sm:py-24 lg:py-28"
      >
        <div className="section-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-6">
            <span className="section-label">Kontakt</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Lätt att nå när du behöver ett snabbt och tydligt nästa steg
            </h2>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Du kan höra av dig till oss för en första avstämning, ett specifikt teknikproblem eller en mer långsiktig dialog om kapacitet och vägval.
              Vi arbetar med företag i Stockholm och genomför gärna möten både digitalt och på plats.
            </p>

            <div className="grid gap-4">
              <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-5">
                <div className="flex items-start gap-4">
                  <div className="icon-chip">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      Telefon
                    </h3>
                    <a
                      href={siteConfig.phoneHref}
                      className="mt-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {siteConfig.phone}
                    </a>
                  </div>
                </div>
              </Card>

              <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-5">
                <div className="flex items-start gap-4">
                  <div className="icon-chip">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      E-post
                    </h3>
                    <a
                      href={siteConfig.emailHref}
                      className="mt-2 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {siteConfig.email}
                    </a>
                  </div>
                </div>
              </Card>

              <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-5">
                <div className="flex items-start gap-4">
                  <div className="icon-chip">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      Besöksadress
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {siteConfig.address}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4 text-primary" />
                      <span>{siteConfig.officeHours}</span>
                    </div>
                  </div>
                </div>
              </Card>

              <Button asChild size="lg" className="w-full rounded-full sm:w-fit">
                <Link href="/kontakt">
                  Gå till kontaktsidan
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=860&h=620&fit=crop&q=80"
              alt="Karta och modernt kontorshus i svensk stadsmiljö"
              width={860}
              height={620}
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}