/**
 * Orchestrator Agent
 * ==================
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║  DITT EGNA ORKESTRATORSYSTEM - HJÄRTAT I SAJTMASKIN                        ║
 * ║                                                                            ║
 * ║  Detta är DITT HEMMABYGGDA SYSTEM för prompt-behandling.                   ║
 * ║  Det är INTE en del av AI SDK, Vercel, eller v0.                           ║
 * ║  ALL LOGIK här är kod DU har skapat/designat.                              ║
 * ║                                                                            ║
 * ║  ┌─────────────────────────────────────────────────────────────────────┐   ║
 * ║  │                     ARKITEKTURÖVERSIKT                              │   ║
 * ║  ├─────────────────────────────────────────────────────────────────────┤   ║
 * ║  │  Användarprompt                                                     │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  [Semantic Router] ──── AI SDK + OpenAI (din nyckel)                │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  [Code Crawler] ─────── INGEN AI (lokal filsökning)                 │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  [Semantic Enhancer] ── AI SDK + OpenAI (din nyckel)                │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  [Prompt Enricher] ──── INGEN AI (textformatering)                  │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  [v0 API] ───────────── v0 SDK (din V0_API_KEY)                     │   ║
 * ║  │       ↓                                                             │   ║
 * ║  │  Genererad kod + demoUrl                                            │   ║
 * ║  └─────────────────────────────────────────────────────────────────────┘   ║
 * ║                                                                            ║
 * ║  VERKTYG SOM ANVÄNDS (men som INTE är ditt system):                        ║
 * ║  - AI SDK ('ai' paketet) - open-source, anropar OpenAI                     ║
 * ║  - OpenAI SDK ('openai') - för web search, bildgenerering                  ║
 * ║  - v0 SDK ('v0-sdk') - för kodgenerering                                   ║
 * ║                                                                            ║
 * ║  API-NYCKLAR SOM KRÄVS:                                                    ║
 * ║  - OPENAI_API_KEY - din privata nyckel för prompt-behandling               ║
 * ║  - V0_API_KEY - din privata nyckel för kodgenerering                       ║
 * ║                                                                            ║
 * ║  INGET AV DETTA GÅR VIA VERCEL AI GATEWAY!                                 ║
 * ║  Allt går DIREKT till respektive API (api.openai.com, api.v0.dev)          ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * Koordinerar prompt-behandling innan v0 API anropas.
 * Syfte: Förbättra användarens (ofta dåliga) prompts till något v0 kan förstå.
 *
 * FLÖDE:
 * ──────
 * 1. Semantic Router   → Klassificerar intent (GPT-4o-mini via AI SDK)
 * 2. Code Crawler      → Hittar relevant kod (INGEN AI)
 * 3. Semantic Enhancer → Förbättrar prompten (GPT-4o-mini via AI SDK)
 * 4. Prompt Enricher   → Formaterar för v0 (INGEN AI)
 * 5. v0 API            → Genererar kod (v0 SDK)
 *
 * INTENTS:
 * ────────
 * - simple_code      : Enkla ändringar → direkt till v0
 * - needs_code_context: Refererar element → Code Crawler först
 * - image_gen        : Bildgenerering → OpenAI SDK (INTE v0!)
 * - image_and_code   : Bild + kod → OpenAI SDK + v0
 * - web_search       : Webbsökning → OpenAI Responses API
 * - web_and_code     : Sök + kod → Web search + v0
 * - clarify          : Otydligt → Ställ fråga (ALDRIG v0!)
 * - chat_response    : Bara svara → ALDRIG v0
 *
 * GUARDS:
 * ───────
 * - clarify intent når ALDRIG v0 API
 * - Bildgenerering hanteras SEPARAT från v0
 * - Pre-validering på frontend förhindrar onödig generation
 *
 * API-ANVÄNDNING:
 * ───────────────
 * - OpenAI API (OPENAI_API_KEY): Router, Enhancer, bilder, web search
 * - v0 API (V0_API_KEY): Kodgenerering
 */

import type { QualityLevel } from "@/lib/api-client";
import {
  isBlobConfigured,
  uploadBlobFromBase64,
} from "@/lib/vercel/blob-service";
import { crawlCodeContext, type CodeContext } from "@/lib/code-crawler";
import { debugLog, truncateForLog } from "@/lib/utils/debug";
import {
  enrichPrompt,
  createEnrichmentSummary,
} from "@/lib/ai/prompt-enricher";
import { semanticEnhance } from "@/lib/ai/semantic-enhancer";
import { creativeBriefEnhance } from "@/lib/ai/creative-brief-enhancer";
import {
  routePrompt,
  shouldRoute,
  type RouterResult,
  type SemanticIntent,
} from "@/lib/ai/semantic-router";
import {
  generateCode,
  refineCode,
  type GeneratedFile,
} from "@/lib/v0/v0-generator";
import { getUserSettings } from "@/lib/data/database";
import OpenAI from "openai";
export { enhancePromptForV0 } from "@/lib/utils/prompt-utils";

import { FEATURES } from "@/lib/config";

// Bildgenerering - getImageClient för direkta OpenAI-anrop
import { getImageClient } from "@/lib/ai/image-generator";

// ============================================================================
// STOCK IMAGE FETCHING (Unsplash)
// ============================================================================

interface StockImage {
  url: string;
  alt: string;
  photographer: string;
}

/**
 * Extract industry/theme keywords from a prompt for stock image search.
 * Returns relevant search terms for Unsplash.
 */
function extractIndustryKeywords(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const keywords: string[] = [];

  // Industry mappings (Swedish → English search terms)
  const industryMap: Record<string, string[]> = {
    // Swedish terms
    designerbyrå: ["design studio", "creative agency", "designer workspace"],
    designbyrå: ["design studio", "creative agency"],
    webbyrå: ["web agency", "digital agency", "modern office"],
    konsult: ["business consulting", "professional meeting", "office team"],
    restaurang: ["restaurant interior", "fine dining", "chef cooking"],
    café: ["coffee shop", "cafe interior", "barista"],
    kafé: ["coffee shop", "cafe interior"],
    butik: ["retail store", "fashion boutique", "shopping"],
    tech: ["technology", "startup office", "coding"],
    startup: ["startup team", "modern workspace", "innovation"],
    hälsa: ["wellness", "healthy lifestyle", "fitness"],
    spa: ["spa wellness", "relaxation", "massage therapy"],
    fastighet: ["real estate", "modern house", "architecture"],
    mäklare: ["real estate agent", "home interior", "property"],
    fotograf: ["photography studio", "camera", "creative"],
    arkitekt: ["architecture", "modern building", "design"],
    advokat: ["law office", "professional", "legal"],
    tandläkare: ["dental clinic", "healthcare", "dentist"],
    frisör: ["hair salon", "hairstylist", "beauty"],
    // English terms (fallback)
    agency: ["creative agency", "modern office", "team meeting"],
    studio: ["design studio", "creative workspace"],
    portfolio: ["portfolio", "creative work", "design showcase"],
  };

  // Check for industry matches
  for (const [keyword, searchTerms] of Object.entries(industryMap)) {
    if (lower.includes(keyword)) {
      keywords.push(...searchTerms);
    }
  }

  // If no specific industry found, extract general themes
  if (keywords.length === 0) {
    // Look for general descriptive words
    if (lower.includes("professionell") || lower.includes("professional"))
      keywords.push("professional business");
    if (lower.includes("modern")) keywords.push("modern design");
    if (lower.includes("kreativ") || lower.includes("creative"))
      keywords.push("creative workspace");
    if (lower.includes("minimalist")) keywords.push("minimalist design");
    if (lower.includes("luxur") || lower.includes("lyxig"))
      keywords.push("luxury interior");
  }

  // Deduplicate and limit
  return [...new Set(keywords)].slice(0, 3);
}

/**
 * Fetch stock images from Unsplash based on keywords.
 * Returns image URLs that work in v0 preview.
 */
async function fetchStockImages(
  keywords: string[],
  count: number = 4
): Promise<StockImage[]> {
  if (!FEATURES.useUnsplash || keywords.length === 0) {
    debugLog(
      "AI",
      "[Orchestrator:Stock] Unsplash not configured or no keywords"
    );
    return [];
  }

  try {
    // Use internal API to fetch from Unsplash
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
      }/api/unsplash`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: "custom",
          customTerms: keywords,
          count,
        }),
      }
    );

    if (!response.ok) {
      console.warn(
        "[Orchestrator:Stock] Unsplash API returned:",
        response.status
      );
      return [];
    }

    const data = await response.json();

    if (!data.success || !data.images?.length) {
      debugLog("AI", "[Orchestrator:Stock] No images found for:", keywords);
      return [];
    }

    console.log(
      `[Orchestrator:Stock] ✓ Found ${data.images.length} stock images for:`,
      keywords.join(", ")
    );

    // Map to our format - use the regular URL which works in v0 preview
    return data.images.map(
      (img: { url: string; alt: string; photographer: string }) => ({
        url: img.url, // Unsplash CDN URL - works in v0 preview
        alt: img.alt,
        photographer: img.photographer,
      })
    );
  } catch (error) {
    console.error("[Orchestrator:Stock] Error fetching stock images:", error);
    return [];
  }
}

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

/**
 * Initialize OpenAI client.
 * Prioriterar användarens egna API-nyckel om tillgänglig.
 */
function getOpenAIClient(userId?: string): OpenAI {
  // Try user's own OpenAI key first
  if (userId) {
    try {
      const settings = getUserSettings(userId);
      if (settings?.openai_api_key) {
        debugLog("AI", "[Orchestrator] Using user's OpenAI key");
        return new OpenAI({ apiKey: settings.openai_api_key });
      }
    } catch (e) {
      console.warn("[Orchestrator] Could not get user settings:", e);
    }
  }

  // Fallback to platform key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  debugLog("AI", "[Orchestrator] Using platform OpenAI key");
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

// Uses SemanticIntent from semantic-router for all intent handling

export interface OrchestratorContext {
  userId?: string;
  projectId?: string;
  quality: QualityLevel;
  existingChatId?: string;
  existingCode?: string;
  // Project files for Code Crawler analysis
  projectFiles?: GeneratedFile[];
  // Media library items (for image references in prompts)
  mediaLibrary?: Array<{
    url: string;
    filename: string;
    description?: string;
  }>;
  // Category type for pre-built prompts (landing-page, website, etc.)
  categoryType?: string;
  // Previous clarify context (when user responds to clarify question)
  previousClarify?: {
    originalPrompt: string;
    clarifyQuestion: string;
    userResponse: string;
  };
}

export interface OrchestratorResult {
  success: boolean;
  message: string;
  // Intent that was detected (using SemanticIntent from semantic-router)
  intent?: SemanticIntent;
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
  // Enrichment info for debugging
  routerResult?: RouterResult;
  codeContext?: CodeContext;
  enrichedPrompt?: string;
}

// ============================================================================
// SHARED HELPER FUNCTIONS (used by both streaming and non-streaming)
// ============================================================================

interface WebSearchHelperResult {
  context: string;
  results: Array<{ title: string; url: string; snippet: string }>;
}

/**
 * Utför webbsökning med OpenAI Responses API.
 * Gemensam funktion för både streaming och non-streaming flöden.
 */
async function executeWebSearch(
  client: OpenAI,
  query: string
): Promise<WebSearchHelperResult> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  let context = "";

  try {
    const searchResponse = await client.responses.create({
      model: "gpt-4o-mini",
      instructions:
        "Du är en webbdesign-expert. Baserat på web search-resultaten, ge en informativ sammanfattning på svenska om designtrender, färger, layouter etc.",
      input: query,
      tools: [{ type: "web_search" }],
      store: false,
    });

    // Extract results from output
    if (searchResponse.output) {
      for (const item of searchResponse.output) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemAny = item as any;
        if (
          itemAny.type === "web_search_call_output" &&
          itemAny.result &&
          Array.isArray(itemAny.result)
        ) {
          for (const result of itemAny.result) {
            if (result?.title && result?.url) {
              results.push({
                title: String(result.title),
                url: String(result.url),
                snippet: String(result.snippet || result.excerpt || ""),
              });
            }
          }
        }
      }
    }

    context = searchResponse.output_text || "";
  } catch (error) {
    console.error("[Orchestrator] Web search failed:", error);
  }

  return { context, results };
}

// ============================================================================
// STREAMING CALLBACKS (optional UI feedback)
// ============================================================================

export interface StreamingCallbacks {
  onThinking?: (thought: string) => void;
  onProgress?: (step: string, stepNumber?: number, totalSteps?: number) => void;
  onEnhancement?: (original: string, enhanced: string) => void;
}

// ============================================================================
// MAIN ORCHESTRATOR FUNCTION (unified - handles both streaming and non-streaming)
// ============================================================================

/**
 * Huvudfunktion för prompt-behandling.
 *
 * FLÖDE:
 * 1. Semantic Router → klassificerar intent
 * 2. Code Crawler → hittar relevant kod (om behövs)
 * 3. Semantic Enhancer → förbättrar prompten
 * 4. Prompt Enricher → formaterar för v0
 * 5. v0 API → genererar kod
 *
 * GUARDS:
 * - clarify → returnerar fråga, ALDRIG v0
 * - image_gen → OpenAI bildgenerering, INTE v0
 * - chat_response → returnerar svar, ALDRIG v0
 *
 * @param callbacks - Optional callbacks för UI-feedback (SSE streaming)
 */
export async function orchestrateWorkflow(
  userPrompt: string,
  context: OrchestratorContext,
  callbacks?: StreamingCallbacks
): Promise<OrchestratorResult> {
  const { onThinking, onProgress, onEnhancement } = callbacks || {};
  const workflowSteps: string[] = [];

  // AUTO-REPAIR: Detekterar kända problem i genererad kod
  // - Three.js felaktiga imports → fixar till three/examples/jsm/...
  // - Saknade React imports → lägger till import React
  // - Placeholder-bilder → varnar (kan ersättas)

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

  const hasMissingReactImport = (
    files?: Array<{ name: string; content: string }>
  ): boolean => {
    if (!files || files.length === 0) return false;

    return files.some((file) => {
      const content = file.content;
      const hasJSX = /<[A-Z]/.test(content) || /<[a-z]+[^>]*>/.test(content);
      const hasHooks =
        /\b(useState|useEffect|useCallback|useMemo|useRef|useContext)\s*\(/.test(
          content
        );
      const hasReactImport =
        /import\s+.*\s+from\s+["']react["']/.test(content) ||
        /import\s+React\s+from\s+["']react["']/.test(content);

      // If JSX or hooks are used but React is not imported
      return (hasJSX || hasHooks) && !hasReactImport;
    });
  };

  const hasPlaceholderImages = (
    files?: Array<{ name: string; content: string }>
  ): boolean => {
    if (!files || files.length === 0) return false;

    const placeholderPatterns = [
      /placeholder\.com/,
      /placehold\.co/,
      /via\.placeholder/,
      /dummyimage\.com/,
      /picsum\.photos/,
      /loremflickr\.com/,
      /placeimg\.com/,
    ];

    return files.some((file) =>
      placeholderPatterns.some((pattern) => pattern.test(file.content))
    );
  };

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0: COMBINE CLARIFY CONTEXT (if user is responding to clarify question)
    // ═══════════════════════════════════════════════════════════════════════
    let effectivePrompt = userPrompt;
    if (context.previousClarify) {
      // User is responding to a clarify question - combine with original context
      effectivePrompt = `ORIGINAL REQUEST: ${context.previousClarify.originalPrompt}
CLARIFY QUESTION: ${context.previousClarify.clarifyQuestion}
USER RESPONSE: ${context.previousClarify.userResponse}

UPDATED REQUEST: ${userPrompt}`;
      
      debugLog("AI", "[Orchestrator] Combining clarify context", {
        originalPrompt: context.previousClarify.originalPrompt,
        clarifyQuestion: context.previousClarify.clarifyQuestion,
        userResponse: context.previousClarify.userResponse,
        combinedLength: effectivePrompt.length,
      });
      
      workflowSteps.push("Kombinerar clarify-svar med original prompt");
    }

    debugLog("AI", "Starting orchestrator workflow", {
      promptLength: userPrompt.length,
      effectivePromptLength: effectivePrompt.length,
      quality: context.quality,
      hasExistingChat: !!context.existingChatId,
      hasExistingCode: !!context.existingCode,
      hasProjectFiles: !!context.projectFiles?.length,
      hasCallbacks: !!callbacks,
      hasPreviousClarify: !!context.previousClarify,
    });

    // UI feedback: Starting
    onProgress?.("Analyserar prompt...", 1, 5);
    onThinking?.("Analyserar din förfrågan för att förstå vad du vill göra...");

    const client = getOpenAIClient(context.userId);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: SEMANTIC ROUTING
    // ═══════════════════════════════════════════════════════════════════════

    debugLog("AI", "[Orchestrator] Step 1: Routing prompt...");

    let codeContext: CodeContext | undefined;

    // OPTIMIZATION: Fast-path for simple code prompts (skip semantic router)
    // This reduces latency by ~2-5 seconds for straightforward requests
    // IMPROVED: Better detection of fast-path eligible prompts
    const isFastPathEligible = (() => {
      // Must have existing code to refine
      if (!context.existingCode) return false;

      const lower = effectivePrompt.toLowerCase();

      // CRITICAL: Prompts without SPECIFIC VALUES should NOT fast-path!
      // "Ändra border-radius" → needs AI to ask "to what value?"
      // "Ändra border-radius till 10px" → can fast-path
      const hasSpecificValue =
        /\d+\s*(px|rem|em|%|vh|vw)\b/.test(effectivePrompt) || // 10px, 2rem, 50%
        /#[0-9a-f]{3,6}\b/i.test(effectivePrompt) || // #fff, #ff0000
        /rgb\(|rgba\(|hsl\(/i.test(effectivePrompt); // rgb(255,...)

      // If prompt mentions CSS properties but has NO values, don't fast-path!
      const mentionsCSSProperty =
        /border|radius|padding|margin|font|color|färg|storlek|avrundning/i.test(
          lower
        );
      if (mentionsCSSProperty && !hasSpecificValue) {
        return false; // Force semantic router to enhance with values
      }

      // Semantic router says to skip AND prompt is clear enough
      if (!shouldRoute(effectivePrompt) && effectivePrompt.trim().length >= 20)
        return true;

      // Additional fast-path patterns (common simple changes WITH specific targets)
      const simplePatterns = [
        /^(gör|ändra|sätt|byt).{0,20}(färg|bakgrund|font|storlek|padding|margin).+\d+/i, // Must have value
        /^(lägg till|ta bort|dölj|visa).{0,15}(knapp|text|bild|länk)/i,
        /^(centrera|justera|flytta).{0,20}/i,
      ];

      if (simplePatterns.some((p) => p.test(lower)) && effectivePrompt.length < 80) {
        return true;
      }

      return false;
    })();

    let routerResult: RouterResult;

    if (isFastPathEligible) {
      console.log(
        "[Orchestrator] Fast-path: Simple code change, skipping semantic router"
      );
      onThinking?.("Enkel ändring detekterad, hoppar över semantisk analys...");
      workflowSteps.push("Fast-path: Direkt till v0 (enkel ändring)");
      routerResult = {
        intent: "simple_code",
        confidence: 0.9,
        needsCodeContext: false,
        contextHints: [],
        codeInstruction: effectivePrompt,
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
        const routerPromise = routePrompt(effectivePrompt, !!context.existingCode);
        const timeoutPromise = new Promise<RouterResult>((_, reject) =>
          setTimeout(
            () => reject(new Error("Router timeout")),
            ROUTER_TIMEOUT_MS
          )
        );
        routerResult = await Promise.race([routerPromise, timeoutPromise]);
        onThinking?.(
          `Intent: ${routerResult.intent} (${Math.round(
            routerResult.confidence * 100
          )}% confidence)`
        );
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
          codeInstruction: effectivePrompt,
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

    // Use SemanticIntent directly - no mapping needed
    const intent: SemanticIntent = routerResult.intent;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2B: CODE CRAWLER (if needed)
    // Analyze project files to find relevant code context
    // SMART CLARIFY: Only for clarify when UI hints are present
    // ═══════════════════════════════════════════════════════════════════════

    // Kör Code Crawler endast när det verkligen behövs
    const shouldRunCodeCrawler =
      context.projectFiles?.length &&
      (routerResult.needsCodeContext ||
        (routerResult.intent === "clarify" &&
          shouldRunSmartClarify(effectivePrompt, routerResult)));

    if (shouldRunCodeCrawler && context.projectFiles) {
      onProgress?.("Söker i projektfiler...", 2, 5);
      onThinking?.("Letar efter relevanta koddelar i ditt projekt...");

      debugLog("AI", "[Orchestrator] === STEP 2: CODE CRAWLER ===");
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
          : extractHintsFromPrompt(effectivePrompt);

      codeContext = await crawlCodeContext(
        context.projectFiles,
        hints,
        effectivePrompt
      );

      debugLog("AI", "[Orchestrator] Code context found:", {
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
      codeInstruction: routerResult.codeInstruction || effectivePrompt,
      clarifyQuestion: routerResult.clarifyQuestion || "",
      chatResponse: routerResult.chatResponse || "",
    };

    debugLog("AI", "[Orchestrator] Mapped intent:", intent);
    debugLog("AI", "[Orchestrator] Intent classified", {
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
        debugLog("AI", "[Orchestrator] === SMART CLARIFY ===");
        console.log(
          "[Orchestrator] Found",
          codeContext.relevantFiles.length,
          "potential matches, generating specific question"
        );

        workflowSteps.push(
          "Smart Clarify: Genererar specifik fråga baserat på kod"
        );

        // Generate smart clarify question using AI
        // Use effectivePrompt here to include clarify context if present
        const smartQuestion = await generateSmartClarifyQuestion(
          effectivePrompt,
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
      (intent === "web_search" || intent === "web_and_code") &&
      classification.webSearchQuery
    ) {
      console.log(
        "[Orchestrator] Executing web search:",
        classification.webSearchQuery
      );
      workflowSteps.push(`Söker online: ${classification.webSearchQuery}`);

      const searchResult = await executeWebSearch(
        client,
        classification.webSearchQuery
      );
      webSearchContext = searchResult.context;
      webSearchResults.push(...searchResult.results);

      if (searchResult.results.length > 0) {
        workflowSteps.push(
          `Hittade ${searchResult.results.length} sökresultat`
        );
      } else {
        workflowSteps.push("Webbsökning slutförd (inga specifika resultat)");
      }

      // If web_search_only, return here WITHOUT calling v0
      if (intent === "web_search") {
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
      (intent === "image_gen" || intent === "image_and_code") &&
      classification.imagePrompts &&
      classification.imagePrompts.length > 0
    ) {
      debugLog("AI", "[Orchestrator] Generating images", {
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
            debugLog("AI", "[Orchestrator] ✓ gpt-image-1 generated image");
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
            debugLog(
              "AI",
              "[Orchestrator] ✓ dall-e-3 fallback generated image"
            );
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
              debugLog("AI", "[Orchestrator] ✓ Image saved with URL:", blobUrl);
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
          debugLog("AI", "[Orchestrator] Image generation failed", {
            error: String(error),
          });
          workflowSteps.push(
            `Bildgenerering misslyckades: ${imagePrompt.substring(0, 30)}...`
          );
        }
      }

      // If image_only, return here WITHOUT calling v0
      if (intent === "image_gen") {
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
      intent === "simple_code" ||
      intent === "needs_code_context" ||
      intent === "image_and_code" ||
      intent === "web_and_code"
    ) {
      // Build the code instruction using Prompt Enricher
      let codeInstruction = classification.codeInstruction || effectivePrompt;

      // ═══════════════════════════════════════════════════════════════════════
      // ENHANCERS: Different paths for new sites vs existing sites
      // ═══════════════════════════════════════════════════════════════════════

      if (!context.existingCode) {
        // NEW SITE: Use Creative Brief Enhancer for structured design brief
        onProgress?.("Skapar design-brief...", 3, 5);
        onThinking?.(
          "Gör din beskrivning till en tydlig design-brief (målgrupp, struktur, stil)..."
        );
        try {
          const brief = await creativeBriefEnhance({
            userPrompt: classification.codeInstruction || effectivePrompt,
            routerResult,
            quality: context.quality,
          });
          if (brief?.mode === "clarify") {
            const question = brief.questions.join(" ");
            return {
              success: true,
              message: question,
              intent: "clarify",
              clarifyQuestion: question,
              workflowSteps: [
                ...(workflowSteps || []),
                "Creative Brief Enhancer: Begärde förtydligande",
              ],
            };
          }
          if (brief?.mode === "expand") {
            workflowSteps.push("Creative Brief Enhancer: Skapade design-brief");
            onThinking?.("Design-brief klar. Skickar vidare till v0...");
            codeInstruction = brief.expandedPrompt;
          }
        } catch (e) {
          console.warn("[Orchestrator] Creative brief enhancer failed:", e);
        }
      } else if (effectivePrompt.length < 300) {
        // EXISTING SITE: Use Semantic Enhancer for technical improvements
        onProgress?.("Förbättrar prompten...", 3, 5);
        onThinking?.("Gör din förfrågan mer specifik och teknisk...");
        try {
          const enhanced = await semanticEnhance({
            originalPrompt: effectivePrompt,
            codeContext,
            routerResult,
          });
          if (enhanced.wasEnhanced) {
            workflowSteps.push("Semantic Enhancer: Förbättrade prompten");
            onEnhancement?.(effectivePrompt, enhanced.enhancedPrompt);
            codeInstruction = enhanced.enhancedPrompt;
          }
        } catch (e) {
          console.warn("[Orchestrator] Semantic enhancer failed:", e);
        }
      }

      // Use Prompt Enricher if we have code context
      if (codeContext && codeContext.relevantFiles.length > 0) {
        debugLog("AI", "[Orchestrator] === USING PROMPT ENRICHER ===");

        const enrichedPrompt = enrichPrompt({
          originalPrompt: effectivePrompt,
          enhancedPrompt: codeInstruction, // Pass the already-enhanced prompt
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
          truncateForLog(enrichedPrompt, 500, "enrichedPrompt")
        );

        // Log enrichment summary for debugging
        const summary = createEnrichmentSummary({
          originalPrompt: effectivePrompt,
          enhancedPrompt: codeInstruction,
          routerResult,
          codeContext,
          webResults:
            webSearchResults.length > 0 ? webSearchResults : undefined,
        });
        debugLog("AI", "[Orchestrator] Enrichment summary:", summary);

        workflowSteps.push("Prompt Enricher: Berikade prompten med kodkontext");
        codeInstruction = enrichedPrompt;
      }

      // Add context from web search if available
      if (webSearchContext && intent === "web_and_code") {
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

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5B: FETCH STOCK IMAGES (for NEW page generations without images)
      // This ensures v0 uses real Unsplash images instead of placeholder URLs
      // ═══════════════════════════════════════════════════════════════════════
      const isNewGeneration = !context.existingChatId && !context.existingCode;
      const hasNoImages =
        generatedImages.length === 0 &&
        (!context.mediaLibrary || context.mediaLibrary.length === 0);

      if (isNewGeneration && hasNoImages) {
        // Extract industry keywords from prompt
        const industryKeywords = extractIndustryKeywords(effectivePrompt);

        if (industryKeywords.length > 0) {
          console.log(
            "[Orchestrator] New page generation - fetching stock images for:",
            industryKeywords
          );
          workflowSteps.push(
            `Hämtar stockbilder: ${industryKeywords.join(", ")}`
          );

          const stockImages = await fetchStockImages(industryKeywords, 4);

          if (stockImages.length > 0) {
            console.log(
              `[Orchestrator] ✓ Adding ${stockImages.length} stock images to v0 prompt`
            );

            codeInstruction += `

═══════════════════════════════════════════════════════════════════════════════
STOCKBILDER ATT ANVÄNDA (från Unsplash - fungerar i preview!)
═══════════════════════════════════════════════════════════════════════════════

Följande bilder har hämtats och är redo att användas i designen.
Du MÅSTE använda dessa EXAKTA URLs - de fungerar i v0 preview!

`;
            stockImages.forEach((img, i) => {
              codeInstruction += `${i + 1}. ${img.alt} (Foto: ${
                img.photographer
              })
   URL: ${img.url}

`;
            });

            codeInstruction += `REGLER:
- Använd dessa URLs EXAKT i <img src="..."> eller next/image
- Placera bilderna på logiska ställen (hero, about, features, testimonials, etc.)
- Använd INTE placeholder.com, placehold.co eller /images/... paths
- Dessa bilder fungerar garanterat i preview

═══════════════════════════════════════════════════════════════════════════════
`;
            workflowSteps.push(`✅ ${stockImages.length} stockbilder tillagda`);
          }
        }
      }

      // UI feedback: Code generation
      onProgress?.("Genererar kod...", 4, 5);
      onThinking?.("Skickar till v0 för kodgenerering...");

      debugLog("AI", "[Orchestrator] Calling v0 for code", {
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
          context.quality,
          context.mediaLibrary
        );
      } else {
        // New generation - pass categoryType and mediaLibrary
        v0Result = await generateCode(codeInstruction, {
          quality: context.quality,
          categoryType: context.categoryType,
          mediaLibrary: context.mediaLibrary,
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // AUTO-REPAIR: Detect and fix known v0 preview-breakers
      // Runs multiple repair checks and combines fixes if needed
      // ═══════════════════════════════════════════════════════════════════════

      if (v0Result.chatId && v0Result.files) {
        const repairs: string[] = [];
        let needsRepair = false;

        // Check 1: Broken Three.js imports
        if (hasBrokenThreeExamplesImport(v0Result.files)) {
          repairs.push(`FIX PREVIEW-BREAKING THREE.JS IMPORTS (CRITICAL):

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

After fixing, ensure there are no remaining "three/examples" bare imports anywhere.`);
          needsRepair = true;
        }

        // Check 2: Missing React imports
        if (hasMissingReactImport(v0Result.files)) {
          repairs.push(`ADD MISSING REACT IMPORT:

The generated code uses JSX or React hooks (useState, useEffect, etc.) but is missing the React import.
While Next.js 15+ doesn't require React import for JSX, v0's preview environment may need it.

Please add the React import at the top of files that use JSX or hooks:
- Add: import React from "react";
- Place it at the very top of the file, before other imports
- Only add to files that actually use JSX or React hooks`);
          needsRepair = true;
        }

        // Check 3: Placeholder images
        if (hasPlaceholderImages(v0Result.files)) {
          repairs.push(`REPLACE PLACEHOLDER IMAGES:

The generated code contains placeholder image URLs (placeholder.com, placehold.co, etc.).
These may break or look unprofessional in the preview.

Please replace placeholder images with:
- Unsplash URLs (https://images.unsplash.com/...) OR
- Generic placeholder divs with background colors OR
- Remove image src attributes and use CSS background colors instead

Keep the same dimensions and layout, just replace the image sources.`);
          needsRepair = true;
        }

        // Run repair if any issues detected
        if (needsRepair && repairs.length > 0) {
          const repairTypes: string[] = [];
          if (hasBrokenThreeExamplesImport(v0Result.files)) {
            repairTypes.push("Three.js-importer");
          }
          if (hasMissingReactImport(v0Result.files)) {
            repairTypes.push("React-import");
          }
          if (hasPlaceholderImages(v0Result.files)) {
            repairTypes.push("placeholder-bilder");
          }

          console.warn(
            `[Orchestrator] Detected ${repairs.length} issue(s) in v0 output. Running auto-repair refine...`
          );
          workflowSteps.push(
            `Reparerar ${repairTypes.join(", ")} (preview-fix)`
          );

          const repairInstruction = repairs.join("\n\n---\n\n");

          const repaired = await refineCode(
            v0Result.chatId,
            v0Result.code || "",
            repairInstruction,
            context.quality
          );

          // If repair succeeded, replace result; otherwise return original and let user know via steps.
          if (repaired?.files && repaired.files.length > 0) {
            v0Result = repaired;
            workflowSteps.push("Auto-repair lyckades!");
          } else {
            console.warn(
              "[Orchestrator] Auto-repair refine did not return files; keeping original result."
            );
            workflowSteps.push(
              `Kunde inte auto-reparera helt (prova att be om 'fixa ${repairTypes.join(
                ", "
              )}')`
            );
          }
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
        // Include enrichment info for debugging
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
    debugLog("AI", "[Orchestrator] Workflow failed", { error: errorMessage });

    return {
      success: false,
      message: "Något gick fel. Försök igen.",
      error: errorMessage,
      workflowSteps,
    };
  }
}

/**
 * Snabb kontroll om en prompt behöver orchestrering.
 * Delegerar till Semantic Router för semantisk analys.
 *
 * Returnerar TRUE när:
 * - AI-bildgenerering behövs
 * - Webbsökning krävs
 * - Specifika UI-element refereras (behöver kodkontext)
 * - Prompten är vag/komplex
 *
 * Returnerar FALSE för:
 * - Enkla kodändringar ("gör bakgrunden blå")
 * - Användning av befintliga bilder
 */
export function needsOrchestration(prompt: string): boolean {
  // Use the new shouldRoute helper from semantic-router
  // This provides a quick heuristic check
  const shouldUseRouter = shouldRoute(prompt);

  if (shouldUseRouter) {
    debugLog("AI", "[Orchestrator] TRIGGER - semantic routing needed", {
      promptPreview: prompt.substring(0, 50),
    });
    return true;
  }

  // Extra nyckelordskontroller
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
    debugLog("AI", "[Orchestrator] SKIP - prompt has public URLs (send to v0)");
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
    debugLog(
      "AI",
      "[Orchestrator] SKIP - references existing media (send to v0)"
    );
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
    debugLog("AI", "[Orchestrator] TRIGGER - needs AI image generation");
    return true;
  }

  if (needsWebSearch) {
    debugLog("AI", "[Orchestrator] TRIGGER - needs web search");
    return true;
  }

  if (needsCodeContext) {
    debugLog("AI", "[Orchestrator] TRIGGER - needs code context analysis");
    return true;
  }

  // Default: Send to v0 directly (no orchestration)
  debugLog(
    "AI",
    "[Orchestrator] SKIP - no complex workflow detected (send to v0)"
  );
  return false;
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIAS
// ============================================================================

/**
 * @deprecated Use orchestrateWorkflow() with callbacks parameter instead.
 * This is a backward-compatible alias.
 */
export async function orchestrateWorkflowStreaming(
  userPrompt: string,
  context: OrchestratorContext,
  callbacks: StreamingCallbacks
): Promise<OrchestratorResult> {
  return orchestrateWorkflow(userPrompt, context, callbacks);
}
