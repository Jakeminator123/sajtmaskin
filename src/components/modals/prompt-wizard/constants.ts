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
import {
  WIZARD_INDUSTRIES,
  WIZARD_PURPOSES,
  WIZARD_VIBES,
  type WizardIndustryId,
  type WizardPurposeId,
  type WizardVibeId,
} from "@/lib/builder/wizard-taxonomy";

// ── Industry options with context ──────────────────────────────────
// Id/label/suggestedFeatures ägs av `src/lib/builder/wizard-taxonomy.ts`.
// Den här filen mappar bara id → Lucide-ikon.

export type IndustryOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  suggestedFeatures: string[];
};

const INDUSTRY_ICONS: Record<WizardIndustryId, LucideIcon> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  retail: ShoppingBag,
  tech: Monitor,
  consulting: BriefcaseBusiness,
  health: HeartPulse,
  creative: Brush,
  education: GraduationCap,
  ecommerce: Store,
  realestate: House,
  other: Sparkles,
};

export const INDUSTRY_OPTIONS: IndustryOption[] = WIZARD_INDUSTRIES.map((industry) => ({
  id: industry.id,
  label: industry.label,
  icon: INDUSTRY_ICONS[industry.id],
  suggestedFeatures: [...industry.suggestedFeatures],
}));

// Purpose options
export type PurposeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
};

const PURPOSE_ICONS: Record<WizardPurposeId, LucideIcon> = {
  sell: ShoppingCart,
  leads: Mail,
  portfolio: ImageIcon,
  inform: BookOpenText,
  brand: BadgeCheck,
  booking: CalendarCheck,
  conversion: BarChart3,
  rebrand: RefreshCcw,
};

export const PURPOSE_OPTIONS: PurposeOption[] = WIZARD_PURPOSES.map((purpose) => ({
  id: purpose.id,
  label: purpose.label,
  desc: purpose.desc,
  icon: PURPOSE_ICONS[purpose.id],
}));

// Design vibe options
export type VibeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const VIBE_ICONS: Record<WizardVibeId, LucideIcon> = {
  modern: Sparkles,
  playful: PartyPopper,
  brutalist: Building2,
  luxury: Gem,
  tech: Cpu,
  minimal: Square,
};

export const VIBE_OPTIONS: VibeOption[] = WIZARD_VIBES.map((vibe) => ({
  id: vibe.id,
  label: vibe.label,
  icon: VIBE_ICONS[vibe.id],
}));

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
