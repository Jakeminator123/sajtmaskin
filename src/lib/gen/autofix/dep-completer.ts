import type { AutoFixEntry } from "./pipeline";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";

const PACKAGE_SOURCE_PATTERN = String.raw`((?:@[^/"']+\/[^"']+)|(?:[^"'./@][^"']*))`;

/**
 * Static dependency sources in generated code. Supports:
 * - `import x from "pkg"`
 * - `import "pkg/styles.css"`
 * - `require("pkg")`
 * - `import("pkg")`
 *
 * Scoped npm packages are supported (`@scope/name`); path aliases like `@/…`
 * are excluded because the scoped pattern requires a non-slash scope segment.
 */
const IMPORT_SOURCE_RE = new RegExp(
  [
    String.raw`from\s+["']${PACKAGE_SOURCE_PATTERN}["']`,
    String.raw`import\s+["']${PACKAGE_SOURCE_PATTERN}["']`,
    String.raw`require\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
    String.raw`import\s*\(\s*["']${PACKAGE_SOURCE_PATTERN}["']\s*\)`,
  ].join("|"),
  "g",
);

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
 *
 * NOTE: Sedan vi infört `dep-version-validator.ts` som kör mot live
 * npm-registret är denna tabell BARA en snabb fast-path för vanliga paket.
 * Om en post är stale (eller en major aldrig publicerats, t.ex. det historiska
 * `lucide-react: "^1"`-felet) så fångar validatorn det och bumpar till
 * `^latest`. Tabellen kan därmed vara mer "good enough" än "perfekt aktuell".
 */
export const KNOWN_PACKAGES: Record<string, string> = {
  "recharts": "^2",
  "framer-motion": "^12",
  "motion": "^12",
  "@tanstack/react-table": "^8",
  "@tanstack/react-query": "^5",
  "@tanstack/react-virtual": "^3",
  "date-fns": "^4",
  "zod": "^4",
  "zustand": "^5",
  "jotai": "^2",
  "react-hook-form": "^7",
  "@hookform/resolvers": "^5",
  "@reduxjs/toolkit": "^2",
  "react-redux": "^9",
  "lucide-react": "0.469.0",
  "canvas-confetti": "^1.9",
  "react-error-boundary": "^6",
  "react-intersection-observer": "^10",
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
  "@vercel/analytics": "^1.6.1",
  "nuqs": "^2",
  "swr": "^2",
  "axios": "^1",
  "lodash": "^4",
  "uuid": "^10",
  "nanoid": "^5",
  "sharp": "^0.33",
  "mapbox-gl": "^3",
  "react-map-gl": "^7",
  "three": "0.185.1",
  "@react-three/fiber": "9.6.0",
  "@react-three/drei": "10.7.7",
  "@react-three/rapier": "2.2.0",
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
  "next-mdx-remote": "^6",
  "remark-gfm": "^4",
  "rehype-highlight": "^7",
  "chart.js": "^4",
  "react-chartjs-2": "^5",
  "@visactor/react-vchart": "^2",
  "d3": "^7",
  "visx": "^3",
  "mathjs": "^13",
  "katex": "^0.16",
  "stripe": "^20",
  "@stripe/stripe-js": "^8",
  "@clerk/nextjs": "^6",
  "resend": "^6",
  // Dossier wave 1 (legacy import 2026-07-08): ably-realtime,
  // fal-image-generation, ai-tool-calling-chat. `ai` + `@ai-sdk/*` are pinned
  // to the same generation so a generated site always gets ONE consistent
  // AI SDK major (ai-tool-calling-chat REVIEW requirement).
  "ably": "^2",
  "ai": "^7",
  "@ai-sdk/openai": "^4",
  "@ai-sdk/fal": "^3",
  "@ai-sdk/react": "^4",
  // Dossier wave 2 (legacy import 2026-07-08, capability `database`):
  // postgres-drizzle (default), neon-postgres, mongodb-atlas. Majors verified
  // against the npm registry 2026-07-08 (`npm view <pkg> version`).
  // The final legacy wave (`rag-chat`, capability `rag-chat`) introduces no
  // new packages: its stack (ai + @ai-sdk/openai + @ai-sdk/react above,
  // drizzle-orm/pg/@types/pg/server-only below) is fully covered here —
  // locked by the rag-chat case in `dep-completer.test.ts`.
  "drizzle-orm": "^0.45",
  "drizzle-kit": "^0.31",
  "pg": "^8",
  "@types/pg": "^8",
  "server-only": "0.0.1",
  "@neondatabase/serverless": "^1",
  "mongodb": "^7",
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

function normalizeCapabilityList(requestedCapabilities: string[] | null | undefined): string[] {
  if (!Array.isArray(requestedCapabilities) || requestedCapabilities.length === 0) return [];
  return Array.from(
    new Set(
      requestedCapabilities
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function parseManifestDependencySpec(raw: string): { pkg: string; version: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { pkg: "", version: null };
  if (trimmed.startsWith("@")) {
    const match = trimmed.match(/^(@[^/\s]+\/[^@\s]+)(?:@(.+))?$/);
    return { pkg: match?.[1] ?? trimmed, version: match?.[2] ?? null };
  }
  const match = trimmed.match(/^([^@\s]+)(?:@(.+))?$/);
  return { pkg: match?.[1] ?? trimmed, version: match?.[2] ?? null };
}

export function resolveCapabilityDependencies(
  requestedCapabilities: string[] | null | undefined,
): Record<string, string> {
  const deps: Record<string, string> = {};
  const capabilities = normalizeCapabilityList(requestedCapabilities);
  if (capabilities.length === 0) return deps;

  const selection = selectDossiersForRequest({ requestedCapabilities: capabilities });
  for (const selected of selection.selected) {
    for (const rawPkg of selected.entry.dependencies ?? []) {
      const { pkg, version: manifestVersion } = parseManifestDependencySpec(rawPkg);
      if (!pkg) continue;
      if (isBuiltin(pkg)) continue;
      const version = resolveKnownVersion(pkg);
      if (version) {
        deps[pkg] = version;
      } else {
        // Manifest dependencies are curated runtime contract. If the central
        // allowlist lacks a version, use the manifest range when present;
        // otherwise let dep-version-validator resolve `latest` to ^<version>.
        deps[pkg] = manifestVersion?.trim() || "latest";
      }
    }
  }
  return deps;
}

function toDependencyRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ),
  ) as Record<string, string>;
}

export function mergeMissingDependenciesIntoPackageJson(
  packageJson: Record<string, unknown>,
  missingDependencies: Record<string, string>,
): { packageJson: Record<string, unknown>; mergedCount: number } {
  const nextPackageJson = { ...packageJson };
  const dependencies = toDependencyRecord(nextPackageJson.dependencies);
  let mergedCount = 0;
  for (const [name, version] of Object.entries(missingDependencies)) {
    if (dependencies[name]) continue;
    dependencies[name] = version;
    mergedCount += 1;
  }
  if (mergedCount > 0) {
    nextPackageJson.dependencies = dependencies;
  }
  return { packageJson: nextPackageJson, mergedCount };
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
    const raw = match.slice(1).find((group): group is string => typeof group === "string");
    if (!raw) continue;
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
