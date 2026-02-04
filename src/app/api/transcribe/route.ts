/**
 * API Route: Transcribe audio (disabled)
 * POST /api/transcribe
 *
 * Takes audio file (webm, mp3, wav, m4a) and returns transcribed text.
 * Supports Swedish and English.
 *
 * AI Gateway transcription is not wired yet, so the feature is disabled.
 */

import { NextRequest, NextResponse } from "next/server";

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
    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "No audio file provided" },
        { status: 400 },
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
        { status: 400 },
      );
    }

    // Check file size (max 25MB for Whisper)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { success: false, error: "Audio file too large (max 25MB)" },
        { status: 400 },
      );
    }

    console.log("[API/transcribe] Transcription is disabled (gateway not wired)");
    return NextResponse.json(
      {
        success: false,
        error:
          "Transkribering är tillfälligt avstängd. AI Gateway saknar stöd för transcribe just nu.",
      },
      { status: 503 },
    );
  } catch (error) {
    console.error("[API/transcribe] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process audio. Please try again.",
      },
      { status: 500 },
    );
  }
}
