// Frontend API client for website generation
// All requests go through YOUR backend, never directly to v0

export type QualityLevel = "budget" | "standard" | "premium";

export interface GenerateResponse {
  success: boolean;
  message?: string;
  code?: string;
  model?: string;
  error?: string;
}

export interface RefineResponse {
  success: boolean;
  message?: string;
  code?: string;
  model?: string;
  error?: string;
}

/**
 * Generate a new website based on prompt or category
 */
export async function generateWebsite(
  prompt: string,
  categoryType?: string,
  quality: QualityLevel = "standard"
): Promise<GenerateResponse> {
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

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Något gick fel. Försök igen.",
      };
    }

    return data;
  } catch (error) {
    console.error("Generate error:", error);
    return {
      success: false,
      error: "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
    };
  }
}

/**
 * Refine existing code based on user instruction
 */
export async function refineWebsite(
  existingCode: string,
  instruction: string,
  quality: QualityLevel = "standard"
): Promise<RefineResponse> {
  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        existingCode,
        instruction,
        quality,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Något gick fel. Försök igen.",
      };
    }

    return data;
  } catch (error) {
    console.error("Refine error:", error);
    return {
      success: false,
      error: "Kunde inte ansluta till servern. Kontrollera din internetanslutning.",
    };
  }
}

