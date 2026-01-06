/**
 * Code Crawler 2.0
 * ================
 *
 * Analyserar projektfiler för att hitta relevant kodkontext.
 * Används när Semantic Router detekterar "needs_code_context".
 *
 * ROLL (förtydligad):
 * - HITTA relevanta koddelar baserat på hints
 * - EXTRAHERA kodsnippets med radnummer
 * - ANALYSERA struktur (komponenter, routing)
 * - RETURNERA kodkontext för Semantic Enhancer
 *
 * INTE Code Crawlers roll:
 * - Föreslå ändringar (→ Semantic Enhancer)
 * - Förbättra prompten (→ Semantic Enhancer)
 * - Kombinera prompt + kontext (→ Prompt Enricher)
 *
 * FLÖDE:
 * 1. quickSearch: Snabb strängmatchning (ingen AI)
 * 2. Om quickSearch hittar → returnera direkt
 * 3. Om inte → utöka sökning med fler hints
 *
 * VIKTIGT: Crawler är för ENRICHMENT, inte validation
 * Om crawler hittar inget ska v0 fortfarande anropas
 */

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
  summary: string; // Short summary for logging
  // NOTE: suggestedChanges removed - that's Semantic Enhancer's job
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Maximum snippet length to include
const MAX_SNIPPET_LENGTH = 500;

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
      const count = (lowerContent.match(new RegExp(lowerHint, "g")) || [])
        .length;
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
      const routePath =
        file.name
          .replace(/app\/?/, "/")
          .replace(/page\.(tsx|jsx|ts|js)$/, "")
          .replace(/\/$/, "") || "/";
      routes.push(routePath);
    }
  }

  const structure: string[] = [];
  if (components.length > 0) {
    structure.push(
      `Components: ${components.slice(0, 10).join(", ")}${
        components.length > 10 ? "..." : ""
      }`
    );
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
 * NOTE: This function NO LONGER uses AI. It only does fast string matching.
 * AI-based analysis and suggestions are now handled by Semantic Enhancer.
 *
 * @param files - Array of project files from v0
 * @param hints - Context hints from Semantic Router
 * @param _userPrompt - Original user prompt (kept for API compatibility)
 * @returns CodeContext with relevant snippets
 */
export async function crawlCodeContext(
  files: GeneratedFile[],
  hints: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userPrompt: string
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
      summary: "No files available for analysis",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIMARY PATH: Use quickSearch (no AI needed)
  // This is fast and cheap - AI analysis moved to Semantic Enhancer
  // ═══════════════════════════════════════════════════════════════════════════

  let relevantFiles: CodeSnippet[] = [];

  if (hints.length > 0) {
    console.log("[CodeCrawler] Running quickSearch...");
    relevantFiles = quickSearch(files, hints);

    if (relevantFiles.length > 0) {
      console.log(`[CodeCrawler] Found ${relevantFiles.length} matches`);
    } else {
      console.log("[CodeCrawler] No direct matches, trying expanded search...");
      // Try expanded search with more files
      relevantFiles = expandedSearch(files, hints);
    }
  }

  // If still no matches, try searching all files for any hint
  if (relevantFiles.length === 0 && hints.length > 0) {
    console.log("[CodeCrawler] Trying broad search...");
    relevantFiles = broadSearch(files, hints);
  }

  // Analyze structure (fast, no AI)
  const componentStructure = analyzeStructure(files);

  // Detect routing info
  const hasAppRouter = files.some(
    (f) => f.name.includes("app/") && f.name.includes("page.")
  );
  const hasPagesRouter = files.some((f) => f.name.startsWith("pages/"));
  const routingInfo = hasAppRouter
    ? "Next.js App Router"
    : hasPagesRouter
    ? "Next.js Pages Router"
    : "Unknown routing";

  // Build summary
  const summary =
    relevantFiles.length > 0
      ? `Hittade ${relevantFiles.length} filer: ${relevantFiles
          .map((f) => f.name)
          .join(", ")}`
      : "Inga matchande filer hittades";

  const result: CodeContext = {
    relevantFiles,
    componentStructure,
    routingInfo,
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
// EXPANDED SEARCH (broader matching)
// ============================================================================

/**
 * Expanded search - looks for partial matches and related terms
 */
function expandedSearch(
  files: GeneratedFile[],
  hints: string[]
): CodeSnippet[] {
  const results: CodeSnippet[] = [];

  // Expand hints with related terms
  const expandedHints = new Set<string>();
  for (const hint of hints) {
    expandedHints.add(hint);
    expandedHints.add(hint.toLowerCase());

    // Add common variations
    if (hint.toLowerCase().includes("header")) {
      expandedHints.add("nav");
      expandedHints.add("navbar");
      expandedHints.add("navigation");
    }
    if (hint.toLowerCase().includes("footer")) {
      expandedHints.add("foot");
      expandedHints.add("bottom");
    }
    if (hint.toLowerCase().includes("button")) {
      expandedHints.add("btn");
      expandedHints.add("cta");
    }
  }

  for (const file of files) {
    const { found, matches, score } = searchFileForHints(
      file.content,
      Array.from(expandedHints)
    );

    if (found && score > 0) {
      const bestHint = matches[0];
      const { snippet, startLine, endLine } = extractSnippet(
        file.content,
        bestHint
      );

      if (snippet) {
        results.push({
          name: file.name,
          snippet,
          lineNumbers: [startLine, endLine],
          relevance: `Expanded match: ${matches.join(", ")}`,
        });
      }
    }
  }

  return results.slice(0, 5); // Top 5
}

// ============================================================================
// BROAD SEARCH (last resort)
// ============================================================================

/**
 * Broad search - looks in all TSX/JSX files for any relevant content
 */
function broadSearch(files: GeneratedFile[], hints: string[]): CodeSnippet[] {
  const results: CodeSnippet[] = [];

  // Focus on component files
  const componentFiles = files.filter(
    (f) => f.name.endsWith(".tsx") || f.name.endsWith(".jsx")
  );

  for (const file of componentFiles) {
    // Check if file name matches any hint
    const fileName = file.name.toLowerCase();
    for (const hint of hints) {
      if (fileName.includes(hint.toLowerCase())) {
        const { snippet, startLine, endLine } = extractSnippet(
          file.content,
          hint
        );

        if (snippet) {
          results.push({
            name: file.name,
            snippet,
            lineNumbers: [startLine, endLine],
            relevance: `Filename match: ${hint}`,
          });
          break;
        }
      }
    }
  }

  return results.slice(0, 3); // Top 3
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
      const { snippet, startLine, endLine } = extractSnippet(
        file.content,
        bestHint
      );

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
