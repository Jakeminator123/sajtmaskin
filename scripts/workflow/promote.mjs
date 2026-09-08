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
 * efteråt. Utan åtgärd räknar nästa promote redan släppta commits igen och
 * stoppas av kravet att head innehåller aktuell master (extern review
 * 2026-09-08). Saknar preview masters tip mergar kommandot därför först
 * master → preview serverside (innehållsneutralt efter en squash-promote) och
 * fortsätter sedan.
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
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([0-9a-f]{7,40})\s+(.*)$/i.exec(line);
      return match ? { sha: match[1], subject: match[2] } : null;
    })
    .filter(Boolean);
}

/** Merge-commits beskriver inte vad som ändras — bara hur det kom hit. */
export function selectPromoteHighlights(commits) {
  return commits.filter((commit) => !MERGE_COMMIT_RE.test(commit.subject));
}

/**
 * Efter synk-mergen kan `master..preview` bestå av enbart en merge-commit medan
 * träden är identiska — då finns inget att släppa. Släpp bara när preview både
 * ligger före master och faktiskt har ett annat träd.
 */
export function hasContentToPromote(commits, treeDiffers) {
  return commits.length > 0 && treeDiffers;
}

/**
 * Var commitlistan börjar: vid senaste synk-mergen (master → preview) när en
 * sådan finns, annars vid master. Squash-promote gör att previews commits
 * före synken redan är släppta även om de inte är förfäder till master.
 */
export function commitRangeStart(syncMergeSha, productionRef) {
  return syncMergeSha || productionRef;
}

export function buildPromoteTitle(commits, date) {
  const highlights = selectPromoteHighlights(commits);
  if (highlights.length === 1) {
    return `promote: ${highlights[0].subject}`;
  }
  return `promote: ${highlights.length} ändringar från preview till master (${date})`;
}

export function buildPromoteBody({
  commits,
  baseSha,
  headSha,
  branch,
  date,
  manualMergePaths = /** @type {string[]} */ ([]),
}) {
  const highlights = selectPromoteHighlights(commits);
  const list =
    highlights.length > 0
      ? highlights.map((c) => `- \`${c.sha.slice(0, 8)}\` ${c.subject}`).join("\n")
      : "- (inga icke-merge-commits)";

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
    `- Kort scope: promote av ${highlights.length} ändring${highlights.length === 1 ? "" : "ar"} från staging (\`${STAGING_BRANCH}\`) till produktion (\`${PRODUCTION_BRANCH}\`). Ingen ny kod — allt har redan mergats till \`${STAGING_BRANCH}\` och testats där.`,
    `- Base-SHA: \`${baseSha}\` (\`origin/${PRODUCTION_BRANCH}\`)`,
    `- Head-SHA: \`${headSha}\` (\`origin/${STAGING_BRANCH}\` vid ${date})`,
    `- Promote-gren: \`${branch}\` — kortlivad slaskgren så att auto-delete vid merge tar den i stället för \`${STAGING_BRANCH}\`.`,
    "",
    "## Innehåll",
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

/** Innehåller origin/preview redan origin/masters tip? */
function stagingContainsProduction() {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", `origin/${PRODUCTION_BRANCH}`, `origin/${STAGING_BRANCH}`],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Senaste merge-commit på previews first-parent-linje vars andra förälder
 * ligger i master — dvs. en synk `master → preview`. Null om ingen finns.
 */
function findLatestSyncMerge() {
  const merges = git([
    "rev-list",
    "--first-parent",
    "--merges",
    `origin/${PRODUCTION_BRANCH}..origin/${STAGING_BRANCH}`,
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const sha of merges) {
    try {
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", `${sha}^2`, `origin/${PRODUCTION_BRANCH}`],
        { cwd: REPO_ROOT, stdio: "ignore" },
      );
      return sha;
    } catch {
      // inte en synk-merge — fortsätt
    }
  }
  return null;
}

/**
 * Merga master → preview serverside via GitHubs merges-API. Efter en
 * squash-promote är träden identiska, så mergen är innehållsneutral; har
 * master fått en hotfix följer den med till staging, vilket är avsikten.
 * Kommandot rör aldrig din lokala checkout. Protect preview kräver PR för
 * pushar — anropet går på din egen behörighet (ägaren har bypass); saknas den
 * skrivs receptet för PR-vägen ut i stället.
 */
function syncStagingWithProduction(baseSha) {
  console.log(
    `[promote] origin/${STAGING_BRANCH} saknar origin/${PRODUCTION_BRANCH} (${baseSha.slice(0, 8)}) — mergar ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} serverside så att nästa promote-head innehåller master.`,
  );
  try {
    gh([
      "api",
      "-X",
      "POST",
      "repos/{owner}/{repo}/merges",
      "-f",
      `base=${STAGING_BRANCH}`,
      "-f",
      `head=${PRODUCTION_BRANCH}`,
      "-f",
      `commit_message=sync: ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} efter promote (${baseSha.slice(0, 8)})`,
      "--jq",
      ".sha // empty",
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `kunde inte merga ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} serverside: ${message}`,
        `Alternativ: öppna en PR från ${PRODUCTION_BRANCH} mot ${STAGING_BRANCH} och merga den med MERGE-commit (inte squash), kör sedan promote igen.`,
      ].join("\n"),
    );
  }
  console.log(`[promote] ${STAGING_BRANCH} innehåller nu ${PRODUCTION_BRANCH}.`);
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
  let headSha = git(["rev-parse", `origin/${STAGING_BRANCH}`]);

  if (baseSha === headSha) {
    console.log(
      `[promote] inget att promota — origin/${STAGING_BRANCH} och origin/${PRODUCTION_BRANCH} pekar båda på ${headSha.slice(0, 8)}.`,
    );
    return;
  }

  // Squash-merge lämnar ett hål: masters nya commit finns inte i preview. Utan
  // synk räknar `master..preview` redan släppta ändringar igen och nästa
  // promote-PR stoppas av kravet att head innehåller aktuell master.
  if (!stagingContainsProduction()) {
    if (options.dryRun) {
      // Commitlista, head och trädjämförelse gäller först efter synken; att
      // fortsätta här skulle visa exakt det fel synken finns för att rätta.
      console.log(
        `[promote] --dry-run: origin/${STAGING_BRANCH} saknar origin/${PRODUCTION_BRANCH} (${baseSha.slice(0, 8)}). En riktig körning mergar först ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} serverside och räknar sedan om. Kör utan --dry-run, eller merga ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} (merge-commit, inte squash) och prova igen.`,
      );
      return;
    }
    syncStagingWithProduction(baseSha);
    git(["fetch", "origin", STAGING_BRANCH]);
    headSha = git(["rev-parse", `origin/${STAGING_BRANCH}`]);
  }

  // Efter en squash-promote finns previews enskilda commits kvar i historiken
  // men inte på master (som bara har squash-commiten). `master..preview` skulle
  // därför lista redan släppt arbete. Räkna i stället från senaste synk-mergen:
  // allt före den är squashat in i master.
  const syncMerge = findLatestSyncMerge();
  const rangeStart = commitRangeStart(syncMerge, `origin/${PRODUCTION_BRANCH}`);
  const commits = parseCommitLines(
    git(["log", "--oneline", "--no-decorate", `${rangeStart}..origin/${STAGING_BRANCH}`]),
  );
  const treeDiffers =
    git(["rev-parse", `origin/${PRODUCTION_BRANCH}^{tree}`]) !==
    git(["rev-parse", `origin/${STAGING_BRANCH}^{tree}`]);
  if (!hasContentToPromote(commits, treeDiffers)) {
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
  const title = buildPromoteTitle(commits, date);

  console.log(
    `[promote] ${commits.length} commit(s) från ${STAGING_BRANCH} → ${PRODUCTION_BRANCH}`,
  );
  for (const commit of selectPromoteHighlights(commits)) {
    console.log(`  ${commit.sha.slice(0, 8)} ${commit.subject}`);
  }

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
      `origin/${PRODUCTION_BRANCH}`,
      `origin/${STAGING_BRANCH}`,
    ]),
  );
  const prefixes = manualMergePrefixesFromPolicy(
    git(["show", `origin/${PRODUCTION_BRANCH}:config/agent-workflow.json`]),
  );
  const manualMergePaths = findManualMergePaths(changedPaths, prefixes);
  const body = buildPromoteBody({ commits, baseSha, headSha, branch, date, manualMergePaths });

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
    `  Efter merge: kör \`npm run promote\` igen — den mergar då ${PRODUCTION_BRANCH} → ${STAGING_BRANCH} så staging innehåller squash-commiten (annars räknas släppta ändringar igen nästa gång).`,
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
