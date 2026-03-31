import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const mutableEnv = process.env as Record<string, string | undefined>;

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
    const timeline = fs.readFileSync(path.join(runDir, "timeline.ndjson"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(runDir, "meta.json"), "utf8")) as {
      versionId?: string;
      status?: string;
    };

    expect(summary).toContain("# Generationslogg");
    expect(summary).toContain("Modell: gpt-5.4");
    expect(summary).toContain("Typ: followup");
    expect(summary).toContain("Promptstrategi: direct");
    expect(summary).toContain("Version: ver_1");
    expect(timeline).toContain("\"type\":\"comm.request.followup\"");
    expect(meta.versionId).toBe("ver_1");
    expect(meta.status).toBe("done");
  });
});
