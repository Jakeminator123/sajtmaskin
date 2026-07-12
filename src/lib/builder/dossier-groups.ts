/**
 * Presentation-only grouping of dossiers by their EXISTING `capability`.
 *
 * This is NOT a new taxonomy: there are no schema fields, no runtime/selection
 * impact, and no persisted data. It is a thin UI map from a dossier's
 * `capability` (the same free-form string that already drives selection and
 * lives in `data/dossiers/_index/capability-map.json`) to a Swedish group
 * label, so the builder "Dossiers" popover can bucket rows under readable
 * headings. Unknown capabilities fall into "Övrigt".
 *
 * Source-of-truth for the capability list stays the dossier manifests; keep
 * this map in sync when a NEW capability is introduced (the unit test asserts
 * every capability in `capability-map.json` resolves to a non-"Övrigt" group).
 */

export interface DossierGroup {
  /** Stable, machine-readable group id. */
  id: string;
  /** Swedish, user-facing heading. */
  label: string;
}

export const DOSSIER_GROUPS = {
  "data-storage": { id: "data-storage", label: "Data & lagring" },
  payments: { id: "payments", label: "Betalningar" },
  auth: { id: "auth", label: "Inloggning & konton" },
  ai: { id: "ai", label: "AI" },
  email: { id: "email", label: "E-post & utskick" },
  analytics: { id: "analytics", label: "Analys & övervakning" },
  realtime: { id: "realtime", label: "Realtid" },
  content: { id: "content", label: "Innehåll & sektioner" },
  "visual-interaction": { id: "visual-interaction", label: "Visuellt & interaktion" },
  other: { id: "other", label: "Övrigt" },
} as const satisfies Record<string, DossierGroup>;

export type DossierGroupId = keyof typeof DOSSIER_GROUPS;

/** Stable render order for the groups in the UI. */
export const DOSSIER_GROUP_ORDER: DossierGroup[] = [
  DOSSIER_GROUPS["data-storage"],
  DOSSIER_GROUPS.payments,
  DOSSIER_GROUPS.auth,
  DOSSIER_GROUPS.ai,
  DOSSIER_GROUPS.email,
  DOSSIER_GROUPS.analytics,
  DOSSIER_GROUPS.realtime,
  DOSSIER_GROUPS.content,
  DOSSIER_GROUPS["visual-interaction"],
  DOSSIER_GROUPS.other,
];

/**
 * capability → group id. Every capability currently in
 * `data/dossiers/_index/capability-map.json` MUST have an entry here so it
 * lands in a real group instead of "Övrigt" (enforced by the unit test).
 */
const CAPABILITY_TO_GROUP_ID: Record<string, DossierGroupId> = {
  database: "data-storage",
  // Headless CMS (sanity-cms): storage/content-management, same bucket as
  // the database dossiers rather than the visual "content sections" group.
  cms: "data-storage",
  payments: "payments",
  // Recurring billing (paddle-billing) is money-flow — same user-facing bucket
  // as one-off payments.
  subscriptions: "payments",
  auth: "auth",
  // Supabase-specific auth (explicit-ask capability) shares the auth bucket.
  "supabase-auth": "auth",
  "ai-chat": "ai",
  "ai-tool-calling": "ai",
  "rag-chat": "ai",
  "image-generation": "ai",
  "contact-form": "email",
  "newsletter-subscribe": "email",
  analytics: "analytics",
  "error-tracking": "analytics",
  realtime: "realtime",
  // Content sections: informational page sections — copy/structure first
  // (stepper included per owner decision, despite its interactive surface).
  "cta-section": "content",
  "faq-section": "content",
  "pricing-section": "content",
  "testimonials-section": "content",
  "feature-grid": "content",
  "stats-counter": "content",
  stepper: "content",
  "logo-cloud": "content",
  // Visual & interaction: motion, 3D, games and data-viz — presentation is
  // the point, not the copy.
  carousel: "visual-interaction",
  marquee: "visual-interaction",
  "gallery-lightbox": "visual-interaction",
  "parallax-scroll": "visual-interaction",
  "parallax-pointer": "visual-interaction",
  "visual-3d": "visual-interaction",
  "physics-3d": "visual-interaction",
  "interactive-game": "visual-interaction",
  "dashboard-charts": "visual-interaction",
  "command-search": "visual-interaction",
};

/**
 * Resolve a dossier `capability` to its presentation group. Unknown / empty
 * capabilities fall into "Övrigt". Case-insensitive (capabilities are stored
 * lowercase).
 */
export function resolveDossierGroup(capability: string | null | undefined): DossierGroup {
  const key = typeof capability === "string" ? capability.trim().toLowerCase() : "";
  const groupId = CAPABILITY_TO_GROUP_ID[key] ?? "other";
  return DOSSIER_GROUPS[groupId];
}
