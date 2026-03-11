import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS,
  TEMPLATE_LIBRARY_EMBEDDING_MODEL,
  generateTemplateLibraryEmbeddings,
} from "../src/lib/gen/template-library/embeddings-core";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../src/lib/gen/template-library/template-library-embeddings.json",
);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  const output = await generateTemplateLibraryEmbeddings({
    apiKey,
    model: TEMPLATE_LIBRARY_EMBEDDING_MODEL,
    dimensions: TEMPLATE_LIBRARY_EMBEDDING_DIMENSIONS,
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf-8");
  console.info(`Saved ${output.embeddings.length} template-library embeddings to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Failed to generate template-library embeddings:", error);
  process.exit(1);
});
