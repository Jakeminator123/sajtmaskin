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
    const siteSummary = fs.readFileSync(
      path.join(tempDir, "logs", "site-observability", "chat_1", "latest", "summary.md"),
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
    expect(siteSummary).toContain("Background verify reason: fast_policy");
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

  it("retains only the three latest generation folders", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-generation-log-"));
    process.chdir(tempDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SAJTMASKIN_DEV_LOG", "false");
    vi.stubEnv("GENERATIONSLOGG", "1");

    const { devLogStartGeneration, devLogAppend } = await import("./devLog");

    for (let i = 1; i <= 5; i += 1) {
      const chatId = `chat_${i}`;
      devLogStartGeneration({
        message: `Bygg sajt ${i}`,
        modelId: "gpt-5.4",
        slug: `site-${i}`,
        chatId,
        generationKind: "create",
      });
      devLogAppend("latest", {
        type: "site.done",
        chatId,
        versionId: `ver_${i}`,
        durationMs: i * 100,
      });
    }

    const rootDir = path.join(tempDir, "logs", "generationslogg");
    const dirs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(dirs).toHaveLength(3);
    expect(dirs[0]).toContain("site-3");
    expect(dirs[1]).toContain("site-4");
    expect(dirs[2]).toContain("site-5");
  });
});
