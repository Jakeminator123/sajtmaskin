/**
 * Image Generator
 * ================
 *
 * Hanterar AI-bildgenerering med OpenAI API.
 * Använder gpt-image-1 (primär) eller dall-e-3 (fallback).
 *
 * VIKTIGT: Bildgenerering använder OpenAI API direkt, INTE v0!
 */

import OpenAI from "openai";
import { getUserSettings } from "@/lib/data/database";
import { debugLog } from "@/lib/utils/debug";

// ════════════════════════════════════════════════════════════════════════════
// OPENAI CLIENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get OpenAI client for image generation.
 * CRITICAL: AI Gateway does NOT support image endpoints - always use direct API.
 */
export function getImageClient(userId?: string): OpenAI {
  if (userId) {
    try {
      const settings = getUserSettings(userId);
      if (settings?.openai_api_key) {
        debugLog("AI", "[ImageGenerator] Using user's OpenAI key");
        return new OpenAI({ apiKey: settings.openai_api_key });
      }
    } catch (e) {
      console.warn("[ImageGenerator] Could not get user settings:", e);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for image generation");
  }
  return new OpenAI({ apiKey });
}

// ════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION
// ════════════════════════════════════════════════════════════════════════════

export interface GeneratedImage {
  base64: string;
  prompt: string;
  model: "gpt-image-1" | "dall-e-3";
}

/**
 * Generate an image using OpenAI API.
 * Tries gpt-image-1 first, falls back to dall-e-3.
 */
export async function generateImage(
  prompt: string,
  userId?: string
): Promise<GeneratedImage | null> {
  const client = getImageClient(userId);

  // Try gpt-image-1 first (better quality)
  try {
    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    });

    const base64 = response.data?.[0]?.b64_json;
    if (base64) {
      debugLog("AI", "[ImageGenerator] ✓ gpt-image-1 generated image");
      return { base64, prompt, model: "gpt-image-1" };
    }
  } catch (primaryError) {
    console.warn(
      "[ImageGenerator] gpt-image-1 unavailable, falling back to dall-e-3:",
      primaryError instanceof Error ? primaryError.message : primaryError
    );
  }

  // Fallback to dall-e-3
  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
      n: 1,
    });

    const base64 = response.data?.[0]?.b64_json;
    if (base64) {
      debugLog("AI", "[ImageGenerator] ✓ dall-e-3 fallback generated image");
      return { base64, prompt, model: "dall-e-3" };
    }
  } catch (fallbackError) {
    console.error("[ImageGenerator] Both models failed:", fallbackError);
  }

  return null;
}
