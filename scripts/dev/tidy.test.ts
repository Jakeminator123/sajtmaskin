import { describe, expect, it } from "vitest";

import {
  PR_LIFECYCLE_API_ARGS,
  STALE_AFTER_DAYS,
  classifyLocalBranch,
  classifyRemoteBranch,
  classifyWorktree,
  dedupeVercelIgnoreLines,
  isExactMergedPr,
  isNextCacheStale,
  isProtectedBranch,
  isWorktreeDirty,
  parsePrLifecycle,
  parsePrLifecycleTsv,
  parsePorcelainWorktrees,
} from "./tidy.mjs";

/**
 * Kontraktet som gör `tidy` ofarlig. Varje rad här motsvarar ett sätt att av
 * misstag radera arbete, så en regel som glider ska falla här och inte i ett
 * git-repo någon förlorat en branch i.
 */
describe("isProtectedBranch", () => {
  it("skyddar permanenta checkouter, ägarens backuper och botens brancher", () => {
    for (const name of [
      "master",
      "main",
      "ema",
      "JAKOB_BRA_9999_INNNAN_MVP_BRA",
      "BRA_19191919",
      "rescue/stash-2026-08-14-natt-regler-och-backlog",
      "dependabot/npm_and_yarn/next-16.3.1",
      "archive/sanering-integration-2026-08-04",
    ]) {
      expect(isProtectedBranch(name), name).toBe(true);
    }
  });

  it("skyddar inte vanliga arbetsbrancher", () => {
    for (const name of ["fix/nagot", "feat/nytt", "chore/stad", "cursor/agent-abc1"]) {
      expect(isProtectedBranch(name), name).toBe(false);
    }
  });
});

describe("classifyLocalBranch", () => {
  const merged = { mergedIntoBase: true, upstreamGone: true, isCurrent: false };

  it("raderar bara när remoten är borta OCH innehållet finns i basen", () => {
    expect(classifyLocalBranch({ name: "fix/klar", ...merged }).action).toBe("delete");
  });

  it("behåller omergad branch även när remoten är borta", () => {
    const v = classifyLocalBranch({ ...merged, name: "fix/pagaende", mergedIntoBase: false });
    expect(v.action).toBe("keep");
    expect(v.reason).toContain("ingen exakt merge");
  });

  it("städar en squash-mergad branch endast med exakt GitHub-PR-head", () => {
    expect(
      classifyLocalBranch({
        ...merged,
        name: "fix/squash",
        mergedIntoBase: false,
        mergedByExactPr: true,
      }).action,
    ).toBe("delete");
  });

  it("behåller mergad branch vars remote fortfarande finns", () => {
    expect(classifyLocalBranch({ ...merged, name: "fix/kvar", upstreamGone: false }).action).toBe(
      "keep",
    );
  });

  it("rör aldrig utcheckad branch eller skyddat namn", () => {
    expect(classifyLocalBranch({ ...merged, name: "fix/nu", isCurrent: true }).action).toBe("keep");
    expect(classifyLocalBranch({ ...merged, name: "JAKOB_BRA_9999_INNNAN_MVP_BRA" }).action).toBe(
      "keep",
    );
  });
});

describe("classifyRemoteBranch", () => {
  it("flaggar gammal branch utan öppen PR", () => {
    const v = classifyRemoteBranch({
      name: "fix/gammal",
      ageDays: STALE_AFTER_DAYS + 1,
      hasOpenPr: false,
    });
    expect(v.flag).toBe("stale");
  });

  it("flaggar aldrig öppen PR, färsk branch eller skyddat namn", () => {
    expect(classifyRemoteBranch({ name: "fix/oppen", ageDays: 400, hasOpenPr: true }).flag).toBe(
      "keep",
    );
    expect(classifyRemoteBranch({ name: "fix/farsk", ageDays: 1, hasOpenPr: false }).flag).toBe(
      "keep",
    );
    expect(
      classifyRemoteBranch({ name: "BRA_19191919", ageDays: 400, hasOpenPr: false }).flag,
    ).toBe("keep");
  });
});

describe("isWorktreeDirty", () => {
  it("tolkar ett misslyckat git status som SMUTSIGT, inte rent", () => {
    // Inversionsfällan: `allowFail` ger null vid fel, och null får aldrig
    // betyda "inga ändringar". En worktree vi inte kan läsa är upptagen.
    expect(isWorktreeDirty(null)).toBe(true);
  });

  it("tom utdata är rent, innehåll är smutsigt", () => {
    expect(isWorktreeDirty("")).toBe(false);
    expect(isWorktreeDirty("   \n ")).toBe(false);
    expect(isWorktreeDirty(" M src/a.ts")).toBe(true);
    expect(isWorktreeDirty("?? nytt.txt")).toBe(true);
  });
});

describe("classifyWorktree", () => {
  const free = {
    branch: "fix/klar",
    hasOpenPr: false,
    isDirty: false,
    mergedIntoBase: true,
    isMain: false,
  };

  it("frikallar bara en worktree där alla tre villkor är uppfyllda", () => {
    expect(classifyWorktree(free).verdict).toBe("free");
  });

  it("skyddar en annan agents pågående arbete", () => {
    // Öppen PR = någon arbetar. Detta är hålet `worktree:remove` inte täcker,
    // eftersom den bara ser smutsigt/ospårat innehåll.
    const openPr = classifyWorktree({ ...free, hasOpenPr: true });
    expect(openPr.verdict).toBe("keep");
    expect(openPr.reason).toContain("ÖPPEN PR");

    expect(classifyWorktree({ ...free, isDirty: true }).verdict).toBe("keep");
    expect(classifyWorktree({ ...free, mergedIntoBase: false }).verdict).toBe("keep");
  });

  it("rör aldrig huvudcheckouten eller ett skyddat branchnamn", () => {
    expect(classifyWorktree({ ...free, isMain: true }).verdict).toBe("keep");
    expect(classifyWorktree({ ...free, branch: "JAKOB_BRA_9999_INNNAN_MVP_BRA" }).verdict).toBe(
      "keep",
    );
  });

  it("håller en sajtmaskin.protectedWorktree som behåll även när den annars vore FRI", () => {
    const protectedWt = classifyWorktree({ ...free, isProtected: true });
    expect(protectedWt.verdict).toBe("keep");
    expect(protectedWt.reason).toContain("protectedWorktree");
  });

  it("behåller en detached worktree som inte är mergad", () => {
    expect(classifyWorktree({ ...free, branch: null, mergedIntoBase: false }).verdict).toBe("keep");
  });

  it("frikallar en ren squash-mergad worktree med exakt PR-bevis", () => {
    expect(
      classifyWorktree({ ...free, mergedIntoBase: false, mergedByExactPr: true }).verdict,
    ).toBe("free");
  });
});

describe("PR lifecycle proof", () => {
  const sha = "a".repeat(40);
  const lifecycle = parsePrLifecycle([
    { headRefName: "fix/open", headRefOid: "b".repeat(40), state: "OPEN", mergedAt: null },
    { headRefName: "fix/squash", headRefOid: sha, state: "MERGED", mergedAt: "2026-08-24" },
    { headRefName: "fix/closed", headRefOid: "c".repeat(40), state: "CLOSED", mergedAt: null },
  ]);

  it("binder mergebevis till både branch och exakt head-SHA", () => {
    expect(lifecycle.openHeads.has("fix/open")).toBe(true);
    expect(isExactMergedPr(lifecycle, "fix/squash", sha)).toBe(true);
    expect(isExactMergedPr(lifecycle, "fix/squash", "d".repeat(40))).toBe(false);
    expect(isExactMergedPr(lifecycle, "fix/closed", "c".repeat(40))).toBe(false);
    expect(isExactMergedPr(null, "fix/squash", sha)).toBe(false);
  });

  it("avvisar trasig lifecycle-data i stället för att tolka den som tom", () => {
    expect(() => parsePrLifecycle({})).toThrow("must be an array");
  });

  it("hämtar samtliga API-sidor utan en hårdkodad resultatgräns", () => {
    expect(PR_LIFECYCLE_API_ARGS).toContain("--paginate");
    expect(PR_LIFECYCLE_API_ARGS).toContain("repos/{owner}/{repo}/pulls?state=all&per_page=100");
    expect(PR_LIFECYCLE_API_ARGS).not.toContain("--limit");
    expect(PR_LIFECYCLE_API_ARGS).not.toContain("500");

    const tsv = Array.from(
      { length: 750 },
      (_, index) => `fix/open-${index}\t${"b".repeat(40)}\topen\t`,
    ).join("\n");
    expect(parsePrLifecycleTsv(tsv).openHeads.size).toBe(750);
  });

  it("binder API:ts mergebevis till exakt branch och head-SHA", () => {
    const apiLifecycle = parsePrLifecycleTsv(
      [
        `fix/open\t${"b".repeat(40)}\topen\t`,
        `fix/squash\t${sha}\tclosed\t2026-08-24T10:00:00Z`,
        `fix/closed\t${"c".repeat(40)}\tclosed\t`,
      ].join("\n"),
    );
    expect(apiLifecycle.openHeads.has("fix/open")).toBe(true);
    expect(isExactMergedPr(apiLifecycle, "fix/squash", sha)).toBe(true);
    expect(isExactMergedPr(apiLifecycle, "fix/squash", "d".repeat(40))).toBe(false);
    expect(isExactMergedPr(apiLifecycle, "fix/closed", "c".repeat(40))).toBe(false);
  });

  it("faller stängt på en trunkerad eller ogiltig API-rad", () => {
    expect(() => parsePrLifecycleTsv(`fix/open\t${"b".repeat(40)}\topen`)).toThrow("four fields");
    expect(() => parsePrLifecycleTsv(`fix/open\tbad-sha\topen\t`)).toThrow("invalid head");
    expect(() => parsePrLifecycleTsv(`fix/open\t${"b".repeat(40)}\tunknown\t`)).toThrow(
      "invalid state",
    );
  });
});

describe("parsePorcelainWorktrees", () => {
  it("läser sökväg och branch, och lämnar detached som null", () => {
    const lines = [
      "worktree C:/repo",
      "HEAD abc",
      "branch refs/heads/master",
      "",
      "worktree C:/repo-review",
      "HEAD def",
      "detached",
    ];
    expect(parsePorcelainWorktrees(lines)).toEqual([
      { path: "C:/repo", branch: "master" },
      { path: "C:/repo-review", branch: null },
    ]);
  });

  it("behandlar första posten som huvudträdet", () => {
    const wts = parsePorcelainWorktrees(["worktree /a", "branch refs/heads/master", "worktree /b"]);
    expect(wts[0].path).toBe("/a");
  });
});

describe("dedupeVercelIgnoreLines", () => {
  it("behåller första förekomsten och tar bort CLI:ns kopior", () => {
    const input = ["# env", ".env*", "", "src/", "", ".env*", "", ".env*", ""].join("\n");
    const { content, removed } = dedupeVercelIgnoreLines(input);
    expect(removed).toEqual([".env*", ".env*"]);
    expect(content.split("\n").filter((l) => l === ".env*")).toHaveLength(1);
    expect(content).toContain("# env");
    expect(content).toContain("src/");
  });

  it("rör inte en fil utan dubbletter", () => {
    const input = ["# env", ".env*", ".vercel", "src/", ""].join("\n");
    const { content, removed } = dedupeVercelIgnoreLines(input);
    expect(removed).toEqual([]);
    expect(content).toBe(input);
  });

  it("rör aldrig rader som bara liknar mönstren", () => {
    const input = ["  .env*", ".env*.local", ".env.*", ".vercel/", "!.env*", ""].join("\n");
    const { content, removed } = dedupeVercelIgnoreLines(input);
    expect(removed).toEqual([]);
    expect(content).toBe(input);
  });

  it("normaliserar CRLF till LF och avslutar alltid med radbrytning", () => {
    // Vercel-CLI:n skriver CRLF på Windows, men `.gitattributes` kräver LF.
    const { content } = dedupeVercelIgnoreLines(".env*\r\n\r\n.env*\r\n");
    expect(content).toBe(".env*\n");
  });
});

describe("isNextCacheStale", () => {
  it("är förlegad när cachen är äldre än HEAD", () => {
    expect(isNextCacheStale({ cacheMtimeMs: 1_000, headCommitMs: 2_000 })).toBe(true);
  });

  it("är aktuell när cachen är nyare, och saknad cache räknas inte som förlegad", () => {
    expect(isNextCacheStale({ cacheMtimeMs: 3_000, headCommitMs: 2_000 })).toBe(false);
    expect(isNextCacheStale({ cacheMtimeMs: null, headCommitMs: 2_000 })).toBe(false);
  });
});
