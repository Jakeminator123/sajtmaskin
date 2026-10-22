import { spawnSync } from "node:child_process";

// Ett grönt CI-kvitto gäller exakt ett testat träd. Varje PR-körning skriver ett
// kvitto som notice-annotation på scope-jobbet: head, bas och träd tas från den
// merge-commit som faktiskt checkades ut. Senare körningar får hoppa över tunga
// jobb bara när samma träd redan passerat full CI. Allt som inte kan bevisas,
// inklusive API-fel, ger full CI.

export const RECEIPT_TITLE = "sajtmaskin-ci-receipt";
export const QUALITY_TEST_SHARDS = 4;

// Jobb som måste ha lyckats i en full körning för att den ska räknas som kvitto.
// Lätta stubbar publicerar också success, därför krävs även profile=heavy i
// kvittot och att de tunga jobben (som annars är skipped) faktiskt lyckades.
export const HEAVY_RECEIPT_JOBS = Object.freeze([
  "scope",
  "quality-core",
  ...Array.from({ length: QUALITY_TEST_SHARDS }, (_, index) => `quality-tests (${index + 1})`),
  "quality-contracts",
  "quality-project-persistence",
  "preview-host-guards",
  "dead-code",
  "quality",
  "build",
  "backoffice-tests",
  "schema-drift",
]);

const SHA = /^[0-9a-f]{40}$/u;
const RECEIPT_PATTERN =
  /^v1 head=([0-9a-f]{40}) base=([0-9a-f]{40}) tree=([0-9a-f]{40}) profile=(heavy|light|reused) preview_host=(true|false)$/u;
const MAX_INSPECTED_RUNS = 6;
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

function validSha(value) {
  return SHA.test(String(value ?? "")) && !/^0+$/u.test(value);
}

export function formatReceipt({ head, base, tree, profile, previewHost }) {
  return `v1 head=${head} base=${base} tree=${tree} profile=${profile} preview_host=${previewHost === true}`;
}

export function parseReceipt(message) {
  const match = RECEIPT_PATTERN.exec(String(message ?? "").trim());
  if (!match) return null;
  const [, head, base, tree, profile, previewHost] = match;
  return { head, base, tree, profile, previewHost: previewHost === "true" };
}

/**
 * Läs det träd som faktiskt testas. För pull_request är `sha` GitHubs test-
 * merge-commit (förälder 1 = bas, förälder 2 = head); för push är det tipet.
 */
export function readTestedCommit({ sha, merge = false, cwd, gitCommand = spawnSync }) {
  if (!validSha(sha)) return null;
  const revisions = merge ? [`${sha}^{tree}`, `${sha}^1`, `${sha}^2`] : [`${sha}^{tree}`];
  // `--verify` tar exakt ett argument; utan den ger varje revision en rad och
  // en okänd revision ger status != 0.
  const result = gitCommand("git", ["rev-parse", ...revisions], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) return null;
  const lines = String(result.stdout ?? "").trim().split(/\r?\n/u);
  if (lines.length !== revisions.length || !lines.every(validSha)) return null;
  const [tree, base = null, head = null] = lines;
  return merge ? { tree, base, head } : { tree };
}

async function getJson(url, { token, fetchImpl }) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

function checkRunId(job) {
  const match = /\/check-runs\/(\d+)$/u.exec(String(job?.check_run_url ?? ""));
  return match ? match[1] : null;
}

async function readRunReceipt({ run, api }) {
  const { jobs } = await getJson(
    `${api.apiUrl}/repos/${api.repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    api,
  );
  if (!Array.isArray(jobs)) throw new Error("jobs listing is malformed");
  const scopeJobs = jobs.filter((job) => job?.name === "scope");
  const scopeCheckRun = scopeJobs.length === 1 ? checkRunId(scopeJobs[0]) : null;
  if (!scopeCheckRun || scopeJobs[0].conclusion !== "success") return { receipt: null, jobs };
  const annotations = await getJson(
    `${api.apiUrl}/repos/${api.repository}/check-runs/${scopeCheckRun}/annotations?per_page=50`,
    api,
  );
  if (!Array.isArray(annotations)) throw new Error("annotation listing is malformed");
  const receipts = annotations
    .filter((entry) => entry?.title === RECEIPT_TITLE && entry?.annotation_level === "notice")
    .map((entry) => parseReceipt(entry.message));
  if (receipts.length !== 1 || !receipts[0]) return { receipt: null, jobs };
  return { receipt: receipts[0], jobs };
}

function provesFullRun(jobs) {
  if (!jobs.every((job) => job?.status === "completed" &&
      (job.conclusion === "success" || job.conclusion === "skipped"))) return false;
  return HEAVY_RECEIPT_JOBS.every((name) => {
    const matches = jobs.filter((job) => job.name === name);
    return matches.length === 1 && matches[0].conclusion === "success";
  });
}

/**
 * Leta upp ett grönt fullt kvitto för exakt `tree` bland CI:s PR-körningar på
 * `headSha`. Nyaste icke-avbrutna körning med samma träd avgör: ett rött eller
 * okänt utfall stoppar återanvändning, en lätt eller återanvänd grön körning
 * bevisar inget själv men får inte heller dölja en äldre full körning.
 */
export async function findReusableReceipt({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
  fetchImpl = fetch,
  headSha,
  tree,
  base = null,
  currentRunId = process.env.GITHUB_RUN_ID,
}) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "") ||
      !validSha(headSha) || !validSha(tree) || (base !== null && !validSha(base))) {
    return { reuse: null, detail: "missing-input" };
  }
  const api = { apiUrl, repository, token, fetchImpl };
  try {
    const listing = await getJson(
      `${apiUrl}/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${headSha}&per_page=30`,
      api,
    );
    const runs = Array.isArray(listing?.workflow_runs) ? [...listing.workflow_runs] : null;
    if (!runs) return { reuse: null, detail: "malformed-run-listing" };
    runs.sort((left, right) => Number(right?.id ?? 0) - Number(left?.id ?? 0));

    let inspected = 0;
    for (const run of runs) {
      if (String(run?.id) === String(currentRunId ?? "")) continue;
      if (run?.head_sha !== headSha || run?.event !== "pull_request" ||
          run?.path !== CI_WORKFLOW_PATH || run?.head_repository?.full_name !== repository) continue;
      if (run.status !== "completed") continue;
      if (run.conclusion === "cancelled" || run.conclusion === "skipped") continue;
      if (++inspected > MAX_INSPECTED_RUNS) return { reuse: null, detail: "inspection-limit" };

      const { receipt, jobs } = await readRunReceipt({ run, api });
      if (!receipt) {
        // Ett grönt resultat utan kvitto (äldre format) bevisar inget men
        // motsäger inget. Ett rött resultat med okänt träd stoppar.
        if (run.conclusion === "success") continue;
        return { reuse: null, detail: `unknown-tree-${run.conclusion}:${run.id}` };
      }
      if (receipt.head !== headSha || receipt.tree !== tree || (base !== null && receipt.base !== base)) {
        continue;
      }
      if (run.conclusion !== "success") {
        return { reuse: null, detail: `same-tree-${run.conclusion}:${run.id}` };
      }
      if (receipt.profile !== "heavy") continue;
      if (!provesFullRun(jobs)) return { reuse: null, detail: `incomplete-heavy-run:${run.id}` };
      return { reuse: { runId: String(run.id), previewHost: receipt.previewHost }, detail: "reused" };
    }
    return { reuse: null, detail: "no-matching-receipt" };
  } catch (error) {
    return { reuse: null, detail: `api-error:${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Den PR vars squash/merge skapade exakt `sha` på preview, annars null. */
export async function findMergedPreviewPullRequest({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
  fetchImpl = fetch,
  sha,
}) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "") || !validSha(sha)) return null;
  try {
    const pulls = await getJson(`${apiUrl}/repos/${repository}/commits/${sha}/pulls?per_page=10`, {
      token,
      fetchImpl,
    });
    if (!Array.isArray(pulls)) return null;
    const merged = pulls.filter((pr) =>
      pr?.merged_at && pr.merge_commit_sha === sha && pr.base?.ref === "preview" &&
      pr.head?.repo?.full_name === repository && validSha(pr.head?.sha));
    return merged.length === 1 ? { number: merged[0].number, headSha: merged[0].head.sha } : null;
  } catch {
    return null;
  }
}

/**
 * Fullt beslut → återanvänt beslut. Tunga jobb hoppas över men required checks
 * publiceras fortfarande som lätta kvitton; preview-host körs om kvittot saknade den.
 */
export function applyReceipt(decision, reuse) {
  return {
    ...decision,
    runHeavy: false,
    safeDocsOnly: false,
    runPreviewHost: decision.runPreviewHost && !reuse.previewHost,
    reason: `reused-green-receipt:${reuse.runId}`,
    receiptReused: true,
  };
}
