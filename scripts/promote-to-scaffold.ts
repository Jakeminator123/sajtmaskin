import fs from "node:fs";
import path from "node:path";
import { getScaffoldById } from "../src/lib/gen/scaffolds/registry";
import type { ScaffoldFile, ScaffoldManifest } from "../src/lib/gen/scaffolds/types";
import type { TemplateLibraryEntry } from "../src/lib/gen/template-library/types";
import { readJson, slugify } from "./template-library-discovery";

const WORKSPACE_ROOT = process.cwd();
const DOSSIER_ROOT = path.resolve(
  WORKSPACE_ROOT,
  "research",
  "external-templates",
  "reference-library",
  "dossiers",
);
const TYPES_PATH = path.resolve(WORKSPACE_ROOT, "src", "lib", "gen", "scaffolds", "types.ts");
const REGISTRY_PATH = path.resolve(WORKSPACE_ROOT, "src", "lib", "gen", "scaffolds", "registry.ts");

type BuildIntent = "website" | "app" | "template";

interface Options {
  dossier: string;
  scaffoldId: string;
  scaffoldFamily: string;
  label: string | null;
  baseScaffoldId: string | null;
  dryRun: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const positional = args.find((arg) => !arg.startsWith("--"));
  if (!positional) {
    throw new Error(
      "Usage: npx tsx scripts/promote-to-scaffold.ts <dossier-id|manifest-path> [--id=new-id] [--family=new-family] [--base=existing-scaffold] [--label=\"Label\"] [--dry-run]",
    );
  }

  const explicitId = args.find((arg) => arg.startsWith("--id="))?.slice("--id=".length);
  const explicitFamily = args.find((arg) => arg.startsWith("--family="))?.slice("--family=".length);
  const explicitBase = args.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) ?? null;
  const explicitLabel = args.find((arg) => arg.startsWith("--label="))?.slice("--label=".length) ?? null;

  const scaffoldId = slugify(explicitId ?? path.basename(positional, path.extname(positional)));
  return {
    dossier: positional,
    scaffoldId,
    scaffoldFamily: slugify(explicitFamily ?? scaffoldId),
    label: explicitLabel,
    baseScaffoldId: explicitBase ? slugify(explicitBase) : null,
    dryRun: args.includes("--dry-run"),
  };
}

function resolveManifestPath(input: string): string {
  const directPath = path.resolve(input);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) return directPath;

  const dossierPath = path.join(DOSSIER_ROOT, input, "manifest.json");
  if (fs.existsSync(dossierPath)) return dossierPath;

  throw new Error(`Could not resolve dossier manifest from "${input}"`);
}

function chooseBaseScaffold(entry: TemplateLibraryEntry, explicitBase: string | null): ScaffoldManifest {
  if (explicitBase) {
    const scaffold = getScaffoldById(explicitBase);
    if (!scaffold) throw new Error(`Base scaffold "${explicitBase}" not found in registry.`);
    return scaffold;
  }

  for (const family of entry.recommendedScaffoldFamilies) {
    const scaffold = getScaffoldById(family);
    if (scaffold) return scaffold;
  }

  const fallback = getScaffoldById("base-nextjs");
  if (!fallback) throw new Error("base-nextjs scaffold is missing from the registry.");
  return fallback;
}

function normalizePromotedPath(filePath: string): string | null {
  let normalized = filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (normalized.startsWith("src/")) normalized = normalized.slice(4);
  if (normalized === "app/global.css") normalized = "app/globals.css";
  if (normalized === "global.css") normalized = "app/globals.css";

  if (!/\.(tsx?|css)$/.test(normalized)) return null;
  if (normalized === "package.json") return null;
  if (!(
    normalized.startsWith("app/") ||
    normalized.startsWith("components/") ||
    normalized.startsWith("lib/") ||
    normalized.startsWith("hooks/")
  )) {
    return null;
  }

  return normalized;
}

function excerptLooksUnsafe(excerpt: string): boolean {
  return (
    !excerpt.trim() ||
    excerpt.includes("// ... truncated") ||
    excerpt.includes("```") ||
    excerpt.startsWith("# ")
  );
}

function extractPromotedFiles(entry: TemplateLibraryEntry): ScaffoldFile[] {
  const files = new Map<string, ScaffoldFile>();

  for (const selected of entry.selectedFiles) {
    const targetPath = normalizePromotedPath(selected.path);
    if (!targetPath) continue;
    if (excerptLooksUnsafe(selected.excerpt)) continue;

    files.set(targetPath, {
      path: targetPath,
      content: selected.excerpt.replace(/\r\n/g, "\n").trim(),
    });
  }

  return Array.from(files.values());
}

function mergeFiles(baseScaffold: ScaffoldManifest, promotedFiles: ScaffoldFile[]): ScaffoldFile[] {
  const merged = new Map<string, ScaffoldFile>(baseScaffold.files.map((file) => [file.path, file]));
  for (const file of promotedFiles) {
    merged.set(file.path, file);
  }
  return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function deriveBuildIntents(entry: TemplateLibraryEntry, baseScaffold: ScaffoldManifest): BuildIntent[] {
  const intents = new Set<BuildIntent>(baseScaffold.buildIntents);
  if (
    entry.signals.dashboard ||
    entry.signals.auth ||
    entry.signals.ai ||
    entry.categorySlug === "admin-dashboard" ||
    entry.categorySlug === "backend"
  ) {
    intents.add("app");
  }
  if (!intents.has("website") && !intents.has("template") && !intents.has("app")) {
    intents.add("website");
  }
  return Array.from(intents);
}

function humanizeLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveTags(entry: TemplateLibraryEntry, baseScaffold: ScaffoldManifest): string[] {
  const rawTags = [
    ...baseScaffold.tags,
    entry.categorySlug,
    ...entry.recommendedScaffoldFamilies,
    ...entry.stackTags.map((tag) => slugify(tag)),
    ...entry.strengths.map((tag) => slugify(tag)),
  ];

  return Array.from(new Set(rawTags.filter(Boolean))).slice(0, 16);
}

function derivePromptHints(entry: TemplateLibraryEntry, baseScaffold: ScaffoldManifest): string[] {
  const hints = [
    `Promoted from external dossier "${entry.title}" (${entry.categoryName}).`,
    `Preserve the strengths signaled by research: ${entry.strengths.slice(0, 4).join(", ") || "verified Next.js structure"}.`,
    `Use the promoted files as a stronger starting point than the base scaffold "${baseScaffold.id}", but adapt copy, sections, and data to the user's request.`,
  ];

  if (entry.weaknesses.length > 0) {
    hints.push(`Watch for inherited reference limitations: ${entry.weaknesses.slice(0, 2).join(", ")}.`);
  }

  return hints;
}

function toCamelCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part, index) => {
      const normalized = part.replace(/[^a-zA-Z0-9]/g, "");
      if (!normalized) return "";
      if (index === 0) return normalized.charAt(0).toLowerCase() + normalized.slice(1);
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function serializeManifest(variableName: string, manifest: ScaffoldManifest): string {
  const fileEntries = manifest.files
    .map((file) => `    {\n      path: ${JSON.stringify(file.path)},\n      content: ${JSON.stringify(file.content)},\n    },`)
    .join("\n");

  return [
    'import type { ScaffoldManifest } from "../types";',
    "",
    `export const ${variableName}: ScaffoldManifest = {`,
    `  id: ${JSON.stringify(manifest.id)},`,
    `  family: ${JSON.stringify(manifest.family as string)},`,
    `  label: ${JSON.stringify(manifest.label)},`,
    `  description: ${JSON.stringify(manifest.description)},`,
    `  buildIntents: ${JSON.stringify(manifest.buildIntents)},`,
    `  tags: ${JSON.stringify(manifest.tags)},`,
    `  promptHints: ${JSON.stringify(manifest.promptHints)},`,
    "  files: [",
    fileEntries,
    "  ],",
    "};",
    "",
  ].join("\n");
}

function ensureFamilyUnionEntry(typesSource: string, family: string): string {
  if (typesSource.includes(`| "${family}"`)) return typesSource;
  return typesSource.replace(
    /export type ScaffoldFamily =\n([\s\S]*?);/,
    (match) => match.replace(/;$/, `\n  | "${family}";`),
  );
}

function ensureRegistryEntry(registrySource: string, scaffoldId: string, variableName: string): string {
  const importLine = `import { ${variableName} } from "./${scaffoldId}/manifest";`;
  let next = registrySource;

  if (!next.includes(importLine)) {
    const marker = 'import { getScaffoldResearchOverrides } from "./scaffold-research";';
    next = next.replace(marker, `${importLine}\n${marker}`);
  }

  if (!next.includes(`${variableName},`)) {
    next = next.replace(
      /const BASE_SCAFFOLDS: ScaffoldManifest\[\] = \[\n([\s\S]*?)\n\];/,
      (_match, block) => `const BASE_SCAFFOLDS: ScaffoldManifest[] = [\n${block}\n  ${variableName},\n];`,
    );
  }

  return next;
}

function buildPromotedManifest(options: Options): {
  manifestPath: string;
  manifestSource: string;
  typesSource: string;
  registrySource: string;
  scaffold: ScaffoldManifest;
  baseScaffoldId: string;
} {
  const manifestPath = resolveManifestPath(options.dossier);
  const entry = readJson<TemplateLibraryEntry>(manifestPath);
  const baseScaffold = chooseBaseScaffold(entry, options.baseScaffoldId);
  const promotedFiles = extractPromotedFiles(entry);
  const mergedFiles = mergeFiles(baseScaffold, promotedFiles);

  const scaffold: ScaffoldManifest = {
    id: options.scaffoldId,
    family: options.scaffoldFamily as ScaffoldManifest["family"],
    label: options.label?.trim() || humanizeLabel(options.scaffoldId),
    description:
      entry.description.trim() ||
      `${entry.title} promoted from the external reference library into a runtime scaffold.`,
    buildIntents: deriveBuildIntents(entry, baseScaffold),
    tags: deriveTags(entry, baseScaffold),
    promptHints: derivePromptHints(entry, baseScaffold),
    files: mergedFiles,
  };

  const variableName = `${toCamelCase(options.scaffoldId)}Manifest`;
  const targetDir = path.resolve(WORKSPACE_ROOT, "src", "lib", "gen", "scaffolds", options.scaffoldId);
  const targetManifestPath = path.join(targetDir, "manifest.ts");
  const manifestSource = serializeManifest(variableName, scaffold);

  const typesSource = ensureFamilyUnionEntry(fs.readFileSync(TYPES_PATH, "utf-8"), options.scaffoldFamily);
  const registrySource = ensureRegistryEntry(
    fs.readFileSync(REGISTRY_PATH, "utf-8"),
    options.scaffoldId,
    variableName,
  );

  return {
    manifestPath: targetManifestPath,
    manifestSource,
    typesSource,
    registrySource,
    scaffold,
    baseScaffoldId: baseScaffold.id,
  };
}

function main(): void {
  const options = parseArgs();
  const result = buildPromotedManifest(options);

  if (options.dryRun) {
    console.log(`[promote-to-scaffold] Dry run for ${result.scaffold.id}`);
    console.log(`[promote-to-scaffold] Base scaffold: ${result.baseScaffoldId}`);
    console.log(`[promote-to-scaffold] Files: ${result.scaffold.files.length}`);
    console.log(`[promote-to-scaffold] Target manifest: ${result.manifestPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(result.manifestPath), { recursive: true });
  fs.writeFileSync(result.manifestPath, result.manifestSource, "utf-8");
  fs.writeFileSync(TYPES_PATH, result.typesSource, "utf-8");
  fs.writeFileSync(REGISTRY_PATH, result.registrySource, "utf-8");

  console.log(`[promote-to-scaffold] Promoted ${result.scaffold.id} from ${options.dossier}`);
  console.log(`[promote-to-scaffold] Base scaffold: ${result.baseScaffoldId}`);
  console.log(`[promote-to-scaffold] Wrote ${result.manifestPath}`);
  console.log("[promote-to-scaffold] Updated scaffold types and registry.");
}

main();
