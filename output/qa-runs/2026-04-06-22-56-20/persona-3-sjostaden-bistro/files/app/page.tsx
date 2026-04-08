import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  MapPin,
  Phone,
  Star,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lunchMenu, menuHighlights, siteConfig, testimonials } from "@/lib/site-data";

export const metadata: Metadata = {
  title:
    "Sjöstaden Bistro — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Boka bord för lunch eller middag och fråga om catering för ditt event.",
  keywords: [
    "Sjöstaden Bistro",
    "restaurang Malmö",
    "bistro Malmö",
    "skandinavisk mat",
    "boka bord",
    "catering Malmö",
  ],
  openGraph: {
    title:
      "Sjöstaden Bistro — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Boka bord på Sjöstaden Bistro i Malmö och upplev lunch, middag och catering med säsongens råvaror i en mörk och elegant bistromiljö.",
  },
};

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-background via-background/95 to-background" />
        <div className="absolute left-1/2 top-20 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl animate-soft-glow" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-12 sm:px-6 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-16">
          <div className="animate-fade-in-up space-y-8">
            <Badge className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-primary">
              Modern skandinavisk mat i Malmö
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-7xl">
                Smaker från hav, jord och säsong i en mörk och lyxig miljö.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Sjöstaden Bistro serverar lunch, à la carte och catering med
                lokala råvaror i fokus. Hos oss får du en varm, stillsam
                restaurangupplevelse där varje rätt är byggd för att kännas
                genomtänkt från första till sista tugga.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
                <Link href="/boka">
                  Boka bord
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full px-7 active:scale-95"
              >
                <Link href="/meny">Se menyn</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
                <CardContent className="flex items-start gap-3 p-5">
                  <Clock3 className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Öppettider</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mån–Fre 11–22
                      <br />
                      Lör–Sön 12–23
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
                <CardContent className="flex items-start gap-3 p-5">
                  <MapPin className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Läge</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {siteConfig.address}
                      <br />
                      Med utsikt över Malmös hamninlopp
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/80 backdrop-blur-sm">
                <CardContent className="flex items-start gap-3 p-5">
                  <UtensilsCrossed className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Catering</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Säsongsanpassade upplägg för företag, fest och vernissage.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="relative animate-fade-in-up">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border/70">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=900&fit=crop&q=80"
                alt="Mörk och lyxig bistrointeriör med levande ljus och elegant servering"
                width={900}
                height={900}
                priority
                className="h-[420px] w-full object-cover sm:h-[520px] lg:h-[760px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/10 bg-background/75 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2 text-primary">
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                  <Star className="h-4 w-4 fill-current" />
                </div>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  En plats för långa middagar, snabba luncher och kvällar där
                  maten får tala med lågmäld självsäkerhet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col gap-4 sm:mb-14 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Badge className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-primary">
                Veckans lunch
              </Badge>
              <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
                Dagens lunch med samma omsorg som kvällsserveringen
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Våra lunchrätter byts löpande och tillagas med säsongens råvaror.
                Perfekt för en affärslunch, en paus mitt i veckan eller en lugn
                stund med god mat nära vattnet.
              </p>
            </div>
            <Button asChild variant="outline" className="w-fit rounded-full active:scale-95">
              <Link href="/meny">Se hela lunchmenyn</Link>
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {lunchMenu.map((item) => (
              <Card
                key={item.name}
                className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-semibold">{item.name}</h3>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {item.price}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4 text-primary" />
                    Serveras vardagar 11.30–14.30
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-col gap-4 sm:mb-14 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Populära rätter från köket
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Vår meny följer säsongen och förändras med råvarorna, men några
                rätter har blivit återkommande favoriter. Här får du en känsla
                för hur vi arbetar med smak, textur och balans.
              </p>
            </div>
            <Button asChild variant="outline" className="w-fit rounded-full active:scale-95">
              <Link href="/meny">Hela menyn</Link>
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {menuHighlights.map((item) => (
              <Card
                key={item.name}
                className="group overflow-hidden border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={400}
                    height={300}
                    className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl font-semibold">{item.name}</h3>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {item.price}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=700&fit=crop&q=80"
              alt="Öppet kök med lokala råvaror och varm belysning"
              width={900}
              height={700}
              className="h-[320px] w-full object-cover sm:h-[420px]"
            />
          </div>

          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Kort om oss</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Sjöstaden Bistro är skapad för gäster som uppskattar det nordiska
              kökets rena linjer, men som också vill känna värme och närvaro i
              rummet. Vi arbetar med lokala råvaror från Skåne och låter
              säsongen styra både meny, dryck och stämning.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              På dagen serverar vi en omsorgsfull lunch för dig som vill äta
              väl mitt i veckan. På kvällen skiftar tempot och matsalen fylls av
              längre middagar, utvalda drycker och en atmosfär som stannar kvar
              efter sista glaset.
            </p>
            <Button asChild className="mt-8 rounded-full px-7 active:scale-95">
              <Link href="/om-oss">Läs mer om oss</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">
              Vad våra gäster säger
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Vi vill att varje besök ska kännas både avslappnat och noggrant
              komponerat. När gäster återkommer för lunch, middag eller catering
              är det den bästa bekräftelsen på att helheten fungerar.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card
                key={testimonial.name}
                className="border-border/80 bg-card/90 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="mb-5 flex gap-1 text-primary">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={`${testimonial.name}-${index}`} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-base leading-7 text-foreground">
                    “{testimonial.quote}”
                  </p>
                  <div className="mt-6">
                    <h3 className="text-xl font-semibold">{testimonial.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-r from-primary/18 via-primary/10 to-accent/25 p-8 sm:p-10 lg:p-14">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold sm:text-4xl">
                  Planerar du middag, event eller catering?
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  Vi hjälper gärna till med företagsmiddagar, lanseringar,
                  vernissage och privata sällskap. Oavsett om du vill boka bord
                  i matsalen eller beställa catering till en annan plats bygger
                  vi upplägget efter tillfälle, antal gäster och önskad nivå.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row lg:flex-col lg:items-stretch">
                <Button asChild size="lg" className="rounded-full active:scale-95">
                  <Link href="/boka">Boka bord</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary/30 bg-background/40 active:scale-95"
                >
                  <Link href="/kontakt">Fråga om catering</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Kontakt</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Välkommen förbi för lunch, boka en kväll i matsalen eller kontakta
              oss om catering i Malmö med omnejd. Vi svarar snabbt på frågor om
              bokningar, allergier, större sällskap och specialupplägg.
            </p>

            <div className="mt-8 space-y-4">
              <Card className="border-border/80 bg-card">
                <CardContent className="flex items-start gap-4 p-5">
                  <MapPin className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-xl font-semibold">Adress</h3>
                    <p className="mt-1 text-muted-foreground">
                      {siteConfig.address}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card">
                <CardContent className="flex items-start gap-4 p-5">
                  <Phone className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-xl font-semibold">Direktkontakt</h3>
                    <p className="mt-1 text-muted-foreground">
                      {siteConfig.phone}
                      <br />
                      {siteConfig.email}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card">
                <CardContent className="flex items-start gap-4 p-5">
                  <Clock3 className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-xl font-semibold">Öppettider</h3>
                    <p className="mt-1 text-muted-foreground">
                      Mån–Fre 11–22
                      <br />
                      Lör–Sön 12–23
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1000&h=700&fit=crop&q=80"
              alt="Kvällsvy över bistrons läge nära vattnet i Malmö"
              width={1000}
              height={700}
              className="h-full min-h-[360px] w-full object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}