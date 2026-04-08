import Image from "next/image";
import Link from "next/link";

import {
  ArrowRight,
  Mail,
  MapPin,
  Package,
  PenTool,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/metadata";
import { import { } from "lucide-react"
import { Button } from "@/components/ui/button"
import { contactDetails, featuredProducts, siteDescription, siteName, siteUrl, socialLinks, testimonials } from "@/lib/site-data";
  contactDetails,
  featuredProducts,
  siteDescription,
  siteName,
  siteUrl,
  socialLinks,
  testimonials,
} from "@/lib/site-data";

export const metadata = createPageMetadata({
  description: siteDescription,
  path: "/",
});

const storeSchema = {
  "@context": "https://schema.org",
  "@type": "JewelryStore",
  name: siteName,
  description: siteDescription,
  url: siteUrl,
  telephone: contactDetails.phone,
  email: contactDetails.email,
  image: `${siteUrl}https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80
  address: {
    "@type": "PostalAddress",
    streetAddress: "Storgatan 12",
    postalCode: "411 38",
    addressLocality: "Göteborg",
    addressCountry: "SE",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "17:00",
    },
  ],
  sameAs: socialLinks.map((item) => item.href),
};

const studioBenefits = [
  {
    title: "Handgjort i liten skala",
    description:
      "Varje smycke formas, löds och poleras för hand i vår studio i Göteborg.",
    icon: PenTool,
  },
  {
    title: "Tydliga storlekar och rådgivning",
    description:
      "Vi hjälper gärna till om du är osäker på passform, presentval eller skötsel.",
    icon: ShieldCheck,
  },
  {
    title: "Snabb leverans och tryggt köp",
    description:
      "Fri frakt över 599 kr och 14 dagars öppet köp gör det enkelt att handla lugnt.",
    icon: Package,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeSchema) }}
      />

      <section className="relative overflow-hidden border-b border-border/70">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/40" />
        <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
        <div className="section-shell relative grid gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="rounded-full border-border/70 bg-background/80 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Handgjort i Göteborg
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
                Handgjorda silversmycken som håller över tid
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Upptäck ringar, halsband, armband och örhängen i sterling silver
                – formgivna och tillverkade för hand i liten skala. Fri frakt
                över 599 kr och 14 dagars öppet köp gör att du kan handla
                personligt, tryggt och i din egen takt.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link href="#utvalda">
                  Handla smycken
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link href="/galleri">Se galleriet</Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="silver-panel p-4">
                <p className="text-sm font-medium">925 sterling silver</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Material med tydlig lyster och lång livslängd.
                </p>
              </div>
              <div className="silver-panel p-4">
                <p className="text-sm font-medium">Små serier</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Varje modell görs i begränsad skala med handens närvaro kvar.
                </p>
              </div>
              <div className="silver-panel p-4">
                <p className="text-sm font-medium">Personlig hjälp</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Fråga oss om storlek, skötsel och presentinslagning.
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-8 top-10 h-36 w-36 rounded-full border border-border/70 bg-background/70 backdrop-blur" />
            <div className="absolute -left-6 bottom-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />
            <div className="silver-panel relative overflow-hidden rounded-[2rem] p-3">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
                alt="Handgjort silversmycke mot ljus sten och linnebakgrund"
                width={1200}
                height={1200}
                priority
                className="h-auto w-full rounded-[1.5rem] object-cover"
              />
            </div>
            <div className="absolute -bottom-6 left-4 silver-panel max-w-[16rem] p-4">
              <p className="text-sm font-medium">Ljust, minimalistiskt, bärbart</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Formgivning som passar både vardag, fest och genomtänkta gåvor.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="utvalda" className="bg-muted/35 py-16 sm:py-24">
        <div className="section-shell">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                Utvalda smycken just nu
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Fyra modeller som sätter tonen för Silverträdet
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Här börjar många sitt val. Kollektionen rör sig mellan mjuka
                ringformer, tunna kedjor och små detaljer som blir en naturlig
                del av din vardag.
              </p>
            </div>

            <Button asChild variant="outline" className="rounded-full">
              <Link href="/galleri">
                Se hela galleriet
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {featuredProducts.map((product) => (
              <Card
                key={product.slug}
                className="group overflow-hidden rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="relative overflow-hidden">
                  <Image
                    src={product.image}
                    alt={product.alt}
                    width={500}
                    height={500}
                    className="h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {product.badge ? (
                    <Badge className="absolute left-4 top-4 rounded-full bg-background/90 text-foreground shadow-sm">
                      {product.badge}
                    </Badge>
                  ) : null}
                </div>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      {product.category}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">
                      {product.price}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {product.name}
                    </h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {product.description}
                    </p>
                  </div>
                  <Button asChild variant="ghost" className="px-0 text-sm">
                    <Link href="/galleri">
                      Se liknande smycken
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Verkstadsdetaljer med silver, verktyg och polering"
              width={900}
              height={1000}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                Kort om Silverträdet
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                En liten smyckesstudio med fokus på form, material och lugn
              </h2>
              <div className="max-w-3xl space-y-4 text-lg leading-8 text-muted-foreground">
                <p>
                  Silverträdet är en liten smyckesstudio med fokus på rena
                  linjer, hållbara materialval och en tidlös estetik som känns
                  lika rätt idag som om flera år. Varje smycke formas och
                  färdigställs för hand, vilket gör att varje exemplar bär på
                  små nyanser av hantverket.
                </p>
                <p>
                  Vi vill att det ska kännas enkelt att hitta en favorit online.
                  Därför arbetar vi med tydliga storlekar, snabb leverans och
                  personlig service när du undrar över passform, presentval eller
                  skötsel.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {studioBenefits.map((item) => (
                <Card
                  key={item.title}
                  className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm"
                >
                  <CardContent className="space-y-3 p-5">
                    <item.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button asChild variant="outline" className="rounded-full">
              <Link href="/om-oss">Läs mer om vårt arbetssätt</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <div className="max-w-3xl space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Kunder som bär Silverträdet
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Omdömen från kvinnor som valt något att bära länge
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Många väljer Silverträdet för att få ett smycke som känns lätt att
              bära, men ändå personligt. Det vi oftast får höra är att
              smyckena blir en naturlig del av vardagen nästan direkt.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm"
              >
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 text-primary" />
                    ))}
                  </div>

                  <p className="text-base leading-8 text-foreground">
                    “{testimonial.quote}”
                  </p>

                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 border border-border/70">
                      <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                        {testimonial.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{testimonial.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                  Hitta din nya vardagsfavorit i silver
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  Om du vet vad du söker kan du börja i galleriet direkt. Om du
                  är osäker på storlek, stil eller presentval hjälper vi dig
                  gärna att hitta rätt utan att göra det krångligt.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="rounded-full"
                >
                  <Link href="/galleri">Handla smycken</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/kontakt">
                    Kontakta oss för frågor
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Kontakt
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Undrar du över storlek, presentinslagning eller skötsel?
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Hör av dig så hjälper vi dig. Vi återkommer vanligtvis inom en
              arbetsdag och guidar gärna kring passform, gåvor och vad som kan
              passa bäst utifrån din stil.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">Besöksadress</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {contactDetails.address}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <Phone className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">Direktkontakt</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {contactDetails.phone}
                    <br />
                    {contactDetails.email}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="rounded-full">
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={contactDetails.mapLink} target="_blank" rel="noreferrer">
                  Öppna karta
                  <MapPin className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span>{contactDetails.email}</span>
            </div>
          </div>

          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
              alt="Ljust studiohörn med smyckesaskar och materialprov"
              width={1100}
              height={900}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}