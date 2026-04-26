import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyScaffoldSeoDefaults,
  applySeoToProjectFiles,
  getScaffoldSeoDefaultsStatus,
  type ProjectTextFile,
} from "./seo-defaults";
import type { ScaffoldManifest, ScaffoldFile } from "./types";

const SEO_ENV = "SAJTMASKIN_SCAFFOLD_SEO_SITE_URL";
const WARN_FLAG_KEY = "__sajtmaskinSeoDefaultsWarned";

/**
 * Inline test fixture so we don't depend on the real registry. Layout
 * intentionally has a metadata block so we can verify enrich behavior;
 * `app/page.tsx` is included so the manifest looks "real" without being
 * enormous.
 */
function makeScaffoldFixture(overrides?: { layoutContent?: string }): ScaffoldManifest {
  const layoutContent =
    overrides?.layoutContent ??
    `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Existing Scaffold Title",
  description: "Existing scaffold description",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`;
  const files: ScaffoldFile[] = [
    { path: "app/layout.tsx", content: layoutContent },
    {
      path: "app/page.tsx",
      content: `export default function Page() { return <main>Hi</main>; }`,
    },
    {
      path: "app/globals.css",
      content: `@theme inline {}`,
    },
  ];
  // Cast via `unknown` because `ScaffoldId` is a closed union of registry
  // ids; this fixture is a synthetic test scaffold and intentionally not
  // a member of the union.
  return {
    id: "seo-test-fixture",
    label: "SEO test fixture",
    description: "Inline fixture for seo-defaults tests",
    siteKind: "marketing",
    complexity: "simple",
    structureProfile: "single-page",
    contentProfile: "neutral",
    features: [],
    tags: [],
    promptHints: ["test hint one", "test hint two"],
    qualityChecklist: ["check one", "check two", "check three"],
    allowedBuildIntents: ["website"],
    files,
  } as unknown as ScaffoldManifest;
}

function resetWarnFlag(): void {
  delete (globalThis as unknown as Record<string, unknown>)[WARN_FLAG_KEY];
}

describe("applyScaffoldSeoDefaults", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[SEO_ENV];
    delete process.env[SEO_ENV];
    resetWarnFlag();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SEO_ENV];
    } else {
      process.env[SEO_ENV] = originalEnv;
    }
    resetWarnFlag();
  });

  describe("env-fallback path (no options)", () => {
    it("is a noop when env is unset", () => {
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold);
      expect(result.files.map((f) => f.path).sort()).toEqual(
        scaffold.files.map((f) => f.path).sort(),
      );
      expect(result.files.find((f) => f.path === "app/robots.ts")).toBeUndefined();
      expect(result.files.find((f) => f.path === "app/sitemap.ts")).toBeUndefined();
      expect(result.files.find((f) => f.path === "app/opengraph-image.tsx")).toBeUndefined();
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).not.toContain("metadataBase:");
    });

    it("injects SEO files using env URL when env is set", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold);
      const robots = result.files.find((f) => f.path === "app/robots.ts");
      const sitemap = result.files.find((f) => f.path === "app/sitemap.ts");
      const og = result.files.find((f) => f.path === "app/opengraph-image.tsx");
      expect(robots?.content).toContain("https://from-env.se/sitemap.xml");
      expect(sitemap?.content).toContain("https://from-env.se/");
      expect(og).toBeDefined();
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).toContain('metadataBase: new URL("https://from-env.se")');
    });

    it("strips trailing slash from env URL", () => {
      process.env[SEO_ENV] = "https://from-env.se/";
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold);
      const robots = result.files.find((f) => f.path === "app/robots.ts");
      expect(robots?.content).toContain("https://from-env.se/sitemap.xml");
      expect(robots?.content).not.toContain("https://from-env.se//sitemap.xml");
    });
  });

  describe("override path (options.siteUrl)", () => {
    it("options.siteUrl wins over env", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://override.se",
      });
      const robots = result.files.find((f) => f.path === "app/robots.ts");
      expect(robots?.content).toContain("https://override.se/sitemap.xml");
      expect(robots?.content).not.toContain("from-env.se");
    });

    it("options.siteUrl works when env is unset", () => {
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://only-override.se",
      });
      const sitemap = result.files.find((f) => f.path === "app/sitemap.ts");
      expect(sitemap?.content).toContain("https://only-override.se/");
    });

    it("options.siteUrl=null is explicit noop even when env is set", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, { siteUrl: null });
      expect(result.files.find((f) => f.path === "app/robots.ts")).toBeUndefined();
      expect(result.files.find((f) => f.path === "app/sitemap.ts")).toBeUndefined();
      expect(result.files.find((f) => f.path === "app/opengraph-image.tsx")).toBeUndefined();
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).not.toContain("metadataBase:");
    });

    it("strips trailing slash from option URL", () => {
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://override.se/",
      });
      const robots = result.files.find((f) => f.path === "app/robots.ts");
      expect(robots?.content).toContain("https://override.se/sitemap.xml");
      expect(robots?.content).not.toContain("https://override.se//sitemap.xml");
    });

    it("empty-string siteUrl falls back to env (treated as not provided)", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, { siteUrl: "" });
      const robots = result.files.find((f) => f.path === "app/robots.ts");
      expect(robots?.content).toContain("https://from-env.se");
    });
  });

  describe("brand override (options.brand)", () => {
    it("brand fills title/description fallbacks when scaffold layout has no metadata fields", () => {
      const scaffold = makeScaffoldFixture({
        layoutContent: `import type { Metadata } from "next";

export const metadata: Metadata = {
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
      });
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://kund.se",
        brand: {
          companyName: "Kunden AB",
          tagline: "En tagline",
          locale: "en_US",
        },
      });
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).toContain('title: "Kunden AB"');
      expect(layout?.content).toContain('description: "En tagline"');
      expect(layout?.content).toContain('locale: "en_US"');
    });

    it("scaffold-content wins over brand for title and description", () => {
      // Default fixture has explicit title/description
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://kund.se",
        brand: {
          companyName: "Kunden AB",
          description: "Brand description",
        },
      });
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      // Existing scaffold values still win
      expect(layout?.content).toContain('title: "Existing Scaffold Title"');
      expect(layout?.content).toContain('description: "Existing scaffold description"');
      expect(layout?.content).not.toContain("Kunden AB");
    });

    it("brand always wins for locale (no scaffold extraction)", () => {
      const scaffold = makeScaffoldFixture();
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://kund.se",
        brand: { locale: "en-US" },
      });
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).toContain('locale: "en-US"');
      expect(layout?.content).not.toContain('locale: "sv_SE"');
    });

    it("brand=null is treated like no brand (defaults used)", () => {
      const scaffold = makeScaffoldFixture({
        layoutContent: `import type { Metadata } from "next";

export const metadata: Metadata = {};
`,
      });
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://kund.se",
        brand: null,
      });
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      expect(layout?.content).toContain('title: "Website"');
      expect(layout?.content).toContain('locale: "sv_SE"');
    });

    it("escapes brand strings safely (no string injection)", () => {
      const scaffold = makeScaffoldFixture({
        layoutContent: `import type { Metadata } from "next";

export const metadata: Metadata = {};
`,
      });
      const result = applyScaffoldSeoDefaults(scaffold, {
        siteUrl: "https://kund.se",
        brand: {
          companyName: 'Kund "AB" \\test',
        },
      });
      const layout = result.files.find((f) => f.path === "app/layout.tsx");
      // JSON.stringify escapes quotes and backslashes
      expect(layout?.content).toContain('title: "Kund \\"AB\\" \\\\test"');
    });
  });

  describe("returned scaffold immutability", () => {
    it("does not mutate the input scaffold's files array", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      const originalFileCount = scaffold.files.length;
      const originalLayoutContent = scaffold.files.find(
        (f) => f.path === "app/layout.tsx",
      )?.content;
      applyScaffoldSeoDefaults(scaffold);
      expect(scaffold.files.length).toBe(originalFileCount);
      expect(scaffold.files.find((f) => f.path === "app/layout.tsx")?.content).toBe(
        originalLayoutContent,
      );
    });
  });

  describe("idempotency", () => {
    it("does not re-inject SEO files if scaffold already declares them", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const scaffold = makeScaffoldFixture();
      // Pre-add a robots file to simulate scaffold-defined SEO
      const customRobots: ScaffoldFile = {
        path: "app/robots.ts",
        content: "// already defined",
      };
      const augmented: ScaffoldManifest = {
        ...scaffold,
        files: [...scaffold.files, customRobots],
      };
      const result = applyScaffoldSeoDefaults(augmented);
      const robots = result.files.filter((f) => f.path === "app/robots.ts");
      expect(robots).toHaveLength(1);
      expect(robots[0]?.content).toBe("// already defined");
    });
  });
});

describe("getScaffoldSeoDefaultsStatus", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[SEO_ENV];
    delete process.env[SEO_ENV];
    resetWarnFlag();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SEO_ENV];
    } else {
      process.env[SEO_ENV] = originalEnv;
    }
    resetWarnFlag();
  });

  it("returns enabled=false + source=env-missing when env unset and no options", () => {
    expect(getScaffoldSeoDefaultsStatus()).toEqual({
      enabled: false,
      siteUrl: null,
      source: "env-missing",
    });
  });

  it("returns enabled=true + source=env when env is set", () => {
    process.env[SEO_ENV] = "https://from-env.se";
    expect(getScaffoldSeoDefaultsStatus()).toEqual({
      enabled: true,
      siteUrl: "https://from-env.se",
      source: "env",
    });
  });

  it("returns enabled=true + source=override when options.siteUrl is provided", () => {
    process.env[SEO_ENV] = "https://from-env.se";
    expect(getScaffoldSeoDefaultsStatus({ siteUrl: "https://override.se" })).toEqual({
      enabled: true,
      siteUrl: "https://override.se",
      source: "override",
    });
  });

  it("returns enabled=false + source=explicit-noop when options.siteUrl=null", () => {
    process.env[SEO_ENV] = "https://from-env.se";
    expect(getScaffoldSeoDefaultsStatus({ siteUrl: null })).toEqual({
      enabled: false,
      siteUrl: null,
      source: "explicit-noop",
    });
  });
});

/**
 * PR-B core helper. Operates on the same `{ name, content }`-shaped files
 * that `/api/v0/deployments/route.ts` already passes around in
 * `runPreDeployFixPipeline`. Keeps PR-A scaffold-wrapper untouched in
 * behaviour but lets the deploy lane reuse the same SEO logic.
 */
describe("applySeoToProjectFiles (PR-B deploy-time helper)", () => {
  let originalEnv: string | undefined;

  function makeProjectFiles(overrides?: { layoutContent?: string }): ProjectTextFile[] {
    const layoutContent =
      overrides?.layoutContent ??
      `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Existing Project Title",
  description: "Existing project description",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`;
    return [
      { name: "app/layout.tsx", content: layoutContent },
      { name: "app/page.tsx", content: `export default function Page() { return <main>Hi</main>; }` },
      { name: "package.json", content: `{ "name": "test" }` },
    ];
  }

  beforeEach(() => {
    originalEnv = process.env[SEO_ENV];
    delete process.env[SEO_ENV];
    resetWarnFlag();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SEO_ENV];
    } else {
      process.env[SEO_ENV] = originalEnv;
    }
    resetWarnFlag();
  });

  describe("env-fallback path", () => {
    it("returns applied=false + same array reference when env is unset and no options", () => {
      const files = makeProjectFiles();
      const result = applySeoToProjectFiles(files);
      expect(result.applied).toBe(false);
      expect(result.source).toBe("env-missing");
      expect(result.injected).toEqual([]);
      expect(result.enriched).toEqual([]);
      expect(result.files).toBe(files);
    });

    it("injects SEO files using env URL when env is set", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const files = makeProjectFiles();
      const result = applySeoToProjectFiles(files);
      expect(result.applied).toBe(true);
      expect(result.source).toBe("env");
      expect(result.injected.sort()).toEqual([
        "app/opengraph-image.tsx",
        "app/robots.ts",
        "app/sitemap.ts",
      ]);
      expect(result.enriched).toEqual(["app/layout.tsx"]);
      const layout = result.files.find((f) => f.name === "app/layout.tsx");
      expect(layout?.content).toContain('metadataBase: new URL("https://from-env.se")');
    });
  });

  describe("override path", () => {
    it("options.siteUrl wins over env", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const files = makeProjectFiles();
      const result = applySeoToProjectFiles(files, { siteUrl: "https://override.se" });
      expect(result.applied).toBe(true);
      expect(result.source).toBe("override");
      expect(result.siteUrl).toBe("https://override.se");
      const robots = result.files.find((f) => f.name === "app/robots.ts");
      expect(robots?.content).toContain("https://override.se/sitemap.xml");
      expect(robots?.content).not.toContain("from-env.se");
    });

    it("options.siteUrl=null is explicit noop and returns same array reference", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const files = makeProjectFiles();
      const result = applySeoToProjectFiles(files, { siteUrl: null });
      expect(result.applied).toBe(false);
      expect(result.source).toBe("explicit-noop");
      expect(result.files).toBe(files);
    });

    it("strips trailing slash from option URL", () => {
      const files = makeProjectFiles();
      const result = applySeoToProjectFiles(files, {
        siteUrl: "https://override.se/",
      });
      const robots = result.files.find((f) => f.name === "app/robots.ts");
      expect(robots?.content).toContain("https://override.se/sitemap.xml");
      expect(robots?.content).not.toContain("https://override.se//sitemap.xml");
    });
  });

  describe("brand override", () => {
    it("brand fills layout fallbacks when project layout has no metadata fields", () => {
      const files = makeProjectFiles({
        layoutContent: `import type { Metadata } from "next";

export const metadata: Metadata = {
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
      });
      const result = applySeoToProjectFiles(files, {
        siteUrl: "https://kund.se",
        brand: {
          companyName: "Kunden AB",
          tagline: "En tagline",
          locale: "en_US",
        },
      });
      expect(result.applied).toBe(true);
      const layout = result.files.find((f) => f.name === "app/layout.tsx");
      expect(layout?.content).toContain('title: "Kunden AB"');
      expect(layout?.content).toContain('description: "En tagline"');
      expect(layout?.content).toContain('locale: "en_US"');
    });

    it("escapes brand strings safely (no string injection)", () => {
      const files = makeProjectFiles({
        layoutContent: `import type { Metadata } from "next";

export const metadata: Metadata = {};
`,
      });
      const result = applySeoToProjectFiles(files, {
        siteUrl: "https://kund.se",
        brand: { companyName: 'Kund "AB" \\test' },
      });
      const layout = result.files.find((f) => f.name === "app/layout.tsx");
      expect(layout?.content).toContain('title: "Kund \\"AB\\" \\\\test"');
    });
  });

  describe("idempotency", () => {
    it("does not re-inject SEO files if project already declares them", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const files = makeProjectFiles();
      const augmented: ProjectTextFile[] = [
        ...files,
        { name: "app/robots.ts", content: "// project's own robots" },
      ];
      const result = applySeoToProjectFiles(augmented);
      const robots = result.files.filter((f) => f.name === "app/robots.ts");
      expect(robots).toHaveLength(1);
      expect(robots[0]?.content).toBe("// project's own robots");
      expect(result.injected).not.toContain("app/robots.ts");
      expect(result.injected.sort()).toEqual([
        "app/opengraph-image.tsx",
        "app/sitemap.ts",
      ]);
    });

    it("does not re-enrich layout when full metadata already present", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const alreadyEnriched = `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "x",
  description: "y",
  metadataBase: new URL("https://already.se"),
  alternates: { canonical: "/" },
  openGraph: { title: "x" },
  twitter: { card: "summary" },
};
`;
      const files = makeProjectFiles({ layoutContent: alreadyEnriched });
      const result = applySeoToProjectFiles(files);
      expect(result.applied).toBe(true);
      // Layout content unchanged → not in `enriched` list
      expect(result.enriched).toEqual([]);
      const layout = result.files.find((f) => f.name === "app/layout.tsx");
      expect(layout?.content).toBe(alreadyEnriched);
    });
  });

  describe("input file immutability", () => {
    it("does not mutate the input array or its file objects", () => {
      process.env[SEO_ENV] = "https://from-env.se";
      const files = makeProjectFiles();
      const originalLength = files.length;
      const originalLayoutContent = files.find((f) => f.name === "app/layout.tsx")?.content;
      applySeoToProjectFiles(files);
      expect(files.length).toBe(originalLength);
      expect(files.find((f) => f.name === "app/layout.tsx")?.content).toBe(
        originalLayoutContent,
      );
    });
  });

  describe("src/app/-rooted projects (LLM-emitted dual-support)", () => {
    it("enriches src/app/layout.tsx when project uses src/app/-prefix", () => {
      const files: ProjectTextFile[] = [
        {
          name: "src/app/layout.tsx",
          content: `import type { Metadata } from "next";

export const metadata: Metadata = {};
`,
        },
      ];
      const result = applySeoToProjectFiles(files, {
        siteUrl: "https://kund.se",
      });
      expect(result.enriched).toEqual(["src/app/layout.tsx"]);
      const layout = result.files.find((f) => f.name === "src/app/layout.tsx");
      expect(layout?.content).toContain('metadataBase: new URL("https://kund.se")');
    });
  });
});
