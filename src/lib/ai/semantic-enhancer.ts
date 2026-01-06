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
import { openai } from "@ai-sdk/openai";
import type { CodeContext, CodeSnippet } from "@/lib/code-crawler";
import type { RouterResult } from "@/lib/ai/semantic-router";

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

// Minimum prompt length to consider enhancement
const MIN_PROMPT_LENGTH = 10;

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

  console.log(
    "[SemanticEnhancer] Starting enhancement for:",
    originalPrompt.substring(0, 50)
  );

  // Skip enhancement for very short prompts or explicit skip
  if (skipEnhancement || originalPrompt.length < MIN_PROMPT_LENGTH) {
    console.log(
      "[SemanticEnhancer] Skipping - prompt too short or skip requested"
    );
    return {
      enhancedPrompt: originalPrompt,
      technicalContext: "",
      suggestedApproach: "",
      wasEnhanced: false,
    };
  }

  // Check if prompt already seems specific enough
  if (isPromptAlreadySpecific(originalPrompt)) {
    console.log(
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

    const result = await generateText({
      model: openai(ENHANCER_MODEL),
      system: systemPrompt,
      prompt: userMessage,
      maxOutputTokens: 300,
    });

    const enhancedPrompt = cleanEnhancedPrompt(result.text, originalPrompt);

    console.log(
      "[SemanticEnhancer] Enhanced prompt:",
      enhancedPrompt.substring(0, 100)
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
 */
function isPromptAlreadySpecific(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Check for specific CSS properties
  const cssPatterns = [
    /\d+px/,
    /\d+rem/,
    /\d+em/,
    /#[0-9a-f]{3,6}/i,
    /rgb\(/,
    /rgba\(/,
    /hsl\(/,
    /flex/,
    /grid/,
    /padding/,
    /margin/,
    /border/,
  ];

  for (const pattern of cssPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // Check for specific component instructions
  const specificKeywords = [
    "lägg till",
    "ta bort",
    "flytta",
    "ändra till",
    "sätt",
    "använd",
    "implementera",
    "skapa en",
    "bygg en",
  ];

  let keywordCount = 0;
  for (const keyword of specificKeywords) {
    if (lower.includes(keyword)) {
      keywordCount++;
    }
  }

  // If prompt has multiple specific keywords, it's probably specific enough
  return keywordCount >= 2;
}

/**
 * Build the system prompt for the enhancer
 */
function buildSystemPrompt(): string {
  return `Du är en expert på att förbättra promptar för webbdesign och kodgenerering.

Din uppgift är att ta en vag eller enkel prompt och göra den mer specifik och teknisk,
samtidigt som du behåller användarens ursprungliga intention.

EXEMPEL PÅ FÖRBÄTTRINGAR:
- "gör headern snyggare" → "Förbättra headerns design: lägg till subtil box-shadow, öka padding till 16px 24px, använd gradient bakgrund (från #1a1a2e till #16213e), animera nav-länkar med smooth hover transition"
- "fixa footern" → "Uppdatera footer-layouten: centrera innehållet med flexbox, lägg till sociala ikoner med hover-effekter, förbättra typografi-hierarkin med tydligare kontrast"
- "gör knappen bättre" → "Förbättra knappens design: lägg till hover-effekt med scale(1.02), använd gradient bakgrund, avrunda hörnen med 8px border-radius, lägg till subtil skugga"
- "mer modern stil" → "Applicera modern designstil: använd större whitespace, minimalistisk typografi, subtila animationer, mjuka skuggor och avrundade hörn"

REGLER:
1. Behåll ALLTID användarens ursprungliga intention
2. Lägg till KONKRETA tekniska detaljer (pixelvärden, färger, CSS-egenskaper)
3. Föreslå SPECIFIKA förbättringar som kan implementeras direkt
4. Om kodkontext finns, referera till specifika element/komponenter
5. Håll svaret KONCIST - max 2-3 meningar
6. Svara ENDAST med den förbättrade prompten, ingen förklaring

VIKTIGT: Svara BARA med den förbättrade prompten. Ingen inledning, ingen förklaring.`;
}

/**
 * Build the user message with context
 */
function buildUserMessage(
  originalPrompt: string,
  codeContext?: CodeContext,
  routerResult?: RouterResult
): string {
  let message = `Original prompt: "${originalPrompt}"`;

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
