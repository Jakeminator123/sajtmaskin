import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck, Workflow } from "lucide-react";
import { PricingCard } from "../components/pricing-card";

const features = [
  {
    title: "En gemensam arbetsyta",
    description: "Samla ägare, hinder och prioriteringar i en produktformad arbetsyta.",
    icon: Workflow,
  },
  {
    title: "Operativ översikt",
    description: "Visa mätetal och framsteg nära arbetsflödet i stället för i separata rapporter.",
    icon: BarChart3,
  },
  {
    title: "Exempel: roller och behörigheter",
    description:
      "Beskriv bara verifierade säkerhetsfunktioner när en riktig produktintegration finns.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "Hur snabbt kommer vi igång?",
    answer:
      "[Beskriv verkliga onboardingsteg och tidsramar från produktunderlaget. Detta är en exempelfråga, inte ett leveranslöfte.]",
  },
  {
    question: "Kan vi börja gratis?",
    answer:
      "[Ange ett verifierat erbjudande eller utelämna frågan. Den här mallen har ingen ansluten trial eller fakturering.]",
  },
  {
    question: "Vad händer med vår data?",
    answer:
      "[Beskriv verifierad datalagring, export och behörighetshantering. Inga sådana integrationer är anslutna i mallen.]",
  },
];

export default function HomePage() {
  return (
    <div className="pb-10">
      <section className="px-6 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 text-center">
          <div className="space-y-8">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/15 rounded-full px-3 py-1">
              SaaS-produktstart — demo
            </Badge>
            <div className="space-y-5">
              <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                Förvandla en produktidé till en skarpare SaaS-lanseringssida.
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-8 sm:text-xl">
                Byggd för mjukvaruprodukter som behöver produktberättelse, priser, förtroende och en
                dashboard-formad hero.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full px-7">
                <a href="#pricing">
                  Se exempelpriser <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7">
                <a href="#demo-preview">Se demo-layout</a>
              </Button>
            </div>
            <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-3">
              {[
                { label: "Lanseringstempo", value: "Snabbt" },
                { label: "Klara sektioner", value: "Hero + priser + FAQ" },
                { label: "Bäst för", value: "B2B-SaaS" },
              ].map((item) => (
                <div key={item.label} className="bg-card/70 rounded-2xl border p-4 text-left">
                  <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card
            id="demo-preview"
            className="border-primary/20 bg-card/90 shadow-primary/10 w-full overflow-hidden rounded-4xl text-left shadow-2xl"
          >
            <CardHeader className="bg-background/40 border-b p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Operativ översikt</p>
                  <p className="text-muted-foreground text-sm">Demodata — inte ansluten</p>
                </div>
                <Badge variant="secondary" className="rounded-full">
                  Q2-tillväxt
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "MRR", value: "840 kkr" },
                  { label: "Aktivering", value: "68%" },
                  { label: "Retention", value: "92%" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-secondary/75 rounded-2xl border p-4">
                    <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-background/85 rounded-3xl border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Veckopipeline</p>
                    <p className="text-muted-foreground text-xs">
                      Exempel på en produktvy — funktionerna är inte anslutna
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full">
                    +12,4%
                  </Badge>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    "Exempel: roller och behörigheter",
                    "Exempel: onboarding-flöden",
                    "Exempel: prissektion",
                    "Exempel: produkthierarki",
                  ].map((item) => (
                    <div
                      key={item}
                      className="bg-secondary/70 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm"
                    >
                      <CheckCircle2 className="text-primary h-4 w-4" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="features" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">
              Exempelfunktioner — inte anslutna
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              En starkare startpunkt för produktmarknadsföring
            </h2>
            <p className="text-muted-foreground text-lg leading-8">
              SaaS-lanseringsstruktur utan backend- eller inloggad app-komplexitet.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card/80 rounded-[1.6rem] border">
                <CardHeader className="space-y-4">
                  <div className="bg-primary/15 text-primary flex h-11 w-11 items-center justify-center rounded-2xl">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm leading-7">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-secondary/45 px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">
              Exempelpriser
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Inbyggd prissektion för prenumerationsprodukter
            </h2>
            <p className="text-muted-foreground text-lg leading-8">
              Illustrativa planer och priser, inte verifierade erbjudanden. Planval och fakturering
              är inte anslutna.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <PricingCard
              name="Starter"
              price="290 kr"
              description="För små team som validerar arbetsflödet."
              features={["3 teammedlemmar", "Grundläggande automationer", "Veckorapporter"]}
            />
            <PricingCard
              name="Growth"
              price="890 kr"
              description="För team som skalar driften över flera arbetsströmmar."
              features={["Obegränsade projekt", "Prioriterad support", "Avancerad analys"]}
              featured
            />
            <PricingCard
              name="Scale"
              price="Anpassat"
              description="För större team med roller, styrning och utrullningsbehov."
              features={["SSO / SAML", "Avancerade behörigheter", "Dedikerad onboarding"]}
            />
          </div>
        </div>
      </section>

      <section id="faq" className="px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">
              FAQ
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Färdig FAQ-sektion</h2>
            <p className="text-muted-foreground text-lg leading-8">
              Använd den för att bemöta invändningar och produktfrågor tidigt.
            </p>
          </div>
          <Card className="bg-card/80 rounded-[1.8rem] border p-2">
            <CardContent className="p-3">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((item, index) => (
                  <AccordionItem key={item.question} value={`item-${index}`}>
                    <AccordionTrigger className="text-left text-base">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm leading-7">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
