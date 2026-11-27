import { setTimeout as sleep } from "node:timers/promises";
import { requireMediaUploadProject } from "@/lib/db/services/media";
import { MediaUploadPolicyError } from "./upload-policy-error";
import {
  cleanupStoredRunwayVideo,
  getRunwayVideoTask,
  getVideoGenerationCredentials,
  InvalidVideoOutputError,
  storeRunwayVideo,
  submitRunwayVideo,
} from "./video-generation-provider";
import {
  claimVideoGeneration,
  completeVideoGeneration,
  deferVideoGeneration,
  failVideoGeneration,
  getActiveVideoGenerationSchedule,
  type VideoGenerationClaim,
} from "./video-generation-store";

const INITIAL_POLL_WINDOW_MS = 240_000;
const LEASE_RECHECK_MS = 5_000;
const MIN_RECHECK_MS = 1_000;
const POLL_MARGIN_MS = 100;
const MAX_JOB_AGE_MS = 2 * 60 * 60 * 1_000;
const PROVIDER_FAILED = "Filmen kunde inte skapas. Krediterna har återförts.";
const SUBMISSION_UNKNOWN = "Filmbeställningen kunde inte bekräftas. Krediterna har återförts.";
const STORAGE_FAILED = "Filmen kunde inte sparas. Krediterna har återförts.";

function pollDelay(previousFailures = 0) {
  const base = Math.min(60_000, 5_000 * 2 ** Math.min(previousFailures, 4));
  return base + Math.floor(Math.random() * 1_000);
}

async function rejectVideo(
  claim: VideoGenerationClaim,
  message: string,
  cleanStorage = false,
) {
  const failed = await failVideoGeneration(claim, message);
  if (failed && cleanStorage) {
    // Only clean a deterministically named asset after a terminal rollback;
    // uncertain DB outcomes must keep the Blob available for reconciliation.
    const job = claim.job;
    try {
      await cleanupStoredRunwayVideo({ id: job.id, userId: job.user_id, projectId: job.project_id });
    } catch {
      console.error("[VideoGeneration] Unbound Blob cleanup failed");
    }
  }
}

// The POST background worker, owner-authenticated GET and cron all use this
// same DB claim. The return value tells the initial worker when to check again.
export async function advanceVideoGeneration(id: string): Promise<number | null> {
  const claim = await claimVideoGeneration(id);
  if (!claim) return null;
  const { job } = claim;
  if (Date.now() - job.created_at.getTime() >= MAX_JOB_AGE_MS) {
    await rejectVideo(claim, PROVIDER_FAILED, Boolean(job.provider_task_id));
    return null;
  }
  const credentials = getVideoGenerationCredentials();
  if (job.status === "pending") {
    let taskId: string;
    try {
      if (!credentials) throw new Error("Video provider unavailable");
      await requireMediaUploadProject(job.user_id, job.project_id);
      taskId = await submitRunwayVideo(credentials.apiKey, {
        prompt: job.prompt, sourceUrl: job.source_url,
      });
    } catch {
      await rejectVideo(claim, SUBMISSION_UNKNOWN);
      return null;
    }

    const waitMs = pollDelay();
    // Leave the submission claim in place on an uncertain database write.
    // Saving the same provider ID is safe to retry, starting a task is not.
    try {
      await deferVideoGeneration(claim, waitMs, { providerTaskId: taskId });
    } catch {
      await deferVideoGeneration(claim, waitMs, { providerTaskId: taskId });
    }
    return waitMs;
  }

  if (!job.provider_task_id) {
    await rejectVideo(claim, SUBMISSION_UNKNOWN);
    return null;
  }

  try {
    if (!credentials) throw new Error("Video provider unavailable");
    await requireMediaUploadProject(job.user_id, job.project_id);
    const task = await getRunwayVideoTask(credentials.apiKey, job.provider_task_id);
    if (task.status === "FAILED" || task.status === "CANCELED") {
      await rejectVideo(claim, PROVIDER_FAILED);
      return null;
    }
    if (task.status === "SUCCEEDED") {
      const video = await storeRunwayVideo(credentials.blobToken, task.output[0], {
        id: job.id, userId: job.user_id, projectId: job.project_id,
      });
      await completeVideoGeneration(claim, video);
      return null;
    }
  } catch (error) {
    if (error instanceof MediaUploadPolicyError || error instanceof InvalidVideoOutputError) {
      await rejectVideo(claim, STORAGE_FAILED, true);
      return null;
    }
    const waitMs = pollDelay(job.poll_failures + 1);
    await deferVideoGeneration(claim, waitMs, { retry: true });
    return waitMs;
  }

  const waitMs = pollDelay();
  await deferVideoGeneration(claim, waitMs);
  return waitMs;
}

export async function startVideoGenerationWorker(id: string) {
  const deadline = Date.now() + INITIAL_POLL_WINDOW_MS;
  while (Date.now() < deadline) {
    let waitMs = await advanceVideoGeneration(id);
    if (waitMs === null) {
      const schedule = await getActiveVideoGenerationSchedule(id);
      if (!schedule) return;

      // A status check can defer the job or hold its lease. Recheck a lease
      // before expiry because its holder can release it as soon as polling ends.
      const now = Date.now();
      const nextCheckMs = schedule.nextCheckAt.getTime() - now;
      const leaseMs = (schedule.leaseUntil?.getTime() ?? now) - now;
      waitMs = Math.max(MIN_RECHECK_MS, nextCheckMs, Math.min(leaseMs, LEASE_RECHECK_MS));
    }
    const delay = waitMs + POLL_MARGIN_MS;
    if (Date.now() + delay >= deadline) return;
    await sleep(delay);
  }
}
