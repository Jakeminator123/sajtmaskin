import OpenAI from "openai";
import {
  TEMPLATES,
  getTemplateCategoryId,
  type Template,
} from "./template-data";

export const TEMPLATE_EMBEDDING_MODEL = "text-embedding-3-small";
export const TEMPLATE_EMBEDDING_DIMENSIONS = 1536;
export const TEMPLATE_EMBEDDING_BATCH_SIZE = 100;

export interface EmbeddingEntry {
  id: string;
  embedding: number[];
}

export interface EmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    count: number;
  };
  embeddings: EmbeddingEntry[];
}

interface CategoryMeta {
  titleSv: string;
  titleEn: string;
  descriptionSv: string;
  keywordsSv: string[];
  keywordsEn: string[];
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  ai: {
    titleSv: "AI",
    titleEn: "AI",
    descriptionSv: "AI-drivna mallar och komponenter",
    keywordsSv: ["agent", "automation", "assistent"],
    keywordsEn: ["agent", "automation", "assistant"],
  },
  animations: {
    titleSv: "Animationer",
    titleEn: "Animations",
    descriptionSv: "Animerade komponenter och effekter",
    keywordsSv: ["animation", "mikrointeraktion", "motion"],
    keywordsEn: ["animation", "microinteraction", "motion"],
  },
  components: {
    titleSv: "Komponenter",
    titleEn: "Components",
    descriptionSv: "Återanvändbara UI-komponenter",
    keywordsSv: ["ui", "komponent", "gränssnitt"],
    keywordsEn: ["ui", "component", "interface"],
  },
  "login-and-sign-up": {
    titleSv: "Inloggning och registrering",
    titleEn: "Login and Sign Up",
    descriptionSv: "Inloggnings- och registreringsformulär",
    keywordsSv: ["inloggning", "konto", "auth"],
    keywordsEn: ["login", "signup", "auth"],
  },
  "blog-and-portfolio": {
    titleSv: "Blogg och portfolio",
    titleEn: "Blog and Portfolio",
    descriptionSv: "Bloggar och portfoliowebbplatser",
    keywordsSv: ["blogg", "portfolio", "innehåll"],
    keywordsEn: ["blog", "portfolio", "content"],
  },
  "design-systems": {
    titleSv: "Designsystem",
    titleEn: "Design Systems",
    descriptionSv: "Designsystem och komponentbibliotek",
    keywordsSv: ["designsystem", "tokens", "ui-kit"],
    keywordsEn: ["design system", "tokens", "ui kit"],
  },
  layouts: {
    titleSv: "Layouter",
    titleEn: "Layouts",
    descriptionSv: "Sidlayouter och strukturer",
    keywordsSv: ["layout", "grid", "sektioner"],
    keywordsEn: ["layout", "grid", "sections"],
  },
  "website-templates": {
    titleSv: "Webbplatsmallar",
    titleEn: "Website Templates",
    descriptionSv: "Kompletta webbplatsmallar",
    keywordsSv: ["hemsida", "webbplats", "mall"],
    keywordsEn: ["website", "web", "template"],
  },
  "apps-and-games": {
    titleSv: "Appar och spel",
    titleEn: "Apps and Games",
    descriptionSv: "Applikationer och spel",
    keywordsSv: ["app", "spel", "dashboard"],
    keywordsEn: ["app", "game", "dashboard"],
  },
  uncategorized: {
    titleSv: "Okategoriserade",
    titleEn: "Uncategorized",
    descriptionSv: "Mallar som inte kategoriserats ännu",
    keywordsSv: ["mall", "webb", "design"],
    keywordsEn: ["template", "web", "design"],
  },
};

function buildEmbeddingText(template: Template): string {
  const categoryId = getTemplateCategoryId(template);
  const category = CATEGORY_META[categoryId] ?? CATEGORY_META.uncategorized;
  const normalizedCategoryId = categoryId.replace(/-/g, " ");

  return [
    `Template title: ${template.title}`,
    `Kategori: ${category.titleSv}`,
    `Category: ${category.titleEn}`,
    `Beskrivning: ${category.descriptionSv}`,
    `Category id: ${categoryId} (${normalizedCategoryId})`,
    `Sökord sv: ${category.keywordsSv.join(", ")}, mall, webbplats, hemsida`,
    `Keywords en: ${category.keywordsEn.join(", ")}, template, website, web design`,
  ].join("\n");
}

type EmbeddingInput = {
  id: string;
  text: string;
};

function getTemplateEmbeddingInputs(): EmbeddingInput[] {
  return TEMPLATES.map((template) => ({
    id: template.id,
    text: buildEmbeddingText(template),
  }));
}

export interface GenerateTemplateEmbeddingsOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  batchSize?: number;
  onBatchProgress?: (payload: {
    batch: number;
    totalBatches: number;
    batchSize: number;
    processed: number;
    total: number;
  }) => void;
}

export async function generateTemplateEmbeddings(
  options: GenerateTemplateEmbeddingsOptions,
): Promise<EmbeddingsFile> {
  const model = options.model ?? TEMPLATE_EMBEDDING_MODEL;
  const dimensions = options.dimensions ?? TEMPLATE_EMBEDDING_DIMENSIONS;
  const batchSize = options.batchSize ?? TEMPLATE_EMBEDDING_BATCH_SIZE;

  const openai = new OpenAI({ apiKey: options.apiKey });
  const inputs = getTemplateEmbeddingInputs();
  const totalBatches = Math.ceil(inputs.length / batchSize);
  const allEmbeddings: EmbeddingEntry[] = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchInputs = inputs.slice(i, i + batchSize);
    const batch = Math.floor(i / batchSize) + 1;

    options.onBatchProgress?.({
      batch,
      totalBatches,
      batchSize: batchInputs.length,
      processed: i,
      total: inputs.length,
    });

    const response = await openai.embeddings.create({
      model,
      input: batchInputs.map((entry) => entry.text),
      dimensions,
    });

    if (response.data.length !== batchInputs.length) {
      throw new Error(
        `Embedding count mismatch: expected ${batchInputs.length}, got ${response.data.length}`,
      );
    }

    for (let j = 0; j < batchInputs.length; j++) {
      allEmbeddings.push({
        id: batchInputs[j].id,
        embedding: response.data[j].embedding,
      });
    }
  }

  return {
    _meta: {
      model,
      dimensions,
      generated: new Date().toISOString(),
      count: allEmbeddings.length,
    },
    embeddings: allEmbeddings,
  };
}
