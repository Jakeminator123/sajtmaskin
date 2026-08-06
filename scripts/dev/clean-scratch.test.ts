import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AGE_SKIP_NAMES,
  LOGS_RETAIN_COUNT,
  planLogsTree,
  runCleanScratch,
} from "./clean-scratch.mjs";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempLogsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clean-scratch-logs-"));
  tmpRoots.push(dir);
  return dir;
}

/**
 * A real git repo, because the tracked-file guard reads `git ls-files`. Without
 * git the loader fails safe by treating everything as tracked, which would make
 * the assertions below pass for the wrong reason.
 */
function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clean-scratch-root-"));
  tmpRoots.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  return dir;
}

function touchDir(abs: string, mtimeMs: number) {
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "marker.txt"), "x");
  fs.utimesSync(abs, new Date(mtimeMs), new Date(mtimeMs));
}

function touchFile(abs: string, mtimeMs: number) {
  fs.writeFileSync(abs, "scratch");
  fs.utimesSync(abs, new Date(mtimeMs), new Date(mtimeMs));
}

describe("planLogsTree / logs retention", () => {
  it("håller högst två dump-mappar (nyaste), wipar lösa filer, rör inte AGE_SKIP_NAMES", () => {
    const logsDir = makeTempLogsDir();

    const t0 = Date.UTC(2026, 7, 1, 12);
    const oldest = path.join(logsDir, "hydration-oldest");
    const middle = path.join(logsDir, "hydration-middle");
    const newest = path.join(logsDir, "hydration-newest");
    touchDir(oldest, t0);
    touchDir(middle, t0 + 60_000);
    touchDir(newest, t0 + 120_000);

    const looseTmp = path.join(logsDir, "tmp-logg-demo.json");
    const looseDump = path.join(logsDir, "dump-9cdb3e31.json");
    touchFile(looseTmp, t0 + 180_000);
    touchFile(looseDump, t0 + 240_000);

    const skipName = [...AGE_SKIP_NAMES][0];
    expect(skipName).toBeTruthy();
    const skipDir = path.join(logsDir, skipName!);
    touchDir(skipDir, t0 - 86_400_000); // older than all dumps — still kept
    const skipMarker = path.join(skipDir, "marker.txt");

    const plan = planLogsTree(logsDir);

    expect(LOGS_RETAIN_COUNT).toBe(2);
    expect(plan.remove.map((r) => path.basename(r.abs)).sort()).toEqual(
      ["dump-9cdb3e31.json", "hydration-oldest", "tmp-logg-demo.json"].sort(),
    );
    expect(plan.remove.find((r) => r.abs === oldest)?.label).toBe("count-cap:logs");
    expect(plan.remove.find((r) => r.abs === looseTmp)?.label).toBe("wipe-loose:logs");

    const keptNames = plan.keep.map((abs) => path.basename(abs)).sort();
    expect(keptNames).toEqual(
      ["hydration-middle", "hydration-newest", skipName!].sort(),
    );

    // Apply the plan against the temp tree — same deletions the CLI would make.
    for (const r of plan.remove) {
      fs.rmSync(r.abs, { recursive: true, force: true });
    }

    expect(fs.existsSync(newest)).toBe(true);
    expect(fs.existsSync(middle)).toBe(true);
    expect(fs.existsSync(oldest)).toBe(false);
    expect(fs.existsSync(looseTmp)).toBe(false);
    expect(fs.existsSync(looseDump)).toBe(false);
    expect(fs.existsSync(skipDir)).toBe(true);
    expect(fs.existsSync(skipMarker)).toBe(true);
  });

  it("rör aldrig en länkad post — radering följer länken och tömmer målet", () => {
    // Detta är skriptets enda regel vars felläge är destruktivt: rmSync på en
    // junction/symlink opererar på TARGET, så en felaktigt pruneable länk under
    // logs/ skulle tömma vad den än pekar på (samma fälla som node_modules-
    // junctions i worktree-hanteringen). Guarden flyttades i refaktorn och var
    // otestad.
    const logsDir = makeTempLogsDir();
    const linkTarget = makeTempLogsDir();
    touchFile(path.join(linkTarget, "precious.txt"), Date.UTC(2026, 7, 1));

    const t0 = Date.UTC(2026, 7, 1, 12);
    // Tre riktiga mappar så taket (2) garanterat vill radera något.
    touchDir(path.join(logsDir, "hydration-a"), t0);
    touchDir(path.join(logsDir, "hydration-b"), t0 + 60_000);
    touchDir(path.join(logsDir, "hydration-c"), t0 + 120_000);

    const linkPath = path.join(logsDir, "linked-dump");
    try {
      fs.symlinkSync(linkTarget, linkPath, "junction");
    } catch {
      return; // Saknade länkrättigheter (t.ex. icke-elevated Windows) — hoppa.
    }

    const plan = planLogsTree(logsDir);

    expect(plan.skipped).toContain(linkPath);
    expect(plan.remove.map((r) => r.abs)).not.toContain(linkPath);
    expect(plan.keep).not.toContain(linkPath);
    expect(fs.existsSync(path.join(linkTarget, "precious.txt"))).toBe(true);
  });
});

describe("lösa scratch-filer i repo-roten", () => {
  it("sopar .tmp-* och scratch-*.mjs/json men lämnar riktiga rotfiler", () => {
    const root = makeTempRepo();

    // Namn som INTE ska röras: vanliga rotfiler, plus ett scratch-liknande namn
    // som git faktiskt visar (`scratch-notes.txt` står inte i .gitignore, så att
    // radera det vore att kasta arbete användaren var på väg att se).
    const survivors = ["package.json", "knip.json", "scratch-notes.txt"];
    for (const name of survivors) fs.writeFileSync(path.join(root, name), "keep");

    // Matchar mönstret men är spårad — guarden ska skona den.
    const trackedScratch = path.join(root, "scratch-tracked.mjs");
    fs.writeFileSync(trackedScratch, "// tracked");
    execFileSync("git", ["add", "scratch-tracked.mjs"], { cwd: root });

    const doomed = [
      ".tmp-shadcn-out.txt",
      ".tmp-shadcn-err.txt",
      "scratch-logs.mjs",
      "scratch-data.json",
    ];
    for (const name of doomed) fs.writeFileSync(path.join(root, name), "scratch");

    const { removed, skippedTracked } = runCleanScratch({ root, apply: true });

    expect(removed.map((r) => path.basename(r.abs)).sort()).toEqual([...doomed].sort());
    for (const r of removed) expect(r.label).toBe("stray:.");

    for (const name of survivors) {
      expect(fs.existsSync(path.join(root, name))).toBe(true);
    }
    expect(fs.existsSync(trackedScratch)).toBe(true);
    expect(skippedTracked).toContain(trackedScratch);
  });

  it("rör aldrig en länkad scratch-post — rmSync följer länken och tömmer målet", () => {
    const root = makeTempRepo();
    const linkTarget = makeTempLogsDir();
    fs.writeFileSync(path.join(linkTarget, "precious.txt"), "x");

    const linkPath = path.join(root, ".tmp-linked");
    try {
      fs.symlinkSync(linkTarget, linkPath, "junction");
    } catch {
      return; // Saknade länkrättigheter (icke-elevated Windows) — hoppa.
    }

    const { removed, skippedTracked } = runCleanScratch({ root, apply: true });

    expect(removed.map((r) => r.abs)).not.toContain(linkPath);
    expect(skippedTracked).toContain(linkPath);
    expect(fs.existsSync(path.join(linkTarget, "precious.txt"))).toBe(true);
  });
});
