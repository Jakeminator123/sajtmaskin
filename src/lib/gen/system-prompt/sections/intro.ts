/**
 * Intro sections: generation-mode, custom instructions, F2 contract,
 * build intent, and generation profile.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import { renderTier3F2DenyBlockLines } from "@/lib/integrations/tier3-sdk-deny";
import { BUILD_INTENT_GUIDANCE } from "../../intent-guidance";
import type { BuildSpec } from "../../build-spec";

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
