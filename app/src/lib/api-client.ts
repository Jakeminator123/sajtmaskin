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
 * DEBUG: Sätt till true för att se detaljerade loggar i konsolen.
 */

const DEBUG = false; // Set to true for verbose logging

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

/**
 * Generate a new website based on prompt or category
 */
export async function generateWebsite(
  prompt: string,
  categoryType?: string,
  quality: QualityLevel = "standard"
): Promise<GenerateResponse> {
  if (DEBUG)
    console.log("[API-Client] generateWebsite called:", {
      prompt: prompt?.substring(0, 50) + "...",
      categoryType,
      quality,
    });

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        categoryType,
        quality,
      }),
    });

    const data = await response.json();
    if (DEBUG)
      console.log("[API-Client] generateWebsite response:", {
        success: data.success,
        hasCode: !!data.code,
        filesCount: data.files?.length || 0,
        hasDemoUrl: !!data.demoUrl,
        chatId: data.chatId,
      });

    if (!response.ok) {
      console.error("[API-Client] generateWebsite error:", data.error);
      return {
        success: false,
        error: data.error || "Något gick fel. Försök igen.",
        requireAuth: data.requireAuth,
        requireCredits: data.requireCredits,
      };
    }

    return data;
  } catch (error) {
    console.error("[API-Client] generateWebsite network error:", error);
    return {
      success: false,
      error:
        "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
    };
  }
}

/**
 * Refine existing code based on user instruction
 */
export async function refineWebsite(
  existingCode: string,
  instruction: string,
  quality: QualityLevel = "standard",
  chatId?: string
): Promise<RefineResponse> {
  if (DEBUG)
    console.log("[API-Client] refineWebsite called:", {
      codeLength: existingCode?.length || 0,
      instruction: instruction?.substring(0, 50) + "...",
      quality,
      chatId,
    });

  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        existingCode,
        chatId,
        instruction,
        quality,
      }),
    });

    const data = await response.json();
    if (DEBUG)
      console.log("[API-Client] refineWebsite response:", {
        success: data.success,
        hasCode: !!data.code,
        filesCount: data.files?.length || 0,
        hasDemoUrl: !!data.demoUrl,
        chatId: data.chatId,
      });

    if (!response.ok) {
      console.error("[API-Client] refineWebsite error:", data.error);
      return {
        success: false,
        error: data.error || "Något gick fel. Försök igen.",
        requireAuth: data.requireAuth,
        requireCredits: data.requireCredits,
      };
    }

    return data;
  } catch (error) {
    console.error("[API-Client] refineWebsite network error:", error);
    return {
      success: false,
      error:
        "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
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
  if (DEBUG)
    console.log("[API-Client] generateFromTemplate called:", {
      templateId,
      quality,
    });

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
    if (DEBUG)
      console.log("[API-Client] generateFromTemplate response:", {
        success: data.success,
        hasCode: !!data.code,
        filesCount: data.files?.length || 0,
        hasDemoUrl: !!data.demoUrl,
      });

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
  if (DEBUG) console.log("[API-Client] getTemplatePreview called:", templateId);

  try {
    const response = await fetch(
      `/api/template/preview?id=${encodeURIComponent(templateId)}`
    );

    const data = await response.json();

    if (DEBUG)
      console.log("[API-Client] getTemplatePreview response:", {
        success: data.success,
        hasDemoUrl: !!data.demoUrl,
        hasScreenshot: !!data.screenshotUrl,
        cached: data.cached,
      });

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
