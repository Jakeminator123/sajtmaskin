import { describe, expect, it } from "vitest";
import {
  buildCompleteProject,
  mergePackageJsonWithBaseline,
  mergeTsconfigWithBaseline,
} from "./project-scaffold";
import { buildExportableProject } from "./build-exportable-project";
import { runProjectSanityChecks } from "../validation/project-sanity";
import type { CodeFile } from "../parser";

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
    expect(merged.dependencies.next).toBe("16.2.3");
    expect(merged.dependencies.react).toBe("19.2.4");
    expect(merged.dependencies["react-dom"]).toBe("19.2.4");
  });

  it("lets the model override individual script names", () => {
    const merged = mergePackageJsonWithBaseline(
      { scripts: { dev: "next dev -p 4000" } } as Record<string, unknown>,
      { dependencies: {} },
    ) as { scripts: Record<string, string> };
    expect(merged.scripts.dev).toBe("next dev -p 4000");
    expect(merged.scripts.build).toBe("next build");
  });

  it("pins three / @react-three/* to baseline so model cannot downgrade below React 19–compatible majors", () => {
    const model = {
      dependencies: {
        "@react-three/fiber": "^8.17.10",
        "@react-three/drei": "^9.117.3",
        three: "^0.150.0",
      },
    } as Record<string, unknown>;
    const merged = mergePackageJsonWithBaseline(model, {
      dependencies: { "@react-three/fiber": "^9", "@react-three/drei": "^10" },
    }) as { dependencies: Record<string, string> };
    expect(merged.dependencies["@react-three/fiber"]).toBe("9.1.2");
    expect(merged.dependencies["@react-three/drei"]).toBe("10.7.7");
    expect(merged.dependencies.three).toBe("0.176.0");
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
  it("merges minimal package.json and adds .env.local when absent", () => {
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
    expect(pkg.dependencies.next).toBe("16.2.3");
    expect(pkg.dependencies.react).toBe("19.2.4");
    expect(pkg.dependencies["react-dom"]).toBe("19.2.4");
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.devDependencies.eslint).toBe("9.39.2");
    expect(pkg.devDependencies["eslint-config-next"]).toBe("16.2.3");
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
    expect(pkg.dependencies.next).toBe("16.2.3");
    expect(pkg.dependencies["@react-three/fiber"]).toBe("9.1.2");
    expect(pkg.dependencies["@react-three/drei"]).toBe("10.7.7");
    expect(pkg.dependencies.three).toBe("0.176.0");
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
