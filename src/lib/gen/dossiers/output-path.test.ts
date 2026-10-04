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
    [" components/foo.ts", "ASCII at root start"],
    ["components/foo.ts ", "ASCII at root end"],
    ["components/ nested/foo.ts", "ASCII at internal start"],
    ["components/nested /foo.ts", "ASCII at internal end"],
    ["\u00a0components/foo.ts", "NBSP at root start"],
    ["components/foo.ts\u00a0", "NBSP at root end"],
    ["components/\u00a0nested/foo.ts", "NBSP at internal start"],
    ["components/nested\u00a0/foo.ts", "NBSP at internal end"],
    ["\ufeffcomponents/foo.ts", "FEFF at root start"],
    ["components/foo.ts\ufeff", "FEFF at root end"],
    ["components/\ufeffnested/foo.ts", "FEFF at internal start"],
    ["components/nested\ufeff/foo.ts", "FEFF at internal end"],
    ["\u2009components/foo.ts", "thin space at root start"],
    ["components/nested\u3000/foo.ts", "ideographic space at internal end"],
  ])("rejects JavaScript-trim whitespace at a segment boundary (%s)", (path) => {
    expect(() => resolveDossierFilePath(path)).toThrow();
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

  it.each([
    ["app", "app/layout.tsx"],
    ["app/layout.tsx/child.ts", "app/layout.tsx"],
    ["package.json/assets", "package.json"],
    ["app/icon.svg", "app/icon.svg"],
    ["APP/API/PLACEHOLDER/ROUTE.TS", "app/api/placeholder/route.ts"],
  ])("rejects output %s that conflicts with reserved file %s", (path, reservedPath) => {
    expect(() => resolveDossierFilePath(path)).toThrow(reservedPath);
  });

  it.each([
    "application/page.tsx",
    "app/layout.tsx-extra/child.ts",
    "package.json-assets/file.ts",
    "app/icon.svg-extra",
  ])("allows reserved-prefix sibling %s", (path) => {
    expect(resolveDossierFilePath(path).outputPath).toBe(path);
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

  it.each([
    "components/foo bar.ts",
    "components/api/chat/route.ts",
    "app/docs/[...slug]/page.tsx",
    "app/docs/[[...optional]]/page.tsx",
  ])("keeps accepted source and output paths canonical for %s", (path) => {
    const resolved = resolveDossierFilePath(path);
    expect(normalizeDossierProjectPath(resolved.sourcePath)).toBe(resolved.sourcePath);
    expect(normalizeDossierProjectPath(resolved.outputPath)).toBe(resolved.outputPath);
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
