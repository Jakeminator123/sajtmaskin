/**
 * Generate embeddings for the Vercel template *reference* catalog (prompt augmentation).
 *
 * Usage:  npx tsx config/scripts/generate-template-library-embeddings.ts
 * Or:     npm run template-library:embeddings
 *
 * Requires OPENAI_API_KEY. Run after `npm run template-library:build`.
 * Output: src/lib/gen/template-library/template-library-embeddings.json
 *
 * (Distinct from `templates:embeddings`, which updates the v0 gallery file
 * `src/lib/templates/template-embeddings.json`.)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { generateTemplateLibraryEmbeddings } from "../../src/lib/gen/template-library/embeddings-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../../src/lib/gen/template-library/template-library-embeddings.json",
);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  console.info("🧠 Vercel reference catalog — embeddings (template-library)…");
  const result = await generateTemplateLibraryEmbeddings({ apiKey });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf-8");
  const mb = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.info(`✅ Saved ${result.embeddings.length} embeddings → ${OUTPUT_PATH}`);
  console.info(`   File size: ${mb} MB`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
