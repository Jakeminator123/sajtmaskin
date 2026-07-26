import { describe, it, expect } from "vitest";
import { builtinModules, isBuiltin } from "node:module";
import {
  NODE_CORE_MODULES,
  PREFIX_ONLY_NODE_CORE_MODULES,
  isNodeCoreModule,
} from "./node-core-modules";
import { runProjectSanityChecks } from "./project-sanity";
import { runDepCompleter } from "@/lib/gen/autofix/dep-completer";
import type { CodeFile } from "@/lib/gen/parser";

function file(path: string, content: string): CodeFile {
  return { path, content, language: path.endsWith(".json") ? "json" : "tsx" } as CodeFile;
}

const PACKAGE_JSON = JSON.stringify({
  name: "site",
  dependencies: { next: "15.0.0", react: "19.0.0" },
});

describe("node core module list", () => {
  it("contains crypto and fs", () => {
    expect(NODE_CORE_MODULES.has("crypto")).toBe(true);
    expect(NODE_CORE_MODULES.has("fs")).toBe(true);
  });

  it("covers every builtin the running Node version reports", () => {
    const missing = builtinModules
      .filter((name) => !name.startsWith("_"))
      .filter((name) => !isNodeCoreModule(name));
    expect(missing).toEqual([]);
  });

  it("recognises node: prefix and sub-paths", () => {
    expect(isNodeCoreModule("node:crypto")).toBe(true);
    expect(isNodeCoreModule("node:fs/promises")).toBe(true);
    expect(isNodeCoreModule("stream/web")).toBe(true);
    expect(isNodeCoreModule("cryptography")).toBe(false);
    expect(isNodeCoreModule("@scope/fs")).toBe(false);
  });

  // Codex P1 på #623: `sqlite`, `test` och `sea` är core BARA med prefixet, och
  // alla tre finns som riktiga npm-paket under sitt bara namn. Klassades de som
  // core hoppade dep-completern över att pinna dem medan preflighten avvisade en
  // uttrycklig dependency — samma falska blockerare den här modulen finns för
  // att ta bort, bara i en annan riktning.
  it("agrees with the running Node on the prefix rule", () => {
    for (const name of PREFIX_ONLY_NODE_CORE_MODULES) {
      expect(isBuiltin(name)).toBe(false);
      expect(isBuiltin(`node:${name}`)).toBe(true);
      expect(isNodeCoreModule(name)).toBe(false);
      expect(isNodeCoreModule(`node:${name}`)).toBe(true);
    }
  });

  it("matches module.isBuiltin for every bare specifier it claims", () => {
    const disagreements = [...NODE_CORE_MODULES, ...PREFIX_ONLY_NODE_CORE_MODULES]
      .filter((name) => isNodeCoreModule(name) !== isBuiltin(name))
      .sort();
    expect(disagreements).toEqual([]);
  });
});

describe("project-sanity node core modules", () => {
  it("reports no findings for an imported Node core module", () => {
    const result = runProjectSanityChecks([
      file("app/page.tsx", `import { createHash } from "crypto";\nexport default function Page() { return <div>{createHash("sha256").digest("hex")}</div>; }\n`),
      file("package.json", PACKAGE_JSON),
    ]);
    expect(result.issues.filter((i) => i.message.includes("crypto"))).toEqual([]);
  });

  it("reports no findings for the node: prefixed form", () => {
    const result = runProjectSanityChecks([
      file("app/page.tsx", `import { readFile } from "node:fs/promises";\nexport default function Page() { void readFile; return <div />; }\n`),
      file("package.json", PACKAGE_JSON),
    ]);
    expect(result.issues.filter((i) => i.message.includes("fs"))).toEqual([]);
  });

  it("errors when package.json declares a Node core module as a dependency", () => {
    const result = runProjectSanityChecks([
      file("app/page.tsx", `export default function Page() { return <div />; }\n`),
      file(
        "package.json",
        JSON.stringify({ name: "site", dependencies: { next: "15.0.0", crypto: "^1" } }),
      ),
    ]);
    const issue = result.issues.find((i) => i.message.includes('"crypto" is declared'));
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.category).toBe("dependency_install_failure");
  });

  it("lets package.json declare the npm packages named like prefix-only builtins", () => {
    const result = runProjectSanityChecks([
      file("app/page.tsx", `import sqlite from "sqlite";\nexport default function Page() { void sqlite; return <div />; }\n`),
      file(
        "package.json",
        JSON.stringify({ name: "site", dependencies: { next: "15.0.0", sqlite: "^5.1.1" } }),
      ),
    ]);
    expect(result.issues.filter((i) => i.message.includes("Node core module"))).toEqual([]);
  });

  it("keeps the missing-dependency message free of pinning instructions", () => {
    const result = runProjectSanityChecks([
      file("app/page.tsx", `import Chart from "recharts";\nexport default function Page() { void Chart; return <div />; }\n`),
      file("package.json", PACKAGE_JSON),
    ]);
    const issue = result.issues.find((i) => i.message.includes("recharts"));
    expect(issue?.message).toContain("missing from the dependencies in package.json");
    expect(issue?.message).not.toContain("pinned in package.json");
  });
});

describe("dep-completer node core modules", () => {
  it("never pins a Node core module", () => {
    const result = runDepCompleter(
      `import { createHash } from "crypto";\nimport { readFile } from "node:fs/promises";\nimport { z } from "zod";\n`,
    );
    expect(result.dependencies.crypto).toBeUndefined();
    expect(result.unknownPackages).not.toContain("crypto");
    expect(result.unknownPackages).not.toContain("node:fs");
    expect(result.dependencies.zod).toBeDefined();
  });

  it("does not swallow the npm package named like a prefix-only builtin", () => {
    const result = runDepCompleter(`import sqlite from "sqlite";\n`);
    const seen =
      result.dependencies.sqlite !== undefined || result.unknownPackages.includes("sqlite");
    expect(seen).toBe(true);
  });

  it("still skips the prefixed form", () => {
    const result = runDepCompleter(`import { DatabaseSync } from "node:sqlite";\n`);
    expect(result.dependencies.sqlite).toBeUndefined();
    expect(result.unknownPackages).not.toContain("sqlite");
    expect(result.unknownPackages).not.toContain("node:sqlite");
  });
});
