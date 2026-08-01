import { describe, expect, it } from "vitest";

import {
  PREVIEW_PATCH_MAX_FILES,
  hashPreviewFileContent,
  planPreviewPatch,
} from "./preview-patch-plan";

function manifestOf(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, hashPreviewFileContent(content)]),
  );
}

const BASE_FILES = {
  "app/page.tsx": "export default function Page(){return <main>v1</main>;}",
  "app/about/page.tsx": "export default function About(){return <main>about</main>;}",
  "app/globals.css": "body{color:#111}",
  "package.json": '{"name":"site"}',
  ".env.local": "NEXT_PUBLIC_X=1",
};

describe("planPreviewPatch", () => {
  it("returns only the files whose content differs from the host", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: {
        ...BASE_FILES,
        "app/page.tsx": "export default function Page(){return <main>v2</main>;}",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Object.keys(plan.changedFiles)).toEqual(["app/page.tsx"]);
    expect(plan.changedFiles["app/page.tsx"]).toContain("v2");
    expect(plan.removedPaths).toEqual([]);
  });

  it("treats a path the new version no longer contains as a removal", () => {
    const { "app/about/page.tsx": _dropped, ...withoutAbout } = BASE_FILES;
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: {
        ...withoutAbout,
        "app/page.tsx": "export default function Page(){return <main>v2</main>;}",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.removedPaths).toEqual(["app/about/page.tsx"]);
    expect(Object.keys(plan.changedFiles)).toEqual(["app/page.tsx"]);
  });

  it("counts a brand new file as changed", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: {
        ...BASE_FILES,
        "app/kontakt/page.tsx": "export default function Kontakt(){return <main/>;}",
      },
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Object.keys(plan.changedFiles)).toEqual(["app/kontakt/page.tsx"]);
  });

  it("rejects a dependency/config change so the update path handles the restart", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: { ...BASE_FILES, "package.json": '{"name":"site","dependencies":{"zod":"^3"}}' },
    });

    expect(plan).toEqual({ ok: false, reason: "structural_change" });
  });

  it("rejects a changed .env.local (Next reads env only at boot)", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: { ...BASE_FILES, ".env.local": "NEXT_PUBLIC_X=2" },
    });

    expect(plan).toEqual({ ok: false, reason: "structural_change" });
  });

  it("rejects a structural REMOVAL, not just a structural edit", () => {
    const { "package.json": _dropped, ...withoutPackageJson } = BASE_FILES;
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: withoutPackageJson,
    });

    expect(plan).toEqual({ ok: false, reason: "structural_change" });
  });

  it("rejects an identical file set (nothing to patch)", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: { ...BASE_FILES },
    });

    expect(plan).toEqual({ ok: false, reason: "no_changes" });
  });

  it("rejects an empty host manifest — we do not know what is live", () => {
    const plan = planPreviewPatch({ hostFileHashes: {}, nextFiles: BASE_FILES });

    expect(plan).toEqual({ ok: false, reason: "empty_host_manifest" });
  });

  it("rejects a diff with more files than the cap", () => {
    const nextFiles: Record<string, string> = { ...BASE_FILES };
    for (let i = 0; i <= PREVIEW_PATCH_MAX_FILES; i++) {
      nextFiles[`app/p${i}/page.tsx`] = `export default function P${i}(){return <main/>;}`;
    }
    const plan = planPreviewPatch({ hostFileHashes: manifestOf(BASE_FILES), nextFiles });

    expect(plan).toEqual({ ok: false, reason: "diff_too_large" });
  });

  it("rejects a diff over the byte cap", () => {
    const plan = planPreviewPatch({
      hostFileHashes: manifestOf(BASE_FILES),
      nextFiles: { ...BASE_FILES, "app/page.tsx": "x".repeat(2048) },
      maxBytes: 1024,
    });

    expect(plan).toEqual({ ok: false, reason: "diff_too_large" });
  });

  it("produces a patch that reconstructs the new file set exactly", () => {
    const nextFiles = {
      "app/page.tsx": "export default function Page(){return <main>v2</main>;}",
      "app/globals.css": BASE_FILES["app/globals.css"],
      "package.json": BASE_FILES["package.json"],
      ".env.local": BASE_FILES[".env.local"],
      "app/kontakt/page.tsx": "export default function Kontakt(){return <main/>;}",
    };
    const plan = planPreviewPatch({ hostFileHashes: manifestOf(BASE_FILES), nextFiles });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // Host semantics: merge `changedFiles` over the stored set, then drop
    // `removedPaths`. The result must equal what a full /update would have set.
    const merged: Record<string, string> = { ...BASE_FILES, ...plan.changedFiles };
    for (const path of plan.removedPaths) delete merged[path];
    expect(merged).toEqual(nextFiles);
  });
});
