/**
 * API Route: Transcribe audio using OpenAI Whisper
 * POST /api/transcribe
 *
 * Takes audio file (webm, mp3, wav, m4a) and returns transcribed text.
 * Supports Swedish and English.
 *
 * Uses OpenAI Whisper API for high-quality speech-to-text.
 */

import { NextRequest, NextResponse } from "next/server";
import { SECRETS, FEATURES } from "@/lib/config";

// Allow 60 seconds for audio processing
export const maxDuration = 60;

// Supported audio formats
const SUPPORTED_FORMATS = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/m4a",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
];

export async function POST(req: NextRequest) {
  console.log("[API/transcribe] Request received");

  try {
    // Use centralized config for API key
    if (!FEATURES.useOpenAI) {
      console.error("[API/transcribe] OpenAI API key not configured");
      return NextResponse.json(
        { success: false, error: "Speech service is not configured" },
        { status: 500 }
      );
    }

    const openaiApiKey = SECRETS.openaiApiKey;

    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "sv"; // Default to Swedish

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!SUPPORTED_FORMATS.includes(audioFile.type)) {
      console.log("[API/transcribe] Unsupported format:", audioFile.type);
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported audio format: ${audioFile.type}. Supported: webm, mp3, wav, m4a, ogg, flac`,
        },
        { status: 400 }
      );
    }

    // Check file size (max 25MB for Whisper)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { success: false, error: "Audio file too large (max 25MB)" },
        { status: 400 }
      );
    }

    console.log("[API/transcribe] Processing audio:", {
      type: audioFile.type,
      size: audioFile.size,
      language,
    });

    // Create form data for Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile, "audio.webm");
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("language", language);
    whisperFormData.append("response_format", "json");

    // Optional: Add prompt for better Swedish business terms recognition
    if (language === "sv") {
      whisperFormData.append(
        "prompt",
        "Detta är en beskrivning av ett företag och hur deras webbplats ska se ut. Företagsnamn, bransch, färger, design."
      );
    }

    // Call Whisper API
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: whisperFormData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API/transcribe] Whisper API error:", errorText);

      if (response.status === 429) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded. Try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { success: false, error: "Failed to transcribe audio" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const transcript = data.text?.trim();

    if (!transcript) {
      console.log("[API/transcribe] Empty transcript");
      return NextResponse.json(
        { success: false, error: "No speech detected in audio" },
        { status: 400 }
      );
    }

    console.log(
      "[API/transcribe] Success, transcript length:",
      transcript.length
    );

    return NextResponse.json({
      success: true,
      transcript,
      language,
      duration: data.duration || null,
    });
  } catch (error) {
    console.error("[API/transcribe] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process audio. Please try again.",
      },
      { status: 500 }
    );
  }
}
