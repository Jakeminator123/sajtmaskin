import type { StyleChoice } from "@/lib/builder/init-build-choices";
import type { ScaffoldId } from "../scaffolds/types";
import { getVariantById } from "./registry";
import type { ScaffoldVariant } from "./types";

/**
 * Byggval "Stil" → a concrete variant per scaffold.
 *
 * Before this map the style chips only fed `styleKeywordsHint` into the variant
 * scorer, where each keyword hit is worth +3 and competes with the user's own
 * prompt words. Picking "Minimal" for a prompt full of corporate vocabulary
 * therefore still landed on `corporate-grid` — the choice read as a suggestion.
 * Resolving to an id here lets the caller pin it instead.
 *
 * The map is deliberately PARTIAL. A scaffold with two variants cannot honestly
 * express five styles, and forcing one (editorial → a cyber-security app shell)
 * would be worse than not pinning: an absent entry falls back to the ordinary
 * matcher, which still sees `styleKeywordsHint`.
 */
const STYLE_CHOICE_VARIANTS: Partial<
  Record<ScaffoldId, Partial<Record<Exclude<StyleChoice, "auto">, string>>>
> = {
  "landing-page": {
    warm: "warm-local",
    corporate: "corporate-grid",
    bold: "bold-startup",
    editorial: "editorial-lux",
    minimal: "minimalist-mag",
  },
  "base-nextjs": {
    warm: "fresh-mint",
    corporate: "starter-neutral",
    bold: "playground-mono",
    editorial: "studio-soft",
    minimal: "starter-neutral",
  },
  "saas-landing": {
    warm: "friendly-saas",
    corporate: "friendly-saas",
    bold: "dev-terminal",
    // minimal deliberately unmapped: the only dark/dense option is Dev Terminal,
    // which contradicts "minimal". Matcher + styleKeywordsHint decide.
  },
  portfolio: {
    corporate: "minimal-studio",
    bold: "showcase-bold",
    editorial: "showcase-bold",
    minimal: "minimal-studio",
  },
  blog: {
    warm: "editorial-serif",
    corporate: "tech-minimal",
    editorial: "editorial-serif",
    minimal: "tech-minimal",
  },
  ecommerce: {
    warm: "boutique-warm",
    corporate: "megastore-clean",
    bold: "streetwear-bold",
    minimal: "megastore-clean",
  },
  dashboard: {
    corporate: "glass-frosted",
    bold: "dense-terminal",
    // minimal deliberately unmapped: Dense Terminal is dense/dark/ops — the
    // opposite of minimal. Matcher + styleKeywordsHint decide.
  },
  "app-shell": {
    corporate: "clean-utility",
    bold: "immersive-dark",
    minimal: "clean-utility",
  },
  "auth-pages": {
    corporate: "clean-auth",
    bold: "glass-modern",
    minimal: "clean-auth",
  },
};

/**
 * The variant a style choice pins for this scaffold, or `null` when the pair has
 * no honest match and the matcher should decide.
 *
 * Resolution goes through `getVariantById` rather than returning the raw id, so a
 * renamed or deleted variant file degrades to "no pin" instead of pinning an id
 * that no longer loads.
 */
export function resolveVariantForStyleChoice(
  scaffoldId: string | null | undefined,
  styleChoice: string | null | undefined,
): ScaffoldVariant | null {
  if (!scaffoldId || !styleChoice || styleChoice === "auto") return null;
  const byStyle = STYLE_CHOICE_VARIANTS[scaffoldId as ScaffoldId];
  const variantId = byStyle?.[styleChoice as Exclude<StyleChoice, "auto">];
  if (!variantId) return null;
  return getVariantById(scaffoldId as ScaffoldId, variantId);
}

/** Exposed for the integrity test that walks every mapped pair. */
export const STYLE_CHOICE_VARIANTS_FOR_TEST = STYLE_CHOICE_VARIANTS;
