
import Link from "next/link";

import { ArrowRight, Check, Gift, Package, ShieldCheck } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";




import { faqItems, pricingTiers } from "@/lib/site-data";
import Image from "next/image";
import { createPageMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = createPageMetadata({
  pageName: "Priser",
  description:
    "Se priser och paket hos Silverträdet. Välj mellan enskilda smycken, matchande set och gåvor i silver med presentask, fri frakt och personlig hjälp.",
  path: "/priser",
});

const packageBenefits = [
  {
    title: "Presentklart från början",
    description:
      "Alla paket innehåller ask och ett genomtänkt uttryck vid leverans. Det gör dem lika enkla att ge bort som att beställa till dig själv.",
    icon: Gift,
  },
  {
    title: "Matchat med omsorg",
    description:
      "I seten väljer vi kombinationer som hör ihop i form, skala och finish. Du får ett mer sammanhållet uttryck utan att behöva tänka igenom allt själv.",
    icon: Package,
  },
  {
    title: "Trygg hjälp vid val",
    description:
      "Är du osäker på storlek eller vilket paket som passar bäst? Vi hjälper gärna till innan du bestämmer dig.",
    icon: ShieldCheck,
  },
];

export default function PriserPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/70 bg-gradient-to-b from-background to-muted/35 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="rounded-full px-4 py-1.5">
              Priser och paket
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Tydliga prisnivåer för vardag, set och gåvor i silver
            </h1>
            <div className="max-w-2xl space-y-4 text-lg leading-8 text-muted-foreground">
              <p>
                Våra paket är framtagna för att göra valet enklare – oavsett om
                du söker ett enda smycke, två delar som hör ihop eller en mer
                genomarbetad gåva. Du ser direkt vad som ingår, vilken prisnivå
                du ligger på och hur du kan gå vidare.
              </p>
              <p>
                Är du osäker på storlek eller vilken kombination som passar bäst
                hjälper vi dig gärna innan du bestämmer dig. Det ska kännas lika
                tryggt att välja online som i en fysisk butik.
              </p>
            </div>
          </div>

          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Silversmycken i presentask mot ljus bakgrund"
              width={900}
              height={1000}
              priority
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell">
          <div className="max-w-3xl space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Välj nivå
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Paket som gör det lättare att välja rätt
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Varje paket är byggt runt samma idé: tydligt innehåll, lugn design
              och en köpupplevelse som känns enkel. Du kan börja smått eller
              välja något mer generöst när tillfället kräver det.
            </p>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-3">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={`rounded-[1.75rem] border-border/70 shadow-sm ${
                  tier.featured
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card/95"
                }`}
              >
                <CardContent className="flex h-full flex-col space-y-6 p-7">
                  <div className="space-y-3">
                    {tier.featured ? (
                      <Badge className="w-fit rounded-full bg-background text-foreground">
                        Mest vald
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="w-fit rounded-full">
                        Populärt val
                      </Badge>
                    )}
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight">
                        {tier.name}
                      </h3>
                      <p
                        className={`mt-2 text-sm leading-7 ${
                          tier.featured
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      >
                        {tier.description}
                      </p>
                    </div>
                    <p className="text-3xl font-semibold tracking-tight">
                      {tier.priceRange}
                    </p>
                  </div>

                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-1 h-4 w-4 shrink-0" />
                        <span
                          className={`text-sm leading-7 ${
                            tier.featured
                              ? "text-primary-foreground/85"
                              : "text-muted-foreground"
                          }`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p
                    className={`text-sm leading-7 ${
                      tier.featured
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tier.note}
                  </p>

                  <div className="pt-2">
                    <Button
                      asChild
                      size="lg"
                      variant={tier.featured ? "secondary" : "default"}
                      className="w-full rounded-full"
                    >
                      <Link href="/kontakt">{tier.ctaLabel}</Link>
                    </Button>
                  </div>

                  <p
                    className={`text-center text-sm ${
                      tier.featured
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    Osäker på storlek? Kontakta oss så hjälper vi dig.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
              alt="Silverask med matchande ring och örhängen"
              width={1100}
              height={900}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                Vad som ingår
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Samma omsorg i varje nivå, med olika mycket stöd och innehåll
              </h2>
              <p className="text-lg leading-8 text-muted-foreground">
                Vardagsfavorit är ett enkelt förstaval, Set i silver ger dig två
                delar som fungerar tillsammans och Gåva deluxe passar när
                detaljerna kring leverans och presentation ska kännas extra
                genomtänkta.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {packageBenefits.map((item) => (
                <Card
                  key={item.title}
                  className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm"
                >
                  <CardContent className="space-y-4 p-5">
                    <item.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="rounded-[1.5rem] border-border/70 bg-card/95 shadow-sm">
              <CardContent className="space-y-4 p-6">
                <h3 className="text-xl font-semibold tracking-tight">
                  När passar vilket paket?
                </h3>
                <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">
                      Vardagsfavorit:
                    </span>{" "}
                    när du vill börja med ett enda smycke som fungerar varje dag
                    och känns enkelt att bära direkt.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Set i silver:
                    </span>{" "}
                    när du vill ha två smycken som redan är tänkta att fungera
                    tillsammans i uttryck och proportion.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Gåva deluxe:
                    </span>{" "}
                    när presenten ska kännas extra genomtänkt, eller när du vill
                    skapa ett mer komplett set med prioriterad hantering.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              FAQ om priser
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Vanliga frågor inför ditt val
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Här har vi samlat de frågor vi oftast får om pris, frakt, storlek
              och presentbeställningar. Behöver du mer hjälp svarar vi gärna
              personligt.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="border-border/70"
              >
                <AccordionTrigger className="text-left text-base font-semibold">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Välj paket och gå vidare i lugn och ro
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  När du vet vilken nivå som passar bäst kan du kontakta oss för
                  hjälp med matchning, presentval eller frågor inför köp. Vi
                  återkommer snabbt och gör nästa steg tydligt.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/kontakt">Kontakta oss</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/galleri">
                    Se smycken i galleriet
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}