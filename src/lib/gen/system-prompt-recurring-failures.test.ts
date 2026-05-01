import { beforeEach, describe, expect, it, vi } from "vitest";

const readRecurringPatternsForChatMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/recurring-patterns-reader", () => ({
  readRecurringPatternsForChat: readRecurringPatternsForChatMock,
}));

import { renderRecurringFailuresBlockLines } from "./system-prompt";

describe("renderRecurringFailuresBlockLines (Phase 2D)", () => {
  beforeEach(() => {
    readRecurringPatternsForChatMock.mockReset();
  });

  it("returns [] when chatId missing", () => {
    expect(renderRecurringFailuresBlockLines(null)).toEqual([]);
    expect(renderRecurringFailuresBlockLines("")).toEqual([]);
  });

  it("returns [] when no patterns", () => {
    readRecurringPatternsForChatMock.mockReturnValue([]);
    expect(renderRecurringFailuresBlockLines("chat_a")).toEqual([]);
  });

  it("returns [] when patterns exist but all have < 2 occurrences", () => {
    readRecurringPatternsForChatMock.mockReturnValue([
      { pattern: "missing-h1", occurrences: 1 },
      { pattern: "img-alt", occurrences: 1 },
    ]);
    expect(renderRecurringFailuresBlockLines("chat_a")).toEqual([]);
  });

  it("renders block for >= 2-occurrence patterns", () => {
    readRecurringPatternsForChatMock.mockReturnValue([
      { pattern: "missing-h1", occurrences: 3, files: [{ file: "src/app/page.tsx", count: 2 }] },
      { pattern: "img-alt", occurrences: 2 },
    ]);
    const lines = renderRecurringFailuresBlockLines("chat_a");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toBe("### Recurring failures on this site");
    const joined = lines.join("\n");
    expect(joined).toContain("missing-h1");
    expect(joined).toContain("×3");
    expect(joined).toContain("img-alt");
    expect(joined).toContain("×2");
  });

  it("caps to 5 patterns", () => {
    readRecurringPatternsForChatMock.mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        pattern: `pattern-${i}`,
        occurrences: 5,
      })),
    );
    const lines = renderRecurringFailuresBlockLines("chat_a");
    const itemLines = lines.filter((l) => l.startsWith("- `pattern-"));
    expect(itemLines.length).toBe(5);
  });

  it("respects 600-char budget — drops items rather than truncating mid-line", () => {
    readRecurringPatternsForChatMock.mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({
        pattern: `very-long-pattern-name-${i}`.repeat(8),
        occurrences: 5,
      })),
    );
    const lines = renderRecurringFailuresBlockLines("chat_a");
    expect(lines.join("\n").length).toBeLessThanOrEqual(600);
    // Header + intro should always survive.
    expect(lines[0]).toBe("### Recurring failures on this site");
  });

  it("falls silently if reader throws", () => {
    readRecurringPatternsForChatMock.mockImplementation(() => {
      throw new Error("disk read failed");
    });
    expect(renderRecurringFailuresBlockLines("chat_a")).toEqual([]);
  });
});
