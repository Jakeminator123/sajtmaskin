/**
 * API Route: Transcribe audio via OpenAI Whisper
 * POST /api/transcribe
 *
 * Takes audio file (webm, mp3, wav, m4a, ogg, flac) and returns transcribed text.
 * Supports Swedish and English.
 *
 * Uses OpenAI Whisper API directly (OPENAI_API_KEY).
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

// Allow 60 seconds for audio processing
export const maxDuration = 60;

// Supported audio/video formats (Whisper handles video containers too)
const SUPPORTED_FORMATS = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/m4a",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
  "video/webm",
  "video/mp4",
];

// Map browser mime types to Whisper-friendly extensions
function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/m4a": "m4a",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "video/webm": "webm",
    "video/mp4": "mp4",
  };
  return map[mimeType] || "webm";
}

export async function POST(req: NextRequest) {
  console.log("[API/transcribe] Request received");

  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      console.error("[API/transcribe] Missing OPENAI_API_KEY");
      return NextResponse.json(
        {
          success: false,
          error: "Transkribering ej konfigurerad. OPENAI_API_KEY saknas.",
        },
        { status: 503 },
      );
    }

    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "sv";

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

    console.log("[API/transcribe] Processing audio:", {
      type: audioFile.type,
      size: `${(audioFile.size / 1024).toFixed(1)}KB`,
      language,
    });

    // Convert to buffer for OpenAI
    const arrayBuffer = await audioFile.arrayBuffer();
    const ext = getFileExtension(audioFile.type);
    const file = await toFile(
      new Blob([arrayBuffer], { type: audioFile.type }),
      `recording.${ext}`,
    );

    const openai = new OpenAI({ apiKey });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: language === "sv" ? "sv" : "en",
      response_format: "text",
    });

    const transcript =
      typeof transcription === "string"
        ? transcription.trim()
        : (transcription as unknown as { text: string }).text?.trim() ?? "";

    if (!transcript) {
      console.log("[API/transcribe] Empty transcript returned");
      return NextResponse.json({
        success: true,
        transcript: "",
        warning: "Inget tal upptäcktes i inspelningen.",
      });
    }

    console.log(
      "[API/transcribe] Transcription successful:",
      transcript.slice(0, 80) + (transcript.length > 80 ? "..." : ""),
    );

    return NextResponse.json({
      success: true,
      transcript,
    });
  } catch (error) {
    console.error("[API/transcribe] Error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific OpenAI errors
    if (message.includes("invalid_api_key") || message.includes("401")) {
      return NextResponse.json(
        {
          success: false,
          error: "Ogiltig API-nyckel för transkribering.",
        },
        { status: 401 },
      );
    }

    if (message.includes("rate_limit") || message.includes("429")) {
      return NextResponse.json(
        {
          success: false,
          error: "För många förfrågningar. Vänta en stund och försök igen.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte transkribera ljud. Försök igen.",
      },
      { status: 500 },
    );
  }
}
