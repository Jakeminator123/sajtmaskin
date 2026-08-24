import { describe, expect, it } from "vitest";
import {
  deadlineDecision,
  earliestTrustedWindowEpoch,
  evaluateHeadChecks,
  evaluateMergeChecks,
  hasBaseInvalidation,
  invalidateForBasePush,
  latestInvalidatingFindingEpoch,
  latestConversationEpoch,
  mergeEvidenceFingerprint,
  runTrustedMerge,
  runTrustedGate,
  reviewMutationRequiresNewSignoff,
  targetsTrunk,
} from "./trusted-review-window.mjs";

const at = (seconds: number) => new Date(seconds * 1000).toISOString();
const policy = {
  requiredChecks: ["quality", "backoffice-tests", "schema-drift", "build", "review-window"],
  review: {
    qualifyingCheckPatterns: ["trusted-pr-ai-review", "bugbot"],
    securityVetoCheckPatterns: ["gitguardian"],
    deploymentCheckNames: ["Vercel"],
  },
};
const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);
const BASE = "c".repeat(40);

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
  return {
    id: Math.floor(Math.random() * 1_000_000),
    name,
    status: "completed",
    conclusion: "success",
    started_at: at(100),
    completed_at: at(110),
    app: { id: name.length + 10, slug: "github-actions" },
    ...overrides,
  };
}

function greenRuns() {
  return [
    run("quality"),
    run("backoffice-tests"),
    run("schema-drift"),
    run("build"),
    run("trusted-pr-ai-review"),
    run("GitGuardian", { app: { id: 999, slug: "gitguardian" } }),
  ];
}

describe("trusted review-window check decisions", () => {
  it("publicerar aldrig required check på PR mot annan base än trunk", () => {
    expect(targetsTrunk({ base: { ref: "master" } }, { trunk: "master" } as never)).toBe(true);
    expect(targetsTrunk({ base: { ref: "ema" } }, { trunk: "master" } as never)).toBe(false);
  });

  it("kräver alla övriga required checks och minst ett lyckat reviewkvitto", () => {
    const green = evaluateHeadChecks(greenRuns(), policy as never);
    expect(green.requiredDone).toBe(true);
    expect(green.botsDone).toBe(true);

    const missing = evaluateHeadChecks(
      greenRuns().filter((item) => item.name !== "build"),
      policy as never,
    );
    expect(missing.requiredDone).toBe(false);
    expect(missing.requiredMissing).toContain("build");

    const noReceipt = evaluateHeadChecks(
      greenRuns().filter((item) => item.name !== "trusted-pr-ai-review"),
      policy as never,
    );
    expect(noReceipt.botsDone).toBe(false);
  });

  it("låter en säkerhetsveto blockera även när reviewkvittot är grönt", () => {
    const state = evaluateHeadChecks(
      greenRuns().map((item) =>
        item.name === "GitGuardian" ? { ...item, conclusion: "failure" } : item,
      ),
      policy as never,
    );
    expect(state.botsDone).toBe(false);
    expect(state.securityFailed).toBe(1);
  });

  it("låter Vercel vara absent men blockerar exakt Vercel när den är pending eller röd", () => {
    expect(evaluateHeadChecks(greenRuns(), policy as never).botsDone).toBe(true);
    const pending = evaluateHeadChecks(
      [...greenRuns(), run("Vercel", { status: "in_progress", conclusion: null })],
      policy as never,
    );
    expect(pending.botsDone).toBe(false);
    expect(pending.deploymentPending).toBe(1);
    const failed = evaluateHeadChecks(
      [...greenRuns(), run("Vercel", { conclusion: "failure" })],
      policy as never,
    );
    expect(failed.botsDone).toBe(false);
    expect(failed.deploymentFailed).toBe(1);
  });

  it("klassar inte Vercel Agent Review som deployment via substring", () => {
    const state = evaluateHeadChecks([...greenRuns(), run("Vercel Agent Review")], policy as never);
    expect(state.deploymentPending).toBe(0);
    expect(state.deploymentFailed).toBe(0);
  });

  it("ignorerar övergiven äldre run och använder senaste per app+checknamn", () => {
    const runs = greenRuns();
    runs.push(
      run("quality", {
        id: 1,
        status: "completed",
        conclusion: "failure",
        started_at: at(50),
        completed_at: at(60),
      }),
    );
    expect(evaluateHeadChecks(runs, policy as never).requiredDone).toBe(true);
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

  it("återanvänder första trusted head-fönstret vid label-retrigger", () => {
    const runs = [
      run("review-window", {
        external_id: `sajtmaskin-trusted-review-window:v1:${"a".repeat(40)}:1`,
        started_at: at(100),
      }),
      run("review-window", {
        external_id: `sajtmaskin-trusted-review-window:v1:${"a".repeat(40)}:2`,
        started_at: at(500),
      }),
    ];
    expect(earliestTrustedWindowEpoch(runs, 999)).toBe(100);
  });

  it("kräver den senaste trusted review-window-checken inför faktisk merge", () => {
    const trusted = run("review-window", {
      id: 900,
      external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:100`,
      completed_at: at(120),
    });
    expect(evaluateMergeChecks([...greenRuns(), trusted], policy as never).mergeChecksDone).toBe(
      true,
    );
    const invalidation = run("review-window", {
      id: 901,
      conclusion: "action_required",
      created_at: at(130),
      started_at: at(130),
      completed_at: at(130),
      external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:base-${BASE}`,
    });
    const newerBootstrap = run("review-window", {
      id: 902,
      created_at: at(140),
      started_at: at(140),
      completed_at: at(150),
      external_id: "",
    });
    expect(
      evaluateMergeChecks(
        [...greenRuns(), trusted, invalidation, newerBootstrap],
        policy as never,
      ).mergeChecksDone,
    ).toBe(false);
  });

  it("accepterar aldrig bootstrap-success som trusted mergekvitto", () => {
    const bootstrap = run("review-window", {
      id: 800,
      external_id: "",
      created_at: at(100),
      started_at: at(100),
      completed_at: at(120),
    });

    const state = evaluateMergeChecks([...greenRuns(), bootstrap], policy as never);
    expect(state.trustedWindowDone).toBe(false);
    expect(state.mergeChecksDone).toBe(false);
  });

  it("låter aldrig en nyare bootstrap-check skymma trusted review-window", () => {
    const trusted = run("review-window", {
      id: 900,
      external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:100`,
      created_at: at(100),
      started_at: at(100),
      completed_at: at(120),
    });
    const sameAppBootstrap = run("review-window", {
      id: 901,
      external_id: "",
      created_at: at(130),
      started_at: at(130),
      completed_at: at(140),
    });

    const state = evaluateMergeChecks(
      [...greenRuns(), trusted, sameAppBootstrap],
      policy as never,
    );
    expect(state.trustedWindowDone).toBe(true);
    expect(state.mergeChecksDone).toBe(true);
    expect(state.reviewWindowEpoch).toBe(120);
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
      reviews: [{ id: 2, submitted_at: at(130) }],
      reviewComments: [{ id: 3, created_at: at(140), updated_at: at(150) }],
    };
    expect(latestConversationEpoch(evidence as never, 9)).toEqual({
      valid: true,
      latestEpoch: 150,
    });
    expect(
      latestConversationEpoch({ ...evidence, reviews: [{ id: 2, submitted_at: null }] } as never, 9)
        .valid,
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

function integrationHarness({ raceHead = false, failCheckPoll = false } = {}) {
  const patches: Array<Record<string, unknown>> = [];
  const counters = { pulls: 0, evidence: 0, checkPolls: 0 };
  const pr = {
    number: 1,
    base: { ref: "master" },
    head: { sha: HEAD },
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
    created_at: at(1_000),
    app: { id: 1, slug: "github-actions" },
  };
  const olderGate = {
    ...currentGate,
    id: 99,
    external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:900`,
    started_at: at(900),
    created_at: at(900),
  };
  const checks = [currentGate, olderGate, ...greenRuns()];
  const signoff = {
    body: `merge:ready — head-sha: ${HEAD}, base-sha: ${BASE}, at: 1970-01-01T00:16:40Z, bugkoll: trusted, triage: klar, P0/P1: 0`,
    created_at: at(1_000),
    user: { login: "pr-author", type: "User" },
    author_association: "NONE",
  };

  const client = {
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
      throw new Error(`unexpected request ${options.method ?? "GET"} ${path}`);
    },
    async paginate(path: string, key?: string | null) {
      if (path.startsWith(`/commits/${HEAD}/check-runs`)) {
        counters.checkPolls += 1;
        if (failCheckPoll) throw new Error("check API unavailable");
        return structuredClone(checks);
      }
      if (path === "/issues/1/comments") return [structuredClone(signoff)];
      if (path === "/pulls/1/reviews" || path === "/pulls/1/comments") return [];
      throw new Error(`unexpected paginate ${path} ${key ?? ""}`);
    },
  };
  return { client, patches, counters };
}

function mergeHarness({ failDispatch = false } = {}) {
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  let mutateConversation = false;
  const pr = {
    number: 1,
    state: "open",
    draft: false,
    base: { ref: "master" },
    head: { sha: HEAD },
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
    body: "tidigare sign-off",
    created_at: at(150),
    updated_at: at(150),
    user: { login: "pr-author", type: "User" },
    author_association: "NONE",
  };
  const trustedWindow = run("review-window", {
    id: 900,
    external_id: `sajtmaskin-trusted-review-window:v1:${HEAD}:100`,
    completed_at: at(120),
  });
  const checks = [...greenRuns(), trustedWindow];
  const client = {
    async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
      calls.push({ path, method: options.method ?? "GET", body: options.body });
      if (path === "/pulls/1") return structuredClone(pr);
      if (path === "/issues/comments/77") return structuredClone(command);
      if (path === "/git/ref/heads/master") return { object: { sha: BASE } };
      if (path === `/compare/${BASE}...${HEAD}`) {
        return { status: "ahead", merge_base_commit: { sha: BASE } };
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
    async paginate(path: string) {
      if (path === "/pulls?state=open&base=master") return [];
      if (path.startsWith(`/commits/${HEAD}/check-runs`)) return structuredClone(checks);
      if (path === "/issues/1/comments") {
        return [
          {
            ...structuredClone(signoff),
            body: mutateConversation ? "ändrad sign-off" : signoff.body,
          },
          structuredClone(command),
        ];
      }
      if (path === "/pulls/1/reviews" || path === "/pulls/1/comments") return [];
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
