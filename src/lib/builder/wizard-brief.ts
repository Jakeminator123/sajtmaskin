/**
 * Builds a partial structured brief from IntakeWizard answers.
 *
 * The fields produced here override any server-generated Deep Brief in
 * `useCreateChat.ts` (`options.meta.brief` merges on top of
 * `pendingBriefRef.current`), so canonical ids like `industry`,
 * `businessType`, `primaryCallToAction`, `mustHave[]`, and `pages[]` are
 * authoritative when the user completed the wizard.
 */

import type { WizardAnswers } from "@/components/builder/IntakeWizard";

type CategoryLabel = string;
type CategoryId = string;

// Mirrors CATEGORIES in IntakeWizard.tsx. Keep in sync if labels change.
const CATEGORY_LABEL_TO_ID: Record<CategoryLabel, CategoryId> = {
  "Företag / Tjänster": "business",
  "Webshop / E-handel": "ecommerce",
  "Restaurang / Café": "restaurant",
  "Portfolio / CV": "portfolio",
  "Landningssida": "landing",
  "Blogg / Magasin": "blog",
  "Konsult / Byrå": "consulting",
  "Tech / Startup": "tech",
  "Vård / Klinik": "healthcare",
  "Fastighet / Mäklare": "realestate",
  "Salong / Skönhet": "salon",
  "Gym / Tränare": "fitness",
  "Bygg / Hantverk": "construction",
  "Utbildning / Skola": "education",
  "Event / Bröllop": "event",
  "Förening / Ideell": "nonprofit",
  "Musik / Artist": "music",
  "Hotell / Boende": "hotel",
  "Juridik / Advokat": "legal",
  "Ekonomi / Redovisning": "accounting",
  "Bil / Motor": "auto",
  "Resa / Turism": "travel",
  "Mat / Catering": "food",
  "Foto / Video": "photo",
  "Annat": "other",
};

// siteType id → canonical businessType consumed by buildScaffoldQueryContext
// (see src/lib/gen/orchestrate.ts). Kept intentionally small — anything not
// listed falls back to "business".
const CATEGORY_TO_BUSINESS_TYPE: Record<CategoryId, string> = {
  ecommerce: "ecommerce",
  restaurant: "restaurant",
  portfolio: "portfolio",
  landing: "landing",
  blog: "blog",
  consulting: "consulting",
  tech: "saas",
  healthcare: "healthcare",
  realestate: "realestate",
  salon: "salon",
  fitness: "fitness",
  construction: "construction",
  education: "education",
  event: "event",
  nonprofit: "nonprofit",
  music: "music",
  hotel: "hotel",
  legal: "legal",
  accounting: "accounting",
  auto: "auto",
  travel: "travel",
  food: "food",
  photo: "photo",
  business: "business",
  other: "business",
};

// Must-have label → canonical page name + path used by buildRoutesFromBrief.
// Unlisted entries fall through as custom features; only anchors that map to
// real routes are turned into page stubs.
const MUST_HAVE_TO_PAGE: Record<string, { name: string; path: string }> = {
  "Startsida / Hero": { name: "Start", path: "/" },
  "Om oss / Om mig": { name: "Om oss", path: "/om-oss" },
  "Kontaktformulär": { name: "Kontakt", path: "/kontakt" },
  "Priser och paket": { name: "Priser", path: "/priser" },
  "Bokning online": { name: "Boka", path: "/boka" },
  "Bildgalleri": { name: "Galleri", path: "/galleri" },
  "Blogg / Nyheter": { name: "Blogg", path: "/blogg" },
  "FAQ": { name: "FAQ", path: "/faq" },
  "Portfolio / Case": { name: "Portfolio", path: "/portfolio" },
  "Vårt team": { name: "Team", path: "/team" },
  "Nyhetsbrev": { name: "Nyhetsbrev", path: "/nyhetsbrev" },
  "Webshop / Produkter": { name: "Butik", path: "/shop" },
  "Meny / Matsedel": { name: "Meny", path: "/meny" },
  "Karta / Hitta hit": { name: "Hitta hit", path: "/hitta-hit" },
  "Kundrecensioner": { name: "Omdömen", path: "/omdomen" },
};

// Canonical primaryCta enum (matches wizard chip labels).
const PRIMARY_CTA_ENUM: Record<string, string> = {
  "Boka tid": "book",
  "Kontakta oss": "contact",
  "Köp nu": "buy",
  "Begär offert": "quote",
  "Registrera dig": "subscribe",
  "Läs mer": "read",
  "Ring oss": "call",
  "Ladda ner": "download",
};

export interface WizardBrief {
  industry?: string;
  businessType?: string;
  primaryCallToAction?: string;
  /** Canonical CTA id (book|contact|buy|quote|subscribe|read|call|download|custom). */
  primaryCallToActionId?: string;
  toneAndVoice?: string[];
  tagline?: string;
  visualDirection?: {
    styleKeywords?: string[];
    imagery?: string[];
    avoid?: string;
  };
  mustHave?: string[];
  pages?: Array<{ name: string; path: string }>;
  avoid?: string;
  imagery?: string[];
  /** First ~160 chars of offer — handy for hero sub-headline / meta desc. */
  oneSentencePitch?: string;
  /** Raw audience answer from wizard (overrides LLM extraction). */
  targetAudience?: string;
  /** USP chips collected during wizard. */
  uniqueValueProposition?: string[];
  /**
   * Branch-specific rendering of the testimonials/story textarea. The wizard
   * intentionally stuffs multiple meanings into `answers.testimonials` based
   * on branch — we split them here so Deep Brief consumers get a clean field.
   */
  testimonialsSummary?: string;
  coreMessage?: string;
  caseStudiesSummary?: string;

  // ── Creative parity with raw-prompt flow ──────────────────────────────
  projectTitle?: string;
  brandName?: string;
  siteName?: string;
  motionLevel?: "minimal" | "moderate" | "lively";
  qualityBar?: "clean" | "premium" | "bold-dramatic";

  // ── Fact-bearing fields (mirror Brief in system-prompt.ts) ────────────
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
    openingHours?: string;
    bookingUrl?: string;
  };
  services?: string[];
  uniqueSellingPoints?: string[];
  products?: Array<{ name: string; price?: string; description?: string; category?: string }>;
  menuItems?: Array<{ name: string; price?: string; description?: string; category?: string }>;
  treatments?: Array<{ name: string; price?: string; duration?: string }>;
  team?: Array<{ name: string; role?: string }>;
  testimonials?: string[];
  projectsShowcase?: Array<{ name: string; client?: string; description?: string }>;
  longCopy?: {
    aboutUs?: string;
    companyStory?: string;
    vision?: string;
    contactPageText?: string;
  };
  commerce?: {
    delivery?: boolean;
    acceptsReservations?: boolean;
    paymentMethods?: string[];
    shippingInfo?: string;
    priceRange?: string;
    cuisine?: string[];
  };

  /** Marker so server-side code can tell this brief came from the wizard. */
  briefSource: "wizard";
  /**
   * Signal to server-auto-brief policy that a full brief is already present.
   * Keeps naming aligned with the LLM-generated brief's `briefQuality` field.
   */
  briefQuality: "full";
}

export function buildWizardBrief(answers: WizardAnswers): WizardBrief {
  const primaryLabel = answers.siteType[0];
  const categoryId = primaryLabel ? CATEGORY_LABEL_TO_ID[primaryLabel] : undefined;
  const businessType = categoryId ? CATEGORY_TO_BUSINESS_TYPE[categoryId] : undefined;

  const toneAndVoice = answers.tone ? [answers.tone] : [];

  const styleKeywords: string[] = [];
  if (answers.designStyle) styleKeywords.push(answers.designStyle);
  if (answers.tone && answers.tone !== answers.designStyle) styleKeywords.push(answers.tone);

  const ctaText = answers.primaryCta.trim();
  const ctaId = ctaText ? PRIMARY_CTA_ENUM[ctaText] ?? "custom" : undefined;

  const mustHave = uniq(answers.mustHave);
  const pages: Array<{ name: string; path: string }> = [];
  const seenPaths = new Set<string>();
  if (!seenPaths.has("/")) {
    pages.push({ name: "Start", path: "/" });
    seenPaths.add("/");
  }
  for (const label of mustHave) {
    const stub = MUST_HAVE_TO_PAGE[label];
    if (stub && !seenPaths.has(stub.path)) {
      pages.push(stub);
      seenPaths.add(stub.path);
    }
  }

  const brief: WizardBrief = {
    briefSource: "wizard",
    briefQuality: "full",
  };

  if (primaryLabel) brief.industry = primaryLabel;
  if (businessType) brief.businessType = businessType;
  if (ctaText) brief.primaryCallToAction = ctaText;
  if (ctaId) brief.primaryCallToActionId = ctaId;
  if (toneAndVoice.length) brief.toneAndVoice = toneAndVoice;
  if (answers.tagline.trim()) brief.tagline = answers.tagline.trim();
  if (mustHave.length) brief.mustHave = mustHave;
  if (pages.length > 1) brief.pages = pages;
  if (answers.avoid.trim()) brief.avoid = answers.avoid.trim();
  if (answers.imagery.length) brief.imagery = [...answers.imagery];

  // Split the single offer textarea into structured fields: pitch (first
  // sentence) + audience + USP. The free-text value remains available via
  // fieldMessages[offer] so the LLM can still enrich.
  const offerTrimmed = answers.offer.trim();
  if (offerTrimmed) {
    const firstSentence = offerTrimmed.split(/(?<=[.!?])\s+/)[0] || offerTrimmed;
    brief.oneSentencePitch = firstSentence.slice(0, 180);
  }
  if (answers.targetAudience.trim()) brief.targetAudience = answers.targetAudience.trim();
  if (answers.uniqueSellingPoints.length) brief.uniqueValueProposition = [...answers.uniqueSellingPoints];

  // Per-branch testimonials split so Deep Brief downstream doesn't have to
  // guess what the user meant by "omdömen".
  const testimonialsText = answers.testimonials.trim();
  if (testimonialsText) {
    switch (categoryId) {
      case "consulting":
      case "tech":
        brief.caseStudiesSummary = testimonialsText;
        break;
      case "landing":
      case "blog":
      case "other":
        brief.coreMessage = testimonialsText;
        break;
      default:
        brief.testimonialsSummary = testimonialsText;
    }
  }

  const visualDirection: WizardBrief["visualDirection"] = {};
  if (styleKeywords.length) visualDirection.styleKeywords = styleKeywords;
  if (answers.imagery.length) visualDirection.imagery = [...answers.imagery];
  if (answers.avoid.trim()) visualDirection.avoid = answers.avoid.trim();
  if (Object.keys(visualDirection).length > 0) brief.visualDirection = visualDirection;

  // ── Creative parity: fill projectTitle / brandName so the model doesn't
  // fall back to the generic "Website" (see system-prompt.ts line 813). ──
  const company = answers.companyName.trim();
  if (company) {
    brief.projectTitle = company;
    brief.brandName = company;
    brief.siteName = company;
  }

  // Motion + quality bar: derive from tone/designStyle so we stop hitting
  // the default neutral path in resolveGuidanceBlocks.
  const toneLower = (answers.tone || "").toLowerCase();
  const styleLower = (answers.designStyle || "").toLowerCase();
  const hay = `${toneLower} ${styleLower} ${answers.tagline.toLowerCase()}`;
  if (/\b(bold|dramatic|vågad|vågat|cinematic|premium|lyx|luxury|editorial)\b/.test(hay)) {
    brief.qualityBar = "premium";
  } else if (/\b(clean|minimal|lugn|enkel|prydlig|ren)\b/.test(hay)) {
    brief.qualityBar = "clean";
  } else if (/\b(energisk|lekfull|playful|kreativ|expressive|vibrant)\b/.test(hay)) {
    brief.qualityBar = "bold-dramatic";
  }
  if (/\b(minimal|lugn|dämpad|stillsam|still|softly)\b/.test(hay)) {
    brief.motionLevel = "minimal";
  } else if (/\b(dynamic|cinematic|dramatic|energisk|bold|vibrant)\b/.test(hay)) {
    brief.motionLevel = "lively";
  } else if (brief.qualityBar === "clean") {
    brief.motionLevel = "minimal";
  } else if (brief.qualityBar) {
    brief.motionLevel = "moderate";
  }

  // ── Facts ────────────────────────────────────────────────────────────
  const contact: NonNullable<WizardBrief["contact"]> = {};
  if (answers.phone.trim()) contact.phone = answers.phone.trim();
  if (answers.email.trim()) contact.email = answers.email.trim();
  if (answers.address.trim()) contact.address = answers.address.trim();
  if (answers.openingHours?.trim()) contact.openingHours = answers.openingHours.trim();
  if (answers.bookingUrl?.trim()) contact.bookingUrl = answers.bookingUrl.trim();
  if (Object.keys(contact).length > 0) brief.contact = contact;

  const services = uniq(answers.services || []);
  if (services.length) brief.services = services;

  const usps = uniq(answers.uniqueSellingPoints || []);
  if (usps.length) brief.uniqueSellingPoints = usps;

  const products = (answers.products || [])
    .filter((p) => p?.name?.trim())
    .map((p) => ({
      name: p.name.trim(),
      price: p.price?.trim() || undefined,
      description: p.description?.trim() || undefined,
      category: p.category?.trim() || undefined,
    }));
  if (products.length) brief.products = products;

  const menu = (answers.menuItems || [])
    .filter((m) => m?.name?.trim())
    .map((m) => ({
      name: m.name.trim(),
      price: m.price?.trim() || undefined,
      description: m.description?.trim() || undefined,
      category: m.category?.trim() || undefined,
    }));
  if (menu.length) brief.menuItems = menu;

  const treatments = (answers.treatments || [])
    .filter((t) => t?.name?.trim())
    .map((t) => ({
      name: t.name.trim(),
      price: t.price?.trim() || undefined,
      duration: t.duration?.trim() || undefined,
    }));
  if (treatments.length) brief.treatments = treatments;

  const team = (answers.teamMembers || [])
    .filter((m) => m?.name?.trim())
    .map((m) => ({
      name: m.name.trim(),
      role: m.role?.trim() || undefined,
    }));
  if (team.length) brief.team = team;

  const projects = (answers.projects || [])
    .filter((p) => p?.name?.trim())
    .map((p) => ({
      name: p.name.trim(),
      client: p.client?.trim() || undefined,
      description: p.description?.trim() || undefined,
    }));
  if (projects.length) brief.projectsShowcase = projects;

  // testimonials: also expose as an array for the fact-block; we keep the
  // branch-specific summary fields above for backwards compat.
  const tm = answers.testimonials.trim();
  if (tm) {
    const lines = tm
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
    brief.testimonials = lines.length > 1 ? lines.slice(0, 8) : [tm];
  }

  const longCopy: NonNullable<WizardBrief["longCopy"]> = {};
  if (answers.aboutUs.trim()) longCopy.aboutUs = answers.aboutUs.trim();
  if (answers.companyStory.trim()) longCopy.companyStory = answers.companyStory.trim();
  if (answers.vision.trim()) longCopy.vision = answers.vision.trim();
  if (answers.contactPageText.trim()) longCopy.contactPageText = answers.contactPageText.trim();
  if (Object.keys(longCopy).length > 0) brief.longCopy = longCopy;

  const commerce: NonNullable<WizardBrief["commerce"]> = {};
  if (typeof answers.delivery === "boolean") commerce.delivery = answers.delivery;
  if (typeof answers.acceptsReservations === "boolean") commerce.acceptsReservations = answers.acceptsReservations;
  if (answers.paymentMethods?.length) commerce.paymentMethods = uniq(answers.paymentMethods);
  if (answers.shippingInfo?.trim()) commerce.shippingInfo = answers.shippingInfo.trim();
  if (answers.priceRange?.trim()) commerce.priceRange = answers.priceRange.trim();
  if (answers.cuisine?.length) commerce.cuisine = uniq(answers.cuisine);
  if (Object.keys(commerce).length > 0) brief.commerce = commerce;

  return brief;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

/**
 * Short, creative one-liner sent as the user message when the wizard
 * completes. Matches the raw-prompt flow's tone (short, opinionated) while
 * all structured ground truth lives in `meta.brief`.
 *
 * Avoid dumping facts here — the model will get them via the rendered
 * "## Facts" blocks in buildDynamicContext. The goal of this prompt is to
 * nudge the model toward bold, non-generic design decisions.
 */
export function buildWizardCreativePrompt(
  answers: WizardAnswers,
  brief: WizardBrief,
): string {
  const company = answers.companyName.trim() || brief.brandName || "företaget";
  const categoryLabel =
    answers.siteType[0] || (brief.industry as string | undefined) || "en modern sajt";
  const pitch =
    answers.tagline.trim() ||
    brief.oneSentencePitch ||
    brief.tagline ||
    answers.offer.split(/(?<=[.!?])\s+/)[0]?.trim() ||
    "";

  const cta = answers.primaryCta.trim();
  const styleBits = [answers.designStyle, answers.tone].map((s) => s?.trim()).filter(Boolean);
  const moodHint =
    brief.qualityBar === "premium"
      ? "premium, cinematic, lyxig"
      : brief.qualityBar === "bold-dramatic"
        ? "vågad, uttrycksfull, iögonfallande"
        : brief.qualityBar === "clean"
          ? "minimalistisk, luftig, apple-like"
          : "modern, kreativ, minnesvärd";
  const motionHint =
    brief.motionLevel === "lively"
      ? "levande animationer och micro-interaktioner"
      : brief.motionLevel === "minimal"
        ? "subtil rörelse, lugn rytm"
        : "balanserad rörelse";

  const lines: string[] = [];
  lines.push(
    `Bygg en ${moodHint} sajt åt ${company} (${categoryLabel}).`,
    pitch ? `Kärnan: ${pitch}` : "",
    `Gör hero'n iögonfallande och sektionerna varierade — inga generiska mallar.`,
    `Design: ${styleBits.length ? styleBits.join(", ") : "ta ut svängarna"}. Rörelse: ${motionHint}.`,
    cta ? `Primär CTA: "${cta}".` : "",
    `Använd fakta och media från briefen exakt som de står.`,
  );

  return lines.filter(Boolean).join(" ");
}
