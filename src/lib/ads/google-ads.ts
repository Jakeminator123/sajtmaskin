import { sanitizeEnvString } from "@/lib/env-affirmative";

export const GOOGLE_ADS_CONVERSION_EVENTS = [
  "builder_start",
  "account_created",
  "first_generation",
] as const;

export type GoogleAdsConversionEvent = (typeof GOOGLE_ADS_CONVERSION_EVENTS)[number];

export interface GoogleAdsConfig {
  adsId: string | null;
  labels: Record<GoogleAdsConversionEvent, string | null>;
}

const ADS_ID_RE = /^AW-\d+$/;
const LABEL_RE = /^[A-Za-z0-9_-]+$/;

function parseAdsId(raw: string | undefined): string | null {
  const value = sanitizeEnvString(raw);
  if (!value) return null;
  return ADS_ID_RE.test(value) ? value : null;
}

function parseLabel(raw: string | undefined): string | null {
  const value = sanitizeEnvString(raw);
  if (!value) return null;
  if (value.includes("/") || value.startsWith("AW-")) return null;
  return LABEL_RE.test(value) ? value : null;
}

export function parseGoogleAdsEnv(input: {
  adsId?: string;
  builderStartLabel?: string;
  accountCreatedLabel?: string;
  firstGenerationLabel?: string;
}): GoogleAdsConfig {
  return {
    adsId: parseAdsId(input.adsId),
    labels: {
      builder_start: parseLabel(input.builderStartLabel),
      account_created: parseLabel(input.accountCreatedLabel),
      first_generation: parseLabel(input.firstGenerationLabel),
    },
  };
}

/**
 * Public Ads env is inlined at build. Read via static `process.env.NEXT_PUBLIC_*`
 * so Next can replace the keys; do not index `process.env` dynamically.
 */
export function getGoogleAdsConfig(): GoogleAdsConfig {
  return parseGoogleAdsEnv({
    adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    builderStartLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_BUILDER_START_LABEL,
    accountCreatedLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_ACCOUNT_CREATED_LABEL,
    firstGenerationLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_FIRST_GENERATION_LABEL,
  });
}

export function isGoogleAdsEnabled(config: GoogleAdsConfig = getGoogleAdsConfig()): boolean {
  return Boolean(config.adsId);
}

/** Full `send_to` (`AW-123/label`) or null when the account tag or that event label is unset. */
export function conversionId(
  event: GoogleAdsConversionEvent,
  config: GoogleAdsConfig = getGoogleAdsConfig(),
): string | null {
  if (!config.adsId) return null;
  const label = config.labels[event];
  if (!label) return null;
  return `${config.adsId}/${label}`;
}

export function isAdminAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
