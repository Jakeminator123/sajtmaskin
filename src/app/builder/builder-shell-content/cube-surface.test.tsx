import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Relocatable, useRelocationSlot } from "@/components/builder/cube/relocation";
import type { CubeFaceId } from "@/components/builder/cube/cube-model";
import { CUBE_LAYOUT_STORAGE_KEY, defaultCubeLayout } from "@/components/builder/cube/cube-layout-storage";
import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import type { BuilderViewModel } from "../useBuilderPageController";

const agentState = vi.hoisted(() => ({
  value: null as null | { available: boolean; configured?: boolean; messages: unknown[] },
}));
vi.mock("@/components/builder/chat/sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => agentState.value,
}));
vi.mock("@/components/builder/chat/sajtagent/SajtagentAvatar", () => ({
  SajtagentAvatar: ({ variant }: { variant?: string }) => (
    <div data-testid="avatar" data-variant={variant} />
  ),
}));
vi.mock("@/components/builder/cube/faces/CubeBuildLogFace", () => ({
  CubeBuildLogFace: ({ messages, isStreaming }: { messages: unknown[]; isStreaming: boolean }) => (
    <div data-testid="buildlog" data-messages={messages.length} data-streaming={String(isStreaming)} />
  ),
}));
vi.mock("@/components/builder/cube/faces/CubeToolsFace", () => ({
  CubeToolsFace: (props: { locked: boolean; agentConfigured: boolean; selectedModelTier: string }) => (
    <div
      data-testid="tools"
      data-locked={String(props.locked)}
      data-agent={String(props.agentConfigured)}
      data-tier={props.selectedModelTier}
    />
  ),
}));
vi.mock("@/components/builder/cube/faces/CubeSitemapFace", () => ({
  CubeSitemapFace: (props: { chatId: string | null; versionId: string | null; visible: boolean }) => (
    <div
      data-testid="sitemap"
      data-chat={props.chatId}
      data-version={props.versionId}
      data-visible={String(props.visible)}
    />
  ),
}));

import { BuilderCubeSurface, focusAfterLayoutSwitch } from "./cube-surface";

function message(id: string, role: "user" | "assistant" = "assistant"): ChatMessage {
  return { id, role, content: `Meddelande ${id}` } as ChatMessage;
}

function agentMessage(id: string, extra: Partial<OpenClawMessage> = {}): OpenClawMessage {
  return { id, role: "assistant", content: `Svar ${id}`, timestamp: 1, kind: "chat", ...extra };
}

function makeVm(overrides: Partial<BuilderViewModel> = {}): BuilderViewModel {
  return {
    chatId: "chat_1",
    activeVersionId: "v1",
    messages: [message("u1", "user"), message("a1")],
    isAnyStreaming: false,
    selectedModelTier: "pro",
    setSelectedModelTier: vi.fn(),
    tipsEnabled: true,
    setTipsEnabled: vi.fn(),
    enableThinking: false,
    setEnableThinking: vi.fn(),
    enableImageGenerations: true,
    setEnableImageGenerations: vi.fn(),
    isImageGenerationsSupported: true,
    currentPreviewUrl: null,
    previewRefreshToken: 0,
    setCurrentPreviewUrl: vi.fn(),
    ...overrides,
  } as unknown as BuilderViewModel;
}

interface HarnessProps {
  vm?: BuilderViewModel;
  locked?: boolean;
  statusText?: string | null;
  noticesPending?: boolean;
  composerTurns?: number;
  composerTurnsKept?: number;
  onExit?: () => void;
}

/** The shell's part: the content lives in the panel and the cube shows it through outlets. */
function Harness({
  vm = makeVm(),
  locked = false,
  statusText = null,
  noticesPending = false,
  composerTurns = 0,
  composerTurnsKept = 0,
  onExit = () => {},
}: HarnessProps) {
  const composer = useRelocationSlot();
  const timeline = useRelocationSlot();
  const notices = useRelocationSlot();
  return (
    <>
      <div data-testid="panel">
        <Relocatable slot={notices}>
          <div data-testid="f3-notices" />
        </Relocatable>
        <Relocatable slot={timeline}>
          <div data-testid="timeline" />
        </Relocatable>
        <Relocatable slot={composer}>
          <textarea aria-label="Skriv en uppdatering" />
        </Relocatable>
      </div>
      <BuilderCubeSurface
        vm={vm}
        slots={{ composer, timeline, notices }}
        locked={locked}
        statusText={statusText}
        noticesPending={noticesPending}
        composerTurns={composerTurns}
        composerTurnsKept={composerTurnsKept}
        onExit={onExit}
      />
    </>
  );
}

const face = (id: CubeFaceId) => document.querySelector(`[data-cube-face="${id}"]`) as HTMLElement;
const tab = (name: RegExp | string) => screen.getByRole("tab", { name });
const selected = (name: RegExp | string) => tab(name).getAttribute("aria-selected") === "true";

beforeEach(() => {
  window.localStorage.clear();
  agentState.value = null;
  // Reduced motion: the cube lands on a face at once instead of turning over
  // several animation frames, so a face is interactive as soon as it is chosen.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BuilderCubeSurface", () => {
  it("puts the chat panel's parts on six faces, shown through outlets", () => {
    agentState.value = { available: true, configured: true, messages: [] };
    render(<Harness vm={makeVm({ isAnyStreaming: true })} locked />);

    expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual([
      "Chatt",
      "Svar",
      "Bygglogg",
      "Verktyg",
      "Avatar",
      "Sajtkarta",
    ]);
    // A build is running, so the cube opens where it shows.
    expect(selected(/^Svar/)).toBe(true);

    // The shell's own instances, not copies: they have left the panel.
    expect(face("chat").contains(screen.getByLabelText("Skriv en uppdatering"))).toBe(true);
    expect(face("answers").contains(screen.getByTestId("timeline"))).toBe(true);
    expect(face("buildlog").contains(screen.getByTestId("f3-notices"))).toBe(true);
    expect(screen.getByTestId("panel").querySelector("textarea")).toBeNull();

    expect(within(face("buildlog")).getByTestId("buildlog").dataset).toMatchObject({
      messages: "2",
      streaming: "true",
    });
    expect(within(face("tools")).getByTestId("tools").dataset).toMatchObject({
      locked: "true",
      agent: "true",
      tier: "pro",
    });
    expect(within(face("avatar")).getByTestId("avatar").dataset.variant).toBe("stage");
    expect(within(face("sitemap")).getByTestId("sitemap").dataset).toMatchObject({
      chat: "chat_1",
      version: "v1",
      visible: "false",
    });

    // The site map reads its pages only while it is in front.
    fireEvent.click(tab("Sajtkarta"));
    expect(screen.getByTestId("sitemap").dataset.visible).toBe("true");
    fireEvent.click(tab("Chatt"));
    expect(screen.getByTestId("sitemap").dataset.visible).toBe("false");
  });

  it("turns to the answers when the user sends from the composer", () => {
    const { rerender } = render(<Harness />);
    expect(selected("Chatt")).toBe(true);

    const sent = makeVm({ messages: [message("u1", "user"), message("a1"), message("u2", "user")] });
    rerender(<Harness vm={sent} composerTurns={1} />);
    expect(selected(/^Svar/)).toBe(true);
    // Nothing is unread: the answers are in front.
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar");
  });

  it("turns back to the composer when the send was refused and the draft kept", () => {
    const { rerender } = render(<Harness />);
    rerender(<Harness composerTurns={1} />);
    expect(selected(/^Svar/)).toBe(true);

    // A stale base version: the server refused the turn before writing it down.
    rerender(<Harness composerTurns={1} composerTurnsKept={1} />);
    expect(selected("Chatt")).toBe(true);

    // A refusal that comes after the user went elsewhere moves nothing.
    fireEvent.click(tab("Verktyg"));
    rerender(<Harness composerTurns={2} composerTurnsKept={2} />);
    expect(selected("Verktyg")).toBe(true);
  });

  it("does not turn when Sajtagenten sends to the build engine itself", () => {
    const { rerender } = render(<Harness />);
    const composer = screen.getByLabelText("Skriv en uppdatering");
    composer.focus();

    // An armed follow-up: the agent's next step reaches the build engine as a
    // user turn through the bridge, while the user is typing the next message.
    rerender(<Harness vm={makeVm({ messages: [message("u1", "user"), message("a1"), message("u2", "user")] })} />);
    expect(selected("Chatt")).toBe(true);
    expect(document.activeElement).toBe(composer);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar, 1 nya");
  });

  it("counts answers that arrive behind another face and clears the count once they are shown", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(tab("Verktyg"));

    rerender(
      <Harness
        vm={makeVm({
          messages: [message("u1", "user"), message("a1"), message("u2", "user"), message("a2")],
        })}
      />,
    );
    expect(selected("Verktyg")).toBe(true);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar, 2 nya");

    fireEvent.click(tab(/^Svar/));
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar");
  });

  it("treats loaded history as history: no turn and nothing unread", () => {
    agentState.value = { available: true, messages: [] };
    const { rerender } = render(<Harness vm={makeVm({ messages: [] })} />);

    // The chat's own history arrives after the cube is mounted.
    rerender(<Harness vm={makeVm()} />);
    expect(selected("Chatt")).toBe(true);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar");

    // So does the agent's stored history, and its internal rows are never counted.
    agentState.value = {
      available: true,
      messages: [
        agentMessage("h1", { hydrated: true }),
        agentMessage("h2", { hydrated: true }),
        agentMessage("i1", { kind: "internal" }),
      ],
    };
    rerender(<Harness vm={makeVm()} />);
    expect(selected("Chatt")).toBe(true);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar");

    // A live reply from the agent is a new answer.
    agentState.value = {
      available: true,
      messages: [agentMessage("h1", { hydrated: true }), agentMessage("r1")],
    };
    rerender(<Harness vm={makeVm()} />);
    expect(selected("Chatt")).toBe(true);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar, 1 nya");
  });

  it("leaves the composer in front when an answer arrives while the user writes", () => {
    const { rerender } = render(<Harness />);
    const composer = screen.getByLabelText("Skriv en uppdatering");
    composer.focus();

    // The agent's comment after a build, or a reply that took its time.
    rerender(<Harness vm={makeVm({ messages: [message("u1", "user"), message("a1"), message("a2")] })} />);
    expect(selected("Chatt")).toBe(true);
    expect(document.activeElement).toBe(composer);
    expect(tab(/^Svar/).getAttribute("aria-label")).toBe("Svar, 1 nya");
  });

  it("opens on the answers when a build is already running", () => {
    render(<Harness vm={makeVm({ isAnyStreaming: true })} />);
    expect(selected(/^Svar/)).toBe(true);
  });

  it("leads back to the composer from the answers", () => {
    render(<Harness />);
    fireEvent.click(tab(/^Svar/));
    fireEvent.click(screen.getByRole("button", { name: "Skriv ett nytt meddelande" }));
    expect(selected("Chatt")).toBe(true);
  });

  it("keeps a blocking status where the user writes and leads to the build log", () => {
    const { rerender } = render(<Harness />);
    expect(screen.queryByTestId("cube-composer-status")).toBeNull();
    expect(tab(/^Bygglogg/).getAttribute("aria-label")).toBe("Bygglogg");

    rerender(<Harness statusText="Versionen misslyckades" />);
    const status = screen.getByTestId("cube-composer-status");
    expect(face("chat").contains(status)).toBe(true);
    expect(status.textContent).toContain("Versionen misslyckades");
    expect(tab(/^Bygglogg/).getAttribute("aria-label")).toBe("Bygglogg, nytt");

    fireEvent.click(within(status).getByRole("button", { name: "Visa bygglogg" }));
    expect(selected(/^Bygglogg/)).toBe(true);
  });

  it("says that a build runs, and marks the build log while F3 waits for the user", () => {
    const { rerender } = render(<Harness vm={makeVm({ isAnyStreaming: true })} statusText="Bygger versionen" />);
    expect(screen.getByTestId("cube-composer-status").textContent).toContain("Bygger …");

    rerender(<Harness noticesPending />);
    expect(screen.queryByTestId("cube-composer-status")).toBeNull();
    expect(tab(/^Bygglogg/).getAttribute("aria-label")).toBe("Bygglogg, nytt");
  });

  it("does not turn anything as cards, where composer and answers are both in view", () => {
    const { rerender } = render(<Harness statusText="Versionen misslyckades" />);
    fireEvent.click(screen.getByRole("button", { name: "Fäll ut till kort" }));
    expect(screen.queryByRole("button", { name: "Skriv ett nytt meddelande" })).toBeNull();

    const bar = screen.getByRole("toolbar", { name: "Kort" });
    const barButton = (id: CubeFaceId) =>
      bar.querySelector(`[aria-controls="${face(id).id}"]`) as HTMLButtonElement;

    rerender(
      <Harness
        statusText="Versionen misslyckades"
        vm={makeVm({ messages: [message("u1", "user"), message("a1"), message("u2", "user")] })}
      />,
    );
    // The answers card is open, so the new message is already seen.
    expect(barButton("answers").getAttribute("aria-label")).toBe("Svar");

    // A folded card collects what arrives while it is away …
    fireEvent.click(screen.getByRole("button", { name: "Fäll ned Svar till fältet" }));
    rerender(
      <Harness
        statusText="Versionen misslyckades"
        vm={makeVm({
          messages: [message("u1", "user"), message("a1"), message("u2", "user"), message("a2")],
        })}
      />,
    );
    expect(barButton("answers").getAttribute("aria-label")).toBe("Svar, 1 nya");

    // … and «Visa bygglogg» opens a folded build log on top.
    fireEvent.click(screen.getByRole("button", { name: "Fäll ned Bygglogg till fältet" }));
    expect(barButton("buildlog").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Visa bygglogg" }));
    expect(barButton("buildlog").getAttribute("aria-expanded")).toBe("true");
    const z = (id: CubeFaceId) => Number(face(id).style.zIndex);
    expect(Math.max(...(["chat", "answers", "tools", "avatar", "sitemap"] as const).map(z))).toBeLessThan(
      z("buildlog"),
    );
  });

  it("moves focus to the composer after a switch, or to the chosen tab when it cannot take it", () => {
    render(<Harness />);
    const composer = screen.getByLabelText("Skriv en uppdatering") as HTMLTextAreaElement;
    composer.setAttribute("data-openclaw-text-target", "builder.chat.primary");

    focusAfterLayoutSwitch(document.body);
    expect(document.activeElement).toBe(composer);

    // A send in progress disables the composer: the chosen tab takes focus instead.
    composer.blur();
    composer.disabled = true;
    focusAfterLayoutSwitch(document.body);
    expect(document.activeElement).toBe(tab("Chatt"));
  });

  it("hands back to the chat panel", () => {
    const onExit = vi.fn();
    render(<Harness onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Öppna chatten som sidopanel" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("returns a moved cube to the left while keeping the selected view", () => {
    localStorage.setItem("sajtmaskin:builder-cube:v1", JSON.stringify({
      mode: "cube",
      cube: { x: 600, y: 120, width: 400, height: 400 },
      cards: {},
      folded: [],
      order: [],
    }));
    render(<Harness />);
    fireEvent.click(tab("Verktyg"));
    fireEvent.click(screen.getByRole("button", { name: "Samla till vänster" }));
    expect(selected("Verktyg")).toBe(true);
    expect(document.activeElement).toBe(tab("Verktyg"));
    expect((document.querySelector("[data-cube-chrome]") as HTMLElement).style.left).toBe("24px");
  });

  it("collects the six views to the left without replacing the draft or timeline", () => {
    localStorage.setItem(CUBE_LAYOUT_STORAGE_KEY, JSON.stringify({
      ...defaultCubeLayout(),
      mode: "cards",
      cube: { x: 600, y: 150, width: 450, height: 500 },
      cards: { chat: { x: 500, y: 200, width: 320, height: 350 } },
      folded: ["chat", "sitemap"],
    }));
    render(<Harness />);
    const composer = screen.getByLabelText("Skriv en uppdatering") as HTMLTextAreaElement;
    const timeline = screen.getByTestId("timeline");
    fireEvent.change(composer, { target: { value: "Mitt pågående utkast" } });

    const collect = screen.getByRole("button", { name: "Samla till vänster" });
    collect.focus();
    fireEvent.click(collect);

    expect(document.querySelector('[data-cube-mode="cube"]')).toBeTruthy();
    expect((document.querySelector("[data-cube-chrome]") as HTMLElement).style.left).toBe("24px");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(document.activeElement).toBe(tab("Chatt"));
    expect(screen.getByLabelText("Skriv en uppdatering")).toBe(composer);
    expect(composer.value).toBe("Mitt pågående utkast");
    fireEvent.click(tab("Svar"));
    expect(face("answers").contains(timeline)).toBe(true);
    fireEvent.click(tab("Sajtkarta"));
    expect(screen.getByTestId("sitemap").dataset.visible).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Fäll ut till kort" }));
    const bar = screen.getByRole("toolbar", { name: "Kort" });
    const chatButton = bar.querySelector(`[aria-controls="${face("chat").id}"]`);
    expect(chatButton?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Skriv en uppdatering")).toBe(composer);
  });
});
