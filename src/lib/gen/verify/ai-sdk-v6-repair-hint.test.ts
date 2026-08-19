import { describe, expect, it } from "vitest";

import { buildAiSdkV6RepairHint } from "./ai-sdk-v6-repair-hint";

describe("buildAiSdkV6RepairHint", () => {
  it("returns [] when the error text names no AI-SDK v4 symbol", () => {
    expect(buildAiSdkV6RepairHint("TS2322: Type 'number' is not assignable to 'string'.")).toEqual(
      [],
    );
    expect(buildAiSdkV6RepairHint("")).toEqual([]);
  });

  it("maps CoreMessage (TS2305) to the UIMessage/convertToModelMessages rewrite", () => {
    const hint = buildAiSdkV6RepairHint(
      "app/api/chat/route.ts(2,10): error TS2305: Module '\"ai\"' has no exported member 'CoreMessage'.",
    ).join("\n");
    expect(hint).toContain("AI SDK 6 repair contract");
    expect(hint).toContain("ai@^6");
    expect(hint).not.toContain("ai@^7");
    expect(hint).toContain("CoreMessage");
    expect(hint).toContain("await convertToModelMessages(messages)");
  });

  it("repairs a missing await on async convertToModelMessages", () => {
    const hint = buildAiSdkV6RepairHint(
      "error TS2740: Type 'Promise<ModelMessage[]>' is missing the following properties from type 'ModelMessage[]': length, pop, push",
    ).join("\n");
    expect(hint).toContain("await convertToModelMessages(messages)");
  });

  it("maps maxSteps (TS2353) to stopWhen/stepCountIs", () => {
    const hint = buildAiSdkV6RepairHint(
      "error TS2353: Object literal may only specify known properties, and 'maxSteps' does not exist.",
    ).join("\n");
    expect(hint).toContain("stopWhen: stepCountIs(n)");
  });

  it("maps textDelta (TS2339) to the text-delta part.delta rewrite", () => {
    const hint = buildAiSdkV6RepairHint(
      "error TS2339: Property 'textDelta' does not exist on type 'TextStreamPart'.",
    ).join("\n");
    expect(hint).toContain("part.delta");
    expect(hint).toContain("text-delta");
  });

  it("combines multiple drift symbols into one hint block", () => {
    const hint = buildAiSdkV6RepairHint("CoreMessage ... maxSteps ... textDelta");
    // 1 header + 3 rewrite bullets.
    expect(hint).toHaveLength(4);
  });
});
