/**
 * Kanonisk wizard-taxonomi: bransch, syfte och vibe.
 *
 * Äger id + label (+ suggestedFeatures / purpose-beskrivning). UI-lagret mappar
 * samma id:n till Lucide-ikoner (prompt-wizard) eller emoji (mini-wizard).
 *
 * Ägarbeslut 2026-09-14/15: en ägare innan taxonomin byggs ut. Inget nytt
 * frisör-/skönhetsfack — bransch från dashen är hint, inte ett fack den måste
 * träffa.
 */

export const WIZARD_INDUSTRY_IDS = [
  "cafe",
  "restaurant",
  "retail",
  "tech",
  "consulting",
  "health",
  "creative",
  "education",
  "ecommerce",
  "realestate",
  "other",
] as const;

export type WizardIndustryId = (typeof WIZARD_INDUSTRY_IDS)[number];

export type WizardIndustry = {
  id: WizardIndustryId;
  label: string;
  suggestedFeatures: readonly string[];
};

export const WIZARD_INDUSTRIES: readonly WizardIndustry[] = [
  {
    id: "cafe",
    label: "Café/Konditori",
    suggestedFeatures: ["Meny", "Öppettider", "Bildgalleri", "Bordbokning"],
  },
  {
    id: "restaurant",
    label: "Restaurang/Bar",
    suggestedFeatures: ["Meny", "Bordbokning", "Events", "Chef's specials"],
  },
  {
    id: "retail",
    label: "Butik/Detaljhandel",
    suggestedFeatures: ["Produktkatalog", "Erbjudanden", "Hitta butik"],
  },
  {
    id: "tech",
    label: "Tech/IT-företag",
    suggestedFeatures: ["Tjänster", "Case studies", "Prissättning"],
  },
  {
    id: "consulting",
    label: "Konsult/Tjänster",
    suggestedFeatures: ["Tjänster", "Team", "Kontakt", "Testimonials"],
  },
  {
    id: "health",
    label: "Hälsa/Wellness",
    suggestedFeatures: ["Behandlingar", "Onlinebokning", "Prislista"],
  },
  {
    id: "creative",
    label: "Kreativ byrå",
    suggestedFeatures: ["Portfolio", "Tjänster", "Process", "Kontakt"],
  },
  {
    id: "education",
    label: "Utbildning",
    suggestedFeatures: ["Kurser", "Schema", "Anmälan", "Lärare"],
  },
  {
    id: "ecommerce",
    label: "E-handel",
    suggestedFeatures: ["Produkter", "Varukorg", "Checkout", "Recensioner"],
  },
  {
    id: "realestate",
    label: "Fastigheter",
    suggestedFeatures: ["Objekt", "Sök/Filter", "Kontakt", "Värdering"],
  },
  {
    id: "other",
    label: "Annat",
    suggestedFeatures: [],
  },
];

export const WIZARD_PURPOSE_IDS = [
  "sell",
  "leads",
  "portfolio",
  "inform",
  "brand",
  "booking",
  "conversion",
  "rebrand",
] as const;

export type WizardPurposeId = (typeof WIZARD_PURPOSE_IDS)[number];

export type WizardPurpose = {
  id: WizardPurposeId;
  label: string;
  desc: string;
};

export const WIZARD_PURPOSES: readonly WizardPurpose[] = [
  { id: "sell", label: "Sälja", desc: "Produkter/tjänster" },
  { id: "leads", label: "Leads", desc: "Fånga kontakter" },
  { id: "portfolio", label: "Portfolio", desc: "Visa arbeten" },
  { id: "inform", label: "Informera", desc: "Dela kunskap" },
  { id: "brand", label: "Varumärke", desc: "Bygga identitet" },
  { id: "booking", label: "Bokningar", desc: "Ta emot bokningar" },
  { id: "conversion", label: "Konvertering", desc: "Öka konvertering" },
  { id: "rebrand", label: "Rebrand", desc: "Ny identitet" },
];

export const WIZARD_VIBE_IDS = [
  "modern",
  "playful",
  "brutalist",
  "luxury",
  "tech",
  "minimal",
] as const;

export type WizardVibeId = (typeof WIZARD_VIBE_IDS)[number];

export type WizardVibe = {
  id: WizardVibeId;
  label: string;
};

export const WIZARD_VIBES: readonly WizardVibe[] = [
  { id: "modern", label: "Modern & Clean" },
  { id: "playful", label: "Playful & Fun" },
  { id: "brutalist", label: "Brutalist" },
  { id: "luxury", label: "Luxury" },
  { id: "tech", label: "Futuristic" },
  { id: "minimal", label: "Minimal" },
];

function labelsFrom<T extends { id: string; label: string }>(
  items: readonly T[],
): Record<T["id"], string> {
  return Object.assign(
    Object.create(null),
    Object.fromEntries(items.map((item) => [item.id, item.label])),
  ) as Record<T["id"], string>;
}

/** Own enumerable string only — inherited `Object` keys must not leak through. */
function ownStringLabel(labels: object, id: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(labels, id)) return undefined;
  const value = (labels as Record<string, unknown>)[id];
  return typeof value === "string" ? value : undefined;
}

export const WIZARD_INDUSTRY_LABELS: Record<WizardIndustryId, string> =
  labelsFrom(WIZARD_INDUSTRIES);
export const WIZARD_PURPOSE_LABELS: Record<WizardPurposeId, string> =
  labelsFrom(WIZARD_PURPOSES);
export const WIZARD_VIBE_LABELS: Record<WizardVibeId, string> = labelsFrom(WIZARD_VIBES);

const INDUSTRY_ID_SET = new Set<string>(WIZARD_INDUSTRY_IDS);

export function isWizardIndustryId(value: string): value is WizardIndustryId {
  return INDUSTRY_ID_SET.has(value);
}

/**
 * Normaliserar fritext så exakt id, visad label och kända alias kan jämföras.
 * Substrängsökning används inte — «frisörverksamhet» ska inte träffa `health`.
 */
export function normalizeWizardIndustryHint(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Helsträngsalias efter `normalizeWizardIndustryHint`. Bara uppenbara synonymer
 * till de elva id:na — inte yrkesgissningar.
 */
const INDUSTRY_ALIASES = new Map<string, WizardIndustryId>([
  ["konditori", "cafe"],
  ["cafe konditori", "cafe"],
  ["restaurang", "restaurant"],
  ["bar", "restaurant"],
  ["restaurang bar", "restaurant"],
  ["butik", "retail"],
  ["detaljhandel", "retail"],
  ["butik detaljhandel", "retail"],
  ["it", "tech"],
  ["it foretag", "tech"],
  ["tech it", "tech"],
  ["tech it foretag", "tech"],
  ["konsult", "consulting"],
  ["konsult tjanster", "consulting"],
  ["halsa", "health"],
  ["wellness", "health"],
  ["halsa wellness", "health"],
  ["kreativ", "creative"],
  ["kreativ byra", "creative"],
  ["utbildning", "education"],
  ["ehandel", "ecommerce"],
  ["e handel", "ecommerce"],
  ["real estate", "realestate"],
  ["fastigheter", "realestate"],
  ["fastighet", "realestate"],
  ["annat", "other"],
]);

/**
 * Sätter industry-id bara vid exakt id, visad label eller känd alias.
 * Okänd fritext (t.ex. «frisörverksamhet») ger tomt — användaren väljer.
 */
export function resolveWizardIndustryHint(
  value: string | null | undefined,
): WizardIndustryId | "" {
  if (!value) return "";
  const normalized = normalizeWizardIndustryHint(value);
  if (!normalized) return "";
  if (isWizardIndustryId(normalized)) return normalized;
  const fromLabel = WIZARD_INDUSTRIES.find(
    (industry) => normalizeWizardIndustryHint(industry.label) === normalized,
  );
  if (fromLabel) return fromLabel.id;
  const aliased = INDUSTRY_ALIASES.get(normalized);
  return aliased && isWizardIndustryId(aliased) ? aliased : "";
}

export function wizardIndustryLabel(id: string, fallback = id || "general"): string {
  return ownStringLabel(WIZARD_INDUSTRY_LABELS, id) ?? fallback;
}

export function wizardPurposeLabel(id: string, fallback = id): string {
  return ownStringLabel(WIZARD_PURPOSE_LABELS, id) ?? fallback;
}

export function wizardVibeLabel(id: string, fallback = id): string {
  return ownStringLabel(WIZARD_VIBE_LABELS, id) ?? fallback;
}
