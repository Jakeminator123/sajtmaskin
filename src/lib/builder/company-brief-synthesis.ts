/**
 * AI Synthesis — converts a CompanyIntelResult into a structured Brief
 * that the generation engine already understands.
 *
 * Also provides wizard-field extraction: a second AI call that maps
 * scraped data to every field the Intake Wizard asks about.
 */

import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/gateway-policy";
import type { Brief } from "@/lib/gen/system-prompt";
import type { CompanyIntelResult } from "@/lib/builder/company-intel";

const SYNTHESIS_MODEL = "openai/gpt-5.4";
const MAX_CORPUS_CHARS = 12000;
const MAX_WIZARD_CORPUS_CHARS = 18000;

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
4. ABSOLUT FÖRBJUDET att hitta på: företagsnamn, adresser, telefonnummer, e-postadresser, org.nr, VD-namn, omsättningssiffror, antal anställda, eller kundcitat. Använd ENBART data som finns i den insamlade informationen ovan.
5. Om en uppgift saknas (t.ex. telefonnummer), skriv INTE ett påhittat nummer — utelämna den uppgiften eller skriv "[Telefonnummer]" som platshållare.
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
15. Kontakt: Använd ENBART kontaktuppgifter som finns i den insamlade datan. Skriv INTE påhittade telefonnummer eller adresser. Om uppgifter saknas, använd platshållare: "[Telefonnummer]", "[E-post]", "[Adress]".
16. Socialt bevis / omdömen: Om riktiga kundcitat finns i materialet, använd dem. Om inga finns, utelämna sektionen eller skriv "Kundrecensioner kommer snart" — hitta INTE PÅ citat.
17. Footer: Inkludera kontaktinfo + sociala medialänkar som faktiskt hittats.
18. Navigation: Enkel, flat navigation. Max 5-6 menypunkter.

VALIDERING AV FÖRETAGSNAMN (KRITISKT):
19. "brandName" MÅSTE vara det exakta företagsnamnet som framgår av den insamlade informationen. Gissa INTE — om inget tydligt namn hittas, använd domännamnet som det ser ut.

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

/* ================================================================== */
/*  Wizard-field extraction                                            */
/* ================================================================== */

export interface WizardFieldsResult {
  companyName?: string;
  offer?: string;
  phone?: string;
  email?: string;
  address?: string;
  openingHours?: string;
  tagline?: string;
  tone?: string;
  designStyle?: string;
  services?: string[];
  uniqueSellingPoints?: string[];
  testimonials?: string[];
  menuItems?: Array<{ name: string; description?: string; price?: string }>;
  products?: Array<{ name: string; price?: string; image?: string }>;
  treatments?: Array<{ name: string; price?: string; duration?: string }>;
  teamMembers?: Array<{ name: string; role?: string }>;
  projects?: Array<{ name: string; description?: string; url?: string }>;
  cuisine?: string[];
  acceptsReservations?: boolean;
  delivery?: boolean;
  bookingUrl?: string;
  paymentMethods?: string[];
  shippingInfo?: string;
  priceRange?: string;
  topics?: string[];
  brandColors?: string[];
  categorySpecific?: Record<string, string | string[] | boolean>;
  confidence: Record<string, "high" | "medium" | "low">;
}

function buildWizardExtractionPrompt(
  intel: CompanyIntelResult,
  userDescription?: string,
): string {
  const parts: string[] = [];

  parts.push(`Du är en expert på att extrahera strukturerad företagsinformation från webbinnehåll.

DIN UPPGIFT: Analysera ALLT innehåll nedan och extrahera så många fält som möjligt. Returnera ett JSON-objekt.

KRITISKA REGLER:
1. Extrahera BARA information som FAKTISKT finns i texten — hitta ALDRIG på data.
2. Om du inte hittar ett fält, utelämna det helt (returnera inte null eller tomma strängar).
3. Varje fält du returnerar MÅSTE ha en confidence-nivå: "high" (exakt matchning i text), "medium" (rimligt tolkad), "low" (osäker/implicit).
4. Prisuppgifter: behåll originalformat (t.ex. "149 kr", "från 299:-").
5. Kontaktuppgifter: bara exakta, aldrig påhittade.
6. Array-fält (menuItems, products, etc.): inkludera ALLA du hittar, inte bara de första 3.`);

  const corpus = intel.rawTextCorpus.length > MAX_WIZARD_CORPUS_CHARS
    ? intel.rawTextCorpus.slice(0, MAX_WIZARD_CORPUS_CHARS) + "\n\n[...trunkerat]"
    : intel.rawTextCorpus;
  parts.push(`\n## Webbinnehåll (skrapat)\n\n${corpus}`);

  if (intel.registryInfo?.found) {
    const r = intel.registryInfo;
    parts.push(
      `\n## Bolagsregisterdata`,
      [
        r.companyName && `Företagsnamn: ${r.companyName}`,
        r.industries?.length && `Branscher: ${r.industries.join(", ")}`,
        r.employees != null && `Anställda: ${r.employees}`,
        r.city && `Stad: ${r.city}`,
        r.address && `Adress: ${r.address}`,
        r.ceo && `VD: ${r.ceo}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (userDescription) {
    parts.push(`\n## Kundens egen beskrivning\n${userDescription}`);
  }

  parts.push(`
## JSON-schema att fylla i

Returnera EXAKT detta JSON-format. Utelämna fält du inte hittar info för:

{
  "companyName": "Företagets namn",
  "offer": "Kort beskrivning av vad företaget erbjuder (1-2 meningar)",
  "phone": "Telefonnummer exakt som det står",
  "email": "E-postadress exakt som den står",
  "address": "Fullständig adress",
  "openingHours": "Öppettider (fritt format, t.ex. 'Mån-Fre 09-17, Lör 10-14')",
  "tagline": "Företagets slogan/tagline",
  "tone": "Tonalitet: en av 'Professionell', 'Varm och personlig', 'Lekfull', 'Exklusiv / lyxig', 'Rak och enkel'",
  "designStyle": "Designstil baserat på befintlig sajt: en av 'Minimalistisk', 'Kraftfull', 'Elegant', 'Lekfull och färgglad'",
  "services": ["Tjänst 1", "Tjänst 2"],
  "uniqueSellingPoints": ["USP 1", "USP 2"],
  "testimonials": ["\"Citat\" — Namn, Roll", "\"Citat 2\" — Namn"],
  "menuItems": [
    {"name": "Rättens namn", "description": "Kort beskrivning", "price": "149 kr"}
  ],
  "products": [
    {"name": "Produktnamn", "price": "299 kr", "image": "URL till produktbild om den finns"}
  ],
  "treatments": [
    {"name": "Behandlingsnamn", "price": "599 kr", "duration": "60 min"}
  ],
  "teamMembers": [
    {"name": "Namn", "role": "Titel/roll"}
  ],
  "projects": [
    {"name": "Projektnamn", "description": "Kort beskrivning", "url": "URL om den finns"}
  ],
  "cuisine": ["Typ av kök, t.ex. Italienskt, Svenskt, Asiatiskt"],
  "acceptsReservations": true,
  "delivery": true,
  "bookingUrl": "URL till bokningssystem",
  "paymentMethods": ["Kort", "Swish", "Faktura"],
  "shippingInfo": "Leveransinformation (fritt format)",
  "priceRange": "Prisintervall, t.ex. '$$$' eller '200-800 kr'",
  "topics": ["Ämne 1", "Ämne 2"],
  "brandColors": ["#hex1", "#hex2"],
  "categorySpecific": {
    "returnPolicy": "Returpolicy om det är e-handel",
    "targetAudience": "Målgrupp",
    "wifi": true,
    "parking": true,
    "dietary": ["Vegetariskt", "Glutenfritt"],
    "onlineBooking": true,
    "rooms": ["Enkelrum", "Dubbelrum"],
    "amenities": ["Pool", "Gym", "Restaurang"],
    "checkIn": "15:00",
    "checkOut": "11:00",
    "projectTypes": ["Nybyggnation", "Renovering"],
    "certifications": ["Auktoriserad", "ISO-certifierad"],
    "serviceArea": "Stockholm med omnejd",
    "courseFormats": ["Online", "På plats"],
    "ageGroups": ["Barn", "Vuxna"],
    "accreditation": "Certifiering",
    "eventTypes": ["Bröllop", "Företagsevent"],
    "capacity": "200 gäster",
    "venues": ["Inomhus", "Utomhus"],
    "practiceAreas": ["Familjerätt", "Affärsjuridik"],
    "jurisdictions": ["Sverige"],
    "consultations": "Fri inledande konsultation",
    "propertyTypes": ["Bostadsrätt", "Villa"],
    "regions": ["Stockholms innerstad"],
    "mission": "Föreningens mission",
    "memberCount": "500 medlemmar",
    "volunteerInfo": "Information om volontärarbete"
  },
  "confidence": {
    "companyName": "high",
    "phone": "high",
    "services": "medium"
  }
}

VIKTIGT om categorySpecific:
- Inkludera BARA de nycklar som är relevanta för denna typ av verksamhet.
- En restaurang har "wifi", "parking", "dietary" men INTE "rooms" eller "practiceAreas".
- Ett hotell har "rooms", "amenities", "checkIn", "checkOut" men INTE "dietary".
- Inkludera bara nycklar där du HITTAR faktisk information.

Returnera BARA JSON-objektet, ingen förklaringstext.`);

  return parts.join("\n");
}

export interface ExtractWizardFieldsOptions {
  intel: CompanyIntelResult;
  userDescription?: string;
}

export async function extractWizardFields(
  opts: ExtractWizardFieldsOptions,
): Promise<WizardFieldsResult | null> {
  if (opts.intel.rawTextCorpus.length < 30) return null;

  const prompt = buildWizardExtractionPrompt(opts.intel, opts.userDescription);

  try {
    const result = await generateText({
      model: createDirectModel(SYNTHESIS_MODEL),
      prompt,
      maxRetries: 2,
      maxOutputTokens: 6000,
      temperature: 0.2,
    });

    const text = result.text?.trim() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[WizardExtraction] No JSON found in response:", text.slice(0, 200));
      return null;
    }

    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return normalizeWizardFields(raw);
  } catch (err) {
    console.error("[WizardExtraction] Failed:", err);
    return null;
  }
}

function normalizeWizardFields(raw: Record<string, unknown>): WizardFieldsResult {
  const result: WizardFieldsResult = {
    confidence: {},
  };

  const str = (key: string): string | undefined => {
    const v = raw[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const strArr = (key: string): string[] | undefined => {
    const v = raw[key];
    if (!Array.isArray(v)) return undefined;
    const filtered = v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    return filtered.length > 0 ? filtered : undefined;
  };

  const bool = (key: string): boolean | undefined => {
    const v = raw[key];
    return typeof v === "boolean" ? v : undefined;
  };

  result.companyName = str("companyName");
  result.offer = str("offer");
  result.phone = str("phone");
  result.email = str("email");
  result.address = str("address");
  result.openingHours = str("openingHours");
  result.tagline = str("tagline");
  result.tone = str("tone");
  result.designStyle = str("designStyle");
  result.bookingUrl = str("bookingUrl");
  result.shippingInfo = str("shippingInfo");
  result.priceRange = str("priceRange");

  result.services = strArr("services");
  result.uniqueSellingPoints = strArr("uniqueSellingPoints");
  result.testimonials = strArr("testimonials");
  result.cuisine = strArr("cuisine");
  result.paymentMethods = strArr("paymentMethods");
  result.topics = strArr("topics");
  result.brandColors = strArr("brandColors");

  result.acceptsReservations = bool("acceptsReservations");
  result.delivery = bool("delivery");

  if (Array.isArray(raw.menuItems)) {
    const items = raw.menuItems
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).name === "string")
      .map((v) => ({
        name: String(v.name),
        description: typeof v.description === "string" ? v.description : undefined,
        price: typeof v.price === "string" ? v.price : undefined,
      }));
    if (items.length > 0) result.menuItems = items;
  }

  if (Array.isArray(raw.products)) {
    const items = raw.products
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).name === "string")
      .map((v) => ({
        name: String(v.name),
        price: typeof v.price === "string" ? v.price : undefined,
        image: typeof v.image === "string" ? v.image : undefined,
      }));
    if (items.length > 0) result.products = items;
  }

  if (Array.isArray(raw.treatments)) {
    const items = raw.treatments
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).name === "string")
      .map((v) => ({
        name: String(v.name),
        price: typeof v.price === "string" ? v.price : undefined,
        duration: typeof v.duration === "string" ? v.duration : undefined,
      }));
    if (items.length > 0) result.treatments = items;
  }

  if (Array.isArray(raw.teamMembers)) {
    const items = raw.teamMembers
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).name === "string")
      .map((v) => ({
        name: String(v.name),
        role: typeof v.role === "string" ? v.role : undefined,
      }));
    if (items.length > 0) result.teamMembers = items;
  }

  if (Array.isArray(raw.projects)) {
    const items = raw.projects
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).name === "string")
      .map((v) => ({
        name: String(v.name),
        description: typeof v.description === "string" ? v.description : undefined,
        url: typeof v.url === "string" ? v.url : undefined,
      }));
    if (items.length > 0) result.projects = items;
  }

  if (raw.categorySpecific && typeof raw.categorySpecific === "object") {
    const cs = raw.categorySpecific as Record<string, unknown>;
    const cleaned: Record<string, string | string[] | boolean> = {};
    for (const [key, value] of Object.entries(cs)) {
      if (typeof value === "string" && value.trim()) cleaned[key] = value.trim();
      else if (typeof value === "boolean") cleaned[key] = value;
      else if (Array.isArray(value)) {
        const arr = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        if (arr.length > 0) cleaned[key] = arr;
      }
    }
    if (Object.keys(cleaned).length > 0) result.categorySpecific = cleaned;
  }

  if (raw.confidence && typeof raw.confidence === "object") {
    const conf = raw.confidence as Record<string, unknown>;
    for (const [key, value] of Object.entries(conf)) {
      if (value === "high" || value === "medium" || value === "low") {
        result.confidence[key] = value;
      }
    }
  }

  return result;
}
