/**
 * Page blocks catalog — generella sajtsektioner för Visual Composer.
 *
 * **Inte** samma sak som `ai-elements-catalog.ts` (AI-UI-primitives för chatt/preview-ytor).
 * Composer använder dessa block för drag-and-drop mot startsidan.
 */

export type PageBlockCategory =
  | "hero"
  | "content"
  | "social-proof"
  | "conversion"
  | "support"
  | "navigation";

export type PageBlockCatalogItem = {
  id: string;
  label: string;
  description: string;
  category: PageBlockCategory;
  /** JSX som kan infogas i `app/page.tsx` inuti `<main>` (egen rad, indenterad med två mellanslag). */
  jsxSnippet: string;
  /** Detaljerad instruktion till own-engine vid AI-fallback (t.ex. när patch inte är säker). */
  implementationPrompt: string;
};

export const PAGE_BLOCKS_TARGET_FILE_CANDIDATES = ["app/page.tsx", "src/app/page.tsx"] as const;

export const PAGE_BLOCK_CATEGORIES: { id: PageBlockCategory; label: string }[] = [
  { id: "hero", label: "Hero" },
  { id: "content", label: "Innehåll" },
  { id: "social-proof", label: "Omdömen" },
  { id: "conversion", label: "Konvertering" },
  { id: "support", label: "Support" },
  { id: "navigation", label: "Navigation" },
];

/**
 * MVP: begränsad uppsättning generella sektioner — top-level i landningssidan.
 * Utvidgas med fler block när patch-pipeline stödjer fler layouter.
 */
export const PAGE_BLOCK_ITEMS: PageBlockCatalogItem[] = [
  {
    id: "section-hero-simple",
    label: "Enkel hero",
    description: "Rubrik, underrad och primär knapp.",
    category: "hero",
    jsxSnippet: `      <section className="w-full max-w-3xl text-center space-y-6 py-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Din rubrik här
        </h2>
        <p className="text-lg text-muted-foreground">
          Kort beskrivning av erbjudandet. Byt text och länk nedan.
        </p>
        <div>
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
          >
            Kom igång
          </a>
        </div>
      </section>`,
    implementationPrompt: [
      "Implementera en hero-sektion med h2, kort brödtext och en primär CTA-knapp.",
      "Använd Tailwind-klasser i linje med befintlig sida (text-foreground, text-muted-foreground, bg-primary).",
      "Behåll semantisk HTML (<section>) och tillgänglig kontrast.",
    ].join("\n"),
  },
  {
    id: "section-features-3col",
    label: "Funktioner (3 kort)",
    description: "Tre kolumner med rubrik och text.",
    category: "content",
    jsxSnippet: `      <section className="w-full max-w-5xl space-y-8 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Funktioner</h2>
          <p className="text-muted-foreground">Tre kort med kort beskrivning.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Funktion ett", body: "Beskriv värdet kort." },
            { title: "Funktion två", body: "Beskriv värdet kort." },
            { title: "Funktion tre", body: "Beskriv värdet kort." },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-6 space-y-2">
              <h3 className="text-lg font-semibold text-card-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>`,
    implementationPrompt: [
      "Lägg till en features-sektion med överskrift och tre kort i ett responsivt rutnät (sm:2, lg:3 kolumner).",
      "Använd border-border, bg-card, text-card-foreground som befintliga kort på sidan.",
    ].join("\n"),
  },
  {
    id: "section-cta-banner",
    label: "CTA-band",
    description: "Kontrastfält med rubrik och knapp.",
    category: "conversion",
    jsxSnippet: `      <section className="w-full max-w-4xl rounded-2xl border border-primary/30 bg-primary/10 px-8 py-10 text-center space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Redo att börja?</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Kort uppmaning. Byt copy efter er ton.
        </p>
        <a
          href="#contact"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
        >
          Kontakta oss
        </a>
      </section>`,
    implementationPrompt: [
      "Infoga en CTA-sektion med tydlig rubrik, kort text och knapp länkad till kontaktankare eller relevant route.",
    ].join("\n"),
  },
  {
    id: "section-testimonials",
    label: "Omdömen",
    description: "Två citat i kort.",
    category: "social-proof",
    jsxSnippet: `      <section className="w-full max-w-5xl space-y-8 py-8">
        <h2 className="text-center text-2xl font-semibold text-foreground">Vad kunder säger</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <blockquote className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <p className="text-sm italic text-muted-foreground">&quot;Kort positivt citat här.&quot;</p>
            <footer className="mt-3 text-xs font-medium text-foreground">— Namn, roll</footer>
          </blockquote>
          <blockquote className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <p className="text-sm italic text-muted-foreground">&quot;Ett till citat för balans.&quot;</p>
            <footer className="mt-3 text-xs font-medium text-foreground">— Namn, roll</footer>
          </blockquote>
        </div>
      </section>`,
    implementationPrompt: [
      "Lägg till testimonials-sektion med två blockquote-kort, responsivt (md:2 kolumner).",
    ].join("\n"),
  },
  {
    id: "section-pricing-teaser",
    label: "Pris (teaser)",
    description: "Ett plan-kort som kan dupliceras.",
    category: "conversion",
    jsxSnippet: `      <section className="w-full max-w-3xl space-y-6 py-8 text-center">
        <h2 className="text-2xl font-semibold text-foreground">Enkla priser</h2>
        <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Standard</p>
          <p className="text-4xl font-bold text-foreground">999 kr<span className="text-lg font-normal text-muted-foreground">/mån</span></p>
          <ul className="text-left text-sm text-muted-foreground space-y-2 max-w-sm mx-auto">
            <li>• Punkt ett</li>
            <li>• Punkt två</li>
            <li>• Punkt tre</li>
          </ul>
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Välj plan
          </a>
        </div>
      </section>`,
    implementationPrompt: [
      "Lägg till en enkel pricing-teaser med ett plan-kort, lista och CTA.",
    ].join("\n"),
  },
  {
    id: "section-faq-accordion-lite",
    label: "FAQ (enkel)",
    description: "Tre frågor som statisk lista (ingen accordion-dependency).",
    category: "support",
    jsxSnippet: `      <section className="w-full max-w-3xl space-y-6 py-8">
        <h2 className="text-2xl font-semibold text-foreground text-center">Vanliga frågor</h2>
        <dl className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="font-medium text-card-foreground">Fråga ett?</dt>
            <dd className="mt-1 text-sm text-muted-foreground">Kort svar här.</dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="font-medium text-card-foreground">Fråga två?</dt>
            <dd className="mt-1 text-sm text-muted-foreground">Kort svar här.</dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="font-medium text-card-foreground">Fråga tre?</dt>
            <dd className="mt-1 text-sm text-muted-foreground">Kort svar här.</dd>
          </div>
        </dl>
      </section>`,
    implementationPrompt: [
      "Lägg till FAQ med dl/dt/dd och tre frågor, samma visuella stil som övriga kort.",
    ].join("\n"),
  },
  {
    id: "section-contact-lite",
    label: "Kontakt",
    description: "E-post och platsrad.",
    category: "support",
    jsxSnippet: `      <section id="contact" className="w-full max-w-xl space-y-4 py-8 text-center scroll-mt-24">
        <h2 className="text-2xl font-semibold text-foreground">Kontakt</h2>
        <p className="text-muted-foreground">
          Maila oss på{" "}
          <a href="mailto:hello@example.com" className="text-primary underline underline-offset-4">
            hello@example.com
          </a>
        </p>
        <p className="text-sm text-muted-foreground">Byt e-post och lägg till adress om det behövs.</p>
      </section>`,
    implementationPrompt: [
      "Lägg till kontaktsektion med id=\"contact\" för ankare, mailto-länk och kort hjälptext.",
    ].join("\n"),
  },
  {
    id: "section-footer-lite",
    label: "Sidfot (enkel)",
    description: "Länkrad och copyright.",
    category: "navigation",
    jsxSnippet: `      <footer className="w-full max-w-5xl border-t border-border pt-8 pb-12 mt-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Ditt företag</p>
          <nav className="flex gap-4" aria-label="Sidfot">
            <a href="/" className="hover:text-foreground transition-colors">Hem</a>
            <a href="#contact" className="hover:text-foreground transition-colors">Kontakt</a>
          </nav>
        </div>
      </footer>`,
    implementationPrompt: [
      "Lägg till en enkel footer med copyright och två länkar; använd <footer> och semantisk nav.",
    ].join("\n"),
  },
];

export function getPageBlockById(id: string): PageBlockCatalogItem | undefined {
  return PAGE_BLOCK_ITEMS.find((b) => b.id === id);
}
