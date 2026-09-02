import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import {
  buildAutoFixPrompt,
  buildModelInfoSteps,
  buildPromptStrategySteps,
  finalizeStreamStats,
  initStreamStats,
  integrationSignalToToolPart,
  mergeStreamingText,
  resolveDeepBriefModelInfoFields,
  resolveDeepBriefVisibilityFields,
} from "./helpers";
import { describeDossierStatus } from "@/lib/builder/dossier-overview";
import type { PromptStrategyMeta } from "@/lib/builder/prompt-orchestration";

describe("mergeStreamingText", () => {
  it("does not drop a short corrective chunk that incidentally overlaps the tail", () => {
    // previous ends with "probably no" and the next SSE delta is also
    // "probably no" — the old heuristic silently dropped the delta because
    // it matched the tail and was <50 chars, truncating real corrective
    // content. The new heuristic only swallows tails up to 8 chars long.
    const previous = "We could go but the answer is probably no";
    const incoming = "probably no";
    expect(mergeStreamingText(previous, incoming)).toBe(
      "We could go but the answer is probably noprobably no",
    );
  });

  it("still de-duplicates very short repeat tokens (<=8 chars)", () => {
    const previous = "Loading...";
    const incoming = "...";
    expect(mergeStreamingText(previous, incoming)).toBe("Loading...");
  });
});

describe("finalizeStreamStats", () => {
  it("does not mark recovered error events as critical anomalies", () => {
    const stats = initStreamStats("send", "assistant_1");
    stats.didReceiveDone = true;
    stats.errorEvents = 1;
    stats.contentEvents = 1;
    stats.contentChars = 24;
    stats.finalContentLength = 24;

    const signal = finalizeStreamStats(stats);

    expect(signal).toEqual({
      hasCriticalAnomaly: false,
      reasons: ["error_event_recovered"],
    });
  });

  it("marks error events without done as critical anomalies", () => {
    const stats = initStreamStats("send", "assistant_1");
    stats.errorEvents = 1;

    const signal = finalizeStreamStats(stats);

    expect(signal.hasCriticalAnomaly).toBe(true);
    expect(signal.reasons).toEqual(["done_event_missing", "error_event_received"]);
  });

  it("does not mark critical anomaly when client aborted and only done is missing", () => {
    const stats = initStreamStats("create", "assistant_1");
    stats.abortedByClient = true;
    stats.contentEvents = 3;
    stats.contentChars = 120;
    stats.finalContentLength = 120;

    const signal = finalizeStreamStats(stats);

    expect(signal.hasCriticalAnomaly).toBe(false);
    expect(signal.reasons).toContain("done_event_missing");
    expect(signal.reasons).toContain("client_abort_expected");
  });
});

describe("buildAutoFixPrompt", () => {
  it("renders legacy scaffold retry metadata", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["build failed"],
      meta: {
        scaffoldRetry: {
          currentScaffoldLabel: "Landing page",
          suggestedScaffoldLabel: "Portfolio",
          suggestedScaffoldId: "portfolio",
          reason: "The current structure fights the requested information density.",
        },
      },
    });

    expect(prompt).toContain("Current scaffold: Landing page");
    expect(prompt).toContain("Suggested repair scaffold: Portfolio");
    expect(prompt).toContain("The current structure fights the requested information density.");
  });

  it("renders compact repair scaffold retry metadata", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["build failed"],
      repair: {
        scaffoldRetry: {
          labels: ["Landing page", "Portfolio"],
          reason: "The current structure fights the requested information density.",
        },
      },
    });

    expect(prompt).toContain("Current scaffold: Landing page");
    expect(prompt).toContain("Suggested repair scaffold: Portfolio");
  });

  it("renders verify-lane timing metadata from repair context", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["build failed"],
      repair: {
        qualityGateMeta: {
          verifyLaneDurationMs: 3200,
          firstFailureCheck: "build",
          jobStartedAt: "2026-04-03T12:00:00.000Z",
          jobFinishedAt: "2026-04-03T12:00:03.200Z",
        },
        qualityGate: [
          {
            check: "build",
            exitCode: 1,
            output: "Build failed: missing export",
            durationMs: 1800,
          },
        ],
      },
    });

    expect(prompt).toContain("Verify-lane context:");
    expect(prompt).toContain("- First failure: build");
    expect(prompt).toContain("- Total verify duration: 3200ms");
    expect(prompt).toContain("- Verify started: 2026-04-03T12:00:00.000Z");
    expect(prompt).toContain("- Verify finished: 2026-04-03T12:00:03.200Z");
    expect(prompt).toContain("## build output (exit 1, 1800ms)");
  });

  it("renders concrete install output from client repair context", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["install failed"],
      repair: {
        qualityGate: [
          {
            check: "install",
            exitCode: 1,
            output: "npm ERR! Could not resolve dependency @acme/widgets@2",
            errorCount: 3,
            durationMs: 725,
          },
        ],
      },
    });

    expect(prompt).toContain("## install output (exit 1, 725ms)");
    expect(prompt).toContain("npm ERR! Could not resolve dependency @acme/widgets@2");
  });

  it("puts script-in-React postcheck lines in the Issues detected headline", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["openclaw_requested_repair"],
      repair: {
        currentVersionErrors: [
          "[product_postcheck.console_error] Encountered a script tag while rendering React component.",
          "[product_postcheck.runtime_crash] Next.js-felöverlägg visas — previewen kraschade vid körning.",
          "[preview:client-error] Hydration failed because the server rendered HTML didn't match the client.",
        ],
      },
    });

    expect(prompt).toMatch(
      /Issues detected:.*Encountered a script tag while rendering React component/,
    );
    expect(prompt).toMatch(/Issues detected:.*Next\.js-felöverlägg/);
    expect(prompt).toMatch(/Issues detected:.*Hydration failed/);
  });

  it("puts all preview:* compile lines in the Issues detected headline", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["preview failed"],
      repair: {
        currentVersionErrors: [
          "[preview] preview compilation failed",
          "[preview:preview_compile_error] Previewn kunde inte kompilera genererad kod.",
          "[preview:stage] preview-script",
        ],
      },
    });

    expect(prompt).toMatch(/Issues detected:.*preview compilation failed/);
    expect(prompt).toMatch(/Issues detected:.*Previewn kunde inte kompilera/);
    expect(prompt).toMatch(/Issues detected:.*preview-script/);
  });

  it("does not put preview-vm infra lines in the Issues detected headline", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["preview failed"],
      repair: {
        currentVersionErrors: [
          "[preview-vm:boot] Fly machine failed to start.",
          "[preview] preview compilation failed",
        ],
      },
    });

    expect(prompt).toMatch(/Issues detected:.*preview compilation failed/);
    expect(prompt).not.toMatch(/Issues detected:.*Fly machine failed/);
  });

  it("requires full-file repair output instead of snippets", () => {
    const prompt = buildAutoFixPrompt({
      chatId: "chat_1",
      versionId: "ver_1",
      reasons: ["syntax failed"],
    });

    expect(prompt).toContain("every returned file MUST be complete from first line to last line");
    expect(prompt).toContain("NEVER return snippets, diff hunks, partial import sections, or excerpted fragments");
    expect(prompt).toContain('Every `file="..."` block is a complete file, not a partial snippet.');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Plan 03 (short): UI rendering of auto_repair vs user prompt strategy.
// ─────────────────────────────────────────────────────────────────────────

describe("buildPromptStrategySteps", () => {
  function metaFor(
    overrides: Partial<PromptStrategyMeta> = {},
  ): PromptStrategyMeta {
    return {
      strategy: "direct",
      promptType: "followup_technical",
      promptSource: "user",
      budgetTarget: 4000,
      originalLength: 1200,
      optimizedLength: 1200,
      reductionRatio: 0,
      reason: "within_budget",
      phaseHints: [],
      complexityScore: 0,
      wasChanged: false,
      ...overrides,
    };
  }

  it("surfaces 'Källa: Auto-repair (server-driven)' when promptSource=auto_repair", () => {
    const steps = buildPromptStrategySteps(
      metaFor({ promptSource: "auto_repair", reason: "auto_repair" }),
    );

    // Source line must appear FIRST so the user immediately sees it.
    expect(steps[0]).toBe("Källa: Auto-repair (server-driven)");
    expect(steps).toContain(
      "Typ: auto-repair (klassad som followup_technical)",
    );
    expect(steps).toContain("Orsak: Auto-repair efter typecheck/quality-gate");
    // Must NOT fall back to the misleading legacy text.
    expect(steps).not.toContain("Orsak: Registry-data bevarad oförändrad");
  });

  it("does not show the auto-repair source line for user-driven follow-ups", () => {
    const steps = buildPromptStrategySteps(
      metaFor({
        promptSource: "user",
        promptType: "followup_technical",
        reason: "within_budget",
      }),
    );

    expect(steps).not.toContain("Källa: Auto-repair (server-driven)");
    expect(steps).toContain("Typ: followup_technical");
    expect(steps.some((step) => step.startsWith("Längd:"))).toBe(true);
    expect(steps.some((step) => step.startsWith("Langd:"))).toBe(false);
  });
});

describe("buildModelInfoSteps — Swedish labels", () => {
  it("keeps diacritics in engine-path and model-tier labels", () => {
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.6-sol",
      modelTier: "premium",
      enginePath: "own-engine",
      buildProfileLabel: "Hög",
      buildProfileId: "premium",
    });

    expect(steps).toContain("Motorväg: egen motor");
    expect(steps).toContain("Körmodell: gpt-5.6-sol");
    expect(steps).not.toContain("Motorvag: egen motor");
    expect(steps).not.toContain("Kormodell: gpt-5.6-sol");
    expect(steps).not.toContain("Kömodell: gpt-5.6-sol");
  });

  it("labels plan-mode as planläge", () => {
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      enginePath: "plan-mode",
    });

    expect(steps).toContain("Motorväg: planläge");
    expect(steps).not.toContain("Motorväg: planlage");
  });

  it("uses okänd when model id is missing", () => {
    const steps = buildModelInfoSteps({
      modelTier: "pro",
    });

    expect(steps).toContain("Körmodell: okänd");
    expect(steps).not.toContain("Körmodell: okand");
  });

  it("labels the brief-lane model as Deep Brief, not Prompt-assist", () => {
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      promptAssistModel: "openai/gpt-5.6-sol",
      promptAssistProvider: "openai",
    });

    expect(steps).toContain("Deep Brief-provider: OpenAI");
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(true);
    expect(steps.some((step) => step.startsWith("Assist model:"))).toBe(false);
  });

  it("labels promptAssistDeep as the setting, not a completed Deep brief step", () => {
    expect(
      buildModelInfoSteps({ modelId: "gpt-5.5", promptAssistDeep: true }),
    ).toContain("Deep brief-inställning: på");
    expect(
      buildModelInfoSteps({ modelId: "gpt-5.5", promptAssistDeep: false }),
    ).toContain("Deep brief-inställning: av");
    expect(
      buildModelInfoSteps({ modelId: "gpt-5.5", promptAssistDeep: true }),
    ).not.toContain("Deep brief: på");
  });

  it("omits Deep Brief rows when the turn did not carry brief fields", () => {
    const steps = buildModelInfoSteps({ modelId: "gpt-5.5" });
    expect(steps.some((step) => step.startsWith("Deep Brief-"))).toBe(false);
    expect(steps.some((step) => step.startsWith("Deep brief-"))).toBe(false);
  });
});

describe("resolveDeepBriefModelInfoFields", () => {
  it("shows provider, model, and setting on an init turn where a brief ran", () => {
    const fields = resolveDeepBriefModelInfoFields({
      isInitTurn: true,
      briefUsedThisTurn: true,
      promptAssistModel: "openai/gpt-5.6-sol",
      promptAssistDeep: true,
    });
    const steps = buildModelInfoSteps({ modelId: "gpt-5.5", ...fields });

    expect(steps).toContain("Deep Brief-provider: OpenAI");
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(true);
    expect(steps).toContain("Deep brief-inställning: på");
  });

  it("hides all Deep Brief rows on a follow-up even when UI state still has the setting", () => {
    const fields = resolveDeepBriefModelInfoFields({
      isInitTurn: false,
      briefUsedThisTurn: false,
      promptAssistModel: "openai/gpt-5.6-sol",
      promptAssistDeep: true,
    });
    const steps = buildModelInfoSteps({ modelId: "gpt-5.5", ...fields });

    expect(steps.some((step) => step.includes("Deep Brief"))).toBe(false);
    expect(steps.some((step) => step.includes("Deep brief"))).toBe(false);
  });

  it("shows only the off setting on an init turn when Deep Brief is disabled", () => {
    const fields = resolveDeepBriefModelInfoFields({
      isInitTurn: true,
      briefUsedThisTurn: false,
      promptAssistModel: "off",
      promptAssistDeep: false,
    });
    const steps = buildModelInfoSteps({ modelId: "gpt-5.5", ...fields });

    expect(steps).toContain("Deep brief-inställning: av");
    expect(steps.some((step) => step.startsWith("Deep Brief-provider:"))).toBe(false);
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(false);
  });

  it("keeps provider/model hidden when setting is off but the server auto-brief ran", () => {
    // `briefApplied` from the server means A brief ran — but the selected
    // "off" model is not the model that produced it, so rendering
    // provider/model from the off value would mislabel the run.
    const fields = resolveDeepBriefModelInfoFields({
      isInitTurn: true,
      briefUsedThisTurn: true,
      promptAssistModel: "off",
      promptAssistDeep: false,
    });
    const steps = buildModelInfoSteps({ modelId: "gpt-5.5", ...fields });

    expect(steps).toContain("Deep brief-inställning: av");
    expect(steps.some((step) => step.startsWith("Deep Brief-provider:"))).toBe(false);
    expect(steps.some((step) => step.startsWith("Deep Brief-modell:"))).toBe(false);
  });
});

describe("resolveDeepBriefVisibilityFields", () => {
  it("prefers SSE reasoning, then ritning, then the client brief", () => {
    expect(
      resolveDeepBriefVisibilityFields({
        briefUsedThisTurn: true,
        meta: { deepBriefReasoning: "Tänker igenom sidorna." },
        initBrief: { oneSentencePitch: "Ett kafé.", reasoningSummary: "Klienttext" },
      }),
    ).toEqual({
      deepBriefReasoning: "Tänker igenom sidorna.",
      deepBriefBlueprint: null,
    });

    expect(
      resolveDeepBriefVisibilityFields({
        briefUsedThisTurn: true,
        meta: { deepBriefBlueprint: "Pitch: Ett kafé." },
        initBrief: { reasoningSummary: "Klienttext" },
      }),
    ).toEqual({
      deepBriefReasoning: null,
      deepBriefBlueprint: "Pitch: Ett kafé.",
    });

    expect(
      resolveDeepBriefVisibilityFields({
        briefUsedThisTurn: true,
        meta: {},
        initBrief: { oneSentencePitch: "Ett kafé." },
      }),
    ).toEqual({
      deepBriefReasoning: null,
      deepBriefBlueprint: "Pitch: Ett kafé.",
    });
  });

  it("stays empty when the turn did not use a brief", () => {
    expect(
      resolveDeepBriefVisibilityFields({
        briefUsedThisTurn: false,
        meta: { deepBriefReasoning: "Ska inte synas." },
        initBrief: { oneSentencePitch: "Ett kafé." },
      }),
    ).toEqual({ deepBriefReasoning: null, deepBriefBlueprint: null });
  });
});

describe("buildModelInfoSteps — deferred integrations and contract rows", () => {
  it("lists deferred integrations with the same planned wording as the Byggblock badge", () => {
    const plannedLabel = describeDossierStatus("planned", "design").label;
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      mutedCapabilityLabels: ["Nyhetsbrev — Mailchimp"],
    });

    expect(steps).toContain(`${plannedLabel}: Nyhetsbrev — Mailchimp`);
    expect(steps.some((step) => step.includes("Planerad — kopplas in"))).toBe(false);
  });

  it("marks contract rows without file evidence as planned", () => {
    const plannedLabel = describeDossierStatus("planned", "design").label;
    const plannedSuffix = ` (${plannedLabel})`;
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      contractAuthProvider: "clerk",
      contractDatabaseProvider: "supabase",
      contractDataMode: "persisted",
      contractEnvVars: [{ key: "CLERK_SECRET_KEY" }],
      fileEvidenceCapabilities: [],
    });

    expect(steps).toContain(`Auth: clerk${plannedSuffix}`);
    expect(steps).toContain(`Databas: supabase${plannedSuffix}`);
    expect(steps).toContain(`Data mode: persisted${plannedSuffix}`);
    expect(steps).toContain(`Kontrakt env vars: CLERK_SECRET_KEY${plannedSuffix}`);
    expect(steps).not.toContain("Auth: clerk");
  });

  it("keeps a contract row plain when the version actually contains its files", () => {
    const plannedLabel = describeDossierStatus("planned", "design").label;
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      contractAuthProvider: "clerk",
      contractDatabaseProvider: "supabase",
      fileEvidenceCapabilities: ["auth"],
    });

    expect(steps).toContain("Auth: clerk");
    expect(steps).toContain(`Databas: supabase (${plannedLabel})`);
  });

  it("leaves a mocked data mode plain — it is what the round delivers", () => {
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      contractDataMode: "mocked",
      fileEvidenceCapabilities: [],
    });

    expect(steps).toContain("Data mode: mocked");
  });

  it("does not let an unrelated dossier vouch for the contract env vars", () => {
    const steps = buildModelInfoSteps({
      modelId: "gpt-5.5",
      contractAuthProvider: "clerk",
      contractEnvVars: [{ key: "CLERK_SECRET_KEY" }],
      fileEvidenceCapabilities: ["command-palette"],
    });

    expect(steps).toContain(
      `Kontrakt env vars: CLERK_SECRET_KEY (${describeDossierStatus("planned", "design").label})`,
    );
  });
});

describe("integrationSignalToToolPart", () => {
  it("uses provider-derived display names instead of generic Integration fallback", () => {
    const part = integrationSignalToToolPart(
      {
        key: "stripe",
        name: "Integration",
        provider: "stripe",
        intent: "env_vars",
        envVars: ["STRIPE_SECRET_KEY"],
        status: "Kräver konfiguration",
      },
      "fallback",
    );

    const output = (part as { output?: { steps?: string[] } }).output;
    expect(output?.steps).toContain("Integration: Stripe");
    expect(output?.steps).not.toContain("Integration: Integration");
  });

  it("omits integration label when both name and provider are generic/empty", () => {
    const part = integrationSignalToToolPart(
      {
        key: "integration:unknown",
        name: "Integration",
        intent: "configure",
        status: "Kräver konfiguration",
      },
      "fallback",
    );

    const output = (part as { output?: { steps?: string[] } }).output;
    expect(output?.steps).toContain("Åtgärd: Konfigurera");
    expect(output?.steps).toContain("Status: Kräver konfiguration");
    expect(output?.steps).not.toContain("Integration: Integration");
  });

  it("maps overviewStatus values through describeDossierStatus (K1 one language)", () => {
    const part = integrationSignalToToolPart(
      {
        key: "mailchimp",
        name: "Mailchimp",
        status: "planned",
      },
      "fallback",
    );

    const output = (part as { output?: { steps?: string[] } }).output;
    expect(output?.steps).toContain(
      `Status: ${describeDossierStatus("planned", "design").label}`,
    );
    expect(output?.steps).not.toContain("Status: planned");
  });
});
