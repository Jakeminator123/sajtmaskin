/**
 * OpenAI Agent for Code Editing
 * =============================
 *
 * Uses OpenAI's Responses API with GPT-5.1 Codex models and function calling
 * to edit code in taken-over projects.
 *
 * MODEL SELECTION (primary → fallback):
 * - gpt-5.1-codex-mini → gpt-4o-mini: Fast, cost-efficient for standard tasks
 * - gpt-5.1-codex → gpt-4o: Complex, long-running agentic coding
 * - gpt-5-mini → gpt-4o-mini: Text generation and copywriting
 * - gpt-5 → gpt-4o: Image orchestration with tools
 * - gpt-image-1 → dall-e-3: Direct image generation
 *
 * TASK TYPES:
 * - code_edit: Standard code changes (gpt-5.1-codex-mini)
 * - copy: Text generation (gpt-5-mini)
 * - image: Logo/hero image generation (gpt-5 + image_generation tool)
 * - web_search: Search web for info (gpt-4o-mini + web_search)
 * - code_refactor: Heavy refactoring (gpt-5.1-codex)
 * - analyze: Analyze project and suggest improvements (gpt-5)
 *
 * STORAGE MODES:
 * 1. SQLITE (primär) + Redis cache - Filer lagras i SQLite, Redis för cache
 * 2. GITHUB - Full version control on user's GitHub
 *
 * All API calls include error handling and structured responses.
 */

import OpenAI from "openai";
import {
  updateProjectFile,
  getProjectMeta,
  saveProjectFiles,
  ProjectFile,
} from "./redis";
import { updateProjectFileInDb } from "./database";
import { sanitizeProjectPath } from "./path-utils";
import { loadProjectFilesWithFallback } from "./project-files";

// Initialize OpenAI client (lazy initialization to avoid build-time errors)
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// ============ Types ============

export type TaskType =
  | "code_edit"
  | "copy"
  | "image"
  | "video"
  | "web_search"
  | "code_refactor"
  | "analyze";

export interface AgentFile {
  path: string;
  content: string;
}

export interface GeneratedImage {
  base64: string;
  path: string;
  prompt: string;
}

export interface AgentContext {
  projectId: string;
  storageType: "redis" | "github" | "sqlite";
  taskType: TaskType;
  // GitHub-specific
  githubToken?: string;
  repoFullName?: string;
  // Conversation continuity
  previousResponseId?: string;
}

export interface AgentResult {
  success: boolean;
  message: string;
  updatedFiles: AgentFile[];
  generatedImages?: GeneratedImage[];
  responseId: string;
  tokensUsed?: number;
  webSearchSources?: { title: string; url: string }[];
}

// ============ Model Configuration ============

// Note: OpenAI only supports "medium" for text.verbosity and reasoning.effort
type Verbosity = "medium";
type ReasoningEffort = "medium" | "high";
type ReasoningSummary = "auto" | "concise" | "detailed";

interface ModelConfig {
  model: string;
  fallbackModel: string;
  reasoning?: { effort: ReasoningEffort; summary?: ReasoningSummary };
  text?: { verbosity: Verbosity };
  tools: OpenAI.Responses.Tool[];
  diamondCost: number;
  description: string;
}

// Logging helper for API calls
function logApiCall(
  action: string,
  details: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info"
) {
  const timestamp = new Date().toISOString();
  const prefix = `[Agent:${timestamp}]`;

  if (level === "error") {
    console.error(prefix, action, details);
  } else if (level === "warn") {
    console.warn(prefix, action, details);
  } else {
    console.log(prefix, action, details);
  }
}

// Custom function tools for file operations
const FILE_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "read_file",
    description:
      "Read the contents of a file from the project. Use this to understand existing code before making changes.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The file path relative to project root (e.g. 'src/app/page.tsx')",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_file",
    description: "Update or create a file in the project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path relative to project root",
        },
        content: {
          type: "string",
          description: "The new content for the file",
        },
        commitMessage: {
          type: "string",
          description:
            "Description of the change (used for Git commit if GitHub mode)",
        },
      },
      required: ["path", "content", "commitMessage"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_files",
    description: "List all files in the project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Optional subdirectory path to filter (default: all files)",
        },
      },
      // OpenAI strict mode requires the required array to include every property
      // even when optional. Using an empty string to represent "root" is fine.
      required: ["path"],
      additionalProperties: false,
    },
  },
];

// Code interpreter tool configuration (requires container settings)
const CODE_INTERPRETER_TOOL: OpenAI.Responses.Tool = {
  type: "code_interpreter",
  container: {
    type: "auto", // Automatically select appropriate container
  },
};

// Model configuration per task type
// Primary models: GPT-5.1 Codex series (optimized for agentic coding)
// Fallback models: GPT-4o series (stable, widely available)
//
// TOOL NOTES:
// - code_interpreter: Can execute Python/JS code in sandbox for validation
// - image_generation: Generate images with gpt-image-1/dall-e-3
// - web_search: Search the web for information
// - FILE_TOOLS: Custom function tools for file operations (read/write/list)
// NOTE: OpenAI API only supports verbosity: "medium" for text config
// and reasoning.effort: "medium" or "high" for most models
const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  code_edit: {
    // gpt-5.1-codex-mini: Optimized for cost-efficient code edits
    model: "gpt-5.1-codex-mini",
    fallbackModel: "gpt-4o-mini",
    // No text/reasoning config - use defaults for maximum compatibility
    tools: FILE_TOOLS,
    diamondCost: 1,
    description: "Standard code editing with validation",
  },
  copy: {
    // gpt-5-mini: Good for text generation and copywriting
    model: "gpt-5-mini",
    fallbackModel: "gpt-4o-mini",
    text: { verbosity: "medium" },
    tools: FILE_TOOLS,
    diamondCost: 1,
    description: "Copywriting and text generation",
  },
  image: {
    // gpt-5: Full model for image generation orchestration
    model: "gpt-5",
    fallbackModel: "gpt-4o",
    reasoning: { effort: "medium", summary: "auto" },
    tools: [...FILE_TOOLS, { type: "image_generation" }],
    diamondCost: 3,
    description: "Image generation with context",
  },
  video: {
    // sora-2: Video generation (asynchronous, handled separately)
    // Note: Video generation uses the Videos API, not Responses API
    // This config is for reference and cost tracking only
    model: "sora-2",
    fallbackModel: "sora-2",
    tools: FILE_TOOLS,
    diamondCost: 10,
    description: "Video generation with Sora",
  },
  web_search: {
    // gpt-4o-mini: Stable support for web_search tool
    model: "gpt-4o-mini",
    fallbackModel: "gpt-4o-mini",
    tools: [...FILE_TOOLS, { type: "web_search" }],
    diamondCost: 2,
    description: "Web search and research",
  },
  code_refactor: {
    // gpt-5.1-codex: Complex, long-running agentic coding
    model: "gpt-5.1-codex",
    fallbackModel: "gpt-4o",
    reasoning: { effort: "medium", summary: "auto" },
    text: { verbosity: "medium" },
    tools: FILE_TOOLS,
    diamondCost: 5,
    description: "Heavy refactoring with validation",
  },
  analyze: {
    // gpt-5: Deep analysis and improvement suggestions
    // Include code_interpreter for running analysis scripts
    model: "gpt-5",
    fallbackModel: "gpt-4o",
    reasoning: { effort: "medium", summary: "auto" },
    text: { verbosity: "medium" },
    tools: [...FILE_TOOLS, CODE_INTERPRETER_TOOL],
    diamondCost: 3,
    description: "Project analysis with code execution",
  },
};

// Get diamond cost for a task type
export function getDiamondCost(taskType: TaskType): number {
  return MODEL_CONFIGS[taskType].diamondCost;
}

/**
 * Auto-detect the most appropriate task type based on user instruction
 * This eliminates the need for manual mode selection in the UI
 *
 * Priority order matters! Check code patterns first to avoid false positives.
 */
export function detectTaskType(instruction: string): TaskType {
  const lower = instruction.toLowerCase();

  // CODE EDIT patterns - check FIRST to catch styling/color changes
  // These should NOT trigger image generation
  const codeEditPatterns = [
    /\b(färg|color|bakgrundsfärg|background[\s-]?color)\b/i,
    /\b(svart|vit|röd|blå|grön|gul|rosa|lila|grå|orange)\b.*\b(bakgrund|background)\b/i,
    /\b(bakgrund|background)\b.*\b(svart|vit|röd|blå|grön|gul|rosa|lila|grå|orange)\b/i,
    /\b(ändra|byt|gör)\b.*\b(css|stil|style|tailwind)\b/i,
    /\b(padding|margin|border|font|text[\s-]?size)\b/i,
    /\b(lägg\s+till|ta\s+bort|ändra)\s+(knapp|button|länk|link|sektion|section)\b/i,
  ];
  if (codeEditPatterns.some((p) => p.test(lower))) {
    return "code_edit";
  }

  // Image generation patterns - be more specific, avoid "bakgrund" alone
  const imagePatterns = [
    /\b(bild|logo|logotyp|ikon|illustration|grafik)\b/i,
    /\b(bakgrundsbild|hero[\s-]?bild|banner[\s-]?bild)\b/i,
    /\b(generera|skapa|rita)\s+(en\s+)?(bild|logo|ikon|grafik)\b/i,
    /\b(image|logo|icon|picture|graphic|illustration)\b/i,
  ];
  if (imagePatterns.some((p) => p.test(lower))) {
    return "image";
  }

  // Web search patterns
  const searchPatterns = [
    /\b(sök|hitta|leta|researcha|undersök)\s+(efter|på|om)?\b/i,
    /\b(vad\s+är|hur\s+fungerar|vilka)\b.*\b(bästa|populära)\b/i,
    /\b(search|find|look\s+up|research)\b/i,
    /\b(inspiration|exempel|alternativ|konkurrent)\b/i,
  ];
  if (searchPatterns.some((p) => p.test(lower))) {
    return "web_search";
  }

  // Copy/text generation patterns
  const copyPatterns = [
    /\b(skriv|skapa|generera)\s+(text|rubrik|copy|beskrivning|slogan|tagline)/i,
    /\b(förbättra|omformulera|skriv\s+om)\s+(texten|rubriken|beskrivningen)/i,
    /\b(text|rubrik|copy|beskrivning|innehåll|meta|seo)\b.*\b(skriv|generera|skapa)\b/i,
    /\b(copywriting|headline|tagline|description)\b/i,
  ];
  if (copyPatterns.some((p) => p.test(lower))) {
    return "copy";
  }

  // Heavy refactoring patterns
  const refactorPatterns = [
    /\b(refaktorera|omstrukturera|bryt\s+ut|dela\s+upp|organisera\s+om)\b/i,
    /\b(design\s*system|komponent[\s-]?bibliotek|gemensam|delad)\b/i,
    /\b(hela|alla|samtliga)\s+(fil|komponent|sidor?)\b/i,
    /\b(stor|omfattande|komplex)\s+(ändring|förändring|uppdatering)\b/i,
    /\b(refactor|restructure|reorganize)\b/i,
  ];
  if (refactorPatterns.some((p) => p.test(lower))) {
    return "code_refactor";
  }

  // Analyze patterns
  const analyzePatterns = [
    /\b(analysera|utvärdera|granska|bedöm)\s+(kod|projekt|struktur)/i,
    /\b(vad\s+kan|hur\s+kan|förslag|förbättring|optimera)\b/i,
    /\b(analyze|evaluate|assess|review)\b/i,
  ];
  if (analyzePatterns.some((p) => p.test(lower))) {
    return "analyze";
  }

  // Default to code_edit for everything else (most common case)
  return "code_edit";
}

// ============ System Instructions per Task ============

const SYSTEM_INSTRUCTIONS: Record<TaskType, string> = {
  code_edit: `Du är en expert på React, Next.js, TypeScript och Tailwind CSS.

Din uppgift är att hjälpa användaren redigera sin webbplats-kod baserat på deras instruktioner.

REGLER:
1. Läs alltid relevanta filer innan du gör ändringar
2. Behåll befintlig kodstil och struktur
3. Gör minimala, fokuserade ändringar
4. Använd TypeScript och Tailwind CSS
5. Skriv clean, läsbar kod
6. Beskriv ändringar kort

KODVALIDERING (använd code_interpreter):
- För komplexa ändringar, validera TypeScript-syntax med code_interpreter
- Kontrollera att imports är korrekta
- Verifiera att Tailwind-klasser följer konventioner

VIKTIGT:
- Ändra BARA det som användaren ber om
- Lägg inte till onödiga funktioner
- Svara kortfattat på svenska

Börja med att lista och läsa relevanta filer.`,

  copy: `Du är en copywriter-expert som hjälper till att skriva webbplats-texter.

Din uppgift är att generera eller förbättra texter för webbplatsen.

DU KAN:
- Skriva rubriker, underrubriker, CTA-texter
- Förbättra befintliga texter
- Generera sektionstexter, beskrivningar
- Skriva SEO-optimerade meta-texter

STIL:
- Anpassa tonen efter webbplatsen
- Skriv på svenska om inte annat anges
- Var koncis och övertygande
- Använd aktiv röst

Läs först relevanta filer för att förstå kontexten.`,

  image: `Du är en kreativ AI-assistent som kan generera bilder och integrera dem i webbprojekt.

DU KAN GENERERA:
- Logotyper och varumärkes-grafik
- Hero-bilder och bakgrunder
- Illustrationer och ikoner
- Marknadsföringsbilder

PROCESS:
1. Förstå användarens behov
2. Generera bild med image_generation tool
3. Spara bilden i projektet (public/images/)
4. Uppdatera relevant kod för att använda bilden

TIPS FÖR BRA BILDPROMPTS:
- Var specifik med stil (minimalistisk, modern, etc.)
- Ange färger om viktigt
- Beskriv komposition
- Nämn användningsområde (logo, hero, etc.)`,

  video: `Du är en kreativ assistent som hjälper till att generera videor med Sora.

DU KAN GENERERA:
- Marknadsföringsvideor
- Hero-videor för webbplatser
- Produktdemos
- Bakgrundsvideor

PROCESS:
1. Förstå användarens vision
2. Formulera en detaljerad videobeskrivning
3. Inkludera: scen, rörelse, ljus, stämning, kameravinkel
4. Generera videon via /api/generate-video

TIPS FÖR BRA VIDEOPROMPTS:
- Beskriv scenen tydligt (plats, tid på dygnet)
- Ange kamerarörelse (zoom, pan, stillastående)
- Beskriv ljussättning och färgton
- Inkludera atmosfär och känsla
- Nämn duration om relevant

VIKTIGT: Videogenerering är asynkront och kan ta 1-2 minuter.`,

  web_search: `Du är en research-assistent som kan söka på webben för att hjälpa användaren.

DU KAN:
- Söka efter designinspiration
- Hitta färgpaletter och typsnitt
- Researcha konkurrenter
- Hitta kodexempel och best practices
- Söka efter ikoner, bilder, resurser

PROCESS:
1. Förstå vad användaren behöver
2. Sök på webben med web_search tool
3. Sammanfatta resultaten
4. Föreslå hur det kan användas i projektet

Ange alltid källor för information du hittar.`,

  code_refactor: `Du är en senior utvecklare som specialiserar sig på kodrefaktorering.

Din uppgift är att göra större strukturella förändringar i kodbasen.

DU KAN:
- Bryta ut komponenter
- Skapa delade layouts
- Implementera design systems
- Optimera prestanda
- Förbättra kodstruktur

PROCESS:
1. Analysera hela kodbasen noggrant
2. Planera ändringarna
3. Implementera steg för steg
4. Verifiera att allt hänger ihop

VARNING: Denna mode kostar mer och tar längre tid.
Se till att förstå helheten innan du börjar ändra.`,

  analyze: `Du är en erfaren webbplats-analytiker och arkitekt.

Din uppgift är att analysera användarens uppladdade webbplats och ge konkreta förbättringsförslag.

ANALYSERA:
1. Kodkvalitet och struktur
2. Designmönster och arkitektur
3. Prestanda och optimeringsmöjligheter
4. Tillgänglighet (a11y)
5. SEO-potential
6. Användbarhet och UX

PROCESS:
1. Lista alla filer i projektet
2. Läs de viktigaste filerna (package.json, huvudkomponenter, layoutfiler)
3. Identifiera styrkor och svagheter
4. Ge prioriterade förbättringsförslag

OUTPUT FORMAT:
- Kort sammanfattning av projektet
- 3-5 styrkor
- 3-5 förbättringsområden med konkreta förslag
- Rekommenderad nästa steg

Var konstruktiv och fokusera på det som ger mest värde.`,
};

// ============ Project File Operations ============

async function readProjectFile(
  projectId: string,
  path: string
): Promise<string> {
  const files = await loadProjectFilesWithFallback(projectId);
  if (!files || files.length === 0) {
    throw new Error("Projektet hittades inte");
  }

  const file = files.find((f) => f.path === path);
  if (!file) {
    throw new Error(`Filen hittades inte: ${path}`);
  }

  return file.content;
}

async function updateProjectFileCached(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  // Validate path to prevent directory traversal attacks
  const safePath = sanitizeProjectPath(filePath);
  if (!safePath) {
    throw new Error(`Ogiltig filväg: ${filePath}`);
  }

  // Write to SQLite (source of truth)
  try {
    updateProjectFileInDb(projectId, safePath, content);
  } catch (error) {
    console.error("[Agent] Failed to write file to SQLite:", error);
    throw new Error(`Kunde inte spara fil i SQLite: ${safePath}`);
  }

  // Best-effort cache update in Redis
  try {
    await updateProjectFile(projectId, safePath, content);
  } catch {
    // If update fails (e.g., cache missing), seed minimal file and retry once
    try {
      await saveProjectFiles(projectId, [
        { path: safePath, content, lastModified: new Date().toISOString() },
      ]);
      await updateProjectFile(projectId, safePath, content);
    } catch (cacheError) {
      console.warn(
        "[Agent] Failed to update Redis cache for file:",
        cacheError
      );
    }
  }
}

async function listProjectFiles(
  projectId: string,
  subPath?: string
): Promise<string[]> {
  const files = await loadProjectFilesWithFallback(projectId);
  if (!files || files.length === 0) {
    throw new Error("Projektet hittades inte");
  }

  let paths = files.map((f) => f.path);

  if (subPath) {
    paths = paths.filter((p) => p.startsWith(subPath));
  }

  return paths;
}

// ============ Direct Image Generation ============

/**
 * Generate an image directly using gpt-image-1 API
 * This is faster than using the image_generation tool through Responses API
 */
export async function generateImageDirect(
  prompt: string,
  options?: {
    size?: "1024x1024" | "1536x1024" | "1024x1536";
    quality?: "low" | "medium" | "high";
    background?: "transparent" | "opaque" | "auto";
  }
): Promise<{ base64: string; revisedPrompt?: string }> {
  logApiCall("Direct image generation", {
    prompt: prompt.substring(0, 100),
    ...options,
  });

  try {
    const result = await getOpenAIClient().images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: options?.size || "1024x1024",
      quality: options?.quality || "medium",
      background: options?.background || "auto",
      output_format: "png",
    });

    if (!result.data || result.data.length === 0) {
      throw new Error("No image data returned");
    }

    const imageData = result.data[0];
    if (!imageData?.b64_json) {
      throw new Error("No b64_json in image data");
    }

    logApiCall("Image generated successfully", {
      size: options?.size || "1024x1024",
      hasRevisedPrompt: !!imageData.revised_prompt,
    });

    return {
      base64: imageData.b64_json,
      revisedPrompt: imageData.revised_prompt,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logApiCall("Image generation failed", { error: errorMessage }, "error");

    // Fallback to dall-e-3 if gpt-image-1 is not available
    if (
      errorMessage.includes("model") ||
      errorMessage.includes("not found") ||
      errorMessage.includes("does not exist")
    ) {
      logApiCall("Falling back to dall-e-3", {}, "warn");

      const fallbackResult = await getOpenAIClient().images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json",
      });

      if (!fallbackResult.data || fallbackResult.data.length === 0) {
        throw new Error("No image data from fallback");
      }

      const fallbackImageData = fallbackResult.data[0];
      if (!fallbackImageData?.b64_json) {
        throw new Error("No b64_json in fallback image data");
      }

      return {
        base64: fallbackImageData.b64_json,
        revisedPrompt: fallbackImageData.revised_prompt,
      };
    }

    throw error;
  }
}

// Save a base64 image to the project
async function saveImageToProject(
  projectId: string,
  imageName: string,
  base64Data: string,
  storageType: "redis" | "github" | "sqlite",
  githubToken?: string,
  repoFullName?: string
): Promise<string> {
  const imagePath = `public/images/${imageName}`;

  if (storageType === "github" && githubToken && repoFullName) {
    await updateGitHubFile(
      githubToken,
      repoFullName,
      imagePath,
      base64Data,
      `Add generated image: ${imageName}`
    );
  }

  // Persist locally (SQLite + Redis cache) as placeholder reference
  await updateProjectFileCached(
    projectId,
    imagePath,
    `[BASE64_IMAGE:${imageName}]`
  );

  return imagePath;
}

// ============ GitHub Storage Functions ============

async function readGitHubFile(
  token: string,
  repoFullName: string,
  path: string
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Filen hittades inte: ${path}`);
  }

  const data = await response.json();
  try {
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch (error) {
    throw new Error(`Ogiltig base64-data i fil: ${path}`);
  }
}

async function updateGitHubFile(
  token: string,
  repoFullName: string,
  path: string,
  content: string,
  commitMessage: string
): Promise<void> {
  let sha: string | undefined;
  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (getResponse.ok) {
      const data = await getResponse.json();
      sha = data.sha;
    }
  } catch {
    // File doesn't exist
  }

  // Check content size (GitHub has 100MB limit per file)
  const contentSizeBytes = Buffer.byteLength(content, "utf-8");
  const maxSizeBytes = 100 * 1024 * 1024; // 100MB
  if (contentSizeBytes > maxSizeBytes) {
    throw new Error(
      `Filen är för stor (${Math.round(
        contentSizeBytes / 1024 / 1024
      )}MB). GitHub-gräns är 100MB.`
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Kunde inte uppdatera fil: ${error.message}`);
  }
}

async function listGitHubFiles(
  token: string,
  repoFullName: string,
  path: string = ""
): Promise<string[]> {
  const url = path
    ? `https://api.github.com/repos/${repoFullName}/contents/${path}`
    : `https://api.github.com/repos/${repoFullName}/contents`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Kunde inte lista filer i: ${path || "root"}`);
  }

  const data = await response.json();
  const files: string[] = [];

  for (const item of data) {
    if (item.type === "file") {
      files.push(item.path);
    } else if (item.type === "dir") {
      const subFiles = await listGitHubFiles(token, repoFullName, item.path);
      files.push(...subFiles);
    }
  }

  return files;
}

// ============ Unified Tool Executor ============

async function executeTool(
  context: AgentContext,
  toolName: string,
  args: Record<string, unknown>,
  generatedImages: GeneratedImage[]
): Promise<string> {
  console.log(`[Agent] Executing tool: ${toolName}`, args);

  const { projectId, storageType, githubToken, repoFullName } = context;

  switch (toolName) {
    case "read_file": {
      const path = args.path as string;
      if (storageType === "github" && githubToken && repoFullName) {
        return await readGitHubFile(githubToken, repoFullName, path);
      } else {
        return await readProjectFile(projectId, path);
      }
    }

    case "update_file": {
      const path = args.path as string;
      const content = args.content as string;
      const commitMessage = args.commitMessage as string;

      if (storageType === "github" && githubToken && repoFullName) {
        await updateGitHubFile(
          githubToken,
          repoFullName,
          path,
          content,
          commitMessage
        );
        await updateProjectFileCached(projectId, path, content);
      } else {
        await updateProjectFileCached(projectId, path, content);
      }
      return `Fil uppdaterad: ${path}`;
    }

    case "list_files": {
      const subPath = (args.path as string) || "";
      if (storageType === "github" && githubToken && repoFullName) {
        const files = await listGitHubFiles(githubToken, repoFullName, subPath);
        return files.join("\n");
      } else {
        const files = await listProjectFiles(projectId, subPath);
        return files.join("\n");
      }
    }

    default:
      throw new Error(`Okänt verktyg: ${toolName}`);
  }
}

// ============ Smart Context Functions ============

/**
 * Automatically gather relevant context files based on the instruction
 * This helps the AI understand the project better before making changes
 */
async function gatherSmartContext(
  instruction: string,
  projectId: string,
  storageType: "redis" | "github" | "sqlite",
  githubToken?: string,
  repoFullName?: string
): Promise<string> {
  try {
    // Get all files in project
    let allFiles: string[];
    if (storageType === "github" && githubToken && repoFullName) {
      allFiles = await listGitHubFiles(githubToken, repoFullName);
    } else {
      allFiles = await listProjectFiles(projectId);
    }

    if (!allFiles || allFiles.length === 0) {
      return "";
    }

    // Priority files to always include (if they exist)
    const priorityPatterns = [
      /^(src\/)?app\/layout\.tsx$/,
      /^(src\/)?app\/page\.tsx$/,
      /^package\.json$/,
      /^tailwind\.config/,
      /^(src\/)?components\/ui\//,
    ];

    // Keywords from instruction to match relevant files
    const instructionLower = instruction.toLowerCase();
    const keywords: string[] = [];

    // Extract potential component/file references
    const componentMatches = instruction.match(
      /(?:komponent|component|sida|page|fil|file|header|footer|nav|button|form|card|modal)\s*[:\s]?\s*["']?([a-zA-Z0-9-_]+)/gi
    );
    if (componentMatches) {
      componentMatches.forEach((m) => {
        const name = m.split(/[:\s"']+/).pop();
        if (name && name.length > 2) keywords.push(name.toLowerCase());
      });
    }

    // Common keywords mapping
    if (instructionLower.includes("färg") || instructionLower.includes("color"))
      keywords.push("tailwind", "globals.css");
    if (
      instructionLower.includes("layout") ||
      instructionLower.includes("struktur")
    )
      keywords.push("layout");
    if (
      instructionLower.includes("navigat") ||
      instructionLower.includes("meny") ||
      instructionLower.includes("nav")
    )
      keywords.push("nav", "header", "menu");
    if (
      instructionLower.includes("footer") ||
      instructionLower.includes("sidfot")
    )
      keywords.push("footer");
    if (
      instructionLower.includes("hero") ||
      instructionLower.includes("banner")
    )
      keywords.push("hero");
    if (
      instructionLower.includes("button") ||
      instructionLower.includes("knapp")
    )
      keywords.push("button");
    if (
      instructionLower.includes("form") ||
      instructionLower.includes("formulär")
    )
      keywords.push("form");

    // Select files to include
    const selectedFiles: string[] = [];
    const MAX_CONTEXT_FILES = 5;
    const MAX_CHARS_PER_FILE = 2000;

    // First add priority files
    for (const file of allFiles) {
      if (selectedFiles.length >= MAX_CONTEXT_FILES) break;
      if (priorityPatterns.some((p) => p.test(file))) {
        selectedFiles.push(file);
      }
    }

    // Then add keyword-matched files
    for (const file of allFiles) {
      if (selectedFiles.length >= MAX_CONTEXT_FILES) break;
      if (selectedFiles.includes(file)) continue;

      const fileLower = file.toLowerCase();
      if (keywords.some((k) => fileLower.includes(k))) {
        selectedFiles.push(file);
      }
    }

    if (selectedFiles.length === 0) {
      return "";
    }

    // Build context string
    let contextStr = "\n\n[AUTO-LOADED CONTEXT FILES FOR REFERENCE]\n";

    for (const filePath of selectedFiles) {
      try {
        let content: string;
        if (storageType === "github" && githubToken && repoFullName) {
          content = await readGitHubFile(githubToken, repoFullName, filePath);
        } else {
          content = await readProjectFile(projectId, filePath);
        }

        // Truncate if too long
        if (content.length > MAX_CHARS_PER_FILE) {
          content =
            content.substring(0, MAX_CHARS_PER_FILE) + "\n... [truncated]";
        }

        contextStr += `\n--- ${filePath} ---\n${content}\n`;
      } catch {
        // File read failed, skip
      }
    }

    contextStr += "\n[END AUTO-LOADED CONTEXT]\n";

    logApiCall("Gathered smart context", {
      filesLoaded: selectedFiles.length,
      keywords,
    });

    return contextStr;
  } catch (error) {
    logApiCall("Smart context gathering failed", { error }, "warn");
    return "";
  }
}

// ============ Main Agent Function ============

/**
 * Run the agent to process a user instruction
 */
export async function runAgent(
  instruction: string,
  context: AgentContext
): Promise<AgentResult> {
  const { taskType, projectId, storageType, githubToken, repoFullName } =
    context;
  const config = MODEL_CONFIGS[taskType];
  let usedModel = config.model;
  let usedFallback = false;

  logApiCall("Starting agent", {
    instruction: instruction.substring(0, 100),
    taskType,
    primaryModel: config.model,
    fallbackModel: config.fallbackModel,
    description: config.description,
  });

  const updatedFiles: AgentFile[] = [];
  const generatedImages: GeneratedImage[] = [];
  const webSearchSources: { title: string; url: string }[] = [];

  // Gather smart context for code_edit and code_refactor tasks
  let smartContext = "";
  if (
    taskType === "code_edit" ||
    taskType === "code_refactor" ||
    taskType === "copy"
  ) {
    smartContext = await gatherSmartContext(
      instruction,
      projectId,
      storageType,
      githubToken,
      repoFullName
    );
  }

  // Helper function to create response with optional fallback
  async function createResponseWithFallback(
    options: OpenAI.Responses.ResponseCreateParamsNonStreaming
  ): Promise<OpenAI.Responses.Response> {
    try {
      logApiCall("Trying primary model", { model: options.model });
      return await getOpenAIClient().responses.create(options);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if error indicates model not available
      if (
        errorMessage.includes("model") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("invalid_model")
      ) {
        logApiCall(
          "Primary model failed, trying fallback",
          {
            primaryModel: options.model,
            fallbackModel: config.fallbackModel,
            error: errorMessage,
          },
          "warn"
        );

        usedModel = config.fallbackModel;
        usedFallback = true;

        try {
          // Remove text and reasoning configs for fallback models (may not be supported)
          const fallbackOpts = { ...options } as Record<string, unknown>;
          delete fallbackOpts.text;
          delete fallbackOpts.reasoning;
          fallbackOpts.model = config.fallbackModel;
          return await getOpenAIClient().responses.create(
            fallbackOpts as OpenAI.Responses.ResponseCreateParamsNonStreaming
          );
        } catch (fallbackError) {
          const fallbackErrorMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : "Unknown error";
          logApiCall(
            "Both primary and fallback models failed",
            {
              primaryModel: options.model,
              fallbackModel: config.fallbackModel,
              primaryError: errorMessage,
              fallbackError: fallbackErrorMessage,
            },
            "error"
          );
          throw new Error(
            `Både primär modell (${options.model}) och fallback-modell (${config.fallbackModel}) misslyckades: ${fallbackErrorMessage}`
          );
        }
      }

      // Re-throw other errors
      throw error;
    }
  }

  try {
    // Enhance instruction with smart context if available
    const enhancedInstruction = smartContext
      ? `${instruction}${smartContext}`
      : instruction;

    // Build request options based on task type
    const requestOptions: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: config.model,
      instructions: SYSTEM_INSTRUCTIONS[taskType],
      input: enhancedInstruction,
      tools: config.tools,
      store: true,
    };

    // Add reasoning config if specified
    if (config.reasoning) {
      requestOptions.reasoning = config.reasoning;
    }

    // Add text verbosity config if specified
    if (config.text) {
      requestOptions.text = config.text;
    }

    // Continue previous conversation if ID provided
    if (context.previousResponseId) {
      requestOptions.previous_response_id = context.previousResponseId;
    }

    // Create initial response with fallback support
    let response = await createResponseWithFallback(requestOptions);

    console.log("[Agent] Initial response ID:", response.id);

    // Process tool calls in a loop
    let iterations = 0;
    const MAX_ITERATIONS = 15;
    const MAX_ITERATION_TIME_MS = 300000; // 5 minutes max per iteration cycle
    const iterationStartTime = Date.now();

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Check for timeout
      if (Date.now() - iterationStartTime > MAX_ITERATION_TIME_MS) {
        console.warn("[Agent] Max iteration time exceeded, stopping");
        break;
      }

      // Check for function calls
      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call"
      );

      // Check for image generation results
      const imageResults = response.output.filter(
        (item) => item.type === "image_generation_call"
      );

      // Check for web search results
      const webSearchResults = response.output.filter(
        (item) => item.type === "web_search_call"
      );

      // Process image generation results
      for (const imgResult of imageResults) {
        if ("result" in imgResult && imgResult.result) {
          const imageName = `generated_${Date.now()}.png`;
          const imagePath = await saveImageToProject(
            context.projectId,
            imageName,
            imgResult.result as string,
            context.storageType,
            context.githubToken,
            context.repoFullName
          );

          generatedImages.push({
            base64: imgResult.result as string,
            path: imagePath,
            prompt: "Generated image",
          });

          console.log("[Agent] Image generated and saved:", imagePath);
        }
      }

      // Process web search results for sources
      for (const searchResult of webSearchResults) {
        if ("results" in searchResult) {
          const results = searchResult.results as Array<{
            title?: string;
            url?: string;
          }>;
          for (const r of results) {
            if (r.title && r.url) {
              webSearchSources.push({ title: r.title, url: r.url });
            }
          }
        }
      }

      // If no function calls, we're done
      if (functionCalls.length === 0) {
        break;
      }

      console.log(`[Agent] Processing ${functionCalls.length} function calls`);

      // Execute function calls
      const functionResults: OpenAI.Responses.ResponseInputItem[] = [];

      for (const call of functionCalls) {
        try {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(call.arguments);
          } catch (parseError) {
            console.error(
              "[Agent] Failed to parse function arguments:",
              parseError
            );
            functionResults.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: `Fel: Ogiltig JSON i funktionsargument: ${call.arguments.substring(
                0,
                100
              )}`,
            });
            continue;
          }

          const result = await executeTool(
            context,
            call.name,
            args,
            generatedImages
          );

          if (call.name === "update_file") {
            updatedFiles.push({
              path: args.path as string,
              content: args.content as string,
            });
          }

          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Okänt fel";
          console.error(
            `[Agent] Tool execution failed for ${call.name}:`,
            errorMessage
          );
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `Fel: ${errorMessage}. Försök igen eller använd en annan approach.`,
          });
        }
      }

      // Continue with function results
      // Only include text/reasoning config for primary model (fallback may not support them)
      const continueOptions: OpenAI.Responses.ResponseCreateParamsNonStreaming =
        {
          model: usedModel, // Use the model that worked (primary or fallback)
          input: functionResults,
          previous_response_id: response.id,
          tools: config.tools,
          store: true,
          // Only apply text/reasoning for primary models, not fallback
          ...(!usedFallback && config.text && { text: config.text }),
          ...(!usedFallback &&
            config.reasoning && { reasoning: config.reasoning }),
        };

      response = await getOpenAIClient().responses.create(continueOptions);

      logApiCall("Continued conversation", {
        model: usedModel,
        responseId: response.id,
        iteration: iterations,
      });
    }

    // Extract final message
    const messageItem = response.output.find(
      (item): item is OpenAI.Responses.ResponseOutputMessage =>
        item.type === "message"
    );

    const finalMessage =
      messageItem?.content
        .filter(
          (c): c is OpenAI.Responses.ResponseOutputText =>
            c.type === "output_text"
        )
        .map((c) => c.text)
        .join("\n") ||
      (updatedFiles.length > 0 || generatedImages.length > 0
        ? "Ändringar genomförda."
        : "Inga ändringar gjordes.");

    logApiCall("Agent completed successfully", {
      taskType,
      model: usedModel,
      usedFallback,
      responseId: response.id,
      tokensUsed: response.usage?.total_tokens,
      updatedFilesCount: updatedFiles.length,
      generatedImagesCount: generatedImages.length,
    });

    return {
      success: true,
      message: finalMessage,
      updatedFiles,
      generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
      responseId: response.id,
      tokensUsed: response.usage?.total_tokens,
      webSearchSources:
        webSearchSources.length > 0 ? webSearchSources : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";

    logApiCall(
      "Agent error",
      {
        taskType,
        model: usedModel,
        usedFallback,
        error: errorMessage,
      },
      "error"
    );

    return {
      success: false,
      message: `Fel vid redigering: ${errorMessage}`,
      updatedFiles: [],
      responseId: "",
    };
  }
}

/**
 * Create agent context from project ID
 */
export async function createAgentContext(
  projectId: string,
  githubToken?: string,
  taskType: TaskType = "code_edit"
): Promise<AgentContext | null> {
  const meta = await getProjectMeta(projectId);
  if (!meta) {
    console.error("[Agent] Project metadata not found:", projectId);
    return null;
  }

  const context: AgentContext = {
    projectId,
    storageType: meta.storageType,
    taskType,
  };

  if (meta.storageType === "github" && meta.githubOwner && meta.githubRepo) {
    context.githubToken = githubToken;
    context.repoFullName = `${meta.githubOwner}/${meta.githubRepo}`;
  }

  return context;
}

/**
 * Continue a previous conversation
 */
export async function continueConversation(
  instruction: string,
  context: AgentContext,
  previousResponseId: string
): Promise<AgentResult> {
  return runAgent(instruction, {
    ...context,
    previousResponseId,
  });
}

/**
 * Generate image directly (standalone, without agent context)
 * Uses gpt-image-1 as primary model with dall-e-3 as fallback
 */
export async function generateImage(
  prompt: string,
  size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024",
  quality: "low" | "medium" | "high" | "standard" | "hd" = "medium"
): Promise<{ base64: string; revisedPrompt?: string; model: string }> {
  const primaryModel = "gpt-image-1";
  const fallbackModel = "dall-e-3";
  let usedModel = primaryModel;

  // Map quality for different models
  const gptImageQuality =
    quality === "hd" || quality === "high"
      ? "high"
      : quality === "standard"
      ? "medium"
      : quality;
  const dalleQuality =
    quality === "high" || quality === "hd" ? "hd" : "standard";

  logApiCall("Generating image", {
    prompt: prompt.substring(0, 100),
    size,
    quality,
    primaryModel,
    fallbackModel,
  });

  try {
    // Try gpt-image-1 first
    const result = await getOpenAIClient().images.generate({
      model: primaryModel,
      prompt,
      size,
      quality: gptImageQuality as "low" | "medium" | "high",
      n: 1,
      output_format: "png",
    });

    if (!result.data || result.data.length === 0) {
      throw new Error("No image data returned from API");
    }

    const imageData = result.data[0];

    logApiCall("Image generated successfully", {
      model: usedModel,
      hasData: !!imageData.b64_json,
    });

    return {
      base64: imageData.b64_json || "",
      revisedPrompt: imageData.revised_prompt,
      model: usedModel,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Check if we should try fallback
    if (
      errorMessage.includes("model") ||
      errorMessage.includes("not found") ||
      errorMessage.includes("does not exist")
    ) {
      logApiCall(
        "Primary image model failed, trying fallback",
        {
          primaryModel,
          fallbackModel,
          error: errorMessage,
        },
        "warn"
      );

      usedModel = fallbackModel;

      const result = await getOpenAIClient().images.generate({
        model: fallbackModel,
        prompt,
        size,
        quality: dalleQuality,
        n: 1,
        response_format: "b64_json",
      });

      if (!result.data || result.data.length === 0) {
        throw new Error("No image data returned from fallback API");
      }

      const imageData = result.data[0];

      logApiCall("Image generated with fallback", {
        model: usedModel,
        hasData: !!imageData.b64_json,
      });

      return {
        base64: imageData.b64_json || "",
        revisedPrompt: imageData.revised_prompt,
        model: usedModel,
      };
    }

    logApiCall("Image generation failed", { error: errorMessage }, "error");
    throw error;
  }
}

/**
 * Analyze a project and provide improvement suggestions
 * This is called by the avatar/agent to understand the user's uploaded site
 */
export async function analyzeProject(
  projectId: string,
  githubToken?: string
): Promise<AgentResult> {
  const context = await createAgentContext(projectId, githubToken, "analyze");

  if (!context) {
    return {
      success: false,
      message: "Projektet kunde inte hittas",
      updatedFiles: [],
      responseId: "",
    };
  }

  const instruction = `Analysera detta projekt och ge konkreta förbättringsförslag.
  
Börja med att lista alla filer och läs de viktigaste (package.json, huvudsidor, komponenter).
Fokusera på:
1. Övergripande struktur och arkitektur
2. Kodkvalitet och best practices
3. Potentiella förbättringar
4. Nästa steg för att göra sajten bättre

Ge en sammanfattning som användaren kan förstå utan teknisk bakgrund.`;

  return runAgent(instruction, context);
}
