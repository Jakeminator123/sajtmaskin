import type { ChatMessage } from "@/lib/builder/types";

export type SuggestionCategory = {
  id: string;
  label: string;
  items: { label: string; prompt: string }[];
};

const STATIC_CATEGORIES: SuggestionCategory[] = [
  {
    id: "content",
    label: "Innehåll",
    items: [
      { label: "Skriv om rubrikerna", prompt: "Skriv om alla rubriker så de blir kortare och starkare." },
      { label: "Bättre CTA-texter", prompt: "Förbättra alla call-to-action-texter så de blir tydligare och mer handlingsdrivande." },
      { label: "Lägg till recensioner", prompt: "Lägg till en sektion med kundrecensioner eller omdömen." },
    ],
  },
  {
    id: "design",
    label: "Design",
    items: [
      { label: "Byt färgschema", prompt: "Byt färgschema till något som känns mer professionellt." },
      { label: "Mer minimalistiskt", prompt: "Gör designen mer minimalistisk med mer whitespace och renare linjer." },
      { label: "Ändra typsnitt", prompt: "Byt till modernare typsnitt som passar bättre." },
    ],
  },
  {
    id: "pages",
    label: "Sidor",
    items: [
      { label: "Lägg till Om oss", prompt: "Skapa en Om oss-sida med plats för teaminfo och företagshistoria." },
      { label: "Kontaktsida", prompt: "Lägg till en kontaktsida med formulär och karta." },
      { label: "Blogg", prompt: "Skapa en bloggsida med plats för artiklar." },
    ],
  },
  {
    id: "features",
    label: "Funktioner",
    items: [
      { label: "Kontaktformulär", prompt: "Lägg till ett kontaktformulär." },
      { label: "Nyhetsbrev", prompt: "Lägg till en sektion för nyhetsbrev-signup." },
      { label: "Sociala medier", prompt: "Lägg till sociala medier-ikoner i footern." },
    ],
  },
];

const DOMAIN_ITEMS: { pattern: RegExp; category: string; item: { label: string; prompt: string } }[] = [
  { pattern: /\b(boka|bokning|kalender|tid)\b/i, category: "features", item: { label: "Förbättra bokning", prompt: "Förbättra bokningsflödet och gör CTA:n tydligare." } },
  { pattern: /\b(restaurang|meny|mat|cafe|café)\b/i, category: "content", item: { label: "Lyft meny & öppettider", prompt: "Lyft meny, öppettider och bordsbokning tydligare." } },
  { pattern: /\b(shop|e-handel|produkt|köp|webshop|butik)\b/i, category: "features", item: { label: "Stärk köpflödet", prompt: "Förbättra produktvisning och stärk köpflödet med tydligare CTA." } },
  { pattern: /\b(portfolio|fotograf|designer|byrå|konsult)\b/i, category: "content", item: { label: "Visa case tydligare", prompt: "Förstärk sajten med tydligare case, resultat och social proof." } },
];

export function getPostGenSuggestions(messages: ChatMessage[]): SuggestionCategory[] {
  const context = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ")
    .toLowerCase();

  const categories = STATIC_CATEGORIES.map((cat) => ({ ...cat, items: [...cat.items] }));

  for (const rule of DOMAIN_ITEMS) {
    if (rule.pattern.test(context)) {
      const cat = categories.find((c) => c.id === rule.category);
      if (cat && !cat.items.some((i) => i.label === rule.item.label)) {
        cat.items.unshift(rule.item);
      }
    }
  }

  return categories;
}
