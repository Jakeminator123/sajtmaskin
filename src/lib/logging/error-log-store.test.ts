import { describe, it, expect, vi } from "vitest";

// Mock the db client so importing the store never opens a real pool and the
// "DB unconfigured" path is exercised deterministically.
vi.mock("@/lib/db/client", () => ({
  dbConfigured: false,
  pool: null,
}));

import {
  errorLogDbRowToDocument,
  loadRecentErrorLogDocsFromDb,
  insertErrorLogEventToDb,
  isErrorLogDbAvailable,
} from "./error-log-store";

describe("error-log-store", () => {
  it("maps a snake_case db row to a TF-IDF document", () => {
    const doc = errorLogDbRowToDocument({
      id: 42,
      created_at: new Date("2026-05-01T00:00:00.000Z"),
      phase: "post-gen",
      fault: "undefined-jsx-symbol",
      fault_text: "<HTMLFormElement /> used as a JSX tag",
      fix_text: "rewrote to <form>",
      scaffold_id: "landing-page",
      route_path: "/",
      variant_id: null,
      capability_ids: ["forms"],
      generation_mode: "init",
      lineage_hash: "abc123",
      result: "fixed",
    });

    expect(doc.id).toBe("42");
    expect(doc.payload.fault).toBe("undefined-jsx-symbol");
    expect(doc.payload.scaffoldId).toBe("landing-page");
    expect(doc.payload.generationMode).toBe("init");
    expect(doc.payload.capabilityIds).toEqual(["forms"]);
    expect(doc.payload.time).toBe("2026-05-01T00:00:00.000Z");
    // text is what TF-IDF tokenises — must carry fault + context.
    expect(doc.text).toContain("undefined-jsx-symbol");
    expect(doc.text).toContain("landing-page");
    expect(doc.text).toContain("forms");
  });

  it("tolerates missing/wrong-typed columns without throwing", () => {
    const doc = errorLogDbRowToDocument({ fault: "x" });
    expect(doc.payload.fault).toBe("x");
    expect(doc.payload.capabilityIds).toEqual([]);
    expect(doc.payload.scaffoldId).toBeNull();
  });

  it("no-ops gracefully when the DB is not configured", async () => {
    expect(isErrorLogDbAvailable()).toBe(false);
    await expect(
      insertErrorLogEventToDb({ phase: "post-gen", fault: "x" }),
    ).resolves.toBeUndefined();
    await expect(loadRecentErrorLogDocsFromDb()).resolves.toEqual([]);
  });
});
