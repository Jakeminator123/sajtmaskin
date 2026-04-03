/**
 * API Route: Analyze video presentation
 * POST /api/analyze-presentation
 *
 * Takes a transcript + optional keyframe images from a video presentation
 * and provides constructive feedback on tone, pitch quality, clarity,
 * confidence, posture, and eye contact.
 *
 * When frames are provided, uses GPT-4o (vision) via OpenAI directly
 * for visual body language analysis. Text-only path also prefers direct provider calls.
 */

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createDirectModel } from "@/lib/builder/gateway-policy";
import { z } from "zod";
import { debugLog, errorLog } from "@/lib/utils/debug";
import {
  ANALYZE_PRESENTATION_DEFAULT_MODEL,
  ANALYZE_PRESENTATION_FALLBACK_MODELS,
} from "@/lib/gen/defaults";

export const runtime = "nodejs";
export const maxDuration = 45;

function toOpenAiDirectModelId(model: string): string {
  return model.replace(/^openai\//, "");
}

const requestSchema = z.object({
  transcript: z.string().min(1, "Transcript required"),
  companyName: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  language: z.string().optional().default("sv"),
  frames: z.array(z.string()).max(6).optional(),
});

const TEXT_ONLY_PROMPT = `Du ar en uppmutrande presentationscoach. Analysera denna transkribering av en elevator pitch / foretagspresentation.

Svara BARA med JSON i exakt detta format:
{
  "overallScore": 7,
  "toneFeedback": "Kort feedback om ton och energi",
  "clarityFeedback": "Kort feedback om tydlighet och struktur",
  "pitchFeedback": "Kort feedback om elevator pitch-kvalitet",
  "confidenceFeedback": "Kort feedback om sjalvsakerhet i talet",
  "keyMessage": "Vad som kom fram som huvudbudskap",
  "suggestions": ["Forbattringsforslag 1", "Forbattringsforslag 2"],
  "strengthHighlight": "Den starkaste delen av presentationen"
}

Regler:
- Var POSITIV och uppmutrande -- lyft styrkor forst
- overallScore: 1-10 (var generos, de flesta bor fa 6-9)
- Alla texter pa svenska
- Kort och konkret, max 1-2 meningar per falt
- suggestions: max 3, actionable`;

const VISION_PROMPT = `Du ar en uppmutrande presentationscoach. Du far en transkribering av en elevator pitch PLUS stillbilder fran videon. Analysera BADE talet och kroppspraket.

Svara BARA med JSON i exakt detta format:
{
  "overallScore": 7,
  "toneFeedback": "Kort feedback om ton och energi",
  "clarityFeedback": "Kort feedback om tydlighet och struktur",
  "pitchFeedback": "Kort feedback om elevator pitch-kvalitet",
  "confidenceFeedback": "Kort feedback om sjalvsakerhet",
  "postureFeedback": "Kort feedback om hallning och kroppssprak",
  "eyeContactFeedback": "Kort feedback om blickkontakt och narvaro",
  "keyMessage": "Huvudbudskapet som nadde fram",
  "suggestions": ["Forbattringsforslag 1", "Forbattringsforslag 2"],
  "strengthHighlight": "Den starkaste delen av presentationen"
}

Regler for visuell analys:
- Kommentera hallning positivt: rak rygg, avslappnade axlar, oppet kroppssprak
- Kommentera blickkontakt: tittar de i kameran? ar blicken stadig?
- Var POSITIV -- lyft vad som ar bra forst, ge sedan milda forbattringsforslag
- overallScore: 1-10 (generos)
- Alla texter pa svenska, korta (1-2 meningar per falt)
- suggestions: max 3`;


/** First balanced `{ ... }` slice — avoids greedy `/\{[\s\S]*\}/` grabbing multiple JSON-like blocks. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function buildFallbackAnalysis(
  transcript: string,
  hasFrames: boolean,
  shortTranscript: boolean = false,
) {
  const words = transcript.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 12).join(" ");
  const keyMessage = excerpt
    ? `${excerpt}${words.length > 12 ? "..." : ""}`
    : "Du presenterar ditt erbjudande tydligt.";

  return {
    overallScore: shortTranscript ? 6 : 7,
    toneFeedback: "Bra energi i tonen. Behall lugnt tempo och tydliga pauser.",
    clarityFeedback: shortTranscript
      ? "Inspelningen ar kort, sa analysen blir begransad. Laggar du till 2-3 meningar blir feedbacken mer exakt."
      : "Budskapet ar begripligt. Tydlig inledning och avslut gor presentationen annu starkare.",
    pitchFeedback:
      "Du far fram nyttan pa ett bra satt. Lyft problem -> losning -> resultat i den ordningen.",
    confidenceFeedback:
      "Du later trygg. Fortsatt med stadig rytm och korta pauser efter viktiga punkter.",
    ...(hasFrames
      ? {
          postureFeedback:
            "Hall en oppen hallning med avslappnade axlar. Smatt handrorelse kan forstarka budskapet.",
          eyeContactFeedback:
            "Forsok halla blicken nara kameran i nyckelmeningar for starkare narvaro.",
        }
      : {}),
    keyMessage,
    suggestions: [
      "Borja med en mening som beskriver vem ni hjalper.",
      "Ge ett konkret exempel pa resultat kunden far.",
      "Avsluta med en tydlig uppmaning (t.ex. boka demo/kontakta oss).",
    ],
    strengthHighlight: "Du kommunicerar med positiv energi och tydlig riktning.",
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { companyName, industry, frames } = parsed.data;
    const transcript = parsed.data.transcript.trim();
    const hasFrames = Boolean(frames && frames.length > 0);

    if (transcript.length < 10) {
      return NextResponse.json({
        success: true,
        analysis: buildFallbackAnalysis(transcript, hasFrames, true),
        fallback: true,
      });
    }

    debugLog("PRESENTATION", "Analysis request", {
      transcriptLength: transcript.length,
      frameCount: frames?.length || 0,
      companyName,
      industry,
    });

    const contextLine = [
      companyName ? `Foretag: ${companyName}` : "",
      industry ? `Bransch: ${industry}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    const userTextContent = [
      `Transkribering av presentation:`,
      `"${transcript}"`,
      contextLine ? `\n${contextLine}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let analysisText: string;

    if (hasFrames) {
      // Use OpenAI directly with vision (GPT-4o supports images)
      analysisText = await analyzeWithVision(userTextContent, frames ?? []);
    } else {
      // Text-only path (direct provider)
      analysisText = await analyzeTextOnly(userTextContent);
    }

    // Parse JSON
    let analysis;
    try {
      const jsonBlob = extractFirstJsonObject(analysisText);
      analysis = jsonBlob ? JSON.parse(jsonBlob) : null;
    } catch {
      analysis = null;
    }

    if (!analysis) {
      analysis = buildFallbackAnalysis(transcript, hasFrames, false);
    }

    debugLog("PRESENTATION", "Analysis complete", {
      score: analysis.overallScore,
      hasVisual: hasFrames,
    });

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    errorLog("PRESENTATION", "Analysis error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Analyze with vision model (OpenAI GPT-4o) -- reads images */
async function analyzeWithVision(userText: string, frames: string[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // Fall back to text-only if no OpenAI key
    return analyzeTextOnly(userText);
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  // Build messages with images
  const imageContents = frames.slice(0, 4).map((frame) => ({
    type: "image_url" as const,
    image_url: {
      url: frame, // base64 data URL
      detail: "low" as const, // Low detail = fast + cheap
    },
  }));

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...imageContents,
        ],
      },
    ],
    max_tokens: 600,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

/** Text-only analysis (direct provider first, OpenAI fallback). */
async function analyzeTextOnly(userText: string): Promise<string> {
  try {
    const result = await generateText({
      model: createDirectModel(ANALYZE_PRESENTATION_DEFAULT_MODEL),
      messages: [
        { role: "system", content: TEXT_ONLY_PROMPT },
        { role: "user", content: userText },
      ],
      maxOutputTokens: 500,
    });
    return result.text?.trim() || "";
  } catch {
    // Fall through to OpenAI direct
  }

  // Fallback: OpenAI direct
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY saknas för presentation-analys");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: toOpenAiDirectModelId(
      ANALYZE_PRESENTATION_FALLBACK_MODELS[0] || ANALYZE_PRESENTATION_DEFAULT_MODEL,
    ),
    messages: [
      { role: "system", content: TEXT_ONLY_PROMPT },
      { role: "user", content: userText },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}
