import { describe, expect, it } from "vitest";
import {
  getPackageNameFromImport,
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  SHADCN_FALLBACK_VERSIONS,
} from "./dependency-utils-shared";

describe("getPackageNameFromImport", () => {
  it("returns package name for bare specifiers", () => {
    expect(getPackageNameFromImport("react")).toBe("react");
    expect(getPackageNameFromImport("next/image")).toBe("next");
    expect(getPackageNameFromImport("recharts")).toBe("recharts");
  });

  it("handles scoped packages", () => {
    expect(getPackageNameFromImport("@radix-ui/react-dialog")).toBe("@radix-ui/react-dialog");
    expect(getPackageNameFromImport("@radix-ui/react-dialog/dist/thing")).toBe("@radix-ui/react-dialog");
  });

  it("returns null for relative imports", () => {
    expect(getPackageNameFromImport("./foo")).toBeNull();
    expect(getPackageNameFromImport("../bar")).toBeNull();
    expect(getPackageNameFromImport("/absolute")).toBeNull();
  });

  it("returns null for alias imports", () => {
    expect(getPackageNameFromImport("@/lib/utils")).toBeNull();
    expect(getPackageNameFromImport("@/components/ui/button")).toBeNull();
  });

  it("returns null for node: protocol", () => {
    expect(getPackageNameFromImport("node:fs")).toBeNull();
    expect(getPackageNameFromImport("node:path")).toBeNull();
  });

  it("returns null for Node builtin modules", () => {
    expect(getPackageNameFromImport("fs")).toBeNull();
    expect(getPackageNameFromImport("path")).toBeNull();
    expect(getPackageNameFromImport("http")).toBeNull();
    expect(getPackageNameFromImport("crypto")).toBeNull();
    expect(getPackageNameFromImport("fs/promises")).toBeNull();
  });

  it("returns null for subpath imports (#)", () => {
    expect(getPackageNameFromImport("#internal/foo")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getPackageNameFromImport("")).toBeNull();
    expect(getPackageNameFromImport("  ")).toBeNull();
  });
});

describe("collectExternalPackageNames", () => {
  it("extracts import specifiers from TS/TSX files", () => {
    const files = [
      {
        name: "app/page.tsx",
        content: `
          import React from "react";
          import { Button } from "@/components/ui/button";
          import { cn } from "@/lib/utils";
          import { motion } from "framer-motion";
          import "./styles.css";
        `,
      },
    ];
    const result = collectExternalPackageNames(files);
    expect(result.has("react")).toBe(true);
    expect(result.has("framer-motion")).toBe(true);
    expect(result.has("@/components/ui/button")).toBe(false);
    expect(result.has("@/lib/utils")).toBe(false);
  });

  it("skips non-code files", () => {
    const files = [
      { name: "README.md", content: 'import something from "leaked"' },
      { name: "styles.css", content: "" },
    ];
    const result = collectExternalPackageNames(files);
    expect(result.size).toBe(0);
  });

  it("handles require() and dynamic import()", () => {
    const files = [
      {
        name: "lib/helper.ts",
        content: `
          const sharp = require("sharp");
          const lazy = import("lodash");
        `,
      },
    ];
    const result = collectExternalPackageNames(files);
    expect(result.has("sharp")).toBe(true);
    expect(result.has("lodash")).toBe(true);
  });

  it("handles re-exports", () => {
    const files = [
      {
        name: "lib/index.ts",
        content: `export { Foo } from "some-lib";`,
      },
    ];
    const result = collectExternalPackageNames(files);
    expect(result.has("some-lib")).toBe(true);
  });
});

describe("ensureDependenciesInPackageJson", () => {
  const basePackageJson = JSON.stringify({
    dependencies: { react: "^19.0.0", next: "^16.0.0" },
  });

  it("adds missing packages from version map", () => {
    const result = ensureDependenciesInPackageJson({
      packageJsonContent: basePackageJson,
      requiredPackages: ["react", "framer-motion"],
      versionMap: { "framer-motion": "^12.0.0" },
    });
    expect(result.added).toContain("framer-motion");
    expect(result.added).not.toContain("react");
    expect(JSON.parse(result.content).dependencies["framer-motion"]).toBe("^12.0.0");
  });

  it("reports missing packages not in version map", () => {
    const result = ensureDependenciesInPackageJson({
      packageJsonContent: basePackageJson,
      requiredPackages: ["unknown-pkg"],
      versionMap: {},
    });
    expect(result.missing).toContain("unknown-pkg");
    expect(result.added).toHaveLength(0);
  });

  it("promotes devDependencies to dependencies", () => {
    const pkg = JSON.stringify({
      dependencies: { react: "^19.0.0" },
      devDependencies: { vitest: "^4.0.0" },
    });
    const result = ensureDependenciesInPackageJson({
      packageJsonContent: pkg,
      requiredPackages: ["vitest"],
      versionMap: {},
    });
    expect(result.added).toContain("vitest");
    expect(JSON.parse(result.content).dependencies.vitest).toBe("^4.0.0");
  });
});
