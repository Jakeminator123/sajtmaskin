import type { AutoFixEntry } from "./pipeline";

/**
 * Static `import … from "pkg"` sources. Supports scoped npm packages (`@scope/name`);
 * excludes path aliases like `@/…` (no slash after scope segment).
 */
const IMPORT_SOURCE_RE =
  /from\s+["']((?:@[^/"']+\/[^"']+)|(?:[^"'./@][^"']*))["']/g;

/**
 * Packages the preview runtime already ships (Next.js, React, tailwind, etc.).
 * These should NOT appear in the dependency list.
 */
const BUILTIN_PACKAGES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "next",
  "next/font",
  "next/font/google",
  "next/image",
  "next/link",
  "next/navigation",
  "next/headers",
  "next/server",
  "next/dynamic",
  "tailwindcss",
  "postcss",
  "autoprefixer",
  "typescript",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
]);

/**
 * Third-party packages frequently used by LLM-generated code.
 * Maps npm package name to latest known compatible version range.
 *
 * Keep majors aligned with `project-scaffold.ts` PACKAGE_JSON baseline —
 * `dep-completer.test.ts` enforces this automatically for all overlapping keys.
 */
export const KNOWN_PACKAGES: Record<string, string> = {
  "recharts": "^2",
  "framer-motion": "^12",
  "motion": "^12",
  "@tanstack/react-table": "^8",
  "@tanstack/react-query": "^5",
  "date-fns": "^4",
  "zod": "^4",
  "zustand": "^5",
  "jotai": "^2",
  "react-hook-form": "^7",
  "@hookform/resolvers": "^5",
  "@reduxjs/toolkit": "^2",
  "react-redux": "^9",
  "lucide-react": "^1",
  "canvas-confetti": "^1.9",
  "radix-ui": "^1",
  "cmdk": "^1",
  "sonner": "^2",
  "vaul": "^1",
  "embla-carousel-react": "^8",
  "embla-carousel-autoplay": "^8",
  "react-day-picker": "^9",
  "input-otp": "^1",
  "react-resizable-panels": "^4",
  "next-themes": "^0.4",
  "nuqs": "^2",
  "swr": "^2",
  "axios": "^1",
  "lodash": "^4",
  "uuid": "^10",
  "nanoid": "^5",
  "sharp": "^0.33",
  "mapbox-gl": "^3",
  "react-map-gl": "^7",
  "three": "^0.176",
  "@react-three/fiber": "^9",
  "@react-three/drei": "^10",
  "@react-three/rapier": "^2",
  "gsap": "^3",
  "lottie-react": "^2",
  "react-icons": "^5",
  "react-hot-toast": "^2",
  "react-toastify": "^10",
  "react-spring": "^9",
  "react-use": "^17",
  "usehooks-ts": "^3",
  "@dnd-kit/core": "^6",
  "@dnd-kit/sortable": "^8",
  "react-beautiful-dnd": "^13",
  "prismjs": "^1",
  "highlight.js": "^11",
  "marked": "^15",
  "react-markdown": "^9",
  "remark-gfm": "^4",
  "rehype-highlight": "^7",
  "chart.js": "^4",
  "react-chartjs-2": "^5",
  "d3": "^7",
  "visx": "^3",
  "mathjs": "^13",
  "katex": "^0.16",
};

/**
 * Scoped package prefixes where any sub-package maps to the same version.
 * E.g. `@radix-ui/react-dialog`, `@radix-ui/react-hover-card` etc. all resolve to `^1`.
 */
const SCOPED_PACKAGE_PREFIXES: Record<string, string> = {
  "@radix-ui/react-": "^1",
};

export function resolveKnownVersion(pkg: string): string | undefined {
  const direct = KNOWN_PACKAGES[pkg];
  if (direct) return direct;
  for (const [prefix, version] of Object.entries(SCOPED_PACKAGE_PREFIXES)) {
    if (pkg.startsWith(prefix)) return version;
  }
  return undefined;
}

function normalizePackageName(source: string): string {
  if (source.startsWith("@")) {
    const parts = source.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : source;
  }
  return source.split("/")[0];
}

function isBuiltin(pkg: string): boolean {
  if (BUILTIN_PACKAGES.has(pkg)) return true;
  for (const b of BUILTIN_PACKAGES) {
    if (pkg.startsWith(`${b}/`)) return true;
  }
  return false;
}

/**
 * Scan code for third-party import sources and produce a dependency list.
 */
export function runDepCompleter(code: string): {
  dependencies: Record<string, string>;
  unknownPackages: string[];
  fixes: AutoFixEntry[];
  warnings: string[];
} {
  const dependencies: Record<string, string> = {};
  const unknownPackages: string[] = [];
  const seen = new Set<string>();

  IMPORT_SOURCE_RE.lastIndex = 0;
  for (const match of code.matchAll(IMPORT_SOURCE_RE)) {
    const raw = match[1];
    const pkg = normalizePackageName(raw);

    if (seen.has(pkg)) continue;
    seen.add(pkg);

    if (isBuiltin(pkg)) continue;

    if (pkg.startsWith("@/") || pkg.startsWith("~/") || pkg.startsWith(".")) continue;

    const knownVersion = resolveKnownVersion(pkg);
    if (knownVersion) {
      dependencies[pkg] = knownVersion;
    } else {
      unknownPackages.push(pkg);
    }
  }

  const warnings = unknownPackages.map(
    (pkg) => `Unknown third-party package "${pkg}" — may need manual version pinning`,
  );

  return { dependencies, unknownPackages, fixes: [], warnings };
}
