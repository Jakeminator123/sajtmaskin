/**
 * Generate embeddings for all templates using OpenAI text-embedding-3-small.
 *
 * Usage:  npx tsx scripts/generate-template-embeddings.ts
 * Or:     npm run templates:embeddings
 *
 * Requires OPENAI_API_KEY in environment (or .env.local).
 * Output:  src/lib/templates/template-embeddings.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const BATCH_SIZE = 100;
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../src/lib/templates/template-embeddings.json",
);

interface RawTemplate {
  id: string;
  title: string;
  slug: string;
  category: string;
}

interface CategoryMeta {
  id: string;
  title: string;
  description: string;
}

interface EmbeddingEntry {
  id: string;
  embedding: number[];
}

interface EmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: EmbeddingEntry[];
}

const V0_CATEGORIES: Record<string, CategoryMeta> = {
  ai: { id: "ai", title: "AI", description: "AI-powered templates och komponenter" },
  animations: { id: "animations", title: "Animations", description: "Animerade komponenter och effekter" },
  components: { id: "components", title: "Components", description: "Återanvändbara UI-komponenter" },
  "login-and-sign-up": { id: "login-and-sign-up", title: "Login & Sign Up", description: "Inloggnings- och registreringsformulär" },
  "blog-and-portfolio": { id: "blog-and-portfolio", title: "Blog & Portfolio", description: "Bloggar och portfoliowebbplatser" },
  "design-systems": { id: "design-systems", title: "Design Systems", description: "Designsystem och komponentbibliotek" },
  layouts: { id: "layouts", title: "Layouts", description: "Sidlayouter och strukturer" },
  "website-templates": { id: "website-templates", title: "Website Templates", description: "Kompletta webbplatstemplates" },
  "apps-and-games": { id: "apps-and-games", title: "Apps & Games", description: "Applikationer och spel" },
  uncategorized: { id: "uncategorized", title: "Okategoriserade", description: "Templates som ännu inte kategoriserats" },
};

function buildEmbeddingText(template: RawTemplate): string {
  const cat = V0_CATEGORIES[template.category] ?? V0_CATEGORIES["uncategorized"];
  return `${template.title} ${cat.title} ${cat.description}`;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  const templatesPath = path.resolve(
    __dirname,
    "../src/lib/templates/templates.json",
  );
  const categoriesPath = path.resolve(
    __dirname,
    "../src/lib/templates/template-categories.json",
  );

  const rawTemplates: RawTemplate[] = JSON.parse(
    fs.readFileSync(templatesPath, "utf-8"),
  );
  const categoryMapping: Record<string, string[]> = JSON.parse(
    fs.readFileSync(categoriesPath, "utf-8"),
  );

  // Build reverse lookup: templateId -> category (same logic as template-data.ts)
  const templateCategoryMap: Record<string, string> = {};
  for (const [category, ids] of Object.entries(categoryMapping)) {
    if (category.startsWith("_")) continue;
    for (const id of ids) {
      templateCategoryMap[id] = category;
    }
  }

  const templates = rawTemplates
    .filter((t) => t.slug !== "categories" && t.id !== "categories")
    .map((t) => ({
      ...t,
      category: templateCategoryMap[t.id] ?? t.category ?? "uncategorized",
    }));

  console.log(`📦 Found ${templates.length} templates`);
  console.log(`🧠 Model: ${MODEL} (${DIMENSIONS} dimensions)`);

  const allEmbeddings: EmbeddingEntry[] = [];
  const totalBatches = Math.ceil(templates.length / BATCH_SIZE);

  for (let i = 0; i < templates.length; i += BATCH_SIZE) {
    const batch = templates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const texts = batch.map(buildEmbeddingText);

    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} templates)...`);

    const response = await openai.embeddings.create({
      model: MODEL,
      input: texts,
      dimensions: DIMENSIONS,
    });

    for (let j = 0; j < batch.length; j++) {
      allEmbeddings.push({
        id: batch[j].id,
        embedding: response.data[j].embedding,
      });
    }
  }

  const output: EmbeddingsFile = {
    _meta: {
      model: MODEL,
      dimensions: DIMENSIONS,
      generated: new Date().toISOString(),
      count: allEmbeddings.length,
    },
    embeddings: allEmbeddings,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf-8");

  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Saved ${allEmbeddings.length} embeddings to ${OUTPUT_PATH}`);
  console.log(`   File size: ${fileSizeMB} MB`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
