"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Building2,
  Globe,
  Loader2,
  ShoppingBag,
  Camera,
  UtensilsCrossed,
  FileText,
  BookOpen,
  SkipForward,
  Check,
  Sparkles,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NeedsAnalysisField } from "@/lib/builder/needs-analysis";

/* ── Site type categories with icons ──────────────────────────────── */

type CategoryItem = { id: string; label: string; icon: LucideIcon };

const CATEGORIES: CategoryItem[] = [
  { id: "business", label: "Företag / Tjänster", icon: Building2 },
  { id: "ecommerce", label: "Webshop / E-handel", icon: ShoppingBag },
  { id: "restaurant", label: "Restaurang / Café", icon: UtensilsCrossed },
  { id: "portfolio", label: "Portfolio / CV", icon: Camera },
  { id: "landing", label: "Landningssida", icon: FileText },
  { id: "blog", label: "Blogg / Magasin", icon: BookOpen },
  { id: "other", label: "Annat", icon: Sparkles },
];

const GOAL_OPTIONS = [
  "Få fler kunder",
  "Sälja produkter online",
  "Bygga förtroende",
  "Samla leads / offertförfrågningar",
  "Lansera ny tjänst",
  "Öka lokal synlighet",
  "Visa upp portfolio",
  "Boka tid / möten",
];

const AUDIENCE_OPTIONS = [
  "Privatpersoner",
  "Företag / B2B",
  "Lokala kunder",
  "Unga vuxna 18–35",
  "Kvinnor 30–55",
  "Föräldrar",
  "Alla målgrupper",
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
  "Video / Presentation",
];

/* ── Step definitions ─────────────────────────────────────────────── */

type StepId = "siteType" | "offer" | "existingSite" | "businessDetails" | "brandIdentity" | "servicesProducts" | "categorySpecific" | "goal" | "audience" | "mustHave";

export interface BusinessDetails {
  companyName: string;
  orgNr: string;
  phone: string;
  email: string;
  address: string;
  openingHours: string;
  socialLinks: string[];
  brandColors: string[];
}

export interface BrandIdentityData {
  tagline: string;
  tone: string;
  heroImagePreference: string;
  fontPreference: string;
}

export interface ServicesProductsData {
  services: string[];
  uniqueSellingPoints: string[];
  callToAction: string;
  testimonials: string;
}

const EMPTY_BUSINESS_DETAILS: BusinessDetails = {
  companyName: "",
  orgNr: "",
  phone: "",
  email: "",
  address: "",
  openingHours: "",
  socialLinks: [],
  brandColors: [],
};

const EMPTY_BRAND_IDENTITY: BrandIdentityData = {
  tagline: "",
  tone: "",
  heroImagePreference: "",
  fontPreference: "",
};

const EMPTY_SERVICES_PRODUCTS: ServicesProductsData = {
  services: [],
  uniqueSellingPoints: [],
  callToAction: "",
  testimonials: "",
};

const TONE_OPTIONS = ["Professionell", "Varm och personlig", "Lekfull", "Exklusiv / lyxig", "Rak och enkel"];
const HERO_IMAGE_OPTIONS = ["Foto på teamet / lokalen", "Produktbilder", "Abstrakt / stämningsfullt", "Ingen hero-bild"];
const FONT_OPTIONS = ["Modern sans-serif", "Klassisk serif", "Låt AI:n välja"];
const CTA_OPTIONS = ["Boka tid", "Ring oss", "Få offert", "Köp nu", "Kontakta oss", "Annat"];

/* ── Category-specific field configs ─────────────────────────────── */

type FieldType = "tags" | "chips" | "toggle" | "text" | "select";

interface CategoryFieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
}

interface CategoryExtraConfig {
  stepTitle: string;
  fields: CategoryFieldDef[];
}

const CATEGORY_EXTRA_FIELDS: Record<string, CategoryExtraConfig> = {
  restaurant: {
    stepTitle: "Meny och mat",
    fields: [
      { key: "menuItems", label: "Rätter / menyalternativ", type: "tags", placeholder: "t.ex. Pasta Carbonara, Caesarsallad..." },
      { key: "cuisine", label: "Kök / matstil", type: "chips", options: ["Svenskt", "Italienskt", "Asiatiskt", "Franskt", "Amerikanskt", "Fusion", "Vegetariskt", "Annat"] },
      { key: "delivery", label: "Leverans / takeaway", type: "toggle" },
      { key: "acceptsReservations", label: "Bordsbokning", type: "toggle" },
    ],
  },
  food: {
    stepTitle: "Meny och mat",
    fields: [
      { key: "menuItems", label: "Rätter / menyalternativ", type: "tags", placeholder: "t.ex. Buffé, Mingel, Brunch..." },
      { key: "cuisine", label: "Matstil", type: "chips", options: ["Svenskt", "Italienskt", "Asiatiskt", "Fusion", "Vegetariskt", "Annat"] },
      { key: "delivery", label: "Leverans / catering", type: "toggle" },
    ],
  },
  salon: {
    stepTitle: "Behandlingar och bokning",
    fields: [
      { key: "treatments", label: "Behandlingar / tjänster med pris", type: "tags", placeholder: "t.ex. Klippning dam 450 kr, Färgning 800 kr..." },
      { key: "bookingUrl", label: "Boknings-URL (om extern)", type: "text", placeholder: "https://..." },
      { key: "teamMembers", label: "Stylister / team", type: "tags", placeholder: "t.ex. Anna — färgspecialist, Erik — barberare..." },
    ],
  },
  healthcare: {
    stepTitle: "Behandlingar och bokning",
    fields: [
      { key: "treatments", label: "Behandlingar / tjänster", type: "tags", placeholder: "t.ex. Allmänläkare, Hudvård, Fysioterapi..." },
      { key: "bookingUrl", label: "Boknings-URL", type: "text", placeholder: "https://..." },
      { key: "teamMembers", label: "Personal / specialister", type: "tags", placeholder: "t.ex. Dr. Andersson — ortoped..." },
    ],
  },
  fitness: {
    stepTitle: "Träning och bokning",
    fields: [
      { key: "treatments", label: "Klasser / träningsformer", type: "tags", placeholder: "t.ex. Yoga, CrossFit, PT-pass..." },
      { key: "priceRange", label: "Prisintervall", type: "select", options: ["Budget", "Mellan", "Premium"] },
      { key: "bookingUrl", label: "Boknings-URL", type: "text", placeholder: "https://..." },
      { key: "teamMembers", label: "Tränare / instruktörer", type: "tags", placeholder: "t.ex. Lisa — yogainstruktör..." },
    ],
  },
  ecommerce: {
    stepTitle: "Produkter och leverans",
    fields: [
      { key: "products", label: "Produkthöjdpunkter", type: "tags", placeholder: "t.ex. Handgjorda ljus, Ekologiska hudvårdsprodukter..." },
      { key: "priceRange", label: "Prisnivå", type: "select", options: ["Budget (under 200 kr)", "Mellan (200–1 000 kr)", "Premium (1 000+ kr)"] },
      { key: "shippingInfo", label: "Leveransinformation", type: "text", placeholder: "t.ex. Fri frakt över 499 kr, leverans 2–4 dagar" },
      { key: "paymentMethods", label: "Betalningsmetoder", type: "chips", options: ["Swish", "Kort", "Klarna", "Faktura", "PayPal"] },
    ],
  },
  portfolio: {
    stepTitle: "Projekt och kompetenser",
    fields: [
      { key: "projectTypes", label: "Typer av projekt", type: "tags", placeholder: "t.ex. Webbdesign, Logotyper, App-design..." },
      { key: "tools", label: "Verktyg / kompetenser", type: "tags", placeholder: "t.ex. Figma, React, Photoshop..." },
      { key: "clientLogos", label: "Visa kundlogotyper", type: "toggle" },
    ],
  },
  photo: {
    stepTitle: "Projekt och kompetenser",
    fields: [
      { key: "projectTypes", label: "Typer av uppdrag", type: "tags", placeholder: "t.ex. Bröllop, Porträtt, Produktfoto..." },
      { key: "tools", label: "Utrustning / stil", type: "tags", placeholder: "t.ex. Naturligt ljus, Studio, Drone..." },
      { key: "clientLogos", label: "Visa referenskunder", type: "toggle" },
    ],
  },
  music: {
    stepTitle: "Musik och projekt",
    fields: [
      { key: "projectTypes", label: "Genre / musikstil", type: "tags", placeholder: "t.ex. Pop, Rock, Elektronisk..." },
      { key: "tools", label: "Instrument / roller", type: "tags", placeholder: "t.ex. Gitarr, Sång, Producent..." },
      { key: "streamingLinks", label: "Streaminglänkar (Spotify, Apple Music)", type: "text", placeholder: "https://..." },
    ],
  },
  construction: {
    stepTitle: "Certifikat och område",
    fields: [
      { key: "certifications", label: "Certifieringar", type: "tags", placeholder: "t.ex. BKR-certifierad, F-skatt, ISO 9001..." },
      { key: "serviceArea", label: "Tjänsteområde", type: "text", placeholder: "t.ex. Stockholmsområdet, hela Skåne..." },
      { key: "projectGallery", label: "Visa projektgalleri", type: "toggle" },
    ],
  },
  auto: {
    stepTitle: "Fordon och tjänster",
    fields: [
      { key: "certifications", label: "Certifieringar", type: "tags", placeholder: "t.ex. Auktoriserad verkstad, MECA..." },
      { key: "serviceArea", label: "Upptagningsområde", type: "text", placeholder: "t.ex. Göteborg med omnejd..." },
      { key: "products", label: "Bilmärken / tjänster", type: "tags", placeholder: "t.ex. Volvo, BMW, Service, Besiktning..." },
    ],
  },
  consulting: {
    stepTitle: "Expertis och team",
    fields: [
      { key: "specializations", label: "Specialiseringar", type: "tags", placeholder: "t.ex. Digital strategi, UX-design, SEO..." },
      { key: "teamSize", label: "Teamstorlek", type: "select", options: ["Soloföretagare", "2–5 personer", "6–20 personer", "20+ personer"] },
      { key: "clientTypes", label: "Kundtyper", type: "chips", options: ["Startups", "SME", "Enterprise", "Offentlig sektor", "Ideell"] },
    ],
  },
  legal: {
    stepTitle: "Juridisk expertis",
    fields: [
      { key: "specializations", label: "Rättsområden", type: "tags", placeholder: "t.ex. Familjerätt, Avtalsrätt, Brottmål..." },
      { key: "teamMembers", label: "Jurister / partners", type: "tags", placeholder: "t.ex. Maria Svensson — advokat, familjerätt..." },
      { key: "clientTypes", label: "Kundtyper", type: "chips", options: ["Privatpersoner", "Företag", "Offentlig sektor"] },
    ],
  },
  accounting: {
    stepTitle: "Tjänster och expertis",
    fields: [
      { key: "specializations", label: "Tjänsteområden", type: "tags", placeholder: "t.ex. Bokföring, Årsredovisning, Skatterådgivning..." },
      { key: "teamSize", label: "Teamstorlek", type: "select", options: ["Soloföretagare", "2–5 personer", "6–20 personer", "20+ personer"] },
      { key: "certifications", label: "Certifieringar", type: "tags", placeholder: "t.ex. Auktoriserad redovisningskonsult..." },
    ],
  },
  tech: {
    stepTitle: "Produkt och teknik",
    fields: [
      { key: "specializations", label: "Teknologier / stack", type: "tags", placeholder: "t.ex. React, AI/ML, Cloud, SaaS..." },
      { key: "teamSize", label: "Teamstorlek", type: "select", options: ["1–5", "6–20", "21–100", "100+"] },
      { key: "products", label: "Produkter / features", type: "tags", placeholder: "t.ex. API-plattform, Dashboard, Mobilapp..." },
    ],
  },
  hotel: {
    stepTitle: "Rum och faciliteter",
    fields: [
      { key: "roomTypes", label: "Rumstyper", type: "tags", placeholder: "t.ex. Enkelrum, Dubbelrum, Svit, Stuga..." },
      { key: "facilities", label: "Faciliteter", type: "chips", options: ["Pool", "Spa", "Gym", "Restaurang", "Parkering", "Wi-Fi", "Konferens", "Bar"] },
      { key: "bookingUrl", label: "Boknings-URL", type: "text", placeholder: "https://..." },
    ],
  },
  travel: {
    stepTitle: "Resor och upplevelser",
    fields: [
      { key: "projectTypes", label: "Typer av resor", type: "tags", placeholder: "t.ex. Charterresor, Äventyrsresor, Weekendpaket..." },
      { key: "facilities", label: "Ingår i resan", type: "chips", options: ["Flyg", "Hotell", "Transfer", "Guide", "Mat", "Aktiviteter"] },
      { key: "bookingUrl", label: "Bokningssystem", type: "text", placeholder: "https://..." },
    ],
  },
  education: {
    stepTitle: "Kurser och utbildning",
    fields: [
      { key: "courseTypes", label: "Kurstyper / program", type: "tags", placeholder: "t.ex. Programmeringskurs, Språkkurs, MBA..." },
      { key: "ageGroups", label: "Åldersgrupper", type: "chips", options: ["Barn", "Ungdom", "Vuxna", "Seniorer", "Alla åldrar"] },
      { key: "onlinePhysical", label: "Format", type: "chips", options: ["På plats", "Online", "Hybrid"] },
    ],
  },
  event: {
    stepTitle: "Event och planering",
    fields: [
      { key: "eventTypes", label: "Typer av event", type: "tags", placeholder: "t.ex. Bröllop, Konferens, Fest, Företagsevent..." },
      { key: "capacity", label: "Kapacitet / antal gäster", type: "text", placeholder: "t.ex. Upp till 200 gäster" },
      { key: "facilities", label: "Faciliteter / tjänster", type: "chips", options: ["Lokal", "Catering", "DJ", "Dekoration", "Foto", "Video", "Blomster"] },
    ],
  },
  nonprofit: {
    stepTitle: "Verksamhet och engagemang",
    fields: [
      { key: "specializations", label: "Fokusområden", type: "tags", placeholder: "t.ex. Miljö, Barn & unga, Kultur..." },
      { key: "membershipInfo", label: "Medlemsinfo", type: "text", placeholder: "t.ex. Årsavgift 200 kr, öppet för alla..." },
      { key: "volunteerSignup", label: "Visa volontäranmälan", type: "toggle" },
    ],
  },
};

interface WizardAnswers {
  siteType: string[];
  offer: string;
  existingSite: string;
  businessDetails: BusinessDetails;
  brandIdentity: BrandIdentityData;
  servicesProducts: ServicesProductsData;
  goal: string[];
  audience: string[];
  mustHave: string[];
  categorySpecific: Record<string, string | string[] | boolean>;
}

const STEP_TITLES: Record<StepId, string> = {
  siteType: "Vad bygger vi?",
  offer: "Berätta om din verksamhet",
  existingSite: "Har du en sajt idag?",
  businessDetails: "Företagsuppgifter",
  brandIdentity: "Varumärke och stil",
  servicesProducts: "Tjänster och erbjudande",
  categorySpecific: "Branschdetaljer",
  goal: "Vad är målet?",
  audience: "Vem är kunden?",
  mustHave: "Vad måste finnas med?",
};

/* ── IntakeWizard ─────────────────────────────────────────────────── */

export interface IntakeWizardResult {
  answers: WizardAnswers;
  fieldMessages: Array<{ field: NeedsAnalysisField; text: string }>;
}

export interface WizardScrapeData {
  title?: string;
  description?: string;
  phone?: string;
  email?: string;
  socialLinks?: string[];
  brandColors?: string[];
  address?: string;
  openingHours?: string;
  tagline?: string;
  tone?: string;
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
  treatments?: Array<{ name: string; price?: string }>;
  products?: Array<{ name: string; price?: string; image?: string }>;
  teamMembers?: Array<{ name: string; role?: string }>;
  cuisine?: string;
  acceptsReservations?: boolean;
  priceRange?: string;
}

interface IntakeWizardProps {
  onComplete: (result: IntakeWizardResult) => void;
  onScrapeUrl?: (url: string) => Promise<WizardScrapeData | null>;
  suggestContext?: { siteType?: string; companyDescription?: string; scrapeText?: string };
  initialExistingUrl?: string;
  initialPrompt?: string;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurant: [
    "restaurang", "café", "cafe", "kafé", "kafe", "bar", "pub", "pizzeria",
    "sushi", "bistro", "krog", "matställe", "lunch", "middag", "brunch",
    "fine dining", "gastropub", "ramen", "thai", "indisk", "kinesisk",
    "mexikansk", "burgar", "burger", "hamburgare", "kebab", "falafel",
    "uteservering", "tapas", "trattoria", "wok", "poke", "salladbar",
    "glass", "glasbar", "juicebar", "smoothie", "frukost", "diner",
    "matbar", "vinbar", "cocktailbar", "ölbar", "brasserie", "serveringar",
  ],
  ecommerce: [
    "webshop", "e-handel", "nätbutik", "sälj", "produkter online",
    "butik online", "webbshop", "shop", "näthandel", "webbutik",
    "e-commerce", "ecommerce", "onlinebutik", "handla online",
    "köp online", "beställ", "varukorg", "checkout", "kläder online",
    "smycken", "accessoarer", "inredning online", "möbler online",
    "kosmetik online", "hudvårdsprodukter", "dropshipping", "grossist",
    "detaljhandel", "retail", "lager", "frakt", "leverans", "rea",
    "outlet", "secondhand", "vintage", "marknad", "marknadsplats",
  ],
  salon: [
    "salong", "frisör", "frisörsalong", "skönhet", "naglar", "hudvård",
    "spa", "hår", "barber", "makeup", "sminkning", "hårsalong",
    "skönhetssalong", "nagelsalong", "fransar", "ögonfransar", "bryn",
    "ansiktsbehandling", "hårvård", "klippning", "färgning", "slingor",
    "extensions", "permanentning", "keratin", "peeling", "manikyr",
    "pedikyr", "vaxning", "laser", "ipl", "fillers", "botox",
    "skönhetsklinik", "estetisk", "kosmetolog", "hudterapeut",
    "massör", "massage", "thaimassage", "spa-behandling", "kroppsvård",
    "wellness", "dagspa", "wellnesshotell", "aroma", "aromaterapi",
  ],
  portfolio: [
    "portfolio", "cv", "personlig sida", "mitt arbete", "mina projekt",
    "kreativ portfolio", "design portfolio", "uiux", "ui/ux", "designer",
    "illustratör", "grafisk design", "grafiker", "art director",
    "kreativt arbete", "showreel", "showcase", "galleri", "utställning",
    "personlig hemsida", "personlig webb", "min sida", "resumé",
    "meritförteckning", "arbetsprover", "uppdrag", "frilansar",
    "frilansare", "freelancer", "konstnär", "konst", "målningar",
    "skulptur", "keramik", "hantverk", "slöjd", "textil",
  ],
  consulting: [
    "konsult", "byrå", "agentur", "rådgivning", "strategi",
    "managementkonsult", "it-konsult", "affärskonsult", "rekrytering",
    "headhunting", "bemanning", "rekryteringsbyrå", "pr-byrå",
    "kommunikationsbyrå", "reklambyrå", "marknadsföringsbyrå",
    "digitalbyrå", "webbyrå", "designbyrå", "arkitektbyrå", "arkitekt",
    "ingenjör", "ingenjörsbyrå", "projektledning", "projektledare",
    "interim", "affärsutveckling", "företagsrådgivning", "mentor",
    "mentorskap", "coachning", "affärscoach", "ledarskap",
    "organisationsutveckling", "förändringsledning", "analys",
    "utredning", "undersökning", "research", "insights",
  ],
  fitness: [
    "gym", "träning", "tränare", "fitness", "yoga", "pilates",
    "pt ", "personlig tränare", "crossfit", "gruppträning", "spinning",
    "löpning", "löparklubb", "simning", "simhall", "kampsport",
    "boxning", "mma", "judo", "karate", "taekwondo", "kickboxning",
    "dans", "dansskola", "dansstudio", "balett", "zumba", "bodypump",
    "styrketräning", "funktionell träning", "bootcamp", "outdoor",
    "klättring", "bouldering", "padel", "tennis", "golf", "golfklubb",
    "ridning", "ridskola", "ridhus", "hästsport", "friidrott",
    "atletklubb", "idrottsklubb", "sportförening", "hälsa", "hälsokost",
    "kost", "näringsterapeut", "dietist", "personlig hälsa", "rehab",
    "rehabilitering", "träningsanläggning", "gymkedja",
  ],
  construction: [
    "bygg", "hantverk", "snickare", "målare", "taklägg", "renovering",
    "elektriker", "rörmokare", "plåtslagare", "golv", "golvläggare",
    "kakel", "klinker", "badrum", "badrumsrenovering", "köksrenovering",
    "tillbyggnad", "nybyggnation", "husbygge", "husbyggare", "byggföretag",
    "byggfirma", "entreprenad", "mark", "markarbete", "grävning",
    "schaktning", "betong", "murare", "murning", "fasad", "fasadrenovering",
    "fönster", "fönsterbyte", "dörr", "dörrbyte", "isolering",
    "värmepump", "ventilation", "vvs", "rörläggare", "avlopp",
    "vatten", "el", "elinstallation", "solpanel", "solcell",
    "energi", "takbyte", "takrenovering", "plåt", "taktäckning",
    "trädgård", "trädgårdsanläggning", "trädgårdsarbete", "landskapsarkitekt",
    "stenläggning", "plattsättning", "pool", "poolbyggare", "altan",
    "altanbygge", "uterum", "inglasning", "staket", "stängsel",
    "städ", "städfirma", "städföretag", "hemstäd", "kontorsstäd",
    "flyttstäd", "fönsterputs", "sanering", "sotning", "sotare",
    "lås", "låssmed", "larm", "säkerhet", "kameraövervakning",
    "flytt", "flyttfirma", "flytthjälp", "magasinering", "förvaring",
  ],
  healthcare: [
    "vård", "klinik", "tandläkare", "läkare", "terapi", "psykolog",
    "kiropraktor", "fysioterapi", "sjukgymnast", "optiker",
    "vårdcentral", "mottagning", "specialistmottagning", "ortoped",
    "hudläkare", "dermatolog", "ögonläkare", "öronläkare", "barnläkare",
    "gynekolog", "urolog", "neurolog", "kardiolog", "onkolog",
    "allmänläkare", "husläkare", "privatläkare", "akupunktur",
    "naprapati", "naprapat", "osteopat", "osteopati", "homeopat",
    "naturläkare", "alternativmedicin", "kostrådgivare", "logoped",
    "arbetsterapeut", "audionom", "hörsel", "hörapparat", "syn",
    "glasögon", "optik", "kontaktlinser", "tandvård", "tandklinik",
    "tandreglering", "implantat", "tandblekning", "tandprotes",
    "tandhygienist", "psykoterapi", "psykoterapeut", "samtalsterapi",
    "kbt", "parterapi", "familjeterapi", "beroendevård", "ätstörning",
    "dietist", "näringsfysiolog", "vaccinering", "blodprov", "labb",
    "laboratorium", "röntgen", "ultraljud", "mri", "scanning",
    "hemtjänst", "hemsjukvård", "äldreomsorg", "assistans",
    "personlig assistent", "omsorg", "omvårdnad", "hospice",
    "veterinär", "djurklinik", "djursjukhus", "husdjur",
  ],
  tech: [
    "tech", "startup", "saas", "app", "mjukvara", "software",
    "plattform", "ai ", "artificial intelligence", "maskinlärning",
    "machine learning", "deep learning", "blockchain", "crypto",
    "krypto", "fintech", "edtech", "healthtech", "proptech", "cleantech",
    "greentech", "iot", "internet of things", "robotik", "automation",
    "api", "sdk", "utvecklare", "developer", "programmering",
    "kodning", "webb", "webbapplikation", "mobilapp", "applikation",
    "molntjänst", "cloud", "hosting", "devops", "cybersäkerhet",
    "datasäkerhet", "it-säkerhet", "nätverk", "infrastruktur",
    "systemintegration", "erp", "crm", "it-bolag", "it-företag",
    "teknikbolag", "digital transformation", "digitalisering",
    "data", "dataanalys", "big data", "analytics", "dashboard",
    "innovation", "inkubator", "accelerator", "venture",
  ],
  blog: [
    "blogg", "magasin", "tidning", "redaktionell", "artiklar",
    "nyheter", "content", "innehåll", "skribent", "journalist",
    "krönika", "recension", "recensioner", "guide", "guider",
    "tips", "råd", "inspiration", "livsstil", "mode", "fashion",
    "inredning", "design", "mat och dryck", "matblogg", "reseblogg",
    "träningsblogg", "teknikblogg", "podcast", "podd", "nyhetsbrev",
    "newsletter", "redaktion", "publicering", "förlag", "bokförlag",
    "mediahus", "mediabolag", "webbtidning", "nättidning",
  ],
  landing: [
    "landningssida", "landing page", "kampanj", "event-sida",
    "lansering", "produktlansering", "kampanjsida", "squeeze page",
    "lead magnet", "signup", "registrering", "anmälan", "väntelista",
    "waitlist", "coming soon", "snart", "pre-launch", "beta",
    "early access", "teaser", "promo", "erbjudande", "rabatt",
    "rea-sida", "black friday", "julkampanj", "sommarkampanj",
  ],
  education: [
    "utbildning", "skola", "kurs", "lärare", "akademi", "förskola",
    "coaching", "onlinekurs", "e-learning", "distansutbildning",
    "lärplattform", "undervisning", "handledning", "handledare",
    "lektion", "lektioner", "privatlärare", "matematik", "språkkurs",
    "programmeringskurs", "körskola", "körlektioner", "trafikskola",
    "musikskola", "musiklektion", "konst", "konstskola", "ateljé",
    "workshop", "seminarium", "föreläsning", "föreläsare", "talare",
    "keynote", "kompetensutveckling", "fortbildning", "certifiering",
    "diplom", "examen", "högskola", "universitet", "gymnasium",
    "grundskola", "fritids", "dagis", "barnomsorg", "folkhögskola",
    "studiecirkel", "studieförbund", "yrkesutbildning", "yrkesskola",
    "lärlingsutbildning", "praktik", "mentorprogram",
  ],
  event: [
    "event", "bröllop", "fest", "konferens", "mässa", "festival",
    "bröllopsfotograf", "bröllopsplanering", "eventbyrå", "eventplanering",
    "festlokal", "lokal", "konferensanläggning", "möteslokal",
    "teambuilding", "kickoff", "företagsevent", "mingel", "gala",
    "ceremoni", "invigning", "jubileum", "födelsedag", "barnkalas",
    "studentfest", "examensceremoni", "konsert", "spelning", "show",
    "föreställning", "teater", "cirkus", "standup", "comedy",
    "underhållning", "artist", "dj", "catering", "eventcatering",
    "tält", "tältuthyrning", "dekoration", "florist", "blomsterhandel",
    "blommor", "ballonger", "ljud", "ljus", "teknik", "scenografi",
    "moderator", "konferencier", "toastmaster", "fotobås", "photobooth",
  ],
  nonprofit: [
    "förening", "ideell", "organisation", "välgörenhet", "stiftelse",
    "ngo", "icke-vinstdrivande", "non-profit", "nonprofit", "volontär",
    "frivillig", "donation", "donera", "insamling", "crowdfunding",
    "gåva", "bidrag", "stöd", "hjälporganisation", "bistånd",
    "hållbarhet", "miljö", "klimat", "djurskydd", "djurrättigheter",
    "mänskliga rättigheter", "jämställdhet", "integration",
    "medlemsförening", "fackförening", "bostadsrättsförening", "brf",
    "idrottsförening", "scoutkår", "kyrka", "församling", "samfund",
    "trossamfund", "kulturförening", "hembygdsförening", "rotary",
    "lions", "röda korset", "rädda barnen", "stadsmission",
  ],
  music: [
    "musik", "artist", "band", "dj ", "producent", "skivbolag",
    "musikproducent", "låtskrivare", "kompositör", "sångare",
    "sångerska", "musiker", "gitarrist", "trummis", "pianist",
    "basist", "orkester", "ensemble", "kör", "körsång", "rap",
    "hiphop", "hip-hop", "rock", "pop", "jazz", "soul", "rnb",
    "elektronisk musik", "edm", "techno", "house", "klassisk musik",
    "folkmusik", "country", "blues", "metal", "punk", "indie",
    "singer-songwriter", "musikstudio", "inspelningsstudio", "studio",
    "mastering", "mixning", "ljudteknik", "ljudtekniker", "label",
    "skivbolag", "release", "album", "singel", "ep", "vinyl",
    "musikskola", "musiklektion", "pianoundervisning", "gitarrlektion",
    "sångundervisning", "musikterapi", "konsertlokal", "livescen",
    "spelställe", "nattklubb", "klubb", "dansställe", "musikfestival",
  ],
  hotel: [
    "hotell", "boende", "b&b", "stuga", "camping", "vandrarhem",
    "airbnb", "bed and breakfast", "pensionat", "gästhus", "gästhem",
    "resort", "semesterboende", "ferielägenhet", "lägenhet",
    "korttidsboende", "långtidsboende", "hostel", "motell",
    "konferenshotell", "spahotell", "boutiquehotell", "stugby",
    "campingplats", "husvagn", "husbil", "glamping", "friluftsliv",
    "stuguthyrning", "uthyrning", "rum", "rumsbokning", "incheckning",
    "reception", "concierge", "rumsservice", "frukostbuffé",
  ],
  legal: [
    "juridik", "advokat", "jurist", "juridisk", "advokatbyrå",
    "juridisk byrå", "rättshjälp", "avtal", "kontrakt", "tvist",
    "process", "domstol", "skilsmässa", "familjerätt", "arvsrätt",
    "arvskifte", "bouppteckning", "testamente", "bodelning",
    "affärsjuridik", "företagsjuridik", "arbetsrätt", "hyresrätt",
    "fastighetsrätt", "immaterialrätt", "varumärke", "patent",
    "upphovsrätt", "dataskydd", "gdpr", "compliance", "brottmål",
    "straffrätt", "skadestånd", "försäkringsrätt", "konkurs",
    "obestånd", "inkasso", "kronofogden", "skuld", "fordran",
    "medling", "skiljeförfarande", "notarie", "notarius publicus",
  ],
  accounting: [
    "ekonomi", "redovisning", "bokföring", "revisor", "skatt",
    "ekonomibyrå", "redovisningsbyrå", "bokföringsbyrå", "revision",
    "deklaration", "skatteplanering", "skatterådgivning", "moms",
    "lönehantering", "lön", "löneadministration", "fakturering",
    "faktura", "budget", "budgetering", "kassaflöde", "likviditet",
    "årsredovisning", "bokslut", "kvartalsrapport", "controller",
    "cfo", "ekonomichef", "finansiell rådgivning", "investering",
    "förmögenhetsförvaltning", "pension", "försäkring",
    "försäkringsrådgivning", "kapitalförvaltning", "sparande",
    "fondförvaltning", "privatekonomi", "företagsekonomi",
    "ekonomisk planering", "kredithantering",
  ],
  auto: [
    "bil", "motor", "verkstad", "bilhandlare", "garage", "mc ",
    "motorcykel", "bilverkstad", "bilreparation", "billackering",
    "plåtarbete", "bilplåt", "biltvätt", "rekond", "bilrekond",
    "bildäck", "däckbyte", "däckhotell", "bilbesiktning", "besiktning",
    "biluthyrning", "hyrbil", "leasing", "billeasing", "bilförsäljning",
    "begagnade bilar", "nya bilar", "bilimport", "bilauktion",
    "husvagn", "husbil", "båt", "båtmotor", "marin", "marinservice",
    "skoter", "snöskoter", "atv", "fyrhjuling", "moped", "cykel",
    "elcykel", "cykelverkstad", "cykelbud", "transport", "frakt",
    "lastbil", "bud", "budbil", "taxi", "chaufför", "limousine",
    "bärgning", "vägassistans", "trafikskola", "biltillbehör",
  ],
  travel: [
    "resa", "turism", "resor", "resebyrå", "guide", "reseledare",
    "turistbyrå", "turist", "semester", "charterresa", "paketresa",
    "gruppresa", "solresa", "stadsresa", "weekendresa", "kryssning",
    "safari", "äventyr", "äventyrsresa", "vandring", "trekking",
    "backpacking", "rundresa", "flygbiljett", "flyg", "hotellbokning",
    "transfer", "sightseeing", "excursion", "utflykt", "guidning",
    "stadsvandring", "naturupplevelse", "ekoturism", "hållbar turism",
    "lyxresa", "spa-resa", "wellness-resa", "sportresa", "golfresa",
    "skidresa", "dykning", "surfing", "segling", "kanot", "kajak",
    "fiske", "jakt", "vildmark", "camping", "glamping",
    "destinationsbröllop", "bröllopsresa", "smekmånad",
  ],
  food: [
    "mat", "catering", "bageri", "bager", "konditori", "food truck",
    "matkasse", "cateringföretag", "festmat", "buffémat", "lunchcatering",
    "kontorslunch", "måltidsleverans", "matutkörning", "hemkörning",
    "bröd", "bakverk", "tårta", "tårtbeställning", "bröllopstårta",
    "choklad", "chokladpraliner", "konfektyr", "glass", "gelato",
    "deli", "delikatess", "charkuteri", "ost", "ostbutik", "vin",
    "vinhandel", "bryggeri", "mikrobryggeri", "öl", "hantverksöl",
    "destilleri", "gin", "whisky", "livsmedel", "ekologiskt",
    "vegetariskt", "veganskt", "glutenfritt", "allergivänligt",
    "matlagningskurs", "kokbok", "receptsida", "kryddor", "te",
    "tebutik", "kafferosteri", "kaffe", "specialkaffe", "barista",
  ],
  photo: [
    "foto", "fotograf", "video", "film", "media", "produktion",
    "fotografering", "porträtt", "porträttfotograf", "bröllopsfoto",
    "bröllopsfotograf", "eventfoto", "produktfoto", "produktfotograf",
    "matfotograf", "modefotograf", "naturfotograf", "reportagefoto",
    "dokumentärfoto", "pressfotograf", "reklamfoto", "arkitekturfoto",
    "drönarfoto", "drönare", "flygfoto", "videoproduktion",
    "filmproduktion", "reklamfilm", "företagsfilm", "musikvideo",
    "dokumentär", "kortfilm", "animation", "motion graphics",
    "redigering", "klippning", "videoredigering", "färgkorrigering",
    "postproduktion", "streaming", "livestreaming", "livesändning",
    "webbsändning", "studio", "fotostudio", "filmstudio",
    "kameraman", "videograf", "fotoutställning", "tryck", "print",
    "fotobok", "canvas", "poster", "bildbank", "stockfoto",
  ],
  business: [
    "företag", "tjänst", "firma", "bolag", "aktiebolag", "ab",
    "enskild firma", "handelsbolag", "kommanditbolag", "egenföretagare",
    "småföretag", "småföretagare", "industri", "tillverkning",
    "produktion", "fabrik", "grossist", "distributör", "import",
    "export", "logistik", "supply chain", "lager", "magasin",
    "fastighet", "fastighetsbolag", "fastighetsmäklare", "mäklare",
    "mäklarfirma", "fastighetsförvaltning", "förvaltning",
    "kontorshotell", "coworking", "kontorsplats", "affärsidé",
    "franchise", "licensgivare", "agentur", "representant",
  ],
};

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
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 2).map((m) => m.id);
}

function extractOffer(prompt: string): string {
  return prompt
    .replace(/\n\nBefintlig sajt:.*$/s, "")
    .trim();
}

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

  const [answers, setAnswers] = useState<WizardAnswers>(() => ({
    siteType: inferredLabels,
    offer: promptOffer,
    existingSite: initialExistingUrl ?? "",
    businessDetails: { ...EMPTY_BUSINESS_DETAILS },
    brandIdentity: { ...EMPTY_BRAND_IDENTITY },
    servicesProducts: { ...EMPTY_SERVICES_PRODUCTS },
    goal: [],
    audience: [],
    mustHave: [],
    categorySpecific: {},
  }));
  const autoScrapedRef = useRef(false);
  const [scraping, setScraping] = useState(false);
  const scrapeAbortRef = useRef(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyScrapeToBusiness = useCallback((data: WizardScrapeData) => {
    setAnswers((prev) => {
      const next = { ...prev };

      // Auto-fill offer from meta description only when empty/default
      if (data.metaDescription && prev.offer.trim().length < 3) {
        next.offer = data.metaDescription;
      }

      next.businessDetails = {
        companyName: data.title || prev.businessDetails.companyName,
        orgNr: data.orgNr || prev.businessDetails.orgNr,
        phone: data.phone || prev.businessDetails.phone,
        email: data.email || prev.businessDetails.email,
        address: data.address || prev.businessDetails.address,
        openingHours: data.openingHours || prev.businessDetails.openingHours,
        socialLinks: data.socialLinks?.length ? data.socialLinks : prev.businessDetails.socialLinks,
        brandColors: data.brandColors?.length ? data.brandColors : prev.businessDetails.brandColors,
      };

      const matchedTone = data.tone
        ? TONE_OPTIONS.find((t) => data.tone!.toLowerCase().includes(t.toLowerCase().split(" ")[0]))
        : undefined;

      next.brandIdentity = {
        tagline: data.tagline || prev.brandIdentity.tagline,
        tone: matchedTone || prev.brandIdentity.tone,
        heroImagePreference: prev.brandIdentity.heroImagePreference,
        fontPreference: prev.brandIdentity.fontPreference,
      };

      next.servicesProducts = {
        services: data.services?.length ? data.services : prev.servicesProducts.services,
        uniqueSellingPoints: data.uniqueSellingPoints?.length ? data.uniqueSellingPoints : prev.servicesProducts.uniqueSellingPoints,
        callToAction: data.callToAction || prev.servicesProducts.callToAction,
        testimonials: data.testimonials?.length ? data.testimonials.join("\n\n") : prev.servicesProducts.testimonials,
      };

      // Auto-fill category-specific data from scrape
      const cs: Record<string, string | string[] | boolean> = { ...prev.categorySpecific };
      if (data.menuItems?.length) cs.menuItems = JSON.stringify(data.menuItems);
      if (data.cuisine) cs.cuisine = data.cuisine;
      if (data.acceptsReservations != null) cs.acceptsReservations = data.acceptsReservations;
      if (data.treatments?.length) cs.treatments = JSON.stringify(data.treatments);
      if (data.products?.length) cs.products = JSON.stringify(data.products);
      if (data.teamMembers?.length) cs.teamMembers = JSON.stringify(data.teamMembers);
      if (data.priceRange) cs.priceRange = data.priceRange;
      next.categorySpecific = cs;

      const autoMustHaves: string[] = ["Startsida / Hero", "Kontaktformulär"];
      if (data.menuItems?.length) autoMustHaves.push("Meny / Matsedel");
      if (data.teamMembers?.length) autoMustHaves.push("Vårt team");
      if (data.acceptsReservations) autoMustHaves.push("Bokning online");
      if (data.services?.length) autoMustHaves.push("Priser och paket");
      if (data.testimonials?.length) autoMustHaves.push("Kundrecensioner");
      if (prev.mustHave.length === 0) {
        next.mustHave = [...new Set(autoMustHaves)];
      } else {
        next.mustHave = [...new Set([...prev.mustHave, ...autoMustHaves])];
      }

      if (prev.goal.length === 0) {
        const autoGoals: string[] = ["Få fler kunder"];
        if (data.callToAction?.toLowerCase().includes("boka")) autoGoals.push("Boka tid / möten");
        if (data.callToAction?.toLowerCase().includes("offert")) autoGoals.push("Samla leads / offertförfrågningar");
        next.goal = autoGoals;
      }

      if (prev.audience.length === 0) {
        next.audience = data.industries?.some((i) => /b2b|konsult|företag/i.test(i))
          ? ["Företag / B2B"]
          : ["Lokala kunder"];
      }

      return next;
    });
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!initialExistingUrl || autoScrapedRef.current || !onScrapeUrl) return;
    autoScrapedRef.current = true;
    scrapeAbortRef.current = false;
    const url = initialExistingUrl.startsWith("http") ? initialExistingUrl : `https://${initialExistingUrl}`;
    setScraping(true);
    void onScrapeUrl(url).then((data) => {
      if (data && !scrapeAbortRef.current) applyScrapeToBusiness(data);
    }).finally(() => {
      if (!scrapeAbortRef.current) setScraping(false);
    });
  }, [initialExistingUrl, onScrapeUrl, applyScrapeToBusiness]);

  const steps = buildStepList(answers);
  const totalSteps = steps.length;
  const step = steps[currentStep];
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;

  const canContinue = useCallback(() => {
    if (!step) return false;
    switch (step) {
      case "siteType": return answers.siteType.length > 0;
      case "offer": return answers.offer.trim().length >= 3;
      case "existingSite": return true;
      case "businessDetails": return true;
      case "brandIdentity": return true;
      case "servicesProducts": return true;
      case "categorySpecific": return true;
      case "goal": return answers.goal.length > 0;
      case "audience": return answers.audience.length > 0;
      case "mustHave": return answers.mustHave.length > 0;
    }
  }, [step, answers]);

  const normalizeUrl = useCallback((raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[a-z0-9][\w.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
    return null;
  }, []);

  const handleScrape = useCallback(async (url: string) => {
    if (!onScrapeUrl || scraping) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    scrapeAbortRef.current = false;
    setScraping(true);
    try {
      const data = await onScrapeUrl(normalized);
      if (data && !scrapeAbortRef.current) {
        applyScrapeToBusiness(data);
        const filled: string[] = [];
        if (data.title) filled.push("företagsnamn");
        if (data.phone || data.email) filled.push("kontaktuppgifter");
        if (data.services?.length) filled.push("tjänster");
        if (data.tagline) filled.push("tagline");
        if (data.brandColors?.length) filled.push("färgpalett");
        if (data.socialLinks?.length) filled.push("sociala medier");
        if (filled.length > 0) {
          toast.success(`Hämtade ${filled.length} uppgifter`, { description: filled.join(", ") });
        } else {
          toast("Kunde inte hämta tillräckligt med data. Fyll i fälten manuellt.");
        }
      } else if (!scrapeAbortRef.current) {
        toast.error("Kunde inte analysera sajten. Kontrollera URL:en och försök igen.");
      }
    } catch {
      if (!scrapeAbortRef.current) {
        toast.error("Något gick fel vid analys av sajten.");
      }
    } finally {
      setScraping(false);
    }
  }, [onScrapeUrl, scraping, applyScrapeToBusiness, normalizeUrl]);

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      if (step === "existingSite" && answers.existingSite.trim() && !scraping) {
        const normalized = normalizeUrl(answers.existingSite);
        if (normalized && onScrapeUrl) {
          setAnswers((p) => ({ ...p, existingSite: normalized }));
          handleScrape(normalized);
        }
      }
      setDirection("forward");
      setCurrentStep((s) => s + 1);
    } else {
      const fieldMessages: IntakeWizardResult["fieldMessages"] = [];
      if (answers.siteType.length) fieldMessages.push({ field: "siteType", text: answers.siteType.join(", ") });
      if (answers.offer.trim()) fieldMessages.push({ field: "offer", text: answers.offer.trim() });
      if (answers.existingSite.trim()) fieldMessages.push({ field: "existingSite", text: answers.existingSite.trim() });
      else fieldMessages.push({ field: "existingSite", text: "Börja från noll" });
      const bd = answers.businessDetails;
      const bdParts: string[] = [];
      if (bd.companyName) bdParts.push(`Företag: ${bd.companyName}`);
      if (bd.orgNr) bdParts.push(`Org.nr: ${bd.orgNr}`);
      if (bd.phone) bdParts.push(`Tel: ${bd.phone}`);
      if (bd.email) bdParts.push(`E-post: ${bd.email}`);
      if (bd.address) bdParts.push(`Adress: ${bd.address}`);
      if (bd.openingHours) bdParts.push(`Öppettider: ${bd.openingHours}`);
      if (bd.socialLinks.length) bdParts.push(`Sociala medier: ${bd.socialLinks.join(", ")}`);
      if (bd.brandColors.length) bdParts.push(`Färger: ${bd.brandColors.join(", ")}`);
      if (bdParts.length) fieldMessages.push({ field: "businessDetails" as NeedsAnalysisField, text: bdParts.join("\n") });

      const bi = answers.brandIdentity;
      const biParts: string[] = [];
      if (bi.tagline) biParts.push(`Tagline: ${bi.tagline}`);
      if (bi.tone) biParts.push(`Ton: ${bi.tone}`);
      if (bi.heroImagePreference) biParts.push(`Hero-bild: ${bi.heroImagePreference}`);
      if (bi.fontPreference) biParts.push(`Typsnitt: ${bi.fontPreference}`);
      if (biParts.length) fieldMessages.push({ field: "brandIdentity" as NeedsAnalysisField, text: biParts.join("\n") });

      const sp = answers.servicesProducts;
      const spParts: string[] = [];
      if (sp.services.length) spParts.push(`Tjänster: ${sp.services.join(", ")}`);
      if (sp.uniqueSellingPoints.length) spParts.push(`USP: ${sp.uniqueSellingPoints.join(", ")}`);
      if (sp.callToAction) spParts.push(`CTA: ${sp.callToAction}`);
      if (sp.testimonials.trim()) spParts.push(`Omdömen: ${sp.testimonials.trim()}`);
      if (spParts.length) fieldMessages.push({ field: "servicesProducts" as NeedsAnalysisField, text: spParts.join("\n") });

      if (answers.goal.length) fieldMessages.push({ field: "goal", text: answers.goal.join(", ") });
      if (answers.audience.length) fieldMessages.push({ field: "audience", text: answers.audience.join(", ") });
      if (answers.mustHave.length) fieldMessages.push({ field: "mustHave", text: answers.mustHave.join(", ") });

      const cs = answers.categorySpecific;
      if (Object.keys(cs).length > 0) {
        const csParts: string[] = [];
        const extraConfig = resolveExtraStep(answers.siteType);
        for (const [key, value] of Object.entries(cs)) {
          if (value === false || value === "" || (Array.isArray(value) && value.length === 0)) continue;
          const fieldDef = extraConfig?.fields.find((f) => f.key === key);
          const label = fieldDef?.label ?? key;
          if (typeof value === "boolean") {
            csParts.push(`${label}: Ja`);
          } else if (Array.isArray(value)) {
            csParts.push(`${label}: ${value.join(", ")}`);
          } else {
            csParts.push(`${label}: ${value}`);
          }
        }
        if (csParts.length) {
          fieldMessages.push({ field: "categorySpecific" as NeedsAnalysisField, text: csParts.join("\n") });
        }
      }

      onComplete({ answers, fieldMessages });
    }
  }, [currentStep, totalSteps, answers, onComplete, step, scraping, normalizeUrl, onScrapeUrl, handleScrape]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection("back");
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleSkipScrape = useCallback(() => {
    scrapeAbortRef.current = true;
    setScraping(false);
  }, []);

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
      if (!res.ok) { toast.error("Kunde inte hämta förslag."); return; }
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        setAnswers((prev) => ({
          ...prev,
          mustHave: [...new Set([...prev.mustHave, ...data.suggestions])],
        }));
      }
    } catch { toast.error("Något gick fel."); }
    finally { setSuggesting(false); }
  }, [suggesting, suggestContext, answers.siteType, answers.offer]);

  const toggleChip = useCallback((field: "siteType" | "goal" | "audience" | "mustHave", value: string) => {
    setAnswers((prev) => {
      const arr = prev[field];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
  }, []);

  const mustHaveAutoSuggestedRef = useRef(false);

  useEffect(() => {
    if (step === "offer" && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
    if (step === "mustHave" && !mustHaveAutoSuggestedRef.current) {
      mustHaveAutoSuggestedRef.current = true;
      void handleSuggestMustHaves();
    }
  }, [step, handleSuggestMustHaves]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mounted && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Intake-guiden">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "min(85vh, 700px)" }}
      >
        {/* ── Progress bar ───────────────────────────────────── */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Steg {currentStep + 1} av {totalSteps}
            </p>
            <h2 className="text-xl font-semibold text-foreground">
              {step === "categorySpecific"
                ? (resolveExtraStep(answers.siteType)?.stepTitle ?? STEP_TITLES.categorySpecific)
                : step ? STEP_TITLES[step] : ""}
            </h2>
            {step === "siteType" && inferredLabels.length > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary/70">
                <Sparkles className="h-3 w-3" />
                Föreslaget baserat på din beskrivning
              </p>
            )}
          </div>
          {currentStep > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Tillbaka
            </button>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {step === "siteType" && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((cat) => {
                const selected = answers.siteType.includes(cat.label);
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleChip("siteType", cat.label)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{cat.label}</span>
                    {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {step === "offer" && (
            <textarea
              ref={textareaRef}
              value={answers.offer}
              onChange={(e) => setAnswers((p) => ({ ...p, offer: e.target.value }))}
              placeholder="T.ex. Vi driver en frisörsalong i Göteborg med fokus på färgning och klippning..."
              className="min-h-[140px] w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          )}

          {step === "existingSite" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ange din nuvarande hemsida så hämtar vi information automatiskt och fyller i fälten åt dig.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="url"
                    value={answers.existingSite}
                    onChange={(e) => setAnswers((p) => ({ ...p, existingSite: e.target.value }))}
                    placeholder="www.dinhemsida.se"
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScrape(answers.existingSite);
                      }
                    }}
                  />
                  {scraping && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-primary" />}
                </div>
                <button
                  type="button"
                  disabled={scraping || !answers.existingSite.trim()}
                  onClick={() => handleScrape(answers.existingSite)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                    scraping || !answers.existingSite.trim()
                      ? "cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  Analysera
                </button>
              </div>
              {scraping && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Analyserar sajten och hämtar uppgifter... du kan klicka Nästa så fylls fälten i medan du fortsätter.</span>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setAnswers((p) => ({ ...p, existingSite: "" }));
                  goNext();
                }}
                className="rounded-lg border border-border/60 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                Börja från noll
              </button>
            </div>
          )}

          {step === "businessDetails" && (
            <BusinessDetailsStep
              details={answers.businessDetails}
              onChange={(bd) => setAnswers((prev) => ({ ...prev, businessDetails: bd }))}
              scraping={scraping}
              onSkipScrape={handleSkipScrape}
            />
          )}

          {step === "brandIdentity" && (
            <BrandIdentityStep
              data={answers.brandIdentity}
              onChange={(bi) => setAnswers((prev) => ({ ...prev, brandIdentity: bi }))}
            />
          )}

          {step === "servicesProducts" && (
            <ServicesProductsStep
              data={answers.servicesProducts}
              onChange={(sp) => setAnswers((prev) => ({ ...prev, servicesProducts: sp }))}
            />
          )}

          {step === "categorySpecific" && (
            <CategorySpecificStep
              config={resolveExtraStep(answers.siteType)}
              data={answers.categorySpecific}
              onChange={(cs) => setAnswers((prev) => ({ ...prev, categorySpecific: cs }))}
            />
          )}

          {step === "goal" && (
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((opt) => {
                const selected = answers.goal.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleChip("goal", opt)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-all",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}
                  >
                    {opt}
                    {selected && <Check className="ml-1.5 inline h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {step === "audience" && (
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((opt) => {
                const selected = answers.audience.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleChip("audience", opt)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-all",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}
                  >
                    {opt}
                    {selected && <Check className="ml-1.5 inline h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {step === "mustHave" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {MUST_HAVE_OPTIONS.map((opt) => {
                  const selected = answers.mustHave.includes(opt);
                  const isSuggested = aiSuggestions.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleChip("mustHave", opt)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                        selected
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
                        isSuggested && !selected && "border-primary/30",
                      )}
                    >
                      {opt}
                      {selected && <Check className="ml-1 inline h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleSuggestMustHaves}
                disabled={suggesting}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {suggesting ? "Hämtar förslag..." : "AI-förslag baserat på din beskrivning"}
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border/30 px-8 py-4">
          {step !== "existingSite" && step !== "siteType" && step !== "offer" && step !== undefined ? (
            <button
              type="button"
              onClick={() => {
                setDirection("forward");
                setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <SkipForward className="h-3 w-3" />
              Hoppa över
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue()}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium transition-all",
              canContinue()
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {currentStep === totalSteps - 1 ? "Bygg min sajt" : "Fortsätt"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Helper: build dynamic step list ──────────────────────────────── */

function resolveExtraStep(siteTypeLabels: string[]): CategoryExtraConfig | null {
  for (const label of siteTypeLabels) {
    const cat = CATEGORIES.find((c) => c.label === label);
    if (cat && CATEGORY_EXTRA_FIELDS[cat.id]) return CATEGORY_EXTRA_FIELDS[cat.id];
  }
  return null;
}

function buildStepList(answers: WizardAnswers): StepId[] {
  const core: StepId[] = ["siteType", "offer", "existingSite", "businessDetails", "brandIdentity", "servicesProducts"];
  if (resolveExtraStep(answers.siteType)) core.push("categorySpecific");
  const offerIsVague = answers.offer.trim().split(/\s+/).length < 10;
  if (offerIsVague) core.push("goal");
  if (offerIsVague) core.push("audience");
  core.push("mustHave");
  return core;
}

/* ── CategorySpecificStep sub-component ───────────────────────────── */

function CategorySpecificStep({
  config,
  data,
  onChange,
}: {
  config: CategoryExtraConfig | null;
  data: Record<string, string | string[] | boolean>;
  onChange: (d: Record<string, string | string[] | boolean>) => void;
}) {
  if (!config) return <p className="text-sm text-muted-foreground">Inga branschspecifika fält för denna kategori.</p>;

  const set = (key: string, value: string | string[] | boolean) =>
    onChange({ ...data, [key]: value });

  const toggleTag = (key: string, value: string) => {
    const current = Array.isArray(data[key]) ? (data[key] as string[]) : [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    set(key, next);
  };

  return (
    <div className="space-y-5">
      {config.fields.map((field) => (
        <div key={field.key}>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {field.label}
          </label>

          {field.type === "text" && (
            <input
              type="text"
              value={typeof data[field.key] === "string" ? (data[field.key] as string) : ""}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          )}

          {field.type === "tags" && (
            <TagInput
              values={Array.isArray(data[field.key]) ? (data[field.key] as string[]) : []}
              onChange={(vals) => set(field.key, vals)}
              placeholder={field.placeholder}
            />
          )}

          {field.type === "chips" && field.options && (
            <div className="flex flex-wrap gap-2">
              {field.options.map((opt) => {
                const selected = Array.isArray(data[field.key])
                  ? (data[field.key] as string[]).includes(opt)
                  : data[field.key] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleTag(field.key, opt)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}
                  >
                    {opt}
                    {selected && <Check className="ml-1 inline h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}

          {field.type === "select" && field.options && (
            <div className="flex flex-wrap gap-2">
              {field.options.map((opt) => {
                const selected = data[field.key] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(field.key, selected ? "" : opt)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                      selected
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}
                  >
                    {opt}
                    {selected && <Check className="ml-1 inline h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}

          {field.type === "toggle" && (
            <button
              type="button"
              onClick={() => set(field.key, !data[field.key])}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                data[field.key] ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  data[field.key] ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── TagInput helper ──────────────────────────────────────────────── */

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "," && input.trim()) { e.preventDefault(); add(); }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="ml-0.5 text-primary/50 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ScrapeProgressView ────────────────────────────────────────────── */

const SCRAPE_STEPS = [
  { label: "Hämtar hemsidan", duration: 4_000 },
  { label: "Analyserar innehåll", duration: 6_000 },
  { label: "Söker företagsinfo", duration: 5_000 },
  { label: "Hämtar sociala medier", duration: 4_000 },
  { label: "AI sammanfattar", duration: 12_000 },
  { label: "Fyller i fälten", duration: 2_000 },
];

function ScrapeProgressView({ onSkipScrape }: { onSkipScrape?: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const totalDuration = SCRAPE_STEPS.reduce((s, step) => s + step.duration, 0);
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / totalDuration) * 100, 95);
      setProgress(pct);

      let cumulative = 0;
      for (let i = 0; i < SCRAPE_STEPS.length; i++) {
        cumulative += SCRAPE_STEPS[i].duration;
        if (elapsed < cumulative) {
          setActiveIdx(i);
          break;
        }
        if (i === SCRAPE_STEPS.length - 1) setActiveIdx(i);
      }
    };
    const id = setInterval(tick, 200);
    tick();
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-5 py-8">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <Globe className="h-6 w-6 text-primary/60" />
      </div>

      <div className="w-full max-w-xs">
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="space-y-1.5">
          {SCRAPE_STEPS.map((step, i) => (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors duration-300",
                i < activeIdx ? "text-primary" : i === activeIdx ? "text-foreground font-medium" : "text-muted-foreground/40",
              )}
            >
              {i < activeIdx ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : i === activeIdx ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <div className="h-3 w-3 shrink-0" />
              )}
              {step.label}
            </div>
          ))}
        </div>
      </div>

      {onSkipScrape && (
        <button
          type="button"
          onClick={onSkipScrape}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SkipForward className="h-3 w-3" />
          Hoppa över — fyll i manuellt
        </button>
      )}
    </div>
  );
}

/* ── BusinessDetailsStep sub-component ─────────────────────────────── */

const FIELD_CLASS =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

function BusinessDetailsStep({
  details,
  onChange,
  scraping,
  onSkipScrape,
}: {
  details: BusinessDetails;
  onChange: (d: BusinessDetails) => void;
  scraping: boolean;
  onSkipScrape?: () => void;
}) {
  const set = (field: keyof BusinessDetails, value: string) =>
    onChange({ ...details, [field]: value });

  const addSocialLink = () =>
    onChange({ ...details, socialLinks: [...details.socialLinks, ""] });
  const removeSocialLink = (idx: number) =>
    onChange({ ...details, socialLinks: details.socialLinks.filter((_, i) => i !== idx) });
  const updateSocialLink = (idx: number, val: string) =>
    onChange({ ...details, socialLinks: details.socialLinks.map((v, i) => (i === idx ? val : v)) });

  const addColor = () =>
    onChange({ ...details, brandColors: [...details.brandColors, "#"] });
  const removeColor = (idx: number) =>
    onChange({ ...details, brandColors: details.brandColors.filter((_, i) => i !== idx) });
  const updateColor = (idx: number, val: string) =>
    onChange({ ...details, brandColors: details.brandColors.map((v, i) => (i === idx ? val : v)) });

  if (scraping) {
    return <ScrapeProgressView onSkipScrape={onSkipScrape} />;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Fyll i det du kan — dessa uppgifter används direkt på din sajt.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Företagsnamn</label>
          <input
            type="text"
            value={details.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            placeholder="Mitt Företag AB"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Org.nr (valfritt)</label>
          <input
            type="text"
            value={details.orgNr}
            onChange={(e) => set("orgNr", e.target.value)}
            placeholder="556123-4567"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefon</label>
          <input
            type="tel"
            value={details.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="070-123 45 67"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">E-post</label>
          <input
            type="email"
            value={details.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="info@mittforetag.se"
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Adress</label>
          <input
            type="text"
            value={details.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Storgatan 1, 123 45 Stad"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Öppettider (valfritt)</label>
        <input
          type="text"
          value={details.openingHours}
          onChange={(e) => set("openingHours", e.target.value)}
          placeholder="Mån–Fre 09–17, Lör 10–14"
          className={FIELD_CLASS}
        />
      </div>

      {/* Social links */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Sociala medier (valfritt)</label>
        <div className="space-y-2">
          {details.socialLinks.map((link, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="url"
                value={link}
                onChange={(e) => updateSocialLink(idx, e.target.value)}
                placeholder="https://instagram.com/mittforetag"
                className={cn(FIELD_CLASS, "flex-1")}
              />
              <button
                type="button"
                onClick={() => removeSocialLink(idx)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSocialLink}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <Plus className="h-3 w-3" /> Lägg till länk
          </button>
        </div>
      </div>

      {/* Brand colors */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Profilfärger (valfritt)</label>
        <div className="space-y-2">
          {details.brandColors.map((color, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="color"
                value={color.startsWith("#") && color.length === 7 ? color : "#000000"}
                onChange={(e) => updateColor(idx, e.target.value)}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => updateColor(idx, e.target.value)}
                placeholder="#FF6600"
                className={cn(FIELD_CLASS, "flex-1")}
              />
              <button
                type="button"
                onClick={() => removeColor(idx)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addColor}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <Plus className="h-3 w-3" /> Lägg till färg
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── BrandIdentityStep sub-component ────────────────────────────────── */

function BrandIdentityStep({
  data,
  onChange,
}: {
  data: BrandIdentityData;
  onChange: (d: BrandIdentityData) => void;
}) {
  const set = (field: keyof BrandIdentityData, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Beskriv hur ditt varumärke ska uppfattas — detta styr design och tonalitet.
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Tagline / slogan (valfritt)</label>
        <input
          type="text"
          value={data.tagline}
          onChange={(e) => set("tagline", e.target.value)}
          placeholder="T.ex. Vi gör det enkelt att växa"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Ton och stil</label>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set("tone", data.tone === opt ? "" : opt)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                data.tone === opt
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
              )}
            >
              {opt}
              {data.tone === opt && <Check className="ml-1 inline h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Hero-bild</label>
        <div className="flex flex-wrap gap-2">
          {HERO_IMAGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set("heroImagePreference", data.heroImagePreference === opt ? "" : opt)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                data.heroImagePreference === opt
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
              )}
            >
              {opt}
              {data.heroImagePreference === opt && <Check className="ml-1 inline h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Typsnitt</label>
        <div className="flex flex-wrap gap-2">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set("fontPreference", data.fontPreference === opt ? "" : opt)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                data.fontPreference === opt
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
              )}
            >
              {opt}
              {data.fontPreference === opt && <Check className="ml-1 inline h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ── ServicesProductsStep sub-component ─────────────────────────────── */

function ServicesProductsStep({
  data,
  onChange,
}: {
  data: ServicesProductsData;
  onChange: (d: ServicesProductsData) => void;
}) {
  const [serviceInput, setServiceInput] = useState("");
  const [uspInput, setUspInput] = useState("");

  const addService = () => {
    const val = serviceInput.trim();
    if (val && data.services.length < 8 && !data.services.includes(val)) {
      onChange({ ...data, services: [...data.services, val] });
      setServiceInput("");
    }
  };

  const removeService = (idx: number) =>
    onChange({ ...data, services: data.services.filter((_, i) => i !== idx) });

  const addUsp = () => {
    const val = uspInput.trim();
    if (val && data.uniqueSellingPoints.length < 4 && !data.uniqueSellingPoints.includes(val)) {
      onChange({ ...data, uniqueSellingPoints: [...data.uniqueSellingPoints, val] });
      setUspInput("");
    }
  };

  const removeUsp = (idx: number) =>
    onChange({ ...data, uniqueSellingPoints: data.uniqueSellingPoints.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Beskriv vad du erbjuder — dessa hamnar på din sajt som sektioner och innehåll.
      </p>

      {/* Services tag list */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Tjänster / produkter (max 8)
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {data.services.map((s, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm text-primary"
            >
              {s}
              <button type="button" onClick={() => removeService(idx)} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {data.services.length < 8 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={serviceInput}
              onChange={(e) => setServiceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addService(); } }}
              placeholder="T.ex. Klippning, Färgning, Slingor..."
              className={cn(FIELD_CLASS, "flex-1")}
            />
            <button
              type="button"
              onClick={addService}
              disabled={!serviceInput.trim()}
              className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* USPs tag list */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Styrkor / USP (max 4)
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {data.uniqueSellingPoints.map((u, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-sm text-primary"
            >
              {u}
              <button type="button" onClick={() => removeUsp(idx)} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        {data.uniqueSellingPoints.length < 4 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={uspInput}
              onChange={(e) => setUspInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUsp(); } }}
              placeholder="T.ex. 20 års erfarenhet, Gratis offert..."
              className={cn(FIELD_CLASS, "flex-1")}
            />
            <button
              type="button"
              onClick={addUsp}
              disabled={!uspInput.trim()}
              className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* CTA */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Primär CTA-knapp</label>
        <div className="flex flex-wrap gap-2">
          {CTA_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange({ ...data, callToAction: data.callToAction === opt ? "" : opt })}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                data.callToAction === opt
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
              )}
            >
              {opt}
              {data.callToAction === opt && <Check className="ml-1 inline h-3 w-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Kundomdömen (valfritt)</label>
        <textarea
          value={data.testimonials}
          onChange={(e) => onChange({ ...data, testimonials: e.target.value })}
          placeholder={"\"Bästa frisören i stan!\" – Anna S.\n\"Proffsigt och snabbt.\" – Erik L."}
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>
    </div>
  );
}
