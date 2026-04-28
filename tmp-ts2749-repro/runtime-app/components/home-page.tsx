"use client";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Circle as LucideIcon, Flame, Leaf, MapPin, ArrowRight, TimerReset, Sparkles, Clock3, Star } from "lucide-react";
import { Cross as UtensilsCrossed, Gamepad as Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import FloatingCta from "@/components/floating-cta";
import { PointerParallaxLayer } from "@/components/pointer-parallax-layer";
import { ScrollParallaxLayer } from "@/components/scroll-parallax-layer";
import VisitDialog from "@/components/visit-dialog";
type Stat = {
    value: string;
    label: string;
};
type FeatureCard = {
    icon: LucideIcon;
    title: string;
    text: string;
    badge: string;
    ctaLabel: string;
    href: string;
};
type GalleryImage = {
    title: string;
    caption: string;
    src: string;
    alt: string;
    className: string;
};
const quickStats: Stat[] = [
    { value: "4,8/5", label: "snitt på kvällsmenyn" },
    { value: "11", label: "signaturburgare + specials" },
    { value: "23:00", label: "öppet fredag & lördag" },
    { value: "120", label: "platser inne + takeaway" },
];
const featureCards: FeatureCard[] = [
    {
        icon: Flame,
        title: "Glöd på grillen",
        text: "Smashed högrev på beställning, mjuk brioche och precis rätt mängd karamelliserad yta.",
        badge: "Hantverk",
        ctaLabel: "Se smaken",
        href: "#galleri",
    },
    {
        icon: Leaf,
        title: "Grönt med attityd",
        text: "Våra vegetariska burgare har samma crunch, hetta och wow som klassikerna.",
        badge: "Vego + klassiker",
        ctaLabel: "Planera besöket",
        href: "#kontakt",
    },
    {
        icon: Gamepad2,
        title: "Mat möter spelkväll",
        text: "Hos oss får brandet en egen lekfull sida: klicka vidare till hamburgerspelet och utmana ditt rekord.",
        badge: "Arcade vibe",
        ctaLabel: "Spela nu",
        href: "/spel",
    },
];
const gallery: GalleryImage[] = [
    {
        title: "Neon Smash",
        caption: "Dubbel ost, picklad lök, jalapeñomayo och stekyta med riktig crunch.",
        src: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=80",
        alt: "Närbild på saftig hamburgare med smält ost",
        className: "md:col-span-2 md:row-span-2",
    },
    {
        title: "Loaded fries",
        caption: "Pommes med örtsalt, parmesan och dippar som räcker hela bordet runt.",
        src: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=1200&q=80",
        alt: "Pommes frites på bricka med dippar",
        className: "",
    },
    {
        title: "Kvällsljuset",
        caption: "Neon, trä och modern street-food-känsla som bär från lunch till sena kvällar.",
        src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
        alt: "Restauranginteriör med modern street-food-känsla",
        className: "",
    },
    {
        title: "Green Crunch",
        caption: "Vår gröna favorit med krispig sallad, syrlig dressing och rejäl bite.",
        src: "https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=1200&q=80",
        alt: "Burger med färska gröna ingredienser",
        className: "",
    },
    {
        title: "Grab & go",
        caption: "Snabb takeaway när du vill ha riktig burgerkänsla utan omvägar.",
        src: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
        alt: "Person som håller en burgare",
        className: "md:col-span-2",
    },
];
export default function HomePage() {
    const heroRef = useRef<HTMLElement>(null);
    return (<>
      <FloatingCta />

      <section ref={heroRef} className="relative overflow-hidden border-b border-border/60 pb-12 pt-16 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24">
        <ScrollParallaxLayer targetRef={heroRef} translateYRange={[-14, 10]} opacityRange={[0.22, 0.14]} className="pointer-events-none absolute inset-0">
          <Image src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1800&q=80" alt="" aria-hidden="true" fill priority unoptimized sizes="100vw" className="object-cover object-center saturate-125"/>
        </ScrollParallaxLayer>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_26%,transparent)_0%,color-mix(in_oklab,var(--background)_76%,transparent)_42%,var(--background)_100%)]"/>
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-70"/>
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl"/>
        <div className="pointer-events-none absolute right-0 top-1/3 h-48 w-48 rounded-full bg-accent/15 blur-3xl"/>
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-40 w-40 rounded-full bg-secondary/20 blur-3xl"/>

        <div className="section-shell relative">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge className="rounded-full bg-primary/10 px-4 py-1.5 text-primary hover:bg-primary/10">
                  Stockholm • Street food • Arcade nights
                </Badge>
                <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
                  Saftiga burgare.
                  <br />
                  Skön vibe.
                  <br />
                  Maxad smak.
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Glöd Burger Club blandar smashburgare, gröna toppar och
                  turkos neonenergi i en modern restaurangkänsla. Kom för
                  smaken, stanna för atmosfären — och klicka vidare till vårt
                  hamburgerspel när du vill ta vibben ett steg längre.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/75 p-4 backdrop-blur">
                  <Flame className="mt-0.5 h-5 w-5 text-primary"/>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Smashed på beställning
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Het stekyta, saftig mitt.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/75 p-4 backdrop-blur">
                  <Leaf className="mt-0.5 h-5 w-5 text-secondary-foreground"/>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Vego som levererar
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Grönt med samma wow.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/75 p-4 backdrop-blur">
                  <Gamepad2 className="mt-0.5 h-5 w-5 text-accent-foreground"/>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Lekfull varumärkesvärld
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Spel, energi och kvällskänsla.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
                  <a href="#kontakt">
                    Besök oss
                    <MapPin className="ml-2 h-4 w-4"/>
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-border/70 bg-background/80 px-7 active:scale-95">
                  <Link href="/spel">
                    Spela hamburgerspelet
                    <ArrowRight className="ml-2 h-4 w-4"/>
                  </Link>
                </Button>
                <VisitDialog />
              </div>
            </div>

            <div className="[perspective:1600px]">
              <PointerParallaxLayer targetRef={heroRef} intensity={12} rotateIntensity={4} className="relative">
                <Card className="surface-panel-strong overflow-hidden rounded-[2rem] border-border/70">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1400&q=80" alt="Saftig signaturburgare serverad på restaurangen" fill unoptimized sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent"/>
                    <div className="absolute left-5 top-5">
                      <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
                        Kvällens signatur
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="space-y-4 p-6 sm:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="font-display text-3xl tracking-tight text-balance">
                          Neon Smash
                        </CardTitle>
                        <CardDescription className="mt-2 text-base leading-relaxed text-muted-foreground">
                          Dubbel ost, picklad lök, jalapeñomayo, grillad brioche
                          och house crunch.
                        </CardDescription>
                      </div>
                      <div className="rounded-[1.25rem] border border-primary/15 bg-primary/10 px-4 py-3 text-right">
                        <p className="text-sm text-muted-foreground">från</p>
                        <p className="text-2xl font-semibold text-foreground">
                          149 kr
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[1.25rem] border border-border/70 bg-card/70 p-4">
                        <p className="text-sm font-medium text-foreground">
                          Klar på ca
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-primary">
                          9 min
                        </p>
                      </div>
                      <div className="rounded-[1.25rem] border border-border/70 bg-card/70 p-4">
                        <p className="text-sm font-medium text-foreground">
                          Vego-alternativ
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-secondary-foreground">
                          Ja
                        </p>
                      </div>
                      <div className="rounded-[1.25rem] border border-border/70 bg-card/70 p-4">
                        <p className="text-sm font-medium text-foreground">
                          Passar bäst med
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-accent-foreground">
                          Fries
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </PointerParallaxLayer>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickStats.map((item) => (<div key={item.label} className="surface-panel glow-chip rounded-[1.5rem] p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <p className="text-3xl font-semibold tracking-tight text-foreground">
                  {item.value}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.label}
                </p>
              </div>))}
          </div>
        </div>
      </section>

      <section id="om-oss" className="section-padding">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-sm">
            <div className="relative aspect-[4/5]">
              <Image src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80" alt="Modern restauranginteriör med neon och varm street-food-känsla" fill unoptimized sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover"/>
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent"/>
            </div>
            <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/40 bg-background/80 p-4 backdrop-blur">
              <p className="text-sm font-semibold text-foreground">
                Vår känsla i tre ord
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                  varm
                </Badge>
                <Badge className="rounded-full bg-secondary/50 text-secondary-foreground hover:bg-secondary/50">
                  krispig
                </Badge>
                <Badge className="rounded-full bg-accent/30 text-accent-foreground hover:bg-accent/30">
                  lekfull
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="outline" className="rounded-full border-primary/20 bg-card/80 px-4 py-1.5 text-primary">
                Om restaurangen
              </Badge>
              <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl lg:text-5xl">
                Burgerbar med hetta, hantverk och modern street-food-känsla.
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                På Glöd Burger Club möts rå smak, snabb service och en interiör
                som känns lika genomtänkt som menyn. Vi jobbar med färska
                råvaror, tydliga kontraster och en upplevelse där varje detalj —
                från musiken till brickan — ska kännas självsäker, cool och
                välkomnande.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="surface-panel rounded-[1.75rem] border-border/80">
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <UtensilsCrossed className="h-5 w-5"/>
                  </div>
                  <CardTitle className="text-xl">Råvaror som märks</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
                  Nykvarnad högrev, lokalt bakad brioche och grönsaker som får
                  lika mycket omtanke som köttet.
                </CardContent>
              </Card>

              <Card className="surface-panel rounded-[1.75rem] border-border/80">
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/60 text-secondary-foreground">
                    <TimerReset className="h-5 w-5"/>
                  </div>
                  <CardTitle className="text-xl">Snabbt utan stress</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
                  Beställ, slå dig ner och få maten snabbt — utan att känslan
                  blir kedjig eller opersonlig.
                </CardContent>
              </Card>
            </div>

            <div className="surface-panel rounded-[1.75rem] p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-accent-foreground"/>
                <div>
                  <p className="font-semibold text-foreground">
                    Mer än bara burgare
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Vi har byggt en tydlig visuell identitet med röda, gröna och
                    turkosa accenter för att restaurangen ska kännas lika stark
                    digitalt som på plats.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-card/55">
        <div className="section-shell">
          <div className="mb-8 max-w-2xl space-y-3">
            <Badge className="rounded-full bg-accent/25 px-4 py-1.5 text-accent-foreground hover:bg-accent/25">
              Det som gör oss speciella
            </Badge>
            <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
              Tre tydliga skäl att välja Glöd.
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {featureCards.map((item) => {
            const Icon = item.icon;
            return (<Card key={item.title} className="surface-panel rounded-[1.75rem] border-border/80 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                  <CardHeader className="flex h-full flex-col space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5"/>
                      </div>
                      <Badge variant="outline" className="rounded-full border-border/70 bg-card/80">
                        {item.badge}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-xl text-foreground">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-base leading-relaxed text-muted-foreground">
                        {item.text}
                      </CardDescription>
                    </div>
                    <div className="pt-2">
                      <Button asChild variant="ghost" className="h-auto rounded-full px-0 text-primary hover:bg-transparent hover:text-primary/80">
                        {item.href.startsWith("/") ? (<Link href={item.href}>
                            {item.ctaLabel}
                            <ArrowRight className="ml-2 h-4 w-4"/>
                          </Link>) : (<a href={item.href}>
                            {item.ctaLabel}
                            <ArrowRight className="ml-2 h-4 w-4"/>
                          </a>)}
                      </Button>
                    </div>
                  </CardHeader>
                </Card>);
        })}
          </div>
        </div>
      </section>

      <section id="galleri" className="section-padding">
        <div className="section-shell">
          <div className="mb-8 max-w-2xl space-y-3">
            <Badge className="rounded-full bg-secondary/60 px-4 py-1.5 text-secondary-foreground hover:bg-secondary/60">
              Smak du nästan kan känna
            </Badge>
            <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Ett galleri av crunch, värme och kvällsljus.
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Här ser du det vi vill att sajten ska kännas som i varje skärm:
              stor aptit, tydliga färger och en modern restaurangkänsla.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 md:auto-rows-[15rem]">
            {gallery.map((item) => (<article key={item.title} className={`group relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card ${item.className}`}>
                <Image src={item.src} alt={item.alt} fill unoptimized sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"/>
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-foreground/10 to-transparent"/>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="rounded-[1.25rem] border border-white/35 bg-background/80 p-4 backdrop-blur">
                    <p className="text-base font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.caption}
                    </p>
                  </div>
                </div>
              </article>))}
          </div>
        </div>
      </section>

      <section id="kontakt" className="section-padding bg-card/55">
        <div className="section-shell grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
          <Card className="surface-panel rounded-[2rem] border-border/80">
            <CardHeader className="space-y-4">
              <Badge className="w-fit rounded-full bg-primary/10 px-4 py-1.5 text-primary hover:bg-primary/10">
                Hitta hit
              </Badge>
              <CardTitle className="font-display text-3xl tracking-tight text-balance">
                Kom förbi för lunch, senmiddag eller takeaway.
              </CardTitle>
              <CardDescription className="text-base leading-relaxed text-muted-foreground">
                Vi ligger centralt på Kungsholmen med plats för både snabba
                drop-ins och längre kvällshäng.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-4 rounded-[1.5rem] border border-border bg-card/80 p-5">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-primary"/>
                  <div>
                    <p className="font-medium text-foreground">Adress</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      S:t Eriksgatan 45, 112 34 Stockholm
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 text-primary"/>
                  <div>
                    <p className="font-medium text-foreground">Öppettider</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Mån–tors 11–21 · Fre–lör 11–23 · Sön 12–20
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-5 w-5 text-primary"/>
                  <div>
                    <p className="font-medium text-foreground">Bra att veta</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Takeaway på cirka 12 minuter. Barnvänliga booths och flera
                      vegetariska alternativ.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-border/70 bg-card/80">
                  5 min från tunnelbanan
                </Badge>
                <Badge variant="outline" className="rounded-full border-border/70 bg-card/80">
                  Takeaway
                </Badge>
                <Badge variant="outline" className="rounded-full border-border/70 bg-card/80">
                  Vego & klassiker
                </Badge>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <VisitDialog />
                <Button asChild variant="outline" className="rounded-full border-border/70 bg-background/80 px-5 active:scale-95">
                  <Link href="/spel">
                    Spela medan du väntar
                    <Gamepad2 className="ml-2 h-4 w-4"/>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="surface-panel-strong overflow-hidden rounded-[2rem] border border-border/80">
            <div className="relative aspect-[16/11]">
              <Image src="https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1600&q=80" alt="Restaurangkänsla med modern street-food-atmosfär" fill unoptimized sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover"/>
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/15 to-transparent"/>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8">
              <div className="space-y-3">
                <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
                  Kvällens vibe
                </Badge>
                <h3 className="font-display text-3xl tracking-tight text-balance text-foreground sm:text-4xl">
                  Röd glöd, gröna detaljer och turkos energi.
                </h3>
                <p className="max-w-2xl text-sm leading-relaxed text-white/82 sm:text-base">
                  Hemsidan är byggd för att kännas som restaurangen gör i
                  verkligheten: varm, snabb, snygg och lite lekfull på samma
                  gång.
                </p>
              </div>
              <Button asChild className="rounded-full bg-background text-foreground hover:bg-background/90 active:scale-95">
                <Link href="/om">
                  Läs mer om oss
                  <ArrowRight className="ml-2 h-4 w-4"/>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>);
}
