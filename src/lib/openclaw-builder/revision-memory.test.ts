import { describe, expect, it } from "vitest";

import {
  createRevisionMemory,
  type MemoryScope,
} from "./revision-memory";

function scope(overrides: Partial<MemoryScope> = {}): MemoryScope {
  return {
    tenantId: "tenant-1",
    chatId: "chat-1",
    versionId: "ver-1",
    filesRevision: "rev-1",
    ...overrides,
  };
}

describe("createRevisionMemory", () => {
  it("puts and gets a trimmed summary for a matching scope", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "  Hero needs a darker CTA  ", 1_700_000_000_000)).toEqual({
      ok: true,
    });
    expect(memory.get(scope())).toEqual({
      summary: "Hero needs a darker CTA",
      updatedAtMs: 1_700_000_000_000,
    });
  });

  it("returns null for another tenant even when chatId matches", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "Keep the nav compact")).toEqual({ ok: true });
    expect(memory.get(scope({ tenantId: "tenant-other" }))).toBeNull();
    expect(memory.get(scope())).toMatchObject({ summary: "Keep the nav compact" });
  });

  it("treats a filesRevision change as a miss and does not return stale memory", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "Old revision note")).toEqual({ ok: true });
    expect(memory.get(scope({ filesRevision: "rev-2" }))).toBeNull();
    expect(memory.get(scope())).toMatchObject({ summary: "Old revision note" });
  });

  it("replaces the previous entry when versionId changes for the same chat", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "Version one", 10)).toEqual({ ok: true });
    expect(memory.put(scope({ versionId: "ver-2" }), "Version two", 20)).toEqual({
      ok: true,
    });
    expect(memory.get(scope())).toBeNull();
    expect(memory.get(scope({ versionId: "ver-2" }))).toEqual({
      summary: "Version two",
      updatedAtMs: 20,
    });
  });

  it("rejects summaries that look like secrets", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "Authorization: Bearer abc.def")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "openai key sk-proj-example")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "stripe rk_live_example")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "webhook whsec_example")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(
      memory.put(scope(), "-----BEGIN PRIVATE KEY-----\nMIIB"),
    ).toEqual({ ok: false, code: "invalid_summary" });
    expect(memory.get(scope())).toBeNull();
  });

  it("rejects a new chat once maxEntries is reached but still replaces an existing one", () => {
    const memory = createRevisionMemory({ maxEntries: 2 });
    expect(memory.put(scope({ chatId: "chat-a" }), "A")).toEqual({ ok: true });
    expect(memory.put(scope({ chatId: "chat-b" }), "B")).toEqual({ ok: true });
    expect(memory.put(scope({ chatId: "chat-c" }), "C")).toEqual({
      ok: false,
      code: "capacity",
    });
    expect(memory.put(scope({ chatId: "chat-a", versionId: "ver-2" }), "A2")).toEqual({
      ok: true,
    });
    expect(memory.get(scope({ chatId: "chat-a" }))).toBeNull();
    expect(memory.get(scope({ chatId: "chat-a", versionId: "ver-2" }))).toMatchObject({
      summary: "A2",
    });
    expect(memory.get(scope({ chatId: "chat-c" }))).toBeNull();
  });

  it("invalidates a chat and only matches optional version or revision when given", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope(), "Remember the footer")).toEqual({ ok: true });

    expect(
      memory.invalidate({
        tenantId: "tenant-1",
        chatId: "chat-1",
        versionId: "ver-other",
      }),
    ).toBe(0);
    expect(memory.get(scope())).toMatchObject({ summary: "Remember the footer" });

    expect(
      memory.invalidate({
        tenantId: "tenant-1",
        chatId: "chat-1",
        filesRevision: "rev-other",
      }),
    ).toBe(0);
    expect(memory.get(scope())).toMatchObject({ summary: "Remember the footer" });

    expect(
      memory.invalidate({
        tenantId: "tenant-1",
        chatId: "chat-1",
        versionId: "ver-1",
        filesRevision: "rev-1",
      }),
    ).toBe(1);
    expect(memory.get(scope())).toBeNull();

    expect(memory.put(scope(), "Second pass")).toEqual({ ok: true });
    expect(memory.invalidate({ tenantId: "tenant-1", chatId: "chat-1" })).toBe(1);
    expect(memory.get(scope())).toBeNull();
    expect(memory.invalidate({ tenantId: "tenant-1", chatId: "chat-1" })).toBe(0);
  });

  it("rejects empty or whitespace scope ids", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope({ tenantId: "   " }), "ok")).toEqual({
      ok: false,
      code: "invalid_scope",
    });
    expect(memory.put(scope({ chatId: "" }), "ok")).toEqual({
      ok: false,
      code: "invalid_scope",
    });
    expect(memory.put(scope({ versionId: "\t" }), "ok")).toEqual({
      ok: false,
      code: "invalid_scope",
    });
    expect(memory.put(scope({ filesRevision: " \n " }), "ok")).toEqual({
      ok: false,
      code: "invalid_scope",
    });
    expect(memory.get(scope({ tenantId: "  " }))).toBeNull();
    expect(memory.invalidate({ tenantId: "  ", chatId: "chat-1" })).toBe(0);
  });

  it("rejects empty, oversized, or control-character summaries except tab and newline", () => {
    const memory = createRevisionMemory({ maxSummaryChars: 8 });
    expect(memory.put(scope(), "   ")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "too-long-summary")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "bad\rline")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "nul\0byte")).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.put(scope(), "a\nb\tok")).toEqual({ ok: true });
    expect(memory.get(scope())).toMatchObject({ summary: "a\nb\tok" });
  });

  it("rejects a rewind of updatedAtMs and misses aged entries", () => {
    const memory = createRevisionMemory({ maxEntries: 1, maxAgeMs: 1_000 });
    expect(memory.put(scope(), "First", 100)).toEqual({ ok: true });
    expect(memory.put(scope(), "Older clock", 50)).toEqual({
      ok: false,
      code: "invalid_summary",
    });
    expect(memory.get(scope(), 100)).toMatchObject({
      summary: "First",
      updatedAtMs: 100,
    });
    expect(memory.get(scope(), 1_101)).toBeNull();
    expect(memory.put(scope({ chatId: "chat-fresh" }), "Replacement", 1_101)).toEqual({
      ok: true,
    });
  });

  it("keeps the same chatId isolated across tenants", () => {
    const memory = createRevisionMemory();
    expect(memory.put(scope({ tenantId: "tenant-a" }), "A")).toEqual({ ok: true });
    expect(memory.put(scope({ tenantId: "tenant-b" }), "B")).toEqual({ ok: true });
    expect(memory.get(scope({ tenantId: "tenant-a" }))).toMatchObject({ summary: "A" });
    expect(memory.get(scope({ tenantId: "tenant-b" }))).toMatchObject({ summary: "B" });
    expect(memory.invalidate({ tenantId: "tenant-a", chatId: "chat-1" })).toBe(1);
    expect(memory.get(scope({ tenantId: "tenant-a" }))).toBeNull();
    expect(memory.get(scope({ tenantId: "tenant-b" }))).toMatchObject({ summary: "B" });
  });
});
