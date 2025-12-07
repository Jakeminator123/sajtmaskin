/**
 * Orchestrator Agent
 * ==================
 * 
 * Meta-agent som koordinerar arbetsflöden mellan olika verktyg:
 * - OpenAI web_search för att crawla/söka online
 * - OpenAI image_generation för bilder
 * - v0 API för kodgenerering
 * 
 * EXEMPEL-FLÖDEN:
 * 
 * 1. "Gå till amazon.com och hämta deras färger, implementera dessa"
 *    → web_search amazon.com
 *    → analysera färger från resultat
 *    → generera prompt till v0 med färgerna
 *    → skicka till v0 API
 * 
 * 2. "Skapa en hero-bild med mitt företag, lägg till på startsidan"
 *    → image_generation med företagsprompt
 *    → generera kod med v0 som inkluderar bilden
 * 
 * 3. "Hitta trender inom SaaS-design och skapa en modern landing page"
 *    → web_search SaaS design trends
 *    → sammanfatta trender
 *    → generera landing page med v0 baserat på trender
 */

import OpenAI from "openai";
import { generateWebsite, refineWebsite } from "@/lib/api-client";
import type { QualityLevel } from "@/lib/api-client";

// Initialize OpenAI client
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// Workflow step types
type WorkflowStep = 
  | { type: "web_search"; query: string }
  | { type: "image_generation"; prompt: string }
  | { type: "v0_generate"; prompt: string; categoryType?: string }
  | { type: "v0_refine"; instruction: string; chatId: string; code: string };

export interface OrchestratorContext {
  userId?: string;
  projectId?: string;
  quality: QualityLevel;
  existingChatId?: string;
  existingCode?: string;
}

export interface OrchestratorResult {
  success: boolean;
  message: string;
  // v0 generation result
  code?: string;
  files?: Array<{ name: string; content: string }>;
  chatId?: string;
  demoUrl?: string;
  versionId?: string;
  // Additional context
  webSearchResults?: Array<{ title: string; url: string; snippet: string }>;
  generatedImages?: Array<{ base64: string; prompt: string }>;
  workflowSteps?: string[];
  error?: string;
}

/**
 * Orchestrate a complex workflow based on user prompt
 * Uses OpenAI Responses API to:
 * 1. Analyze the user's request
 * 2. Determine which tools are needed
 * 3. Execute tools in the right order
 * 4. Generate final v0 prompt with context
 * 5. Call v0 API to generate code
 */
export async function orchestrateWorkflow(
  userPrompt: string,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const workflowSteps: string[] = [];
  
  try {
    console.log("[Orchestrator] Starting workflow for prompt:", userPrompt.substring(0, 100));
    
    // Step 1: Analyze the prompt and plan workflow
    const client = getOpenAIClient();
    
    const planningResponse = await client.responses.create({
      model: "gpt-4o-mini", // Fast model for planning
      instructions: `Du är en workflow-planerare för webbplatsgenerering.

Analysera användarens prompt och bestäm vilket arbetsflöde som behövs.

TILLGÄNGLIGA VERKTYG:
1. web_search - Sök/crawla webbplatser för information, färger, inspiration
2. image_generation - Generera bilder, loggor, ikoner
3. v0_generate - Generera webbplatskod (sista steget alltid)

VIKTIGT:
- Om användaren vill "hämta/kopiera/inspektera" från en URL → använd web_search FÖRST
- Om användaren vill ha custom bilder/loggor → använd image_generation
- Alltid avsluta med v0_generate för att skapa faktisk kod
- Om det är en enkel kodgenerering utan externa källor → bara v0_generate

Svara med JSON:
{
  "needsWebSearch": boolean,
  "webSearchQuery": string | null,
  "needsImageGeneration": boolean,
  "imagePrompts": string[] | null,
  "v0Prompt": string,
  "categoryType": string | null,
  "reasoning": string
}`,
      input: userPrompt,
      text: {
        format: {
          type: "json_schema",
          json_schema: {
            name: "workflow_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                needsWebSearch: { type: "boolean" },
                webSearchQuery: { type: ["string", "null"] },
                needsImageGeneration: { type: "boolean" },
                imagePrompts: { 
                  type: ["array", "null"],
                  items: { type: "string" }
                },
                v0Prompt: { type: "string" },
                categoryType: { type: ["string", "null"] },
                reasoning: { type: "string" }
              },
              required: ["needsWebSearch", "webSearchQuery", "needsImageGeneration", "imagePrompts", "v0Prompt", "categoryType", "reasoning"],
              additionalProperties: false
            }
          }
        }
      }
    });

    const planText = planningResponse.output_text;
    console.log("[Orchestrator] Plan:", planText);
    
    let plan;
    try {
      plan = JSON.parse(planText);
    } catch (e) {
      console.error("[Orchestrator] Failed to parse plan:", e);
      throw new Error("Kunde inte planera arbetsflöde");
    }

    workflowSteps.push(`Planering: ${plan.reasoning}`);

    let webSearchContext = "";
    const webSearchResults: Array<{ title: string; url: string; snippet: string }> = [];
    let generatedImages: Array<{ base64: string; prompt: string }> = [];

    // Step 2: Execute web search if needed
    if (plan.needsWebSearch && plan.webSearchQuery) {
      console.log("[Orchestrator] Executing web search:", plan.webSearchQuery);
      workflowSteps.push(`Söker online: ${plan.webSearchQuery}`);
      
      try {
        const searchResponse = await client.responses.create({
          model: "gpt-4o-mini",
          instructions: "Du är en webbsökning-expert. Sök efter relevant information och sammanfatta resultaten.",
          input: plan.webSearchQuery,
          tools: [{ type: "web_search" }]
        });

        // Extract search results
        const searchResults = searchResponse.output.filter(
          (item) => item.type === "web_search_call"
        );

        for (const result of searchResults) {
          if ("results" in result && Array.isArray(result.results)) {
            for (const r of result.results as Array<{ title?: string; url?: string; snippet?: string }>) {
              if (r.title && r.url) {
                webSearchResults.push({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet || ""
                });
              }
            }
          }
        }

        // Extract the AI's summary
        webSearchContext = searchResponse.output_text || "";
        console.log("[Orchestrator] Web search complete, found", webSearchResults.length, "results");
        workflowSteps.push(`Hittade ${webSearchResults.length} resultat`);
      } catch (error) {
        console.error("[Orchestrator] Web search failed:", error);
        workflowSteps.push("Webbsökning misslyckades (fortsätter ändå)");
      }
    }

    // Step 3: Generate images if needed
    if (plan.needsImageGeneration && plan.imagePrompts && plan.imagePrompts.length > 0) {
      console.log("[Orchestrator] Generating images:", plan.imagePrompts.length);
      workflowSteps.push(`Genererar ${plan.imagePrompts.length} bild(er)`);

      for (const imagePrompt of plan.imagePrompts.slice(0, 3)) { // Max 3 images
        try {
          const imageResponse = await client.images.generate({
            model: "gpt-image-1",
            prompt: imagePrompt,
            size: "1024x1024",
            quality: "medium",
            n: 1,
            output_format: "png"
          });

          if (imageResponse.data && imageResponse.data[0]?.b64_json) {
            generatedImages.push({
              base64: imageResponse.data[0].b64_json,
              prompt: imagePrompt
            });
            workflowSteps.push(`Bild genererad: ${imagePrompt.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error("[Orchestrator] Image generation failed:", error);
          workflowSteps.push("Bildgenerering misslyckades (fortsätter ändå)");
        }
      }
    }

    // Step 4: Build enhanced v0 prompt with context
    let enhancedV0Prompt = plan.v0Prompt;

    if (webSearchContext) {
      enhancedV0Prompt += `\n\nKontext från webbsökning:\n${webSearchContext.substring(0, 2000)}`;
    }

    if (generatedImages.length > 0) {
      enhancedV0Prompt += `\n\nOBS: ${generatedImages.length} custom bild(er) har genererats. Använd placeholder-bilder i koden (bilderna kommer läggas till separat).`;
    }

    console.log("[Orchestrator] Enhanced v0 prompt length:", enhancedV0Prompt.length);
    workflowSteps.push("Genererar webbplatskod med v0");

    // Step 5: Call v0 API to generate code
    let v0Result;
    
    if (context.existingChatId && context.existingCode) {
      // Refinement mode
      console.log("[Orchestrator] Refining existing code");
      v0Result = await refineWebsite(
        context.existingCode,
        enhancedV0Prompt,
        context.quality,
        context.existingChatId
      );
    } else {
      // New generation
      console.log("[Orchestrator] Generating new website");
      v0Result = await generateWebsite(
        enhancedV0Prompt,
        plan.categoryType || undefined,
        context.quality
      );
    }

    if (!v0Result.success) {
      throw new Error(v0Result.error || "v0 generering misslyckades");
    }

    workflowSteps.push("Webbplatskod genererad!");

    return {
      success: true,
      message: "Arbetsflöde slutfört framgångsrikt",
      code: v0Result.code,
      files: v0Result.files,
      chatId: v0Result.chatId,
      demoUrl: v0Result.demoUrl,
      versionId: v0Result.versionId,
      webSearchResults: webSearchResults.length > 0 ? webSearchResults : undefined,
      generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
      workflowSteps
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";
    console.error("[Orchestrator] Workflow failed:", errorMessage);
    
    return {
      success: false,
      message: "Arbetsflöde misslyckades",
      error: errorMessage,
      workflowSteps
    };
  }
}

/**
 * Simple check if prompt needs orchestration
 * Returns true if prompt contains keywords that suggest multi-step workflow
 */
export function needsOrchestration(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  
  // Keywords that suggest web search is needed
  const webSearchKeywords = [
    "gå till", "besök", "hämta från", "kopiera från", "inspektera",
    "amazon", "netflix", "apple", "google", ".com", ".se",
    "hitta", "sök efter", "researcha", "undersök"
  ];
  
  // Keywords that suggest image generation
  const imageKeywords = [
    "skapa bild", "generera logo", "hero-bild", "bakgrundsbild"
  ];

  const needsWebSearch = webSearchKeywords.some(keyword => lower.includes(keyword));
  const needsImages = imageKeywords.some(keyword => lower.includes(keyword));

  return needsWebSearch || needsImages;
}
