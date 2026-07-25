import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  formatTypecheckDiagnosticsForRepair,
  runPreVmTypecheck,
} from "./warm-typecheck";

describe("runPreVmTypecheck", () => {
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
    const provision = spawnSync("npx", ["tsx", "scripts/provision-warm-cache.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 180_000,
      env: { ...process.env, SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT: cacheRoot },
    });
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
          "lib/ably/client.ts",
          [
            'import * as Ably from "ably";',
            "export function getAblyClient(): Ably.Realtime {",
            '  return new Ably.Realtime({ authUrl: "/api/ably/auth" });',
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
      "ably",
    ]);
  }, 120_000);

  it("still reports real type errors in the same run", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: SCAFFOLD_ID,
      force: true,
      cacheDirOverride: cacheDir,
      files: [
        file("lib/ably/client.ts", 'import * as Ably from "ably";\nexport default Ably;\n'),
        file(
          "app/broken/page.tsx",
          'const label: number = "not a number";\nexport default function Page() {\n  return <main>{label}</main>;\n}\n',
        ),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["TS2322"]);
    expect(result.suppressedModules).toEqual(["ably"]);
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
