
import Link from "next/link";
import type { Metadata } from "next";



import { ArrowRight, Check, Info } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { createPageMetadata } from "@/lib/site";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import SectionHeading from "@/components/section-heading"



export const metadata: Metadata = createPageMetadata({
  title: "Priser",
  path: "/priser",
  description:
    "Se priser och paket hos Klipp & Stil i Göteborg. Klippning, färg och skäggvård med tydligt innehåll, från-priser och enkel bokning online.",
});

type PricePackage = {
  title: string;
  price: string;
  description: string;
  cta: string;
  featured: boolean;
  items: string[];
};

type FaqItem = {
  question: string;
  answer: string;
};

const packages: PricePackage[] = [
  {
    title: "Klipp & Form",
    price: "590 kr",
    description:
      "Konsultation, klippning, tvätt, föning och lätt styling för dig som vill fräscha upp form och känsla utan att krångla till det.",
    cta: "Boka Klipp & Form",
    featured: false,
    items: ["Konsultation", "Tvätt", "Klippning", "Föning", "Stylingtips"],
  },
  {
    title: "Färg & Glow",
    price: "från 1 490 kr",
    description:
      "Konsultation, färg eller toning, vårdande behandling, föning och styling. Perfekt när du vill uppdatera nyans, glans och helhetskänsla.",
    cta: "Boka Färg & Glow",
    featured: true,
    items: ["Färg eller toning", "Nyansering vid behov", "Vårdande behandling", "Föning", "Styling"],
  },
  {
    title: "Klipp + Skägg",
    price: "790 kr",
    description:
      "Klippning, tvätt, skäggtrim och form samt styling för en helhet som känns ren, välvårdad och lätt att hålla efter hemma.",
    cta: "Boka Klipp + Skägg",
    featured: false,
    items: ["Konsultation", "Klippning", "Tvätt", "Skäggtrim och kontur", "Finish"],
  },
];

const faqItems: FaqItem[] = [
  {
    question: "Varför står det ”från”-pris på färg?",
    answer:
      "Utgångsläge, hårlängd, mängd hår och önskat resultat påverkar både tid och produktåtgång. Därför använder vi från-pris på färgbehandlingar och stämmer alltid av upplägget innan vi börjar.",
  },
  {
    question: "Ingår tvätt och föning?",
    answer:
      "Ja, i våra paket ingår tvätt och föning samt enklare styling. Vi vill att du ska få se resultatet färdigt och samtidigt få råd om hur du kan styla hemma.",
  },
  {
    question: "Kan jag få en prisuppskattning innan?",
    answer:
      "Absolut. Du kan kontakta oss direkt eller skriva i meddelandefältet vid bokning vad du vill göra, så återkommer vi med en tydligare uppskattning innan besöket.",
  },
  {
    question: "Vad händer om jag behöver mer tid?",
    answer:
      "Om vi under konsultationen märker att mer tid eller ett annat upplägg behövs berättar vi det direkt. På så sätt vet du vad som gäller innan vi fortsätter behandlingen.",
  },
];

export default function PricesPage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Priser och paket
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Tydliga paket som gör det enkelt att välja rätt
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Här hittar du våra vanligaste paket och ungefärliga priser. Exakt pris kan variera beroende på hårlängd, utgångsläge och önskat resultat, och vi stämmer alltid av upplägget innan vi börjar.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>

          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1760862652442-e8ff7ebdd2f8?w=1100&h=900&fit=crop&q=80"
                alt="Konsultation i salong med produkter och varm nordisk interiör"
                width={1100}
                height={900}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Välj ett paket som passar dig"
            title="Tre tydliga upplägg för de vanligaste besöken"
            description="Paketen är utformade för att göra valet enklare redan innan du bokar. Är du osäker på vad som passar bäst går det fint att skriva en kort beskrivning i bokningen så hjälper vi dig vidare."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {packages.map((pkg) => (
              <Card
                key={pkg.title}
                className={`rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  pkg.featured ? "border-accent/35 shadow-lg" : ""
                }`}
              >
                <CardHeader className="space-y-4 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-2xl font-semibold">{pkg.title}</CardTitle>
                    {pkg.featured ? (
                      <Badge className="rounded-full bg-accent text-accent-foreground hover:bg-accent">Populär</Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold">{pkg.price}</p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{pkg.description}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 p-6 pt-0">
                  <ul className="space-y-3">
                    {pkg.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild size="lg" className="w-full rounded-full transition-all duration-200 active:scale-95">
                    <Link href="/boka">{pkg.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Det här ingår i paketen"
              title="Alltid med tydlig konsultation och finish"
              description="Vi vill att du ska veta vad du betalar för och hur behandlingen är upplagd. Därför bygger våra paket på ett tydligt grundflöde där rådgivning, utförande och avslutande styling hänger ihop."
            />
            <div className="section-shell overflow-hidden p-3">
              <div className="relative overflow-hidden rounded-[1.7rem]">
                <Image
                  src="https://images.unsplash.com/photo-1678511446570-5fc2f676e564?w=900&h=850&fit=crop&q=80"
                  alt="Detaljbild med hårprodukter på hylla i varm salongsmiljö"
                  width={900}
                  height={850}
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {packages.map((pkg) => (
              <Card key={pkg.title} className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <h3 className="text-xl font-semibold">{pkg.title}</h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {pkg.items.map((item) => (
                      <li key={`${pkg.title}-${item}`} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}

            <div className="rounded-[1.75rem] border border-border/70 bg-muted/60 p-5">
              <p className="flex items-start gap-3 text-sm leading-7 text-muted-foreground">
                <Info className="mt-1 h-4 w-4 shrink-0 text-accent" />
                <span>
                  Tillägg som extra tjockt eller långt hår, avancerade slingor och färgkorrigering prisas efter tid. Vi berättar alltid detta innan behandlingen startar.
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Vanliga frågor om priser"
            title="Svar på det som ofta dyker upp innan bokning"
            description="Det är vanligt att ha frågor om från-priser, tidsåtgång och vad som faktiskt ingår. Här har vi samlat sådant vi ofta går igenom i telefon eller innan ett första besök."
            align="center"
          />

          <div className="mt-10 section-shell p-6 sm:p-8">
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="text-left text-base font-medium">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-accent px-6 py-10 text-accent-foreground sm:px-10 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-background/15 px-4 py-1 text-accent-foreground hover:bg-background/15">
                  Boka ditt paket online
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Välj paket, datum och tid – vi tar resten på plats
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-accent-foreground/85">
                  När du bokar berättar du kort vad du vill göra och när du helst vill komma. Vi möter upp med en tydlig konsultation så att behandlingen blir rätt från början.
                </p>
              </div>

              <div className="section-shell bg-background/92 p-6 text-foreground">
                <h3 className="text-2xl font-semibold">Behöver du hjälp att välja?</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Det går bra att kontakta oss innan du bokar om du vill stämma av vilken behandling som passar bäst. Vi guidar dig gärna till rätt paket.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="rounded-full transition-all duration-200 active:scale-95">
                    <Link href="/boka">Boka tid</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                    <Link href="/kontakt">Kontakta oss</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}