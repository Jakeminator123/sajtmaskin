import { describe, expect, it } from "vitest";
import {
  resolveBlobTemplateReferenceLabel,
  resolveBlobTemplateReferenceLabels,
} from "./blob-manifest-labels";

describe("resolveBlobTemplateReferenceLabel", () => {
  it("resolves a real Blob id to its manifest title + category (not the opaque id)", () => {
    // 8Y9E0cStKrW is one of saas-landing/friendly-saas.json's sourceTemplateIds
    // and must resolve in the committed Blob manifest (integrity gate #1).
    const label = resolveBlobTemplateReferenceLabel("8Y9E0cStKrW");
    expect(label).not.toBe("8Y9E0cStKrW");
    expect(label.toLowerCase()).toContain("saas");
    expect(label).toContain("(landing-pages)");
  });

  it("falls back to the raw id for legacy labels not in the Blob manifest", () => {
    expect(resolveBlobTemplateReferenceLabel("vercel-acme")).toBe("vercel-acme");
    expect(resolveBlobTemplateReferenceLabel("definitely-not-a-blob-id")).toBe(
      "definitely-not-a-blob-id",
    );
  });

  it("maps a list, preserving order and count", () => {
    const labels = resolveBlobTemplateReferenceLabels([
      "8Y9E0cStKrW",
      "vercel-acme",
    ]);
    expect(labels).toHaveLength(2);
    expect(labels[0]).not.toBe("8Y9E0cStKrW");
    expect(labels[1]).toBe("vercel-acme");
  });
});
