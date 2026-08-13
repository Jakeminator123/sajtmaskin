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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { DossierEntry } from "@/lib/gen/dossiers";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { mergeGeneratedProjectFiles } from "./finalize-merge";

type CrossFileFix = {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
};

const checkCrossFileImports = vi.hoisted(() =>
  vi.fn(
    (files: unknown): { files: unknown; fixes: CrossFileFix[] } => ({
      files,
      fixes: [],
    }),
  ),
);

vi.mock("@/lib/logging/dev-log", () => ({
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
  checkCrossFileImports,
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

const getDossierFileContent = vi.hoisted(() =>
  vi.fn<(klass: string, id: string, relPath: string) => string | null>(() => null),
);
vi.mock("@/lib/gen/dossiers/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gen/dossiers/registry")>();
  return {
    ...actual,
    getDossierFileContent: (...args: [string, string, string]) =>
      getDossierFileContent(...args),
  };
});

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

function makeDossier(
  id: string,
  capability: string,
  paths: string[],
): DossierEntry {
  return {
    id,
    capability,
    files: paths.map((path) => ({
      path,
      role: "shared",
      injectionMode: "rewritable",
    })),
  } as unknown as DossierEntry;
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

// Regression (2026-07-31): the blog scaffold ships `app/blog/**`, the Swedish
// route plan settles on `/blogg`, and the model emits `app/blogg/**`. Both used
// to land in the project, so the finished site had `/blog` and `/blog/[slug]`
// with no navigation pointing at them.
describe("locale-superseded scaffold routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeBlogScaffold(): ScaffoldManifest {
    const scaffold = makeScaffold();
    return {
      ...scaffold,
      files: [
        ...scaffold.files,
        { path: "app/blog/page.tsx", content: "export default function Blog() { return <div>Blog</div>; }" },
        {
          path: "app/blog/[slug]/page.tsx",
          content: "export default function Post() { return <article>Post</article>; }",
        },
      ],
    } as unknown as ScaffoldManifest;
  }

  it("drops the scaffold's /blog when the model emitted /blogg", () => {
    const result = mergeGeneratedProjectFiles({
      chatId: "c-locale-1",
      originalFilesJson: "[]",
      generatedFiles: [
        { path: "app/page.tsx", content: "export default function Page() { return <h1>Hem</h1>; }", language: "tsx" },
        { path: "app/blogg/page.tsx", content: "export default function Blogg() { return <h1>Blogg</h1>; }", language: "tsx" },
        {
          path: "app/blogg/[slug]/page.tsx",
          content: "export default function Inlagg() { return <article>Inlägg</article>; }",
          language: "tsx",
        },
      ],
      resolvedScaffold: makeBlogScaffold(),
      previousFiles: undefined,
    });

    const paths = new Set((JSON.parse(result.filesJson) as Array<{ path: string }>).map((f) => f.path));
    expect(paths.has("app/blogg/page.tsx")).toBe(true);
    expect(paths.has("app/blog/page.tsx")).toBe(false);
    expect(paths.has("app/blog/[slug]/page.tsx")).toBe(false);
  });

  it("keeps the scaffold's /blog when the model emitted no Swedish alternate", () => {
    const result = mergeGeneratedProjectFiles({
      chatId: "c-locale-2",
      originalFilesJson: "[]",
      generatedFiles: [
        { path: "app/page.tsx", content: "export default function Page() { return <h1>Hem</h1>; }", language: "tsx" },
      ],
      resolvedScaffold: makeBlogScaffold(),
      previousFiles: undefined,
    });

    const paths = new Set((JSON.parse(result.filesJson) as Array<{ path: string }>).map((f) => f.path));
    expect(paths.has("app/blog/page.tsx")).toBe(true);
    expect(paths.has("app/blog/[slug]/page.tsx")).toBe(true);
  });

  // The mirror direction, exercised through the real merge rather than the
  // helper alone. While the merge asked for superseded routes with a hardcoded
  // `"sv"`, this case reported nothing and the orphaned `/kontakt` survived.
  it("drops a Swedish scaffold route when the model emitted the English one", () => {
    const scaffold = makeScaffold();
    const result = mergeGeneratedProjectFiles({
      chatId: "c-locale-3",
      originalFilesJson: "[]",
      generatedFiles: [
        { path: "app/page.tsx", content: "export default function Page() { return <h1>Home</h1>; }", language: "tsx" },
        {
          path: "app/contact/page.tsx",
          content: "export default function Contact() { return <h1>Contact</h1>; }",
          language: "tsx",
        },
      ],
      resolvedScaffold: {
        ...scaffold,
        files: [
          ...scaffold.files,
          {
            path: "app/kontakt/page.tsx",
            content: "export default function Kontakt() { return <h1>Kontakt</h1>; }",
          },
        ],
      } as unknown as ScaffoldManifest,
      previousFiles: undefined,
    });

    const paths = new Set((JSON.parse(result.filesJson) as Array<{ path: string }>).map((f) => f.path));
    expect(paths.has("app/contact/page.tsx")).toBe(true);
    expect(paths.has("app/kontakt/page.tsx")).toBe(false);
  });
});

describe("explicit dossier removal", () => {
  beforeEach(() => {
    checkCrossFileImports.mockClear();
  });

  it("deletes file-evidenced dossier files while keeping unrelated files", () => {
    const stripe = makeDossier("stripe-checkout", "payments", [
      "components/checkout-button.tsx",
      "components/api/checkout-session/route.ts",
      "components/integration-config-notice.tsx",
    ]);
    const previousFiles = [
      {
        path: "app/page.tsx",
        content: "export default function Page(){ return <main />; }",
        language: "tsx",
      },
      {
        path: "components/checkout-button.tsx",
        content: "export function CheckoutButton(){ return null; }",
        language: "tsx",
      },
      {
        path: "app/api/checkout-session/route.ts",
        content: "export async function POST(){ return new Response(); }",
        language: "ts",
      },
      {
        path: "components/integration-config-notice.tsx",
        content: "export function IntegrationConfigNotice(){ return null; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "remove-stripe",
      originalFilesJson: JSON.stringify([previousFiles[0]]),
      generatedFiles: [previousFiles[0]],
      resolvedScaffold: null,
      previousFiles,
      selectedDossiers: [],
      removedDossiers: [stripe],
    });
    const paths = (JSON.parse(result.filesJson) as Array<{ path: string }>).map(
      (file) => file.path,
    );

    expect(paths).toEqual(["app/page.tsx"]);
  });

  it("runs cross-file repair again after removal and surfaces its degradation", () => {
    const stripe = makeDossier("stripe-checkout", "payments", [
      "components/checkout-button.tsx",
    ]);
    const page = {
      path: "app/page.tsx",
      content:
        'import { CheckoutButton } from "@/components/checkout-button"; export default function Page(){ return <CheckoutButton />; }',
      language: "tsx",
    };
    const checkout = {
      path: "components/checkout-button.tsx",
      content: "export function CheckoutButton(){ return null; }",
      language: "tsx",
    };
    const stub = {
      path: "components/checkout-button.tsx",
      content: "export function CheckoutButton(){ return null; }",
      language: "tsx",
    };
    const fix = {
      sourceFile: "app/page.tsx",
      missingImport: "@/components/checkout-button",
      stubFile: "components/checkout-button.tsx",
    };
    checkCrossFileImports
      .mockImplementationOnce((files: unknown) => ({ files, fixes: [] }))
      .mockImplementationOnce((files: unknown) => ({
        files: [...(files as typeof page[]), stub],
        fixes: [fix],
      }));

    const result = mergeGeneratedProjectFiles({
      chatId: "remove-stripe-import",
      originalFilesJson: JSON.stringify([page]),
      generatedFiles: [page],
      resolvedScaffold: null,
      previousFiles: [page, checkout],
      selectedDossiers: [],
      removedDossiers: [stripe],
    });

    expect(checkCrossFileImports).toHaveBeenCalledTimes(2);
    expect(result.crossFileStubs).toContainEqual(fix);
    expect(
      (JSON.parse(result.filesJson) as Array<{ path: string }>).map(
        (file) => file.path,
      ),
    ).toContain("components/checkout-button.tsx");
  });

  it("preserves a shared path still owned by an active dossier", () => {
    const removed = makeDossier("stripe-checkout", "payments", [
      "components/checkout-button.tsx",
      "components/integration-config-notice.tsx",
    ]);
    const active = makeDossier("resend-contact-form", "contact-form", [
      "components/integration-config-notice.tsx",
    ]);
    const previousFiles = [
      {
        path: "components/checkout-button.tsx",
        content: "export function CheckoutButton(){ return null; }",
        language: "tsx",
      },
      {
        path: "components/integration-config-notice.tsx",
        content: "export function IntegrationConfigNotice(){ return null; }",
        language: "tsx",
      },
    ];

    const result = mergeGeneratedProjectFiles({
      chatId: "remove-shared",
      originalFilesJson: "[]",
      generatedFiles: [],
      resolvedScaffold: null,
      previousFiles,
      selectedDossiers: [active],
      removedDossiers: [removed],
    });
    const paths = (JSON.parse(result.filesJson) as Array<{ path: string }>).map(
      (file) => file.path,
    );

    expect(paths).toEqual(["components/integration-config-notice.tsx"]);
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

const DASHBOARD_SIDEBAR = readFileSync(
  join(__dirname, "../scaffolds/dashboard/files/components/dashboard-sidebar.tsx"),
  "utf8",
);

function offertlyftetPlan(): RoutePlan {
  return {
    provenance: { primarySource: "prompt", sources: ["prompt", "scaffold"] },
    siteType: "app-shell",
    reason: "test",
    routes: [
      { path: "/", name: "Hem", intent: "Landing", required: true },
      { path: "/logga-in", name: "Logga in", intent: "Auth", required: true },
      { path: "/dashboard", name: "Översikt", intent: "App home", required: true },
    ],
  };
}

function dashboardScaffold(): ScaffoldManifest {
  return {
    id: "dashboard",
    label: "Dashboard",
    description: "test",
    version: "1.0.0",
    siteKind: "app",
    features: [],
    promptHints: [],
    files: [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <div>Home</div>; }",
      },
      {
        path: "app/layout.tsx",
        content:
          "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "components/dashboard-sidebar.tsx",
        content: DASHBOARD_SIDEBAR,
      },
    ],
  } as unknown as ScaffoldManifest;
}

describe("dashboard navItems sync from route plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDossierFileContent.mockImplementation(() => null);
  });

  it("rewrites scaffold sidebar on init to the planned routes", () => {
    const result = mergeGeneratedProjectFiles({
      chatId: "c-nav-init",
      originalFilesJson: "[]",
      generatedFiles: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <h1>Offertlyftet</h1>; }",
          language: "tsx",
        },
      ],
      resolvedScaffold: dashboardScaffold(),
      previousFiles: undefined,
      routePlan: offertlyftetPlan(),
    });

    const merged = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const sidebar = merged.find((f) => f.path === "components/dashboard-sidebar.tsx");
    expect(sidebar).toBeDefined();
    const hrefs = [...sidebar!.content.matchAll(/href:\s*["'](\/[^"']*)["']/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/", "/logga-in", "/dashboard"]);
    expect(sidebar!.content).not.toContain("/users");
  });

  it("does not rewrite a follow-up sidebar (freeze)", () => {
    const previousSidebar = DASHBOARD_SIDEBAR.replace(
      `{ label: "Användare", href: "/users", icon: Users },`,
      "",
    );
    const result = mergeGeneratedProjectFiles({
      chatId: "c-nav-follow-up",
      originalFilesJson: "[]",
      generatedFiles: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <h1>Tweak</h1>; }",
          language: "tsx",
        },
      ],
      resolvedScaffold: dashboardScaffold(),
      previousFiles: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <h1>Prior</h1>; }",
          language: "tsx",
        },
        {
          path: "components/dashboard-sidebar.tsx",
          content: previousSidebar,
          language: "tsx",
        },
      ],
      routePlan: offertlyftetPlan(),
    });

    const merged = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const sidebar = merged.find((f) => f.path === "components/dashboard-sidebar.tsx");
    expect(sidebar!.content).toBe(previousSidebar);
    expect(sidebar!.content).not.toContain("/logga-in");
  });

  it("keeps a verbatim-restored sidebar byte-identical when nav-sync is active", () => {
    const canonical = [
      `"use client";`,
      `import { LayoutDashboard } from "lucide-react";`,
      ``,
      `const navItems = [`,
      `  { label: "Hem", href: "/", icon: LayoutDashboard },`,
      `];`,
      ``,
      `export function DashboardSidebar() {`,
      `  return <aside data-canonical="verbatim-nav">Hem</aside>;`,
      `}`,
    ].join("\n");
    getDossierFileContent.mockImplementation((_klass, _id, relPath) =>
      relPath === "components/dashboard-sidebar.tsx" ? canonical : null,
    );

    const result = mergeGeneratedProjectFiles({
      chatId: "c-nav-verbatim",
      originalFilesJson: "[]",
      generatedFiles: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <h1>Offertlyftet</h1>; }",
          language: "tsx",
        },
      ],
      resolvedScaffold: dashboardScaffold(),
      previousFiles: undefined,
      routePlan: offertlyftetPlan(),
      selectedDossiers: [
        {
          id: "nav-verbatim-test",
          class: "soft",
          capability: "navigation",
          codeFidelity: "verbatim",
          files: [
            {
              path: "components/dashboard-sidebar.tsx",
              role: "client",
              injectionMode: "verbatim",
            },
          ],
        } as unknown as DossierEntry,
      ],
    });

    const merged = JSON.parse(result.filesJson) as Array<{ path: string; content: string }>;
    const sidebar = merged.find((f) => f.path === "components/dashboard-sidebar.tsx");
    expect(sidebar?.content).toBe(canonical);
  });
});
