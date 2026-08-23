import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeRemovalFailure,
  findLinkedEntries,
  findMainWorktree,
  parseDirtyEntries,
  parseWorktreeList,
  protectedRemovalPaths,
  removeLink,
  resolveTargetWorktree,
  syncWorktreeMcpJson,
} from "./worktree.mjs";

const MAIN = resolve("C:/repo/sajtmaskin");
const FEATURE = resolve("C:/repo/sajtmaskin-feat-x");
const PERMANENT_CODEX = resolve("C:/repo/sajtmaskin-codex");
const REGISTERED_PERMANENT = resolve("C:/agent-worktrees/ed66/sajtmaskin-codex");

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

  it("refuses the current control-plane worktree during removal", () => {
    const plan = resolveTargetWorktree({
      targetPath: FEATURE,
      worktrees: WORKTREES,
      protectedWorktreePaths: protectedRemovalPaths(WORKTREES, FEATURE),
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("protected permanent/current");
  });

  it("refuses the conventional permanent Codex checkout during removal", () => {
    const worktrees = [...WORKTREES, { path: PERMANENT_CODEX, isMain: false }];
    const plan = resolveTargetWorktree({
      targetPath: PERMANENT_CODEX,
      worktrees,
      protectedWorktreePaths: protectedRemovalPaths(worktrees, FEATURE),
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("protected permanent/current");
  });

  it("refuses a registry-protected worktree when called from another checkout", () => {
    const worktrees = [
      ...WORKTREES,
      { path: PERMANENT_CODEX, isMain: false },
      { path: REGISTERED_PERMANENT, isMain: false },
    ];
    const plan = resolveTargetWorktree({
      targetPath: REGISTERED_PERMANENT,
      worktrees,
      protectedWorktreePaths: protectedRemovalPaths(worktrees, PERMANENT_CODEX, [
        REGISTERED_PERMANENT,
      ]),
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("protected permanent/current");
  });
});

describe("syncWorktreeMcpJson", () => {
  it("prefers the live mcp.json over the example", () => {
    const copied: Array<{ from: string; to: string }> = [];
    const result = syncWorktreeMcpJson(MAIN, FEATURE, {
      exists: (p) => p.endsWith("mcp.json") || p.endsWith("mcp.json.example"),
      mkdir: () => {},
      copyFile: (from, to) => copied.push({ from, to }),
    });
    expect(result.ok).toBe(true);
    expect(copied).toEqual([
      {
        from: join(MAIN, ".cursor", "mcp.json"),
        to: join(FEATURE, ".cursor", "mcp.json"),
      },
    ]);
  });

  it("falls back to the tracked example when the live file is missing", () => {
    const result = syncWorktreeMcpJson(MAIN, FEATURE, {
      exists: (p) => p.endsWith("mcp.json.example"),
      mkdir: () => {},
      copyFile: () => {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe(join(MAIN, ".cursor", "mcp.json.example"));
    }
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

describe("removeLink", () => {
  it("falls back to unlink when Windows rmdir reports ENOENT for a file symlink", () => {
    const calls: string[] = [];

    removeLink(`${FEATURE}/.env.local`, {
      rmdir: () => {
        calls.push("rmdir");
        throw Object.assign(new Error("not found"), { code: "ENOENT" });
      },
      unlink: () => {
        calls.push("unlink");
      },
    });

    expect(calls).toEqual(["rmdir", "unlink"]);
  });

  it("accepts a link that disappeared between discovery and removal", () => {
    expect(() =>
      removeLink(`${FEATURE}/.env.local`, {
        rmdir: () => {
          throw Object.assign(new Error("not a directory"), { code: "EPERM" });
        },
        unlink: () => {
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        },
      }),
    ).not.toThrow();
  });
});

describe("describeRemovalFailure", () => {
  const failure = (over: Partial<Parameters<typeof describeRemovalFailure>[0]> = {}) =>
    describeRemovalFailure({
      worktreePath: FEATURE,
      detachedLinks: [`${FEATURE}/node_modules`],
      stillRegistered: false,
      message: "error: failed to delete '...': Permission denied",
      ...over,
    });

  // The reason this message exists: a raw stacktrace right after
  // "unlinked … (target untouched)" reads like the junction trap fired and the
  // shared node_modules was just emptied. It was not — detaching runs first.
  it("leads with the shared node_modules being safe when links were detached", () => {
    const lines = failure().split("\n");
    expect(lines[0]).toContain("SAFE");
    expect(lines[0]).toContain("detached before the removal");
  });

  it("says nothing about links when there were none to detach", () => {
    expect(failure({ detachedLinks: [] })).not.toContain("SAFE");
  });

  it("separates the actual failure from the junction question", () => {
    expect(failure()).toContain("What failed is the directory removal itself");
    expect(failure()).toContain("Permission denied");
  });

  // Observed twice: git drops the metadata BEFORE the directory delete fails,
  // so the worktree is gone from `git worktree list` and an empty folder stays.
  it("gives prune + manual-delete steps when git already dropped the worktree", () => {
    const text = failure({ stillRegistered: false });
    expect(text).toContain("git worktree prune");
    expect(text).toContain("Remove-Item");
    expect(text).toContain(FEATURE);
  });

  it("tells the user to just rerun when git still tracks the worktree", () => {
    const text = failure({ stillRegistered: true });
    expect(text).toContain("nothing is half-removed");
    expect(text).toContain("rerun this command");
    expect(text).not.toContain("git worktree prune");
  });
});

/**
 * Nästlade junctions — regression för 2026-08-01.
 *
 * Skyddet fanns, men scanningen stannade på djup 1. En `preview-host/node_modules`
 * som skapats för hand med `mklink /J` var därmed osynlig: den kopplades aldrig
 * loss, och `git worktree remove` följde den in i huvudcheckouten och tömde den
 * riktiga katalogen.
 */
describe("findLinkedEntries — nästlade länkar", () => {
  type Entry = { name: string; link?: boolean; dir?: boolean };

  /** Trädmedveten io: readdir/lstat svarar per sökväg, inte platt. */
  const treeIo = (tree: Record<string, Entry[]>) => {
    const key = (p: string) => resolve(p).toLowerCase();
    const indexed = Object.fromEntries(
      Object.entries(tree).map(([path, entries]) => [key(path), entries]),
    );
    return {
      readdir: (p: string) => {
        const entries = indexed[key(p)];
        if (!entries) throw new Error(`ENOENT ${p}`);
        return entries.map((e) => e.name);
      },
      lstat: (p: string) => {
        const entry = indexed[key(dirname(p))]?.find((e) => e.name === basename(p));
        if (!entry) throw new Error(`ENOENT ${p}`);
        return {
          isSymbolicLink: () => entry.link === true,
          isDirectory: () => entry.dir === true,
        };
      },
    };
  };

  it("hittar en junctionad preview-host/node_modules på djup 2", () => {
    const linked = findLinkedEntries(
      FEATURE,
      treeIo({
        [FEATURE]: [
          { name: "node_modules", link: true },
          { name: "preview-host", dir: true },
          { name: "src", dir: true },
        ],
        [join(FEATURE, "preview-host")]: [{ name: "node_modules", link: true }],
        [join(FEATURE, "src")]: [],
      }),
    );

    expect(linked).toHaveLength(2);
    expect(linked.some((p) => p === join(FEATURE, "node_modules"))).toBe(true);
    expect(linked.some((p) => p === join(FEATURE, "preview-host", "node_modules"))).toBe(true);
  });

  // Leaf-regeln är det som håller walken billig: en RIKTIG node_modules
  // (~765 paket) får aldrig gås igenom, bara kontrolleras om den är en länk.
  it("går aldrig in i en riktig node_modules", () => {
    const linked = findLinkedEntries(
      FEATURE,
      treeIo({
        [FEATURE]: [{ name: "node_modules", dir: true }],
        // Skulle scanningen descenda hit vore länken med i resultatet.
        [join(FEATURE, "node_modules")]: [{ name: "some-package", link: true }],
      }),
    );

    expect(linked).toEqual([]);
  });

  it("går inte in i .git", () => {
    const linked = findLinkedEntries(
      FEATURE,
      treeIo({
        [FEATURE]: [{ name: ".git", dir: true }],
        [join(FEATURE, ".git")]: [{ name: "worktrees", link: true }],
      }),
    );

    expect(linked).toEqual([]);
  });

  it("slutar descenda vid djuptaket", () => {
    const linked = findLinkedEntries(
      FEATURE,
      treeIo({
        [FEATURE]: [{ name: "a", dir: true }],
        [join(FEATURE, "a")]: [{ name: "b", dir: true }],
        [join(FEATURE, "a", "b")]: [{ name: "c", dir: true }],
        [join(FEATURE, "a", "b", "c")]: [{ name: "too-deep", link: true }],
      }),
    );

    expect(linked).toEqual([]);
  });

  it("hoppar över en underkatalog som inte går att läsa i stället för att kasta", () => {
    const linked = findLinkedEntries(
      FEATURE,
      treeIo({
        [FEATURE]: [
          { name: "node_modules", link: true },
          { name: "unreadable", dir: true },
        ],
        // "unreadable" saknas i trädet -> readdir kastar.
      }),
    );

    expect(linked).toEqual([join(FEATURE, "node_modules")]);
  });
});
