import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage, UiMessagePart } from "@/lib/builder/types";
import { useBuilderDerivedState } from "./useBuilderDerivedState";

const readyPlan: UiMessagePart = {
  type: "plan",
  plan: { awaitingInput: false, raw: { goal: "A site", blockers: [] } },
};

function assistant(uiParts: UiMessagePart[] = [readyPlan]): ChatMessage {
  return { id: "plan", role: "assistant", content: "Plan", uiParts };
}

function readState(messages: ChatMessage[]) {
  return renderHook(() => useBuilderDerivedState({
    chatId: "chat_1", messages, selectedVersionId: null, chat: null, versions: [],
    templateId: null, resolvedPrompt: null, auditPromptLoaded: true,
    isMediaEnabled: false, enableBlobMedia: false,
  })).result.current.isAwaitingPlanApproval;
}

describe("plan approval preview state", () => {
  it("waits for an explicitly ready plan", () => {
    expect(readState([assistant()])).toBe(true);
  });

  it("stops waiting as soon as a user submits a reply", () => {
    expect(readState([assistant(), { id: "reply", role: "user", content: "Build" }])).toBe(false);
  });

  it.each([
    { type: "plan" },
    { type: "plan", plan: { raw: { blockers: [] } } },
    { type: "plan", plan: { awaitingInput: true, raw: { blockers: [] } } },
    { type: "plan", plan: { awaitingInput: false, raw: { blockers: [{ question: "Which?" }] } } },
    { type: "plan", plan: { awaitingInput: false, raw: [] } },
    { ...readyPlan, isStreaming: true },
  ])("does not advertise approval for unready/legacy data: %j", (part) => {
    expect(readState([assistant([part])])).toBe(false);
  });

  it("does not wait while the assistant is streaming", () => {
    expect(readState([{ ...assistant(), isStreaming: true }])).toBe(false);
  });

  it("lets a pending question take precedence", () => {
    expect(readState([assistant([readyPlan, { type: "tool:awaiting-input" }])])).toBe(false);
  });

  it("uses the chat's approval-requested guard, including earlier assistant rows", () => {
    const question = assistant([{ type: "tool-custom", state: "approval-requested" }]);
    expect(readState([question, assistant()])).toBe(false);
  });

  it("does not reuse an older plan after a newer assistant answer", () => {
    expect(readState([assistant(), { id: "answer", role: "assistant", content: "Done" }])).toBe(false);
  });

  it("accepts the flat persisted plan shape used by the message adapter", () => {
    expect(readState([assistant([{ type: "plan", awaitingInput: false, blockers: [] }])])).toBe(true);
  });
});
