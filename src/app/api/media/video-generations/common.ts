import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/auth";
import { InsufficientCreditsError } from "@/lib/db/services/transactions";
import {
  VIDEO_GENERATION_PROMPT_MAX_LENGTH,
  type VideoGenerationJob,
} from "@/lib/media/video-generation-contract";
import { VideoGenerationError } from "@/lib/media/video-generation-error";
import { advanceVideoGeneration, startVideoGenerationWorker } from "@/lib/media/video-generation-runner";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";

export const projectIdSchema = z.string().trim().min(1).max(200);
export const videoOrderSchema = z.object({
  projectId: projectIdSchema,
  sourceMediaId: z.number().int().positive().max(2_147_483_647),
  prompt: z.string().trim().min(1).max(VIDEO_GENERATION_PROMPT_MAX_LENGTH),
  requestId: z.uuid().transform((value) => value.toLowerCase()),
  maxCredits: z.number().int().positive().max(2_147_483_647),
});

export function videoJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function withVideoGenerationUser(
  request: Request,
  handler: (userId: string) => Promise<Response>,
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return videoJson({ error: "Du måste vara inloggad." }, 401);
    return await handler(user.id);
  } catch (error) {
    if (error instanceof VideoGenerationError || error instanceof MediaUploadPolicyError) {
      return videoJson({ error: error.message }, error.status);
    }
    if (error instanceof InsufficientCreditsError) {
      return videoJson({ error: "Du har inte tillräckligt med credits för filmen." }, 402);
    }
    // Provider responses and URLs can contain secrets; log only the failure site.
    console.error("[VideoGeneration] Request failed");
    return videoJson({ error: "Filmgenereringen är tillfälligt otillgänglig." }, 503);
  }
}

export function scheduleVideoGeneration(job: VideoGenerationJob, start = false) {
  if (job.status !== "pending" && job.status !== "processing") return;
  after(async () => {
    try {
      if (start) await startVideoGenerationWorker(job.id);
      else await advanceVideoGeneration(job.id);
    } catch {
      // A later authenticated GET or the scheduled recovery can claim it.
      console.error("[VideoGeneration] Background step failed");
    }
  });
}
