"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const faqs = [
  {
    q: "Behöver jag kunna programmera?",
    a: "Nej, absolut inte. SajtMaskin är byggt för att vem som helst ska kunna skapa en professionell hemsida. Berätta bara om ditt företag så sköter AI:n resten. Under huven används React och Next.js, men du behöver aldrig röra en rad kod.",
  },
  {
    q: "Vilken teknik byggs mina sidor med?",
    a: "Alla sajter byggs med React 19, Next.js 16, TypeScript och Tailwind CSS, vilket ger hög prestanda, bra SEO och en kodbas som går att vidareutveckla när bolaget växer.",
  },
  {
    q: "Hur snabbt kan jag få en färdig sajt?",
    a: "Första utkastet genereras på några sekunder. Därefter kan du förfina, iterera och publicera samma dag om du vill.",
  },
  {
    q: "Kan jag använda min egen domän?",
    a: "Ja. Med rätt plan och setup kan du koppla din egen domän med automatisk SSL. Vi hjälper gärna till om du vill ha stöd hela vägen.",
  },
  {
    q: "Är det GDPR-anpassat?",
    a: "Ja. Plattformen är byggd med GDPR i åtanke och vi försöker hålla både datalagring och arbetsflöden så rena och relevanta som möjligt.",
  },
  {
    q: "Kan jag byta plan när som helst?",
    a: "Ja, du kan skala upp när du behöver mer tempo eller fler iterationer. Credits som du redan köpt ligger kvar.",
  },
];

function FaqItem({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  const answerId = `faq-answer-${id}`;

  return (
    <div className="border-border/20 bg-card/35 hover:border-border/35 overflow-hidden rounded-2xl border transition-colors">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left"
        aria-expanded={open}
        aria-controls={answerId}
      >
        <span className="text-foreground text-sm font-medium md:text-base">{q}</span>
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id={answerId}
        role="region"
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="text-muted-foreground px-5 pb-5 text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export default function FAQPage() {
  return (
    <main className="bg-background min-h-screen px-6 py-10 md:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Button variant="ghost" className="border-border/20 bg-background/50 border" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Till startsidan
            </Link>
          </Button>
          <Button
            className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover"
            asChild
          >
            <Link href="/builder?new=1">
              Öppna builder
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <section className="border-border/20 bg-card/30 rounded-[36px] border p-6 shadow-[0_28px_80px_rgba(6,10,20,0.3)] md:p-10">
          <div className="max-w-3xl">
            <p className="text-primary mb-3 text-xs font-medium tracking-widest uppercase">
              Vanliga frågor
            </p>
            <h1 className="text-foreground text-3xl font-(--font-heading) tracking-tight md:text-5xl">
              Frågor och svar om SajtMaskin
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed md:text-base">
              Här samlar vi de vanligaste frågorna om hur plattformen fungerar, vilken teknik som
              används och hur snabbt du kan gå från idé till publicerad sajt.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_320px]">
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <FaqItem key={faq.q} q={faq.q} a={faq.a} id={String(i)} />
              ))}
            </div>

            <aside className="border-primary/20 bg-primary/8 rounded-[28px] border p-5">
              <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
                Fortfarande osäker?
              </p>
              <h2 className="text-foreground mt-3 text-xl font-(--font-heading)">
                Vi hjälper gärna till personligt.
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                Om du vill bolla upplägg, credits, domän eller om ni behöver ett team runt
                lanseringen går det snabbt att höra av sig.
              </p>
              <div className="mt-6 space-y-3">
                <Button
                  className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary-hover w-full"
                  asChild
                >
                  <Link href="/builder?new=1">
                    Skapa din sajt nu
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="border-primary/20 text-primary hover:bg-primary/5 w-full border"
                  asChild
                >
                  <a href="mailto:hej@sajtmaskin.se">Kontakta teamet</a>
                </Button>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
