import { NextRequest, NextResponse } from "next/server";
import { SECRETS, FEATURES } from "@/lib/config";

/**
 * Avatar TTS API - Uses ElevenLabs to generate speech
 * POST /api/avatar/speak
 *
 * Body: { text: string }
 * Returns: audio/mpeg stream
 */

// Allow up to 60 seconds for TTS generation (complex speech)
export const maxDuration = 60;

// Voice settings for natural Swedish speech
const VOICE_SETTINGS = {
  stability: 0.5, // Balance between variability and consistency
  similarity_boost: 0.8, // How close to the original voice
  style: 0.3, // Expressiveness
  use_speaker_boost: true, // Enhance voice clarity
};

export async function POST(request: NextRequest) {
  try {
    // Check for API key using centralized config
    if (!FEATURES.useElevenLabs) {
      console.error(
        "[Avatar/Speak] Missing ELEVENLABS_API_KEY in environment variables"
      );
      return NextResponse.json(
        {
          error: "TTS service not configured",
          details:
            "ELEVENLABS_API_KEY environment variable is not set. Add it to .env.local",
        },
        { status: 500 }
      );
    }

    // Get secrets from centralized config
    const ELEVENLABS_API_KEY = SECRETS.elevenLabsApiKey;
    const ELEVENLABS_VOICE_ID = SECRETS.elevenLabsVoiceId || "qydUmqn0YV5FQorXLObQ";

    // Log that we have a key (but not the key itself - security!)
    console.log(
      "[Avatar/Speak] API key configured, proceeding with TTS generation"
    );

    // Parse request body
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // Limit text length to stay within rate limits
    // ~500 chars should cover most avatar responses (~180 credits)
    // ElevenLabs counts ~1 char = ~0.36 credits for multilingual v2
    const MAX_TEXT_LENGTH = 500;
    const trimmedText = text.slice(0, MAX_TEXT_LENGTH);

    console.log(
      "[Avatar/Speak] Generating speech for:",
      trimmedText.substring(0, 50) + "..."
    );

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: trimmedText,
          model_id: "eleven_multilingual_v2", // Best for Swedish
          voice_settings: VOICE_SETTINGS,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[Avatar/Speak] ElevenLabs error:",
        response.status,
        errorText
      );

      // Provide helpful error messages
      let errorMessage = "TTS generation failed";
      if (response.status === 401) {
        errorMessage =
          "ElevenLabs API key is invalid or expired. Check your ELEVENLABS_API_KEY.";
      } else if (response.status === 403) {
        errorMessage =
          "ElevenLabs API access denied. Your API key may not have TTS permissions.";
      } else if (response.status === 429) {
        errorMessage = "ElevenLabs rate limit reached. Try again later.";
      }

      return NextResponse.json(
        { error: errorMessage, details: errorText, status: response.status },
        { status: response.status }
      );
    }

    // Get audio data
    const audioBuffer = await response.arrayBuffer();

    console.log(
      "[Avatar/Speak] Generated audio:",
      (audioBuffer.byteLength / 1024).toFixed(1) + "KB"
    );

    // Return audio stream
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("[Avatar/Speak] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}
