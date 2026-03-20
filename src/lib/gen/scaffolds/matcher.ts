/**
 * Scaffold matching — selects the best internal scaffold for a prompt.
 *
 * Uses keyword matching as primary strategy, with embedding-based
 * semantic search as fallback when keywords yield only generic defaults.
 * Only matches against internal scaffolds in registry.ts (see getAllScaffolds()).
 */
import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getScaffoldByFamily, getScaffoldById } from "./registry";
import { searchScaffolds } from "./scaffold-search";

const LANDING_KEYWORDS = [
  "landing",
  "marketing",
  "campaign",
  "company",
  "business",
  "services",
  "service",
  "consulting",
  "consultant",
  "studio",
  "agency",
  "corporate",
  "startup",
  "brand",
  "homepage",
  "home page",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "tjänster",
  "kampanj",
  // SNI F – Byggverksamhet
  "bygg", "byggföretag", "byggfirma", "snickare", "hantverkare",
  "elektriker", "rörmokare", "målare", "måleri", "målerifirma",
  "renovering", "plåtslagare", "takläggare", "markarbeten", "VVS",
  "kakel", "golv", "fasadrenovering", "murare",
  // SNI H – Transport & logistik
  "transport", "transportbolag", "transportföretag", "frakt", "logistik",
  "åkeri", "flyttfirma", "budtjänst", "spedition", "taxi",
  // SNI K – Finans, försäkring, ekonomi
  "redovisning", "bokföring", "revisor", "ekonomibyrå", "skatterådgivning",
  "försäkring", "rådgivning", "finansiell",
  // SNI M – Juridik
  "advokat", "jurist", "juristfirma", "juristbyrå", "advokatbyrå",
  "juridisk", "affärsjuridik",
  // SNI L – Fastighet
  "mäklare", "fastighetsmäklare", "fastighetsförmedling",
  "fastighetsförvaltning", "mäklarfirma",
  // SNI G45 – Fordonsservice
  "bilverkstad", "mekaniker", "bilservice", "däckbyte", "lackering",
  "bilreparation", "fordonsservice",
  // SNI J – Kommunikation & reklam
  "reklambyrå", "kommunikationsbyrå", "webbbyrå", "mediabyrå", "PR-byrå",
  "eventbyrå", "produktionsbyrå", "marknadsföring", "marknadsföringsbyrå",
  "digital byrå",
  // SNI N – Bemanning & service
  "bevakning", "larm", "säkerhet", "bemanning", "rekrytering",
  // SNI N81 – Städ & fastighetsservice
  "städ", "städföretag", "städfirma", "städbolag", "städning",
  "lokalvård", "fastighetsskötsel", "fönsterputsning",
  // SNI S – Övrig service
  "begravningsbyrå", "kemtvätt",
  // SNI A – Jordbruk
  "lantbruk", "gård", "jordbruk", "lanthandel", "lanthandlare",
  // SNI C – Tillverkning
  "fabrik", "tillverkning", "industri",
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
  "mjukvarutjänst",
  "plattform",
  "abonnemang",
  "pris",
  "prisplaner",
  "prispaket",
  "testperiod",
  "priser",
];

const PORTFOLIO_KEYWORDS = [
  "portfolio",
  "designer",
  "developer",
  "photographer",
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
  "kreatör",
  "personlig",
  "case",
  // SNI M71 – Arkitektur & design
  "arkitekt", "arkitektkontor", "formgivare", "inredare", "inredningsarkitekt",
  // SNI R – Kultur & konst
  "konstnär", "musiker", "band", "DJ", "filmare", "regissör",
  "skulptör", "keramiker", "textilkonstnär", "grafisk formgivare",
  "tatuerare", "animatör",
  // Visning av verk
  "galleri", "utställning", "verk", "showreel", "lookbook",
];

const BLOG_KEYWORDS = [
  "blog",
  "blogg",
  "article",
  "artikel",
  "post",
  "inlägg",
  "writer",
  "författare",
  "newsletter",
  "magazine",
  "magasin",
  "editorial",
  "redaktion",
  "content",
  "innehåll",
  "reading",
  "läsa",
  "recept",
  "matlagning",
  "krönika",
  "dagbok",
  "tips",
  // Nya medieformer
  "podcast", "podd", "vlogg", "videoblogg",
  "reseberättelse", "reseblogg", "hälsoblogg", "modeblogg",
  "träningsblogg", "teknikblogg",
  "nyhetsbrev", "avsnitt", "prenumerera",
];

const DASHBOARD_KEYWORDS = [
  "dashboard",
  "instrumentpanel",
  "admin-panel",
  "adminpanel",
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
  "användarhantering",
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

const ECOMMERCE_KEYWORDS = [
  "ecommerce",
  "e-commerce",
  "e-handel",
  "webshop",
  "webbshop",
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
  // SNI G – Detaljhandel specifikt
  "kläder", "mode", "inredning", "möbler", "present", "gåvor",
  "smycken", "accessoarer", "elektronik", "sport", "leksaker",
  "kosmetika", "hälsokost", "livsmedel", "vin", "kaffe",
  "handgjord", "vintage", "second hand",
];

const RESTAURANT_KEYWORDS = [
  "restaurang",
  "restaurant",
  "café",
  "cafe",
  "meny",
  "menu",
  "food",
  "mat",
  "dining",
  "öppettider",
  "opening hours",
  "boka bord",
  "table",
  "pizzeria",
  "bar",
  "pub",
  "konditori",
  "bageri",
  "bakery",
  "sushi",
  "thai",
  "indisk",
  // SNI I – Hotell & mat
  "krog", "bistro", "matsal", "brunch", "food truck",
  "catering", "hotell", "vandrarhem", "bed and breakfast",
  "stuguthyrning", "wok", "kebab", "hamburgare", "glass",
  "taqueria", "ramen", "gastropub",
];

const BOOKING_KEYWORDS = [
  "bokning",
  "booking",
  "tidsbokning",
  "appointment",
  "boka tid",
  "boka",
  "schedule",
  "terapeut",
  "therapist",
  "massage",
  "behandling",
  "treatment",
  "hudvård",
  "nagelstudio",
  "osteopat",
  "kiropraktor",
  "läkare",
  "tandläkare",
  "veterinär",
  "lediga tider",
  "available",
  // SNI Q – Hälso- och sjukvård
  "psykolog", "fysioterapeut", "sjukgymnast", "dietist", "logoped",
  "optiker", "naprapati", "akupunktur", "zonterapi",
  // SNI S96 – Kroppsvård
  "frisör", "salong", "spa", "wellness", "skönhet",
  "skönhetssalong", "personlig tränare",
  "hundtrimmare", "djurklinik",
  // Generella bokningstermer
  "konsultation", "mottagning", "klinik",
];

const ASSOCIATION_KEYWORDS = [
  "förening",
  "organisation",
  "ideell",
  "nonprofit",
  "klubb",
  "club",
  "brf",
  "bostadsrättsförening",
  "idrottsklubb",
  "sportklubb",
  "scoutkår",
  "medlemmar",
  "members",
  "evenemang",
  "styrelse",
  "board",
  "årsmöte",
  "stadgar",
  "bli medlem",
  "membership",
  "frivillig",
  "volunteer",
  "samfund",
  "kyrka",
  "church",
  // Fler föreningstyper
  "fackförening", "studentförening", "elevkår",
  "stiftelse", "fond", "hembygdsförening", "byalag",
  "supporterklubb", "intresseförening", "pensionärsförening",
  "föräldraförening", "välgörenhet", "insamling",
  "Lions", "Rotary", "partidistrik",
];

const CLINIC_KEYWORDS = [
  "klinik", "mottagning", "läkare", "doktor",
  "tandläkare", "tandvård", "tandklinik",
  "vårdcentral", "sjukvård", "hälsovård",
  "patient", "remiss", "provtagning",
  "vaccination", "hälsokontroll",
  "blodprov", "allergi", "dermatolog",
];

const LOCAL_SHOP_KEYWORDS = [
  "lanthandel", "lanthandlare", "bybutik", "bygdens butik",
  "lokal butik", "affär", "sortiment", "speceriaffär",
  "gårdsbutik", "torghandel", "marknad",
];

const EVENT_KEYWORDS = [
  "event", "evenemang", "konferens", "conference",
  "festival", "meetup", "seminarium", "workshop",
  "mässa", "gala", "tillställning",
  "talare", "speakers", "biljetter", "tickets",
  "schema", "program", "agenda",
];

const SCHOOL_KEYWORDS = [
  "skola", "utbildning", "kurs", "kurser",
  "universitet", "gymnasium", "förskola",
  "lärare", "akademi", "folkbildning",
  "studieförbund", "undervisning", "elev",
  "student", "ansökan", "termin",
  "campus", "läroplan", "pedagogik",
];

const CONTENT_KEYWORDS = [
  "content",
  "innehåll",
  "dokumentation",
  "documentation",
  "docs",
  "guide",
  "guider",
  "undersidor",
  "kommun",
  "myndighet",
  "informationssajt",
  "kunskapsbas",
  "wiki",
  "faq",
  "vanliga frågor",
  "manual",
  "helpdesk",
  "hjälpcenter",
  "dokumentationssida",
  "informationssida",
  "kunskapsbank",
  "sidofält", "sidofältet", "navigation",
  // SNI O/R – Offentlig sektor & kultur
  "museum", "bibliotek", "arkiv", "region", "länsstyrelse",
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
 */
export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  const lower = prompt.toLowerCase();

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

  const restaurantScore = countKeywordMatches(lower, RESTAURANT_KEYWORDS);
  if (restaurantScore >= MIN_SCORE) {
    return getScaffoldById("restaurant");
  }

  const bookingScore = countKeywordMatches(lower, BOOKING_KEYWORDS);
  if (bookingScore >= MIN_SCORE) {
    return getScaffoldById("booking");
  }

  const associationScore = countKeywordMatches(lower, ASSOCIATION_KEYWORDS);
  if (associationScore >= MIN_SCORE) {
    return getScaffoldById("association");
  }

  const clinicScore = countKeywordMatches(lower, CLINIC_KEYWORDS);
  if (clinicScore >= MIN_SCORE) {
    return getScaffoldById("clinic");
  }

  const localShopScore = countKeywordMatches(lower, LOCAL_SHOP_KEYWORDS);
  if (localShopScore >= MIN_SCORE) {
    return getScaffoldById("local-shop");
  }

  const eventScore = countKeywordMatches(lower, EVENT_KEYWORDS);
  if (eventScore >= MIN_SCORE) {
    return getScaffoldById("event");
  }

  const schoolScore = countKeywordMatches(lower, SCHOOL_KEYWORDS);
  if (schoolScore >= MIN_SCORE) {
    return getScaffoldById("school");
  }

  const saasScore = countKeywordMatches(lower, SAAS_KEYWORDS);
  const portfolioScore = countKeywordMatches(lower, PORTFOLIO_KEYWORDS);
  const landingScore = countKeywordMatches(lower, LANDING_KEYWORDS);
  const blogScore = countKeywordMatches(lower, BLOG_KEYWORDS);

  const bestContent = pickBestScaffold([
    { id: "saas-landing", score: saasScore },
    { id: "portfolio", score: portfolioScore },
    { id: "landing-page", score: landingScore },
    { id: "blog", score: blogScore },
  ]);

  if (bestContent) {
    return bestContent;
  }

  const contentScore = countKeywordMatches(lower, CONTENT_KEYWORDS);
  if (contentScore >= MIN_SCORE) {
    return getScaffoldByFamily("content-site");
  }

  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page");
  }

  return getScaffoldByFamily("base-nextjs");
}

const EMBEDDING_MIN_SCORE = 0.35;

export interface ScaffoldMatchMeta {
  matchSource: "keyword" | "embedding" | "manual" | "persisted" | "off";
  embeddingScore: number | null;
  keywordFallbackId: string | null;
}

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
): Promise<{ scaffold: ScaffoldManifest | null; matchMeta: ScaffoldMatchMeta }> {
  const keywordResult = matchScaffold(prompt, buildIntent);
  const lower = prompt.toLowerCase();

  const isGenericDefault =
    !keywordResult ||
    keywordResult.id === "landing-page" ||
    keywordResult.id === "base-nextjs";

  if (!isGenericDefault) {
    return {
      scaffold: keywordResult,
      matchMeta: { matchSource: "keyword", embeddingScore: null, keywordFallbackId: null },
    };
  }

  const EMBEDDING_GUARDRAILS: Record<string, readonly string[]> = {
    "auth-pages": AUTH_KEYWORDS,
    "dashboard": [...DASHBOARD_KEYWORDS, ...APP_KEYWORDS],
    "app-shell": [...DASHBOARD_KEYWORDS, ...APP_KEYWORDS],
    "restaurant": RESTAURANT_KEYWORDS,
    "booking": BOOKING_KEYWORDS,
    "association": ASSOCIATION_KEYWORDS,
    "clinic": CLINIC_KEYWORDS,
    "local-shop": LOCAL_SHOP_KEYWORDS,
    "event": EVENT_KEYWORDS,
    "school": SCHOOL_KEYWORDS,
  };

  try {
    const results = await searchScaffolds(prompt, 1);
    if (results.length > 0 && results[0].score >= EMBEDDING_MIN_SCORE) {
      const embeddingResult = results[0].scaffold;
      const embeddingScore = Math.round(results[0].score * 1000) / 1000;

      const guardrailKeywords = EMBEDDING_GUARDRAILS[embeddingResult.id];
      if (guardrailKeywords) {
        const guardrailScore = countKeywordMatches(lower, guardrailKeywords);
        if (guardrailScore < 1) {
          return {
            scaffold: keywordResult,
            matchMeta: { matchSource: "keyword", embeddingScore, keywordFallbackId: keywordResult?.id ?? null },
          };
        }
      }

      return {
        scaffold: embeddingResult,
        matchMeta: { matchSource: "embedding", embeddingScore, keywordFallbackId: keywordResult?.id ?? null },
      };
    }
  } catch {
    // embedding search is best-effort; fall through to keyword result
  }

  return {
    scaffold: keywordResult,
    matchMeta: { matchSource: "keyword", embeddingScore: null, keywordFallbackId: null },
  };
}
