import { describe, expect, it } from "vitest";

import {
  STALE_AFTER_DAYS,
  classifyLocalBranch,
  classifyRemoteBranch,
  dedupeVercelIgnoreLines,
  isNextCacheStale,
  isProtectedBranch,
} from "./tidy.mjs";

/**
 * Kontraktet som gör `tidy` ofarlig. Varje rad här motsvarar ett sätt att av
 * misstag radera arbete, så en regel som glider ska falla här och inte i ett
 * git-repo någon förlorat en branch i.
 */
describe("isProtectedBranch", () => {
  it("skyddar ägarens backuper och botens brancher", () => {
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
    expect(v.reason).toContain("omergad");
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
