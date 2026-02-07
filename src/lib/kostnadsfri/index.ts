/**
 * Kostnadsfri mail-link flow - helpers, types and slug generation
 *
 * This module is completely isolated from the rest of the app.
 * It handles the "kostnadsfri" (free) website generation flow
 * where companies arrive via a unique mail link.
 */

import crypto from "crypto";
import type { KostnadsfriPage } from "@/lib/db/services";

// ============================================================================
// TYPES
// ============================================================================

/** Public company data returned after successful password verification */
export interface KostnadsfriCompanyData {
  slug: string;
  companyName: string;
  industry: string | null;
  website: string | null;
  contactEmail: string | null;
  contactName: string | null;
  extraData: Record<string, unknown> | null;
}

/** Data collected by the mini-wizard */
export interface MiniWizardData {
  // Pre-filled from token
  companyName: string;
  industry: string;
  website: string;
  // User fills in
  location: string;
  description: string;
  purposes: string[];
  targetAudience: string;
  usp: string;
  designVibe: string;
  paletteName: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent: string | null;
}

/** Request body for creating a kostnadsfri page (admin API) */
export interface CreateKostnadsfriRequest {
  companyName: string;
  industry?: string;
  website?: string;
  contactEmail?: string;
  contactName?: string;
  password: string;
  expiresInDays?: number;
}

/** Request body for verifying password */
export interface VerifyPasswordRequest {
  password: string;
}

// ============================================================================
// SLUG GENERATION
// ============================================================================

/**
 * Generate a URL-safe slug from a company name.
 * "IKEA AB" -> "ikea-ab"
 * "Café Södermalm" -> "cafe-sodermalm"
 */
export function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    // Replace Swedish characters
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/ü/g, "u")
    // Replace non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, "")
    // Collapse multiple hyphens
    .replace(/-{2,}/g, "-");
}

// ============================================================================
// SLUG -> COMPANY NAME (reverse mapping)
// ============================================================================

/** Known Swedish business suffixes that should be uppercased */
const BUSINESS_SUFFIXES = new Set(["ab", "hb", "kb", "ek", "ef"]);

/**
 * Derive a display-friendly company name from a slug.
 * "ikea-ab" -> "Ikea AB"
 * "cafe-sodermalm" -> "Cafe Sodermalm"
 * "alfa-rekrytering-ab" -> "Alfa Rekrytering AB"
 */
export function companyNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) =>
      BUSINESS_SUFFIXES.has(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extract public company data from a DB record (strips password hash etc.)
 */
export function extractCompanyData(page: KostnadsfriPage): KostnadsfriCompanyData {
  return {
    slug: page.slug,
    companyName: page.company_name,
    industry: page.industry,
    website: page.website,
    contactEmail: page.contact_email,
    contactName: page.contact_name,
    extraData: page.extra_data as Record<string, unknown> | null,
  };
}

/**
 * Build company data from just a slug (no DB record needed).
 * Company name is derived from the slug, other fields are null.
 */
export function companyDataFromSlug(slug: string): KostnadsfriCompanyData {
  return {
    slug,
    companyName: companyNameFromSlug(slug),
    industry: null,
    website: null,
    contactEmail: null,
    contactName: null,
    extraData: null,
  };
}

/**
 * Verify a password against the deterministic generator (no DB needed).
 * Returns true if the password matches what generatePassword would produce.
 */
export function verifyDeterministicPassword(slug: string, password: string): boolean {
  const expected = generatePassword(slug);
  return password === expected;
}

// ============================================================================
// LABEL MAPS (mirrors PromptWizardModalV2 constants)
// ============================================================================

const INDUSTRY_LABELS: Record<string, string> = {
  cafe: "Café/Konditori",
  restaurant: "Restaurang/Bar",
  retail: "Butik/Detaljhandel",
  tech: "Tech/IT-företag",
  consulting: "Konsult/Tjänster",
  health: "Hälsa/Wellness",
  creative: "Kreativ byrå",
  education: "Utbildning",
  ecommerce: "E-handel",
  realestate: "Fastigheter",
  other: "Annat",
};

const PURPOSE_LABELS: Record<string, string> = {
  sell: "Sälja",
  leads: "Leads",
  portfolio: "Portfolio",
  inform: "Informera",
  brand: "Varumärke",
  booking: "Bokningar",
  conversion: "Konvertering",
  rebrand: "Rebrand",
};

const VIBE_LABELS: Record<string, string> = {
  modern: "Modern & Clean",
  playful: "Playful & Fun",
  brutalist: "Brutalist",
  luxury: "Luxury",
  tech: "Futuristic",
  minimal: "Minimal",
};

// ============================================================================
// PAGE STRUCTURE (industry-aware, purpose-aware)
// ============================================================================

/** Suggested pages based on industry and purposes */
const INDUSTRY_PAGES: Record<string, string[]> = {
  cafe: ["Hem", "Meny", "Om oss", "Hitta hit"],
  restaurant: ["Hem", "Meny", "Om oss", "Boka bord", "Kontakt"],
  retail: ["Hem", "Produkter", "Om oss", "Kontakt"],
  tech: ["Hem", "Tjänster", "Case", "Om oss", "Kontakt"],
  consulting: ["Hem", "Tjänster", "Om oss", "Kunder", "Kontakt"],
  health: ["Hem", "Behandlingar", "Om oss", "Boka tid", "Kontakt"],
  creative: ["Hem", "Portfolio", "Tjänster", "Om oss", "Kontakt"],
  education: ["Hem", "Kurser", "Om oss", "Kontakt"],
  ecommerce: ["Hem", "Produkter", "Om oss", "FAQ", "Kontakt"],
  realestate: ["Hem", "Objekt", "Tjänster", "Om oss", "Kontakt"],
};

const PURPOSE_SECTIONS: Record<string, string[]> = {
  sell: ["product showcase", "pricing / plans", "testimonials", "trust badges"],
  leads: ["lead capture form", "benefits / value proposition", "social proof", "newsletter signup"],
  portfolio: ["project gallery / case studies", "client logos", "process overview"],
  inform: ["knowledge / resource section", "FAQ", "blog / articles preview"],
  brand: ["brand story", "mission / values", "team", "visual identity showcase"],
  booking: ["booking / calendar widget", "service overview", "availability info"],
  conversion: ["clear CTA above the fold", "comparison table", "urgency / scarcity signals", "testimonials"],
  rebrand: ["before/after visual", "new brand story", "updated services", "press / media"],
};

/**
 * Determine the recommended page structure for the company.
 * Returns page names and extra section suggestions.
 */
function resolvePageStructure(
  industry: string,
  purposes: string[],
): { pages: string[]; extraSections: string[] } {
  const base = INDUSTRY_PAGES[industry] || ["Hem", "Om oss", "Tjänster", "Kontakt"];
  const extraSections: string[] = [];
  for (const purpose of purposes) {
    const sections = PURPOSE_SECTIONS[purpose];
    if (sections) {
      for (const s of sections) {
        if (!extraSections.includes(s)) extraSections.push(s);
      }
    }
  }
  return { pages: base, extraSections: extraSections.slice(0, 8) };
}

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * Build a rich, structured prompt from wizard data for the builder.
 *
 * Designed to produce enough detail (~800-1200 chars) so the downstream
 * pipeline (brief generation, dynamic instructions, spec file) interprets
 * this as a "detailed request" and generates a multi-page brief with
 * 10-15+ sections instead of a minimal one-pager.
 *
 * The prompt includes:
 *  - Explicit multi-page structure with named pages
 *  - Purpose-driven section suggestions
 *  - Full design direction with tone, colors, and typography hints
 *  - Scope override to prevent brief model from down-scoping
 */
export function buildPromptFromWizardData(data: MiniWizardData): string {
  const industryLabel = INDUSTRY_LABELS[data.industry] || data.industry || "general";
  const vibeLabel = VIBE_LABELS[data.designVibe] || data.designVibe || "Modern & Clean";
  const { pages, extraSections } = resolvePageStructure(data.industry, data.purposes);

  const sections: string[] = [];

  // 1. Core request — explicit multi-page signal
  sections.push(
    `Build a professional, multi-page website for "${data.companyName}", a ${industryLabel} company` +
      (data.location ? ` based in ${data.location}` : "") +
      `. The site should feel polished, premium, and conversion-oriented with rich content across multiple pages.`,
  );

  // 2. Business profile (who they are, goals, audience)
  const businessContext: string[] = [];
  if (data.description) businessContext.push(`About the company: ${data.description}`);
  if (data.usp) businessContext.push(`Unique selling point (USP): ${data.usp}`);
  if (data.targetAudience) businessContext.push(`Target audience: ${data.targetAudience}`);
  if (data.purposes.length > 0) {
    const purposeLabels = data.purposes.map((p) => PURPOSE_LABELS[p] || p);
    businessContext.push(`Primary website goals: ${purposeLabels.join(", ")}`);
  }
  if (businessContext.length > 0) {
    sections.push(`\nBusiness profile:\n${businessContext.map((l) => `- ${l}`).join("\n")}`);
  }

  // 3. Page structure — named pages with purpose
  const pageLines = pages.map((p) => `- ${p}`).join("\n");
  sections.push(
    `\nSite structure (pages to include):\n${pageLines}\n\nEach page should have its own clear purpose, unique hero/header, and relevant content sections. Use a shared navigation bar and footer across all pages.`,
  );

  // 4. Recommended sections based on purposes
  if (extraSections.length > 0) {
    sections.push(
      `\nRecommended sections to include across the site:\n${extraSections.map((s) => `- ${s}`).join("\n")}`,
    );
  }

  // 5. Design direction (style, colors, typography)
  const designParts: string[] = [];
  designParts.push(`Visual style / vibe: ${vibeLabel}`);
  if (data.colorPrimary || data.colorSecondary || data.colorAccent) {
    const colors = [
      data.colorPrimary && `primary ${data.colorPrimary}`,
      data.colorSecondary && `secondary ${data.colorSecondary}`,
      data.colorAccent && `accent ${data.colorAccent}`,
    ].filter(Boolean);
    designParts.push(`Color palette: ${colors.join(", ")}`);
  } else if (data.paletteName) {
    designParts.push(`Color palette: ${data.paletteName}`);
  }
  designParts.push("Use a distinct font pairing that fits the brand identity");
  designParts.push("Apply layered backgrounds, gradients, and section bands for visual depth");
  sections.push(`\nDesign direction:\n${designParts.map((l) => `- ${l}`).join("\n")}`);

  // 6. Existing site context
  if (data.website) {
    sections.push(
      `\nExisting website:\n- Current site: ${data.website}\n- Analyze the existing site for content inspiration, brand voice, and structure reference\n- The new site should be a significant upgrade in design quality and user experience`,
    );
  }

  // 7. Content & requirements
  sections.push(
    `\nContent & requirements:\n- All text content must be in Swedish\n- Premium, trustworthy design with attention to detail\n- Include realistic placeholder content (not lorem ipsum) that matches the industry\n- Every page should include relevant images and icons\n- Mobile-first responsive design\n- Smooth scroll-reveal animations and tasteful hover states`,
  );

  // 8. Explicit scope override — prevents brief model from down-scoping
  sections.push(
    `\nScope: This is a comprehensive, multi-page company website (${pages.length} pages). Do NOT reduce this to a single-page site. Each page should be fully fleshed out with multiple content sections, proper navigation between pages, and a professional footer. Aim for 8-15 sections total across all pages.`,
  );

  return sections.join("\n");
}

// ============================================================================
// PASSWORD GENERATION
// ============================================================================

/**
 * Deterministic password generator.
 *
 * Given the same company slug and secret key, always produces the same password.
 * Uses HMAC-SHA256 to derive a base62-encoded password from the slug.
 *
 * Example: generatePassword("ikea-ab") -> "kR7mXp2q" (8 chars, alphanumeric)
 *
 * The secret key comes from KOSTNADSFRI_PASSWORD_SEED env var.
 * If not set, falls back to KOSTNADSFRI_API_KEY.
 */
export function generatePassword(slug: string, secretKey?: string): string {
  const key = secretKey || process.env.KOSTNADSFRI_PASSWORD_SEED || process.env.KOSTNADSFRI_API_KEY || "default-seed";
  const hmac = crypto.createHmac("sha256", key).update(slug).digest("hex");
  // Take first 12 hex chars and convert to a readable base62-ish password
  return hexToReadablePassword(hmac.slice(0, 12));
}

/**
 * Convert hex string to a readable alphanumeric password.
 * Produces 8 characters from 12 hex chars (48 bits of entropy).
 */
function hexToReadablePassword(hex: string): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let num = BigInt(`0x${hex}`);
  const base = BigInt(chars.length);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Number(num % base)];
    num = num / base;
  }
  return result;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a kostnadsfri page is accessible (not expired or consumed).
 */
export function isPageAccessible(page: KostnadsfriPage): {
  accessible: boolean;
  reason?: string;
} {
  if (page.status === "expired") {
    return { accessible: false, reason: "Denna länk har gått ut." };
  }

  if (page.expires_at && new Date(page.expires_at) < new Date()) {
    return { accessible: false, reason: "Denna länk har gått ut." };
  }

  // Consumed pages can still be accessed (they just can't generate again)
  // This allows re-visits within the same session

  return { accessible: true };
}
