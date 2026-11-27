import type { NextRequest } from "next/server";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";
import { hasVideoGenerationStorage, requireMediaUploadProject } from "@/lib/db/services/media";
import { getVideoGenerationPrice } from "@/lib/media/video-generation-cost";
import { getVideoGenerationCredentials } from "@/lib/media/video-generation-provider";
import {
  getVideoGenerationJob,
  listVideoGenerationJobs,
  orderVideoGeneration,
} from "@/lib/media/video-generation-store";
import { withRateLimit } from "@/lib/rate-limit";
import {
  projectIdSchema,
  scheduleVideoGeneration,
  videoJson,
  videoOrderSchema,
  withVideoGenerationUser,
} from "./common";

export const runtime = "nodejs";
// Allows the initial after() worker to poll without a connected browser in Preview.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return withVideoGenerationUser(request, async (userId) => {
    const project = projectIdSchema.safeParse(request.nextUrl.searchParams.get("projectId"));
    if (!project.success) return videoJson({ error: "Välj en giltig sajt." }, 400);
    await requireMediaUploadProject(userId, project.data);
    const enabled = Boolean(getVideoGenerationCredentials());
    const [price, jobs] = await Promise.all([
      getVideoGenerationPrice(),
      enabled || await hasVideoGenerationStorage() ? listVideoGenerationJobs(userId, project.data) : [],
    ]);
    for (const job of jobs) scheduleVideoGeneration(job);
    return videoJson({
      enabled,
      quote: price.quote,
      jobs,
    });
  });
}

export async function POST(request: NextRequest) {
  return withVideoGenerationUser(request, (userId) => withRateLimit(
    request, "media:video-generation", async () => {
      if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
        return videoJson({ error: "Beställningen måste skickas som JSON." }, 400);
      }
      const body = await readRequestJsonWithLimit(request, 8_192);
      if (!body.ok && body.reason === "too_large") {
        return videoJson({ error: "Beställningen är för stor." }, 413);
      }
      const parsed = videoOrderSchema.safeParse(body.ok ? body.value : null);
      if (!parsed.success) return videoJson({ error: "Ogiltig filmbeställning." }, 400);

      const enabled = Boolean(getVideoGenerationCredentials());
      if (!enabled && !await hasVideoGenerationStorage()) {
        return videoJson({ error: "Filmgenerering är inte aktiverad." }, 503);
      }
      const price = await getVideoGenerationPrice();
      const order = parsed.data;
      const id = await orderVideoGeneration(userId, order, price, enabled);
      const job = await getVideoGenerationJob(userId, order.projectId, id);
      if (!job) return videoJson({ error: "Beställningen hittades inte." }, 404);
      scheduleVideoGeneration(job, true);
      return videoJson({ job }, job.status === "pending" || job.status === "processing" ? 202 : 200);
    }, { userId, failClosedOnTimeout: true },
  ));
}
