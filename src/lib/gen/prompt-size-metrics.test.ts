import { describe, expect, it } from "vitest";

import { buildPromptSizeMetrics } from "./prompt-size-metrics";

describe("buildPromptSizeMetrics", () => {
  it("summarizes static, dynamic, pruning, and largest dynamic blocks", () => {
    const result = buildPromptSizeMetrics({
      engineSystemPrompt: [
        "static core",
        "",
        "---",
        "",
        "# Request-Specific Context",
        "",
        "## Small",
        "short",
        "",
        "## Large",
        "x".repeat(80),
      ].join("\n"),
      dynamicContext: ["## Small", "short", "", "## Large", "x".repeat(80)].join("\n"),
      dynamicContextPruning: {
        budgetTokens: 100,
        usedTokens: 30,
        keptBlockKeys: ["small"],
        droppedBlockKeys: ["large"],
      },
      dynamicContextBlocks: [
        {
          key: "small",
          title: "Small",
          priority: 60,
          required: false,
          chars: 14,
          estimatedTokens: 5,
          kept: true,
        },
        {
          key: "large",
          title: "Large",
          priority: 60,
          required: false,
          chars: 90,
          estimatedTokens: 29,
          kept: false,
        },
      ],
    });

    expect(result.total.chars).toBeGreaterThan(result.staticCore.chars);
    expect(result.dynamicBudget).toMatchObject({
      budgetTokens: 100,
      usedTokens: 30,
      keptBlocks: 1,
      droppedBlocks: 1,
      droppedBlockKeys: ["large"],
    });
    expect(result.blocks).toMatchObject({
      total: 2,
      kept: 1,
      dropped: 1,
    });
    expect(result.blocks.largest[0]).toMatchObject({
      key: "large",
      chars: 90,
      kept: false,
    });
  });
});
