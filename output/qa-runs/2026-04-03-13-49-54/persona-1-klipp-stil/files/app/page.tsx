import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  MapPin,
  MessageCircleQuote,
  Phone,
  Scissors,
  Sparkles,
  Star,
  WandSparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapEmbed } from "@/components/map-embed";
import { PageHero } from "@/components/page-hero";
import { SectionHeading } from "@/components/section-heading";
import { ServiceCard } from "@/components/service-card";
import { businessInfo } from "@/lib/site";

const services = [
  {
    title: "Klippning",
    description:
      "Skräddarsydd form efter hårtyp, ansiktsform och vardag så att håret känns lätt att leva med även mellan besöken.",
    icon: Scissors,
  },
  {
    title: "Färgning",
    description:
      "Slingor, helfärg och nyansering med fokus på hållbar kvalitet, mjuka övergångar och ett resultat som känns naturligt.",
    icon: Sparkles,
  },
  {
    title: "Styling",
    description:
      "Fön, uppsättningar och finish inför vardag, möten och särskilda tillfällen när du vill känna dig extra välfixad.",
    icon: WandSparkles,
  },
  {
    title: "Skäggvård",
    description:
      "Trim, form och rådgivning för en fräsch helhet där detaljerna sitter och uttrycket känns genomarbetat.",
    icon: Star,
  },
] as const;

const customerReviews = [
  {
    quote:
      "Jag kände mig verkligen lyssnad på och blev supernöjd med både klipp och färg. Det märks att de tänker långsiktigt och inte bara på hur håret ska se ut samma dag.",
    name: "Sofia Andersson",
    role: "Återkommande kund",
    service: "Färg & klipp",
    rating: 5,
  },
  {
    quote:
      "Proffsigt, varmt bemötande och snyggt resultat som höll länge. Jag fick tydliga råd om hur jag skulle ta hand om färgen hemma och det gjorde stor skillnad.",
    name: "Lina Karlsson",
    role: "Kund från Vasastan",
    service: "Slingor",
    rating: 5,
  },
  {
    quote:
      "En trygg salong där man alltid får bra råd utan att det känns stressigt. Jag uppskattar särskilt att de är tydliga med tid, pris och vad som passar mitt hår bäst.",
    name: "Maria Ek",
    role: "Kund",
    service: "Klippning & styling",
    rating: 5,
  },
] as const;

const reviewHighlights = [
  "Lyhört bemötande från första konsultation",
  "Tydliga råd om färg, form och underhåll hemma",
  "Lugn salongskänsla mitt i Göteborg",
] as const;

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    "@id": "https://www.klippochstil.se/#business",
    name: "Klipp & Stil",
    image:
      "https://www.klippochstil.sehttps://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80",
    url: "https://www.klippochstil.se",
    telephone: businessInfo.phone,
    email: businessInfo.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: businessInfo.address,
      postalCode: businessInfo.postalCode,
      addressLocality: businessInfo.city,
      addressCountry: "SE",
    },
    sameAs: ["https://instagram.com/klippochstil", "https://facebook.com/klippochstilgoteborg"],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "10:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "10:00",
        closes: "14:00",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "86",
      bestRating: "5",
      worstRating: "1",
    },
  };

  return (
    <>
      <PageHero
        eyebrow="Frisörsalong i Göteborg"
        title="Klipp & Stil i Göteborg – din stund i stolen"
        description="Vi hjälper dig med klippning, färgning, styling och skäggvård i en lugn, varm miljö mitt i Göteborg. Här får du tid att landa, tydlig rådgivning och ett resultat som känns rätt både samma dag och veckorna efter."
        imageSrc="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Varm salongsinteriör i naturligt ljus med speglar och stolar"
        primaryAction={{ label: "Boka tid", href: "/boka" }}
        secondaryAction={{ label: "Se priser", href: "/priser" }}
        details={[
          { label: "Läge", value: "Storgatan 12 i centrala Göteborg" },
          { label: "Tider", value: "Mån–Fre 10–18, Lör 10–14" },
          { label: "Bokning", value: "Enkelt online med snabb bekräftelse" },
        ]}
        note="En salong med naturligt ljus, varm stämning och ett arbetssätt där du känner dig lyssnad på från första minuten."
        priority
      />

      <section id="tjanster" className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Tjänster"
              title="Tjänster som lyfter din stil"
              description="Hos oss börjar allt med att förstå vad du vill uppnå. Vi anpassar behandling, tidsåtgång och råd efter ditt hår, din vardag och hur mycket underhåll du vill lägga hemma."
            />
            <div className="paper-panel overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[5/4]">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=900&fit=crop&q=80"
                  alt="Frisör som klipper hår i varmt naturligt ljus"
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {services.map((service) => (
              <ServiceCard
                key={service.title}
                icon={service.icon}
                title={service.title}
                description={service.description}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="paper-panel-strong overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[5/4]">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=900&fit=crop&q=80"
                  alt="Porträtt av stylist i salongen"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="space-y-6">
              <SectionHeading
                eyebrow="Om oss"
                title="Personligt, noggrant och enkelt att boka"
                description="Hos Klipp & Stil möts du av ett lyhört team som tar sig tid att förstå vad du vill uppnå. Vi kombinerar hantverk med tydlig rådgivning så att resultatet håller även mellan besöken."
              />
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Vi tror på en lugn upplevelse där du vet vad som händer, vad det kostar och hur du tar hand om håret efteråt.
                Därför börjar vi alltid med konsultation och avslutar med konkreta tips som fungerar i verkligheten, inte bara
                när du sitter i stolen.
              </p>
              <ul className="grid gap-4 sm:grid-cols-2">
                <li className="rounded-[1.5rem] border bg-card/80 p-5">
                  <h3 className="text-xl font-semibold tracking-tight">Lyhörd konsultation</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Vi går igenom mål, hårkvalitet och tidsram innan vi börjar så att du känner dig trygg i varje steg.
                  </p>
                </li>
                <li className="rounded-[1.5rem] border bg-card/80 p-5">
                  <h3 className="text-xl font-semibold tracking-tight">Tydliga rekommendationer</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Du får råd om produkter och rutiner som faktiskt fungerar hemma, utan att det känns påträngande.
                  </p>
                </li>
              </ul>
              <Button asChild variant="outline" size="lg" className="rounded-full">
                <Link href="/om-oss">
                  Läs mer om oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Kundrecensioner"
              title="Det kunderna uppskattar mest är lugnet, tydligheten och resultatet"
              description="För många är ett salongsbesök mer än bara hår. Det handlar om att känna sig trygg, förstådd och väl omhändertagen. Därför betyder kundernas ord mycket för oss."
            />

            <div className="paper-panel-strong p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <MessageCircleQuote className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Genomsnittligt betyg</p>
                  <p className="text-3xl font-semibold tracking-tight">4,9 av 5</p>
                </div>
              </div>

              <p className="mt-5 text-base leading-7 text-muted-foreground">
                Våra kunder lyfter ofta fram att besöket känns personligt, avslappnat och genomtänkt. Vi vill att varje bokning
                ska börja med tydlig rådgivning och sluta med ett resultat som faktiskt fungerar hemma också.
              </p>

              <ul className="mt-6 space-y-3">
                {reviewHighlights.map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-[1.25rem] bg-secondary/60 p-4">
                    <Star className="mt-1 h-4 w-4 shrink-0 fill-current text-accent" />
                    <span className="text-sm leading-6">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6">
            {customerReviews.map((review) => (
              <article key={review.name} className="paper-panel h-full p-6 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="secondary" className="rounded-full">
                    {review.service}
                  </Badge>
                  <div className="flex gap-1 text-accent" aria-label={`Betyg ${review.rating} av 5`}>
                    {Array.from({ length: review.rating }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="mt-5 text-lg leading-8 text-foreground">“{review.quote}”</p>
                <div className="mt-6 border-t border-border/70 pt-4">
                  <h3 className="text-lg font-semibold">{review.name}</h3>
                  <p className="text-sm text-muted-foreground">{review.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell py-8 sm:py-12">
        <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full bg-primary-foreground/12 text-primary-foreground">Boka online</Badge>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Redo för en ny look? Vi har tider i veckan.
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                Välj tjänst och tid direkt online. Du får bekräftelse direkt och kan lämna önskemål i samband med bokningen, så
                att vi kan förbereda rätt upplägg när du kommer.
              </p>
            </div>
            <div className="rounded-[1.75rem] bg-primary-foreground/10 p-6">
              <p className="text-sm uppercase tracking-[0.18em] text-primary-foreground/70">Behöver du hjälp?</p>
              <p className="mt-3 text-base leading-7 text-primary-foreground/85">
                Osäker på vad du ska välja? Kontakta oss så hjälper vi dig hitta rätt behandling och tidslängd innan du bokar.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/boka">Boka tid</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Link href="/kontakt">Kontakta oss</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Hitta till oss"
              title="Mitt i Göteborg, nära till både vardag och helg"
              description="Du hittar oss på Storgatan 12 i Göteborg. Här är det enkelt att svänga förbi efter jobbet, inför helgen eller när du vill unna dig en stund som bara handlar om dig."
            />
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border bg-card/80 p-5">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Besöksadress</h3>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">
                      {businessInfo.address}, {businessInfo.postalCode} {businessInfo.city}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.5rem] border bg-card/80 p-5">
                <div className="flex items-start gap-3">
                  <Phone className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Telefon & e-post</h3>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">
                      {businessInfo.phone} • {businessInfo.email}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[1.5rem] border bg-card/80 p-5">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Öppettider</h3>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">Mån–Fre 10–18, Lör 10–14</p>
                  </div>
                </div>
              </div>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/kontakt">Kontakta oss</Link>
            </Button>
          </div>

          <MapEmbed title="Karta till Klipp & Stil i Göteborg" />
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </>
  );
}