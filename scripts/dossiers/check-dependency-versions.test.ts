import { describe, expect, it } from "vitest";
import {
  evaluateDossierDependencyContracts,
  npmInvocationForEnvironment,
} from "./check-dependency-versions";

describe("dossier dependency contract", () => {
  it("uses npm's JS entrypoint cross-platform without a shell", () => {
    expect(npmInvocationForEnvironment("win32", "C:/npm/npm-cli.js", "node.exe")).toEqual({
      executable: "node.exe",
      argsPrefix: ["C:/npm/npm-cli.js"],
    });
    expect(npmInvocationForEnvironment("linux", "/npm/npm-cli.js", "/usr/bin/node")).toEqual({
      executable: "/usr/bin/node",
      argsPrefix: ["/npm/npm-cli.js"],
    });
    expect(npmInvocationForEnvironment("linux", undefined, "/usr/bin/node")).toEqual({
      executable: "npm",
      argsPrefix: [],
    });
    expect(() => npmInvocationForEnvironment("win32", undefined, "node.exe")).toThrow(
      /npm_execpath/,
    );
  });

  it("resolves bare dependencies to deterministic export ranges", () => {
    const result = evaluateDossierDependencyContracts(
      [{ id: "chat", class: "hard", dependencies: ["ai", "server-only"] }],
      {
        resolveVersion: (pkg) => (pkg === "ai" ? "^7" : undefined),
        isBuiltin: (pkg) => pkg === "server-only",
      },
    );

    expect(result.checked).toEqual([{ pkg: "ai", range: "^7", dossierIds: ["chat"] }]);
    expect(result.builtins).toEqual(["server-only"]);
    expect(result.issues).toEqual([]);
  });

  it("fails unresolved and floating versions", () => {
    const result = evaluateDossierDependencyContracts(
      [
        { id: "unknown", class: "hard", dependencies: ["mystery-sdk"] },
        { id: "floating", class: "soft", dependencies: ["widget"] },
      ],
      {
        resolveVersion: (pkg) => (pkg === "widget" ? "latest" : undefined),
        isBuiltin: () => false,
      },
    );

    expect(result.issues.map((issue) => issue.reason)).toEqual([
      "unresolved-version",
      "floating-latest",
    ]);
  });

  it("fails when a central range silently shadows an explicit manifest pin", () => {
    const result = evaluateDossierDependencyContracts(
      [{ id: "billing", class: "hard", dependencies: ["stripe@^19"] }],
      { resolveVersion: () => "^20", isBuiltin: () => false },
    );

    expect(result.issues).toEqual([
      {
        dossierId: "billing",
        dependency: "stripe@^19",
        reason: "shadowed-manifest-pin",
        resolvedRange: "^20",
      },
    ]);
  });
});
