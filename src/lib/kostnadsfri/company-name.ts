/** Known Swedish business suffixes that should be uppercased */
const BUSINESS_SUFFIXES = new Set(["ab", "hb", "kb", "ek", "ef"]);

/**
 * Derive a display-friendly company name from a slug.
 * "ikea-ab" -> "Ikea AB"
 * "cafe-sodermalm" -> "Cafe Sodermalm"
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
