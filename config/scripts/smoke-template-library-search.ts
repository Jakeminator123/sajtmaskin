/**
 * Local smoke test: reference catalog semantic search (own-engine prompt path).
 * Does NOT touch v0 gallery embeddings (`src/lib/templates/template-embeddings.json`).
 *
 * Usage (repo root, OPENAI_API_KEY in env or .env):
 *   npx tsx config/scripts/smoke-template-library-search.ts
 *   npm run template-library:smoke-search
 */
import "dotenv/config";
import { searchTemplateLibrary } from "../../src/lib/gen/template-library/search";

const QUERIES = ["Next.js dashboard med auth", "restaurant landing page", "blog"];

async function main() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.error("OPENAI_API_KEY is missing — set it or add to .env for semantic search.");
    process.exit(1);
  }

  console.info("template-library smoke (reference catalog only, not v0 gallery)\n");

  for (const q of QUERIES) {
    const results = await searchTemplateLibrary(q, 4);
    console.info(`Query: "${q}"`);
    if (results.length === 0) {
      console.info("  (no matches — empty catalog or keyword/embedding miss)\n");
      continue;
    }
    for (const r of results) {
      console.info(
        `  • ${r.entry.title}  score=${r.score.toFixed(3)}  q=${r.entry.qualityScore}`,
      );
    }
    console.info("");
  }

  console.info("OK — searchTemplateLibrary completed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
