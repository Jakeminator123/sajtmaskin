import { beforeEach, describe, expect, it, vi } from "vitest";

const { devLogAppend } = vi.hoisted(() => ({
  devLogAppend: vi.fn(),
}));

vi.mock("@/lib/logging/dev-log", () => ({
  devLogAppend,
}));

import { logRequestKindClassification } from "./request-kind-log";

describe("logRequestKindClassification", () => {
  beforeEach(() => {
    devLogAppend.mockClear();
  });

  it("logs classified before any caller can short-circuit, including init", () => {
    const result = logRequestKindClassification({
      message: "vad är klockan i Paris",
      generationKind: "init",
    });

    expect(result.kind).toBe("unclassified");
    expect(result.questionShape).toBe("qa-hint-no-mark");
    expect(devLogAppend).toHaveBeenCalledWith("in-progress", {
      type: "request.kind.classified",
      generationKind: "init",
      chatId: null,
      kind: "unclassified",
      source: "regex",
      questionShape: "qa-hint-no-mark",
      hasQaHint: true,
      hasQuestionMark: false,
      hasChangeVerb: false,
      hasScoreHint: false,
    });
  });

  it("still logs qa-or-score follow-ups so short-circuit turns are measurable", () => {
    const result = logRequestKindClassification({
      message: "vad är klockan i Paris?",
      generationKind: "followup",
      chatId: "chat_1",
    });

    expect(result.kind).toBe("qa-or-score");
    expect(devLogAppend).toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({
        type: "request.kind.classified",
        generationKind: "followup",
        chatId: "chat_1",
        kind: "qa-or-score",
        questionShape: "qa-or-score",
      }),
    );
  });
});
