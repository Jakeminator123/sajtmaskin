import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

import SectionHeading from "@/components/section-heading";
import { allergenFaq, createMetadata, menuCategories } from "@/lib/site-data";

export const metadata: Metadata = createMetadata({
  title: "Meny",
  description:
    "Upptäck Sjöstaden Bistros säsongsmeny med förrätter, varmrätter, desserter och drycker samt tydlig allergeninformation.",
  path: "/meny",
});

export default function MenuPage() {
  return (
    <div className="relative overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(200,163,92,0.08),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(200,163,92,0.05),transparent_28%)]" />

      <section className="border-b border-border/60 bg-gradient-to-b from-background via-background to-secondary/80">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-primary/80">Meny</p>
            <h1 className="max-w-3xl text-5xl tracking-tight sm:text-6xl">
              Säsongsmeny med tydlig nordisk ryggrad
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Menyn är säsongsbaserad och byggd kring lokala råvaror. Här hittar du rätter som är
              moderna i uttrycket men rotade i skandinaviska smaker. Fråga gärna personalen om
              dagens rekommendationer.
            </p>
            <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
              <Link href="/boka">Boka tid</Link>
            </Button>
          </div>

          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=900&fit=crop&q=80"
                alt="Signaturrätt i mörk lyxig bistromiljö med levande ljus och höga detaljer"
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=700&fit=crop&q=80"
                alt="Naturliga råvaror med fisk, rotfrukter, örter, svamp och bär i mörk belysning"
                fill
                className="object-cover"
              />
            </div>
          </div>
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Köket följer säsongen"
              title="Menyn förändras med marknaden, havet och det som känns bäst just nu"
              description="Det betyder att vissa rätter kan skifta i detaljer, men vår linje är densamma: rena smaker, tydlig struktur och råvaror som får stå fram. Till varje meny finns alltid förslag på både vin och alkoholfritt."
            />
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Vi arbetar med en kort, fokuserad meny som gör att kvaliteten får ta plats. Det ger
              oss också utrymme att möta kvällens sällskap med bättre rekommendationer och lugnare
              service.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-secondary/85 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          {menuCategories.map((category) => (
            <section key={category.id} className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl tracking-tight">{category.title}</h2>
                <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {category.description}
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {category.items.map((item) => (
                  <article
                    key={item.name}
                    className="surface-panel p-6 transition-all duration-300 motion-safe:hover:-translate-y-1"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-2xl tracking-tight">{item.name}</h3>
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                        {item.price}
                      </span>
                    </div>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Allergeninformation"
              title="Fråga oss gärna – vi guidar dig gärna till rätt val"
              description="Vi vill att du ska kunna känna dig trygg vid bordet. Därför går vi gärna igenom ingredienser, tillagning och vilka anpassningar som är möjliga innan du beställer."
            />
          </div>

          <div className="surface-panel p-6 sm:p-8">
            <Accordion type="single" collapsible className="w-full">
              {allergenFaq.map((item, index) => (
                <AccordionItem key={item.question} value={`item-${index}`} className="border-border/70">
                  <AccordionTrigger className="text-left text-lg tracking-tight hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section className="bg-card/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="surface-panel p-8 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Redo att boka?</p>
                <h2 className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
                  Välj en tid som passar – vi bekräftar din bokning direkt efter inskick.
                </h2>
                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Har du allergier, barnvagn eller planerar du ett firande? Lägg till en rad i
                  bokningen så ordnar vi resten.
                </p>
              </div>
              <Button asChild size="lg" className="rounded-full active:scale-95">
                <Link href="/boka">Boka tid</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}