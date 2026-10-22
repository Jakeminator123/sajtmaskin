const MAX_LISTED_RUNS = 16;

async function getJson(url, { token, fetchImpl }) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

/**
 * Alla körningar av `workflow` på exakt `sha`, nyaste först.
 *
 * Sökningen `actions/workflows/{wf}/runs?head_sha=` är eventuellt konsistent och
 * gav upprepat 0 träffar för gröna körningar (mätt 2026-10-22). Vägen går därför
 * via commitens check-runs för jobbet `scope` (finns i ci.yml och
 * dossier-acceptance.yml), deras körnings-id och en direkt hämtning per id.
 * API-fel kastas; anroparna tolkar fel som "inte bevisat".
 *
 * @param {{ apiUrl: string, repository: string, token: string, fetchImpl: typeof fetch,
 *   sha: string, workflow: string }} input
 */
export async function listWorkflowRunsForCommit({ apiUrl, repository, token, fetchImpl, sha, workflow }) {
  const api = { token, fetchImpl };
  const listing = await getJson(
    `${apiUrl}/repos/${repository}/commits/${sha}/check-runs?check_name=scope&filter=all&per_page=100`,
    api,
  );
  if (!Array.isArray(listing?.check_runs)) throw new Error("check-run listing is malformed");
  if (Number(listing.total_count) > listing.check_runs.length) throw new Error("check-run listing is truncated");
  const runIds = [...new Set(listing.check_runs
    .filter((checkRun) => checkRun?.app?.slug === "github-actions")
    .map((checkRun) => /\/actions\/runs\/(\d+)\/job\/\d+$/u.exec(String(checkRun.details_url ?? ""))?.[1])
    .filter(Boolean))]
    .sort((left, right) => Number(right) - Number(left));
  if (runIds.length > MAX_LISTED_RUNS) throw new Error("too many runs on one commit");
  const runs = [];
  for (const id of runIds) {
    const run = await getJson(`${apiUrl}/repos/${repository}/actions/runs/${id}`, api);
    if (String(run?.id) !== id) throw new Error("run lookup returned another run");
    if (run.path === `.github/workflows/${workflow}`) runs.push(run);
  }
  return runs;
}

// Incremental push scope is safe only after the previous exact tip passed
// this workflow. Missing, pending, cancelled and failed runs select full.
export async function verifiedPushBaseline({
  repository = process.env.GITHUB_REPOSITORY,
  sha = process.env.SAJTMASKIN_PUSH_BASE_SHA,
  token = process.env.GITHUB_TOKEN,
  apiUrl = process.env.GITHUB_API_URL || "https://api.github.com",
  workflow,
  fetchImpl = fetch,
} = {}) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/u.test(repository ?? "") ||
      !/^[0-9a-f]{40}$/iu.test(sha ?? "") || /^0+$/u.test(sha) ||
      !["ci.yml", "dossier-acceptance.yml"].includes(workflow)) return false;
  try {
    // The newest push run decides; never skip to an older green one, since that
    // would hide a newer failed/running rerun.
    const runs = await listWorkflowRunsForCommit({ apiUrl, repository, token, fetchImpl, sha, workflow });
    const run = runs.find((candidate) => candidate?.event === "push");
    return run?.head_sha === sha && run?.head_branch === "preview" &&
      run?.event === "push" && run?.path === `.github/workflows/${workflow}` &&
      run?.head_repository?.full_name === repository &&
      run?.status === "completed" && run?.conclusion === "success";
  } catch {
    return false;
  }
}
