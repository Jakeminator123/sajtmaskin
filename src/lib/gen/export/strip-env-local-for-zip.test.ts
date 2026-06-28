import { describe, expect, it } from "vitest";
import { stripGeneratedEnvLocalForZip } from "./strip-env-local-for-zip";
import type { CodeFile } from "../parser";

describe("stripGeneratedEnvLocalForZip", () => {
  it("removes the root .env.local but keeps env.example and .gitignore", () => {
    const files: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: ".gitignore", content: "node_modules\n.env*\n", language: "text" },
      { path: "env.example", content: "STRIPE_SECRET_KEY=\n", language: "text" },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_live_x\n", language: "text" },
    ];

    const result = stripGeneratedEnvLocalForZip(files);
    const paths = result.map((f) => f.path);

    expect(paths).not.toContain(".env.local");
    expect(paths).toContain(".gitignore");
    expect(paths).toContain("env.example");
    expect(paths).toContain("package.json");
  });

  it("is a no-op when no .env.local is present", () => {
    const files: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: "env.example", content: "FOO=\n", language: "text" },
    ];

    const result = stripGeneratedEnvLocalForZip(files);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(["package.json", "env.example"]);
  });

  it("does not touch other dotted env files (only .env.local is dropped)", () => {
    const files: CodeFile[] = [
      { path: ".env", content: "A=1\n", language: "text" },
      { path: ".env.production", content: "B=2\n", language: "text" },
      { path: ".env.local", content: "C=3\n", language: "text" },
    ];

    const paths = stripGeneratedEnvLocalForZip(files).map((f) => f.path);
    expect(paths).toEqual([".env", ".env.production"]);
  });

  it("matches .env.local defensively despite surrounding whitespace in the path", () => {
    const files: CodeFile[] = [
      { path: "package.json", content: "{}", language: "json" },
      { path: " .env.local ", content: "C=3\n", language: "text" },
    ];

    const paths = stripGeneratedEnvLocalForZip(files).map((f) => f.path);
    expect(paths).toEqual(["package.json"]);
  });
});
