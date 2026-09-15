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

  it("classifies source=audit as an audit entry and still fetches the handoff", () => {
    const entry = deriveBuilderEntryState(
      params("source=audit&promptId=handoff_1&project=project_1&buildMethod=audit"),
    );

    expect(entry.entryKind).toBe("audit");
    expect(entry.isAuditEntry).toBe(true);
    expect(entry.source).toBe("audit");
    expect(entry.buildMethodParam).toBe("audit");
    expect(entry.shouldFetchPromptHandoff).toBe(true);
    expect(entry.promptId).toBe("handoff_1");
  });

  it("keeps explicit project links as restore entries", () => {
    const entry = deriveBuilderEntryState(params("project=project_1"));

    expect(entry.entryKind).toBe("project-restore");
    expect(entry.forceNew).toBe(false);
  });
});
