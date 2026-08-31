import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { formatTypecheckDiagnosticsForRepair, runPreVmTypecheck } from "./warm-typecheck";

describe("runPreVmTypecheck", () => {
  function subprocessResult(
    overrides: Partial<SpawnSyncReturns<string>>,
  ): SpawnSyncReturns<string> {
    return {
      pid: 1,
      output: [null, "", ""],
      stdout: "",
      stderr: "",
      status: 0,
      signal: null,
      ...overrides,
    } as SpawnSyncReturns<string>;
  }

  it("skips when feature flag is off and force is not set", async () => {
    const original = process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    delete process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    try {
      const result = await runPreVmTypecheck({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null", language: "tsx" }],
      });
      expect(result.skipped).toBe("feature_flag_disabled");
      expect(result.ok).toBe(true);
      expect(result.diagnostics).toEqual([]);
    } finally {
      if (original !== undefined) {
        process.env.SAJTMASKIN_PRE_VM_TYPECHECK = original;
      }
    }
  });

  it("skips when no files are provided even with force=true", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: "landing-page",
      files: [],
      force: true,
    });
    expect(result.skipped).toBe("no_files");
    expect(result.ok).toBe(true);
  });

  it("returns cache_cold when override directory has no node_modules", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: "landing-page",
      files: [{ path: "app/page.tsx", content: "export default () => null", language: "tsx" }],
      force: true,
      cacheDirOverride: "/nonexistent/path/that/does/not/exist",
    });
    expect(result.skipped).toBe("cache_cold");
    expect(result.ok).toBe(true);
  });

  /**
   * A cache provisioned by an older script version still sits on disk. Its
   * tsconfig produces diagnostics that describe the cache and CANNOT be filtered
   * afterwards — the repo's `@/*` → `./src/*` alias gives bogus TS2307 for every
   * `@/…` import, and the retired SDK stub alias from #600/#603 gives bogus
   * TS2305 on valid Clerk code. Both must read as cold (bugbot on #610).
   */
  describe("stale provisioning is treated as cold", () => {
    let cacheDir: string;

    beforeAll(() => {
      cacheDir = mkdtempSync(join(tmpdir(), "warm-typecheck-stale-"));
      mkdirSync(join(cacheDir, "node_modules"), { recursive: true });
    });

    afterAll(() => {
      rmSync(cacheDir, { recursive: true, force: true });
    });

    async function runWithTsconfig(paths: Record<string, string[]>) {
      writeFileSync(
        join(cacheDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { paths } }),
        "utf8",
      );
      return runPreVmTypecheck({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
      });
    }

    it("rejects the repo's own @/* alias", async () => {
      const result = await runWithTsconfig({ "@/*": ["./src/*"] });
      expect(result.skipped).toBe("cache_cold");
      expect(result.ok).toBe(true);
    });

    it("rejects a leftover SDK stub alias", async () => {
      const result = await runWithTsconfig({
        "@/*": ["./*"],
        "@clerk/nextjs": ["./__sdk-stubs/clerk-nextjs.tsx"],
      });
      expect(result.skipped).toBe("cache_cold");
      expect(result.ok).toBe(true);
    });
  });

  describe("subprocess classification", () => {
    let cacheDir: string;

    beforeAll(() => {
      cacheDir = mkdtempSync(join(tmpdir(), "warm-typecheck-process-"));
      mkdirSync(join(cacheDir, "node_modules"), { recursive: true });
      writeFileSync(
        join(cacheDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
        "utf8",
      );
    });

    afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

    it("classifies a non-diagnostic process failure as unavailable", async () => {
      let command = "";
      let args: readonly string[] = [];
      const result = await runPreVmTypecheck({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default 1", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
        spawnSyncOverride: ((receivedCommand: string, receivedArgs: readonly string[]) => {
          command = receivedCommand;
          args = receivedArgs;
          return subprocessResult({ status: 1, stderr: "tsc failed to start" });
        }) as typeof spawnSync,
      });
      expect(command).toBe(process.execPath);
      expect(args[0].replace(/\\/g, "/")).toContain("node_modules/typescript/bin/tsc");
      expect(result).toMatchObject({ ok: true, skipped: "tsc_unavailable", diagnostics: [] });
    });

    it("keeps parseable diagnostics from a nonzero tsc exit", async () => {
      const result = await runPreVmTypecheck({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default 1", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
        spawnSyncOverride: (() =>
          subprocessResult({
            status: 2,
            stdout: "app/page.tsx(1,1): error TS2322: Type mismatch.\n",
          })) as unknown as typeof spawnSync,
      });
      expect(result.ok).toBe(false);
      expect(result.skipped).toBeUndefined();
      expect(result.diagnostics).toEqual([
        {
          filePath: "app/page.tsx",
          line: 1,
          column: 1,
          code: "TS2322",
          message: "Type mismatch.",
        },
      ]);
    });
  });
});

/**
 * End-to-end guard for the dossier-SDK false-positive class: provisions a real
 * warm cache with the canonical script and runs the real `tsc`, because the bug
 * only shows up in the combination (cache reuses the repo's `node_modules`, the
 * generated site's SDKs live in the dossier manifests). Before the
 * `generated-only-modules` filter, case 1 below returned three TS2307s and sent
 * clean code into the LLM repair loop.
 */
describe("runPreVmTypecheck against a real provisioned warm cache", () => {
  const SCAFFOLD_ID = "landing-page";
  let cacheRoot: string;
  let cacheDir: string;

  beforeAll(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "warm-typecheck-e2e-"));
    cacheDir = join(cacheRoot, SCAFFOLD_ID);
    const provision = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/provision-warm-cache.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 180_000,
        env: { ...process.env, SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT: cacheRoot },
      },
    );
    if (provision.status !== 0) {
      throw new Error(
        `provision-warm-cache failed (exit ${provision.status}): ${provision.stderr || provision.stdout}`,
      );
    }
  }, 180_000);

  afterAll(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  function file(path: string, content: string): CodeFile {
    return { path, content, language: path.endsWith(".tsx") ? "tsx" : "ts" };
  }

  it("passes generated code that imports dossier-supplied SDKs", async () => {
    // `ably` left this fixture 2026-08-06: ably-realtime is parked, so the
    // package is no longer dossier-declared and its TS2307 is KEPT (see the
    // dedicated case below). The suppression set follows the live manifests
    // (curation owner), not KNOWN_PACKAGES — the pins that remain there serve
    // legacy-version export, not fresh curation.
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [
        file(
          "lib/supabase/client.ts",
          [
            'import { createBrowserClient } from "@supabase/ssr";',
            'import type { SupabaseClient } from "@supabase/supabase-js";',
            "export function makeClient(): SupabaseClient {",
            '  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, "anon");',
            "}",
          ].join("\n"),
        ),
        file(
          "components/user-menu.tsx",
          [
            '"use client";',
            'import { useUser } from "@clerk/nextjs";',
            "export function UserMenu() {",
            "  const { user } = useUser();",
            "  return <span>{user?.firstName}</span>;",
            "}",
          ].join("\n"),
        ),
      ],
    });

    expect(result.skipped).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.suppressedModules).toEqual([
      "@clerk/nextjs",
      "@supabase/ssr",
      "@supabase/supabase-js",
    ]);
  }, 120_000);

  it("keeps the unresolved-module error for a parked dossier's SDK (ably)", async () => {
    // ably-realtime parkerades 2026-08-06 → `ably` är inte längre en kuraterad
    // dossier-dependency, så pre-VM-passet får inte längre svälja dess TS2307.
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [file("lib/ably/client.ts", 'import * as Ably from "ably";\nexport default Ably;\n')],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["TS2307"]);
    expect(result.suppressedModules ?? []).toEqual([]);
  }, 120_000);

  it("keeps the unresolved-module error for a parked database SDK (mongodb)", async () => {
    // mongodb-atlas parkerades 2026-08-06 → `mongodb` är inte längre en
    // kuraterad dossier-dependency, så pre-VM-passet får inte längre svälja
    // dess TS2307 (samma mönster som ably ovan).
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [
        file(
          "lib/db/mongo.ts",
          'import { MongoClient } from "mongodb";\nexport const client = new MongoClient("mongodb://demo");\n',
        ),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["TS2307"]);
    expect(result.suppressedModules ?? []).toEqual([]);
  }, 120_000);

  it("still reports real type errors in the same run", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [
        file(
          "lib/supabase/client.ts",
          [
            'import { createBrowserClient } from "@supabase/ssr";',
            "export const client = createBrowserClient(",
            "  process.env.NEXT_PUBLIC_SUPABASE_URL!,",
            '  "anon",',
            ");",
          ].join("\n"),
        ),
        file(
          "app/broken/page.tsx",
          'const label: number = "not a number";\nexport default function Page() {\n  return <main>{label}</main>;\n}\n',
        ),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["TS2322"]);
    expect(result.suppressedModules).toEqual(["@supabase/ssr"]);
  }, 120_000);

  it("reports an unresolved package that no dossier declares", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [
        file(
          "app/page.tsx",
          'import { thing } from "totally-made-up-package";\nexport default function Page() {\n  return <main>{String(thing)}</main>;\n}\n',
        ),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["TS2307"]);
    expect(result.suppressedModules).toBeUndefined();
  }, 120_000);
});

describe("formatTypecheckDiagnosticsForRepair", () => {
  it("formats diagnostics as `path:line:col code: message`", () => {
    const lines = formatTypecheckDiagnosticsForRepair([
      {
        filePath: "app/page.tsx",
        line: 12,
        column: 5,
        code: "TS2304",
        message: "Cannot find name 'useFooBar'.",
      },
    ]);
    expect(lines).toEqual(["app/page.tsx:12:5 TS2304: Cannot find name 'useFooBar'."]);
  });
});
