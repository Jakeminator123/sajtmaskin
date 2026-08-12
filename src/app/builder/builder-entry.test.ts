import { describe, expect, it } from "vitest";
import { deriveBuilderEntryState } from "./builder-entry";

function params(value: string) {
  return new URLSearchParams(value) as never;
}

describe("deriveBuilderEntryState", () => {
  it("marks the explicit homepage entry as a new blank builder", () => {
    const entry = deriveBuilderEntryState(params("new=1"));

    expect(entry.entryKind).toBe("blank");
    expect(entry.forceNew).toBe(true);
    expect(entry.projectParam).toBeNull();
    expect(entry.chatIdParam).toBeNull();
  });

  it("keeps explicit project links as restore entries", () => {
    const entry = deriveBuilderEntryState(params("project=project_1"));

    expect(entry.entryKind).toBe("project-restore");
    expect(entry.forceNew).toBe(false);
  });
});
