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
import type { CodeContext, CodeSnippet } from "./code-crawler";
import type { RouterResult } from "./semantic-router";

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
1. Behåll ALLTID användarens ursprungliga intention - ändra INTE vad användaren vill, bara HUR det ska göras
2. Lägg till KONKRETA tekniska detaljer (pixelvärden, färger, CSS-egenskaper, komponentnamn)
3. Föreslå SPECIFIKA förbättringar som kan implementeras direkt
4. Om kodkontext finns, referera till SPECIFIKA element/komponenter från koden (använd filnamn och radnummer)
5. Om kodkontext finns, föreslå ändringar som passar den befintliga strukturen
6. Generera MER SPECIFIKA tekniska instruktioner när kodkontext finns (t.ex. "ändra padding i Header-komponenten från 12px till 24px")
7. Håll svaret KONCIST - max 2-3 meningar
8. Svara ENDAST med den förbättrade prompten, ingen förklaring

VIKTIGT: 
- Svara BARA med den förbättrade prompten. Ingen inledning, ingen förklaring.
- Om kodkontext finns, använd den aktivt för att göra prompten mer specifik.
- Behåll användarens ursprungliga intention - förbättra bara detaljerna.`;
}

/**
 * Build the user message with context
 * IMPROVED: Uses code context more actively when available
 */
function buildUserMessage(
  originalPrompt: string,
  codeContext?: CodeContext,
  routerResult?: RouterResult
): string {
  let message = `Original prompt: "${originalPrompt}"`;

  // IMPROVED: Add code context more actively when available
  if (codeContext?.relevantFiles?.length) {
    message += `\n\nKODKONTEXT (använd detta aktivt när du förbättrar prompten):`;
    message += `\n${"=".repeat(50)}`;

    // Include more details from code context
    codeContext.relevantFiles
      .slice(0, 3) // Max 3 files
      .forEach((f: CodeSnippet) => {
        message += `\n\n📁 ${f.name} (rad ${f.lineNumbers[0]}-${f.lineNumbers[1]}):`;
        message += `\n\`\`\`\n${f.snippet.substring(0, 200)}${
          f.snippet.length > 200 ? "..." : ""
        }\n\`\`\``;
        if (f.relevance) {
          message += `\nRelevans: ${f.relevance}`;
        }
      });

    // Add structure info if available
    if (codeContext.componentStructure) {
      message += `\n\nStruktur: ${codeContext.componentStructure}`;
    }

    if (codeContext.routingInfo) {
      message += `\nRouting: ${codeContext.routingInfo}`;
    }

    message += `\n${"=".repeat(50)}`;
    message += `\n\nVIKTIGT: När du förbättrar prompten, referera till specifika element/komponenter från kodkontexten ovan.`;
  }

  // Add router hints if available
  if (routerResult?.contextHints?.length) {
    message += `\n\nElement att fokusera på: ${routerResult.contextHints.join(
      ", "
    )}`;
  }

  // Add intent context
  if (routerResult?.intent) {
    message += `\nIntent: ${routerResult.intent}`;
    if (routerResult.codeInstruction) {
      message += `\nKodinstruktion: ${routerResult.codeInstruction}`;
    }
  }

  message +=
    "\n\nFörbättra prompten med specifika tekniska instruktioner baserat på kodkontexten:";

  return message;
}

/**
 * Clean and validate the enhanced prompt
 * IMPROVED: Better preservation of original intention
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
    /^den förbättrade prompten är:\s*/i,
    /^här är:\s*/i,
  ];

  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Remove quotes if the entire response is quoted
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // IMPROVED: Check if cleaned prompt still preserves original intention
  // If the cleaned prompt doesn't mention key concepts from original, it might have lost the intention
  const originalKeywords = extractKeyConcepts(originalPrompt);
  const cleanedKeywords = extractKeyConcepts(cleaned);

  // If cleaned prompt lost too many key concepts, it might have changed the intention
  // In that case, try to merge original with cleaned
  if (originalKeywords.length > 0) {
    const preservedKeywords = originalKeywords.filter((kw) =>
      cleanedKeywords.some(
        (ckw) =>
          ckw.toLowerCase().includes(kw.toLowerCase()) ||
          kw.toLowerCase().includes(ckw.toLowerCase())
      )
    );

    // If less than 50% of keywords preserved, the enhancement might have changed intention
    if (
      preservedKeywords.length < originalKeywords.length * 0.5 &&
      originalKeywords.length > 2
    ) {
      console.warn(
        "[SemanticEnhancer] Enhanced prompt might have lost original intention, merging..."
      );
      // Merge: start with original, add technical details from cleaned
      const technicalDetails = extractTechnicalDetails(cleaned);
      if (technicalDetails.length > 0) {
        cleaned = `${originalPrompt} ${technicalDetails.join(", ")}`;
      }
    }
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

/**
 * Extract key concepts from a prompt (nouns, important words)
 */
function extractKeyConcepts(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const words = lower.split(/\s+/);

  // Filter out common words and keep meaningful nouns/concepts
  const stopWords = new Set([
    "en",
    "ett",
    "den",
    "det",
    "de",
    "som",
    "och",
    "eller",
    "men",
    "för",
    "med",
    "till",
    "på",
    "av",
    "om",
    "i",
    "är",
    "ska",
    "kan",
    "vill",
    "gör",
    "ändra",
    "sätt",
    "lägg",
  ]);

  return words.filter((w) => w.length > 3 && !stopWords.has(w)).slice(0, 5); // Max 5 key concepts
}

/**
 * Extract technical details (CSS properties, measurements, etc.) from enhanced prompt
 */
function extractTechnicalDetails(prompt: string): string[] {
  const details: string[] = [];
  const lower = prompt.toLowerCase();

  // Look for CSS properties, measurements, colors
  const patterns = [
    /\d+px/g,
    /\d+rem/g,
    /#[0-9a-f]{3,6}/gi,
    /rgb\([^)]+\)/gi,
    /rgba\([^)]+\)/gi,
    /(?:padding|margin|border|width|height|font-size|color|background):\s*[^,;]+/gi,
  ];

  for (const pattern of patterns) {
    const matches = prompt.match(pattern);
    if (matches) {
      details.push(...matches);
    }
  }

  return details.slice(0, 5); // Max 5 technical details
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
