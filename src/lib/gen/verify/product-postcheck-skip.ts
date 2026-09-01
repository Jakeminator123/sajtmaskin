/**
 * Shared Product Postcheck skip wording. Kept out of `product-postcheck.ts`
 * so labels and the quality-gate overlay can format a skip without pulling
 * Playwright / capture.
 */

export const PRODUCT_POSTCHECK_SKIPPED_KIND = "product_postcheck_skipped" as const;

export function formatProductPostcheckSkippedMessage(reason: string): string {
  const trimmed = reason.trim() || "unknown";
  return `F2 Product Postcheck skipped (${PRODUCT_POSTCHECK_SKIPPED_KIND}: ${trimmed}).`;
}

export function productPostcheckSkipReasonFromMessage(
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const structured = message.match(
    /product_postcheck_skipped:\s*([a-z0-9_]+)/i,
  );
  if (structured?.[1]) return structured[1];
  const wrapped = message.match(
    /Product Postcheck skipped \(([a-z0-9_]+)\)/i,
  );
  return wrapped?.[1] ?? null;
}

/**
 * Vem misslyckades — kontrollen eller produkten?
 *
 * `infrastructure` betyder att kontrollens EGEN apparat dog: Chromium gick inte
 * att starta, processen försvann mitt i, skärmdumpen kunde inte tas, eller vår
 * loggläsning brast. Utfallet bär då noll information om sajten. `product`
 * betyder att skipen säger något om just den här versionen — previewn låg nere,
 * URL:en var otillåten, sidan gick inte att öppna.
 *
 * Skillnaden finns för att `SM-072` gjorde den akut: `/tmp`-svält i lambdan
 * dödade Chromium mitt i postchecken, versionen stämplades Degraderad, och
 * gränssnittet berättade för användaren att hens fullt friska sajt hade brister.
 * Prod 2026-09-01: fem `playwright_unavailable`/`runtime_error` på 36 minuter,
 * alla på versioner med `verification_state: passed` och `preview_success: true`.
 */
export type ProductPostcheckSkipClass = "infrastructure" | "product";

/**
 * Bara orsaker där felet bevisligen ligger i kontrollkedjan står här.
 *
 * Listan är avsiktligt en allowlist och inte en denylist: en okänd eller ny
 * orsak klassas som `product` och behåller därför den strängare Degraderad-
 * behandlingen. Att lägga till en rad här är ett medvetet beslut om att orsaken
 * inte kan säga något om produkten — aldrig en default.
 */
const INFRASTRUCTURE_SKIP_REASONS: ReadonlySet<string> = new Set([
  // Chromium gick inte att starta (saknad binär, launch kastade).
  "playwright_unavailable",
  // Chromium startade men processen dog före navigering — `/tmp`-svältfallet.
  // Egen orsak, inte catch-all-`runtime_error`: den senare returneras även för
  // varje oidentifierat fel, och ett okänt fel kan mycket väl vara ett riktigt
  // produktfel som kastade.
  "browser_crashed",
  // Sidan levde men JPEG-fångsten brast.
  "capture_failed",
  // Operatören har stängt av postchecken. Inget om sajten.
  "feature_disabled",
]);

export function classifyProductPostcheckSkipReason(
  reason: string | null | undefined,
): ProductPostcheckSkipClass {
  const normalized = reason?.trim().toLowerCase() ?? "";
  return INFRASTRUCTURE_SKIP_REASONS.has(normalized) ? "infrastructure" : "product";
}

export function isInfrastructureSkipReason(reason: string | null | undefined): boolean {
  return classifyProductPostcheckSkipReason(reason) === "infrastructure";
}
