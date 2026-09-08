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
 * Kommandot **mergar aldrig**. Det öppnar PR:en och skriver ut vad som
 * återstår; mergegrinden ägs av `.cursor/rules/pr-merge.mdc` och kräver
 * fortfarande gröna checks, review och din uttryckliga bekräftelse.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function buildPromoteTitle(commits, date) {
  const highlights = selectPromoteHighlights(commits);
  if (highlights.length === 1) {
    return `promote: ${highlights[0].subject}`;
  }
  return `promote: ${highlights.length} ändringar från preview till master (${date})`;
}

export function buildPromoteBody({ commits, baseSha, headSha, branch, date }) {
  const highlights = selectPromoteHighlights(commits);
  const list =
    highlights.length > 0
      ? highlights.map((c) => `- \`${c.sha.slice(0, 8)}\` ${c.subject}`).join("\n")
      : "- (inga icke-merge-commits)";

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

  const commits = parseCommitLines(
    git(["log", "--oneline", "--no-decorate", `origin/${PRODUCTION_BRANCH}..origin/${STAGING_BRANCH}`]),
  );
  if (commits.length === 0) {
    console.log(
      `[promote] inget att promota — origin/${STAGING_BRANCH} ligger inte före origin/${PRODUCTION_BRANCH}.`,
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
  const body = buildPromoteBody({ commits, baseSha, headSha, branch, date });

  console.log(`[promote] ${commits.length} commit(s) från ${STAGING_BRANCH} → ${PRODUCTION_BRANCH}`);
  for (const commit of selectPromoteHighlights(commits)) {
    console.log(`  ${commit.sha.slice(0, 8)} ${commit.subject}`);
  }

  if (options.dryRun) {
    console.log(`\n[promote] --dry-run: skulle skapa grenen ${branch} vid ${headSha.slice(0, 8)}`);
    console.log(`[promote] --dry-run: skulle öppna PR "${title}" (${STAGING_BRANCH} → ${PRODUCTION_BRANCH})`);
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
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(`[promote] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
