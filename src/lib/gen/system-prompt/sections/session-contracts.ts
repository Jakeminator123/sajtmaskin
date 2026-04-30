/**
 * Consolidated sections:
 * - intro.ts
 * - contracts.ts
 *
 * Grouped during OMTAG-03 style refactor — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import { renderTier3F2DenyBlockLines } from "@/lib/integrations/tier3-sdk-deny";
import {
  deriveTier3BuildSpec,
  renderTier3BuildPlanBlock,
} from "@/lib/integrations/tier3-build-spec";
import { BUILD_INTENT_GUIDANCE } from "../../intent-guidance";
import type { BuildSpec } from "../../build-spec";
import type { PreGenerationContractContext } from "../../contract/pre-generation-contracts";

export function renderGenerationModeBlock(isFollowUp: boolean): string[] {
  if (!isFollowUp) return [];
  return [
    "## Generation Mode: Follow-Up",
    "",
    "You are editing/refining the current project state from previous generations. Treat the scaffold, route plan, project context, and continuity signals below as the latest known implementation context. Apply only the user's requested changes unless they clearly ask for a redesign.",
    "",
    "### Element Preservation Rule",
    "",
    "When you output a file, your version **fully replaces** the previous file at that path. The host has NO line-level diff — it is all-or-nothing per file. This means:",
    "",
    "- If you emit `app/page.tsx`, every section, component, media element, and interactive block from the previous version MUST appear in your output unless the user explicitly asked to remove it.",
    "- Pay special attention to: `<video>` elements, video placeholder UIs (play buttons, poster images), `<canvas>`, `<iframe>`, `<form>`, 3D scenes (`<Canvas>`, `<Physics>`), inline SVGs, and custom media components.",
    "- \"Change the hero\" means change its styling/content — NOT remove the video player or media element inside it.",
    "- The host merge guard will reject your file and keep the old version if it detects structural elements were dropped. Write the complete file correctly the first time.",
    "**Ordningsregel:** Den här bevarings-regeln (follow-up preservation) går före scaffold-variant \"adapt freely\"-instruktionen senare i prompten. Variant-estetik får aldrig motivera att ta bort, byta typ på, eller flytta bevarade element vid follow-up. Vid clear-redesign-intent gäller variant-frihet i stället.",
    "",
  ];
}

export function renderCustomInstructionsBlock(customInstructions?: string): string[] {
  const trimmedCustom = customInstructions?.trim();
  if (!trimmedCustom) return [];
  return ["## Custom Instructions (from the user)", "", trimmedCustom, ""];
}

// ── F2 / Design Stage Contract (HARD) ─────────────────────────────────
// F2 = visual fidelity stage. The user is iterating on look-and-feel,
// NOT on backend integrations. Tier-3 imports/process.env references
// bloat output, leak imports the user didn't ask for, and force the
// builder UI into "fill in env vars"-mode which we explicitly want
// to avoid. F3 ("Bygg nu" / fidelity3) is when integrations are wired
// in — and only when the user has clicked that button.
// See `.cursor/rules/env-flow-f2-mute.mdc`.
export function renderF2ContractBlock(buildSpec: BuildSpec | null | undefined): string[] {
  if (buildSpec?.previewPolicy === "fidelity3") return [];
  return [
    "## Generation Stage: F2 / Design (HARD CONTRACT)",
    "",
    "You are generating a **visual design preview**. The user wants to see, click, and iterate on the UI. They have NOT asked you to wire in any external services.",
    "",
    "**FORBIDDEN in F2 — even if a dossier example shows it, even if the prompt mentions a service by name unless the user explicitly asks for backend wiring:**",
    "",
    "- Do NOT `import` any of these packages:",
    // Deny-list rendered from `config/integrations/tier3-sdk-deny.json` so
    // this prompt block and the mechanical `tier3-sdk-guard-fixer` can
    // never drift apart. Add a module in the JSON; both update.
    ...renderTier3F2DenyBlockLines(),
    "- Do NOT use `process.env.STRIPE_*`, `process.env.SUPABASE_*`, `process.env.CLERK_*`, `process.env.RESEND_*`, `process.env.SANITY_*`, `process.env.GOOGLE_CLIENT_*`, `process.env.AUTH_SECRET`, or any other tier-3 secret. Public `NEXT_PUBLIC_GA_ID` etc. is fine if the user wanted analytics.",
    "- Do NOT emit a `.env.local` listing tier-3 keys.",
    "- Do NOT add Stripe API routes (`/api/stripe/*`, `/api/checkout/*`), webhooks (`/api/webhooks/*`), or auth callbacks unless explicitly requested.",
    "",
    "**INSTEAD in F2, for any 'backend' need:**",
    "",
    "- Mock all data inline as TypeScript constants: `const ROOMS = [{ id: \"1\", name: \"Skogssvit\", price: 1290 }, ...]`.",
    "- Forms: use `useState` + `toast.success(\"Bokningen mottagen!\")` on submit. No POST endpoint, no DB.",
    "- Auth UIs: render a beautiful `<LoginForm>` with email/password fields that calls `toast.success(\"Inloggad (demo)\")` on submit. No real session.",
    "- Payments UIs: render a beautiful checkout summary card with a `<Button>Betala (demo)</Button>` that opens a `<Dialog>` saying \"Riktiga betalningar aktiveras i F3 — klicka 'Bygg nu' i previewpanelen.\" No Stripe, no API call.",
    "- Search: client-side `Array.filter()` over the inline mock data.",
    "",
    "Why: the user will click **\"Bygg nu\"** in the preview panel when they want to lift the site to F3 / integrations stage. THAT is when real keys, SDKs and API routes get wired in — by a separate generation pass with a separate prompt that explicitly asks for it. Right now, your job is to make the visual frontend perfect.",
    "",
  ];
}

export function renderBuildIntentBlock(intent: BuildIntent): string[] {
  const guidance = BUILD_INTENT_GUIDANCE[intent];
  return [
    `## Build Intent: ${guidance.label}`,
    "",
    ...guidance.rules.map((r) => `- ${r}`),
    "",
  ];
}

export function renderGenerationProfileBlock(buildSpec: BuildSpec | null | undefined): string[] {
  if (!buildSpec) return [];
  const referenceFamilies =
    buildSpec.referenceCategories.length > 0
      ? buildSpec.referenceCategories.join(", ")
      : "general";
  const styleDirection = buildSpec.stylePackSecondary
    ? `${buildSpec.stylePack} (with hints of ${buildSpec.stylePackSecondary})`
    : buildSpec.stylePack;
  const profileLines: string[] = [
    "## Generation Profile",
    "",
    `- **Style direction:** ${styleDirection}`,
    `- **Quality tier:** ${buildSpec.qualityTarget}`,
    `- **Reference families:** ${referenceFamilies}`,
  ];
  if (
    buildSpec.capabilityFlags?.heavy &&
    (buildSpec.capabilityFlags.signals?.length ?? 0) > 0
  ) {
    profileLines.push(
      `- **Capability signals:** ${buildSpec.capabilityFlags.signals.join(", ")}`,
    );
  }
  if (buildSpec.forbiddenPatterns.length > 0) {
    profileLines.push(
      `- **Forbidden patterns:** ${buildSpec.forbiddenPatterns.join(", ")}`,
    );
  }
  profileLines.push("");
  return profileLines;
}

export function renderFileSurfaceBudgetBlock(params: {
  buildSpec: BuildSpec | null | undefined;
  routeCount: number;
  scaffoldId?: string | null;
}): string[] {
  const { buildSpec, routeCount, scaffoldId } = params;
  if (!buildSpec) return [];
  const simpleWebsite =
    buildSpec.buildIntent === "website" &&
    buildSpec.previewPolicy === "fidelity2" &&
    routeCount <= 3;
  const maxSurfaceFiles = simpleWebsite ? (routeCount <= 1 ? 8 : 12) : 14;
  return [
    "## File Surface Budget",
    "",
    `- **Generated surface budget:** aim for <= ${maxSurfaceFiles} app-surface files for this generation (${routeCount} route${routeCount === 1 ? "" : "s"}, scaffold: ${scaffoldId ?? "none"}).`,
    "- Prefer route files plus 3-5 focused components. Do not split every section into its own file.",
    "- Do not emit scaffold-owned files, placeholder API routes, icons, config files, or duplicated theme/layout files unless explicitly required by the user.",
    "- `finalProjectFiles` may be higher after scaffold/finalize materialization; keep your own generated surface small.",
    "",
  ];
}

export function renderTier3IntegrationBlock(params: {
  buildSpec: BuildSpec | null | undefined;
  preGenerationContracts: PreGenerationContractContext | null | undefined;
}): string[] {
  const { buildSpec, preGenerationContracts } = params;
  // ── Tier-3 Integration Build Plan (F3 only) ────────────────────────────
  // When previewPolicy is fidelity3 we render the structured tier-3 spec
  // derived from the contracts. This block tells the F3 LLM exactly which
  // env keys are guaranteed present and what wiring steps to perform.
  if (
    buildSpec?.previewPolicy !== "fidelity3" ||
    !preGenerationContracts ||
    preGenerationContracts.contracts.integrations.length === 0
  ) {
    return [];
  }
  try {
    const spec = deriveTier3BuildSpec(preGenerationContracts.contracts);
    const block = renderTier3BuildPlanBlock(spec);
    if (block) {
      return [block, ""];
    }
  } catch {
    // Never block prompt assembly on a tier-3 rendering error.
  }
  return [];
}

export function renderPreGenerationContractsBlock(
  preGenerationContracts: PreGenerationContractContext | null | undefined,
): string[] {
  if (!preGenerationContracts) return [];
  const { contracts, unresolvedDecisions } = preGenerationContracts;
  const hasContractSignal =
    contracts.dataMode !== "none" ||
    Boolean(contracts.databaseProvider) ||
    Boolean(contracts.authProvider) ||
    Boolean(contracts.paymentProvider) ||
    contracts.integrations.length > 0 ||
    contracts.envVars.length > 0 ||
    unresolvedDecisions.length > 0;
  if (!hasContractSignal) return [];

  const parts: string[] = ["## Pre-Generation Contracts", ""];
  parts.push(`- **Data mode:** ${contracts.dataMode}`);
  if (contracts.databaseProvider) parts.push(`- **Database:** ${contracts.databaseProvider}`);
  if (contracts.authProvider) parts.push(`- **Auth:** ${contracts.authProvider}`);
  if (contracts.paymentProvider) parts.push(`- **Payment:** ${contracts.paymentProvider}`);
  for (const integration of contracts.integrations.slice(0, 8)) {
    const envSuffix = integration.envVars?.length ? ` [${integration.envVars.join(", ")}]` : "";
    parts.push(
      `- **Integration (${integration.status}):** ${integration.name} — ${integration.reason}${envSuffix}`,
    );
  }
  if (contracts.envVars.length > 0) {
    parts.push("", "- **Environment variables:**");
    parts.push(
      ...contracts.envVars
        .slice(0, 10)
        .map((envVar) => `  - ${envVar.key} — ${envVar.reason}${envVar.required ? " (required)" : ""}`),
    );
  }
  parts.push(
    "",
    "- **Placeholder policy (mandatory for runnable preview):** If **Auth** is NextAuth/Auth.js, use **Credentials** (password/demo user) only — **no OAuth** providers unless the user explicitly asked for one by name. If **Stripe/payment** appears, use test-mode keys and/or `process.env` fallbacks so the app never throws at import time. The preview runtime merges non-secret placeholder `.env.local` values; your code must still run when those are absent.",
    "",
  );
  if (unresolvedDecisions.length > 0) {
    parts.push("", "- **Unresolved decisions:**");
    parts.push(...unresolvedDecisions.map((entry) => `  - ${entry.kind}: ${entry.reason}`));
    parts.push(
      "  - Prefer **non-blocking** defaults: Auth.js Credentials, SQLite or mock data, Stripe test placeholders. Do not stall generation on provider choice; ship runnable code first.",
    );
  }
  if (preGenerationContracts.confirmedAnswers.length > 0) {
    parts.push("", "- **Confirmed contract answers from the user:**");
    parts.push(
      ...preGenerationContracts.confirmedAnswers
        .slice(0, 6)
        .map((entry) => `  - ${entry.kind}: ${entry.answer}`),
    );
  }
  parts.push("");
  return parts;
}
