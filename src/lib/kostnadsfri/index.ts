/**
 * Kostnadsfri mail-link flow - helpers, types and slug generation
 *
 * This module is completely isolated from the rest of the app.
 * It handles the "kostnadsfri" (free) website generation flow
 * where companies arrive via a unique mail link.
 */

import crypto from "crypto";
import {
  wizardIndustryLabel,
  wizardPurposeLabel,
  wizardVibeLabel,
} from "@/lib/builder/wizard-taxonomy";
import type { KostnadsfriPage } from "@/lib/db/services/shared";
import {
  extractKostnadsfriCompanyProfile,
  type KostnadsfriCompanyProfile,
} from "./company-profile";
import { companyNameFromSlug } from "./company-name";
import {
  extractKostnadsfriOpenClawConfig,
  type KostnadsfriOpenClawConfig,
} from "./openclaw-config";

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
  /**
   * Medvetet **ingen** rå `extraData` här. DTO:n går till browsern efter
   * lösenordsverifiering, och en post som skapades före allowlisten (eller
   * lades in för hand i databasen) kan bära personnummer och hemadresser i
   * `extra_data`. Bara typade, normaliserade projektioner exponeras.
   */
  openclawConfig: KostnadsfriOpenClawConfig | null;
  /**
   * Bolagsfakta från utskicksverktyget. Förifyller mini-wizarden; går aldrig
   * direkt in i generationsprompten (ägarbeslut 2026-09-15).
   */
  profile: KostnadsfriCompanyProfile | null;
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

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extract public company data from a DB record (strips password hash etc.)
 */
export function extractCompanyData(page: KostnadsfriPage): KostnadsfriCompanyData {
  const extraData = page.extra_data as Record<string, unknown> | null;
  return {
    slug: page.slug,
    companyName: page.company_name,
    industry: page.industry,
    website: page.website,
    contactEmail: page.contact_email,
    contactName: page.contact_name,
    openclawConfig: extractKostnadsfriOpenClawConfig(extraData),
    profile: extractKostnadsfriCompanyProfile(extraData),
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
    openclawConfig: null,
    profile: null,
  };
}

/**
 * Den andra vanliga kampanjvarianten av samma bolag: `foo` ↔ `foo-ab`.
 * Bara ett avslutande `-ab` — `lab` och `foo-ab-ab` rörs inte som specialfall
 * utöver den enda suffix-regeln. Tom stem efter strip ger `null`.
 */
export function abSiblingSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith("-ab")) {
    const stem = normalized.slice(0, -3);
    return stem || null;
  }
  return `${normalized}-ab`;
}

export function kostnadsfriPasswordSlugs(slug: string): string[] {
  const normalized = slug.trim().toLowerCase();
  const slugs = [normalized, abSiblingSlug(normalized)].filter((value): value is string =>
    Boolean(value),
  );
  return [...new Set(slugs)];
}

/**
 * Verify a password against the deterministic generator (no DB needed).
 * Accepts the HMAC for this slug **or** its `-ab` sibling, so a mail that
 * used "Nordbygg Entreprenad" still opens `/nordbygg-entreprenad-ab`.
 */
export function verifyDeterministicPassword(slug: string, password: string): boolean {
  return kostnadsfriPasswordSlugs(slug).some((candidate) => generatePassword(candidate) === password);
}

export function hasKostnadsfriPasswordSecret(secretKey?: string): boolean {
  return Boolean(secretKey || process.env.KOSTNADSFRI_PASSWORD_SEED || process.env.KOSTNADSFRI_API_KEY);
}

// ============================================================================
// PAGE STRUCTURE (industry-aware, purpose-aware)
// ============================================================================

/**
 * Sidnamn per bransch i **prioritetsordning** — inte ett sidantal.
 *
 * Id:na ägs av `src/lib/builder/wizard-taxonomy.ts` — lägg inte till ett fack
 * här utan att det finns där först.
 *
 * Listorna namngav tidigare 4–5 sidor och `buildPromptFromWizardData` skrev ut
 * antalet i prompten, vilket lät kampanjflödet sätta ett tal som ruttplanen och
 * byggvalsreglaget redan äger (ägarbeslut 2026-09-14, `docs/decisions/README.md`).
 * Antalet kommer nu enbart från `meta.pageCountHint`; ordningen här är
 * icke-bindande prioriteringar som ruttplanen kan välja inom det strukturerade
 * antalet. Prioriteringar som inte blir egna rutter kan bli sektioner i stället.
 */
const INDUSTRY_PAGES: Record<string, string[]> = {
  cafe: ["Hem", "Meny", "Hitta hit", "Om oss"],
  restaurant: ["Hem", "Meny", "Kontakt", "Boka bord", "Om oss"],
  retail: ["Hem", "Produkter", "Kontakt", "Om oss"],
  tech: ["Hem", "Tjänster", "Kontakt", "Case", "Om oss"],
  consulting: ["Hem", "Tjänster", "Kontakt", "Kunder", "Om oss"],
  health: ["Hem", "Behandlingar", "Kontakt", "Boka tid", "Om oss"],
  creative: ["Hem", "Portfolio", "Kontakt", "Tjänster", "Om oss"],
  education: ["Hem", "Kurser", "Kontakt", "Om oss"],
  ecommerce: ["Hem", "Produkter", "Kontakt", "FAQ", "Om oss"],
  realestate: ["Hem", "Objekt", "Kontakt", "Tjänster", "Om oss"],
};

const FALLBACK_INDUSTRY_PAGES = ["Hem", "Tjänster", "Kontakt", "Om oss"];

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
 * Determine ordered, non-binding page priorities for the company.
 */
function resolvePageStructure(
  industry: string,
  purposes: string[],
): { pages: string[]; extraSections: string[] } {
  const base = INDUSTRY_PAGES[industry] || FALLBACK_INDUSTRY_PAGES;
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
 * this as a detailed request without deciding the number of pages.
 *
 * The prompt includes:
 *  - Ordered, non-binding page priorities
 *  - Purpose-driven section suggestions
 *  - Full design direction with tone, colors, and typography hints
 *  - Scope guidance that defers to the structured page-count hint
 *
 * Läser bara `MiniWizardData`. `extra_data.profile` når aldrig den här
 * funktionen — profilen förifyller wizarden, och prompten byggs av utdata.
 *
 * Sidantalet finns medvetet inte i prompt-API:t eller prompttexten: ruttplanen
 * får det strukturerat via `meta.pageCountHint` från kampanjhandoffen. Annars
 * skulle prompten bli en andra sanning som kan motsäga ett uttryckligt byggval
 * på exempelvis en eller två sidor (ägarbeslut 2026-09-14).
 */
export function buildPromptFromWizardData(data: MiniWizardData): string {
  const industryLabel = wizardIndustryLabel(data.industry, data.industry || "general");
  const vibeLabel = wizardVibeLabel(data.designVibe, data.designVibe || "Modern & Clean");
  const { pages, extraSections } = resolvePageStructure(data.industry, data.purposes);

  const sections: string[] = [];

  // 1. Core request — detailed content without a page-count signal
  sections.push(
    `Build a professional website for "${data.companyName}", a ${industryLabel} company` +
      (data.location ? ` based in ${data.location}` : "") +
      `. The site should feel polished, premium, and conversion-oriented with rich content across the planned structure.`,
  );

  // 2. Business profile (who they are, goals, audience)
  const businessContext: string[] = [];
  if (data.description) businessContext.push(`About the company: ${data.description}`);
  if (data.usp) businessContext.push(`Unique selling point (USP): ${data.usp}`);
  if (data.targetAudience) businessContext.push(`Target audience: ${data.targetAudience}`);
  if (data.purposes.length > 0) {
    const purposeLabels = data.purposes.map((p) => wizardPurposeLabel(p));
    businessContext.push(`Primary website goals: ${purposeLabels.join(", ")}`);
  }
  if (businessContext.length > 0) {
    sections.push(`\nBusiness profile:\n${businessContext.map((l) => `- ${l}`).join("\n")}`);
  }

  // 3. Page priorities — suggestions only; structured meta owns the count
  const pageLines = pages.map((p) => `- ${p}`).join("\n");
  sections.push(
    `\nPage priorities (ordered suggestions, not an exact page list):\n${pageLines}\n\nUse these as content priorities within the page count supplied separately. Suggestions that do not become standalone routes should be represented as sections when relevant. Use a shared navigation bar and footer across the planned site.`,
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

  // 8. Scope guidance. The separately supplied structured hint is the only
  // page-count truth; the priorities above must not create orphan routes.
  sections.push(
    `\nScope: Follow the page count supplied separately as a strict constraint. Treat the page priorities above as non-binding route suggestions and adapt them to that count. Fully flesh out every planned page with relevant content sections, consistent navigation, and a professional footer. Aim for 8-15 sections total across the site.`,
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
  const key = secretKey || process.env.KOSTNADSFRI_PASSWORD_SEED || process.env.KOSTNADSFRI_API_KEY;
  if (!key) {
    throw new Error("KOSTNADSFRI_PASSWORD_SEED or KOSTNADSFRI_API_KEY is required to generate passwords.");
  }
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
