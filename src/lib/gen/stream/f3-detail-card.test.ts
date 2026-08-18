import { describe, expect, it } from "vitest";
import { applyPostMergeF3DetailCardEvidence } from "./f3-detail-card";

/** Distinctive stripe-checkout server core (same set as version-presence.test.ts). */
const STRIPE_POST_MERGE_FILES = [
  {
    path: "app/api/checkout-session/route.ts",
    content: "export async function POST() { return new Response(null); }",
  },
  {
    path: "components/integration-config-notice.tsx",
    content: "export function IntegrationConfigNotice() { return null; }",
  },
];

describe("post-merge overlay (SM-009)", () => {
  it("overlays post-merge evidence after finalize so the card is not planned", () => {
    const filesJson = JSON.stringify(STRIPE_POST_MERGE_FILES);
    const updated = applyPostMergeF3DetailCardEvidence(
      { modelId: "gpt-5.4", fileEvidenceCapabilities: [] },
      filesJson,
    );
    expect(updated.fileEvidenceCapabilities).toContain("payments");
    expect(updated.fileEvidenceDossierIds).toContain("stripe-checkout");
  });

  it("keeps unrelated meta fields intact", () => {
    const updated = applyPostMergeF3DetailCardEvidence(
      { modelId: "gpt-5.4", mutedCapabilities: ["payments"] },
      JSON.stringify(STRIPE_POST_MERGE_FILES),
    );
    expect(updated.modelId).toBe("gpt-5.4");
    expect(updated.mutedCapabilities).toEqual(["payments"]);
  });
});
