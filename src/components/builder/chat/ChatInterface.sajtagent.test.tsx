/**
 * En input, två mottagare: komposern skickar frågor till Sajtagenten och
 * byggordrar till byggmotorn (`composer-route.ts`). Samma mock-harness som
 * ChatInterface.draft-retention.test.tsx.
 */
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { act, useLayoutEffect, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageOptions } from "@/lib/hooks/chat/types";
import type { UploadedFile } from "@/components/media/file-upload-zone";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock("@/components/forms/voice-recorder", () => ({ VoiceRecorder: () => null }));

const uploadZone = vi.hoisted(() => ({
  snapshot: undefined as { files: UploadedFile[]; onFilesChange: (files: UploadedFile[]) => void } | undefined,
}));
vi.mock("@/components/media/file-upload-zone", async (original) => ({
  ...await original<typeof import("@/components/media/file-upload-zone")>(),
  FileUploadZone: ({ files, onFilesChange }: NonNullable<typeof uploadZone.snapshot>) => {
    uploadZone.snapshot = { files, onFilesChange };
    return null;
  },
}));

vi.mock("@/components/media/media-drawer", () => ({ MediaDrawer: () => null }));
vi.mock("@/components/media/text-uploader", () => ({ TextUploader: () => null }));
vi.mock("@/components/openclaw/OpenClawPowersControl", () => ({
  OpenClawPowersControl: () => null,
}));

const sajtagent = vi.hoisted(() => ({ value: null as SajtagentContextValue | null }));
vi.mock("./sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => sajtagent.value,
}));

import { ChatInterface } from "./ChatInterface";
import { BUILDER_VIDEO_DRAFT_EVENT, prepareGeneratedVideoInBuilder, type BuilderVideoDraft } from "@/lib/media/video-builder-action";
import { ComposerModeToggle } from "./sajtagent/ComposerModeToggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useComposerMode } from "@/lib/builder/use-composer-mode";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import {
  hasMissionAwaitingResult,
  markMissionAwaitingResult,
  resetAgentMissionLedgerForTests,
} from "@/lib/openclaw/agent-action-consent";
import { useOpenClawChat, type OpenClawSendOptions } from "@/components/openclaw/useOpenClawChat";

function ComposerUnderTest(props: ComponentProps<typeof ChatInterface>) {
  const { composerMode, handleComposerModeChange } = useComposerMode(props.chatId);
  return (
    <>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger>Chattläge</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ComposerModeToggle value={composerMode} onChange={handleComposerModeChange}
            agentConfigured={Boolean(sajtagent.value?.configured ?? sajtagent.value?.available)}
            buildLocked={Boolean(props.isBusy)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ChatInterface {...props} composerMode={composerMode} />
    </>
  );
}

function makeAgent(overrides: Partial<SajtagentContextValue> = {}): SajtagentContextValue {
  return {
    available: true,
    messages: [],
    isStreaming: false,
    send: vi.fn(async (_text, options) => { options?.onDispatchAccepted?.(); }),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    armedMandate: null,
    campaignScript: null,
    ...overrides,
  };
}

afterEach(() => {
  sajtagent.value = null;
  uploadZone.snapshot = undefined;
  resetAgentMissionLedgerForTests();
  useOpenClawStore.setState({
    messages: [],
    preparedFill: null,
    armedMandate: null,
    armedContinuation: null,
    editEnabled: false,
    powersOn: false,
    grantedPowers: [],
  });
  delete window.__SITEMASKIN_CONTEXT;
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("keeps a selected source outside route intent and sends its exact media URL to the builder", async () => {
  const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  sajtagent.value = makeAgent();
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({
      url: "https://example.org/source", title: "Vald sida", passages: ["Välj den här exakta texten."],
      images: [{ url: "https://images.example/asset", alt: "Detalj" }],
    }))
    .mockResolvedValueOnce(Response.json({
      media: { id: 42, url: "https://blob.example/media/photo.png", filename: "photo.png", contentType: "image/png" },
    }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ComposerUnderTest chatId="chat_1" mediaEnabled onSendMessage={build} />);
  const request = "Kan du gå till www.minbil.se och hämta bild X och textstycke Y?";
  await typeAndSend(request);
  expect(screen.getByTestId("composer-route-hint").textContent).toContain("Läser en webbsida");
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/openclaw/source-page", expect.objectContaining({
    body: JSON.stringify({ url: "https://www.minbil.se/" }),
  }));
  await screen.findByText("Vald sida");
  await typeAndSend(request);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(sajtagent.value.send).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Textstycke"), { target: { value: "Välj den här exakta texten." } });
  fireEvent.change(screen.getByLabelText("Bild"), { target: { value: "https://images.example/asset" } });
  fireEvent.click(screen.getByLabelText("Jag får återanvända bilden"));
  fireEvent.click(screen.getByRole("button", { name: "Använd i utkastet" }));
  await screen.findByText("Vald källa https://example.org/source");
  expect(build).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
  await typeAndSend("Lägg in bilden och texten på startsidan.");
  expect(build).toHaveBeenCalledWith(
    expect.stringContaining("Välj den här exakta texten."),
    expect.objectContaining({ attachments: [expect.objectContaining({ url: "https://blob.example/media/photo.png" })] }),
  );
  expect(sajtagent.value.send).not.toHaveBeenCalled();
});

it("orders an exact BIGINT start image and prepares the saved MP4 through the ordinary composer", async () => {
  const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  sajtagent.value = makeAgent();
  const startId = "9007199254740993";
  const start = {
    id: startId, projectId: "project_1", fileType: "image", mimeType: "image/png",
    url: "https://files.public.blob.vercel-storage.com/owner/start.png", filename: "start.png",
  };
  const output = {
    id: "9223372036854775807", filename: "skogen.mp4", mimeType: "video/mp4",
    url: "https://files.public.blob.vercel-storage.com/owner/skogen.mp4",
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ success: true, projectId: "project_1", items: [start] }))
    .mockResolvedValueOnce(Response.json({
      enabled: true, quote: { model: "gen4_turbo", durationSeconds: 5, credits: 18 }, jobs: [],
    }))
    .mockResolvedValueOnce(Response.json({
      job: { id: "job-1", projectId: "project_1", status: "succeeded", credits: 18, media: output },
    }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ComposerUnderTest chatId="chat_1" projectId="project_1" mediaEnabled onSendMessage={build} />);
  act(() => uploadZone.snapshot?.onFilesChange([{ ...start, status: "success", size: 0, isPublicUrl: true }]));
  await typeAndSend("Kan du skapa en video: panorera över skogen och lägg in den i heron?");
  const purchase = await screen.findByRole("button", { name: "Beställ video för 18 krediter" });
  expect(screen.getByLabelText<HTMLSelectElement>("Startbild från mediebanken").value).toBe(startId);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/media/upload?projectId=project_1&chatId=chat_1",
    "/api/media/video-generations?projectId=project_1",
  ]);
  expect(build).not.toHaveBeenCalled();
  expect(sajtagent.value.send).not.toHaveBeenCalled();

  fireEvent.click(purchase);
  expect((await screen.findByRole("link", { name: "Öppna skogen.mp4" })).getAttribute("href")).toBe(output.url);
  expect(fetchMock.mock.lastCall?.[0]).toBe("/api/media/video-generations");
  expect(JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))).toMatchObject({ sourceMediaId: startId });
  fireEvent.click(screen.getByRole("button", { name: "Öppna i byggaren" }));
  expect(uploadZone.snapshot?.files).toContainEqual(expect.objectContaining({ id: `media-${output.id}`, url: output.url }));
  expect(build).not.toHaveBeenCalled();
});

it("keeps the exact saved MP4 in a free draft until the user uses the ordinary builder send", async () => {
  const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  const url = "https://files.public.blob.vercel-storage.com/owner/video.mp4";
  const prompt = "Lägg in den färdiga bifogade MP4-videon på sajten.";
  const view = render(<ComposerUnderTest chatId="chat_1" projectId="project_1" mediaEnabled onSendMessage={build} />);
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Skriv en uppdatering" });
  fireEvent.change(input, { target: { value: "Behåll rubriken." } });
  await act(async () => {
    window.dispatchEvent(new CustomEvent<BuilderVideoDraft>(BUILDER_VIDEO_DRAFT_EVENT, {
      cancelable: true,
      detail: { chatId: "chat_1", projectId: "project_1", prompt, media: { id: "9007199254740993", url, filename: "video.mp4", mimeType: "video/mp4" } },
    }));
  });
  view.rerender(<ComposerUnderTest chatId="chat_1" projectId="project_1" mediaEnabled avatarElsewhere onSendMessage={build} />);
  expect(input.value).toBe(`Behåll rubriken.\n\n${prompt}`);
  expect(uploadZone.snapshot?.files).toEqual([expect.objectContaining({ id: "media-9007199254740993", url })]);
  expect(build).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
  await typeAndSend(input.value);
  expect(build).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(prompt),
    expect.objectContaining({ attachments: [expect.objectContaining({ url, mimeType: "video/mp4" })] }));
});

it.each(["chat_2", "chat_1"])("keeps a prepared video out of another project's build with chat %s", async (nextChatId) => {
  const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  const textarea = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Skriv en uppdatering" });
  const displayedBeforePassiveEffects: string[] = [];
  function ScopedComposer({ chatId, projectId }: { chatId: string; projectId: string }) {
    useLayoutEffect(() => {
      displayedBeforePassiveEffects.push(textarea().value);
    }, [chatId, projectId]);
    return <ComposerUnderTest chatId={chatId} projectId={projectId} mediaEnabled onSendMessage={build} />;
  }
  const view = render(<ScopedComposer chatId="chat_1" projectId="project_1" />);
  const draft: BuilderVideoDraft = {
    chatId: "chat_1",
    projectId: "project_1",
    prompt: "Lägg in endast A:s video.",
    media: { id: "42", url: "https://files.public.blob.vercel-storage.com/owner/a.mp4", filename: "a.mp4", mimeType: "video/mp4" },
  };
  const submitPreparedVideo = () => act(() => {
    window.dispatchEvent(new CustomEvent<BuilderVideoDraft>(BUILDER_VIDEO_DRAFT_EVENT, { cancelable: true, detail: draft }));
  });
  submitPreparedVideo();
  expect(textarea().value).toBe(draft.prompt);
  fireEvent.change(textarea(), { target: { value: "Omskriven instruktion om A:s film." } });
  const oldUploadZone = uploadZone.snapshot;
  expect(oldUploadZone?.files.map((file) => file.url)).toEqual([draft.media.url]);

  view.rerender(<ScopedComposer chatId={nextChatId} projectId="project_2" />);
  expect(displayedBeforePassiveEffects.at(-1)).toBe("");
  submitPreparedVideo(); // A's late handoff event cannot refill the new scope.
  act(() => oldUploadZone?.onFilesChange(oldUploadZone.files)); // A's upload completion republishes its entire original list.
  expect(textarea().value).toBe("");
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
  await typeAndSend("Ändra rubriken för B.");
  expect(build).toHaveBeenCalledExactlyOnceWith("Ändra rubriken för B.", expect.objectContaining({
    attachments: undefined,
    attachmentPrompt: "",
  }));

  view.rerender(<ScopedComposer chatId="chat_1" projectId="project_1" />);
  act(() => oldUploadZone?.onFilesChange(oldUploadZone.files));
  expect(textarea().value).toBe("");
  expect(uploadZone.snapshot?.files).toEqual([]);
});

it("drops a late job response after the same composer switches site", async () => {
  const target = { chatId: "chat_1", projectId: "project_1" };
  const job = {
    id: "job-a", projectId: target.projectId, status: "succeeded" as const, credits: 18,
    media: { id: "42", url: "https://files.public.blob.vercel-storage.com/owner/a.mp4", filename: "a.mp4", mimeType: "video/mp4" },
  };
  const handoff = prepareGeneratedVideoInBuilder(job, target, new AbortController().signal, { allowHandoff: true });
  if (handoff.kind !== "handoff") throw new Error("Fristående videohandoff saknas");
  handoff.prepare();
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
  const view = render(<ComposerUnderTest {...target} mediaEnabled onSendMessage={build} />);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "/api/media/video-generations/job-a?projectId=project_1",
    { signal: expect.any(AbortSignal) },
  );
  view.rerender(<ComposerUnderTest chatId="chat_2" projectId="project_2" mediaEnabled onSendMessage={build} />);
  await act(async () => finish(Response.json({ job })));
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Skriv en uppdatering" }).value).toBe("");
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
  await typeAndSend("Ändra B.");
  expect(build).toHaveBeenCalledExactlyOnceWith("Ändra B.", expect.objectContaining({ attachments: undefined }));
});

async function typeAndSend(text: string) {
  const textarea = screen.getByRole("textbox", { name: "Skriv en uppdatering" });
  await act(async () => {
    fireEvent.change(textarea, { target: { value: text } });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
  });
}

const SCREENSHOT_QUESTION = "Granska designen på sajten. Utgå från skärmbilderna för dator och mobil. " +
  "Vad ser du i sidans topp på respektive bild? Beskriv rubriken, färgerna och vad som syns i bildytan. " +
  "Nämn ett konkret problem om du ser något, och säg om något underlag saknas.";

describe("ChatInterface — Sajtagenten i samma input", () => {
  it.each([
    ["Auto", SCREENSHOT_QUESTION],
    ["Fråga", SCREENSHOT_QUESTION],
    ["Auto", "Granska designen på sajten. Saknas kontrast i mobilvyn?"],
    ["Auto", "Granska designen på sajten. Beskriv rubriken och skriv inte om den."],
    ["Auto", "Granska designen på sajten. Kan du se vad som står på knappen?"],
    ["Auto", "Granska designen på sajten. Ändra inte färgerna men skriv vad du ser på bilden."],
    ["Auto", "Granska designen på sajten. Ändra inte färgerna men skriv en kort analys av designen."],
    ["Auto", "Granska designen på sajten. Ändra inte färgerna men korta absolut inte rubriken."],
    ["Auto", "Granska designen på sajten. Använd skärmbilderna som underlag för din bedömning."],
  ])("skickar bildfrågan till läsvägen i %s: %s", async (mode, text) => {
    const context = { page: "builder", chatId: "chat_1", activeVersionId: "v1" };
    window.__SITEMASKIN_CONTEXT = context as typeof window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["armed_autonomy"] });
    const answer = "Datorvyn har text och en bild bredvid varandra, mobilvyn staplar dem.";
    const delta = JSON.stringify({ choices: [{ delta: { content: answer } }] });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      `data: ${delta}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOpenClawChat());
    sajtagent.value = makeAgent({ send: result.current.send });
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    if (mode === "Fråga") fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));

    await typeAndSend(text);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/openclaw/chat", expect.anything());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      context,
      messages: [{ role: "user", content: text }],
      readTask: { reviewCurrentSite: true },
      buildConsent: false,
    });
    expect(useOpenClawStore.getState().messages.at(-1)?.content).toBe(answer);
    expect(build).not.toHaveBeenCalled();
  });

  it.each([
    "Granska designen på sajten. Beskriv rubriken och byt den till Välkommen.",
    "Granska designen på sajten. Beskriv rubriken och skriv om den till Välkommen.",
    "Granska designen på sajten. Beskriv rubriken och korta ner den till tre ord.",
    "Granska sajten. Ändra inte färgerna men skriv om rubriken till Välkommen.",
  ])("behåller ändringsmedgivandet när en granskning även beställer en ändring: %s", async text => {
    useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["armed_autonomy"] });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useOpenClawChat());
    sajtagent.value = makeAgent({ send: result.current.send });
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);

    await typeAndSend(text);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/openclaw/chat", expect.anything());
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.readTask).toBeUndefined();
    expect(body.buildConsent).toBe(true);
    expect(build).not.toHaveBeenCalled();
  });

  it("behåller en väntande byggfråga på byggvägen i Auto", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} builderAwaitingReply />);

    await typeAndSend(SCREENSHOT_QUESTION);

    expect(build).toHaveBeenCalledExactlyOnceWith(SCREENSHOT_QUESTION, expect.anything());
    expect(agent.send).not.toHaveBeenCalled();
  });

  it.each([
    ["Gör punkt två och tre", "auto"], ["Gör punkt 2 och punkt 3", "auto"],
    ["Gör punkt två och tre", "build"], ["Gör punkt 2 och punkt 3", "build"],
    ["Gör punkt 2: gör det", "auto"], ["Gör punkt 2: byt enligt ditt förslag", "auto"],
    ["Gör punkt 2: gör det", "build"], ["Gör punkt 2: byt enligt ditt förslag", "build"],
    ["Gör punkt 2: byt ut det", "auto"], ["Gör punkt 2: byt ut det", "build"],
    ["Gör punkt 2: gör om det", "auto"], ["Gör punkt 2: gör om det", "build"],
    ["Gör punkt 2: gor om det", "auto"], ["Gör punkt 2: gor om det", "build"],
  ] as const)("clarifies multiple references without raw builder dispatch: %s, %s", async (text, mode) => {
    window.__SITEMASKIN_CONTEXT = { page: "builder", chatId: "chat_1", activeVersionId: "v1" } as typeof window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ messages: [{ id: "advice-1", role: "assistant", timestamp: 1,
      content: "1. Behåll färgerna\n2. Byt CTA till Boka rum\n3. Ta bort sidfoten",
      builderTarget: { chatId: "chat_1", versionId: "v1" } }],
      preparedFill: { target: "builder.chat.primary", value: text } });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    if (mode === "build") fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
    await typeAndSend(text);
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value).toBe(text);
  });

  it.each([
    "Gör punkt 2: byt rubriken till Välkommen",
    "Gör punkt 2: byt ut rubriken mot Välkommen",
    "Gör punkt 2: gör om kontaktsektionen med telefon och e-post",
    "Gör punkt 2: gor om kontaktsektionen med telefon och e-post",
    "Gör punkt 2: gör knappen större",
    "Gör punkt 2: lägg till en kontaktsektion med telefon och e-post",
    "Apply suggestion 2: add a contact section with phone and email",
  ])("preserves a self-contained colon instruction without advice: %s", async text => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend(text);
    expect(build).toHaveBeenCalledExactlyOnceWith(text, expect.anything());
    expect(agent.send).not.toHaveBeenCalled();
  });

  it("executes the new scoped order once while revoking older automatic work", async () => {
    useOpenClawStore.setState({ armedMandate: { mode: "followups", remaining: 3, createdAt: 1, reason: "Old order" },
      messages: [{ id: "old-user", role: "user", content: "Byt alla färger", timestamp: 1, allowBuild: true }] });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    const text = "Byt rubriken till Välkommen, ändra inget annat";
    await typeAndSend(text);
    expect(build).toHaveBeenCalledExactlyOnceWith(text, expect.anything());
    expect(agent.send).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(false);
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
  });

  it("keeps an unavailable-agent question in the draft without calling the builder", async () => {
    const agent = makeAgent({ available: false, configured: true, healthStatus: "unavailable" });
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Vad tycker du? Ändra ingenting.");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value)
      .toBe("Vad tycker du? Ändra ingenting.");
  });

  it("keeps real build orders working when the configured agent is down", async () => {
    sajtagent.value = makeAgent({ available: false, configured: true });
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Byt rubriken till Välkommen");
    expect(build).toHaveBeenCalledWith("Byt rubriken till Välkommen", expect.anything());
  });

  it("a prepared field marker cannot turn a question into a build", async () => {
    const question = "Vad tycker du om startsidan?";
    useOpenClawStore.setState({ preparedFill: { target: "builder.chat.primary", value: question } });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend(question);
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).toHaveBeenCalledWith(question, expect.objectContaining({ allowBuild: false }));
  });

  it("does not clear an agent draft until positive dispatch acceptance", async () => {
    let accepted: (() => void) | undefined;
    const agent = makeAgent({ send: vi.fn(async (_text, options) => { accepted = options?.onDispatchAccepted; }) });
    sajtagent.value = agent;
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    await typeAndSend("Vad tycker du om startsidan?");
    const input = screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement;
    expect(input.value).toBe("Vad tycker du om startsidan?");
    act(() => accepted?.());
    expect(input.value).toBe("");
  });

  it("does not erase a new draft when an earlier agent dispatch is accepted", async () => {
    let accepted: (() => void) | undefined;
    sajtagent.value = makeAgent({ send: vi.fn(async (_text, options) => { accepted = options?.onDispatchAccepted; }) });
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    await typeAndSend("Vad tycker du om startsidan?");
    const input = screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "En ny fråga" } });
    act(() => accepted?.());
    expect(input.value).toBe("En ny fråga");
  });

  it.each([false, true])("sends exactly the referenced advice as agent context, hydrated=%s", async (hydrated) => {
    window.__SITEMASKIN_CONTEXT = { page: "builder", chatId: "chat_1", activeVersionId: "v1" } as typeof window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ messages: [{ id: "advice-1", role: "assistant", timestamp: 1,
      content: "1. Behåll färgerna\n2. Byt CTA till Boka rum\n3. Ta bort sidfoten",
      builderTarget: { chatId: "chat_1", versionId: "v1" }, hydrated }] });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Gör punkt två");
    expect(build).not.toHaveBeenCalled();
    const options = vi.mocked(agent.send).mock.calls[0]?.[1] as OpenClawSendOptions;
    // Ägarbeslut 2026-11-20: «gör punkt två» är en beställning av just den
    // punkten, så turen bär medgivande och agenten får bygga den direkt.
    expect(options.allowBuild).toBe(true);
    expect(options.proposalReference).toEqual({ agentMessageId: "advice-1", selectedPart: "2",
      instruction: "Byt CTA till Boka rum", builderTarget: { chatId: "chat_1", versionId: "v1" } });
  });

  it.each(["v-old", "missing"])("keeps stale or missing advice unresolved: %s", async (version) => {
    window.__SITEMASKIN_CONTEXT = { page: "builder", chatId: "chat_1", activeVersionId: "v1" } as typeof window.__SITEMASKIN_CONTEXT;
    useOpenClawStore.setState({ messages: version === "missing" ? [] : [{ id: "advice-old", role: "assistant", timestamp: 1,
      content: "1. A\n2. B", builderTarget: { chatId: "chat_1", versionId: version } }] });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Gör punkt två");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value).toBe("Gör punkt två");
  });

  it("revokes an older automatic mandate even when the agent is still streaming", async () => {
    useOpenClawStore.setState({ armedMandate: { mode: "followups", remaining: 2, createdAt: 1, reason: "Explicit order" },
      messages: [{ id: "old-user", role: "user", content: "Byt rubriken", timestamp: 1, allowBuild: true }] });
    const agent = makeAgent({ isStreaming: true });
    sajtagent.value = agent;
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));
    await typeAndSend("Ändra ingenting. Ge bara råd.");
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(false);
    expect(agent.send).not.toHaveBeenCalled();
  });

  it("skickar en fråga till Sajtagenten och lämnar byggmotorn orörd", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend("Vad tycker du om startsidan?");

    expect(agent.send).toHaveBeenCalledWith("Vad tycker du om startsidan?", expect.objectContaining({ allowBuild: false }));
    expect(onSendMessage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value,
      ).toBe(""),
    );
  });

  // Ägarbeslut 2026-11-20: agenten är orkestrator. En artig begäran når
  // agenten med medgivande att agera direkt — den går varken tyst till
  // byggmotorn eller fastnar bakom ett kort.
  it.each([
    "Kan du lägga till en karta på kontaktsidan?",
    "Jag vill ha en rosa knapp i headern",
    "Byt rubriken till Välkommen",
    "Gör om hela sajten till en mörk portfolio",
  ])("skickar en artig begäran till Sajtagenten med handlingsmedgivande: %s", async (text) => {
    act(() => {
      useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["armed_autonomy"] });
    });
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn();

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend(text);

    expect(agent.send).toHaveBeenCalledWith(text, expect.objectContaining({ allowBuild: true, restrictBuild: false }));
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("säger före klicket om Sajtagenten kan ändra sajten på den här texten", () => {
    sajtagent.value = makeAgent();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    const hint = () => screen.getByTestId("composer-route-hint");
    const textarea = screen.getByRole("textbox", { name: "Skriv en uppdatering" });
    const polite = "Kan du lägga till en karta på kontaktsidan?";

    // Utan befogenhet: agenten kan bara svara.
    fireEvent.change(textarea, { target: { value: polite } });
    expect(hint().textContent).toContain("Fråga – ändrar inget");

    act(() => {
      useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["armed_autonomy"] });
    });
    expect(hint().textContent).toContain("Till Sajtagenten – kan ändra sajten");
    expect(hint().textContent).not.toContain("ändrar inget");

    fireEvent.change(textarea, { target: { value: "Sök efter https://example.org/produkt?id=42&typ=1#bild på webben." } });
    expect(hint().textContent).toContain("Fråga – ändrar inget");

    // En fråga med frågeord bär aldrig medgivande, så löftet står kvar.
    fireEvent.change(textarea, { target: { value: "Vad tycker du om startsidan?" } });
    expect(hint().textContent).toContain("Fråga – ändrar inget");

    // Läget Fråga ändrar aldrig något.
    fireEvent.change(textarea, { target: { value: polite } });
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));
    expect(hint().textContent).toContain("Fråga – ändrar inget");
  });

  it("sends the armed agent's prepared build to the builder without dispatching it back to the agent", async () => {
    const text = "Gör om hela sajten till en mörk portfolio";
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      preparedFill: { target: "builder.chat.primary", value: text },
    });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);

    await typeAndSend(text);

    expect(agent.send).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledExactlyOnceWith(text, expect.objectContaining({ promptSource: "openclaw-prepared" }));
  });

  it("återkallar uppdraget när man skriver stopp i Bygg-läget", async () => {
    sajtagent.value = makeAgent();
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
    act(() => {
      useOpenClawStore.setState({
        messages: [{ id: "mission", role: "user", content: "Gör om kontaktsidan", timestamp: 1, allowBuild: true }],
      });
    });

    // Stoppet står i andra meningen: routningen läser bara den första, men
    // återkallandet räknar varje mening.
    await typeAndSend("Det blev fel. Sluta!");

    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(false);
  });

  it("släpper agentens väntan när användaren själv bygger från komposern", async () => {
    const scopeKey = useOpenClawStore.getState().scopeKey;
    markMissionAwaitingResult("mission", scopeKey);
    expect(hasMissionAwaitingResult(scopeKey)).toBe(true);
    sajtagent.value = makeAgent();
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);

    await typeAndSend("Byt rubriken till Välkommen");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(hasMissionAwaitingResult(scopeKey)).toBe(false);
  });

  it("återkallar ett pågående uppdrag redan när läget Fråga väljs", () => {
    useOpenClawStore.setState({
      armedMandate: { mode: "followups", remaining: 2, createdAt: 1, reason: "Explicit order" },
      messages: [{ id: "mission", role: "user", content: "Gör om kontaktsidan", timestamp: 1, allowBuild: true }],
    });
    sajtagent.value = makeAgent();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(true);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));
    expect(useOpenClawStore.getState().messages[0].allowBuild).toBe(false);
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
  });

  it("skickar en byggorder till byggmotorn", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend("Byt rubriken till Välkommen");

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage.mock.calls[0][0]).toBe("Byt rubriken till Välkommen");
    expect(agent.send).not.toHaveBeenCalled();
  });

  it("tvingar mottagaren via lägesväljaren", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));
    await typeAndSend("Byt rubriken till Välkommen");

    expect(agent.send).toHaveBeenCalledWith("Byt rubriken till Välkommen", expect.objectContaining({ allowBuild: false, restrictBuild: true }));
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("visar att agenten svarar och en stoppknapp medan agenten svarar", async () => {
    const agent = makeAgent({ isStreaming: true });
    sajtagent.value = agent;

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(screen.getByTestId("composer-agent-streaming").textContent).toContain("Sajtagenten svarar");
    fireEvent.click(screen.getByRole("button", { name: "Stoppa Sajtagenten" }));
    expect(agent.stop).toHaveBeenCalledTimes(1);
  });

  it("visar alltid vad Skicka gör, från samma beslut som utskicket", async () => {
    sajtagent.value = makeAgent();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={vi.fn()} />);
    const hint = () => screen.getByTestId("composer-route-hint");
    const textarea = screen.getByRole("textbox", { name: "Skriv en uppdatering" });
    expect(hint().getAttribute("data-route-tone")).toBe("neutral");
    fireEvent.change(textarea, { target: { value: "Vad tycker du om startsidan?" } });
    expect(hint().textContent).toContain("Fråga – ändrar inget");
    fireEvent.change(textarea, { target: { value: "Byt rubriken till Välkommen" } });
    expect(hint().textContent).toContain("Ändring – skapar en ny version");
    expect(screen.getByRole("button", { name: "Skicka" }).getAttribute("aria-describedby")).toBe(
      hint().id,
    );
  });

  it("låter inte Bygg-läget följa med till en annan chatt", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    const { rerender } = render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
    expect(screen.getByRole("menuitemradio", { name: "Bygg" }).getAttribute("aria-checked")).toBe("true");

    rerender(<ComposerUnderTest chatId="chat_2" onSendMessage={build} />);
    expect(screen.getByRole("menuitemradio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true");
    await typeAndSend("Vad tycker du om startsidan?");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).toHaveBeenCalledWith("Vad tycker du om startsidan?", expect.anything());

    // Tillbaka i första chatten gäller dess eget val.
    rerender(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: "Bygg" }).getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("ignorerar ett gammalt globalt Bygg-läge från före 2026-11-11", async () => {
    sessionStorage.setItem("sajtmaskin:composerMode", "build");
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Vad tycker du om startsidan?");
    expect(build).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("sajtmaskin:composerMode")).toBeNull();
  });

  it("blockerar en fråga med bilaga i stället för att bygga, och säger vad man kan göra", async () => {
    const { toast } = await import("sonner");
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} isFigmaInputOpen />);
    fireEvent.change(screen.getByPlaceholderText("Figma-länk (delningslänk)"), {
      target: { value: "https://example.com/logo.png" },
    });
    const textarea = screen.getByRole("textbox", { name: "Skriv en uppdatering" });
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Vad tycker du om den här loggan?" } });
    });
    // Skicka ser avstängd ut när utskicket är blockerat; Enter ger beskedet.
    expect(screen.getByRole("button", { name: "Skicka" }).hasAttribute("disabled")).toBe(true);
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.stringContaining("Ta bort Figma-länken"));
    const hint = screen.getByTestId("composer-route-hint");
    expect(hint.getAttribute("data-route-tone")).toBe("blocked");
    expect(hint.textContent).toContain("Figma-länk");
  });

  it("bygger en artig begäran med bilaga och säger det före klicket", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} isFigmaInputOpen />);
    fireEvent.change(screen.getByPlaceholderText("Figma-länk (delningslänk)"), {
      target: { value: "https://example.com/logo.png" },
    });
    const text = "Kan du lägga in den här loggan i sidhuvudet?";
    fireEvent.change(screen.getByRole("textbox", { name: "Skriv en uppdatering" }), {
      target: { value: text },
    });
    expect(screen.getByTestId("composer-route-hint").textContent).toContain(
      "Ändring – skapar en ny version",
    );
    await typeAndSend(text);
    expect(agent.send).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("håller inputen öppen under ett bygge för frågor, men spärrar byggvägen", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} isBusy />);
    expect(screen.getByRole("menuitemradio", { name: "Bygg" }).hasAttribute("aria-disabled")).toBe(true);

    await typeAndSend("Byt rubriken till Välkommen");
    expect(onSendMessage).not.toHaveBeenCalled();

    await typeAndSend("Hur lång tid tar bygget?");
    expect(agent.send).toHaveBeenCalledWith("Hur lång tid tar bygget?", expect.objectContaining({ allowBuild: false }));
  });

  // Ändrat 2026-11-11 (UX-06): förut gick även en fråga till byggmotorn när
  // Sajtagenten saknades, och kostade en generation. Nu blockeras frågan och
  // Bygg-läget finns kvar som uttryckligt val.
  it("utan Sajtagent: ändringar byggs, en fråga blockeras, Bygg skickar uttryckligen", async () => {
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage} />);
    expect(screen.getByRole("menuitemradio", { name: "Fråga" }).hasAttribute("aria-disabled")).toBe(true);
    await typeAndSend("Vad tycker du om startsidan?");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId("composer-route-hint").textContent).toContain("Sajtagenten finns inte här");

    await typeAndSend("Byt rubriken till Välkommen");
    expect(onSendMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bygg" }));
    await typeAndSend("Vad tycker du om startsidan?");
    expect(onSendMessage).toHaveBeenCalledTimes(2);
  });

  it("utan Sajtagent och utan chatt: första bygget går som förut", async () => {
    const onCreateChat = vi.fn(async () => true);
    render(<ComposerUnderTest chatId={null} onCreateChat={onCreateChat} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    const textarea = screen.getByRole("textbox", { name: "Beskriv vad du vill bygga" });
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Kan du göra en sida för mitt kafé?" } });
    });
    expect(screen.getByTestId("composer-route-hint").textContent).toContain("Första bygget");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
    });
    expect(onCreateChat).toHaveBeenCalledTimes(1);
  });

  it.each(["plan", "question"])("behåller ett svar på en väntande %s hos byggmotorn", async (kind) => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={onSendMessage}
      continuePlanMode={kind === "plan"} builderAwaitingReply={kind === "question"} />);
    await typeAndSend("Blått, fungerar det?");
    expect(agent.send).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith("Blått, fungerar det?", expect.objectContaining({
      planMode: kind === "plan" ? true : undefined,
    }));
  });
});

describe("ChatInterface — kvitto när ett utskick gått iväg (byggkuben)", () => {
  it("says so once per sent turn, to Sajtagenten and to the build engine", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onTurnSent = vi.fn();
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} onTurnSent={onTurnSent} />);

    await typeAndSend("Vad tycker du om startsidan?");
    expect(agent.send).toHaveBeenCalledTimes(1);
    expect(onTurnSent).toHaveBeenCalledTimes(1);

    await typeAndSend("Byt rubriken till Välkommen");
    expect(build).toHaveBeenCalledTimes(1);
    expect(onTurnSent).toHaveBeenCalledTimes(2);
  });

  it("says so again when the build engine refused the turn and the draft stays", async () => {
    sajtagent.value = makeAgent();
    const onTurnSent = vi.fn();
    const onTurnKept = vi.fn();
    const build = vi.fn(async () => ({
      status: "rejected" as const,
      reason: "stale_base_version" as const,
      turnRecorded: false,
    }));
    render(
      <ComposerUnderTest chatId="chat_1" onSendMessage={build} onTurnSent={onTurnSent} onTurnKept={onTurnKept} />,
    );

    await typeAndSend("Byt rubriken till Välkommen");
    expect(build).toHaveBeenCalledTimes(1);
    expect(onTurnSent).toHaveBeenCalledTimes(1);
    expect(onTurnKept).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value).toBe(
      "Byt rubriken till Välkommen",
    );
  });

  it("says nothing when the turn never left the composer", async () => {
    const agent = makeAgent({ isStreaming: true });
    sajtagent.value = agent;
    const onTurnSent = vi.fn();
    const build = vi.fn();
    render(<ComposerUnderTest chatId="chat_1" onSendMessage={build} onTurnSent={onTurnSent} isBusy />);

    // Sajtagenten is still answering, and a build is running.
    await typeAndSend("Vad tycker du om startsidan?");
    await typeAndSend("Byt rubriken till Välkommen");
    expect(agent.send).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(onTurnSent).not.toHaveBeenCalled();
  });
});
