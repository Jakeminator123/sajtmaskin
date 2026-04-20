/**
 * Kategori-inferens för IntakeWizard / scrape-steget.
 *
 * Extraherat från `IntakeWizard.tsx` så logiken kan testas som ren funktion.
 * Keyword-tabellen är fortfarande inline (TS-arrays) — inte JSON — så det är
 * lätt att lägga till nya branscher per kategori utan att röra något annat.
 *
 * Kategori-id:n måste matcha `CATEGORIES[].id` i `IntakeWizard.tsx`.
 */

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurant: [
    "restaurang", "café", "cafe ", "kafé", "pub ", "pizzeria",
    "sushi", "bistro", "krog", "matställe", "lunch", "middag", "brunch",
    "fine dining", "gastropub", "tapas", "burger", "kebab", "falafel",
    "à la carte", "smörgås", "smörgåsbord",
  ],
  ecommerce: [
    "webshop", "e-handel", "nätbutik", "sälj", "produkter online",
    "butik online", "webbshop", "shop", "näthandel", "webbutik",
    "e-commerce", "onlinebutik", "handla online", "varukorg",
    "hudvårdsprodukter", "kosmetik", "skincare", "skönhetsprodukter",
    "cbd", "cbg", "hampa", "cannabidiol", "tillskott", "kosttillskott",
    "serum", "ansiktskräm", "hudserum",
  ],
  salon: [
    "salong", "frisör", "frisörsalong", "skönhet", "naglar", "hudvård",
    "spa", "barber", "makeup", "sminkning", "hårsalong",
    "skönhetssalong", "nagelsalong", "fransar", "bryn", "klippning",
    "färgning", "massage", "wellness", "fotvård",
  ],
  portfolio: [
    "portfolio", "cv", "personlig sida", "mitt arbete", "mina projekt",
    "kreativ portfolio", "design portfolio", "designer", "illustratör",
    "grafisk design", "konstnär", "frilansar", "freelancer",
  ],
  consulting: [
    "konsult", "byrå", "agentur", "rådgivning", "strategi",
    "managementkonsult", "it-konsult", "affärskonsult", "projektledning",
    "digitalbyrå", "webbyrå", "designbyrå",
  ],
  fitness: [
    "gym", "träning", "tränare", "fitness", "yoga", "pilates",
    "personlig tränare", " pt ", "crossfit", "gruppträning", "kampsport",
  ],
  construction: [
    "bygg", "hantverk", "snickare", "målare", "renovering",
    "elektriker", "rörmokare", "byggfirma", "entreprenad",
    "markarbete", "grävning", "schakt", "rivning", "anläggning",
    "asfalt", "betong", "vvs", "el-installation", "värmepump",
    "solceller", "takläggning", "golvläggning", "takmontör",
    "plattsättare", "murare",
  ],
  healthcare: [
    "vård", "klinik", "tandläkare", "läkare", "terapi", "psykolog",
    "kiropraktor", "fysioterapi", "sjukgymnast", "optiker",
    "naprapat", "akupunktur", "ortoped", "husläkare",
  ],
  tech: [
    "tech", "startup", "saas", "app", "mjukvara", "software",
    "plattform", "ai ", "developer", "programmering",
  ],
  blog: [
    "blogg", "magasin", "tidning", "artiklar", "nyheter", "content",
    "skribent", "journalist", "podcast",
  ],
  landing: [
    "landningssida", "landing page", "kampanj", "lansering",
    "kampanjsida", "registrering", "anmälan", "väntelista",
  ],
  education: [
    "utbildning", "skola", "kurs", "lärare", "akademi",
    "coaching", "onlinekurs", "e-learning", "förskola", "gymnasium",
  ],
  event: [
    "event", "bröllop", "fest", "konferens", "mässa", "festival",
    "eventbyrå", "eventplanering",
  ],
  nonprofit: [
    "förening", "ideell", "organisation", "välgörenhet", "stiftelse",
    "volontär", "donation", "insamling",
  ],
  music: [
    "musik", "artist", "band", "dj ", "producent", "skivbolag",
    "musiker", "sångare", "studio",
  ],
  hotel: [
    "hotell", "boende", "b&b", "stuga", "camping", "vandrarhem",
    "resort", "semesterboende",
  ],
  legal: [
    "juridik", "advokat", "jurist", "advokatbyrå", "rättshjälp",
    "avtal", "familjerätt",
  ],
  accounting: [
    "ekonomi", "redovisning", "bokföring", "revisor", "skatt",
    "ekonomibyrå", "redovisningsbyrå",
  ],
  auto: [
    "bil", "motor", "verkstad", "bilhandlare", "garage",
    "bilverkstad", "bilreparation", "mekaniker", "däckverkstad",
    "bilvård", "däckskifte", "lackering", "bilprovning",
  ],
  travel: [
    "resa", "turism", "resor", "resebyrå", "guide",
    "charterresa", "semester",
  ],
  food: [
    "mat", "catering", "bageri", "konditori", "food truck",
    "cateringföretag", "tårta",
  ],
  photo: [
    "foto", "fotograf", "video", "film", "media", "produktion",
    "fotografering", "videoproduktion",
  ],
  business: [
    // Generiska bolagsord
    "företag", "tjänst", "firma", "bolag", "aktiebolag",
    "enskild firma", "småföretag",
    // Skog
    "skog", "skogsbruk", "skogsägare", "skogsentreprenör",
    "virke", "timmer", "massaved", "sågverk", "trävaru",
    "gallring", "avverkning", "skogsmaskin", "skotare", "skördare",
    // Lantbruk
    "lantbruk", "jordbruk", "gård", "växtodling", "mjölk",
    "djurhållning", "bonde", "arrende", "ekogård",
    // Industri / tillverkning
    "industri", "tillverkning", "fabrik", "produktion",
    "maskinverkstad", "metallbearbetning", "svets", "plåt",
    "cnc", "legotillverkning", "komponent", "underleverantör",
    // Transport / logistik
    "transport", "åkeri", "logistik", "speditör", "fraktbolag",
    "lastbil", "budfirma", "distribution",
    // Jakt / fiske / natur
    "jakt", "vapen", "fiske", "skytte", "jägare",
    // B2B-tjänster
    "bemanning", "rekrytering", "städfirma", "städbolag",
    "säkerhet", "bevakning", "lokalvård",
  ],
};

/**
 * Substring-listor för starka signaler som vinner över svaga nyckelord.
 * Används av `inferCategoriesFromText` för att justera poängen vid tvetydiga
 * texter och av scrape-grenen för att avgöra om strukturella signaler (som
 * "products"-listor) får rösta fram `ecommerce`.
 */
export const STRONG_ECOMMERCE_SIGNALS: string[] = [
  "webshop", "webbshop", "e-handel", "e-commerce", "nätbutik", "webbutik",
  "onlinebutik", "näthandel", "produkter online", "handla online", "varukorg",
  "köp", "beställ", "leverans", "frakt", "checkout",
];

export const STRONG_RESTAURANT_SIGNALS: string[] = [
  "restaurang", "bistro", "krog", "pizzeria", "sushi", "café", "kafé",
  "matställe", "fine dining", "à la carte",
];

/**
 * Signaler som tydligt pekar på ett "vanligt företag/tjänst"-case. Används
 * för att bryta lika-poäng-dueller till `business` fördel istället för att
 * låta `ecommerce` vinna bara för att iterationsordningen gynnar den.
 */
export const STRONG_BUSINESS_SIGNALS: string[] = [
  "aktiebolag", "enskild firma", "åkeri", "entreprenad", "skogsbruk",
  "sågverk", "industri", "tillverkning", "fabrik", "maskinverkstad",
  "bilverkstad", "byggfirma", "konsult",
];

export interface CategoryInferenceOptions {
  /** Om satt loggas alla kandidater + vinnare via denna callback. */
  debug?: (label: string, payload: unknown) => void;
}

/**
 * Returnerar det mest troliga kategori-id:t baserat på fri text (företagsbeskrivning,
 * scrape-metadata, etc). Returnerar `[]` om ingenting matchar; annars en lista med
 * ett id. Returtypen behålls som array för bakåtkompatibilitet med anroparna.
 */
export function inferCategoriesFromText(
  text: string,
  options: CategoryInferenceOptions = {},
): string[] {
  const lower = text.toLowerCase();
  const matches: Array<{ id: string; score: number }> = [];
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0) matches.push({ id: catId, score });
  }

  const hasStrongEcommerce = STRONG_ECOMMERCE_SIGNALS.some((s) => lower.includes(s));
  const hasStrongRestaurant = STRONG_RESTAURANT_SIGNALS.some((s) => lower.includes(s));
  const hasStrongBusiness = STRONG_BUSINESS_SIGNALS.some((s) => lower.includes(s));

  const ecommerceEntry = matches.find((m) => m.id === "ecommerce");
  const salonEntry = matches.find((m) => m.id === "salon");
  if (ecommerceEntry && salonEntry) {
    const ecomBoost = STRONG_ECOMMERCE_SIGNALS.filter((s) => lower.includes(s)).length;
    if (ecomBoost > 0) ecommerceEntry.score += ecomBoost * 2;
  }

  // Släpp "restaurant" om texten luktar e-handel/salong men inte restaurang —
  // t.ex. "hudvårdsprodukter" + "shop" ska inte fälla café bara för att ordet
  // "cafe" råkar dyka upp någon annanstans.
  if (!hasStrongRestaurant && (hasStrongEcommerce || salonEntry)) {
    const rIdx = matches.findIndex((m) => m.id === "restaurant");
    if (rIdx >= 0) matches.splice(rIdx, 1);
  }

  // Boosta ecommerce bara när användaren uttryckligen säger att de säljer
  // något. Bara ordet "produkter" räcker inte — det ligger inte ens kvar i
  // ecommerce-listan efter städningen.
  if (ecommerceEntry && hasStrongEcommerce) {
    ecommerceEntry.score += 2;
  }

  // Tie-breaker: vid lika högsta poäng föredrar vi business (eller en bransch
  // med en stark business-signal) framför ecommerce. Iterationsordningen i
  // Object.entries är deterministisk men har tidigare låtit ecommerce vinna
  // mot business för trädbolag, åkerier och liknande där båda råkar få 1 hit.
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.id === "ecommerce" && b.id !== "ecommerce") return 1;
    if (b.id === "ecommerce" && a.id !== "ecommerce") return -1;
    if (a.id === "business") return -1;
    if (b.id === "business") return 1;
    return 0;
  });

  if (matches.length > 0 && hasStrongBusiness) {
    const businessEntry = matches.find((m) => m.id === "business");
    const leader = matches[0];
    if (
      businessEntry &&
      leader &&
      leader.id === "ecommerce" &&
      !hasStrongEcommerce &&
      businessEntry.score >= leader.score - 1
    ) {
      // Stark business-signal + ingen stark ecommerce-signal → flytta upp
      // business-posten, även om ecommerce har ett litet försprång.
      matches.splice(matches.indexOf(businessEntry), 1);
      matches.unshift(businessEntry);
    }
  }

  if (options.debug) {
    options.debug("[intake] category-inference", {
      text: lower.slice(0, 200),
      scores: matches.map((m) => ({ id: m.id, score: m.score })),
      hasStrongEcommerce,
      hasStrongRestaurant,
      hasStrongBusiness,
      winner: matches[0]?.id ?? null,
    });
  }

  return matches.slice(0, 1).map((m) => m.id);
}
