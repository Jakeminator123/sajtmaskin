import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Droplets,
  Mail,
  MapPin,
  Phone,
  Scissors,
  Sparkles,
  Star,
} from "lucide-react";

import { MapEmbed } from "@/components/map-embed";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata, googleMapsUrl, siteConfig } from "@/lib/site";
import type { ComponentType } from "react";

export const metadata: Metadata = createPageMetadata({
  path: "/",
});

type Service = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

type Review = {
  title: string;
  quote: string;
  name: string;
  visit: string;
  date: string;
};

const services: Service[] = [
  {
    title: "Klippning",
    description:
      "Dam-, herr- och barnklippning med konsultation, form och stylingtips. Vi lägger tid på detaljerna så att frisyren fungerar både direkt och efter några veckor.",
    icon: Scissors,
  },
  {
    title: "Färgning",
    description:
      "Slingor, helfärg och toning med fokus på glans, hållbarhet och rätt nyans. Vi utgår alltid från ditt hårs kvalitet och vad som känns rimligt att underhålla.",
    icon: Droplets,
  },
  {
    title: "Styling",
    description:
      "Föning, uppsättningar och finish inför vardag, arbete eller fest. Resultatet ska kännas genomarbetat utan att tappa din personliga stil.",
    icon: Sparkles,
  },
  {
    title: "Skäggvård",
    description:
      "Trim, form och råd för en välvårdad look med rena konturer. Vi hjälper dig hitta en finish som känns skarp men fortfarande naturlig.",
    icon: BadgeCheck,
  },
];

const testimonials: Testimonial[] = [
  {
    quote:
      "Jag kände mig verkligen lyssnad på och resultatet blev exakt som jag tänkt. Kommer tillbaka!",
    name: "Sara Lundgren",
    role: "Projektledare",
  },
  {
    quote:
      "Bästa färgen jag gjort. Glansigt, naturligt och snyggt även veckorna efter.",
    name: "Lina Ek",
    role: "Marknadsförare",
  },
  {
    quote:
      "Snabbt, proffsigt och trevligt. Skäggtrimmen blev riktigt skarp.",
    name: "Johan Berg",
    role: "Egenföretagare",
  },
];

const reviews: Review[] = [
  {
    title: "En salong som verkligen lyssnar",
    quote:
      "Jag kom in med en ganska vag idé om hur jag ville ha håret, men blev guidad på ett tryggt och tydligt sätt. Resultatet blev mjukt, lätt att styla hemma och precis lagom uppfräschat utan att kännas för mycket. Det märks att de tänker långsiktigt och inte bara på hur det ser ut samma dag.",
    name: "Maria Sjöberg",
    visit: "Klippning och nyansering",
    date: "12 februari 2025",
  },
  {
    title: "Färg med glans och naturlig känsla",
    quote:
      "Jag har testat flera salonger i Göteborg men här fick jag för första gången en färg som både kändes exklusiv och ändå väldigt jag. Jag uppskattade särskilt konsultationen innan, där vi pratade igenom underhåll, ton och vad som faktiskt passade min vardag. Det gav ett lugn genom hela besöket.",
    name: "Elin Gustavsson",
    visit: "Slingor och styling",
    date: "28 januari 2025",
  },
  {
    title: "Välkomnande och genomarbetat från start till slut",
    quote:
      "Det är ovanligt att hitta en salong där både bemötande och detaljer sitter så bra. Jag bokade klippning och skäggtrim och fick ett resultat som kändes skarpt men inte stelt. Dessutom fick jag enkla råd om hur jag håller formen snygg mellan besöken, vilket gjorde hela upplevelsen ännu bättre.",
    name: "Henrik Dahl",
    visit: "Herrklippning och skäggvård",
    date: "6 mars 2025",
  },
];

export default function HomePage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_0.96fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Frisörsalong i Göteborg
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Klipp & Stil i Göteborg – din stund i stolen
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Hos Klipp & Stil får du klippning, färg, styling och skäggvård med omtanke, teknik och ett öga för helheten.
                Vi arbetar lugnt och personligt så att du lämnar salongen med en frisyr som känns både snygg och enkel att bära i vardagen.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full px-7 transition-all duration-200 active:scale-95">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full px-7 transition-all duration-200 active:scale-95"
              >
                <Link href="/priser">Se priser</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="rounded-[1.75rem] border-border/70 bg-card/80 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">4,9/5</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Lokala kundomdömen från återkommande besökare.</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.75rem] border-border/70 bg-card/80 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">Lugn rytm</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Konsultation först, tempo utan stress och tid för frågor.</p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.75rem] border-border/70 bg-card/80 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-3xl font-semibold">Göteborg</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Mitt i stan med enkel bokning och smidigt läge.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="relative">
            <div className="section-shell warm-panel overflow-hidden p-3">
              <div className="relative overflow-hidden rounded-[1.7rem]">
                <Image
                  src="https://images.unsplash.com/photo-1722935408489-2bf93349c8cb?w=1100&h=900&fit=crop&q=80"
                  alt="Frisör som stylar hår i ljus salongsmiljö med varm ton"
                  width={1100}
                  height={900}
                  priority
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>

            <div className="soft-shadow absolute -bottom-6 left-4 hidden max-w-xs rounded-[1.6rem] border border-border/70 bg-background/92 p-5 md:block">
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Din stund i stolen</p>
              <p className="mt-2 text-lg font-semibold">Personlig rådgivning och resultat som håller i vardagen.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="tjanster" className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Våra tjänster"
            title="Behandlingar med känsla för både stil och vardag"
            description="Vi arbetar med ett tydligt upplägg där konsultation, utförande och finish hänger ihop. Oavsett om du vill ha en liten uppfräschning eller en större förändring ska du känna dig trygg i varje steg."
          />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => {
              const Icon = service.icon;

              return (
                <Card
                  key={service.title}
                  className="rounded-[1.9rem] border-border/70 bg-card/85 transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg"
                >
                  <CardContent className="space-y-5 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/25 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold">{service.title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">{service.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1760862652442-e8ff7ebdd2f8?w=900&h=800&fit=crop&q=80"
                alt="Närbild på händer som arbetar med hår och salongsprodukter i varm miljö"
                width={900}
                height={800}
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading
              eyebrow="Om oss"
              title="Personligt, proffsigt och utan stress"
              description="Hos Klipp & Stil möts du av ett lugnt tempo, lyhörd rådgivning och ett resultat som håller över tid. Vi hjälper dig hitta en stil som passar din vardag, ditt hår och dina önskemål, utan att det känns krångligt eller tillgjort."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="muted-shell p-5">
                <h3 className="text-lg font-semibold">Konsultation först</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Vi börjar alltid med att förstå vad du vill uppnå, hur mycket tid du vill lägga hemma och vad som fungerar med ditt hår.
                </p>
              </div>
              <div className="muted-shell p-5">
                <h3 className="text-lg font-semibold">Hårhälsa i fokus</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Vi väljer teknik, produkter och råd som ger glans, hållbarhet och en känsla som håller längre än bara samma dag.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="lg" className="rounded-full transition-all duration-200 active:scale-95">
              <Link href="/om-oss">Läs mer om oss</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Det kunderna säger"
            title="Förtroende byggs i stolen, men också i resultatet efteråt"
            description="Många som kommer till oss vill känna sig lyssnade på, inte bara omstylade. Därför är återkopplingen vi får ofta lika mycket ett kvitto på bemötandet som på själva hantverket."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name} className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-1 text-secondary-foreground">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={`${testimonial.name}-${index}`} className="h-4 w-4 fill-current text-secondary-foreground" />
                    ))}
                  </div>
                  <p className="text-lg leading-8">“{testimonial.quote}”</p>
                  <div>
                    <h3 className="text-base font-semibold">{testimonial.name}</h3>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kundrecensioner"
            title="Utförliga omdömen från kunder som bokat återkommande hos oss"
            description="För många av våra kunder handlar ett bra frisörbesök om mer än själva resultatet. Det handlar också om att känna sig trygg, förstådd och väl omhändertagen från första konsultation till färdig styling."
          />

          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
              <CardContent className="space-y-6 p-6">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Samlat betyg</p>
                  <p className="mt-3 text-5xl font-semibold">4,9</p>
                </div>

                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={`summary-star-${index}`} className="h-5 w-5 fill-current text-secondary-foreground" />
                  ))}
                </div>

                <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                  <p>
                    Våra kunder lyfter ofta fram den lugna känslan i salongen, den tydliga konsultationen och att resultatet håller sig snyggt även efter några veckor.
                  </p>
                  <p>
                    Vi ser varje recension som ett kvitto på att helheten fungerar: bemötandet, hantverket och den personliga vägledningen genom hela besöket.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="muted-shell p-4">
                    <p className="text-2xl font-semibold">230+</p>
                    <p className="mt-1 text-sm text-muted-foreground">Bokningar från återkommande kunder senaste året.</p>
                  </div>
                  <div className="muted-shell p-4">
                    <p className="text-2xl font-semibold">96 %</p>
                    <p className="mt-1 text-sm text-muted-foreground">Säger att de gärna rekommenderar oss vidare.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6">
              {reviews.map((review) => (
                <Card
                  key={review.name}
                  className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg"
                >
                  <CardContent className="space-y-5 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{review.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {review.name} · {review.visit}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={`${review.name}-${index}`} className="h-4 w-4 fill-current text-secondary-foreground" />
                        ))}
                      </div>
                    </div>

                    <p className="text-base leading-8 text-muted-foreground">“{review.quote}”</p>

                    <div className="flex flex-col gap-3 border-t border-border/70 pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>Publicerad {review.date}</span>
                      <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
                        Verifierat besök
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-accent px-6 py-10 text-accent-foreground sm:px-10 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-background/15 px-4 py-1 text-accent-foreground hover:bg-background/15">
                  Redo för en ny look?
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Boka din tid online på under en minut
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-accent-foreground/85">
                  Välj tjänst, datum och tid som passar dig. När du skickat in din förfrågan återkommer vi snabbt med bekräftelse och ser till att rätt tid avsätts för just ditt besök.
                </p>
              </div>

              <div className="section-shell bg-background/92 p-6 text-foreground">
                <h3 className="text-2xl font-semibold">Smidig bokning, tydligt upplägg</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Oavsett om du bokar klippning, färg eller skäggvård får du en tydlig konsultation på plats. Är du osäker på vilken tjänst du ska välja hjälper vi dig att hitta rätt.
                </p>
                <Button asChild size="lg" className="mt-6 rounded-full transition-all duration-200 active:scale-95">
                  <Link href="/boka">Boka tid</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-0 pt-16 sm:pt-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Hitta hit och kontakta oss"
            title="Välkommen till salongen mitt i Göteborg"
            description="Det ska vara enkelt att få kontakt med oss, hitta rätt adress och känna att du vet vad som gäller innan ditt besök. Hör av dig om du vill få hjälp att välja tjänst eller boka direkt online när du är redo."
          />

          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-6">
              <Card className="rounded-[1.9rem] border-border/70 bg-card/90">
                <CardContent className="space-y-5 p-6">
                  <h3 className="text-2xl font-semibold">Kontaktuppgifter</h3>
                  <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                    <p className="flex items-start gap-3">
                      <MapPin className="mt-1 h-4 w-4 text-accent" />
                      <span>
                        {siteConfig.address.street}, {siteConfig.address.postalCode} {siteConfig.address.city}
                      </span>
                    </p>
                    <p className="flex items-start gap-3">
                      <Phone className="mt-1 h-4 w-4 text-accent" />
                      <a href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`} className="transition-colors hover:text-foreground">
                        {siteConfig.phone}
                      </a>
                    </p>
                    <p className="flex items-start gap-3">
                      <Mail className="mt-1 h-4 w-4 text-accent" />
                      <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-foreground">
                        {siteConfig.email}
                      </a>
                    </p>
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-1 h-4 w-4 text-accent" />
                      <div>
                        <p>Mån–Fre 10–18</p>
                        <p>Lör 10–14</p>
                      </div>
                    </div>
                  </div>

                  <Button asChild variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                    <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                      Öppna i Google Maps
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <div className="section-shell warm-panel overflow-hidden p-3">
                <div className="relative overflow-hidden rounded-[1.7rem]">
                  <Image
                    src="https://images.unsplash.com/photo-1562803742-5f2df25492bf?w=900&h=700&fit=crop&q=80"
                    alt="Diskret entré till frisörsalong i Göteborg med varm och inbjudande känsla"
                    width={900}
                    height={700}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            </div>

            <MapEmbed title="Karta till Klipp & Stil på Storgatan 12 i Göteborg" />
          </div>
        </div>
      </section>
    </main>
  );
}