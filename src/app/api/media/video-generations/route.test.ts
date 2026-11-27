// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  hasVideoGenerationStorage: vi.fn(),
  getCurrentUser: vi.fn(),
  requireMediaUploadProject: vi.fn(),
  getVideoGenerationPrice: vi.fn(),
  getVideoGenerationCredentials: vi.fn(),
  getVideoGenerationJob: vi.fn(),
  listVideoGenerationJobs: vi.fn(),
  listDueVideoGenerationIds: vi.fn(),
  orderVideoGeneration: vi.fn(),
  startVideoGenerationWorker: vi.fn(),
  advanceVideoGeneration: vi.fn(),
}));
vi.mock("next/server", async (original) => ({
  ...await original<typeof import("next/server")>(),
  after: mocks.after,
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/services/media", () => ({
  hasVideoGenerationStorage: mocks.hasVideoGenerationStorage,
  requireMediaUploadProject: mocks.requireMediaUploadProject,
}));
vi.mock("@/lib/db/services/transactions", () => ({ InsufficientCreditsError: class extends Error {} }));
vi.mock("@/lib/media/video-generation-cost", () => ({ getVideoGenerationPrice: mocks.getVideoGenerationPrice }));
vi.mock("@/lib/media/video-generation-provider", () => ({
  getVideoGenerationCredentials: mocks.getVideoGenerationCredentials,
}));
vi.mock("@/lib/media/video-generation-store", () => ({
  getVideoGenerationJob: mocks.getVideoGenerationJob,
  listVideoGenerationJobs: mocks.listVideoGenerationJobs,
  listDueVideoGenerationIds: mocks.listDueVideoGenerationIds,
  orderVideoGeneration: mocks.orderVideoGeneration,
}));
vi.mock("@/lib/media/video-generation-runner", () => ({
  startVideoGenerationWorker: mocks.startVideoGenerationWorker,
  advanceVideoGeneration: mocks.advanceVideoGeneration,
}));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { GET, POST } from "./route";
import { GET as reconcile } from "./reconcile/route";
import { GET as readJob } from "./[id]/route";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";

const id = "ed18f13e-422c-4e4d-9c56-76fe6f8a2550";
const requestId = "17f20503-6c24-4c16-946b-35dbbce2af2f";
const base = "http://localhost/api/media/video-generations";
const job = { id, projectId: "site", status: "pending", credits: 2 };
const quote = { credits: 2, durationSeconds: 5, model: "gen4_turbo" };
const order = { projectId: "site", sourceMediaId: 1, prompt: "Camera moves", maxCredits: 2, requestId };

function create(data: object, contentType = "application/json") {
  return POST(new NextRequest(base, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(data),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "owner" });
  mocks.getVideoGenerationPrice.mockResolvedValue({ quote, credits: 2, providerCostOre: 250, billableOre: 500 });
  mocks.getVideoGenerationCredentials.mockReturnValue({ apiKey: "test", blobToken: "test" });
  mocks.getVideoGenerationJob.mockResolvedValue(job);
  mocks.listVideoGenerationJobs.mockResolvedValue([job]);
  mocks.orderVideoGeneration.mockResolvedValue(id);
});

describe("video generation API", () => {
  it("lists an owned site's jobs and stable quote even while generation is disabled", async () => {
    mocks.getVideoGenerationCredentials.mockReturnValue(null);
    mocks.hasVideoGenerationStorage.mockResolvedValue(true);
    const response = await GET(new NextRequest(base + "?projectId=site"));
    await expect(response.json()).resolves.toEqual({ enabled: false, quote, jobs: [job] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requireMediaUploadProject).toHaveBeenCalledExactlyOnceWith("owner", "site");
    expect(mocks.listVideoGenerationJobs).toHaveBeenCalledExactlyOnceWith("owner", "site");
  });

  it("rejects anonymous POST and never reads or charges an unowned site's jobs", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await create(order)).status).toBe(401);
    mocks.requireMediaUploadProject.mockRejectedValue(new MediaUploadPolicyError("Sajten hittades inte.", 404));
    expect((await GET(new NextRequest(base + "?projectId=other"))).status).toBe(404);
    expect((await readJob(new NextRequest(base + "/" + id + "?projectId=other"), {
      params: Promise.resolve({ id }),
    })).status).toBe(404);
    expect(mocks.listVideoGenerationJobs).not.toHaveBeenCalled();
    expect(mocks.getVideoGenerationJob).not.toHaveBeenCalled();
    expect(mocks.orderVideoGeneration).not.toHaveBeenCalled();
  });

  it("validates the stable request UUID and JSON before ordering", async () => {
    expect((await create({ ...order, requestId: "incorrect" })).status).toBe(400);
    expect((await create(order, "text/plain")).status).toBe(400);
    expect(mocks.orderVideoGeneration).not.toHaveBeenCalled();
  });

  it("authorizes one stored order and starts a background worker after responding", async () => {
    const response = await create({ ...order, prompt: " " + order.prompt + " " });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ job });
    expect(mocks.orderVideoGeneration).toHaveBeenCalledExactlyOnceWith(
      "owner", order, expect.objectContaining({ credits: 2 }), true,
    );
    expect(mocks.getVideoGenerationJob).toHaveBeenCalledExactlyOnceWith("owner", "site", id);
    expect(mocks.startVideoGenerationWorker).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.startVideoGenerationWorker).toHaveBeenCalledExactlyOnceWith(id);
  });

  it("returns a disabled quote and blocks new orders before touching an absent job table", async () => {
    mocks.getVideoGenerationCredentials.mockReturnValue(null);
    mocks.hasVideoGenerationStorage.mockResolvedValue(false);

    const response = await GET(new NextRequest(base + "?projectId=site"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false, quote, jobs: [] });
    expect(mocks.listVideoGenerationJobs).not.toHaveBeenCalled();

    expect((await create(order)).status).toBe(503);
    expect(mocks.orderVideoGeneration).not.toHaveBeenCalled();
  });

  it("requires the cron bearer secret and advances only due persisted jobs", async () => {
    vi.stubEnv("CRON_SECRET", "local-reconcile-secret");
    try {
      expect((await reconcile(new Request(base + "/reconcile"))).status).toBe(401);
      expect(mocks.listDueVideoGenerationIds).not.toHaveBeenCalled();
      mocks.listDueVideoGenerationIds.mockResolvedValue([id]);
      const response = await reconcile(new Request(base + "/reconcile", {
        headers: { Authorization: "Bearer local-reconcile-secret" },
      }));
      await expect(response.json()).resolves.toEqual({ checked: 1, errors: 0 });
      expect(mocks.advanceVideoGeneration).toHaveBeenCalledExactlyOnceWith(id);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("allows a refreshed job read to schedule the next persisted step", async () => {
    const response = await readJob(new NextRequest(base + "/" + id + "?projectId=site"), {
      params: Promise.resolve({ id }),
    });
    await expect(response.json()).resolves.toEqual({ job });
    await mocks.after.mock.calls[0][0]();
    expect(mocks.advanceVideoGeneration).toHaveBeenCalledExactlyOnceWith(id);
    expect(mocks.startVideoGenerationWorker).not.toHaveBeenCalled();
  });
});
