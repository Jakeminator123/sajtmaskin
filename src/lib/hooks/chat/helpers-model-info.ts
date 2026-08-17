import { getPromptAssistModelLabel } from "@/lib/builder/defaults";
import { describeDossierStatus } from "@/lib/builder/dossier-overview";
import type { PromptStrategyMeta } from "@/lib/builder/prompt-orchestration";
import { MODEL_LABELS, canonicalizeModelId, getBuildProfileId } from "@/lib/models/catalog";
import type { ModelInfoData, SetMessages } from "./types";
import { appendToolPartToMessage } from "./helpers-ui-parts";

const PLANNED_STATUS_LABEL = describeDossierStatus("planned", "design").label;

function formatEnginePathLabel(enginePath: string | null | undefined): string | null {
  if (!enginePath) return null;
  if (enginePath === "own-engine") return "egen motor";
  if (enginePath === "plan-mode") return "planläge";
  return enginePath;
}

export function buildModelInfoSteps(info: ModelInfoData): string[] {
  const steps: string[] = [];
  const modelId = info.modelId ? String(info.modelId) : null;
  const modelTier =
    typeof info.modelTier === "string" && info.modelTier.trim().length > 0
      ? info.modelTier.trim()
      : null;
  const buildProfileId =
    typeof info.buildProfileId === "string" && info.buildProfileId.trim().length > 0
      ? info.buildProfileId.trim()
      : null;
  const buildProfileLabel =
    typeof info.buildProfileLabel === "string" && info.buildProfileLabel.trim().length > 0
      ? info.buildProfileLabel.trim()
      : null;
  const canonicalTier = modelTier ? canonicalizeModelId(modelTier) : null;
  const modelTierLabel = canonicalTier ? MODEL_LABELS[canonicalTier] : null;
  const resolvedProfileLabel = buildProfileLabel ?? modelTierLabel ?? modelTier;
  const resolvedProfileId = buildProfileId ?? (canonicalTier ? getBuildProfileId(canonicalTier) : modelTier);
  if (resolvedProfileLabel) {
    steps.push(`Byggprofil: ${resolvedProfileLabel}`);
  }
  if (resolvedProfileId) {
    steps.push(`Profil-ID: ${resolvedProfileId}`);
  }
  const enginePathLabel = formatEnginePathLabel(info.enginePath);
  if (enginePathLabel) {
    steps.push(`Motorväg: ${enginePathLabel}`);
  }
  steps.push(`${modelTier ? "Körmodell" : "Model"}: ${modelId || "okänd"}`);
  if (typeof info.thinking === "boolean") {
    steps.push(`Thinking: ${info.thinking ? "på" : "av"}`);
  }
  if (typeof info.imageGenerations === "boolean") {
    steps.push(`Bildgenerering: ${info.imageGenerations ? "på" : "av"}`);
  }
  if (typeof info.chatPrivacy === "string" && info.chatPrivacy.trim()) {
    steps.push(`Chat privacy: ${info.chatPrivacy}`);
  }
  if (typeof info.promptAssistProvider === "string") {
    const providerLabel =
      info.promptAssistProvider === "openai" || info.promptAssistProvider === "gateway"
        ? "OpenAI"
        : info.promptAssistProvider === "anthropic"
          ? "Anthropic"
          : info.promptAssistProvider === "v0"
            ? "v0 (legacy)"
            : info.promptAssistProvider;
    steps.push(`Provider: ${providerLabel}`);
  }
  if (typeof info.promptAssistModel === "string") {
    steps.push(`Assist model: ${getPromptAssistModelLabel(info.promptAssistModel)}`);
  }
  if (typeof info.promptAssistDeep === "boolean") {
    steps.push(`Deep brief-inställning: ${info.promptAssistDeep ? "på" : "av"}`);
  }
  if (info.scaffoldId) {
    const label = info.scaffoldLabel || info.scaffoldId;
    steps.push(`Scaffold: ${label}`);
  }
  if (info.capabilities && typeof info.capabilities === "object") {
    const active = Object.entries(info.capabilities)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/^needs/, "").replace(/([A-Z])/g, " $1").trim());
    if (active.length > 0) {
      steps.push(`Capabilities: ${active.join(", ")}`);
    }
  }
  if (Array.isArray(info.mutedCapabilityLabels)) {
    const planned = info.mutedCapabilityLabels
      .filter((label): label is string => typeof label === "string")
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
    if (planned.length > 0) {
      steps.push(`${PLANNED_STATUS_LABEL}: ${planned.join(", ")}`);
    }
  }
  // Contract rows describe what the pre-generation contract PROPOSED, which is
  // not the same as what the version contains: a design round that proposes
  // "Auth: clerk" and then writes no auth code used to read as a delivered
  // fact. Rows fall back to the same wording the Byggblock panel uses unless
  // the round's file evidence backs them.
  const fileEvidence = new Set(
    (Array.isArray(info.fileEvidenceCapabilities) ? info.fileEvidenceCapabilities : [])
      .filter((capability): capability is string => typeof capability === "string")
      .map((capability) => capability.trim().toLowerCase())
      .filter((capability) => capability.length > 0),
  );
  const PLANNED_SUFFIX = ` (${PLANNED_STATUS_LABEL})`;
  const contractCapabilities = new Set<string>();
  const contractRow = (label: string, value: string, capability: string): string => {
    contractCapabilities.add(capability);
    return `${label}: ${value}${fileEvidence.has(capability) ? "" : PLANNED_SUFFIX}`;
  };
  const dataMode =
    typeof info.contractDataMode === "string" ? info.contractDataMode.trim() : "";
  if (dataMode) {
    // Only `persisted`/`mixed` promise a backend. `none` and `mocked` describe
    // what the round actually delivers, so marking them planned would be the
    // mirror image of the dishonesty this suffix exists to prevent.
    const promisesBackend = dataMode === "persisted" || dataMode === "mixed";
    steps.push(
      promisesBackend ? contractRow("Data mode", dataMode, "database") : `Data mode: ${dataMode}`,
    );
  }
  if (typeof info.contractDatabaseProvider === "string" && info.contractDatabaseProvider.trim()) {
    steps.push(contractRow("Databas", info.contractDatabaseProvider, "database"));
  }
  if (typeof info.contractAuthProvider === "string" && info.contractAuthProvider.trim()) {
    steps.push(contractRow("Auth", info.contractAuthProvider, "auth"));
  }
  if (typeof info.contractPaymentProvider === "string" && info.contractPaymentProvider.trim()) {
    steps.push(contractRow("Betalning", info.contractPaymentProvider, "payments"));
  }
  if (Array.isArray(info.contractIntegrations) && info.contractIntegrations.length > 0) {
    const labels = info.contractIntegrations
      .slice(0, 5)
      .map((entry) => {
        const name =
          (typeof entry.name === "string" && entry.name.trim()) ||
          (typeof entry.provider === "string" && entry.provider.trim()) ||
          "Integration";
        const status = typeof entry.status === "string" && entry.status.trim() ? ` (${entry.status})` : "";
        return `${name}${status}`;
      });
    if (labels.length > 0) {
      steps.push(`Kontrakt integrationer: ${labels.join(", ")}`);
    }
  }
  if (Array.isArray(info.contractEnvVars) && info.contractEnvVars.length > 0) {
    const keys = info.contractEnvVars
      .slice(0, 6)
      .map((entry) => (typeof entry.key === "string" ? entry.key.trim() : ""))
      .filter(Boolean);
    if (keys.length > 0) {
      // The keys belong to the integrations the rows above named, so they are
      // delivered only when every one of those capabilities has file evidence.
      // "Any dossier at all is present" would let an unrelated soft dossier
      // vouch for a Stripe key that no file in the version reads.
      const delivered =
        contractCapabilities.size > 0 &&
        Array.from(contractCapabilities).every((capability) => fileEvidence.has(capability));
      steps.push(
        `Kontrakt env vars: ${keys.join(", ")}${delivered ? "" : PLANNED_SUFFIX}`,
      );
    }
  }
  if (Array.isArray(info.unresolvedContractDecisions) && info.unresolvedContractDecisions.length > 0) {
    const unresolved = info.unresolvedContractDecisions
      .slice(0, 4)
      .map((entry) => {
        if (typeof entry === "string") return entry;
        return typeof entry.kind === "string" && entry.kind.trim()
          ? entry.kind.trim()
          : "";
      })
      .filter(Boolean);
    if (unresolved.length > 0) {
      steps.push(`Olösta kontrakt: ${unresolved.join(", ")}`);
    }
  }
  if (typeof info.systemPromptLength === "number" && info.systemPromptLength > 0) {
    steps.push(`Systempromt: ${Math.round(info.systemPromptLength / 1000)}K tecken`);
  }
  if (info.briefApplied === true) {
    steps.push("Brief: applicerad");
  }
  if (typeof info.customInstructionsLength === "number" && info.customInstructionsLength > 0) {
    steps.push(`Custom instructions: ${info.customInstructionsLength} tecken`);
  }
  return steps;
}

export function appendModelInfoPart(
  setMessages: SetMessages,
  messageId: string,
  info: ModelInfoData,
) {
  appendToolPartToMessage(setMessages, messageId, {
    type: "tool:model-info",
    toolName: "Model info",
    toolCallId: `model-info:${messageId}`,
    state: "output-available",
    output: {
      steps: buildModelInfoSteps(info),
      ...info,
    },
  });
}

function formatPromptStrategyReason(reason: string): string {
  const map: Record<string, string> = {
    within_budget:
      "Under mjuk orkestreringsgräns — prompten skickas direkt (ingen sammandragning)",
    empty_prompt: "Tom prompt",
    preserve_registry_payload: "Registry-data bevarad oförändrad",
    technical_content_preserved: "Tekniskt innehåll bevarat",
    // Plan 03 (short): surfaced when the pass was triggered automatically by
    // the client autofix loop / verifier-driven repair instead of by the user
    // typing a follow-up. Replaces the misleading "Registry-data bevarad
    // oförändrad" line that appeared on auto-repair passes before because
    // `promptSourcePreservePayload: true` aliased onto the registry-payload
    // branch.
    auto_repair: "Auto-repair efter typecheck/quality-gate",
    force_phase_threshold: "Mycket lång prompt — fasadläge (Plan → Build → Polish)",
    high_complexity: "Hög komplexitet — fasadläge",
    over_budget_summarized: "Över mjuk gräns — prompt sammandragen",
    over_budget_summarized_design_safe: "Över mjuk gräns — sammandragning (designsäker)",
    over_soft_target_full_handoff:
      "Över mjuk gräns — hela prompten skickas (bevarande handoff, ingen aggressiv sammandragning)",
    over_soft_target_full_handoff_design_heavy:
      "Över mjuk gräns — hela prompten skickas (designtung kontext bevarad)",
  };
  if (reason.endsWith("_hard_cap")) {
    return "Hård teckengräns — sektionssparande komprimering eller nödsammandragning";
  }
  return map[reason] ?? reason;
}

/**
 * Exported for unit tests (plan 03). Render the per-step labels the UI shows
 * under the "Prompt strategy" tool part. Auto-repair passes get an explicit
 * "Källa: Auto-repair (server-driven)" line so the user can tell them apart
 * from a follow-up they typed themselves.
 */
export function buildPromptStrategySteps(meta: PromptStrategyMeta): string[] {
  const strategyLabel =
    meta.strategy === "phase_plan_build_refine"
      ? "fasad (Plan -> Build -> Polish)"
      : meta.strategy === "preserved"
          ? "bevarad (full handoff)"
          : "redo";
  // budgetTarget = soft ceiling (ORCHESTRATION_SOFT_TARGET_*); NOT a goal length for the user prompt.
  const lengthLine =
    meta.originalLength !== meta.optimizedLength
      ? `Längd: ${meta.originalLength} → ${meta.optimizedLength} tecken (mjuk orkestreringsgräns ~${meta.budgetTarget})`
      : `Längd: ${meta.originalLength} tecken (mjuk orkestreringsgräns ~${meta.budgetTarget} innan ev. sammandragning)`;

  const steps: string[] = [];
  if (meta.promptSource === "auto_repair") {
    // Show the source first so the user immediately sees it's not their pass.
    steps.push("Källa: Auto-repair (server-driven)");
  }
  steps.push(`Prompt optimerad: ${strategyLabel}`);
  const typeLine =
    meta.promptSource === "auto_repair"
      ? `Typ: auto-repair (klassad som ${meta.promptType})`
      : `Typ: ${meta.promptType}`;
  steps.push(typeLine, lengthLine);
  if (meta.reason) steps.push(`Orsak: ${formatPromptStrategyReason(meta.reason)}`);
  // Do not duplicate "Genererar innehåll och filer…" here — the engine progress tool
  // (generation / streaming) already emits the same line when output starts.
  return steps;
}

export function appendPromptStrategyPart(
  setMessages: SetMessages,
  messageId: string,
  meta: PromptStrategyMeta,
) {
  appendToolPartToMessage(setMessages, messageId, {
    type: "tool:prompt-strategy",
    toolName: "Prompt strategy",
    toolCallId: `prompt-strategy:${messageId}`,
    state: "output-available",
    output: {
      steps: buildPromptStrategySteps(meta),
      ...meta,
    },
  });
}
