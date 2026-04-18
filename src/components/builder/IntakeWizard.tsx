"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NeedsAnalysisField } from "@/lib/builder/needs-analysis";

/* ── Types ───────────────────────────────────────────────────────── */

type StepId = "company" | "siteType" | "content" | "story" | "pages" | "media";

export interface ProductEntry {
  name: string;
  price: string;
  description: string;
  category: string;
  imageFile?: File;
  imagePreview?: string;
}

export interface MenuItemEntry {
  name: string;
  price: string;
  description: string;
  category: string;
  imageFile?: File;
  imagePreview?: string;
}

export interface TreatmentEntry {
  name: string;
  price: string;
  duration: string;
}

export interface TeamMemberEntry {
  name: string;
  role: string;
}

export interface ProjectEntry {
  name: string;
  client: string;
  description: string;
  imageFile?: File;
  imagePreview?: string;
}

export interface WizardAnswers {
  siteType: string[];
  companyName: string;
  offer: string;
  aboutUs: string;
  companyStory: string;
  vision: string;
  contactPageText: string;
  existingSite: string;
  phone: string;
  email: string;
  address: string;

  targetAudience: string;
  primaryCta: string;

  products: ProductEntry[];
  menuItems: MenuItemEntry[];
  treatments: TreatmentEntry[];
  teamMembers: TeamMemberEntry[];
  projects: ProjectEntry[];
  services: string[];
  uniqueSellingPoints: string[];
  testimonials: string;
  openingHours: string;
  bookingUrl: string;
  cuisine: string[];
  delivery: boolean;
  acceptsReservations: boolean;
  paymentMethods: string[];
  shippingInfo: string;
  priceRange: string;
  topics: string[];
  categorySpecific: Record<string, string | string[] | boolean>;

  logoFile: File | null;
  logoPreview: string;
  brandColors: string[];
  tone: string;
  designStyle: string;
  tagline: string;

  mustHave: string[];
  goal: string[];
  features: string[];

  /** Fri text: saker som INTE ska finnas på sajten (popups, stockbilder, video i hero...). */
  avoid: string;
  /** Bildstil-preferens (chips). */
  imagery: string[];

  siteMedia: Array<{ file: File; preview: string; context: string }>;
}

/* ── Exported types (backward compat with BuilderShellContent) ─── */

export interface IntakeWizardResult {
  answers: WizardAnswers;
  fieldMessages: Array<{ field: NeedsAnalysisField; text: string }>;
  /**
   * Files the user wants embedded on the site.
   * `context` is the human label (shown in LLM prompt for placement guidance).
   * `purpose` is the canonical upload-catalog key consumed by own-engine
   * (brand-logo, product-photo, hero-image, about-image, gallery-image,
   * background-image, site-media).
   */
  mediaFiles?: Array<{ file: File; context: string; purpose: string }>;
}

export interface WizardScrapeData {
  title?: string;
  description?: string;
  aboutUs?: string;
  companyStory?: string;
  vision?: string;
  contactPageText?: string;
  phone?: string;
  email?: string;
  socialLinks?: string[];
  brandColors?: string[];
  address?: string;
  openingHours?: string;
  tagline?: string;
  tone?: string;
  designStyle?: string;
  logoUrl?: string;
  services?: string[];
  uniqueSellingPoints?: string[];
  callToAction?: string;
  testimonials?: string[];
  metaDescription?: string;
  orgNr?: string;
  industries?: string[];
  employees?: number;
  menuItems?: Array<{ name: string; description?: string; price?: string }>;
  treatments?: Array<{ name: string; price?: string; duration?: string }>;
  products?: Array<{ name: string; price?: string; description?: string; image?: string }>;
  teamMembers?: Array<{ name: string; role?: string }>;
  projects?: Array<{ name: string; description?: string; url?: string }>;
  cuisine?: string;
  acceptsReservations?: boolean;
  delivery?: boolean;
  bookingUrl?: string;
  paymentMethods?: string[];
  shippingInfo?: string;
  priceRange?: string;
  topics?: string[];
  categorySpecific?: Record<string, string | string[] | boolean>;
}

interface IntakeWizardProps {
  onComplete: (result: IntakeWizardResult) => void;
  onScrapeUrl?: (url: string) => Promise<WizardScrapeData | null>;
  suggestContext?: { siteType?: string; companyDescription?: string; scrapeText?: string };
  initialExistingUrl?: string;
  initialPrompt?: string;
}

/* ── Site-type categories (full set) ─────────────────────────────── */

type CategoryItem = { id: string; label: string };

const CATEGORIES: CategoryItem[] = [
  { id: "business", label: "Företag / Tjänster" },
  { id: "ecommerce", label: "Webshop / E-handel" },
  { id: "restaurant", label: "Restaurang / Café" },
  { id: "portfolio", label: "Portfolio / CV" },
  { id: "landing", label: "Landningssida" },
  { id: "blog", label: "Blogg / Magasin" },
  { id: "consulting", label: "Konsult / Byrå" },
  { id: "tech", label: "Tech / Startup" },
  { id: "healthcare", label: "Vård / Klinik" },
  { id: "realestate", label: "Fastighet / Mäklare" },
  { id: "salon", label: "Salong / Skönhet" },
  { id: "fitness", label: "Gym / Tränare" },
  { id: "construction", label: "Bygg / Hantverk" },
  { id: "education", label: "Utbildning / Skola" },
  { id: "event", label: "Event / Bröllop" },
  { id: "nonprofit", label: "Förening / Ideell" },
  { id: "music", label: "Musik / Artist" },
  { id: "hotel", label: "Hotell / Boende" },
  { id: "legal", label: "Juridik / Advokat" },
  { id: "accounting", label: "Ekonomi / Redovisning" },
  { id: "auto", label: "Bil / Motor" },
  { id: "travel", label: "Resa / Turism" },
  { id: "food", label: "Mat / Catering" },
  { id: "photo", label: "Foto / Video" },
  { id: "other", label: "Annat" },
];

/* ── Options ─────────────────────────────────────────────────────── */

// Internal scrape-mapping lists. Not surfaced in the wizard UI (LLM owns
// design decisions) — used only to normalize values that arrive from the
// webscraper into a stable set of labels for downstream briefs.
const TONE_OPTIONS = ["Professionell", "Varm och personlig", "Lekfull", "Exklusiv / lyxig", "Rak och enkel"];
const DESIGN_STYLE_OPTIONS = ["Minimalistisk", "Kraftfull", "Elegant", "Lekfull och färgglad", "Låt AI:n välja"];

const CTA_OPTIONS = [
  "Boka tid",
  "Kontakta oss",
  "Köp nu",
  "Begär offert",
  "Registrera dig",
  "Läs mer",
  "Ring oss",
  "Ladda ner",
];

const MUST_HAVE_OPTIONS = [
  "Startsida / Hero",
  "Om oss / Om mig",
  "Kontaktformulär",
  "Priser och paket",
  "Bokning online",
  "Bildgalleri",
  "Blogg / Nyheter",
  "Kundrecensioner",
  "FAQ",
  "Portfolio / Case",
  "Vårt team",
  "Karta / Hitta hit",
  "Nyhetsbrev",
  "Webshop / Produkter",
  "Meny / Matsedel",
];

type FeatureModule = { id: string; label: string; description: string };

const FEATURE_MODULES: { category: string; items: FeatureModule[] }[] = [
  {
    category: "Interaktion",
    items: [
      { id: "booking", label: "Onlinebokning", description: "Bokningsformulär med datum, tid och tjänst" },
      { id: "contact-form", label: "Kontaktformulär", description: "Namn, e-post, meddelande med bekräftelse" },
      { id: "newsletter", label: "Nyhetsbrev", description: "E-post signup i footer eller popup" },
      { id: "live-chat", label: "Chatt / Support", description: "Chattbubbla eller supportwidget" },
      { id: "reviews", label: "Kundrecensioner", description: "Omdömen med stjärnbetyg och citat" },
    ],
  },
  {
    category: "Innehåll",
    items: [
      { id: "blog", label: "Blogg / Nyheter", description: "Artikelsida med kategorier och datum" },
      { id: "faq", label: "FAQ", description: "Vanliga frågor med expanderbar accordion" },
      { id: "gallery", label: "Bildgalleri", description: "Responsivt grid med lightbox" },
      { id: "portfolio", label: "Portfolio / Case", description: "Projekt med bilder och beskrivning" },
      { id: "team", label: "Teamsektion", description: "Medarbetare med bild, namn och roll" },
      { id: "menu", label: "Meny / Prislista", description: "Rätter eller tjänster med pris" },
      { id: "pricing", label: "Prispaket", description: "Paketjämförelse i kolumner" },
    ],
  },
  {
    category: "E-handel",
    items: [
      { id: "product-catalog", label: "Produktkatalog", description: "Produktgrid med filter och sortering" },
      { id: "cart", label: "Varukorg", description: "Lägg till, ta bort, beställ" },
      { id: "checkout", label: "Betalning / Checkout", description: "Betalflöde med Swish, kort etc." },
    ],
  },
  {
    category: "Funktioner",
    items: [
      { id: "login", label: "Inloggning", description: "Användarkonton med login/registrering" },
      { id: "search", label: "Sökfunktion", description: "Sök i innehåll eller produkter" },
      { id: "map", label: "Karta / Hitta hit", description: "Google Maps med vägbeskrivning" },
      { id: "dark-mode", label: "Mörkt läge", description: "Tema-switch för ljust/mörkt" },
      { id: "multi-lang", label: "Flerspråkig", description: "Stöd för svenska och engelska" },
      { id: "cookie-banner", label: "Cookie-banner", description: "GDPR-kompatibel cookie-hantering" },
    ],
  },
];

/**
 * Heuristic: map siteType category labels to recommended feature module ids.
 * Covers common patterns; user can always toggle on/off.
 */
const SITE_TYPE_FEATURE_MAP: Record<string, string[]> = {
  "Företag / Tjänster":   ["contact-form", "newsletter", "faq", "map"],
  "Webshop / E-handel":   ["product-catalog", "cart", "checkout", "newsletter", "reviews", "search"],
  "Restaurang / Café":    ["booking", "menu", "map", "gallery", "reviews"],
  "Portfolio / CV":       ["gallery", "portfolio", "contact-form"],
  "Landningssida":        ["contact-form", "newsletter", "faq"],
  "Blogg / Magasin":      ["blog", "newsletter", "search"],
  "Konsult / Byrå":       ["contact-form", "booking", "portfolio", "faq", "team"],
  "Tech / Startup":       ["blog", "newsletter", "pricing", "faq", "login"],
  "Vård / Klinik":        ["booking", "contact-form", "team", "faq", "map"],
  "Fastighet / Mäklare":  ["gallery", "contact-form", "map", "search"],
  "Salong / Skönhet":     ["booking", "gallery", "pricing", "reviews", "map"],
  "Gym / Tränare":        ["booking", "pricing", "team", "gallery", "reviews"],
  "Bygg / Hantverk":      ["contact-form", "gallery", "portfolio", "reviews", "map"],
  "Utbildning / Skola":   ["contact-form", "faq", "blog", "team", "pricing"],
  "Event / Bröllop":      ["booking", "gallery", "contact-form", "faq", "pricing"],
  "Förening / Ideell":    ["blog", "contact-form", "team", "newsletter", "faq"],
  "Musik / Artist":       ["gallery", "blog", "newsletter", "contact-form"],
  "Hotell / Boende":      ["booking", "gallery", "pricing", "reviews", "map"],
  "Juridik / Advokat":    ["contact-form", "faq", "team", "blog"],
  "Ekonomi / Redovisning":["contact-form", "pricing", "faq", "team"],
  "Bil / Motor":          ["contact-form", "gallery", "reviews", "map"],
  "Resa / Turism":        ["booking", "gallery", "blog", "reviews", "map"],
  "Mat / Catering":       ["menu", "booking", "gallery", "reviews", "contact-form"],
  "Foto / Video":         ["gallery", "portfolio", "contact-form", "pricing"],
};

function inferFeatureModules(siteTypes: string[], offer: string): string[] {
  const ids = new Set<string>();
  for (const label of siteTypes) {
    const mapped = SITE_TYPE_FEATURE_MAP[label];
    if (mapped) mapped.forEach((id) => ids.add(id));
  }
  const lower = offer.toLowerCase();
  if (/webshop|e-handel|produkt|shop|butik/.test(lower)) {
    ["product-catalog", "cart", "checkout"].forEach((id) => ids.add(id));
  }
  if (/bok(a|ning)|tid|möte|appointment/.test(lower)) ids.add("booking");
  if (/blogg|artikel|nyheter/.test(lower)) ids.add("blog");
  if (/recension|omdöme|betyg/.test(lower)) ids.add("reviews");
  if (/meny|matsedel|rätter/.test(lower)) ids.add("menu");
  if (/galleri|bilder|foto/.test(lower)) ids.add("gallery");
  if (/pris|paket|offert/.test(lower)) ids.add("pricing");
  if (/nyhetsbrev|mail|e-post/.test(lower)) ids.add("newsletter");
  return [...ids];
}

const CUISINE_OPTIONS = ["Svenskt", "Italienskt", "Asiatiskt", "Franskt", "Amerikanskt", "Fusion", "Vegetariskt", "Annat"];
const PAYMENT_OPTIONS = ["Swish", "Kort", "Klarna", "Faktura", "PayPal"];
const PRICE_RANGE_OPTIONS = ["Budget", "Mellan", "Premium"];
const MENU_CATEGORY_OPTIONS = ["Förrätter", "Varmrätter", "Desserter", "Drycker", "Övrigt"];
const PRODUCT_CATEGORY_OPTIONS = ["Populärt", "Nyhet", "Rea", "Övrigt"];

const HOTEL_AMENITY_OPTIONS = ["WiFi", "Parkering", "Pool", "Gym", "Spa", "Frukost", "Restaurang", "Bar", "Rum med utsikt", "Husdjur tillåtna"];
const HOTEL_ROOM_OPTIONS = ["Enkelrum", "Dubbelrum", "Svit", "Familjerum", "Stuga / Lägenhet"];
const CONSTRUCTION_PROJECT_OPTIONS = ["Nybyggnation", "Renovering", "Tillbyggnad", "Badrum", "Kök", "Tak", "Fasad", "Målning", "El", "VVS"];
const EDUCATION_FORMAT_OPTIONS = ["På plats", "Distans / Online", "Hybrid", "Kvällskurs", "Helgkurs", "Självstudier"];
const EVENT_TYPE_OPTIONS = ["Bröllop", "Företagsevent", "Konferens", "Fest", "Konsert", "Mässa", "Workshop", "Festival"];
const LEGAL_AREA_OPTIONS = ["Familjerätt", "Avtalsrätt", "Arbetsrätt", "Bostadsrätt", "Straffrätt", "Affärsjuridik", "Migrationsrätt", "Skatterätt"];
const PROPERTY_TYPE_OPTIONS = ["Villa", "Bostadsrätt", "Hyresrätt", "Tomt", "Kommersiell", "Fritidshus"];
const CONSULTING_EXPERTISE_OPTIONS = ["Strategi", "IT / Digitalisering", "Marknadsföring", "Organisation", "Ekonomi", "HR / Rekrytering", "Hållbarhet", "Innovation"];

/* ── Category inference from text ────────────────────────────────── */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
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
    "serum", "ansiktskräm", "hudserum", "produkter", "sortiment",
  ],
  salon: [
    "salong", "frisör", "frisörsalong", "skönhet", "naglar", "hudvård",
    "spa", "barber", "makeup", "sminkning", "hårsalong",
    "skönhetssalong", "nagelsalong", "fransar", "bryn", "klippning",
    "färgning", "massage", "wellness",
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
    "personlig tränare", "crossfit", "gruppträning", "kampsport",
  ],
  construction: [
    "bygg", "hantverk", "snickare", "målare", "renovering",
    "elektriker", "rörmokare", "byggfirma", "entreprenad",
  ],
  healthcare: [
    "vård", "klinik", "tandläkare", "läkare", "terapi", "psykolog",
    "kiropraktor", "fysioterapi", "sjukgymnast", "optiker",
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
    "coaching", "onlinekurs", "e-learning",
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
    "bilverkstad", "bilreparation",
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
    "företag", "tjänst", "firma", "bolag", "aktiebolag",
    "enskild firma", "småföretag",
  ],
};

const STRONG_ECOMMERCE_SIGNALS = [
  "webshop", "webbshop", "e-handel", "e-commerce", "nätbutik", "webbutik",
  "onlinebutik", "näthandel", "produkter online", "handla online", "varukorg",
  "köp", "beställ", "leverans", "frakt", "checkout",
];
const STRONG_RESTAURANT_SIGNALS = [
  "restaurang", "bistro", "krog", "pizzeria", "sushi", "café", "kafé",
  "matställe", "fine dining", "à la carte",
];

function inferCategoriesFromText(text: string): string[] {
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

  const hasEcommerce = matches.find((m) => m.id === "ecommerce");
  const hasSalon = matches.find((m) => m.id === "salon");
  if (hasEcommerce && hasSalon) {
    const ecomBoost = STRONG_ECOMMERCE_SIGNALS.filter((s) => lower.includes(s)).length;
    if (ecomBoost > 0) hasEcommerce.score += ecomBoost * 2;
  }

  // Drop restaurant if text has strong ecommerce/salon evidence but no strong
  // restaurant noun. "hudvårdsprodukter" + "shop" should never surface café
  // just because the word "cafe" happens to appear elsewhere.
  if (!hasStrongRestaurant && (hasStrongEcommerce || hasSalon)) {
    const rIdx = matches.findIndex((m) => m.id === "restaurant");
    if (rIdx >= 0) matches.splice(rIdx, 1);
  }

  // Give ecommerce an extra nudge whenever the user explicitly said they sell
  // something — "produkter", "sortiment", "cbd" alone don't prove a webshop,
  // but paired with any strong ecommerce verb they do.
  if (hasEcommerce && hasStrongEcommerce) {
    hasEcommerce.score += 2;
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 1).map((m) => m.id);
}

function extractOffer(prompt: string): string {
  return prompt.replace(/\n\nBefintlig sajt:.*$/s, "").trim();
}

/* ── Branch detection helpers ────────────────────────────────────── */

type ContentBranch =
  | "ecommerce" | "restaurant" | "salon" | "portfolio" | "business" | "minimal"
  | "hotel" | "construction" | "education" | "event" | "legal" | "realestate" | "nonprofit" | "consulting";

function resolveContentBranch(siteTypeLabels: string[]): ContentBranch {
  const catIds = siteTypeLabels
    .map((label) => CATEGORIES.find((c) => c.label === label)?.id)
    .filter(Boolean) as string[];

  if (catIds.includes("ecommerce")) return "ecommerce";

  for (const id of catIds) {
    if (id === "restaurant" || id === "food") return "restaurant";
    if (id === "salon" || id === "healthcare" || id === "fitness") return "salon";
    if (id === "portfolio" || id === "photo" || id === "music") return "portfolio";
    if (id === "hotel" || id === "travel") return "hotel";
    if (id === "construction" || id === "auto") return "construction";
    if (id === "education") return "education";
    if (id === "event") return "event";
    if (id === "legal" || id === "accounting") return "legal";
    if (id === "realestate") return "realestate";
    if (id === "nonprofit") return "nonprofit";
    if (id === "consulting" || id === "tech") return "consulting";
    if (id === "blog" || id === "landing" || id === "other") return "minimal";
  }
  return "business";
}

function contentBranchTitle(branch: ContentBranch): string {
  switch (branch) {
    case "ecommerce": return "Dina produkter";
    case "restaurant": return "Meny och mat";
    case "salon": return "Behandlingar och team";
    case "portfolio": return "Projekt och kompetenser";
    case "hotel": return "Boende och faciliteter";
    case "construction": return "Tjänster och projekt";
    case "education": return "Utbildning och kurser";
    case "event": return "Event och arrangemang";
    case "legal": return "Verksamhet och expertis";
    case "realestate": return "Fastigheter och tjänster";
    case "nonprofit": return "Uppdrag och engagemang";
    case "consulting": return "Expertis och erbjudande";
    case "business": return "Tjänster och erbjudande";
    case "minimal": return "Ditt innehåll";
  }
}

/* ── Empty state ─────────────────────────────────────────────────── */

/**
 * Category-aware must-have defaults. Keys are CATEGORIES.id — values are
 * labels from MUST_HAVE_OPTIONS. Pre-checked so the user can add/remove but
 * doesn't need to find them manually.
 */
const CATEGORY_MUST_HAVE_DEFAULTS: Record<string, string[]> = {
  ecommerce: ["Webshop / Produkter", "Kontaktformulär"],
  restaurant: ["Meny / Matsedel", "Bokning online", "Kontaktformulär"],
  salon: ["Bokning online", "Priser och paket", "Kundrecensioner"],
  fitness: ["Bokning online", "Priser och paket"],
  portfolio: ["Bildgalleri", "Portfolio / Case", "Kontaktformulär"],
  hotel: ["Bokning online", "Bildgalleri", "Priser och paket"],
  construction: ["Portfolio / Case", "Kontaktformulär"],
  healthcare: ["Bokning online", "Kontaktformulär"],
  legal: ["Kontaktformulär", "FAQ"],
  accounting: ["Priser och paket", "Kontaktformulär"],
  realestate: ["Bildgalleri", "Kontaktformulär", "Karta / Hitta hit"],
  consulting: ["Portfolio / Case", "Kontaktformulär"],
  tech: ["Priser och paket", "Kontaktformulär"],
  event: ["Bokning online", "Bildgalleri"],
  landing: ["Kontaktformulär"],
  blog: ["Blogg / Nyheter", "Nyhetsbrev"],
  education: ["Kontaktformulär", "FAQ"],
};

function deriveMustHaveDefaults(inferredLabels: string[]): string[] {
  const ids = inferredLabels
    .map((l) => CATEGORIES.find((c) => c.label === l)?.id)
    .filter(Boolean) as string[];
  const merged = new Set<string>();
  for (const id of ids) {
    const defaults = CATEGORY_MUST_HAVE_DEFAULTS[id];
    if (defaults) defaults.forEach((v) => merged.add(v));
  }
  return [...merged];
}

function emptyAnswers(promptOffer: string, inferredLabels: string[], initialUrl: string): WizardAnswers {
  const isEcommerce = inferredLabels.some((l) => {
    const cat = CATEGORIES.find((c) => c.label === l);
    return cat?.id === "ecommerce";
  });
  return {
    siteType: inferredLabels,
    companyName: "",
    offer: promptOffer,
    aboutUs: "",
    companyStory: "",
    vision: "",
    contactPageText: "",
    existingSite: initialUrl,
    phone: "",
    email: "",
    address: "",
    targetAudience: "",
    primaryCta: "",
    products: isEcommerce ? [{ name: "", price: "", description: "", category: "" }] : [],
    menuItems: [],
    treatments: [],
    teamMembers: [],
    projects: [],
    services: [],
    uniqueSellingPoints: [],
    testimonials: "",
    openingHours: "",
    bookingUrl: "",
    cuisine: [],
    delivery: false,
    acceptsReservations: false,
    paymentMethods: [],
    shippingInfo: "",
    priceRange: "",
    topics: [],
    categorySpecific: {},
    logoFile: null,
    logoPreview: "",
    brandColors: [],
    tone: "",
    designStyle: "",
    tagline: "",
    mustHave: deriveMustHaveDefaults(inferredLabels),
    goal: [],
    features: [],
    avoid: "",
    imagery: [],
    siteMedia: [],
  };
}

/* ── Step definitions ────────────────────────────────────────────── */

const STEP_TITLES: Record<StepId, string> = {
  company: "Ditt företag",
  siteType: "Kategori",
  content: "Innehåll",
  story: "Om företaget",
  pages: "Sidor",
  media: "Media",
};

/** Motion: 150–200ms; prefers-reduced-motion respected via Tailwind motion-safe / motion-reduce */
const MOTION =
  "motion-safe:transition-[color,background-color,border-color,box-shadow,opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none";

const FIELD_CLASS = cn(
  "w-full min-h-11 touch-manipulation rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground shadow-sm",
  "placeholder:text-muted-foreground/55",
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
  MOTION,
);

const STEP_SUBTITLES: Record<StepId, string> = {
  company: "",
  siteType: "",
  content: "",
  story: "Berätta mer — detta ger innehåll till Om oss och Kontakt",
  pages: "",
  media: "",
};

const DIETARY_OPTIONS = ["Veganskt", "Vegetariskt", "Glutenfritt", "Laktosfritt", "Ekologiskt"];
const EDUCATION_LEVEL_OPTIONS = ["Barn", "Ungdom", "Vuxen", "Företag", "Senior"];

/* ── Main component ──────────────────────────────────────────────── */

export function IntakeWizard({ onComplete, onScrapeUrl, suggestContext, initialExistingUrl, initialPrompt }: IntakeWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const promptOffer = initialPrompt ? extractOffer(initialPrompt) : "";
  const inferredCategoryIds = useRef(
    initialPrompt ? inferCategoriesFromText(initialPrompt) : [],
  ).current;
  const inferredLabels = useRef(
    inferredCategoryIds
      .map((id) => CATEGORIES.find((c) => c.id === id)?.label)
      .filter(Boolean) as string[],
  ).current;

  const [answers, setAnswers] = useState<WizardAnswers>(() =>
    emptyAnswers(promptOffer, inferredLabels, initialExistingUrl ?? ""),
  );

  const autoScrapedRef = useRef(false);
  
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const scrapeProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scrapeComplete, setScrapeComplete] = useState(false);
  const [scrapedFields, setScrapedFields] = useState<Set<string>>(new Set());
  const [scrapedCategoryIds, setScrapedCategoryIds] = useState<string[]>([]);
  const scrapeAbortRef = useRef(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const steps: StepId[] = ["company", "siteType", "content", "story", "pages", "media"];
  const totalSteps = steps.length;
  const step = steps[currentStep];
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const contentBranch = resolveContentBranch(answers.siteType);

  /* ── Scrape ──────────────────────────────────────────────────── */

  const normalizeUrl = useCallback((raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[a-z0-9][\w.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
    return null;
  }, []);

  const applyScrapeToBusiness = useCallback((data: WizardScrapeData) => {
    const filled = new Set<string>();

    const combinedCatIds: string[] = [];

    if (data.industries?.length) {
      for (const ind of data.industries) {
        combinedCatIds.push(...inferCategoriesFromText(ind));
      }
    }

    const descriptionText = [data.metaDescription, data.description, data.title, data.tagline].filter(Boolean).join(" ");
    if (descriptionText.length > 5) {
      combinedCatIds.push(...inferCategoriesFromText(descriptionText));
    }

    // Structural signals from the scraper can be noisy (e.g. CBD price lists
    // parsed as menu items). Only count them when they clear a bar of evidence
    // AND don't contradict strong text signals for another category.
    const textLower = `${data.metaDescription ?? ""} ${data.description ?? ""} ${data.title ?? ""} ${data.tagline ?? ""}`.toLowerCase();
    const textSaysEcommerce = STRONG_ECOMMERCE_SIGNALS.some((s) => textLower.includes(s));
    const textSaysRestaurant = STRONG_RESTAURANT_SIGNALS.some((s) => textLower.includes(s));

    if (data.menuItems && data.menuItems.length >= 3 && !textSaysEcommerce) {
      // Only trust "menu items" as restaurant when text doesn't scream webshop.
      combinedCatIds.push("restaurant");
    }
    if (data.products?.length) {
      combinedCatIds.push("ecommerce");
      // Products outweighs weak menu hits — if both fire, ecommerce wins.
      if (data.products.length >= 3) combinedCatIds.push("ecommerce");
    }
    if (data.treatments?.length) combinedCatIds.push("salon");
    if (data.projects?.length) combinedCatIds.push("portfolio");
    if (data.bookingUrl && !textSaysEcommerce && !textSaysRestaurant) combinedCatIds.push("salon");

    const scoredCatIds = combinedCatIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
    const rankedCatIds = Object.entries(scoredCatIds)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    if (rankedCatIds.length) {
      setScrapedCategoryIds(rankedCatIds);
      const topLabel = CATEGORIES.find((c) => c.id === rankedCatIds[0])?.label;
      if (topLabel) {
        setAnswers((prev) => ({
          ...prev,
          siteType: prev.siteType.length ? prev.siteType : [topLabel],
        }));
      }
    }

    setAnswers((prev) => {
      const next = { ...prev };
      if (prev.offer.trim().length < 3) {
        const offerParts: string[] = [];
        if (data.metaDescription) offerParts.push(data.metaDescription);
        else if (data.description) offerParts.push(data.description);
        if (data.tagline && !offerParts.some((p) => p.includes(data.tagline!))) offerParts.push(data.tagline);
        if (data.services?.length) offerParts.push(`Tjänster: ${data.services.slice(0, 6).join(", ")}.`);
        if (data.uniqueSellingPoints?.length) offerParts.push(data.uniqueSellingPoints.slice(0, 3).join(". ") + ".");
        if (offerParts.length > 0) {
          next.offer = offerParts.join("\n\n");
          filled.add("offer");
        }
      }
      if (data.title && !prev.companyName) { next.companyName = data.title; filled.add("companyName"); }
      if (data.aboutUs && !prev.aboutUs) { next.aboutUs = data.aboutUs; filled.add("aboutUs"); }
      if (data.companyStory && !prev.companyStory) { next.companyStory = data.companyStory; filled.add("companyStory"); }
      if (data.vision && !prev.vision) { next.vision = data.vision; filled.add("vision"); }
      if (data.contactPageText && !prev.contactPageText) { next.contactPageText = data.contactPageText; filled.add("contactPageText"); }
      if (data.phone && !prev.phone) { next.phone = data.phone; filled.add("phone"); }
      if (data.email && !prev.email) { next.email = data.email; filled.add("email"); }
      if (data.address && !prev.address) { next.address = data.address; filled.add("address"); }
      if (data.brandColors?.length && !prev.brandColors.length) { next.brandColors = data.brandColors; filled.add("brandColors"); }
      if (data.tagline && !prev.tagline) { next.tagline = data.tagline; filled.add("tagline"); }

      const matchedTone = data.tone
        ? TONE_OPTIONS.find((t) => data.tone!.toLowerCase().includes(t.toLowerCase().split(" ")[0]))
        : undefined;
      if (matchedTone && !prev.tone) { next.tone = matchedTone; filled.add("tone"); }

      const matchedDesign = data.designStyle
        ? DESIGN_STYLE_OPTIONS.find((d) => data.designStyle!.toLowerCase().includes(d.toLowerCase().split(" ")[0]))
        : undefined;
      if (matchedDesign && !prev.designStyle) { next.designStyle = matchedDesign; filled.add("designStyle"); }

      if (data.services?.length && !prev.services.length) { next.services = data.services; filled.add("services"); }
      if (data.uniqueSellingPoints?.length && !prev.uniqueSellingPoints.length) { next.uniqueSellingPoints = data.uniqueSellingPoints; filled.add("uniqueSellingPoints"); }
      if (data.testimonials?.length && !prev.testimonials) { next.testimonials = data.testimonials.join("\n\n"); filled.add("testimonials"); }
      if (data.openingHours && !prev.openingHours) { next.openingHours = data.openingHours; filled.add("openingHours"); }
      if (data.cuisine && !prev.cuisine.length) { next.cuisine = [data.cuisine]; filled.add("cuisine"); }
      if (data.acceptsReservations != null) { next.acceptsReservations = data.acceptsReservations; filled.add("acceptsReservations"); }
      if (data.delivery != null) { next.delivery = data.delivery; filled.add("delivery"); }
      if (data.priceRange && !prev.priceRange) { next.priceRange = data.priceRange; filled.add("priceRange"); }
      if (data.bookingUrl && !prev.bookingUrl) { next.bookingUrl = data.bookingUrl; filled.add("bookingUrl"); }
      if (data.shippingInfo && !prev.shippingInfo) { next.shippingInfo = data.shippingInfo; filled.add("shippingInfo"); }
      if (data.paymentMethods?.length && !prev.paymentMethods.length) { next.paymentMethods = data.paymentMethods; filled.add("paymentMethods"); }
      if (data.topics?.length && !prev.topics.length) { next.topics = data.topics; filled.add("topics"); }

      if (data.menuItems?.length && !prev.menuItems.length) {
        next.menuItems = data.menuItems.map((m) => ({
          name: m.name, price: m.price ?? "", description: m.description ?? "", category: "", imagePreview: "",
        }));
        filled.add("menuItems");
      }
      if (data.treatments?.length && !prev.treatments.length) {
        next.treatments = data.treatments.map((t) => ({
          name: t.name, price: t.price ?? "", duration: t.duration ?? "",
        }));
        filled.add("treatments");
      }
      if (data.products?.length && !prev.products.length) {
        next.products = data.products.map((p) => ({
          name: p.name, price: p.price ?? "", description: p.description ?? "", category: "", imagePreview: "",
        }));
        filled.add("products");
      }
      if (data.teamMembers?.length && !prev.teamMembers.length) {
        next.teamMembers = data.teamMembers.map((t) => ({
          name: t.name, role: t.role ?? "",
        }));
        filled.add("teamMembers");
      }
      if (data.projects?.length && !prev.projects.length) {
        next.projects = data.projects.map((p) => ({
          name: p.name, client: "", description: p.description ?? "",
        }));
        filled.add("projects");
      }

      if (data.categorySpecific && Object.keys(data.categorySpecific).length > 0) {
        next.categorySpecific = { ...prev.categorySpecific, ...data.categorySpecific };
        filled.add("categorySpecific");
      }

      const autoMustHaves: string[] = ["Startsida / Hero", "Kontaktformulär"];
      if (data.menuItems?.length) autoMustHaves.push("Meny / Matsedel");
      if (data.teamMembers?.length) autoMustHaves.push("Vårt team");
      if (data.acceptsReservations || data.bookingUrl) autoMustHaves.push("Bokning online");
      if (data.services?.length) autoMustHaves.push("Priser och paket");
      if (data.testimonials?.length) autoMustHaves.push("Kundrecensioner");
      if (data.products?.length) autoMustHaves.push("Produktkatalog");
      if (data.projects?.length) autoMustHaves.push("Portfolio / Projekt");
      next.mustHave = [...new Set([...prev.mustHave, ...autoMustHaves])];

      if (!prev.goal.length) {
        const autoGoals: string[] = ["Få fler kunder"];
        if (data.callToAction?.toLowerCase().includes("boka") || data.bookingUrl) autoGoals.push("Boka tid / möten");
        if (data.callToAction?.toLowerCase().includes("offert")) autoGoals.push("Samla leads / offertförfrågningar");
        if (data.products?.length) autoGoals.push("Sälja produkter online");
        next.goal = autoGoals;
      }
      return next;
    });

    setScrapedFields(filled);
  }, []);

  const startScrapeProgress = useCallback(() => {
    setScrapeProgress(0);
    if (scrapeProgressRef.current) clearInterval(scrapeProgressRef.current);
    const start = Date.now();
    scrapeProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const raw = Math.min(elapsed / 25000, 1);
      const eased = 1 - Math.pow(1 - raw, 1.6);
      setScrapeProgress(Math.min(Math.round(eased * 90), 90));
    }, 200);
  }, []);

  const stopScrapeProgress = useCallback((success: boolean) => {
    if (scrapeProgressRef.current) {
      clearInterval(scrapeProgressRef.current);
      scrapeProgressRef.current = null;
    }
    if (success) {
      setScrapeProgress(100);
      setTimeout(() => setScraping(false), 600);
    } else {
      setScraping(false);
    }
  }, []);

  const handleScrape = useCallback(async (url: string) => {
    if (!onScrapeUrl || scraping) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    scrapeAbortRef.current = false;
    setScraping(true);
    setScrapeComplete(false);
    startScrapeProgress();
    try {
      const data = await onScrapeUrl(normalized);
      if (data && !scrapeAbortRef.current) {
        applyScrapeToBusiness(data);
        setScrapeComplete(true);
        const filled: string[] = [];
        if (data.title) filled.push("företagsnamn");
        if (data.metaDescription || data.description || data.services?.length) filled.push("verksamhetsbeskrivning");
        if (data.phone || data.email) filled.push("kontaktuppgifter");
        if (data.services?.length) filled.push("tjänster");
        if (data.tagline) filled.push("tagline");
        if (data.brandColors?.length) filled.push("färgpalett");
        if (data.industries?.length) filled.push("bransch");
        if (filled.length > 0) {
          toast.success(`Hämtade ${filled.length} uppgifter`, { description: filled.join(", ") });
        } else {
          toast("Kunde inte hämta tillräckligt med data. Fyll i fälten manuellt.");
        }
        stopScrapeProgress(true);
      } else if (!scrapeAbortRef.current) {
        toast.error("Kunde inte analysera sajten.");
        stopScrapeProgress(false);
      } else {
        stopScrapeProgress(false);
      }
    } catch {
      if (!scrapeAbortRef.current) toast.error("Något gick fel vid analys.");
      stopScrapeProgress(false);
    }
  }, [onScrapeUrl, scraping, applyScrapeToBusiness, normalizeUrl, startScrapeProgress, stopScrapeProgress]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!initialExistingUrl || autoScrapedRef.current || !onScrapeUrl) return;
    autoScrapedRef.current = true;
    scrapeAbortRef.current = false;
    const url = initialExistingUrl.startsWith("http") ? initialExistingUrl : `https://${initialExistingUrl}`;
    setScraping(true);
    startScrapeProgress();
    void onScrapeUrl(url).then((data) => {
      if (data && !scrapeAbortRef.current) {
        applyScrapeToBusiness(data);
        setScrapeComplete(true);
        stopScrapeProgress(true);
      } else {
        stopScrapeProgress(false);
      }
    }).catch(() => {
      stopScrapeProgress(false);
    });
  }, [initialExistingUrl, onScrapeUrl, applyScrapeToBusiness, startScrapeProgress, stopScrapeProgress]);

  /* ── AI suggestions ──────────────────────────────────────────── */

  const handleSuggestMustHaves = useCallback(async () => {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const ctx = suggestContext ?? {};
      const ctxWithType = { ...ctx, siteType: ctx.siteType || answers.siteType.join(", "), companyDescription: ctx.companyDescription || answers.offer };
      const res = await fetch("/api/ai/suggest-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctxWithType),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        setAnswers((prev) => ({
          ...prev,
          mustHave: [...new Set([...prev.mustHave, ...data.suggestions])],
        }));
      }
    } catch { /* silently fail */ }
    finally { setSuggesting(false); }
  }, [suggesting, suggestContext, answers.siteType, answers.offer]);

  const mustHaveAutoSuggestedRef = useRef(false);
  const featureAutoSuggestedRef = useRef(false);
  useEffect(() => {
    if (step === "company" && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
    if (step === "pages" && !mustHaveAutoSuggestedRef.current) {
      mustHaveAutoSuggestedRef.current = true;
      void handleSuggestMustHaves();
    }
    if (step === "pages" && !featureAutoSuggestedRef.current) {
      featureAutoSuggestedRef.current = true;
      const suggested = inferFeatureModules(answers.siteType, answers.offer);
      if (suggested.length > 0) {
        setAnswers((prev) => ({
          ...prev,
          features: [...new Set([...prev.features, ...suggested])],
        }));
      }
    }
  }, [step, handleSuggestMustHaves, answers.siteType, answers.offer]);

  /* ── Navigation ──────────────────────────────────────────────── */

  const canContinue = useCallback(() => {
    if (!step || scraping) return false;
    switch (step) {
      case "company": return answers.companyName.trim().length >= 2 && answers.offer.trim().length >= 3;
      case "siteType": return answers.siteType.length > 0;
      case "content": return true;
      case "story": return true;
      case "pages": return answers.mustHave.length > 0;
      case "media": return true;
    }
  }, [step, answers, scraping]);

  const toggleChip = useCallback((field: "goal" | "mustHave" | "cuisine" | "paymentMethods", value: string) => {
    setAnswers((prev) => {
      const arr = prev[field] as string[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
  }, []);

  const selectSiteType = useCallback((label: string) => {
    setAnswers((prev) => ({
      ...prev,
      siteType: prev.siteType[0] === label ? prev.siteType : [label],
      mustHave: prev.mustHave.length ? prev.mustHave : deriveMustHaveDefaults([label]),
    }));
  }, []);

  const clearScrapedField = useCallback((field: string) => {
    setScrapedFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setDirection("forward");
      setCurrentStep((s) => s + 1);
    } else {
      // Build fieldMessages for downstream consumption
      const fieldMessages: IntakeWizardResult["fieldMessages"] = [];
      if (answers.siteType.length) fieldMessages.push({ field: "siteType", text: answers.siteType.join(", ") });
      if (answers.offer.trim()) fieldMessages.push({ field: "offer", text: answers.offer.trim() });
      // Skip emitting "Börja från noll" literal when URL is missing — empty
      // just means no existing site, and the LLM should treat that as such.
      if (answers.existingSite.trim()) {
        fieldMessages.push({ field: "existingSite", text: answers.existingSite.trim() });
      }

      // Business details
      const bdParts: string[] = [];
      if (answers.companyName) bdParts.push(`Företag: ${answers.companyName}`);
      if (answers.phone) bdParts.push(`Tel: ${answers.phone}`);
      if (answers.email) bdParts.push(`E-post: ${answers.email}`);
      if (answers.address) bdParts.push(`Adress: ${answers.address}`);
      if (bdParts.length) fieldMessages.push({ field: "businessDetails", text: bdParts.join("\n") });

      // Brand / design
      const biParts: string[] = [];
      if (answers.tagline) biParts.push(`Tagline: ${answers.tagline}`);
      if (answers.tone) biParts.push(`Ton: ${answers.tone}`);
      if (answers.designStyle) biParts.push(`Designstil: ${answers.designStyle}`);
      if (answers.brandColors.length) biParts.push(`Färger: ${answers.brandColors.join(", ")}`);
      if (biParts.length) fieldMessages.push({ field: "brandIdentity", text: biParts.join("\n") });

      // Services / products content
      const spParts: string[] = [];
      if (answers.services.length) spParts.push(`Tjänster: ${answers.services.join(", ")}`);
      if (answers.uniqueSellingPoints.length) spParts.push(`USP: ${answers.uniqueSellingPoints.join(", ")}`);
      if (answers.testimonials.trim()) spParts.push(`Omdömen: ${answers.testimonials.trim()}`);
      if (answers.topics.length) spParts.push(`Ämnesområden: ${answers.topics.join(", ")}`);
      if (spParts.length) fieldMessages.push({ field: "servicesProducts", text: spParts.join("\n") });

      // Category-specific content
      const csParts: string[] = [];
      if (answers.products.length) {
        csParts.push("Produkter:");
        for (const p of answers.products) {
          const parts = [`  - ${p.name}`];
          if (p.price) parts[0] += ` (${p.price} kr)`;
          if (p.description) parts[0] += `: ${p.description}`;
          if (p.category) parts[0] += ` [${p.category}]`;
          csParts.push(parts[0]);
        }
      }
      if (answers.menuItems.length) {
        csParts.push("Meny:");
        for (const m of answers.menuItems) {
          let line = `  - ${m.name}`;
          if (m.price) line += ` (${m.price} kr)`;
          if (m.description) line += `: ${m.description}`;
          if (m.category) line += ` [${m.category}]`;
          csParts.push(line);
        }
      }
      if (answers.treatments.length) {
        csParts.push("Behandlingar:");
        for (const t of answers.treatments) {
          let line = `  - ${t.name}`;
          if (t.price) line += ` (${t.price} kr)`;
          if (t.duration) line += ` — ${t.duration} min`;
          csParts.push(line);
        }
      }
      if (answers.projects.length) {
        csParts.push("Projekt:");
        for (const p of answers.projects) {
          let line = `  - ${p.name}`;
          if (p.client) line += ` (${p.client})`;
          if (p.description) line += `: ${p.description}`;
          csParts.push(line);
        }
      }
      if (answers.teamMembers.length) {
        csParts.push("Team:");
        for (const t of answers.teamMembers) {
          csParts.push(`  - ${t.name}${t.role ? ` — ${t.role}` : ""}`);
        }
      }
      if (answers.cuisine.length) csParts.push(`Kök: ${answers.cuisine.join(", ")}`);
      if (answers.openingHours) csParts.push(`Öppettider: ${answers.openingHours}`);
      if (answers.bookingUrl) csParts.push(`Bokning: ${answers.bookingUrl}`);
      if (answers.acceptsReservations) csParts.push("Bordsbokning: Ja");
      if (answers.delivery) csParts.push("Leverans/takeaway: Ja");
      if (answers.paymentMethods.length) csParts.push(`Betalning: ${answers.paymentMethods.join(", ")}`);
      if (answers.shippingInfo) csParts.push(`Leverans: ${answers.shippingInfo}`);
      if (answers.priceRange) csParts.push(`Prisnivå: ${answers.priceRange}`);

      const CS_LABELS: Record<string, string> = {
        rooms: "Rumstyper", amenities: "Faciliteter", checkInOut: "Incheckning/Utcheckning",
        locationHighlights: "Läge", season: "Säsong",
        projectTypes: "Projekttyper", serviceArea: "Tjänsteområde",
        freeQuote: "Kostnadsfri offert", courseFormats: "Undervisningsformat", targetGroup: "Målgrupp",
        educationLevel: "Åldersgrupp/Nivå",
        eventTypes: "Eventtyper", venue: "Plats/Lokal", ticketInfo: "Biljetter/Priser",
        practiceAreas: "Verksamhetsområden", experience: "Erfarenhet", propertyTypes: "Bostadstyper",
        coverageArea: "Områden", mission: "Mission", acceptsDonations: "Donationer",
        volunteerSignup: "Volontäranmälan", expertiseAreas: "Expertisområden", clientTypes: "Kundtyper",
        returnPolicy: "Returpolicy", targetAudience: "Målgrupp",
        dietary: "Kostalternativ", wifi: "WiFi", parking: "Parkering",
        onlineBooking: "Onlinebokning",
      };
      for (const [key, value] of Object.entries(answers.categorySpecific)) {
        if (value === undefined || value === "" || value === false) continue;
        const label = CS_LABELS[key] ?? key;
        if (Array.isArray(value) && value.length > 0) {
          csParts.push(`${label}: ${value.join(", ")}`);
        } else if (typeof value === "boolean" && value) {
          csParts.push(`${label}: Ja`);
        } else if (typeof value === "string" && value.trim()) {
          csParts.push(`${label}: ${value.trim()}`);
        }
      }

      if (csParts.length) fieldMessages.push({ field: "categorySpecific", text: csParts.join("\n") });

      // About / story / vision / contact
      const storyParts: string[] = [];
      if (answers.aboutUs.trim()) storyParts.push(`Om oss: ${answers.aboutUs.trim()}`);
      if (answers.companyStory.trim()) storyParts.push(`Historia: ${answers.companyStory.trim()}`);
      if (answers.vision.trim()) storyParts.push(`Vision/mission: ${answers.vision.trim()}`);
      if (answers.contactPageText.trim()) storyParts.push(`Kontaktintro: ${answers.contactPageText.trim()}`);
      if (storyParts.length) fieldMessages.push({ field: "companyStory", text: storyParts.join("\n\n") });

      if (answers.targetAudience.trim()) fieldMessages.push({ field: "audience", text: answers.targetAudience.trim() });
      if (answers.primaryCta.trim()) fieldMessages.push({ field: "cta", text: answers.primaryCta.trim() });

      if (answers.goal.length) fieldMessages.push({ field: "goal", text: answers.goal.join(", ") });
      if (answers.mustHave.length) fieldMessages.push({ field: "mustHave", text: answers.mustHave.join(", ") });

      if (answers.features.length) {
        const featureLabels = answers.features.map((id) => {
          for (const group of FEATURE_MODULES) {
            const mod = group.items.find((m) => m.id === id);
            if (mod) return `${mod.label}: ${mod.description}`;
          }
          return id;
        });
        fieldMessages.push({ field: "features", text: featureLabels.join("\n") });
      }

      if (answers.avoid.trim()) {
        fieldMessages.push({ field: "avoid", text: answers.avoid.trim() });
      }
      if (answers.imagery.length > 0) {
        fieldMessages.push({ field: "imagery", text: answers.imagery.join(", ") });
      }

      if (answers.siteMedia.length > 0) {
        const contextLabel = (ctx: string) => MEDIA_CONTEXT_OPTIONS.find((o) => o.value === ctx)?.label ?? ctx;
        const mediaDesc = answers.siteMedia.map((m) => {
          const type = m.file.type.startsWith("video/") ? "video" : "bild";
          return `${contextLabel(m.context)} (${type}: ${m.file.name})`;
        });
        fieldMessages.push({ field: "siteMedia", text: `Uppladdade filer:\n${mediaDesc.join("\n")}` });
      }

      // Collect media files with canonical `purpose` set directly (no keyword
      // guessing needed in BuilderShellContent). The `context` string stays as
      // a human-readable hint for the LLM's placement prompt.
      const mediaFiles: NonNullable<IntakeWizardResult["mediaFiles"]> = [];
      if (answers.logoFile) mediaFiles.push({ file: answers.logoFile, context: "Logotyp", purpose: "brand-logo" });
      for (const p of answers.products) {
        if (p.imageFile) mediaFiles.push({ file: p.imageFile, context: `Produkt: ${p.name}`, purpose: "product-photo" });
      }
      for (const m of answers.menuItems) {
        if (m.imageFile) mediaFiles.push({ file: m.imageFile, context: `Menyrätt: ${m.name}`, purpose: "product-photo" });
      }
      for (const p of answers.projects) {
        if (p.imageFile) mediaFiles.push({ file: p.imageFile, context: `Projekt: ${p.name}`, purpose: "product-photo" });
      }
      for (const sm of answers.siteMedia) {
        const label = MEDIA_CONTEXT_OPTIONS.find((o) => o.value === sm.context)?.label ?? sm.context;
        // sm.context is now the canonical purpose value (hero-image, about-image, ...)
        mediaFiles.push({ file: sm.file, context: label || "Egen bild/video", purpose: sm.context || "site-media" });
      }

      onComplete({ answers, fieldMessages, mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined });
    }
  }, [currentStep, totalSteps, answers, onComplete]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection("back");
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  /* ── Dialog mount ────────────────────────────────────────────── */

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mounted) return;
    const el = dialogRef.current;
    if (el) el.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mounted]);

  if (!mounted) return null;

  const stepTitle = step === "content" ? contentBranchTitle(contentBranch) : step ? STEP_TITLES[step] : "";
  const stepSubtitle = step === "content"
    ? "Det som gör din verksamhet unik"
    : step ? STEP_SUBTITLES[step] : "";

  return (
    <div className="fixed inset-0 z-[99999]" role="presentation">
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "absolute inset-0 m-auto flex h-fit w-[calc(100%-1.25rem)] max-w-2xl flex-col rounded-3xl border border-border p-0 outline-none",
          "bg-card",
          "shadow-[0_25px_60px_-12px_hsl(var(--foreground)/0.2)] ring-1 ring-border/50",
          MOTION,
        )}
        style={{ maxHeight: "min(90vh, 780px)" }}
        aria-label="Intake-guiden"
      >
      <div className="flex max-h-[min(90vh,780px)] flex-col overflow-hidden rounded-3xl">
        {/* Progress + minimal dots */}
        <div className="px-6 pt-6 sm:px-10">
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-center gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 w-1.5 rounded-full motion-safe:transition-colors motion-safe:duration-200",
                  i <= currentStep ? "bg-primary" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="px-6 pb-2 pt-6 sm:px-10">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-2xl">{stepTitle}</h2>
              {stepSubtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{stepSubtitle}</p>
              )}
              {step === "siteType" && (inferredLabels.length > 0 || scrapedCategoryIds.length > 0) && (
                <p className="mt-1.5 text-xs italic text-muted-foreground/80">
                  {scrapedCategoryIds.length > 0 && inferredLabels.length > 0
                    ? "Förvalt utifrån din sajt och beskrivning"
                    : scrapedCategoryIds.length > 0
                      ? "Förvalt utifrån din sajt"
                      : "Förslag från din text"}
                </p>
              )}
            </div>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={goBack}
                className={cn(
                  "mt-0.5 shrink-0 rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                  "min-h-11 min-w-[4.75rem] touch-manipulation",
                  MOTION,
                )}
              >
                Tillbaka
              </button>
            )}
          </div>
        </div>

        <div className="mx-6 h-px bg-border sm:mx-10" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-10">
          {step === "company" && (
            <CompanyStep
              answers={answers}
              onChange={setAnswers}
              scraping={scraping}
              scrapeProgress={scrapeProgress}
              scrapeComplete={scrapeComplete}
              scrapedFields={scrapedFields}
              onScrape={handleScrape}
              onClearScraped={clearScrapedField}
              textareaRef={textareaRef}
              onAbortScrape={() => {
                scrapeAbortRef.current = true;
                setScraping(false);
                setScrapeProgress(0);
                if (scrapeProgressRef.current) {
                  clearInterval(scrapeProgressRef.current);
                  scrapeProgressRef.current = null;
                }
              }}
            />
          )}
          {step === "siteType" && (
            <SiteTypeStep siteType={answers.siteType} onSelect={selectSiteType} suggestedCategoryIds={scrapedCategoryIds} />
          )}
          {step === "content" && (
            <ContentStep branch={contentBranch} answers={answers} onChange={setAnswers} scrapedFields={scrapedFields} onClearScraped={clearScrapedField} />
          )}
          {step === "story" && (
            <StoryStep answers={answers} onChange={setAnswers} scrapedFields={scrapedFields} />
          )}
          {step === "pages" && (
            <PagesStep
              answers={answers}
              onChange={setAnswers}
              toggleChip={toggleChip}
              suggesting={suggesting}
              aiSuggestions={aiSuggestions}
              onSuggest={handleSuggestMustHaves}
            />
          )}
          {step === "media" && (
            <MediaStep answers={answers} onChange={setAnswers} />
          )}
        </div>

        {/* Footer */}
        <div className="mx-6 h-px bg-border sm:mx-10" />
        <div
          className={cn(
            "flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:px-10",
            step !== "company" && step !== "siteType" && (currentStep < totalSteps - 1 || step === "media")
              ? "sm:justify-between"
              : "sm:justify-end",
          )}
        >
          {step !== "company" && step !== "siteType" && currentStep < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => { setDirection("forward"); setCurrentStep((s) => s + 1); }}
              className={cn(
                "inline-flex min-h-11 items-center justify-center self-start rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                MOTION,
              )}
            >
              Hoppa över
            </button>
          ) : null}
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue()}
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center rounded-full px-8 py-3 text-sm font-medium sm:ml-auto sm:w-auto",
              MOTION,
              "motion-safe:active:scale-[0.99] motion-reduce:active:scale-100",
              canContinue()
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
            )}
          >
            {currentStep === totalSteps - 1 ? "Bygg min sajt" : "Fortsätt"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 1: Site type
   ════════════════════════════════════════════════════════════════════ */

function SiteTypeStep({ siteType, onSelect, suggestedCategoryIds }: { siteType: string[]; onSelect: (label: string) => void; suggestedCategoryIds?: string[] }) {
  const suggested = suggestedCategoryIds ?? [];
  const [siteSearch, setSiteSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const lowerSearch = siteSearch.toLowerCase();
  const filtered = siteSearch
    ? CATEGORIES.filter((cat) => cat.label.toLowerCase().includes(lowerSearch))
    : showAll
      ? CATEGORIES
      : CATEGORIES.slice(0, 8);
  const activeLabel = siteType[0] ?? "";
  return (
    <div className="space-y-4">
      {suggested.length > 0 && (
        <p className="text-xs italic text-muted-foreground">
          Vårt förslag — ändra om det inte stämmer.
        </p>
      )}
      <input
        type="text"
        placeholder="Sök kategori"
        value={siteSearch}
        onChange={(e) => setSiteSearch(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {filtered.map((cat) => {
          const selected = activeLabel === cat.label;
          const isSuggested = suggested.includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.label)}
              className={cn(
                "group relative flex min-h-11 items-center justify-center rounded-xl border px-3 py-3 text-center text-sm touch-manipulation",
                "motion-safe:active:scale-[0.99] motion-reduce:active:scale-100",
                MOTION,
                selected
                  ? "border-foreground bg-foreground text-background font-medium"
                  : isSuggested
                    ? "border-foreground/20 bg-background text-foreground hover:border-foreground/40"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <span className="min-w-0 truncate">{cat.label}</span>
            </button>
          );
        })}
      </div>
      {!siteSearch && !showAll && CATEGORIES.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-xl border border-border bg-muted/30 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          Visa alla ({CATEGORIES.length})
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 1: Company (name + URL + scrape)
   ════════════════════════════════════════════════════════════════════ */

function CompanyStep({
  answers,
  onChange,
  scraping,
  scrapeProgress,
  scrapeComplete,
  scrapedFields,
  onScrape,
  onClearScraped,
  textareaRef,
  onAbortScrape,
}: {
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
  scraping: boolean;
  scrapeProgress: number;
  scrapeComplete: boolean;
  scrapedFields: Set<string>;
  onScrape: (url: string) => void;
  onClearScraped: (field: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onAbortScrape?: () => void;
}) {
  const set = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
    onClearScraped(key);
  };

  const SCRAPE_CHECKS: { key: string; label: string }[] = [
    { key: "companyName", label: "Företagsnamn" },
    { key: "phone", label: "Kontaktuppgifter" },
    { key: "services", label: "Tjänster" },
    { key: "tagline", label: "Tagline" },
    { key: "brandColors", label: "Designinfo" },
    { key: "menuItems", label: "Meny" },
    { key: "products", label: "Produkter" },
    { key: "treatments", label: "Behandlingar" },
    { key: "teamMembers", label: "Team" },
    { key: "testimonials", label: "Omdömen" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Företagsnamn *</SectionLabel>
        <div className="relative">
          <input
            type="text"
            value={answers.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            placeholder="Mitt Företag AB"
            className={FIELD_CLASS}
          />
          {scrapedFields.has("companyName") && <ScrapeBadge />}
        </div>
      </div>

      <div>
        <FieldLabel>Befintlig hemsida (valfritt)</FieldLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Fyll i din hemsida så hämtar vi info automatiskt</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="url"
              value={answers.existingSite}
              onChange={(e) => onChange((p) => ({ ...p, existingSite: e.target.value }))}
              placeholder="www.dinhemsida.se"
              className={FIELD_CLASS}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScrape(answers.existingSite); } }}
            />
          </div>
          <button
            type="button"
            disabled={scraping || !answers.existingSite.trim()}
            onClick={() => onScrape(answers.existingSite)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium touch-manipulation",
              MOTION,
              scraping || !answers.existingSite.trim()
                ? "cursor-not-allowed bg-muted text-muted-foreground opacity-60"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            {scraping ? "Hämtar…" : "Hämta"}
          </button>
        </div>

        {scraping && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card px-8 py-8 shadow-xl">
              <div className="flex flex-col items-center gap-5">
                <span className="text-sm font-medium text-foreground">Analyserar din sajt</span>
                <div className="w-full space-y-2">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
                      style={{ width: `${scrapeProgress}%` }}
                    />
                  </div>
                  <p className="text-center text-xs tabular-nums text-muted-foreground">{scrapeProgress}%</p>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {scrapeProgress < 30 ? "Hämtar sidor…" : scrapeProgress < 60 ? "Läser innehåll…" : scrapeProgress < 90 ? "Extraherar info…" : "Klar"}
                </p>
                {onAbortScrape && (
                  <button
                    type="button"
                    onClick={onAbortScrape}
                    className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Avbryt
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {scrapeComplete && !scraping && scrapedFields.size > 0 && (
          <div className="mt-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
            <p className="mb-3 text-xs font-medium text-foreground">Hämtat</p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {SCRAPE_CHECKS.map(({ key, label }) => {
                const found = scrapedFields.has(key);
                if (!found && !["companyName", "phone", "services", "tagline", "brandColors"].includes(key)) return null;
                return (
                  <li key={key} className="flex items-center gap-2 text-xs">
                    <span
                      aria-hidden
                      className={cn(
                        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        found ? "bg-foreground" : "bg-muted-foreground/30",
                      )}
                    />
                    <span className={found ? "text-foreground" : "text-muted-foreground/40"}>{label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      <div>
        <SectionLabel>Beskriv din verksamhet *</SectionLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Ju mer du beskriver, desto bättre blir sajten. Berätta vad ni gör, för vem, och vad som gör er unika.</p>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={answers.offer}
            onChange={(e) => set("offer", e.target.value)}
            placeholder={"T.ex. Vi driver en frisörsalong i centrala Göteborg med fokus på färgning, klippning och hårvård. Vi riktar oss till kvinnor 25-55 som vill ha premium-behandlingar i en avslappnad miljö. Vi erbjuder även bruduppsättningar och har 15 års erfarenhet."}
            className={cn(FIELD_CLASS, "min-h-[140px] resize-none")}
          />
          {scrapedFields.has("offer") && <ScrapeBadge />}
        </div>
      </div>

      <details className="group rounded-xl border border-border bg-muted/25 px-4 py-3" open={!!(answers.phone || answers.email || answers.address)}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Kontaktuppgifter (valfritt)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Telefon</FieldLabel>
            <div className="relative">
              <input type="tel" value={answers.phone} onChange={(e) => set("phone", e.target.value)} placeholder="070-123 45 67" className={FIELD_CLASS} />
              {scrapedFields.has("phone") && <ScrapeBadge />}
            </div>
          </div>
          <div>
            <FieldLabel>E-post</FieldLabel>
            <div className="relative">
              <input type="email" value={answers.email} onChange={(e) => set("email", e.target.value)} placeholder="info@mittforetag.se" className={FIELD_CLASS} />
              {scrapedFields.has("email") && <ScrapeBadge />}
            </div>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Adress</FieldLabel>
            <div className="relative">
              <input type="text" value={answers.address} onChange={(e) => set("address", e.target.value)} placeholder="Storgatan 1, 123 45 Stad" className={FIELD_CLASS} />
              {scrapedFields.has("address") && <ScrapeBadge />}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 3: Content (branch-specific)
   ════════════════════════════════════════════════════════════════════ */

type ContentProps = { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>; scrapedFields?: Set<string>; onClearScraped?: (f: string) => void };

function ContentStep({
  branch,
  answers,
  onChange,
  scrapedFields,
  onClearScraped,
}: {
  branch: ContentBranch;
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
  scrapedFields?: Set<string>;
  onClearScraped?: (f: string) => void;
}) {
  const p: ContentProps = { answers, onChange, scrapedFields, onClearScraped };
  switch (branch) {
    case "ecommerce": return <EcommerceContent {...p} />;
    case "restaurant": return <RestaurantContent {...p} />;
    case "salon": return <SalonContent {...p} />;
    case "portfolio": return <PortfolioContent {...p} />;
    case "hotel": return <HotelContent {...p} />;
    case "construction": return <ConstructionContent {...p} />;
    case "education": return <EducationContent {...p} />;
    case "event": return <EventContent {...p} />;
    case "legal": return <LegalContent {...p} />;
    case "realestate": return <RealEstateContent {...p} />;
    case "nonprofit": return <NonprofitContent {...p} />;
    case "consulting": return <ConsultingContent {...p} />;
    case "business": return <BusinessContent {...p} />;
    case "minimal": return <MinimalContent {...p} />;
  }
}

/* ── Ecommerce: per-product entries ─────────────────────────────── */

function EcommerceContent({ answers, onChange, scrapedFields, onClearScraped }: ContentProps) {
  const addProduct = () => {
    if (answers.products.length >= 12) return;
    onChange((prev) => ({ ...prev, products: [...prev.products, { name: "", price: "", description: "", category: "" }] }));
  };
  const updateProduct = (idx: number, patch: Partial<ProductEntry>) =>
    onChange((prev) => ({ ...prev, products: prev.products.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  const removeProduct = (idx: number) => {
    const old = answers.products[idx]?.imagePreview;
    if (old) URL.revokeObjectURL(old);
    onChange((prev) => ({ ...prev, products: prev.products.filter((_, i) => i !== idx) }));
  };

  const handleImagePick = (idx: number, file: File) => {
    const oldPreview = answers.products[idx]?.imagePreview;
    if (oldPreview) URL.revokeObjectURL(oldPreview);
    const preview = URL.createObjectURL(file);
    updateProduct(idx, { imageFile: file, imagePreview: preview });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground/70">Lägg till dina produkter — dessa visas direkt på sajten.</p>

      {answers.products.map((product, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-muted/25 p-3 transition-colors hover:border-muted-foreground/25">
          <div className="flex gap-3">
            <ImagePickerThumb
              preview={product.imagePreview}
              onPick={(file) => handleImagePick(idx, file)}
            />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input type="text" value={product.name} onChange={(e) => updateProduct(idx, { name: e.target.value })} placeholder="Produktnamn *" className={cn(FIELD_CLASS, "flex-1")} />
                <input type="text" value={product.price} onChange={(e) => updateProduct(idx, { price: e.target.value })} placeholder="Pris (kr)" className={cn(FIELD_CLASS, "w-24")} />
              </div>
              <input type="text" value={product.description} onChange={(e) => updateProduct(idx, { description: e.target.value })} placeholder="Kort beskrivning (valfritt)" className={FIELD_CLASS} />
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {PRODUCT_CATEGORY_OPTIONS.map((cat) => (
                    <button key={cat} type="button" onClick={() => updateProduct(idx, { category: product.category === cat ? "" : cat })}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-all duration-200", product.category === cat ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/60")}
                    >{cat}</button>
                  ))}
                </div>
                <button type="button" onClick={() => removeProduct(idx)} aria-label="Ta bort produkt" className="rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground">Ta bort</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {answers.products.length < 12 && (
        <button type="button" onClick={addProduct} className="inline-flex w-full min-h-11 items-center justify-center rounded-xl border border-dashed border-border py-3.5 text-sm text-muted-foreground/70 transition-all hover:border-foreground/40 hover:bg-muted/30 hover:text-foreground">
          Lägg till produkt
        </button>
      )}

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Leveransinformation</FieldLabel>
          <input type="text" value={answers.shippingInfo} onChange={(e) => onChange((p) => ({ ...p, shippingInfo: e.target.value }))} placeholder="Fri frakt över 499 kr" className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Prisnivå</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_RANGE_OPTIONS.map((opt) => (
              <Chip key={opt} label={opt} selected={answers.priceRange === opt} onClick={() => onChange((p) => ({ ...p, priceRange: p.priceRange === opt ? "" : opt }))} />
            ))}
          </div>
        </div>
      </div>

      <div>
        <FieldLabel>Betalningsmetoder</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.paymentMethods.includes(opt)} onClick={() => onChange((p) => {
              const arr = p.paymentMethods.includes(opt) ? p.paymentMethods.filter((v) => v !== opt) : [...p.paymentMethods, opt];
              return { ...p, paymentMethods: arr };
            })} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Returpolicy (valfritt)</FieldLabel>
        <input type="text" value={(answers.categorySpecific.returnPolicy as string) ?? ""} onChange={(e) => { onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, returnPolicy: e.target.value } })); onClearScraped?.("returnPolicy"); }} placeholder="14 dagars öppet köp, fri retur..." className={FIELD_CLASS} />
      </div>

      <div>
        <FieldLabel>Målgrupp (valfritt)</FieldLabel>
        <input type="text" value={(answers.categorySpecific.targetAudience as string) ?? ""} onChange={(e) => { onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, targetAudience: e.target.value } })); onClearScraped?.("targetAudience"); }} placeholder="Unga vuxna, heminredningsentusiaster..." className={FIELD_CLASS} />
      </div>
    </div>
  );
}

/* ── Restaurant: per-dish entries ────────────────────────────────── */

function RestaurantContent({ answers, onChange, scrapedFields, onClearScraped }: ContentProps) {
  const addItem = () => {
    if (answers.menuItems.length >= 20) return;
    onChange((prev) => ({ ...prev, menuItems: [...prev.menuItems, { name: "", price: "", description: "", category: "" }] }));
  };
  const updateItem = (idx: number, patch: Partial<MenuItemEntry>) =>
    onChange((prev) => ({ ...prev, menuItems: prev.menuItems.map((m, i) => i === idx ? { ...m, ...patch } : m) }));
  const removeItem = (idx: number) => {
    const old = answers.menuItems[idx]?.imagePreview;
    if (old) URL.revokeObjectURL(old);
    onChange((prev) => ({ ...prev, menuItems: prev.menuItems.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground/70">Lägg till rätter från din meny.</p>

      {answers.menuItems.map((item, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-muted/25 p-3 transition-colors hover:border-muted-foreground/25">
          <div className="flex gap-3">
            <ImagePickerThumb preview={item.imagePreview} onPick={(file) => {
              const old = answers.menuItems[idx]?.imagePreview;
              if (old) URL.revokeObjectURL(old);
              updateItem(idx, { imageFile: file, imagePreview: URL.createObjectURL(file) });
            }} />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input type="text" value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })} placeholder="Namn på rätt *" className={cn(FIELD_CLASS, "flex-1")} />
                <input type="text" value={item.price} onChange={(e) => updateItem(idx, { price: e.target.value })} placeholder="Pris (kr)" className={cn(FIELD_CLASS, "w-24")} />
              </div>
              <input type="text" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Kort beskrivning (valfritt)" className={FIELD_CLASS} />
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {MENU_CATEGORY_OPTIONS.map((cat) => (
                    <button key={cat} type="button" onClick={() => updateItem(idx, { category: item.category === cat ? "" : cat })}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-all duration-200", item.category === cat ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/60")}
                    >{cat}</button>
                  ))}
                </div>
                <button type="button" onClick={() => removeItem(idx)} aria-label="Ta bort rätt" className="rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground">Ta bort</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {answers.menuItems.length < 20 && (
        <button type="button" onClick={addItem} className="inline-flex w-full min-h-11 items-center justify-center rounded-xl border border-dashed border-border py-3.5 text-sm text-muted-foreground/70 transition-all hover:border-foreground/40 hover:bg-muted/30 hover:text-foreground">
          Lägg till rätt
        </button>
      )}

      <div className="h-px bg-border" />

      <div>
        <FieldLabel>Kök / matstil</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {CUISINE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.cuisine.includes(opt)} onClick={() => onChange((p) => {
              const arr = p.cuisine.includes(opt) ? p.cuisine.filter((v) => v !== opt) : [...p.cuisine, opt];
              return { ...p, cuisine: arr };
            })} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Öppettider</FieldLabel>
          <div className="relative">
            <input type="text" value={answers.openingHours} onChange={(e) => { onChange((p) => ({ ...p, openingHours: e.target.value })); onClearScraped?.("openingHours"); }} placeholder="Mån–Fre 11–22, Lör–Sön 12–23" className={FIELD_CLASS} />
            {scrapedFields?.has("openingHours") && <ScrapeBadge />}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4 pb-1">
          <ToggleField label="Bordsbokning" value={answers.acceptsReservations} onToggle={() => onChange((p) => ({ ...p, acceptsReservations: !p.acceptsReservations }))} />
          <ToggleField label="Takeaway" value={answers.delivery} onToggle={() => onChange((p) => ({ ...p, delivery: !p.delivery }))} />
          <ToggleField label="WiFi" value={(answers.categorySpecific.wifi as boolean) ?? false} onToggle={() => onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, wifi: !(p.categorySpecific.wifi ?? false) } }))} />
          <ToggleField label="Parkering" value={(answers.categorySpecific.parking as boolean) ?? false} onToggle={() => onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, parking: !(p.categorySpecific.parking ?? false) } }))} />
        </div>
      </div>

      <div>
        <FieldLabel>Kostalternativ</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {DIETARY_OPTIONS.map((opt) => {
            const dietary = (answers.categorySpecific.dietary as string[] | undefined) ?? [];
            return (
              <Chip key={opt} label={opt} selected={dietary.includes(opt)} onClick={() => onChange((p) => {
                const arr = (p.categorySpecific.dietary as string[] | undefined) ?? [];
                const next = arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt];
                return { ...p, categorySpecific: { ...p.categorySpecific, dietary: next } };
              })} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Salon/Health: treatments + team ─────────────────────────────── */

function SalonContent({ answers, onChange, scrapedFields, onClearScraped }: ContentProps) {
  const addTreatment = () => onChange((p) => ({ ...p, treatments: [...p.treatments, { name: "", price: "", duration: "" }] }));
  const updateTreatment = (idx: number, patch: Partial<TreatmentEntry>) =>
    onChange((p) => ({ ...p, treatments: p.treatments.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  const removeTreatment = (idx: number) => onChange((p) => ({ ...p, treatments: p.treatments.filter((_, i) => i !== idx) }));

  const addMember = () => onChange((p) => ({ ...p, teamMembers: [...p.teamMembers, { name: "", role: "" }] }));
  const updateMember = (idx: number, patch: Partial<TeamMemberEntry>) =>
    onChange((p) => ({ ...p, teamMembers: p.teamMembers.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  const removeMember = (idx: number) => onChange((p) => ({ ...p, teamMembers: p.teamMembers.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Behandlingar</SectionLabel>
        {answers.treatments.map((t, idx) => (
          <div key={idx} className="mb-2 flex gap-2 rounded-xl border border-border bg-muted/25 p-2.5">
            <input type="text" value={t.name} onChange={(e) => updateTreatment(idx, { name: e.target.value })} placeholder="Behandling *" className={cn(FIELD_CLASS, "flex-1")} />
            <input type="text" value={t.price} onChange={(e) => updateTreatment(idx, { price: e.target.value })} placeholder="Pris (kr)" className={cn(FIELD_CLASS, "w-24")} />
            <input type="text" value={t.duration} onChange={(e) => updateTreatment(idx, { duration: e.target.value })} placeholder="Min" className={cn(FIELD_CLASS, "w-16")} />
            <button type="button" onClick={() => removeTreatment(idx)} aria-label="Ta bort behandling" className="rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground">Ta bort</button>
          </div>
        ))}
        <button type="button" onClick={addTreatment} className="mt-1 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:opacity-80">Lägg till behandling</button>
      </div>

      <div className="h-px bg-border" />

      <div>
        <SectionLabel>Team / specialister (valfritt)</SectionLabel>
        {answers.teamMembers.map((m, idx) => (
          <div key={idx} className="mb-2 flex gap-2 rounded-xl border border-border bg-muted/25 p-2.5">
            <input type="text" value={m.name} onChange={(e) => updateMember(idx, { name: e.target.value })} placeholder="Namn" className={cn(FIELD_CLASS, "flex-1")} />
            <input type="text" value={m.role} onChange={(e) => updateMember(idx, { role: e.target.value })} placeholder="Roll / specialitet" className={cn(FIELD_CLASS, "flex-1")} />
            <button type="button" onClick={() => removeMember(idx)} aria-label="Ta bort person" className="rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground">Ta bort</button>
          </div>
        ))}
        <button type="button" onClick={addMember} className="mt-1 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:opacity-80">Lägg till person</button>
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Öppettider</FieldLabel>
          <div className="relative">
            <input type="text" value={answers.openingHours} onChange={(e) => { onChange((p) => ({ ...p, openingHours: e.target.value })); onClearScraped?.("openingHours"); }} placeholder="Mån–Fre 09–18" className={FIELD_CLASS} />
            {scrapedFields?.has("openingHours") && <ScrapeBadge />}
          </div>
        </div>
        <div>
          <FieldLabel>Boknings-URL (valfritt)</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
      </div>

      <div className="flex items-end pb-1">
        <ToggleField label="Onlinebokning" value={(answers.categorySpecific.onlineBooking as boolean) ?? false} onToggle={() => onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, onlineBooking: !(p.categorySpecific.onlineBooking ?? false) } }))} />
      </div>
    </div>
  );
}

/* ── Portfolio: project entries ───────────────────────────────────── */

function PortfolioContent({ answers, onChange }: ContentProps) {
  const addProject = () => onChange((p) => ({ ...p, projects: [...p.projects, { name: "", client: "", description: "" }] }));
  const updateProject = (idx: number, patch: Partial<ProjectEntry>) =>
    onChange((p) => ({ ...p, projects: p.projects.map((pr, i) => i === idx ? { ...pr, ...patch } : pr) }));
  const removeProject = (idx: number) => {
    const old = answers.projects[idx]?.imagePreview;
    if (old) URL.revokeObjectURL(old);
    onChange((p) => ({ ...p, projects: p.projects.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground/70">Visa dina bästa arbeten — dessa hamnar i portfolion.</p>

      {answers.projects.map((project, idx) => (
        <div key={idx} className="rounded-xl border border-border bg-muted/25 p-3 transition-colors hover:border-muted-foreground/25">
          <div className="flex gap-3">
            <ImagePickerThumb preview={project.imagePreview} onPick={(file) => {
              const old = answers.projects[idx]?.imagePreview;
              if (old) URL.revokeObjectURL(old);
              updateProject(idx, { imageFile: file, imagePreview: URL.createObjectURL(file) });
            }} />
            <div className="flex-1 space-y-2">
              <input type="text" value={project.name} onChange={(e) => updateProject(idx, { name: e.target.value })} placeholder="Projektnamn *" className={FIELD_CLASS} />
              <input type="text" value={project.client} onChange={(e) => updateProject(idx, { client: e.target.value })} placeholder="Kund / kontext (valfritt)" className={FIELD_CLASS} />
              <div className="flex items-center gap-2">
                <input type="text" value={project.description} onChange={(e) => updateProject(idx, { description: e.target.value })} placeholder="Kort beskrivning" className={cn(FIELD_CLASS, "flex-1")} />
                <button type="button" onClick={() => removeProject(idx)} aria-label="Ta bort projekt" className="rounded-lg px-2 py-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground">Ta bort</button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={addProject} className="inline-flex w-full min-h-11 items-center justify-center rounded-xl border border-dashed border-border py-3.5 text-sm text-muted-foreground/70 transition-all hover:border-foreground/40 hover:bg-muted/30 hover:text-foreground">
        Lägg till projekt
      </button>

      <div>
        <FieldLabel>Kompetenser</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. React, Figma, Fotografi..." max={8} />
      </div>
    </div>
  );
}

/* ── Business default: services + USPs ───────────────────────────── */

function BusinessContent({ answers, onChange, scrapedFields, onClearScraped }: ContentProps) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground/70">Beskriv vad du erbjuder — dessa hamnar på din sajt som sektioner.</p>

      <div>
        <FieldLabel>Tjänster / erbjudanden (max 8)</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Klippning, Färgning, Slingor..." max={8} />
      </div>

      <div>
        <FieldLabel>Styrkor / USP (max 4)</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. 20 års erfarenhet, Gratis offert..." max={4} />
      </div>

      <div>
        <FieldLabel>Kundomdömen (valfritt)</FieldLabel>
        <textarea
          value={answers.testimonials}
          onChange={(e) => { onChange((p) => ({ ...p, testimonials: e.target.value })); onClearScraped?.("testimonials"); }}
          placeholder={'"Bästa frisören i stan!" – Anna S.\n"Proffsigt och snabbt." – Erik L.'}
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Målgrupp (valfritt)</FieldLabel>
          <input type="text" value={(answers.categorySpecific.targetAudience as string) ?? ""} onChange={(e) => onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, targetAudience: e.target.value } }))} placeholder="Småföretagare, privatpersoner..." className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Öppettider (valfritt)</FieldLabel>
          <div className="relative">
            <input type="text" value={answers.openingHours} onChange={(e) => { onChange((p) => ({ ...p, openingHours: e.target.value })); onClearScraped?.("openingHours"); }} placeholder="Mån–Fre 08–17" className={FIELD_CLASS} />
            {scrapedFields?.has("openingHours") && <ScrapeBadge />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Minimal: blog/landing/other ─────────────────────────────────── */

function MinimalContent({ answers, onChange }: ContentProps) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Ämnesområden</FieldLabel>
        <TagInput values={answers.topics} onChange={(vals) => onChange((p) => ({ ...p, topics: vals }))} placeholder="T.ex. Tech, Design, Matlagning..." max={6} />
      </div>
      <div>
        <FieldLabel>Huvudbudskap (valfritt)</FieldLabel>
        <textarea
          value={answers.testimonials}
          onChange={(e) => onChange((p) => ({ ...p, testimonials: e.target.value }))}
          placeholder="Vad är det viktigaste du vill kommunicera?"
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>
    </div>
  );
}

/* ── Hotel / Travel ───────────────────────────────────────────────── */

function HotelContent({ answers, onChange, scrapedFields, onClearScraped }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const rooms = (cs.rooms as string[] | undefined) ?? [];
  const amenities = (cs.amenities as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Rumstyper</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {HOTEL_ROOM_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={rooms.includes(opt)} onClick={() => {
              const next = rooms.includes(opt) ? rooms.filter((v) => v !== opt) : [...rooms, opt];
              setCs("rooms", next);
            }} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Faciliteter</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {HOTEL_AMENITY_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={amenities.includes(opt)} onClick={() => {
              const next = amenities.includes(opt) ? amenities.filter((v) => v !== opt) : [...amenities, opt];
              setCs("amenities", next);
            }} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Incheckning / Utcheckning</FieldLabel>
          <input type="text" value={(cs.checkInOut as string) ?? ""} onChange={(e) => setCs("checkInOut", e.target.value)} placeholder="15:00 / 11:00" className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Bokningssystem / URL</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <FieldLabel>Omgivning / läge (valfritt)</FieldLabel>
        <input type="text" value={(cs.locationHighlights as string) ?? ""} onChange={(e) => setCs("locationHighlights", e.target.value)} placeholder="Nära havet, mitt i centrum, vid skidbacken..." className={FIELD_CLASS} />
      </div>

      <div>
        <FieldLabel>Prisnivå</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {["Budget", "Mellan", "Premium"].map((opt) => (
            <Chip key={opt} label={opt} selected={answers.priceRange === opt} onClick={() => onChange((p) => ({ ...p, priceRange: p.priceRange === opt ? "" : opt }))} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Säsong (valfritt)</FieldLabel>
        <input type="text" value={(cs.season as string) ?? ""} onChange={(e) => setCs("season", e.target.value)} placeholder="Helår, sommar, vintersäsong..." className={FIELD_CLASS} />
      </div>

      <div>
        <FieldLabel>Styrkor / USP</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. Havsutsikt, Historisk byggnad..." max={4} />
      </div>
    </div>
  );
}

/* ── Construction / Auto ─────────────────────────────────────────── */

function ConstructionContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const projectTypes = (cs.projectTypes as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Projekttyper</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {CONSTRUCTION_PROJECT_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={projectTypes.includes(opt)} onClick={() => {
              const next = projectTypes.includes(opt) ? projectTypes.filter((v) => v !== opt) : [...projectTypes, opt];
              setCs("projectTypes", next);
            }} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Certifieringar / Behörigheter (valfritt)</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Behörig elektriker, F-skatt, ROT-avdrag..." max={6} />
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Tjänsteområde</FieldLabel>
          <input type="text" value={(cs.serviceArea as string) ?? ""} onChange={(e) => setCs("serviceArea", e.target.value)} placeholder="Stockholm med omnejd" className={FIELD_CLASS} />
        </div>
        <div className="flex items-end pb-1">
          <ToggleField label="Kostnadsfri offert" value={(cs.freeQuote as boolean) ?? false} onToggle={() => setCs("freeQuote", !(cs.freeQuote ?? false))} />
        </div>
      </div>

      <div>
        <FieldLabel>Styrkor / USP</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. 20 års erfarenhet, Garanti..." max={4} />
      </div>
    </div>
  );
}

/* ── Education ────────────────────────────────────────────────────── */

function EducationContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const formats = (cs.courseFormats as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Kurser / Program</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Webbdesign, Svenska för nybörjare..." max={8} />
      </div>

      <div>
        <SectionLabel>Undervisningsformat</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EDUCATION_FORMAT_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={formats.includes(opt)} onClick={() => {
              const next = formats.includes(opt) ? formats.filter((v) => v !== opt) : [...formats, opt];
              setCs("courseFormats", next);
            }} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <FieldLabel>Lärare / Instruktörer (valfritt)</FieldLabel>
        <TagInput values={answers.teamMembers.map((m) => m.name).filter(Boolean)} onChange={(vals) => onChange((p) => ({ ...p, teamMembers: vals.map((n) => ({ name: n, role: "" })) }))} placeholder="T.ex. Anna Svensson, Erik Lund..." max={6} />
      </div>

      <div>
        <SectionLabel>Åldergrupp / Nivå</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EDUCATION_LEVEL_OPTIONS.map((opt) => {
            const levels = (cs.educationLevel as string[] | undefined) ?? [];
            return (
              <Chip key={opt} label={opt} selected={levels.includes(opt)} onClick={() => {
                const next = levels.includes(opt) ? levels.filter((v) => v !== opt) : [...levels, opt];
                setCs("educationLevel", next);
              }} />
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Anmälning / Registrering</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Målgrupp (valfritt)</FieldLabel>
          <input type="text" value={(cs.targetGroup as string) ?? ""} onChange={(e) => setCs("targetGroup", e.target.value)} placeholder="Nybörjare, yrkesverksamma, barn..." className={FIELD_CLASS} />
        </div>
      </div>
    </div>
  );
}

/* ── Event ────────────────────────────────────────────────────────── */

function EventContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const eventTypes = (cs.eventTypes as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Typer av event</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={eventTypes.includes(opt)} onClick={() => {
              const next = eventTypes.includes(opt) ? eventTypes.filter((v) => v !== opt) : [...eventTypes, opt];
              setCs("eventTypes", next);
            }} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Plats / Lokal (valfritt)</FieldLabel>
          <input type="text" value={(cs.venue as string) ?? ""} onChange={(e) => setCs("venue", e.target.value)} placeholder="Egen lokal, valfri plats..." className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Biljetter / Priser (valfritt)</FieldLabel>
          <input type="text" value={(cs.ticketInfo as string) ?? ""} onChange={(e) => setCs("ticketInfo", e.target.value)} placeholder="Från 500 kr, gratis inträde..." className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <FieldLabel>Tjänster som erbjuds</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Planering, Catering, Dekoration..." max={8} />
      </div>

      <div>
        <FieldLabel>Styrkor / USP</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. Skräddarsytt, 100+ event genomförda..." max={4} />
      </div>
    </div>
  );
}

/* ── Legal / Accounting ──────────────────────────────────────────── */

function LegalContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const practiceAreas = (cs.practiceAreas as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Verksamhetsområden</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {LEGAL_AREA_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={practiceAreas.includes(opt)} onClick={() => {
              const next = practiceAreas.includes(opt) ? practiceAreas.filter((v) => v !== opt) : [...practiceAreas, opt];
              setCs("practiceAreas", next);
            }} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <FieldLabel>Jurister / Konsulter</FieldLabel>
        <TagInput values={answers.teamMembers.map((m) => `${m.name}${m.role ? ` (${m.role})` : ""}`).filter(Boolean)} onChange={(vals) => onChange((p) => ({
          ...p, teamMembers: vals.map((v) => {
            const match = v.match(/^(.+?)\s*\((.+)\)$/);
            return match ? { name: match[1], role: match[2] } : { name: v, role: "" };
          }),
        }))} placeholder="T.ex. Anna Svensson (Advokat)..." max={6} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Konsultation / Bokning</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Erfarenhet (valfritt)</FieldLabel>
          <input type="text" value={(cs.experience as string) ?? ""} onChange={(e) => setCs("experience", e.target.value)} placeholder="20+ år, 500+ ärenden..." className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <FieldLabel>Styrkor / USP</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. Gratis rådgivning, Fasta priser..." max={4} />
      </div>
    </div>
  );
}

/* ── Real Estate ──────────────────────────────────────────────────── */

function RealEstateContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const propertyTypes = (cs.propertyTypes as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Bostadstyper</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={propertyTypes.includes(opt)} onClick={() => {
              const next = propertyTypes.includes(opt) ? propertyTypes.filter((v) => v !== opt) : [...propertyTypes, opt];
              setCs("propertyTypes", next);
            }} />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Områden</FieldLabel>
          <input type="text" value={(cs.coverageArea as string) ?? ""} onChange={(e) => setCs("coverageArea", e.target.value)} placeholder="Stockholm, Nacka, Solna..." className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Boknings-/Värderingsförfrågan</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <FieldLabel>Mäklare / Team</FieldLabel>
        <TagInput values={answers.teamMembers.map((m) => m.name).filter(Boolean)} onChange={(vals) => onChange((p) => ({ ...p, teamMembers: vals.map((n) => ({ name: n, role: "Mäklare" })) }))} placeholder="T.ex. Anna Svensson, Erik Lund..." max={6} />
      </div>

      <div>
        <FieldLabel>Tjänster</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Försäljning, Värdering, Uthyrning..." max={6} />
      </div>
    </div>
  );
}

/* ── Nonprofit ────────────────────────────────────────────────────── */

function NonprofitContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Uppdrag / Mission</FieldLabel>
        <textarea
          value={(cs.mission as string) ?? ""}
          onChange={(e) => setCs("mission", e.target.value)}
          placeholder="Beskriv er mission och vad ni arbetar för..."
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>

      <div>
        <FieldLabel>Aktiviteter / Verksamhet</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Utbildning, Insamling, Volontärarbete..." max={8} />
      </div>

      <div className="h-px bg-border" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end pb-1">
          <ToggleField label="Ta emot donationer" value={(cs.acceptsDonations as boolean) ?? false} onToggle={() => setCs("acceptsDonations", !(cs.acceptsDonations ?? false))} />
        </div>
        <div className="flex items-end pb-1">
          <ToggleField label="Volontäranmälan" value={(cs.volunteerSignup as boolean) ?? false} onToggle={() => setCs("volunteerSignup", !(cs.volunteerSignup ?? false))} />
        </div>
      </div>

      <div>
        <FieldLabel>Kontakt / Engagera sig</FieldLabel>
        <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="Länk till anmälan eller kontakt..." className={FIELD_CLASS} />
      </div>

      <div>
        <FieldLabel>Styrkor / Vad ni uppnått</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. 10 000+ hjälpta, 50 volontärer..." max={4} />
      </div>
    </div>
  );
}

/* ── Consulting / Tech ───────────────────────────────────────────── */

function ConsultingContent({ answers, onChange }: ContentProps) {
  const cs = answers.categorySpecific;
  const setCs = (key: string, value: string | string[] | boolean) =>
    onChange((p) => ({ ...p, categorySpecific: { ...p.categorySpecific, [key]: value } }));
  const expertise = (cs.expertiseAreas as string[] | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Expertisområden</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {CONSULTING_EXPERTISE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={expertise.includes(opt)} onClick={() => {
              const next = expertise.includes(opt) ? expertise.filter((v) => v !== opt) : [...expertise, opt];
              setCs("expertiseAreas", next);
            }} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Tjänster / Erbjudanden</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. Workshops, Strategirådgivning, Audit..." max={8} />
      </div>

      <div className="h-px bg-border" />

      <div>
        <FieldLabel>Typiska kunder (valfritt)</FieldLabel>
        <input type="text" value={(cs.clientTypes as string) ?? ""} onChange={(e) => setCs("clientTypes", e.target.value)} placeholder="SME:er, startups, kommuner..." className={FIELD_CLASS} />
      </div>

      <div>
        <FieldLabel>Case studies / Resultat (valfritt)</FieldLabel>
        <textarea
          value={answers.testimonials}
          onChange={(e) => onChange((p) => ({ ...p, testimonials: e.target.value }))}
          placeholder='"Vi ökade omsättningen med 40% efter samarbetet." – Kund AB'
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>

      <div>
        <FieldLabel>Styrkor / USP</FieldLabel>
        <TagInput values={answers.uniqueSellingPoints} onChange={(vals) => onChange((p) => ({ ...p, uniqueSellingPoints: vals }))} placeholder="T.ex. 15 års erfarenhet, Certifierad..." max={4} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 4: Design
   ════════════════════════════════════════════════════════════════════ */

function StoryStep({ answers, onChange, scrapedFields }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>; scrapedFields?: Set<string> }) {
  const set = (key: keyof WizardAnswers, value: string) => onChange((p) => ({ ...p, [key]: value }));
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Om oss</SectionLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Berätta om företaget — historia, filosofi, vad som gör er unika. Blir "Om oss"-sidan.</p>
        <div className="relative">
          <textarea
            value={answers.aboutUs}
            onChange={(e) => set("aboutUs", e.target.value)}
            placeholder="T.ex. Vi grundades 2015 med en passion för ekologisk hudvård. Idag hjälper vi tusentals kunder att hitta produkter som är bra för både huden och planeten..."
            className={cn(FIELD_CLASS, "min-h-[120px] resize-none")}
          />
          {scrapedFields?.has("aboutUs") && <ScrapeBadge />}
        </div>
      </div>

      <div>
        <FieldLabel>Företagets historia (valfritt)</FieldLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Hur startade företaget? Milstolpar och utveckling.</p>
        <div className="relative">
          <textarea
            value={answers.companyStory}
            onChange={(e) => set("companyStory", e.target.value)}
            placeholder="T.ex. Grundat i ett garage 2010, idag med kontor i tre städer..."
            className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
          />
          {scrapedFields?.has("companyStory") && <ScrapeBadge />}
        </div>
      </div>

      <div>
        <FieldLabel>Vision / mission (valfritt)</FieldLabel>
        <div className="relative">
          <input
            type="text"
            value={answers.vision}
            onChange={(e) => set("vision", e.target.value)}
            placeholder="T.ex. Att göra hållbar hudvård tillgänglig för alla"
            className={FIELD_CLASS}
          />
          {scrapedFields?.has("vision") && <ScrapeBadge />}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <FieldLabel>Kontaktsidans intro (valfritt)</FieldLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">En kort text som visas på kontaktsidan.</p>
        <div className="relative">
          <textarea
            value={answers.contactPageText}
            onChange={(e) => set("contactPageText", e.target.value)}
            placeholder="T.ex. Vi hjälper dig gärna! Tveka inte att höra av dig med frågor om våra produkter eller beställningar."
            className={cn(FIELD_CLASS, "min-h-[70px] resize-none")}
          />
          {scrapedFields?.has("contactPageText") && <ScrapeBadge />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 5: Pages (confirm)
   ════════════════════════════════════════════════════════════════════ */

function PagesStep({
  answers,
  onChange,
  toggleChip,
  suggesting,
  aiSuggestions,
  onSuggest,
}: {
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
  toggleChip: (field: "mustHave", value: string) => void;
  suggesting: boolean;
  aiSuggestions: string[];
  onSuggest: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Vi bygger dessa sidor</SectionLabel>
        <p className="mb-3 text-xs text-muted-foreground/80">Förvalt utifrån din kategori — ta bort de du inte vill ha eller lägg till fler.</p>
        <div className="flex flex-wrap gap-2">
          {MUST_HAVE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.mustHave.includes(opt)} suggested={aiSuggestions.includes(opt)} onClick={() => toggleChip("mustHave", opt)} />
          ))}
        </div>
        <button type="button" onClick={onSuggest} disabled={suggesting} className="mt-3 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-foreground underline underline-offset-2 transition-colors hover:opacity-80 disabled:opacity-40">
          {suggesting ? "Hämtar förslag…" : "Föreslå sidor utifrån din beskrivning"}
        </button>
      </div>

      <div className="h-px bg-border" />

      <div>
        <SectionLabel>Vem besöker sajten?</SectionLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Beskriv din målgrupp — ålder, intressen, behov.</p>
        <input
          type="text"
          value={answers.targetAudience}
          onChange={(e) => onChange((p) => ({ ...p, targetAudience: e.target.value }))}
          placeholder="T.ex. Kvinnor 30-50 som söker hudvård, småföretagare i Stockholm"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <SectionLabel>Vad ska besökare göra på sajten?</SectionLabel>
        <p className="mb-1.5 text-xs text-muted-foreground/70">Välj den viktigaste uppmaningen (CTA) — eller skriv en egen.</p>
        <div className="flex flex-wrap gap-2">
          {CTA_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.primaryCta === opt} onClick={() => onChange((p) => ({ ...p, primaryCta: p.primaryCta === opt ? "" : opt }))} />
          ))}
        </div>
        <input
          type="text"
          value={CTA_OPTIONS.includes(answers.primaryCta) ? "" : answers.primaryCta}
          onChange={(e) => onChange((p) => ({ ...p, primaryCta: e.target.value }))}
          placeholder="Eller skriv en egen, t.ex. Boka gratis konsultation"
          className={cn(FIELD_CLASS, "mt-2")}
        />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Shared sub-components
   ════════════════════════════════════════════════════════════════════ */

function ScrapeBadge() {
  return (
    <span
      className="absolute right-2 top-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70"
      title="Hämtat från sajt"
    >
      Hämtat
    </span>
  );
}

function Chip({ label, selected, suggested, onClick }: { label: string; selected: boolean; suggested?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "min-h-10 touch-manipulation rounded-full border px-3.5 py-1.5 text-sm",
        MOTION,
        selected
          ? "border-foreground bg-foreground font-medium text-background"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        suggested && !selected && "border-foreground/25 text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm font-medium text-foreground">{children}</label>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}

function ImagePickerThumb({ preview, onPick }: { preview?: string; onPick: (file: File) => void }) {
  return (
    <label className={cn(
      "group flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-all duration-200",
      preview ? "border-border bg-muted/40" : "border-2 border-dashed border-border bg-muted/20 hover:border-foreground/30 hover:bg-muted/40",
    )}>
      {preview ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={preview} alt="" className="h-full w-full rounded-xl object-cover" />
      ) : (
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground">Bild</span>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onPick(e.target.files[0]); }} />
    </label>
  );
}

/* ── Media step ───────────────────────────────────────────────────── */

const ACCEPTED_MEDIA_TYPES = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime";

const MEDIA_CONTEXT_OPTIONS = [
  { value: "hero-image", label: "Herobild (stor bild högst upp)" },
  { value: "about-image", label: "Om oss / teamfoto" },
  { value: "product-photo", label: "Produktbild" },
  { value: "gallery-image", label: "Galleri / portfolio" },
  { value: "background-image", label: "Bakgrundsbild" },
  { value: "site-media", label: "Annat (AI bestämmer)" },
];

function MediaStep({ answers, onChange }: {
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleLogoFile = useCallback((file: File) => {
    onChange((p) => {
      if (p.logoPreview) URL.revokeObjectURL(p.logoPreview);
      return { ...p, logoFile: file, logoPreview: URL.createObjectURL(file) };
    });
  }, [onChange]);

  const removeLogo = useCallback(() => {
    onChange((p) => {
      if (p.logoPreview) URL.revokeObjectURL(p.logoPreview);
      return { ...p, logoFile: null, logoPreview: "" };
    });
  }, [onChange]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newMedia: Array<{ file: File; preview: string; context: string }> = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
      newMedia.push({ file, preview, context: "site-media" });
    }
    if (newMedia.length > 0) {
      onChange((prev) => ({ ...prev, siteMedia: [...prev.siteMedia, ...newMedia] }));
    }
  }, [onChange]);

  const removeFile = useCallback((index: number) => {
    onChange((prev) => {
      const item = prev.siteMedia[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return { ...prev, siteMedia: prev.siteMedia.filter((_, i) => i !== index) };
    });
  }, [onChange]);

  const updateContext = useCallback((index: number, context: string) => {
    onChange((prev) => ({
      ...prev,
      siteMedia: prev.siteMedia.map((m, i) => i === index ? { ...m, context } : m),
    }));
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Ladda upp logotyp, bilder och videos. AI:n placerar dem där de passar bäst, men du kan hjälpa till med kategorin.
      </p>

      <div>
        <SectionLabel>Logotyp</SectionLabel>
        {answers.logoPreview ? (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={answers.logoPreview} alt="Logo" className="h-16 w-16 rounded-xl border border-border object-contain bg-background p-1.5" />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Logotyp uppladdad</span>
              <button type="button" onClick={removeLogo} className="w-fit rounded-lg px-2 py-0.5 text-xs text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive">Ta bort</button>
            </div>
          </div>
        ) : (
          <label className={cn("group flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/20 py-6 text-muted-foreground touch-manipulation", MOTION, "hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground")}>
            <div className="text-center">
              <span className="block text-sm font-medium">Ladda upp din logotyp</span>
              <span className="block text-xs text-muted-foreground/60 mt-1">PNG, JPG eller SVG</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleLogoFile(e.target.files[0]); }} />
          </label>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Ladda upp filer — dra och släpp eller klicka"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "group flex min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 text-muted-foreground touch-manipulation",
          MOTION,
          dragOver
            ? "border-foreground bg-muted/60 text-foreground"
            : "border-border bg-muted/20 hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground",
        )}
      >
        <div className="text-center">
          <span className="block text-sm font-medium">
            {dragOver ? "Släpp för att ladda upp" : "Dra och släpp filer hit"}
          </span>
          <span className="block text-xs text-muted-foreground/60 mt-1">
            eller klicka för att välja — PNG, JPG, WebP, SVG, MP4, WebM
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MEDIA_TYPES}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }}
        />
      </div>

      {/* File grid */}
      {answers.siteMedia.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-medium text-muted-foreground">
            {answers.siteMedia.length} {answers.siteMedia.length === 1 ? "fil" : "filer"} uppladdade
          </span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {answers.siteMedia.map((item, idx) => (
              <div key={idx} className="group/card relative rounded-xl border border-border bg-muted/25 overflow-hidden">
                {item.file.type.startsWith("video/") ? (
                  <div className="flex h-28 items-center justify-center bg-muted/50">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                      {item.file.name.split(".").pop()?.toUpperCase() || "Video"}
                    </span>
                  </div>
                ) : (
                  <div className="h-28 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt={item.context} className="h-full w-full object-cover" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  aria-label="Ta bort fil"
                  className="absolute right-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
                >
                  Ta bort
                </button>

                <div className="p-2 space-y-1">
                  <select
                    value={item.context}
                    onChange={(e) => updateContext(idx, e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                  >
                    {MEDIA_CONTEXT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="block truncate text-[10px] text-muted-foreground/40">
                    {item.file.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleField({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={onToggle}
        className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200", value ? "bg-primary shadow-sm shadow-primary/30" : "bg-muted")}
      >
        <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-200", value ? "translate-x-4" : "translate-x-0.5")} />
      </button>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TagInput({ values, onChange, placeholder, max = 999 }: { values: string[]; onChange: (vals: string[]) => void; placeholder?: string; max?: number }) {
  const [input, setInput] = useState("");
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed) && values.length < max) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  return (
    <div>
      {values.length < max && (
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || (e.key === "," && input.trim())) { e.preventDefault(); add(); } }}
            placeholder={placeholder} className={cn(FIELD_CLASS, "flex-1")}
          />
          <button type="button" onClick={add} disabled={!input.trim()} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-30">
            Lägg till
          </button>
        </div>
      )}
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Ta bort ${v}`} className="rounded-full px-1 text-muted-foreground transition-colors hover:text-foreground">Ta bort</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
