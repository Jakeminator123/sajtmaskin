import { describe, expect, it } from "vitest";
import {
  classifyEvalStreamOutcome,
  classifyEvalThrownError,
  collectEvalStream,
  deriveEvalCheckSources,
  evalExitCode,
  resolveEvalEnvironment,
  resolveEvalPassOutcome,
  resolveEvalRunOutcome,
  summarizeEvalResults,
  type EvalResult,
} from "./runner";
import { checkProjectSanity, type CheckResult } from "./checks";
import type { CodeFile } from "../parser";

function makeCheck(
  name: string,
  passed: boolean,
  score: number,
  message = "",
): CheckResult {
  return { name, passed, score, message };
}

describe("resolveEvalPassOutcome", () => {
  it("fails when a critical readiness check fails even if total score is acceptable", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", false, 0, "dependency risk"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("responsive", true, 1, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.67,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toEqual(["project-sanity"]);
  });

  it("fails when SEO publish-readiness reports blocking metadata errors", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck(
          "seo-publish-readiness",
          false,
          0,
          "app/layout.tsx: Layouten saknar export av metadata för title/description.",
        ),
      ],
      shouldCompile: false,
      totalScore: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("seo-publish-readiness");
  });

  it("fails when syntax is required and syntax check fails", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("syntax", false, 0, "syntax failed"),
      ],
      shouldCompile: true,
      totalScore: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("syntax");
  });

  it("fails when required structural checks fail even if total score is acceptable", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("required-files", false, 0.5, "missing app/layout.tsx"),
        makeCheck("responsive", true, 1, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.88,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("required-files");
  });

  it("passes when critical checks pass and score clears threshold", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("no-bracket-placeholders", true, 1, "ok"),
        makeCheck("responsive", true, 0.8, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.95,
    });

    expect(result.passed).toBe(true);
    expect(result.blockingChecks).toEqual([]);
  });
});

/**
 * Regression lock for the 2026-08-17 weekly eval run. OpenAI answered every
 * codegen call with `credit_balance_exhausted`, the SSE reader only looked at
 * `event: content`, and the empty result was scored through all 12 checks — so
 * an unpaid invoice was reported as an 18-prompt quality collapse (−23.6 % vs
 * baseline, 14 fake `PASS → FAIL`). A provider failure is not a bad website.
 */
describe("classifyEvalStreamOutcome", () => {
  it("reports a provider error event instead of scoring the empty content", () => {
    const outcome = classifyEvalStreamOutcome({
      content: "",
      errorPayloads: [
        {
          message: "OpenAI-krediten är slut. Fyll på i ditt OpenAI-konto.",
          code: "credit_balance_exhausted",
          permanent: true,
          providerFault: true,
        },
      ],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("provider_error");
    expect(outcome.failure.code).toBe("credit_balance_exhausted");
    expect(outcome.failure.providerFault).toBe(true);
  });

  it("prefers the provider fault even when partial content arrived before it", () => {
    const outcome = classifyEvalStreamOutcome({
      content: "```tsx\nexport default function Page(){",
      errorPayloads: [
        {
          message: "Provider rate limit",
          code: "rate_limit_exceeded",
          providerFault: true,
        },
      ],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("provider_error");
  });

  /**
   * `stream-format.ts` emits `error` with `code: output_truncated` (and no
   * `providerFault`) *after* streaming real code. Treating every error event as
   * a provider failure would mark those runs unmeasured, so a genuine truncation
   * regression could walk past the gate as infra noise.
   */
  it("still scores a truncated response, because truncation is a quality outcome", () => {
    const outcome = classifyEvalStreamOutcome({
      content: "export default function Page(){return <main/>;}",
      errorPayloads: [
        {
          code: "output_truncated",
          finishReason: "length",
          message: "Modellen nådde maxlängden och svaret kan vara trunkerat.",
        },
      ],
    });

    expect(outcome).toEqual({
      ok: true,
      content: "export default function Page(){return <main/>;}",
    });
  });

  it("reports an unattributable error with no content as unmeasured, keeping its code", () => {
    const outcome = classifyEvalStreamOutcome({
      content: "",
      errorPayloads: [{ message: "Provider avbröt strömmen — försök igen eller byt modell." }],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("empty_stream");
    expect(outcome.failure.message).toMatch(/avbröt strömmen/);
  });

  it("treats a silent empty stream as unmeasured, not as zero quality", () => {
    const outcome = classifyEvalStreamOutcome({ content: "   \n", errorPayloads: [] });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("empty_stream");
  });

  it("passes real content through to the checks", () => {
    const outcome = classifyEvalStreamOutcome({
      content: "export default function Page(){return null;}",
      errorPayloads: [],
    });

    expect(outcome).toEqual({
      ok: true,
      content: "export default function Page(){return null;}",
    });
  });
});

describe("collectEvalStream", () => {
  function sse(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
  }

  it("surfaces the provider error event the old reader silently dropped", async () => {
    const collection = await collectEvalStream(
      streamOf([
        sse("meta", { chatId: "eval_coffee-shop" }),
        sse("error", {
          message: "OpenAI-krediten är slut. Fyll på i ditt OpenAI-konto.",
          code: "credit_balance_exhausted",
          permanent: true,
          providerFault: true,
        }),
      ]),
    );

    expect(collection.content).toBe("");
    expect(collection.errorPayloads).toHaveLength(1);
    expect(collection.errorPayloads[0].code).toBe("credit_balance_exhausted");
  });

  it("keeps content that arrives split across chunk boundaries", async () => {
    // The previous reader paired `event:`/`data:` lines inside a single decoded
    // chunk, so any event cut in half by the network was lost outright.
    const wire = sse("content", { text: "export default" }) + sse("content", { text: " function Page(){}" });
    const cut = Math.floor(wire.length / 2);

    const collection = await collectEvalStream(
      streamOf([wire.slice(0, cut), wire.slice(cut)]),
    );

    expect(collection.content).toBe("export default function Page(){}");
    expect(collection.errorPayloads).toEqual([]);
  });
});

describe("classifyEvalThrownError", () => {
  it("classifies a provider fault thrown out of generateCode", () => {
    const inner = Object.assign(new Error("You have no credits remaining."), {
      code: "credit_balance_exhausted",
    });
    const wrapper = Object.assign(new Error("Failed after 3 attempts."), { cause: inner });

    expect(classifyEvalThrownError(wrapper)?.kind).toBe("provider_error");
  });

  it("classifies a transport failure as a provider error", () => {
    expect(classifyEvalThrownError(Object.assign(new Error("socket hang up"), {
      code: "UND_ERR_SOCKET",
    }))?.kind).toBe("provider_error");
  });

  it("leaves a real harness bug reported as a generation failure", () => {
    expect(classifyEvalThrownError(new TypeError("cannot read property of undefined"))).toBeNull();
  });
});

function evalResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    promptId: "coffee-shop",
    generationStatus: "passed",
    failureStage: null,
    generationTimeMs: 1_000,
    fileCount: 4,
    finalProjectFiles: 10,
    generatedSurfaceFiles: 4,
    scaffoldId: "landing-page",
    variantId: "corporate-grid",
    promptSize: {
      totalChars: 0,
      totalEstimatedTokens: 0,
      staticCoreChars: 0,
      staticCoreEstimatedTokens: 0,
      dynamicContextChars: 0,
      dynamicContextEstimatedTokens: 0,
      dynamicBudgetUsedTokens: 0,
      dynamicBudgetBudgetTokens: 0,
      droppedBlocks: 0,
      largestBlocks: [],
    },
    preflight: {
      errors: 0,
      warnings: 0,
      previewBlocked: false,
      previewBlockingReason: null,
    },
    droppedProtectedPaths: [],
    checks: [],
    totalScore: 0.9,
    passed: true,
    blockingChecks: [],
    ...overrides,
  };
}

describe("summarizeEvalResults", () => {
  it("keeps provider failures out of the quality average", () => {
    const summary = summarizeEvalResults([
      evalResult({ promptId: "coffee-shop", totalScore: 0.9, passed: true }),
      evalResult({
        promptId: "restaurant",
        generationStatus: "skipped",
        failureStage: "provider_error",
        totalScore: 0,
        passed: false,
        generationTimeMs: 0,
      }),
    ]);

    // Averaging over both would report 45 % and read as a regression.
    expect(summary.avgScore).toBeCloseTo(0.9);
    expect(summary.avgTimeMs).toBe(1_000);
    expect(summary.evaluated).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.providerErrors).toBe(1);
    expect(summary.infraErrors).toBe(0);
  });

  it("counts missing env and empty streams as infra, not provider", () => {
    const summary = summarizeEvalResults([
      evalResult({ generationStatus: "skipped", failureStage: "preflight_env", passed: false }),
      evalResult({ generationStatus: "skipped", failureStage: "empty_stream", passed: false }),
    ]);

    expect(summary.infraErrors).toBe(2);
    expect(summary.providerErrors).toBe(0);
    expect(summary.evaluated).toBe(0);
    expect(summary.avgScore).toBe(0);
  });
});

describe("resolveEvalRunOutcome / evalExitCode", () => {
  function summaryWith(overrides: Partial<ReturnType<typeof summarizeEvalResults>>) {
    return { ...summarizeEvalResults([evalResult({})]), ...overrides };
  }

  it("reports a provider error ahead of any quality verdict", () => {
    const outcome = resolveEvalRunOutcome({
      summary: summaryWith({ providerErrors: 1 }),
      gateFailed: true,
    });

    expect(outcome).toBe("provider_error");
    expect(evalExitCode(outcome)).toBe(2);
  });

  it("reports infra errors ahead of any quality verdict", () => {
    const outcome = resolveEvalRunOutcome({ summary: summaryWith({ infraErrors: 1 }) });

    expect(outcome).toBe("infra_error");
    expect(evalExitCode(outcome)).toBe(2);
  });

  it("fails on quality only when the gate actually failed on measured prompts", () => {
    expect(evalExitCode(resolveEvalRunOutcome({ summary: summaryWith({}), gateFailed: true }))).toBe(1);
    expect(evalExitCode(resolveEvalRunOutcome({ summary: summaryWith({}) }))).toBe(0);
  });
});

describe("resolveEvalEnvironment", () => {
  it("fails fast when no database connection env is configured", () => {
    const result = resolveEvalEnvironment({} as NodeJS.ProcessEnv);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("preflight=failed_env");
      expect(result.message).toContain("POSTGRES_URL");
    }
  });

  it("accepts configured database env before eval spends LLM tokens", () => {
    const result = resolveEvalEnvironment({
      POSTGRES_URL: "postgresql://example.test/db",
    } as unknown as NodeJS.ProcessEnv);

    expect(result).toEqual({ ok: true, dbEnvName: "POSTGRES_URL" });
  });
});

/**
 * Regression: eval gate checks must measure the canonical persist
 * payload (post-merge / post-protected-paths-guard), not the raw LLM
 * emission. Pre-2026-04-27 the harness ran `checkSyntax` against the
 * autofixed raw stream content and `checkProjectSanity` against
 * `project.files`, so a broken `app/api/placeholder/route.ts` that the
 * runtime correctly dropped via `SCAFFOLD_PROTECTED_PATHS` still
 * showed up in eval as a syntax FAIL — masking the real fix.
 *
 * These fixtures pin the new contract:
 *
 *   A. Broken protected path → preflight replaces with scaffold default
 *      → eval syntax PASSES.
 *   B. Broken LLM-owned path (e.g. `app/page.tsx`, which is in
 *      `LLM_ONLY_PATHS` and never gets a scaffold default) → eval
 *      syntax FAILS.
 *   C. Unresolved local import that survives into the canonical
 *      runtime payload → `checkProjectSanity` FAILS.
 *   D. Deterministic materialized helper in canonical runtime payload
 *      resolves the same import even though the helper was not part of
 *      raw LLM output.
 */
describe("deriveEvalCheckSources — eval mätpunkt = canonical, ej raw", () => {
  const VALID_TS = `import { NextRequest } from "next/server";

export async function GET(_request: NextRequest) {
  return new Response("ok");
}
`;
  const BROKEN_TS_WITH_JSX = `import { NextRequest } from "next/server";

export async function GET(_request: NextRequest) {
  return new Response(<svg style="width:100%"><rect/></svg>);
}
`;
  const VALID_PAGE_TSX = `export default function Page() {
  return <main>OK</main>;
}
`;
  const BROKEN_PAGE_TSX = `export default function Page() {
  return <main style=>broken</main>;
}
`;

  function file(path: string, content: string, language = "tsx"): CodeFile {
    return { path, content, language };
  }

  it("A — broken protected path replaced by scaffold default → canonical content carries the scaffold version, not the LLM emission", () => {
    const rawFiles = [
      file("app/page.tsx", VALID_PAGE_TSX),
      file("app/api/placeholder/route.ts", BROKEN_TS_WITH_JSX, "ts"),
    ];
    const preflightFiles = [
      file("app/page.tsx", VALID_PAGE_TSX),
      // Canonical preflight payload: protected-paths guard dropped the
      // LLM emission upstream; `buildCompleteProject` re-injected the
      // scaffold default content (valid TS).
      file("app/api/placeholder/route.ts", VALID_TS, "ts"),
      // `buildCompleteProject` also adds infrastructure files such as
      // `package.json` / `tsconfig.json`; these must NOT count toward
      // the user-emitted gate-check view.
      file("package.json", '{"name":"test"}', "json"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(preflightFiles),
    });

    expect(sources.droppedProtectedPaths).toEqual(["app/api/placeholder/route.ts"]);
    expect(sources.generatedSurfaceFiles.map((f) => f.path)).toEqual(["app/page.tsx"]);
    expect(sources.canonicalFiles.map((f) => f.path).sort()).toEqual([
      "app/api/placeholder/route.ts",
      "app/page.tsx",
    ]);
    const placeholder = sources.canonicalFiles.find(
      (f) => f.path === "app/api/placeholder/route.ts",
    );
    expect(placeholder?.content).toBe(VALID_TS);
    // The broken JSX-in-`.ts` payload that motivated the protected
    // set must NOT appear in the syntax-check input.
    expect(sources.canonicalContent).not.toContain('style="width:100%"');
    expect(sources.canonicalContent).toContain(VALID_TS.split("\n")[0]);
  });

  it("B — broken LLM-owned path survives into canonical content (so downstream syntax check will FAIL on it)", () => {
    const rawFiles = [
      file("app/page.tsx", BROKEN_PAGE_TSX),
      file("components/header.tsx", "export const Header=()=><nav/>;"),
    ];
    const preflightFiles = [
      // `app/page.tsx` is in LLM_ONLY_PATHS — no scaffold replacement.
      // The broken content reaches the persist payload.
      file("app/page.tsx", BROKEN_PAGE_TSX),
      file("components/header.tsx", "export const Header=()=><nav/>;"),
      file("package.json", '{"name":"test"}', "json"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(preflightFiles),
    });

    expect(sources.droppedProtectedPaths).toEqual([]);
    expect(
      sources.canonicalFiles.find((f) => f.path === "app/page.tsx")?.content,
    ).toBe(BROKEN_PAGE_TSX);
    // Broken page.tsx must still be visible to the syntax-check input
    // so eval flags real LLM bugs (vs the protected-path false
    // positive in fixture A).
    expect(sources.canonicalContent).toContain("style=>broken");
  });

  it("C — unresolved local import in canonical runtime payload → project-sanity FAIL", () => {
    const rawFiles = [
      file(
        "app/page.tsx",
        `import { Icon } from "@/components/icon";\nexport default function Page(){return <Icon/>;}\n`,
      ),
    ];
    // Canonical payload has the same unresolved import — protected-paths
    // guard does not save it because @/components/icon is not a
    // protected scaffold default.
    const preflightFiles = [
      file(
        "app/page.tsx",
        `import { Icon } from "@/components/icon";\nexport default function Page(){return <Icon/>;}\n`,
      ),
      file("package.json", '{"name":"test"}', "json"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(preflightFiles),
    });
    const sanity = checkProjectSanity(sources.canonicalRuntimeFiles);
    expect(sanity.passed).toBe(false);
    expect(sanity.message.toLowerCase()).toContain("@/components/icon");
  });

  it("D — deterministic materialized helper in canonical runtime payload resolves local import", () => {
    const rawFiles = [
      file(
        "app/page.tsx",
        `import { Icon } from "@/components/icon";\nexport default function Page(){return <Icon/>;}\n`,
      ),
    ];
    const preflightFiles = [
      file(
        "app/page.tsx",
        `import { Icon } from "@/components/icon";\nexport default function Page(){return <Icon/>;}\n`,
      ),
      // Added by deterministic preflight/cross-file repair. It should
      // be included for runtime-readiness checks even though it was not
      // emitted by the LLM.
      file(
        "components/icon.tsx",
        `export function Icon(){return <span aria-hidden="true" />;}\nexport default Icon;\n`,
      ),
      file("package.json", '{"name":"test"}', "json"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(preflightFiles),
    });
    expect(sources.canonicalFiles.map((f) => f.path)).toEqual(["app/page.tsx"]);
    expect(sources.generatedSurfaceFiles.map((f) => f.path)).toEqual(["app/page.tsx"]);
    expect(sources.canonicalRuntimeFiles.map((f) => f.path)).toContain("components/icon.tsx");
    const sanity = checkProjectSanity(sources.canonicalRuntimeFiles);
    expect(sanity.passed).toBe(true);
  });

  it("infrastructure-only canonical files are excluded from user-emitted view", () => {
    // If preflight added scaffold defaults the LLM never asked for
    // (e.g. `eslint.config.mjs`), they must not show up in
    // canonicalFiles. The user-emitted view is "files that were in the
    // original LLM emission, but with the canonical post-guard content".
    const rawFiles = [file("app/page.tsx", VALID_PAGE_TSX)];
    const preflightFiles = [
      file("app/page.tsx", VALID_PAGE_TSX),
      file("eslint.config.mjs", "export default [];", "js"),
      file("postcss.config.mjs", "export default {};", "js"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(preflightFiles),
    });

    expect(sources.canonicalFiles.map((f) => f.path)).toEqual(["app/page.tsx"]);
  });

  it("excludes generated support files from surface file count", () => {
    const rawFiles = [
      file("app/page.tsx", VALID_PAGE_TSX),
      file("components/hero.tsx", "export default function Hero(){return <section/>;}"),
      file("app/loading.tsx", "export default function Loading(){return null;}"),
      file("app/error.tsx", "export default function Error(){return null;}"),
      file("app/not-found.tsx", "export default function NotFound(){return null;}"),
      file("app/sitemap.ts", "export default [];", "ts"),
      file("app/api/contact/route.ts", VALID_TS, "ts"),
      file("package.json", '{"dependencies":{}}', "json"),
    ];

    const sources = deriveEvalCheckSources({
      rawFiles,
      preflightFilesJson: JSON.stringify(rawFiles),
    });

    expect(sources.generatedSurfaceFiles.map((f) => f.path)).toEqual([
      "app/page.tsx",
      "components/hero.tsx",
    ]);
    expect(sources.canonicalRuntimeFiles.map((f) => f.path)).toContain("app/loading.tsx");
  });

  it("malformed preflight JSON degrades gracefully to empty canonical", () => {
    const sources = deriveEvalCheckSources({
      rawFiles: [{ path: "app/page.tsx", content: "x", language: "tsx" }],
      preflightFilesJson: "not-valid-json",
    });
    expect(sources.canonicalFiles).toEqual([]);
    expect(sources.canonicalRuntimeFiles).toEqual([]);
    expect(sources.canonicalContent).toBe("");
  });
});
