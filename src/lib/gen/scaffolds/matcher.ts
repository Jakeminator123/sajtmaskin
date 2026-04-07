/**
 * Scaffold matching — selects the best internal scaffold for a prompt.
 *
 * Uses keyword matching as primary strategy, with embedding-based
 * semantic search as fallback when keywords yield only generic defaults.
 * Only matches against the 10 internal scaffolds in registry.ts.
 */
import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getScaffoldByFamily, getScaffoldById } from "./registry";
import { searchScaffolds } from "./scaffold-search";

const LANDING_KEYWORDS = [
  "landing",
  "landningssida",
  "marketing",
  "campaign",
  "kampanj",
  "startup",
  "brand",
  "varumärke",
  "lansering",
  "produktlansering",
  "evenemang",
  "event",
  "promotion",
  "erbjudande",
];

const SAAS_KEYWORDS = [
  "saas",
  "software",
  "platform",
  "subscription",
  "pricing",
  "billing",
  "product-led",
  "product led",
  "b2b",
  "workspace",
  "dashboard preview",
  "free trial",
  "mjukvara",
  "plattform",
  "abonnemang",
  "pris",
  "testperiod",
];

const PORTFOLIO_KEYWORDS = [
  "portfolio",
  "designer",
  "developer",
  "photographer",
  "photo studio",
  "creative",
  "creator",
  "personal",
  "resume",
  "cv",
  "selected work",
  "case study",
  "case studies",
  "founder profile",
  "artist",
  "stylist",
  "copywriter",
  "consultant profile",
  "illustrator",
  "videographer",
  "portfolio site",
  "fotograf",
  "fotostudio",
  "kreatör",
  "personlig",
  "case",
  "influencer",
  "content creator",
  "samarbeten",
];

const PORTFOLIO_MEDIA_KEYWORDS = [
  "photo",
  "photos",
  "image",
  "images",
  "foto",
  "foton",
  "bild",
  "bilder",
  "fotografi",
  "fotografier",
  "photography",
];

const PORTFOLIO_ART_DIRECTION_KEYWORDS = [
  "gallery",
  "galleri",
  "editorial",
  "utställning",
  "exhibition",
  "visuell",
  "visual",
  "estetisk",
  "harmonisk",
  "poetisk",
  "curated",
  "kurerad",
];

const BLOG_KEYWORDS = [
  "blog",
  "blogg",
  "blogga",
  "article",
  "artikel",
  "artiklar",
  "post",
  "inlägg",
  "writer",
  "författare",
  "skribent",
  "newsletter",
  "nyhetsbrev",
  "magazine",
  "magasin",
  "editorial",
  "redaktion",
  "tips",
  "instruktioner",
  "guide",
  "guider",
  "recept",
  "dagbok",
  "krönika",
  "kolumn",
];

const DASHBOARD_KEYWORDS = [
  "dashboard",
  "instrumentpanel",
  "analytics",
  "analys",
  "stats",
  "statistik",
  "metrics",
  "mätvärden",
  "overview",
  "översikt",
  "reports",
  "rapport",
  "rapporter",
  "chart",
  "diagram",
  "table",
  "tabell",
  "kontrollpanel",
  "nyckeltal",
  "graf",
  "grafer",
  "sammanställning",
];

const APP_KEYWORDS = [
  "admin",
  "crm",
  "panel",
  "settings",
  "inställningar",
  "users",
  "användare",
  "sidebar",
  "sidopanel",
  "tool",
  "verktyg",
  "management",
  "monitor",
  "application",
  "app",
  "workspace",
  "portal",
  "backoffice",
  "administrera",
  "hantera",
  "kontoinställningar",
  "kontohantering",
  "systemvy",
  "översiktsvy",
];

const AUTH_KEYWORDS = [
  "auth",
  "login",
  "inloggning",
  "logga in",
  "signup",
  "sign up",
  "registrera",
  "registrering",
  "register",
  "password",
  "lösenord",
  "forgot password",
  "glömt lösenord",
  "reset password",
  "återställ",
  "autentisering",
  "konto",
  "skapa konto",
  "verifiera",
  "verifiering",
  "tvåfaktor",
];

const PHOTO_SHOP_KEYWORDS = [
  "photo shop",
  "fotoshop",
  "foto shop",
  "photo store",
  "print shop",
  "art prints",
  "curated shop",
  "editorial shop",
  "lifestyle store",
  "design store",
  "gallery shop",
  "galleri shop",
  "photo ecommerce",
];

const PHOTO_SHOP_OVERRIDE_KEYWORDS = [
  "jakob",
];

const ECOMMERCE_KEYWORDS = [
  "ecommerce",
  "e-commerce",
  "e-handel",
  "webshop",
  "webbshop",
  "webbutik",
  "shop",
  "butik",
  "store",
  "online store",
  "nätbutik",
  "product",
  "produkt",
  "produkter",
  "cart",
  "varukorg",
  "kundvagn",
  "checkout",
  "kassa",
  "betalning",
  "order",
  "beställning",
  "inventory",
  "lager",
  "catalog",
  "katalog",
  "storefront",
  "sortiment",
  "säljer",
  "köpa",
  "köp",
  "second-hand",
  "secondhand",
  "mode",
  "kläder",
  "accessoarer",
  "skor",
  "smycken",
  "inredning",
  "möbler",
  "hudvård",
  "kosmetik",
];

const RESTAURANT_KEYWORDS = [
  "restaurang",
  "restaurant",
  "café",
  "cafe",
  "kafé",
  "meny",
  "menu",
  "catering",
  "pizzeria",
  "sushi",
  "bar",
  "bistro",
  "brasserie",
  "food truck",
  "matställe",
  "lunch",
  "middag",
  "à la carte",
  "boka bord",
  "reservation",
  "kök",
  "krog",
  "pub",
  "gastropub",
];

const SALON_KEYWORDS = [
  "frisör",
  "frisörsalong",
  "salong",
  "salon",
  "hår",
  "klippning",
  "färgning",
  "barber",
  "barbershop",
  "spa",
  "naglar",
  "manikyr",
  "pedikyr",
  "skönhet",
  "beauty",
  "hudvård",
  "ansiktsbehandling",
  "makeup",
  "boka tid",
  "styling",
  "fransar",
  "bryn",
  "massör",
  "massage",
];

const TRADESMAN_KEYWORDS = [
  "hantverkare",
  "bygga",
  "byggare",
  "byggfirma",
  "byggföretag",
  "snickare",
  "snickeri",
  "målare",
  "målarfirma",
  "elektriker",
  "el",
  "elinstallation",
  "rörmokare",
  "VVS",
  "rörläggare",
  "takläggare",
  "takläggning",
  "plåtslagare",
  "renovering",
  "renovera",
  "markarbete",
  "golvläggare",
  "golvläggning",
  "kakel",
  "badrumsrenovering",
  "köksrenovering",
  "fasad",
  "isolering",
  "offert",
  "kostnadsfri offert",
];

const PROFESSIONAL_KEYWORDS = [
  "advokat",
  "advokatbyrå",
  "advokatfirma",
  "jurist",
  "juridik",
  "revisor",
  "revision",
  "redovisning",
  "redovisningsbyrå",
  "bokföring",
  "konsult",
  "konsultfirma",
  "konsultbolag",
  "rådgivare",
  "rådgivning",
  "arkitekt",
  "arkitektbyrå",
  "mäklare",
  "fastighetsmäklare",
  "tandläkare",
  "tandvård",
  "läkare",
  "psykolog",
  "terapeut",
  "veterinär",
  "klinik",
];

const LOCAL_RETAIL_KEYWORDS = [
  "butik",
  "affär",
  "blomsterhandel",
  "florist",
  "bageri",
  "konditori",
  "bokhandel",
  "leksaker",
  "present",
  "presentbutik",
  "inredningsbutik",
  "djuraffär",
  "optiker",
  "secondhand",
  "vintage",
  "antik",
  "antikvariat",
  "sportaffär",
  "cykelaffär",
  "loppis",
];

const CONTENT_KEYWORDS = [
  "company",
  "business",
  "services",
  "service",
  "consulting",
  "consultant",
  "agency",
  "corporate",
  "homepage",
  "home page",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "tjänster",
  "tjänst",
  "erbjuder",
  "erbjudande",
  "kontaktformulär",
  "bokning",
  "boka tid",
  "öppettider",
  "galleri",
  "gallery",
  "showcase",
  "projekt",
  "projects",
  "referens",
  "referenser",
  "kundrecension",
  "omdömen",
  "team",
  "vårt team",
  "om oss",
];

const SWEDISH_BUSINESS_KEYWORDS = [
  "frisör",
  "salong",
  "frisörsalong",
  "klippning",
  "styling",
  "skönhet",
  "restaurang",
  "bistro",
  "café",
  "cafe",
  "meny",
  "lunch",
  "à la carte",
  "catering",
  "matställe",
  "bilverkstad",
  "verkstad",
  "reparation",
  "reparationer",
  "däckbyte",
  "besiktning",
  "mekaniker",
  "yoga",
  "yogastudio",
  "meditation",
  "retreat",
  "retreats",
  "pilates",
  "gym",
  "tränare",
  "träning",
  "advokat",
  "advokatbyrå",
  "advokatfirma",
  "juridik",
  "jurist",
  "arbetsrätt",
  "fastighetsrätt",
  "affärsjuridik",
  "takläggare",
  "takläggning",
  "fasad",
  "renovering",
  "hantverkare",
  "snickare",
  "snickeri",
  "målare",
  "rörmokare",
  "elektriker",
  "byggföretag",
  "byggfirma",
  "tandläkare",
  "tandvård",
  "klinik",
  "vårdcentral",
  "läkare",
  "veterinär",
  "redovisning",
  "redovisningsbyrå",
  "bokföring",
  "revision",
  "revisor",
  "mäklare",
  "fastighetsmäklare",
  "fastighetsbolag",
  "städfirma",
  "städbolag",
  "trädgård",
  "trädgårdsskötsel",
  "landskapsarkitekt",
  "fotograf",
  "fotostudio",
  "konsult",
  "konsultbolag",
  "konsultfirma",
  "arkitekt",
  "arkitektbyrå",
  "rekrytering",
  "bemanning",
  "eventbyrå",
  "bröllop",
  "florist",
  "blomsterhandel",
  "hundtrimmare",
  "hundvakt",
  "ridskola",
  "ridning",
  "danssskola",
  "dans",
  "musikskola",
  "studiehjälp",
  "nacka",
  "upplev",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countKeywordMatches(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(keyword)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

function countPortfolioSignalBoost(text: string): number {
  const creatorScore = countKeywordMatches(text, PORTFOLIO_KEYWORDS);
  const mediaScore = countKeywordMatches(text, PORTFOLIO_MEDIA_KEYWORDS);
  const artDirectionScore = countKeywordMatches(text, PORTFOLIO_ART_DIRECTION_KEYWORDS);

  let boost = 0;
  if (creatorScore > 0 && mediaScore > 0) boost += 2;
  if (creatorScore > 0 && artDirectionScore > 0) boost += 1;
  if (mediaScore > 0 && artDirectionScore > 0) boost += 1;
  return boost;
}

/** Minimum score to prefer a specific scaffold over fallbacks */
const MIN_SCORE = 2;

/** Picks the best scaffold from scored candidates, or null if none meets threshold */
function pickBestScaffold(
  scores: Array<{ id: string; score: number }>,
): ScaffoldManifest | null {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < MIN_SCORE) return null;
  return getScaffoldById(best.id);
}

/**
 * Synchronous keyword-based scaffold matching.
 * Fast and deterministic -- used as the primary matcher.
 *
 * Swedish business prompts often contain only 1 generic keyword (e.g. "hemsida"),
 * but several domain-specific words ("frisör", "salong", "klippning"). The
 * SWEDISH_BUSINESS_KEYWORDS list boosts the content-site score so these prompts
 * land on a richer multi-page scaffold instead of a generic landing page.
 */
export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  const lower = prompt.toLowerCase();

  const photoShopOverride = countKeywordMatches(lower, PHOTO_SHOP_OVERRIDE_KEYWORDS);
  if (photoShopOverride >= 1) {
    return getScaffoldByFamily("photo-shop");
  }

  const photoShopScore = countKeywordMatches(lower, PHOTO_SHOP_KEYWORDS);
  if (photoShopScore >= MIN_SCORE) {
    return getScaffoldByFamily("photo-shop");
  }

  const authScore = countKeywordMatches(lower, AUTH_KEYWORDS);
  if (authScore >= MIN_SCORE) {
    return getScaffoldByFamily("auth-pages");
  }

  const ecommerceScore = countKeywordMatches(lower, ECOMMERCE_KEYWORDS);
  if (ecommerceScore >= MIN_SCORE) {
    return getScaffoldByFamily("ecommerce");
  }

  if (buildIntent === "app") {
    const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
    const appScore = countKeywordMatches(lower, APP_KEYWORDS);
    if (dashboardScore >= MIN_SCORE && dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
  const appScore = countKeywordMatches(lower, APP_KEYWORDS);
  if (appScore >= MIN_SCORE || dashboardScore >= MIN_SCORE) {
    if (dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  // Industry-specific scaffolds (check first — they are the most specific)
  const restaurantScore = countKeywordMatches(lower, RESTAURANT_KEYWORDS);
  const salonScore = countKeywordMatches(lower, SALON_KEYWORDS);
  const tradesmanScore = countKeywordMatches(lower, TRADESMAN_KEYWORDS);
  const professionalScore = countKeywordMatches(lower, PROFESSIONAL_KEYWORDS);
  const localRetailScore = countKeywordMatches(lower, LOCAL_RETAIL_KEYWORDS);

  const bestIndustry = pickBestScaffold([
    { id: "restaurant", score: restaurantScore },
    { id: "salon", score: salonScore },
    { id: "tradesman", score: tradesmanScore },
    { id: "professional", score: professionalScore },
    { id: "local-retail", score: localRetailScore },
  ]);

  if (bestIndustry) {
    return bestIndustry;
  }

  const saasScore = countKeywordMatches(lower, SAAS_KEYWORDS);
  const portfolioScore =
    countKeywordMatches(lower, PORTFOLIO_KEYWORDS) +
    countPortfolioSignalBoost(lower);
  const landingScore = countKeywordMatches(lower, LANDING_KEYWORDS);
  const blogScore = countKeywordMatches(lower, BLOG_KEYWORDS);

  const bestSpecific = pickBestScaffold([
    { id: "saas-landing", score: saasScore },
    { id: "portfolio", score: portfolioScore },
    { id: "landing-page", score: landingScore },
    { id: "blog", score: blogScore },
  ]);

  if (bestSpecific) {
    return bestSpecific;
  }

  const contentBaseScore = countKeywordMatches(lower, CONTENT_KEYWORDS);
  const businessBoost = Math.min(
    countKeywordMatches(lower, SWEDISH_BUSINESS_KEYWORDS),
    3,
  );
  const contentScore = contentBaseScore + businessBoost;
  if (contentScore >= MIN_SCORE) {
    return getScaffoldByFamily("content-site");
  }

  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page");
  }

  return getScaffoldByFamily("base-nextjs");
}

const EMBEDDING_MIN_SCORE = 0.35;

/**
 * Async scaffold matching that combines keyword matching with semantic
 * embedding search. Uses keyword match as the primary result; falls back
 * to embedding search when keywords only produce a generic default
 * (landing-page or base-nextjs), which suggests the prompt uses
 * vocabulary not covered by the keyword lists.
 */
export async function matchScaffoldWithEmbeddings(
  prompt: string,
  buildIntent?: BuildIntent | null,
): Promise<ScaffoldManifest | null> {
  const keywordResult = matchScaffold(prompt, buildIntent);
  const lower = prompt.toLowerCase();
  const authScore = countKeywordMatches(lower, AUTH_KEYWORDS);
  const appScore = countKeywordMatches(lower, APP_KEYWORDS);
  const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);

  const isGenericDefault =
    !keywordResult ||
    keywordResult.id === "landing-page" ||
    keywordResult.id === "base-nextjs";

  if (!isGenericDefault) return keywordResult;

  try {
    const results = await searchScaffolds(prompt, 1);
    if (results.length > 0 && results[0].score >= EMBEDDING_MIN_SCORE) {
      const embeddingResult = results[0].scaffold;

      // Embeddings are only allowed to override generic website defaults when the
      // prompt actually signals the specialized scaffold. This prevents cases
      // where a generic one-page site is incorrectly pushed into auth/app shells.
      if (embeddingResult.id === "auth-pages" && authScore < 1) {
        return keywordResult;
      }

      if (
        buildIntent !== "app" &&
        (embeddingResult.id === "dashboard" || embeddingResult.id === "app-shell") &&
        appScore < 1 &&
        dashboardScore < 1
      ) {
        return keywordResult;
      }

      return embeddingResult;
    }
  } catch (err) {
    console.info("[scaffold] Embedding scaffold match failed; using keyword result", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return keywordResult;
}
