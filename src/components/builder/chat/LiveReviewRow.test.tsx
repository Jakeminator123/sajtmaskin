import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveReviewRow, reasoningAddsDetail } from "./LiveReviewRow";
import type { LiveReviewChatResult } from "./tooling/output-parsers";

function completed(overrides: {
  rationale?: string;
  reasoning?: string;
  screenshots?: LiveReviewChatResult["screenshots"];
} = {}): LiveReviewChatResult {
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
    screenshots: overrides.screenshots,
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

  it("renderar hopfällbara desktop- och mobilminiatyrer för en completed review", () => {
    render(
      <LiveReviewRow
        result={completed({
          screenshots: {
            desktopUrl: "https://abc.public.blob.vercel-storage.com/live-review-desktop-rev.jpg",
            mobileUrl: "https://abc.public.blob.vercel-storage.com/live-review-mobile-rev.jpg",
          },
        })}
      />,
    );
    expect(screen.getByTestId("live-review-screenshots")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByText("Skärmdumpar"));
    expect(screen.getByAltText("Desktop-skärmdump av previewn")).toBeTruthy();
    expect(screen.getByAltText("Mobil-skärmdump av previewn")).toBeTruthy();
  });

  it("renderar ingenting för en skippad live review", () => {
    render(<LiveReviewRow result={{ status: "skipped", reason: "flag_off" }} />);
    expect(screen.queryByTestId("live-review-row")).toBeNull();
    expect(screen.queryByTestId("live-review-screenshots")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("döljer en raderad blob utan trasig bild", () => {
    render(
      <LiveReviewRow
        result={completed({
          screenshots: {
            desktopUrl: "https://abc.public.blob.vercel-storage.com/gone-desktop.jpg",
            mobileUrl: "https://abc.public.blob.vercel-storage.com/gone-mobile.jpg",
          },
        })}
      />,
    );
    fireEvent.click(screen.getByText("Skärmdumpar"));
    fireEvent.error(screen.getByAltText("Desktop-skärmdump av previewn"));
    fireEvent.error(screen.getByAltText("Mobil-skärmdump av previewn"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByTestId("live-review-screenshots")).toBeNull();
  });
});
