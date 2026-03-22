import { describe, expect, it } from "vitest";
import { prepareSandboxProjectFiles } from "./sandbox-project-files";

describe("prepareSandboxProjectFiles", () => {
  it("injects package.json with next/react when model only generates page files", () => {
    const result = prepareSandboxProjectFiles([
      {
        path: "app/page.tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
        language: "tsx",
      },
    ]);

    const pkg = result.find((f) => f.name === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.scripts.dev).toBe("next dev");
    expect(parsed.scripts.build).toBe("next build");
    expect(parsed.dependencies.next).toBeDefined();
    expect(parsed.dependencies.react).toBeDefined();
    expect(parsed.dependencies["react-dom"]).toBeDefined();
  });

  it("merges model package.json with canonical scripts and core deps", () => {
    const result = prepareSandboxProjectFiles([
      {
        path: "package.json",
        content: JSON.stringify({
          name: "my-custom-project",
          dependencies: { "some-lib": "^1.0.0" },
        }),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
        language: "tsx",
      },
    ]);

    const pkg = result.find((f) => f.name === "package.json");
    expect(pkg).toBeDefined();
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.name).toBe("my-custom-project");
    expect(parsed.scripts.dev).toBe("next dev");
    expect(parsed.scripts.build).toBe("next build");
    expect(parsed.dependencies.next).toBeDefined();
    expect(parsed.dependencies.react).toBeDefined();
    expect(parsed.dependencies["some-lib"]).toBe("^1.0.0");
  });

  it("injects tsconfig.json and postcss.config.mjs when missing", () => {
    const result = prepareSandboxProjectFiles([
      {
        path: "app/page.tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
        language: "tsx",
      },
    ]);

    expect(result.some((f) => f.name === "tsconfig.json")).toBe(true);
    expect(result.some((f) => f.name === "postcss.config.mjs")).toBe(true);
    expect(result.some((f) => f.name === "next.config.ts")).toBe(true);
  });

  it("does not duplicate model files that are already in scaffold", () => {
    const result = prepareSandboxProjectFiles([
      {
        path: "app/page.tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
        language: "tsx",
      },
      {
        path: "package.json",
        content: JSON.stringify({ name: "test", dependencies: {} }),
        language: "json",
      },
    ]);

    const pkgFiles = result.filter((f) => f.name === "package.json");
    expect(pkgFiles.length).toBe(1);
  });
});
