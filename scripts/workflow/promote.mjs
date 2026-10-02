#!/usr/bin/env node
/**
 * `npm run promote` — öppna promote-PR:en från staging (`preview`) till
 * produktion (`master`).
 *
 * Bakgrund: flödet har två steg. Allt arbete mergas till `preview`
 * (preview.sajtmaskin.se); produktion uppdateras genom en separat promote-PR.
 * Steg två var tidigare ett handgrepp med många moment att komma ihåg rätt, och
 * 2026-09-08 kostade det staging-grenen: promote-PR:en hade `preview` som
 * head-gren, och repots `delete_branch_on_merge` raderade den vid merge.
 *
 * Därför skapar kommandot en **kortlivad slaskgren** (`promote/<datum>`) vid
 * previews tip och öppnar PR:en från den. Auto-delete tar då slaskgrenen i
 * stället för staging, och `preview` kan aldrig försvinna av en promote igen.
 *
 * Grenen skapas direkt via GitHubs refs-API från `origin/preview`, så
 * kommandot rör aldrig din lokala checkout eller dina ostagade ändringar.
 *
 * Kommandot **mergar aldrig till master**. Det öppnar PR:en och skriver ut vad
 * som återstår; mergegrinden ägs av `.cursor/rules/pr-merge.mdc` och kräver
 * fortfarande gröna checks, review och din uttryckliga bekräftelse.
 *
 * Förvarning: rör diffen en CI-trust root (`manualMergePathPrefixes`) varnar
 * kommandot redan här — 2026-09-08 upptäcktes det först i review-window.
 *
 * Synk: controllern squash-mergar, så masters nya commit finns inte i preview
 * efteråt. Planering eller skapande av promote-PR synkar **inte** master →
 * preview via merges-API. Saknar preview masters tip: avbryt och öppna en egen
 * PR (merge-commit, inte squash). Osläppt innehåll avgörs av trädskillnad mot
 * master — inte av antagandet att allt före senaste synk-commit redan är släppt.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseGitNameStatus } from "./path-impact.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const STAGING_BRANCH = "preview";
export const PRODUCTION_BRANCH = "master";
export const PROMOTE_BRANCH_PREFIX = "promote/";

/** Commits vi aldrig listar som "innehåll" i promote-beskrivningen. */
const MERGE_COMMIT_RE = /^Merge (branch|pull request|remote-tracking)/i;

export function parsePromoteArgs(argv) {
  const options = { dryRun: false, date: null, draft: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--draft") options.draft = true;
    else if (arg === "--date") options.date = argv[++i] ?? null;
    else throw new Error(`okänt argument: ${arg}`);
  }
  return options;
}

/**
 * Slaskgrenens namn. Datumet gör den läsbar i PR-listan; suffixet gör en andra
 * promote samma dag möjlig utan kollision med en gren som redan finns kvar.
 */
export function buildPromoteBranchName(date, existingBranches = []) {
  const taken = new Set(existingBranches);
  const base = `${PROMOTE_BRANCH_PREFIX}${date}`;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`kunde inte hitta ett ledigt grennamn för ${base}`);
}

/**
 * `<sha>\trefs/heads/<namn>`-rader från `git ls-remote` → grennamn.
 *
 * Kollisionskontrollen måste fråga REMOTEN, inte lokala
 * `refs/remotes/origin/promote/*`: kommandot hämtar bara `master` och
 * `preview`, och `gh api` skapar ingen lokal tracking-ref för grenen den
 * lägger upp. En promote-gren från en tidigare körning — eller från ett omtag
 * efter att `gh pr create` fallerat — vore därför osynlig, och refs-API:t
 * skulle svara "Reference already exists".
 */
export function parseRemoteBranchNames(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /\srefs\/heads\/(.+)$/.exec(line);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);
}

/**
 * Prefixlistan controllern faktiskt använder. `review-window` kör
 * default-branch-kod och läser MASTERS policy, så förvarningen måste läsa
 * samma fil från `origin/master` — inte checkoutens (som kan vara preview
 * med en ännu inte promotad ändring). Samma fallback som controllern.
 */
export function manualMergePrefixesFromPolicy(policyJson) {
  const policy = JSON.parse(String(policyJson ?? ""));
  const prefixes = policy?.manualMergePathPrefixes;
  if (prefixes === undefined) return [".github/workflows/"];
  if (!Array.isArray(prefixes) || prefixes.some((prefix) => typeof prefix !== "string")) {
    throw new Error("manualMergePathPrefixes i origin/master-policyn är inte en stränglista");
  }
  return prefixes;
}

/** Sökvägar som börjar med något CI-trust-prefix; sorterade och unika. */
export function findManualMergePaths(paths, prefixes) {
  const prefixList = prefixes ?? [];
  return [
    ...new Set(
      (paths ?? [])
        .map((path) => String(path))
        .filter((path) => prefixList.some((prefix) => path.startsWith(prefix))),
    ),
  ].sort();
}

/** `<sha> <rubrik>`-rader från `git log --oneline` → strukturerade commits. */
export function parseCommitLines(stdout) {
  const commits = [];
  for (const raw of String(stdout ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([0-9a-f]{7,40})\s+(.*)$/i.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    commits.push({ sha: match[1], subject: match[2] });
  }
  return commits;
}

/** Merge-commits beskriver inte vad som ändras — bara hur det kom hit. */
export function selectPromoteHighlights(commits) {
  return commits.filter((commit) => !MERGE_COMMIT_RE.test(commit.subject));
}

/**
 * Finns det något att släppa? Trädskillnaden är sanningen. Selektiv release +
 * synk-merge kan lämna `sync..preview` tom medan preview fortfarande skiljer
 * sig från master (osläppt C). Tom commitlista får då inte dölja underlaget.
 */
export function hasContentToPromote(_commits, treeDiffers) {
  return Boolean(treeDiffers);
}

/**
 * Var planens historikmetadata börjar. Releasebeskrivningen använder träddiff.
 * Synk-mergen är inte en
 * säker cutoff: selektiv release kan lämna osläppt historik före den. Börja
 * alltid vid production så osläppta commits syns i underlaget; när träden är
 * identiska avbryter hasContentToPromote innan listan används.
 */
export function commitRangeStart(_syncMergeSha, productionRef) {
  return productionRef;
}

/**
 * Samla promote-underlag från redan upplösta SHA:n (för tester utan remote).
 * @param {{
 *   productionSha: string,
 *   stagingSha: string,
 *   productionTree: string,
 *   stagingTree: string,
 *   commits: Array<{ sha: string, subject: string }>,
 * }} input
 */
export function evaluatePromotePlan(input) {
  const treeDiffers = input.productionTree !== input.stagingTree;
  const sameTip = input.productionSha === input.stagingSha;
  return {
    sameTip,
    treeDiffers,
    shouldPromote: !sameTip && hasContentToPromote(input.commits, treeDiffers),
    commits: input.commits,
  };
}

/** Recept när staging saknar produktionens tip — ingen serverside merges-API. */
export function missingProductionSyncMessage({ productionBranch, stagingBranch, baseSha }) {
  const short = String(baseSha ?? "").slice(0, 8);
  return [
    `origin/${stagingBranch} saknar origin/${productionBranch} (${short}).`,
    `Bered en synkbranch från färsk origin/${stagingBranch} och ta in origin/${productionBranch} med merge-commit. Öppna PR mot ${stagingBranch} och merga med MERGE-commit (inte squash), kör sedan promote igen.`,
    "Planering eller skapande av release-PR synkar inte master → preview serverside.",
  ].join(" ");
}

export function buildPromoteTitle(changedPaths, date) {
  const count = new Set(changedPaths).size;
  return `promote: ${count} ändrad${count === 1 ? " sökväg" : "e sökvägar"} från preview till master (${date})`;
}

export function buildPromoteBody({
  changedPaths,
  baseSha,
  headSha,
  branch,
  date,
  manualMergePaths = /** @type {string[]} */ ([]),
}) {
  const paths = [...new Set(changedPaths)];
  const shown = paths.slice(0, 100);
  const list =
    paths.length > 0
      ? [
          ...shown.map((path) => `- \`${path}\``),
          ...(paths.length > shown.length
            ? [`- … ${paths.length - shown.length} ytterligare sökvägar; se hela diffen mellan ovanstående SHA:n.`]
            : []),
        ].join("\n")
      : "- (ingen träddiff)";

  const bootstrap =
    manualMergePaths.length > 0
      ? [
          "## Bootstrap-godkännande krävs",
          "",
          "Den vanliga review-window/merge:execute-controllern vägrar denna PR eftersom den rör CI-trust roots:",
          "",
          ...manualMergePaths.map((path) => `- \`${path}\``),
          "",
          "Kräver separat ägargodkännande i chatten, sedan dokumenterad expected-head-squash-merge enligt `docs/runbooks/agent-workflow.md`.",
          "",
          "- [ ] Ägaren har uttryckligen godkänt infrastruktur-bootstrapen i chatten",
          "",
        ]
      : [];

  return [
    "## Vad ändras?",
    "",
    `- Kort scope: ${paths.length} ändrade sökvägar i träddiffen från staging (\`${STAGING_BRANCH}\`) till produktion (\`${PRODUCTION_BRANCH}\`). Promote skriver ingen ny kod; innehållet tas från staging. Bekräfta att preview är stabil före release.`,
    `- Base-SHA: \`${baseSha}\` (\`origin/${PRODUCTION_BRANCH}\`)`,
    `- Head-SHA: \`${headSha}\` (\`origin/${STAGING_BRANCH}\` vid ${date})`,
    `- Promote-gren: \`${branch}\` — kortlivad slaskgren så att auto-delete vid merge tar den i stället för \`${STAGING_BRANCH}\`.`,
    "",
    "## Faktisk diff mot produktion",
    "",
    "Träd mot träd, inte commithistorik: redan squash-släppta commits räknas inte som nya ändringar. Vid rename ingår både gammal och ny sökväg.",
    "",
    list,
    "",
    ...bootstrap,
    "## Verifiering",
    "",
    `- [ ] Required GitHub-checks gröna på promote-headen (inte bara på del-PR:arna mot \`${STAGING_BRANCH}\`)`,
    "- [ ] Bugkoll på diffen mot produktion; alla fynd fixade, loggade eller avfärdade",
    "- [ ] P0/P1 = 0",
    "",
    "Körda riktade kontroller:",
    "",
    "-",
    "",
    "## Risk och återställning",
    "",
    "- Kvarvarande risk:",
    `- Återställning/rollback: revert av promote-commiten på \`${PRODUCTION_BRANCH}\`; \`${STAGING_BRANCH}\` behåller tippen.`,
    "",
    `> **Produktion:** denna PR går till \`${PRODUCTION_BRANCH}\` / sajtmaskin.se. Merga bara efter uttrycklig ägarbekräftelse i chatten, enligt \`.cursor/rules/pr-merge.mdc\`.`,
    "",
    "<!-- Skapad av `npm run promote`. -->",
  ].join("\n");
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function gh(args) {
  return execFileSync("gh", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

/** Innehåller den frysta staging-SHA:n redan produktionens frysta tip? */
function stagingContainsProduction(baseSha, headSha) {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", baseSha, headSha],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

function today() {
  // Lokalt datum, inte UTC: grennamnet läses av en människa i PR-listan.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function main() {
  const options = parsePromoteArgs(process.argv.slice(2));
  const date = options.date ?? today();

  git(["fetch", "origin", PRODUCTION_BRANCH, STAGING_BRANCH]);
  const baseSha = git(["rev-parse", `origin/${PRODUCTION_BRANCH}`]);
  const headSha = git(["rev-parse", `origin/${STAGING_BRANCH}`]);

  if (baseSha === headSha) {
    console.log(
      `[promote] inget att promota — origin/${STAGING_BRANCH} och origin/${PRODUCTION_BRANCH} pekar båda på ${headSha.slice(0, 8)}.`,
    );
    return;
  }

  // Squash-merge lämnar masters tip utanför preview. Promote skapar eller
  // planerar aldrig den synken — det måste vara en uttrycklig merge-commit-PR.
  if (!stagingContainsProduction(baseSha, headSha)) {
    const message = missingProductionSyncMessage({
      productionBranch: PRODUCTION_BRANCH,
      stagingBranch: STAGING_BRANCH,
      baseSha,
    });
    if (options.dryRun) {
      console.log(`[promote] --dry-run: ${message}`);
      return;
    }
    throw new Error(message);
  }

  // Trädskillnad avgör release. Historiken är bara planmetadata, inte en lista
  // över nya ändringar: tidigare squash-släppta commits kan fortfarande finnas där.
  const rangeStart = commitRangeStart(null, baseSha);
  const commits = parseCommitLines(
    git(["log", "--oneline", "--no-decorate", `${rangeStart}..${headSha}`]),
  );
  const productionTree = git(["rev-parse", `${baseSha}^{tree}`]);
  const stagingTree = git(["rev-parse", `${headSha}^{tree}`]);
  const plan = evaluatePromotePlan({
    productionSha: baseSha,
    stagingSha: headSha,
    productionTree,
    stagingTree,
    commits,
  });
  if (!plan.shouldPromote) {
    console.log(
      `[promote] inget att promota — origin/${STAGING_BRANCH} har inget innehåll utöver origin/${PRODUCTION_BRANCH}.`,
    );
    return;
  }

  // Auktoritativ lista direkt från remoten; kastar hellre än gissar tomt, så en
  // nätverksmiss aldrig kan maskera en befintlig gren och ge en krock.
  const existing = parseRemoteBranchNames(
    git(["ls-remote", "--heads", "origin", `${PROMOTE_BRANCH_PREFIX}*`]),
  );
  const branch = buildPromoteBranchName(date, existing);
  // Samma fail-closed parser som verify:pr (`-z`, kastar på trasig post) och
  // både gammalt och nytt namn vid rename — controllern läser previous_filename.
  // Två punkter (träd mot träd), inte tre: efter en squash-promote ligger
  // merge-basen före den släppta koden och tre punkter skulle räkna redan
  // släppta trust roots igen.
  const changedPaths = parseGitNameStatus(
    git([
      "diff",
      "--name-status",
      "-z",
      "-M",
      baseSha,
      headSha,
    ]),
  );
  const prefixes = manualMergePrefixesFromPolicy(
    git(["show", `${baseSha}:config/agent-workflow.json`]),
  );
  const manualMergePaths = findManualMergePaths(changedPaths, prefixes);
  const title = buildPromoteTitle(changedPaths, date);
  const body = buildPromoteBody({ changedPaths, baseSha, headSha, branch, date, manualMergePaths });
  console.log(
    `[promote] ${new Set(changedPaths).size} ändrade sökvägar från ${STAGING_BRANCH} → ${PRODUCTION_BRANCH}`,
  );

  if (manualMergePaths.length > 0) {
    console.log("");
    console.log(
      "⚠ Denna promote rör CI-trust roots och kräver ditt bootstrap-godkännande (review-window/merge:execute vägrar):",
    );
    for (const path of manualMergePaths) {
      console.log(`  ${path}`);
    }
    console.log(
      "Separat ägargodkännande i chatten, sedan dokumenterad expected-head-squash-merge enligt docs/runbooks/agent-workflow.md.",
    );
  }

  if (options.dryRun) {
    console.log(`\n[promote] --dry-run: skulle skapa grenen ${branch} vid ${headSha.slice(0, 8)}`);
    console.log(
      `[promote] --dry-run: skulle öppna PR "${title}" (${STAGING_BRANCH} → ${PRODUCTION_BRANCH})`,
    );
    return;
  }

  // Grenen skapas serverside från previews exakta tip — din lokala checkout
  // och dina ostagade ändringar rörs aldrig.
  gh([
    "api",
    "-X",
    "POST",
    "repos/{owner}/{repo}/git/refs",
    "-f",
    `ref=refs/heads/${branch}`,
    "-f",
    `sha=${headSha}`,
    "--jq",
    ".ref",
  ]);
  console.log(`[promote] skapade ${branch} vid ${headSha.slice(0, 8)}`);

  const prArgs = [
    "pr",
    "create",
    "--base",
    PRODUCTION_BRANCH,
    "--head",
    branch,
    "--title",
    title,
    "--body",
    body,
  ];
  if (options.draft) prArgs.push("--draft");
  const prUrl = gh(prArgs);

  console.log("");
  console.log(`[promote] PR öppnad: ${prUrl}`);
  console.log("");
  console.log("  ⚠ PRODUKTION: den här PR:en går till master / sajtmaskin.se.");
  console.log("");
  console.log("  Kvar innan merge:");
  console.log("   1. Invänta gröna required checks på promote-headen.");
  console.log("   2. Kör en bugkoll på diffen mot produktion och triagera fynden.");
  console.log("   3. Posta merge:ready-kommentaren, sätt sedan labeln (i den ordningen).");
  console.log("   4. Merga först efter uttrycklig bekräftelse — se .cursor/rules/pr-merge.mdc.");
  if (manualMergePaths.length > 0) {
    console.log(
      "   5. Separat ägargodkännande i chatten, sedan dokumenterad expected-head-squash-merge enligt docs/runbooks/agent-workflow.md.",
    );
  }
  console.log("");
  console.log(
    `  Efter merge: bered en synkbranch från färsk ${STAGING_BRANCH} som tar in ${PRODUCTION_BRANCH}, öppna PR mot ${STAGING_BRANCH} och merga med MERGE-commit (inte squash) innan nästa promote.`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(`[promote] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
