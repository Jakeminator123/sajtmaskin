import { describe, expect, it } from "vitest";
import {
  F3_CONTINUATION_APPROVE_OPTION,
  F3_CONTINUATION_OTHER_OPTION,
  F3_CONTINUATION_REJECT_OPTION,
  F3_CONTINUATION_TOOL_NAME,
  buildF3AwaitingInputUiPart,
  classifyF3ContinuationReply,
  resolvePendingF3Continuation,
} from "./f3-continuation";

type WalkMessage = Parameters<typeof resolvePendingF3Continuation>[0] extends
  | (infer T)[]
  | null
  | undefined
  ? T
  : never;

let markerCounter = 0;

function assistantMarker(
  parentVersionId: string | null,
  options?: {
    id?: string;
    consumed?: boolean;
    suggestedProviders?: string[];
    toolOnlyRounds?: number;
  },
): WalkMessage {
  const part = buildF3AwaitingInputUiPart({
    question: "Integrationer signalerades, men modellen skrev inga kodfiler.",
    parentVersionId,
    suggestedProviders: options?.suggestedProviders,
    toolOnlyRounds: options?.toolOnlyRounds,
  });
  if (options?.consumed) {
    (part.output as Record<string, unknown>).f3ContinuationConsumed = true;
  }
  markerCounter += 1;
  return {
    id: options?.id ?? `msg_marker_${markerCounter}`,
    role: "assistant",
    ui_parts: [part],
  };
}

const user: WalkMessage = { id: "msg_user", role: "user", ui_parts: null };
const assistantPlain: WalkMessage = {
  id: "msg_assistant_plain",
  role: "assistant",
  ui_parts: null,
};

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

  it("persists the canonical quick-reply options the server classifies against", () => {
    const part = buildF3AwaitingInputUiPart({ question: "Q", parentVersionId: null });
    const output = part.output as Record<string, unknown>;
    expect(output.options).toEqual([
      F3_CONTINUATION_APPROVE_OPTION,
      F3_CONTINUATION_REJECT_OPTION,
      F3_CONTINUATION_OTHER_OPTION,
    ]);
  });

  it("persists signaled providers and the tool-only round counter (P2 F3-loop)", () => {
    const part = buildF3AwaitingInputUiPart({
      question: "Q",
      parentVersionId: null,
      suggestedProviders: ["stripe", "  ", "resend"],
      toolOnlyRounds: 2,
    });
    const output = part.output as Record<string, unknown>;
    expect(output.suggestedProviders).toEqual(["stripe", "resend"]);
    expect(output.toolOnlyRounds).toBe(2);
  });

  it("defaults providers to [] and rounds to 1 when omitted", () => {
    const part = buildF3AwaitingInputUiPart({ question: "Q", parentVersionId: null });
    const output = part.output as Record<string, unknown>;
    expect(output.suggestedProviders).toEqual([]);
    expect(output.toolOnlyRounds).toBe(1);
  });

  it("uses a toolName that never matches the integration/env tool-part filters (Bugbot MEDIUM)", () => {
    // Mirrors `isIntegrationOrEnvToolPart` + `looksLikeEnvVarEvent`
    // (BuilderMessageTooling.tsx): a matching name suppresses the
    // awaiting-input detection after reload → quick-replies disappear.
    const name = F3_CONTINUATION_TOOL_NAME.toLowerCase();
    expect(name.includes("integration")).toBe(false);
    expect(name.includes("environment")).toBe(false);
    expect(name.includes("env-var") || name.includes("env_var") || name.includes("envvar")).toBe(
      false,
    );
    expect(name.includes("env") && (name.includes("var") || name.includes("variable"))).toBe(
      false,
    );
  });
});

describe("classifyF3ContinuationReply", () => {
  it("approves the exact quick-reply option (case-insensitive, trimmed)", () => {
    expect(classifyF3ContinuationReply("Godkänn förslag")).toBe("approve");
    expect(classifyF3ContinuationReply("  godkänn förslag  ")).toBe("approve");
  });

  it("rejects the exact reject option and treats 'Annat' as unrelated", () => {
    expect(classifyF3ContinuationReply("Avvisa förslag")).toBe("reject");
    expect(classifyF3ContinuationReply("Annat")).toBe("unrelated");
  });

  it("approves conservative free-text approvals", () => {
    expect(classifyF3ContinuationReply("Godkänner förslaget, kör!")).toBe("approve");
    expect(classifyF3ContinuationReply("kör integrationsbygget igen")).toBe("approve");
    expect(classifyF3ContinuationReply("bygg integrationerna nu")).toBe("approve");
    expect(classifyF3ContinuationReply("Approve the proposal")).toBe("approve");
  });

  it("never approves negated replies (fail-safe F2)", () => {
    expect(classifyF3ContinuationReply("godkänn inte förslaget")).toBe("unrelated");
    expect(classifyF3ContinuationReply("bygg inte integrationerna")).toBe("unrelated");
    expect(classifyF3ContinuationReply("don't approve this")).toBe("unrelated");
    expect(classifyF3ContinuationReply("nej, avvisa förslaget")).toBe("reject");
  });

  it("classifies explicit declines as reject", () => {
    expect(classifyF3ContinuationReply("avvisa")).toBe("reject");
    expect(classifyF3ContinuationReply("Nej tack")).toBe("reject");
    expect(classifyF3ContinuationReply("hoppa över det här")).toBe("reject");
  });

  it("treats design edits and ambiguous replies as unrelated (fail-safe F2)", () => {
    expect(classifyF3ContinuationReply("byt hero-färgen till blå")).toBe("unrelated");
    expect(classifyF3ContinuationReply("gör rubriken större")).toBe("unrelated");
    // "kör" without an integration noun is too ambiguous to burn F3 credits on.
    expect(classifyF3ContinuationReply("kör igen")).toBe("unrelated");
    expect(classifyF3ContinuationReply("ja")).toBe("unrelated");
    expect(classifyF3ContinuationReply("")).toBe("unrelated");
  });

  it("does not false-positive on substrings thanks to unicode word boundaries", () => {
    // "kör" inside "workshopkörning" / "no" inside "logo" must not match.
    expect(classifyF3ContinuationReply("uppdatera logotypen")).toBe("unrelated");
    expect(classifyF3ContinuationReply("lägg till en workshopkörning på sidan")).toBe(
      "unrelated",
    );
  });
});

describe("resolvePendingF3Continuation", () => {
  it("reports the pending continuation (with messageId) when the marker is the last actionable state", () => {
    const marker = assistantMarker("ver_f2_parent", { id: "msg_m1" });
    const pending = resolvePendingF3Continuation([user, marker]);
    expect(pending).toEqual({
      messageId: "msg_m1",
      parentVersionId: "ver_f2_parent",
      suggestedProviders: [],
      toolOnlyRounds: 1,
    });
  });

  it("survives non-marker assistant messages after the marker (repair summaries etc.)", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2_parent", { id: "msg_m1" }),
      assistantPlain,
    ]);
    expect(pending).toEqual({
      messageId: "msg_m1",
      parentVersionId: "ver_f2_parent",
      suggestedProviders: [],
      toolOnlyRounds: 1,
    });
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

  it("ignores a DB-consumed marker (atomic race arbiter already spent it)", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2_parent", { consumed: true }),
    ]);
    expect(pending).toBeNull();
  });

  it("re-arms when a NEW marker is persisted after the previous reply", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_a"),
      user,
      assistantMarker("ver_b", { id: "msg_m2" }),
    ]);
    expect(pending).toEqual({
      messageId: "msg_m2",
      parentVersionId: "ver_b",
      suggestedProviders: [],
      toolOnlyRounds: 1,
    });
  });

  it("returns null for plain history, empty history and missing ui_parts", () => {
    expect(resolvePendingF3Continuation([user, assistantPlain])).toBeNull();
    expect(resolvePendingF3Continuation([])).toBeNull();
    expect(resolvePendingF3Continuation(null)).toBeNull();
    expect(resolvePendingF3Continuation(undefined)).toBeNull();
  });

  it("ignores awaiting-input parts without the F3 marker (clarifications)", () => {
    const clarification: WalkMessage = {
      id: "msg_clar",
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
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker(null, { id: "msg_m3" }),
    ]);
    expect(pending).toEqual({
      messageId: "msg_m3",
      parentVersionId: null,
      suggestedProviders: [],
      toolOnlyRounds: 1,
    });
  });

  it("carries suggestedProviders + toolOnlyRounds from the marker (P2 F3-loop)", () => {
    const pending = resolvePendingF3Continuation([
      user,
      assistantMarker("ver_f2", {
        id: "msg_m4",
        suggestedProviders: ["stripe"],
        toolOnlyRounds: 2,
      }),
    ]);
    expect(pending).toEqual({
      messageId: "msg_m4",
      parentVersionId: "ver_f2",
      suggestedProviders: ["stripe"],
      toolOnlyRounds: 2,
    });
  });

  it("defaults suggestedProviders/toolOnlyRounds for legacy markers without the fields", () => {
    const legacyMarker: WalkMessage = {
      id: "msg_legacy",
      role: "assistant",
      ui_parts: [
        {
          type: "tool:awaiting-input",
          toolName: F3_CONTINUATION_TOOL_NAME,
          state: "approval-requested",
          output: {
            question: "Q",
            kind: "f3-continuation",
            f3Continuation: true,
            lifecycleStage: "integrations",
            parentVersionId: "ver_old",
            blocking: true,
            awaitingInput: true,
          },
        },
      ],
    };
    const pending = resolvePendingF3Continuation([user, legacyMarker]);
    expect(pending).toEqual({
      messageId: "msg_legacy",
      parentVersionId: "ver_old",
      suggestedProviders: [],
      toolOnlyRounds: 1,
    });
  });
});
