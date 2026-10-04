/**
 * Locks in the dossier-staging-path → user-project-output-path mapping.
 *
 * If any of these expectations break, BOTH the system-prompt instruction
 * (where the LLM is told to emit) AND the verbatim-policy restoration
 * target must be updated in lock-step — they share this helper specifically
 * because they used to drift apart and produced the
 * "two three-canvas-shell.tsx files in one version" rotorsaken on
 * 2026-05-01.
 */
import { describe, expect, it } from "vitest";
import {
  dossierOutputPathIdentity,
  findDivergentDossierOutputPathConflicts,
  mapDossierPathToOutput,
  normalizeDossierProjectPath,
  resolveDossierFilePath,
} from "./output-path";

describe("mapDossierPathToOutput", () => {
  it("keeps `components/<file>.tsx` for ordinary UI components", () => {
    expect(mapDossierPathToOutput("components/three-canvas-shell.tsx")).toBe(
      "components/three-canvas-shell.tsx",
    );
    expect(mapDossierPathToOutput("components/checkout-button.tsx")).toBe(
      "components/checkout-button.tsx",
    );
    expect(mapDossierPathToOutput("components/contact-form.tsx")).toBe(
      "components/contact-form.tsx",
    );
  });

  it("rewrites `components/api/<route>/route.ts` to `app/api/<route>/route.ts`", () => {
    expect(mapDossierPathToOutput("components/api/checkout-session/route.ts")).toBe(
      "app/api/checkout-session/route.ts",
    );
    expect(mapDossierPathToOutput("components/api/contact/route.ts")).toBe(
      "app/api/contact/route.ts",
    );
    expect(mapDossierPathToOutput("components/api/chat/route.ts")).toBe("app/api/chat/route.ts");
  });

  it("strips `components/` for Next.js root-level convention files", () => {
    expect(mapDossierPathToOutput("components/middleware.ts")).toBe("middleware.ts");
    expect(mapDossierPathToOutput("components/instrumentation.ts")).toBe("instrumentation.ts");
    // Dossier wave 2 (postgres-drizzle): Drizzle Kit resolves its config from
    // the project root, so the dossier config must land there.
    expect(mapDossierPathToOutput("components/drizzle.config.ts")).toBe("drizzle.config.ts");
    expect(mapDossierPathToOutput("components/sentry.client.config.ts")).toBe(
      "sentry.client.config.ts",
    );
    expect(mapDossierPathToOutput("components/sentry.server.config.ts")).toBe(
      "sentry.server.config.ts",
    );
    expect(mapDossierPathToOutput("components/sentry.edge.config.ts")).toBe(
      "sentry.edge.config.ts",
    );
  });

  it("strips `components/` for `lib/` SDK init helpers", () => {
    expect(mapDossierPathToOutput("components/lib/stripe.ts")).toBe("lib/stripe.ts");
    expect(mapDossierPathToOutput("components/lib/sub/foo.ts")).toBe("lib/sub/foo.ts");
  });

  it("returns paths without the `components/` prefix unchanged", () => {
    expect(mapDossierPathToOutput("app/page.tsx")).toBe("app/page.tsx");
    expect(mapDossierPathToOutput("middleware.ts")).toBe("middleware.ts");
    expect(mapDossierPathToOutput("lib/stripe.ts")).toBe("lib/stripe.ts");
  });

  it("does NOT confuse `components/middleware-foo.ts` with the root middleware file", () => {
    // Only the exact filename `middleware.ts` is a Next.js convention.
    // Anything else under `components/` is a regular component module.
    expect(mapDossierPathToOutput("components/middleware-helpers.ts")).toBe(
      "components/middleware-helpers.ts",
    );
    expect(mapDossierPathToOutput("components/auth-middleware.ts")).toBe(
      "components/auth-middleware.ts",
    );
  });

  it("is idempotent — re-applying the mapping is a no-op", () => {
    const inputs = [
      "components/three-canvas-shell.tsx",
      "components/api/checkout-session/route.ts",
      "components/middleware.ts",
      "components/lib/stripe.ts",
    ];
    for (const input of inputs) {
      const once = mapDossierPathToOutput(input);
      const twice = mapDossierPathToOutput(once);
      expect(twice).toBe(once);
    }
  });
});

describe("resolveDossierFilePath", () => {
  it.each([
    [" /components/Foo.ts ", "components/Foo.ts"],
    ["./components/Foo.ts", "components/Foo.ts"],
    ["///components/Foo.ts", "components/Foo.ts"],
    ["components///Foo.ts", "components/Foo.ts"],
    ["components\\Foo.ts", "components/Foo.ts"],
    ["../components/Foo.ts", "../components/Foo.ts"],
  ])("normalizes project path spelling %j without resolving traversal", (path, expected) => {
    expect(normalizeDossierProjectPath(path)).toBe(expected);
  });

  it("returns the portable source, mapped output and Unicode/case-folded identity", () => {
    expect(resolveDossierFilePath("components/api/chat/route.ts")).toEqual({
      sourcePath: "components/api/chat/route.ts",
      outputPath: "app/api/chat/route.ts",
      outputIdentity: "app/api/chat/route.ts",
    });
    expect(dossierOutputPathIdentity("APP/Cafe\u0301/Page.TSX")).toBe("app/caf\u00e9/page.tsx");
  });

  it.each([
    ["../outside.ts", "traversal"],
    ["components/../outside.ts", "traversal"],
    ["/etc/passwd", "relative"],
    ["C:/temp/file.ts", "forbidden"],
    ["components\\foo.ts", "forward slashes"],
    ["components//foo.ts", "empty path segments"],
    ["components/foo\u0000.ts", "control"],
    ["components/foo?.ts", "forbidden"],
    ["components/NUL.ts", "Windows device"],
    ["components/com1", "Windows device"],
    ["components/foo./bar.ts", "end in a dot or space"],
    ["components/foo /bar.ts", "end in a dot or space"],
    ["ab", "3..240"],
    [`components/${"a".repeat(240)}.ts`, "3..240"],
  ])("rejects non-portable path %j", (path, message) => {
    expect(() => resolveDossierFilePath(path)).toThrow(message);
  });

  it.each([
    "components/COM¹",
    "components/com².txt",
    "components/sub/CoM³.log",
    "components/LPT¹",
    "components/lpt².md",
    "components/sub/LpT³.ts",
  ])("rejects Windows superscript device alias %s", (path) => {
    expect(() => resolveDossierFilePath(path)).toThrow("Windows device");
  });

  it.each([
    "app/layout.tsx",
    "APP/LAYOUT.TSX",
    "app/globals.css",
    "app/loading.tsx",
    "app/error.tsx",
    "app/not-found.tsx",
    "app/template.tsx",
    "package.json",
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "tailwind.config.ts",
    "postcss.config.mjs",
  ])("rejects scaffold-reserved output %s case-insensitively", (path) => {
    expect(() => resolveDossierFilePath(path)).toThrow("scaffold-reserved");
  });

  it("allows ordinary paths and literal Next.js catch-all segments", () => {
    expect(resolveDossierFilePath("app/statistik/page.tsx").outputPath).toBe(
      "app/statistik/page.tsx",
    );
    expect(resolveDossierFilePath("components/legal/notice.tsx").outputPath).toBe(
      "components/legal/notice.tsx",
    );
    expect(resolveDossierFilePath("app/docs/[...slug]/page.tsx").outputPath).toBe(
      "app/docs/[...slug]/page.tsx",
    );
    expect(resolveDossierFilePath("app/docs/[[...slug]]/page.tsx").outputPath).toBe(
      "app/docs/[[...slug]]/page.tsx",
    );
  });
});

describe("portable output collisions", () => {
  it("detects case-only aliases even when their bytes happen to match", () => {
    const conflicts = findDivergentDossierOutputPathConflicts([
      { dossierId: "a", capability: "one", sourcePath: "components/Foo.ts", content: "same" },
      { dossierId: "b", capability: "two", sourcePath: "components/foo.ts", content: "same" },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.claims.map((claim) => claim.dossierId)).toEqual(["a", "b"]);
  });

  it("detects divergent bytes at the exact same output path", () => {
    expect(
      findDivergentDossierOutputPathConflicts([
        { dossierId: "a", capability: "one", sourcePath: "components/shared.ts", content: "a" },
        { dossierId: "b", capability: "two", sourcePath: "components/shared.ts", content: "b" },
      ]),
    ).toHaveLength(1);
  });

  it("allows byte-identical helpers only at the exact same output path", () => {
    expect(
      findDivergentDossierOutputPathConflicts([
        { dossierId: "a", capability: "one", sourcePath: "components/shared.ts", content: "same" },
        { dossierId: "b", capability: "two", sourcePath: "components/shared.ts", content: "same" },
      ]),
    ).toEqual([]);
  });

  it.each([
    ["components/cache", "components/cache/item.ts"],
    ["components/Cache", "components/cache/item.ts"],
    ["components/cafe\u0301", "components/caf\u00e9/item.ts"],
  ])("rejects portable file/directory claims %s and %s", (parent, child) => {
    expect(
      findDivergentDossierOutputPathConflicts([
        { dossierId: "parent", capability: "one", sourcePath: parent, content: "same" },
        { dossierId: "child", capability: "two", sourcePath: child, content: "same" },
      ]),
    ).toHaveLength(1);
  });

  it("does not confuse prefix siblings with file/directory conflicts", () => {
    expect(
      findDivergentDossierOutputPathConflicts([
        { dossierId: "a", capability: "one", sourcePath: "components/cache", content: "same" },
        {
          dossierId: "b",
          capability: "two",
          sourcePath: "components/cache-item/file.ts",
          content: "same",
        },
      ]),
    ).toEqual([]);
  });
});
