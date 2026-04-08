
import Link from "next/link";
import type { Metadata } from "next";

import { ArrowRight, Check as CalendarCheck2, Clock3, MessageSquareText, Phone } from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { BookingForm } from "@/components/booking-form";


import { businessInfo, createMetadata } from "@/lib/site";
import { Button } from "@/components/ui/button"
import PageHero from "@/components/page-hero"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Boka tid",
  description:
    "Boka tid online hos Klipp & Stil i Göteborg. Skicka din bokningsförfrågan med datum, tid och önskemål så återkommer vi snabbt med bekräftelse.",
  path: "/boka",
});

const faqItems = [
  {
    question: "Kan jag boka samma dag?",
    answer:
      "Ja, om det finns tider. Ring gärna om du vill ha snabbast möjliga hjälp så kan vi direkt säga vad som är ledigt just idag.",
  },
  {
    question: "Hur väljer jag rätt tjänst?",
    answer:
      "Skriv vad du vill uppnå i meddelandet så guidar vi dig till rätt längd och upplägg. Det viktigaste är att vi förstår målet med besöket.",
  },
  {
    question: "Tar ni emot drop-in?",
    answer:
      "I mån av tid, men vi rekommenderar bokning för att slippa vänta. Då kan vi också planera rätt tid för just din behandling.",
  },
];

const steps = [
  {
    title: "1. Skicka önskemål",
    description:
      "Välj dag och tid som passar dig och skriv gärna om du vill ha klipp, slingor, skägg eller något annat. Ju mer vi vet, desto bättre kan vi förbereda ditt besök.",
    icon: MessageSquareText,
  },
  {
    title: "2. Vi bekräftar",
    description:
      "Vi återkommer med bekräftelse så snart vi kan. Om något behöver justeras kring tidslängd eller behandling hör vi av oss innan din tid är bokad.",
    icon: CalendarCheck2,
  },
  {
    title: "3. Du kommer förberedd",
    description:
      "När du kommer till salongen vet du redan vad som är planerat. Det gör att besöket blir lugnt, tydligt och tryggt från första minuten.",
    icon: Clock3,
  },
];

export default function BookingPage() {
  return (
    <>
      <PageHero
        eyebrow="Boka tid online"
        title="Välj en tid som passar dig och berätta gärna vad du vill göra"
        description="Välj datum och tid som passar dig och beskriv gärna vad du vill göra. Vi återkommer med en bekräftelse så snart vi kan. Om du är osäker på behandling, skriv det i meddelandet så hjälper vi dig rätt."
        imageSrc="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Konsultation i salongen framför spegel i varmt ljus"
        primaryAction={{ label: "Skicka bokningsförfrågan", href: "#bokningsform" }}
        secondaryAction={{ label: "Kontakta oss", href: "/kontakt" }}
        details={[
          { label: "Enkelt", value: "Fyll i formuläret på några minuter" },
          { label: "Tryggt", value: "Vi bekräftar alltid innan din tid är klar" },
          { label: "Viktigt", value: "Avbokning senast 24 timmar innan" },
        ]}
        note="Är du osäker på vilken behandling som passar bäst? Skriv det i meddelandet så guidar vi dig till rätt upplägg."
      />

      <section id="bokningsform" className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="paper-panel-strong p-6 sm:p-8">
            <SectionHeading
              eyebrow="Bokningsformulär"
              title="Skicka din bokningsförfrågan direkt här"
              description="Fyll i dina uppgifter, önskad dag och tid samt vad du vill göra. Vi använder informationen för att planera rätt behandling och återkomma med en tydlig bekräftelse."
            />
            <div className="mt-8">
              <BookingForm />
            </div>
          </div>

          <div className="space-y-6">
            <div className="paper-panel p-6">
              <h2 className="text-2xl font-semibold tracking-tight">Bra att veta innan du bokar</h2>
              <div className="mt-5 space-y-4">
                <div className="rounded-[1.25rem] border bg-background/80 p-4">
                  <h3 className="text-lg font-semibold">Bekräftelse via e-post</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    När din förfrågan är inskickad återkommer vi med en bekräftelse inom kort. Håll gärna utkik i skräpposten också.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border bg-background/80 p-4">
                  <h3 className="text-lg font-semibold">Skriv gärna önskemål</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Berätta om du tänker klipp, slingor, skägg eller om du har en inspirationsbild. Det hjälper oss välja rätt tid och upplägg.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border bg-background/80 p-4">
                  <h3 className="text-lg font-semibold">Brådskande fråga?</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Ring oss på {businessInfo.phone} om du behöver snabbast möjliga hjälp eller vill boka samma dag.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-primary p-6 text-primary-foreground">
              <p className="text-sm uppercase tracking-[0.18em] text-primary-foreground/70">Kontaktväg</p>
              <p className="mt-3 text-lg leading-7 text-primary-foreground/85">
                Vill du hellre prata med oss först? Vi hjälper dig gärna att välja rätt tjänst och rätt tidslängd innan du bokar.
              </p>
              <Button asChild variant="secondary" className="mt-6 rounded-full">
                <a href={businessInfo.phoneHref}>
                  Ring {businessInfo.phone}
                  <Phone className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <SectionHeading
            eyebrow="Så går det till"
            title="Tre lugna steg från förfrågan till färdig bokning"
            description="Vi vill att bokningen ska kännas lika tydlig som besöket i salongen. Därför håller vi processen enkel, personlig och lätt att följa."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.title} className="paper-panel h-full p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-2xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <SectionHeading
              eyebrow="Vanliga frågor"
              title="Svar på sådant som många undrar över inför bokning"
              description="Om du fortfarande funderar över något efter att ha läst här är du alltid välkommen att kontakta oss direkt. Vi hjälper dig gärna att reda ut nästa steg."
            />
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/kontakt">Kontakta oss</Link>
            </Button>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqItems.map((item, index) => (
              <AccordionItem
                key={item.question}
                value={`faq-${index}`}
                className="rounded-[1.25rem] border bg-card/85 px-5"
              >
                <AccordionTrigger className="text-left text-lg font-medium">{item.question}</AccordionTrigger>
                <AccordionContent className="text-base leading-7 text-muted-foreground">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="section-shell py-8 sm:py-12">
        <div className="rounded-[2rem] border bg-card/85 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.22em] text-accent">Behöver du råd?</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Vi hjälper dig gärna att välja rätt behandling innan du skickar in
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Om du tvekar mellan klipp, färg eller styling är det helt i sin ordning. Hör av dig så hjälper vi dig tänka igenom vad som passar ditt hår, din tid och din vardag bäst.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/kontakt">
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href={businessInfo.phoneHref}>Ring oss</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}