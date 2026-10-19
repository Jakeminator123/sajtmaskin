/**
 * API Route: Transcribe uploaded audio via OpenAI gpt-transcribe
 * POST /api/transcribe
 *
 * Takes an audio file (webm, mp3, wav, m4a, ogg, flac) and returns transcribed text.
 * Accepts the caller languages `sv` and `en`.
 *
 * Uses the OpenAI transcriptions API (model `gpt-transcribe`, `OPENAI_API_KEY`).
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { withRateLimit } from "@/lib/rate-limit";

// Allow 60 seconds for audio processing
export const maxDuration = 60;

/** SDK deadline in milliseconds. Stays under the route maxDuration of 60s. */
const TRANSCRIBE_REQUEST_TIMEOUT_MS = 45_000;

type TranscribeLanguage = "sv" | "en";

// Supported audio/video containers accepted by this route.
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

// Map browser MIME types to filename extensions for the transcription request.
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

function requestedLanguage(value: FormDataEntryValue | null): TranscribeLanguage | null {
  if (value == null || value === "") return "sv";
  if (value === "sv" || value === "en") return value;
  return null;
}

function normalizedTranscript(result: unknown): string {
  if (typeof result === "string") return result.trim();
  if (typeof result === "object" && result !== null && "text" in result) {
    const text = result.text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError")
  );
}

function providerFailureText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (typeof error.status === "number" || typeof error.status === "string")
      ? String(error.status)
      : "";
  return `${status} ${message}`;
}

function abortedResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Förfrågan avbröts." },
    { status: 499 },
  );
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "audio:transcribe", async () => {
    console.info("[API/transcribe] Request received");

    try {
      const user = await getCurrentUser(req);
      const sessionId = getSessionIdFromRequest(req);
      if (!user && !sessionId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

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

      const formData = await req.formData();
      const language = requestedLanguage(formData.get("language"));
      if (!language) {
        return NextResponse.json(
          { success: false, error: "Ogiltigt språk. Stöds: sv, en." },
          { status: 400 },
        );
      }

      const audioEntry = formData.get("audio");
      if (!(audioEntry instanceof File)) {
        return NextResponse.json(
          { success: false, error: "No audio file provided" },
          { status: 400 },
        );
      }
      const audioFile = audioEntry;

      if (!SUPPORTED_FORMATS.includes(audioFile.type)) {
        console.info("[API/transcribe] Unsupported format:", audioFile.type);
        return NextResponse.json(
          {
            success: false,
            error: `Unsupported audio format: ${audioFile.type}. Supported: webm, mp3, wav, m4a, ogg, flac`,
          },
          { status: 400 },
        );
      }

      // Transcription endpoint accepts at most 25MB.
      const maxSize = 25 * 1024 * 1024;
      if (audioFile.size > maxSize) {
        return NextResponse.json(
          { success: false, error: "Audio file too large (max 25MB)" },
          { status: 400 },
        );
      }

      if (req.signal.aborted) {
        return abortedResponse();
      }

      console.info("[API/transcribe] Processing audio:", {
        type: audioFile.type,
        size: `${(audioFile.size / 1024).toFixed(1)}KB`,
        language,
      });

      const arrayBuffer = await audioFile.arrayBuffer();
      const ext = getFileExtension(audioFile.type);
      const file = await toFile(
        new Blob([arrayBuffer], { type: audioFile.type }),
        `recording.${ext}`,
      );

      if (req.signal.aborted) {
        return abortedResponse();
      }

      const openai = new OpenAI({ apiKey });
      // gpt-transcribe reads `languages` as an array. The pinned SDK accepts the
      // field on the wire; its TypeScript params may omit it, so this stays a
      // structurally compatible variable with a JSON format literal.
      const transcriptionParams = {
        file,
        model: "gpt-transcribe",
        languages: [language],
        response_format: "json" as const,
      };
      const transcription = await openai.audio.transcriptions.create(transcriptionParams, {
        signal: req.signal,
        timeout: TRANSCRIBE_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      });
      const transcript = normalizedTranscript(transcription);

      if (!transcript) {
        console.info("[API/transcribe] Empty transcript returned");
        return NextResponse.json({
          success: true,
          transcript: "",
          warning: "Inget tal upptäcktes i inspelningen.",
        });
      }

      console.info("[API/transcribe] Transcription successful:", {
        characters: transcript.length,
      });

      return NextResponse.json({
        success: true,
        transcript,
      });
    } catch (error) {
      if (req.signal.aborted || isAbortError(error)) {
        return abortedResponse();
      }

      console.error("[API/transcribe] Error:", error);
      const failure = providerFailureText(error);

      if (failure.includes("invalid_api_key") || failure.includes("401")) {
        return NextResponse.json(
          {
            success: false,
            error: "Ogiltig API-nyckel för transkribering.",
          },
          { status: 401 },
        );
      }

      if (failure.includes("rate_limit") || failure.includes("429")) {
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
  });
}
