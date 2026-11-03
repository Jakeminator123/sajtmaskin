import { describe, expect, it } from "vitest";
import { hasGenerationWarnings, reconcileCanonicalPreviewParts, type CanonicalGenerationStatus } from "./generation-surface-state";
import { getActiveAgentLogLabel } from "./tooling/agent-log";
import type { ToolPart } from "./tooling/types";

const pending = { type: "tool", tool: {
  type: "tool:engine-preview", state: "input-streaming", toolCallId: "progress:preview",
  output: { chatId: "c1", versionId: "v1", assistantMessageId: "a1", phase: "starting", steps: ["Startar preview"] },
} } as unknown as ToolPart;
const canonical: CanonicalGenerationStatus = { chatId: "c1", versionId: "v1", status: "ready", isLatest: true };
const context = { chatId: "c1", versionId: "v1", messageId: "a1", isStreaming: false, isCurrentTurn: true, canonical };

describe("canonical preview reconciliation", () => {
  it.each(["ready", "promoted", "degraded", "failed", "blocked"] as const)("settles matching abandoned preview with the honest %s verdict", (status) => {
    const parts = reconcileCanonicalPreviewParts([pending], { ...context, canonical: { ...canonical, status } });
    expect(getActiveAgentLogLabel(parts, { includePipelineProgress: false })).toBeNull();
    expect(parts[0].tool.state).toBe(status === "failed" || status === "blocked" ? "output-error" : "output-available");
    expect(hasGenerationWarnings(parts)).toBe(!["ready", "promoted"].includes(status));
    expect(pending.tool.state).toBe("input-streaming");
  });

  it.each([
    { canonical: null },
    { canonical: { ...canonical, status: "verifying" as const } },
    { canonical: { ...canonical, chatId: "another-chat" } },
    { canonical: { ...canonical, versionId: "another-version" } },
    { canonical: { ...canonical, isLatest: false } },
    { versionId: "older-focus" },
    { messageId: "another-turn" },
    { isCurrentTurn: false },
    { isStreaming: true },
  ])("preserves pending activity for missing, mismatched or nonterminal evidence: %j", (override) => {
    const parts = [pending];
    expect(reconcileCanonicalPreviewParts(parts, { ...context, ...override })).toBe(parts);
    expect(getActiveAgentLogLabel(parts, { includePipelineProgress: false })).toBeTruthy();
  });

  it("does not settle an unbound legacy preview or other active tools", () => {
    const unbound = { ...pending, tool: { ...pending.tool, output: { phase: "starting" } } } as ToolPart;
    const generation = { ...pending, tool: { ...pending.tool, type: "tool:engine-generation" } } as unknown as ToolPart;
    const parts = reconcileCanonicalPreviewParts([unbound, generation], context);
    expect(parts[0]).toBe(unbound);
    expect(parts[1]).toBe(generation);
  });

  it("preserves actual preview errors and independent review warnings", () => {
    const error = { ...pending, tool: { ...pending.tool, state: "output-error" } } as ToolPart;
    const review = { type: "tool", tool: { type: "tool:quality-gate", state: "output-error", output: { reason: "Real failure" } } } as unknown as ToolPart;
    const parts = reconcileCanonicalPreviewParts([pending, error, review], context);
    expect(parts[1]).toBe(error);
    expect(parts[2]).toBe(review);
    expect(hasGenerationWarnings(parts)).toBe(true);
  });
});
