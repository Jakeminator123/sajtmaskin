
import Link from "next/link";
import type { Metadata } from "next";


import { ArrowRight, Check, Clock3 } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";


import { PricingCard } from "@/components/pricing-card";

import { addOns, createMetadata, pricingPackages } from "@/lib/site";
import Image from "next/image";
import { Button } from "@/components/ui/button"
import PageHero from "@/components/page-hero"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Priser",
  description:
    "Se priser och paket hos Klipp & Stil i Göteborg. Tydliga upplägg för klipp, färg, styling och tillval med trygg rådgivning inför bokning.",
  path: "/priser",
});

const includedItems = [
  "Konsultation och rekommendation utifrån hårtyp och önskat resultat",
  "Tvätt och huvudmassage vid klipp och färg där det är relevant",
  "Föning och stylingtips så du kan återskapa looken hemma",
  "Produktrekommendationer utan köptvång och med tydliga råd",
  "Tydlig tidsplan och pris innan vi sätter igång",
];

const faqItems = [
  {
    question: "Behöver jag veta exakt vilken behandling jag ska boka?",
    answer:
      "Nej, välj det paket som ligger närmast och skriv dina önskemål i meddelandet så justerar vi vid behov. Vi hjälper dig gärna att hitta rätt längd och upplägg innan besöket.",
  },
  {
    question: "Kan priset ändras på plats?",
    answer:
      "Vi stämmer alltid av pris och tid efter konsultation innan vi startar, särskilt vid färg och långt eller tjockt hår. Du ska veta vad som gäller innan behandlingen börjar.",
  },
  {
    question: "Ingår tvätt och styling?",
    answer:
      "Ja, i våra paket ingår tvätt där det är relevant samt föning och enkel styling. Målet är att du ska lämna salongen med både form och känsla på plats.",
  },
  {
    question: "Har ni avbokningsregler?",
    answer:
      "Ja, avbokning senast 24 timmar innan. Kontakta oss om du blir sjuk så försöker vi hitta en smidig lösning tillsammans.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Priser och paket"
        title="Tydliga priser för behandlingar som känns genomtänkta från början"
        description="Här hittar du våra vanligaste paket för klipp, färg och styling. Priserna är tydliga och du kan enkelt boka direkt. Vid extra tjockt eller långt hår kan vi rekommendera längre tid – fråga oss gärna så guidar vi dig rätt."
        imageSrc="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Detaljbild med hårfärgsskål, borstar och handdukar i salongen"
        primaryAction={{ label: "Boka tid", href: "/boka" }}
        secondaryAction={{ label: "Kontakta oss", href: "/kontakt" }}
        details={[
          { label: "Tryggt", value: "Pris och tid stäms av innan vi börjar" },
          { label: "Flexibelt", value: "Vi hjälper dig välja rätt paket" },
          { label: "Tydligt", value: "Tillval planeras öppet och utan stress" },
        ]}
        note="Osäker på paket? Hör av dig så hjälper vi dig hitta rätt upplägg utifrån hår, mål och önskat underhåll."
      />

      <section className="section-shell py-16 sm:py-24">
        <SectionHeading
          eyebrow="Våra populäraste paket"
          title="Tre tydliga vägar in beroende på vad du vill göra"
          description="Vi har samlat våra vanligaste bokningar i tydliga paket för att göra det enklare att välja. Behöver vi justera upplägget efter konsultation gör vi det alltid i dialog med dig."
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {pricingPackages.map((item) => (
            <PricingCard key={item.name} {...item} />
          ))}
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Det här ingår"
                title="Mer än bara själva behandlingen"
                description="När du bokar hos oss får du inte bara en tid i stolen. Du får också rådgivning, tydlig planering och en finish som hjälper dig bära med dig känslan hem."
              />
              <ul className="space-y-4">
                {includedItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-[1.25rem] border bg-card/80 p-4">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-base leading-7">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="paper-panel-strong overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[5/4]">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=900&fit=crop&q=80"
                  alt="Tvättplats i salongen med varm och lugn känsla"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <SectionHeading
          eyebrow="Tillval och snabba behandlingar"
          title="Små kompletteringar som gör stor skillnad"
          description="Ibland räcker ett mindre tillval för att helheten ska kännas helt rätt. Här ser du behandlingar som ofta bokas ihop med våra paket eller som passar när du vill fräscha upp något snabbt."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {addOns.map((item) => (
            <article key={item.name} className="paper-panel h-full p-6">
              <h3 className="text-2xl font-semibold tracking-tight">{item.name}</h3>
              <div className="mt-3 flex items-center gap-2 text-accent">
                <Clock3 className="h-4 w-4" />
                <span className="text-sm uppercase tracking-[0.16em]">{item.duration}</span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">{item.price}</p>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell py-8 sm:py-12">
        <div className="rounded-[2rem] border bg-card/85 p-8 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-4">
              <SectionHeading
                eyebrow="FAQ om priser"
                title="Vanliga frågor innan du bokar"
                description="Det är vanligt att fundera på vilket paket som passar bäst, vad som ingår och om priset kan förändras. Här har vi samlat svar på sådant vi ofta får frågor om."
              />
              <Button asChild size="lg" className="rounded-full">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqItems.map((item, index) => (
                <AccordionItem
                  key={item.question}
                  value={`item-${index}`}
                  className="rounded-[1.25rem] border bg-background/80 px-5"
                >
                  <AccordionTrigger className="text-left text-lg font-medium">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-base leading-7 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </>
  );
}