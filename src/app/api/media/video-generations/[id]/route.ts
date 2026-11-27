import type { NextRequest } from "next/server";
import { z } from "zod";
import { hasVideoGenerationStorage, requireMediaUploadProject } from "@/lib/db/services/media";
import { getVideoGenerationCredentials } from "@/lib/media/video-generation-provider";
import { getVideoGenerationJob } from "@/lib/media/video-generation-store";
import { projectIdSchema, scheduleVideoGeneration, videoJson, withVideoGenerationUser } from "../common";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withVideoGenerationUser(request, async (userId) => {
    const { id } = await context.params;
    const project = projectIdSchema.safeParse(request.nextUrl.searchParams.get("projectId"));
    if (!project.success) return videoJson({ error: "Välj en giltig sajt." }, 400);
    if (!z.uuid().safeParse(id).success) return videoJson({ error: "Beställningen hittades inte." }, 404);
    await requireMediaUploadProject(userId, project.data);

    const available = getVideoGenerationCredentials() || await hasVideoGenerationStorage();
    const job = available ? await getVideoGenerationJob(userId, project.data, id) : null;
    if (!job) return videoJson({ error: "Beställningen hittades inte." }, 404);
    scheduleVideoGeneration(job);
    return videoJson({ job });
  });
}
