import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import {
  buildAutoFixPrompt,
  buildPromptStrategySteps,
  finalizeStreamStats,
  initStreamStats,
  mergeStreamingText,
} from "./helpers";
import type { PromptStrategyMeta } from "@/lib/builder/promptOrchestration";

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
  });
});
