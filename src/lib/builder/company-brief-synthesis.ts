/**
 * AI Synthesis — converts a CompanyIntelResult into a structured Brief
 * that the generation engine already understands.
 *
 * Uses GPT to analyze all collected material and produce concrete
 * content for each page section.
 */

import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/gateway-policy";
import type { Brief } from "@/lib/gen/system-prompt";
import type { CompanyIntelResult } from "@/lib/builder/company-intel";

const SYNTHESIS_MODEL = "openai/gpt-5.4";
const MAX_CORPUS_CHARS = 12000;

function truncateCorpus(corpus: string): string {
  if (corpus.length <= MAX_CORPUS_CHARS) return corpus;
  return corpus.slice(0, MAX_CORPUS_CHARS) + "\n\n[...trunkerat]";
}

function buildSynthesisPrompt(
  intel: CompanyIntelResult,
  siteType?: string,
  userPreferences?: string,
): string {
  const sections: string[] = [];

  sections.push(`Du är en senior digital strateg. Analysera all insamlad information om ett företag och skapa ett strukturerat "Content Brief" i JSON-format.`);

  sections.push(`\n## Insamlad data\n\n${truncateCorpus(intel.rawTextCorpus)}`);

  if (siteType) {
    sections.push(`\n## Önskad sajttyp: ${siteType}`);
  }
  if (userPreferences) {
    sections.push(`\n## Användarens egna önskemål\n${userPreferences}`);
  }

  if (intel.registryInfo?.found) {
    const r = intel.registryInfo;
    sections.push(
      `\n## Bolagsregisterdata`,
      [
        r.companyName && `Företagsnamn: ${r.companyName}`,
        r.industries?.length && `Branscher: ${r.industries.join(", ")}`,
        r.employees != null && `Anställda: ${r.employees}`,
        r.city && `Stad: ${r.city}`,
        r.address && `Adress: ${r.address}`,
        r.ceo && `VD: ${r.ceo}`,
        r.homepage && `Hemsida: ${r.homepage}`,
        r.purpose && `Ändamål: ${r.purpose}`,
        r.revenueKsek != null && `Omsättning: ${r.revenueKsek} KSEK`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (intel.socialSnippets.length > 0) {
    sections.push(
      `\n## Hittade sociala medie-profiler`,
      intel.socialSnippets
        .map((s) => `- ${s.platform}: ${s.snippet} (${s.url})`)
        .join("\n"),
    );
  }

  if (intel.newsSnippets.length > 0) {
    sections.push(
      `\n## Nyheter och omnämnanden`,
      intel.newsSnippets
        .slice(0, 5)
        .map((n) => `- ${n.title}: ${n.snippet}`)
        .join("\n"),
    );
  }

  sections.push(`
## Instruktioner

Baserat på ALL information ovan, skapa ett JSON-objekt med denna exakta struktur:

{
  "brandName": "Företagets namn",
  "oneSentencePitch": "En mening som sammanfattar företagets erbjudande — säljande och koncist",
  "tagline": "Kort tagline/slogan för hemsidan",
  "targetAudience": "Vem riktar sig företaget till",
  "primaryCallToAction": "Viktigaste åtgärden besökaren ska ta (ex: 'Boka konsultation', 'Kontakta oss')",
  "toneAndVoice": ["professionell", "varm", "modern"],
  "visualDirection": {
    "styleKeywords": ["minimalistisk", "ljus", "modern"],
    "colorPalette": {
      "primary": "#hex", "secondary": "#hex", "accent": "#hex",
      "background": "#hex", "text": "#hex"
    },
    "typography": {
      "headings": "Modern sans-serif (t.ex. Inter, Geist)",
      "body": "Läsbar sans-serif"
    }
  },
  "pages": [
    {
      "name": "Hem",
      "path": "/",
      "purpose": "Första intrycket — pitch, CTA, socialt bevis",
      "sections": [
        {
          "type": "hero",
          "heading": "Faktisk rubriktext här",
          "suggestedContent": "Kort, säljande mening under rubriken. Max 2 meningar."
        },
        {
          "type": "services",
          "heading": "Våra tjänster",
          "suggestedContent": "Vi erbjuder helhetslösningar inom...",
          "bullets": ["Tjänst 1: Konkret beskrivning i 1-2 meningar", "Tjänst 2: Konkret beskrivning", "Tjänst 3: Konkret beskrivning"]
        },
        {
          "type": "about-preview",
          "heading": "Om företaget",
          "suggestedContent": "Kort men innehållsrik sammanfattning av företaget. 3-4 meningar som skapar förtroende."
        },
        {
          "type": "testimonials",
          "heading": "Vad våra kunder säger",
          "suggestedContent": "Socialt bevis — citat, kundrecensioner eller samarbetspartners.",
          "bullets": ["\"Citat från kund eller samarbetspartner\" — Namn, Roll", "\"Ytterligare citat\" — Namn, Roll"]
        },
        {
          "type": "cta-banner",
          "heading": "Redo att komma igång?",
          "suggestedContent": "Uppmaning att ta kontakt. 1 mening + CTA-knapp."
        },
        {
          "type": "contact-preview",
          "heading": "Kontakt",
          "suggestedContent": "Adress, telefon, e-post. Karta-hint om möjligt."
        }
      ]
    },
    {
      "name": "Om oss",
      "path": "/about",
      "purpose": "Djupare info om företaget, historia, team, värderingar",
      "sections": [
        {
          "type": "page-hero",
          "heading": "Om oss",
          "suggestedContent": "1-2 meningar som sammanfattar företagets vision"
        },
        {
          "type": "company-story",
          "heading": "Vår historia",
          "suggestedContent": "Utförlig, engagerande text (5-8 meningar) om företaget, dess grundande, utveckling och vision. Baserat på ALL insamlad information."
        },
        {
          "type": "values",
          "heading": "Våra värderingar",
          "bullets": ["Värdering 1: Beskrivning", "Värdering 2: Beskrivning", "Värdering 3: Beskrivning"]
        },
        {
          "type": "team",
          "heading": "Teamet",
          "suggestedContent": "Kort beskrivning av teamet eller nyckelpersoner om info finns."
        }
      ]
    },
    {
      "name": "Kontakt",
      "path": "/contact",
      "purpose": "Fullständig kontaktinfo + formulär",
      "sections": [
        {
          "type": "contact-info",
          "heading": "Kontakta oss",
          "suggestedContent": "Komplett med adress, telefonnummer, e-post, öppettider.",
          "bullets": ["Adress: Gatuadress, Postnummer Stad", "Telefon: 0xx-xxx xx xx", "E-post: info@foretag.se"]
        },
        {
          "type": "contact-form",
          "heading": "Skicka ett meddelande",
          "suggestedContent": "Kontaktformulär med namn, e-post, meddelande."
        }
      ]
    }
  ],
  "imagery": {
    "styleKeywords": ["professionell", "ljus"],
    "suggestedSubjects": ["kontorsmiljö", "team"],
    "styleNotes": ["Undvik stockfotos — använd verkliga bilder om möjligt"]
  },
  "mustHave": ["Kontaktformulär", "Mobilanpassning"],
  "avoid": ["Generisk stocktext", "Lorem ipsum"],
  "seo": {
    "titleTemplate": "%s | Företagsnamn",
    "metaDescription": "SEO-beskrivning",
    "keywords": ["sökord1", "sökord2"]
  },
  "logoHandling": {
    "hasLogo": true/false,
    "instruction": "Visa logotyp i header. Skriv INTE ut företagsnamnet som text bredvid logotypen om logotyp finns."
  }
}

VIKTIGA REGLER:
1. Sektionernas "suggestedContent" ska vara FAKTISK text — inte instruktioner. Skriv riktiga rubriker, riktiga brödtexter, riktiga tjänstebeskrivningar baserat på den information du har.
2. Om en logo hittats (bilder i scrape), ange "hasLogo": true och instruera att BARA visa logon i header, INTE skriva företagsnamnet som text bredvid.
3. Skriv på SVENSKA om inte annat framgår av materialet.
4. Var säljande men sanningsenlig — hitta inte på tjänster eller produkter som inte framgår av materialet.
5. Om information saknas för en sektion, skriv generisk men passande text för branschen.
6. Inkludera bara sidor som behövs, men VARJE sida ska ha MINST 3-4 sektioner med verkligt innehåll.

REGLER FÖR INNEHÅLLSDENSITET (KRITISKT):
7. INGEN sida får ha bara en hero och sedan tom yta. Varje sida ska fyllas med minst 3 meningsfulla sektioner.
8. Startsidan ska ha 5-6 sektioner: hero, tjänster/produkter, om oss (preview), socialt bevis, CTA-banner, kontakt-preview.
9. Undersidor (Om oss, Kontakt) ska ha minst 3 sektioner med rik text.
10. Om en sida inte kan fyllas med tillräckligt innehåll — slå ihop den med en annan sida istället.
11. Varje "suggestedContent" ska vara MINST 2-3 meningar, inte bara en platshållare.

REGLER FÖR SMART INNEHÅLLSPLACERING:
12. Hero: ETT starkt budskap + CTA. Använd oneSentencePitch som utgångspunkt.
13. Om oss: Omskriven, professionell text (5-8 meningar) baserat på skrapad info + bolagsdata. INTE kopierad rakt av.
14. Tjänster/Produkter: Strukturerat med individuella kort/bullets. Varje tjänst ska ha namn + 1-2 meningars beskrivning. MINST 3 tjänster.
15. Kontakt: Komplett med adress, telefon, e-post. Inkludera Google Maps-hint om stad finns.
16. Socialt bevis / omdömen: Inkludera ALLTID en sektion för detta. Om inga riktiga citat finns, skriv trovärdiga exempel.
17. Footer: Alltid inkludera kontaktinfo + sociala medialänkar.
18. Navigation: Enkel, flat navigation. Max 5-6 menypunkter. Skapa INTE sidor som bara har en hero — det ger döda ytor.

Returnera BARA JSON-objektet, inget annat.`);

  return sections.join("\n");
}

export interface SynthesizeBriefOptions {
  intel: CompanyIntelResult;
  siteType?: string;
  userPreferences?: string;
}

export async function synthesizeCompanyBrief(
  opts: SynthesizeBriefOptions,
): Promise<Brief> {
  const prompt = buildSynthesisPrompt(
    opts.intel,
    opts.siteType,
    opts.userPreferences,
  );

  const result = await generateText({
    model: createDirectModel(SYNTHESIS_MODEL),
    prompt,
    maxRetries: 2,
    maxOutputTokens: 4000,
    temperature: 0.4,
  });

  const text = result.text?.trim() || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[BriefSynthesis] No JSON found in response:", text.slice(0, 200));
    throw new Error("AI synthesis did not return valid JSON");
  }

  try {
    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return normalizeBrief(raw);
  } catch (err) {
    console.error("[BriefSynthesis] JSON parse failed:", err);
    throw new Error("AI synthesis returned malformed JSON");
  }
}

/**
 * Normalizes the raw AI output to match the Brief interface,
 * including mapping `suggestedContent` on sections to `bullets`.
 */
function normalizeBrief(raw: Record<string, unknown>): Brief {
  const brief: Brief = {};

  if (typeof raw.brandName === "string") brief.brandName = raw.brandName;
  if (typeof raw.projectTitle === "string") brief.projectTitle = raw.projectTitle;
  if (typeof raw.oneSentencePitch === "string") brief.oneSentencePitch = raw.oneSentencePitch;
  if (typeof raw.tagline === "string") brief.tagline = raw.tagline;
  if (typeof raw.targetAudience === "string") brief.targetAudience = raw.targetAudience;
  if (typeof raw.primaryCallToAction === "string") brief.primaryCallToAction = raw.primaryCallToAction;
  if (typeof raw.siteName === "string") brief.siteName = raw.siteName;

  if (Array.isArray(raw.toneAndVoice)) {
    brief.toneAndVoice = raw.toneAndVoice.filter((v): v is string => typeof v === "string");
  }

  if (raw.visualDirection && typeof raw.visualDirection === "object") {
    const vd = raw.visualDirection as Record<string, unknown>;
    brief.visualDirection = {};
    if (Array.isArray(vd.styleKeywords)) {
      brief.visualDirection.styleKeywords = vd.styleKeywords.filter(
        (v): v is string => typeof v === "string",
      );
    }
    if (vd.colorPalette && typeof vd.colorPalette === "object") {
      const cp = vd.colorPalette as Record<string, unknown>;
      brief.visualDirection.colorPalette = {
        primary: typeof cp.primary === "string" ? cp.primary : undefined,
        secondary: typeof cp.secondary === "string" ? cp.secondary : undefined,
        accent: typeof cp.accent === "string" ? cp.accent : undefined,
        background: typeof cp.background === "string" ? cp.background : undefined,
        text: typeof cp.text === "string" ? cp.text : undefined,
      };
    }
    if (vd.typography && typeof vd.typography === "object") {
      const tp = vd.typography as Record<string, unknown>;
      brief.visualDirection.typography = {
        headings: typeof tp.headings === "string" ? tp.headings : undefined,
        body: typeof tp.body === "string" ? tp.body : undefined,
      };
    }
  }

  if (Array.isArray(raw.pages)) {
    brief.pages = (raw.pages as Array<Record<string, unknown>>).map((p) => ({
      name: typeof p.name === "string" ? p.name : undefined,
      path: typeof p.path === "string" ? p.path : undefined,
      purpose: typeof p.purpose === "string" ? p.purpose : undefined,
      sections: Array.isArray(p.sections)
        ? (p.sections as Array<Record<string, unknown>>).map((s) => {
            const bullets: string[] = [];
            if (Array.isArray(s.bullets)) {
              bullets.push(
                ...s.bullets.filter((b): b is string => typeof b === "string"),
              );
            }
            if (typeof s.suggestedContent === "string" && s.suggestedContent) {
              bullets.push(s.suggestedContent);
            }
            return {
              type: typeof s.type === "string" ? s.type : undefined,
              heading: typeof s.heading === "string" ? s.heading : undefined,
              bullets: bullets.length > 0 ? bullets : undefined,
            };
          })
        : undefined,
    }));
  }

  if (raw.imagery && typeof raw.imagery === "object") {
    const im = raw.imagery as Record<string, unknown>;
    brief.imagery = {};
    if (Array.isArray(im.styleKeywords))
      brief.imagery.styleKeywords = im.styleKeywords.filter((v): v is string => typeof v === "string");
    if (Array.isArray(im.suggestedSubjects))
      brief.imagery.suggestedSubjects = im.suggestedSubjects.filter((v): v is string => typeof v === "string");
    if (Array.isArray(im.styleNotes))
      brief.imagery.styleNotes = im.styleNotes.filter((v): v is string => typeof v === "string");
  }

  if (Array.isArray(raw.mustHave)) {
    brief.mustHave = raw.mustHave.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(raw.avoid)) {
    brief.avoid = raw.avoid.filter((v): v is string => typeof v === "string");
  }

  if (raw.seo && typeof raw.seo === "object") {
    const seo = raw.seo as Record<string, unknown>;
    brief.seo = {
      titleTemplate: typeof seo.titleTemplate === "string" ? seo.titleTemplate : undefined,
      metaDescription: typeof seo.metaDescription === "string" ? seo.metaDescription : undefined,
      keywords: Array.isArray(seo.keywords)
        ? seo.keywords.filter((v): v is string => typeof v === "string")
        : undefined,
    };
  }

  if (raw.logoHandling && typeof raw.logoHandling === "object") {
    const lh = raw.logoHandling as Record<string, unknown>;
    if (lh.hasLogo) {
      if (!brief.avoid) brief.avoid = [];
      brief.avoid.push("Visa INTE företagsnamnet som text bredvid logotypen i headern");
    }
    if (typeof lh.instruction === "string") {
      if (!brief.mustHave) brief.mustHave = [];
      brief.mustHave.push(lh.instruction);
    }
  }

  return brief;
}
