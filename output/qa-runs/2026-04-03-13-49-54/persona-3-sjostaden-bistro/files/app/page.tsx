import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

import {
  ArrowRight,
  Clock3,
  MapPin,
  PhoneCall,
  Sparkles,
  Star,
  UtensilsCrossed,
  Wine,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import SectionHeading from "@/components/section-heading";
import {
  createMetadata,
  openingHours,
  popularDishes,
  siteConfig,
  socialLinks,
  testimonials,
} from "@/lib/site-data";

export const metadata: Metadata = createMetadata({
  title: "Modern skandinavisk mat i Malmö",
  description:
    "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Boka bord online eller kontakta oss för catering och event.",
  path: "/",
});

const restaurantSchema = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  telephone: siteConfig.phone,
  email: siteConfig.email,
  acceptsReservations: true,
  servesCuisine: ["Skandinavisk mat", "Nordisk bistro"],
  priceRange: "$",
  image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=600&fit=crop&q=80",
  menu: `${siteConfig.url}/meny`,
  sameAs: socialLinks.map((link) => link.href),
  address: {
    "@type": "PostalAddress",
    streetAddress: siteConfig.addressLine,
    postalCode: "411 38",
    addressLocality: "Göteborg",
    addressCountry: "SE",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "11:00",
      closes: "22:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday", "Sunday"],
      opens: "12:00",
      closes: "23:00",
    },
  ],
};

const heroHighlights = [
  {
    title: "Lunch med tempo",
    description: "För dig som vill äta väl mitt i veckan utan att ge avkall på känslan.",
    icon: Clock3,
  },
  {
    title: "Vinpaket & alkoholfritt",
    description: "Vi matchar drycker efter smak, rätt och tillfälle med säker hand.",
    icon: Wine,
  },
  {
    title: "Catering för event",
    description: "Upplägg som fungerar lika bra för styrelsemiddag som privat firande.",
    icon: Sparkles,
  },
];

const weeklyLunch = [
  {
    day: "Måndag",
    dish: "Smörbakad torsk",
    description: "Serveras med dillstuvad potatis, picklad gurka och citronolja.",
  },
  {
    day: "Tisdag",
    dish: "Kalvfärsbiff",
    description: "Med rostad lök, gräddsky, pressgurka och potatispuré.",
  },
  {
    day: "Onsdag",
    dish: "Rostad blomkål",
    description: "Med svampbuljong, grönkål, lagrad ost och brynt smör.",
  },
  {
    day: "Torsdag",
    dish: "Kyckling från Skåne",
    description: "Med rotselleri, dragonvelouté och örtrostade morötter.",
  },
  {
    day: "Fredag",
    dish: "Långbakad högrev",
    description: "Med rödvinssky, potatispuré och säsongens gröna tillbehör.",
  },
];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantSchema) }}
      />
      <div className="overflow-x-hidden">
        <section className="border-b border-border/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:py-24">
            <div className="space-y-8">
              <Badge className="rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.24em] text-primary hover:bg-primary/10">
                Malmö • lunch • à la carte • catering
              </Badge>

              <div className="space-y-5">
                <h1 className="text-shadow-soft max-w-3xl text-5xl tracking-tight sm:text-6xl lg:text-7xl">
                  Modern skandinavisk mat i hjärtat av Malmö
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Lokala råvaror, säsongsmeny och en varm bistrokänsla – perfekt för lunch, middag
                  eller ett glas i baren. Hos oss möts mörk elegans, tydliga smaker och ett
                  genomtänkt värdskap.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
                  <Link href="/boka">
                    Boka tid
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary/20 bg-card/60 px-7 active:scale-95"
                >
                  <Link href="/meny">Se menyn</Link>
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {heroHighlights.map((item) => (
                  <div key={item.title} className="surface-panel brass-line p-5 pt-8">
                    <item.icon className="mb-4 h-5 w-5 text-primary" />
                    <h2 className="text-xl tracking-tight">{item.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-6 top-10 hidden h-32 w-32 rounded-full bg-primary/10 blur-3xl lg:block" />
              <div className="surface-panel gold-glow overflow-hidden p-3 sm:p-4">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
                  <Image
                    src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=900&fit=crop&q=80"
                    alt="Dukat bord med levande ljus, mörka träslag och en signaturrätt i fokus"
                    fill
                    priority
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-transparent" />
                </div>
              </div>

              <div className="surface-panel absolute -bottom-6 left-4 right-4 p-5 sm:left-8 sm:right-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-primary/80">Gästomdömen</p>
                    <p className="mt-2 text-lg tracking-tight">4,9 av 5 i upplevd helhet</p>
                  </div>
                  <div className="flex gap-1 text-primary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Omtyckt för varm service, rena smaker och ett lugn som gör att man gärna sitter
                  kvar lite längre.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-tint bg-muted/35 py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Populära rätter just nu"
              title="Fyra favoriter som sätter tonen för kvällen"
              description="Menyn rör sig med säsongen, men några rätter återkommer i gästernas samtal. Fråga oss gärna om vinpaket och alkoholfritt – vi matchar efter smak."
              align="center"
            />

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {popularDishes.map((dish) => (
                <article
                  key={dish.name}
                  className="surface-panel group overflow-hidden transition-all duration-300 motion-safe:hover:-translate-y-1"
                >
                  <div className="relative h-56 overflow-hidden">
                    <Image
                      src={dish.image}
                      alt={dish.alt}
                      fill
                      className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
                    <Badge className="absolute left-4 top-4 rounded-full bg-background/80 text-foreground">
                      {dish.price}
                    </Badge>
                  </div>
                  <div className="space-y-3 p-6">
                    <h3 className="text-2xl tracking-tight">{dish.name}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{dish.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-start lg:px-8">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Veckans lunch"
                title="Vardagslunch som känns genomtänkt även när tiden är knapp"
                description="Varje vardag serverar vi en lunch som bygger på samma råvarutänk som kvällsmenyn. Du får ett snabbt upplägg, men smaken och känslan är fortfarande Sjöstaden Bistro."
              />

              <div className="surface-panel overflow-hidden p-3">
                <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-primary/15">
                  <Image
                    src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=700&fit=crop&q=80"
                    alt="Nordisk lunchtallrik med fisk, rotfrukter och varm bistrobelysning"
                    fill
                    className="object-cover"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="surface-panel p-5">
                  <p className="text-sm uppercase tracking-[0.24em] text-primary/80">Serveras</p>
                  <h3 className="mt-2 text-2xl tracking-tight">Mån–Fre 11:00–14:00</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Perfekt för affärslunch, ett snabbt möte eller en välgjord paus mitt i veckan.
                  </p>
                </div>
                <div className="surface-panel p-5">
                  <p className="text-sm uppercase tracking-[0.24em] text-primary/80">Pris</p>
                  <h3 className="mt-2 text-2xl tracking-tight">165 kr</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Sallad, nybakat bröd och kaffe ingår alltid i veckans lunch.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {weeklyLunch.map((item) => (
                <article
                  key={item.day}
                  className="surface-panel p-5 transition-all duration-300 motion-safe:hover:-translate-y-1"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-primary/80">{item.day}</p>
                      <h3 className="mt-2 text-2xl tracking-tight">{item.dish}</h3>
                    </div>
                    <Badge className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary hover:bg-primary/10">
                      165 kr
                    </Badge>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </article>
              ))}

              <div className="flex flex-col gap-4 pt-2 sm:flex-row">
                <Button asChild size="lg" className="rounded-full active:scale-95">
                  <Link href="/boka">Boka lunchbord</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary/20 bg-card/60 active:scale-95"
                >
                  <Link href="/meny">Se hela menyn</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8">
            <div className="surface-panel overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=900&fit=crop&q=80"
                  alt="Kockhänder som lägger upp tallrik med ånga och värme i mörkt köksrum"
                  fill
                  className="object-cover"
                />
              </div>
            </div>

            <div className="space-y-6">
              <SectionHeading
                eyebrow="Om Sjöstaden Bistro"
                title="En modern bistro där skandinaviska smaker möter lokala råvaror"
                description="Sjöstaden Bistro är en modern bistro där skandinaviska smaker möter lokala råvaror. Vi lagar med respekt för säsongen och låter enkelhet och hantverk stå i centrum. Välkommen in för lunch, à la carte eller catering till ditt nästa tillfälle."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="surface-panel p-5">
                  <UtensilsCrossed className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-xl tracking-tight">Tillagat med precision</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Från fonder till inläggningar arbetar vi metodiskt och nära råvaran för att
                    skapa rena, tydliga smaker.
                  </p>
                </div>
                <div className="surface-panel p-5">
                  <Wine className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-xl tracking-tight">Stämning hela kvällen</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Mörka träslag, levande ljus och noggrant valda dryckesmatchningar gör helheten
                    personlig och varm.
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-full border-primary/20 bg-card/60"
              >
                <Link href="/om-oss">Läs mer om oss</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-muted/35 py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Det gästerna säger"
              title="Kvällar som stannar kvar längre än sista serveringen"
              description="Våra gäster återkommer för känslan lika mycket som för maten. Här är några röster från middagar, affärsmöten och cateringuppdrag."
              align="center"
            />

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {testimonials.map((testimonial) => (
                <article key={testimonial.name} className="surface-panel p-6">
                  <div className="mb-5 flex gap-1 text-primary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-lg leading-relaxed text-foreground">“{testimonial.quote}”</p>
                  <div className="mt-6 border-t border-border/70 pt-4">
                    <h3 className="text-xl tracking-tight">{testimonial.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.role}, {testimonial.company}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-r from-primary via-primary to-primary/85 p-8 text-primary-foreground shadow-[0_30px_80px_-30px_rgba(200,163,92,0.55)] sm:p-10 lg:p-14">
              <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="space-y-4">
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary-foreground/70">
                    Boka bord eller beställ catering
                  </p>
                  <h2 className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
                    Oavsett om du planerar en spontan middag eller ett större sällskap hjälper vi
                    dig att hitta rätt upplägg.
                  </h2>
                  <p className="max-w-2xl text-base leading-relaxed text-primary-foreground/80 sm:text-lg">
                    Vi tar hand om allt från ett lugnt bord för två till catering med tydlig
                    serveringsplan, dryckesförslag och omtanke om detaljerna.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button
                    asChild
                    size="lg"
                    variant="secondary"
                    className="rounded-full bg-background text-foreground hover:bg-background/90 active:scale-95"
                  >
                    <Link href="/boka">Boka tid</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 active:scale-95"
                  >
                    <Link href="/kontakt">Kontakta oss</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 py-16 sm:py-24 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Hitta hit och hör av dig"
                title="Enkel kontakt före, under och efter bokningen"
                description="Du kan ringa eller mejla oss direkt om du vill fråga om dagens meny, större sällskap eller catering. Närmsta parkering finns på tvärgatan. 3 min från hållplatsen."
              />
              <div className="grid gap-4">
                <div className="surface-panel p-5">
                  <PhoneCall className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-xl tracking-tight">Telefon</h3>
                  <a
                    href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
                    className="mt-2 block text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {siteConfig.phone}
                  </a>
                </div>
                <div className="surface-panel p-5">
                  <MapPin className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-xl tracking-tight">Adress</h3>
                  <p className="mt-2 text-muted-foreground">{siteConfig.fullAddress}</p>
                </div>
                <div className="surface-panel p-5">
                  <ArrowRight className="mb-3 h-5 w-5 text-primary" />
                  <h3 className="text-xl tracking-tight">E-post</h3>
                  <a
                    href={`mailto:${siteConfig.email}`}
                    className="mt-2 block text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {siteConfig.email}
                  </a>
                </div>
              </div>
            </div>

            <div className="surface-panel overflow-hidden p-4 sm:p-5">
              <div className="flex h-full min-h-[420px] flex-col justify-between rounded-[1.5rem] border border-primary/15 bg-gradient-to-br from-background via-secondary to-card p-6">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Besöksadress</p>
                  <h2 className="text-3xl tracking-tight">Storgatan 12</h2>
                  <p className="max-w-md text-muted-foreground">
                    Ett par minuter från kollektivtrafiken och nära kvällsliv, hotell och vatten.
                    Perfekt för både spontana middagar och planerade sällskap.
                  </p>
                </div>

                <div className="relative mt-8 flex min-h-[220px] items-center justify-center overflow-hidden rounded-[1.5rem] border border-primary/15 bg-background/70">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(200,163,92,0.12),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.03)_0,transparent_60%)]" />
                  <div className="absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-border/80" />
                  <div className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 bg-border/80" />
                  <div className="absolute left-[24%] top-[34%] h-14 w-24 rounded-2xl border border-border/80 bg-card/60" />
                  <div className="absolute right-[16%] top-[20%] h-20 w-28 rounded-2xl border border-border/80 bg-card/50" />
                  <div className="absolute bottom-[18%] left-[18%] h-16 w-32 rounded-2xl border border-border/80 bg-card/50" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-primary shadow-[0_0_0_12px_rgba(200,163,92,0.06)]">
                    <MapPin className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/65 p-4">
                    <h3 className="text-lg tracking-tight">Öppettider</h3>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {openingHours.map((slot) => (
                        <li key={slot.label}>
                          <span className="block text-foreground">{slot.label}</span>
                          <span>{slot.hours}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/65 p-4">
                    <h3 className="text-lg tracking-tight">Snabbast väg in</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Ring direkt för samma kväll eller gå till kontaktformuläret för catering.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}