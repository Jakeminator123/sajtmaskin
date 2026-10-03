import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGitNameStatus } from "./path-impact.mjs";
import {
  PRODUCTION_BRANCH,
  STAGING_BRANCH,
  buildPromoteBody,
  buildPromoteBranchName,
  buildPromoteTitle,
  commitRangeStart,
  evaluatePromotePlan,
  findManualMergePaths,
  hasContentToPromote,
  manualMergePrefixesFromPolicy,
  missingProductionSyncMessage,
  parseCommitLines,
  parsePromoteArgs,
  parseRemoteBranchNames,
  selectPromoteHighlights,
} from "./promote.mjs";
import { assertFreshVerificationBase, resolveVerificationBase } from "./verify-pr.mjs";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeCommit(cwd: string, file: string, contents: string, message: string) {
  writeFileSync(join(cwd, file), contents);
  git(cwd, ["add", file]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function planFromRefs(cwd: string, productionRef: string, stagingRef: string) {
  const rangeStart = commitRangeStart(null, productionRef);
  const commits = parseCommitLines(
    git(cwd, ["log", "--oneline", "--no-decorate", `${rangeStart}..${stagingRef}`]),
  );
  return evaluatePromotePlan({
    productionSha: git(cwd, ["rev-parse", productionRef]),
    stagingSha: git(cwd, ["rev-parse", stagingRef]),
    productionTree: git(cwd, ["rev-parse", `${productionRef}^{tree}`]),
    stagingTree: git(cwd, ["rev-parse", `${stagingRef}^{tree}`]),
    commits,
  });
}

/** Isolerat repo med master + preview, utan remote. */
function seedPromoteRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "promote-plan-"));
  git(cwd, ["init", "-b", "master"]);
  git(cwd, ["config", "user.name", "Promote Test"]);
  git(cwd, ["config", "user.email", "promote-test@example.com"]);
  writeCommit(cwd, "base.txt", "base\n", "base");
  git(cwd, ["branch", "preview"]);
  return cwd;
}

describe("promote-flödets riktning", () => {
  it("promoterar från staging till produktion, aldrig tvärtom", () => {
    expect(STAGING_BRANCH).toBe("preview");
    expect(PRODUCTION_BRANCH).toBe("master");
  });
});

describe("parsePromoteArgs", () => {
  it("defaultar till en riktig körning utan datumöverstyrning", () => {
    expect(parsePromoteArgs([])).toEqual({ dryRun: false, date: null, draft: false });
  });

  it("läser flaggorna", () => {
    expect(parsePromoteArgs(["--dry-run", "--draft", "--date", "2026-09-08"])).toEqual({
      dryRun: true,
      draft: true,
      date: "2026-09-08",
    });
  });

  it("kastar på okänt argument i stället för att tyst ignorera det", () => {
    expect(() => parsePromoteArgs(["--merge"])).toThrow(/okänt argument/);
  });
});

describe("buildPromoteBranchName", () => {
  // Kärnan i fixen efter 2026-09-08: promote-PR:en får ALDRIG ha `preview` som
  // head-gren, eftersom repots delete_branch_on_merge då raderar staging.
  it("skapar en slaskgren och aldrig staging-grenen själv", () => {
    const branch = buildPromoteBranchName("2026-09-08");
    expect(branch).toBe("promote/2026-09-08");
    expect(branch).not.toBe(STAGING_BRANCH);
  });

  it("undviker kollision när dagens gren redan finns kvar", () => {
    expect(buildPromoteBranchName("2026-09-08", ["promote/2026-09-08"])).toBe(
      "promote/2026-09-08-2",
    );
    expect(
      buildPromoteBranchName("2026-09-08", ["promote/2026-09-08", "promote/2026-09-08-2"]),
    ).toBe("promote/2026-09-08-3");
  });
});

describe("parseRemoteBranchNames", () => {
  // Bugbot på #1301: kollisionskontrollen läste tidigare lokala
  // refs/remotes/origin/promote/*, som aldrig hämtas — en promote-gren från en
  // tidigare körning var osynlig och refs-API:t svarade "Reference already
  // exists". Listan måste komma från remoten.
  it("plockar grennamnen ur git ls-remote --heads", () => {
    const stdout = [
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/heads/promote/2026-09-08",
      "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3\trefs/heads/promote/2026-09-08-2",
    ].join("\n");
    expect(parseRemoteBranchNames(stdout)).toEqual(["promote/2026-09-08", "promote/2026-09-08-2"]);
  });

  it("ger tom lista när remoten inte har någon promote-gren", () => {
    expect(parseRemoteBranchNames("")).toEqual([]);
    expect(parseRemoteBranchNames(null)).toEqual([]);
  });

  it("hänger ihop med namngivningen: en befintlig fjärrgren ger nytt namn", () => {
    const existing = parseRemoteBranchNames(
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/heads/promote/2026-09-08",
    );
    expect(buildPromoteBranchName("2026-09-08", existing)).toBe("promote/2026-09-08-2");
  });
});

describe("manualMergePrefixesFromPolicy", () => {
  // Cursor-review på #1305: förvarningen måste läsa samma policy som
  // controllern — masters — inte checkoutens. Samma fallback som
  // trusted-review-window.mjs när nyckeln saknas; trasig lista ska kasta,
  // inte tyst bli tom (då försvinner varningen).
  it("läser prefixlistan ur policy-JSON", () => {
    expect(
      manualMergePrefixesFromPolicy(
        JSON.stringify({ manualMergePathPrefixes: [".github/workflows/", "scripts/ci/"] }),
      ),
    ).toEqual([".github/workflows/", "scripts/ci/"]);
  });

  it("faller tillbaka på controllerns default när nyckeln saknas", () => {
    expect(manualMergePrefixesFromPolicy(JSON.stringify({ trunk: "master" }))).toEqual([
      ".github/workflows/",
    ]);
  });

  it("kastar på trasig lista i stället för att tyst tömma varningen", () => {
    expect(() =>
      manualMergePrefixesFromPolicy(JSON.stringify({ manualMergePathPrefixes: "scripts/ci/" })),
    ).toThrow(/stränglista/);
    expect(() => manualMergePrefixesFromPolicy("")).toThrow();
  });

  it("hänger ihop med den fail-closed name-status-parsern från verify:pr", () => {
    // Rename ger båda namnen; controllern läser previous_filename.
    const paths = parseGitNameStatus(
      ["M\0src/app.ts", "R100\0scripts/ci/old.mjs\0scripts/other/new.mjs", ""].join("\0"),
    );
    expect(findManualMergePaths(paths, [".github/workflows/", "scripts/ci/"])).toEqual([
      "scripts/ci/old.mjs",
    ]);
  });
});

describe("findManualMergePaths", () => {
  it("hittar sökvägar som börjar med ett prefix", () => {
    expect(
      findManualMergePaths(["src/app.ts", ".github/workflows/ci.yml"], [".github/workflows/"]),
    ).toEqual([".github/workflows/ci.yml"]);
  });

  it("ger tom lista utan träff", () => {
    expect(findManualMergePaths(["src/app.ts"], [".github/workflows/"])).toEqual([]);
  });

  it("deduplicerar och sorterar", () => {
    expect(
      findManualMergePaths(
        ["config/agent-workflow.json", ".github/workflows/ci.yml", "config/agent-workflow.json"],
        ["config/agent-workflow.json", ".github/workflows/"],
      ),
    ).toEqual([".github/workflows/ci.yml", "config/agent-workflow.json"]);
  });

  it("matchar exakt fil-prefix och katalogprefix", () => {
    expect(
      findManualMergePaths(
        ["config/agent-workflow.json", "config/other.json"],
        ["config/agent-workflow.json"],
      ),
    ).toEqual(["config/agent-workflow.json"]);
    expect(
      findManualMergePaths(
        [".github/workflows/ci.yml", ".github/CODEOWNERS"],
        [".github/workflows/"],
      ),
    ).toEqual([".github/workflows/ci.yml"]);
  });

  it("klassar den riktiga policyns agent-workflow.json som träff", () => {
    const prefixes = manualMergePrefixesFromPolicy(
      readFileSync(resolve(process.cwd(), "config/agent-workflow.json"), "utf8"),
    );
    expect(findManualMergePaths(["config/agent-workflow.json", "README.md"], prefixes)).toEqual([
      "config/agent-workflow.json",
    ]);
  });
});

describe("parseCommitLines", () => {
  it("plockar sha och rubrik ur git log --oneline", () => {
    expect(
      parseCommitLines("6c1022e5a Builder-feedback\nc27f22d18 docs(decisions): preview"),
    ).toEqual([
      { sha: "6c1022e5a", subject: "Builder-feedback" },
      { sha: "c27f22d18", subject: "docs(decisions): preview" },
    ]);
  });

  it("tål tom och skräpig input utan att kasta", () => {
    expect(parseCommitLines("")).toEqual([]);
    expect(parseCommitLines(null)).toEqual([]);
    expect(parseCommitLines("inte en commitrad")).toEqual([]);
  });
});

describe("selectPromoteHighlights", () => {
  it("filtrerar bort merge-commits — de beskriver hur, inte vad", () => {
    const commits = parseCommitLines(
      [
        "aaaaaaa Merge branch 'origin/preview' into fix/x",
        "bbbbbbb fix(ci): kör CI även för PR:ar mot preview",
        "ccccccc Merge pull request #1 from x",
      ].join("\n"),
    );
    expect(selectPromoteHighlights(commits).map((c: { sha: string }) => c.sha)).toEqual([
      "bbbbbbb",
    ]);
  });
});

describe("commitRangeStart", () => {
  it("börjar alltid vid production — synk-mergen är ingen säker cutoff", () => {
    expect(commitRangeStart("abc123", "origin/master")).toBe("origin/master");
    expect(commitRangeStart(null, "origin/master")).toBe("origin/master");
    expect(commitRangeStart("", "refs/heads/master")).toBe("refs/heads/master");
  });
});

describe("hasContentToPromote", () => {
  const onlySync = parseCommitLines("aaaaaaa Merge branch 'master' into preview");
  const real = parseCommitLines("aaaaaaa sync: master → preview\nbbbbbbb fix: riktig ändring");

  it("släpper inte när träden är identiska, oavsett commits", () => {
    expect(hasContentToPromote(onlySync, false)).toBe(false);
    expect(hasContentToPromote(real, false)).toBe(false);
  });

  it("släpper när trädet skiljer sig även om commitlistan efter synk är tom", () => {
    expect(hasContentToPromote([], true)).toBe(true);
    expect(hasContentToPromote(onlySync, true)).toBe(true);
    expect(hasContentToPromote(real, true)).toBe(true);
  });
});

describe("missingProductionSyncMessage", () => {
  it("pekar på egen merge-commit-PR och förbjuder serverside synk", () => {
    const message = missingProductionSyncMessage({
      productionBranch: "master",
      stagingBranch: "preview",
      baseSha: "abcdef12deadbeef",
    });
    expect(message).toContain("saknar origin/master (abcdef12)");
    expect(message).toMatch(/MERGE-commit/i);
    expect(message).toMatch(/inte squash/i);
    expect(message).toMatch(/synkar inte/i);
      expect(message).toContain("synkbranch från färsk origin/preview");
  });
});

describe("verify:pr bas och ancestry i ett tillfälligt git-repo", () => {
  it("stoppar rå master men godkänner en preview-baserad synk som innehåller båda tips", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      writeCommit(cwd, "preview-only.txt", "staging\n", "feat: preview-only");
      git(cwd, ["update-ref", "refs/remotes/origin/preview", "preview"]);
      git(cwd, ["checkout", "master"]);
      writeCommit(cwd, "hotfix.txt", "production\n", "fix: production-only");
      const gitCommand = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });
      const policy = { trunk: "master" };
      const branch = git(cwd, ["branch", "--show-current"]);
      const base = resolveVerificationBase({ explicitBase: null, branch, policy });
      expect(base).toBe("origin/preview");
      expect(() => assertFreshVerificationBase({ branch, base }, gitCommand)).toThrow(
        "master innehåller inte färsk origin/preview",
      );

      git(cwd, ["checkout", "-b", "sync-from-preview", "origin/preview"]);
      git(cwd, ["merge", "master", "-m", "sync: master into preview"]);
      expect(() =>
        assertFreshVerificationBase({ branch: "sync-from-preview", base }, gitCommand),
      ).not.toThrow();
      expect(git(cwd, ["merge-base", "--is-ancestor", "master", "HEAD"])).toBe("");
      expect(parseGitNameStatus(git(cwd, ["diff", "--name-status", "-z", base]))).toEqual([
        "hotfix.txt",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("evaluatePromotePlan i tillfälliga git-repon", () => {
  it("hittar osläppt C efter selektiv release av B + synk-merge", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      const bSha = writeCommit(cwd, "b.txt", "B\n", "feat: B");
      writeCommit(cwd, "c.txt", "C\n", "feat: C");

      // Selektiv release: bara B landar på master (cherry-pick), inte hela tippen.
      git(cwd, ["checkout", "master"]);
      git(cwd, ["cherry-pick", bSha]);

      git(cwd, ["checkout", "preview"]);
      git(cwd, ["merge", "master", "-m", "sync: master → preview"]);

      // Buggen: range från synk-mergen ger 0 commits → gammalt hasContent sa nej.
      const syncMerge = git(cwd, ["rev-parse", "HEAD"]);
      const postSyncCommits = parseCommitLines(
        git(cwd, ["log", "--oneline", "--no-decorate", `${syncMerge}..preview`]),
      );
      expect(postSyncCommits).toEqual([]);

      const plan = planFromRefs(cwd, "master", "preview");
      expect(plan.treeDiffers).toBe(true);
      expect(plan.shouldPromote).toBe(true);
      expect(plan.commits.some((c) => c.subject.includes("feat: C"))).toBe(true);
      const changedPaths = parseGitNameStatus(
        git(cwd, ["diff", "--name-status", "-z", "-M", "master", "preview"]),
      );
      const body = buildPromoteBody({
        changedPaths,
        baseSha: git(cwd, ["rev-parse", "master"]),
        headSha: git(cwd, ["rev-parse", "preview"]),
        branch: "promote/test",
        date: "2026-09-08",
      });
      expect(body).toContain("`c.txt`");
      expect(body).not.toContain("`b.txt`");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("säger inget att promota efter squash-release med identiska träd + synk", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      writeCommit(cwd, "feat.txt", "feature\n", "feat: landar på preview");

      // Squash-liknande: master får samma träd i en ny commit utan previews SHA.
      const tree = git(cwd, ["rev-parse", "preview^{tree}"]);
      git(cwd, ["checkout", "master"]);
      const squashSha = git(cwd, ["commit-tree", tree, "-p", "HEAD", "-m", "promote: squash"]);
      git(cwd, ["reset", "--hard", squashSha]);

      git(cwd, ["checkout", "preview"]);
      git(cwd, ["merge", "master", "-m", "sync: master → preview"]);

      const plan = planFromRefs(cwd, "master", "preview");
      expect(plan.treeDiffers).toBe(false);
      expect(plan.shouldPromote).toBe(false);

      writeCommit(cwd, "new.txt", "new work\n", "feat: new work after squash");
      const changedPaths = parseGitNameStatus(
        git(cwd, ["diff", "--name-status", "-z", "-M", "master", "preview"]),
      );
      expect(changedPaths).toEqual(["new.txt"]);
      const body = buildPromoteBody({
        changedPaths,
        baseSha: git(cwd, ["rev-parse", "master"]),
        headSha: git(cwd, ["rev-parse", "preview"]),
        branch: "promote/test",
        date: "2026-09-08",
      });
      expect(body).toContain("`new.txt`");
      expect(body).not.toContain("`feat.txt`");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("hittar fortfarande osläppt preview-arbete efter hotfix på master + synk", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      writeCommit(cwd, "preview-only.txt", "staging\n", "feat: preview-only");

      git(cwd, ["checkout", "master"]);
      writeCommit(cwd, "hotfix.txt", "prod fix\n", "fix: hotfix on master");

      git(cwd, ["checkout", "preview"]);
      git(cwd, ["merge", "master", "-m", "sync: master → preview"]);

      const plan = planFromRefs(cwd, "master", "preview");
      expect(plan.treeDiffers).toBe(true);
      expect(plan.shouldPromote).toBe(true);
      expect(plan.commits.some((c) => c.subject.includes("preview-only"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("säger inget att promota när tipparna är samma", () => {
    const cwd = seedPromoteRepo();
    try {
      const plan = planFromRefs(cwd, "master", "preview");
      expect(plan.sameTip).toBe(true);
      expect(plan.shouldPromote).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("säger inget att promota när träden är identiska trots divergens", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      writeCommit(cwd, "same.txt", "x\n", "preview touch");
      git(cwd, ["checkout", "master"]);
      writeCommit(cwd, "same.txt", "x\n", "master touch");

      const plan = planFromRefs(cwd, "master", "preview");
      expect(plan.sameTip).toBe(false);
      expect(plan.treeDiffers).toBe(false);
      expect(plan.shouldPromote).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("räknar nya preview-commits som tillkommer under releaseförberedelsen", () => {
    const cwd = seedPromoteRepo();
    try {
      git(cwd, ["checkout", "preview"]);
      writeCommit(cwd, "a.txt", "A\n", "feat: A");
      const mid = planFromRefs(cwd, "master", "preview");
      expect(mid.shouldPromote).toBe(true);

      writeCommit(cwd, "extra.txt", "extra\n", "feat: under förberedelse");
      const later = planFromRefs(cwd, "master", "preview");
      expect(later.shouldPromote).toBe(true);
      expect(later.commits.some((c) => c.subject.includes("under förberedelse"))).toBe(true);
      expect(later.commits.length).toBeGreaterThan(mid.commits.length);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("buildPromoteTitle", () => {
  it("beskriver faktisk träddiff i stället för squashad commithistorik", () => {
    expect(buildPromoteTitle(["src/new.ts"], "2026-09-08")).toBe(
      "promote: 1 ändrad sökväg från preview till master (2026-09-08)",
    );
  });

  it("räknar ändringarna när de är flera", () => {
    expect(buildPromoteTitle(["a.txt", "b.txt", "c.txt"], "2026-09-08")).toBe(
      "promote: 3 ändrade sökvägar från preview till master (2026-09-08)",
    );
  });
});

describe("buildPromoteBody", () => {
  const changedPaths = ["c.txt", "src/new.ts"];
  const body = buildPromoteBody({
    changedPaths,
    baseSha: "95b8f29bbcd36a8c66b9d3aed751d5cb48c1d55a",
    headSha: "6c1022e5a5262d6f0967aa87cd0b82a062d6b80e",
    branch: "promote/2026-09-08",
    date: "2026-09-08",
  });

  it("listar endast faktiskt ändrade sökvägar", () => {
    expect(body).toContain("`c.txt`");
    expect(body).toContain("`src/new.ts`");
    expect(body).not.toContain("aaaaaaa1");
    expect(body).toContain("Faktisk diff mot produktion");
  });

  it("bär båda SHA:na som mergegrinden behöver", () => {
    expect(body).toContain("95b8f29bbcd36a8c66b9d3aed751d5cb48c1d55a");
    expect(body).toContain("6c1022e5a5262d6f0967aa87cd0b82a062d6b80e");
  });

  it("varnar för produktion och pekar på mergegrinden", () => {
    expect(body).toContain("sajtmaskin.se");
    expect(body).toContain(".cursor/rules/pr-merge.mdc");
  });

  it("förklarar varför head är en slaskgren och inte preview", () => {
    expect(body).toContain("promote/2026-09-08");
    expect(body).toContain("auto-delete");
  });

  it("lämnar verifieringsrutorna OCH bocken för produktion omarkerade", () => {
    // Promote-PR:en får aldrig födas med ifyllda bockar — checkarna körs på
    // promote-headen, inte på del-PR:arna mot preview.
    expect(body).not.toContain("- [x]");
    expect(body).toContain("- [ ] P0/P1 = 0");
  });

  it("begränsar fillistan utan att tappa totala diffstorleken", () => {
    const manyPaths = Array.from({ length: 101 }, (_, i) => `src/change-${i}.ts`);
    const largeBody = buildPromoteBody({
      changedPaths: manyPaths,
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      branch: "promote/test",
      date: "2026-09-08",
    });
    expect(largeBody).toContain("101 ändrade sökvägar");
    expect(largeBody).toContain("`src/change-99.ts`");
    expect(largeBody).not.toContain("`src/change-100.ts`");
    expect(largeBody).toContain("1 ytterligare sökvägar");
    expect(largeBody.length).toBeLessThan(65_536);
  });

  it("utelämnar bootstrap-sektionen när inga trust-root-träffar finns", () => {
    expect(body).not.toContain("## Bootstrap-godkännande krävs");
    expect(body).toContain("Manuell merge kräver uttrycklig ägarbekräftelse");
    expect(body).toContain("Alla PR-merges utförs manuellt med expected head");
  });

  it("lägger till omarkerad bootstrap-sektion när trust-root-träffar finns", () => {
    const withHits = buildPromoteBody({
      changedPaths,
      baseSha: "95b8f29bbcd36a8c66b9d3aed751d5cb48c1d55a",
      headSha: "6c1022e5a5262d6f0967aa87cd0b82a062d6b80e",
      branch: "promote/2026-09-08",
      date: "2026-09-08",
      manualMergePaths: ["config/agent-workflow.json"],
    });
    expect(withHits).toContain("## Bootstrap-godkännande krävs");
    expect(withHits).toContain("`config/agent-workflow.json`");
    expect(withHits).toContain(
      "- [ ] Ägaren har uttryckligen godkänt infrastruktur-bootstrapen i chatten",
    );
    expect(withHits).not.toContain("- [x]");
  });
});
