#!/usr/bin/env tsx
/**
 * SEO-landning CLI: genererar LLM-baserat innehåll till
 * `src/content/seo-landings/{family}/{slug}.json` för alla slugs i
 * `src/content/seo/config.ts`.
 *
 * Flaggor:
 *  --family=<city|usecase|industry|ai|compare|city-usecase|all>
 *    (default "all")
 *  --limit=<n>            Max antal slugs i denna körning (per familj).
 *  --force                Tvinga omgenerering även om JSON redan finns.
 *  --model=<provider/id>  Default: "anthropic/claude-sonnet-4-5".
 *  --concurrency=<n>      Default: 5.
 *
 * Exempel:
 *   npm run seo:generate -- --family=city --limit=5
 *   npm run seo:generate -- --force --family=compare
 */

import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { generateObject } from "ai";
import { z } from "zod";

dotenv.config({ path: [".env.local", ".env"] });
import { createDirectModel } from "../../src/lib/builder/direct-model";
import {
  SEO_AI_VARIANTS,
  SEO_CITIES,
  SEO_CITY_USECASES,
  SEO_COMPARE,
  SEO_INDUSTRIES,
  SEO_USECASES,
  hrefForSeoLanding,
} from "../../src/content/seo/config";
import type {
  SeoAiConfig,
  SeoCityConfig,
  SeoCityUsecaseConfig,
  SeoCompareConfig,
  SeoIndustryConfig,
  SeoLandingContent,
  SeoLandingFamily,
  SeoUsecaseConfig,
} from "../../src/content/seo/types";

type Family = SeoLandingFamily | "all";

interface CliArgs {
  family: Family;
  limit: number | null;
  force: boolean;
  model: string;
  concurrency: number;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5";

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    family: "all",
    limit: null,
    force: false,
    model: DEFAULT_MODEL,
    concurrency: 5,
  };

  for (const raw of argv) {
    if (raw === "--force") {
      args.force = true;
    } else if (raw.startsWith("--family=")) {
      const value = raw.slice("--family=".length) as Family;
      args.family = value;
    } else if (raw.startsWith("--limit=")) {
      const num = Number(raw.slice("--limit=".length));
      if (Number.isFinite(num) && num > 0) args.limit = num;
    } else if (raw.startsWith("--model=")) {
      args.model = raw.slice("--model=".length);
    } else if (raw.startsWith("--concurrency=")) {
      const num = Number(raw.slice("--concurrency=".length));
      if (Number.isFinite(num) && num > 0) args.concurrency = num;
    }
  }

  return args;
}

const CONTENT_ROOT = path.resolve(process.cwd(), "src/content/seo-landings");

function familyDir(family: SeoLandingFamily): string {
  return path.join(CONTENT_ROOT, family);
}

function fileBaseForSlug(family: SeoLandingFamily, slug: string): string {
  return family === "city-usecase" ? slug.replace(/\//g, "__") : slug;
}

function targetFile(family: SeoLandingFamily, slug: string): string {
  return path.join(familyDir(family), `${fileBaseForSlug(family, slug)}.json`);
}

/* ── Zod-schema (LLM-output) ─────────────────────────────────────── */

/**
 * Schema skickas till LLM via AI SDK:s `generateObject`. Det har medvetet inga
 * `.min()/.max()` på arrayer, eftersom:
 *   - Anthropic vägrar JSON Schema med `minItems > 1`.
 *   - OpenAI strict mode vägrar `.optional()` utan att fältet listas i `required`.
 * Längd-/count-regler upprätthålls istället i `validateGenerated` nedan.
 */
const generatedSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  heroSub: z.string(),
  introParagraphs: z.array(z.string()),
  contentBlocks: z.array(
    z.object({
      heading: z.string(),
      body: z.string(),
    }),
  ),
  faq: z.array(
    z.object({
      q: z.string(),
      a: z.string(),
    }),
  ),
  localOrIndustryContext: z.string().nullable(),
});

type GeneratedPayload = z.infer<typeof generatedSchema>;

class GenerationValidationError extends Error {}

function validateGenerated(payload: GeneratedPayload): void {
  const check = (cond: boolean, msg: string) => {
    if (!cond) throw new GenerationValidationError(msg);
  };

  check(payload.title.length >= 20 && payload.title.length <= 95, "title length out of range");
  check(
    payload.metaDescription.length >= 110 && payload.metaDescription.length <= 180,
    "metaDescription length out of range",
  );
  check(payload.h1.length >= 10 && payload.h1.length <= 120, "h1 length out of range");
  check(payload.heroSub.length >= 10 && payload.heroSub.length <= 220, "heroSub length out of range");
  check(
    payload.introParagraphs.length >= 2 && payload.introParagraphs.length <= 4,
    "introParagraphs count out of range",
  );
  for (const p of payload.introParagraphs) {
    check(p.length >= 60, "intro paragraph too short");
  }
  check(
    payload.contentBlocks.length >= 3 && payload.contentBlocks.length <= 6,
    "contentBlocks count out of range",
  );
  for (const block of payload.contentBlocks) {
    check(block.heading.length >= 5, "content heading too short");
    check(block.body.length >= 60, "content body too short");
  }
  check(payload.faq.length >= 5 && payload.faq.length <= 8, "faq count out of range");
  for (const entry of payload.faq) {
    check(entry.q.length >= 8, "faq question too short");
    check(entry.a.length >= 30, "faq answer too short");
  }
}

/* ── Prompt-byggare ──────────────────────────────────────────────── */

const BASE_INSTRUCTIONS = `
Du skriver SEO-optimerat innehåll för Sajtmaskin — en svenskspråkig AI-plattform
som låter svenska företag bygga hemsidor på minuter via chat, utan kod.

Kärnfakta om Sajtmaskin:
- 100% svenskt gränssnitt, stöd och content.
- AI genererar hela sajten från en prompt.
- Publicera på egen domän; ingen månadsavgift för hosting på subdomän.
- Integrationer: Cal.com (bokning), Stripe (betalning), Google Analytics,
  Shopify (webshop).
- Ingen bindningstid; exportera koden när du vill.
- Byggt i Sverige av Pretty Good AB.

Riktlinjer för all text:
- Duzande, varm och konkret ton. Inga marknadsklichéer.
- Svar-först: första stycket ska direkt förklara vad sidan handlar om.
- Skriv specifikt för kontexten (stad/bransch/AI-variant/konkurrent) så sidan
  inte känns som en mallkopia.
- Undvik sifferpåhitt. Om du inte vet exakt, håll det allmänt.
- Inga emojis. Inga hashtags. Inga Markdown-rubriker i kropp.
- Följ ALLTID JSON-schemat.

Längdkrav (måste följas):
- title: 30–80 tecken, gärna avslutad med " | Sajtmaskin" eller liknande.
- metaDescription: 120–165 tecken.
- h1: 20–80 tecken.
- heroSub: 30–160 tecken, en mening.
- introParagraphs: EXAKT 2 eller 3 stycken, 80–500 tecken vardera.
- contentBlocks: EXAKT 3, 4 eller 5 block. Varje heading 5–70 tecken, body
  100–700 tecken.
- faq: EXAKT 5, 6 eller 7 frågor. Varje q 10–150 tecken, varje a 60–450 tecken.
- localOrIndustryContext: 80–400 tecken, eller null om inte relevant.
`.trim();

function buildCityPrompt(city: SeoCityConfig): string {
  return `
Skriv en SEO-landningssida som ranker på sökningar kring "hemsida ${city.label}"
och "skapa hemsida ${city.label}" för Sajtmaskin.

Stad: ${city.label} (${city.region}), ca ${city.population.toLocaleString("sv-SE")} invånare.

Vinklar att täcka (välj naturligt, inte punktlistat):
- Varför Sajtmaskin passar företag i ${city.label}.
- Hela flödet från prompt till publicerad sajt.
- Lokal SEO + hur orten hjälper sökbarhet.
- Jämförelse mot lokala byråer och gör-det-själv-verktyg.
- Exempel på branscher/stadsdelar/områden där Sajtmaskin är relevant.
`.trim();
}

function buildUsecasePrompt(u: SeoUsecaseConfig): string {
  return `
Skriv en SEO-landningssida för sökordet "${u.targetKeyword}". Målgrupp:
${u.audience}.

Sidan ska:
- Förklara direkt i första stycket vad en hemsida för ${u.label.toLowerCase()}
  typiskt innehåller.
- Visa 3–5 konkreta sektioner/funktioner som en sådan sajt brukar behöva.
- Koppla till Sajtmaskin — "så här bygger du den på minuter med AI".
- Ge svar på rimliga frågor användaren har innan de bygger sin sajt.
`.trim();
}

function buildIndustryPrompt(i: SeoIndustryConfig): string {
  return `
Skriv en SEO-landningssida för sökordet "${i.targetKeyword}". Bransch:
${i.label}. Typiska tjänster eller kunder: ${i.typicalServices}.

Sidan ska:
- Beskriva vilka problem en hemsida för ${i.label.toLowerCase()} löser.
- Visa struktur en sådan sajt brukar ha (sidor, funktioner).
- Visa hur Sajtmaskin kan bygga just den typen av sajt.
- Inkludera lokal tonalitet och konkreta svenska exempel.
`.trim();
}

function buildAiPrompt(a: SeoAiConfig): string {
  return `
Skriv en SEO-landningssida som svarar på "${a.targetKeyword}". Användaren undrar
specifikt: ${a.searchIntent}.

Sidan ska:
- Ge direkt, ärligt svar i första stycket (inga marknadsfraser).
- Förklara hur AI konkret används för att bygga en hemsida.
- Jämföra med gamla metoder (mallbyggare, byråer) utan att bli negativ.
- Landa i att Sajtmaskin är ett konkret sätt att prova detta i Sverige.
`.trim();
}

function buildComparePrompt(c: SeoCompareConfig): string {
  return `
Skriv en SEO-landningssida "${c.targetKeyword}" där Sajtmaskin presenteras som
alternativ till ${c.label} (${c.competitorSummary}).

Sidan ska:
- Förklara varför någon söker alternativ till ${c.label}.
- Vara rättvis: erkänn styrkor hos ${c.label}, visa var Sajtmaskin passar bättre
  för svenska behov.
- Lyfta AI, svenskt språk, svensk support och ingen byråkostnad.
- Ha en FAQ som besvarar de verkliga jämförelse-frågorna.
- Undvika nedlåtande ton. Ingen förtal. Endast saklig positionering.
`.trim();
}

function buildCityUsecasePrompt(cu: SeoCityUsecaseConfig): string {
  return `
Skriv en SEO-landningssida för sökordet "${cu.targetKeyword}".

Stad: ${cu.cityLabel}. Typ av hemsida: ${cu.usecaseLabel.toLowerCase()}.

Sidan ska:
- Kombinera ortsspecifik kontext med typ-specifikt innehåll.
- Förklara vad en ${cu.usecaseLabel.toLowerCase()}-sajt i ${cu.cityLabel}
  typiskt behöver.
- Visa hur Sajtmaskin bygger denna typ av sajt för företag i ${cu.cityLabel}.
- Ha FAQ med både generella och ortsspecifika frågor.
`.trim();
}

function buildPrompt(family: SeoLandingFamily, slug: string): string {
  switch (family) {
    case "city": {
      const entry = SEO_CITIES.find((c) => c.slug === slug);
      if (!entry) throw new Error(`Unknown city slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildCityPrompt(entry)}`;
    }
    case "usecase": {
      const entry = SEO_USECASES.find((u) => u.slug === slug);
      if (!entry) throw new Error(`Unknown usecase slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildUsecasePrompt(entry)}`;
    }
    case "industry": {
      const entry = SEO_INDUSTRIES.find((i) => i.slug === slug);
      if (!entry) throw new Error(`Unknown industry slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildIndustryPrompt(entry)}`;
    }
    case "ai": {
      const entry = SEO_AI_VARIANTS.find((a) => a.slug === slug);
      if (!entry) throw new Error(`Unknown AI slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildAiPrompt(entry)}`;
    }
    case "compare": {
      const entry = SEO_COMPARE.find((c) => c.slug === slug);
      if (!entry) throw new Error(`Unknown compare slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildComparePrompt(entry)}`;
    }
    case "city-usecase": {
      const entry = SEO_CITY_USECASES.find((cu) => cu.slug === slug);
      if (!entry) throw new Error(`Unknown city-usecase slug: ${slug}`);
      return `${BASE_INSTRUCTIONS}\n\n${buildCityUsecasePrompt(entry)}`;
    }
  }
}

/* ── Interna länkar (deterministiska) ────────────────────────────── */

function pickInternalLinks(
  family: SeoLandingFamily,
  slug: string,
): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];

  const topCities = SEO_CITIES.slice(0, 6);
  const topUsecases = SEO_USECASES.slice(0, 4);

  if (family === "city") {
    for (const city of topCities) {
      if (city.slug === slug) continue;
      links.push({
        href: hrefForSeoLanding("city", city.slug),
        label: `Skapa hemsida i ${city.label}`,
      });
      if (links.length >= 4) break;
    }
    for (const u of topUsecases) {
      links.push({
        href: hrefForSeoLanding("usecase", u.slug),
        label: `Hemsida för ${u.label.toLowerCase()}`,
      });
    }
  } else if (family === "usecase") {
    for (const u of topUsecases) {
      if (u.slug === slug) continue;
      links.push({
        href: hrefForSeoLanding("usecase", u.slug),
        label: `Hemsida för ${u.label.toLowerCase()}`,
      });
    }
    for (const city of topCities.slice(0, 4)) {
      links.push({
        href: hrefForSeoLanding("city", city.slug),
        label: `Skapa hemsida i ${city.label}`,
      });
    }
  } else if (family === "industry") {
    const others = SEO_INDUSTRIES.filter((i) => i.slug !== slug).slice(0, 4);
    for (const ind of others) {
      links.push({
        href: hrefForSeoLanding("industry", ind.slug),
        label: `Hemsida för ${ind.label.toLowerCase()}`,
      });
    }
    for (const city of topCities.slice(0, 3)) {
      links.push({
        href: hrefForSeoLanding("city", city.slug),
        label: `Skapa hemsida i ${city.label}`,
      });
    }
  } else if (family === "ai") {
    const others = SEO_AI_VARIANTS.filter((a) => a.slug !== slug).slice(0, 4);
    for (const ai of others) {
      links.push({
        href: hrefForSeoLanding("ai", ai.slug),
        label: ai.label,
      });
    }
    for (const u of topUsecases.slice(0, 3)) {
      links.push({
        href: hrefForSeoLanding("usecase", u.slug),
        label: `Hemsida för ${u.label.toLowerCase()}`,
      });
    }
  } else if (family === "compare") {
    const others = SEO_COMPARE.filter((c) => c.slug !== slug).slice(0, 4);
    for (const c of others) {
      links.push({
        href: hrefForSeoLanding("compare", c.slug),
        label: `Alternativ till ${c.label}`,
      });
    }
    for (const city of topCities.slice(0, 3)) {
      links.push({
        href: hrefForSeoLanding("city", city.slug),
        label: `Skapa hemsida i ${city.label}`,
      });
    }
  } else if (family === "city-usecase") {
    const [citySlug] = slug.split("/");
    const city = SEO_CITIES.find((c) => c.slug === citySlug);
    if (city) {
      links.push({
        href: hrefForSeoLanding("city", city.slug),
        label: `Skapa hemsida i ${city.label}`,
      });
    }
    for (const u of topUsecases.slice(0, 4)) {
      links.push({
        href: hrefForSeoLanding("usecase", u.slug),
        label: `Hemsida för ${u.label.toLowerCase()}`,
      });
    }
  }

  return links.slice(0, 8);
}

function buildCta(family: SeoLandingFamily, slug: string): {
  prompt: string;
  buttonLabel: string;
} {
  const buttonLabel = "Skapa din hemsida gratis";
  switch (family) {
    case "city": {
      const city = SEO_CITIES.find((c) => c.slug === slug);
      return {
        buttonLabel,
        prompt: `Jag vill skapa en hemsida för min verksamhet i ${city?.label ?? slug}. Hjälp mig komma igång.`,
      };
    }
    case "usecase": {
      const u = SEO_USECASES.find((x) => x.slug === slug);
      return {
        buttonLabel,
        prompt: `Jag vill skapa en ${u?.label.toLowerCase() ?? slug}-hemsida. Hjälp mig att komma igång.`,
      };
    }
    case "industry": {
      const i = SEO_INDUSTRIES.find((x) => x.slug === slug);
      return {
        buttonLabel,
        prompt: `Jag driver en ${i?.label.toLowerCase() ?? slug}-verksamhet och behöver en hemsida. Hjälp mig komma igång.`,
      };
    }
    case "ai":
      return {
        buttonLabel,
        prompt: "Jag vill bygga min hemsida med AI. Hjälp mig komma igång.",
      };
    case "compare": {
      const c = SEO_COMPARE.find((x) => x.slug === slug);
      return {
        buttonLabel,
        prompt: `Jag funderar på att byta från ${c?.label ?? slug}. Hjälp mig bygga min nya hemsida med Sajtmaskin.`,
      };
    }
    case "city-usecase": {
      const cu = SEO_CITY_USECASES.find((x) => x.slug === slug);
      if (!cu) {
        return { buttonLabel, prompt: "Hjälp mig skapa min hemsida." };
      }
      return {
        buttonLabel,
        prompt: `Jag behöver en ${cu.usecaseLabel.toLowerCase()}-hemsida för min verksamhet i ${cu.cityLabel}. Hjälp mig komma igång.`,
      };
    }
  }
}

/* ── LLM-anrop + retry ───────────────────────────────────────────── */

async function generateContent(
  family: SeoLandingFamily,
  slug: string,
  model: string,
): Promise<GeneratedPayload> {
  const prompt = buildPrompt(family, slug);

  let lastErr: unknown;
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: createDirectModel(model),
        schema: generatedSchema,
        prompt,
        temperature: 0.7,
      });
      validateGenerated(object);
      return object;
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message || "";
      const isRateLimit = /rate limit|429|exceed.*tokens|quota/i.test(msg);
      const baseDelay = isRateLimit ? 20_000 : 1_500;
      const delayMs = baseDelay * attempt;
      console.warn(
        `  [retry ${attempt}/${maxAttempts}] ${family}/${slug} (wait ${Math.round(
          delayMs / 1000,
        )}s): ${msg.slice(0, 160)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/* ── Filsystem + concurrency ─────────────────────────────────────── */

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(file: string, content: SeoLandingContent): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(content, null, 2)}\n`, "utf8");
}

interface Task {
  family: SeoLandingFamily;
  slug: string;
}

function buildAllTasks(selectedFamily: Family, limit: number | null): Task[] {
  const families: SeoLandingFamily[] = [
    "city",
    "usecase",
    "industry",
    "ai",
    "compare",
    "city-usecase",
  ];
  const targetFamilies =
    selectedFamily === "all" ? families : [selectedFamily as SeoLandingFamily];

  const tasks: Task[] = [];
  for (const family of targetFamilies) {
    const slugs =
      family === "city"
        ? SEO_CITIES.map((c) => c.slug)
        : family === "usecase"
          ? SEO_USECASES.map((u) => u.slug)
          : family === "industry"
            ? SEO_INDUSTRIES.map((i) => i.slug)
            : family === "ai"
              ? SEO_AI_VARIANTS.map((a) => a.slug)
              : family === "compare"
                ? SEO_COMPARE.map((c) => c.slug)
                : SEO_CITY_USECASES.map((cu) => cu.slug);
    const scoped = typeof limit === "number" ? slugs.slice(0, limit) : slugs;
    for (const slug of scoped) {
      tasks.push({ family, slug });
    }
  }
  return tasks;
}

/** Enkel semafor — undviker ny dep på p-limit. */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const fn = queue.shift();
    if (!fn) return;
    active++;
    fn();
  };

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then((value) => {
            active--;
            resolve(value);
            next();
          })
          .catch((err) => {
            active--;
            reject(err);
            next();
          });
      });
      next();
    });
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("SEO generator — config:", args);

  const tasks = buildAllTasks(args.family, args.limit);
  console.log(`Total tasks: ${tasks.length}`);

  const limiter = createLimiter(args.concurrency);
  let done = 0;
  let skipped = 0;
  let failed = 0;

  await Promise.all(
    tasks.map((task) =>
      limiter(async () => {
        const file = targetFile(task.family, task.slug);
        if (!args.force && (await fileExists(file))) {
          skipped++;
          return;
        }
        try {
          const generated = await generateContent(task.family, task.slug, args.model);
          const content: SeoLandingContent = {
            family: task.family,
            slug: task.slug,
            title: generated.title,
            metaDescription: generated.metaDescription,
            h1: generated.h1,
            heroSub: generated.heroSub,
            introParagraphs: generated.introParagraphs,
            contentBlocks: generated.contentBlocks,
            faq: generated.faq,
            localOrIndustryContext: generated.localOrIndustryContext ?? undefined,
            internalLinks: pickInternalLinks(task.family, task.slug),
            cta: buildCta(task.family, task.slug),
            generatedAt: new Date().toISOString().slice(0, 10),
            model: args.model,
          };
          await writeJson(file, content);
          done++;
          console.log(
            `  ✓ ${task.family}/${task.slug}  (${done + skipped + failed}/${tasks.length})`,
          );
        } catch (err) {
          failed++;
          console.error(
            `  ✗ ${task.family}/${task.slug}: ${(err as Error).message?.slice(0, 200)}`,
          );
        }
      }),
    ),
  );

  console.log(
    `\nKlar. Genererade ${done}, hoppades över ${skipped}, misslyckades ${failed}.`,
  );
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
