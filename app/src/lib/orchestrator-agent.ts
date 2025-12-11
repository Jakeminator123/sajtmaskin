/**
 * Orchestrator Agent 2.0
 * ======================
 *
 * Smart meta-agent som koordinerar arbetsflöden mellan olika verktyg.
 *
 * NYA FUNKTIONER (2.0):
 * - Semantic Router: Analyserar ALLA prompts semantiskt (inte keyword-baserat)
 * - Code Crawler: Söker igenom projektfiler för att hitta relevant kontext
 * - Prompt Enricher: Kombinerar all kontext till rik prompt för v0
 *
 * FLÖDE:
 * 1. Semantic Router analyserar prompten och bestämmer intent
 * 2. Om needs_code_context → Code Crawler analyserar filer
 * 3. Prompt Enricher kombinerar all kontext
 * 4. Berikad prompt skickas till v0 (eller annan action)
 *
 * INTENT TYPES:
 * - simple_code: Enkla ändringar, direkt till v0
 * - needs_code_context: Kräver kodanalys först (Code Crawler)
 * - image_only: Bara generera bilder (INGEN kodändring)
 * - image_and_code: Generera bilder OCH uppdatera kod
 * - web_search: Bara söka/researcha
 * - web_and_code: Söka OCH uppdatera kod
 * - clarify: Behöver förtydligande
 * - chat_response: Bara svara, ingen action
 */

import type { QualityLevel } from "@/lib/api-client";
import { isBlobConfigured, uploadBlobFromBase64 } from "@/lib/blob-service";
import { crawlCodeContext, type CodeContext } from "@/lib/code-crawler";
import { debugLog } from "@/lib/debug";
import { enrichPrompt, createEnrichmentSummary } from "@/lib/prompt-enricher";
import {
  routePrompt,
  shouldRoute,
  type RouterResult,
  type SemanticIntent,
} from "@/lib/semantic-router";
import {
  generateCode,
  refineCode,
  type GeneratedFile,
} from "@/lib/v0-generator";
import OpenAI from "openai";
export { enhancePromptForV0 } from "./prompt-utils";

// Helper to save AI-generated image using centralized blob-service
// CRITICAL: This function MUST return a URL for v0 preview to work!
// v0's demoUrl is hosted on v0's servers (vusercontent.net) and cannot access local files.
async function saveImageToBlob(
  base64: string,
  prompt: string,
  userId: string,
  projectId?: string,
  retryCount: number = 0
): Promise<string | null> {
  const maxRetries = 2;

  // Early exit if blob storage is not configured
  if (!isBlobConfigured()) {
    console.error(
      "[Orchestrator:Blob] ❌ BLOB_READ_WRITE_TOKEN not configured!\n" +
        "  → AI-generated images will NOT appear in v0 preview\n" +
        "  → Set BLOB_READ_WRITE_TOKEN in .env.local"
    );
    return null;
  }

  // Ensure we have a valid userId (required for blob path isolation)
  const effectiveUserId = userId || "anonymous";

  try {
    // Use centralized blob-service for user-isolated storage
    // Files stored under: {userId}/ai-images/{filename}
    // Or with project: {userId}/projects/{projectId}/ai-images/{filename}
    const result = await uploadBlobFromBase64(effectiveUserId, base64, {
      projectId,
      filenamePrefix: "ai",
    });

    if (result && result.url) {
      console.log(
        `[Orchestrator:Blob] ✓ Upload successful (${result.storageType}):`,
        result.url
      );
      return result.url;
    }

    // Upload returned null despite token being configured - likely transient error
    console.warn(
      "[Orchestrator:Blob] ❌ Upload failed - blob-service returned null"
    );

    // Retry if we haven't exceeded max retries
    if (retryCount < maxRetries) {
      console.log(
        `[Orchestrator:Blob] Retrying upload (attempt ${retryCount + 2}/${
          maxRetries + 1
        })...`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
      return saveImageToBlob(
        base64,
        prompt,
        effectiveUserId,
        projectId,
        retryCount + 1
      );
    }

    return null;
  } catch (error) {
    console.error("[Orchestrator:Blob] ❌ Exception during upload:", error);

    // Retry on error if we haven't exceeded max retries
    if (retryCount < maxRetries) {
      console.log(
        `[Orchestrator:Blob] Retrying after error (attempt ${retryCount + 2}/${
          maxRetries + 1
        })...`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return saveImageToBlob(
        base64,
        prompt,
        effectiveUserId,
        projectId,
        retryCount + 1
      );
    }

    return null;
  }
}

// Initialize OpenAI client
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

/**
 * Extract context hints from a vague prompt for Smart Clarify.
 * Tries to identify what the user might be referring to.
 */
function extractHintsFromPrompt(prompt: string): string[] {
  const hints: string[] = [];
  const lower = prompt.toLowerCase();

  // Common UI elements
  const uiElements = [
    "länk",
    "link",
    "knapp",
    "button",
    "header",
    "footer",
    "navbar",
    "nav",
    "meny",
    "menu",
    "bild",
    "image",
    "text",
    "rubrik",
    "heading",
    "sektion",
    "section",
    "formulär",
    "form",
    "input",
    "fält",
    "field",
  ];

  for (const element of uiElements) {
    if (lower.includes(element)) {
      hints.push(element);
    }
  }

  // Extract specific words that might be component names or IDs
  const words = prompt.split(/\s+/);
  for (const word of words) {
    // Capitalized words might be component names
    if (word[0] && word[0] === word[0].toUpperCase() && word.length > 2) {
      hints.push(word);
    }
  }

  return hints.length > 0 ? hints : ["länk", "knapp", "element"]; // Default hints
}

/**
 * Decide if we should run Code Crawler for clarify intent.
 * We only run it when the prompt suggests a specific UI element or context.
 */
function shouldRunSmartClarify(
  prompt: string,
  routerResult: RouterResult
): boolean {
  // If router already says needs code context or has hints, run it
  if (routerResult.needsCodeContext || routerResult.contextHints.length > 0) {
    return true;
  }

  // Very short/vague prompt → skip
  if (prompt.trim().length < 12) {
    return false;
  }

  const lower = prompt.toLowerCase();
  const uiKeywords = [
    "header",
    "footer",
    "navbar",
    "nav",
    "menu",
    "meny",
    "hero",
    "cta",
    "button",
    "knapp",
    "link",
    "länk",
    "modal",
    "dialog",
    "popup",
    "card",
    "kort",
    "form",
    "fält",
    "section",
    "sektion",
    "banner",
    "sidebar",
    "topbar",
  ];

  const hasUiKeyword = uiKeywords.some((kw) => lower.includes(kw));

  // Only run Smart Clarify when the prompt references UI-ish terms
  return hasUiKeyword;
}

/**
 * Generate a smart clarify question based on code context.
 * Finds all matching elements and asks user to specify which one.
 */
async function generateSmartClarifyQuestion(
  userPrompt: string,
  codeContext: CodeContext,
  client: OpenAI
): Promise<string> {
  try {
    // Build a summary of all found elements
    const elementsSummary = codeContext.relevantFiles
      .map((file, index) => {
        // Try to extract element names/text from snippets
        const snippet = file.snippet;

        // Look for common patterns: links, buttons, headings
        const linkMatches = snippet.match(/<a[^>]*>([^<]+)<\/a>/gi);
        const buttonMatches = snippet.match(/<button[^>]*>([^<]+)<\/button>/gi);
        const headingMatches = snippet.match(
          /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi
        );

        const elements: string[] = [];
        if (linkMatches) {
          linkMatches.forEach((match) => {
            const text = match.replace(/<[^>]+>/g, "").trim();
            if (text) elements.push(`länken "${text}"`);
          });
        }
        if (buttonMatches) {
          buttonMatches.forEach((match) => {
            const text = match.replace(/<[^>]+>/g, "").trim();
            if (text) elements.push(`knappen "${text}"`);
          });
        }
        if (headingMatches) {
          headingMatches.forEach((match) => {
            const text = match.replace(/<[^>]+>/g, "").trim();
            if (text) elements.push(`rubriken "${text}"`);
          });
        }

        // If no specific elements found, describe the file location
        if (elements.length === 0) {
          const fileName = file.name.split("/").pop() || file.name;
          elements.push(`element i ${fileName}`);
        }

        return `${index + 1}. ${elements.join(", ")} (${file.name})`;
      })
      .join("\n");

    // Use AI to generate a natural question
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: `Du är en hjälpsam assistent. Användaren skrev en vag prompt och vi hittade flera matchande element i koden. 
Generera en naturlig, vänlig fråga på svenska som hjälper användaren att välja vilket element de menar.

ANVÄNDARENS PROMPT: "${userPrompt}"

HITTADE ELEMENT:
${elementsSummary}

Generera en kort, tydlig fråga som listar alternativen. Exempel:
"Jag hittade flera länkar. Menar du länken 'Products' i headern, länken 'Contact' i footern, eller länken 'About' i sidebar?"

Svara ENDAST med frågan, inget annat.`,
      input: "Generera clarify-fråga",
      store: false,
    });

    const question = response.output_text?.trim() || "";

    if (question) {
      return question;
    }

    // Fallback: Generate question manually
    const fileNames = codeContext.relevantFiles.map((f) => f.name).join(", ");
    return `Jag hittade flera matchande element i filerna: ${fileNames}. Kan du vara mer specifik om vilket element du menar?`;
  } catch (error) {
    console.error("[Orchestrator] Smart Clarify generation failed:", error);
    // Fallback to simple question
    const fileCount = codeContext.relevantFiles.length;
    return `Jag hittade ${fileCount} matchande element. Kan du vara mer specifik om vilket element du menar?`;
  }
}

// Intent types - what does the user ACTUALLY want?
type UserIntent =
  | "image_only" // Just generate images, show in chat
  | "code_only" // Just change code via v0
  | "image_and_code" // Generate images AND update code
  | "web_search_only" // Just search/research, return info
  | "web_search_and_code" // Search AND update code
  | "clarify" // Ask a follow-up question
  | "chat_response"; // Just respond, no action needed

export interface OrchestratorContext {
  userId?: string;
  projectId?: string;
  quality: QualityLevel;
  existingChatId?: string;
  existingCode?: string;
  // NEW: Project files for Code Crawler analysis
  projectFiles?: GeneratedFile[];
  // Media library items (for image references in prompts)
  mediaLibrary?: Array<{
    url: string;
    filename: string;
    description?: string;
  }>;
}

export interface OrchestratorResult {
  success: boolean;
  message: string;
  // Intent that was detected (now using SemanticIntent from router)
  intent?: UserIntent | SemanticIntent;
  // v0 generation result (only if code was changed)
  code?: string;
  files?: Array<{ name: string; content: string }>;
  chatId?: string;
  demoUrl?: string;
  versionId?: string;
  // Additional context
  webSearchResults?: Array<{ title: string; url: string; snippet: string }>;
  generatedImages?: Array<{ base64?: string; prompt: string; url?: string }>;
  workflowSteps?: string[];
  // For clarify intent
  clarifyQuestion?: string;
  // For chat_response intent
  chatResponse?: string;
  error?: string;
  // NEW: Enrichment info for debugging
  routerResult?: RouterResult;
  codeContext?: CodeContext;
  enrichedPrompt?: string;
}

/**
 * Orchestrate a workflow based on user prompt
 *
 * SMART 2.0: Uses Semantic Router for better intent detection,
 * Code Crawler for context enrichment, and Prompt Enricher
 * for better v0 instructions.
 */
export async function orchestrateWorkflow(
  userPrompt: string,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const workflowSteps: string[] = [];

  try {
    debugLog("[Orchestrator] Starting workflow 2.0", {
      promptLength: userPrompt.length,
      quality: context.quality,
      hasExistingChat: !!context.existingChatId,
      hasExistingCode: !!context.existingCode,
      hasProjectFiles: !!context.projectFiles?.length,
    });

    const client = getOpenAIClient();

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: SEMANTIC ROUTING (NEW!)
    // Use the new semantic router for better intent detection
    // ═══════════════════════════════════════════════════════════════════════

    console.log("[Orchestrator] Step 1: Routing prompt...");

    let codeContext: CodeContext | undefined;

    // Use new semantic router
    const routerResult = await routePrompt(userPrompt, !!context.existingCode);

    // Log reasoning only (intent already logged by SemanticRouter)
    console.log(`[Orchestrator] Reasoning: "${routerResult.reasoning}"`);

    workflowSteps.push(
      `Semantic Router: ${routerResult.intent} (${Math.round(
        routerResult.confidence * 100
      )}% confidence)`
    );
    workflowSteps.push(`Reasoning: ${routerResult.reasoning}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: CODE CRAWLER (if needed)
    // Analyze project files to find relevant code context
    // SMART CLARIFY: Only for clarify when UI hints are present
    // ═══════════════════════════════════════════════════════════════════════

    const shouldRunCodeCrawler =
      context.projectFiles?.length &&
      (routerResult.needsCodeContext ||
        (routerResult.intent === "clarify" &&
          shouldRunSmartClarify(userPrompt, routerResult)));

    if (shouldRunCodeCrawler) {
      console.log("[Orchestrator] === STEP 2: CODE CRAWLER ===");
      console.log(
        "[Orchestrator] Analyzing",
        context.projectFiles.length,
        "files with hints:",
        routerResult.contextHints.length > 0
          ? routerResult.contextHints
          : "extracting from prompt"
      );
      workflowSteps.push(
        `Code Crawler: Analyserar ${context.projectFiles.length} filer`
      );

      // For clarify intent, extract hints from prompt if not provided
      const hints =
        routerResult.contextHints.length > 0
          ? routerResult.contextHints
          : extractHintsFromPrompt(userPrompt);

      codeContext = await crawlCodeContext(
        context.projectFiles,
        hints,
        userPrompt
      );

      console.log("[Orchestrator] Code context found:", {
        filesFound: codeContext.relevantFiles.length,
        routing: codeContext.routingInfo,
        summary: codeContext.summary,
      });

      if (codeContext.relevantFiles.length > 0) {
        workflowSteps.push(
          `Hittade ${codeContext.relevantFiles.length} relevanta filer`
        );
        workflowSteps.push(`Analys: ${codeContext.summary}`);
      } else {
        workflowSteps.push("Inga matchande kodsektioner hittades");
        if (intent === "web_search_and_code") {
          shouldApplyCodeChanges = false;
          workflowSteps.push(
            "Hoppar kodändring: ingen kodkontext hittad för färgändringen"
          );
        }
      }
    } else if (routerResult.needsCodeContext && !context.projectFiles?.length) {
      console.log(
        "[Orchestrator] Code context needed but no project files available"
      );
      workflowSteps.push("⚠️ Kodkontext behövs men inga filer tillgängliga");
      if (intent === "web_search_and_code") {
        shouldApplyCodeChanges = false;
        workflowSteps.push(
          "Hoppar kodändring: inga projektfiler att analysera"
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: MAP SEMANTIC INTENT TO LEGACY INTENT
    // For backward compatibility with existing code
    // ═══════════════════════════════════════════════════════════════════════

    // Map new SemanticIntent to old UserIntent
    const intentMapping: Record<SemanticIntent, UserIntent> = {
      simple_code: "code_only",
      needs_code_context: "code_only", // After enrichment, treated as code_only
      web_search: "web_search_only",
      image_gen: "image_only",
      web_and_code: "web_search_and_code",
      image_and_code: "image_and_code",
      clarify: "clarify",
      chat_response: "chat_response",
    };

    const intent: UserIntent = intentMapping[routerResult.intent];

    // Build classification object for backward compatibility
    const classification = {
      intent,
      reasoning: routerResult.reasoning,
      imagePrompts: routerResult.imagePrompt ? [routerResult.imagePrompt] : [],
      webSearchQuery: routerResult.searchQuery || "",
      codeInstruction: routerResult.codeInstruction || userPrompt,
      clarifyQuestion: routerResult.clarifyQuestion || "",
      chatResponse: routerResult.chatResponse || "",
    };

    console.log("[Orchestrator] Mapped intent:", intent);
    debugLog("[Orchestrator] Intent classified", {
      originalIntent: routerResult.intent,
      mappedIntent: intent,
      reasoning: classification.reasoning,
    });

    // Track whether we should apply code changes (may be turned off later if no context)
    let shouldApplyCodeChanges =
      intent === "code_only" ||
      intent === "image_and_code" ||
      intent === "web_search_and_code";

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: HANDLE EACH INTENT TYPE
    // ═══════════════════════════════════════════════════════════════════════

    // Handle chat_response - just return the response
    if (intent === "chat_response") {
      return {
        success: true,
        message: classification.chatResponse || "Jag förstår!",
        intent,
        chatResponse: classification.chatResponse,
        workflowSteps,
      };
    }

    // Handle clarify - SMART CLARIFY: Use code context if available
    if (intent === "clarify") {
      // SMART CLARIFY: If we have code context, generate specific questions
      if (codeContext && codeContext.relevantFiles.length > 0) {
        console.log("[Orchestrator] === SMART CLARIFY ===");
        console.log(
          "[Orchestrator] Found",
          codeContext.relevantFiles.length,
          "potential matches, generating specific question"
        );

        workflowSteps.push(
          "Smart Clarify: Genererar specifik fråga baserat på kod"
        );

        // Generate smart clarify question using AI
        const smartQuestion = await generateSmartClarifyQuestion(
          userPrompt,
          codeContext,
          client
        );

        return {
          success: true,
          message: smartQuestion,
          intent,
          clarifyQuestion: smartQuestion,
          workflowSteps,
          codeContext, // Include for debugging
        };
      }

      // Fallback to simple clarify if no code context
      return {
        success: true,
        message:
          classification.clarifyQuestion || "Kan du förtydliga vad du menar?",
        intent,
        clarifyQuestion: classification.clarifyQuestion,
        workflowSteps,
      };
    }

    // Initialize result containers
    let webSearchContext = "";
    const webSearchResults: Array<{
      title: string;
      url: string;
      snippet: string;
    }> = [];
    const generatedImages: Array<{
      base64?: string;
      prompt: string;
      url?: string;
    }> = [];

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: EXECUTE WEB SEARCH (if needed)
    // ═══════════════════════════════════════════════════════════════════════

    if (
      (intent === "web_search_only" || intent === "web_search_and_code") &&
      classification.webSearchQuery
    ) {
      console.log(
        "[Orchestrator] Executing web search:",
        classification.webSearchQuery
      );
      workflowSteps.push(`Söker online: ${classification.webSearchQuery}`);

      try {
        // Use Responses API with native web_search tool for real web search
        let searchResponse: Awaited<ReturnType<typeof client.responses.create>>;
        try {
          searchResponse = await client.responses.create({
            model: "gpt-4o-mini",
            instructions:
              "Du är en webbdesign-expert. Baserat på web search-resultaten, ge en informativ sammanfattning på svenska om designtrender, färger, layouter etc. för den nämnda webbplatsen eller konceptet.",
            input: classification.webSearchQuery,
            tools: [{ type: "web_search" }],
            store: false,
          });

          // Extract web search results from output
          if (searchResponse.output) {
            for (const item of searchResponse.output) {
              // Look for web_search_call_output items which contain search results
              // Use type assertion via unknown since TypeScript SDK may not have complete types yet
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const itemAny = item as any;

              if (
                itemAny.type === "web_search_call_output" &&
                itemAny.result &&
                Array.isArray(itemAny.result)
              ) {
                for (const result of itemAny.result) {
                  const resultObj = result as {
                    title?: unknown;
                    url?: unknown;
                    snippet?: unknown;
                    excerpt?: unknown;
                  };

                  if (
                    resultObj &&
                    typeof resultObj === "object" &&
                    resultObj.title &&
                    resultObj.url
                  ) {
                    webSearchResults.push({
                      title: String(resultObj.title),
                      url: String(resultObj.url),
                      snippet:
                        (resultObj.snippet
                          ? String(resultObj.snippet)
                          : resultObj.excerpt
                          ? String(resultObj.excerpt)
                          : "") || "",
                    });
                  }
                }
              }
            }
          }

          webSearchContext = searchResponse.output_text || "";
          workflowSteps.push(
            "Sammanställde design-information från webbsökning"
          );
          console.log(
            "[Orchestrator] Web search completed with",
            webSearchResults.length,
            "results"
          );
        } catch (responsesError) {
          // Fallback to simpler model if primary fails
          console.warn(
            "[Orchestrator] Primary Responses API web_search failed, trying fallback model:",
            responsesError
          );
          try {
            searchResponse = await client.responses.create({
              model: "gpt-4o-mini",
              instructions:
                "Du är en webbdesign-expert. Baserat på användarens fråga, ge en informativ sammanfattning på svenska om designtrender, färger, layouter etc. för den nämnda webbplatsen eller konceptet.",
              input: classification.webSearchQuery,
              tools: [{ type: "web_search" }],
              store: false,
            });
            webSearchContext = searchResponse.output_text || "";
            workflowSteps.push("Sammanställde design-information (fallback)");
            console.log("[Orchestrator] Web search fallback completed");
          } catch (fallbackError) {
            console.error(
              "[Orchestrator] Both Responses API web search attempts failed:",
              fallbackError
            );
            webSearchContext = "";
            workflowSteps.push("Webbsökning misslyckades");
          }
        }
      } catch (error) {
        console.error("[Orchestrator] Web search failed:", error);
        workflowSteps.push("Webbsökning misslyckades");
      }

      // If web_search_only, return here WITHOUT calling v0
      if (intent === "web_search_only") {
        return {
          success: true,
          message: webSearchContext || "Här är vad jag hittade:",
          intent,
          webSearchResults:
            webSearchResults.length > 0 ? webSearchResults : undefined,
          workflowSteps,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: GENERATE IMAGES (if needed)
    // ═══════════════════════════════════════════════════════════════════════

    if (
      (intent === "image_only" || intent === "image_and_code") &&
      classification.imagePrompts &&
      classification.imagePrompts.length > 0
    ) {
      debugLog("[Orchestrator] Generating images", {
        count: classification.imagePrompts.length,
      });
      workflowSteps.push(
        `Genererar ${classification.imagePrompts.length} bild(er)`
      );

      for (const imagePrompt of classification.imagePrompts.slice(0, 3)) {
        try {
          // Check if imagePrompt is already a URL (from MediaBank "Lägg till i sajten")
          const isUrl =
            imagePrompt.startsWith("http://") ||
            imagePrompt.startsWith("https://");

          if (isUrl) {
            // Already a URL - use it directly, don't generate
            console.log(
              "[Orchestrator] Using existing image URL:",
              imagePrompt
            );
            generatedImages.push({
              prompt: "Befintlig bild från mediabank", // Description for reference
              url: imagePrompt, // Use URL directly
            });
            workflowSteps.push(`Använder befintlig bild från mediabank`);
            continue;
          }

          // Not a URL - generate new image
          console.log(
            "[Orchestrator] Generating image:",
            imagePrompt.substring(0, 50) + "..."
          );

          // Prefer gpt-image-1 for quality; fallback to dall-e-3 if unavailable
          let base64Data: string | undefined;
          try {
            // gpt-image-1 does NOT support response_format - it returns base64 by default
            const gptImageResponse = await client.images.generate({
              model: "gpt-image-1",
              prompt: imagePrompt,
              size: "1024x1024",
              quality: "low", // gpt-image-1 uses "low", "medium", "high"
              n: 1,
            });
            // gpt-image-1 returns b64_json in data[0].b64_json
            base64Data = gptImageResponse.data?.[0]?.b64_json;
            console.log("[Orchestrator] ✓ gpt-image-1 generated image");
          } catch (primaryError) {
            console.warn(
              "[Orchestrator] gpt-image-1 unavailable, falling back to dall-e-3:",
              primaryError instanceof Error
                ? primaryError.message
                : primaryError
            );
            // dall-e-3 supports response_format
            const dalleResponse = await client.images.generate({
              model: "dall-e-3",
              prompt: imagePrompt,
              size: "1024x1024",
              quality: "standard",
              n: 1,
              response_format: "b64_json",
            });
            base64Data = dalleResponse.data?.[0]?.b64_json;
            console.log("[Orchestrator] ✓ dall-e-3 fallback generated image");
          }

          if (base64Data) {
            const base64 = base64Data;

            // CRITICAL: Always try to save to blob storage for a real URL
            // v0's preview CANNOT access local files - must have public URL!
            console.log(
              "[Orchestrator] Saving generated image to Blob storage..."
            );

            const blobUrl = await saveImageToBlob(
              base64,
              imagePrompt,
              context.userId || "anonymous",
              context.projectId
            );

            // Always add the image to results, with or without URL
            generatedImages.push({
              base64,
              prompt: imagePrompt,
              url: blobUrl || undefined,
            });

            if (blobUrl) {
              workflowSteps.push(
                `✅ Bild sparad med publik URL: ${imagePrompt.substring(
                  0,
                  35
                )}...`
              );
              console.log("[Orchestrator] ✓ Image saved with URL:", blobUrl);
            } else {
              workflowSteps.push(
                `⚠️ Bild genererad men kunde inte sparas: ${imagePrompt.substring(
                  0,
                  30
                )}...`
              );
              console.warn(
                "[Orchestrator] ⚠️ Image generated but NOT saved to blob storage!",
                "This image will NOT appear in v0 preview.",
                "Check that BLOB_READ_WRITE_TOKEN is configured."
              );
            }
          }
        } catch (error) {
          debugLog("[Orchestrator] Image generation failed", {
            error: String(error),
          });
          workflowSteps.push(
            `Bildgenerering misslyckades: ${imagePrompt.substring(0, 30)}...`
          );
        }
      }

      // If image_only, return here WITHOUT calling v0
      if (intent === "image_only") {
        const imageCount = generatedImages.length;
        const imagesWithUrls = generatedImages.filter((img) => img.url);
        const imagesWithoutUrls = generatedImages.filter((img) => !img.url);
        const hasAllUrls = imagesWithUrls.length === imageCount;
        const hasNoUrls = imagesWithUrls.length === 0;

        let message = "";
        if (imageCount === 0) {
          message =
            "Kunde inte generera bilder. Försök med en annan beskrivning.";
        } else if (hasAllUrls) {
          // All images have URLs - best case!
          message = `Här är ${
            imageCount === 1 ? "din bild" : `dina ${imageCount} bilder`
          }! Klicka "Lägg till i sajten" för att direkt infoga ${
            imageCount === 1 ? "den" : "dem"
          } i din design.`;
        } else if (hasNoUrls) {
          // No images have URLs - warn user
          message = `Här är ${
            imageCount === 1 ? "din bild" : `dina ${imageCount} bilder`
          }! ⚠️ OBS: Bilderna kunde inte sparas permanent (BLOB_READ_WRITE_TOKEN kanske saknas). De kommer INTE fungera i v0-preview.`;
        } else {
          // Some images have URLs, some don't
          message = `${imagesWithUrls.length} av ${imageCount} bilder har sparats med publika URLs. ${imagesWithoutUrls.length} bild(er) kunde inte sparas och kommer inte fungera i v0-preview.`;
        }

        return {
          success: imageCount > 0,
          message,
          intent,
          generatedImages:
            generatedImages.length > 0 ? generatedImages : undefined,
          workflowSteps,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: GENERATE/REFINE CODE (only for code-related intents)
    // Uses Prompt Enricher to build rich context for v0
    // ═══════════════════════════════════════════════════════════════════════

    // Only call v0 if intent involves code changes
    if (
      intent === "code_only" ||
      intent === "image_and_code" ||
      intent === "web_search_and_code"
    ) {
      // If we decided to skip code changes (no context etc.), return with info instead of calling v0
      if (!shouldApplyCodeChanges) {
        const message =
          webSearchContext && webSearchContext.length > 0
            ? "Jag hittade färginfo men ingen tydlig plats i koden att uppdatera. Vill du ange sektion eller komponent?"
            : "Jag hittade ingen kodkontext eller färginfo. Kan du ange sektion/komponent och vilka färger som ska sättas?";

        return {
          success: true,
          message,
          intent,
          webSearchResults:
            webSearchResults.length > 0 ? webSearchResults : undefined,
          workflowSteps,
        };
      }

      // Build the code instruction using Prompt Enricher (NEW!)
      let codeInstruction = classification.codeInstruction || userPrompt;

      // Use Prompt Enricher if we have code context
      if (codeContext && codeContext.relevantFiles.length > 0) {
        console.log("[Orchestrator] === USING PROMPT ENRICHER ===");

        const enrichedPrompt = enrichPrompt({
          originalPrompt: userPrompt,
          routerResult,
          codeContext,
          webResults:
            webSearchResults.length > 0 ? webSearchResults : undefined,
          generatedImages: generatedImages
            .filter((img) => img.url)
            .map((img) => ({
              url: img.url!,
              prompt: img.prompt,
            })),
        });

        console.log(
          "[Orchestrator] Enriched prompt preview:",
          enrichedPrompt.substring(0, 500) + "..."
        );
        console.log(
          "[Orchestrator] Enriched prompt length:",
          enrichedPrompt.length
        );

        // Log enrichment summary for debugging
        const summary = createEnrichmentSummary({
          originalPrompt: userPrompt,
          routerResult,
          codeContext,
          webResults:
            webSearchResults.length > 0 ? webSearchResults : undefined,
        });
        console.log("[Orchestrator] Enrichment summary:", summary);

        workflowSteps.push("Prompt Enricher: Berikade prompten med kodkontext");
        codeInstruction = enrichedPrompt;
      }

      // Add context from web search if available
      if (webSearchContext && intent === "web_search_and_code") {
        codeInstruction += `\n\nKontext från webbsökning:\n${webSearchContext.substring(
          0,
          2000
        )}`;
      }

      // Add info about media library items (existing uploaded images)
      // These are images the user has uploaded or generated previously
      if (context.mediaLibrary && context.mediaLibrary.length > 0) {
        const mediaCatalog = context.mediaLibrary
          .map(
            (item, i) =>
              `[Bild ${i + 1}]: ${item.url} - "${
                item.description || item.filename
              }"`
          )
          .join("\n");

        codeInstruction += `

═══════════════════════════════════════════════════════════════════════════════
TILLGÄNGLIGA BILDER FRÅN MEDIABIBLIOTEKET:
═══════════════════════════════════════════════════════════════════════════════
${mediaCatalog}

INSTRUKTION: Om användaren refererar till befintliga bilder, använd EXAKTA URLs 
från listan ovan i <img src="..."> taggar.
═══════════════════════════════════════════════════════════════════════════════
`;
        console.log(
          `[Orchestrator] Added ${context.mediaLibrary.length} media library items to prompt`
        );
      }

      // Add info about generated images if available
      // CRITICAL: If we have real URLs from blob storage, include them in the prompt!
      // v0 will use these exact URLs in the generated code.
      if (generatedImages.length > 0 && intent === "image_and_code") {
        const imagesWithUrls = generatedImages.filter((img) => img.url);

        if (imagesWithUrls.length > 0) {
          console.log(
            `[Orchestrator] Injecting ${imagesWithUrls.length} image URL(s) into v0 prompt`
          );

          codeInstruction += `

═══════════════════════════════════════════════════════════════════════════════
KRITISKT - GENERERADE BILDER MED PUBLIKA URLs
═══════════════════════════════════════════════════════════════════════════════

${imagesWithUrls.length} bild(er) har genererats och sparats med PUBLIKA URLs.
Du MÅSTE använda dessa EXAKTA URLs i koden - annars visas inte bilderna!

BILDER ATT ANVÄNDA:
`;
          imagesWithUrls.forEach((img, i) => {
            const shortPrompt = img.prompt.substring(0, 60);
            codeInstruction += `
${i + 1}. Beskrivning: "${shortPrompt}${img.prompt.length > 60 ? "..." : ""}"
   URL: ${img.url}
`;
          });

          codeInstruction += `
REGLER:
- Använd dessa URLs EXAKT som de visas ovan i <img src="..."> eller Image-komponenter
- Använd INTE placeholder-bilder (unsplash, placeholder.com, etc.)
- Använd INTE lokala sökvägar (/images/, ./assets/, etc.)
- Sätt lämplig alt-text baserat på bildbeskrivningen
- Placera bilderna på logiska ställen i designen

═══════════════════════════════════════════════════════════════════════════════
`;
        } else {
          // Fallback if no blob storage - warn clearly
          console.warn(
            "[Orchestrator] ⚠️ No images have public URLs - v0 preview won't show them"
          );
          codeInstruction += `\n\n⚠️ OBS: ${generatedImages.length} bild(er) genererades men kunde INTE sparas med publika URLs. 
Bilderna kommer INTE visas i preview. Lägg till placeholder-bilder tills vidare.`;
        }
      }

      debugLog("[Orchestrator] Calling v0 for code", {
        instructionLength: codeInstruction.length,
        hasExistingChat: !!context.existingChatId,
      });
      workflowSteps.push("Uppdaterar webbplatskod med v0");

      let v0Result;
      if (context.existingChatId && context.existingCode) {
        // Refinement mode
        v0Result = await refineCode(
          context.existingChatId,
          context.existingCode,
          codeInstruction,
          context.quality
        );
      } else {
        // New generation
        v0Result = await generateCode(codeInstruction, context.quality);
      }

      workflowSteps.push("Webbplatskod uppdaterad!");

      return {
        success: true,
        message: "Klart! Jag har uppdaterat din webbplats.",
        intent,
        code: v0Result.code,
        files: v0Result.files,
        chatId: v0Result.chatId,
        demoUrl: v0Result.demoUrl,
        versionId: v0Result.versionId,
        webSearchResults:
          webSearchResults.length > 0 ? webSearchResults : undefined,
        generatedImages:
          generatedImages.length > 0 ? generatedImages : undefined,
        workflowSteps,
        // NEW: Include enrichment info for debugging
        routerResult,
        codeContext,
        enrichedPrompt: codeContext ? codeInstruction : undefined,
      };
    }

    // Fallback - shouldn't reach here but just in case
    return {
      success: false,
      message: "Kunde inte avgöra vad som skulle göras. Försök igen.",
      intent,
      error: "Unknown workflow path",
      workflowSteps,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";
    debugLog("[Orchestrator] Workflow failed", { error: errorMessage });

    return {
      success: false,
      message: "Något gick fel. Försök igen.",
      error: errorMessage,
      workflowSteps,
    };
  }
}

/**
 * Check if prompt needs orchestration
 *
 * VERSION 2.0: Uses semantic analysis instead of keyword matching!
 *
 * This function now delegates to the Semantic Router helper for
 * a quick check. The actual routing happens in orchestrateWorkflow.
 *
 * Returns true when:
 * 1. AI image GENERATION (not using existing images)
 * 2. Web search/research for external info
 * 3. References to specific UI elements that need code context
 * 4. Complex/vague prompts that need semantic understanding
 *
 * Returns false for:
 * - Simple code changes ("gör bakgrunden blå")
 * - Using existing images from mediabibliotek
 * - Direct layout/design changes
 */
export function needsOrchestration(prompt: string): boolean {
  // Use the new shouldRoute helper from semantic-router
  // This provides a quick heuristic check
  const shouldUseRouter = shouldRoute(prompt);

  if (shouldUseRouter) {
    debugLog("[Orchestrator] TRIGGER - semantic routing needed", {
      promptPreview: prompt.substring(0, 50),
    });
    return true;
  }

  // Additional legacy checks for backward compatibility
  const lower = prompt.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // FAST EXITS - These should go DIRECTLY to v0 (no orchestration)
  // ═══════════════════════════════════════════════════════════════════════

  // 1. User has PUBLIC URLs in prompt - they want to USE images, not generate
  if (
    prompt.includes("blob.vercel-storage.com") ||
    prompt.includes("images.unsplash.com") ||
    prompt.includes("/api/uploads/") ||
    prompt.includes("EXAKTA URLs") ||
    prompt.includes("publika URLs")
  ) {
    debugLog("[Orchestrator] SKIP - prompt has public URLs (send to v0)");
    return false;
  }

  // 2. References to mediabibliotek with existing images - v0 can handle
  if (
    (lower.includes("mediabibliotek") ||
      lower.includes("uppladdade") ||
      lower.includes("min bild") ||
      lower.includes("mina bilder")) &&
    !lower.includes("generera") &&
    !lower.includes("skapa ny")
  ) {
    debugLog("[Orchestrator] SKIP - references existing media (send to v0)");
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ORCHESTRATION TRIGGERS - Complex cases that need smart handling
  // ═══════════════════════════════════════════════════════════════════════

  // 1. AI IMAGE GENERATION - user explicitly wants NEW images created
  const imageGenerationKeywords = [
    "generera en bild",
    "generera bild",
    "skapa en ny bild",
    "generate image",
    "generera logo",
    "ai-generera",
    "dall-e",
    "gpt-image",
  ];

  // 2. WEB SEARCH - user wants info from external websites
  const webSearchKeywords = [
    "gå till webbplatsen",
    "besök sidan",
    "kolla på deras",
    "analysera webbplatsen",
    "hämta från",
    "kopiera från",
    "researcha",
    "konkurrenternas",
  ];

  // 3. REFERENCES TO SPECIFIC ELEMENTS (NEW!) - needs code context
  const codeContextKeywords = [
    "den länken",
    "den knappen",
    "headern",
    "navbaren",
    "footern",
    "den sektionen",
    "det elementet",
    "den texten där",
  ];

  const needsImageGen = imageGenerationKeywords.some((kw) =>
    lower.includes(kw)
  );
  const needsWebSearch = webSearchKeywords.some((kw) => lower.includes(kw));
  const needsCodeContext = codeContextKeywords.some((kw) => lower.includes(kw));

  if (needsImageGen) {
    debugLog("[Orchestrator] TRIGGER - needs AI image generation");
    return true;
  }

  if (needsWebSearch) {
    debugLog("[Orchestrator] TRIGGER - needs web search");
    return true;
  }

  if (needsCodeContext) {
    debugLog("[Orchestrator] TRIGGER - needs code context analysis");
    return true;
  }

  // Default: Send to v0 directly (no orchestration)
  debugLog("[Orchestrator] SKIP - no complex workflow detected (send to v0)");
  return false;
}
