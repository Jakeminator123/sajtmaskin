/**
 * Frontend API Client
 * ====================
 *
 * Hanterar alla API-anrop från frontend till backend.
 * Backend kommunicerar sedan med v0 API (aldrig direkt från frontend).
 *
 * ENDPOINTS:
 *
 * POST /api/generate    → generateWebsite()
 *   - Input: prompt, categoryType?, quality
 *   - Output: code, files, demoUrl, chatId, versionId
 *
 * POST /api/refine      → refineWebsite()
 *   - Input: existingCode, instruction, chatId?, quality
 *   - Output: uppdaterad code + files + demoUrl
 *
 * POST /api/template    → generateFromTemplate()
 *   - Input: templateId, quality
 *   - Output: template code + files + demoUrl
 *
 * GET /api/local-template?id=xxx → (används av chat-panel direkt)
 *   - Läser lokal mall från disk
 *   - Returnerar kod + filer + metadata
 *
 * KVALITETSNIVÅER (2 st):
 * - standard: v0-1.5-md (128K context, snabb, billig)
 * - premium:  v0-1.5-lg (512K context, bäst, 10x kostnad)
 *
 * VIKTIGT: demoUrl är den URL som visas i iframe-preview.
 *
 * All API calls include error handling and return structured responses.
 */

export type QualityLevel = "standard" | "premium";

export interface GeneratedFile {
  name: string;
  content: string;
}

export interface GenerateResponse {
  success: boolean;
  message?: string;
  code?: string;
  files?: GeneratedFile[];
  chatId?: string;
  demoUrl?: string;
  screenshotUrl?: string;
  versionId?: string;
  model?: string;
  error?: string;
  // Credits/auth fields
  balance?: number;
  requireAuth?: boolean;
  requireCredits?: boolean;
}

export interface RefineResponse {
  success: boolean;
  message?: string;
  code?: string;
  files?: GeneratedFile[];
  chatId?: string;
  demoUrl?: string;
  screenshotUrl?: string;
  versionId?: string;
  model?: string;
  error?: string;
  // Credits/auth fields
  balance?: number;
  requireAuth?: boolean;
  requireCredits?: boolean;
}

// Timeout for generate API (5 minutes - v0 can take a while)
const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Generate a new website based on prompt or category
 */
export async function generateWebsite(
  prompt: string,
  categoryType?: string,
  quality: QualityLevel = "standard"
): Promise<GenerateResponse> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    console.log("[API-Client] generateWebsite starting...", {
      promptLength: prompt.length,
      categoryType,
      quality,
    });

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        categoryType,
        quality,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Try to parse JSON, handle malformed responses
    let data: GenerateResponse;
    try {
      const text = await response.text();
      if (!text || text.trim() === "") {
        console.error("[API-Client] Empty response body from /api/generate");
        return {
          success: false,
          error: "Servern returnerade ett tomt svar. Försök igen.",
        };
      }
      data = JSON.parse(text);
    } catch (parseError) {
      console.error("[API-Client] Failed to parse JSON response:", parseError);
      return {
        success: false,
        error: "Kunde inte tolka serverns svar. Försök igen.",
      };
    }

    // Log response details for debugging
    console.log("[API-Client] generateWebsite response:", {
      status: response.status,
      ok: response.ok,
      success: data?.success,
      hasDemoUrl: !!data?.demoUrl,
      hasCode: !!data?.code,
      filesCount: data?.files?.length || 0,
      error: data?.error,
    });

    if (!response.ok) {
      console.error("[API-Client] generateWebsite HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        error: data?.error || "(no error message)",
      });
      return {
        success: false,
        error:
          data?.error ||
          `Serverfel (${response.status}): ${
            response.statusText || "Okänt fel"
          }`,
        requireAuth: data?.requireAuth,
        requireCredits: data?.requireCredits,
      };
    }

    // Validate that we got a successful response with expected data
    if (!data.success) {
      console.warn("[API-Client] Response OK but success=false:", data.error);
      return {
        success: false,
        error: data.error || "Generering misslyckades utan felmeddelande.",
        requireAuth: data.requireAuth,
        requireCredits: data.requireCredits,
      };
    }

    // Validate we have at least some useful data
    if (
      !data.demoUrl &&
      !data.code &&
      (!data.files || data.files.length === 0)
    ) {
      console.warn("[API-Client] Response success but no demoUrl/code/files");
      // Still return the data - maybe there's a message
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";
    const errorName = error instanceof Error ? error.name : "";

    console.error("[API-Client] generateWebsite error:", {
      name: errorName,
      message: errorMessage,
    });

    // Handle timeout (AbortError from our AbortController)
    if (errorName === "AbortError" || errorMessage.includes("aborted")) {
      return {
        success: false,
        error:
          "Begäran tog för lång tid (timeout efter 5 min). Försök igen med en enklare prompt.",
      };
    }

    // Handle network errors
    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError")
    ) {
      return {
        success: false,
        error:
          "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
      };
    }

    return {
      success: false,
      error: `Nätverksfel: ${errorMessage}`,
    };
  }
}

// Timeout for refine API (3 minutes - usually faster than generate)
const REFINE_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Refine existing code based on user instruction
 */
export async function refineWebsite(
  existingCode: string,
  instruction: string,
  quality: QualityLevel = "standard",
  chatId?: string
): Promise<RefineResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFINE_TIMEOUT_MS);

  try {
    console.log("[API-Client] refineWebsite starting...", {
      codeLength: existingCode.length,
      instructionLength: instruction.length,
      hasChatId: !!chatId,
    });

    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        existingCode,
        chatId,
        instruction,
        quality,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse JSON safely
    let data: RefineResponse;
    try {
      const text = await response.text();
      if (!text || text.trim() === "") {
        console.error("[API-Client] Empty response from /api/refine");
        return {
          success: false,
          error: "Servern returnerade ett tomt svar. Försök igen.",
        };
      }
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(
        "[API-Client] Failed to parse refine response:",
        parseError
      );
      return {
        success: false,
        error: "Kunde inte tolka serverns svar. Försök igen.",
      };
    }

    console.log("[API-Client] refineWebsite response:", {
      status: response.status,
      ok: response.ok,
      success: data?.success,
      hasDemoUrl: !!data?.demoUrl,
      hasCode: !!data?.code,
    });

    if (!response.ok) {
      console.error("[API-Client] refineWebsite HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        error: data?.error,
      });
      return {
        success: false,
        error:
          data?.error ||
          `Serverfel (${response.status}): ${
            response.statusText || "Okänt fel"
          }`,
        requireAuth: data?.requireAuth,
        requireCredits: data?.requireCredits,
      };
    }

    // Validate that we got a successful response with expected data
    if (!data.success) {
      console.warn("[API-Client] Response OK but success=false:", data.error);
      return {
        success: false,
        error: data.error || "Förfining misslyckades utan felmeddelande.",
        requireAuth: data.requireAuth,
        requireCredits: data.requireCredits,
      };
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : "Okänt fel";
    const errorName = error instanceof Error ? error.name : "";

    console.error("[API-Client] refineWebsite error:", {
      name: errorName,
      message: errorMessage,
    });

    if (errorName === "AbortError" || errorMessage.includes("aborted")) {
      return {
        success: false,
        error: "Begäran tog för lång tid. Försök igen.",
      };
    }
    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError")
    ) {
      return {
        success: false,
        error:
          "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
      };
    }

    return {
      success: false,
      error: `Nätverksfel: ${errorMessage}`,
    };
  }
}

/**
 * Generate website from a v0 community template
 */
export async function generateFromTemplate(
  templateId: string,
  quality: QualityLevel = "standard"
): Promise<GenerateResponse> {
  try {
    const response = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        quality,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[API-Client] generateFromTemplate error:", data.error);
      return {
        success: false,
        error: data.error || "Kunde inte ladda template.",
      };
    }

    return data;
  } catch (error) {
    console.error("[API-Client] generateFromTemplate network error:", error);
    return {
      success: false,
      error:
        "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE PREVIEW (Lightweight - for gallery preview before selection)
// ═══════════════════════════════════════════════════════════════════════════

export interface TemplatePreviewResponse {
  success: boolean;
  templateId?: string;
  templateName?: string;
  chatId?: string;
  demoUrl?: string | null;
  screenshotUrl?: string | null;
  cached?: boolean;
  error?: string;
}

/**
 * Get preview data for a template WITHOUT selecting it
 * Returns chatId, demoUrl, and screenshotUrl for gallery preview
 */
export async function getTemplatePreview(
  templateId: string
): Promise<TemplatePreviewResponse> {
  try {
    const response = await fetch(
      `/api/template/preview?id=${encodeURIComponent(templateId)}`
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Kunde inte ladda förhandsvisning.",
      };
    }

    return data;
  } catch (error) {
    console.error("[API-Client] getTemplatePreview network error:", error);
    return {
      success: false,
      error: "Nätverksfel vid laddning av förhandsvisning.",
    };
  }
}
