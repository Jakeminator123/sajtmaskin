/**
 * OMTAG-06 — Event bus behavioural tests.
 *
 * Covers the append-only contract, subscriber fan-out, per-version
 * `.runs.json` indexing, and multi-run NDJSON aggregation via
 * `readAll()`. FS-level assertions run against a temp dir under the
 * OS temp root so tests don't pollute the real `data/runs/` tree.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("event-bus", () => {
  let tmpDir: string;
  let originalCwd: string;
  let bus: typeof import("./event-bus");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-bus-test-"));
    // Ordningen är bärande: `RUNS_ROOT_DIR` beräknas vid modul-load, så
    // chdir MÅSTE ske före importen. Görs importen statisk i toppen av filen
    // pekar bussen i stället på den delade tmp-spegeln och FS-assertions
    // nedan faller på ENOENT. Testet direkt efter binder den kopplingen.
    process.chdir(tmpDir);
    vi.resetModules();
    bus = await import("./event-bus");
    bus.__resetForTests();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps a chdir-isolated run in its own tree instead of the shared tmp mirror", () => {
    expect(bus.RUNS_ROOT_DIR).toBe(path.join(process.cwd(), "data", "runs"));
    expect(bus.RUNS_ROOT_DIR).not.toBe(
      path.join(os.tmpdir(), "sajtmaskin", "data", "runs"),
    );
  });

  it("emit assigns id+ts+runId defaults and persists NDJSON", () => {
    const event = bus.emit({
      t: "version.started",
      versionId: "v1",
      chatId: "c1",
      generationKind: "create",
    });
    expect(event.id).toMatch(/^ev_/);
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.runId).toBe(bus.DEFAULT_RUN_ID);

    const ndjson = fs.readFileSync(
      path.join(tmpDir, "data", "runs", "v1", "root", "events.ndjson"),
      "utf8",
    );
    expect(ndjson.trim().split("\n")).toHaveLength(1);
    const parsed = JSON.parse(ndjson.trim()) as typeof event;
    expect(parsed.t).toBe("version.started");
    expect(parsed.id).toBe(event.id);
  });

  it("registers new runs in .runs.json exactly once", () => {
    bus.emit({
      t: "version.started",
      versionId: "v1",
      generationKind: "create",
    });
    bus.emit({
      t: "version.repair.started",
      versionId: "v1",
      runId: "repair-1",
      reason: "quality-gate-failed",
      trigger: "server-verify",
    });
    bus.emit({
      t: "version.repair.passIndex",
      versionId: "v1",
      runId: "repair-1",
      passIndex: 1,
    });

    const indexFile = path.join(tmpDir, "data", "runs", "v1", ".runs.json");
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8")) as Array<{
      runId: string;
      reason: string | null;
    }>;
    expect(index.map((e) => e.runId)).toEqual(["root", "repair-1"]);
    expect(index[1].reason).toBe("quality-gate-failed");
  });

  it("subscribers receive events synchronously and throwing does not break writer", () => {
    const received: string[] = [];
    bus.subscribe((event) => {
      received.push(event.t);
    });
    bus.subscribe(() => {
      throw new Error("boom");
    });

    expect(() =>
      bus.emit({
        t: "version.preflight",
        versionId: "v2",
        filesChecked: 1,
        issueCount: 0,
        errorCount: 0,
        warningCount: 0,
        previewBlocked: false,
        verificationBlocked: false,
      }),
    ).not.toThrow();
    expect(received).toEqual(["version.preflight"]);
  });

  it("readAll merges in-memory + disk across multiple runs", () => {
    bus.emit({
      t: "version.started",
      versionId: "v3",
      generationKind: "create",
    });
    bus.emit({
      t: "version.repair.started",
      versionId: "v3",
      runId: "repair-1",
      reason: "build-error",
      trigger: "build-error",
    });
    bus.emit({
      t: "version.done",
      versionId: "v3",
      runId: "repair-1",
      durationMs: 99,
    });

    const events = bus.readAll("v3");
    expect(events.map((e) => e.t)).toEqual([
      "version.started",
      "version.repair.started",
      "version.done",
    ]);
  });

  it("unsubscribe handle stops fan-out", () => {
    const received: string[] = [];
    const off = bus.subscribe((event) => {
      received.push(event.t);
    });
    bus.emit({
      t: "version.done",
      versionId: "v4",
      durationMs: 1,
    });
    off();
    bus.emit({
      t: "version.done",
      versionId: "v4",
      durationMs: 2,
    });
    expect(received).toEqual(["version.done"]);
  });

  /** Backdatera HELA versionsmappen (mapp + run-mappar + events.ndjson) —
   * prunen läser nyaste aktivitet på djupet, inte bara katalog-mtimen. */
  function backdateVersionDeep(versionId: string, mtime: Date): void {
    const dir = path.join(bus.RUNS_ROOT_DIR, versionId);
    for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
      const childPath = path.join(dir, child.name);
      if (child.isDirectory()) {
        const events = path.join(childPath, "events.ndjson");
        if (fs.existsSync(events)) fs.utimesSync(events, mtime, mtime);
      }
      fs.utimesSync(childPath, mtime, mtime);
    }
    fs.utimesSync(dir, mtime, mtime);
  }

  function writeVersionPayload(versionId: string, bytes: number): void {
    const payload = path.join(bus.RUNS_ROOT_DIR, versionId, "payload.bin");
    const fd = fs.openSync(payload, "w");
    try {
      fs.ftruncateSync(fd, bytes);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.statSync(payload).size !== bytes) {
      fs.writeFileSync(payload, Buffer.alloc(bytes));
    }
  }

  function directorySizeBytes(dir: string): number {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) total += directorySizeBytes(childPath);
      else if (entry.isFile()) total += fs.statSync(childPath).size;
    }
    return total;
  }

  function mirrorSizeBytes(): number {
    return directorySizeBytes(bus.RUNS_ROOT_DIR);
  }

  function listVersionDirs(): string[] {
    return fs
      .readdirSync(bus.RUNS_ROOT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  function started(versionId: string) {
    return bus.emit({
      t: "version.started",
      versionId,
      generationKind: "create",
    });
  }

  it("prunes oldest tmp-mirror version dirs when the cap is exceeded", () => {
    const cap = bus.MAX_TMP_MIRROR_VERSION_DIRS;

    for (let i = 0; i < cap; i++) {
      const id = `old_${String(i).padStart(2, "0")}`;
      started(id);
      backdateVersionDeep(id, new Date(Date.now() - (cap - i) * 60_000));
    }

    started("newest");

    const dirs = listVersionDirs();

    expect(dirs).toHaveLength(cap);
    expect(dirs).toContain("newest");
    expect(dirs).not.toContain("old_00");
    expect(fs.existsSync(path.join(bus.RUNS_ROOT_DIR, "newest", bus.RUNS_INDEX_FILE))).toBe(true);
    expect(bus.readAll("newest")).toHaveLength(1);
  });

  // Bugbot på denna diff: en append till en BEFINTLIG run rör bara
  // events.ndjson-mtimen — versionsmappen står still. En gammal men aktiv
  // version får inte LRU-klassas bort medan en idle mellanversion står kvar.
  it("keeps an old-but-active version and prunes the least recently active one", () => {
    const cap = bus.MAX_TMP_MIRROR_VERSION_DIRS;

    for (let i = 0; i < cap; i++) {
      const id = `old_${String(i).padStart(2, "0")}`;
      started(id);
      backdateVersionDeep(id, new Date(Date.now() - (cap - i) * 60_000));
    }

    // old_00 är äldst skapad men FÅR en färsk append (aktiv körning) —
    // bara barnfilen touchas, precis som mirrorToDisk gör på riktigt.
    const activeEvents = path.join(bus.RUNS_ROOT_DIR, "old_00", "root", "events.ndjson");
    const now = new Date();
    fs.utimesSync(activeEvents, now, now);

    started("newest");

    const dirs = listVersionDirs();

    expect(dirs).toHaveLength(cap);
    expect(dirs).toContain("old_00");
    expect(dirs).toContain("newest");
    expect(dirs).not.toContain("old_01");
  });

  // Bugbot medium: tyst finalize/verify kan gå flera minuter utan emit.
  // LRU får inte radera en mapp med aktivitet inom åldersgolvet bara för
  // att 50+ nyare versioner registrerats på samma varma instans.
  it("does not prune tmp-mirror dirs younger than the idle floor even when over cap", () => {
    const cap = bus.MAX_TMP_MIRROR_VERSION_DIRS;

    for (let i = 0; i < cap; i++) {
      const id = `fresh_${String(i).padStart(2, "0")}`;
      started(id);
      // Alla under golvet (20 min) — 1–19 s räcker för att skilja mtime
      // utan att någon blir prunbar.
      backdateVersionDeep(id, new Date(Date.now() - (i + 1) * 1000));
    }

    expect(() => started("newest")).not.toThrow();

    const dirs = listVersionDirs();

    expect(dirs).toHaveLength(cap + 1);
    expect(dirs).toContain("newest");
    expect(dirs).toContain("fresh_00");
    expect(bus.readAll("newest")).toHaveLength(1);
  });

  // Defekten: antalstaket (50) såg inte bytes. Få stora mappar kunde
  // fylla Vercel /tmp (6 MB ledigt av 525 MB, 2026-08-14) utan att
  // prunen rörde dem. Byte-taket är den bindande gränsen.
  it("prunes idle tmp-mirror dirs when the byte cap is exceeded even under the count cap", () => {
    const chunk = Math.floor(bus.MAX_TMP_MIRROR_BYTES * 0.6);
    const idleAt = new Date(Date.now() - bus.TMP_MIRROR_PRUNE_MIN_IDLE_MS - 60_000);

    for (const [i, id] of ["fat_00", "fat_01", "fat_02"].entries()) {
      started(id);
      writeVersionPayload(id, chunk);
      backdateVersionDeep(
        id,
        new Date(idleAt.getTime() - (2 - i) * 60_000),
      );
    }

    expect(listVersionDirs().length).toBeLessThan(bus.MAX_TMP_MIRROR_VERSION_DIRS);
    expect(mirrorSizeBytes()).toBeGreaterThan(bus.MAX_TMP_MIRROR_BYTES);

    started("newest");

    const dirs = listVersionDirs();
    expect(dirs).toContain("newest");
    expect(dirs).not.toContain("fat_00");
    expect(mirrorSizeBytes()).toBeLessThanOrEqual(bus.MAX_TMP_MIRROR_BYTES);
    expect(bus.readAll("newest")).toHaveLength(1);
  });

  it("rechecks the byte cap while appending to an existing version directory", () => {
    const idleBytes = 2 * 1024 * 1024;
    const appendBytes = bus.TMP_MIRROR_PRUNE_WRITE_CADENCE_BYTES;
    const growingBytes = bus.MAX_TMP_MIRROR_BYTES - idleBytes - Math.floor(appendBytes / 2);
    const idleAt = new Date(
      Date.now() - bus.TMP_MIRROR_PRUNE_MIN_IDLE_MS - 60_000,
    );

    started("idle_victim");
    writeVersionPayload("idle_victim", idleBytes);
    backdateVersionDeep("idle_victim", idleAt);

    // Skapandet kör den befintliga count-snabbvägen medan spegeln är under
    // byte-taket. Därefter växer SAMMA versionsmapp över taket utan att en ny
    // version skapas — write-cadencen måste då städa den idle kandidaten.
    started("growing");
    writeVersionPayload("growing", growingBytes);
    expect(mirrorSizeBytes()).toBeLessThan(bus.MAX_TMP_MIRROR_BYTES);

    bus.emit({
      t: "version.build.error",
      versionId: "growing",
      error: {
        stage: "build",
        message: "x".repeat(appendBytes),
      },
    });

    const dirs = listVersionDirs();
    expect(dirs).toContain("growing");
    expect(dirs).not.toContain("idle_victim");
    expect(mirrorSizeBytes()).toBeLessThanOrEqual(bus.MAX_TMP_MIRROR_BYTES);
  });

  it("does not prune a tmp-mirror dir younger than the idle floor even when over the byte cap", () => {
    const fatBytes = bus.MAX_TMP_MIRROR_BYTES + 1024;
    started("fat_fresh");
    writeVersionPayload("fat_fresh", fatBytes);
    backdateVersionDeep("fat_fresh", new Date(Date.now() - 5 * 60_000));

    expect(() => started("newest")).not.toThrow();

    const dirs = listVersionDirs();
    expect(dirs).toContain("fat_fresh");
    expect(dirs).toContain("newest");
    expect(mirrorSizeBytes()).toBeGreaterThan(bus.MAX_TMP_MIRROR_BYTES);
    expect(bus.readAll("newest")).toHaveLength(1);
  });

  it("lets emit succeed when tmp-mirror size measurement throws", () => {
    started("existing");
    writeVersionPayload("existing", 1024);
    backdateVersionDeep(
      "existing",
      new Date(Date.now() - bus.TMP_MIRROR_PRUNE_MIN_IDLE_MS - 60_000),
    );

    const originalStat = fs.statSync.bind(fs);
    const statSpy = vi.spyOn(fs, "statSync").mockImplementation((p, ...args) => {
      if (String(p).includes("payload.bin")) {
        throw new Error("stat boom");
      }
      return originalStat(p, ...args);
    });

    try {
      expect(() => started("newest")).not.toThrow();
      expect(bus.readAll("newest").map((event) => event.t)).toEqual(["version.started"]);
      expect(
        fs.existsSync(path.join(bus.RUNS_ROOT_DIR, "newest", "root", "events.ndjson")),
      ).toBe(true);
    } finally {
      statSpy.mockRestore();
    }
  });

  it("lets emit succeed when tmp-mirror prune cannot delete", () => {
    for (let i = 0; i < bus.MAX_TMP_MIRROR_VERSION_DIRS; i++) {
      bus.emit({
        t: "version.started",
        versionId: `old_${i}`,
        generationKind: "create",
      });
    }
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("rm boom");
    });
    try {
      expect(() =>
        bus.emit({
          t: "version.started",
          versionId: "newest",
          generationKind: "create",
        }),
      ).not.toThrow();
      expect(bus.readAll("newest").map((event) => event.t)).toEqual(["version.started"]);
      expect(
        fs.existsSync(path.join(bus.RUNS_ROOT_DIR, "newest", "root", "events.ndjson")),
      ).toBe(true);
    } finally {
      rmSpy.mockRestore();
    }
  });
});

describe("event-bus RUNS_ROOT_DIR resolution", () => {
  const originalVercel = process.env.VERCEL;
  const originalVitest = process.env.VITEST;

  function restore(key: "VERCEL" | "VITEST", value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    restore("VERCEL", originalVercel);
    restore("VITEST", originalVitest);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("mirrors under os.tmpdir() on Vercel (read-only /var/task)", async () => {
    process.env.VERCEL = "1";
    vi.resetModules();
    const bus = await import("./event-bus");
    expect(bus.RUNS_ROOT_DIR.startsWith(os.tmpdir())).toBe(true);
    expect(bus.RUNS_ROOT_DIR).not.toBe(path.join(process.cwd(), "data", "runs"));
  });

  it("mirrors under os.tmpdir() during vitest so suites never write into the repo", async () => {
    delete process.env.VERCEL;
    process.env.VITEST = "true";
    vi.resetModules();
    const bus = await import("./event-bus");
    expect(bus.RUNS_ROOT_DIR.startsWith(os.tmpdir())).toBe(true);
    expect(bus.RUNS_ROOT_DIR).not.toBe(path.join(process.cwd(), "data", "runs"));
  });

  it("uses repo-relative data/runs in local dev", async () => {
    delete process.env.VERCEL;
    delete process.env.VITEST;
    // Lokal dev kör NODE_ENV=development. Vitest sätter "test", och sedan
    // sökvägsvalet delar testpredikat med loggdämpningen räcker det inte att
    // nolla VITEST för att simulera dev — hela miljön måste simuleras.
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const bus = await import("./event-bus");
    expect(bus.RUNS_ROOT_DIR).toBe(path.join(process.cwd(), "data", "runs"));
  });

  it("mirrors under os.tmpdir() for a NODE_ENV=test run without VITEST", async () => {
    delete process.env.VERCEL;
    delete process.env.VITEST;
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const bus = await import("./event-bus");
    expect(bus.RUNS_ROOT_DIR).not.toBe(path.join(process.cwd(), "data", "runs"));
  });
});
