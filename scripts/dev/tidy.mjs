/**
 * scripts/dev/tidy.mjs
 *
 * Git-nivåns vaktmästare: städar det som `npm run hygiene` inte rör.
 *
 * Arbetsfördelningen är med flit:
 *   - `hygiene` är en GRIND. Den är läsande, faller med exitkod och CI blockerar
 *     på delar av den (docs-färskhet, orphan-filer). Grindar ska vara
 *     förutsägbara, så de raderar inget.
 *   - `tidy` är en VAKTMÄSTARE. Den städar lokalt tillstånd som ruttnar av sig
 *     självt: döda branch-pekare, avregistrerade worktrees och en Next-cache
 *     som är äldre än HEAD.
 *
 * Varför den finns: den 17 augusti 2026 hade en laptop-checkout 548 commits att
 * hämta. Efter pullen låg tre veckor gammal `.next/dev/types` kvar och pekade på
 * API-rutter som inte längre fanns, så `npm run typecheck` rapporterade sex
 * fantomfel i kod ingen hade rört. Samma dag visade det sig att 78 mergade
 * remote-brancher hunnit samlas för att GitHubs `deleteBranchOnMerge` varit av.
 * Båda är tillstånd som ingen enskild PR äger — därför en egen knapp.
 *
 * Säkerhetsmodell:
 *   - Dry-run som DEFAULT. Inget ändras utan `--apply`.
 *   - Rör ALDRIG remote. GitHub-städ är `deleteBranchOnMerge` (påslaget) plus
 *     ditt eget beslut; den här filen rapporterar bara vad som ligger kvar där.
 *     En robot som raderar omergade brancher tar förr eller senare något du
 *     ville ha.
 *   - Skyddade branchnamn från config/agent-workflow.json hoppas alltid över,
 *     och en lokal branch
 *     raderas bara när BÅDA gäller: dess remote är borta OCH innehållet är
 *     landat. "Landat" bevisas av Git-ancestry eller en mergad GitHub-PR med
 *     exakt samma branch och head-SHA (squash-merge bevarar inte ancestry).
 *     Saknas GitHub-svar bevaras allt som behöver PR-bevis.
 *
 * Användning:
 *   npm run tidy         # rapport (dry-run)
 *   npm run tidy:apply   # utför lokalt städ
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(__dirname, "..", "..");

/** Bas som "mergad" mäts mot. */
export const BASE_REF = "origin/master";
/** Remote-brancher äldre än detta rapporteras som gamla (aldrig raderas). */
export const STALE_AFTER_DAYS = 30;

/**
 * Namn som aldrig får raderas, ens lokalt.
 *
 * `JAKOB_BRA_9999_INNNAN_MVP_BRA` och syskonen är ägarens frysta backuper
 * (`.cursor/rules/jakob-pre-mvp-backup.mdc`) — mönstret `BRA` täcker dem alla.
 * `rescue/*` bär räddade stashar, `dependabot/*` ägs av boten, och `ema` är en
 * medarbetares bas.
 */
export const PROTECTED_BRANCH_PATTERN_FLOORS = Object.freeze([
  "master",
  "main",
  "ema",
  "*BRA*",
  "rescue/*",
  "dependabot/*",
  "archive/*",
]);

const configuredProtectedBranchPatterns = JSON.parse(
  fs.readFileSync(path.join(DEFAULT_ROOT, "config/agent-workflow.json"), "utf8"),
).protectedBranchPatterns;
if (
  !Array.isArray(configuredProtectedBranchPatterns) ||
  configuredProtectedBranchPatterns.some(
    (pattern) => typeof pattern !== "string" || pattern.length === 0,
  )
) {
  throw new Error("config/agent-workflow.json: protectedBranchPatterns must be strings");
}

// Konfigurationen får lägga till skydd, aldrig ta bort kodens miniminivå. Det
// gör den destruktiva vakten verksam även innan contract-grinden hunnit köras.
export const PROTECTED_BRANCH_PATTERNS = Object.freeze([
  ...new Set([...PROTECTED_BRANCH_PATTERN_FLOORS, ...configuredProtectedBranchPatterns]),
]);

function branchPatternRegex(pattern) {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${source}$`, "u");
}

/** Same slash/case fold as `worktree:remove` so a protected path cannot read as FRI. */
export function normalizeWorktreePath(p) {
  return path
    .resolve(p)
    .replace(/[\\/]+$/u, "")
    .toLowerCase();
}

/** @param {string} name */
export function isProtectedBranch(name) {
  return PROTECTED_BRANCH_PATTERNS.some((pattern) => branchPatternRegex(pattern).test(name));
}

/**
 * Ska en LOKAL branch raderas? Kräver att remoten är borta och att innehållet
 * finns i basen — annars är den pågående arbete.
 *
 * @param {{ name: string, upstreamGone: boolean, mergedIntoBase: boolean, mergedByExactPr?: boolean, isCurrent: boolean }} b
 * @returns {{ action: "delete" | "keep", reason: string }}
 */
export function classifyLocalBranch({
  name,
  upstreamGone,
  mergedIntoBase,
  mergedByExactPr = false,
  isCurrent,
}) {
  if (isCurrent) return { action: "keep", reason: "utcheckad" };
  if (isProtectedBranch(name)) return { action: "keep", reason: "skyddat namn" };
  if (!mergedIntoBase && !mergedByExactPr) {
    return { action: "keep", reason: "ingen exakt merge bevisad — pågående arbete" };
  }
  if (!upstreamGone) return { action: "keep", reason: "remote finns kvar" };
  return {
    action: "delete",
    reason: mergedIntoBase
      ? "remote borta + Git-merge bevisad"
      : "remote borta + squash-PR bevisad",
  };
}

/**
 * Remote-brancher klassas bara för RAPPORT. Ingen gren av den här funktionen
 * leder till radering.
 *
 * @param {{ name: string, ageDays: number, hasOpenPr: boolean, staleAfterDays?: number }} b
 */
export function classifyRemoteBranch({
  name,
  ageDays,
  hasOpenPr,
  staleAfterDays = STALE_AFTER_DAYS,
}) {
  if (isProtectedBranch(name)) return { flag: "keep", reason: "skyddat namn" };
  if (hasOpenPr) return { flag: "keep", reason: "öppen PR" };
  if (ageDays >= staleAfterDays)
    return { flag: "stale", reason: `${Math.floor(ageDays)} dagar utan öppen PR` };
  return { flag: "keep", reason: "färsk" };
}

/**
 * Next-cachen är opålitlig när den är äldre än HEAD: borttagna rutter ligger
 * kvar i `.next/dev/types` och ger fantomfel i `typecheck`.
 *
 * @param {{ cacheMtimeMs: number | null, headCommitMs: number }} input
 */
export function isNextCacheStale({ cacheMtimeMs, headCommitMs }) {
  if (cacheMtimeMs === null) return false;
  return cacheMtimeMs < headCommitMs;
}

/**
 * Är arbetsträdet smutsigt? `null` betyder att `git status` **misslyckades**, inte
 * att trädet är rent — och då måste svaret vara smutsigt.
 *
 * Samma inversionsfälla som för `gh` nedan, och lätt att gå på: ett `allowFail`-
 * anrop som returnerar tom lista ser ut som «inga ändringar» fast det betyder
 * «vi vet inte». Bugbot fångade exakt det här i första utkastet, där en worktree
 * vars status aldrig kunde läsas hade klassats som FRI.
 *
 * @param {string | null} statusOutput rå utdata från `git status --porcelain`
 */
export function isWorktreeDirty(statusOutput) {
  if (statusOutput === null) return true;
  return statusOutput.trim().length > 0;
}

/**
 * Får en worktree-katalog tas bort, och varför inte?
 *
 * Det här är den enda kontrollen som skyddar en annan agents arbetsyta. `tidy`
 * tar aldrig bort kataloger själv — den klassar och rapporterar, och du kör
 * `npm run worktree:remove` på det som är fritt. Skälet är att en worktree är en
 * *pågående session*: agenten som äger den har sin `working_directory` där, och
 * en katalog som försvinner under den ser ut som ett trasigt repo.
 *
 * Tre villkor måste alla vara sanna för att en worktree ska räknas som klar:
 * branchen får inte ha en öppen PR, arbetsträdet måste vara rent, och innehållet
 * måste redan finnas i basen. Faller ett enda villkor är svaret behåll.
 *
 * `npm run worktree:remove` vägrar redan på smutsigt eller ospårat innehåll.
 * Den vet däremot ingenting om PR-status — det hålet täcks här.
 *
 * @param {{ branch: string | null, hasOpenPr: boolean, isDirty: boolean, mergedIntoBase: boolean, mergedByExactPr?: boolean, isMain: boolean, isProtected?: boolean }} wt
 * @returns {{ verdict: "keep" | "free", reason: string }}
 */
export function classifyWorktree({
  branch,
  hasOpenPr,
  isDirty,
  mergedIntoBase,
  mergedByExactPr = false,
  isMain,
  isProtected = false,
}) {
  if (isMain) return { verdict: "keep", reason: "huvudcheckouten — delas med ägaren" };
  if (isProtected) return { verdict: "keep", reason: "sajtmaskin.protectedWorktree" };
  if (branch && isProtectedBranch(branch)) return { verdict: "keep", reason: "skyddat branchnamn" };
  if (hasOpenPr) return { verdict: "keep", reason: "branchen har en ÖPPEN PR — någon arbetar" };
  if (isDirty) return { verdict: "keep", reason: "ocommitterat eller ospårat innehåll" };
  if (!mergedIntoBase && !mergedByExactPr) {
    return { verdict: "keep", reason: "ingen exakt merge bevisad ännu" };
  }
  return {
    verdict: "free",
    reason: mergedIntoBase
      ? "ingen öppen PR, rent träd, Git-merge bevisad"
      : "ingen öppen PR, rent träd, squash-PR bevisad",
  };
}

/**
 * Rader som Vercel-CLI:n appendar i `.gitignore`. `vercel link` / `vercel env
 * pull` lägger till sin egen kopia varje gång filen ändrats sedan förra
 * körningen, så antalet växer över tid. Duplicerade gitignore-mönster är
 * verkningslösa för git — enda kostnaden är brus i `git status`.
 */
export const VERCEL_IGNORE_LINES = new Set([".env*", ".vercel"]);

/**
 * Ta bort dubbletter av CLI-appendade rader och behåll den FÖRSTA förekomsten.
 * Rör bara exakta träffar i {@link VERCEL_IGNORE_LINES}: en rad med annan text,
 * annat mönster eller inledande blanksteg lämnas orörd, så en riktig regel kan
 * aldrig försvinna här. Kommentarer och ordning i övrigt bevaras.
 *
 * @param {string} content rå `.gitignore`-text
 * @returns {{ content: string, removed: string[] }}
 */
export function dedupeVercelIgnoreLines(content) {
  // Alltid LF: `.gitattributes` sätter `* text=auto eol=lf`, och Vercel-CLI:n
  // skriver CRLF på Windows. Bevarade vi filens befintliga radslut skulle varje
  // städning lämna en CRLF-fil som git i sin tur varnar för och konverterar.
  const eol = "\n";
  const lines = content.split(/\r?\n/);
  const seen = new Set();
  const kept = [];
  const removed = [];

  for (const line of lines) {
    if (VERCEL_IGNORE_LINES.has(line)) {
      if (seen.has(line)) {
        removed.push(line);
        continue;
      }
      seen.add(line);
    }
    kept.push(line);
  }

  // Borttagningen lämnar ofta två blankrader efter sig i filens slut.
  while (kept.length > 1 && kept.at(-1) === "" && kept.at(-2) === "") kept.pop();
  let out = kept.join(eol);
  if (!out.endsWith(eol)) out += eol;
  return { content: out, removed };
}

/** @param {string[]} args @param {string} root */
function git(args, root, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

function gitLines(args, root, opts) {
  const out = git(args, root, opts);
  return out ? out.split(/\r?\n/).filter((l) => l.trim()) : [];
}

/**
 * Parsa `git worktree list --porcelain`. Första posten är alltid huvudträdet.
 *
 * @param {string[]} lines
 * @returns {{ path: string, branch: string | null }[]}
 */
export function parsePorcelainWorktrees(lines) {
  const out = [];
  for (const line of lines) {
    const wt = /^worktree (.+)$/.exec(line.trim());
    if (wt?.[1]) {
      out.push({ path: wt[1], branch: null });
      continue;
    }
    const br = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (br?.[1] && out.length > 0) out[out.length - 1].branch = br[1];
  }
  return out;
}

/**
 * PR-livscykel via ett enda gh-anrop. `null` betyder «vet inte» (gh saknas,
 * nätet är nere eller svaret är trasigt), aldrig «inga PR:er». En squash-merge
 * får bara räknas när både branch och den lokala 40-teckens head-SHA:n matchar
 * GitHubs bevarade PR-head exakt.
 */
export function parsePrLifecycle(rows) {
  if (!Array.isArray(rows)) throw new Error("PR lifecycle must be an array");
  const openHeads = new Set();
  const mergedHeads = new Map();
  for (const row of rows) {
    const branch = typeof row?.headRefName === "string" ? row.headRefName : "";
    if (!branch) continue;
    if (String(row.state ?? "").toUpperCase() === "OPEN") openHeads.add(branch);
    const sha = typeof row.headRefOid === "string" ? row.headRefOid.toLowerCase() : "";
    if (row.mergedAt && /^[0-9a-f]{40}$/.test(sha)) {
      const shas = mergedHeads.get(branch) ?? new Set();
      shas.add(sha);
      mergedHeads.set(branch, shas);
    }
  }
  return { openHeads, mergedHeads };
}

/**
 * `gh api --paginate` bearbetar varje sida och skriver en TSV-rad per PR. Varje
 * rad valideras strikt: ett delvis/trunkerat svar får aldrig se ut som «inga
 * öppna PR:er». API:t använder `closed` även för mergade PR:er; `merged_at` är
 * därför det terminala mergebeviset, bundet till exakt head-SHA nedan.
 *
 * @param {string} output
 */
export function parsePrLifecycleTsv(output) {
  if (typeof output !== "string") throw new Error("PR lifecycle TSV must be a string");

  const rows = [];
  for (const line of output.split(/\r?\n/u)) {
    if (line === "") continue;
    const fields = line.split("\t");
    if (fields.length !== 4) throw new Error("PR lifecycle TSV row must have four fields");
    const [headRefName, headRefOid, state, mergedAt] = fields;
    if (!headRefName || !/^[0-9a-fA-F]{40}$/u.test(headRefOid)) {
      throw new Error("PR lifecycle TSV row has an invalid head");
    }
    if (state !== "open" && state !== "closed") {
      throw new Error("PR lifecycle TSV row has an invalid state");
    }
    if (mergedAt && (state !== "closed" || Number.isNaN(Date.parse(mergedAt)))) {
      throw new Error("PR lifecycle TSV row has an invalid merged_at");
    }
    rows.push({
      headRefName,
      headRefOid,
      state: state.toUpperCase(),
      mergedAt: mergedAt || null,
    });
  }
  return parsePrLifecycle(rows);
}

export function isExactMergedPr(lifecycle, branch, headSha) {
  if (!lifecycle || !branch || !/^[0-9a-fA-F]{40}$/.test(headSha ?? "")) return false;
  return lifecycle.mergedHeads.get(branch)?.has(headSha.toLowerCase()) ?? false;
}

export const PR_LIFECYCLE_API_ARGS = Object.freeze([
  "api",
  "--paginate",
  "repos/{owner}/{repo}/pulls?state=all&per_page=100",
  "--jq",
  '.[] | [.head.ref, .head.sha, .state, (.merged_at // "")] | @tsv',
]);

export function loadPrLifecycle(root) {
  try {
    const out = execFileSync("gh", PR_LIFECYCLE_API_ARGS, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parsePrLifecycleTsv(out);
  } catch {
    return null;
  }
}

export function runTidy({ root = DEFAULT_ROOT, apply = false, fetch = true } = {}) {
  const log = (s) => console.log(s);
  const tag = apply ? "" : " (dry-run)";
  const planned = [];

  if (fetch) {
    git(["fetch", "origin", "--prune", "--quiet"], root, { allowFail: true });
  }

  // --- 1. Lokala döda brancher ---
  const current = git(["rev-parse", "--abbrev-ref", "HEAD"], root);
  const lifecycle = loadPrLifecycle(root);
  const rows = gitLines(
    ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"],
    root,
  );
  const localDelete = [];
  for (const row of rows) {
    const [name, track = ""] = row.split("\t");
    const mergedIntoBase =
      git(["merge-base", "--is-ancestor", name, BASE_REF], root, { allowFail: true }) !== null;
    const branchHead = git(["rev-parse", name], root, { allowFail: true });
    const verdict = classifyLocalBranch({
      name,
      upstreamGone: track.includes("gone"),
      mergedIntoBase,
      mergedByExactPr: isExactMergedPr(lifecycle, name, branchHead),
      isCurrent: name === current,
    });
    if (verdict.action === "delete") localDelete.push({ name, reason: verdict.reason });
  }
  if (localDelete.length === 0) {
    log("[tidy] lokala brancher: inget att rensa.");
  } else {
    for (const b of localDelete) {
      log(`[tidy] ${apply ? "raderar" : "skulle radera"} lokal branch ${b.name} (${b.reason})`);
      if (apply) git(["branch", "-D", b.name], root, { allowFail: true });
    }
    planned.push(`${localDelete.length} lokal(a) branch(er)`);
  }

  // --- 2. Avregistrerade worktrees ---
  const wtLines = gitLines(["worktree", "list", "--porcelain"], root);
  const prunable = wtLines.filter((l) => l.trim() === "prunable").length;
  if (prunable > 0) {
    log(`[tidy] ${apply ? "prunar" : "skulle pruna"} ${prunable} avregistrerad worktree-post`);
    if (apply) git(["worktree", "prune"], root, { allowFail: true });
    planned.push(`${prunable} worktree-post(er)`);
  } else {
    log("[tidy] worktrees: inget att pruna.");
  }

  // --- 2b. Levande worktrees: vilka är orörbara? ---
  // Rapport, aldrig radering. Katalogen tas bort med `npm run worktree:remove`,
  // som kopplar loss junctions först. Poängen här är att säga VILKA som är fria.
  const worktrees = parsePorcelainWorktrees(wtLines);
  const protectedWorktreePaths = new Set(
    (git(["config", "--get-all", "sajtmaskin.protectedWorktree"], root, { allowFail: true }) ?? "")
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => normalizeWorktreePath(entry)),
  );
  // Ett enda gh-anrop återanvänds av branch-, worktree- och remote-klassningen.
  const openPrBranches = lifecycle?.openHeads ?? null;
  if (worktrees.length > 1) {
    for (const wt of worktrees.slice(1)) {
      const dirty = isWorktreeDirty(git(["status", "--porcelain"], wt.path, { allowFail: true }));
      const merged =
        wt.branch !== null &&
        git(["merge-base", "--is-ancestor", wt.branch, BASE_REF], root, { allowFail: true }) !==
          null;
      const branchHead = wt.branch
        ? git(["rev-parse", wt.branch], root, { allowFail: true })
        : null;
      const { verdict, reason } = classifyWorktree({
        branch: wt.branch,
        // Kan vi inte fråga GitHub vet vi inte om någon arbetar → antag att de gör det.
        hasOpenPr: openPrBranches === null ? true : openPrBranches.has(wt.branch ?? ""),
        isDirty: dirty,
        mergedIntoBase: merged,
        mergedByExactPr: isExactMergedPr(lifecycle, wt.branch, branchHead),
        isMain: false,
        isProtected: protectedWorktreePaths.has(normalizeWorktreePath(wt.path)),
      });
      const label = verdict === "free" ? "FRI" : "behåll";
      log(`[tidy] worktree ${label}: ${wt.path} [${wt.branch ?? "detached"}] — ${reason}`);
    }
    if (openPrBranches === null) {
      log("[tidy]   (gh svarade inte — alla behandlas som upptagna, med flit)");
    }
    log("[tidy]   Ta bort en FRI med: npm run worktree:remove -- <sökväg>");
  }

  // --- 3. Förlegad Next-cache ---
  const nextDir = path.join(root, ".next");
  let cacheMtimeMs = null;
  try {
    cacheMtimeMs = fs.statSync(nextDir).mtimeMs;
  } catch {
    cacheMtimeMs = null;
  }
  const headMs = Number(git(["log", "-1", "--format=%ct"], root)) * 1000;
  if (isNextCacheStale({ cacheMtimeMs, headCommitMs: headMs })) {
    log(
      `[tidy] ${apply ? "raderar" : "skulle radera"} .next — äldre än HEAD, ger fantomfel i typecheck`,
    );
    if (apply) fs.rmSync(nextDir, { recursive: true, force: true });
    planned.push(".next-cache");
  } else {
    log("[tidy] Next-cache: aktuell.");
  }

  // --- 4. Vercel-appendade gitignore-dubbletter ---
  const ignorePath = path.join(root, ".gitignore");
  try {
    const before = fs.readFileSync(ignorePath, "utf8");
    const { content: after, removed } = dedupeVercelIgnoreLines(before);
    if (removed.length > 0) {
      log(
        `[tidy] ${apply ? "tar bort" : "skulle ta bort"} ${removed.length} dubblett(er) i .gitignore ` +
          `(${[...new Set(removed)].join(", ")}) — appendade av vercel link/env pull`,
      );
      if (apply) fs.writeFileSync(ignorePath, after);
      planned.push(`${removed.length} .gitignore-dubblett(er)`);
    } else {
      log("[tidy] .gitignore: inga CLI-dubbletter.");
    }
  } catch {
    log("[tidy] .gitignore: kunde inte läsas — hoppar över.");
  }

  // --- 5. Remote-rapport (raderar aldrig) ---
  const openHeads = openPrBranches;
  if (openHeads === null) {
    log("[tidy] remote: hoppar över rapporten (gh svarade inte).");
  } else {
    const now = Date.now();
    const stale = [];
    for (const row of gitLines(
      ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/remotes/origin"],
      root,
    )) {
      const [full, unix] = row.split("\t");
      const name = full.replace(/^origin\//, "");
      if (!name || name === "HEAD") continue;
      const verdict = classifyRemoteBranch({
        name,
        ageDays: (now - Number(unix) * 1000) / 86_400_000,
        hasOpenPr: openHeads.has(name),
      });
      if (verdict.flag === "stale") stale.push(`${name} (${verdict.reason})`);
    }
    if (stale.length === 0) {
      log("[tidy] remote: inga gamla brancher.");
    } else {
      log(
        `[tidy] remote: ${stale.length} branch(er) äldre än ${STALE_AFTER_DAYS} dagar utan öppen PR —`,
      );
      for (const s of stale) log(`         ${s}`);
      log(
        "         Rapport, inget mer. Radera själv efter en titt, gärna med archive/*-tagg först.",
      );
    }
  }

  log(
    `[tidy] klart${tag} — ${planned.length === 0 ? "inget att göra" : planned.join(", ")}.` +
      (apply || planned.length === 0 ? "" : " Kör om med --apply.") +
      " Filskräp: npm run clean:scratch. Docs/döda filer: npm run hygiene.",
  );

  return { localDelete, prunable, planned };
}

if (process.argv[1] && process.argv[1].endsWith("tidy.mjs")) {
  runTidy({ apply: process.argv.includes("--apply"), fetch: !process.argv.includes("--no-fetch") });
}
