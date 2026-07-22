import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Two-column FAQ section with an accordion inside a soft card. Curated from
 * the proven `saas-landing` scaffold (the FAQ section in app/page.tsx).
 */

const faqs = [
  {
    question: "Can I try it before paying?",
    answer:
      "Yes. Every plan starts with a free trial — no credit card required. Upgrade only when the whole team is ready.",
  },
  {
    question: "How long does onboarding take?",
    answer:
      "Most teams are up and running within a day. Import your existing projects and invite the team from settings.",
  },
  {
    question: "Can I cancel at any time?",
    answer:
      "Absolutely. Plans are month-to-month by default and you can export all of your data whenever you want.",
  },
];

export function FaqAccordion() {
  return (
    <section id="faq" className="px-6 py-20 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          <Badge variant="secondary" className="rounded-full">FAQ</Badge>
          <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
          <p className="text-lg leading-8 text-muted-foreground">
            Answers to the most common questions before getting started.
          </p>
        </div>
        <Card className="rounded-[1.8rem] border bg-card/80 p-2">
          <CardContent className="p-3">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((item, index) => (
                <AccordionItem key={item.question} value={`item-${index}`}>
                  <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
