import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();

let tempDir: string | null = null;

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("generation-log writer", () => {
  it("writes a per-generation folder with summary, timeline, and meta", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { devLogAppend, devLogStartGeneration } = await import("./devLog");

    devLogStartGeneration({
      message: "Bygg en retrospelhall",
      modelId: "gpt-5.4",
      thinking: true,
      imageGenerations: false,
      slug: "retro-arcade",
      chatId: "chat_1",
      generationKind: "followup",
    });
    devLogAppend("in-progress", {
      type: "comm.request.followup",
      chatId: "chat_1",
      modelId: "gpt-5.4",
      buildIntent: "website",
      buildMethod: "freeform",
      promptStrategy: "direct",
      promptType: "followup_general",
      optimizedLength: 321,
      slug: "retro-arcade",
    });
    devLogAppend("in-progress", {
      type: "autofix.result",
      chatId: "chat_1",
      versionId: "ver_autofix",
      scaffoldId: "landing-page",
      resolvedTier: "pro",
      fixes: [{ fixer: "next-og-image-response-import-fixer", file: "app/opengraph-image.tsx" }],
      warnings: [],
      slug: "retro-arcade",
    });
    devLogAppend("in-progress", {
      type: "version.created",
      chatId: "chat_1",
      versionId: "ver_1",
      lineageHash: "lineage_1",
      slug: "retro-arcade",
    });
    devLogAppend("in-progress", {
      type: "syntax-validation.fixer.start",
      chatId: "chat_1",
      versionId: "ver_1",
      pass: 1,
      errorCount: 1,
      fixerModel: "gpt-5.3-codex",
      slug: "retro-arcade",
    });
    devLogAppend("in-progress", {
      type: "preflight.summary",
      chatId: "chat_1",
      versionId: "ver_1",
      filesChecked: 7,
      issueCount: 1,
      errorCount: 1,
      warningCount: 0,
      previewBlocked: false,
      verificationBlocked: true,
    });
    devLogAppend("in-progress", {
      type: "verifier-pass",
      chatId: "chat_1",
      versionId: "ver_1",
      blocking: 1,
      quality: 2,
      slug: "retro-arcade",
    });
    devLogAppend("in-progress", {
      type: "server-verify.policy",
      chatId: "chat_1",
      versionId: "ver_1",
      run: false,
      reason: "fast_policy",
      verificationPolicy: "fast",
      qualityTarget: "standard",
      slug: "retro-arcade",
    });
    devLogAppend("latest", {
      type: "site.done",
      chatId: "chat_1",
      versionId: "ver_1",
      durationMs: 1234,
      previewUrl: "https://example.com/preview",
    });

    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const latestFile = path.join(rootDir, "_latest.txt");
    expect(fs.existsSync(latestFile)).toBe(true);

    const latestDirName = fs.readFileSync(latestFile, "utf8").trim();
    const runDir = path.join(rootDir, latestDirName);
    const summary = fs.readFileSync(path.join(runDir, "summary.md"), "utf8");
    const observability = JSON.parse(
      fs.readFileSync(path.join(runDir, "observability.json"), "utf8"),
    ) as {
      chatId?: string;
      recurringPatterns?: Array<{ pattern: string; occurrences: number }>;
    };
    const fixPatterns = JSON.parse(
      fs.readFileSync(path.join(runDir, "fix-patterns.json"), "utf8"),
    ) as Array<{ pattern: string; occurrences: number }>;
    const timeline = fs.readFileSync(path.join(runDir, "timeline.ndjson"), "utf8");
    const faultFix = fs.readFileSync(path.join(runDir, "fault-fix-index.md"), "utf8");
    const faultFixCsv = fs.readFileSync(path.join(runDir, "fault-fix-index.csv"), "utf8");
    // Dedup (2026-04-20): summary.md/meta.json/timeline.ndjson/fault-fix-index.{csv,md}
    // kopieras inte längre till site-observability/<chat>/latest/. Per-chat-mappen
    // håller bara observability.json + fix-patterns.json + _source_run.txt + history.ndjson.
    // Råfilerna nås via pekaren `_source_run.txt` → logs/generationslogg/<run>/.
    const siteSourceRun = fs.readFileSync(
      path.join(tempDir, "logs", "site-observability", "chat_1", "latest", "_source_run.txt"),
      "utf8",
    );
    const siteObservability = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "logs", "site-observability", "chat_1", "latest", "observability.json"),
        "utf8",
      ),
    ) as { chatId?: string };
    const siteFixPatterns = JSON.parse(
      fs.readFileSync(
        path.join(tempDir, "logs", "site-observability", "chat_1", "latest", "fix-patterns.json"),
        "utf8",
      ),
    ) as Array<{ pattern: string; occurrences: number }>;
    const siteHistory = fs.readFileSync(
      path.join(tempDir, "logs", "site-observability", "chat_1", "history.ndjson"),
      "utf8",
    );
    const globalCsv = fs.readFileSync(
      path.join(tempDir, "logs", "llm-segmentts-and-index", "error-log.csv"),
      "utf8",
    );
    const meta = JSON.parse(fs.readFileSync(path.join(runDir, "meta.json"), "utf8")) as {
      versionId?: string;
      status?: string;
    };

    expect(summary).toContain("# Generationslogg");
    expect(summary).toContain("Modell: gpt-5.4");
    expect(summary).toContain("Typ: followup");
    expect(summary).toContain("Promptstrategi: direct");
    expect(summary).toContain("Version: ver_1");
    expect(summary).toContain("## Verify / Quality Gate");
    expect(summary).toContain("Verifier blockers: 1");
    expect(summary).toContain("Verifier quality findings: 2");
    expect(summary).toContain("Background verify: skipped");
    expect(summary).toContain("Background verify reason: fast_policy");
    expect(siteSourceRun.trim()).toBe(latestDirName);
    expect(timeline).toContain("\"type\":\"comm.request.followup\"");
    expect(observability.chatId).toBe("chat_1");
    expect(Array.isArray(observability.recurringPatterns)).toBe(true);
    expect(Array.isArray(fixPatterns)).toBe(true);
    expect(siteObservability.chatId).toBe("chat_1");
    expect(Array.isArray(siteFixPatterns)).toBe(true);
    expect(siteHistory).toContain("\"runId\"");
    expect(faultFix).toContain("| Tid | Fas | Steg | Severity |");
    expect(faultFix).toContain("chat_1");
    expect(faultFix).toContain("ver_1");
    expect(faultFix).toContain("OpenAI");
    expect(faultFix).toContain("lineage_1");
    expect(faultFixCsv).toContain("time,phase,step,severity");
    expect(faultFixCsv).toContain("chat_1");
    expect(faultFixCsv).toContain("landing-page");
    expect(faultFixCsv).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(faultFixCsv).toContain("Background verify");
    expect(globalCsv).toContain("time,phase,step,severity");
    expect(globalCsv).toContain("chat_1");
    expect(globalCsv).toContain("landing-page");
    expect(globalCsv).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(meta.versionId).toBe("ver_1");
    expect(meta.status).toBe("done");
  });

  it("retains only the latest MAX_RUN_DIRS (15) generation folders", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { devLogStartGeneration, devLogAppend } = await import("./devLog");

    // Create 17 runs; expect prune to retain the 15 most recent.
    // We zero-pad the slug so lexicographic sort matches numeric order even
    // when all runs share the same `formatRunTimestamp(...)` prefix (the
    // tests run in well under a second).
    const totalRuns = 17;
    const expectedRetained = 15;
    const pad = (n: number) => String(n).padStart(2, "0");
    for (let i = 1; i <= totalRuns; i += 1) {
      const chatId = `chat_${pad(i)}`;
      devLogStartGeneration({
        message: `Bygg sajt ${pad(i)}`,
        modelId: "gpt-5.4",
        slug: `site-${pad(i)}`,
        chatId,
        generationKind: "create",
      });
      devLogAppend("latest", {
        type: "site.done",
        chatId,
        versionId: `ver_${pad(i)}`,
        durationMs: i * 100,
      });
    }

    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const dirs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("_"))
      .sort();

    expect(dirs).toHaveLength(expectedRetained);
    const firstRetainedIdx = totalRuns - expectedRetained + 1;
    expect(dirs[0]).toContain(`site-${pad(firstRetainedIdx)}`);
    expect(dirs[dirs.length - 1]).toContain(`site-${pad(totalRuns)}`);
  });

  it("generation-log-writer resolves runId from chatId fallback", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { resolveRunDirFromContext } = await import("./generation-log-writer");

    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const indexDir = path.join(rootDir, "_index");
    const fakeRunDirName = "20260420-120000-test";
    const fakeRunDir = path.join(rootDir, fakeRunDirName);
    fs.mkdirSync(fakeRunDir, { recursive: true });
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(
      path.join(indexDir, "chat-to-run.json"),
      JSON.stringify({ abc: fakeRunDirName }),
      "utf8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveRunDirFromContext({ chatId: "abc" });
    expect(resolved).toBe(fakeRunDir);

    const stale = resolveRunDirFromContext({ chatId: "missing" });
    expect(stale).toBe(path.join(rootDir, "_unrouted", "chat-missing"));
    expect(fs.existsSync(stale as string)).toBe(true);

    const slugBucket = resolveRunDirFromContext({ slug: "Some Slug!" });
    expect(slugBucket).toBe(path.join(rootDir, "_unrouted", "some-slug"));
    expect(fs.existsSync(slugBucket as string)).toBe(true);

    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0] ?? "").includes("could not resolve run dir"),
      ),
    ).toBe(false);

    warnSpy.mockRestore();
  });

  it("binds site.chatId to the latest run instead of stale slug buckets", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { devLogAppend, devLogStartGeneration } = await import("./devLog");

    devLogStartGeneration({
      message: "Bygg en tydlig startsida",
      modelId: "gpt-5.4",
      slug: "clear-home",
      generationKind: "create",
    });
    // Init-pathen emitterar ofta styleDirection före chatId.
    devLogAppend("in-progress", {
      type: "orchestration.styleDirection",
      styleDirection: "corporate-grid",
    });
    devLogAppend("in-progress", {
      type: "site.chatId",
      chatId: "chat_bind",
    });
    devLogAppend("in-progress", {
      type: "comm.request.create",
      chatId: "chat_bind",
      modelId: "gpt-5.4",
      promptType: "init_general",
    });
    devLogAppend("latest", {
      type: "site.done",
      chatId: "chat_bind",
      versionId: "ver_bind",
      durationMs: 450,
    });

    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const latestDirName = fs.readFileSync(path.join(rootDir, "_latest.txt"), "utf8").trim();
    const runTimeline = fs.readFileSync(
      path.join(rootDir, latestDirName, "timeline.ndjson"),
      "utf8",
    );
    expect(runTimeline).toContain('"type":"site.chatId"');
    expect(runTimeline).toContain('"type":"comm.request.create"');

    const styleBucketTimeline = path.join(
      rootDir,
      "_unrouted",
      "orchestration-styledirection",
      "timeline.ndjson",
    );
    if (fs.existsSync(styleBucketTimeline)) {
      const styleBucket = fs.readFileSync(styleBucketTimeline, "utf8");
      expect(styleBucket).not.toContain('"type":"site.chatId"');
      expect(styleBucket).not.toContain('"type":"comm.request.create"');
    }

    const chatIndex = JSON.parse(
      fs.readFileSync(path.join(rootDir, "_index", "chat-to-run.json"), "utf8"),
    ) as Record<string, string>;
    expect(chatIndex.chat_bind).toBe(latestDirName);
  });

  it("tracks followups and auto-repair runs separately in site history", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { devLogAppend, devLogStartGeneration } = await import("./devLog");

    const runFollowup = (versionId: string, promptSource: "user" | "auto_repair") => {
      devLogStartGeneration({
        message: `Follow-up ${versionId}`,
        modelId: "gpt-5.4",
        slug: "chat-stats",
        chatId: "chat_stats",
        generationKind: "followup",
      });
      devLogAppend("in-progress", {
        type: "comm.request.followup",
        chatId: "chat_stats",
        promptSource,
      });
      devLogAppend("latest", {
        type: "site.done",
        chatId: "chat_stats",
        versionId,
        durationMs: 250,
      });
    };

    runFollowup("ver_1", "user");
    runFollowup("ver_2", "auto_repair");

    const historyLines = fs
      .readFileSync(
        path.join(tempDir, "logs", "site-observability", "chat_stats", "history.ndjson"),
        "utf8",
      )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const latest = JSON.parse(historyLines.at(-1) ?? "{}") as {
      promptSource?: string;
      followupCount?: number;
      autoRepairCount?: number;
    };
    expect(latest.promptSource).toBe("auto_repair");
    expect(latest.followupCount).toBe(1);
    expect(latest.autoRepairCount).toBe(1);
  });
});
