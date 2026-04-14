"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ArrowRight,
  Building2,
  ShoppingBag,
  Camera,
  UtensilsCrossed,
  FileText,
  BookOpen,
  Briefcase,
  Laptop,
  Heart,
  Home,
  Scissors,
  Hammer,
  GraduationCap,
  Calendar,
  Users,
  Music,
  Scale,
  Calculator,
  Car,
  Plane,
  Film,
  Globe,
  Loader2,
  SkipForward,
  Check,
  Sparkles,
  Plus,
  X,
  Trash2,
  ImagePlus,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NeedsAnalysisField } from "@/lib/builder/needs-analysis";

/* ── Types ───────────────────────────────────────────────────────── */

type StepId = "siteType" | "businessInfo" | "content" | "design" | "pages";

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

interface WizardAnswers {
  siteType: string[];
  companyName: string;
  offer: string;
  existingSite: string;
  phone: string;
  email: string;
  address: string;

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
}

/* ── Exported types (backward compat with BuilderShellContent) ─── */

export interface IntakeWizardResult {
  answers: WizardAnswers;
  fieldMessages: Array<{ field: NeedsAnalysisField; text: string }>;
  mediaFiles?: Array<{ file: File; context: string }>;
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

/* ── Site-type categories (full set) ─────────────────────────────── */

type CategoryItem = { id: string; label: string; icon: LucideIcon };

const CATEGORIES: CategoryItem[] = [
  { id: "business", label: "Företag / Tjänster", icon: Building2 },
  { id: "ecommerce", label: "Webshop / E-handel", icon: ShoppingBag },
  { id: "restaurant", label: "Restaurang / Café", icon: UtensilsCrossed },
  { id: "portfolio", label: "Portfolio / CV", icon: Camera },
  { id: "landing", label: "Landningssida", icon: FileText },
  { id: "blog", label: "Blogg / Magasin", icon: BookOpen },
  { id: "consulting", label: "Konsult / Byrå", icon: Briefcase },
  { id: "tech", label: "Tech / Startup", icon: Laptop },
  { id: "healthcare", label: "Vård / Klinik", icon: Heart },
  { id: "realestate", label: "Fastighet / Mäklare", icon: Home },
  { id: "salon", label: "Salong / Skönhet", icon: Scissors },
  { id: "fitness", label: "Gym / Tränare", icon: Users },
  { id: "construction", label: "Bygg / Hantverk", icon: Hammer },
  { id: "education", label: "Utbildning / Skola", icon: GraduationCap },
  { id: "event", label: "Event / Bröllop", icon: Calendar },
  { id: "nonprofit", label: "Förening / Ideell", icon: Heart },
  { id: "music", label: "Musik / Artist", icon: Music },
  { id: "hotel", label: "Hotell / Boende", icon: Home },
  { id: "legal", label: "Juridik / Advokat", icon: Scale },
  { id: "accounting", label: "Ekonomi / Redovisning", icon: Calculator },
  { id: "auto", label: "Bil / Motor", icon: Car },
  { id: "travel", label: "Resa / Turism", icon: Plane },
  { id: "food", label: "Mat / Catering", icon: UtensilsCrossed },
  { id: "photo", label: "Foto / Video", icon: Film },
  { id: "other", label: "Annat", icon: Sparkles },
];

/* ── Options ─────────────────────────────────────────────────────── */

const TONE_OPTIONS = ["Professionell", "Varm och personlig", "Lekfull", "Exklusiv / lyxig", "Rak och enkel"];
const DESIGN_STYLE_OPTIONS = ["Minimalistisk", "Kraftfull", "Elegant", "Lekfull och färgglad", "Låt AI:n välja"];

const GOAL_OPTIONS = [
  "Få fler kunder",
  "Sälja produkter online",
  "Bygga förtroende",
  "Samla leads / offertförfrågningar",
  "Öka lokal synlighet",
  "Visa upp portfolio",
  "Boka tid / möten",
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

const CUISINE_OPTIONS = ["Svenskt", "Italienskt", "Asiatiskt", "Franskt", "Amerikanskt", "Fusion", "Vegetariskt", "Annat"];
const PAYMENT_OPTIONS = ["Swish", "Kort", "Klarna", "Faktura", "PayPal"];
const PRICE_RANGE_OPTIONS = ["Budget", "Mellan", "Premium"];
const MENU_CATEGORY_OPTIONS = ["Förrätter", "Varmrätter", "Desserter", "Drycker", "Övrigt"];
const PRODUCT_CATEGORY_OPTIONS = ["Populärt", "Nyhet", "Rea", "Övrigt"];

/* ── Category inference from text ────────────────────────────────── */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurant: [
    "restaurang", "café", "cafe", "kafé", "bar", "pub", "pizzeria",
    "sushi", "bistro", "krog", "matställe", "lunch", "middag", "brunch",
    "fine dining", "gastropub", "tapas", "burger", "kebab", "falafel",
  ],
  ecommerce: [
    "webshop", "e-handel", "nätbutik", "sälj", "produkter online",
    "butik online", "webbshop", "shop", "näthandel", "webbutik",
    "e-commerce", "onlinebutik", "handla online", "varukorg",
  ],
  salon: [
    "salong", "frisör", "frisörsalong", "skönhet", "naglar", "hudvård",
    "spa", "hår", "barber", "makeup", "sminkning", "hårsalong",
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
  return prompt.replace(/\n\nBefintlig sajt:.*$/s, "").trim();
}

/* ── Branch detection helpers ────────────────────────────────────── */

type ContentBranch = "ecommerce" | "restaurant" | "salon" | "portfolio" | "business" | "minimal";

function resolveContentBranch(siteTypeLabels: string[]): ContentBranch {
  for (const label of siteTypeLabels) {
    const cat = CATEGORIES.find((c) => c.label === label);
    if (!cat) continue;
    if (cat.id === "ecommerce") return "ecommerce";
    if (cat.id === "restaurant" || cat.id === "food") return "restaurant";
    if (cat.id === "salon" || cat.id === "healthcare" || cat.id === "fitness") return "salon";
    if (cat.id === "portfolio" || cat.id === "photo" || cat.id === "music") return "portfolio";
    if (cat.id === "blog" || cat.id === "landing" || cat.id === "other") return "minimal";
  }
  return "business";
}

function contentBranchTitle(branch: ContentBranch): string {
  switch (branch) {
    case "ecommerce": return "Dina produkter";
    case "restaurant": return "Meny och mat";
    case "salon": return "Behandlingar och team";
    case "portfolio": return "Projekt och kompetenser";
    case "business": return "Tjänster och erbjudande";
    case "minimal": return "Ditt innehåll";
  }
}

/* ── Empty state ─────────────────────────────────────────────────── */

function emptyAnswers(promptOffer: string, inferredLabels: string[], initialUrl: string): WizardAnswers {
  return {
    siteType: inferredLabels,
    companyName: "",
    offer: promptOffer,
    existingSite: initialUrl,
    phone: "",
    email: "",
    address: "",
    products: [],
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
    mustHave: [],
    goal: [],
  };
}

/* ── Step definitions ────────────────────────────────────────────── */

const STEP_TITLES: Record<StepId, string> = {
  siteType: "Vad bygger vi?",
  businessInfo: "Om din verksamhet",
  content: "Ditt innehåll",
  design: "Design och stil",
  pages: "Vad ska finnas med?",
};

const FIELD_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors";

const STEP_ICONS: Record<StepId, LucideIcon> = {
  siteType: Sparkles,
  businessInfo: Building2,
  content: FileText,
  design: ImagePlus,
  pages: BookOpen,
};

const STEP_SUBTITLES: Record<StepId, string> = {
  siteType: "Välj den kategori som bäst beskriver din verksamhet",
  businessInfo: "Grundläggande information om ditt företag",
  content: "Det som gör din verksamhet unik",
  design: "Hur ska din sajt se ut och kännas?",
  pages: "Välj vilka sidor och funktioner du vill ha",
};

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
  const scrapeAbortRef = useRef(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const steps: StepId[] = ["siteType", "businessInfo", "content", "design", "pages"];
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
    setAnswers((prev) => {
      const next = { ...prev };
      if (data.metaDescription && prev.offer.trim().length < 3) next.offer = data.metaDescription;
      if (data.title && !prev.companyName) next.companyName = data.title;
      if (data.phone && !prev.phone) next.phone = data.phone;
      if (data.email && !prev.email) next.email = data.email;
      if (data.address && !prev.address) next.address = data.address;
      if (data.brandColors?.length && !prev.brandColors.length) next.brandColors = data.brandColors;
      if (data.tagline && !prev.tagline) next.tagline = data.tagline;

      const matchedTone = data.tone
        ? TONE_OPTIONS.find((t) => data.tone!.toLowerCase().includes(t.toLowerCase().split(" ")[0]))
        : undefined;
      if (matchedTone && !prev.tone) next.tone = matchedTone;

      if (data.services?.length && !prev.services.length) next.services = data.services;
      if (data.uniqueSellingPoints?.length && !prev.uniqueSellingPoints.length) next.uniqueSellingPoints = data.uniqueSellingPoints;
      if (data.testimonials?.length && !prev.testimonials) next.testimonials = data.testimonials.join("\n\n");
      if (data.openingHours && !prev.openingHours) next.openingHours = data.openingHours;
      if (data.cuisine && !prev.cuisine.length) next.cuisine = [data.cuisine];
      if (data.acceptsReservations != null) next.acceptsReservations = data.acceptsReservations;
      if (data.priceRange && !prev.priceRange) next.priceRange = data.priceRange;

      if (data.menuItems?.length && !prev.menuItems.length) {
        next.menuItems = data.menuItems.map((m) => ({
          name: m.name, price: m.price ?? "", description: m.description ?? "", category: "", imagePreview: "",
        }));
      }
      if (data.treatments?.length && !prev.treatments.length) {
        next.treatments = data.treatments.map((t) => ({
          name: t.name, price: t.price ?? "", duration: "",
        }));
      }
      if (data.products?.length && !prev.products.length) {
        next.products = data.products.map((p) => ({
          name: p.name, price: p.price ?? "", description: "", category: "", imagePreview: p.image ?? "",
        }));
      }
      if (data.teamMembers?.length && !prev.teamMembers.length) {
        next.teamMembers = data.teamMembers.map((t) => ({
          name: t.name, role: t.role ?? "",
        }));
      }

      const autoMustHaves: string[] = ["Startsida / Hero", "Kontaktformulär"];
      if (data.menuItems?.length) autoMustHaves.push("Meny / Matsedel");
      if (data.teamMembers?.length) autoMustHaves.push("Vårt team");
      if (data.acceptsReservations) autoMustHaves.push("Bokning online");
      if (data.services?.length) autoMustHaves.push("Priser och paket");
      if (data.testimonials?.length) autoMustHaves.push("Kundrecensioner");
      next.mustHave = [...new Set([...prev.mustHave, ...autoMustHaves])];

      if (!prev.goal.length) {
        const autoGoals: string[] = ["Få fler kunder"];
        if (data.callToAction?.toLowerCase().includes("boka")) autoGoals.push("Boka tid / möten");
        if (data.callToAction?.toLowerCase().includes("offert")) autoGoals.push("Samla leads / offertförfrågningar");
        next.goal = autoGoals;
      }
      return next;
    });
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
        if (filled.length > 0) {
          toast.success(`Hämtade ${filled.length} uppgifter`, { description: filled.join(", ") });
        } else {
          toast("Kunde inte hämta tillräckligt med data. Fyll i fälten manuellt.");
        }
      } else if (!scrapeAbortRef.current) {
        toast.error("Kunde inte analysera sajten.");
      }
    } catch {
      if (!scrapeAbortRef.current) toast.error("Något gick fel vid analys.");
    } finally {
      setScraping(false);
    }
  }, [onScrapeUrl, scraping, applyScrapeToBusiness, normalizeUrl]);

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
  useEffect(() => {
    if (step === "businessInfo" && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
    if (step === "pages" && !mustHaveAutoSuggestedRef.current) {
      mustHaveAutoSuggestedRef.current = true;
      void handleSuggestMustHaves();
    }
  }, [step, handleSuggestMustHaves]);

  /* ── Navigation ──────────────────────────────────────────────── */

  const canContinue = useCallback(() => {
    if (!step) return false;
    switch (step) {
      case "siteType": return answers.siteType.length > 0;
      case "businessInfo": return answers.companyName.trim().length >= 2 && answers.offer.trim().length >= 3;
      case "content": return true;
      case "design": return true;
      case "pages": return answers.mustHave.length > 0;
    }
  }, [step, answers]);

  const toggleChip = useCallback((field: "siteType" | "goal" | "mustHave" | "cuisine" | "paymentMethods", value: string) => {
    setAnswers((prev) => {
      const arr = prev[field] as string[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
  }, []);

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      if (step === "businessInfo" && answers.existingSite.trim() && !scraping) {
        const normalized = normalizeUrl(answers.existingSite);
        if (normalized && onScrapeUrl) {
          setAnswers((p) => ({ ...p, existingSite: normalized }));
          handleScrape(normalized);
        }
      }
      setDirection("forward");
      setCurrentStep((s) => s + 1);
    } else {
      // Build fieldMessages for downstream consumption
      const fieldMessages: IntakeWizardResult["fieldMessages"] = [];
      if (answers.siteType.length) fieldMessages.push({ field: "siteType", text: answers.siteType.join(", ") });
      if (answers.offer.trim()) fieldMessages.push({ field: "offer", text: answers.offer.trim() });
      if (answers.existingSite.trim()) fieldMessages.push({ field: "existingSite", text: answers.existingSite.trim() });
      else fieldMessages.push({ field: "existingSite", text: "Börja från noll" });

      // Business details
      const bdParts: string[] = [];
      if (answers.companyName) bdParts.push(`Företag: ${answers.companyName}`);
      if (answers.phone) bdParts.push(`Tel: ${answers.phone}`);
      if (answers.email) bdParts.push(`E-post: ${answers.email}`);
      if (answers.address) bdParts.push(`Adress: ${answers.address}`);
      if (bdParts.length) fieldMessages.push({ field: "businessDetails" as NeedsAnalysisField, text: bdParts.join("\n") });

      // Brand / design
      const biParts: string[] = [];
      if (answers.tagline) biParts.push(`Tagline: ${answers.tagline}`);
      if (answers.tone) biParts.push(`Ton: ${answers.tone}`);
      if (answers.designStyle) biParts.push(`Designstil: ${answers.designStyle}`);
      if (answers.brandColors.length) biParts.push(`Färger: ${answers.brandColors.join(", ")}`);
      if (biParts.length) fieldMessages.push({ field: "brandIdentity" as NeedsAnalysisField, text: biParts.join("\n") });

      // Services / products content
      const spParts: string[] = [];
      if (answers.services.length) spParts.push(`Tjänster: ${answers.services.join(", ")}`);
      if (answers.uniqueSellingPoints.length) spParts.push(`USP: ${answers.uniqueSellingPoints.join(", ")}`);
      if (answers.testimonials.trim()) spParts.push(`Omdömen: ${answers.testimonials.trim()}`);
      if (answers.topics.length) spParts.push(`Ämnesområden: ${answers.topics.join(", ")}`);
      if (spParts.length) fieldMessages.push({ field: "servicesProducts" as NeedsAnalysisField, text: spParts.join("\n") });

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
      if (csParts.length) fieldMessages.push({ field: "categorySpecific" as NeedsAnalysisField, text: csParts.join("\n") });

      if (answers.goal.length) fieldMessages.push({ field: "goal", text: answers.goal.join(", ") });
      if (answers.mustHave.length) fieldMessages.push({ field: "mustHave", text: answers.mustHave.join(", ") });

      // Collect media files (product/menu/project images + logo)
      const mediaFiles: IntakeWizardResult["mediaFiles"] = [];
      if (answers.logoFile) mediaFiles.push({ file: answers.logoFile, context: "Logo" });
      for (const p of answers.products) {
        if (p.imageFile) mediaFiles.push({ file: p.imageFile, context: `Produkt: ${p.name}` });
      }
      for (const m of answers.menuItems) {
        if (m.imageFile) mediaFiles.push({ file: m.imageFile, context: `Menyrätt: ${m.name}` });
      }
      for (const p of answers.projects) {
        if (p.imageFile) mediaFiles.push({ file: p.imageFile, context: `Projekt: ${p.name}` });
      }

      onComplete({ answers, fieldMessages, mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined });
    }
  }, [currentStep, totalSteps, answers, onComplete, step, scraping, normalizeUrl, onScrapeUrl, handleScrape]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection("back");
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  /* ── Dialog mount ────────────────────────────────────────────── */

  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (mounted && el && !el.open) el.showModal();
  }, [mounted]);

  if (!mounted) return null;

  const StepIcon = step ? STEP_ICONS[step] : Sparkles;
  const stepTitle = step === "content" ? contentBranchTitle(contentBranch) : step ? STEP_TITLES[step] : "";
  const stepSubtitle = step === "content"
    ? "Det som gör din verksamhet unik"
    : step ? STEP_SUBTITLES[step] : "";

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[99999] m-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-gradient-to-b from-card to-card/95 p-0 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] outline-none backdrop:bg-black/60 backdrop:backdrop-blur-md"
      style={{ maxHeight: "min(90vh, 780px)" }}
      aria-label="Intake-guiden"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="flex max-h-[min(90vh,780px)] flex-col overflow-hidden rounded-3xl">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1.5 px-8 pt-5 pb-1">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                i < currentStep ? "bg-primary text-primary-foreground" :
                i === currentStep ? "bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-2 ring-primary/20" :
                "bg-white/5 text-muted-foreground/50",
              )}>
                {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  "h-px w-6 transition-colors duration-300",
                  i < currentStep ? "bg-primary/50" : "bg-white/10",
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="px-8 pt-4 pb-2">
          <div className="flex items-start gap-3">
            <div className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all duration-300",
              "bg-primary/10 text-primary",
            )}>
              <StepIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{stepTitle}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{stepSubtitle}</p>
              {step === "siteType" && inferredLabels.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-primary/70">
                  <Sparkles className="h-3 w-3" />
                  Föreslaget baserat på din beskrivning
                </p>
              )}
            </div>
            {currentStep > 0 && (
              <button type="button" onClick={goBack} className="mt-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground">
                Tillbaka
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {step === "siteType" && (
            <SiteTypeStep siteType={answers.siteType} onToggle={(label) => toggleChip("siteType", label)} />
          )}
          {step === "businessInfo" && (
            <BusinessInfoStep
              answers={answers}
              onChange={setAnswers}
              scraping={scraping}
              onScrape={handleScrape}
              textareaRef={textareaRef}
            />
          )}
          {step === "content" && (
            <ContentStep branch={contentBranch} answers={answers} onChange={setAnswers} />
          )}
          {step === "design" && (
            <DesignStep answers={answers} onChange={setAnswers} />
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
        </div>

        {/* Footer */}
        <div className="mx-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="flex items-center justify-between px-8 py-4">
          {step !== "siteType" && step !== "businessInfo" && currentStep < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => { setDirection("forward"); setCurrentStep((s) => s + 1); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
            >
              <SkipForward className="h-3 w-3" />
              Hoppa över
            </button>
          ) : <div />}
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue()}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-semibold transition-all duration-200",
              canContinue()
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
                : "cursor-not-allowed bg-white/5 text-muted-foreground/50",
            )}
          >
            {currentStep === totalSteps - 1 ? (
              <>
                <Sparkles className="h-4 w-4" />
                Bygg min sajt
              </>
            ) : (
              <>
                Fortsätt
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 1: Site type
   ════════════════════════════════════════════════════════════════════ */

function SiteTypeStep({ siteType, onToggle }: { siteType: string[]; onToggle: (label: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CATEGORIES.map((cat) => {
        const selected = siteType.includes(cat.label);
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onToggle(cat.label)}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-200",
              selected
                ? "border-primary/50 bg-primary/10 font-medium text-primary shadow-sm shadow-primary/10"
                : "border-white/5 bg-white/[0.03] text-muted-foreground hover:border-white/15 hover:bg-white/[0.06]",
            )}
          >
            <div className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              selected ? "bg-primary/20" : "bg-white/5 group-hover:bg-white/10",
            )}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className="truncate">{cat.label}</span>
            {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 2: Business info (merged offer + existingSite + details)
   ════════════════════════════════════════════════════════════════════ */

function BusinessInfoStep({
  answers,
  onChange,
  scraping,
  onScrape,
  textareaRef,
}: {
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
  scraping: boolean;
  onScrape: (url: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const set = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) =>
    onChange((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Företagsnamn *</SectionLabel>
        <input
          type="text"
          value={answers.companyName}
          onChange={(e) => set("companyName", e.target.value)}
          placeholder="Mitt Företag AB"
          className={FIELD_CLASS}
        />
      </div>

      <div>
        <SectionLabel>Beskriv din verksamhet *</SectionLabel>
        <textarea
          ref={textareaRef}
          value={answers.offer}
          onChange={(e) => set("offer", e.target.value)}
          placeholder="T.ex. Vi driver en frisörsalong i Göteborg med fokus på färgning och klippning..."
          className={cn(FIELD_CLASS, "min-h-[100px] resize-none")}
        />
      </div>

      <div className="h-px bg-white/5" />

      <div>
        <FieldLabel>Befintlig hemsida (valfritt)</FieldLabel>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/40" />
            <input
              type="url"
              value={answers.existingSite}
              onChange={(e) => set("existingSite", e.target.value)}
              placeholder="www.dinhemsida.se"
              className={cn(FIELD_CLASS, "pl-10")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScrape(answers.existingSite); } }}
            />
            {scraping && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-primary" />}
          </div>
          <button
            type="button"
            disabled={scraping || !answers.existingSite.trim()}
            onClick={() => onScrape(answers.existingSite)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
              scraping || !answers.existingSite.trim()
                ? "cursor-not-allowed bg-white/5 text-muted-foreground/50"
                : "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90",
            )}
          >
            <Sparkles className="h-4 w-4" />
            Hämta
          </button>
        </div>
        {scraping && (
          <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Analyserar och hämtar uppgifter...</span>
            </div>
          </div>
        )}
      </div>

      <details className="group rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Kontaktuppgifter (valfritt)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Telefon</FieldLabel>
            <input type="tel" value={answers.phone} onChange={(e) => set("phone", e.target.value)} placeholder="070-123 45 67" className={FIELD_CLASS} />
          </div>
          <div>
            <FieldLabel>E-post</FieldLabel>
            <input type="email" value={answers.email} onChange={(e) => set("email", e.target.value)} placeholder="info@mittforetag.se" className={FIELD_CLASS} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Adress</FieldLabel>
            <input type="text" value={answers.address} onChange={(e) => set("address", e.target.value)} placeholder="Storgatan 1, 123 45 Stad" className={FIELD_CLASS} />
          </div>
        </div>
      </details>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 3: Content (branch-specific)
   ════════════════════════════════════════════════════════════════════ */

function ContentStep({
  branch,
  answers,
  onChange,
}: {
  branch: ContentBranch;
  answers: WizardAnswers;
  onChange: React.Dispatch<React.SetStateAction<WizardAnswers>>;
}) {
  switch (branch) {
    case "ecommerce": return <EcommerceContent answers={answers} onChange={onChange} />;
    case "restaurant": return <RestaurantContent answers={answers} onChange={onChange} />;
    case "salon": return <SalonContent answers={answers} onChange={onChange} />;
    case "portfolio": return <PortfolioContent answers={answers} onChange={onChange} />;
    case "business": return <BusinessContent answers={answers} onChange={onChange} />;
    case "minimal": return <MinimalContent answers={answers} onChange={onChange} />;
  }
}

/* ── Ecommerce: per-product entries ─────────────────────────────── */

function EcommerceContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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
        <div key={idx} className="rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:border-white/12">
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
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-all duration-200", product.category === cat ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/[0.06]")}
                    >{cat}</button>
                  ))}
                </div>
                <button type="button" onClick={() => removeProduct(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {answers.products.length < 12 && (
        <button type="button" onClick={addProduct} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-3.5 text-sm text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary">
          <Plus className="h-4 w-4" /> Lägg till produkt
        </button>
      )}

      <div className="h-px bg-white/5" />

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
    </div>
  );
}

/* ── Restaurant: per-dish entries ────────────────────────────────── */

function RestaurantContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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
        <div key={idx} className="rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:border-white/12">
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
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-all duration-200", item.category === cat ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/[0.06]")}
                    >{cat}</button>
                  ))}
                </div>
                <button type="button" onClick={() => removeItem(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {answers.menuItems.length < 20 && (
        <button type="button" onClick={addItem} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-3.5 text-sm text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary">
          <Plus className="h-4 w-4" /> Lägg till rätt
        </button>
      )}

      <div className="h-px bg-white/5" />

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
          <input type="text" value={answers.openingHours} onChange={(e) => onChange((p) => ({ ...p, openingHours: e.target.value }))} placeholder="Mån–Fre 11–22, Lör–Sön 12–23" className={FIELD_CLASS} />
        </div>
        <div className="flex items-end gap-4 pb-1">
          <ToggleField label="Bordsbokning" value={answers.acceptsReservations} onToggle={() => onChange((p) => ({ ...p, acceptsReservations: !p.acceptsReservations }))} />
          <ToggleField label="Takeaway" value={answers.delivery} onToggle={() => onChange((p) => ({ ...p, delivery: !p.delivery }))} />
        </div>
      </div>
    </div>
  );
}

/* ── Salon/Health: treatments + team ─────────────────────────────── */

function SalonContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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
          <div key={idx} className="mb-2 flex gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
            <input type="text" value={t.name} onChange={(e) => updateTreatment(idx, { name: e.target.value })} placeholder="Behandling *" className={cn(FIELD_CLASS, "flex-1")} />
            <input type="text" value={t.price} onChange={(e) => updateTreatment(idx, { price: e.target.value })} placeholder="Pris (kr)" className={cn(FIELD_CLASS, "w-24")} />
            <input type="text" value={t.duration} onChange={(e) => updateTreatment(idx, { duration: e.target.value })} placeholder="Min" className={cn(FIELD_CLASS, "w-16")} />
            <button type="button" onClick={() => removeTreatment(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={addTreatment} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/5"><Plus className="h-3 w-3" /> Lägg till behandling</button>
      </div>

      <div className="h-px bg-white/5" />

      <div>
        <SectionLabel>Team / specialister (valfritt)</SectionLabel>
        {answers.teamMembers.map((m, idx) => (
          <div key={idx} className="mb-2 flex gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
            <input type="text" value={m.name} onChange={(e) => updateMember(idx, { name: e.target.value })} placeholder="Namn" className={cn(FIELD_CLASS, "flex-1")} />
            <input type="text" value={m.role} onChange={(e) => updateMember(idx, { role: e.target.value })} placeholder="Roll / specialitet" className={cn(FIELD_CLASS, "flex-1")} />
            <button type="button" onClick={() => removeMember(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={addMember} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/5"><Plus className="h-3 w-3" /> Lägg till person</button>
      </div>

      <div className="h-px bg-white/5" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Öppettider</FieldLabel>
          <input type="text" value={answers.openingHours} onChange={(e) => onChange((p) => ({ ...p, openingHours: e.target.value }))} placeholder="Mån–Fre 09–18" className={FIELD_CLASS} />
        </div>
        <div>
          <FieldLabel>Boknings-URL (valfritt)</FieldLabel>
          <input type="text" value={answers.bookingUrl} onChange={(e) => onChange((p) => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://..." className={FIELD_CLASS} />
        </div>
      </div>
    </div>
  );
}

/* ── Portfolio: project entries ───────────────────────────────────── */

function PortfolioContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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
        <div key={idx} className="rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:border-white/12">
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
                <button type="button" onClick={() => removeProject(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button type="button" onClick={addProject} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-3.5 text-sm text-muted-foreground/60 transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary">
        <Plus className="h-4 w-4" /> Lägg till projekt
      </button>

      <div>
        <FieldLabel>Kompetenser</FieldLabel>
        <TagInput values={answers.services} onChange={(vals) => onChange((p) => ({ ...p, services: vals }))} placeholder="T.ex. React, Figma, Fotografi..." max={8} />
      </div>
    </div>
  );
}

/* ── Business default: services + USPs ───────────────────────────── */

function BusinessContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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
          onChange={(e) => onChange((p) => ({ ...p, testimonials: e.target.value }))}
          placeholder={'"Bästa frisören i stan!" – Anna S.\n"Proffsigt och snabbt." – Erik L.'}
          className={cn(FIELD_CLASS, "min-h-[80px] resize-none")}
        />
      </div>
    </div>
  );
}

/* ── Minimal: blog/landing/other ─────────────────────────────────── */

function MinimalContent({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
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

/* ════════════════════════════════════════════════════════════════════
   Step 4: Design
   ════════════════════════════════════════════════════════════════════ */

function DesignStep({ answers, onChange }: { answers: WizardAnswers; onChange: React.Dispatch<React.SetStateAction<WizardAnswers>> }) {
  const addColor = () => onChange((p) => ({ ...p, brandColors: [...p.brandColors, "#"] }));
  const removeColor = (idx: number) => onChange((p) => ({ ...p, brandColors: p.brandColors.filter((_, i) => i !== idx) }));
  const updateColor = (idx: number, val: string) => onChange((p) => ({ ...p, brandColors: p.brandColors.map((c, i) => i === idx ? val : c) }));

  const handleLogoFile = (file: File) => {
    onChange((p) => {
      if (p.logoPreview) URL.revokeObjectURL(p.logoPreview);
      return { ...p, logoFile: file, logoPreview: URL.createObjectURL(file) };
    });
  };

  return (
    <div className="space-y-5">
      {/* Logo upload */}
      <div>
        <SectionLabel>Logotyp (valfritt)</SectionLabel>
        {answers.logoPreview ? (
          <div className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <img src={answers.logoPreview} alt="Logo" className="h-16 w-16 rounded-xl border border-white/10 object-contain bg-white/5 p-1.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Logotyp uppladdad</span>
              <button type="button" onClick={() => onChange((p) => { if (p.logoPreview) URL.revokeObjectURL(p.logoPreview); return { ...p, logoFile: null, logoPreview: "" }; })} className="w-fit rounded-lg px-2 py-0.5 text-xs text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive">Ta bort</button>
            </div>
          </div>
        ) : (
          <label className="group flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 py-7 text-muted-foreground/50 transition-all hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary">
            <Upload className="h-6 w-6 transition-transform group-hover:scale-110" />
            <span className="text-xs font-medium">Ladda upp logotyp</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleLogoFile(e.target.files[0]); }} />
          </label>
        )}
      </div>

      <div className="h-px bg-white/5" />

      {/* Brand colors */}
      <div>
        <FieldLabel>Profilfärger (valfritt)</FieldLabel>
        <div className="space-y-2">
          {answers.brandColors.map((color, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-2">
              <input type="color" value={color.startsWith("#") && color.length === 7 ? color : "#000000"} onChange={(e) => updateColor(idx, e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-white/10" />
              <input type="text" value={color} onChange={(e) => updateColor(idx, e.target.value)} placeholder="#FF6600" className={cn(FIELD_CLASS, "flex-1")} />
              <button type="button" onClick={() => removeColor(idx)} className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={addColor} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/5"><Plus className="h-3 w-3" /> Lägg till färg</button>
        </div>
      </div>

      {/* Tagline */}
      <div>
        <FieldLabel>Tagline / slogan (valfritt)</FieldLabel>
        <input type="text" value={answers.tagline} onChange={(e) => onChange((p) => ({ ...p, tagline: e.target.value }))} placeholder="T.ex. Vi gör det enkelt att växa" className={FIELD_CLASS} />
      </div>

      <div className="h-px bg-white/5" />

      {/* Tone */}
      <div>
        <FieldLabel>Ton och stil</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.tone === opt} onClick={() => onChange((p) => ({ ...p, tone: p.tone === opt ? "" : opt }))} />
          ))}
        </div>
      </div>

      {/* Design style */}
      <div>
        <FieldLabel>Designstil</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DESIGN_STYLE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.designStyle === opt} onClick={() => onChange((p) => ({ ...p, designStyle: p.designStyle === opt ? "" : opt }))} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Step 5: Pages + Goals (combined)
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
        <SectionLabel>Vilka sidor vill du ha?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {MUST_HAVE_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.mustHave.includes(opt)} suggested={aiSuggestions.includes(opt)} onClick={() => toggleChip("mustHave", opt)} />
          ))}
        </div>
        <button type="button" onClick={onSuggest} disabled={suggesting} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/5">
          {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {suggesting ? "Hämtar förslag..." : "AI-förslag baserat på din beskrivning"}
        </button>
      </div>

      <div className="h-px bg-white/5" />

      <div>
        <FieldLabel>Mål med sajten (valfritt)</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((opt) => (
            <Chip key={opt} label={opt} selected={answers.goal.includes(opt)} onClick={() => onChange((p) => {
              const arr = p.goal.includes(opt) ? p.goal.filter((v) => v !== opt) : [...p.goal, opt];
              return { ...p, goal: arr };
            })} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Shared sub-components
   ════════════════════════════════════════════════════════════════════ */

function Chip({ label, selected, suggested, onClick }: { label: string; selected: boolean; suggested?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-all duration-200",
        selected
          ? "border-primary/50 bg-primary/10 font-medium text-primary shadow-sm shadow-primary/10"
          : "border-white/10 text-muted-foreground hover:border-white/20 hover:bg-white/[0.06]",
        suggested && !selected && "border-primary/20 bg-primary/[0.03]",
      )}
    >
      {label}
      {selected && <Check className="ml-1.5 inline h-3 w-3" />}
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
      "group flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed transition-all duration-200",
      preview ? "border-white/10 bg-white/5" : "border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-primary/[0.03]",
    )}>
      {preview ? (
        <img src={preview} alt="" className="h-full w-full rounded-xl object-cover" />
      ) : (
        <ImagePlus className="h-5 w-5 text-muted-foreground/30 transition-colors group-hover:text-primary/60" />
      )}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onPick(e.target.files[0]); }} />
    </label>
  );
}

function ToggleField({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button type="button" onClick={onToggle}
        className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200", value ? "bg-primary shadow-sm shadow-primary/30" : "bg-white/10")}
      >
        <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200", value ? "translate-x-4" : "translate-x-0.5")} />
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
          <button type="button" onClick={add} disabled={!input.trim()} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-white/5 disabled:opacity-30">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="ml-0.5 rounded-full p-0.5 text-primary/40 transition-colors hover:bg-primary/10 hover:text-primary"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
