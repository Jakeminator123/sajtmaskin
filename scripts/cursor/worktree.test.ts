import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findLinkedEntries,
  findMainWorktree,
  parseDirtyEntries,
  parseWorktreeList,
  resolveTargetWorktree,
} from "./worktree.mjs";

const MAIN = resolve("C:/repo/sajtmaskin");
const FEATURE = resolve("C:/repo/sajtmaskin-feat-x");

const WORKTREES = [
  { path: MAIN, isMain: true },
  { path: FEATURE, isMain: false },
];

describe("parseWorktreeList", () => {
  it("treats the first entry as the main worktree", () => {
    const porcelain = [
      "worktree /c/repo/sajtmaskin",
      "HEAD abc123",
      "branch refs/heads/master",
      "",
      "worktree /c/repo/sajtmaskin-feat-x",
      "HEAD def456",
      "branch refs/heads/feat/x",
      "",
    ].join("\n");

    expect(parseWorktreeList(porcelain)).toEqual([
      { path: "/c/repo/sajtmaskin", isMain: true },
      { path: "/c/repo/sajtmaskin-feat-x", isMain: false },
    ]);
  });

  it("ignores non-worktree porcelain lines", () => {
    expect(parseWorktreeList("HEAD abc\nbranch refs/heads/master\n")).toEqual([]);
  });
});

describe("resolveTargetWorktree", () => {
  it("accepts a registered secondary worktree", () => {
    const plan = resolveTargetWorktree({ targetPath: FEATURE, worktrees: WORKTREES });
    expect(plan).toEqual({ ok: true, worktreePath: FEATURE });
  });

  // The whole point of the guard: the main checkout is shared with the user.
  it("refuses the main checkout", () => {
    const plan = resolveTargetWorktree({ targetPath: MAIN, worktrees: WORKTREES });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("MAIN checkout");
  });

  it("refuses a path that is not a registered worktree", () => {
    const plan = resolveTargetWorktree({
      targetPath: resolve("C:/repo/somewhere-else"),
      worktrees: WORKTREES,
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("not a registered git worktree");
  });

  it("matches despite a trailing separator or case difference", () => {
    const plan = resolveTargetWorktree({
      targetPath: `${FEATURE.toUpperCase()}\\`,
      worktrees: WORKTREES,
    });
    expect(plan.ok).toBe(true);
  });
});

describe("findMainWorktree", () => {
  // Regression: deriving the link source from this script's own location made
  // it resolve to the worktree when an agent ran the worktree's copy, linking
  // node_modules to its own missing directory instead of the shared one.
  it("returns the main checkout, not the caller's worktree", () => {
    expect(findMainWorktree(WORKTREES)).toBe(MAIN);
  });

  it("returns null when no main entry exists", () => {
    expect(findMainWorktree([{ path: FEATURE, isMain: false }])).toBeNull();
  });
});

describe("parseDirtyEntries", () => {
  it("treats an empty status as clean", () => {
    expect(parseDirtyEntries("")).toEqual([]);
    expect(parseDirtyEntries("\n\n")).toEqual([]);
  });

  // Regression: detaching links before this check made the wrapper LESS safe
  // than raw `git worktree remove`, which refuses on an untracked root-level
  // link instead of silently discarding it.
  it("reports untracked and modified entries", () => {
    expect(parseDirtyEntries("?? my-link\n M src/app/page.tsx\n")).toEqual([
      "?? my-link",
      "M src/app/page.tsx",
    ]);
  });
});

describe("findLinkedEntries", () => {
  const io = (entries: Record<string, boolean>) => ({
    readdir: () => Object.keys(entries),
    lstat: (path: string) => ({
      isSymbolicLink: () => entries[path.split(/[\\/]/).pop() ?? ""] ?? false,
    }),
  });

  // Regression for the 2026-07-27 incident: a junctioned node_modules must be
  // detached before `git worktree remove`, or the removal empties its target.
  it("reports a junctioned node_modules", () => {
    const linked = findLinkedEntries(FEATURE, io({ src: false, node_modules: true }));
    expect(linked).toHaveLength(1);
    expect(linked[0]).toContain("node_modules");
  });

  it("reports nothing when node_modules is a real directory", () => {
    expect(findLinkedEntries(FEATURE, io({ src: false, node_modules: false }))).toEqual([]);
  });

  it("returns empty for an unreadable directory instead of throwing", () => {
    expect(
      findLinkedEntries(FEATURE, {
        readdir: () => {
          throw new Error("ENOENT");
        },
      }),
    ).toEqual([]);
  });

  it("skips an entry that disappears between readdir and lstat", () => {
    expect(
      findLinkedEntries(FEATURE, {
        readdir: () => ["node_modules"],
        lstat: () => {
          throw new Error("ENOENT");
        },
      }),
    ).toEqual([]);
  });
});
