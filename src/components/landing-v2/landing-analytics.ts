import { track } from "@vercel/analytics"

/**
 * Startsides-events via redan monterad Vercel Analytics.
 * Skicka bara fasta nycklar — aldrig prompttext, e-post eller fri indata.
 */
export const HOMEPAGE_ANALYTICS_EVENTS = {
  cta: "homepage_cta",
  method: "homepage_method",
  pricing: "homepage_pricing",
  auth: "homepage_auth",
  examples: "homepage_examples",
} as const

export type HomepageAnalyticsEvent =
  (typeof HOMEPAGE_ANALYTICS_EVENTS)[keyof typeof HOMEPAGE_ANALYTICS_EVENTS]

const ALLOWED_EVENT_VALUES = new Set([
  "nav",
  "hero",
  "bottom",
  "fritext",
  "analyserad",
  "template",
  "audit",
  "starter",
  "popular",
  "pro",
  "login",
  "register",
  "site_type",
  "templates_link",
  "start",
])

function sanitizeAnalyticsProps(
  data?: Record<string, string>,
): Record<string, string> | undefined {
  if (!data) return undefined
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_EVENT_VALUES.has(value)) {
      next[key] = value
    }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function trackHomepageEvent(
  name: HomepageAnalyticsEvent,
  data?: Record<string, string>,
): void {
  try {
    track(name, sanitizeAnalyticsProps(data))
  } catch {
    // Analytics får aldrig blockera startsidan.
  }
}
