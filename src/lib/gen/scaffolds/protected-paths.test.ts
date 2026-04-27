import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  SCAFFOLD_PROTECTED_PATHS,
  isScaffoldProtectedPath,
  partitionGeneratedFilesForProtectedPaths,
  reinjectProtectedPathsFromFallback,
} from "./protected-paths";

function file(path: string, content: string, language = "tsx"): CodeFile {
  return { path, content, language };
}

/**
 * P0 regression: pre-2026-04-27 the protected-paths partition lived inside
 * `finalize-merge.ts` and was not reachable from `server-verify.ts` or the
 * manual repair route. Both repair pipelines therefore persisted broken
 * JSX-in-`.ts` `app/api/placeholder/route.ts` content via
 * `saveRepairedFiles()` — bypassing SCAFFOLD_PROTECTED_PATHS entirely.
 *
 * These tests pin the fix: the partition + reinjection helpers MUST live
 * in a shared module so the same set of paths is enforced across all
 * three persist pipelines (init/follow-up merge, server-verify repair,
 * manual repair).
 */

const BROKEN_LLM_ROUTE_TS = `import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse(
    <svg xmlns="http://www.w3.org/2000/svg" style="width: 100%">
      <rect fill="#000" />
    </svg>,
    { headers: { "Content-Type": "image/svg+xml" } },
  );
}
`;

const SCAFFOLD_ROUTE_TS = `import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const width = searchParams.get("width") ?? "400";
  const height = searchParams.get("height") ?? "300";
  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${width}" height="\${height}"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>\`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml" } });
}
`;

describe("SCAFFOLD_PROTECTED_PATHS — single source of truth", () => {
  it("contains app/api/placeholder/route.ts", () => {
    expect(SCAFFOLD_PROTECTED_PATHS.has("app/api/placeholder/route.ts")).toBe(true);
  });
});

describe("isScaffoldProtectedPath", () => {
  it("matches the canonical posix path", () => {
    expect(isScaffoldProtectedPath("app/api/placeholder/route.ts")).toBe(true);
  });

  it("normalises windows backslashes before lookup", () => {
    expect(isScaffoldProtectedPath("app\\api\\placeholder\\route.ts")).toBe(true);
  });

  it("returns false for unrelated paths", () => {
    expect(isScaffoldProtectedPath("app/page.tsx")).toBe(false);
    expect(isScaffoldProtectedPath("app/api/contact/route.ts")).toBe(false);
  });
});

describe("partitionGeneratedFilesForProtectedPaths", () => {
  it("drops broken LLM emissions of protected paths", () => {
    const partition = partitionGeneratedFilesForProtectedPaths([
      file("app/page.tsx", "export default function Page(){return null}"),
      file("app/api/placeholder/route.ts", BROKEN_LLM_ROUTE_TS, "ts"),
      file("components/header.tsx", "export const Header=()=>null;"),
    ]);
    expect(partition.dropped.map((f) => f.path)).toEqual([
      "app/api/placeholder/route.ts",
    ]);
    expect(partition.kept.map((f) => f.path)).toEqual([
      "app/page.tsx",
      "components/header.tsx",
    ]);
  });

  it("returns empty dropped when no protected paths emitted", () => {
    const partition = partitionGeneratedFilesForProtectedPaths([
      file("app/page.tsx", "x"),
      file("components/footer.tsx", "y"),
    ]);
    expect(partition.dropped).toEqual([]);
    expect(partition.kept).toHaveLength(2);
  });
});

describe("reinjectProtectedPathsFromFallback", () => {
  it("re-injects the canonical version from fallback when LLM dropped path was in repair output", () => {
    // Simulates the server-verify / manual-repair scenario:
    //   1. LLM repair output emitted broken JSX-in-`.ts` `route.ts`
    //   2. partition dropped the LLM version
    //   3. fallback (= previously persisted version.files_json) has the
    //      canonical scaffold version
    //   4. Result: kept set carries the SCAFFOLD content, never the LLM content
    const partition = partitionGeneratedFilesForProtectedPaths([
      file("app/page.tsx", "// brand-aware page"),
      file("app/api/placeholder/route.ts", BROKEN_LLM_ROUTE_TS, "ts"),
    ]);
    const reinjection = reinjectProtectedPathsFromFallback({
      kept: partition.kept,
      droppedPaths: partition.dropped.map((f) => f.path),
      fallbackFiles: [
        file("app/api/placeholder/route.ts", SCAFFOLD_ROUTE_TS, "ts"),
        file("app/layout.tsx", "// scaffold layout"),
      ],
    });

    expect(reinjection.reinjected).toEqual(["app/api/placeholder/route.ts"]);
    expect(reinjection.stillMissing).toEqual([]);

    const placeholderRoute = reinjection.files.find(
      (f) => f.path === "app/api/placeholder/route.ts",
    );
    expect(placeholderRoute).toBeDefined();
    expect(placeholderRoute?.content).toBe(SCAFFOLD_ROUTE_TS);
    expect(placeholderRoute?.content).not.toContain(BROKEN_LLM_ROUTE_TS);

    // Bypass-protection invariant: under no circumstance does a
    // saveRepairedFiles caller receive the LLM-broken content for a
    // protected path — that is the regression we are pinning.
    const filesJson = JSON.stringify(reinjection.files);
    expect(filesJson).not.toContain('style="width: 100%"');
  });

  it("reports stillMissing when fallback also lacks the protected path", () => {
    const reinjection = reinjectProtectedPathsFromFallback({
      kept: [file("app/page.tsx", "x")],
      droppedPaths: ["app/api/placeholder/route.ts"],
      fallbackFiles: [file("app/page.tsx", "x")],
    });
    expect(reinjection.reinjected).toEqual([]);
    expect(reinjection.stillMissing).toEqual(["app/api/placeholder/route.ts"]);
    expect(reinjection.files).toHaveLength(1);
    expect(reinjection.files[0].path).toBe("app/page.tsx");
  });

  it("is a no-op when nothing was dropped", () => {
    const kept = [
      file("app/page.tsx", "x"),
      file("components/header.tsx", "y"),
    ];
    const reinjection = reinjectProtectedPathsFromFallback({
      kept,
      droppedPaths: [],
      fallbackFiles: [file("app/api/placeholder/route.ts", SCAFFOLD_ROUTE_TS, "ts")],
    });
    expect(reinjection.reinjected).toEqual([]);
    expect(reinjection.stillMissing).toEqual([]);
    expect(reinjection.files).toBe(kept);
  });

  it("normalises windows path separators in fallback lookup", () => {
    const reinjection = reinjectProtectedPathsFromFallback({
      kept: [],
      droppedPaths: ["app\\api\\placeholder\\route.ts"],
      fallbackFiles: [
        file("app/api/placeholder/route.ts", SCAFFOLD_ROUTE_TS, "ts"),
      ],
    });
    expect(reinjection.reinjected).toEqual(["app\\api\\placeholder\\route.ts"]);
    expect(reinjection.stillMissing).toEqual([]);
  });
});
