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
import { fixLucideImageMisuse } from "@/lib/gen/autofix/rules/lucide-image-fixer";
import { fixLucideLinkMisuse } from "@/lib/gen/autofix/rules/lucide-link-fixer";
import { fixUnavailableLucideIcons } from "@/lib/gen/autofix/rules/lucide-unavailable-icons-fixer";
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
const NONEXISTENT_TEXTURE_RE = /url\(["']?\/(grain|noise|texture|dots|pattern)\.(png|jpg|svg|webp)["']?\)/gi;
const UNAVAILABLE_IMPORT_RE = /^[ \t]*import\s+(?:type\s+)?(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s+["'](?:react-intersection-observer|framer-motion\/useInView|sora-font|geist|geist-font|inter-font|playfair-display|dm-sans|space-grotesk)["'];?\s*$/gm;
const USE_IN_VIEW_BARE_RE = /\buseInView\b/g;
const SHELL_PAGE_TECH_STRINGS = [
  "Route purpose:",
  "Plan för sidan",
  "Varför sidan är enkel",
  "Förberedd sida",
];

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

    const unavailableIconsResult = fixUnavailableLucideIcons(content);
    if (unavailableIconsResult.fixed) {
      content = unavailableIconsResult.code;
      fixes.push({
        fixer: "lucide-unavailable-icons-fixer",
        category: "mechanical",
        description: "Replaced unavailable lucide-react icons with safe alternatives",
        file: file.path,
      });
    }

    const contentBeforeTextureFix = content;
    content = content.replace(NONEXISTENT_TEXTURE_RE, 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")');
    if (content !== contentBeforeTextureFix) {
      fixes.push({
        fixer: "texture-file-fixer",
        category: "mechanical",
        description: "Replaced nonexistent texture file reference with inline SVG noise",
        file: file.path,
      });
    }

    const contentBeforeShellCruft = content;
    for (const phrase of SHELL_PAGE_TECH_STRINGS) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^.*[>"]\\s*${escaped}.*$`, "gm");
      content = content.replace(re, "");
    }
    if (content !== contentBeforeShellCruft) {
      fixes.push({
        fixer: "shell-page-tech-cruft-fixer",
        category: "mechanical",
        description: "Removed developer-facing text (Route purpose, Plan för sidan, etc.) from shell page",
        file: file.path,
      });
    }

    const contentBeforeUnavailableImport = content;
    content = content.replace(UNAVAILABLE_IMPORT_RE, "");
    if (content !== contentBeforeUnavailableImport) {
      fixes.push({
        fixer: "unavailable-import-fixer",
        category: "mechanical",
        description: "Removed import from unavailable package (react-intersection-observer / framer-motion/useInView)",
        file: file.path,
      });
    }

    if (USE_IN_VIEW_BARE_RE.test(content) && !content.includes("import") && !content.includes("useInView")) {
      /* no-op: if useInView was removed by import removal and is used bare, the repair autofix or
         the broader dep-completer will catch it in a next pass. For now mark as warning. */
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
