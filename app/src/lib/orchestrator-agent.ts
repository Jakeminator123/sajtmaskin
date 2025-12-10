/**
 * Orchestrator Agent
 * ==================
 *
 * Smart meta-agent som koordinerar arbetsflöden mellan olika verktyg.
 *
 * VIKTIGT: Orchestratorn ANALYSERAR först vad användaren vill, sedan agerar.
 * Den skickar INTE alltid till v0 - bara när kod faktiskt ska ändras.
 *
 * INTENT TYPES:
 * - image_only: Bara generera bilder, visa i chat (INGEN kodändring)
 * - code_only: Bara ändra kod via v0
 * - image_and_code: Generera bilder OCH uppdatera kod
 * - web_search_only: Bara söka/researcha, returnera info
 * - web_search_and_code: Söka OCH uppdatera kod
 * - clarify: Ställ en följdfråga till användaren
 * - chat_response: Bara svara på en fråga, ingen action
 *
 * EXEMPEL-FLÖDEN:
 *
 * 1. "Generera en bild på en ost"
 *    → intent: image_only
 *    → Generera bild, returnera till chat
 *    → INGEN v0-kod ändras!
 *
 * 2. "Lägg till en hero-bild med en solnedgång på startsidan"
 *    → intent: image_and_code
 *    → Generera bild
 *    → Uppdatera kod med v0
 *
 * 3. "Gör bakgrunden blå"
 *    → intent: code_only
 *    → Skicka direkt till v0 (refine)
 *
 * 4. "Kolla på amazon.com och berätta om deras design"
 *    → intent: web_search_only
 *    → Söka, returnera analys
 *    → INGEN v0-kod ändras!
 */

import type { QualityLevel } from "@/lib/api-client";
import { isBlobConfigured, uploadBlobFromBase64 } from "@/lib/blob-service";
import { debugLog } from "@/lib/debug";
import { generateCode, refineCode } from "@/lib/v0-generator";
import OpenAI from "openai";

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
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
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
}

export interface OrchestratorResult {
  success: boolean;
  message: string;
  // Intent that was detected
  intent?: UserIntent;
  // v0 generation result (only if code was changed)
  code?: string;
  files?: Array<{ name: string; content: string }>;
  chatId?: string;
  demoUrl?: string;
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
}

/**
 * Orchestrate a workflow based on user prompt
 *
 * SMART: First classifies the user's intent, then only executes
 * the necessary steps. Does NOT always call v0!
 */
export async function orchestrateWorkflow(
  userPrompt: string,
  context: OrchestratorContext
): Promise<OrchestratorResult> {
  const workflowSteps: string[] = [];

  try {
    debugLog("[Orchestrator] Starting workflow", {
      promptLength: userPrompt.length,
      quality: context.quality,
      hasExistingChat: !!context.existingChatId,
      hasExistingCode: !!context.existingCode,
    });

    const client = getOpenAIClient();

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: INTENT CLASSIFICATION
    // Determine what the user ACTUALLY wants before doing anything
    // ═══════════════════════════════════════════════════════════════════════

    console.log("[Orchestrator] Classifying intent...");

    // Use Responses API with structured outputs (text.format) for better performance
    let intentResponse: Awaited<ReturnType<typeof client.responses.create>>;
    try {
      intentResponse = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: `Du är en intent-klassificerare för en webbplats-byggare.

Analysera användarens meddelande och bestäm VAD de faktiskt vill göra.

MÖJLIGA INTENTS:
1. "image_only" - Användaren vill BARA generera en bild/logo, INTE ändra webbplatskoden
   Exempel: "generera en bild på en ost", "skapa en logo", "rita en illustration"
   
2. "code_only" - Användaren vill BARA ändra webbplatskoden (färger, layout, text, etc)
   Exempel: "gör bakgrunden blå", "ändra texten till...", "lägg till en knapp"
   
3. "image_and_code" - Användaren vill generera bild(er) OCH lägga in dem i webbplatsen
   Exempel: "lägg till en hero-bild med solnedgång", "skapa en produktbild och visa den"
   
4. "web_search_only" - Användaren vill BARA söka/researcha, inte ändra kod
   Exempel: "berätta om amazons design", "vad är trenderna inom SaaS?"
   
5. "web_search_and_code" - Användaren vill söka OCH implementera det i koden
   Exempel: "kolla spotifys färger och implementera dem", "kopiera amazons layout"
   
6. "clarify" - Du behöver mer info för att förstå vad användaren vill
   Exempel: "lägg till en bild" (vilken bild? var?), "ändra designen" (hur?)
   
7. "chat_response" - Användaren ställer en fråga som inte kräver någon action
   Exempel: "hur fungerar det här?", "vad kan du göra?", "tack!"

VIKTIGT:
- Om användaren säger "generera bild" utan att nämna var den ska → image_only
- Om användaren säger "lägg till en bild på..." → image_and_code  
- Om användaren bara vill ha info/research → web_search_only
- Om osäker → clarify (fråga användaren!)

${
  context.existingCode
    ? "Användaren har en EXISTERANDE webbplats som de kan vilja ändra."
    : "Användaren har INGEN webbplats ännu."
}

SVARA MED EXAKT JSON I DETTA FORMAT (inga markdown-kodblock, bara ren JSON):
{
  "intent": "image_only" | "code_only" | "image_and_code" | "web_search_only" | "web_search_and_code" | "clarify" | "chat_response",
  "reasoning": "Kort förklaring av varför detta intent valdes",
  "imagePrompts": ["prompt1", "prompt2"] eller [] om inga bilder behövs,
  "webSearchQuery": "sökfråga" eller "" om ingen sökning behövs,
  "codeInstruction": "instruktion till v0" eller "" om ingen kodändring behövs,
  "clarifyQuestion": "fråga till användaren" eller "" om ingen förtydligande behövs,
  "chatResponse": "svar till användaren" eller "" om inget svar behövs
}

REGLER FÖR ATT FYLLA I FÄLTEN:
- Om intent är "image_only" eller "image_and_code": Fyll i "imagePrompts" med array av bildprompts baserat på användarens meddelande
- Om intent är "web_search_only" eller "web_search_and_code": Fyll i "webSearchQuery" med sökfrågan
- Om intent är "code_only" eller "image_and_code" eller "web_search_and_code": Fyll i "codeInstruction" med instruktionen som ska skickas till v0 API
- Om intent är "clarify": Fyll i "clarifyQuestion" med frågan till användaren
- Om intent är "chat_response": Fyll i "chatResponse" med svaret till användaren
- "reasoning" ska ALLTID fyllas i med en kort förklaring

EXEMPEL:
Input: "lägg till en hero-bild med solnedgång"
Output: {"intent": "image_and_code", "reasoning": "Användaren vill generera en bild och lägga in den i hero-sektionen", "imagePrompts": ["hero-bild med solnedgång, modern design, vacker färgpalett"], "webSearchQuery": "", "codeInstruction": "Lägg till en hero-bild med solnedgång i hero-sektionen", "clarifyQuestion": "", "chatResponse": ""}

Input: "gör bakgrunden blå"
Output: {"intent": "code_only", "reasoning": "Användaren vill ändra bakgrundsfärg", "imagePrompts": [], "webSearchQuery": "", "codeInstruction": "Ändra bakgrundsfärgen till blå", "clarifyQuestion": "", "chatResponse": ""}`,
        input: userPrompt,
        // Note: TypeScript SDK doesn't fully support text.format yet, so we parse JSON from output_text
        // This is still better than Chat Completions as we use Responses API
        store: false, // No need to store intent classifications
      });
    } catch (error) {
      // Fallback to Responses API with simpler model if primary fails
      console.warn(
        "[Orchestrator] Primary Responses API failed, trying fallback model:",
        error
      );
      try {
        intentResponse = await client.responses.create({
          model: "gpt-4o-mini",
          instructions: `Du är en intent-klassificerare. Analysera användarens meddelande och bestäm vad de vill göra. Svara ENDAST med giltig JSON i formatet: {"intent": "...", "reasoning": "...", "imagePrompts": [...], "webSearchQuery": "...", "codeInstruction": "...", "clarifyQuestion": "...", "chatResponse": "..."}`,
          input: userPrompt,
          store: false,
        });
      } catch (fallbackError) {
        console.error(
          "[Orchestrator] Both Responses API attempts failed:",
          fallbackError
        );
        throw new Error("Kunde inte klassificera intent - API-fel");
      }
    }

    // Use output_text helper from Responses API
    // Parse JSON from output_text (structured outputs not fully supported in TS SDK yet)
    let responseText = intentResponse.output_text || "{}";

    // Debug: Log raw response to help diagnose issues
    console.log(
      "[Orchestrator] Raw intent response:",
      responseText.substring(0, 500)
    );

    // Extract JSON if wrapped in markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }

    // Also try to extract JSON if it's in the response but not in code blocks
    // Sometimes AI returns JSON with surrounding text
    const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch && !responseText.trim().startsWith("{")) {
      responseText = jsonObjectMatch[0];
    }

    // Parse and sanitize the classification to avoid runtime failures on bad JSON
    const VALID_INTENTS: UserIntent[] = [
      "image_only",
      "code_only",
      "image_and_code",
      "web_search_only",
      "web_search_and_code",
      "clarify",
      "chat_response",
    ];
    const sanitizeString = (val: unknown, fallback = "") =>
      typeof val === "string" ? val : fallback;
    const sanitizeStringArray = (val: unknown) =>
      Array.isArray(val)
        ? val.filter((item) => typeof item === "string").slice(0, 8)
        : [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error(
        "[Orchestrator] Failed to parse intent JSON:",
        e,
        responseText
      );
      throw new Error("Kunde inte klassificera din förfrågan");
    }

    const classification = (() => {
      const raw = (parsed as Record<string, unknown>) || {};
      const intent = VALID_INTENTS.includes(raw.intent as UserIntent)
        ? (raw.intent as UserIntent)
        : "clarify";

      return {
        intent,
        reasoning: sanitizeString(raw.reasoning, "Behöver förtydligas"),
        imagePrompts: sanitizeStringArray(raw.imagePrompts),
        webSearchQuery: sanitizeString(raw.webSearchQuery),
        codeInstruction: sanitizeString(raw.codeInstruction),
        clarifyQuestion: sanitizeString(raw.clarifyQuestion),
        chatResponse: sanitizeString(raw.chatResponse),
      };
    })();
    console.log("[Orchestrator] Intent classification:", classification);

    const intent: UserIntent = classification.intent;
    debugLog("[Orchestrator] Intent classified", {
      intent,
      reasoning: classification.reasoning,
    });
    workflowSteps.push(`Intent: ${intent} - ${classification.reasoning}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: HANDLE EACH INTENT TYPE
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

    // Handle clarify - ask user for more info
    if (intent === "clarify") {
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

          // Prefer gpt-image-1 for quality; fallback to dall-e-3 if unavailable
          let base64Data: string | undefined;
          try {
            // gpt-image-1 does NOT support response_format - it returns base64 by default
            const gptImageResponse = await client.images.generate({
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
            const dalleResponse = await client.images.generate({
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

        return {
          success: imageCount > 0,
          message,
          intent,
          generatedImages:
            generatedImages.length > 0 ? generatedImages : undefined,
          workflowSteps,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: GENERATE/REFINE CODE (only for code-related intents)
    // ═══════════════════════════════════════════════════════════════════════

    // Only call v0 if intent involves code changes
    if (
      intent === "code_only" ||
      intent === "image_and_code" ||
      intent === "web_search_and_code"
    ) {
      // Build the code instruction
      let codeInstruction = classification.codeInstruction || userPrompt;

      // Add context from web search if available
      if (webSearchContext && intent === "web_search_and_code") {
        codeInstruction += `\n\nKontext från webbsökning:\n${webSearchContext.substring(
          0,
          2000
        )}`;
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

      workflowSteps.push("Webbplatskod uppdaterad!");

      return {
        success: true,
        message: "Klart! Jag har uppdaterat din webbplats.",
        intent,
        code: v0Result.code,
        files: v0Result.files,
        chatId: v0Result.chatId,
        demoUrl: v0Result.demoUrl,
        versionId: v0Result.versionId,
        webSearchResults:
          webSearchResults.length > 0 ? webSearchResults : undefined,
        generatedImages:
          generatedImages.length > 0 ? generatedImages : undefined,
        workflowSteps,
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
 * STRINGENT MODE: Only triggers for truly complex workflows:
 * 1. AI image GENERATION (not using existing images)
 * 2. Web search/research for external info
 *
 * IMPORTANT: Most prompts (80%+) should go DIRECTLY to v0!
 * v0 is excellent at understanding natural language.
 *
 * Returns false for:
 * - Simple code changes ("gör bakgrunden blå")
 * - Using existing images from mediabibliotek (URLs already in prompt)
 * - Layout/design changes
 * - Text changes
 * - Component additions
 */
export function needsOrchestration(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // FAST EXITS - These should go DIRECTLY to v0 (no orchestration)
  // ═══════════════════════════════════════════════════════════════════════

  // 1. User has PUBLIC URLs in prompt - they want to USE images, not generate
  if (
    prompt.includes("blob.vercel-storage.com") ||
    prompt.includes("images.unsplash.com") ||
    prompt.includes("/api/uploads/") ||
    prompt.includes("https://") ||
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

  // 3. Simple design/code changes - v0 excels at these
  const simpleChangePatterns = [
    // Colors
    /^(ändra|byt|gör).*(färg|bakgrund|text).*(till|blå|röd|grön|vit|svart)/i,
    // Size/spacing
    /^(gör|ändra).*(större|mindre|bredare|smalare)/i,
    // Visibility
    /^(ta bort|dölj|visa|lägg till).*(knapp|text|bild|sektion)/i,
    // Simple text
    /^(ändra|byt).*(text|rubrik|titel)/i,
    // Layout
    /^(flytta|centrera|justera)/i,
  ];

  for (const pattern of simpleChangePatterns) {
    if (pattern.test(lower)) {
      debugLog("[Orchestrator] SKIP - simple change pattern (send to v0)");
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ORCHESTRATION TRIGGERS - Only these COMPLEX cases need orchestrator
  // ═══════════════════════════════════════════════════════════════════════

  // 1. AI IMAGE GENERATION - user explicitly wants NEW images created
  const imageGenerationKeywords = [
    // Must be explicit generation requests
    "generera en bild",
    "generera bild",
    "skapa en ny bild",
    "skapa ny bild",
    "generate image",
    "create new image",
    // Logo generation
    "generera logo",
    "generera en logo",
    "skapa ny logo",
    "designa en logo",
    // AI-specific
    "ai-generera",
    "ai generera",
    "dall-e",
    "gpt-image",
  ];

  // 2. WEB SEARCH - user wants info from external websites
  const webSearchKeywords = [
    // Explicit web actions
    "gå till webbplatsen",
    "besök sidan",
    "kolla på deras",
    "analysera webbplatsen",
    "hämta från",
    "kopiera från",
    // Research
    "researcha",
    "undersök vad",
    "leta reda på",
    // Competitor analysis
    "konkurrenternas",
    "deras färgschema",
    "inspireras av webbplatsen",
  ];

  const needsImageGen = imageGenerationKeywords.some((kw) =>
    lower.includes(kw)
  );
  const needsWebSearch = webSearchKeywords.some((kw) => lower.includes(kw));

  if (needsImageGen) {
    debugLog("[Orchestrator] TRIGGER - needs AI image generation");
    return true;
  }

  if (needsWebSearch) {
    debugLog("[Orchestrator] TRIGGER - needs web search");
    return true;
  }

  // Default: Send to v0 directly (no orchestration)
  debugLog("[Orchestrator] SKIP - no complex workflow detected (send to v0)");
  return false;
}

/**
 * Enhance a prompt for v0 by resolving media library references
 *
 * Transforms vague references like "bilden som ser ut som en tiger"
 * into concrete instructions with actual URLs.
 *
 * @param prompt - User's original prompt
 * @param mediaLibrary - Array of media items with URLs and descriptions
 * @returns Enhanced prompt ready for v0
 */
export function enhancePromptForV0(
  prompt: string,
  mediaLibrary?: Array<{
    url: string;
    filename: string;
    description?: string;
  }>
): string {
  // If no media library provided, return prompt as-is
  if (!mediaLibrary || mediaLibrary.length === 0) {
    return prompt;
  }

  let enhanced = prompt;

  // Check if prompt references media library
  const mediaReferences = [
    "mediabibliotek",
    "min bild",
    "mina bilder",
    "uppladdade",
    "den som ser ut som",
    "bilden med",
    "logon",
    "logotypen",
  ];

  const hasMediaReference = mediaReferences.some((ref) =>
    prompt.toLowerCase().includes(ref)
  );

  if (hasMediaReference) {
    // Build a media catalog for v0 to understand
    const mediaCatalog = mediaLibrary
      .map(
        (item, i) =>
          `[Bild ${i + 1}]: ${item.url} - "${
            item.description || item.filename
          }"`
      )
      .join("\n");

    enhanced = `${prompt}

═══════════════════════════════════════════════════════════════════════
TILLGÄNGLIGA BILDER FRÅN MEDIABIBLIOTEKET:
═══════════════════════════════════════════════════════════════════════
${mediaCatalog}

INSTRUKTION: Använd EXAKTA URLs från listan ovan i <img src="..."> taggar.
Matcha användarens beskrivning med rätt bild baserat på filnamn/beskrivning.
═══════════════════════════════════════════════════════════════════════`;
  }

  return enhanced;
}
