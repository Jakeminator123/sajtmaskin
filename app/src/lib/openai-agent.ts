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
 * 1. REDIS (default) - Files stored in Redis, download as ZIP
 * 2. GITHUB - Full version control on user's GitHub
 *
 * All API calls are logged for debugging and monitoring.
 */

import OpenAI from "openai";
import { getProjectFiles, updateProjectFile, getProjectMeta } from "./redis";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============ Types ============

export type TaskType =
  | "code_edit"
  | "copy"
  | "image"
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
  storageType: "redis" | "github";
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

type Verbosity = "low" | "medium" | "high";
type ReasoningEffort = "minimal" | "low" | "medium" | "high";

interface ModelConfig {
  model: string;
  fallbackModel: string;
  reasoning?: { effort: ReasoningEffort };
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
    description: "Read the contents of a file from the project",
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
      required: [],
      additionalProperties: false,
    },
  },
];

// Model configuration per task type
// Primary models: GPT-5.1 Codex series (optimized for agentic coding)
// Fallback models: GPT-4o series (stable, widely available)
const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  code_edit: {
    // gpt-5.1-codex-mini: Optimized for cost-efficient code edits
    model: "gpt-5.1-codex-mini",
    fallbackModel: "gpt-4o-mini",
    text: { verbosity: "low" },
    tools: FILE_TOOLS,
    diamondCost: 1,
    description: "Standard code editing",
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
    reasoning: { effort: "low" },
    tools: [...FILE_TOOLS, { type: "image_generation" }],
    diamondCost: 3,
    description: "Image generation with context",
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
    reasoning: { effort: "medium" },
    text: { verbosity: "medium" },
    tools: FILE_TOOLS,
    diamondCost: 5,
    description: "Heavy refactoring and restructuring",
  },
  analyze: {
    // gpt-5: Deep analysis and improvement suggestions
    model: "gpt-5",
    fallbackModel: "gpt-4o",
    reasoning: { effort: "medium" },
    text: { verbosity: "high" },
    tools: FILE_TOOLS,
    diamondCost: 3,
    description: "Project analysis and suggestions",
  },
};

// Get diamond cost for a task type
export function getDiamondCost(taskType: TaskType): number {
  return MODEL_CONFIGS[taskType].diamondCost;
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

VIKTIGT:
- Ändra BARA det som användaren ber om
- Lägg inte till onödiga funktioner
- Svara kortfattat

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

// ============ REDIS Storage Functions ============

async function readRedisFile(projectId: string, path: string): Promise<string> {
  const files = await getProjectFiles(projectId);
  if (!files) {
    throw new Error("Projektet hittades inte");
  }

  const file = files.find((f) => f.path === path);
  if (!file) {
    throw new Error(`Filen hittades inte: ${path}`);
  }

  return file.content;
}

async function updateRedisFile(
  projectId: string,
  path: string,
  content: string
): Promise<void> {
  const success = await updateProjectFile(projectId, path, content);
  if (!success) {
    throw new Error(`Kunde inte uppdatera fil: ${path}`);
  }
}

async function listRedisFiles(
  projectId: string,
  subPath?: string
): Promise<string[]> {
  const files = await getProjectFiles(projectId);
  if (!files) {
    throw new Error("Projektet hittades inte");
  }

  let paths = files.map((f) => f.path);

  if (subPath) {
    paths = paths.filter((p) => p.startsWith(subPath));
  }

  return paths;
}

// Save a base64 image to the project
async function saveImageToProject(
  projectId: string,
  imageName: string,
  base64Data: string,
  storageType: "redis" | "github",
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

  // Also save to Redis (updateProjectFile handles both update and create)
  await updateProjectFile(projectId, imagePath, `[BASE64_IMAGE:${imageName}]`);

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
  return Buffer.from(data.content, "base64").toString("utf-8");
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
        return await readRedisFile(projectId, path);
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
        await updateRedisFile(projectId, path, content);
      } else {
        await updateRedisFile(projectId, path, content);
      }
      return `Fil uppdaterad: ${path}`;
    }

    case "list_files": {
      const subPath = (args.path as string) || "";
      if (storageType === "github" && githubToken && repoFullName) {
        const files = await listGitHubFiles(githubToken, repoFullName, subPath);
        return files.join("\n");
      } else {
        const files = await listRedisFiles(projectId, subPath);
        return files.join("\n");
      }
    }

    default:
      throw new Error(`Okänt verktyg: ${toolName}`);
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
  const { taskType } = context;
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

  // Helper function to create response with optional fallback
  async function createResponseWithFallback(
    options: OpenAI.Responses.ResponseCreateParamsNonStreaming
  ): Promise<OpenAI.Responses.Response> {
    try {
      logApiCall("Trying primary model", { model: options.model });
      return await openai.responses.create(options);
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

        return await openai.responses.create({
          ...options,
          model: config.fallbackModel,
        });
      }

      // Re-throw other errors
      throw error;
    }
  }

  try {
    // Build request options based on task type
    const requestOptions: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: config.model,
      instructions: SYSTEM_INSTRUCTIONS[taskType],
      input: instruction,
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

    while (iterations < MAX_ITERATIONS) {
      iterations++;

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
          const args = JSON.parse(call.arguments);
          const result = await executeTool(
            context,
            call.name,
            args,
            generatedImages
          );

          if (call.name === "update_file") {
            updatedFiles.push({
              path: args.path,
              content: args.content,
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
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `Fel: ${errorMessage}`,
          });
        }
      }

      // Continue with function results
      // IMPORTANT: Include text config for consistent verbosity across all responses
      const continueOptions: OpenAI.Responses.ResponseCreateParamsNonStreaming =
        {
          model: usedModel, // Use the model that worked (primary or fallback)
          input: functionResults,
          previous_response_id: response.id,
          tools: config.tools,
          store: true,
          // Apply same text verbosity settings as initial response
          ...(config.text && { text: config.text }),
          ...(config.reasoning && { reasoning: config.reasoning }),
        };

      response = await openai.responses.create(continueOptions);

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
        .join("\n") || "Ändringar genomförda.";

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
    const result = await openai.images.generate({
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

      const result = await openai.images.generate({
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
