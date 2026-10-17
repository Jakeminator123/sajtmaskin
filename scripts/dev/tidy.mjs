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
 *   - Rör aldrig remote av sig själv. GitHub-städ är `deleteBranchOnMerge`
 *     (påslaget) plus ditt eget beslut; standardkörningen rapporterar bara vad
 *     som ligger kvar där. En robot som raderar omergade brancher tar förr eller
 *     senare något du ville ha.
 *   - Enda remote-skrivningen är uttrycklig: `--delete-remote <branch>[,...]`.
 *     Den nekar skyddade namn och öppen PR (gh-fel = nej), kräver bevis i form
 *     av `archive/<branch>`-tagg på exakt remote-tip (skapas om den saknas) eller
 *     en mergad PR med samma head, läser om tipet direkt före delete och raderar
 *     med vanlig push utan force. Pre-push-hooken får beviset via
 *     `SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH/SHA` och jämför mot live-tipet.
 *   - Skyddade branchnamn från config/agent-workflow.json hoppas alltid över,
 *     och en lokal branch
 *     raderas bara när BÅDA gäller: dess remote är borta OCH innehållet är
 *     landat. "Landat" bevisas av Git-ancestry eller en mergad GitHub-PR med
 *     exakt samma branch och head-SHA (squash-merge bevarar inte ancestry).
 *     Saknas GitHub-svar bevaras allt som behöver PR-bevis.
 *   - Spök-worktrees prunas FÖRE branch-delete. Git porcelain skriver
 *     `prunable <orsak>`, inte bara `prunable`. En branch som bara är låst av
 *     en spökpost blir därför fri i samma körning. En branch som är utcheckad
 *     i en levande worktree behålls. Misslyckad `branch -D` loggas, sväljs inte.
 *
 * Användning:
 *   npm run tidy         # rapport (dry-run)
 *   npm run tidy:apply   # utför lokalt städ
 *   npm run tidy -- --delete-remote <branch>[,<branch>...]           # dry-run
 *   npm run tidy -- --delete-remote <branch>[,<branch>...] --apply   # arkivera + radera
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(__dirname, "..", "..");

/**
 * Baser som ancestry ("finns innehållet redan i en landad gren?") mäts mot.
 * `preview` är leveransbasen; `master` är produktion.
 *
 * Varför båda: preview ligger normalt långt före master, så en branch vars
 * commits faktiskt finns i preview var inte ancestor av master och räknades
 * som omergad ända till promote.
 *
 * Ancestry är INTE squash-vägen. En squash-merge skriver en ny commit och
 * bevarar ingen ancestry mot någon bas — den branchen städas av
 * `isExactMergedPr` (mergad GitHub-PR med samma branch och head-SHA), inte
 * härifrån. De två bevisen är med flit skilda.
 */
export const LANDED_REFS = Object.freeze(["origin/preview", "origin/master"]);
/** Bakåtkompatibel alias: primär leveransbas. */
export const BASE_REF = "origin/preview";
/** Remote-brancher äldre än detta rapporteras som gamla (aldrig raderas). */
export const STALE_AFTER_DAYS = 30;

/**
 * Namn som aldrig får raderas, ens lokalt.
 *
 * `JAKOB_BRA_9999_INNNAN_MVP_BRA` och syskonen är ägarens frysta backuper
 * (`git.mdc` + pre-push-hooken) — mönstret `BRA` täcker dem alla.
 * `rescue/*` bär räddade stashar, `dependabot/*` ägs av boten, och `preview`
 * är produktens staging.
 */
export const PROTECTED_BRANCH_PATTERN_FLOORS = Object.freeze([
  "master",
  "main",
  "preview",
  "*BRA*",
  "rescue/*",
  "dependabot/*",
  "archive/*",
]);

const workflowPolicy = JSON.parse(
  fs.readFileSync(path.join(DEFAULT_ROOT, "config/agent-workflow.json"), "utf8"),
);
const configuredProtectedBranchPatterns = workflowPolicy.protectedBranchPatterns;
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

/** @param {string} name */
export function isProtectedBranch(name) {
  return PROTECTED_BRANCH_PATTERNS.some((pattern) => branchPatternRegex(pattern).test(name));
}

/**
 * Remote-delete nekar dessutom policyns trunk, leveransgren och oföränderliga
 * remote-mönster. Samma golv som ovan: konfigurationen kan bara lägga till.
 */
export const REMOTE_DELETE_REFUSED_PATTERNS = Object.freeze([
  ...new Set(
    [
      ...PROTECTED_BRANCH_PATTERNS,
      workflowPolicy.trunk,
      workflowPolicy.deliveryBranch,
      ...(Array.isArray(workflowPolicy.immutableRemoteBranchPatterns)
        ? workflowPolicy.immutableRemoteBranchPatterns
        : []),
    ].filter((pattern) => typeof pattern === "string" && pattern.length > 0),
  ),
]);

/** @param {string} name */
export function isRemoteDeleteRefused(name) {
  return REMOTE_DELETE_REFUSED_PATTERNS.some((pattern) => branchPatternRegex(pattern).test(name));
}

/**
 * Konservativt branchnamn: inga flaggor, refspec-tecken, `..` eller fullständiga
 * refs. Det som inte passar nekas hellre än tolkas.
 *
 * @param {string} name
 */
export function isPlainBranchName(name) {
  return (
    typeof name === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(name) &&
    !name.includes("..") && // traversal-substring-allow: git check-ref-format förbjuder ".." var som helst i ett refnamn
    !name.includes("//") &&
    !name.startsWith("refs/") &&
    !name.endsWith("/") &&
    !name.endsWith(".") &&
    !name.endsWith(".lock")
  );
}

/**
 * `--delete-remote a,b`, `--delete-remote=a,b` och upprepade flaggor.
 * `null` = läget är inte begärt; tom lista = flaggan saknar värde.
 *
 * @param {string[]} argv
 * @returns {string[] | null}
 */
export function parseDeleteRemoteArgs(argv) {
  let found = false;
  const branches = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let value;
    if (arg === "--delete-remote") {
      found = true;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        value = next;
        i += 1;
      }
    } else if (arg.startsWith("--delete-remote=")) {
      found = true;
      value = arg.slice("--delete-remote=".length);
    }
    if (value) branches.push(...value.split(",").map((b) => b.trim()).filter(Boolean));
  }
  return found ? [...new Set(branches)] : null;
}

const SHA_RE = /^[0-9a-f]{40}$/u;

/**
 * Parsa `git ls-remote`-utdata till ref → sha. En annoterad tagg ger även en
 * `^{}`-rad med den peelade commiten; den vinner över tagg-objektets sha.
 *
 * @param {string} output
 * @returns {Map<string, string>}
 */
export function parseLsRemote(output) {
  const refs = new Map();
  const peeled = new Map();
  for (const line of String(output ?? "").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const [sha, ref] = line.trim().split(/\s+/u);
    if (!SHA_RE.test(sha ?? "") || !ref) throw new Error(`ogiltig ls-remote-rad: ${line}`);
    if (ref.endsWith("^{}")) peeled.set(ref.slice(0, -3), sha);
    else refs.set(ref, sha);
  }
  for (const [ref, sha] of peeled) refs.set(ref, sha);
  return refs;
}

/** @typedef {{ status: number | null, stdout: string, stderr: string }} RunResult */
/** @typedef {(cmd: "git" | "gh", args: string[], opts?: { env?: Record<string, string> }) => RunResult} Runner */

/** @param {string} root @returns {Runner} */
export function createRunner(root) {
  return (cmd, args, { env } = {}) => {
    const res = spawnSync(cmd, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
    });
    return {
      status: res.error ? null : res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr || res.error?.message || "",
    };
  };
}

export const archiveTagFor = (branch) => `archive/${branch}`;

/**
 * Planera EN remote-delete. Läser bara (ls-remote + gh); skriver ingenting.
 *
 * Ordning är med flit: namnskydd → existens → öppen PR (gh-fel = nej) → bevis.
 * Bevis är antingen `archive/<branch>` på exakt tip, eller en mergad PR med
 * samma branch och head-SHA. Saknas båda planeras en ny archive-tagg. En
 * archive-tagg som pekar på något annat är alltid stopp.
 *
 * @param {{ branch: string, run: Runner }} input
 */
export function planRemoteDelete({ branch, run }) {
  const refuse = (reason) => ({ branch, action: "refuse", reason });
  if (!isPlainBranchName(branch)) return refuse("ogiltigt branchnamn");
  if (isRemoteDeleteRefused(branch)) return refuse("skyddad/oföränderlig branch enligt policy");

  const tag = archiveTagFor(branch);
  const headRef = `refs/heads/${branch}`;
  const tagRef = `refs/tags/${tag}`;
  const ls = run("git", ["ls-remote", "origin", headRef, tagRef, `${tagRef}^{}`]);
  if (ls.status !== 0) return refuse(`git ls-remote misslyckades: ${ls.stderr.trim()}`);
  let refs;
  try {
    refs = parseLsRemote(ls.stdout);
  } catch (err) {
    return refuse(String(err?.message ?? err));
  }
  const tip = refs.get(headRef);
  if (!tip) return { branch, action: "absent", reason: "finns inte på origin" };

  const gh = run("gh", [
    "pr",
    "list",
    "--state",
    "all",
    "--head",
    branch,
    "--limit",
    "1000",
    "--json",
    "headRefName,headRefOid,state,mergedAt",
  ]);
  if (gh.status !== 0) return refuse(`gh svarade inte (${gh.stderr.trim() || "okänt fel"}) — nekar`);
  let lifecycle;
  try {
    const rows = JSON.parse(gh.stdout);
    lifecycle = parsePrLifecycle(
      Array.isArray(rows) ? rows.filter((row) => row?.headRefName === branch) : rows,
    );
  } catch {
    return refuse("gh gav ett oläsbart svar — nekar");
  }
  if (lifecycle.openHeads.has(branch)) return refuse("har en ÖPPEN PR");

  const tagSha = refs.get(tagRef) ?? null;
  if (tagSha && tagSha !== tip) {
    return refuse(`${tag} pekar på ${tagSha}, inte på remote-tip ${tip}`);
  }
  if (tagSha) return { branch, action: "delete", tip, tag, proof: "archive", createTag: false };
  if (isExactMergedPr(lifecycle, branch, tip)) {
    return { branch, action: "delete", tip, tag, proof: "merged-pr", createTag: false };
  }
  return { branch, action: "delete", tip, tag, proof: "archive", createTag: true };
}

/**
 * Utför en planerad remote-delete. Tagg-pushen är en vanlig push av en ny ref;
 * delete är `git push origin --delete` utan force och utan `--no-verify`, så
 * pre-push-hooken jämför beviset mot remote-tipet git själv ser vid push.
 *
 * @param {{ plan: ReturnType<typeof planRemoteDelete>, run: Runner }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function applyRemoteDelete({ plan, run }) {
  const { branch, tip, tag } = plan;
  const headRef = `refs/heads/${branch}`;
  const fail = (reason) => ({ ok: false, reason });
  if (plan.createTag) {
    const fetched = run("git", [
      "fetch",
      "--quiet",
      "origin",
      `+${headRef}:refs/remotes/origin/${branch}`,
    ]);
    if (fetched.status !== 0) return fail(`kunde inte hämta ${branch}: ${fetched.stderr.trim()}`);
    const tagPush = run("git", ["push", "origin", `${tip}:refs/tags/${tag}`]);
    if (tagPush.status !== 0) return fail(`kunde inte pusha ${tag}: ${tagPush.stderr.trim()}`);
    const tagCheck = run("git", ["ls-remote", "origin", `refs/tags/${tag}`]);
    let tagSha = null;
    try {
      tagSha = tagCheck.status === 0 ? parseLsRemote(tagCheck.stdout).get(`refs/tags/${tag}`) : null;
    } catch {
      tagSha = null;
    }
    if (tagSha !== tip) return fail(`${tag} kunde inte verifieras på origin efter push`);
  }

  const reread = run("git", ["ls-remote", "origin", headRef]);
  if (reread.status !== 0) return fail(`git ls-remote misslyckades: ${reread.stderr.trim()}`);
  let liveTip;
  try {
    liveTip = parseLsRemote(reread.stdout).get(headRef) ?? null;
  } catch (err) {
    return fail(String(err?.message ?? err));
  }
  if (liveTip !== tip) {
    return fail(`remote-tip ändrades (${tip} → ${liveTip ?? "borta"}); branchen bevaras`);
  }

  const del = run("git", ["push", "origin", "--delete", headRef], {
    env: {
      SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH: branch,
      SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA: tip,
    },
  });
  if (del.status !== 0) return fail(`git push --delete misslyckades: ${del.stderr.trim()}`);
  return { ok: true, reason: "raderad" };
}

/**
 * @param {{ branches: string[], apply?: boolean, run: Runner, log?: (s: string) => void }} input
 * @returns {{ ok: boolean, results: { branch: string, outcome: string, reason: string, tip?: string, tag?: string }[] }}
 */
export function runDeleteRemote({ branches, apply = false, run, log = (s) => console.log(s) }) {
  const results = [];
  if (branches.length === 0) {
    log("[tidy] --delete-remote kräver minst ett branchnamn: --delete-remote <branch>[,<branch>...]");
    return { ok: false, results };
  }
  for (const branch of branches) {
    const plan = planRemoteDelete({ branch, run });
    if (plan.action === "refuse") {
      log(`[tidy] NEKAR remote-delete ${branch}: ${plan.reason}`);
      results.push({ branch, outcome: "refused", reason: plan.reason });
      continue;
    }
    if (plan.action === "absent") {
      log(`[tidy] remote-delete ${branch}: ${plan.reason} — inget att göra`);
      results.push({ branch, outcome: "absent", reason: plan.reason });
      continue;
    }
    const proof =
      plan.proof === "merged-pr"
        ? `mergad PR med head ${plan.tip}`
        : plan.createTag
          ? `${plan.tag} saknas — ${apply ? "skapar" : "skulle skapa"} och pusha den på ${plan.tip}`
          : `${plan.tag} pekar redan på ${plan.tip}`;
    log(`[tidy] remote-delete ${branch}: tip ${plan.tip}, ingen öppen PR, bevis: ${proof}`);
    if (!apply) {
      log(
        `[tidy] skulle radera origin/${branch} @ ${plan.tip} (dry-run, vanlig push --delete, ingen force)`,
      );
      results.push({ branch, outcome: "planned", reason: proof, tip: plan.tip, tag: plan.tag });
      continue;
    }
    const outcome = applyRemoteDelete({ plan, run });
    if (!outcome.ok) {
      log(`[tidy] STOPP remote-delete ${branch}: ${outcome.reason}`);
      results.push({ branch, outcome: "failed", reason: outcome.reason, tip: plan.tip });
      continue;
    }
    log(
      `[tidy] raderade origin/${branch} @ ${plan.tip}` +
        (plan.proof === "archive" ? ` (bevarad som tagg ${plan.tag})` : " (mergad PR-head)"),
    );
    results.push({ branch, outcome: "deleted", reason: proof, tip: plan.tip, tag: plan.tag });
  }
  const ok = results.every((r) => r.outcome !== "refused" && r.outcome !== "failed");
  if (!apply && results.some((r) => r.outcome === "planned")) {
    log("[tidy] klart (dry-run). Kör om med --apply för att arkivera och radera.");
  }
  return { ok, results };
}

/**
 * Ska en LOKAL branch raderas? Kräver att remoten är borta och att innehållet
 * finns i basen — annars är den pågående arbete.
 *
 * @param {{ name: string, upstreamGone: boolean, mergedIntoBase: boolean, mergedByExactPr?: boolean, isCurrent: boolean, lockedByLiveWorktree?: boolean }} b
 * @returns {{ action: "delete" | "keep", reason: string }}
 */
export function classifyLocalBranch({
  name,
  upstreamGone,
  mergedIntoBase,
  mergedByExactPr = false,
  isCurrent,
  lockedByLiveWorktree = false,
}) {
  if (isCurrent) return { action: "keep", reason: "utcheckad" };
  if (lockedByLiveWorktree) return { action: "keep", reason: "utcheckad i levande worktree" };
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
 * @param {{ branch: string | null, hasOpenPr: boolean, isDirty: boolean, mergedIntoBase: boolean, mergedByExactPr?: boolean, isMain: boolean }} wt
 * @returns {{ verdict: "keep" | "free", reason: string }}
 */
export function classifyWorktree({
  branch,
  hasOpenPr,
  isDirty,
  mergedIntoBase,
  mergedByExactPr = false,
  isMain,
}) {
  if (isMain) return { verdict: "keep", reason: "huvudcheckouten — delas med ägaren" };
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
 * `branch -D` ska inte sväljas tyst: en worktree-lås eller annat git-fel
 * ska synas i rapporten så nästa körning inte ser ut som att städen gick.
 *
 * @returns {string | null} feltext, eller null vid lyckad radering
 */
function deleteLocalBranch(name, root) {
  try {
    execFileSync("git", ["branch", "-D", name], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return null;
  } catch (err) {
    const stderr = typeof err?.stderr === "string" ? err.stderr.trim() : "";
    return stderr || err?.message || `git branch -D ${name} misslyckades`;
  }
}

/**
 * Är `ref` ancestor av preview eller master? Enbart ancestry — en
 * squash-mergad branch svarar `false` här och bevisas i stället av
 * `isExactMergedPr`.
 */
export function isMergedIntoLandedBase(ref, root) {
  if (!ref) return false;
  return LANDED_REFS.some(
    (base) => git(["merge-base", "--is-ancestor", ref, base], root, { allowFail: true }) !== null,
  );
}

/**
 * Git porcelain skriver antingen `prunable` eller `prunable <orsak>`.
 * Exakt `=== "prunable"` missar den vanliga raden
 * `prunable gitdir file points to non-existent location`.
 *
 * @param {string} line
 */
export function isPrunablePorcelainLine(line) {
  const trimmed = String(line ?? "").trim();
  return trimmed === "prunable" || trimmed.startsWith("prunable ");
}

/**
 * Är branchen utcheckad i en worktree vars katalog fortfarande finns?
 * Spökposter (`prunable`) räknas inte — prune tar bort låset.
 *
 * @param {string} name
 * @param {{ branch: string | null, prunable?: boolean }[]} worktrees
 */
export function isBranchLockedByLiveWorktree(name, worktrees) {
  if (!name) return false;
  return worktrees.some((wt) => !wt.prunable && wt.branch === name);
}

/**
 * Parsa `git worktree list --porcelain`. Första posten är alltid huvudträdet.
 *
 * @param {string[]} lines
 * @returns {{ path: string, branch: string | null, prunable: boolean }[]}
 */
export function parsePorcelainWorktrees(lines) {
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const wt = /^worktree (.+)$/.exec(trimmed);
    if (wt?.[1]) {
      out.push({ path: wt[1], branch: null, prunable: false });
      continue;
    }
    const br = /^branch refs\/heads\/(.+)$/.exec(trimmed);
    if (br?.[1] && out.length > 0) {
      out[out.length - 1].branch = br[1];
      continue;
    }
    if (isPrunablePorcelainLine(trimmed) && out.length > 0) {
      out[out.length - 1].prunable = true;
    }
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

  const current = git(["rev-parse", "--abbrev-ref", "HEAD"], root);
  const lifecycle = loadPrLifecycle(root);
  // Ett enda gh-anrop återanvänds av branch-, worktree- och remote-klassningen.
  const openPrBranches = lifecycle?.openHeads ?? null;

  // --- 1. Parse → prune spöken → lista om ---
  // Porcelain-raden är `prunable` eller `prunable <orsak>`. Prune måste ske
  // innan branch-delete: Git vägrar `branch -D` så länge en (även död)
  // worktree-post fortfarande har branchen utcheckad.
  let wtLines = gitLines(["worktree", "list", "--porcelain"], root);
  let worktrees = parsePorcelainWorktrees(wtLines);
  const prunable = worktrees.filter((wt) => wt.prunable).length;
  if (prunable > 0) {
    log(`[tidy] ${apply ? "prunar" : "skulle pruna"} ${prunable} avregistrerad worktree-post`);
    if (apply) {
      git(["worktree", "prune"], root, { allowFail: true });
      wtLines = gitLines(["worktree", "list", "--porcelain"], root);
      worktrees = parsePorcelainWorktrees(wtLines);
    }
    planned.push(`${prunable} worktree-post(er)`);
  } else {
    log("[tidy] worktrees: inget att pruna.");
  }

  // --- 1b. Levande worktrees: vilka är orörbara? ---
  // Rapport, aldrig radering. Katalogen tas bort med `npm run worktree:remove`,
  // som kopplar loss junctions först. Poängen här är att säga VILKA som är fria.
  if (worktrees.length > 1) {
    for (const wt of worktrees.slice(1)) {
      if (wt.prunable) {
        log(
          `[tidy] worktree spökpost: ${wt.path} [${wt.branch ?? "detached"}] — katalog borta, prune hanterar den`,
        );
        continue;
      }
      const dirty = isWorktreeDirty(git(["status", "--porcelain"], wt.path, { allowFail: true }));
      const merged = isMergedIntoLandedBase(wt.branch, root);
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
      });
      const label = verdict === "free" ? "FRI" : "behåll";
      log(`[tidy] worktree ${label}: ${wt.path} [${wt.branch ?? "detached"}] — ${reason}`);
    }
    if (openPrBranches === null) {
      log("[tidy]   (gh svarade inte — alla behandlas som upptagna, med flit)");
    }
    log("[tidy]   Ta bort en FRI med: npm run worktree:remove -- <sökväg>");
  }

  // --- 2. Lokala döda brancher (efter prune så spöklås släpper) ---
  const rows = gitLines(
    ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"],
    root,
  );
  const localDelete = [];
  for (const row of rows) {
    const [name, track = ""] = row.split("\t");
    const mergedIntoBase = isMergedIntoLandedBase(name, root);
    const branchHead = git(["rev-parse", name], root, { allowFail: true });
    const verdict = classifyLocalBranch({
      name,
      upstreamGone: track.includes("gone"),
      mergedIntoBase,
      mergedByExactPr: isExactMergedPr(lifecycle, name, branchHead),
      isCurrent: name === current,
      lockedByLiveWorktree: isBranchLockedByLiveWorktree(name, worktrees),
    });
    if (verdict.action === "delete") localDelete.push({ name, reason: verdict.reason });
  }
  if (localDelete.length === 0) {
    log("[tidy] lokala brancher: inget att rensa.");
  } else {
    for (const b of localDelete) {
      log(`[tidy] ${apply ? "raderar" : "skulle radera"} lokal branch ${b.name} (${b.reason})`);
      if (apply) {
        const error = deleteLocalBranch(b.name, root);
        if (error) log(`[tidy] kunde inte radera ${b.name}: ${error}`);
      }
    }
    planned.push(`${localDelete.length} lokal(a) branch(er)`);
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
        "         Rapport, inget mer. Radera efter en titt med: npm run tidy -- --delete-remote <branch> --apply",
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
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const deleteRemote = parseDeleteRemoteArgs(argv);
  if (deleteRemote !== null) {
    const { ok } = runDeleteRemote({
      branches: deleteRemote,
      apply,
      run: createRunner(DEFAULT_ROOT),
    });
    if (!ok) process.exitCode = 1;
  } else {
    runTidy({ apply, fetch: !argv.includes("--no-fetch") });
  }
}
