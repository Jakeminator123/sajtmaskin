/**
 * OMTAG 1·05 — tests för scaffold-default-blockering av `app/page.tsx`.
 *
 * Innan fixen: om LLM skrev om `app/layout.tsx` men inte `app/page.tsx`,
 * persisterade mergen scaffold-defaultens page.tsx under användarens
 * layout. Resultat: "Nordic Future Summit"-innehåll under en ny brand.
 *
 * Efter fixen: scaffold-defaultens `app/page.tsx` EXCLUDERAS ur merge-basen.
 * Om LLM inte emittade sin egen page.tsx hamnar den inte i det slutliga
 * filesJson:t och finalize-version markerar versionen verification-blocked
 * via en ny preflight-issue i category `code_structure_failure`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { mergeGeneratedProjectFiles } from "./finalize-merge";

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
}));
vi.mock("@/lib/utils/debug", () => ({
  warnLog: vi.fn(),
  debugLog: vi.fn(),
  infoLog: vi.fn(),
  errorLog: vi.fn(),
}));
vi.mock("@/lib/gen/autofix/rules/cross-file-import-checker", () => ({
  checkCrossFileImports: (files: unknown) => ({ files, fixes: [] }),
}));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  getPreferredVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getVersionById: vi.fn(),
  getKnownBrokenImageReplacements: vi.fn(),
  updateVersionFiles: vi.fn(),
}));
vi.mock("@/lib/observability/metrics", () => ({
  incIngressEvent: vi.fn(),
}));

function makeScaffold(): ScaffoldManifest {
  return {
    id: "test-scaffold",
    label: "Test Scaffold",
    description: "test",
    version: "1.0.0",
    siteKind: "landing-page",
    features: [],
    promptHints: [],
    files: [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <div>Scaffold default</div>; }",
      },
      {
        path: "app/layout.tsx",
        content:
          "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        content: "/* scaffold globals */",
      },
      {
        path: "tailwind.config.ts",
        content: "export default {};",
      },
    ],
  } as unknown as ScaffoldManifest;
}

describe("OMTAG 1·05 — scaffold-default blocking for app/page.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags missingEmittedEssentials when LLM skipped app/page.tsx on init", () => {
    const scaffold = makeScaffold();
    const generatedFiles = [
      {
        path: "app/layout.tsx",
        content:
          "export default function Layout({ children }: { children: React.ReactNode }) { return <html lang='sv'><body className='bg-stone-950'>{children}</body></html>; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c1",
      originalFilesJson: "[]",
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles: undefined,
    });

    expect(result.scaffoldDefaultsBlocked).toEqual([
      { path: "app/page.tsx", emittedByLlm: false },
    ]);
    expect(result.missingEmittedEssentials).toEqual(["app/page.tsx"]);

    // Final merged files should NOT contain a page.tsx (scaffold-default was blocked).
    const mergedFiles = JSON.parse(result.filesJson) as Array<{ path: string }>;
    const paths = new Set(mergedFiles.map((f) => f.path));
    expect(paths.has("app/page.tsx")).toBe(false);
    expect(paths.has("app/layout.tsx")).toBe(true);
    expect(paths.has("app/globals.css")).toBe(true);
    expect(paths.has("tailwind.config.ts")).toBe(true);
  });

  it("accepts LLM-emitted app/page.tsx and does not flag it as missing", () => {
    const scaffold = makeScaffold();
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Brand site for Pulseframe</h1>; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c2",
      originalFilesJson: "[]",
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles: undefined,
    });

    expect(result.scaffoldDefaultsBlocked).toEqual([
      { path: "app/page.tsx", emittedByLlm: true },
    ]);
    expect(result.missingEmittedEssentials).toEqual([]);

    const mergedFiles = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const page = mergedFiles.find((f) => f.path === "app/page.tsx");
    expect(page).toBeDefined();
    expect(page!.content).toContain("Pulseframe");
    expect(page!.content).not.toContain("Scaffold default");
  });

  it("does not engage scaffold-default-block on follow-up merges", () => {
    // Follow-up path: previousFiles drives the merge base, scaffold isn't used.
    const scaffold = makeScaffold();
    const previousFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Prior version</h1>; }",
        language: "tsx",
      },
    ];
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>New version</h1>; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c3",
      originalFilesJson: JSON.stringify(previousFiles),
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles,
    });

    expect(result.scaffoldDefaultsBlocked).toEqual([]);
    expect(result.missingEmittedEssentials).toEqual([]);

    const mergedFiles = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const page = mergedFiles.find((f) => f.path === "app/page.tsx");
    expect(page).toBeDefined();
    expect(page!.content).toContain("New version");
  });

  it("keeps `app/layout.tsx` as a legitimate scaffold default (not blacklisted)", () => {
    // Layout is NOT in the blacklist — LLMs skip it often and the scaffold's
    // layout is usually the right choice. This test pins that decision so a
    // future expansion of LLM_ONLY_PATHS doesn't regress it silently.
    const scaffold = makeScaffold();
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Pulseframe</h1>; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c4",
      originalFilesJson: "[]",
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles: undefined,
    });

    const mergedFiles = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const layout = mergedFiles.find((f) => f.path === "app/layout.tsx");
    expect(layout).toBeDefined();
    expect(layout!.content).toContain("html");
  });
});

/**
 * SCAFFOLD_PROTECTED_PATHS — counterpart to LLM_ONLY_PATHS.
 *
 * Locks the canonical scaffold version of pure-utility files (no brand/copy
 * content) so an LLM emission of the same path is dropped before merge. The
 * flagship case is `app/api/placeholder/route.ts`: the scaffold ships a
 * correct SVG generator, but LLMs frequently regenerate the file with JSX
 * syntax (`<svg style="...">` inside a `.ts` file), producing
 * `Expected ">" but found "style"` syntax errors that block tier-2 readiness.
 *
 * In the 2026-04-27 baseline-after-revert eval this single path explained
 * 6 of 13 failing prompts. Keeping the scaffold version is the deterministic
 * fix.
 */
describe("SCAFFOLD_PROTECTED_PATHS — scaffold-default lock for utility files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const SCAFFOLD_PLACEHOLDER_CONTENT =
    'import { NextRequest } from "next/server";\nexport async function GET(_req: NextRequest) {\n  return new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } });\n}\n';

  // Faux LLM emission with JSX inside a .ts file — what we observed
  // breaking the eval for 6 prompts on 2026-04-27.
  const BROKEN_LLM_PLACEHOLDER_CONTENT =
    'import { NextRequest } from "next/server";\n\nexport async function GET(req: NextRequest) {\n  return (\n    <svg style="background:black">\n      <rect />\n    </svg>\n  );\n}\n';

  function makeScaffoldWithPlaceholderRoute(): ScaffoldManifest {
    const base = makeScaffold();
    return {
      ...base,
      files: [
        ...base.files,
        {
          path: "app/api/placeholder/route.ts",
          content: SCAFFOLD_PLACEHOLDER_CONTENT,
        },
      ],
    } as ScaffoldManifest;
  }

  it("drops LLM emission of scaffold-protected path on init merge so scaffold default persists", () => {
    const scaffold = makeScaffoldWithPlaceholderRoute();
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Brand</h1>; }",
        language: "tsx",
      },
      {
        path: "app/api/placeholder/route.ts",
        content: BROKEN_LLM_PLACEHOLDER_CONTENT,
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c-protected-1",
      originalFilesJson: "[]",
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles: undefined,
    });

    const mergedFiles = JSON.parse(result.filesJson) as Array<{
      path: string;
      content: string;
    }>;
    const placeholder = mergedFiles.find(
      (f) => f.path === "app/api/placeholder/route.ts",
    );
    expect(placeholder).toBeDefined();
    expect(placeholder!.content).toBe(SCAFFOLD_PLACEHOLDER_CONTENT);
    expect(placeholder!.content).not.toContain('style="background:black"');
  });

  it("drops LLM emission of scaffold-protected path on follow-up merge so previous version persists", () => {
    const scaffold = makeScaffoldWithPlaceholderRoute();
    const previousFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Prior</h1>; }",
        language: "tsx",
      },
      {
        path: "app/api/placeholder/route.ts",
        content: SCAFFOLD_PLACEHOLDER_CONTENT,
        language: "tsx",
      },
    ];
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>New</h1>; }",
        language: "tsx",
      },
      {
        path: "app/api/placeholder/route.ts",
        content: BROKEN_LLM_PLACEHOLDER_CONTENT,
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c-protected-2",
      originalFilesJson: JSON.stringify(previousFiles),
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles,
    });

    const mergedFiles = JSON.parse(result.filesJson) as Array<{
      path: string;
      content: string;
    }>;
    const placeholder = mergedFiles.find(
      (f) => f.path === "app/api/placeholder/route.ts",
    );
    expect(placeholder).toBeDefined();
    expect(placeholder!.content).toBe(SCAFFOLD_PLACEHOLDER_CONTENT);
    const page = mergedFiles.find((f) => f.path === "app/page.tsx");
    expect(page!.content).toContain("New");
  });

  it("drops scaffold-protected paths from the no-scaffold/no-merge fallback branch", () => {
    // Edge case: when there is no scaffold, no follow-up base, and no
    // cross-file/type-only fixes, mergeGeneratedProjectFiles falls through
    // to a branch that reads `originalFilesJson` directly. Before fix:
    // SCAFFOLD_PROTECTED_PATHS filter was only applied to `generatedFiles`,
    // so a protected path embedded in `originalFilesJson` would slip past.
    const originalFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>x</h1>; }",
        language: "tsx",
      },
      {
        path: "app/api/placeholder/route.ts",
        content: BROKEN_LLM_PLACEHOLDER_CONTENT,
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c-protected-fallback",
      originalFilesJson: JSON.stringify(originalFiles),
      generatedFiles: [],
      resolvedScaffold: null,
      previousFiles: undefined,
    });

    const mergedFiles = JSON.parse(result.filesJson) as Array<{ path: string }>;
    const placeholder = mergedFiles.find(
      (f) => f.path === "app/api/placeholder/route.ts",
    );
    expect(placeholder).toBeUndefined();
    expect(mergedFiles.find((f) => f.path === "app/page.tsx")).toBeDefined();
  });

  it("does not affect non-protected paths", () => {
    const scaffold = makeScaffoldWithPlaceholderRoute();
    const generatedFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <h1>Brand</h1>; }",
        language: "tsx",
      },
      {
        path: "app/layout.tsx",
        content:
          "export default function Layout({ children }: { children: React.ReactNode }) { return <html lang='sv'><body className='bg-stone-950'>{children}</body></html>; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "c-protected-3",
      originalFilesJson: "[]",
      generatedFiles,
      resolvedScaffold: scaffold,
      previousFiles: undefined,
    });

    const mergedFiles = JSON.parse(result.filesJson) as Array<{
      path: string;
      content: string;
    }>;
    const layout = mergedFiles.find((f) => f.path === "app/layout.tsx");
    expect(layout!.content).toContain("bg-stone-950");
  });
});
