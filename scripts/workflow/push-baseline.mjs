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
    // Do not filter status=success: that would hide a newer failed/running rerun.
    const url = `${apiUrl}/repos/${repository}/actions/workflows/${workflow}/runs?event=push&head_sha=${sha}&per_page=1`;
    const response = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const { workflow_runs: runs } = await response.json();
    if (!Array.isArray(runs) || runs.length !== 1) return false;
    const run = runs[0];
    return run?.head_sha === sha && run?.head_branch === "preview" &&
      run?.event === "push" && run?.path === `.github/workflows/${workflow}` &&
      run?.head_repository?.full_name === repository &&
      run?.status === "completed" && run?.conclusion === "success";
  } catch {
    return false;
  }
}
