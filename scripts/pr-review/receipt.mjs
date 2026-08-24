import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const REVIEW_RUN_RESULT_VERSION = 1;
export const TRUSTED_REVIEW_CHECK_NAME = "trusted-pr-ai-review";

const SHA_RE = /^[0-9a-f]{40}$/i;

function unqualifiedReason(result) {
  if (typeof result?.reason === "string" && result.reason.trim()) return result.reason.trim();
  if (result?.kind === "follow-up") return "follow-up-does-not-review-current-diff";
  if (result?.kind === "skip") return "automation-skipped";
  if (result?.kind === "receipt-recovery") return "published-review-recovery-not-verified";
  return "no-qualifying-current-head-review";
}

export function createReviewRunResult(automationResult) {
  const lastRun = automationResult?.state?.lastRun;
  const reviewedHeadSha = lastRun?.headSha;
  const handoffHeadSha =
    automationResult?.kind === "account-fallback" &&
    SHA_RE.test(String(automationResult?.headSha ?? ""))
      ? String(automationResult.headSha).toLowerCase()
      : null;
  const reviewId = automationResult?.state?.github?.exhaustiveReviewId;
  const publishedReview = automationResult?.publishedReview;
  const qualifies =
    ["exhaustive", "receipt-recovery"].includes(automationResult?.kind) &&
    lastRun?.kind === "exhaustive" &&
    lastRun?.status === "completed" &&
    SHA_RE.test(String(reviewedHeadSha ?? "")) &&
    automationResult.state.latestProcessedHeadSha === reviewedHeadSha &&
    Number.isSafeInteger(reviewId) &&
    reviewId > 0 &&
    publishedReview?.reviewId === reviewId &&
    publishedReview?.headSha === reviewedHeadSha;

  return {
    version: REVIEW_RUN_RESULT_VERSION,
    automationKind: String(automationResult?.kind ?? "unknown"),
    outcome: qualifies ? "qualified" : "unqualified",
    review: qualifies
      ? {
          kind: "exhaustive",
          scope: "full-current-diff",
          headSha: reviewedHeadSha,
          reviewId,
        }
      : null,
    ...(automationResult?.kind === "account-fallback" ? { handoffHeadSha } : {}),
    reason: qualifies ? null : unqualifiedReason(automationResult),
  };
}

export function isReviewRunResult(value) {
  if (!value || value.version !== REVIEW_RUN_RESULT_VERSION) return false;
  if (!["qualified", "unqualified"].includes(value.outcome)) return false;
  if (typeof value.automationKind !== "string") return false;
  if (value.outcome === "unqualified") {
    return (
      value.review === null &&
      typeof value.reason === "string" &&
      value.reason.length > 0 &&
      (value.automationKind !== "account-fallback" ||
        SHA_RE.test(String(value.handoffHeadSha ?? "")))
    );
  }
  return (
    value.reason === null &&
    ["exhaustive", "receipt-recovery"].includes(value.automationKind) &&
    value.review?.kind === "exhaustive" &&
    value.review?.scope === "full-current-diff" &&
    SHA_RE.test(String(value.review?.headSha ?? "")) &&
    Number.isSafeInteger(value.review?.reviewId) &&
    value.review.reviewId > 0
  );
}

export function decideTrustedReceipt({ runResult, currentHeadSha }) {
  if (!SHA_RE.test(String(currentHeadSha ?? ""))) {
    return {
      conclusion: "action_required",
      title: "Trusted PR AI receipt blocked",
      summary: "GitHub did not return a valid current PR head SHA.",
    };
  }
  if (!isReviewRunResult(runResult)) {
    return {
      conclusion: "action_required",
      title: "Trusted PR AI receipt blocked",
      summary: `No valid machine-readable review result exists for current head ${currentHeadSha}.`,
    };
  }
  if (runResult.outcome !== "qualified") {
    if (
      runResult.automationKind === "account-fallback" &&
      ["openai_key_missing", "openai_quota"].includes(runResult.reason)
    ) {
      if (runResult.handoffHeadSha !== currentHeadSha) {
        return {
          conclusion: "action_required",
          title: "PR review handoff is stale",
          summary: `Account handoff covered ${runResult.handoffHeadSha}, but the current PR head is ${currentHeadSha}.`,
        };
      }
      return {
        conclusion: "neutral",
        title: "PR review handed off to the Codex account",
        summary: `The Platform API could not review current head ${currentHeadSha}; a separate account-backed review is required.`,
      };
    }
    return {
      conclusion: "action_required",
      title: "Current head lacks a qualifying PR AI review",
      summary: `Automation result ${runResult.automationKind} did not review the full current diff (${runResult.reason}).`,
    };
  }
  if (runResult.review.headSha !== currentHeadSha) {
    return {
      conclusion: "action_required",
      title: "Trusted PR AI review is stale",
      summary: `Qualifying review covered ${runResult.review.headSha}, but the current PR head is ${currentHeadSha}.`,
    };
  }
  return {
    conclusion: "success",
    title: "Trusted PR AI review completed",
    summary: `A qualifying full-diff review completed for current head ${currentHeadSha}.`,
  };
}

export function buildCheckRunPayload({ runResult, currentHeadSha, prNumber }) {
  const decision = decideTrustedReceipt({ runResult, currentHeadSha });
  return {
    name: TRUSTED_REVIEW_CHECK_NAME,
    head_sha: currentHeadSha,
    status: "completed",
    conclusion: decision.conclusion,
    output: {
      title: decision.title,
      summary: `PR #${prNumber}: ${decision.summary}`,
    },
  };
}

export async function writeReviewRunResult(path, automationResult) {
  if (!path) throw new Error("PR_REVIEW_RESULT_PATH saknas");
  const runResult = createReviewRunResult(automationResult);
  await writeFile(path, `${JSON.stringify(runResult)}\n`, "utf8");
  return runResult;
}

async function githubRequest({ token, repository, path, method = "GET", body, fetchImpl }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sajtmaskin-pr-review-receipt",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function publishTrustedReceipt({
  token,
  repository,
  prNumber,
  resultPath,
  fetchImpl = fetch,
}) {
  const rawPr = await githubRequest({
    token,
    repository,
    path: `/pulls/${prNumber}`,
    fetchImpl,
  });
  const currentHeadSha = rawPr?.head?.sha;
  let runResult = null;
  try {
    runResult = JSON.parse(await readFile(resultPath, "utf8"));
  } catch {
    // Invalid/missing result is published as action_required on the current
    // head instead of ever being upgraded to a success receipt.
  }
  const payload = buildCheckRunPayload({ runResult, currentHeadSha, prNumber });
  await githubRequest({
    token,
    repository,
    path: "/check-runs",
    method: "POST",
    body: payload,
    fetchImpl,
  });
  return payload;
}

async function main(env = process.env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN saknas");
  if (!env.GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY saknas");
  if (!env.PR_NUMBER || !/^\d+$/.test(env.PR_NUMBER)) throw new Error("PR_NUMBER saknas");
  if (!env.PR_REVIEW_RESULT_PATH) throw new Error("PR_REVIEW_RESULT_PATH saknas");
  const payload = await publishTrustedReceipt({
    token: env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    prNumber: Number(env.PR_NUMBER),
    resultPath: env.PR_REVIEW_RESULT_PATH,
  });
  console.log(
    `Trusted PR review receipt: ${payload.conclusion} for ${payload.head_sha} (${payload.output.title})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `Trusted PR review receipt failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
