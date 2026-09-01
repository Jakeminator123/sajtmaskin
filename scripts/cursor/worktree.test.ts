import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyExistingNodeModules,
  classifyRemovalLifecycle,
  classifyWorktreePlacement,
  copyWorktreeIncludeFiles,
  describeRemovalFailure,
  findLinkedEntries,
  findMainWorktree,
  parseDirtyEntries,
  parseWorktreeIncludeList,
  parseWorktreeList,
  protectedRemovalPaths,
  removeLink,
  resolveTargetWorktree,
  syncWorktreeMcpJson,
} from "./worktree.mjs";

const MAIN = resolve("C:/repo/sajtmaskin");
const FEATURE = resolve("C:/repo/sajtmaskin-feat-x");
const REGISTERED_LONG_LIVED = resolve("C:/agent-worktrees/ed66/sajtmaskin-long-lived");

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
      protectedWorktreePaths: protectedRemovalPaths(FEATURE),
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("protected current/registered");
  });

  it("refuses a registry-protected worktree when called from another checkout", () => {
    const worktrees = [
      ...WORKTREES,
      { path: REGISTERED_LONG_LIVED, isMain: false },
    ];
    const plan = resolveTargetWorktree({
      targetPath: REGISTERED_LONG_LIVED,
      worktrees,
      protectedWorktreePaths: protectedRemovalPaths(FEATURE, [
        REGISTERED_LONG_LIVED,
      ]),
    });
    expect(plan.ok).toBe(false);
    expect("reason" in plan && plan.reason).toContain("protected current/registered");
  });
});

describe("classifyRemovalLifecycle", () => {
  const branch = "fix/example";
  const headSha = "a".repeat(40);
  const mergedLifecycle = {
    openHeads: new Set<string>(),
    mergedHeads: new Map([[branch, new Set([headSha])]]),
  };

  it("allows only a clean exact terminal PR/Git proof by default", () => {
    expect(
      classifyRemovalLifecycle({
        branch,
        headSha,
        isDirty: false,
        force: false,
        lifecycle: mergedLifecycle,
        mergedIntoBase: false,
      }),
    ).toEqual({ ok: true, reason: expect.stringContaining("FRI") });
  });

  it("fails closed without GitHub lifecycle or with an open PR", () => {
    const base = { branch, headSha, isDirty: false, force: false, mergedIntoBase: true };
    expect(classifyRemovalLifecycle({ ...base, lifecycle: null }).ok).toBe(false);
    expect(
      classifyRemovalLifecycle({
        ...base,
        lifecycle: { openHeads: new Set([branch]), mergedHeads: new Map() },
      }).reason,
    ).toContain("öppen PR");
  });

  it("does not let --force bypass open PR and requires a reason for discard", () => {
    const open = { openHeads: new Set([branch]), mergedHeads: new Map() };
    const base = {
      branch,
      headSha,
      isDirty: true,
      force: true,
      mergedIntoBase: false,
    };
    expect(
      classifyRemovalLifecycle({
        ...base,
        lifecycle: open,
        discardReason: "Tydligt beslut att kasta kandidat",
      }).ok,
    ).toBe(false);
    expect(
      classifyRemovalLifecycle({ ...base, lifecycle: mergedLifecycle, discardReason: "kort" }).ok,
    ).toBe(false);
    expect(
      classifyRemovalLifecycle({
        ...base,
        lifecycle: mergedLifecycle,
        discardReason: "Verifierad förlorarkandidat; diffen är redan sparad",
      }).ok,
    ).toBe(true);
  });

  it.each([
    "master",
    "main",
    "ema",
    "JAKOB_BRA_9999_INNNAN_MVP_BRA",
    "rescue/stash-2026-08-14",
    "dependabot/npm_and_yarn/next-16.3.1",
    "archive/sanering-2026-08-04",
  ])("never removes protected branch %s, even with --force", (protectedBranch) => {
    const decision = classifyRemovalLifecycle({
      branch: protectedBranch,
      headSha,
      isDirty: true,
      force: true,
      discardReason: "Verifierat beslut med en tillräckligt lång förklaring",
      lifecycle: { openHeads: new Set<string>(), mergedHeads: new Map() },
      mergedIntoBase: true,
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain("skyddat branchnamn");
  });
});

describe("syncWorktreeMcpJson", () => {
  it("copies only the tracked example, even when a live file exists", () => {
    const copied: Array<{ from: string; to: string }> = [];
    const result = syncWorktreeMcpJson(MAIN, FEATURE, {
      exists: (p: string) => p.endsWith("mcp.json") || p.endsWith("mcp.json.example"),
      mkdir: () => {},
      copyFile: (from: string, to: string) => copied.push({ from, to }),
    });
    expect(result.ok).toBe(true);
    expect(copied).toEqual([
      {
        from: join(MAIN, ".cursor", "mcp.json.example"),
        to: join(FEATURE, ".cursor", "mcp.json"),
      },
    ]);
  });

  it("fails closed when the tracked example is missing", () => {
    const result = syncWorktreeMcpJson(MAIN, FEATURE, {
      exists: (p: string) => p.endsWith("mcp.json"),
      mkdir: () => {},
      copyFile: () => {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseWorktreeIncludeList", () => {
  it("drops comments, blanks and surrounding whitespace", () => {
    expect(
      parseWorktreeIncludeList("# header\n.env.local\n\n  .cursor/mcp.json  \n# tail\n"),
    ).toEqual([".env.local", ".cursor/mcp.json"]);
  });
});

describe("copyWorktreeIncludeFiles", () => {
  it("copies listed files that exist and skips the rest", () => {
    const copied: Array<{ from: string; to: string }> = [];
    const result = copyWorktreeIncludeFiles(MAIN, FEATURE, [".env.local", "missing.env"], {
      exists: (p: string) => p === join(MAIN, ".env.local"),
      mkdir: () => {},
      copyFile: (from: string, to: string) => copied.push({ from, to }),
    });
    expect(result).toEqual({ copied: [".env.local"], skipped: ["missing.env"] });
    expect(copied).toEqual([
      { from: join(MAIN, ".env.local"), to: join(FEATURE, ".env.local") },
    ]);
  });
});

describe("classifyExistingNodeModules", () => {
  const expected = join(MAIN, "node_modules");
  const linkPath = join(FEATURE, "node_modules");

  it("accepts a junction to the main checkout", () => {
    const decision = classifyExistingNodeModules(linkPath, expected, {
      lstat: () => ({ isSymbolicLink: () => true }),
      readlink: () => expected,
    });
    expect(decision).toEqual({ ok: true, reason: "expected junction" });
  });

  it("rejects a real directory", () => {
    const decision = classifyExistingNodeModules(linkPath, expected, {
      lstat: () => ({ isSymbolicLink: () => false }),
      readlink: () => expected,
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain("real install");
  });

  it("rejects a link to a different install", () => {
    const decision = classifyExistingNodeModules(linkPath, expected, {
      lstat: () => ({ isSymbolicLink: () => true }),
      readlink: () => join(FEATURE, "stale-node_modules"),
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain("points at");
  });
});

describe("classifyWorktreePlacement", () => {
  it("accepts a sibling next to the main checkout", () => {
    expect(classifyWorktreePlacement({ worktreePath: FEATURE, mainWorktree: MAIN })).toEqual({
      ok: true,
    });
  });

  it("refuses a worktree nested under the main checkout, including .cursor/worktrees", () => {
    const nested = classifyWorktreePlacement({
      worktreePath: join(MAIN, ".cursor", "worktrees", "agent"),
      mainWorktree: MAIN,
    });
    expect(nested.ok).toBe(false);
    expect(nested.ok === false && nested.reason).toContain("bredvid repo-roten");
  });

  it("refuses the main checkout itself", () => {
    const same = classifyWorktreePlacement({ worktreePath: MAIN, mainWorktree: MAIN });
    expect(same.ok).toBe(false);
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
