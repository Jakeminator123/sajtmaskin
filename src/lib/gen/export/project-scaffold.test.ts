import { describe, expect, it } from "vitest";
import {
  buildCompleteProject,
  mergePackageJsonWithBaseline,
  mergeTsconfigWithBaseline,
} from "./project-scaffold";
import { buildExportableProject } from "./build-exportable-project";
import { runProjectSanityChecks } from "../validation/project-sanity";
import type { CodeFile } from "../parser";
import { PIPELINE_ENV_LOCAL_MARKER } from "../preview/env-local";

describe("mergePackageJsonWithBaseline", () => {
  it("fills scripts and devDependencies when the model omits them", () => {
    const model = JSON.parse(
      JSON.stringify({
        dependencies: {
          next: "^16.2.3",
          react: "^19.2.0",
          "react-dom": "^19.2.0",
          "lucide-react": "^0.460.0",
        },
      }),
    ) as Record<string, unknown>;

    const merged = mergePackageJsonWithBaseline(model, { dependencies: {} }) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      dependencies: Record<string, string>;
    };

    expect(merged.scripts.dev).toBe("next dev --webpack");
    expect(merged.scripts.build).toBe("next build");
    expect(merged.devDependencies.typescript).toBeDefined();
    expect(merged.devDependencies.tailwindcss).toBeDefined();
    expect(merged.dependencies.next).toBe("16.2.9");
    expect(merged.dependencies.react).toBe("19.2.4");
    expect(merged.dependencies["react-dom"]).toBe("19.2.4");
    expect(merged.dependencies["lucide-react"]).toBe("0.577.0");
  });

  it("lets the model override individual script names", () => {
    const merged = mergePackageJsonWithBaseline(
      { scripts: { dev: "next dev -p 4000" } } as Record<string, unknown>,
      { dependencies: {} },
    ) as { scripts: Record<string, string> };
    expect(merged.scripts.dev).toBe("next dev -p 4000");
    expect(merged.scripts.build).toBe("next build");
  });

  it("ships postcss override so user `npm audit` stays clean (GHSA-qx2v-qp2m-jg93)", () => {
    const merged = mergePackageJsonWithBaseline({}, { dependencies: {} }) as {
      overrides: Record<string, string>;
    };
    expect(merged.overrides.postcss).toBe("^8.5.10");
  });

  it("baseline overrides win when the model emits a conflicting postcss override", () => {
    const merged = mergePackageJsonWithBaseline(
      { overrides: { postcss: "8.0.0", foo: "1.0.0" } } as Record<string, unknown>,
      { dependencies: {} },
    ) as { overrides: Record<string, string> };
    expect(merged.overrides.postcss).toBe("^8.5.10");
    expect(merged.overrides.foo).toBe("1.0.0");
  });

  it("pins lucide and three / @react-three/* to baseline so model cannot downgrade load-bearing deps", () => {
    const model = {
      dependencies: {
        "lucide-react": "^0.460.0",
        "@react-three/fiber": "^8.17.10",
        "@react-three/drei": "^9.117.3",
        three: "^0.150.0",
      },
    } as Record<string, unknown>;
    const merged = mergePackageJsonWithBaseline(model, {
      dependencies: {
        "lucide-react": "^0.469",
        "@react-three/fiber": "^9",
        "@react-three/drei": "^10",
      },
    }) as { dependencies: Record<string, string> };
    expect(merged.dependencies["lucide-react"]).toBe("0.577.0");
    expect(merged.dependencies["@react-three/fiber"]).toBe("9.6.0");
    expect(merged.dependencies["@react-three/drei"]).toBe("10.7.7");
    expect(merged.dependencies.three).toBe("0.185.1");
  });
});

describe("mergeTsconfigWithBaseline", () => {
  it("keeps baseline libs/plugins/include while letting the model extend options", () => {
    const merged = mergeTsconfigWithBaseline({
      compilerOptions: {
        strict: false,
        lib: ["dom", "webworker"],
        paths: {
          "@generated/*": ["./generated/*"],
        },
      },
      include: ["custom/**/*.ts"],
    });

    const compilerOptions = merged.compilerOptions as {
      strict: boolean;
      lib: string[];
      plugins: Array<Record<string, unknown>>;
      paths: Record<string, unknown>;
    };

    expect(compilerOptions.strict).toBe(false);
    expect(compilerOptions.lib).toEqual(
      expect.arrayContaining(["dom", "dom.iterable", "esnext", "webworker"]),
    );
    expect(compilerOptions.plugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "next" })]),
    );
    expect(compilerOptions.paths).toMatchObject({
      "@/*": ["./*"],
      "@generated/*": ["./generated/*"],
    });
    expect(merged.include).toEqual(
      expect.arrayContaining(["next-env.d.ts", ".next/types/**/*.ts", "custom/**/*.ts"]),
    );
  });
});

describe("buildCompleteProject", () => {
  it("merges minimal package.json and keeps the legacy full .env.local fallback when scope is absent", () => {
    const generated: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <div>Hi</div>; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.content) as { scripts: Record<string, string> };
    expect(parsed.scripts.dev).toBe("next dev --webpack");

    const env = files.find((f) => f.path === ".env.local");
    expect(env).toBeDefined();
    expect(env!.content).toContain("Sajtmaskin");
    expect(env!.content).toMatch(/^[A-Z0-9_]+=/m);
  });

  it("persists only selected dossier placeholders in the F2 .env.local artifact", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: "export default function Page() { return null; }", language: "tsx" },
    ];

    const files = buildCompleteProject(generated, undefined, {
      lifecycleStage: "design",
      selectedDossierEnvKeys: ["STRIPE_SECRET_KEY", "MY_DOSSIER_ONLY_KEY"],
    });
    const env = files.find((file) => file.path === ".env.local");

    expect(env?.content).toContain("STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real");
    expect(env?.content).toContain(
      "MY_DOSSIER_ONLY_KEY=my_dossier_only_key_placeholder_preview_not_real",
    );
    expect(env?.content).not.toContain("CONTENTFUL_ACCESS_TOKEN=");
  });

  it("replaces a legacy pipeline env artifact but preserves a model-authored env file", () => {
    const baseFiles: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: "export default function Page() { return null; }",
        language: "tsx",
      },
    ];
    const legacyPipelineEnv = {
      path: ".env.local",
      content: `${PIPELINE_ENV_LOCAL_MARKER}\nSTRIPE_SECRET_KEY=old\nCONTENTFUL_ACCESS_TOKEN=old\n`,
      language: "text" as const,
    };

    const scoped = buildCompleteProject(
      [...baseFiles, legacyPipelineEnv],
      undefined,
      {
        lifecycleStage: "design",
        selectedDossierEnvKeys: ["STRIPE_SECRET_KEY"],
      },
    );
    const scopedEnv = scoped.find((file) => file.path === ".env.local");
    expect(scopedEnv?.content).toContain("STRIPE_SECRET_KEY=");
    expect(scopedEnv?.content).not.toContain("CONTENTFUL_ACCESS_TOKEN=");

    const modelEnv = {
      path: ".env.local",
      content: "MODEL_SELECTED_KEY=kept",
      language: "text" as const,
    };
    const modelAuthored = buildCompleteProject(
      [...baseFiles, modelEnv],
      undefined,
      {
        lifecycleStage: "design",
        selectedDossierEnvKeys: [],
      },
    );
    expect(
      modelAuthored.find((file) => file.path === ".env.local")?.content,
    ).toBe("MODEL_SELECTED_KEY=kept");
  });

  it("omits F3 tier-3 stubs and does not write an artifact for an empty dossier scope", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: "export default function Page() { return null; }", language: "tsx" },
    ];

    const f3Files = buildCompleteProject(generated, undefined, {
      lifecycleStage: "integrations",
      selectedDossierEnvKeys: [
        "STRIPE_SECRET_KEY",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "MY_DOSSIER_ONLY_KEY",
      ],
    });
    const f3Env = f3Files.find((file) => file.path === ".env.local");
    expect(f3Env?.content).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
    expect(f3Env?.content).not.toContain("STRIPE_SECRET_KEY=");
    expect(f3Env?.content).not.toContain("MY_DOSSIER_ONLY_KEY=");

    const emptyScopedFiles = buildCompleteProject(generated, undefined, {
      lifecycleStage: "design",
      selectedDossierEnvKeys: [],
    });
    expect(emptyScopedFiles.find((file) => file.path === ".env.local")).toBeUndefined();
  });

  it("ships a standard .gitignore that ignores .env* but keeps env.example tracked", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];

    const files = buildCompleteProject(generated);
    const gitignore = files.find((f) => f.path === ".gitignore");
    expect(gitignore).toBeDefined();
    expect(gitignore!.content).toContain("node_modules");
    expect(gitignore!.content).toContain(".env*");
    // env.example (no leading dot, PROJECT_ENV_FILE_PATH) must stay tracked: a
    // `.env*` git pattern does NOT match it, so it is never ignored.
    expect(gitignore!.content).not.toMatch(/^env\.example$/m);
  });

  it("does not replace an existing .env.local from the model", () => {
    const custom = "# my env\nFOO=bar\n";
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: ".env.local", content: custom, language: "text" },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];

    const files = buildCompleteProject(generated);
    const envFiles = files.filter((f) => f.path === ".env.local");
    expect(envFiles).toHaveLength(1);
    expect(envFiles[0]!.content).toBe(custom);
  });

  it("baseline package.json ships current safe Next/React versions", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];
    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      engines: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.engines.node).toBe(">=22.14.0 <23");
    expect(pkg.dependencies.next).toBe("16.2.9");
    expect(pkg.dependencies.react).toBe("19.2.4");
    expect(pkg.dependencies["react-dom"]).toBe("19.2.4");
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.devDependencies.eslint).toBe("9.39.2");
    expect(pkg.devDependencies["eslint-config-next"]).toBe("16.2.9");
  });

  it("ships a canonical use-reduced-motion hook so motion components avoid hand-rolled mounted guards", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <div />; }`,
        language: "tsx",
      },
    ];
    const files = buildCompleteProject(generated);
    const hook = files.find((f) => f.path === "hooks/use-reduced-motion.ts");
    expect(hook).toBeDefined();
    expect(hook!.content).toContain('"use client"');
    expect(hook!.content).toContain("prefers-reduced-motion: reduce");
    expect(hook!.content).toContain("export function useReducedMotion");
    expect(hook!.content).toContain("addEventListener");
    expect(hook!.content).toContain("removeEventListener");
  });

  it("drops generated hooks/use-reduced-motion.tsx so baseline .ts wins (extension collision)", () => {
    // Repro: an earlier autofix/repair pass emitted `.tsx` alongside the
    // baseline `.ts`. Webpack picked the `.tsx` (which contained a leaked
    // `ts` markdown fence on line 1) and the preview crashed with
    // `ReferenceError: ts is not defined`. The baseline must always win.
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <div />; }`,
        language: "tsx",
      },
      {
        path: "hooks/use-reduced-motion.tsx",
        content: [
          "ts",
          'import { useReducedMotion as useFramerReducedMotion } from "framer-motion";',
          "",
          "export function useReducedMotion() {",
          "  return useFramerReducedMotion();",
          "}",
        ].join("\n"),
        language: "tsx",
      },
    ];
    const files = buildCompleteProject(generated);
    const matching = files.filter((f) => f.path.startsWith("hooks/use-reduced-motion"));
    expect(matching).toHaveLength(1);
    expect(matching[0]!.path).toBe("hooks/use-reduced-motion.ts");
    expect(matching[0]!.content).toContain("matchMedia");
  });

  it("baseline package.json passes peer-compatibility sanity checks", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <div>Baseline sanity</div>; }`,
        language: "tsx",
      },
    ];
    const files = buildCompleteProject(generated);
    const sanity = runProjectSanityChecks(files);
    expect(sanity.issues.some((issue) => issue.category === "dependency_install_failure")).toBe(
      false,
    );
  });

  it("merges a model tsconfig with baseline compiler essentials", () => {
    const generated: CodeFile[] = [
      {
        path: "tsconfig.json",
        content: JSON.stringify({
          compilerOptions: {
            strict: false,
            lib: ["webworker"],
          },
          include: ["src/**/*.ts"],
        }),
        language: "json",
      },
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];

    const files = buildCompleteProject(generated);
    const tsconfig = JSON.parse(files.find((f) => f.path === "tsconfig.json")!.content) as {
      compilerOptions: {
        strict: boolean;
        lib: string[];
        plugins: Array<Record<string, unknown>>;
      };
      include: string[];
    };

    expect(tsconfig.compilerOptions.strict).toBe(false);
    expect(tsconfig.compilerOptions.lib).toEqual(
      expect.arrayContaining(["dom", "dom.iterable", "esnext", "webworker"]),
    );
    expect(tsconfig.compilerOptions.plugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "next" })]),
    );
    expect(tsconfig.include).toEqual(
      expect.arrayContaining(["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts"]),
    );
  });

  it("pins react/next/fiber/drei to baseline even when model and code use old versions", () => {
    const generated: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
            next: "^14.0.0",
            "@react-three/fiber": "^8.17.10",
            "@react-three/drei": "^9.117.3",
            three: "^0.150.0",
          },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `import { Canvas } from "@react-three/fiber";\nimport { OrbitControls } from "@react-three/drei";\nexport default function Page() { return <Canvas><OrbitControls /></Canvas>; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.react).toBe("19.2.4");
    expect(pkg.dependencies["react-dom"]).toBe("19.2.4");
    expect(pkg.dependencies.next).toBe("16.2.9");
    expect(pkg.dependencies["@react-three/fiber"]).toBe("9.6.0");
    expect(pkg.dependencies["@react-three/drei"]).toBe("10.7.7");
    expect(pkg.dependencies.three).toBe("0.185.1");
  });

  it("prunes the 3D stack from package.json when no file imports it (capability false-positive bloat)", () => {
    const generated: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "^16.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            three: "0.182.0",
            "@react-three/fiber": "9.6.0",
            "@react-three/drei": "10.7.7",
          },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <main>No 3D here</main>; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.three).toBeUndefined();
    expect(pkg.dependencies["@react-three/fiber"]).toBeUndefined();
    expect(pkg.dependencies["@react-three/drei"]).toBeUndefined();
  });

  it("keeps three (shared peer dep) when only the React-Three wrappers are imported", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/scene.tsx",
        content: `"use client";\nimport { Canvas } from "@react-three/fiber";\nexport default function Scene() { return <Canvas />; }`,
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content: `import Scene from "./scene";\nexport default function Page() { return <Scene />; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@react-three/fiber"]).toBe("9.6.0");
    expect(pkg.dependencies.three).toBe("0.185.1");
  });

  it("detects scoped @radix-ui imports via dep-completer in buildCompleteProject", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: `import { Dialog } from "@radix-ui/react-dialog";\nexport default function Page() { return <Dialog />; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@radix-ui/react-dialog"]).toBeDefined();
  });

  it("pins tier-3 SDK imports restored from dossiers before project sanity", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/api/checkout-session/route.ts",
        content: `import Stripe from "stripe";\nexport async function POST() { return Response.json({ ok: Boolean(Stripe) }); }`,
        language: "ts",
      },
      {
        path: "components/clerk-provider-shell.tsx",
        content: `import { ClerkProvider } from "@clerk/nextjs";\nexport function ClerkProviderShell({ children }: { children: React.ReactNode }) { return <ClerkProvider>{children}</ClerkProvider>; }`,
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content: `export default function Page() { return <main>Checkout</main>; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.stripe).toBeDefined();
    expect(pkg.dependencies["@clerk/nextjs"]).toBeDefined();
    const sanity = runProjectSanityChecks(files);
    expect(sanity.issues.filter((issue) => issue.category === "dependency_install_failure")).toEqual([]);
  });

  it("ships a minimal eslint flat config for generated Next projects", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];

    const files = buildCompleteProject(generated);
    const eslintConfig = files.find((f) => f.path === "eslint.config.mjs");
    expect(eslintConfig).toBeDefined();
    expect(eslintConfig!.content).toContain('eslint-config-next/core-web-vitals');
    expect(eslintConfig!.content).toContain('eslint-config-next/typescript');
    expect(eslintConfig!.content).toContain("globalIgnores");
  });

  it("includes dependencies required by copied ui components when completing the project", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: `import { HoverCard } from "@/components/ui/hover-card";\nexport default function Page() { return <HoverCard />; }`,
        language: "tsx",
      },
    ];

    const files = buildCompleteProject(generated, [
      {
        filename: "hover-card.tsx",
        content: [
          '"use client";',
          'import * as React from "react";',
          'import * as HoverCardPrimitive from "@radix-ui/react-hover-card";',
          'export function HoverCard() {',
          "  return <HoverCardPrimitive.Root />;",
          "}",
        ].join("\n"),
      },
    ]);

    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@radix-ui/react-hover-card"]).toBe("^1");
  });
});

describe("buildExportableProject", () => {
  it("produces the same output as manual buildCompleteProject + repairGeneratedFiles", async () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "components/counter.tsx",
        content: `"use client";\nexport default function Counter() {\n  const [c, setC] = useState(0);\n  return <button onClick={() => setC(c+1)}>{c}</button>;\n}`,
        language: "tsx",
      },
      { path: "app/page.tsx", content: `export default function Page() { return <div>Hi</div>; }`, language: "tsx" },
    ];

    const exported = await buildExportableProject(generated);
    expect(exported.length).toBeGreaterThan(generated.length);

    const pkg = JSON.parse(exported.find((f) => f.path === "package.json")!.content) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toBe("next dev --webpack");

    const counter = exported.find((f) => f.path === "components/counter.tsx");
    expect(counter).toBeDefined();
    expect(counter!.content).toContain('import { useState } from "react"');
  });

  // REGRESSION GUARD (Codex P2 from #282): the SHARED exportable project — which
  // also feeds the verify / quality-gate lane via `exportableToQualityGateFiles`
  // — MUST keep the placeholder `.env.local`. The fix for shipping a clean ZIP
  // strips `.env.local` ONLY at the zip/download boundary (see
  // `strip-env-local-for-zip.ts`), NEVER in this shared builder. Removing it
  // here (the superseded #282 approach) would regress the verify lane: an
  // env-dependent project could pass live preview but fail/repair in verify.
  // Do NOT change this to assert `.env.local` is absent.
  it("STILL ships the placeholder .env.local so the verify lane keeps its env", async () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: `export default function Page() { return <div>Hi</div>; }`, language: "tsx" },
    ];

    const exported = await buildExportableProject(generated);
    const paths = exported.map((f) => f.path);
    expect(paths).toContain(".env.local");
    // And the new standard .gitignore rides along too (inert for verify).
    expect(paths).toContain(".gitignore");
  });

  it("rehydrates a scoped pipeline env artifact for preview/verify parity", async () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "app/page.tsx",
        content: "export default function Page() { return null; }",
        language: "tsx",
      },
      {
        path: ".env.local",
        content: `${PIPELINE_ENV_LOCAL_MARKER}\nSTRIPE_SECRET_KEY=scoped\n`,
        language: "text",
      },
    ];

    const exported = await buildExportableProject(generated);
    const env = exported.find((file) => file.path === ".env.local");

    expect(env?.content).toContain("STRIPE_SECRET_KEY=");
    expect(env?.content).toContain("CONTENTFUL_ACCESS_TOKEN=");
  });
});

describe("runProjectSanityChecks peer heuristics", () => {
  it("flags imported third-party packages that are not pinned in package.json", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "19.2.4", next: "16.2.3" },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `import confetti from "canvas-confetti"; export default function Page() { return null; }`,
        language: "tsx",
      },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.some((i) => i.message.includes("canvas-confetti"))).toBe(true);
    expect(result.issues.some((i) => i.category === "dependency_install_failure")).toBe(true);
  });

  it("does not flag manually pinned third-party packages", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            react: "19.2.4",
            next: "16.2.3",
            "canvas-confetti": "^1.9.3",
          },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `import confetti from "canvas-confetti"; export default function Page() { return null; }`,
        language: "tsx",
      },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.some((i) => i.message.includes("canvas-confetti"))).toBe(false);
  });

  it("flags @react-three/fiber <9 with react 19", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "19.2.4", "@react-three/fiber": "8.17.10" },
        }),
        language: "json",
      },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.some((i) => i.message.includes("@react-three/fiber") && i.severity === "error")).toBe(true);
    expect(result.issues.some((i) => i.category === "dependency_install_failure")).toBe(true);
  });

  it("does not flag @react-three/fiber 9 with react 19", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "19.2.4", "@react-three/fiber": "9.1.2" },
        }),
        language: "json",
      },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.some((i) => i.message.includes("@react-three/fiber"))).toBe(false);
  });

  it("flags next 16 with react 18", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { react: "18.2.0", next: "16.2.3" },
        }),
        language: "json",
      },
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.some((i) => i.message.includes("next") && i.message.includes("react >=19"))).toBe(true);
    expect(result.issues.some((i) => i.category === "dependency_install_failure")).toBe(true);
  });
});
