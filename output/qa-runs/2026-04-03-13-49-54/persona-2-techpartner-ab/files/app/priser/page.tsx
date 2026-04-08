
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";





import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";




import { pricingFaqs, pricingPlans } from "@/lib/site-data";
import Image from "next/image";
import { createMetadata } from "@/lib/seo";
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"


export const metadata: Metadata = createMetadata({
  title: "Priser",
  description:
    "Se TechPartner AB:s paket för systemutveckling, molnlösningar och IT-säkerhet. Tydliga månadspriser, vad som ingår och svar på vanliga frågor.",
  path: "/priser",
});

export default function PricingPage() {
  return (
    <div className="flex flex-col">
      <section className="pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:items-center">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/80 bg-card px-4 py-1.5 text-sm text-secondary-foreground"
            >
              Priser och paket
            </Badge>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Välj ett upplägg som passar er fas och ambitionsnivå
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Alla paket är byggda för att skapa tydlighet i omfattning,
                ansvar och tempo. Ni kan börja med snabb start eller välja ett
                bredare upplägg för kontinuerlig utveckling, drift och
                säkerhetsarbete.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <Link href="/kontakt">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-full px-6 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>

          <div className="surface-panel grid-mask overflow-hidden rounded-[2rem] shadow-xl">
            <div className="relative aspect-[5/4]">
              <Image
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1100&h=800&fit=crop&q=80"
                alt="Strategimöte om paket och teknisk leverans i ljust kontor"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Prispaket"
            title="Tre tydliga nivåer"
            description="Paketmodellen ger bättre förutsägbarhet än löpande timmar när flera teknikområden behöver samverka. Varje nivå går att anpassa med tillägg för säkerhet, integrationer och SLA utifrån ert läge."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  "rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg",
                  plan.highlighted && "border-primary/20 shadow-lg",
                )}
              >
                <CardHeader className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {plan.highlighted ? (
                      <Badge className="rounded-full bg-accent px-3 py-1 text-accent-foreground hover:bg-accent">
                        Mest vald
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {plan.price}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {plan.summary}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-3 text-sm text-muted-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className={cn(
                      "w-full rounded-full transition-all duration-200 hover:-translate-y-0.5 active:scale-95",
                      plan.highlighted &&
                        "bg-primary text-primary-foreground hover:bg-primary/95",
                    )}
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    <Link href={plan.ctaHref}>{plan.ctaLabel}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Vad som ingår"
            title="Innehåll per paket"
            description="Paketens omfattning skiljer sig i tempo, djup och hur mycket av drift och säkerhet som täcks. Oavsett nivå får ni en tydlig struktur för prioritering, uppföljning och nästa steg."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={`${plan.name}-included`}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm"
              >
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/50 p-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {feature}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="FAQ"
            title="Vanliga frågor om priser"
            description="Frågor om starttid, fakturering och omfattning kommer ofta tidigt i processen. Här har vi samlat de vanligaste svaren för att göra det enklare att jämföra olika upplägg."
            align="center"
          />

          <Card className="mt-12 rounded-3xl border-border/80 bg-card/95 shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <Accordion type="single" collapsible className="w-full">
                {pricingFaqs.map((faq) => (
                  <AccordionItem key={faq.question} value={faq.question}>
                    <AccordionTrigger className="text-left text-base font-medium">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground shadow-xl sm:px-10 sm:py-12 lg:px-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-primary-foreground/10 px-3 py-1 text-primary-foreground hover:bg-primary-foreground/10">
                  Anpassad prisbild
                </Badge>
                <h2 className="max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill du ha en prisbild för ert specifika läge?
                </h2>
                <p className="max-w-2xl text-pretty text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
                  Beskriv kort ert mål så återkommer vi med ett förslag på
                  paket, prioritering och ungefärlig tidsplan. Det gör det
                  enklare att jämföra alternativ och komma vidare utan onödiga
                  omvägar.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="rounded-full bg-accent px-6 text-accent-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/90 active:scale-95"
              >
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}