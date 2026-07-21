import {
  Building2,
  Sparkles,
  Coffee,
  UtensilsCrossed,
  ShoppingBag,
  Monitor,
  BriefcaseBusiness,
  HeartPulse,
  Brush,
  GraduationCap,
  Store,
  House,
  ShoppingCart,
  Mail,
  ImageIcon,
  BookOpenText,
  BadgeCheck,
  CalendarCheck,
  BarChart3,
  RefreshCcw,
  PartyPopper,
  Gem,
  Cpu,
  Square,
  type LucideIcon,
} from "lucide-react";

// ── Industry options with context ──────────────────────────────────

export type IndustryOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  suggestedFeatures: string[];
};

export const INDUSTRY_OPTIONS: IndustryOption[] = [
  {
    id: "cafe",
    label: "Café/Konditori",
    icon: Coffee,
    suggestedFeatures: ["Meny", "Öppettider", "Bildgalleri", "Bordbokning"],
  },
  {
    id: "restaurant",
    label: "Restaurang/Bar",
    icon: UtensilsCrossed,
    suggestedFeatures: ["Meny", "Bordbokning", "Events", "Chef's specials"],
  },
  {
    id: "retail",
    label: "Butik/Detaljhandel",
    icon: ShoppingBag,
    suggestedFeatures: ["Produktkatalog", "Erbjudanden", "Hitta butik"],
  },
  {
    id: "tech",
    label: "Tech/IT-företag",
    icon: Monitor,
    suggestedFeatures: ["Tjänster", "Case studies", "Prissättning"],
  },
  {
    id: "consulting",
    label: "Konsult/Tjänster",
    icon: BriefcaseBusiness,
    suggestedFeatures: ["Tjänster", "Team", "Kontakt", "Testimonials"],
  },
  {
    id: "health",
    label: "Hälsa/Wellness",
    icon: HeartPulse,
    suggestedFeatures: ["Behandlingar", "Onlinebokning", "Prislista"],
  },
  {
    id: "creative",
    label: "Kreativ byrå",
    icon: Brush,
    suggestedFeatures: ["Portfolio", "Tjänster", "Process", "Kontakt"],
  },
  {
    id: "education",
    label: "Utbildning",
    icon: GraduationCap,
    suggestedFeatures: ["Kurser", "Schema", "Anmälan", "Lärare"],
  },
  {
    id: "ecommerce",
    label: "E-handel",
    icon: Store,
    suggestedFeatures: ["Produkter", "Varukorg", "Checkout", "Recensioner"],
  },
  {
    id: "realestate",
    label: "Fastigheter",
    icon: House,
    suggestedFeatures: ["Objekt", "Sök/Filter", "Kontakt", "Värdering"],
  },
  {
    id: "other",
    label: "Annat",
    icon: Sparkles,
    suggestedFeatures: [],
  },
];

// Purpose options
export type PurposeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
};

export const PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "sell", label: "Sälja", icon: ShoppingCart, desc: "Produkter/tjänster" },
  { id: "leads", label: "Leads", icon: Mail, desc: "Fånga kontakter" },
  { id: "portfolio", label: "Portfolio", icon: ImageIcon, desc: "Visa arbeten" },
  { id: "inform", label: "Informera", icon: BookOpenText, desc: "Dela kunskap" },
  { id: "brand", label: "Varumärke", icon: BadgeCheck, desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", icon: CalendarCheck, desc: "Ta emot bokningar" },
  { id: "conversion", label: "Konvertering", icon: BarChart3, desc: "Öka konvertering" },
  { id: "rebrand", label: "Rebrand", icon: RefreshCcw, desc: "Ny identitet" },
];

// Design vibe options
export type VibeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const VIBE_OPTIONS: VibeOption[] = [
  { id: "modern", label: "Modern & Clean", icon: Sparkles },
  { id: "playful", label: "Playful & Fun", icon: PartyPopper },
  { id: "brutalist", label: "Brutalist", icon: Building2 },
  { id: "luxury", label: "Luxury", icon: Gem },
  { id: "tech", label: "Futuristic", icon: Cpu },
  { id: "minimal", label: "Minimal", icon: Square },
];

export const CLARIFY_FALLBACK_ID = "clarify_fallback";

// ── Design feature chips ──────────────────────────────────────────
export type DesignFeature = {
  id: string;
  label: string;
  promptText: string;
  relevantIndustries?: string[];
};

export const DESIGN_FEATURES: DesignFeature[] = [
  { id: "want_animations", label: "Snygga animationer", promptText: "Include tasteful animations (scroll reveals, hover effects, micro-interactions)" },
  { id: "want_dark_mode", label: "Mörkt/ljust tema", promptText: "Dark mode support with theme toggle" },
  { id: "want_logo", label: "Skapa logotyp", promptText: "Generate a professional logo/wordmark for the brand" },
  { id: "want_contact_form", label: "Kontaktformulär", promptText: "Contact form with validation and success state" },
  { id: "want_newsletter", label: "Nyhetsbrev", promptText: "Newsletter signup section with email capture" },
  { id: "want_social", label: "Sociala medier", promptText: "Social media links and feed integration" },
  { id: "want_booking", label: "Bokningsfunktion", promptText: "Integrated booking/scheduling widget", relevantIndustries: ["cafe", "restaurant", "health", "creative", "consulting"] },
  { id: "want_i18n", label: "Flerspråkigt", promptText: "Multi-language support (Swedish + English)" },
  { id: "want_map", label: "Karta med plats", promptText: "Embedded map showing business location" },
  { id: "want_blog", label: "Blogg/Nyheter", promptText: "Blog section with article cards and pagination" },
];

export function looksLikeDomain(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length < 4) return false;
  if (/^(ingen|nej|vet inte|saknar|har inte|n\/a)/i.test(trimmed)) return false;
  return /\.[a-z]{2,}$/i.test(trimmed.replace(/^https?:\/\//i, ""));
}

// ── Shared input class (landing-style) ─────────────────────────────

export const INPUT_CLASS =
  "w-full rounded-xl border border-border/30 bg-secondary/50 px-4 py-3 text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none";
