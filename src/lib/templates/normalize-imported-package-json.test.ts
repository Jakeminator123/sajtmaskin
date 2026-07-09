import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  MOTION_DOM_COMPAT_PIN,
  normalizeImportedRepoFiles,
} from "./normalize-imported-package-json";

function pkgFile(pkg: Record<string, unknown>): CodeFile {
  return {
    path: "package.json",
    content: JSON.stringify(pkg, null, 2),
    language: "json",
  };
}

function codeFile(path: string, content = "export {};"): CodeFile {
  return { path, content, language: "typescript" };
}

function parsePkg(files: CodeFile[]): Record<string, unknown> {
  const file = files.find((f) => f.path === "package.json");
  if (!file) throw new Error("package.json missing from result");
  return JSON.parse(file.content) as Record<string, unknown>;
}

describe("normalizeImportedRepoFiles — packageManager pnpm<11 strip (A#29)", () => {
  it("strips a pnpm@10 packageManager pin (preview host ignores its build approval)", () => {
    const files = [
      pkgFile({ packageManager: "pnpm@10.11.0", dependencies: { react: "^19" } }),
      codeFile("app/page.tsx"),
    ];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied.some((m) => m.includes("packageManager"))).toBe(true);
    const pkg = parsePkg(result.files);
    expect(pkg.packageManager).toBeUndefined();
    // Rest of package.json is untouched.
    expect((pkg.dependencies as Record<string, string>).react).toBe("^19");
  });

  it("strips a pnpm@10 pin even WITH a lockfile (build-script crash happens on frozen installs too)", () => {
    const files = [
      pkgFile({ packageManager: "pnpm@10.4.1", dependencies: { react: "^19" } }),
      { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'\n", language: "yaml" } as CodeFile,
    ];
    const result = normalizeImportedRepoFiles(files);
    expect(pkg2(result).packageManager).toBeUndefined();
    // Lockfile presence still blocks the motion override (only pm strip applies).
    expect(result.applied).toHaveLength(1);
  });

  it("keeps a pnpm@11 pin (pnpm 11 honors the build approval)", () => {
    const files = [pkgFile({ packageManager: "pnpm@11.10.0" }), codeFile("app/page.tsx")];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(0);
    expect(pkg2(result).packageManager).toBe("pnpm@11.10.0");
  });

  it("keeps a yarn packageManager pin (unaffected by the pnpm build-script gap)", () => {
    const files = [pkgFile({ packageManager: "yarn@4.5.0" }), codeFile("app/page.tsx")];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(0);
    expect(pkg2(result).packageManager).toBe("yarn@4.5.0");
  });

  it("is a no-op when package.json has no packageManager field at all", () => {
    const files = [pkgFile({ dependencies: { react: "^19" } }), codeFile("app/page.tsx")];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(0);
    // Samma array-instans tillbaka = ingen omskrivning alls.
    expect(result.files).toBe(files);
  });

  it("strips pnpm@10 AND injects the motion override in one pass when both apply", () => {
    const files = [
      pkgFile({
        packageManager: "pnpm@10.11.0",
        dependencies: { "framer-motion": "12.23.24" },
      }),
      codeFile("app/page.tsx"),
    ];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(2);
    const pkg = parsePkg(result.files);
    expect(pkg.packageManager).toBeUndefined();
    expect((pkg.overrides as Record<string, string>)["motion-dom"]).toBe(MOTION_DOM_COMPAT_PIN);
  });
});

function pkg2(result: { files: CodeFile[] }): Record<string, unknown> {
  return parsePkg(result.files);
}

describe("normalizeImportedRepoFiles — motion lockstep repair", () => {
  it("injects a motion-dom override when framer-motion is exact-pinned pre-12.41 without a lockfile", () => {
    const files = [
      pkgFile({ dependencies: { "framer-motion": "12.23.24", react: "^19" } }),
      codeFile("app/page.tsx"),
    ];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(1);
    const pkg = parsePkg(result.files);
    expect((pkg.overrides as Record<string, string>)["motion-dom"]).toBe(
      MOTION_DOM_COMPAT_PIN,
    );
    // Everything else in package.json stays intact.
    expect((pkg.dependencies as Record<string, string>)["framer-motion"]).toBe("12.23.24");
    expect((pkg.dependencies as Record<string, string>).react).toBe("^19");
  });

  it("handles exact pins in devDependencies and `=`-prefixed pins", () => {
    const result = normalizeImportedRepoFiles([
      pkgFile({ devDependencies: { "framer-motion": "=12.27.1" } }),
    ]);
    expect(result.applied).toHaveLength(1);
    expect(
      (parsePkg(result.files).overrides as Record<string, string>)["motion-dom"],
    ).toBe(MOTION_DOM_COMPAT_PIN);
  });

  it("preserves existing unrelated overrides when injecting", () => {
    const result = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.26.2" },
        overrides: { postcss: "^8.5.10" },
      }),
    ]);
    const overrides = parsePkg(result.files).overrides as Record<string, string>;
    expect(overrides.postcss).toBe("^8.5.10");
    expect(overrides["motion-dom"]).toBe(MOTION_DOM_COMPAT_PIN);
  });

  it("leaves caret/range framer-motion untouched (pair floats together)", () => {
    const files = [pkgFile({ dependencies: { "framer-motion": "^12.23.24" } })];
    const result = normalizeImportedRepoFiles(files);
    expect(result.applied).toHaveLength(0);
    expect(result.files).toBe(files);
  });

  it("leaves exact pins at or above 12.41.0 untouched (already matches new motion-dom API)", () => {
    const result = normalizeImportedRepoFiles([
      pkgFile({ dependencies: { "framer-motion": "12.41.0" } }),
    ]);
    expect(result.applied).toHaveLength(0);
  });

  it("skips when a lockfile is present (transitives frozen; npm ci would reject the override)", () => {
    for (const lockfile of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
      const result = normalizeImportedRepoFiles([
        pkgFile({ dependencies: { "framer-motion": "12.23.24" } }),
        codeFile(lockfile, "{}"),
      ]);
      expect(result.applied, lockfile).toHaveLength(0);
    }
  });

  // Codex P2 (PR #424): the preview host's resolveInstallCommand ignores Bun
  // locks and runs a fresh `npm install`, so a bun.lock must NOT suppress the
  // repair — the skew is still live on that install path.
  it("still repairs when only a Bun lockfile is present (preview host ignores it)", () => {
    for (const lockfile of ["bun.lock", "bun.lockb"]) {
      const result = normalizeImportedRepoFiles([
        pkgFile({ dependencies: { "framer-motion": "12.23.24" } }),
        codeFile(lockfile, "{}"),
      ]);
      expect(result.applied, lockfile).toHaveLength(1);
      expect(
        (parsePkg(result.files).overrides as Record<string, string>)["motion-dom"],
      ).toBe(MOTION_DOM_COMPAT_PIN);
    }
  });

  it("skips when motion-dom is already declared or overridden by the template", () => {
    const declared = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.23.24", "motion-dom": "12.23.24" },
      }),
    ]);
    expect(declared.applied).toHaveLength(0);

    const overridden = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.23.24" },
        overrides: { "motion-dom": "12.39.0" },
      }),
    ]);
    expect(overridden.applied).toHaveLength(0);
  });

  // Codex P2 (PR #424): a direct motion-dom declaration in optional/peer deps
  // makes a conflicting override an npm EOVERRIDE install failure — skip.
  it("skips when motion-dom is a direct optional/peer dependency", () => {
    const optional = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.23.24" },
        optionalDependencies: { "motion-dom": "^12.23.0" },
      }),
    ]);
    expect(optional.applied).toHaveLength(0);

    const peer = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.23.24" },
        peerDependencies: { "motion-dom": "^12.23.0" },
      }),
    ]);
    expect(peer.applied).toHaveLength(0);
  });

  // Codex P2 (PR #424): with no lockfile the preview host installs with npm,
  // which IGNORES Yarn `resolutions` — they protect nothing on this path, so
  // the repair must still run (npm honors only our injected `overrides`).
  it("still repairs when only Yarn resolutions pin motion-dom (npm ignores them)", () => {
    const result = normalizeImportedRepoFiles([
      pkgFile({
        dependencies: { "framer-motion": "12.23.24" },
        resolutions: { "motion-dom": "12.39.0" },
      }),
    ]);
    expect(result.applied).toHaveLength(1);
    expect(
      (parsePkg(result.files).overrides as Record<string, string>)["motion-dom"],
    ).toBe(MOTION_DOM_COMPAT_PIN);
  });

  it("does not rewrite for an exact-pinned `motion` wrapper alone (framer-motion floats via caret)", () => {
    const result = normalizeImportedRepoFiles([
      pkgFile({ dependencies: { motion: "12.23.24" } }),
    ]);
    expect(result.applied).toHaveLength(0);
  });

  it("ignores nested package.json files (only the root is the install manifest)", () => {
    const result = normalizeImportedRepoFiles([
      codeFile("packages/site/package.json", JSON.stringify({
        dependencies: { "framer-motion": "12.23.24" },
      })),
    ]);
    expect(result.applied).toHaveLength(0);
  });

  it("is a no-op on unparseable or missing package.json", () => {
    expect(
      normalizeImportedRepoFiles([codeFile("package.json", "{ not json")]).applied,
    ).toHaveLength(0);
    expect(normalizeImportedRepoFiles([codeFile("app/page.tsx")]).applied).toHaveLength(0);
    expect(normalizeImportedRepoFiles([]).applied).toHaveLength(0);
  });
});
