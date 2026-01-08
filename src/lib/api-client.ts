/**
 * Frontend API Client
 * ====================
 *
 * Hanterar alla API-anrop från frontend till backend.
 * Backend kommunicerar sedan med v0 API (aldrig direkt från frontend).
 *
 * ENDPOINTS:
 *
 * POST /api/orchestrate → (används direkt i chat-panel)
 *   - Input: prompt, quality, existingChatId?, existingCode?, projectFiles?, mediaLibrary?
 *   - Output: code, files, demoUrl, chatId, versionId, webSearchResults?, generatedImages?
 *   - UNIVERSAL GATEKEEPER - alla prompts går härigenom (både generation och refinement)
 *
 * POST /api/template    → generateFromTemplate()
 *   - Input: templateId, quality
 *   - Output: template code + files + demoUrl
 *
 * KVALITETSNIVÅER (2 st):
 * - standard: v0-1.5-md (128K context, snabb, billig)
 * - premium:  v0-1.5-lg (512K context, bäst, 10x kostnad)
 *
 * VIKTIGT: demoUrl är den URL som visas i iframe-preview.
 *
 * All API calls include error handling and return structured responses.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Quality level for v0 API generation.
 * - standard: v0-1.5-md (128K context, fast, cheap)
 * - premium: v0-1.5-lg (512K context, best quality, 10x cost)
 */
export type QualityLevel = "standard" | "premium";

/** A generated file from v0 API */
export interface GeneratedFile {
  name: string;
  content: string;
}

/** Response from generate endpoint */
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

// ============================================================================
// TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Generate website from a v0 community template.
 * Calls POST /api/template which initializes from a v0 template.
 *
 * @param skipCache - If false (default), uses per-user template cache to avoid redundant v0 calls
 */
export async function generateFromTemplate(
  templateId: string,
  quality: QualityLevel = "standard",
  skipCache: boolean = false
): Promise<GenerateResponse> {
  try {
    const response = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        quality,
        skipCache,
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
