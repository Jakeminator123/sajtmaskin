import { describe, expect, it } from "vitest";
import {
  createClient,
  deadlineDecision,
  enrichCheckRunProvenance,
  latestRequiredWorkflowEpoch,
  evaluateHeadChecks,
  hasBaseInvalidation,
  invalidateForBasePush,
  latestInvalidatingFindingEpoch,
  latestConversationEpoch,
  mergeEvidenceFingerprint,
  runTrustedMerge,
  runTrustedGate,
  reviewMutationRequiresNewSignoff,
  targetsTrunk,
  validateTrustedPrAiEvidence,
  validateAccountPrReviewEvidence,
} from "./trusted-review-window.mjs";
import { renderExhaustiveReview, renderStateComment } from "../pr-review/core.mjs";
import {
  renderAccountReviewMarker,
  renderAccountReviewReceiptMarker,
} from "../pr-review/account-fallback.mjs";

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const policy = {
  requiredChecks: ["quality", "backoffice-tests", "schema-drift", "build", "review-window"],
  review: {
    requiredCheckWorkflow: { path: ".github/workflows/ci.yml", event: "pull_request" },
    qualifyingCheckPatterns: ["trusted-pr-ai-review", "bugbot"],
    securityVetoCheckPatterns: ["gitguardian"],
    deploymentCheckNames: ["Vercel"],
  },
};
const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);
const BASE = "c".repeat(40);
const REPOSITORY = "example/repo";
const TRUSTED_REVIEW = { valid: true, completedAtEpoch: 110 };

describe("trusted review mutation ordering", () => {
  it.each(["edited", "dismissed"])("requires new sign-off after review %s", (action) => {
    expect(reviewMutationRequiresNewSignoff("pull_request_review", action)).toBe(true);
  });

  it("does not invalidate merely submitted review timestamps twice", () => {
    expect(reviewMutationRequiresNewSignoff("pull_request_review", "submitted")).toBe(false);
  });
});

describe("base invalidation marker", () => {
  it("recognizes only a completed action-required marker for the exact head", () => {
    const marker = {
      name: "review-window",
      status: "completed",
      conclusion: "action_required",
      external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:base-${BASE}`,
    };
    expect(hasBaseInvalidation([marker], HEAD)).toBe(true);
    expect(hasBaseInvalidation([marker], OTHER_HEAD)).toBe(false);
    expect(hasBaseInvalidation([{ ...marker, conclusion: "success" }], HEAD)).toBe(false);
  });
});

function run(name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = Math.floor(Math.random() * 1_000_000);
  const workflowRun = {
    id: 500,
    check_suite_id: 700,
    path: ".github/workflows/ci.yml",
    event: "pull_request",
    head_sha: HEAD,
    repository: { full_name: REPOSITORY },
    pull_requests: [{ number: 1, head: { sha: HEAD } }],
    created_at: at(100),
    run_attempt: 1,
  };
  const job = {
    id: id + 10_000_000,
    name,
    status: "completed",
    conclusion: "success",
    started_at: at(100),
    completed_at: at(110),
    steps: [{ name: "Complete job" }],
    check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/${id}`,
  };
  return {
    id,
    name,
    status: "completed",
    conclusion: "success",
    started_at: at(100),
    completed_at: at(110),
    check_suite: { id: 700 },
    app: { id: name.length + 10, slug: "github-actions" },
    provenance: { kind: "workflow-job", valid: true, workflowRun, job },
    ...overrides,
  };
}

function timedRun(
  name: string,
  created: number,
  completed: number,
  overrides: Record<string, unknown> = {},
) {
  const base = run(name);
  const provenance = base.provenance as {
    workflowRun: Record<string, unknown>;
    job: Record<string, unknown>;
  };
  return {
    ...base,
    started_at: at(created),
    completed_at: at(completed),
    ...overrides,
    provenance: {
      ...provenance,
      workflowRun: { ...provenance.workflowRun, created_at: at(created) },
      job: {
        ...provenance.job,
        status: overrides.status ?? base.status,
        conclusion: overrides.conclusion ?? base.conclusion,
        started_at: at(created),
        completed_at: at(completed),
      },
    },
  };
}

function greenRuns() {
  return [
    run("quality"),
    run("backoffice-tests"),
    run("schema-drift"),
    run("build"),
    run("trusted-pr-ai-review", {
      provenance: { kind: "custom-check", valid: false },
    }),
    run("GitGuardian", { app: { id: 999, slug: "gitguardian" } }),
  ];
}

function trustedReviewEvidence(headSha = HEAD) {
  const reviewId = 321;
  const state = {
    version: 1,
    repository: REPOSITORY,
    prNumber: 1,
    baseBranch: "master",
    firstReviewedHeadSha: headSha,
    latestProcessedHeadSha: headSha,
    exhaustiveReviewCompleted: true,
    totalRunCount: 1,
    findings: [],
    resolutionLedger: [],
    github: { stateCommentId: 44, exhaustiveReviewId: reviewId, followUpCommentIds: [] },
    createdAt: at(100),
    updatedAt: at(110),
    mergedAt: null,
    lastRun: { kind: "exhaustive", headSha, status: "completed", at: at(110), error: null },
  };
  return {
    issueComments: [
      {
        id: 44,
        body: renderStateComment(state),
        created_at: at(100),
        updated_at: at(110),
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ],
    reviews: [
      {
        id: reviewId,
        body: renderExhaustiveReview({
          headSha,
          runNumber: 1,
          summary: "",
          findings: [],
          resolutionLedger: [],
        }),
        state: "COMMENTED",
        commit_id: headSha,
        submitted_at: at(110),
        updated_at: at(110),
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ],
  };
}

describe("trusted review evidence", () => {
  it("accepts a two-resource account review only from the configured owner on exact head", () => {
    const reviewId = 912;
    const accountEvidence = {
      issueComments: [
        {
          id: 71,
          body: renderAccountReviewReceiptMarker({ headSha: HEAD, reviewId }),
          created_at: at(120),
          updated_at: at(120),
          author_association: "OWNER",
          user: { login: "Jakeminator123", type: "User" },
        },
      ],
      reviews: [
        {
          id: reviewId,
          body: `${renderAccountReviewMarker(HEAD)}\n\nbugkoll: codex\n\nInga fynd.`,
          state: "COMMENTED",
          commit_id: HEAD,
          submitted_at: at(115),
          updated_at: at(115),
          author_association: "OWNER",
          user: { login: "Jakeminator123", type: "User" },
        },
      ],
    };

    expect(
      validateAccountPrReviewEvidence({
        ...accountEvidence,
        headSha: HEAD,
        trustedActors: ["Jakeminator123"],
      }),
    ).toMatchObject({ valid: true, completedAtEpoch: 120 });
    expect(
      validateTrustedPrAiEvidence({
        ...accountEvidence,
        headSha: HEAD,
        repository: REPOSITORY,
        prNumber: 1,
        trustedActors: ["Jakeminator123"],
      }),
    ).toMatchObject({ valid: true });
  });

  it.each([
    { label: "wrong actor", commentLogin: "attacker", reviewLogin: "attacker" },
    { label: "mixed actors", commentLogin: "Jakeminator123", reviewLogin: "attacker" },
  ])("rejects a forged account receipt: $label", ({ commentLogin, reviewLogin }) => {
    const reviewId = 913;
    expect(
      validateAccountPrReviewEvidence({
        headSha: HEAD,
        trustedActors: ["Jakeminator123"],
        issueComments: [
          {
            body: renderAccountReviewReceiptMarker({ headSha: HEAD, reviewId }),
            created_at: at(120),
            updated_at: at(120),
            author_association: "OWNER",
            user: { login: commentLogin, type: "User" },
          },
        ],
        reviews: [
          {
            id: reviewId,
            body: renderAccountReviewMarker(HEAD),
            state: "COMMENTED",
            commit_id: HEAD,
            submitted_at: at(115),
            updated_at: at(115),
            author_association: "OWNER",
            user: { login: reviewLogin, type: "User" },
          },
        ],
      }).valid,
    ).toBe(false);
  });

  it("rejects an account review or receipt bound to a different head", () => {
    const reviewId = 914;
    expect(
      validateAccountPrReviewEvidence({
        headSha: HEAD,
        trustedActors: ["Jakeminator123"],
        issueComments: [
          {
            body: renderAccountReviewReceiptMarker({ headSha: HEAD, reviewId }),
            created_at: at(120),
            updated_at: at(120),
            author_association: "OWNER",
            user: { login: "Jakeminator123", type: "User" },
          },
        ],
        reviews: [
          {
            id: reviewId,
            body: renderAccountReviewMarker(OTHER_HEAD),
            state: "COMMENTED",
            commit_id: OTHER_HEAD,
            submitted_at: at(115),
            updated_at: at(115),
            author_association: "OWNER",
            user: { login: "Jakeminator123", type: "User" },
          },
        ],
      }).valid,
    ).toBe(false);
  });

  it.each(["CHANGES_REQUESTED", "APPROVED", "DISMISSED"])(
    "rejects an account review with state %s",
    (state) => {
      const reviewId = 915;
      expect(
        validateAccountPrReviewEvidence({
          headSha: HEAD,
          trustedActors: ["Jakeminator123"],
          issueComments: [
            {
              body: renderAccountReviewReceiptMarker({ headSha: HEAD, reviewId }),
              created_at: at(120),
              updated_at: at(120),
              author_association: "OWNER",
              user: { login: "Jakeminator123", type: "User" },
            },
          ],
          reviews: [
            {
              id: reviewId,
              body: renderAccountReviewMarker(HEAD),
              state,
              commit_id: HEAD,
              submitted_at: at(115),
              updated_at: at(115),
              author_association: "OWNER",
              user: { login: "Jakeminator123", type: "User" },
            },
          ],
        }).valid,
      ).toBe(false);
    },
  );

  it("läser review-updatedAt och fullDatabaseId från paginerad GraphQL", async () => {
    const pages = [
      {
        totalCount: 2,
        nodes: [
          {
            id: "PRR_node_1",
            fullDatabaseId: "321",
            body: "första",
            state: "COMMENTED",
            submittedAt: at(100),
            updatedAt: at(150),
            authorAssociation: "NONE",
            author: { login: "bugbot", __typename: "Bot" },
            commit: { oid: HEAD },
          },
        ],
        pageInfo: { hasNextPage: true, endCursor: "next" },
      },
      {
        totalCount: 2,
        nodes: [
          {
            id: "PRR_node_2",
            fullDatabaseId: "322",
            body: "andra",
            state: "APPROVED",
            submittedAt: at(120),
            updatedAt: at(120),
            authorAssociation: "MEMBER",
            author: { login: "maintainer", __typename: "User" },
            commit: { oid: HEAD },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ];
    let page = 0;
    const client = createClient({
      repository: REPOSITORY,
      token: "test",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return {
              data: {
                repository: { pullRequest: { reviews: pages[page++] } },
              },
            };
          },
        }) as Response,
    });
    const reviews = await client.listReviewsWithServerTimes(1);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      id: 321,
      submitted_at: at(100),
      updated_at: at(150),
      user: { login: "bugbot[bot]", type: "Bot" },
    });
  });

  it("normaliserar GraphQLs bare Bot.login innan trusted review valideras", async () => {
    const evidence = trustedReviewEvidence();
    const source = evidence.reviews[0];
    const client = createClient({
      repository: REPOSITORY,
      token: "test",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return {
              data: {
                repository: {
                  pullRequest: {
                    reviews: {
                      totalCount: 1,
                      nodes: [
                        {
                          id: "PRR_trusted",
                          fullDatabaseId: String(source.id),
                          body: source.body,
                          state: source.state,
                          submittedAt: source.submitted_at,
                          updatedAt: source.updated_at,
                          authorAssociation: "NONE",
                          author: { login: "github-actions", __typename: "Bot" },
                          commit: { oid: HEAD },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                },
              },
            };
          },
        }) as Response,
    });
    const reviews = await client.listReviewsWithServerTimes(1);

    expect(reviews[0].user).toEqual({ login: "github-actions[bot]", type: "Bot" });
    expect(
      validateTrustedPrAiEvidence({
        issueComments: evidence.issueComments,
        reviews,
        headSha: HEAD,
        repository: REPOSITORY,
        prNumber: 1,
      }),
    ).toMatchObject({ valid: true });
  });

  it("stoppar om GitHub upprepar samma review-cursor", async () => {
    let page = 0;
    const client = createClient({
      repository: REPOSITORY,
      token: "test",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            page += 1;
            return {
              data: {
                repository: {
                  pullRequest: {
                    reviews: {
                      totalCount: 2,
                      nodes: [
                        {
                          id: `PRR_node_${page}`,
                          fullDatabaseId: String(400 + page),
                          body: "review",
                          state: "COMMENTED",
                          submittedAt: at(100 + page),
                          updatedAt: at(100 + page),
                          authorAssociation: "NONE",
                          author: { login: "bugbot[bot]", __typename: "Bot" },
                          commit: { oid: HEAD },
                        },
                      ],
                      pageInfo: { hasNextPage: true, endCursor: "stuck" },
                    },
                  },
                },
              },
            };
          },
        }) as Response,
    });

    await expect(client.listReviewsWithServerTimes(1)).rejects.toThrow("upprepade samma cursor");
  });

  it("stoppar om en review saknar verifierbar User/Bot-författare", async () => {
    const client = createClient({
      repository: REPOSITORY,
      token: "test",
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return {
              data: {
                repository: {
                  pullRequest: {
                    reviews: {
                      totalCount: 1,
                      nodes: [
                        {
                          id: "PRR_ghost",
                          fullDatabaseId: "499",
                          body: "P1",
                          state: "COMMENTED",
                          submittedAt: at(100),
                          updatedAt: at(110),
                          authorAssociation: "NONE",
                          author: null,
                          commit: { oid: HEAD },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                },
              },
            };
          },
        }) as Response,
    });

    await expect(client.listReviewsWithServerTimes(1)).rejects.toThrow("verifierbar författare");
  });

  it("binds the state comment to the published exhaustive review on exact head", () => {
    const evidence = trustedReviewEvidence();
    expect(
      validateTrustedPrAiEvidence({
        ...evidence,
        headSha: HEAD,
        repository: REPOSITORY,
        prNumber: 1,
      }),
    ).toMatchObject({ valid: true, completedAtEpoch: 110 });
    expect(
      validateTrustedPrAiEvidence({
        ...evidence,
        headSha: OTHER_HEAD,
        repository: REPOSITORY,
        prNumber: 1,
      }).valid,
    ).toBe(false);
  });
});

describe("check workflow provenance", () => {
  it("rejects a newer fake quality job instead of shadowing canonical failure", async () => {
    const canonical = timedRun("quality", 50, 60, { id: 101, conclusion: "failure" });
    const fake = timedRun("quality", 200, 210, { id: 202, conclusion: "success" });
    const rawChecks = [
      { ...canonical, check_suite: { id: 701 }, provenance: undefined },
      { ...fake, check_suite: { id: 702 }, provenance: undefined },
    ];
    const workflowRuns = new Map([
      [
        701,
        {
          id: 9001,
          check_suite_id: 701,
          path: ".github/workflows/ci.yml",
          event: "pull_request",
          head_sha: HEAD,
          repository: { full_name: REPOSITORY },
          pull_requests: [{ number: 1, head: { sha: HEAD } }],
          created_at: at(50),
          run_attempt: 1,
        },
      ],
      [
        702,
        {
          id: 9002,
          check_suite_id: 702,
          path: ".github/workflows/fake.yml",
          event: "pull_request",
          head_sha: HEAD,
          repository: { full_name: REPOSITORY },
          pull_requests: [{ number: 1, head: { sha: HEAD } }],
          created_at: at(200),
          run_attempt: 1,
        },
      ],
    ]);
    const jobs = new Map([
      [
        9001,
        [
          {
            id: 8001,
            name: "quality",
            status: "completed",
            conclusion: "failure",
            started_at: at(50),
            completed_at: at(60),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/101`,
          },
        ],
      ],
      [
        9002,
        [
          {
            id: 8002,
            name: "quality",
            status: "completed",
            conclusion: "success",
            started_at: at(200),
            completed_at: at(210),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/202`,
          },
        ],
      ],
    ]);
    const client = {
      repository: REPOSITORY,
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [workflowRuns.get(701)] };
        }
        const suiteId = Number(
          new URL(`https://example.test${path}`).searchParams.get("check_suite_id"),
        );
        const workflowRun = workflowRuns.get(suiteId);
        return { workflow_runs: workflowRun ? [workflowRun] : [] };
      },
      async paginate(path: string) {
        const runId = Number(/\/actions\/runs\/(\d+)\/attempts\/\d+\/jobs/.exec(path)?.[1]);
        return jobs.get(runId) ?? [];
      },
    };
    const enriched = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: rawChecks,
      expectedHeadSha: HEAD,
      prNumber: 1,
      repository: REPOSITORY,
      policy: policy as never,
    });
    const state = evaluateHeadChecks(
      [...greenRuns().filter((item) => item.name !== "quality"), ...enriched],
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(state.requiredFailed).toContain("quality");
    expect(state.requiredCollisions).toContain("quality");
    expect(state.requiredDone).toBe(false);
  });

  it("never fills a newer queued CI run with green jobs from an older run", async () => {
    const olderChecks = rawChecks(greenRuns()).map((check) => ({
      ...check,
      check_suite: { id: 701 },
    }));
    const older = { ...canonicalWorkflowRun(), id: 9001, check_suite_id: 701 };
    const newer = {
      ...canonicalWorkflowRun(),
      id: 9002,
      check_suite_id: 703,
      created_at: at(200),
      status: "queued",
    };
    const client = {
      repository: REPOSITORY,
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [older, newer] };
        }
        throw new Error(`unexpected request ${path}`);
      },
      async paginate(path: string) {
        if (path.startsWith("/actions/runs/9002/attempts/1/jobs")) return [];
        throw new Error(`unexpected paginate ${path}`);
      },
    };
    const enriched = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: olderChecks,
      expectedHeadSha: HEAD,
      prNumber: 1,
      repository: REPOSITORY,
      policy: policy as never,
    });
    const state = evaluateHeadChecks(enriched, policy as never, TRUSTED_REVIEW);
    expect(state.requiredDone).toBe(false);
    expect(state.requiredMissing).toEqual(
      expect.arrayContaining(["quality", "backoffice-tests", "schema-drift", "build"]),
    );
    expect(state.requiredCollisions).toEqual([]);
  });

  it("keeps earlier green jobs when a partial rerun only replaces failed jobs", async () => {
    const rawChecks = [
      run("quality", { id: 101, check_suite: { id: 701 }, provenance: undefined }),
      run("build", {
        id: 201,
        conclusion: "failure",
        check_suite: { id: 701 },
        provenance: undefined,
      }),
      run("build", {
        id: 202,
        check_suite: { id: 701 },
        provenance: undefined,
      }),
    ];
    const workflowRun = {
      ...canonicalWorkflowRun(),
      id: 9001,
      check_suite_id: 701,
      run_attempt: 2,
    };
    const jobsByAttempt = new Map([
      [
        1,
        [
          {
            id: 8001,
            name: "quality",
            status: "completed",
            conclusion: "success",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/101`,
          },
          {
            id: 8002,
            name: "build",
            status: "completed",
            conclusion: "failure",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/201`,
          },
        ],
      ],
      [
        2,
        [
          {
            id: 8003,
            name: "build",
            status: "completed",
            conclusion: "success",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/202`,
          },
        ],
      ],
    ]);
    const client = {
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [workflowRun] };
        }
        throw new Error(`unexpected request ${path}`);
      },
      async paginate(path: string) {
        const attempt = Number(/\/attempts\/(\d+)\/jobs/.exec(path)?.[1]);
        if (jobsByAttempt.has(attempt)) return jobsByAttempt.get(attempt);
        throw new Error(`unexpected paginate ${path}`);
      },
    };
    const rerunPolicy = {
      ...policy,
      requiredChecks: ["quality", "build", "review-window"],
    };
    const enriched = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: rawChecks,
      expectedHeadSha: HEAD,
      prNumber: 1,
      repository: REPOSITORY,
      policy: rerunPolicy as never,
    });
    expect(
      enriched.find((check: { id?: unknown; provenance?: { valid?: unknown } }) => check.id === 101)
        ?.provenance?.valid,
    ).toBe(true);
    expect(
      enriched.find((check: { id?: unknown; provenance?: { kind?: unknown } }) => check.id === 201)
        ?.provenance?.kind,
    ).toBe("stale-workflow-job");
    expect(
      enriched.find((check: { id?: unknown; provenance?: { valid?: unknown } }) => check.id === 202)
        ?.provenance?.valid,
    ).toBe(true);
    expect(evaluateHeadChecks(enriched, rerunPolicy as never, TRUSTED_REVIEW).requiredDone).toBe(
      true,
    );
  });

  it("uses the newest same-name job and treats its replaced attempt as stale", async () => {
    const rawChecks = [
      run("quality", {
        id: 101,
        conclusion: "failure",
        check_suite: { id: 701 },
        provenance: undefined,
      }),
      run("quality", { id: 102, check_suite: { id: 701 }, provenance: undefined }),
    ];
    const workflowRun = {
      ...canonicalWorkflowRun(),
      id: 9001,
      check_suite_id: 701,
      run_attempt: 2,
    };
    const jobsByAttempt = new Map([
      [
        1,
        [
          {
            id: 8001,
            name: "quality",
            status: "completed",
            conclusion: "failure",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/101`,
          },
        ],
      ],
      [
        2,
        [
          {
            id: 8002,
            name: "quality",
            status: "completed",
            conclusion: "success",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/102`,
          },
        ],
      ],
    ]);
    const client = {
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [workflowRun] };
        }
        throw new Error(`unexpected request ${path}`);
      },
      async paginate(path: string) {
        const attempt = Number(/\/attempts\/(\d+)\/jobs/.exec(path)?.[1]);
        if (jobsByAttempt.has(attempt)) return jobsByAttempt.get(attempt);
        throw new Error(`unexpected paginate ${path}`);
      },
    };
    const singleCheckPolicy = { ...policy, requiredChecks: ["quality", "review-window"] };
    const enriched = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: rawChecks,
      expectedHeadSha: HEAD,
      prNumber: 1,
      repository: REPOSITORY,
      policy: singleCheckPolicy as never,
    });
    expect(
      enriched.find((check: { id?: unknown; provenance?: { kind?: unknown } }) => check.id === 101)
        ?.provenance?.kind,
    ).toBe("stale-workflow-job");
    expect(
      enriched.find((check: { id?: unknown; provenance?: { valid?: unknown } }) => check.id === 102)
        ?.provenance?.valid,
    ).toBe(true);
    expect(
      evaluateHeadChecks(enriched, singleCheckPolicy as never, TRUSTED_REVIEW).requiredDone,
    ).toBe(true);
  });

  it("keeps a duplicate protected name ambiguous across later partial reruns", async () => {
    const rawChecks = [101, 102, 103].map((id) =>
      run("quality", { id, check_suite: { id: 701 }, provenance: undefined }),
    );
    const workflowRun = {
      ...canonicalWorkflowRun(),
      id: 9001,
      check_suite_id: 701,
      run_attempt: 2,
    };
    const jobsByAttempt = new Map([
      [
        1,
        rawChecks.slice(0, 2).map((check, index) => ({
          id: 8001 + index,
          name: "quality",
          status: "completed",
          conclusion: "success",
          started_at: at(100),
          completed_at: at(110),
          steps: [{ name: "Complete job" }],
          check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/${check.id}`,
        })),
      ],
      [
        2,
        [
          {
            id: 8003,
            name: "quality",
            status: "completed",
            conclusion: "success",
            started_at: at(100),
            completed_at: at(110),
            steps: [{ name: "Complete job" }],
            check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/103`,
          },
        ],
      ],
    ]);
    const client = {
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [workflowRun] };
        }
        throw new Error(`unexpected request ${path}`);
      },
      async paginate(path: string) {
        const attempt = Number(/\/attempts\/(\d+)\/jobs/.exec(path)?.[1]);
        return jobsByAttempt.get(attempt) ?? [];
      },
    };
    const singleCheckPolicy = { ...policy, requiredChecks: ["quality", "review-window"] };
    const enriched = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: rawChecks,
      expectedHeadSha: HEAD,
      prNumber: 1,
      repository: REPOSITORY,
      policy: singleCheckPolicy as never,
    });
    const state = evaluateHeadChecks(enriched, singleCheckPolicy as never, TRUSTED_REVIEW);
    expect(state.requiredDone).toBe(false);
    expect(state.requiredCollisions).toContain("quality");
  });

  it("binds an unassociated fork run only through exact live repo and branch", async () => {
    const rawCheck = run("quality", {
      id: 101,
      check_suite: { id: 701 },
      provenance: undefined,
    });
    const workflowRun = {
      ...canonicalWorkflowRun(),
      id: 9001,
      check_suite_id: 701,
      pull_requests: [],
      head_repository: { full_name: "contributor/fork" },
      head_branch: "feature/safe-change",
    };
    const job = {
      id: 8001,
      name: "quality",
      status: "completed",
      conclusion: "success",
      started_at: at(100),
      completed_at: at(110),
      steps: [{ name: "Complete job" }],
      check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/101`,
    };
    const client = {
      async request(path: string) {
        if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
          return { workflow_runs: [workflowRun] };
        }
        if (path.startsWith("/actions/runs?check_suite_id=701")) {
          return { workflow_runs: [workflowRun] };
        }
        throw new Error(`unexpected request ${path}`);
      },
      async paginate(path: string) {
        if (path.startsWith("/actions/runs/9001/attempts/1/jobs")) return [job];
        throw new Error(`unexpected paginate ${path}`);
      },
    };
    const singleCheckPolicy = { ...policy, requiredChecks: ["quality", "review-window"] };
    const accepted = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: [rawCheck],
      expectedHeadSha: HEAD,
      expectedHeadRepository: "contributor/fork",
      expectedHeadRef: "feature/safe-change",
      prNumber: 1,
      repository: REPOSITORY,
      policy: singleCheckPolicy as never,
    });
    expect(
      evaluateHeadChecks(accepted, singleCheckPolicy as never, TRUSTED_REVIEW).requiredDone,
    ).toBe(true);

    const rejected = await enrichCheckRunProvenance({
      client: client as never,
      checkRuns: [rawCheck],
      expectedHeadSha: HEAD,
      expectedHeadRepository: "someone-else/fork",
      expectedHeadRef: "feature/safe-change",
      prNumber: 1,
      repository: REPOSITORY,
      policy: singleCheckPolicy as never,
    });
    const rejectedState = evaluateHeadChecks(rejected, singleCheckPolicy as never, TRUSTED_REVIEW);
    expect(rejectedState.requiredDone).toBe(false);
    expect(rejectedState.requiredCollisions).toContain("quality");
  });

  it("ignores the step-less custom review check but blocks a real job reusing its name", async () => {
    const rawCheck = run("trusted-pr-ai-review", {
      id: 401,
      check_suite: { id: 701 },
      provenance: undefined,
    });
    const workflowRun = { ...canonicalWorkflowRun(), id: 9001, check_suite_id: 701 };
    const enrich = async (steps: Array<Record<string, unknown>> | null) => {
      const client = {
        async request(path: string) {
          if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
            return { workflow_runs: [workflowRun] };
          }
          throw new Error(`unexpected request ${path}`);
        },
        async paginate() {
          return [
            {
              id: 8401,
              name: "trusted-pr-ai-review",
              status: "completed",
              conclusion: "success",
              started_at: at(100),
              completed_at: at(110),
              steps,
              check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/401`,
            },
          ];
        },
      };
      return enrichCheckRunProvenance({
        client: client as never,
        checkRuns: [rawCheck],
        expectedHeadSha: HEAD,
        prNumber: 1,
        repository: REPOSITORY,
        policy: policy as never,
      });
    };

    const custom = await enrich(null);
    expect(custom[0].provenance).toMatchObject({
      kind: "custom-check",
      valid: false,
      collision: false,
    });

    const job = await enrich([{ name: "Complete job" }]);
    expect(job[0].provenance).toMatchObject({
      kind: "workflow-job",
      valid: false,
      collision: true,
    });
  });

  it("binds a non-canonical suite to its jobs before classifying the internal receipt", async () => {
    const rawCheck = run("trusted-pr-ai-review", {
      id: 451,
      check_suite: { id: 751 },
      provenance: undefined,
    });
    const workflowRun = {
      id: 9501,
      check_suite_id: 751,
      run_attempt: 1,
      path: ".github/workflows/pr-ai-review.yml",
      event: "pull_request_target",
    };
    const enrich = async (jobs: Array<Record<string, unknown>>) => {
      const client = {
        async request(path: string) {
          if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
            return { workflow_runs: [] };
          }
          if (path.startsWith("/actions/runs?check_suite_id=751")) {
            return { workflow_runs: [workflowRun] };
          }
          throw new Error(`unexpected request ${path}`);
        },
        async paginate(path: string) {
          if (path === "/actions/runs/9501/attempts/1/jobs") return jobs;
          throw new Error(`unexpected paginate ${path}`);
        },
      };
      return enrichCheckRunProvenance({
        client: client as never,
        checkRuns: [rawCheck],
        expectedHeadSha: HEAD,
        prNumber: 1,
        repository: REPOSITORY,
        policy: policy as never,
      });
    };

    const custom = await enrich([]);
    expect(custom[0].provenance).toMatchObject({
      kind: "custom-check",
      valid: false,
      collision: false,
    });

    const job = await enrich([
      {
        id: 8451,
        name: "trusted-pr-ai-review",
        status: "completed",
        conclusion: "success",
        started_at: at(100),
        completed_at: at(110),
        steps: [{ name: "Complete job" }],
        check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/451`,
      },
    ]);
    expect(job[0].provenance).toMatchObject({
      kind: "workflow-job",
      valid: false,
      collision: true,
    });
  });
});

describe("trusted review-window check decisions", () => {
  it("publicerar aldrig required check på PR mot annan base än trunk", () => {
    expect(targetsTrunk({ base: { ref: "master" } }, { trunk: "master" } as never)).toBe(true);
    expect(targetsTrunk({ base: { ref: "ema" } }, { trunk: "master" } as never)).toBe(false);
  });

  it("kräver alla övriga required checks och minst ett lyckat reviewkvitto", () => {
    const green = evaluateHeadChecks(greenRuns(), policy as never, TRUSTED_REVIEW);
    expect(green.requiredDone).toBe(true);
    expect(green.botsDone).toBe(true);

    const missing = evaluateHeadChecks(
      greenRuns().filter((item) => item.name !== "build"),
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(missing.requiredDone).toBe(false);
    expect(missing.requiredMissing).toContain("build");

    const noReceipt = evaluateHeadChecks(greenRuns(), policy as never);
    expect(noReceipt.botsDone).toBe(false);

    const missingServerTime = evaluateHeadChecks(
      greenRuns().map((item) =>
        item.name === "quality"
          ? {
              ...item,
              provenance: {
                ...(item.provenance as Record<string, unknown>),
                workflowRun: {
                  ...(item.provenance as { workflowRun: Record<string, unknown> }).workflowRun,
                  created_at: undefined,
                },
              },
            }
          : item,
      ),
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(missingServerTime.requiredDone).toBe(false);
    expect(missingServerTime.requiredCreatedTimesValid).toBe(false);
  });

  it("låter en säkerhetsveto blockera även när reviewkvittot är grönt", () => {
    const state = evaluateHeadChecks(
      greenRuns().map((item) =>
        item.name === "GitGuardian" ? { ...item, conclusion: "failure" } : item,
      ),
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(state.botsDone).toBe(false);
    expect(state.securityFailed).toBe(1);
  });

  it("blockerar ett vanligt Actions-jobb som återanvänder reviewkvittots namn", () => {
    const fakeJob = run("trusted-pr-ai-review", {
      provenance: { kind: "workflow-job", valid: false, collision: true },
    });
    const state = evaluateHeadChecks([...greenRuns(), fakeJob], policy as never, TRUSTED_REVIEW);
    expect(state.botsDone).toBe(false);
    expect(state.reviewJobCollisions).toContain("trusted-pr-ai-review");
  });

  it("låter Vercel vara absent men blockerar exakt Vercel när den är pending eller röd", () => {
    expect(evaluateHeadChecks(greenRuns(), policy as never, TRUSTED_REVIEW).botsDone).toBe(true);
    const pending = evaluateHeadChecks(
      [...greenRuns(), run("Vercel", { status: "in_progress", conclusion: null })],
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(pending.botsDone).toBe(false);
    expect(pending.deploymentPending).toBe(1);
    const failed = evaluateHeadChecks(
      [...greenRuns(), run("Vercel", { conclusion: "failure" })],
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(failed.botsDone).toBe(false);
    expect(failed.deploymentFailed).toBe(1);
  });

  it("klassar inte Vercel Agent Review som deployment via substring", () => {
    const state = evaluateHeadChecks(
      [...greenRuns(), run("Vercel Agent Review")],
      policy as never,
      TRUSTED_REVIEW,
    );
    expect(state.deploymentPending).toBe(0);
    expect(state.deploymentFailed).toBe(0);
  });

  it("ignorerar övergiven äldre run och använder senaste per app+checknamn", () => {
    const runs = greenRuns();
    runs.push(
      timedRun("quality", 50, 60, {
        id: 1,
        status: "completed",
        conclusion: "failure",
      }),
    );
    expect(evaluateHeadChecks(runs, policy as never, TRUSTED_REVIEW).requiredDone).toBe(true);
  });

  it("väljer senaste check via WorkflowRun created_at, aldrig CheckRun started_at", () => {
    const runs = greenRuns();
    runs.push(
      timedRun("quality", 200, 210, {
        id: 999,
        conclusion: "failure",
        started_at: at(1),
      }),
    );
    expect(evaluateHeadChecks(runs, policy as never, TRUSTED_REVIEW).requiredFailed).toContain(
      "quality",
    );
  });

  it("håller 600-sekunders botdeadline skild från 840-sekunders signoffdeadline", () => {
    expect(
      deadlineDecision({
        elapsed: 601,
        botsReadyBeforeDeadline: true,
        botsDone: true,
        maxBotWaitSeconds: 600,
        maxSignoffWaitSeconds: 840,
      }),
    ).toBe("wait");
    expect(
      deadlineDecision({
        elapsed: 839,
        botsReadyBeforeDeadline: true,
        botsDone: true,
        maxBotWaitSeconds: 600,
        maxSignoffWaitSeconds: 840,
      }),
    ).toBe("wait");
    expect(
      deadlineDecision({
        elapsed: 840,
        botsReadyBeforeDeadline: true,
        botsDone: true,
        maxBotWaitSeconds: 600,
        maxSignoffWaitSeconds: 840,
      }),
    ).toBe("signoff-timeout");
    expect(
      deadlineDecision({
        elapsed: 600,
        botsReadyBeforeDeadline: false,
        botsDone: true,
        maxBotWaitSeconds: 600,
        maxSignoffWaitSeconds: 840,
      }),
    ).toBe("bot-timeout");
  });

  it("använder senaste kanoniska WorkflowRun-fönstret vid rerun", () => {
    const runs = [timedRun("quality", 100, 110), timedRun("quality", 500, 510)];
    expect(latestRequiredWorkflowEpoch(runs, 999)).toBe(500);
  });
});

describe("trusted review-window finding order", () => {
  it("kräver ny sign-off efter senaste verkliga botfynd", () => {
    const result = latestInvalidatingFindingEpoch({
      issueComments: [
        {
          user: { login: "codex-reviewer[bot]", type: "Bot" },
          body: "P1: felaktig auth",
          created_at: at(600),
          updated_at: at(700),
        },
        {
          user: { login: "cursor[bot]", type: "Bot" },
          body: "Bugbot couldn't run - usage limit reached",
          created_at: at(800),
        },
      ],
      reviews: [],
      reviewComments: [],
    });
    expect(result).toEqual({ valid: true, latestEpoch: 700 });
  });

  it("ignorerar strikt markerad Actions-state och Vercel deploy-brus", () => {
    const result = latestInvalidatingFindingEpoch({
      issueComments: [
        {
          user: { login: "github-actions[bot]", type: "Bot" },
          body: "<!-- sajtmaskin-pr-review-state:v1:abc -->",
          created_at: at(900),
        },
        {
          user: { login: "vercel[bot]", type: "Bot" },
          body: "Preview ready",
          created_at: at(950),
        },
      ],
      reviews: [],
      reviewComments: [],
    });
    expect(result).toEqual({ valid: true, latestEpoch: 0 });
  });

  it("failar stängt om ett botfynd saknar serverside-tid", () => {
    const result = latestInvalidatingFindingEpoch({
      issueComments: [],
      reviews: [
        {
          user: { login: "bugbot[bot]", type: "Bot" },
          body: "P1",
          submitted_at: null,
          updated_at: null,
        },
      ],
      reviewComments: [],
    });
    expect(result.valid).toBe(false);
  });
});

describe("final merge evidence", () => {
  it("räknar alla reviews och kommentarer men undantar själva kommandot", () => {
    const evidence = {
      issueComments: [
        { id: 7, created_at: at(100), updated_at: at(120) },
        { id: 9, created_at: at(500), updated_at: at(500) },
      ],
      reviews: [{ id: 2, submitted_at: at(130), updated_at: at(130) }],
      reviewComments: [{ id: 3, created_at: at(140), updated_at: at(150) }],
    };
    expect(latestConversationEpoch(evidence as never, 9)).toEqual({
      valid: true,
      latestEpoch: 150,
    });
    expect(
      latestConversationEpoch(
        { ...evidence, reviews: [{ id: 2, submitted_at: at(130), updated_at: null }] } as never,
        9,
      ).valid,
    ).toBe(false);
  });

  it("fingerprintar även bodyändringar utan att exponera bodytexten", () => {
    const base = {
      evidence: {
        pr: {
          number: 1,
          state: "open",
          draft: false,
          head: { sha: HEAD },
          base: { ref: "master" },
          labels: [{ name: "merge:ready" }],
        },
        baseSha: BASE,
        baseIsAncestor: true,
        issueComments: [{ id: 1, body: "hemligt", created_at: at(100), updated_at: at(100) }],
        reviews: [],
        reviewComments: [],
      },
      checkRuns: [],
      commandComment: {
        id: 9,
        body: "command",
        created_at: at(200),
        updated_at: at(200),
        user: { login: "owner", type: "User" },
        author_association: "OWNER",
      },
    };
    const first = mergeEvidenceFingerprint(base as never);
    const second = mergeEvidenceFingerprint({
      ...base,
      evidence: {
        ...base.evidence,
        issueComments: [{ ...base.evidence.issueComments[0], body: "ändrat" }],
      },
    } as never);
    expect(first).not.toBe(second);
    expect(first).not.toContain("hemligt");
  });
});

function integrationPolicy() {
  return {
    trunk: "master",
    requiredChecks: policy.requiredChecks,
    review: {
      ...policy.review,
      minHeadAgeSeconds: 0,
      botSettleSeconds: 0,
      maxBotWaitSeconds: 10,
      maxSignoffWaitSeconds: 20,
    },
  };
}

function rawChecks(values: Array<Record<string, unknown>>) {
  return values.map(({ provenance: _provenance, ...check }) => check);
}

function canonicalWorkflowRun() {
  return {
    id: 500,
    check_suite_id: 700,
    path: ".github/workflows/ci.yml",
    event: "pull_request",
    head_sha: HEAD,
    repository: { full_name: REPOSITORY },
    pull_requests: [{ number: 1, head: { sha: HEAD } }],
    created_at: at(100),
    run_attempt: 1,
  };
}

function canonicalJobs(checks: Array<Record<string, unknown>>) {
  const required = new Set(policy.requiredChecks.filter((name) => name !== "review-window"));
  return checks
    .filter((check) => required.has(String(check.name)))
    .map((check, index) => ({
      id: 10_000 + index,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      started_at: check.started_at,
      completed_at: check.completed_at,
      steps: [{ name: "Complete job" }],
      check_run_url: `https://api.github.com/repos/${REPOSITORY}/check-runs/${check.id}`,
    }));
}

function integrationHarness({
  raceHead = false,
  failCheckPoll = false,
  changedFiles = [] as Array<Record<string, unknown>>,
  signoffAfterEvidenceReads = 0,
} = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const counters = { pulls: 0, evidence: 0, checkPolls: 0, files: 0 };
  const pr = {
    number: 1,
    state: "open",
    draft: false,
    changed_files: changedFiles.length,
    base: { ref: "master" },
    head: { sha: HEAD, ref: "feature/test", repo: { full_name: REPOSITORY } },
    user: { login: "pr-author" },
    body: "",
    labels: [{ name: "merge:ready" }],
  };
  const currentGate = {
    id: 100,
    name: "review-window",
    status: "in_progress",
    conclusion: null,
    external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:1000`,
    started_at: at(1_000),
    app: { id: 1, slug: "github-actions" },
  };
  const olderGate = {
    ...currentGate,
    id: 99,
    external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:900`,
    started_at: at(900),
  };
  const checks = rawChecks([currentGate, olderGate, ...greenRuns()]);
  const reviewEvidence = trustedReviewEvidence();
  const signoff = {
    body: `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 1970-01-01T00:16:40Z, bugkoll: trusted, triage: klar, P0/P1: 0`,
    created_at: at(1_000),
    user: { login: "pr-author", type: "User" },
    author_association: "NONE",
  };

  const client = {
    repository: REPOSITORY,
    async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
      if (path === "/pulls/1") {
        counters.pulls += 1;
        if (raceHead && counters.pulls >= 2) {
          return { ...pr, head: { sha: OTHER_HEAD } };
        }
        return structuredClone(pr);
      }
      if (path === "/check-runs" && options.method === "POST") return structuredClone(currentGate);
      if (path.startsWith("/check-runs/") && options.method === "PATCH") {
        patches.push({ path, ...(options.body ?? {}) });
        return options.body;
      }
      if (path === "/git/ref/heads/master") {
        counters.evidence += 1;
        return { object: { sha: BASE } };
      }
      if (path === `/compare/${BASE}...${HEAD}`) {
        return { status: "ahead", merge_base_commit: { sha: BASE } };
      }
      if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
        return { workflow_runs: [canonicalWorkflowRun()] };
      }
      throw new Error(`unexpected request ${options.method ?? "GET"} ${path}`);
    },
    async listReviewsWithServerTimes() {
      return structuredClone(reviewEvidence.reviews);
    },
    async paginate(path: string, key?: string | null) {
      if (path.startsWith(`/commits/${HEAD}/check-runs`)) {
        counters.checkPolls += 1;
        if (failCheckPoll) throw new Error("check API unavailable");
        return structuredClone(checks);
      }
      if (path === "/issues/1/comments") {
        return [
          ...structuredClone(reviewEvidence.issueComments),
          ...(counters.evidence >= signoffAfterEvidenceReads ? [structuredClone(signoff)] : []),
        ];
      }
      if (path === "/pulls/1/comments") return [];
      if (path === "/pulls/1/files") {
        counters.files += 1;
        return structuredClone(changedFiles);
      }
      if (path.startsWith("/actions/runs/500/attempts/1/jobs")) return canonicalJobs(checks);
      throw new Error(`unexpected paginate ${path} ${key ?? ""}`);
    },
  };
  return { client, patches, counters };
}

function mergeHarness({
  failDispatch = false,
  invalidSignoff = false,
  includeForgedWindow = false,
  missingReviewReceipt = false,
  failedRequiredCheck = false,
  newerBotFinding = false,
  editedBotReview = false,
  workflowFileChange = false,
  workflowRename = false,
  duplicateFiles = false,
} = {}) {
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  let mutateConversation = false;
  const changedFiles = workflowFileChange
    ? [{ filename: ".github/workflows/new.yml" }]
    : workflowRename
      ? [{ filename: "docs/renamed.yml", previous_filename: ".github/workflows/ci.yml" }]
      : duplicateFiles
        ? [{ filename: "README.md" }, { filename: "README.md" }]
        : [];
  const pr = {
    number: 1,
    state: "open",
    draft: false,
    changed_files: changedFiles.length,
    base: { ref: "master" },
    head: { sha: HEAD },
    user: { login: "pr-author" },
    labels: [{ name: "merge:ready" }],
  };
  const command = {
    id: 77,
    issue_url: "https://api.github.com/repos/example/repo/issues/1",
    body: `merge:execute — head-sha: ${HEAD}, base-sha: ${BASE}, at: 1970-01-01T00:03:20Z, bugkoll: trusted, triage: klar, P0/P1: 0`,
    created_at: at(200),
    updated_at: at(200),
    user: { login: "maintainer", type: "User" },
    author_association: "MEMBER",
  };
  const signoff = {
    id: 55,
    body: invalidSignoff
      ? "saknar verifierbar sign-off"
      : `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 1970-01-01T00:02:30Z, bugkoll: trusted, triage: klar, P0/P1: 0`,
    created_at: at(150),
    updated_at: at(150),
    user: { login: "pr-author", type: "User" },
    author_association: "NONE",
  };
  // Samma GitHub Actions-app och ett självvalt external_id är avsiktligt inte
  // tillräckligt för merge. Harnessen behandlar denna som möjlig förfalskning.
  const forgedWindow = run("review-window", {
    id: 900,
    external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:100`,
    completed_at: at(120),
  });
  const coreChecks = greenRuns().map((item) =>
    failedRequiredCheck && item.name === "quality" ? { ...item, conclusion: "failure" } : item,
  );
  const checks = rawChecks([...coreChecks, ...(includeForgedWindow ? [forgedWindow] : [])]);
  const reviewEvidence = trustedReviewEvidence();
  const editedReview = {
    id: 654,
    body: "<!-- BUGBOT_REVIEW --> P1 tillagt efter mandatet",
    state: "COMMENTED",
    commit_id: HEAD,
    submitted_at: at(100),
    updated_at: at(250),
    user: { login: "cursor[bot]", type: "Bot" },
    author_association: "NONE",
  };
  const client = {
    repository: REPOSITORY,
    async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
      calls.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/pulls/1") return structuredClone(pr);
      if (path === "/issues/comments/77") return structuredClone(command);
      if (path === "/git/ref/heads/master") return { object: { sha: BASE } };
      if (path === `/compare/${BASE}...${HEAD}`) {
        return { status: "ahead", merge_base_commit: { sha: BASE } };
      }
      if (path.startsWith("/actions/workflows/ci.yml/runs?")) {
        return { workflow_runs: [canonicalWorkflowRun()] };
      }
      if (path === "/pulls/1/merge" && options.method === "PUT") {
        return { merged: true, sha: "d".repeat(40) };
      }
      if (path.startsWith("/actions/workflows/") && options.method === "POST") {
        if (failDispatch && path.includes("db-blob-sync-check.yml")) {
          throw new Error("dispatch unavailable");
        }
        return null;
      }
      throw new Error(`unexpected request ${options.method ?? "GET"} ${path}`);
    },
    async listReviewsWithServerTimes() {
      return [
        ...(missingReviewReceipt ? [] : structuredClone(reviewEvidence.reviews)),
        ...(editedBotReview ? [structuredClone(editedReview)] : []),
      ];
    },
    async paginate(path: string) {
      if (path === "/pulls?state=open&base=master") return [];
      if (path.startsWith(`/commits/${HEAD}/check-runs`)) return structuredClone(checks);
      if (path === "/issues/1/comments") {
        return [
          ...(missingReviewReceipt ? [] : structuredClone(reviewEvidence.issueComments)),
          {
            ...structuredClone(signoff),
            body: mutateConversation
              ? String(signoff.body).replace("triage: klar", "triage: omkontrollerad")
              : signoff.body,
          },
          ...(newerBotFinding
            ? [
                {
                  id: 56,
                  body: "<!-- BUGBOT_REVIEW --> nytt blockerande fynd",
                  created_at: at(175),
                  updated_at: at(175),
                  user: { login: "cursor[bot]", type: "Bot" },
                  author_association: "NONE",
                },
              ]
            : []),
          structuredClone(command),
        ];
      }
      if (path === "/pulls/1/comments") return [];
      if (path === "/pulls/1/files") return structuredClone(changedFiles);
      if (path.startsWith("/actions/runs/500/attempts/1/jobs")) return canonicalJobs(checks);
      throw new Error(`unexpected paginate ${path}`);
    },
  };
  return {
    client,
    calls,
    mutate: () => {
      mutateConversation = true;
    },
  };
}

describe("trusted review-window controller", () => {
  it("mergar bara via squash med expected head efter stabil dubbel live-evidens", async () => {
    const { client, calls } = mergeHarness();
    const result = await runTrustedMerge({
      client: client as never,
      prNumber: 1,
      commentId: 77,
      pause: async () => undefined,
      settleSeconds: 1,
      policy: integrationPolicy() as never,
    });
    expect(result).toMatchObject({ merged: true, headSha: HEAD, baseSha: BASE });
    expect(calls.find((call) => call.path === "/pulls/1/merge")).toMatchObject({
      path: "/pulls/1/merge",
      method: "PUT",
      body: { sha: HEAD, merge_method: "squash" },
    });
    expect(
      calls.filter((call) => call.path === `/compare/${BASE}...${HEAD}`).length,
    ).toBeGreaterThan(3);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/actions/workflows/ci.yml/dispatches",
          method: "POST",
          body: { ref: "master" },
        }),
        expect.objectContaining({
          path: "/actions/workflows/db-blob-sync-check.yml/dispatches",
          method: "POST",
          body: { ref: "master" },
        }),
      ]),
    );
  });

  it("låter aldrig ett förfalskningsbart review-window-kvitto ersätta live sign-off", async () => {
    const { client, calls } = mergeHarness({
      invalidSignoff: true,
      includeForgedWindow: true,
    });
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("live sign-off avvisad");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it.each([
    { name: "ny workflowfil", options: { workflowFileChange: true } },
    { name: "workflowfilens tidigare namn", options: { workflowRename: true } },
  ])("kräver explicit bootstrap för $name", async ({ options }) => {
    const { client, calls } = mergeHarness(options);
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("explicit bootstrap");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it("stoppar merge om GitHubs PR-fillista inte är entydigt komplett", async () => {
    const { client, calls } = mergeHarness({ duplicateFiles: true });
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("filistan kunde inte verifieras komplett");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it.each([
    {
      name: "saknat reviewkvitto",
      options: { missingReviewReceipt: true },
      message: "inget lyckat reviewkvitto",
    },
    {
      name: "röd required check",
      options: { failedRequiredCheck: true },
      message: "required checks är röda",
    },
    {
      name: "nyare botfynd",
      options: { newerBotFinding: true },
      message: "live sign-off avvisad",
    },
    {
      name: "bot-review som editerats efter mandatet",
      options: { editedBotReview: true },
      message: "live sign-off avvisad",
    },
  ])("låter inte förfalskad check dölja $name", async ({ options, message }) => {
    const { client, calls } = mergeHarness({
      ...options,
      includeForgedWindow: true,
    });
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow(message);
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it("mäter finalt sjuminutersgolv från GitHubs required-checktider", async () => {
    const { client, calls } = mergeHarness();
    const hardenedPolicy = integrationPolicy();
    hardenedPolicy.review.minHeadAgeSeconds = 420;
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: hardenedPolicy as never,
      }),
    ).rejects.toThrow("granskningsfönstret");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it("avbryter om evidens ändras under settle-fönstret", async () => {
    const { client, calls, mutate } = mergeHarness();
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => mutate(),
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("evidens ändrades under merge-settle");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(false);
  });

  it("rapporterar terminal merge tydligt om post-merge-dispatch misslyckas", async () => {
    const { client, calls } = mergeHarness({ failDispatch: true });
    await expect(
      runTrustedMerge({
        client: client as never,
        prNumber: 1,
        commentId: 77,
        pause: async () => undefined,
        settleSeconds: 1,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("PR #1 är redan mergad");
    expect(calls.some((call) => call.path === "/pulls/1/merge")).toBe(true);
    expect(calls.some((call) => call.path.endsWith("ci.yml/dispatches"))).toBe(true);
    expect(calls.some((call) => call.path.endsWith("db-blob-sync-check.yml/dispatches"))).toBe(
      true,
    );
  });

  it("gör no-op före checkskrivning när PR:n inte riktas mot trunk", async () => {
    let writes = 0;
    const client = {
      async request(path: string, options: { method?: string } = {}) {
        if (path === "/pulls/9") {
          return { base: { ref: "ema" }, head: { sha: HEAD } };
        }
        if (options.method === "POST" || options.method === "PATCH") writes += 1;
        throw new Error(`unexpected ${path}`);
      },
    };
    const result = await runTrustedGate({
      client: client as never,
      prNumber: 9,
      policy: integrationPolicy() as never,
    });
    expect(result).toEqual({ conclusion: "ignored", reason: "base ema" });
    expect(writes).toBe(0);
  });

  it("dubbelbekräftar live head/base och publicerar success först därefter", async () => {
    const { client, patches, counters } = integrationHarness();
    const result = await runTrustedGate({
      client: client as never,
      prNumber: 1,
      now: () => 1_000,
      pause: async () => undefined,
      policy: integrationPolicy() as never,
    });

    expect(result.conclusion).toBe("success");
    expect(counters.evidence).toBeGreaterThanOrEqual(2);
    expect(counters.checkPolls).toBeGreaterThanOrEqual(3);
    expect(
      patches.some((patch) => patch.conclusion === "neutral" && patch.path === "/check-runs/99"),
    ).toBe(true);
    expect(patches.at(-1)).toMatchObject({ path: "/check-runs/100", conclusion: "success" });
  });

  it("cachar den stora PR-fillistan under polling men läser om den i slutkontrollen", async () => {
    const { client, counters } = integrationHarness({ signoffAfterEvidenceReads: 3 });
    const result = await runTrustedGate({
      client: client as never,
      prNumber: 1,
      now: () => 1_000,
      pause: async () => undefined,
      policy: integrationPolicy() as never,
    });

    expect(result.conclusion).toBe("success");
    expect(counters.evidence).toBeGreaterThanOrEqual(4);
    expect(counters.files).toBe(2);
  });

  it("rapporterar workflow-bootstrap som faktisk blockerare", async () => {
    const { client, patches } = integrationHarness({
      changedFiles: [{ filename: ".github/workflows/new.yml" }],
    });
    await expect(
      runTrustedGate({
        client: client as never,
        prNumber: 1,
        now: () => 1_000,
        pause: async () => undefined,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("explicit bootstrap");

    expect(patches.at(-1)).toMatchObject({ conclusion: "action_required" });
    const output = patches.at(-1)?.output as { summary?: string } | undefined;
    expect(String(output?.summary)).toContain("explicit bootstrap");
  });

  it("neutraliserar A-checken om live head hinner flytta till B", async () => {
    const { client, patches, counters } = integrationHarness({ raceHead: true });
    const result = await runTrustedGate({
      client: client as never,
      prNumber: 1,
      now: () => 1_000,
      pause: async () => undefined,
      policy: integrationPolicy() as never,
    });

    expect(result).toEqual({ conclusion: "neutral", reason: "head changed" });
    expect(counters.evidence).toBe(0);
    expect(patches.at(-1)).toMatchObject({ path: "/check-runs/100", conclusion: "neutral" });
  });

  it("PATCH:ar head-checken action_required när API-verifieringen fallerar", async () => {
    const { client, patches } = integrationHarness({ failCheckPoll: true });
    await expect(
      runTrustedGate({
        client: client as never,
        prNumber: 1,
        now: () => 1_000,
        pause: async () => undefined,
        policy: integrationPolicy() as never,
      }),
    ).rejects.toThrow("check API unavailable");

    expect(patches.at(-1)).toMatchObject({
      path: "/check-runs/100",
      conclusion: "action_required",
    });
  });

  it("blockerar exakt head före labelborttagning på master-push och lämnar drafts orörda", async () => {
    const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    const client = {
      async paginate(path: string) {
        if (path.startsWith("/commits/")) return [];
        return [
          { number: 1, draft: true, head: { sha: OTHER_HEAD }, labels: [{ name: "merge:ready" }] },
          { number: 2, draft: false, head: { sha: HEAD }, labels: [{ name: "merge:ready" }] },
        ];
      },
      async request(
        path: string,
        options: { method?: string; body?: Record<string, unknown> } = {},
      ) {
        calls.push({ path, method: options.method ?? "GET", body: options.body });
        if (path === "/check-runs") return { id: 123 };
        return null;
      },
    };

    await invalidateForBasePush({
      client: client as never,
      baseSha: BASE,
      now: () => 1_000,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      path: "/check-runs",
      method: "POST",
      body: { head_sha: HEAD, conclusion: "action_required" },
    });
    expect(calls[1]).toMatchObject({
      path: "/issues/2/labels/merge%3Aready",
      method: "DELETE",
    });
  });

  it("skapar en separat senare base-invalidering som en äldre gate inte kan skriva över", async () => {
    const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    const client = {
      async paginate(_path: string) {
        return [
          { number: 2, draft: false, head: { sha: HEAD }, labels: [{ name: "merge:ready" }] },
        ];
      },
      async request(
        path: string,
        options: { method?: string; body?: Record<string, unknown> } = {},
      ) {
        calls.push({ path, method: options.method ?? "GET", body: options.body });
        if (path === "/check-runs") return { id: 789 };
        return null;
      },
    };

    await invalidateForBasePush({
      client: client as never,
      baseSha: BASE,
      now: () => 1_000,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      path: "/check-runs",
      method: "POST",
      body: {
        head_sha: HEAD,
        conclusion: "action_required",
        external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:base-${BASE}`,
      },
    });
    expect(calls[1]).toMatchObject({
      path: "/issues/2/labels/merge%3Aready",
      method: "DELETE",
    });
  });
});
