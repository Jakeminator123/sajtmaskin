// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_AGE_DAYS,
  MAX_CHARS,
  MAX_MESSAGES,
  formatMessage,
  inboxPath,
  parseMessages,
  prune,
  render,
  runInbox,
} from "./agent-inbox.mjs";

const tmpRoots: string[] = [];
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-17T17:00:00Z");

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function git(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** A main checkout plus one linked worktree, like the real repo layout. */
function makeRepoWithWorktree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "agent-inbox-"));
  tmpRoots.push(base);
  const main = path.join(base, "main");
  const linked = path.join(base, "linked");
  fs.mkdirSync(main);
  git(["init", "--quiet", "-b", "preview"], main);
  git(
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "--allow-empty",
      "-m",
      "init",
      "--quiet",
    ],
    main,
  );
  git(["worktree", "add", "--quiet", "--detach", linked], main);
  return { main, linked };
}

describe("agent-inbox", () => {
  it("resolves the same file from the main checkout and a linked worktree", () => {
    const { main, linked } = makeRepoWithWorktree();
    const fromMain = inboxPath(main);
    expect(fs.realpathSync.native(path.dirname(path.dirname(fromMain)))).toBe(
      fs.realpathSync.native(main),
    );
    expect(inboxPath(linked)).toBe(fromMain);
  });

  it("lets a worktree read what the main checkout wrote, with origin", () => {
    const { main, linked } = makeRepoWithWorktree();
    runInbox({ args: ["huvudcheckouten", "ligger", "på", "feat/x"], cwd: main, now: NOW });
    const { messages } = runInbox({ cwd: linked, now: NOW + 60_000 });
    expect(messages).toHaveLength(1);
    expect(messages[0].line).toContain("main@preview");
    expect(messages[0].line).toContain("huvudcheckouten ligger på feat/x");
  });

  it("does not create a file on a plain read of an empty inbox", () => {
    const { main } = makeRepoWithWorktree();
    runInbox({ cwd: main, now: NOW });
    expect(fs.existsSync(inboxPath(main))).toBe(false);
  });

  it("drops messages older than the age limit and keeps only the newest", () => {
    const old = formatMessage({
      text: "gammal",
      origin: "a@b",
      now: NOW - (MAX_AGE_DAYS + 1) * DAY,
    });
    const fresh = Array.from({ length: MAX_MESSAGES + 5 }, (_, index) =>
      formatMessage({ text: `m${index}`, origin: "a@b", now: NOW - index * 60_000 }),
    ).reverse();
    const kept = prune(parseMessages(render([old, ...fresh])), NOW);
    expect(kept).toHaveLength(MAX_MESSAGES);
    expect(kept.some((message) => message.line.includes("gammal"))).toBe(false);
    expect(kept.at(-1)?.line).toContain("· m0");
  });

  it("flattens and caps a long message to one line", () => {
    const { line } = formatMessage({
      text: `rad1\nrad2 ${"x".repeat(500)}`,
      origin: "a@b",
      now: NOW,
    });
    expect(line).not.toContain("\n");
    expect(line.endsWith("…")).toBe(true);
    expect(line.split(" · ").at(-1)).toHaveLength(MAX_CHARS);
  });

  it("prunes on read and rewrites the file", () => {
    const { main } = makeRepoWithWorktree();
    runInbox({ args: ["snart", "gammal"], cwd: main, now: NOW });
    runInbox({ cwd: main, now: NOW + (MAX_AGE_DAYS + 1) * DAY });
    expect(parseMessages(fs.readFileSync(inboxPath(main), "utf8"))).toHaveLength(0);
  });
});
