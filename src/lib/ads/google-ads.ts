import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/** Public Ads conversion IDs from the closed #1480 setup mail. Not secrets. */
export const GOOGLE_ADS_DEFAULT_ID = "AW-18458823435";
export const GOOGLE_ADS_DEFAULT_LABELS = {
  builder_start: "yesaCIbf1fscEIuW7eFE",
  account_created: "R5rICIPf1fscEIuW7eFE",
  first_generation: null,
} as const;

export const GOOGLE_ADS_PRODUCTION_HOSTS = [
  "sajtmaskin.se",
  "www.sajtmaskin.se",
  "sajtmaskin.com",
  "www.sajtmaskin.com",
  "sajtmaskin.vercel.app",
] as const;

export const GOOGLE_ADS_CONVERSION_EVENTS = [
  "builder_start",
  "account_created",
  "first_generation",
] as const;

export type GoogleAdsConversionEvent = (typeof GOOGLE_ADS_CONVERSION_EVENTS)[number];

export const GOOGLE_ADS_CUSTOM_EVENT_NAMES = {
  first_generation: "first_site_generated",
} as const;

export interface GoogleAdsConfig {
  adsId: string | null;
  labels: Record<GoogleAdsConversionEvent, string | null>;
}

const ADS_ID_RE = /^AW-\d+$/;
const LABEL_RE = /^[A-Za-z0-9_-]+$/;
const DISABLED_FLAGS = new Set(["0", "false", "no", "off", "n"]);

function parseAdsId(raw: string | undefined): string | null {
  const value = sanitizeEnvString(raw);
  if (!value) return GOOGLE_ADS_DEFAULT_ID;
  return ADS_ID_RE.test(value) ? value : null;
}

function parseLabel(raw: string | undefined, fallback: string | null): string | null {
  const value = sanitizeEnvString(raw);
  if (!value) return fallback;
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
      builder_start: parseLabel(input.builderStartLabel, GOOGLE_ADS_DEFAULT_LABELS.builder_start),
      account_created: parseLabel(
        input.accountCreatedLabel,
        GOOGLE_ADS_DEFAULT_LABELS.account_created,
      ),
      first_generation: parseLabel(
        input.firstGenerationLabel,
        GOOGLE_ADS_DEFAULT_LABELS.first_generation,
      ),
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

export function isGoogleAdsProductionHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return (GOOGLE_ADS_PRODUCTION_HOSTS as readonly string[]).includes(host);
}

function resolveAdsHostname(hostname?: string): string | undefined {
  if (hostname) return hostname;
  if (typeof window !== "undefined") return window.location.hostname;
  return undefined;
}

/**
 * Kill-switch `NEXT_PUBLIC_GOOGLE_ADS_ENABLED=0` always wins.
 * `=1` turns the tag on for QA on preview/localhost.
 * Otherwise the tag is on only for production hosts. Preview/localhost stay off.
 */
export function isGoogleAdsEnabled(
  config: GoogleAdsConfig = getGoogleAdsConfig(),
  hostname?: string,
): boolean {
  const flag = sanitizeEnvString(process.env.NEXT_PUBLIC_GOOGLE_ADS_ENABLED)?.toLowerCase();
  if (flag && DISABLED_FLAGS.has(flag)) return false;
  if (!config.adsId) return false;
  if (flag && isAffirmativeEnvValue(flag)) return true;
  const host = resolveAdsHostname(hostname);
  return host ? isGoogleAdsProductionHost(host) : false;
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

/** `first_generation` may still fire as `first_site_generated` without a conversion label. */
export function isGoogleAdsQueueableEvent(
  event: GoogleAdsConversionEvent,
  config: GoogleAdsConfig = getGoogleAdsConfig(),
): boolean {
  return Boolean(conversionId(event, config)) || event === "first_generation";
}

export function isAdminAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
