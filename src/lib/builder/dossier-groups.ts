/**
 * Presentation-only grouping of dossiers by their EXISTING `capability`.
 *
 * This is NOT a new taxonomy: there are no schema fields, no runtime/selection
 * impact, and no persisted data. It is a thin UI map from a dossier's
 * `capability` (the same free-form string that already drives selection and
 * lives in `data/dossiers/_index/capability-map.json`) to a Swedish group
 * label, so the builder "Byggblock" popover can bucket rows under readable
 * headings. Unknown capabilities fall into "Övrigt".
 *
 * Source-of-truth for the capability list stays the dossier manifests; keep
 * this map in sync when a NEW capability is introduced (the unit test asserts
 * every capability in `capability-map.json` resolves to a non-"Övrigt" group).
 *
 * Taxonomy 2026-07-22: groups rebuilt around common business-site needs
 * (search/maps/media got real homes; the parked content-section and
 * parallax/marquee capabilities left the map — see dossier-förenkling i avklarat).
 */

export interface DossierGroup {
  /** Stable, machine-readable group id. */
  id: string;
  /** Swedish, user-facing heading. */
  label: string;
}

export const DOSSIER_GROUPS = {
  "data-content": { id: "data-content", label: "Data & innehåll" },
  auth: { id: "auth", label: "Inloggning & konton" },
  commerce: { id: "commerce", label: "Betalning & handel" },
  contact: { id: "contact", label: "Kontakt & utskick" },
  ai: { id: "ai", label: "AI" },
  "search-maps": { id: "search-maps", label: "Sök & karta" },
  media: { id: "media", label: "Media & galleri" },
  interactive: { id: "interactive", label: "Interaktivt & 3D" },
  // 2026-08-06: label narrowed from "Realtid & drift" when `realtime` left
  // the map (ably-realtime parked) — the group now holds observability only.
  ops: { id: "ops", label: "Drift & mätning" },
  other: { id: "other", label: "Övrigt" },
} as const satisfies Record<string, DossierGroup>;

export type DossierGroupId = keyof typeof DOSSIER_GROUPS;

/** Stable render order for the groups in the UI. */
export const DOSSIER_GROUP_ORDER: DossierGroup[] = [
  DOSSIER_GROUPS["data-content"],
  DOSSIER_GROUPS.auth,
  DOSSIER_GROUPS.commerce,
  DOSSIER_GROUPS.contact,
  DOSSIER_GROUPS.ai,
  DOSSIER_GROUPS["search-maps"],
  DOSSIER_GROUPS.media,
  DOSSIER_GROUPS.interactive,
  DOSSIER_GROUPS.ops,
  DOSSIER_GROUPS.other,
];

/**
 * capability → group id. Every capability currently in
 * `data/dossiers/_index/capability-map.json` MUST have an entry here so it
 * lands in a real group instead of "Övrigt" (enforced by the unit test).
 */
const CAPABILITY_TO_GROUP_ID: Record<string, DossierGroupId> = {
  database: "data-content",
  // `cms` left the map 2026-09-02 with the parked sanity-cms dossier (owner
  // decision: it shipped frontend glue only — no Studio, no content models —
  // which a small-business owner cannot use). Git history holds the tree.
  // One capability since 2026-07-22 — clerk-auth (default) and supabase-auth
  // are provider siblings under `auth`.
  auth: "auth",
  // `subscriptions` left the map 2026-08-06 with the parked paddle-billing
  // dossier (etapp 2) — commerce now holds one-off payments only.
  payments: "commerce",
  "contact-form": "contact",
  "newsletter-subscribe": "contact",
  // Hosted appointment scheduling (calcom-booking). Table/room inventory is
  // deliberately outside this capability.
  booking: "contact",
  // ai-tool-calling / rag-chat left the map 2026-08-06 with their parked
  // dossiers (etapp 4) — AI group is openai-chat / `ai-chat` only.
  "ai-chat": "ai",
  // Search & maps: local site search + map display are key-free demo-first
  // capabilities; command-palette (f.d. command-search) is the cmd+k surface.
  "site-search": "search-maps",
  "map-display": "search-maps",
  "command-palette": "search-maps",
  // Media & gallery: showing images — click-to-enlarge vs swipe slider — and
  // the owner's own hosted heavy media (vercel-blob-media, 2026-09-02).
  "gallery-lightbox": "media",
  carousel: "media",
  "media-storage": "media",
  // Interactive & 3D: motion/3D/games/data-viz where presentation is the point.
  "visual-3d": "interactive",
  "physics-3d": "interactive",
  "interactive-game": "interactive",
  "dashboard-charts": "interactive",
  // Operations: fire-and-forget observability. `realtime`, `error-tracking`
  // and `image-generation` left the map 2026-08-06 when their sole provider
  // dossiers were parked 2026-08-06 (träd borttaget 2026-08-10; git-historik).
  analytics: "ops",
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
