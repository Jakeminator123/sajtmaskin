/**
 * AI SDK 6 Agent Implementation
 *
 * ToolLoopAgent-baserad orchestrator som alternativ till det funktionella flödet.
 * Aktiveras via feature flags.
 *
 * @see https://vercel.com/blog/ai-sdk-6
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/agents
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { isAIFeatureEnabled } from "@/lib/ai/ai-sdk-features";
// ═══════════════════════════════════════════════════════════════════════
// AI GATEWAY IMPORT (COMMENTED OUT FOR FUTURE USE)
// import { getAIProvider } from "@/lib/ai/ai-gateway";
// ═══════════════════════════════════════════════════════════════════════
import { quickSearch, type CodeSnippet } from "@/lib/code-crawler";
import { semanticEnhance } from "@/lib/ai/semantic-enhancer";
import type { RouterResult } from "@/lib/ai/semantic-router";
import type { GeneratedFile } from "@/lib/v0/v0-generator";
import { isMCPEnabled, searchDocs } from "@/lib/mcp-tools";

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

export interface AgentContext {
  userId: string;
  projectFiles?: GeneratedFile[];
  existingCode?: string;
  quality?: "standard" | "premium";
}

export interface AgentResult {
  intent: RouterResult["intent"];
  processedPrompt: string;
  codeContext?: CodeSnippet[];
  wasEnhanced: boolean;
  steps: string[];
  confidence: number;
}

// ============================================================================
// AGENT ORCHESTRATION
// ============================================================================

/**
 * Köra orchestration med Agent-approach
 *
 * Detta är en alternativ approach till det funktionella flödet i orchestrator-agent.ts.
 * Använder AI SDK 6:s tool-calling för att dynamiskt bestämma vilka steg som behövs.
 */
export async function runAgentOrchestration(
  userPrompt: string,
  context: AgentContext
): Promise<AgentResult> {
  // Kontrollera om Agent Mode är aktiverad
  if (!isAIFeatureEnabled("toolLoopAgent")) {
    throw new Error("ToolLoopAgent feature is not enabled");
  }

  const steps: string[] = [];
  let codeContext: CodeSnippet[] = [];
  let processedPrompt = userPrompt;
  let wasEnhanced = false;

  console.log(
    "[AIAgent] Starting agent orchestration for:",
    userPrompt.substring(0, 100)
  );

  try {
    // Steg 1: Analysera prompten och bestäm åtgärder
    steps.push("Analyzing user intent...");

    // ═══════════════════════════════════════════════════════════════════════
    // AI GATEWAY (COMMENTED OUT FOR FUTURE USE)
    // const provider = await getAIProvider(context.userId, "gpt-4o-mini");
    // const result = await generateText({ model: provider.model, ... });
    // ═══════════════════════════════════════════════════════════════════════

    // Use direct OpenAI API via AI SDK
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: `You are an intelligent orchestrator for an AI website builder.
Your task is to analyze the user's request and decide what actions are needed.

You have access to these tools:
1. codeAnalysis - Search project files for relevant code sections
2. promptEnhancement - Improve vague prompts into specific instructions

RULES:
- If the user mentions specific UI elements (header, footer, button, etc.), use codeAnalysis
- If the prompt is vague (e.g., "make it better", "fix this"), use promptEnhancement
- For clear, specific requests, you may not need any tools

Return a JSON response with:
{
  "intent": "simple_code" | "needs_code_context" | "clarify" | "chat_response",
  "needsCodeAnalysis": boolean,
  "needsEnhancement": boolean,
  "reasoning": "string"
}`,
      prompt: `User request: "${userPrompt}"
      
Project has ${context.projectFiles?.length || 0} files.
Has existing code: ${!!context.existingCode}`,
      maxOutputTokens: 300,
    });

    // Parse the analysis result
    let analysis: {
      intent: RouterResult["intent"];
      needsCodeAnalysis: boolean;
      needsEnhancement: boolean;
      reasoning: string;
    };

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch?.[0] || "{}");
    } catch {
      analysis = {
        intent: "simple_code",
        needsCodeAnalysis: true,
        needsEnhancement: true,
        reasoning: "Fallback due to parsing error",
      };
    }

    console.log("[AIAgent] Analysis:", analysis);

    // Steg 2: Kör Code Analysis om behövs
    if (analysis.needsCodeAnalysis && context.projectFiles?.length) {
      steps.push("Searching project code...");

      // Extract hints from prompt
      const hints = extractHintsFromPrompt(userPrompt);
      const snippets = quickSearch(context.projectFiles, hints);
      codeContext = snippets.slice(0, 5);

      console.log(
        `[AIAgent] Found ${codeContext.length} relevant code sections`
      );
    }

    // Steg 2b: Kör MCP Documentation Search om aktiverat
    if (isMCPEnabled()) {
      steps.push("Searching documentation...");

      const docResult = await searchDocs(userPrompt, "all", 3);
      if (docResult.success && docResult.data?.length) {
        console.log(`[AIAgent] Found ${docResult.data.length} relevant docs`);
        // Add doc context to prompt enhancement
        const docContext = docResult.data
          .map((d) => `[${d.source}] ${d.title}: ${d.snippet}`)
          .join("\n");
        if (docContext) {
          processedPrompt = `${userPrompt}\n\n[Documentation context]\n${docContext}`;
        }
      }
    }

    // Steg 3: Kör Prompt Enhancement om behövs
    if (analysis.needsEnhancement) {
      steps.push("Enhancing prompt...");

      const enhanceResult = await semanticEnhance({
        originalPrompt: userPrompt,
        codeContext: codeContext.length
          ? {
              relevantFiles: codeContext,
              componentStructure: "",
              routingInfo: "",
              summary: `Found ${codeContext.length} relevant code sections`,
            }
          : undefined,
      });

      if (enhanceResult.wasEnhanced) {
        processedPrompt = enhanceResult.enhancedPrompt;
        wasEnhanced = true;
        console.log(
          "[AIAgent] Prompt enhanced:",
          processedPrompt.substring(0, 100)
        );
      }
    }

    steps.push("Ready for code generation");

    return {
      intent: analysis.intent || "simple_code",
      processedPrompt,
      codeContext: codeContext.length ? codeContext : undefined,
      wasEnhanced,
      steps,
      confidence: 0.85,
    };
  } catch (error) {
    console.error("[AIAgent] Error:", error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extrahera sökord från användarens prompt
 */
function extractHintsFromPrompt(prompt: string): string[] {
  const commonTerms = [
    "header",
    "footer",
    "navigation",
    "nav",
    "menu",
    "button",
    "link",
    "image",
    "text",
    "title",
    "hero",
    "section",
    "card",
    "form",
    "input",
    "sidebar",
    "modal",
    "popup",
    "banner",
    "logo",
  ];

  const promptLower = prompt.toLowerCase();
  const found = commonTerms.filter((term) => promptLower.includes(term));

  // Also extract quoted strings
  const quotedMatches = prompt.match(/["']([^"']+)["']/g);
  if (quotedMatches) {
    found.push(...quotedMatches.map((m) => m.replace(/["']/g, "")));
  }

  // Extract words that might be component names (PascalCase)
  const pascalCaseMatches = prompt.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g);
  if (pascalCaseMatches) {
    found.push(...pascalCaseMatches.map((m) => m.toLowerCase()));
  }

  return [...new Set(found)];
}

/**
 * Kontrollera om Agent Mode ska användas
 */
export function shouldUseAgentMode(): boolean {
  return isAIFeatureEnabled("toolLoopAgent");
}
