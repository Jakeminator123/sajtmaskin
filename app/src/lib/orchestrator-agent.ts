/**
 * Orchestrator Agent 4.0 (AI SDK 6)
 * =================================
 *
 * Smart meta-agent som koordinerar arbetsflöden mellan olika verktyg.
 * Nu med AI SDK 6 för bättre streaming och strukturerad output.
 *
 * NYTT FLÖDE (4.0):
 * 1. Semantic Router analyserar prompten (AI SDK 6 streamText)
 * 2. Om needs_code_context → Code Crawler hittar relevanta koddelar (ingen AI)
 * 3. Semantic Enhancer förbättrar prompten semantiskt (AI SDK 6 generateText)
 * 4. Prompt Enricher kombinerar allt till slutlig prompt
 * 5. Berikad prompt skickas till v0
 *
 * KOMPONENTER OCH ROLLER:
 * - Semantic Router: Klassificerar intent (simple_code, needs_code_context, etc.)
 * - Code Crawler: Hittar relevanta koddelar (INGEN AI, bara sökning)
 * - Semantic Enhancer: Förbättrar prompten semantiskt (NY!)
 * - Prompt Enricher: Kombinerar allt till slutlig prompt
 *
 * FÖRBÄTTRINGAR I 4.0:
 * - AI SDK 6 med streamText/generateText för bättre streaming
 * - Semantic Enhancer för bättre prompt-förbättring
 * - Code Crawler utan AI (snabbare, billigare)
 * - Tydligare separation av ansvar mellan komponenter
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
  semanticEnhance,
  type EnhancementResult,
} from "@/lib/semantic-enhancer";
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
import { getUserSettings } from "@/lib/database";
import OpenAI from "openai";
// Note: AI SDK 6 (streamText, generateText) is used in semantic-router.ts and semantic-enhancer.ts
// OpenAI SDK is still needed here for image generation and web search native tools
export { enhancePromptForV0 } from "./prompt-utils";

// AI Agent Mode (optional - enabled via feature flags)
import { shouldUseAgentMode, runAgentOrchestration } from "./ai-agent";

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
// Supports user's own API key via AI Gateway or direct OpenAI
function getOpenAIClient(userId?: string): OpenAI {
  // Try to get user's API key if userId provided
  if (userId) {
    try {
      const settings = getUserSettings(userId);

      // If user has AI Gateway enabled and has a key
      if (settings?.use_ai_gateway && settings.ai_gateway_api_key) {
        console.log("[Orchestrator] Using user's AI Gateway key");
        return new OpenAI({
          apiKey: settings.ai_gateway_api_key,
          baseURL: "https://ai-gateway.vercel.sh/v1",
        });
      }

      // If user has their own OpenAI key
      if (settings?.openai_api_key) {
        console.log("[Orchestrator] Using user's OpenAI key");
        return new OpenAI({ apiKey: settings.openai_api_key });
      }
    } catch (e) {
      console.warn("[Orchestrator] Could not get user settings:", e);
    }
  }

  // Check for platform AI Gateway key
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    console.log("[Orchestrator] Using platform AI Gateway");
    return new OpenAI({
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
  }

  // Fallback to platform OpenAI key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// Initialize OpenAI client specifically for IMAGE GENERATION
// CRITICAL: AI Gateway does NOT support image endpoints (gpt-image-1, dall-e-3)
// Image generation must ALWAYS use direct OpenAI API
function getImageClient(userId?: string): OpenAI {
  // Try to get user's own OpenAI key (NOT AI Gateway)
  if (userId) {
    try {
      const settings = getUserSettings(userId);

      // User's direct OpenAI key (preferred for images)
      if (settings?.openai_api_key) {
        console.log("[Orchestrator] Image gen: Using user's OpenAI key");
        return new OpenAI({ apiKey: settings.openai_api_key });
      }
    } catch (e) {
      console.warn("[Orchestrator] Could not get user settings for image:", e);
    }
  }

  // Fallback to platform OpenAI key (NEVER use AI Gateway for images)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY required for image generation (AI Gateway not supported)"
    );
  }
  console.log("[Orchestrator] Image gen: Using platform OpenAI key");
  return new OpenAI({ apiKey });
}

/**
 * Extract context hints from a vague prompt for Smart Clarify.
 * Tries to identify what the user might be referring to.
 *
 * IMPROVED: Better filtering to avoid false positives and reduce unnecessary crawler runs.
 */
function extractHintsFromPrompt(prompt: string): string[] {
  const hints: string[] = [];
  const lower = prompt.toLowerCase();

  // Common UI elements - only add when they appear with context
  // (e.g., "ändra headern" but not just "header" alone in longer text)
  const uiElements: Record<string, string[]> = {
    // Swedish terms with English equivalents
    länk: ["länken", "länkarna"],
    knapp: ["knappen", "knapparna", "cta"],
    header: ["headern", "header"],
    footer: ["footern", "footer"],
    nav: ["navbaren", "navbar", "nav", "menyn"],
    hero: ["hero", "hero-sektion"],
    sidebar: ["sidebaren", "sidebar"],
    bild: ["bilden", "bilderna", "image"],
    rubrik: ["rubriken", "rubrikerna", "heading"],
    sektion: ["sektionen", "section"],
    formulär: ["formuläret", "formen", "form"],
    kort: ["kortet", "korten", "card"],
    modal: ["modalen", "popup"],
    tabell: ["tabellen", "table"],
    lista: ["listan", "list"],
  };

  for (const [category, terms] of Object.entries(uiElements)) {
    for (const term of terms) {
      // Check for definite forms (more specific)
      if (lower.includes(term)) {
        hints.push(category);
        break; // Don't add duplicates for same category
      }
    }
  }

  // Extract quoted strings (user explicitly mentions something)
  const quotedMatches = prompt.match(/["']([^"']+)["']/g);
  if (quotedMatches) {
    for (const match of quotedMatches) {
      const content = match.replace(/["']/g, "").trim();
      if (content.length > 1 && content.length < 50) {
        hints.push(content);
      }
    }
  }

  // Extract specific component names (PascalCase words)
  const words = prompt.split(/\s+/);
  for (const word of words) {
    // PascalCase words (likely component names)
    if (/^[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(word) && word.length > 3) {
      hints.push(word);
    }
  }

  // Deduplicate and limit hints
  const uniqueHints = [...new Set(hints)];
  return uniqueHints.slice(0, 5); // Max 5 hints to keep searches focused
}

/**
 * Decide if we should run Code Crawler for clarify intent.
 * We only run it when the prompt suggests a specific UI element or context.
 *
 * NOTE: needsCodeContext is already checked in main flow before this is called,
 * so we only check contextHints here.
 */
function shouldRunSmartClarify(
  prompt: string,
  routerResult: RouterResult
): boolean {
  // If router provided hints, use them to run crawler
  if (routerResult.contextHints.length > 0) {
    return true;
  }

  // Very short/vague prompt → skip (likely needs user clarification without code context)
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

    // Extract text from response - try output_text helper first, then fallback to parsing output array
    let question = "";

    // Method 1: Use output_text helper if available (standard SDK approach)
    if (
      typeof response.output_text === "string" &&
      response.output_text.trim()
    ) {
      question = response.output_text.trim();
    }
    // Method 2: Parse output array manually (fallback for different SDK versions)
    else if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (
              content.type === "output_text" &&
              typeof content.text === "string"
            ) {
              question = content.text.trim();
              break;
            }
          }
          if (question) break;
        }
      }
    }

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
  screenshotUrl?: string;
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

  /**
   * v0 preview sometimes breaks when the generated code imports from the invalid module
   * specifier "three/examples" (note: without /jsm or /addons). In v0's ESM proxy this
   * resolves to a non-existent path and returns text/plain (proxy 404), causing a black iframe.
   *
   * We can detect this pattern in returned files and run a single automatic "repair" refinement
   * in the same chat to restore a working preview.
   */
  const hasBrokenThreeExamplesImport = (
    files?: Array<{ name: string; content: string }>
  ): boolean => {
    if (!files || files.length === 0) return false;

    // Match ONLY the invalid bare import "three/examples" (no subpath).
    // Avoid flagging valid imports like "three/examples/jsm/..." or "three/addons/...".
    const patterns: RegExp[] = [
      /\bfrom\s+["']three\/examples["']/,
      /\bimport\s+["']three\/examples["']/,
      /\bimport\s*\(\s*["']three\/examples["']\s*\)/,
    ];

    return files.some((f) => patterns.some((p) => p.test(f.content)));
  };

  try {
    debugLog("[Orchestrator] Starting workflow 2.0", {
      promptLength: userPrompt.length,
      quality: context.quality,
      hasExistingChat: !!context.existingChatId,
      hasExistingCode: !!context.existingCode,
      hasProjectFiles: !!context.projectFiles?.length,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // AGENT MODE (AI SDK 6) - Optional alternative flow
    // When enabled, uses ToolLoopAgent for smarter orchestration
    // ═══════════════════════════════════════════════════════════════════════
    if (shouldUseAgentMode()) {
      console.log("[Orchestrator] Agent Mode enabled - using AI Agent flow");
      workflowSteps.push("🤖 Agent Mode aktiverat");

      try {
        const agentResult = await runAgentOrchestration(userPrompt, {
          userId: context.userId || "anonymous",
          projectFiles: context.projectFiles,
          existingCode: context.existingCode,
          quality: context.quality,
        });

        workflowSteps.push(...agentResult.steps);

        // Agent has processed the prompt - now send to v0
        const v0Result =
          context.existingChatId && context.existingCode
            ? await refineCode(
                context.existingChatId,
                context.existingCode,
                agentResult.processedPrompt,
                context.quality
              )
            : await generateCode(agentResult.processedPrompt, context.quality);

        workflowSteps.push("Webbplatskod uppdaterad via Agent Mode!");

        return {
          success: true,
          message: "Klart! (Agent Mode)",
          intent: agentResult.intent as UserIntent,
          code: v0Result.code,
          files: v0Result.files,
          chatId: v0Result.chatId,
          demoUrl: v0Result.demoUrl,
          screenshotUrl: v0Result.screenshotUrl,
          versionId: v0Result.versionId,
          workflowSteps,
        };
      } catch (agentError) {
        console.warn(
          "[Orchestrator] Agent Mode failed, falling back:",
          agentError
        );
        workflowSteps.push(
          "⚠️ Agent Mode misslyckades, använder standard-flöde"
        );
        // Fall through to standard flow
      }
    }

    const client = getOpenAIClient(context.userId);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: SEMANTIC ROUTING (NEW!)
    // Use the new semantic router for better intent detection
    // ═══════════════════════════════════════════════════════════════════════

    console.log("[Orchestrator] Step 1: Routing prompt...");

    let codeContext: CodeContext | undefined;

    // OPTIMIZATION: Fast-path for simple code prompts (skip semantic router)
    // This reduces latency by ~2-5 seconds for straightforward requests
    // IMPROVED: Better detection of fast-path eligible prompts
    const isFastPathEligible = (() => {
      // Must have existing code to refine
      if (!context.existingCode) return false;

      // Semantic router says to skip AND prompt is clear enough
      if (!shouldRoute(userPrompt) && userPrompt.trim().length >= 20)
        return true;

      // Additional fast-path patterns (common simple changes)
      const lower = userPrompt.toLowerCase();
      const simplePatterns = [
        /^(gör|ändra|sätt|byt).{0,20}(färg|bakgrund|font|storlek|padding|margin)/i,
        /^(lägg till|ta bort|dölj|visa).{0,15}(knapp|text|bild|länk)/i,
        /^(centrera|justera|flytta).{0,20}/i,
      ];

      if (simplePatterns.some((p) => p.test(lower)) && userPrompt.length < 80) {
        return true;
      }

      return false;
    })();

    let routerResult: RouterResult;

    if (isFastPathEligible) {
      console.log(
        "[Orchestrator] Fast-path: Simple code change, skipping semantic router"
      );
      workflowSteps.push("Fast-path: Direkt till v0 (enkel ändring)");
      routerResult = {
        intent: "simple_code",
        confidence: 0.9,
        needsCodeContext: false,
        contextHints: [],
        codeInstruction: userPrompt,
        reasoning: "Fast-path för enkel kodändring",
      };
    } else {
      // Use semantic router with timeout protection
      // NOTE: This timeout is for the router ONLY (gpt-4o-mini classification)
      // Other operations (Code Crawler, Web Search, Image Gen, v0) have their own timeouts
      // or are bounded by the API route's maxDuration (300s on Vercel)
      // WARNING: Render Free tier has a 30s TOTAL timeout - upgrade to Starter for complex workflows
      const ROUTER_TIMEOUT_MS = 30000; // 30s - generous for slow OpenAI days
      try {
        const routerPromise = routePrompt(userPrompt, !!context.existingCode);
        const timeoutPromise = new Promise<RouterResult>((_, reject) =>
          setTimeout(
            () => reject(new Error("Router timeout")),
            ROUTER_TIMEOUT_MS
          )
        );
        routerResult = await Promise.race([routerPromise, timeoutPromise]);
      } catch (error) {
        // Timeout or error - fallback to simple_code
        console.warn(
          "[Orchestrator] Router timeout/error, using fallback:",
          error
        );
        workflowSteps.push("⚠️ Router timeout - fallback till simple_code");
        routerResult = {
          intent: "simple_code",
          confidence: 0.6,
          needsCodeContext: false,
          contextHints: [],
          codeInstruction: userPrompt,
          reasoning: "Fallback pga timeout",
        };
      }
    }

    // Log reasoning only (intent already logged by SemanticRouter)
    console.log(`[Orchestrator] Reasoning: "${routerResult.reasoning}"`);

    workflowSteps.push(
      `Semantic Router: ${routerResult.intent} (${Math.round(
        routerResult.confidence * 100
      )}% confidence)`
    );
    workflowSteps.push(`Reasoning: ${routerResult.reasoning}`);

    // FIX: Use confidence for decision making
    // Very low confidence → ask for clarification
    if (routerResult.confidence < 0.4 && routerResult.intent !== "clarify") {
      console.log(
        `[Orchestrator] Low confidence (${routerResult.confidence}) - asking for clarification`
      );
      workflowSteps.push(
        `⚠️ Låg confidence (${Math.round(
          routerResult.confidence * 100
        )}%) - ber om förtydligande`
      );
      return {
        success: true,
        message: `Jag är inte helt säker på vad du vill göra. Kan du förtydliga? (Jag tolkade det som "${routerResult.intent}")`,
        intent: "clarify",
        clarifyQuestion: `Kan du vara mer specifik om vad du vill ändra?`,
        workflowSteps,
      };
    }

    // Medium confidence → log warning but continue
    if (routerResult.confidence < 0.6) {
      console.warn(
        `[Orchestrator] Medium confidence (${routerResult.confidence}) for intent ${routerResult.intent}`
      );
      workflowSteps.push(
        `⚠️ Medium confidence (${Math.round(routerResult.confidence * 100)}%)`
      );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2A: MAP SEMANTIC INTENT TO LEGACY INTENT (moved here for use below)
    // ═══════════════════════════════════════════════════════════════════════

    const intentMapping: Record<SemanticIntent, UserIntent> = {
      simple_code: "code_only",
      needs_code_context: "code_only",
      web_search: "web_search_only",
      image_gen: "image_only",
      web_and_code: "web_search_and_code",
      image_and_code: "image_and_code",
      clarify: "clarify",
      chat_response: "chat_response",
    };

    const intent: UserIntent = intentMapping[routerResult.intent];

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2B: CODE CRAWLER (if needed)
    // Analyze project files to find relevant code context
    // SMART CLARIFY: Only for clarify when UI hints are present
    // ═══════════════════════════════════════════════════════════════════════

    // FIX: Simplified crawler trigger - only run when explicitly needed
    // Removed simple_code trigger which was causing crawler to run too often
    const shouldRunCodeCrawler =
      context.projectFiles?.length &&
      // Only run when router EXPLICITLY says code context is needed
      (routerResult.needsCodeContext ||
        // Or for clarify when the prompt references specific UI elements
        (routerResult.intent === "clarify" &&
          shouldRunSmartClarify(userPrompt, routerResult)));
    // REMOVED: simple_code + hints trigger (triggered too often)

    if (shouldRunCodeCrawler && context.projectFiles) {
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
        // FIX: Code Crawler is for ENRICHMENT, not validation
        // Don't skip v0 call just because crawler found nothing
        workflowSteps.push("Inga matchande kodsektioner hittades");
        workflowSteps.push(
          "Fortsätter ändå till v0 (crawler är enrichment, inte validation)"
        );
        console.log(
          "[Orchestrator] Code Crawler found nothing but continuing to v0"
        );
        // shouldApplyCodeChanges remains true - don't skip v0
      }
    } else if (routerResult.needsCodeContext && !context.projectFiles?.length) {
      console.log(
        "[Orchestrator] Code context needed but no project files available"
      );
      workflowSteps.push("⚠️ Kodkontext behövs men inga filer tillgängliga");
      // FIX: Still try v0 - it might work without context
      workflowSteps.push("Försöker ändå med v0");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: BUILD CLASSIFICATION OBJECT
    // For backward compatibility with existing code
    // ═══════════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: HANDLE EACH INTENT TYPE
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

          // CRITICAL: Use dedicated image client (NOT AI Gateway which doesn't support images)
          const imageClient = getImageClient(context.userId);

          // Prefer gpt-image-1 for quality; fallback to dall-e-3 if unavailable
          let base64Data: string | undefined;
          try {
            // gpt-image-1 does NOT support response_format - it returns base64 by default
            const gptImageResponse = await imageClient.images.generate({
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
            const dalleResponse = await imageClient.images.generate({
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

        // Clean up generatedImages: Remove base64 if we have blob URLs
        const cleanedImages =
          generatedImages.length > 0
            ? generatedImages.map((img) => {
                // If we have a blob URL, remove base64 (not needed for storage)
                if (img.url) {
                  return {
                    prompt: img.prompt,
                    url: img.url,
                  };
                }
                // Keep base64 only if no URL (fallback for display)
                return {
                  prompt: img.prompt,
                  base64: img.base64,
                };
              })
            : undefined;

        return {
          success: imageCount > 0,
          message,
          intent,
          generatedImages: cleanedImages,
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
      // Build the code instruction using Prompt Enricher
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

      // Auto-repair: Detect and fix a known v0 preview-breaker for Three.js
      // (imports from "three/examples" are invalid and cause esm.v0.app to return text/plain).
      if (hasBrokenThreeExamplesImport(v0Result.files) && v0Result.chatId) {
        console.warn(
          "[Orchestrator] Detected broken Three.js import 'three/examples' in v0 output. Running auto-repair refine..."
        );
        workflowSteps.push("Reparerar Three.js-importer (preview-fix)");

        const repairInstruction = `FIX PREVIEW-BREAKING THREE.JS IMPORTS (CRITICAL):

The generated code contains one or more imports from "three/examples" (without /jsm or /addons).
This is NOT a valid module and breaks v0's preview (esm proxy returns text/plain / 404).

Please repair the code so it works in an ESM environment:
- DO NOT import from "three/examples"
- Instead import the needed modules from:
  - "three/examples/jsm/..." (preferred), OR
  - "three/addons/..." (acceptable for newer Three.js)
- Keep all existing functionality and visuals as-is, only fix the imports/paths.

If OrbitControls is used, import it from:
- "three/examples/jsm/controls/OrbitControls"

If GLTFLoader is used, import it from:
- "three/examples/jsm/loaders/GLTFLoader"

If any other loader/control is used, import it from its correct "three/examples/jsm/..." path.

After fixing, ensure there are no remaining "three/examples" bare imports anywhere.`;

        const repaired = await refineCode(
          v0Result.chatId,
          v0Result.code || "",
          repairInstruction,
          context.quality
        );

        // If repair succeeded, replace result; otherwise return original and let user know via steps.
        if (repaired?.files && repaired.files.length > 0) {
          v0Result = repaired;
        } else {
          console.warn(
            "[Orchestrator] Auto-repair refine did not return files; keeping original result."
          );
          workflowSteps.push(
            "Kunde inte auto-reparera preview helt (prova att be om 'fixa three-importer')"
          );
        }
      }

      workflowSteps.push("Webbplatskod uppdaterad!");

      // Clean up generatedImages: Remove base64 if we have blob URLs
      // This reduces storage size and ensures we only use public URLs
      const cleanedImages =
        generatedImages.length > 0
          ? generatedImages.map((img) => {
              // If we have a blob URL, remove base64 (not needed for storage)
              // Keep base64 only if no URL exists (fallback for display)
              if (img.url) {
                return {
                  prompt: img.prompt,
                  url: img.url,
                  // Explicitly omit base64 when we have URL
                };
              }
              // Keep base64 only if no URL (shouldn't happen but safety fallback)
              return {
                prompt: img.prompt,
                base64: img.base64,
              };
            })
          : undefined;

      return {
        success: true,
        message: "Klart! Jag har uppdaterat din webbplats.",
        intent,
        code: v0Result.code,
        files: v0Result.files,
        chatId: v0Result.chatId,
        demoUrl: v0Result.demoUrl,
        screenshotUrl: v0Result.screenshotUrl,
        versionId: v0Result.versionId,
        webSearchResults:
          webSearchResults.length > 0 ? webSearchResults : undefined,
        generatedImages: cleanedImages,
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

// ============================================================================
// STREAMING ORCHESTRATOR (AI SDK 6)
// ============================================================================

export interface StreamingCallbacks {
  onThinking?: (thought: string) => void;
  onProgress?: (step: string, stepNumber?: number, totalSteps?: number) => void;
  onEnhancement?: (original: string, enhanced: string) => void;
}

/**
 * Streaming version of orchestrateWorkflow with AI SDK 6
 *
 * Uses streamText for real-time feedback during semantic routing,
 * and generateText for semantic enhancement.
 */
export async function orchestrateWorkflowStreaming(
  userPrompt: string,
  context: OrchestratorContext,
  callbacks: StreamingCallbacks
): Promise<OrchestratorResult> {
  const { onThinking, onProgress, onEnhancement } = callbacks;
  const workflowSteps: string[] = [];

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: SEMANTIC ROUTER (with streaming thinking)
    // ═══════════════════════════════════════════════════════════════════════
    onProgress?.("Analyserar prompt...", 1, 5);
    onThinking?.("Analyserar din förfrågan för att förstå vad du vill göra...");

    // Check for fast-path eligibility
    const isFastPathEligible = (() => {
      if (!context.existingCode) return false;
      if (!shouldRoute(userPrompt) && userPrompt.trim().length >= 20)
        return true;
      const lower = userPrompt.toLowerCase();
      const simplePatterns = [
        /^(gör|ändra|sätt|byt).{0,20}(färg|bakgrund|font|storlek|padding|margin)/i,
        /^(lägg till|ta bort|dölj|visa).{0,15}(knapp|text|bild|länk)/i,
        /^(centrera|justera|flytta).{0,20}/i,
      ];
      if (simplePatterns.some((p) => p.test(lower)) && userPrompt.length < 80) {
        return true;
      }
      return false;
    })();

    let routerResult: RouterResult;

    if (isFastPathEligible) {
      onThinking?.("Enkel ändring detekterad, hoppar över semantisk analys...");
      workflowSteps.push("Fast-path: Direkt till v0 (enkel ändring)");
      routerResult = {
        intent: "simple_code",
        confidence: 0.9,
        needsCodeContext: false,
        contextHints: [],
        codeInstruction: userPrompt,
        reasoning: "Fast-path för enkel kodändring",
      };
    } else {
      // Use semantic router with streaming feedback
      try {
        routerResult = await routePrompt(userPrompt, !!context.existingCode);
        onThinking?.(
          `Intent: ${routerResult.intent} (${Math.round(
            routerResult.confidence * 100
          )}% confidence)`
        );
      } catch (error) {
        console.warn("[Orchestrator] Router error, using fallback:", error);
        workflowSteps.push("⚠️ Router timeout - fallback till simple_code");
        routerResult = {
          intent: "simple_code",
          confidence: 0.6,
          needsCodeContext: false,
          contextHints: [],
          codeInstruction: userPrompt,
          reasoning: "Fallback pga timeout",
        };
      }
    }

    workflowSteps.push(
      `Semantic Router: ${routerResult.intent} (${Math.round(
        routerResult.confidence * 100
      )}%)`
    );

    // Handle low confidence
    if (routerResult.confidence < 0.4 && routerResult.intent !== "clarify") {
      onThinking?.("Osäker på vad du vill göra, ber om förtydligande...");
      return {
        success: true,
        message: `Jag är inte helt säker på vad du vill göra. Kan du förtydliga?`,
        intent: "clarify",
        clarifyQuestion: `Kan du vara mer specifik om vad du vill ändra?`,
        workflowSteps,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: CODE CRAWLER (if needed)
    // ═══════════════════════════════════════════════════════════════════════
    let codeContext: CodeContext | undefined;

    const shouldRunCodeCrawler =
      context.projectFiles?.length &&
      (routerResult.needsCodeContext ||
        (routerResult.intent === "clarify" &&
          shouldRunSmartClarify(userPrompt, routerResult)));

    if (shouldRunCodeCrawler && context.projectFiles) {
      onProgress?.("Söker i projektfiler...", 2, 5);
      onThinking?.("Letar efter relevanta koddelar i ditt projekt...");

      const hints =
        routerResult.contextHints.length > 0
          ? routerResult.contextHints
          : extractHintsFromPrompt(userPrompt);

      codeContext = await crawlCodeContext(
        context.projectFiles,
        hints,
        userPrompt
      );

      if (codeContext.relevantFiles.length > 0) {
        onThinking?.(
          `Hittade ${codeContext.relevantFiles.length} relevanta filer`
        );
        workflowSteps.push(
          `Hittade ${codeContext.relevantFiles.length} relevanta filer`
        );
      } else {
        onThinking?.("Inga matchande filer hittades, fortsätter ändå...");
        workflowSteps.push("Inga matchande kodsektioner hittades");
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: SEMANTIC ENHANCER (AI SDK 6)
    // ═══════════════════════════════════════════════════════════════════════
    let enhancementResult: EnhancementResult | undefined;

    // Only enhance for code-related intents that might benefit
    const shouldEnhance =
      (routerResult.intent === "simple_code" ||
        routerResult.intent === "needs_code_context" ||
        routerResult.intent === "image_and_code" ||
        routerResult.intent === "web_and_code") &&
      userPrompt.length >= 10 &&
      userPrompt.length < 200; // Don't enhance very long prompts

    if (shouldEnhance) {
      onProgress?.("Förbättrar prompten...", 3, 5);
      onThinking?.("Gör din förfrågan mer specifik och teknisk...");

      try {
        enhancementResult = await semanticEnhance({
          originalPrompt: userPrompt,
          codeContext,
          routerResult,
        });

        if (enhancementResult.wasEnhanced) {
          onEnhancement?.(userPrompt, enhancementResult.enhancedPrompt);
          onThinking?.(
            `Prompt förbättrad: "${enhancementResult.enhancedPrompt.substring(
              0,
              80
            )}..."`
          );
          workflowSteps.push("Semantic Enhancer: Förbättrade prompten");
        }
      } catch (error) {
        console.warn("[Orchestrator] Enhancement failed:", error);
        // Continue without enhancement
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: MAP INTENT AND HANDLE SPECIAL CASES
    // ═══════════════════════════════════════════════════════════════════════
    const intentMapping: Record<SemanticIntent, UserIntent> = {
      simple_code: "code_only",
      needs_code_context: "code_only",
      web_search: "web_search_only",
      image_gen: "image_only",
      web_and_code: "web_search_and_code",
      image_and_code: "image_and_code",
      clarify: "clarify",
      chat_response: "chat_response",
    };

    const intent: UserIntent = intentMapping[routerResult.intent];

    // Handle chat_response
    if (intent === "chat_response") {
      return {
        success: true,
        message: routerResult.chatResponse || "Jag förstår!",
        intent,
        chatResponse: routerResult.chatResponse,
        workflowSteps,
      };
    }

    // Handle clarify with Smart Clarify
    if (intent === "clarify") {
      if (codeContext && codeContext.relevantFiles.length > 0) {
        onThinking?.("Genererar specifik fråga baserat på hittade element...");
        const client = getOpenAIClient(context.userId);
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
          codeContext,
        };
      }
      return {
        success: true,
        message:
          routerResult.clarifyQuestion || "Kan du förtydliga vad du menar?",
        intent,
        clarifyQuestion: routerResult.clarifyQuestion,
        workflowSteps,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: EXECUTE WORKFLOW (delegera till huvudfunktionen)
    // ═══════════════════════════════════════════════════════════════════════
    onProgress?.("Genererar kod...", 4, 5);
    onThinking?.("Skickar till v0 för kodgenerering...");

    // Build enriched prompt using Prompt Enricher
    const enrichedPrompt = enrichPrompt({
      originalPrompt: userPrompt,
      enhancedPrompt: enhancementResult?.enhancedPrompt,
      routerResult,
      codeContext,
    });

    // Call the main orchestrator with pre-computed context
    // This avoids re-running router and crawler
    const result = await executeWorkflowWithContext(
      userPrompt,
      context,
      {
        routerResult,
        codeContext,
        enhancementResult,
        enrichedPrompt,
        intent,
      },
      (step) => {
        onThinking?.(step);
      }
    );

    onProgress?.("Klar!", 5, 5);

    if (result.success) {
      if (result.code || result.demoUrl) {
        onThinking?.("Kodgenerering klar! Förbereder preview...");
      } else if (result.generatedImages?.length) {
        onThinking?.(`${result.generatedImages.length} bild(er) genererade!`);
      }
    }

    return {
      ...result,
      workflowSteps: [...workflowSteps, ...(result.workflowSteps || [])],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";
    onThinking?.(`Fel: ${errorMessage}`);
    return {
      success: false,
      message: "Något gick fel. Försök igen.",
      error: errorMessage,
      workflowSteps,
    };
  }
}

// ============================================================================
// EXECUTE WORKFLOW WITH PRE-COMPUTED CONTEXT
// ============================================================================

interface PreComputedContext {
  routerResult: RouterResult;
  codeContext?: CodeContext;
  enhancementResult?: EnhancementResult;
  enrichedPrompt: string;
  intent: UserIntent;
}

/**
 * Execute workflow with pre-computed context from streaming orchestrator.
 * This avoids re-running router and crawler.
 */
async function executeWorkflowWithContext(
  userPrompt: string,
  context: OrchestratorContext,
  preComputed: PreComputedContext,
  onStep?: (step: string) => void
): Promise<OrchestratorResult> {
  const {
    routerResult,
    codeContext,
    // enhancementResult is used indirectly via enrichedPrompt
    enrichedPrompt,
    intent,
  } = preComputed;
  const workflowSteps: string[] = [];
  const client = getOpenAIClient(context.userId);

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

  // Handle web search if needed
  if (
    (intent === "web_search_only" || intent === "web_search_and_code") &&
    routerResult.searchQuery
  ) {
    onStep?.("Söker på webben...");
    workflowSteps.push(`Söker online: ${routerResult.searchQuery}`);

    try {
      const searchResponse = await client.responses.create({
        model: "gpt-4o-mini",
        instructions:
          "Du är en webbdesign-expert. Baserat på web search-resultaten, ge en informativ sammanfattning på svenska.",
        input: routerResult.searchQuery,
        tools: [{ type: "web_search" }],
        store: false,
      });

      webSearchContext = searchResponse.output_text || "";
      workflowSteps.push("Sammanställde information från webbsökning");
    } catch (error) {
      console.error("[Orchestrator] Web search failed:", error);
      workflowSteps.push("Webbsökning misslyckades");
    }

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

  // Handle image generation if needed
  if (
    (intent === "image_only" || intent === "image_and_code") &&
    routerResult.imagePrompt
  ) {
    onStep?.("Genererar bild med AI...");
    workflowSteps.push("Genererar bild");

    try {
      const imagePrompt = routerResult.imagePrompt;

      // Check if it's already a URL
      if (
        imagePrompt.startsWith("http://") ||
        imagePrompt.startsWith("https://")
      ) {
        generatedImages.push({ prompt: "Befintlig bild", url: imagePrompt });
      } else {
        // Generate new image - CRITICAL: Use direct OpenAI client (NOT AI Gateway)
        const imageClient = getImageClient(context.userId);
        let base64Data: string | undefined;
        try {
          const gptImageResponse = await imageClient.images.generate({
            model: "gpt-image-1",
            prompt: imagePrompt,
            size: "1024x1024",
            quality: "low",
            n: 1,
          });
          base64Data = gptImageResponse.data?.[0]?.b64_json;
        } catch {
          const dalleResponse = await imageClient.images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            size: "1024x1024",
            quality: "standard",
            n: 1,
            response_format: "b64_json",
          });
          base64Data = dalleResponse.data?.[0]?.b64_json;
        }

        if (base64Data) {
          const blobUrl = await saveImageToBlob(
            base64Data,
            imagePrompt,
            context.userId || "anonymous",
            context.projectId
          );
          generatedImages.push({
            base64: base64Data,
            prompt: imagePrompt,
            url: blobUrl || undefined,
          });
        }
      }
    } catch (error) {
      console.error("[Orchestrator] Image generation failed:", error);
      workflowSteps.push("Bildgenerering misslyckades");
    }

    if (intent === "image_only") {
      return {
        success: generatedImages.length > 0,
        message:
          generatedImages.length > 0
            ? "Här är din bild!"
            : "Kunde inte generera bild.",
        intent,
        generatedImages: generatedImages.map((img) => ({
          prompt: img.prompt,
          url: img.url,
        })),
        workflowSteps,
      };
    }
  }

  // Handle code generation
  if (
    intent === "code_only" ||
    intent === "image_and_code" ||
    intent === "web_search_and_code"
  ) {
    onStep?.("Genererar kod med v0...");
    workflowSteps.push("Uppdaterar webbplatskod med v0");

    let codeInstruction = enrichedPrompt;

    // Add web search context if available
    if (webSearchContext && intent === "web_search_and_code") {
      codeInstruction += `\n\nKontext från webbsökning:\n${webSearchContext.substring(
        0,
        2000
      )}`;
    }

    // Add media library if available
    if (context.mediaLibrary && context.mediaLibrary.length > 0) {
      const mediaCatalog = context.mediaLibrary
        .map(
          (item, i) =>
            `[Bild ${i + 1}]: ${item.url} - "${
              item.description || item.filename
            }"`
        )
        .join("\n");
      codeInstruction += `\n\nTILLGÄNGLIGA BILDER:\n${mediaCatalog}`;
    }

    // Add generated images if available
    if (generatedImages.length > 0 && intent === "image_and_code") {
      const imagesWithUrls = generatedImages.filter((img) => img.url);
      if (imagesWithUrls.length > 0) {
        codeInstruction += `\n\nGENERERADE BILDER:\n`;
        imagesWithUrls.forEach((img, i) => {
          codeInstruction += `${i + 1}. ${img.prompt.substring(
            0,
            60
          )}\n   URL: ${img.url}\n`;
        });
      }
    }

    let v0Result;
    if (context.existingChatId && context.existingCode) {
      v0Result = await refineCode(
        context.existingChatId,
        context.existingCode,
        codeInstruction,
        context.quality
      );
    } else {
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
      screenshotUrl: v0Result.screenshotUrl,
      versionId: v0Result.versionId,
      webSearchResults:
        webSearchResults.length > 0 ? webSearchResults : undefined,
      generatedImages:
        generatedImages.length > 0
          ? generatedImages.map((img) => ({ prompt: img.prompt, url: img.url }))
          : undefined,
      workflowSteps,
      routerResult,
      codeContext,
      enrichedPrompt: codeInstruction,
    };
  }

  // Fallback
  return {
    success: false,
    message: "Kunde inte avgöra vad som skulle göras.",
    intent,
    error: "Unknown workflow path",
    workflowSteps,
  };
}
