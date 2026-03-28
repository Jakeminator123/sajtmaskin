import { describe, expect, it } from "vitest";
import { buildCompleteProject, mergePackageJsonWithBaseline } from "./project-scaffold";
import { buildExportableProject } from "./build-exportable-project";
import type { CodeFile } from "./parser";

describe("mergePackageJsonWithBaseline", () => {
  it("fills scripts and devDependencies when the model omits them", () => {
    const model = JSON.parse(
      JSON.stringify({
        dependencies: {
          next: "^16.2.1",
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

    expect(merged.scripts.dev).toBe("next dev");
    expect(merged.scripts.build).toBe("next build");
    expect(merged.devDependencies.typescript).toBeDefined();
    expect(merged.devDependencies.tailwindcss).toBeDefined();
    expect(merged.dependencies.next).toBe("^16.2.1");
    expect(merged.dependencies.react).toBe("^19.2.0");
  });

  it("lets the model override individual script names", () => {
    const merged = mergePackageJsonWithBaseline(
      { scripts: { dev: "next dev -p 4000" } } as Record<string, unknown>,
      { dependencies: {} },
    ) as { scripts: Record<string, string> };
    expect(merged.scripts.dev).toBe("next dev -p 4000");
    expect(merged.scripts.build).toBe("next build");
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
    expect(parsed.scripts.dev).toBe("next dev");

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
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies.next).toBe("16.2.1");
    expect(pkg.dependencies.react).toBe("19.2.4");
    expect(pkg.dependencies["react-dom"]).toBe("19.2.4");
    expect(pkg.scripts).not.toHaveProperty("lint");
  });
});

describe("buildExportableProject", () => {
  it("produces the same output as manual buildCompleteProject + repairGeneratedFiles", () => {
    const generated: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      {
        path: "components/counter.tsx",
        content: `"use client";\nexport default function Counter() {\n  const [c, setC] = useState(0);\n  return <button onClick={() => setC(c+1)}>{c}</button>;\n}`,
        language: "tsx",
      },
      { path: "app/page.tsx", content: `export default function Page() { return <div>Hi</div>; }`, language: "tsx" },
    ];

    const exported = buildExportableProject(generated);
    expect(exported.length).toBeGreaterThan(generated.length);

    const pkg = JSON.parse(exported.find((f) => f.path === "package.json")!.content) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toBe("next dev");

    const counter = exported.find((f) => f.path === "components/counter.tsx");
    expect(counter).toBeDefined();
    expect(counter!.content).toContain('import { useState } from "react"');
  });
});
