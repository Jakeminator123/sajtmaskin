import { describe, expect, it } from "vitest";
import {
  applyPostMergeF3DetailCardEvidence,
  omitEarlyF3DetailCardEvidence,
} from "./f3-detail-card";

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

describe("early meta vs post-merge overlay (SM-009)", () => {
  it("omits base-version file evidence from the early meta SSE", () => {
    const early = omitEarlyF3DetailCardEvidence({
      modelId: "gpt-5.4",
      fileEvidenceCapabilities: [],
      fileEvidenceDossierIds: [],
      mutedCapabilities: ["payments"],
    });
    expect(early).toEqual({
      modelId: "gpt-5.4",
      mutedCapabilities: ["payments"],
    });
    expect(early).not.toHaveProperty("fileEvidenceCapabilities");
  });

  it("overlays post-merge evidence after finalize so the card is not planned", () => {
    const filesJson = JSON.stringify(STRIPE_POST_MERGE_FILES);
    const updated = applyPostMergeF3DetailCardEvidence(
      { modelId: "gpt-5.4", fileEvidenceCapabilities: [] },
      filesJson,
    );
    expect(updated.fileEvidenceCapabilities).toContain("payments");
    expect(updated.fileEvidenceDossierIds).toContain("stripe-checkout");
  });
});
