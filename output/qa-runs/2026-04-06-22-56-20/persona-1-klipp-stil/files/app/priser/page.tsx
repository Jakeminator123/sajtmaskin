
import Link from "next/link";
import type { Metadata } from "next";


import { Check } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";





import { faqs, packages, priceMenu } from "@/lib/site-data";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import SectionHeading from "@/components/section-heading"
import CtaBanner from "@/components/cta-banner"

export const metadata: Metadata = {
  title: "Klipp & Stil — Priser och paket för klippning, färgning och styling",
  description:
    "Se priser och paket hos Klipp & Stil i Göteborg. Transparenta kostnader för klippning, färgning, styling och skäggvård samt svar på vanliga frågor.",
  keywords: [
    "priser frisör Göteborg",
    "frisör paket Göteborg",
    "klippning pris Göteborg",
    "färgning pris Göteborg",
    "Klipp & Stil priser",
  ],
  openGraph: {
    title: "Klipp & Stil — Priser och paket för klippning, färgning och styling",
    description:
      "Se priser och paket hos Klipp & Stil i Göteborg. Transparenta kostnader för klippning, färgning, styling och skäggvård samt svar på vanliga frågor.",
    locale: "sv_SE",
    type: "website",
  },
};

export default function PricingPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <Badge
            variant="secondary"
            className="rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
          >
            Priser och paket
          </Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Tydliga priser för behandlingar som planeras med omsorg
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Hos oss ska det vara lätt att förstå vad som ingår och vad besöket
            kostar innan du bokar. Därför har vi samlat våra mest efterfrågade
            paket, tillval och svar på vanliga frågor på samma sida så att du kan
            välja tryggt och i lugn och ro.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Paketen"
            title="Tre vanliga upplägg beroende på hur mycket du vill göra"
            description="Alla paket bygger på personlig rådgivning och ett arbetssätt där form, ton och underhåll vägs in redan från början. På så sätt får du ett resultat som både känns snyggt nu och är lätt att leva med efteråt."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {packages.map((pkg) => (
              <Card
                key={pkg.name}
                className={`rounded-[2rem] border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  pkg.popular ? "border-primary/30 shadow-lg" : ""
                }`}
              >
                <CardContent className="flex h-full flex-col space-y-6 p-6">
                  <div className="space-y-3">
                    {pkg.popular ? (
                      <Badge className="rounded-full bg-primary text-primary-foreground">
                        Mest bokad
                      </Badge>
                    ) : null}
                    <h2 className="text-3xl font-semibold tracking-tight">
                      {pkg.name}
                    </h2>
                    <p className="text-4xl font-semibold">{pkg.price}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pkg.description}
                    </p>
                  </div>

                  <ul className="space-y-3">
                    {pkg.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-sm leading-relaxed text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-2">
                    <Button
                      asChild
                      size="lg"
                      className="w-full rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
                    >
                      <Link href="/boka">Boka paketet</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Tillval"
            title="A la carte och små behandlingar mellan dina större besök"
            description="Ibland behövs bara en mindre uppfräschning eller ett tillval för att helheten ska kännas komplett. Här hittar du behandlingar som ofta bokas som komplement eller mellan våra större paket."
          />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {priceMenu.map((item) => (
              <Card key={item.name} className="rounded-[1.75rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-semibold tracking-tight">{item.name}</h3>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                      {item.price}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-4xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="FAQ"
            title="Vanliga frågor om priser och bokning"
            description="Många frågor handlar om vad som ingår, hur avbokning fungerar och vilken behandling som passar bäst. Här har vi samlat de vanligaste svaren för att göra valet enklare."
            align="center"
          />

          <Accordion
            type="single"
            collapsible
            className="rounded-[2rem] border border-border bg-card px-6 shadow-sm"
          >
            {faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-lg font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <CtaBanner
        eyebrow="Bokning"
        title="Vill du ha hjälp att välja rätt behandling innan du bokar?"
        description="Skicka din bokningsförfrågan och skriv några rader om hur du tänker kring färg, längd eller styling. Vi hjälper dig att hitta ett upplägg som passar både håret, vardagen och budgeten."
        primaryHref="/boka"
        primaryLabel="Boka tid"
        secondaryHref="/kontakt"
        secondaryLabel="Ställ en fråga"
      />
    </div>
  );
}