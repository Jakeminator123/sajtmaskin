/**
 * Auto-curate dossier drafts using an LLM.
 *
 * For each dossier in `data/dossiers/<id>/` with `_status: "draft"`:
 *   1. Reads manifest.json + all files under components/ + .env.example
 *   2. Asks the LLM to act as a curator: produce a real summary,
 *      identify which files are "auth-essential" vs "template-fluff",
 *      list missing files that should exist, and write a complete
 *      instructions.md (When to use / How to integrate / UX rules /
 *      Avoid / Verification).
 *   3. Applies the result: rewrites manifest.json, writes instructions.md,
 *      moves fluff files to `_removed/<id>/` (safety backup), creates new
 *      files if the LLM provided them, sets `_status: "active"`.
 *
 * Flags:
 *   --dry-run         Print what would change, write nothing.
 *   --only=<id>       Curate only this single dossier id.
 *   --limit=<N>       Curate at most N drafts (default: all).
 *   --force           Re-curate dossiers already marked active.
 *   --model=<id>      Override LLM (default: gpt-5.4).
 *
 * Usage:
 *   npx tsx scripts/dossiers/auto-curate.ts --dry-run --only=auth-clerk-authentication-starter
 *   npx tsx scripts/dossiers/auto-curate.ts --limit=3
 *   npx tsx scripts/dossiers/auto-curate.ts                  # all drafts
 *
 * Requires OPENAI_API_KEY (loaded from .env.local via dotenv).
 *
 * After running: rebuild index + embeddings:
 *   npm run dossiers:index && npm run dossiers:embeddings
 */

import "dotenv/config";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = process.cwd();
const DOSSIERS_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers");
const DEFAULT_MODEL = "gpt-5.4";
const MAX_FILE_BYTES = 30_000; // skip files larger than this when building context
const MAX_TOTAL_FILE_BYTES = 80_000; // hard cap on combined source code per dossier

// File extensions we treat as readable source for the LLM
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".html",
  ".env",
  ".example",
]);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  only: string | null;
  limit: number | null;
  force: boolean;
  model: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    only: null,
    limit: null,
    force: false,
    model: DEFAULT_MODEL,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length);
    else if (arg.startsWith("--limit=")) args.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function listDossierIds(): string[] {
  const entries = readdirSync(DOSSIERS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

function walkSourceFiles(rootDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_removed" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = entry.name.includes(".")
          ? entry.name.slice(entry.name.lastIndexOf("."))
          : "";
        if (TEXT_EXTENSIONS.has(ext.toLowerCase())) {
          out.push(full);
        }
      }
    }
  }
  return out.sort();
}

function readTruncated(path: string): { contents: string; truncated: boolean } {
  const stat = statSync(path);
  if (stat.size > MAX_FILE_BYTES) {
    const buf = readFileSync(path, "utf-8");
    return {
      contents: buf.slice(0, MAX_FILE_BYTES) + "\n\n... [truncated]\n",
      truncated: true,
    };
  }
  return { contents: readFileSync(path, "utf-8"), truncated: false };
}

// ---------------------------------------------------------------------------
// Manifest types (loose — we preserve unknown fields)
// ---------------------------------------------------------------------------

interface ManifestProvider {
  name: string;
  url?: string;
}

interface ManifestEnvVar {
  key: string;
  required?: boolean;
  purpose?: string;
}

interface ManifestFileEntry {
  path: string;
  role?: string;
  kind?: string;
}

interface DossierManifest {
  $schema?: string;
  id: string;
  kind: "integration" | "ui-section";
  category: string;
  label: string;
  description?: string;
  summary?: string;
  providers?: ManifestProvider[];
  envVars?: ManifestEnvVar[];
  dependencies?: string[];
  files?: ManifestFileEntry[];
  scaffoldFit?: { primary?: string[]; compatible?: string[] };
  complexity?: "simple" | "medium" | "advanced";
  qualityScore?: number;
  sourceTemplateUrl?: string;
  sourceRepoUrl?: string;
  lastVerified?: string;
  tags?: string[];
  _status?: "draft" | "active";
  _source?: string;
  _extractedAt?: string;
  _extractedFromCache?: boolean;
  _envExampleCopied?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// LLM response schema
// ---------------------------------------------------------------------------

const FileDecisionSchema = z.object({
  path: z.string().describe("relative path inside the dossier folder, e.g. 'components/app/layout.tsx'"),
  decision: z.enum(["keep", "remove"]).describe("'keep' if essential to the integration, 'remove' if template-specific fluff"),
  role: z
    .enum(["server", "client", "shared"])
    .nullable()
    .describe("required when decision='keep', else null"),
  kind: z
    .string()
    .nullable()
    .describe("required when decision='keep' (e.g. 'config', 'middleware', 'api-route', 'component'), else null"),
  reason: z.string().describe("one short sentence explaining the decision"),
});

const FileToCreateSchema = z.object({
  path: z.string().describe("relative path, e.g. 'components/middleware.ts'"),
  contents: z.string().describe("full file contents — generic, no template-specific imports"),
  role: z.enum(["server", "client", "shared"]),
  kind: z.string(),
  reason: z.string().describe("why this file should exist"),
});

const CurationResultSchema = z.object({
  summary: z
    .string()
    .min(80)
    .max(800)
    .describe(
      "1-3 sentences: what this dossier provides + when the LLM should use it. Concrete, no marketing fluff.",
    ),
  providerName: z
    .string()
    .describe("Real provider name (e.g. 'Clerk', 'Stripe', 'Sanity'). Never 'TBD'."),
  fileDecisions: z.array(FileDecisionSchema).describe("Decision for each existing file under components/"),
  filesToCreate: z
    .array(FileToCreateSchema)
    .describe(
      "Files that SHOULD exist for this integration but are missing (e.g. middleware.ts for Clerk, webhook handler for Stripe). Empty array if nothing missing.",
    ),
  instructionsMarkdown: z
    .string()
    .min(400)
    .describe(
      "Full instructions.md content following the template: # When to use / # How to integrate / # UX rules / # Avoid / # Verification.",
    ),
  tags: z
    .array(z.string())
    .min(3)
    .max(10)
    .describe("3-10 lowercase tags for search/embedding (provider name, key concepts)."),
  qualityScore: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100. Higher = more polished, well-known, production-ready integration."),
  complexity: z.enum(["simple", "medium", "advanced"]),
  recommendedScaffoldFit: z
    .object({
      primary: z.array(z.string()).describe("scaffolds where this dossier is core (e.g. for auth: 'auth-pages', 'app-shell', 'dashboard')"),
      compatible: z.array(z.string()).describe("scaffolds where this dossier optionally enhances the build"),
    })
    .describe("Which of the 10 scaffolds this dossier fits. Available scaffolds: landing-page, saas-landing, ecommerce, blog, content-site, portfolio, app-shell, dashboard, auth-pages, base-nextjs."),
});

type CurationResult = z.infer<typeof CurationResultSchema>;

// ---------------------------------------------------------------------------
// Build LLM input
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are a curator for "Sajtmaskin", an AI website builder. Your job is to turn a draft "dossier" (a modular building block — like a Stripe integration or a pricing-table UI section) into a clean, production-ready dossier that another LLM will read at runtime to know HOW to integrate this capability into a user's site.

A good dossier:
- Has a CONCRETE summary (when to use, what it provides) — never "Draft generated from..."
- Contains ONLY files that are essential to the integration. Template-specific demo UI (custom branded landing pages, "code switcher" components, theme files for syntax highlighters, etc.) should be REMOVED.
- Has clear instructions.md sections: When to use / How to integrate / UX rules / Avoid / Verification — with code snippets the runtime LLM can copy.
- Lists missing essential files (e.g. middleware.ts for an auth dossier, webhook handler for Stripe). When listing files to create, write GENERIC versions — no template-specific imports like 'templateMetadata', no template-specific colors, no "demo" comments.

You will receive: the manifest, the env vars, and all source files. Produce a structured curation result.

Be concise. Be technical. The runtime LLM is GPT-5.4-class — it knows how to write React, you only need to tell it the integration-specific patterns and pitfalls.`;
}

function buildUserPrompt(args: {
  dossierId: string;
  manifest: DossierManifest;
  envExample: string | null;
  files: { path: string; contents: string; truncated: boolean }[];
}): string {
  const lines: string[] = [];
  lines.push(`# Dossier to curate: ${args.dossierId}`);
  lines.push("");
  lines.push("## Current manifest (will be partially overwritten):");
  lines.push("```json");
  lines.push(JSON.stringify(args.manifest, null, 2));
  lines.push("```");
  lines.push("");

  if (args.envExample) {
    lines.push("## .env.example:");
    lines.push("```");
    lines.push(args.envExample);
    lines.push("```");
    lines.push("");
  }

  lines.push(`## Source files (${args.files.length}):`);
  lines.push("");
  for (const f of args.files) {
    lines.push(`### ${f.path}${f.truncated ? "  [truncated]" : ""}`);
    lines.push("```");
    lines.push(f.contents);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Task");
  lines.push("Produce the curation result. Remember:");
  lines.push("- For EACH source file above, output a fileDecision (keep or remove).");
  lines.push("- If essential files are missing for this integration, list them in filesToCreate with full contents.");
  lines.push("- summary must say WHEN to use this dossier and WHAT it provides.");
  lines.push("- providerName must be the real provider (extract from manifest.providers[0].url, sourceRepoUrl, or filenames).");
  lines.push("- instructionsMarkdown must include code snippets for the most important integration points.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Apply curation result
// ---------------------------------------------------------------------------

function applyCuration(args: {
  dossierDir: string;
  manifest: DossierManifest;
  result: CurationResult;
  dryRun: boolean;
}): { changes: string[] } {
  const { dossierDir, manifest, result, dryRun } = args;
  const changes: string[] = [];

  // 1. Move "remove" files to _removed/ as backup
  const removedDir = join(dossierDir, "_removed");
  for (const decision of result.fileDecisions) {
    if (decision.decision !== "remove") continue;
    const sourcePath = resolve(dossierDir, decision.path);
    if (!existsSync(sourcePath)) {
      changes.push(`SKIP remove (not found): ${decision.path}`);
      continue;
    }
    const targetPath = join(removedDir, decision.path);
    changes.push(`REMOVE ${decision.path} → _removed/${decision.path}  (${decision.reason})`);
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      renameSync(sourcePath, targetPath);
    }
  }

  // 2. Create new files
  for (const file of result.filesToCreate) {
    const targetPath = resolve(dossierDir, file.path);
    const exists = existsSync(targetPath);
    changes.push(
      `${exists ? "OVERWRITE" : "CREATE"} ${file.path}  (${file.reason})`,
    );
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, file.contents.trimEnd() + "\n", "utf-8");
    }
  }

  // 3. Build new files[] list (kept + created), preserving role/kind
  const keptFiles: ManifestFileEntry[] = result.fileDecisions
    .filter((d) => d.decision === "keep")
    .map((d) => ({
      path: d.path,
      role: d.role ?? inferRole(d.path),
      kind: d.kind ?? "component",
    }));
  const createdFiles: ManifestFileEntry[] = result.filesToCreate.map((f) => ({
    path: f.path,
    role: f.role,
    kind: f.kind,
  }));
  const newFiles = [...keptFiles, ...createdFiles];

  // 4. Write updated manifest
  const updatedManifest: DossierManifest = {
    ...manifest,
    summary: result.summary,
    providers: [
      {
        name: result.providerName,
        url: manifest.providers?.[0]?.url ?? manifest.sourceRepoUrl ?? manifest.sourceTemplateUrl,
      },
    ],
    files: newFiles,
    tags: result.tags,
    qualityScore: result.qualityScore,
    complexity: result.complexity,
    scaffoldFit: result.recommendedScaffoldFit,
    _status: "active",
    _curatedAt: new Date().toISOString(),
    _curatedBy: "auto-curate.ts",
  };
  // Drop now-irrelevant draft markers
  delete updatedManifest._extractedAt;
  delete updatedManifest._extractedFromCache;
  delete updatedManifest._envExampleCopied;

  changes.push(`UPDATE manifest.json (status → active, summary, providers, files, tags, scaffoldFit)`);
  if (!dryRun) {
    writeFileSync(
      join(dossierDir, "manifest.json"),
      JSON.stringify(updatedManifest, null, 2) + "\n",
      "utf-8",
    );
  }

  // 5. Write instructions.md
  changes.push(`UPDATE instructions.md (${result.instructionsMarkdown.length} chars)`);
  if (!dryRun) {
    writeFileSync(
      join(dossierDir, "instructions.md"),
      result.instructionsMarkdown.trimEnd() + "\n",
      "utf-8",
    );
  }

  return { changes };
}

function inferRole(path: string): "server" | "client" | "shared" {
  if (path.includes("/api/") || path.endsWith("middleware.ts") || path.endsWith("/route.ts")) {
    return "server";
  }
  if (path.endsWith("layout.tsx") || path.endsWith(".ts")) return "shared";
  return "client";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function curateOne(args: {
  dossierId: string;
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  dryRun: boolean;
  force: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const { dossierId, model, dryRun, force } = args;
  const dossierDir = join(DOSSIERS_ROOT, dossierId);
  const manifestPath = join(dossierDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    return { ok: false, reason: "no manifest.json" };
  }

  const manifest: DossierManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  if (manifest._status === "active" && !force) {
    return { ok: false, reason: "already active (use --force to re-curate)" };
  }

  // Collect source files
  const componentsDir = join(dossierDir, "components");
  const filePaths = walkSourceFiles(componentsDir);
  const files: { path: string; contents: string; truncated: boolean }[] = [];
  let totalBytes = 0;
  for (const fullPath of filePaths) {
    const rel = relative(dossierDir, fullPath).replace(/\\/g, "/");
    const { contents, truncated } = readTruncated(fullPath);
    totalBytes += contents.length;
    if (totalBytes > MAX_TOTAL_FILE_BYTES) {
      console.log(`  [warn] hit total file budget; stopping at ${rel}`);
      break;
    }
    files.push({ path: rel, contents, truncated });
  }

  const envExamplePath = join(dossierDir, ".env.example");
  const envExample = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf-8") : null;

  if (files.length === 0) {
    return { ok: false, reason: "no source files in components/ — repo extraction may have failed" };
  }

  console.log(`  → calling LLM with ${files.length} files (${totalBytes} bytes)...`);
  const t0 = Date.now();

  const { object: result } = await generateObject({
    model,
    schema: CurationResultSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt({ dossierId, manifest, envExample, files }),
  });

  const elapsedMs = Date.now() - t0;
  console.log(`  ← got result in ${(elapsedMs / 1000).toFixed(1)}s`);

  const { changes } = applyCuration({ dossierDir, manifest, result, dryRun });
  for (const change of changes) {
    console.log(`    ${change}`);
  }

  return { ok: true };
}

async function main(): Promise<void> {
  const args = parseArgs();

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required. Set it in .env.local.");
    process.exit(1);
  }

  const openai = createOpenAI({ apiKey });
  const model = openai(args.model);

  // Discover candidate dossiers
  const allIds = listDossierIds();
  const candidates: string[] = [];
  for (const id of allIds) {
    if (args.only && id !== args.only) continue;
    const manifestPath = join(DOSSIERS_ROOT, id, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const m: DossierManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (m._status === "active" && !args.force) continue;
    candidates.push(id);
  }

  const target = args.limit ? candidates.slice(0, args.limit) : candidates;

  console.log("");
  console.log(`[auto-curate] model=${args.model}  dryRun=${args.dryRun}  force=${args.force}`);
  console.log(`[auto-curate] ${target.length} dossier(s) to curate (of ${candidates.length} drafts found):`);
  for (const id of target) console.log(`  - ${id}`);
  console.log("");

  if (target.length === 0) {
    console.log("Nothing to do. (Use --force to re-curate active dossiers, or --only=<id>.)");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const id of target) {
    console.log(`\n=== ${id} ===`);
    try {
      const res = await curateOne({ dossierId: id, model, dryRun: args.dryRun, force: args.force });
      if (res.ok) {
        ok += 1;
      } else {
        failed += 1;
        console.log(`  ✗ skipped: ${res.reason}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  console.log(`[auto-curate] Done. ${ok} curated, ${failed} skipped/failed.`);
  if (!args.dryRun && ok > 0) {
    console.log("");
    console.log("Next steps:");
    console.log("  npm run dossiers:index       # rebuild master.json");
    console.log("  npm run dossiers:embeddings  # regenerate embeddings (requires OPENAI_API_KEY)");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
