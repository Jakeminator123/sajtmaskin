/** Fields that belong only to Avancerad / full audit schema. Single list. */
export const AUDIT_ADVANCED_ONLY_FIELDS = [
  "business_profile",
  "market_context",
  "customer_segments",
  "competitive_landscape",
  "competitor_insights",
] as const;

export type AuditAdvancedOnlyField = (typeof AUDIT_ADVANCED_ONLY_FIELDS)[number];
