/**
 * Site profile classifier — infers business category and page budget
 * from the user prompt and optional brief data.
 *
 * Used by orchestration to improve scaffold selection and route planning.
 * Does NOT override manual scaffold choices.
 */

export type PageBucket = 1 | 3 | 5 | 7;

export interface SiteProfile {
  businessCategory: BusinessCategory;
  pageBucket: PageBucket;
  confidence: "high" | "medium" | "low";
}

export type BusinessCategory =
  | "hair-salon"
  | "beauty-wellness"
  | "medical-clinic"
  | "dental-clinic"
  | "veterinary"
  | "physiotherapy"
  | "psychology"
  | "personal-trainer"
  | "restaurant-cafe"
  | "bakery-pastry"
  | "catering-hotel"
  | "bar-pub"
  | "food-truck"
  | "accounting-firm"
  | "law-firm"
  | "insurance"
  | "real-estate"
  | "consulting"
  | "construction"
  | "electrician"
  | "plumber-hvac"
  | "painter"
  | "roofing"
  | "cleaning-service"
  | "transport-logistics"
  | "moving-company"
  | "taxi"
  | "car-workshop"
  | "advertising-agency"
  | "pr-agency"
  | "web-agency"
  | "event-agency"
  | "photographer"
  | "architect"
  | "interior-designer"
  | "artist"
  | "musician"
  | "tattoo-artist"
  | "ecommerce-fashion"
  | "ecommerce-home"
  | "ecommerce-food"
  | "ecommerce-general"
  | "rural-general-store"
  | "school-education"
  | "municipality"
  | "library-museum"
  | "sports-club"
  | "nonprofit"
  | "housing-association"
  | "church-congregation"
  | "student-union"
  | "saas-product"
  | "blog-media"
  | "podcast"
  | "generic-business"
  | "unknown";

interface CategoryRule {
  category: BusinessCategory;
  keywords: string[];
  defaultPages: PageBucket;
}

const CATEGORY_RULES: CategoryRule[] = [
  { category: "hair-salon", keywords: ["frisör", "salong", "hårklippning", "hårvård", "barberare"], defaultPages: 3 },
  { category: "beauty-wellness", keywords: ["spa", "wellness", "skönhet", "skönhetssalong", "naglar", "nagelstudio", "hudvård", "hudvårdsklinik", "ansiktsbehandling"], defaultPages: 3 },
  { category: "medical-clinic", keywords: ["läkare", "klinik", "mottagning", "vårdcentral", "sjukvård"], defaultPages: 5 },
  { category: "dental-clinic", keywords: ["tandläkare", "tandvård", "tandklinik"], defaultPages: 3 },
  { category: "veterinary", keywords: ["veterinär", "djurklinik", "djursjukhus", "hundtrimmare"], defaultPages: 3 },
  { category: "physiotherapy", keywords: ["fysioterapeut", "sjukgymnast", "naprapati", "kiropraktor", "osteopat", "akupunktur", "zonterapi"], defaultPages: 3 },
  { category: "psychology", keywords: ["psykolog", "terapeut", "psykoterapi", "samtalsterapi", "logoped", "dietist"], defaultPages: 3 },
  { category: "personal-trainer", keywords: ["personlig tränare", "träning", "gym", "fitnesss", "pt"], defaultPages: 3 },

  { category: "restaurant-cafe", keywords: ["restaurang", "café", "cafe", "krog", "bistro", "pizzeria", "sushi", "thai", "indisk", "ramen", "gastropub", "matsal", "brunch", "wok", "kebab", "hamburgare", "taqueria"], defaultPages: 3 },
  { category: "bakery-pastry", keywords: ["bageri", "konditori", "bakery", "glass"], defaultPages: 1 },
  { category: "catering-hotel", keywords: ["catering", "hotell", "vandrarhem", "bed and breakfast", "stuguthyrning"], defaultPages: 5 },
  { category: "bar-pub", keywords: ["bar", "pub", "nattklubb"], defaultPages: 1 },
  { category: "food-truck", keywords: ["food truck", "gatukök", "korvkiosk"], defaultPages: 1 },

  { category: "accounting-firm", keywords: ["redovisning", "bokföring", "revisor", "ekonomibyrå", "skatterådgivning"], defaultPages: 5 },
  { category: "law-firm", keywords: ["advokat", "jurist", "juristfirma", "juristbyrå", "advokatbyrå", "juridisk", "affärsjuridik"], defaultPages: 5 },
  { category: "insurance", keywords: ["försäkring", "försäkringsbolag"], defaultPages: 5 },
  { category: "real-estate", keywords: ["mäklare", "fastighetsmäklare", "fastighetsförmedling", "mäklarfirma", "fastighetsförvaltning"], defaultPages: 5 },
  { category: "consulting", keywords: ["konsult", "rådgivning", "management", "strategi", "affärsutveckling"], defaultPages: 5 },

  { category: "construction", keywords: ["bygg", "byggföretag", "byggfirma", "snickare", "hantverkare", "renovering", "murare", "fasadrenovering"], defaultPages: 5 },
  { category: "electrician", keywords: ["elektriker", "elinstallation", "elfirma"], defaultPages: 3 },
  { category: "plumber-hvac", keywords: ["rörmokare", "vvs", "vvs-firma", "rörfirma"], defaultPages: 3 },
  { category: "painter", keywords: ["målare", "måleri", "målerifirma", "tapetsering"], defaultPages: 3 },
  { category: "roofing", keywords: ["takläggare", "plåtslagare", "tak", "takarbeten"], defaultPages: 3 },
  { category: "cleaning-service", keywords: ["städ", "städföretag", "städfirma", "städbolag", "städning", "lokalvård", "fönsterputsning", "fastighetsskötsel"], defaultPages: 3 },

  { category: "transport-logistics", keywords: ["transport", "transportbolag", "transportföretag", "frakt", "logistik", "åkeri", "spedition"], defaultPages: 3 },
  { category: "moving-company", keywords: ["flyttfirma", "flytt", "flytthjälp", "magasinering"], defaultPages: 3 },
  { category: "taxi", keywords: ["taxi", "budtjänst"], defaultPages: 1 },
  { category: "car-workshop", keywords: ["bilverkstad", "mekaniker", "bilservice", "bilreparation", "fordonsservice", "däckbyte", "lackering"], defaultPages: 3 },

  { category: "advertising-agency", keywords: ["reklambyrå", "kommunikationsbyrå", "marknadsföring", "marknadsföringsbyrå", "mediabyrå"], defaultPages: 5 },
  { category: "pr-agency", keywords: ["pr-byrå", "pr", "public relations"], defaultPages: 5 },
  { category: "web-agency", keywords: ["webbbyrå", "webbyrå", "digital byrå", "digitalbyrå"], defaultPages: 5 },
  { category: "event-agency", keywords: ["eventbyrå", "event", "evenemang", "konferens", "produktionsbyrå"], defaultPages: 5 },

  { category: "photographer", keywords: ["fotograf", "fotografering", "fotoateljé", "bildproduktion"], defaultPages: 5 },
  { category: "architect", keywords: ["arkitekt", "arkitektkontor", "formgivare"], defaultPages: 5 },
  { category: "interior-designer", keywords: ["inredare", "inredningsarkitekt", "inredning"], defaultPages: 5 },
  { category: "artist", keywords: ["konstnär", "skulptör", "keramiker", "textilkonstnär", "grafisk formgivare"], defaultPages: 3 },
  { category: "musician", keywords: ["musiker", "band", "dj", "filmare", "regissör", "animatör"], defaultPages: 3 },
  { category: "tattoo-artist", keywords: ["tatuerare", "tatueringsstudio", "tattoo"], defaultPages: 3 },

  { category: "ecommerce-fashion", keywords: ["kläder", "mode", "smycken", "accessoarer", "vintage", "second hand"], defaultPages: 7 },
  { category: "ecommerce-home", keywords: ["möbler", "inredningsbutik", "present", "gåvor"], defaultPages: 7 },
  { category: "ecommerce-food", keywords: ["hälsokost", "livsmedel", "vin", "kaffe", "delikatesser"], defaultPages: 5 },
  { category: "ecommerce-general", keywords: ["webshop", "webbshop", "nätbutik", "e-handel", "e-commerce", "elektronik", "sport", "leksaker", "kosmetika"], defaultPages: 7 },
  { category: "rural-general-store", keywords: ["lanthandel", "lanthandlare", "bybutik", "bygdens butik"], defaultPages: 3 },

  { category: "school-education", keywords: ["skola", "utbildning", "kurs", "kurser", "universitet", "gymnasium", "förskola", "akademi", "folkbildning", "studieförbund"], defaultPages: 7 },
  { category: "municipality", keywords: ["kommun", "myndighet", "region", "länsstyrelse"], defaultPages: 7 },
  { category: "library-museum", keywords: ["bibliotek", "museum", "arkiv", "galleri", "utställning"], defaultPages: 5 },

  { category: "sports-club", keywords: ["idrottsklubb", "sportklubb", "fotbollsklubb", "hockeyklubb", "supporterklubb"], defaultPages: 5 },
  { category: "nonprofit", keywords: ["ideell", "nonprofit", "välgörenhet", "insamling", "stiftelse", "fond", "lions", "rotary"], defaultPages: 5 },
  { category: "housing-association", keywords: ["brf", "bostadsrättsförening", "byalag", "hembygdsförening"], defaultPages: 3 },
  { category: "church-congregation", keywords: ["kyrka", "församling", "samfund", "church"], defaultPages: 3 },
  { category: "student-union", keywords: ["studentförening", "elevkår", "föräldraförening", "pensionärsförening", "fackförening"], defaultPages: 3 },

  { category: "saas-product", keywords: ["saas", "mjukvara", "plattform", "abonnemang", "prisplaner", "testperiod"], defaultPages: 5 },
  { category: "blog-media", keywords: ["blogg", "nyhetsbrev", "magasin", "redaktion", "krönika"], defaultPages: 5 },
  { category: "podcast", keywords: ["podcast", "podd", "avsnitt"], defaultPages: 3 },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreCategory(text: string, rule: CategoryRule): number {
  let score = 0;
  for (const kw of rule.keywords) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(kw)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    if (pattern.test(text)) score++;
  }
  return score;
}

const PAGE_HINT_PATTERNS: Array<{ pattern: RegExp; bucket: PageBucket }> = [
  { pattern: /\b(en\s+sida|one\s*page|one-page|1\s+sida|enkel\s+sida)\b/i, bucket: 1 },
  { pattern: /\b(3\s+sidor|tre\s+sidor|fler\s+sidor|undersidor)\b/i, bucket: 3 },
  { pattern: /\b(5\s+sidor|fem\s+sidor|fullständig|komplett)\b/i, bucket: 5 },
  { pattern: /\b(7\s+sidor|sju\s+sidor|många\s+sidor|stor\s+sajt)\b/i, bucket: 7 },
];

function inferPageBucket(text: string, briefPageCount: number | null): PageBucket | null {
  if (briefPageCount !== null && briefPageCount > 0) {
    if (briefPageCount <= 1) return 1;
    if (briefPageCount <= 3) return 3;
    if (briefPageCount <= 5) return 5;
    return 7;
  }
  for (const hint of PAGE_HINT_PATTERNS) {
    if (hint.pattern.test(text)) return hint.bucket;
  }
  return null;
}

export function classifySiteProfile(
  prompt: string,
  options?: {
    briefPageCount?: number | null;
  },
): SiteProfile {
  const lower = prompt.toLowerCase();
  const briefPageCount = options?.briefPageCount ?? null;

  let bestCategory: BusinessCategory = "unknown";
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = scoreCategory(lower, rule);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  const confidence: SiteProfile["confidence"] =
    bestScore >= 3 ? "high" : bestScore >= 1 ? "medium" : "low";

  if (bestScore === 0) {
    const hasBusinessSignal = /\b(företag|firma|verksamhet|business|company)\b/i.test(lower);
    if (hasBusinessSignal) bestCategory = "generic-business";
  }

  const categoryRule = CATEGORY_RULES.find((r) => r.category === bestCategory);
  const pageBucket: PageBucket =
    inferPageBucket(lower, briefPageCount) ?? categoryRule?.defaultPages ?? 3;

  return { businessCategory: bestCategory, pageBucket, confidence };
}

export function getDefaultPageBucket(category: BusinessCategory): PageBucket {
  const rule = CATEGORY_RULES.find((r) => r.category === category);
  return rule?.defaultPages ?? 3;
}

export function getAllBusinessCategories(): BusinessCategory[] {
  return CATEGORY_RULES.map((r) => r.category);
}
