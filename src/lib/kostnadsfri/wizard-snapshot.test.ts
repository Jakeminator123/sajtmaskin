import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildKostnadsfriWizardSnapshot,
  readKostnadsfriWizardSnapshotFromHandoffPayload,
  sanitizeKostnadsfriWizardSnapshot,
} from "./wizard-snapshot";

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("buildKostnadsfriWizardSnapshot", () => {
  it("records industry plus whether a follow-up overrode it", () => {
    const snapshot = buildKostnadsfriWizardSnapshot(
      {
        industry: "",
        description: "Lotteri och spelplattformar",
        usp: "Reglerad marknad",
      },
      { industryId: "restaurant" },
    );

    expect(snapshot.industryId).toBeNull();
    expect(snapshot.followupOverrodeIndustry).toBe(true);
    expect(snapshot.resolvedIndustryId).toBe("restaurant");
    expect(snapshot.descriptionHash).toBe(sha("lotteri och spelplattformar"));
    expect(snapshot.uspHash).toBe(sha("reglerad marknad"));
    expect(snapshot.descriptionPreview).toBe("Lotteri och spelplattformar");
  });

  it("does not newly log emails, phones, personnummer or secret-shaped tokens", () => {
    const snapshot = buildKostnadsfriWizardSnapshot({
      industry: "tech",
      description: "Kontakta ada@acme.se eller 070-123 45 67. Personnr 19800101-1234.",
      usp: "api_key=sk-live-supersecret token=abcd",
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("ada@acme.se");
    expect(serialized).not.toContain("070-123 45 67");
    expect(serialized).not.toContain("19800101-1234");
    expect(serialized).not.toContain("sk-live-supersecret");
    expect(serialized).not.toContain("api_key");
    expect(snapshot.descriptionHash).toBeTruthy();
    expect(snapshot.uspHash).toBeTruthy();
  });
});

describe("sanitizeKostnadsfriWizardSnapshot", () => {
  it("keeps known receipt fields and drops smuggled PII keys", () => {
    const sanitized = sanitizeKostnadsfriWizardSnapshot({
      industryId: "restaurant",
      followupOverrodeIndustry: true,
      resolvedIndustryId: "restaurant",
      descriptionHash: "a".repeat(64),
      uspHash: "not-a-hash",
      descriptionPreview: "Ring ada@acme.se om lotteri",
      email: "ada@acme.se",
      phone: "0701234567",
    });

    expect(sanitized).toEqual({
      industryId: "restaurant",
      followupOverrodeIndustry: true,
      resolvedIndustryId: "restaurant",
      descriptionHash: "a".repeat(64),
      uspHash: null,
      descriptionPreview: "Ring om lotteri",
      uspPreview: null,
    });
    expect(JSON.stringify(sanitized)).not.toContain("ada@acme.se");
  });

  it("reads the snapshot from an existing handoff payload object", () => {
    expect(
      readKostnadsfriWizardSnapshotFromHandoffPayload({
        wizardSnapshot: {
          industryId: "creative",
          followupOverrodeIndustry: false,
          resolvedIndustryId: "creative",
          descriptionHash: "b".repeat(64),
          uspHash: null,
          descriptionPreview: "Frisör",
          uspPreview: null,
        },
      })?.industryId,
    ).toBe("creative");
    expect(readKostnadsfriWizardSnapshotFromHandoffPayload({ domain: "granit.se" })).toBeNull();
  });
});
