import {
  SHADCN_BASELINE_PACKAGES,
  collectExternalPackageNames,
  ensureDependenciesInPackageJson,
  getDeployVersionMap,
} from "@/lib/deploy/dependency-utils";

type PreDeployDiagnostics = {
  files: Array<{ name: string; content: string }>;
  fixesApplied: string[];
  warnings: string[];
  /** Filvägar som preflight flaggade som ogiltiga / ej kunde patchas (tunn kontrakt mot UI). */
  invalidFiles: string[];
};

/**
 * K-007 (2026-03-26): pre-deploy auto-fix stays **enabled by default**; only skip when
 * body `skipAutoFix` or deploy-disable env vars are set. See `docs/architecture/llm-pipeline.md` (detalj: arkiv `deploy-precheck.md`).
 */
export function shouldSkipPreDeployAutoFix(bodySkipAutoFix?: boolean): boolean {
  if (bodySkipAutoFix === true) return true;
  return (
    process.env.SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX === "1" ||
    process.env.DEPLOY_DISABLE_AUTO_FIX === "1"
  );
}

export function runPreDeployFixPipeline(
  files: Array<{ name: string; content: string }>,
  skipAutoFix: boolean,
): PreDeployDiagnostics {
  if (skipAutoFix) {
    return {
      files: files.map((f) => ({ ...f })),
      fixesApplied: [
        "Pre-deploy auto-fix skipped (skipAutoFix in body or SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1 / DEPLOY_DISABLE_AUTO_FIX=1)",
      ],
      warnings: [],
      invalidFiles: [],
    };
  }
  return applyPreDeployFixes(files);
}

function applyPreDeployFixes(
  files: Array<{ name: string; content: string }>,
): PreDeployDiagnostics {
  const fixesApplied: string[] = [];
  const warnings: string[] = [];
  const invalidFiles: string[] = [];
  const lockfileNames = new Set(["pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock"]);
  const removedLockfiles = new Set<string>();
  const nextFiles = files
    .filter((file) => {
      const baseName = file.name.split("/").pop()?.toLowerCase() || "";
      if (lockfileNames.has(baseName)) {
        removedLockfiles.add(baseName);
        return false;
      }
      return true;
    })
    .map((f) => ({ ...f }));
  if (removedLockfiles.size > 0) {
    fixesApplied.push(
      `Removed lockfiles to prefer npm: ${Array.from(removedLockfiles).join(", ")}`,
    );
  }

  const versionMap = getDeployVersionMap();

  const buildBasePackageJson = () => {
    const missing: string[] = [];
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const addVersion = (target: Record<string, string>, pkg: string) => {
      const version = versionMap[pkg];
      if (version) {
        target[pkg] = version;
      } else {
        missing.push(pkg);
      }
    };
    ["next", "react", "react-dom"].forEach((pkg) => addVersion(dependencies, pkg));
    [
      "typescript",
      "@types/react",
      "@types/react-dom",
      "@types/node",
      "tailwindcss",
      "postcss",
      "@tailwindcss/postcss",
    ].forEach((pkg) => addVersion(devDependencies, pkg));
    const base = {
      name: "generated-site",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev --webpack",
        build: "next build",
        start: "next start",
      },
      dependencies,
      devDependencies,
    };
    return {
      content: `${JSON.stringify(base, null, 2)}\n`,
      missing,
    };
  };

  const removeBrokenUtilityBlocks = (content: string) => {
    if (!content.includes("@utility")) {
      return { content, removed: 0 };
    }

    const marker = "@utility";
    let updated = content;
    let removed = 0;
    let index = 0;

    while (index < updated.length) {
      const start = updated.indexOf(marker, index);
      if (start === -1) break;

      const lineEnd = updated.indexOf("\n", start);
      const head = updated.slice(start, lineEnd === -1 ? updated.length : lineEnd);
      if (!head.includes("slide-in-from-top-")) {
        index = start + marker.length;
        continue;
      }

      const braceIndex = updated.indexOf("{", start);
      if (braceIndex === -1) {
        index = start + marker.length;
        continue;
      }

      let depth = 1;
      let cursor = braceIndex + 1;
      while (cursor < updated.length) {
        const ch = updated[cursor];
        if (ch === "{") depth += 1;
        if (ch === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }

      if (depth === 0) {
        index = cursor + 1;
        continue;
      }

      // Missing closing brace: remove the broken utility block (best-effort).
      const nextUtility = updated.indexOf(marker, start + marker.length);
      const cutEnd = nextUtility === -1 ? updated.length : nextUtility;
      updated = `${updated.slice(0, start)}${updated.slice(cutEnd)}`;
      removed += 1;
      index = start;
    }

    return { content: updated, removed };
  };

  const needsClientDirective = (content: string): boolean => {
    if (!content) return false;
    const usesHooks =
      /from\s+["']react["']/.test(content) &&
      /\buse(State|Effect|Memo|Callback|Ref|LayoutEffect|Reducer)\b/.test(content);
    return usesHooks;
  };

  const hasUseClient = (content: string): boolean => /^\s*["']use client["'];/m.test(content);

  const hasMetadataExport = (content: string): boolean =>
    /\bexport\s+const\s+metadata\b/.test(content) || /\bgenerateMetadata\b/.test(content);

  const ensureUseClient = (file: { name: string; content: string }, reason: string) => {
    if (hasUseClient(file.content)) return;
    if (hasMetadataExport(file.content)) {
      warnings.push(`Cannot mark ${file.name} as client (${reason}) because it exports metadata.`);
      return;
    }
    file.content = `"use client";\n\n${file.content}`;
    fixesApplied.push(`Marked ${file.name} as client (${reason})`);
  };

  for (const f of nextFiles) {
    if (typeof f.content !== "string") continue;

    const isAppFile = f.name === "app/page.tsx" || f.name.startsWith("app/");

    if (isAppFile) {
      const hasLucideImport = /from\s+["']lucide-react["']/.test(f.content);
      const hasIconComponentProp = /\bicon\s*:\s*[A-Z][A-Za-z0-9_]*/.test(f.content);
      if (hasLucideImport && hasIconComponentProp) {
        ensureUseClient(f, "icon component props in app file");
      } else if (needsClientDirective(f.content)) {
        ensureUseClient(f, "react hooks in app file");
      }
    }

    if (f.content.includes("Instrument_Serif") && f.content.includes("weight")) {
      const before = f.content;

      let updated = before
        .replace(/weight:\s*\[\s*"400"\s*,\s*"600"\s*\]/g, 'weight: ["400"]')
        .replace(/weight:\s*\[\s*'400'\s*,\s*'600'\s*\]/g, "weight: ['400']");

      if (updated === before) {
        updated = updated.replace(
          /(Instrument_Serif\(\{[\s\S]*?weight:\s*)\[([^\]]*)\]/g,
          (match, prefix, arr) => {
            const parts = String(arr)
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);

            const filtered = parts.filter((p) => !/^(['"])600\1$/.test(p));
            if (filtered.length === parts.length) return match;
            const nextArr = `[${filtered.join(", ")}]`;
            return `${prefix}${nextArr}`;
          },
        );
      }

      if (updated !== before) {
        f.content = updated;
        fixesApplied.push(`Fixed Instrument_Serif invalid weight in ${f.name}`);
      }
    }

    if (f.name.endsWith(".css") && f.content.includes("@utility")) {
      const result = removeBrokenUtilityBlocks(f.content);
      if (result.removed > 0 && result.content !== f.content) {
        f.content = result.content;
        fixesApplied.push(
          `Removed ${result.removed} broken @utility block${result.removed > 1 ? "s" : ""} in ${f.name}`,
        );
      }
    }
  }

  const requiredPackages = new Set<string>(SHADCN_BASELINE_PACKAGES);
  const importedPackages = collectExternalPackageNames(nextFiles);
  importedPackages.forEach((pkg) => requiredPackages.add(pkg));

  const normalizePackageName = (name: string) => name.replace(/^\/+/, "");
  let packageFile = nextFiles.find((f) => normalizePackageName(f.name) === "package.json");
  if (!packageFile) {
    const base = buildBasePackageJson();
    if (base.missing.length > 0) {
      warnings.push(`Missing versions for base deps in package.json: ${base.missing.join(", ")}`);
    }
    packageFile = { name: "package.json", content: base.content };
    nextFiles.push(packageFile);
    fixesApplied.push("Added package.json scaffold");
  }

  if (packageFile?.content) {
    try {
      const result = ensureDependenciesInPackageJson({
        packageJsonContent: packageFile.content,
        requiredPackages,
        versionMap,
      });
      packageFile.content = result.content;
      if (result.added.length > 0) {
        fixesApplied.push(`Added missing dependencies: ${result.added.join(", ")}`);
      }
      if (result.missing.length > 0) {
        warnings.push(
          `Missing versions for dependencies: ${result.missing.slice(0, 10).join(", ")}`,
        );
      }
    } catch (error) {
      warnings.push("Failed to update package.json dependencies (invalid JSON)");
      invalidFiles.push("package.json");
      console.warn("[deploy] Failed to patch package.json:", error);
    }
  }

  return { files: nextFiles, fixesApplied, warnings, invalidFiles };
}
