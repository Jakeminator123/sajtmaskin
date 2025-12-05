/**
 * Video Generation API (Sora)
 * ===========================
 *
 * Generate videos using OpenAI's Sora API.
 *
 * POST: Start a video generation job
 * GET: Poll for video status and download when complete
 *
 * Video generation is asynchronous - it can take 30-120 seconds.
 * Use polling or webhooks to check completion.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { cookies } from "next/headers";

// Allow up to 5 minutes for long-running video operations
export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models available for video generation
type VideoModel = "sora-2" | "sora-2-pro";

interface VideoGenerationRequest {
  prompt: string;
  quality?: "fast" | "pro"; // fast = sora-2, pro = sora-2-pro
  size?: "1280x720" | "1920x1080";
  seconds?: number; // 1-8 seconds
  projectId?: string;
}

interface VideoJob {
  videoId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  prompt: string;
  model: VideoModel;
  createdAt: string;
}

// In-memory store for video jobs (in production, use Redis)
const videoJobs = new Map<string, VideoJob>();

/**
 * POST - Start a new video generation job
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");

    if (!sessionCookie?.value) {
      return NextResponse.json(
        { error: "Autentisering krävs", requireAuth: true },
        { status: 401 }
      );
    }

    const body: VideoGenerationRequest = await request.json();
    const {
      prompt,
      quality = "fast",
      size = "1280x720",
      seconds = 8,
      projectId,
    } = body;

    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "Beskriv din video med minst 10 tecken" },
        { status: 400 }
      );
    }

    // Select model based on quality
    const model: VideoModel = quality === "pro" ? "sora-2-pro" : "sora-2";

    console.log(`[Video API] Starting generation with ${model}:`, {
      prompt: prompt.substring(0, 100),
      size,
      seconds,
    });

    // Start video generation job
    // Note: This is based on the Sora API structure from the documentation
    const video = await openai.videos.create({
      model,
      prompt,
      size,
      seconds,
    } as any); // Type assertion needed as Sora types may not be in SDK yet

    const videoId = video.id;

    // Store job info
    const job: VideoJob = {
      videoId,
      status: video.status || "queued",
      prompt,
      model,
      createdAt: new Date().toISOString(),
    };
    videoJobs.set(videoId, job);

    console.log(`[Video API] Job created: ${videoId}, status: ${job.status}`);

    return NextResponse.json({
      success: true,
      videoId,
      status: job.status,
      message: "Videon genereras. Detta kan ta 1-2 minuter.",
      estimatedTime: quality === "pro" ? 120 : 60,
      diamondCost: quality === "pro" ? 15 : 10,
    });
  } catch (error) {
    console.error("[Video API] Error:", error);

    // Check for specific error types
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Handle model not available (fallback message)
    if (errorMessage.includes("model") || errorMessage.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Videogenerering är inte tillgänglig just nu. Sora API kanske inte är aktiverat för ditt konto.",
          fallback: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte starta videogenerering: " + errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Poll for video status or download completed video
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("id");

    if (!videoId) {
      return NextResponse.json({ error: "Video ID krävs" }, { status: 400 });
    }

    console.log(`[Video API] Polling status for: ${videoId}`);

    // Check video status
    const video = await openai.videos.retrieve(videoId as any);

    const status = video.status;
    const job = videoJobs.get(videoId);

    // Update stored job status
    if (job) {
      job.status = status;
      videoJobs.set(videoId, job);
    }

    // If completed, include download info
    if (status === "completed") {
      // Get video content/download URL
      // Note: The exact API for downloading may vary
      const content = await openai.videos.content(videoId as any);

      return NextResponse.json({
        success: true,
        videoId,
        status: "completed",
        downloadUrl: content?.url || null,
        duration: video.duration || null,
        message: "Din video är klar!",
      });
    }

    // If failed
    if (status === "failed") {
      return NextResponse.json({
        success: false,
        videoId,
        status: "failed",
        error: video.error || "Videogenerering misslyckades",
      });
    }

    // Still processing
    return NextResponse.json({
      success: true,
      videoId,
      status,
      message: status === "queued" ? "I kö..." : "Genererar video...",
      progress: video.progress || null,
    });
  } catch (error) {
    console.error("[Video API] Poll error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte hämta videostatus",
      },
      { status: 500 }
    );
  }
}
