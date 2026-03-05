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
  titleSv: string;
  titleEn: string;
  descriptionSv: string;
  keywordsSv: string[];
  keywordsEn: string[];
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
  ai: {
    id: "ai",
    titleSv: "AI",
    titleEn: "AI",
    descriptionSv: "AI-drivna mallar och komponenter",
    keywordsSv: ["agent", "automation", "assistent"],
    keywordsEn: ["agent", "automation", "assistant"],
  },
  animations: {
    id: "animations",
    titleSv: "Animationer",
    titleEn: "Animations",
    descriptionSv: "Animerade komponenter och effekter",
    keywordsSv: ["animation", "mikrointeraktion", "motion"],
    keywordsEn: ["animation", "microinteraction", "motion"],
  },
  components: {
    id: "components",
    titleSv: "Komponenter",
    titleEn: "Components",
    descriptionSv: "Återanvändbara UI-komponenter",
    keywordsSv: ["ui", "komponent", "gränssnitt"],
    keywordsEn: ["ui", "component", "interface"],
  },
  "login-and-sign-up": {
    id: "login-and-sign-up",
    titleSv: "Inloggning och registrering",
    titleEn: "Login and Sign Up",
    descriptionSv: "Inloggnings- och registreringsformulär",
    keywordsSv: ["inloggning", "konto", "auth"],
    keywordsEn: ["login", "signup", "auth"],
  },
  "blog-and-portfolio": {
    id: "blog-and-portfolio",
    titleSv: "Blogg och portfolio",
    titleEn: "Blog and Portfolio",
    descriptionSv: "Bloggar och portfoliowebbplatser",
    keywordsSv: ["blogg", "portfolio", "innehåll"],
    keywordsEn: ["blog", "portfolio", "content"],
  },
  "design-systems": {
    id: "design-systems",
    titleSv: "Designsystem",
    titleEn: "Design Systems",
    descriptionSv: "Designsystem och komponentbibliotek",
    keywordsSv: ["designsystem", "tokens", "ui-kit"],
    keywordsEn: ["design system", "tokens", "ui kit"],
  },
  layouts: {
    id: "layouts",
    titleSv: "Layouter",
    titleEn: "Layouts",
    descriptionSv: "Sidlayouter och strukturer",
    keywordsSv: ["layout", "grid", "sektioner"],
    keywordsEn: ["layout", "grid", "sections"],
  },
  "website-templates": {
    id: "website-templates",
    titleSv: "Webbplatsmallar",
    titleEn: "Website Templates",
    descriptionSv: "Kompletta webbplatsmallar",
    keywordsSv: ["hemsida", "webbplats", "mall"],
    keywordsEn: ["website", "web", "template"],
  },
  "apps-and-games": {
    id: "apps-and-games",
    titleSv: "Appar och spel",
    titleEn: "Apps and Games",
    descriptionSv: "Applikationer och spel",
    keywordsSv: ["app", "spel", "dashboard"],
    keywordsEn: ["app", "game", "dashboard"],
  },
  uncategorized: {
    id: "uncategorized",
    titleSv: "Okategoriserade",
    titleEn: "Uncategorized",
    descriptionSv: "Mallar som inte kategoriserats ännu",
    keywordsSv: ["mall", "webb", "design"],
    keywordsEn: ["template", "web", "design"],
  },
};

function buildEmbeddingText(template: RawTemplate): string {
  const cat = V0_CATEGORIES[template.category] ?? V0_CATEGORIES["uncategorized"];
  const normalizedCategoryId = template.category.replace(/-/g, " ");
  return [
    `Template title: ${template.title}`,
    `Kategori: ${cat.titleSv}`,
    `Category: ${cat.titleEn}`,
    `Beskrivning: ${cat.descriptionSv}`,
    `Category id: ${template.category} (${normalizedCategoryId})`,
    `Sökord sv: ${cat.keywordsSv.join(", ")}, mall, webbplats, hemsida`,
    `Keywords en: ${cat.keywordsEn.join(", ")}, template, website, web design`,
  ].join("\n");
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

  console.info(`📦 Found ${templates.length} templates`);
  console.info(`🧠 Model: ${MODEL} (${DIMENSIONS} dimensions)`);

  const allEmbeddings: EmbeddingEntry[] = [];
  const totalBatches = Math.ceil(templates.length / BATCH_SIZE);

  for (let i = 0; i < templates.length; i += BATCH_SIZE) {
    const batch = templates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const texts = batch.map(buildEmbeddingText);

    console.info(`  Batch ${batchNum}/${totalBatches} (${batch.length} templates)...`);

    const response = await openai.embeddings.create({
      model: MODEL,
      input: texts,
      dimensions: DIMENSIONS,
    });

    if (response.data.length !== texts.length) {
      throw new Error(
        `Embedding count mismatch: expected ${texts.length}, got ${response.data.length}`,
      );
    }

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
  console.info(`\n✅ Saved ${allEmbeddings.length} embeddings to ${OUTPUT_PATH}`);
  console.info(`   File size: ${fileSizeMB} MB`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
