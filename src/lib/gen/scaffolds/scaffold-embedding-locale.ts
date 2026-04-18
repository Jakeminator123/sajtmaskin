import type { ScaffoldId } from "./types";

/**
 * Swedish mirrors for scaffold semantic search. Embeddings include both EN (manifest)
 * and SV so Swedish user prompts and English prompts both align with the same vectors.
 */
export type ScaffoldEmbeddingLocale = {
  labelSv: string;
  descriptionSv: string;
  /** Extra Swedish synonyms for tags / user vocabulary */
  keywordsSv: string[];
};

export const SCAFFOLD_EMBEDDING_LOCALE: Record<ScaffoldId, ScaffoldEmbeddingLocale> = {
  "base-nextjs": {
    labelSv: "Bas Next.js",
    descriptionSv:
      "Minimal Next.js-start med Tailwind, App Router och mörkt tema — utgångspunkt innan mer specifik struktur.",
    keywordsSv: [
      "grund",
      "startmall",
      "minimal",
      "enkel webbplats",
      "tom mall",
      "next",
      "tailwind",
    ],
  },
  "landing-page": {
    labelSv: "Landningssida",
    descriptionSv:
      "Marknadsföringsinriktad starter för företagssajter, tjänsteföretag och snygga en-sidors lanseringar.",
    keywordsSv: [
      "landningssida",
      "kampanjsida",
      "företagssida",
      "tjänsteföretag",
      "startup",
      "one page",
      "en sida",
      "säljande",
      "konvertering",
      "hero",
      "cta",
    ],
  },
  "saas-landing": {
    labelSv: "SaaS-landningssida",
    descriptionSv:
      "Produktledd marknadsstarter med funktionsberättelse, produktpreview, priser, FAQ och konverteringssektioner.",
    keywordsSv: [
      "saas",
      "mjukvara",
      "prenumeration",
      "prissättning",
      "b2b",
      "produkt",
      "trial",
      "demo",
      "plattform",
    ],
  },
  portfolio: {
    labelSv: "Portfolio",
    descriptionSv:
      "Personlig portfolio med intro, utvalda arbeten, texter, trovärdighet och kontakt — kreatörer och konsulter.",
    keywordsSv: [
      "portfolio",
      "fotograf",
      "designer",
      "utvecklare",
      "konsult",
      "byrå",
      "showcase",
      "cv",
      "referenser",
    ],
  },
  blog: {
    labelSv: "Blogg",
    descriptionSv:
      "Innehållsförst med artikellista, inläggslayout, författare, utvalda poster och läsvänlig typografi.",
    keywordsSv: [
      "blogg",
      "artikel",
      "inlägg",
      "tidning",
      "nyhetsbrev",
      "redaktionell",
      "publicera",
    ],
  },
  dashboard: {
    labelSv: "Instrumentpanel",
    descriptionSv:
      "Översikt med sidomeny, statistikrutor, tabeller och diagramplatshållare — admin, analys och SaaS.",
    keywordsSv: [
      "instrumentpanel",
      "dashboard",
      "statistik",
      "diagram",
      "admin",
      "analys",
      "data",
      "översikt",
    ],
  },
  "auth-pages": {
    labelSv: "Inloggningssidor",
    descriptionSv:
      "Inloggning, registrering och glömt lösenord med formulärlayout och valideringsstruktur.",
    keywordsSv: [
      "inloggning",
      "registrering",
      "konto",
      "lösenord",
      "auth",
      "sign up",
      "logga in",
    ],
  },
  ecommerce: {
    labelSv: "E-handel",
    descriptionSv:
      "Butiksstarter med produktrutnät, kategorifilter, produktsida, varukorg och kassaliknande upplägg.",
    keywordsSv: [
      "e-handel",
      "butik",
      "webshop",
      "produkter",
      "varukorg",
      "kassa",
      "handla online",
    ],
  },
  "content-site": {
    labelSv: "Innehållssajt",
    descriptionSv:
      "Innehållsförst med hero, funktioner, omdömen och sidfot — bra för landningssidor, portfolio och bloggstruktur.",
    keywordsSv: [
      "innehåll",
      "företagssajt",
      "landningssida",
      "om oss",
      "tjänster",
      "kundcase",
      "förtroende",
    ],
  },
  "app-shell": {
    labelSv: "App-skalet",
    descriptionSv:
      "App/dashboard med sidomeny, statistikrutor och dataområde — adminpaneler, analys och SaaS-appar.",
    keywordsSv: [
      "app",
      "sidomeny",
      "adminpanel",
      "crm",
      "intern verktyg",
      "kontrollpanel",
    ],
  },
  "business-services": {
    labelSv: "Tjänste- och serviceföretag",
    descriptionSv:
      "Professionell sajt för tjänsteföretag — kontorshotell, advokatbyrå, redovisningsbyrå, klinik, konsultbolag, reklam-/design-/webbyrå, byggfirma, städfirma, mäklare och liknande. Tydliga tjänster, process, priser, team och kontakt.",
    keywordsSv: [
      "tjänsteföretag",
      "serviceföretag",
      "byrå",
      "konsultbolag",
      "konsultbyrå",
      "advokatbyrå",
      "juristbyrå",
      "redovisningsbyrå",
      "revisionsbyrå",
      "reklambyrå",
      "designbyrå",
      "webbyrå",
      "kommunikationsbyrå",
      "mediebyrå",
      "kontorshotell",
      "coworking",
      "flexkontor",
      "klinik",
      "mottagning",
      "tandläkarklinik",
      "vårdcentral",
      "arkitektbyrå",
      "byggfirma",
      "städfirma",
      "mäklarbyrå",
      "bemanningsföretag",
      "rekryteringsbyrå",
      "lokala tjänster",
      "professionell sajt",
      "b2b-tjänster",
    ],
  },
};

export function buildIntentBilingual(
  intents: Array<"website" | "app" | "template">,
): { en: string; sv: string } {
  const parts = intents.map((i) => {
    if (i === "website") return { en: "website", sv: "webbplats" };
    if (i === "app") return { en: "app", sv: "applikation" };
    return { en: "template", sv: "mall" };
  });
  return {
    en: parts.map((p) => p.en).join(", "),
    sv: parts.map((p) => p.sv).join(", "),
  };
}
