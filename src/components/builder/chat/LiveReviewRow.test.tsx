import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveReviewRow, reasoningAddsDetail } from "./LiveReviewRow";
import type { LiveReviewResult } from "@/lib/gen/verify/live-review-types";

function completed(overrides: Partial<LiveReviewResult & { decision?: never }> & {
  rationale?: string;
  reasoning?: string;
} = {}): LiveReviewResult {
  return {
    status: "completed",
    durationMs: 10,
    modelId: "test",
    decision: {
      verdict: "advisory",
      confidence: 0.5,
      rationale: overrides.rationale ?? "Hero är för ljus.",
      reasoning: overrides.reasoning ?? "Hero är för ljus.",
      issues: [],
    },
  };
}

describe("reasoningAddsDetail", () => {
  it("döljer identisk eller nästan identisk reasoning", () => {
    expect(reasoningAddsDetail("Hero är för ljus.", "Hero är för ljus.")).toBe(false);
    expect(reasoningAddsDetail("Hero är för ljus.", "  hero är för ljus.  ")).toBe(false);
    expect(reasoningAddsDetail("Hero är för ljus.", "")).toBe(false);
  });

  it("visar reasoning som tillför extra evidens", () => {
    expect(
      reasoningAddsDetail(
        "Hero är för ljus.",
        "Skärmdumpen visar vit bakgrund mot en brief som bad om mörkt.",
      ),
    ).toBe(true);
  });
});

describe("LiveReviewRow", () => {
  it("döljer expandern när reasoning bara upprepar rationale", () => {
    render(<LiveReviewRow result={completed()} />);
    expect(screen.getByText("Hero är för ljus.")).toBeTruthy();
    expect(screen.queryByText("Granskarens motivering")).toBeNull();
    expect(screen.queryByText("Visa resonemang")).toBeNull();
  });

  it("visar Granskarens motivering när reasoning tillför något", () => {
    render(
      <LiveReviewRow
        result={completed({
          rationale: "Hero är för ljus.",
          reasoning: "Skärmdumpen visar vit bakgrund mot en brief som bad om mörkt.",
        })}
      />,
    );
    expect(screen.getByText("Granskarens motivering")).toBeTruthy();
  });
});
