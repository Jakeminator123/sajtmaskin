import { describe, expect, it } from "vitest";
import {
  buildF3AwaitingInputUiPart,
  resolvePendingF3Continuation,
} from "./f3-continuation";

type WalkMessage = Parameters<typeof resolvePendingF3Continuation>[0] extends
  | (infer T)[]
  | null
  | undefined
  ? T
  : never;

function assistantMarker(parentVersionId: string | null): WalkMessage {
  return {
    role: "assistant",
    ui_parts: [
      buildF3AwaitingInputUiPart({
        question: "Integrationer signalerades, men modellen skrev inga kodfiler.",
        parentVersionId,
      }),
    ],
  };
}

const user: WalkMessage = { role: "user", ui_parts: null };
const assistantPlain: WalkMessage = { role: "assistant", ui_parts: null };

describe("buildF3AwaitingInputUiPart", () => {
  it("builds a tool:awaiting-input part with the machine-readable F3 marker", () => {
    const part = buildF3AwaitingInputUiPart({
      question: "Fråga?",
      parentVersionId: "ver_f2",
    });
    expect(part.type).toBe("tool:awaiting-input");
    const output = part.output as Record<string, unknown>;
    expect(output.f3Continuation).toBe(true);
    expect(output.lifecycleStage).toBe("integrations");
    expect(output.parentVersionId).toBe("ver_f2");
    expect(output.awaitingInput).toBe(true);
    // Must NOT be readable as a contract clarification —
    // collectConfirmedContractAnswers keys on `contractClarification === true`.
    expect(output.contractClarification).toBeUndefined();
  });
});

describe("resolvePendingF3Continuation", () => {
  it("reports the pending continuation when the marker is the last actionable state", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2_parent"),
    ]);
    expect(pending).toEqual({ parentVersionId: "ver_f2_parent" });
  });

  it("survives non-marker assistant messages after the marker (repair summaries etc.)", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2_parent"),
      assistantPlain,
    ]);
    expect(pending).toEqual({ parentVersionId: "ver_f2_parent" });
  });

  it("is consumed by a user reply — a later design follow-up does NOT inherit", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2_parent"),
      user, // "Godkänn förslag" already answered the F3 question
      assistantPlain, // e.g. the F3 version's assistant message
    ]);
    expect(pending).toBeNull();
  });

  it("re-arms when a NEW marker is persisted after the previous reply", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_a"),
      user,
      assistantMarker("ver_b"),
    ]);
    expect(pending).toEqual({ parentVersionId: "ver_b" });
  });

  it("returns null for plain history, empty history and missing ui_parts", () => {
    expect(resolvePendingF3Continuation([user, assistantPlain])).toBeNull();
    expect(resolvePendingF3Continuation([])).toBeNull();
    expect(resolvePendingF3Continuation(null)).toBeNull();
    expect(resolvePendingF3Continuation(undefined)).toBeNull();
  });

  it("ignores awaiting-input parts without the F3 marker (clarifications)", () => {
    const clarification: WalkMessage = {
      role: "assistant",
      ui_parts: [
        {
          type: "tool:awaiting-input",
          toolName: "Klargörande fråga",
          state: "approval-requested",
          output: {
            question: "Vad vill du fokusera på?",
            kind: "scope",
            blocking: true,
            awaitingInput: true,
          },
        },
      ],
    };
    expect(resolvePendingF3Continuation([user, clarification])).toBeNull();
  });

  it("normalizes a missing/blank parentVersionId to null", () => {
    const pending = resolvePendingF3Continuation([user, assistantMarker(null)]);
    expect(pending).toEqual({ parentVersionId: null });
  });
});
