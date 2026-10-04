import { describe, expect, it } from "vitest";
import { mergeUiParts } from "./helpers-ui-parts";

const SCREENSHOTS = {
  desktopUrl: "https://abc.public.blob.vercel-storage.com/live-review/desktop.jpg",
  mobileUrl: "https://abc.public.blob.vercel-storage.com/live-review/mobile.jpg",
};

function liveReviewPart(output: Record<string, unknown>) {
  return {
    type: "tool:live-review",
    toolName: "Live-granskning",
    toolCallId: "live-review:v1",
    state: "output-available",
    output,
  };
}

describe("mergeUiParts for tool:live-review", () => {
  it("keeps earlier screenshots when a cached review arrives with screenshots: null", () => {
    const first = liveReviewPart({ status: "completed", verdict: "ok", screenshots: SCREENSHOTS });
    const cached = liveReviewPart({ status: "completed", verdict: "ok", screenshots: null });

    const [merged] = mergeUiParts([first], [cached]);

    expect((merged as { output: Record<string, unknown> }).output).toMatchObject({
      status: "completed",
      screenshots: SCREENSHOTS,
    });
  });

  it("replaces screenshots when the new review brings its own", () => {
    const next = {
      desktopUrl: "https://abc.public.blob.vercel-storage.com/live-review/desktop-2.jpg",
      mobileUrl: null,
    };
    const [merged] = mergeUiParts(
      [liveReviewPart({ status: "completed", screenshots: SCREENSHOTS })],
      [liveReviewPart({ status: "completed", screenshots: next })],
    );

    expect((merged as { output: Record<string, unknown> }).output.screenshots).toEqual(next);
  });

  it("stays null when no capture ever stored screenshots", () => {
    const [merged] = mergeUiParts(
      [liveReviewPart({ status: "completed", screenshots: null })],
      [liveReviewPart({ status: "completed", screenshots: null })],
    );

    expect((merged as { output: Record<string, unknown> }).output.screenshots).toBeNull();
  });
});
