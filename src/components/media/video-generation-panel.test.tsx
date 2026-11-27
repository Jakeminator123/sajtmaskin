import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BUILDER_VIDEO_DRAFT_EVENT, type BuilderVideoDraft } from "@/lib/media/video-builder-action";
import { registerBuilderBridge, resetBuilderBridgeForTests } from "@/lib/openclaw/builder-bridge";
import { VideoGenerationPanel } from "./video-generation-panel";

const media = { id: 71, filename: "film.mp4", mimeType: "video/mp4", url: "https://files.public.blob.vercel-storage.com/owner/film.mp4" };
const ready = { id: "job-a", projectId: "site-a", status: "succeeded", credits: 18, media };

function quoteFetch({ outcome = ready, jobs = [] }: { outcome?: object; jobs?: object[] } = {}) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    if (input.startsWith("/api/media/upload?")) {
      return Response.json({
        success: true,
        projectId: "site-a",
        items: [
          { id: 21, projectId: "site-a", fileType: "image", mimeType: "image/png", filename: "trädet.png" },
          { id: 22, projectId: null, fileType: "logo", mimeType: "image/png", filename: "personlig.png" },
          { id: 23, projectId: "site-b", fileType: "image", mimeType: "image/png", filename: "annan-sajt.png" },
        ],
      });
    }
    if (init?.method === "POST") return Response.json({ job: outcome });
    return Response.json({ enabled: true, quote: { model: "gen4_turbo", durationSeconds: 5, credits: 18 }, jobs });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetBuilderBridgeForTests();
});

it("quotes the job before one order and saves a normal media-bank video", async () => {
  const fetchMock = quoteFetch();
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(<VideoGenerationPanel projectId="site-a" onClose={vi.fn()} onSaved={onSaved} />);

  const button = await screen.findByRole("button", { name: "Beställ video för 18 krediter" });
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  expect(screen.queryByRole("option", { name: "annan-sajt.png" })).toBeNull();
  expect(screen.getByRole("option", { name: "personlig.png" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Startbild från mediebanken"), { target: { value: "21" } });
  fireEvent.change(screen.getByLabelText("Beskriv hur videon ska röra sig"), { target: { value: "Låt löven röra sig" } });
  fireEvent.click(button);
  fireEvent.click(button);
  const video = await screen.findByRole("link", { name: "Öppna film.mp4" });
  expect(video.getAttribute("href")).toBe(media.url);
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(ready);
  const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({
    projectId: "site-a", sourceMediaId: 21, prompt: "Låt löven röra sig", maxCredits: 18,
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
  });
});

it("pays only for the video and opens a free MP4 draft without calling the paid builder", async () => {
  const fetchMock = quoteFetch();
  vi.stubGlobal("fetch", fetchMock);
  const sendMessage = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  registerBuilderBridge({
    getChatId: () => "chat-a",
    getActiveVersionId: () => "version-a",
    canSend: () => true,
    sendMessage,
    cancelGeneration: vi.fn(),
  });
  render(<VideoGenerationPanel chatId="chat-a" projectId="site-a" onClose={vi.fn()}
    intent={{ prompt: "Löv i vinden", insert: true, placement: "i heron", approvedCredits: 20, sourceMediaId: 21 }} />);

  await screen.findByText("Godkänt budgettak för videon 20 krediter");
  await screen.findByText("Videon har sparats i mediebanken.");
  expect(sendMessage).not.toHaveBeenCalled();
  const receiveDraft = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(BUILDER_VIDEO_DRAFT_EVENT, receiveDraft, { once: true });
  fireEvent.click(screen.getByRole("button", { name: "Öppna i byggaren" }));
  await screen.findByText("Videon sparades och bifogades i byggutkastet.");
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  const paid = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(paid?.[1]?.body)).maxCredits).toBe(18);
  const event = receiveDraft.mock.lastCall?.[0] as CustomEvent<BuilderVideoDraft>;
  expect(event.detail).toEqual({ chatId: "chat-a", projectId: "site-a", prompt: expect.stringContaining("i heron"), media });
  expect(sendMessage).not.toHaveBeenCalled();
});

it("polls the project-bound order and saves only the confirmed final file", async () => {
  const backingFetch = quoteFetch({ outcome: { id: "job-a", projectId: "site-a", status: "processing", credits: 18 } });
  const fetchMock = vi.fn((input: string, init?: RequestInit) => input.includes("/job-a?")
    ? Promise.resolve(Response.json({ job: ready }))
    : backingFetch(input, init));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(<VideoGenerationPanel projectId="site-a" onClose={vi.fn()} onSaved={onSaved}
    intent={{ prompt: "Löv i vinden", insert: false, sourceMediaId: 21 }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Beställ video för 18 krediter" }));
  await screen.findByText(/Videon genereras/);
  expect(onSaved).not.toHaveBeenCalled();
  await screen.findByRole("link", { name: "Öppna film.mp4" }, { timeout: 7000 });
  expect(fetchMock).toHaveBeenCalledWith("/api/media/video-generations/job-a?projectId=site-a", { signal: expect.any(AbortSignal) });
  expect(onSaved).toHaveBeenCalledExactlyOnceWith(ready);
});

it("offers a picker and keeps an over-budget start uncharged", async () => {
  const fetchMock = quoteFetch();
  vi.stubGlobal("fetch", fetchMock);
  render(<VideoGenerationPanel chatId="chat-a" onClose={vi.fn()}
    intent={{ prompt: "Löv i vinden", insert: false, approvedCredits: 10 }} />);
  await screen.findByText(/Videopriset överstiger ditt budgettak/);
  const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Beställ video för 18 krediter" });
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Startbild från mediebanken"), { target: { value: "21" } });
  expect(submit.disabled).toBe(false);
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
});

it("reuses the exact order id and price after an ambiguous network failure", async () => {
  const backingFetch = quoteFetch();
  let seenPost = false;
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === "POST" && !seenPost) {
      seenPost = true;
      throw new Error("Bruten anslutning");
    }
    return backingFetch(input, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<VideoGenerationPanel projectId="site-a" onClose={vi.fn()}
    intent={{ prompt: "Löv i vinden", insert: false, sourceMediaId: 21 }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Beställ video för 18 krediter" }));
  fireEvent.click(await screen.findByRole("button", { name: "Kontrollera samma beställning" }));
  await screen.findByText("Videon har sparats i mediebanken.");
  const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0]?.[1]?.body).toBe(posts[1]?.[1]?.body);
});

it("suppresses a late paid response after a chat switch", async () => {
  const backingFetch = quoteFetch();
  let complete!: (response: Response) => void;
  const started = new Promise<Response>((resolve) => { complete = resolve; });
  const fetchMock = vi.fn((input: string, init?: RequestInit) => init?.method === "POST" ? started : backingFetch(input, init));
  vi.stubGlobal("fetch", fetchMock);
  const sendMessage = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  registerBuilderBridge({
    getChatId: () => "chat-b",
    getActiveVersionId: () => "version-b",
    canSend: () => true,
    sendMessage,
    cancelGeneration: vi.fn(),
  });
  const view = render(<VideoGenerationPanel key="chat-a" chatId="chat-a" onClose={vi.fn()}
    intent={{ prompt: "Löv i vinden", insert: true, sourceMediaId: 21 }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Beställ video för 18 krediter" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  view.rerender(<VideoGenerationPanel key="chat-b" chatId="chat-b" onClose={vi.fn()} />);
  await act(async () => complete(Response.json({ job: ready })));
  expect(sendMessage).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Öppna film.mp4" })).toBeNull();
});
