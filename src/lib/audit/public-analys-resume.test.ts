import { describe, expect, it } from "vitest";
import {
  PUBLIC_ANALYS_PENDING_MAX_BYTES,
  PUBLIC_ANALYS_PENDING_TTL_MS,
  claimPendingPublicAnalys,
  clearPendingPublicAnalys,
  readPendingPublicAnalys,
  savePendingPublicAnalys,
} from "./public-analys-resume";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const report = {
  company: "Exempel AB",
  domain: "example.se",
  audit_scores: { seo: 72, ux: 64 },
  issues: ["Svag CTA"],
  improvements: [
    {
      item: "Tydligare CTA",
      impact: "high" as const,
      effort: "low" as const,
      why: "Fler ska förstå nästa steg",
      how: "Placera en tydlig knapp i hero-sektionen",
    },
  ],
};

describe("public analysis pending resume", () => {
  it("round-trips a versioned allowlisted snapshot and claims it once", () => {
    const storage = memoryStorage();
    const saved = savePendingPublicAnalys(
      { action: "pdf", report, auditedUrl: "https://example.se" },
      { storage, now: 1_000 },
    );

    expect(saved).toEqual(
      expect.objectContaining({ v: 1, action: "pdf", savedAt: 1_000, auditedUrl: "https://example.se" }),
    );
    expect(readPendingPublicAnalys({ storage, now: 2_000 })).toEqual(saved);
    expect(claimPendingPublicAnalys("pdf", { storage, now: 2_000 })).toEqual(saved);
    expect(claimPendingPublicAnalys("pdf", { storage, now: 2_000 })).toBeNull();
  });

  it("does not consume a different requested action", () => {
    const storage = memoryStorage();
    savePendingPublicAnalys(
      { action: "build", report, auditedUrl: "example.se" },
      { storage, now: 1_000 },
    );

    expect(claimPendingPublicAnalys("pdf", { storage, now: 1_001 })).toBeNull();
    expect(readPendingPublicAnalys({ storage, now: 1_001 })?.action).toBe("build");
  });

  it("clears a superseded pending action and fails closed when removal throws", () => {
    const storage = memoryStorage();
    savePendingPublicAnalys(
      { action: "build", report, auditedUrl: "example.se" },
      { storage, now: 1_000 },
    );

    expect(clearPendingPublicAnalys({ storage })).toBe(true);
    expect(readPendingPublicAnalys({ storage, now: 1_001 })).toBeNull();

    const throwingStorage = {
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(clearPendingPublicAnalys({ storage: throwingStorage })).toBe(false);
  });

  it("expires after 24 hours and rejects malformed, future, and oversized data", () => {
    const storage = memoryStorage();
    savePendingPublicAnalys(
      { action: "pdf", report, auditedUrl: "example.se" },
      { storage, now: 1_000 },
    );
    expect(
      readPendingPublicAnalys({ storage, now: 1_000 + PUBLIC_ANALYS_PENDING_TTL_MS + 1 }),
    ).toBeNull();

    storage.setItem("sajtmaskin:public-analys-resume:v1", "{broken");
    expect(readPendingPublicAnalys({ storage, now: 2_000 })).toBeNull();

    storage.setItem(
      "sajtmaskin:public-analys-resume:v1",
      JSON.stringify({ v: 1, action: "pdf", report, auditedUrl: "example.se", savedAt: 100_000 }),
    );
    expect(readPendingPublicAnalys({ storage, now: 1_000 })).toBeNull();

    storage.setItem(
      "sajtmaskin:public-analys-resume:v1",
      "x".repeat(PUBLIC_ANALYS_PENDING_MAX_BYTES + 1),
    );
    expect(readPendingPublicAnalys({ storage, now: 2_000 })).toBeNull();
  });

  it("caps report fields and never persists unknown internal data", () => {
    const storage = memoryStorage();
    const saved = savePendingPublicAnalys(
      {
        action: "build",
        auditedUrl: "example.se",
        report: {
          ...report,
          company: "x".repeat(5_000),
          issues: Array.from({ length: 30 }, (_, index) => `issue ${index}`),
          site_content: { secret: "never" },
          cost: { usd: 999 },
        } as typeof report,
      },
      { storage, now: 1_000 },
    );

    expect(saved?.report.company?.length).toBeLessThanOrEqual(600);
    expect(saved?.report.issues).toHaveLength(6);
    expect(JSON.stringify(saved)).not.toContain("site_content");
    expect(JSON.stringify(saved)).not.toContain("999");
  });

  it("fails closed when browser storage throws", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(
      savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: "example.se" },
        { storage: throwingStorage, now: 1_000 },
      ),
    ).toBeNull();
    expect(readPendingPublicAnalys({ storage: throwingStorage, now: 1_000 })).toBeNull();
    expect(claimPendingPublicAnalys("pdf", { storage: throwingStorage, now: 1_000 })).toBeNull();
  });

  it("rejects non-http schemes and overlong audited URLs without truncating them", () => {
    const storage = memoryStorage();
    expect(
      savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: "ftp://example.se/file" },
        { storage, now: 1_000 },
      ),
    ).toBeNull();
    expect(
      savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: `https://example.se/${"x".repeat(3_000)}` },
        { storage, now: 1_000 },
      ),
    ).toBeNull();
  });
});
