import { del, put } from "@vercel/blob";
import { z } from "zod";
import { buildBlobPath } from "@/lib/vercel/blob-service";
import { PROJECT_MEDIA_LIBRARY_CATEGORY } from "./project-media-library";
import {
  MAX_GENERATED_VIDEO_BYTES,
  VIDEO_GENERATION_DURATION_SECONDS,
  VIDEO_GENERATION_MODEL,
} from "./video-generation-contract";
import type { StoredVideo } from "./video-generation-store";

const RUNWAY_URL = "https://api.dev.runwayml.com/v1";
const REQUEST_TIMEOUT_MS = 12_000;

const taskIdSchema = z.object({ id: z.uuid() });
const taskSchema = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["PENDING", "THROTTLED", "RUNNING"]) }),
  z.object({ status: z.enum(["FAILED", "CANCELED"]) }),
  z.object({ status: z.literal("SUCCEEDED"), output: z.array(z.string()).nonempty() }),
]);

export class InvalidVideoOutputError extends Error {}

export { getVideoGenerationCredentials } from "./video-generation-config";

async function runwayJson(apiKey: string, path: string, body?: object): Promise<unknown> {
  const response = await fetch(RUNWAY_URL + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + apiKey,
      "X-Runway-Version": "2024-11-06",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Runway request failed");
  }
  return response.json();
}

export async function submitRunwayVideo(apiKey: string, input: { prompt: string; sourceUrl: string }) {
  // A creation request has no documented idempotency key. The durable claim
  // gives this code one attempt, including after an uncertain HTTP failure.
  const payload = await runwayJson(apiKey, "/image_to_video", {
    model: VIDEO_GENERATION_MODEL,
    promptImage: input.sourceUrl,
    promptText: input.prompt,
    ratio: "1280:720",
    duration: VIDEO_GENERATION_DURATION_SECONDS,
  });
  return taskIdSchema.parse(payload).id;
}

export async function getRunwayVideoTask(apiKey: string, taskId: string) {
  const payload = await runwayJson(apiKey, "/tasks/" + encodeURIComponent(taskId));
  return taskSchema.parse(payload);
}

function runwayOutputUrl(output: string): URL {
  const url = URL.parse(output);
  if (
    !url || url.protocol !== "https:" || url.username || url.password || url.port ||
    (!url.hostname.endsWith(".cloudfront.net") && !url.hostname.endsWith(".runwayml.com"))
  ) {
    throw new InvalidVideoOutputError("Disallowed Runway output host");
  }
  return url;
}

type VideoBlobOwner = { id: string; userId: string; projectId: string };

function videoBlobTarget(owner: VideoBlobOwner) {
  const filename = "film-" + owner.id + ".mp4";
  const path = buildBlobPath(owner.userId, filename, {
    projectId: owner.projectId,
    category: PROJECT_MEDIA_LIBRARY_CATEGORY,
  });
  return { filename, path };
}

export async function cleanupStoredRunwayVideo(owner: VideoBlobOwner): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return;
  // This is the server-derived pathname used by put. Use Vercel directly
  // because the generic delete helper treats a bare pathname as local.
  await del(videoBlobTarget(owner).path, { token });
}

export async function storeRunwayVideo(
  blobToken: string,
  output: string,
  owner: VideoBlobOwner,
): Promise<StoredVideo> {
  // The URL comes only from the authenticated task endpoint. Pin the CDN
  // domain and refuse redirects; a signed partner URL never reaches the UI.
  const url = runwayOutputUrl(output);
  const signal = AbortSignal.timeout(45_000);
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Runway video download failed");
  }

  const length = Number(response.headers.get("content-length"));
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (
    length > MAX_GENERATED_VIDEO_BYTES ||
    (contentType && contentType !== "video/mp4" && contentType !== "application/octet-stream")
  ) {
    await response.body.cancel();
    throw new InvalidVideoOutputError("Invalid Runway video type or size");
  }

  let size = 0;
  const header = new Uint8Array(8);
  let headerSize = 0;
  // Validate the MP4 signature even when it crosses chunks. Buffer only the
  // header, then stream the rest directly to multipart Blob with a hard cap.
  const bytes = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_GENERATED_VIDEO_BYTES) {
        throw new InvalidVideoOutputError("Runway output exceeded video limit");
      }
      if (headerSize === header.length) {
        controller.enqueue(chunk);
        return;
      }
      const copied = Math.min(header.length - headerSize, chunk.byteLength);
      header.set(chunk.subarray(0, copied), headerSize);
      headerSize += copied;
      if (headerSize !== header.length) return;
      if (new TextDecoder().decode(header.subarray(4)) !== "ftyp") {
        throw new InvalidVideoOutputError("Runway output is not MP4");
      }
      controller.enqueue(header);
      if (copied < chunk.byteLength) controller.enqueue(chunk.subarray(copied));
    },
    flush() {
      if (headerSize !== header.length) throw new InvalidVideoOutputError("Empty Runway output");
    },
  }));

  const { filename, path } = videoBlobTarget(owner);
  const blob = await put(path, bytes, {
    access: "public",
    token: blobToken,
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    abortSignal: signal,
  });
  return { filename, url: blob.url, path, size };
}
