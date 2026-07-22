import type { BuildIntent } from "@/lib/builder/build-intent";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import { uWordRegex } from "@/lib/utils/unicode-word-boundary";

export type SimpleWebsitePathReason =
  | "enabled"
  | "not_init"
  | "plan_mode"
  | "has_client_brief"
  | "has_attachments"
  | "has_custom_system"
  | "technical_or_preserve_prompt"
  | "unsupported_build_intent"
  | "unsupported_prompt_strategy"
  | "prompt_too_long"
  | "scaffold_off_or_missing"
  | "unsupported_scaffold"
  | "multi_route_signal"
  | "heavy_capability"
  | "integration_or_contract_signal"
  | "section_capability_signal";

export interface SimpleWebsitePathDecision {
  enabled: boolean;
  reason: SimpleWebsitePathReason;
  scaffoldId: string | null;
}

const SIMPLE_SCAFFOLD_IDS = new Set([
  "base-nextjs",
  "landing-page",
  "portfolio",
  "blog",
]);

const MAX_SIMPLE_PROMPT_CHARS = 420;

const INTEGRATION_OR_CONTRACT_RE = uWordRegex(
  "auth|login|konto|stripe|checkout|payment|betalning|database|postgres|supabase|prisma|drizzle|cms|admin|dashboard|api|webhook|integration(?:er)?|mailchimp|resend|sentry|analytics|plausible|clerk|openai|chatbot",
);
const MULTI_ROUTE_WORD_RE = uWordRegex(
  "flera|separata|separate|multi-?page|flersidig|undersid(?:a|or)|sub-?pages?",
);
const ROUTE_PATH_RE =
  /(?:^|[\s("'`])\/[a-z0-9åäö][a-z0-9åäö-]*(?:\/[a-z0-9åäö][a-z0-9åäö-]*)*(?=$|[\s,.;:!?)]|["'`])/iu;

function hasMultiRouteSignal(prompt: string): boolean {
  return MULTI_ROUTE_WORD_RE.test(prompt) || ROUTE_PATH_RE.test(prompt);
}

// Dossier-backed capabilities that are deliberately NOT part of
// hasHeavyCapability — a short init prompt that names one would otherwise
// take the simple fast lane and skip dossier selection, missing the very
// dossier the user asked for. Taxonomy 2026-07-22: the parked section
// dossiers (logo-cloud, stats-counter, feature-grid, cta-section, stepper)
// left this list — those are ordinary freehand content now, so their cues
// no longer close the fast lane. Remaining cues cover `gallery-lightbox`
// plus the new key-free `map-display` and `site-search` capabilities. These
// high-precision cues mirror the follow-up vocabulary
// (src/lib/builder/follow-up-capability-vocabulary.ts) and block the fast
// lane so the full dossier pipeline runs. Kept narrow so the simple lane is
// not closed for ordinary marketing copy.
const SECTION_CAPABILITY_RE = uWordRegex(
  [
    // gallery-lightbox
    "lightbox",
    "bild[-\\s]?galleri",
    "bildgalleri",
    "foto[-\\s]?galleri",
    "fotogalleri",
    "photo[-\\s]?wall",
    "förstora\\s+bilder",
    "klickbara\\s+bilder",
    // map-display
    "karta",
    "kartan",
    "kartvy",
    "hitta\\s+hit",
    "hitta\\s+till\\s+oss",
    "maplibre",
    "openfreemap",
    "google\\s+maps",
    "store\\s+locator",
    "butiks-?karta",
    // site-search
    "sökfunktion(?:en)?",
    "sökfält(?:et)?",
    "sökruta(?:n)?",
    "site[-\\s]?search",
    "minisearch",
  ].join("|"),
);

function hasSectionCapabilitySignal(prompt: string): boolean {
  return SECTION_CAPABILITY_RE.test(prompt);
}

function hasHeavyCapability(capabilities: InferredCapabilities): boolean {
  return Boolean(
    capabilities.needs3D ||
      capabilities.needsPhysics ||
      capabilities.needsCharts ||
      capabilities.needsDatabase ||
      capabilities.needsAuth ||
      capabilities.needsAppShell ||
      capabilities.needsDataUI ||
      capabilities.needsForms ||
      capabilities.needsEcommerce ||
      capabilities.needsCarousel ||
      capabilities.needsPremiumVisuals ||
      capabilities.needsCalendar ||
      capabilities.needsCommandSearch ||
      capabilities.needsThemeToggle ||
      capabilities.needsPayments ||
      capabilities.needsGame ||
      capabilities.needsParallax,
  );
}

export function classifySimpleWebsitePath(params: {
  generationMode: "init" | "followUp";
  planMode: boolean;
  hasClientBrief: boolean;
  attachmentsCount: number;
  hasCustomSystem: boolean;
  promptSourceTechnical: boolean;
  promptSourcePreservePayload: boolean;
  buildIntent: BuildIntent;
  promptStrategyMeta: Pick<PromptStrategyMeta, "strategy" | "promptType">;
  prompt: string;
  preMatchScaffold: ScaffoldManifest | null;
  capabilities: InferredCapabilities;
  /** Named dossier capabilities from the shared init/follow-up detector. */
  requestedDossierCapabilities?: readonly string[];
}): SimpleWebsitePathDecision {
  const scaffoldId = params.preMatchScaffold?.id ?? null;
  if (params.generationMode !== "init") return { enabled: false, reason: "not_init", scaffoldId };
  if (params.planMode) return { enabled: false, reason: "plan_mode", scaffoldId };
  if (params.hasClientBrief) return { enabled: false, reason: "has_client_brief", scaffoldId };
  if (params.attachmentsCount > 0) return { enabled: false, reason: "has_attachments", scaffoldId };
  if (params.hasCustomSystem) return { enabled: false, reason: "has_custom_system", scaffoldId };
  if (params.promptSourceTechnical || params.promptSourcePreservePayload) {
    return { enabled: false, reason: "technical_or_preserve_prompt", scaffoldId };
  }
  if (params.buildIntent !== "website" && params.buildIntent !== "template") {
    return { enabled: false, reason: "unsupported_build_intent", scaffoldId };
  }
  if (
    params.promptStrategyMeta.strategy !== "direct" ||
    params.promptStrategyMeta.promptType !== "freeform"
  ) {
    return { enabled: false, reason: "unsupported_prompt_strategy", scaffoldId };
  }
  if (params.prompt.trim().length > MAX_SIMPLE_PROMPT_CHARS) {
    return { enabled: false, reason: "prompt_too_long", scaffoldId };
  }
  if (!scaffoldId) return { enabled: false, reason: "scaffold_off_or_missing", scaffoldId };
  if (!SIMPLE_SCAFFOLD_IDS.has(scaffoldId)) {
    return { enabled: false, reason: "unsupported_scaffold", scaffoldId };
  }
  if (hasMultiRouteSignal(params.prompt)) {
    return { enabled: false, reason: "multi_route_signal", scaffoldId };
  }
  if (hasHeavyCapability(params.capabilities)) {
    return { enabled: false, reason: "heavy_capability", scaffoldId };
  }
  if (INTEGRATION_OR_CONTRACT_RE.test(params.prompt)) {
    return { enabled: false, reason: "integration_or_contract_signal", scaffoldId };
  }
  if ((params.requestedDossierCapabilities?.length ?? 0) > 0) {
    return { enabled: false, reason: "section_capability_signal", scaffoldId };
  }
  // Last gate before enabling: a named #242 section capability must reach the
  // full dossier pipeline rather than the simple fast lane.
  if (hasSectionCapabilitySignal(params.prompt)) {
    return { enabled: false, reason: "section_capability_signal", scaffoldId };
  }
  return { enabled: true, reason: "enabled", scaffoldId };
}
