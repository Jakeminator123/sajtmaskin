import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Clock,
  Mail,
  MapPin,
  Palette,
  Phone,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";

import { CtaBanner } from "@/components/cta-banner";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openingHours, services, siteInfo, testimonials } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Klipp & Stil — Vi driver en frisörsalong som heter Klipp & Stil i Göteborg",
  description:
    "Klipp & Stil i Göteborg erbjuder personlig klippning, färgning, styling och skäggvård. Boka tid online för ett lugnt salongsbesök mitt i stan.",
  keywords: [
    "Klipp & Stil",
    "frisör Göteborg",
    "klippning Göteborg",
    "färgning Göteborg",
    "styling Göteborg",
    "skäggvård Göteborg",
    "boka frisör online",
  ],
  openGraph: {
    title: "Klipp & Stil — Vi driver en frisörsalong som heter Klipp & Stil i Göteborg",
    description:
      "Klipp & Stil i Göteborg erbjuder personlig klippning, färgning, styling och skäggvård. Boka tid online för ett lugnt salongsbesök mitt i stan.",
    locale: "sv_SE",
    type: "website",
  },
};

const serviceIcons = [Scissors, Palette, Sparkles, ShieldCheck];

const customerReviews = [
  {
    name: "Anna Sjöberg",
    role: "Ekonom, Vasastan",
    review:
      "Jag bokade färgning och klippning inför en stor konferens och blev otroligt nöjd. Färgen känns levande men naturlig, och formen håller sig snygg även när jag inte hinner styla mycket på morgonen.",
    rating: 5,
  },
  {
    name: "Lina Persson",
    role: "Lärare, Majorna",
    review:
      "Det jag uppskattar mest är att de verkligen lyssnar innan de börjar. Jag fick en frisyr som passar mitt hår och min vardag, och hela besöket kändes lugnt och personligt från start till mål.",
    rating: 5,
  },
  {
    name: "Erik Lund",
    role: "Konsult, Johanneberg",
    review:
      "Skäggtrimning och klippning i samma besök fungerar perfekt för mig. Resultatet blir alltid noggrant utan att se för tillgjort ut, och det märks att teamet har hög yrkesstolthet i sitt arbete.",
    rating: 5,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="overflow-hidden bg-gradient-to-b from-background via-background to-muted/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
          <div className="animate-fade-in flex flex-col justify-center gap-6">
            <Badge
              variant="secondary"
              className="w-fit rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary"
            >
              Personlig frisörsalong i Göteborg
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Din frisör för klippning, färgning och styling som känns som du
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Hos Klipp & Stil får du mer än en snabb behandling. Vi lyssnar,
                vägleder och skapar en frisyr som fungerar i vardagen, vid fest
                och i det göteborgska vädret. Oavsett om du vill fräscha upp
                längderna, gå ljusare eller boka en välvårdad skäggtrimning möts
                du av ett lugnt tempo och personlig service.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                <Link href="/boka">Boka tid</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                <Link href="/priser">Se priser</Link>
              </Button>
            </div>

            <dl className="grid gap-4 pt-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
                <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Star className="h-4 w-4 text-primary" />
                  Omdömen
                </dt>
                <dd className="mt-2 text-xl font-semibold">{siteInfo.rating}</dd>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
                <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Snabb respons
                </dt>
                <dd className="mt-2 text-xl font-semibold">Inom 2 timmar</dd>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
                <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  Läge
                </dt>
                <dd className="mt-2 text-xl font-semibold">Centrala Göteborg</dd>
              </div>
            </dl>
          </div>

          <div className="animate-fade-in relative">
            <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
              <Image
                src="https://images.unsplash.com/photo-1669014051824-5f669bf124f1?w=900&h=960&fit=crop&q=80"
                alt="Varm frisörsalong i Göteborg med speglar, trädetaljer och mjukt ljus"
                width={900}
                height={960}
                priority
                className="h-full w-full object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>

            <Card className="mt-4 border-border bg-card shadow-lg sm:absolute sm:-bottom-6 sm:left-6 sm:mt-0 sm:max-w-sm">
              <CardContent className="space-y-4 p-6">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                    Bokning online
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    Välj behandling och skicka din förfrågan direkt.
                  </p>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{siteInfo.bookingResponse}</p>
                  <p>
                    {openingHours[0].label}: {openingHours[0].value}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="tjanster" className="scroll-mt-28 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Tjänster"
            title="Fyra behandlingar vi är extra uppskattade för"
            description="Vi arbetar med ett litet och tydligt utbud där kvalitet, rådgivning och känsla får ta plats. Varje behandling anpassas efter hur du bär ditt hår i vardagen och hur mycket underhåll du vill ha mellan besöken."
            align="center"
          />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service, index) => {
              const Icon = serviceIcons[index];

              return (
                <Card
                  key={service.id}
                  className="rounded-[2rem] border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardContent className="space-y-5 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-2xl font-semibold tracking-tight">
                          {service.name}
                        </h3>
                        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                          {service.price}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {service.summary}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {service.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
            <Image
              src="https://images.unsplash.com/photo-1586281289627-112da4546f9b?w=900&h=800&fit=crop&q=80"
              alt="Frisör som konsulterar kund i en ljus och personlig salong"
              width={900}
              height={800}
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 45vw, 100vw"
            />
          </div>

          <div className="flex flex-col justify-center gap-6">
            <SectionHeading
              eyebrow="Om oss"
              title="En salong där du får tid att landa och bli väl omhändertagen"
              description="Klipp & Stil startades med en enkel idé: varje kund ska känna sig lyssnad på och lämna salongen med ett resultat som håller längre än samma kväll. Vi arbetar i lugnt tempo, gör tydliga konsultationer och anpassar både klippning och färg efter hårkvalitet, vardag och stil."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="rounded-[1.75rem] border-border bg-card shadow-sm">
                <CardContent className="p-5">
                  <h3 className="text-xl font-semibold">Personligt möte</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Vi vill att du ska känna dig trygg med varje beslut, från
                    nyansval till längd och eftervård.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-[1.75rem] border-border bg-card shadow-sm">
                <CardContent className="p-5">
                  <h3 className="text-xl font-semibold">Resultat som håller</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Våra tekniker är valda för att håret ska se snyggt ut även
                    när dagarna går mellan besöken.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                <Link href="/om-oss">Läs mer om oss</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kundrecensioner"
            title="Vad våra kunder säger efter sitt besök"
            description="Många av våra nya bokningar kommer från rekommendationer. Här är några färska recensioner från kunder i Göteborg som valt Klipp & Stil för klippning, färgning och skäggvård."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {customerReviews.map((review) => (
              <Card
                key={review.name}
                className="rounded-[2rem] border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">{review.name}</h3>
                      <p className="text-sm text-muted-foreground">{review.role}</p>
                    </div>
                    <div className="flex items-center gap-1" aria-label={`${review.rating} av 5 i betyg`}>
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={`${review.name}-star-${index}`} className="h-4 w-4 fill-primary text-primary" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">“{review.review}”</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kundcitat"
            title="Det kunderna uppskattar mest är känslan av att bli förstådda"
            description="Vi får ofta höra att besöket känns lugnt, att rådgivningen är tydlig och att resultatet håller längre än väntat. Här är några ord från kunder som återkommer till oss i Göteborg."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="rounded-[2rem] border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-4">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.alt}
                      width={64}
                      height={64}
                      className="rounded-full border border-border object-cover"
                    />
                    <div>
                      <h3 className="text-xl font-semibold">{testimonial.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                  <p className="text-base leading-relaxed text-muted-foreground">
                    “{testimonial.quote}”
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Bokning"
        title="Redo för en ny frisyr eller en färg som känns helt rätt?"
        description="Skicka din bokningsförfrågan online så återkommer vi snabbt med en bekräftelse. Om du är osäker på behandling hjälper vi dig att välja rätt innan ditt besök."
        primaryHref="/boka"
        primaryLabel="Boka tid"
        secondaryHref="/priser"
        secondaryLabel="Se priser"
      />

      <section id="kontakt" className="scroll-mt-28 bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kontakt"
            title="Hitta till salongen eller hör av dig direkt"
            description="Vi finns på Storgatan 12 i centrala Göteborg, nära både spårvagn och citypuls. Ring, mejla eller boka online så hjälper vi dig vidare till rätt behandling och rätt tid."
          />

          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="rounded-[1.75rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-6">
                  <Phone className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-semibold">Telefon</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Ring om du vill boka snabbt eller få hjälp att välja
                    behandling inför ditt besök.
                  </p>
                  <a
                    href={`tel:${siteInfo.phone.replace(/\s/g, "")}`}
                    className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteInfo.phone}
                  </a>
                </CardContent>
              </Card>

              <Card className="rounded-[1.75rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-6">
                  <Mail className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-semibold">E-post</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Perfekt om du vill beskriva önskemål, skicka frågor eller få
                    rådgivning inför en större förändring.
                  </p>
                  <a
                    href={`mailto:${siteInfo.email}`}
                    className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteInfo.email}
                  </a>
                </CardContent>
              </Card>

              <Card className="rounded-[1.75rem] border-border bg-card shadow-sm sm:col-span-2">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold">Besök oss</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {siteInfo.address}. Salongen ligger centralt och är enkel att
                    nå från både Avenyn, Haga och Linné med kollektivtrafik eller
                    en kort promenad.
                  </p>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    {openingHours.map((item) => (
                      <div key={item.label} className="flex justify-between gap-4">
                        <span>{item.label}</span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
              <Image
                src="https://images.unsplash.com/photo-1669014051824-5f669bf124f1?w=1000&h=800&fit=crop&q=80"
                alt="Fasad till frisörsalongen på stadsgata i Göteborg med varm belysning"
                width={1000}
                height={800}
                className="h-full w-full object-cover"
                sizes="(min-width: 1024px) 55vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}