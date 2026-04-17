/**
 * Generate embeddings for all scaffold variants.
 *
 * Reads:  config/scaffold-variants/<scaffold-id>/<variant-id>.json
 * Writes: config/scaffold-variants/_index/variant-embeddings.json
 *
 * Embedding text per variant:
 *   "{label}\n{description}\n{signatureMotif}\nKeywords: …\nPrompt cues: …"
 *
 * Used at runtime by pickScaffoldVariant to rank variants semantically
 * (better than the keyword array). Falls back to keyword scoring when
 * embeddings file missing or no API key.
 *
 * Usage:
 *   npx tsx scripts/scaffolds/generate-variant-embeddings.ts
 *   npm run scaffolds:variant-embeddings
 *
 * Requires OPENAI_API_KEY in .env.local.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import OpenAI from "openai";

const WORKSPACE_ROOT = process.cwd();
const VARIANTS_ROOT = resolve(WORKSPACE_ROOT, "config", "scaffold-variants");
const INDEX_DIR = join(VARIANTS_ROOT, "_index");
const OUTPUT_PATH = join(INDEX_DIR, "variant-embeddings.json");

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const BATCH_SIZE = 50;

interface Variant {
  id: string;
  scaffoldId: string;
  label: string;
  description?: string;
  signatureMotif: string;
  colorMode: string;
  keywords: string[];
  promptHints: string[];
}

interface VariantEmbedding {
  id: string;
  scaffoldId: string;
  embedding: number[];
}

interface VariantEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: VariantEmbedding[];
}

function loadAllVariants(): Variant[] {
  if (!existsSync(VARIANTS_ROOT)) return [];
  const variants: Variant[] = [];
  for (const scaffoldEntry of readdirSync(VARIANTS_ROOT, { withFileTypes: true })) {
    if (!scaffoldEntry.isDirectory()) continue;
    if (scaffoldEntry.name.startsWith("_")) continue;
    const scaffoldDir = join(VARIANTS_ROOT, scaffoldEntry.name);
    const files = readdirSync(scaffoldDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);
    for (const file of files) {
      try {
        const v = JSON.parse(readFileSync(join(scaffoldDir, file), "utf-8")) as Variant;
        if (v.id && v.scaffoldId) variants.push(v);
      } catch {
        console.warn(`[variant-embed] skip invalid JSON: ${join(scaffoldDir, file)}`);
      }
    }
  }
  return variants;
}

function buildEmbeddingText(v: Variant): string {
  return [
    `Variant: ${v.label}`,
    `Scaffold: ${v.scaffoldId}`,
    `Description: ${v.description ?? ""}`,
    `Signature motif: ${v.signatureMotif}`,
    `Color mode: ${v.colorMode}`,
    `Keywords: ${v.keywords.join(", ")}`,
    `Prompt cues: ${v.promptHints.join("; ")}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY required. Set in .env.local.");
    process.exit(1);
  }

  const variants = loadAllVariants();
  if (variants.length === 0) {
    console.error("[variant-embed] No variants found.");
    process.exit(1);
  }

  console.log(`[variant-embed] Embedding ${variants.length} variants`);

  const openai = new OpenAI({ apiKey });
  const all: VariantEmbedding[] = [];

  for (let i = 0; i < variants.length; i += BATCH_SIZE) {
    const batch = variants.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbeddingText);
    const res = await openai.embeddings.create({ model: MODEL, input: texts, dimensions: DIMENSIONS });
    if (res.data.length !== batch.length) {
      throw new Error(`Mismatch: expected ${batch.length} got ${res.data.length}`);
    }
    for (let j = 0; j < batch.length; j += 1) {
      all.push({
        id: batch[j]!.id,
        scaffoldId: batch[j]!.scaffoldId,
        embedding: res.data[j]!.embedding,
      });
    }
    console.log(`[variant-embed]   batch ${Math.floor(i / BATCH_SIZE) + 1}: +${batch.length}`);
  }

  mkdirSync(INDEX_DIR, { recursive: true });
  const out: VariantEmbeddingsFile = {
    _meta: { model: MODEL, dimensions: DIMENSIONS, generated: new Date().toISOString(), count: all.length },
    embeddings: all,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`[variant-embed] Wrote ${all.length} embeddings to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
