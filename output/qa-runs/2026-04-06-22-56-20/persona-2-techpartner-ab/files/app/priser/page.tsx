import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createMetadata } from "@/lib/metadata";
import { pricingFaqs, pricingPlans, sharedDeliverables } from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "Priser — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Se TechPartner AB:s paket för utveckling, moln och säkerhet. Tydliga nivåer, fast startsträcka och stöd för företag som vill växa tryggt.",
  keywords: [
    "priser systemutveckling",
    "IT-konsult paket",
    "molnlösningar pris",
    "säkerhetsrådgivning företag",
    "TechPartner AB priser",
  ],
});

export default function PricingPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Badge variant="secondary">Priser och paket</Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Tydliga upplägg för företag som vill komma framåt med rätt tempo
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Våra paket är framtagna för att göra det enklare att komma igång med
            ett strukturerat teknikarbete. Ni väljer den nivå som passar ert
            nuläge och kan sedan skala upp i takt med att behoven växer.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 xl:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  plan.highlighted ? "border-primary shadow-lg" : ""
                }`}
              >
                <CardHeader className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {plan.name}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {plan.suitability}
                      </p>
                    </div>
                    {plan.highlighted ? (
                      <Badge className="shrink-0">Mest vald</Badge>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-4xl font-bold tracking-tight">{plan.price}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span className="text-sm leading-relaxed text-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="w-full active:scale-95 transition-all duration-200"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    <Link href="/kontakt">
                      {plan.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Vad som ingår</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Gemensamma byggstenar i varje upplägg
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Oavsett vilket paket ni väljer får ni ett arbetssätt som skapar
              bättre överblick, säkrare beslut och mer förutsägbar leverans. Det
              gör att samarbetet blir tydligt redan från start.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {sharedDeliverables.map((item) => (
              <Card
                key={item.title}
                className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline">FAQ om priser</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Vanliga frågor inför start
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Om ni funderar på vilket upplägg som passar bäst eller hur ett
              samarbete brukar börja är det helt naturligt. Här har vi samlat de
              frågor vi oftast får inför en första dialog.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {pricingFaqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`pricing-faq-${index}`}
                className="border-border"
              >
                <AccordionTrigger className="text-left text-base font-semibold">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Osäker på vilket paket som passar bäst?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  Vi hjälper er gärna att jämföra alternativen utifrån ert nuläge,
                  era mål och hur mycket stöd ni behöver just nu. Ett kort möte
                  räcker ofta för att hitta rätt nivå.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/kontakt">
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}