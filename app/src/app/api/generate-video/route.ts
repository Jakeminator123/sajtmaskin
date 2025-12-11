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
 * Jobs are stored in Redis for multi-instance deployments.
 *
 * IMPORTANT: OpenAI video URLs expire after 1 hour!
 * When video is complete, we download and save to Blob storage for permanent URL.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { saveVideoJob, updateVideoJob, VideoJob } from "@/lib/redis";
import { getCurrentUser } from "@/lib/auth";
import { uploadBlob, generateUniqueFilename } from "@/lib/blob-service";

// Allow up to 5 minutes for long-running video operations
export const maxDuration = 300;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// Models available for video generation
type VideoModel = "sora-2" | "sora-2-pro";

interface VideoGenerationRequest {
  prompt: string;
  quality?: "fast" | "pro"; // fast = sora-2, pro = sora-2-pro
  size?: "1280x720" | "1920x1080";
  seconds?: number; // 1-8 seconds
  projectId?: string;
}

/**
 * POST - Start a new video generation job
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication using auth.ts
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Autentisering krävs", requireAuth: true },
        { status: 401 }
      );
    }

    const body: VideoGenerationRequest = await request.json();
    const { prompt, quality = "fast", size = "1280x720", seconds = 8 } = body;

    if (!prompt || prompt.trim().length < 10) {
      return NextResponse.json(
        { error: "Beskriv din video med minst 10 tecken" },
        { status: 400 }
      );
    }

    // Validate and convert seconds to VideoSeconds type (1-8)
    const validSeconds =
      seconds && seconds >= 1 && seconds <= 8
        ? (seconds as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8)
        : undefined;

    // Validate and convert size to VideoSize type
    const validSize =
      size === "1280x720" || size === "1920x1080"
        ? (size as "1280x720" | "1920x1080")
        : undefined;

    // Select model based on quality
    const model: VideoModel = quality === "pro" ? "sora-2-pro" : "sora-2";

    console.log(`[Video API] Starting generation with ${model}:`, {
      prompt: prompt.substring(0, 100),
      size: validSize,
      seconds: validSeconds,
      userId: user.id,
    });

    // Start video generation job
    // Note: This is based on the Sora API structure from the documentation
    // Using type assertion as OpenAI SDK types may not fully match Sora API yet
    const createParams = {
      model,
      prompt,
      ...(validSize !== undefined && { size: validSize }),
      ...(validSeconds !== undefined && { seconds: validSeconds }),
    } as Parameters<OpenAI["videos"]["create"]>[0];
    const video = await getOpenAIClient().videos.create(createParams);

    const videoId = video.id;

    // Store job in Redis (production-ready)
    const job: VideoJob = {
      videoId,
      userId: user.id,
      status: video.status || "queued",
      prompt,
      model,
      createdAt: new Date().toISOString(),
    };
    await saveVideoJob(job);

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
 *
 * When video is completed:
 * 1. Download the MP4 from OpenAI using downloadContent()
 * 2. Save to Vercel Blob for permanent URL (OpenAI URLs expire after 1h)
 * 3. Return the permanent Blob URL
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("id");
    const userId = searchParams.get("userId"); // Required to save to user's blob storage

    if (!videoId) {
      return NextResponse.json({ error: "Video ID krävs" }, { status: 400 });
    }

    console.log(`[Video API] Polling status for: ${videoId}`);

    const client = getOpenAIClient();

    // Check video status from OpenAI
    const video = (await client.videos.retrieve(videoId as string)) as {
      status: string;
      download_url?: string;
      url?: string;
      duration?: number;
      error?: string | { message?: string };
      progress?: number;
    };

    // Convert status string to union type
    const status = (
      video.status === "queued" ||
      video.status === "in_progress" ||
      video.status === "completed" ||
      video.status === "failed"
        ? video.status
        : "queued"
    ) as "queued" | "in_progress" | "completed" | "failed";

    // Update job in Redis
    await updateVideoJob(videoId, { status });

    // If completed, download and save to blob storage
    if (status === "completed") {
      console.log(`[Video API] Video completed, downloading content...`);

      try {
        // Download the actual video content from OpenAI
        // IMPORTANT: OpenAI video URLs expire after 1 hour, so we must save to blob
        const videoContent = await client.videos.downloadContent(videoId);
        const videoBuffer = Buffer.from(await videoContent.arrayBuffer());

        console.log(
          `[Video API] Downloaded ${videoBuffer.length} bytes, saving to blob...`
        );

        // Generate unique filename and save to blob
        const filename = generateUniqueFilename("video.mp4", "sora");

        // Get userId from Redis job if not provided in query
        let effectiveUserId = userId;
        if (!effectiveUserId) {
          const { getVideoJob } = await import("@/lib/redis");
          const job = await getVideoJob(videoId);
          effectiveUserId = job?.userId;
        }

        if (!effectiveUserId) {
          console.warn("[Video API] No userId for blob storage, using temp URL");
          // Fallback: return OpenAI URL (will expire in 1h)
          const tempUrl = video.download_url || video.url;
          return NextResponse.json({
            success: true,
            videoId,
            status: "completed",
            downloadUrl: tempUrl,
            duration: video.duration || null,
            message: "Video klar! (temporär URL - ladda ner inom 1h)",
            warning: "URL utgår om 1 timme. Ladda ner direkt.",
          });
        }

        // Upload to Vercel Blob for permanent storage
        const blobResult = await uploadBlob({
          userId: effectiveUserId,
          filename,
          buffer: videoBuffer,
          contentType: "video/mp4",
          category: "media",
        });

        if (blobResult) {
          console.log(`[Video API] ✅ Saved to blob: ${blobResult.url}`);

          // Update Redis with permanent blob URL
          await updateVideoJob(videoId, {
            status: "completed",
            completedAt: new Date().toISOString(),
            downloadUrl: blobResult.url,
          });

          return NextResponse.json({
            success: true,
            videoId,
            status: "completed",
            downloadUrl: blobResult.url,
            duration: video.duration || null,
            message: "Din video är klar och sparad!",
            storageType: "blob",
          });
        }

        // Blob upload failed, return temporary URL
        console.warn("[Video API] Blob upload failed, using temp URL");
        const tempUrl = video.download_url || video.url;
        await updateVideoJob(videoId, {
          status: "completed",
          completedAt: new Date().toISOString(),
          downloadUrl: tempUrl,
        });

        return NextResponse.json({
          success: true,
          videoId,
          status: "completed",
          downloadUrl: tempUrl,
          duration: video.duration || null,
          message: "Video klar! (temporär URL)",
          warning: "Kunde inte spara permanent. URL utgår om 1 timme.",
        });
      } catch (downloadError) {
        console.error("[Video API] Failed to download video:", downloadError);
        // Fallback to temp URL if download fails
        const tempUrl = video.download_url || video.url;
        return NextResponse.json({
          success: true,
          videoId,
          status: "completed",
          downloadUrl: tempUrl,
          duration: video.duration || null,
          message: "Video klar!",
          warning: "Kunde inte ladda ner. Försök igen.",
        });
      }
    }

    // If failed
    if (status === "failed") {
      // video.error can be string or object - normalize to string
      const rawError = video.error;
      const errorMsg =
        typeof rawError === "string"
          ? rawError
          : rawError?.message || "Videogenerering misslyckades";

      // Update Redis with failure info
      await updateVideoJob(videoId, {
        status: "failed",
        error: errorMsg,
      });

      return NextResponse.json({
        success: false,
        videoId,
        status: "failed",
        error: errorMsg,
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
