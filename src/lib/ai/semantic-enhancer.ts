/**
 * Semantic Enhancer
 * =================
 *
 * Förbättrar användarens prompt semantiskt baserat på:
 * - Kodkontext från Code Crawler
 * - Intent från Semantic Router
 * - Befintlig designstil
 *
 * SKILLNAD MOT ANDRA KOMPONENTER:
 * - Semantic Router: Klassificerar intent
 * - Code Crawler: Hittar relevant kod
 * - Semantic Enhancer: FÖRBÄTTRAR prompten (denna)
 * - Prompt Enricher: Kombinerar allt till slutlig prompt
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { CodeContext, CodeSnippet } from "@/lib/code-crawler";
import type { RouterResult } from "@/lib/ai/semantic-router";
import { debugLog, truncateForLog } from "@/lib/utils/debug";
import { SECRETS } from "@/lib/config";

// ============================================================================
// TYPES
// ============================================================================

export interface EnhancementResult {
  enhancedPrompt: string;
  technicalContext: string;
  suggestedApproach: string;
  wasEnhanced: boolean;
}

export interface EnhancementOptions {
  originalPrompt: string;
  codeContext?: CodeContext;
  routerResult?: RouterResult;
  skipEnhancement?: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ENHANCER_MODEL = "gpt-4o-mini";

// Short prompts (< this) get EXTRA enhancement (not skipped!)
const SHORT_PROMPT_THRESHOLD = 20;

// Maximum enhanced prompt length
const MAX_ENHANCED_LENGTH = 500;

// ============================================================================
// MAIN ENHANCER FUNCTION
// ============================================================================

/**
 * Enhance a user prompt with specific technical instructions.
 *
 * Takes a vague prompt like "gör headern snyggare" and transforms it into
 * something more actionable like "Förbättra header-komponenten: lägg till
 * gradient-bakgrund, öka padding till 24px, animera nav-länkar med hover:scale"
 *
 * @param options - Enhancement options including prompt and context
 * @returns EnhancementResult with enhanced prompt and metadata
 */
export async function semanticEnhance(
  options: EnhancementOptions
): Promise<EnhancementResult> {
  const { originalPrompt, codeContext, routerResult, skipEnhancement } =
    options;

  debugLog(
    "AI",
    "[SemanticEnhancer] Starting enhancement for:",
    truncateForLog(originalPrompt, 100, "originalPrompt")
  );

  // Skip ONLY if explicitly requested
  if (skipEnhancement) {
    debugLog("AI", "[SemanticEnhancer] Skipping - explicitly requested");
    return {
      enhancedPrompt: originalPrompt,
      technicalContext: "",
      suggestedApproach: "",
      wasEnhanced: false,
    };
  }

  // Short prompts get EXTRA enhancement (they need more help!)
  const isShortPrompt = originalPrompt.length < SHORT_PROMPT_THRESHOLD;
  if (isShortPrompt) {
    debugLog(
      "AI",
      "[SemanticEnhancer] Short prompt detected - will enhance MORE aggressively"
    );
  }

  // Check if prompt already seems specific enough
  if (isPromptAlreadySpecific(originalPrompt)) {
    debugLog(
      "AI",
      "[SemanticEnhancer] Prompt already specific, minimal enhancement"
    );
    return {
      enhancedPrompt: originalPrompt,
      technicalContext: codeContext?.summary || "",
      suggestedApproach: routerResult?.reasoning || "",
      wasEnhanced: false,
    };
  }

  try {
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(
      originalPrompt,
      codeContext,
      routerResult
    );

    // CRITICAL: Validate API key BEFORE creating client (fail fast)
    const apiKey = SECRETS.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for Semantic Enhancer. Please set it in environment variables."
      );
    }

    // Create OpenAI client with validated API key
    const openaiClient = createOpenAI({ apiKey });

    const result = await generateText({
      model: openaiClient(ENHANCER_MODEL),
      system: systemPrompt,
      prompt: userMessage,
      maxOutputTokens: 300,
    });

    const enhancedPrompt = cleanEnhancedPrompt(result.text, originalPrompt);

    debugLog(
      "AI",
      "[SemanticEnhancer] Enhanced prompt:",
      truncateForLog(enhancedPrompt, 200, "enhancedPrompt")
    );

    return {
      enhancedPrompt,
      technicalContext: codeContext?.summary || "",
      suggestedApproach: routerResult?.reasoning || "",
      wasEnhanced: enhancedPrompt !== originalPrompt,
    };
  } catch (error) {
    console.error("[SemanticEnhancer] Error:", error);

    // Fallback to original prompt on error
    return {
      enhancedPrompt: originalPrompt,
      technicalContext: codeContext?.summary || "",
      suggestedApproach: routerResult?.reasoning || "",
      wasEnhanced: false,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a prompt is already specific enough (doesn't need enhancement)
 *
 * IMPORTANT: A prompt is only "specific" if it contains ACTUAL VALUES,
 * not just CSS property names. "Ändra border-radius" is NOT specific,
 * but "Ändra border-radius till 10px" IS specific.
 */
function isPromptAlreadySpecific(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Check for ACTUAL VALUES (not just property names!)
  // These patterns require concrete numbers/colors that v0 can use directly
  const specificValuePatterns = [
    /\d+\s*px/, // 10px, 20 px
    /\d+\s*rem/, // 1rem, 2 rem
    /\d+\s*em/, // 1em, 2 em
    /\d+\s*%/, // 50%, 100 %
    /\d+\s*vh/, // 100vh
    /\d+\s*vw/, // 100vw
    /#[0-9a-f]{3,6}\b/i, // #fff, #ff0000
    /rgb\(\s*\d/, // rgb(255, ...
    /rgba\(\s*\d/, // rgba(255, ...
    /hsl\(\s*\d/, // hsl(120, ...
  ];

  // Only return true if we have ACTUAL VALUES
  let hasSpecificValue = false;
  for (const pattern of specificValuePatterns) {
    if (pattern.test(lower)) {
      hasSpecificValue = true;
      break;
    }
  }

  // If no specific values, always enhance (even if it mentions CSS properties)
  if (!hasSpecificValue) {
    return false;
  }

  // Check for specific action verbs that indicate clear intent
  const specificActions = [
    "lägg till",
    "ta bort",
    "flytta",
    "ändra till",
    "sätt till",
    "använd",
    "implementera",
  ];

  let hasSpecificAction = false;
  for (const action of specificActions) {
    if (lower.includes(action)) {
      hasSpecificAction = true;
      break;
    }
  }

  // Prompt is specific if it has BOTH a value AND a clear action
  return hasSpecificValue && hasSpecificAction;
}

/**
 * Build the system prompt for the enhancer
 */
function buildSystemPrompt(): string {
  return `Du är en expert på att förbättra promptar för webbdesign och kodgenerering.

Din uppgift är att ta en vag eller enkel prompt och göra den mer specifik och teknisk,
samtidigt som du behåller användarens ursprungliga intention.

EXEMPEL PÅ FÖRBÄTTRINGAR:
- "gör headern snyggare" → "Improve header design: add subtle box-shadow, increase padding to 16px 24px, use gradient background (from #1a1a2e to #16213e), animate nav links with smooth hover transition"
- "fixa footern" → "Update footer layout: center content with flexbox, add social icons with hover effects, improve typography hierarchy with clearer contrast"
- "gör knappen bättre" → "Enhance button design: add hover effect with scale(1.02), use gradient background, round corners with 8px border-radius, add subtle shadow"
- "mer modern stil" → "Apply modern design style: use larger whitespace, minimalist typography, subtle animations, soft shadows and rounded corners"

REGLER:
1. Behåll ALLTID användarens ursprungliga intention
2. Lägg till KONKRETA tekniska detaljer (pixelvärden, färger, CSS-egenskaper)
3. Föreslå SPECIFIKA förbättringar som kan implementeras direkt
4. Om kodkontext finns, referera till specifika element/komponenter
5. Håll svaret KONCIST - max 2-3 meningar
6. Svara ENDAST med den förbättrade prompten, ingen förklaring
7. RÄTTA STAVFEL automatiskt (stavfel → korrekt stavning)
8. SKRIV PÅ ENGELSKA för bästa v0-kompatibilitet

VIKTIGT: 
- Svara BARA med den förbättrade prompten på ENGELSKA
- Ingen inledning, ingen förklaring
- Rätta alla stavfel automatiskt`;
}

/**
 * Build the user message with context
 */
function buildUserMessage(
  originalPrompt: string,
  codeContext?: CodeContext,
  routerResult?: RouterResult
): string {
  const isShort = originalPrompt.length < SHORT_PROMPT_THRESHOLD;

  let message = `Original prompt: "${originalPrompt}"`;

  // Short prompts need EXTRA context and enhancement
  if (isShort) {
    message += `\n\n⚠️ KORT PROMPT - behöver MER detaljer! Expandera med:
- Specifika CSS-värden (färger, storlekar, spacing)
- Konkreta designelement (gradient, skugga, animation)
- Layoutförslag (flexbox, grid, positioning)`;
  }

  // Add code context if available
  if (codeContext?.relevantFiles?.length) {
    const fileSnippets = codeContext.relevantFiles
      .slice(0, 3) // Max 3 files
      .map((f: CodeSnippet) => `- ${f.name}: ${f.snippet.substring(0, 150)}...`)
      .join("\n");

    message += `\n\nKodkontext:\n${fileSnippets}`;
  }

  // Add router hints if available
  if (routerResult?.contextHints?.length) {
    message += `\n\nElement-hints: ${routerResult.contextHints.join(", ")}`;
  }

  message += "\n\nFörbättra prompten med specifika tekniska instruktioner:";

  return message;
}

/**
 * Clean and validate the enhanced prompt
 */
function cleanEnhancedPrompt(
  rawResponse: string,
  originalPrompt: string
): string {
  let cleaned = rawResponse.trim();

  // Remove any markdown formatting
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`/g, "");

  // Remove common prefixes the AI might add
  const prefixPatterns = [
    /^förbättrad prompt:\s*/i,
    /^enhanced prompt:\s*/i,
    /^här är den förbättrade prompten:\s*/i,
    /^prompt:\s*/i,
  ];

  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Remove quotes if the entire response is quoted
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Truncate if too long
  if (cleaned.length > MAX_ENHANCED_LENGTH) {
    cleaned = cleaned.substring(0, MAX_ENHANCED_LENGTH) + "...";
  }

  // If cleaning resulted in empty string, return original
  if (!cleaned || cleaned.length < 5) {
    return originalPrompt;
  }

  return cleaned;
}

// ============================================================================
// STREAMING VERSION (for future use)
// ============================================================================

/**
 * Stream-enhanced version of semanticEnhance.
 * Useful when you want to show the enhancement process in real-time.
 */
export async function semanticEnhanceStreaming(
  options: EnhancementOptions,
  onChunk?: (text: string) => void
): Promise<EnhancementResult> {
  // For now, delegate to non-streaming version
  // In the future, this could use streamText for real-time feedback
  const result = await semanticEnhance(options);

  // Simulate streaming by calling onChunk with final result
  if (onChunk && result.wasEnhanced) {
    onChunk(result.enhancedPrompt);
  }

  return result;
}
