/**
 * Code Crawler 2.0
 * ================
 *
 * Analyserar projektfiler för att hitta relevant kodkontext.
 * Används när Semantic Router detekterar "needs_code_context".
 *
 * FLÖDE (med FAST PATH):
 * 1. Om hints <= 3 och prompt < 80 chars → FAST PATH (quickSearch, ingen AI)
 * 2. Om fast path hittar matches → returnera direkt
 * 3. Annars → SLOW PATH med full AI-analys
 *
 * FAST PATH (quickSearch):
 * - Snabb strängmatchning utan OpenAI-anrop
 * - Returnerar top 3 matchande filer
 * - ~80% snabbare för enkla element-sökningar
 *
 * SLOW PATH (crawlCodeContext):
 * 1. Tar emot hints från Semantic Router
 * 2. Söker igenom projektets filer efter matchande kod
 * 3. Extraherar relevanta kodstycken med radnummer
 * 4. Använder AI för att analysera och föreslå ändringar
 *
 * VIKTIGT: Crawler är för ENRICHMENT, inte validation
 * Om crawler hittar inget ska v0 fortfarande anropas
 */

import OpenAI from "openai";
import type { GeneratedFile } from "./v0-generator";

// ============================================================================
// TYPES
// ============================================================================

export interface CodeSnippet {
  name: string; // File name
  snippet: string; // Relevant code snippet
  lineNumbers: [number, number]; // Start and end line numbers
  relevance: string; // Why this snippet is relevant
}

export interface CodeContext {
  relevantFiles: CodeSnippet[];
  componentStructure: string; // Visual representation of component hierarchy
  routingInfo: string; // Information about routing (Next.js, etc.)
  suggestedChanges: string; // AI-suggested changes based on analysis
  summary: string; // Short summary for logging
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model for code analysis - needs to understand code well
const CRAWLER_MODEL = "gpt-4o-mini";

// Maximum snippet length to include
const MAX_SNIPPET_LENGTH = 500;

// ============================================================================
// OPENAI CLIENT
// ============================================================================

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Search for hints in file content (case-insensitive)
 */
function searchFileForHints(
  content: string,
  hints: string[]
): { found: boolean; matches: string[]; score: number } {
  const lowerContent = content.toLowerCase();
  const matches: string[] = [];
  let score = 0;

  for (const hint of hints) {
    const lowerHint = hint.toLowerCase();
    if (lowerContent.includes(lowerHint)) {
      matches.push(hint);
      // Higher score for more specific matches
      const count = (lowerContent.match(new RegExp(lowerHint, "g")) || []).length;
      score += count * hint.length; // Longer hints = more specific = higher score
    }
  }

  return { found: matches.length > 0, matches, score };
}

/**
 * Extract a code snippet around a match
 */
function extractSnippet(
  content: string,
  hint: string,
  contextLines: number = 5
): { snippet: string; startLine: number; endLine: number } {
  const lines = content.split("\n");
  const lowerHint = hint.toLowerCase();

  // Find the line containing the hint
  let matchLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lowerHint)) {
      matchLineIndex = i;
      break;
    }
  }

  if (matchLineIndex === -1) {
    return { snippet: "", startLine: 0, endLine: 0 };
  }

  // Extract context around the match
  const startLine = Math.max(0, matchLineIndex - contextLines);
  const endLine = Math.min(lines.length - 1, matchLineIndex + contextLines);

  const snippetLines = lines.slice(startLine, endLine + 1);
  let snippet = snippetLines.join("\n");

  // Truncate if too long
  if (snippet.length > MAX_SNIPPET_LENGTH) {
    snippet = snippet.substring(0, MAX_SNIPPET_LENGTH) + "\n... [truncated]";
  }

  return {
    snippet,
    startLine: startLine + 1, // Convert to 1-based
    endLine: endLine + 1,
  };
}

/**
 * Analyze component structure from files
 */
function analyzeStructure(files: GeneratedFile[]): string {
  const components: string[] = [];
  const routes: string[] = [];

  for (const file of files) {
    // Detect components
    if (file.name.endsWith(".tsx") || file.name.endsWith(".jsx")) {
      const componentMatch = file.content.match(
        /(?:export\s+(?:default\s+)?(?:function|const)\s+(\w+))|(?:const\s+(\w+)\s*=)/
      );
      if (componentMatch) {
        const name = componentMatch[1] || componentMatch[2];
        if (name && !["default", "export"].includes(name.toLowerCase())) {
          components.push(name);
        }
      }
    }

    // Detect Next.js routes
    if (file.name.includes("app/") && file.name.includes("page.")) {
      const routePath = file.name
        .replace(/app\/?/, "/")
        .replace(/page\.(tsx|jsx|ts|js)$/, "")
        .replace(/\/$/, "") || "/";
      routes.push(routePath);
    }
  }

  const structure: string[] = [];
  if (components.length > 0) {
    structure.push(`Components: ${components.slice(0, 10).join(", ")}${components.length > 10 ? "..." : ""}`);
  }
  if (routes.length > 0) {
    structure.push(`Routes: ${routes.join(", ")}`);
  }

  return structure.join("\n") || "No clear structure detected";
}

// ============================================================================
// MAIN CRAWLER FUNCTION
// ============================================================================

/**
 * Crawl project files to find relevant code context.
 *
 * @param files - Array of project files from v0
 * @param hints - Context hints from Semantic Router
 * @param userPrompt - Original user prompt for additional context
 * @returns CodeContext with relevant snippets and analysis
 */
export async function crawlCodeContext(
  files: GeneratedFile[],
  hints: string[],
  userPrompt: string
): Promise<CodeContext> {
  console.log("[CodeCrawler] Starting analysis with hints:", hints);
  console.log("[CodeCrawler] Files to analyze:", files.length);

  // Handle empty files
  if (!files || files.length === 0) {
    console.log("[CodeCrawler] No files to analyze");
    return {
      relevantFiles: [],
      componentStructure: "No files in project",
      routingInfo: "Unknown - no files",
      suggestedChanges: "Cannot analyze without files",
      summary: "No files available for analysis",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAST PATH: Use quickSearch for simple cases (no AI needed)
  // This is much faster and cheaper for straightforward element lookups
  // ═══════════════════════════════════════════════════════════════════════════
  if (hints.length > 0 && hints.length <= 3 && userPrompt.length < 80) {
    console.log("[CodeCrawler] Trying FAST PATH (quickSearch)...");
    const quickResults = quickSearch(files, hints);

    if (quickResults.length > 0) {
      console.log(
        `[CodeCrawler] FAST PATH success: found ${quickResults.length} matches`
      );

      // Get structure info (fast, no AI)
      const componentStructure = analyzeStructure(files);
      const hasAppRouter = files.some(
        (f) => f.name.includes("app/") && f.name.includes("page.")
      );
      const hasPagesRouter = files.some((f) => f.name.startsWith("pages/"));
      const routingInfo = hasAppRouter
        ? "Next.js App Router"
        : hasPagesRouter
        ? "Next.js Pages Router"
        : "Unknown routing";

      return {
        relevantFiles: quickResults,
        componentStructure,
        routingInfo,
        suggestedChanges: `Quick search hittade ${quickResults.length} matchande filer.`,
        summary: `Fast path: ${quickResults.map((f) => f.name).join(", ")}`,
      };
    }
    console.log("[CodeCrawler] FAST PATH: no matches, falling back to full analysis");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLOW PATH: Full analysis with AI (only when fast path fails)
  // ═══════════════════════════════════════════════════════════════════════════

  // Step 1: Search files for hints
  const fileMatches: Array<{
    file: GeneratedFile;
    matches: string[];
    score: number;
  }> = [];

  for (const file of files) {
    const result = searchFileForHints(file.content, hints);
    if (result.found) {
      fileMatches.push({
        file,
        matches: result.matches,
        score: result.score,
      });
    }
  }

  // Sort by relevance score
  fileMatches.sort((a, b) => b.score - a.score);
  console.log("[CodeCrawler] Files matching hints:", fileMatches.length);

  // Step 2: Extract snippets from top matches
  const relevantFiles: CodeSnippet[] = [];

  for (const match of fileMatches.slice(0, 5)) {
    // Top 5 files
    // Find the best hint to extract snippet for
    const bestHint = match.matches.reduce((a, b) =>
      (match.file.content.toLowerCase().match(new RegExp(a.toLowerCase(), "g")) || [])
        .length >
      (match.file.content.toLowerCase().match(new RegExp(b.toLowerCase(), "g")) || [])
        .length
        ? a
        : b
    );

    const { snippet, startLine, endLine } = extractSnippet(
      match.file.content,
      bestHint
    );

    if (snippet) {
      relevantFiles.push({
        name: match.file.name,
        snippet,
        lineNumbers: [startLine, endLine],
        relevance: `Matches: ${match.matches.join(", ")}`,
      });
    }
  }

  // Step 3: Analyze structure
  const componentStructure = analyzeStructure(files);

  // Step 4: Detect routing info
  let routingInfo = "Unknown routing";
  const hasAppRouter = files.some((f) => f.name.includes("app/") && f.name.includes("page."));
  const hasPagesRouter = files.some((f) => f.name.startsWith("pages/"));

  if (hasAppRouter) {
    routingInfo = "Next.js App Router";
  } else if (hasPagesRouter) {
    routingInfo = "Next.js Pages Router";
  }

  // Step 5: Use AI to suggest changes
  let suggestedChanges = "";
  let summary = "";

  if (relevantFiles.length > 0) {
    const client = getOpenAIClient();

    const snippetsText = relevantFiles
      .map(
        (f) =>
          `📁 ${f.name} (rad ${f.lineNumbers[0]}-${f.lineNumbers[1]}):\n\`\`\`\n${f.snippet}\n\`\`\`\nRelevans: ${f.relevance}`
      )
      .join("\n\n");

    try {
      const analysisResponse = await client.responses.create({
        model: CRAWLER_MODEL,
        instructions: `Du är en kodanalysexpert. Analysera koden och föreslå ändringar baserat på användarens önskemål.

ANVÄNDARENS ÖNSKEMÅL: "${userPrompt}"

HITTAD KODKONTEXT:
${snippetsText}

PROJEKTSTRUKTUR:
${componentStructure}
Routing: ${routingInfo}

Svara med JSON (ingen markdown):
{
  "suggestedChanges": "Detaljerad beskrivning av vilka ändringar som behövs och var",
  "summary": "En mening som sammanfattar vad som hittades"
}`,
        input: "Analysera och föreslå ändringar",
        store: false,
      });

      const responseText = analysisResponse.output_text || "{}";

      // Extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        suggestedChanges = parsed.suggestedChanges || "";
        summary = parsed.summary || "";
      }
    } catch (error) {
      console.error("[CodeCrawler] AI analysis error:", error);
      suggestedChanges = `Hittade ${relevantFiles.length} relevanta filer. Manuell analys krävs.`;
      summary = `Matchar hints i ${relevantFiles.map((f) => f.name).join(", ")}`;
    }
  } else {
    suggestedChanges = "Inga matchande filer hittades för de angivna hints.";
    summary = "Inga träffar - kan behöva bredare sökning";
  }

  const result: CodeContext = {
    relevantFiles,
    componentStructure,
    routingInfo,
    suggestedChanges,
    summary,
  };

  console.log("[CodeCrawler] Analysis complete:", {
    filesFound: relevantFiles.length,
    structure: componentStructure.substring(0, 100),
    routing: routingInfo,
    summary,
  });

  return result;
}

// ============================================================================
// QUICK SEARCH (No AI, faster)
// ============================================================================

/**
 * Quick search without AI analysis - for faster responses when AI isn't needed.
 */
export function quickSearch(
  files: GeneratedFile[],
  hints: string[]
): CodeSnippet[] {
  const results: CodeSnippet[] = [];

  for (const file of files) {
    const { found, matches, score } = searchFileForHints(file.content, hints);
    if (found && score > 0) {
      const bestHint = matches[0];
      const { snippet, startLine, endLine } = extractSnippet(file.content, bestHint);

      if (snippet) {
        results.push({
          name: file.name,
          snippet,
          lineNumbers: [startLine, endLine],
          relevance: `Matches: ${matches.join(", ")} (score: ${score})`,
        });
      }
    }
  }

  // Sort by relevance and return top 3
  return results
    .sort((a, b) => {
      const scoreA = parseInt(a.relevance.match(/score: (\d+)/)?.[1] || "0");
      const scoreB = parseInt(b.relevance.match(/score: (\d+)/)?.[1] || "0");
      return scoreB - scoreA;
    })
    .slice(0, 3);
}

