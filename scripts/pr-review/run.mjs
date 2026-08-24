import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import OpenAI from "openai";
import {
  exhaustiveInstructions,
  exhaustiveJsonSchema,
  followUpInstructions,
  followUpJsonSchema,
} from "./core.mjs";
import { runReviewAutomation } from "./automation.mjs";
import { writeReviewRunResult } from "./receipt.mjs";

const API_VERSION = "2022-11-28";
const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function parseLinkHeader(value) {
  if (!value) return null;
  for (const part of value.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match) return match[1];
  }
  return null;
}

export function createGitHubAdapter({ token, repository, fetchImpl = fetch }) {
  const baseUrl = "https://api.github.com";

  async function request(
    pathOrUrl,
    { method = "GET", body, accept = "application/vnd.github+json" } = {},
  ) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "sajtmaskin-pr-reviewer",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(
        `GitHub API ${method} ${new URL(url).pathname} failed (${response.status}): ${text}`,
      );
    }
    if (response.status === 204) return null;
    if (accept.includes("diff")) return response.text();
    return response.json();
  }

  async function paginate(path) {
    const values = [];
    let url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    while (url) {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "sajtmaskin-pr-reviewer",
        },
      });
      if (!response.ok)
        throw new Error(`GitHub API GET ${new URL(url).pathname} failed (${response.status})`);
      values.push(...(await response.json()));
      url = parseLinkHeader(response.headers.get("link"));
    }
    return values;
  }

  async function getFileContent(repo, path, ref) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const payload = await request(
      `/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );
    if (
      !payload ||
      Array.isArray(payload) ||
      payload.type !== "file" ||
      payload.encoding !== "base64"
    ) {
      return "[Filinnehållet kunde inte hämtas som text.]";
    }
    const text = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
    return text.length > 80_000 ? `${text.slice(0, 80_000)}\n[TRUNCATED]` : text;
  }

  return {
    async getPullRequest(number) {
      const raw = await request(`/repos/${repository}/pulls/${number}`);
      return {
        repository,
        number: raw.number,
        baseRef: raw.base.ref,
        headSha: raw.head.sha,
        // GitHub's list-files endpoint is capped at 3,000 entries. Preserve the
        // authoritative PR count so the reviewer can prove that pagination
        // returned the complete file universe before calling it exhaustive.
        changedFiles: raw.changed_files,
        headRepository: raw.head.repo?.full_name ?? repository,
        draft: raw.draft,
        mergedAt: raw.merged_at,
      };
    },
    listIssueComments(number) {
      return paginate(`/repos/${repository}/issues/${number}/comments`).then((items) =>
        items.map((item) => ({
          id: item.id,
          body: item.body ?? "",
          createdAt: item.created_at,
          authorAssociation: item.author_association,
          author: item.user?.login ?? "unknown",
        })),
      );
    },
    listReviews(number) {
      return paginate(`/repos/${repository}/pulls/${number}/reviews`).then((items) =>
        items.map((item) => ({
          id: item.id,
          body: item.body ?? "",
          author: item.user?.login ?? "unknown",
          commitId: item.commit_id,
        })),
      );
    },
    listReviewComments(number) {
      return paginate(`/repos/${repository}/pulls/${number}/comments`).then((items) =>
        items.map((item) => ({
          id: item.id,
          body: item.body ?? "",
          author: item.user?.login ?? "unknown",
          authorAssociation: item.author_association,
          createdAt: item.created_at,
        })),
      );
    },
    listPullFiles(number) {
      return paginate(`/repos/${repository}/pulls/${number}/files`);
    },
    getPullDiff(number) {
      return request(`/repos/${repository}/pulls/${number}`, {
        accept: "application/vnd.github.v3.diff",
      });
    },
    createIssueComment(number, body) {
      return request(`/repos/${repository}/issues/${number}/comments`, {
        method: "POST",
        body: { body },
      });
    },
    updateIssueComment(commentId, body) {
      return request(`/repos/${repository}/issues/comments/${commentId}`, {
        method: "PATCH",
        body: { body },
      });
    },
    createReview(number, body) {
      return request(`/repos/${repository}/pulls/${number}/reviews`, { method: "POST", body });
    },
    reactToReviewComment(commentId, content) {
      return request(`/repos/${repository}/pulls/comments/${commentId}/reactions`, {
        method: "POST",
        accept: "application/vnd.github+json",
        body: { content },
      });
    },
    async getFindingContext(pr, findings) {
      const paths = [...new Set(findings.map((finding) => finding.path))];
      const relevantFiles = [];
      for (const path of paths) {
        let content;
        try {
          content = await getFileContent(pr.headRepository, path, pr.headSha);
        } catch (error) {
          content = `[Kunde inte läsa aktuell fil: ${error instanceof Error ? error.message : String(error)}]`;
        }
        relevantFiles.push({ path, content });
      }
      const [issueComments, inlineComments] = await Promise.all([
        this.listIssueComments(pr.number),
        this.listReviewComments(pr.number),
      ]);
      const maintainerComments = [...issueComments, ...inlineComments]
        .filter((comment) => MAINTAINER_ASSOCIATIONS.has(comment.authorAssociation))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-30)
        .map(({ author, body }) => ({ author, body: body.slice(0, 4_000) }));
      return { relevantFiles, maintainerComments };
    },
  };
}

async function loadReviewerModels() {
  const manifest = JSON.parse(await readFile("config/ai_models/manifest.json", "utf8"));
  const workload = manifest.workloads.find((item) => item.id === "github_pr_reviewer");
  if (!workload?.defaultModel || !workload?.followUpModel) {
    throw new Error("config/ai_models/manifest.json saknar github_pr_reviewer-modeller");
  }
  return { exhaustiveModel: workload.defaultModel, followUpModel: workload.followUpModel };
}

export function createOpenAIReviewer({ apiKey, exhaustiveModel, followUpModel, client }) {
  const openai = client ?? new OpenAI({ apiKey, maxRetries: 2, timeout: 14 * 60 * 1000 });
  async function run({ model, instructions, input, schema, effort, maxOutputTokens }) {
    const response = await openai.responses.create({
      model,
      instructions,
      input,
      reasoning: { effort },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "pr_review_result",
          strict: true,
          schema,
        },
      },
      max_output_tokens: maxOutputTokens,
      store: false,
    });
    if (!response.output_text)
      throw new Error("OpenAI Responses API returned no structured output");
    return JSON.parse(response.output_text);
  }
  return {
    exhaustive(input) {
      return run({
        model: exhaustiveModel,
        instructions: exhaustiveInstructions(),
        input,
        schema: exhaustiveJsonSchema(),
        effort: "high",
        maxOutputTokens: 60_000,
      });
    },
    followUp(input, expectedIds) {
      return run({
        model: followUpModel,
        instructions: followUpInstructions(expectedIds),
        input,
        schema: followUpJsonSchema(expectedIds),
        effort: "low",
        maxOutputTokens: 12_000,
      });
    },
  };
}

export async function main(env = process.env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN saknas");
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY saknas");
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_EVENT_PATH)
    throw new Error("GitHub Actions-kontext saknas");
  if (!env.PR_REVIEW_RESULT_PATH) throw new Error("PR_REVIEW_RESULT_PATH saknas");
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const prNumber = event.pull_request?.number;
  if (!prNumber) throw new Error("Workflow-eventet innehåller inget PR-nummer");
  const models = await loadReviewerModels();
  const github = createGitHubAdapter({
    token: env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
  });
  const model = createOpenAIReviewer({ apiKey: env.OPENAI_API_KEY, ...models });
  const result = await runReviewAutomation({ github, model, prNumber });
  const runResult = await writeReviewRunResult(env.PR_REVIEW_RESULT_PATH, result);
  console.log(
    `PR review automation: ${result.kind}${result.reason ? ` (${result.reason})` : ""}; receipt=${runResult.outcome}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `PR review automation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
