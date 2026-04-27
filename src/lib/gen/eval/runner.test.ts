import { describe, expect, it } from "vitest";
import { deriveEvalCheckSources, resolveEvalPassOutcome } from "./runner";
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
