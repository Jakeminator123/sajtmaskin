/**
 * Staging questions for a Byggblock catalog pick.
 *
 * A catalog click stages the block («valt, ej tillagt») instead of sending a
 * generation. The user may answer 0–1 question (placement or content) and
 * optionally paste keys; confirming builds structured prompt lines that
 * {@link buildAddDossierMessage} appends. Questions are never blocking —
 * every spec has a default, and «just click through» always works.
 *
 * Unknown / future dossier ids fall back to no question (confirm only) so a
 * missing classification never blocks adding a new block.
 */

export type DossierStagingKind = "placement" | "content" | "none";

export type DossierStagingOption = {
  id: string;
  label: string;
  /**
   * Confirming this option omits the structured prompt line — the LLM
   * chooses, same as today's catalog message.
   */
  llmChooses?: boolean;
};

export type DossierStagingSpec =
  | { kind: "none" }
  | {
      kind: "placement";
      question: string;
      options: readonly DossierStagingOption[];
      defaultOptionId: string;
    }
  | {
      kind: "content";
      question: string;
      defaultText: string;
    };

export type DossierStagingAnswer =
  | { kind: "none" }
  | { kind: "placement"; optionId: string }
  | { kind: "content"; text: string };

const GENERIC_PLACEMENT = {
  kind: "placement",
  question: "Var ska blocket placeras?",
  options: [
    { id: "best-fit", label: "Där det passar bäst", llmChooses: true },
    { id: "own-page", label: "Egen sida" },
    { id: "home-section", label: "Sektion på startsidan" },
  ],
  defaultOptionId: "best-fit",
} as const satisfies DossierStagingSpec;

const CHAT_PLACEMENT = {
  kind: "placement",
  question: "Var ska chatten bo?",
  options: [
    { id: "floating", label: "Flytande widget" },
    { id: "own-page", label: "Egen sida" },
    { id: "home-section", label: "Sektion på startsidan" },
  ],
  defaultOptionId: "floating",
} as const satisfies DossierStagingSpec;

const AUTH_PLACEMENT = {
  kind: "placement",
  question: "Hur ska inloggningen synas?",
  options: [
    {
      id: "login-page-header",
      label: "Egen inloggningssida + kontoindikator i headern",
    },
    { id: "header-only", label: "Endast kontoindikator i headern" },
  ],
  defaultOptionId: "login-page-header",
} as const satisfies DossierStagingSpec;

const CONTACT_PLACEMENT = {
  kind: "placement",
  question: "Var ska formuläret bo?",
  options: [
    { id: "home-section", label: "Kontaktsektion på startsidan" },
    { id: "own-page", label: "Egen kontaktsida" },
  ],
  defaultOptionId: "home-section",
} as const satisfies DossierStagingSpec;

/** Shared default for data/content questions — confirming it omits the line. */
export const DOSSIER_STAGING_CONTENT_DEFAULT = "Det sajten behöver (LLM väljer)";

const DATABASE_CONTENT = {
  kind: "content",
  question: "Vad ska sparas?",
  defaultText: DOSSIER_STAGING_CONTENT_DEFAULT,
} as const satisfies DossierStagingSpec;

const CMS_CONTENT = {
  kind: "content",
  question: "Vilka innehållstyper?",
  defaultText: DOSSIER_STAGING_CONTENT_DEFAULT,
} as const satisfies DossierStagingSpec;

const NONE = { kind: "none" } as const satisfies DossierStagingSpec;

/**
 * Owner-classified staging for every current runtime dossier.
 * New ids are intentionally absent — {@link getDossierStagingSpec} falls
 * back to confirm-only so a missing row never blocks the catalog.
 */
const STAGING_BY_ID: Record<string, DossierStagingSpec> = {
  "openai-chat": CHAT_PLACEMENT,
  "calcom-booking": GENERIC_PLACEMENT,
  "clerk-auth": AUTH_PLACEMENT,
  "supabase-auth": AUTH_PLACEMENT,
  "resend-contact-form": CONTACT_PLACEMENT,
  "mailchimp-newsletter": GENERIC_PLACEMENT,
  "stripe-checkout": GENERIC_PLACEMENT,
  "dashboard-charts": GENERIC_PLACEMENT,
  "embla-carousel": GENERIC_PLACEMENT,
  "gallery-lightbox": GENERIC_PLACEMENT,
  "interactive-game-loop": GENERIC_PLACEMENT,
  "local-site-search": GENERIC_PLACEMENT,
  "maplibre-map": GENERIC_PLACEMENT,
  "three-fiber-canvas": GENERIC_PLACEMENT,
  "three-fiber-physics": GENERIC_PLACEMENT,
  "postgres-drizzle": DATABASE_CONTENT,
  "sanity-cms": CMS_CONTENT,
  "vercel-analytics": NONE,
  "cmdk-command-palette": NONE,
};

/** Runtime ids that have an explicit staging row (not the unknown-id fallback). */
export function listExplicitStagingIds(): readonly string[] {
  return Object.keys(STAGING_BY_ID);
}

export function getDossierStagingSpec(id: string): DossierStagingSpec {
  return STAGING_BY_ID[id] ?? NONE;
}

export function defaultDossierStagingAnswer(spec: DossierStagingSpec): DossierStagingAnswer {
  if (spec.kind === "placement") return { kind: "placement", optionId: spec.defaultOptionId };
  if (spec.kind === "content") return { kind: "content", text: spec.defaultText };
  return { kind: "none" };
}

/**
 * Structured prompt lines for a confirmed staging answer.
 * Default / «LLM väljer» answers return `[]` so the message stays the
 * historic one-line catalog format.
 */
export function buildDossierStagingLines(
  spec: DossierStagingSpec,
  answer: DossierStagingAnswer,
): string[] {
  if (spec.kind === "placement") {
    const optionId = answer.kind === "placement" ? answer.optionId : spec.defaultOptionId;
    const option =
      spec.options.find((entry) => entry.id === optionId) ??
      spec.options.find((entry) => entry.id === spec.defaultOptionId);
    if (!option || option.llmChooses) return [];
    return [`Placering: ${option.label}`];
  }
  if (spec.kind === "content") {
    const raw = answer.kind === "content" ? answer.text : spec.defaultText;
    const text = raw.trim();
    if (!text || text === spec.defaultText) return [];
    return [`Innehåll: ${text}`];
  }
  return [];
}
