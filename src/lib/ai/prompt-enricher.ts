/**
 * Prompt Enricher
 * ================
 *
 * Kombinerar all insamlad kontext till en rik, detaljerad prompt
 * som v0 kan förstå och agera på.
 *
 * ROLL (förtydligad):
 * - KOMBINERA alla delar till slutlig prompt
 * - FORMATERA för v0:s förståelse
 * - LÄGGA TILL instruktioner baserat på intent
 *
 * INTE Prompt Enrichers roll:
 * - Förbättra prompten semantiskt (→ Semantic Enhancer)
 * - Hitta koddelar (→ Code Crawler)
 * - Klassificera intent (→ Semantic Router)
 *
 * INPUTS:
 * - Användarens originalpromt
 * - Förbättrad prompt från Semantic Enhancer (enhancedPrompt)
 * - Kodkontext från Code Crawler
 * - Webbsökresultat (om tillämpligt)
 * - Genererade bilder (om tillämpligt)
 * - Router-resultat med intent och instruktioner
 *
 * OUTPUT:
 * En strukturerad prompt med tydliga sektioner som v0 lätt kan tolka.
 */

import type { CodeContext, CodeSnippet } from "@/lib/code-crawler";
import type { RouterResult } from "@/lib/ai/semantic-router";

// ============================================================================
// TYPES
// ============================================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  description?: string;
}

export interface EnrichmentContext {
  originalPrompt: string;
  enhancedPrompt?: string; // From Semantic Enhancer
  // Compact mode: produce a shorter prompt (no heavy sections) when v0 already has context/history
  compact?: boolean;
  routerResult?: RouterResult;
  codeContext?: CodeContext;
  webResults?: WebSearchResult[];
  generatedImages?: GeneratedImage[];
}

// ============================================================================
// MAIN ENRICHER FUNCTION
// ============================================================================

/**
 * Enrich a prompt with all available context.
 *
 * @param context - All available context for enrichment
 * @returns Enriched prompt string ready for v0
 */
export function enrichPrompt(context: EnrichmentContext): string {
  const {
    originalPrompt,
    enhancedPrompt,
    compact = false,
    routerResult,
    codeContext,
    webResults,
    generatedImages,
  } = context;

  const sections: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: USER REQUEST (use enhanced prompt if available)
  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTANT: If enhancedPrompt is provided, use it as the main prompt
  // This ensures Creative Brief Enhancer's expanded prompts are preserved
  const mainPrompt = enhancedPrompt || originalPrompt;
  sections.push(`USER REQUEST: ${mainPrompt}`);

  // If prompt was enhanced, show original for reference (but don't duplicate)
  // Only show original if it's significantly different and adds context
  if (
    !compact && // Skip extra context in compact mode
    enhancedPrompt &&
    enhancedPrompt !== originalPrompt &&
    originalPrompt.length < enhancedPrompt.length * 0.7
  ) {
    sections.push(`(Original request: ${originalPrompt})`);
  }

  // In compact mode, keep it minimal: skip code/web sections unless explicitly provided
  const shouldIncludeCodeContext = !compact && codeContext && codeContext.relevantFiles.length > 0;
  const shouldIncludeWebResults = !compact && webResults && webResults.length > 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: CODE CONTEXT (if available)
  // ═══════════════════════════════════════════════════════════════════════════
  if (shouldIncludeCodeContext) {
    const codeLines: string[] = ["", "CODE CONTEXT FOUND:"];
    codeLines.push("━".repeat(50));

    for (const file of codeContext.relevantFiles) {
      codeLines.push(
        `📁 ${file.name} (rad ${file.lineNumbers[0]}-${file.lineNumbers[1]}):`
      );
      codeLines.push("```");
      codeLines.push(file.snippet);
      codeLines.push("```");
      codeLines.push(`Relevans: ${file.relevance}`);
      codeLines.push("");
    }

    codeLines.push("━".repeat(50));

    // Add structure and routing info
    if (codeContext.componentStructure) {
      codeLines.push(`STRUCTURE: ${codeContext.componentStructure}`);
    }
    if (codeContext.routingInfo) {
      codeLines.push(`ROUTING: ${codeContext.routingInfo}`);
    }

    // NOTE: suggestedChanges removed from CodeContext
    // Suggestions are now part of the enhanced prompt from Semantic Enhancer

    sections.push(codeLines.join("\n"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: WEB SEARCH RESULTS (if available)
  // ═══════════════════════════════════════════════════════════════════════════
  if (shouldIncludeWebResults) {
    const webLines: string[] = ["", "WEB SEARCH RESULTS:"];
    webLines.push("━".repeat(50));

    for (const result of webResults.slice(0, 5)) {
      webLines.push(`🔗 ${result.title}`);
      webLines.push(`   URL: ${result.url}`);
      webLines.push(`   ${result.snippet}`);
      webLines.push("");
    }

    sections.push(webLines.join("\n"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: GENERATED IMAGES (if available)
  // ═══════════════════════════════════════════════════════════════════════════
  if (generatedImages && generatedImages.length > 0) {
    const imageLines: string[] = ["", "GENERATED IMAGES AVAILABLE:"];
    imageLines.push("━".repeat(50));

    for (let i = 0; i < generatedImages.length; i++) {
      const img = generatedImages[i];
      imageLines.push(`🖼️ Image ${i + 1}: ${img.prompt}`);
      imageLines.push(`   URL: ${img.url}`);
      if (img.description) {
        imageLines.push(`   Description: ${img.description}`);
      }
      imageLines.push("");
    }

    imageLines.push(
      "USE THESE EXACT URLs in the code. Do NOT use placeholder images."
    );

    sections.push(imageLines.join("\n"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: ACTION INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const actionLines: string[] = ["", "INSTRUCTIONS FOR IMPLEMENTATION:"];

  // In compact mode, keep a minimal instruction set
  if (compact) {
    actionLines.push("1. Implement the request using the prompt above.");
    if (generatedImages && generatedImages.length > 0) {
      actionLines.push("2. Use provided image URLs exactly as given with alt text.");
    }
    actionLines.push("3. Preserve structure; ensure responsiveness and accessibility.");
  } else {
    // Add specific instructions based on intent
    if (routerResult?.intent === "needs_code_context" && codeContext) {
      actionLines.push(
        "1. UPDATE the identified code sections based on the user request"
      );
      actionLines.push(
        "2. PRESERVE the overall structure and style of the existing code"
      );
      actionLines.push("3. CREATE any new files/routes if needed");
      actionLines.push("4. ENSURE all links and navigation work correctly");
    } else if (routerResult?.intent === "web_and_code" && webResults) {
      actionLines.push(
        "1. ANALYZE the referenced website(s) for design inspiration"
      );
      actionLines.push(
        "2. APPLY similar styling while keeping the existing structure"
      );
      actionLines.push("3. MAINTAIN brand consistency with the current design");
    } else if (
      routerResult?.intent === "image_and_code" ||
      (generatedImages && generatedImages.length > 0)
    ) {
      actionLines.push("1. USE the provided image URL(s) exactly as given");
      actionLines.push("2. PLACE the image(s) in the appropriate section");
      actionLines.push("3. ADD proper alt text and responsive sizing");
      actionLines.push("4. ENSURE images are accessible and load correctly");
    } else {
      actionLines.push("1. IMPLEMENT the requested changes");
      actionLines.push("2. PRESERVE the overall structure and design");
      actionLines.push("3. TEST that all functionality still works");
    }
  }

  sections.push(actionLines.join("\n"));

  // Combine all sections
  return sections.join("\n");
}

// ============================================================================
// HELPER: Format code snippet for display
// ============================================================================

/**
 * Format a code snippet for better readability in prompts.
 */
export function formatCodeSnippet(snippet: CodeSnippet): string {
  const lines: string[] = [
    `📁 ${snippet.name} (lines ${snippet.lineNumbers[0]}-${snippet.lineNumbers[1]}):`,
    "```",
    snippet.snippet,
    "```",
  ];

  if (snippet.relevance) {
    lines.push(`Relevance: ${snippet.relevance}`);
  }

  return lines.join("\n");
}

// ============================================================================
// HELPER: Create minimal enrichment
// ============================================================================

/**
 * Create a minimal enrichment when only basic context is available.
 * Used as fallback when full enrichment fails.
 */
export function minimalEnrichment(
  originalPrompt: string,
  codeHints?: string[]
): string {
  const lines: string[] = [`USER REQUEST: ${originalPrompt}`, ""];

  if (codeHints && codeHints.length > 0) {
    lines.push(`CONTEXT HINTS: ${codeHints.join(", ")}`);
    lines.push("");
    lines.push("Please locate and modify the relevant code sections.");
  }

  lines.push("");
  lines.push("INSTRUCTIONS:");
  lines.push("1. Implement the requested changes");
  lines.push("2. Preserve the overall structure");
  lines.push("3. Ensure all functionality works correctly");

  return lines.join("\n");
}

// ============================================================================
// HELPER: Create summary for logging
// ============================================================================

/**
 * Create a summary of the enrichment for logging purposes.
 */
export function createEnrichmentSummary(context: EnrichmentContext): string {
  const parts: string[] = [];

  parts.push(`Prompt: "${context.originalPrompt.substring(0, 50)}..."`);

  if (context.routerResult) {
    parts.push(`Intent: ${context.routerResult.intent}`);
  }

  if (context.codeContext) {
    parts.push(`Code files: ${context.codeContext.relevantFiles.length}`);
  }

  if (context.webResults) {
    parts.push(`Web results: ${context.webResults.length}`);
  }

  if (context.generatedImages) {
    parts.push(`Images: ${context.generatedImages.length}`);
  }

  return parts.join(" | ");
}
