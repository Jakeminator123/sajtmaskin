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
 *   - Skyddade branchnamn hoppas alltid över (se SKYDDADE), och en lokal branch
 *     raderas bara när BÅDA gäller: dess remote är borta OCH den är mergad in i
 *     basen. En omergad branch är pågående arbete, inte skräp.
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
export const SKYDDADE = [
  /^master$/,
  /^main$/,
  /^ema$/,
  /BRA/,
  /^rescue\//,
  /^dependabot\//,
  /^archive\//,
];

/** @param {string} name */
export function isProtectedBranch(name) {
  return SKYDDADE.some((rx) => rx.test(name));
}

/**
 * Ska en LOKAL branch raderas? Kräver att remoten är borta och att innehållet
 * finns i basen — annars är den pågående arbete.
 *
 * @param {{ name: string, upstreamGone: boolean, mergedIntoBase: boolean, isCurrent: boolean }} b
 * @returns {{ action: "delete" | "keep", reason: string }}
 */
export function classifyLocalBranch({ name, upstreamGone, mergedIntoBase, isCurrent }) {
  if (isCurrent) return { action: "keep", reason: "utcheckad" };
  if (isProtectedBranch(name)) return { action: "keep", reason: "skyddat namn" };
  if (!mergedIntoBase) return { action: "keep", reason: "omergad — pågående arbete" };
  if (!upstreamGone) return { action: "keep", reason: "remote finns kvar" };
  return { action: "delete", reason: "remote borta + mergad" };
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

/** Öppna PR-huvuden via gh. Saknas gh eller nätet: null = hoppa över rapporten. */
function openPrHeads(root) {
  try {
    const out = execFileSync(
      "gh",
      ["pr", "list", "--state", "open", "--limit", "200", "--json", "headRefName"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return new Set(JSON.parse(out).map((p) => p.headRefName));
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
  const rows = gitLines(
    ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"],
    root,
  );
  const localDelete = [];
  for (const row of rows) {
    const [name, track = ""] = row.split("\t");
    const mergedIntoBase =
      git(["merge-base", "--is-ancestor", name, BASE_REF], root, { allowFail: true }) !== null;
    const verdict = classifyLocalBranch({
      name,
      upstreamGone: track.includes("gone"),
      mergedIntoBase,
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

  // --- 4. Remote-rapport (raderar aldrig) ---
  const openHeads = openPrHeads(root);
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
