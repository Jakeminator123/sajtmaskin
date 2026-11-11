/**
 * En input, två mottagare: komposern skickar frågor till Sajtagenten och
 * byggordrar till byggmotorn (`composer-route.ts`). Samma mock-harness som
 * ChatInterface.draft-retention.test.tsx.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageOptions } from "@/lib/hooks/chat/types";
import type { SajtagentContextValue } from "./sajtagent/SajtagentProvider";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

vi.mock("@/components/forms/voice-recorder", () => ({ VoiceRecorder: () => null }));

vi.mock("@/components/media/file-upload-zone", () => ({
  FileUploadZone: () => null,
  filesToAttachments: () => [],
  filesToPromptText: () => "",
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
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import type { OpenClawSendOptions } from "@/components/openclaw/useOpenClawChat";

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
  useOpenClawStore.setState({ messages: [], preparedFill: null, armedMandate: null, armedContinuation: null });
  delete window.__SITEMASKIN_CONTEXT;
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
  vi.clearAllMocks();
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

describe("ChatInterface — Sajtagenten i samma input", () => {
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    if (mode === "build") fireEvent.click(screen.getByRole("radio", { name: "Bygg" }));
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Vad tycker du? Ändra ingenting.");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value)
      .toBe("Vad tycker du? Ändra ingenting.");
  });

  it("keeps real build orders working when the configured agent is down", async () => {
    sajtagent.value = makeAgent({ available: false, configured: true });
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Byt rubriken till Välkommen");
    expect(build).toHaveBeenCalledWith("Byt rubriken till Välkommen", expect.anything());
  });

  it("a prepared field marker cannot turn a question into a build", async () => {
    const question = "Vad tycker du om startsidan?";
    useOpenClawStore.setState({ preparedFill: { target: "builder.chat.primary", value: question } });
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await typeAndSend(question);
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).toHaveBeenCalledWith(question, expect.objectContaining({ allowBuild: false }));
  });

  it("does not clear an agent draft until positive dispatch acceptance", async () => {
    let accepted: (() => void) | undefined;
    const agent = makeAgent({ send: vi.fn(async (_text, options) => { accepted = options?.onDispatchAccepted; }) });
    sajtagent.value = agent;
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    await typeAndSend("Vad tycker du om startsidan?");
    const input = screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement;
    expect(input.value).toBe("Vad tycker du om startsidan?");
    act(() => accepted?.());
    expect(input.value).toBe("");
  });

  it("does not erase a new draft when an earlier agent dispatch is accepted", async () => {
    let accepted: (() => void) | undefined;
    sajtagent.value = makeAgent({ send: vi.fn(async (_text, options) => { accepted = options?.onDispatchAccepted; }) });
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Gör punkt två");
    expect(build).not.toHaveBeenCalled();
    const options = vi.mocked(agent.send).mock.calls[0]?.[1] as OpenClawSendOptions;
    expect(options.allowBuild).toBe(false);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Fråga" }));
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

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    await typeAndSend("Vad tycker du om startsidan?");

    expect(agent.send).toHaveBeenCalledWith("Vad tycker du om startsidan?", expect.objectContaining({ allowBuild: false }));
    expect(onSendMessage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        (screen.getByRole("textbox", { name: "Skriv en uppdatering" }) as HTMLTextAreaElement).value,
      ).toBe(""),
    );
  });

  it("skickar en byggorder till byggmotorn", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const onSendMessage = vi.fn(async (_m: string, _o?: MessageOptions) => ({
      status: "started" as const,
      via: "stream" as const,
    }));

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
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

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    fireEvent.click(screen.getByRole("radio", { name: "Fråga" }));
    await typeAndSend("Byt rubriken till Välkommen");

    expect(agent.send).toHaveBeenCalledWith("Byt rubriken till Välkommen", expect.objectContaining({ allowBuild: false, restrictBuild: true }));
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("visar att agenten svarar och en stoppknapp medan agenten svarar", async () => {
    const agent = makeAgent({ isStreaming: true });
    sajtagent.value = agent;

    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
    expect(screen.getByTestId("composer-agent-streaming").textContent).toContain("Sajtagenten svarar");
    fireEvent.click(screen.getByRole("button", { name: "Stoppa Sajtagenten" }));
    expect(agent.stop).toHaveBeenCalledTimes(1);
  });

  it("visar alltid vad Skicka gör, från samma beslut som utskicket", async () => {
    sajtagent.value = makeAgent();
    render(<ChatInterface chatId="chat_1" onSendMessage={vi.fn()} />);
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
    const { rerender } = render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    fireEvent.click(screen.getByRole("radio", { name: "Bygg" }));
    expect(screen.getByRole("radio", { name: "Bygg" }).getAttribute("aria-checked")).toBe("true");

    rerender(<ChatInterface chatId="chat_2" onSendMessage={build} />);
    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true");
    await typeAndSend("Vad tycker du om startsidan?");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).toHaveBeenCalledWith("Vad tycker du om startsidan?", expect.anything());

    // Tillbaka i första chatten gäller dess eget val.
    rerender(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Bygg" }).getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("ignorerar ett gammalt globalt Bygg-läge från före 2026-11-11", async () => {
    sessionStorage.setItem("sajtmaskin:composerMode", "build");
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ChatInterface chatId="chat_1" onSendMessage={build} />);
    await typeAndSend("Vad tycker du om startsidan?");
    expect(build).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("sajtmaskin:composerMode")).toBeNull();
  });

  it("blockerar en fråga med bilaga i stället för att bygga, och säger vad man kan göra", async () => {
    const { toast } = await import("sonner");
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn();
    render(<ChatInterface chatId="chat_1" onSendMessage={build} isFigmaInputOpen />);
    fireEvent.change(screen.getByPlaceholderText("Figma-länk (delningslänk)"), {
      target: { value: "https://example.com/logo.png" },
    });
    await typeAndSend("Vad tycker du om den här loggan?");
    expect(build).not.toHaveBeenCalled();
    expect(agent.send).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.stringContaining("Ta bort bilagan"));
    expect(screen.getByTestId("composer-route-hint").getAttribute("data-route-tone")).toBe("blocked");
  });

  it("bygger en artig begäran med bilaga och säger det före klicket", async () => {
    const agent = makeAgent();
    sajtagent.value = agent;
    const build = vi.fn(async () => ({ status: "started" as const, via: "stream" as const }));
    render(<ChatInterface chatId="chat_1" onSendMessage={build} isFigmaInputOpen />);
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

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} isBusy />);
    expect(screen.getByRole("radio", { name: "Bygg" }).hasAttribute("disabled")).toBe(true);

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

    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage} />);
    expect(screen.getByRole("radio", { name: "Fråga" }).hasAttribute("disabled")).toBe(true);
    await typeAndSend("Vad tycker du om startsidan?");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId("composer-route-hint").textContent).toContain("Sajtagenten finns inte här");

    await typeAndSend("Byt rubriken till Välkommen");
    expect(onSendMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("radio", { name: "Bygg" }));
    await typeAndSend("Vad tycker du om startsidan?");
    expect(onSendMessage).toHaveBeenCalledTimes(2);
  });

  it("utan Sajtagent och utan chatt: första bygget går som förut", async () => {
    const onCreateChat = vi.fn(async () => true);
    render(<ChatInterface chatId={null} onCreateChat={onCreateChat} />);
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
    render(<ChatInterface chatId="chat_1" onSendMessage={onSendMessage}
      continuePlanMode={kind === "plan"} builderAwaitingReply={kind === "question"} />);
    await typeAndSend("Blått, fungerar det?");
    expect(agent.send).not.toHaveBeenCalled();
    expect(onSendMessage).toHaveBeenCalledWith("Blått, fungerar det?", expect.objectContaining({
      planMode: kind === "plan" ? true : undefined,
    }));
  });
});
