// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { registerBuilderBridge, resetBuilderBridgeForTests } from "@/lib/openclaw/builder-bridge";
import type { VideoGenerationJob } from "./video-generation-contract";
import { BUILDER_VIDEO_DRAFT_EVENT, prepareGeneratedVideoInBuilder, resumeVideoInsertion, type BuilderVideoDraft } from "./video-builder-action";

const job: VideoGenerationJob = {
  id: "job-1", projectId: "site-a", status: "succeeded", credits: 18,
  media: { id: "9223372036854775807", filename: "film.mp4", mimeType: "video/mp4",
    url: "https://files.public.blob.vercel-storage.com/owner/film.mp4" },
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  resetBuilderBridgeForTests();
  vi.unstubAllGlobals();
});

it("hands off from a standalone avatar only to the original builder and consumes the verified media once", async () => {
  const { signal } = new AbortController();
  const target = { chatId: "chat-a", projectId: "site-a", placement: "i heron" };
  const handoff = prepareGeneratedVideoInBuilder(job, target, signal, { allowHandoff: true });
  expect(handoff.kind).toBe("handoff");
  if (handoff.kind !== "handoff") throw new Error("Vanlig builderlänk saknas");
  expect(handoff.href).toBe("/builder?project=site-a&chatId=chat-a");
  expect(await resumeVideoInsertion(target, signal)).toBeUndefined();
  handoff.prepare();
  window.history.replaceState(null, "", handoff.href);

  const fetchMock = vi.fn(async () => Response.json({ job }));
  vi.stubGlobal("fetch", fetchMock);
  const sendMessage = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  registerBuilderBridge({
    getChatId: () => "chat-a", getActiveVersionId: () => "version-a",
    canSend: () => true, sendMessage, cancelGeneration: vi.fn(),
  });

  expect(await resumeVideoInsertion({ chatId: "chat-b", projectId: "site-b" }, signal)).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
  const listener = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(BUILDER_VIDEO_DRAFT_EVENT, listener, { once: true });
  expect(await resumeVideoInsertion(target, signal)).toEqual({ kind: "draft" });
  expect(await resumeVideoInsertion(target, signal)).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/media/video-generations/job-1?projectId=site-a", { signal });
  const event = listener.mock.lastCall?.[0] as CustomEvent<BuilderVideoDraft>;
  expect(event.detail).toEqual({ chatId: target.chatId, projectId: target.projectId, media: job.media, prompt: expect.stringContaining("i heron") });
  expect(sendMessage).not.toHaveBeenCalled();
});

it("does not open a finished video draft after the builder has changed its base version", () => {
  const sendMessage = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  registerBuilderBridge({
    getChatId: () => "chat-a", getActiveVersionId: () => "new-version",
    canSend: () => true, sendMessage, cancelGeneration: vi.fn(),
  });
  const { signal } = new AbortController();
  expect(() => prepareGeneratedVideoInBuilder(job, {
    chatId: "chat-a", projectId: "site-a", versionId: "original-version",
  }, signal)).toThrow("Byggaren har bytt");
  expect(sendMessage).not.toHaveBeenCalled();
});
