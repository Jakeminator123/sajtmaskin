import { describe, expect, it, vi } from "vitest";
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

function serialLockManager(): LockManager {
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn(
    (
      _name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => unknown | PromiseLike<unknown>,
    ) => {
      const result = tail.then(() => callback(null));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );
  return { request } as unknown as LockManager;
}

const locksByStorage = new WeakMap<Storage, LockManager>();

function locked(storage: Storage, now?: number) {
  let locks = locksByStorage.get(storage);
  if (!locks) {
    locks = serialLockManager();
    locksByStorage.set(storage, locks);
  }
  return { storage, locks, ...(now === undefined ? {} : { now }) };
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
  it("round-trips a versioned allowlisted snapshot and claims it once", async () => {
    const storage = memoryStorage();
    const saved = await savePendingPublicAnalys(
      { action: "pdf", report, auditedUrl: "https://example.se" },
      locked(storage, 1_000),
    );

    expect(saved).toEqual(
      expect.objectContaining({
        v: 1,
        action: "pdf",
        savedAt: 1_000,
        auditedUrl: "https://example.se",
      }),
    );
    expect(readPendingPublicAnalys(locked(storage, 2_000))).toEqual(saved);
    expect(await claimPendingPublicAnalys("pdf", locked(storage, 2_000))).toEqual(saved);
    expect(await claimPendingPublicAnalys("pdf", locked(storage, 2_000))).toBeNull();
  });

  it("lets exactly one concurrent consumer claim the same build intent", async () => {
    const storage = memoryStorage();
    const locks = serialLockManager();
    const saved = await savePendingPublicAnalys(
      { action: "build", report, auditedUrl: "example.se" },
      { storage, locks, now: 1_000 },
    );

    const claims = await Promise.all([
      claimPendingPublicAnalys("build", { storage, locks, now: 1_001 }),
      claimPendingPublicAnalys("build", { storage, locks, now: 1_001 }),
    ]);

    expect(claims.filter((claim) => claim !== null)).toEqual([saved]);
    expect(readPendingPublicAnalys({ storage, now: 1_001 })).toBeNull();
  });

  it("fails closed when the Web Locks API is unavailable", async () => {
    const storage = memoryStorage();

    expect(
      await savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: "example.se" },
        { storage, locks: null, now: 1_000 },
      ),
    ).toBeNull();

    storage.setItem(
      "sajtmaskin:public-analys-resume:v1",
      JSON.stringify({ v: 1, action: "pdf", report, auditedUrl: "example.se", savedAt: 1_000 }),
    );
    expect(await claimPendingPublicAnalys("pdf", { storage, locks: null, now: 1_001 })).toBeNull();
    expect(readPendingPublicAnalys({ storage, now: 1_001 })?.action).toBe("pdf");
  });

  it("does not consume a different requested action", async () => {
    const storage = memoryStorage();
    await savePendingPublicAnalys(
      { action: "build", report, auditedUrl: "example.se" },
      locked(storage, 1_000),
    );

    expect(await claimPendingPublicAnalys("pdf", locked(storage, 1_001))).toBeNull();
    expect(readPendingPublicAnalys(locked(storage, 1_001))?.action).toBe("build");
  });

  it("clears a superseded pending action and fails closed when removal throws", async () => {
    const storage = memoryStorage();
    await savePendingPublicAnalys(
      { action: "build", report, auditedUrl: "example.se" },
      locked(storage, 1_000),
    );

    expect(await clearPendingPublicAnalys(locked(storage))).toBe(true);
    expect(readPendingPublicAnalys(locked(storage, 1_001))).toBeNull();

    const throwingStorage = {
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(await clearPendingPublicAnalys(locked(throwingStorage))).toBe(false);
  });

  it("expires after 24 hours and rejects malformed, future, and oversized data", async () => {
    const storage = memoryStorage();
    await savePendingPublicAnalys(
      { action: "pdf", report, auditedUrl: "example.se" },
      locked(storage, 1_000),
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

  it("caps report fields and never persists unknown internal data", async () => {
    const storage = memoryStorage();
    const saved = await savePendingPublicAnalys(
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
      locked(storage, 1_000),
    );

    expect(saved?.report.company?.length).toBeLessThanOrEqual(600);
    expect(saved?.report.issues).toHaveLength(6);
    expect(JSON.stringify(saved)).not.toContain("site_content");
    expect(JSON.stringify(saved)).not.toContain("999");
  });

  it("fails closed when browser storage throws", async () => {
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
      await savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: "example.se" },
        locked(throwingStorage, 1_000),
      ),
    ).toBeNull();
    expect(readPendingPublicAnalys({ storage: throwingStorage, now: 1_000 })).toBeNull();
    expect(await claimPendingPublicAnalys("pdf", locked(throwingStorage, 1_000))).toBeNull();
  });

  it("rejects non-http schemes and overlong audited URLs without truncating them", async () => {
    const storage = memoryStorage();
    expect(
      await savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: "ftp://example.se/file" },
        locked(storage, 1_000),
      ),
    ).toBeNull();
    expect(
      await savePendingPublicAnalys(
        { action: "pdf", report, auditedUrl: `https://example.se/${"x".repeat(3_000)}` },
        locked(storage, 1_000),
      ),
    ).toBeNull();
  });
});
