import { describe, expect, it } from "vitest";

import { buildAiSdkV5RepairHint } from "./ai-sdk-v5-repair-hint";

describe("buildAiSdkV5RepairHint", () => {
  it("returns [] when the error text names no AI-SDK v4 symbol", () => {
    expect(buildAiSdkV5RepairHint("TS2322: Type 'number' is not assignable to 'string'.")).toEqual(
      [],
    );
    expect(buildAiSdkV5RepairHint("")).toEqual([]);
  });

  it("maps CoreMessage (TS2305) to the UIMessage/convertToModelMessages rewrite", () => {
    const hint = buildAiSdkV5RepairHint(
      "app/api/chat/route.ts(2,10): error TS2305: Module '\"ai\"' has no exported member 'CoreMessage'.",
    ).join("\n");
    expect(hint).toContain("AI SDK v4→v5 migration");
    expect(hint).toContain("CoreMessage");
    expect(hint).toContain("convertToModelMessages");
  });

  it("maps maxSteps (TS2353) to stopWhen/stepCountIs", () => {
    const hint = buildAiSdkV5RepairHint(
      "error TS2353: Object literal may only specify known properties, and 'maxSteps' does not exist.",
    ).join("\n");
    expect(hint).toContain("stopWhen: stepCountIs(n)");
  });

  it("maps textDelta (TS2339) to the text-delta part.delta rewrite", () => {
    const hint = buildAiSdkV5RepairHint(
      "error TS2339: Property 'textDelta' does not exist on type 'TextStreamPart'.",
    ).join("\n");
    expect(hint).toContain("part.delta");
    expect(hint).toContain("text-delta");
  });

  it("combines multiple drift symbols into one hint block", () => {
    const hint = buildAiSdkV5RepairHint("CoreMessage ... maxSteps ... textDelta");
    // 1 header + 3 rewrite bullets.
    expect(hint).toHaveLength(4);
  });
});
