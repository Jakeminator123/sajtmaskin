import { MAX_GENERATED_VIDEO_BYTES } from "./video-generation-contract";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { del, put } = vi.hoisted(() => ({ del: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del, put }));

import {
  cleanupStoredRunwayVideo,
  getRunwayVideoTask,
  storeRunwayVideo,
  submitRunwayVideo,
} from "./video-generation-provider";

const taskId = "17f20503-6c24-4c16-946b-35dbbce2af2f";
const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
const assetUrl = "https://out.cloudfront.net/film.mp4?signed=short-lived";
const owner = { id: "job", userId: "owner", projectId: "site" };
const blobUrl = "https://store.public.blob.vercel-storage.com/owner/projects/site/media-library/film-job.mp4";

beforeEach(() => {
  put.mockReset();
  del.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Runway video provider", () => {
  it("submits a fixed five-second landscape task with the supported API version", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: taskId }));
    vi.stubGlobal("fetch", request);
    const sourceUrl = "https://store.public.blob.vercel-storage.com/source.png";
    await expect(submitRunwayVideo("test-secret", { sourceUrl, prompt: "Kameran rör sig framåt" }))
      .resolves.toBe(taskId);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "https://api.dev.runwayml.com/v1/image_to_video",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret", "X-Runway-Version": "2024-11-06",
        }),
        body: JSON.stringify({
          model: "gen4_turbo",
          promptImage: sourceUrl,
          promptText: "Kameran rör sig framåt",
          ratio: "1280:720",
          duration: 5,
        }),
      }),
    );
  });

  it("reads a successful result by its persisted provider ID", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ status: "SUCCEEDED", output: [assetUrl] }));
    vi.stubGlobal("fetch", request);
    await expect(getRunwayVideoTask("test-secret", taskId)).resolves.toEqual({
      status: "SUCCEEDED", output: [assetUrl],
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "https://api.dev.runwayml.com/v1/tasks/" + taskId,
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("does not retry creation after a transport failure", async () => {
    const request = vi.fn().mockRejectedValue(new Error("connection lost"));
    vi.stubGlobal("fetch", request);
    await expect(submitRunwayVideo("test-secret", { sourceUrl: "https://source.example", prompt: "Move" }))
      .rejects.toThrow("connection lost");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("streams an MP4 to the owner's site prefix and returns only the durable URL", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(mp4.subarray(0, 3));
        controller.enqueue(mp4.subarray(3, 7));
        controller.enqueue(mp4.subarray(7));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, {
      headers: { "content-type": "video/mp4" },
    })));
    put.mockImplementation(async (_path: string, body: ReadableStream<Uint8Array>) => {
      expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(mp4);
      return { url: blobUrl };
    });
    await expect(storeRunwayVideo("test-token", assetUrl, owner)).resolves.toEqual({
      filename: "film-job.mp4", path: "owner/projects/site/media-library/film-job.mp4",
      size: mp4.byteLength, url: blobUrl,
    });
    expect(put).toHaveBeenCalledWith(
      "owner/projects/site/media-library/film-job.mp4",
      expect.any(ReadableStream),
      expect.objectContaining({ multipart: true, allowOverwrite: true, contentType: "video/mp4" }),
    );
  });

  it("deletes the stored path through the Vercel Blob provider with server credentials", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "cleanup-token");
    await cleanupStoredRunwayVideo(owner);
    expect(del).toHaveBeenCalledExactlyOnceWith(
      "owner/projects/site/media-library/film-job.mp4", { token: "cleanup-token" },
    );
  });

  it("rejects disallowed output hosts and declared oversize files before storing", async () => {
    const request = vi.fn().mockResolvedValue(new Response(mp4, {
      headers: { "content-length": String(MAX_GENERATED_VIDEO_BYTES + 1) },
    }));
    vi.stubGlobal("fetch", request);
    await expect(storeRunwayVideo("token", "https://runwayml.com.other.example/film.mp4", owner))
      .rejects.toThrow("Disallowed Runway output host");
    expect(request).not.toHaveBeenCalled();
    await expect(storeRunwayVideo("token", assetUrl, owner)).rejects.toThrow("Invalid Runway video type or size");
    expect(put).not.toHaveBeenCalled();
  });

  it("cuts off a stream without Content-Length when it exceeds the byte limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(pulled++ === 0 ? mp4 : chunk);
        if (pulled > 35) controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    put.mockImplementation(async (_path: string, body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      for (;;) {
        if ((await reader.read()).done) return { url: blobUrl };
      }
    });
    await expect(storeRunwayVideo("test-token", assetUrl, owner)).rejects.toThrow("exceeded video limit");
    expect(pulled).toBeLessThan(36);
  });
});
