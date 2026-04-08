import { LifeBuoy, MessageSquare, ShieldCheck, TriangleAlert } from "lucide-react"
import Link from "next/link";








import { createMetadata, import { createMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { siteConfig, supportFaqs, supportLevels, supportOptions } from "@/lib/site-data";
  siteConfig,
  supportFaqs,
  supportLevels,
  supportOptions,
} from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "Support — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Få hjälp med driftfrågor, incidenter och vidareutveckling. TechPartner AB erbjuder strukturerad support för företagskritiska system.",
  keywords: [
    "support IT-system",
    "incidenthantering företag",
    "teknisk support moln",
    "vidareutveckling system",
    "TechPartner AB support",
  ],
});

const supportIcons = [TriangleAlert, LifeBuoy, MessageSquare];

export default function SupportPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Badge variant="secondary">Support</Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Strukturerad support för system som behöver fungera varje dag
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            När teknik blir affärskritisk behöver även supporten vara tydlig,
            lugn och förutsägbar. Vi hjälper er att hantera incidenter, löpande
            frågor och vidareutveckling utan att tappa överblicken.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Vad vi hjälper till med</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tre typer av stöd som ofta efterfrågas mest
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Våra supportuppdrag ser olika ut, men brukar kretsa kring samma
              behov: att snabbt förstå läget, prioritera rätt och få en plan för
              vad som behöver göras nu och senare.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {supportOptions.map((option, index) => {
              const Icon = supportIcons[index];

              return (
                <Card
                  key={option.title}
                  className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {option.title}
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {option.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Servicenivå</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tydlig kommunikation under hela supportflödet
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              För att support ska skapa trygghet behöver ni veta vem som gör vad
              och när nästa uppdatering kommer. Därför arbetar vi med enkel
              struktur, tydlig uppföljning och fokus på åtgärder som håller.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {supportLevels.map((level) => (
              <Card
                key={level.title}
                className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader className="space-y-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {level.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {level.description}
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
            <Badge variant="outline">Vanliga frågor</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              FAQ om support och incidenter
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Här hittar ni svar på vanliga frågor om hur vi arbetar med support,
              vilka typer av ärenden vi hanterar och hur ett upplägg brukar se
              ut när behovet är löpande.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {supportFaqs.map((faq, index) => (
              <AccordionItem
                key={faq.question}
                value={`support-faq-${index}`}
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
          <div className="rounded-[2rem] bg-primary px-8 py-10 text-primary-foreground shadow-sm sm:px-10 lg:px-12 lg:py-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Behöver ni snabb kontakt kring ett aktuellt ärende?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-primary-foreground/85">
                  Ring oss på {siteConfig.phone} eller skicka ett mejl till{" "}
                  {siteConfig.email}. Vi hjälper er att förstå läget, prioritera
                  rätt och sätta en trygg plan framåt.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/kontakt">Kontakta support</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}