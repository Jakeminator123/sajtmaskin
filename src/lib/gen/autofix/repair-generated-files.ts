import type { CodeFile } from "@/lib/gen/parser";
import {
  buildProjectExportIndex,
  buildProjectModuleExportIndex,
  fixImportedDeclarationConflicts,
  fixLocalDefaultImportMismatches,
  fixLocalNamedImportDefaultMismatches,
  fixMissingLocalSymbolImports,
  fixMissingReactTypeImports,
  fixNextImageImport,
  fixNextOgImageResponseImport,
} from "@/lib/gen/autofix/common-import-fixer";
import { fixCnImportConflict } from "@/lib/gen/autofix/rules/metadata-import-fixer";
import { fixAsConstBooleanKeys } from "@/lib/gen/autofix/rules/as-const-boolean-keys";
import { fixFontImport } from "@/lib/gen/autofix/rules/font-import-fixer";
import { fixReactHookImports } from "@/lib/gen/autofix/react-hook-import-fixer";
import {
  fixLucideImageMisuse,
  fixLucideLinkMisuse,
} from "@/lib/gen/autofix/rules/lucide-misuse-fixer";
import { fixLayoutProviders } from "@/lib/gen/autofix/rules/layout-provider-fixer";
import type { FixEntry } from "./types";
import {
  fixMetadataClientConflict,
  fixIconComponentValueMisuse,
  ensureTier2PreviewBasePathInNextConfig,
} from "./pipeline";

const HTML_SCROLL_SMOOTH_RE = /(<html\b[^>]*?\bclassName=["'][^"']*)\bscroll-smooth\b([^"']*["'])/;
const CSS_SCROLL_SMOOTH_RE = /scroll-behavior:\s*smooth/g;
const NEXT_CONFIG_FILE_RE = /(^|\/)next\.config\.(ts|mts)$/i;

/**
 * @deprecated Use `FixEntry` from `./types`. Kept for backwards compat.
 */
export type RepairEntry = Omit<FixEntry, "category"> & { file: string };

/**
 * Run the canonical set of mechanical (deterministic) fixers on a parsed
 * `CodeFile[]` array.  This is a thin wrapper that applies the same fixer
 * set as `runAutoFixSinglePass` in pipeline.ts, adapted for the pre-parsed
 * file array used by finalize-preflight.ts and other callers.
 *
 * Returns a backwards-compatible `{ files, fixes }` shape so existing
 * call sites do not need changes.
 */
export function repairGeneratedFiles(files: CodeFile[]): {
  files: CodeFile[];
  fixes: FixEntry[];
} {
  const fixes: FixEntry[] = [];
  const exportIndex = buildProjectExportIndex(files);
  const moduleExportIndex = buildProjectModuleExportIndex(files);

  const repairedFiles = files.map((file) => {
    if (/\.css$/i.test(file.path)) {
      let content = file.content;
      const before = content;
      content = content.replace(CSS_SCROLL_SMOOTH_RE, "scroll-behavior: auto");
      if (content !== before) {
        fixes.push({
          fixer: "scroll-smooth-css-fixer",
          category: "mechanical",
          description: "Replaced scroll-behavior: smooth with scroll-behavior: auto in CSS for preview compatibility",
          file: file.path,
        });
      }
      return content === file.content ? file : { ...file, content };
    }

    if (!/\.(tsx?|jsx?)$/i.test(file.path)) {
      return file;
    }

    let content = file.content;

    if (NEXT_CONFIG_FILE_RE.test(file.path.replace(/\\/g, "/"))) {
      const tier2BasePathResult = ensureTier2PreviewBasePathInNextConfig(content, file.path);
      if (tier2BasePathResult.fixed) {
        content = tier2BasePathResult.code;
        fixes.push({
          fixer: "tier2-preview-basepath-next-config",
          category: "mechanical",
          description: "Injected conditional basePath from SAJTMASKIN_PREVIEW_BASE_PATH for preview-host URLs",
          file: file.path,
        });
      }

      const REQUIRED_REMOTE_HOSTS = [
        "images.unsplash.com",
        "plus.unsplash.com",
        "images.pexels.com",
        "*.blob.vercel-storage.com",
        "api.dicebear.com",
      ];
      const missingHosts = REQUIRED_REMOTE_HOSTS.filter((h) => !content.includes(h));
      if (missingHosts.length > 0 && !content.includes("remotePatterns")) {
        const patternsBlock = missingHosts
          .map((h) => `      { protocol: "https", hostname: "${h}" },`)
          .join("\n");
        const injected = content.replace(
          /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/,
          `$1\n  images: {\n    remotePatterns: [\n${patternsBlock}\n    ],\n  },`,
        );
        if (injected !== content) {
          content = injected;
          fixes.push({
            fixer: "next-config-remote-patterns",
            category: "mechanical",
            description: `Injected ${missingHosts.length} missing remote image patterns (${missingHosts.join(", ")})`,
            file: file.path,
          });
        }
      }

      return content === file.content ? file : { ...file, content };
    }

    const namedImportResult = fixLocalNamedImportDefaultMismatches(content, file.path, files, moduleExportIndex);
    if (namedImportResult.fixed) {
      content = namedImportResult.code;
      fixes.push({
        fixer: "local-named-import-default-fixer",
        category: "mechanical",
        description: `Rewired local named imports to default imports: ${namedImportResult.rewiredImports.join(", ")}`,
        file: file.path,
      });
    }

    const defaultImportResult = fixLocalDefaultImportMismatches(content, file.path, files, moduleExportIndex);
    if (defaultImportResult.fixed) {
      content = defaultImportResult.code;
      fixes.push({
        fixer: "local-default-import-fixer",
        category: "mechanical",
        description: `Rewired local default imports to named imports: ${defaultImportResult.rewiredImports.join(", ")}`,
        file: file.path,
      });
    }

    const conflictImportResult = fixImportedDeclarationConflicts(content);
    if (conflictImportResult.fixed) {
      content = conflictImportResult.code;
      fixes.push({
        fixer: "import-declaration-conflict-fixer",
        category: "mechanical",
        description: `Removed conflicting import bindings: ${conflictImportResult.removedBindings.join(", ")}`,
        file: file.path,
      });
    }

    const fontResult = fixFontImport(content, file.path);
    if (fontResult.fixed) {
      content = fontResult.code;
      fixes.push(
        ...fontResult.fixes.map((fix) => ({
          fixer: fix.fixer,
          category: "mechanical" as const,
          description: fix.description,
          file: fix.file ?? file.path,
        })),
      );
    }

    const linkResult = fixLucideLinkMisuse(content, file.path);
    if (linkResult.fixed) {
      content = linkResult.code;
      fixes.push({
        fixer: "lucide-link-fixer",
        category: "mechanical",
        description: "Replaced lucide-react Link with next/link",
        file: file.path,
      });
    }

    const cnConflictResult = fixCnImportConflict(content, file.path);
    if (cnConflictResult.fixed) {
      content = cnConflictResult.code;
      fixes.push({
        fixer: "cn-import-conflict-fixer",
        category: "mechanical",
        description: "Removed conflicting local cn import from @/lib/utils",
        file: file.path,
      });
    }

    const lucideImageResult = fixLucideImageMisuse(content, file.path);
    if (lucideImageResult.fixed) {
      content = lucideImageResult.code;
      fixes.push({
        fixer: "lucide-image-fixer",
        category: "mechanical",
        description: "Replaced lucide-react Image with next/image",
        file: file.path,
      });
    }

    const iconComponentResult = fixIconComponentValueMisuse(content, file.path);
    if (iconComponentResult.fixed) {
      content = iconComponentResult.code;
      fixes.push(...iconComponentResult.fixes);
    }

    const metadataConflictResult = fixMetadataClientConflict(content, file.path);
    if (metadataConflictResult.fixed) {
      content = metadataConflictResult.code;
      fixes.push(...metadataConflictResult.fixes);
    }

    const asConstKeysResult = fixAsConstBooleanKeys(content, file.path);
    if (asConstKeysResult.fixed) {
      content = asConstKeysResult.code;
      for (const fix of asConstKeysResult.fixes) {
        fixes.push({ ...fix, category: "mechanical" });
      }
    }

    const hookResult = fixReactHookImports(content);
    if (hookResult.fixed) {
      content = hookResult.code;
      fixes.push({
        fixer: "react-hook-import-fixer",
        category: "mechanical",
        description: `Added missing React hook imports: ${hookResult.addedHooks.join(", ")}`,
        file: file.path,
      });
    }

    const reactTypeResult = fixMissingReactTypeImports(content);
    if (reactTypeResult.fixed) {
      content = reactTypeResult.code;
      fixes.push({
        fixer: "react-type-import-fixer",
        category: "mechanical",
        description: `Added missing React type imports: ${reactTypeResult.addedTypes.join(", ")}`,
        file: file.path,
      });
    }

    const nextImageResult = fixNextImageImport(content);
    if (nextImageResult.fixed) {
      content = nextImageResult.code;
      fixes.push({
        fixer: "next-image-import-fixer",
        category: "mechanical",
        description: 'Added missing `import Image from "next/image"`',
        file: file.path,
      });
    }

    const nextOgResult = fixNextOgImageResponseImport(content);
    if (nextOgResult.fixed) {
      content = nextOgResult.code;
      fixes.push({
        fixer: "next-og-image-response-import-fixer",
        category: "mechanical",
        description: 'Added missing `import { ImageResponse } from "next/og"`',
        file: file.path,
      });
    }

    if (HTML_SCROLL_SMOOTH_RE.test(content)) {
      const before = content;
      content = content.replace(
        HTML_SCROLL_SMOOTH_RE,
        (_, pre: string, post: string) => {
          const cleaned = `${pre}${post}`.replace(/\s{2,}/g, " ").replace(/"\s+"/, '"');
          return cleaned.replace(/<html\b/, '<html data-scroll-behavior="smooth"');
        },
      );
      if (content !== before) {
        fixes.push({
          fixer: "scroll-smooth-html-fixer",
          category: "mechanical",
          description: 'Replaced scroll-smooth className with data-scroll-behavior="smooth" on <html> for Next.js 16 compatibility',
          file: file.path,
        });
      }
    }

    const symbolResult = fixMissingLocalSymbolImports(content, file.path, exportIndex);
    if (symbolResult.fixed) {
      content = symbolResult.code;
      fixes.push({
        fixer: "local-symbol-import-fixer",
        category: "mechanical",
        description: `Added missing local symbol imports: ${symbolResult.addedSymbols.join(", ")}`,
        file: file.path,
      });
    }

    return content === file.content ? file : { ...file, content };
  });

  const providerResult = fixLayoutProviders(repairedFiles);
  if (providerResult.fixes.length > 0) {
    fixes.push(...providerResult.fixes);
    return { files: providerResult.files, fixes };
  }

  return { files: repairedFiles, fixes };
}
