import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGitNameStatus } from "./path-impact.mjs";
import {
  PRODUCTION_BRANCH,
  STAGING_BRANCH,
  buildPromoteBody,
  buildPromoteBranchName,
  buildPromoteTitle,
  findManualMergePaths,
  hasContentToPromote,
  manualMergePrefixesFromPolicy,
  parseCommitLines,
  parsePromoteArgs,
  parseRemoteBranchNames,
  selectPromoteHighlights,
} from "./promote.mjs";

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

describe("hasContentToPromote", () => {
  // Extern review 2026-09-08: squash-promote lämnar masters commit utanför
  // preview. Efter synk-mergen kan `master..preview` bestå av bara en
  // merge-commit med identiskt träd — det är inget släpp.
  const onlySync = parseCommitLines("aaaaaaa Merge branch 'master' into preview");
  const real = parseCommitLines("aaaaaaa sync: master → preview\nbbbbbbb fix: riktig ändring");

  it("släpper inte när träden är identiska, oavsett commits", () => {
    expect(hasContentToPromote(onlySync, false)).toBe(false);
    expect(hasContentToPromote(real, false)).toBe(false);
  });

  it("släpper när preview ligger före och trädet skiljer sig", () => {
    expect(hasContentToPromote(real, true)).toBe(true);
    expect(hasContentToPromote(onlySync, true)).toBe(true);
  });

  it("släpper inte när preview inte ligger före master alls", () => {
    expect(hasContentToPromote([], true)).toBe(false);
  });
});

describe("buildPromoteTitle", () => {
  it("använder commit-rubriken rakt av när det bara är en ändring", () => {
    const commits = parseCommitLines("bbbbbbb fix(ci): kör CI även för PR:ar mot preview");
    expect(buildPromoteTitle(commits, "2026-09-08")).toBe(
      "promote: fix(ci): kör CI även för PR:ar mot preview",
    );
  });

  it("räknar ändringarna när de är flera", () => {
    const commits = parseCommitLines("aaaaaaa ett\nbbbbbbb två\nccccccc tre");
    expect(buildPromoteTitle(commits, "2026-09-08")).toBe(
      "promote: 3 ändringar från preview till master (2026-09-08)",
    );
  });
});

describe("buildPromoteBody", () => {
  const commits = parseCommitLines(
    ["aaaaaaa1 fix(ci): trigga preview", "bbbbbbb2 Merge branch 'x'", "ccccccc3 chore: städ"].join(
      "\n",
    ),
  );
  const body = buildPromoteBody({
    commits,
    baseSha: "95b8f29bbcd36a8c66b9d3aed751d5cb48c1d55a",
    headSha: "6c1022e5a5262d6f0967aa87cd0b82a062d6b80e",
    branch: "promote/2026-09-08",
    date: "2026-09-08",
  });

  it("listar innehållet utan merge-commits", () => {
    expect(body).toContain("`aaaaaaa1` fix(ci): trigga preview");
    expect(body).toContain("`ccccccc3` chore: städ");
    expect(body).not.toContain("Merge branch");
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

  it("utelämnar bootstrap-sektionen när inga trust-root-träffar finns", () => {
    expect(body).not.toContain("## Bootstrap-godkännande krävs");
  });

  it("lägger till omarkerad bootstrap-sektion när trust-root-träffar finns", () => {
    const withHits = buildPromoteBody({
      commits,
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
