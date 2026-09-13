import { describe, expect, it } from "vitest";
import { keepUnsavedDraft, keepUnsavedDrafts } from "./pricing-drafts";

describe("keepUnsavedDrafts", () => {
  it("takes the full list on first load", () => {
    expect(
      keepUnsavedDrafts({}, null, { wizard: "11", auditBasic: "15" }),
    ).toEqual({ wizard: "11", auditBasic: "15" });
  });

  it("keeps a dirty draft when another field was saved", () => {
    expect(
      keepUnsavedDrafts(
        { wizard: "14", auditBasic: "99" },
        { wizard: "11", auditBasic: "15" },
        { wizard: "14", auditBasic: "15" },
      ),
    ).toEqual({ wizard: "14", auditBasic: "99" });
  });

  it("syncs a field the operator never touched", () => {
    expect(
      keepUnsavedDrafts(
        { wizard: "11", auditBasic: "15" },
        { wizard: "11", auditBasic: "15" },
        { wizard: "14", auditBasic: "15" },
      ),
    ).toEqual({ wizard: "14", auditBasic: "15" });
  });
});

describe("keepUnsavedDraft", () => {
  it("keeps typed text that no longer matches the previous value", () => {
    expect(keepUnsavedDraft("6.5", "5", "5")).toBe("6.5");
  });

  it("follows the server when the field was untouched", () => {
    expect(keepUnsavedDraft("5", "5", "7")).toBe("7");
  });
});
