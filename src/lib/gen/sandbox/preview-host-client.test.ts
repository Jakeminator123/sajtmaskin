import { describe, expect, it } from "vitest";
import { describePreviewHostHttpFailure } from "./preview-host-client";

describe("describePreviewHostHttpFailure", () => {
  it("explains stale preview-host deployments for verify-route 404s", () => {
    expect(
      describePreviewHostHttpFailure({
        endpoint: "/preview/verify",
        status: 404,
        body: { message: "Route not found." },
      }),
    ).toContain("appears older than this repo");
  });

  it("falls back to the upstream message for generic failures", () => {
    expect(
      describePreviewHostHttpFailure({
        endpoint: "/preview/session/start",
        status: 500,
        body: { message: "Preview host crashed." },
      }),
    ).toBe("Preview host crashed.");
  });
});
