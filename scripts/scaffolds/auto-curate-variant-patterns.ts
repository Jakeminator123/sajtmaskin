/**
 * Auto-curate `signaturePatterns` for every scaffold variant via GPT-5.4.
 *
 * For each variant in config/scaffold-variants/<scaffold>/<variant>.json:
 *   1. Reads the existing variant JSON (label, description, keywords,
 *      signatureMotif, colorMode, promptHints, sourceTemplateIds).
 *   2. Asks GPT-5.4 to produce a structured `signaturePatterns` object via Zod:
 *        layouts: 3-5 CONCRETE layout choices (not abstract principles)
 *        motifs:  2-4 visual motifs that read at first glance
 *        antiPatterns: 2-4 patterns the LLM should NOT use
 *   3. Writes the field back into the variant JSON, preserving all other
 *      fields and key order as much as possible.
 *
 * Replaces the four generic guidance fields removed 2026-04-17 (`styleRules`,
 * `sectionInventory`, `avoidPatterns`, `worldClassRubric`) with smaller,
 * SPECIFIC guidance that survives without becoming boilerplate.
 *
 * Flags:
 *   --dry-run         Print what would change, write nothing.
 *   --only=<id>       Curate only this variant id (e.g. friendly-saas).
 *   --limit=<N>       Curate at most N variants.
 *   --force           Overwrite existing signaturePatterns.
 *   --model=<id>      Override LLM (default: gpt-5.4).
 *
 * Usage:
 *   npx tsx scripts/scaffolds/auto-curate-variant-patterns.ts --dry-run --only=friendly-saas
 *   npm run scaffolds:variant-patterns                              # all variants
 *
 * Requires OPENAI_API_KEY (loaded from .env.local via dotenv).
 *
 * After running:
 *   npm run scaffolds:variant-embeddings   # regenerate variant embeddings
 */

import "dotenv/config";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const WORKSPACE_ROOT = process.cwd();
const VARIANTS_ROOT = resolve(WORKSPACE_ROOT, "config", "scaffold-variants");
const DEFAULT_MODEL = "gpt-5.4";

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

interface VariantFileRef {
  id: string;
  scaffoldId: string;
  filePath: string;
}

function listVariantFiles(): VariantFileRef[] {
  const out: VariantFileRef[] = [];
  if (!statSync(VARIANTS_ROOT, { throwIfNoEntry: false })) return out;
  for (const scaffoldEntry of readdirSync(VARIANTS_ROOT, { withFileTypes: true })) {
    if (!scaffoldEntry.isDirectory()) continue;
    if (scaffoldEntry.name.startsWith("_")) continue;
    const scaffoldDir = join(VARIANTS_ROOT, scaffoldEntry.name);
    for (const fileEntry of readdirSync(scaffoldDir, { withFileTypes: true })) {
      if (!fileEntry.isFile()) continue;
      if (!fileEntry.name.endsWith(".json")) continue;
      out.push({
        id: fileEntry.name.replace(/\.json$/, ""),
        scaffoldId: scaffoldEntry.name,
        filePath: join(scaffoldDir, fileEntry.name),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const SignaturePatternsSchema = z.object({
  layouts: z
    .array(
      z
        .string()
        .min(15)
        .describe("CONCRETE layout choice. Bad: 'modern layout'. Good: 'asymmetric hero with floating product card and 60/40 split'."),
    )
    .min(3)
    .max(5),
  motifs: z
    .array(
      z
        .string()
        .min(12)
        .describe("Visual motif that reads at first glance. Bad: 'subtle design'. Good: '2px hairline borders + 1rem radius + soft shadow on cards'."),
    )
    .min(2)
    .max(4),
  antiPatterns: z
    .array(
      z
        .string()
        .min(12)
        .describe("Pattern to AVOID for this variant. Bad: 'bad patterns'. Good: 'never use full-bleed gradient buttons on auth surfaces'."),
    )
    .min(2)
    .max(4),
});

type _SignaturePatterns = z.infer<typeof SignaturePatternsSchema>;

function buildSystemPrompt(): string {
  return `You are an expert UI/UX direction curator for "Sajtmaskin", an AI website builder.

Your job: read one scaffold variant (visual style for a Next.js scaffold like saas-landing or portfolio) and produce a CONCRETE \`signaturePatterns\` object that the runtime LLM will read to know exactly how to compose pages in this variant's style.

Hard rules:
- Be SPECIFIC. Layouts must read like physical compositions ("asymmetric hero with floating product card", "3-column pricing with raised middle tier"). Avoid abstract principles ("modern layout", "clean design").
- Motifs must describe what a designer would see at first glance ("2px hairline borders + 1rem radius", "warm cream surfaces with hand-drawn divider lines").
- Anti-patterns must be HONEST avoidances for THIS variant. Don't write generic accessibility rules. Write things like "never use gradient buttons on auth surfaces" or "avoid full-bleed dark hero on a friendly-warm SaaS".
- Match the variant's signatureMotif, colorMode, and promptHints. If the variant is "warm-local", anti-patterns should call out enterprise-stiff or corporate-sterile patterns.
- Keep entries concise but full sentences. 12-25 words each.

You will receive the variant JSON. Produce the structured signaturePatterns object.`;
}

function buildUserPrompt(args: { variant: Record<string, unknown> }): string {
  return `Variant to curate signaturePatterns for:

\`\`\`json
${JSON.stringify(args.variant, null, 2)}
\`\`\`

Produce signaturePatterns:
- 3-5 layouts (concrete compositions specific to this scaffold's typical pages)
- 2-4 motifs (visual signatures readable at a glance)
- 2-4 antiPatterns (concrete avoidances honest to this variant — not generic a11y rules)`;
}

async function curateOne(args: {
  ref: VariantFileRef;
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  dryRun: boolean;
  force: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const { ref, model, dryRun, force } = args;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(ref.filePath, "utf-8"));
  } catch (err) {
    return { ok: false, reason: `parse error: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (raw.signaturePatterns && !force) {
    return { ok: false, reason: "already has signaturePatterns (use --force to overwrite)" };
  }

  console.log(`  → calling LLM for ${ref.scaffoldId}/${ref.id}…`);
  const t0 = Date.now();

  const { object: result } = await generateObject({
    model,
    schema: SignaturePatternsSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt({ variant: raw }),
  });

  const elapsedMs = Date.now() - t0;
  console.log(`  ← got result in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(
    `    layouts=${result.layouts.length} motifs=${result.motifs.length} antiPatterns=${result.antiPatterns.length}`,
  );

  if (dryRun) {
    console.log("    [dry-run] would write:");
    console.log(`      layouts:      ${result.layouts.map((l) => `"${l.slice(0, 60)}…"`).join(" / ")}`);
    console.log(`      motifs:       ${result.motifs.map((m) => `"${m.slice(0, 60)}…"`).join(" / ")}`);
    console.log(`      antiPatterns: ${result.antiPatterns.map((a) => `"${a.slice(0, 60)}…"`).join(" / ")}`);
    return { ok: true };
  }

  // Insert signaturePatterns AFTER promptHints (preferred order) for readability.
  const reordered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    reordered[key] = value;
    if (key === "promptHints") {
      reordered.signaturePatterns = result;
    }
  }
  // Fallback: if promptHints not present, just append.
  if (!("signaturePatterns" in reordered)) {
    reordered.signaturePatterns = result;
  }
  // If file already had signaturePatterns AND we're forcing, replace.
  if (force && "signaturePatterns" in raw) {
    reordered.signaturePatterns = result;
  }

  writeFileSync(ref.filePath, JSON.stringify(reordered, null, 2) + "\n", "utf-8");
  console.log(`    ✓ wrote signaturePatterns to ${ref.filePath}`);
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

  const allRefs = listVariantFiles();
  let candidates = allRefs;
  if (args.only) candidates = candidates.filter((r) => r.id === args.only);
  if (args.limit) candidates = candidates.slice(0, args.limit);

  console.log("");
  console.log(`[variant-patterns] model=${args.model}  dryRun=${args.dryRun}  force=${args.force}`);
  console.log(`[variant-patterns] ${candidates.length} variant(s) to curate (of ${allRefs.length} total)`);
  for (const ref of candidates) console.log(`  - ${ref.scaffoldId}/${ref.id}`);
  console.log("");

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let skipped = 0;
  for (const ref of candidates) {
    console.log(`\n=== ${ref.scaffoldId}/${ref.id} ===`);
    try {
      const res = await curateOne({ ref, model, dryRun: args.dryRun, force: args.force });
      if (res.ok) ok += 1;
      else {
        skipped += 1;
        console.log(`  ✗ skipped: ${res.reason}`);
      }
    } catch (err) {
      skipped += 1;
      console.log(`  ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  console.log(`[variant-patterns] Done. ${ok} curated, ${skipped} skipped/failed.`);
  if (!args.dryRun && ok > 0) {
    console.log("");
    console.log("Next step: npm run scaffolds:variant-embeddings  (regenerate embeddings to include new patterns)");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
