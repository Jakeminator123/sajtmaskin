/**
 * Byggkommandon via builder-bryggan (plan 2026-10-22 «En chatt», E4):
 * direktbygg (`start_build`) och den armerade auto-sändningen går genom
 * `registerBuilderBridge` i stället för DOM-ifyllning, och varken hydrerade
 * rader eller svar på interna turer får starta något.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import {
  registerBuilderBridge,
  resetBuilderBridgeForTests,
  type BuilderBridge,
} from "@/lib/openclaw/builder-bridge";
import {
  revokeOpenClawBuildConsent,
  useOpenClawStore,
  type OpenClawMessage as Msg,
} from "@/lib/openclaw/openclaw-store";
import {
  applyOpenClawTextFieldAction,
  isOpenClawSendReady,
  triggerOpenClawSend,
} from "@/lib/openclaw/text-field-actions";
import {
  OpenClawMessage,
  resetOpenClawActionLedgersForTests,
  resolveStartBuildAutoRun,
} from "./OpenClawMessage";

vi.mock("@/lib/openclaw/text-field-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openclaw/text-field-actions")>();
  return {
    ...actual,
    applyOpenClawTextFieldAction: vi.fn(),
    isOpenClawSendReady: vi.fn(),
    triggerOpenClawSend: vi.fn(),
  };
});

const domFillMock = vi.mocked(applyOpenClawTextFieldAction);
const domReadyMock = vi.mocked(isOpenClawSendReady);
const domSendMock = vi.mocked(triggerOpenClawSend);

function makeBridge(overrides: Partial<BuilderBridge> = {}): BuilderBridge {
  return {
    getChatId: () => "chat_1",
    getActiveVersionId: () => "version_1",
    canSend: () => true,
    sendMessage: vi.fn(async () => ({ status: "started", via: "stream" }) as const),
    cancelGeneration: vi.fn(),
    ...overrides,
  };
}

function userTurn(
  id: string,
  content: string,
  kind: "chat" | "internal" = "chat",
  extra: Partial<Msg> = {},
): Msg {
  const message: Msg = {
    id,
    role: "user",
    content,
    timestamp: Date.now() - 500,
    kind,
    allowBuild: kind === "chat",
    ...extra,
  };
  if (message.allowBuild === undefined) delete message.allowBuild;
  return message;
}

function startBuildReply(id: string, extra: Partial<Msg> = {}): Msg {
  return {
    id,
    role: "assistant",
    timestamp: Date.now() + 1,
    content: [
      "Jag startar bygget.",
      "<openclaw-action>",
      JSON.stringify({
        type: "start_build",
        label: "Tydligare hero",
        prompt:
          "Gör om hero-sektionen.\n\nMål:\n- Tydligare CTA\n\nSektioner:\n- Hero\n- Bevis\n\nDesign:\n- Behåll tema",
      }),
      "</openclaw-action>",
    ].join("\n"),
    ...extra,
  };
}

function armedFillReply(id: string, extra: Partial<Msg> = {}): Msg {
  return {
    id,
    role: "assistant",
    timestamp: Date.now() + 1,
    content: [
      "Nästa follow-up.",
      "<openclaw-action>",
      JSON.stringify({
        type: "fill_text_field",
        target: "builder.chat.primary",
        value: "Gör hero-rubriken tydligare",
        submit: true,
      }),
      "</openclaw-action>",
    ].join("\n"),
    ...extra,
  };
}

function grantPowers() {
  act(() => {
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy", "quick_edit"],
    });
  });
}

beforeEach(() => {
  resetBuilderBridgeForTests();
  resetOpenClawActionLedgersForTests();
  domFillMock.mockReturnValue({
    ok: true,
    field: {
      target: "builder.chat.primary",
      label: "Builder-chatten",
      kind: "textarea",
      placeholder: "",
      value: "",
      canWrite: true,
      multiline: true,
    },
  });
  domReadyMock.mockReturnValue(true);
  domSendMock.mockReturnValue({ ok: true });
  act(() => {
    useOpenClawStore.setState({ messages: [], armedMandate: null, armedContinuation: null });
  });
});

afterEach(() => {
  act(() => {
    useOpenClawStore.setState({
      messages: [],
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
      armedContinuation: null,
      preparedFill: null,
    });
  });
  resetBuilderBridgeForTests();
  vi.clearAllMocks();
});

describe("resolveStartBuildAutoRun", () => {
  it("tillåter bara svar på en uttrycklig byggorder (eller dess filtur)", () => {
    const messages: Msg[] = [
      userTurn("u1", "Gör hero tydligare"),
      { id: "a1", role: "assistant", content: "läser", timestamp: 1 },
      userTurn("f1", "[Filinnehåll] --- app/page.tsx ---", "internal"),
      { id: "a2", role: "assistant", content: "svar", timestamp: 2 },
      userTurn("d1", "[Byggresultat] Builderturen är klar.", "internal"),
      { id: "a3", role: "assistant", content: "digest", timestamp: 3 },
    ];
    expect(resolveStartBuildAutoRun(messages, "a1")).toEqual({ allowed: true, userTurnId: "u1" });
    expect(resolveStartBuildAutoRun(messages, "a2")).toEqual({ allowed: true, userTurnId: "u1" });
    expect(resolveStartBuildAutoRun(messages, "a3")).toEqual({ allowed: false, userTurnId: "d1" });
    expect(resolveStartBuildAutoRun(messages, "nope")).toEqual({
      allowed: false,
      userTurnId: null,
    });
  });

  it.each([
    { name: "nekat byggmandat", content: "Byt rubriken till Välkommen", extra: { allowBuild: false } },
    { name: "saknad metadata", content: "Byt rubriken till Välkommen", extra: { allowBuild: undefined } },
    { name: "Fråga-läge för byggtext", content: "Byt rubriken till Välkommen", extra: { allowBuild: false } },
    { name: "fråga med förfalskat mandat", content: "Vad tycker du om startsidan?", extra: { allowBuild: true } },
    { name: "no-change med förfalskat mandat", content: "Ändra inget", extra: { allowBuild: true } },
    { name: "hydrerad byggorder", content: "Byt rubriken till Välkommen", extra: { allowBuild: true, hydrated: true } },
  ])("nekar $name även efter read_files", ({ content, extra }) => {
    const user = userTurn("u-denied", content, "chat", extra);
    const reply = startBuildReply("a-denied");
    const fileReply = startBuildReply("a-files-denied");
    const messages = [
      userTurn("u-earlier", "Byt rubriken till Hej"),
      user,
      reply,
      userTurn("f-denied", "[Filinnehåll] --- app/page.tsx ---", "internal", { allowBuild: true }),
      fileReply,
    ];

    expect(resolveStartBuildAutoRun(messages, reply.id)).toEqual({ allowed: false, userTurnId: user.id });
    expect(resolveStartBuildAutoRun(messages, fileReply.id)).toEqual({ allowed: false, userTurnId: user.id });
  });

  it("låter inte ett internt byggresultat låna tidigare byggmandat", () => {
    const reply = startBuildReply("a-digest");
    const messages = [
      userTurn("u-build", "Byt rubriken till Välkommen"),
      userTurn("u-digest", "[Byggresultat] Builderturen är klar.", "internal", { allowBuild: true }),
      userTurn("f-digest", "[Filinnehåll] --- app/page.tsx ---", "internal"),
      reply,
    ];

    expect(resolveStartBuildAutoRun(messages, reply.id)).toEqual({ allowed: false, userTurnId: "u-digest" });
  });

  it("ger inte en ensam read_files-tur eget byggmandat", () => {
    const reply = startBuildReply("a-orphan-files");
    expect(resolveStartBuildAutoRun([
      userTurn("f-orphan", "[Filinnehåll] --- app/page.tsx ---", "internal", { allowBuild: true }),
      reply,
    ], reply.id)).toEqual({ allowed: false, userTurnId: null });
  });
});

describe("OpenClawMessage — direktbygg via bryggan", () => {
  it.each([null, "Ändra inget", "Vad tycker du om startsidan?"])(
    "återkontrollerar väntande autobygge när buildern blir ledig (ny tur: %s)",
    async (readOnlyText) => {
      grantPowers();
      let ready = false;
      const canSend = vi.fn(() => ready);
      const bridge = makeBridge({ canSend });
      registerBuilderBridge(bridge);
      const reply = startBuildReply("sb-pending-consent", {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });
      act(() => {
        useOpenClawStore.setState({ messages: [userTurn("u-pending", "Byt rubriken till Välkommen"), reply] });
      });
      const first = render(<OpenClawMessage msg={reply} />);
      await waitFor(() => expect(canSend).toHaveBeenCalled());
      expect(bridge.sendMessage).not.toHaveBeenCalled();

      if (readOnlyText !== null) {
        act(() => {
          revokeOpenClawBuildConsent();
          useOpenClawStore.setState((state) => ({
            messages: [...state.messages, userTurn("u-readonly", readOnlyText, "chat", { allowBuild: false })],
          }));
        });
      }
      ready = true;

      if (readOnlyText === null) {
        expect(await screen.findByText(/Bygget är startat/)).toBeTruthy();
        expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
      } else {
        expect(await screen.findByText(/Sändningen avbröts/)).toBeTruthy();
        expect(bridge.sendMessage).not.toHaveBeenCalled();
        expect(useOpenClawStore.getState().messages.find((message) => message.id === "u-pending")?.allowBuild).toBe(false);
      }

      first.unmount();
      render(<OpenClawMessage msg={reply} />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(bridge.sendMessage).toHaveBeenCalledTimes(readOnlyText === null ? 1 : 0);
      expect(domFillMock).not.toHaveBeenCalled();
      expect(domSendMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: "nekat byggmandat", content: "Byt rubriken till Välkommen", extra: { allowBuild: false } },
    { name: "saknad metadata", content: "Byt rubriken till Välkommen", extra: { allowBuild: undefined } },
    { name: "fråga trots metadata true", content: "Vad tycker du om startsidan?", extra: { allowBuild: true } },
    { name: "no-change trots metadata true", content: "Ändra inget", extra: { allowBuild: true } },
    { name: "hydrerad användartur", content: "Byt rubriken till Välkommen", extra: { allowBuild: true, hydrated: true } },
  ])("behåller $name som manuellt förslag som kan godkännas en gång", async ({ content, extra }) => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-manual-consent", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u-manual", content, "chat", extra), reply] });
    });

    const first = render(<OpenClawMessage msg={reply} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Starta bygget" }));
    expect(await screen.findByText(/Bygget är startat/)).toBeTruthy();
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
    expect(domFillMock).not.toHaveBeenCalled();
    expect(domSendMock).not.toHaveBeenCalled();

    first.unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("väntar tills svaret är färdigt även när hela action-blocket redan kommit", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("streamed-build", { delivery: "streaming" });
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u-stream", "Gör hero tydligare"), reply] });
    });
    const { rerender } = render(<OpenClawMessage msg={reply} streaming />);
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    rerender(<OpenClawMessage msg={{ ...reply, delivery: "complete" }} />);
    await waitFor(() => expect(bridge.sendMessage).toHaveBeenCalledTimes(1));
  });

  it("kör aldrig ett komplett byggförslag från ett avbrutet svar", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("interrupted-build", { delivery: "interrupted" });
    act(() => {
      useOpenClawStore.setState({
        messages: [userTurn("u-interrupted", "Gör hero tydligare"), reply],
      });
    });
    render(<OpenClawMessage msg={reply} />);
    expect(screen.getByRole("status").textContent).toContain("Förslaget har inte körts");
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Starta/ })).toBeNull();
  });

  it.each([false, true])("startar bygget exakt en gång utan DOM och överlever remount (read_files: %s)", async (withFiles) => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-1");
    act(() => {
      useOpenClawStore.setState({
        messages: [
          userTurn("u1", "Gör hero tydligare"),
          ...(withFiles ? [userTurn("f-build", "[Filinnehåll] --- app/page.tsx ---", "internal")] : []),
          reply,
        ],
      });
    });

    const { unmount } = render(<OpenClawMessage msg={reply} />);
    await waitFor(() => expect(bridge.sendMessage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bridge.sendMessage).mock.calls[0][0]).toContain("Gör om hero-sektionen.");
    expect(domFillMock).not.toHaveBeenCalled();
    expect(domSendMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Bygget är startat/)).toBeTruthy();

    unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("visar builderns avslag i stället för «startat»", async () => {
    grantPowers();
    const bridge = makeBridge({
      sendMessage: vi.fn(
        async () => ({ status: "rejected", reason: "credit_gate", turnRecorded: false }) as never,
      ),
    });
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-rejected");
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u1", "Gör hero tydligare"), reply] });
    });
    render(<OpenClawMessage msg={reply} />);
    expect(await screen.findByText(/Buildern tog inte emot bygget \(credit_gate\)/)).toBeTruthy();
  });

  it("visar ett kastat bridge-fel och kan återförsöka utan falskt startkvitto", async () => {
    grantPowers();
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("lokalt testfel"))
      .mockResolvedValueOnce({ status: "started", via: "stream" });
    const bridge = makeBridge({ sendMessage });
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-throw", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u-throw", "Gör hero tydligare"), reply] });
    });

    render(<OpenClawMessage msg={reply} />);
    expect(await screen.findByText(/Utskicket till buildern misslyckades/)).toBeTruthy();
    expect(screen.queryByText(/Bygget är startat/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Bygget är startat/)).toBeTruthy();
  });

  it("skickar inte ett manuellt byggförslag till en annan aktiv chatt", async () => {
    const bridge = makeBridge({ getChatId: () => "chat_b" });
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-wrong-chat", {
      builderTarget: { chatId: "chat_a", versionId: "version_1" },
    });
    act(() => {
      useOpenClawStore.setState({
        messages: [userTurn("digest", "[Byggresultat] klar", "internal"), reply],
      });
    });
    render(<OpenClawMessage msg={reply} />);

    fireEvent.click(screen.getByRole("button", { name: "Starta bygget" }));
    expect(await screen.findByText(/Builderchatten har bytts/)).toBeTruthy();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it("skickar inte fill_text_field-direktknappen till en annan chatt", async () => {
    const bridge = makeBridge({ getChatId: () => "chat_b" });
    registerBuilderBridge(bridge);
    const reply = {
      ...armedFillReply("fill-wrong-chat"),
      builderTarget: { chatId: "chat_a", versionId: "version_1" },
    };
    render(<OpenClawMessage msg={reply} />);

    fireEvent.click(screen.getByRole("button", { name: "Skicka till buildern" }));
    expect(await screen.findByText(/Builderchatten har bytts/)).toBeTruthy();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it("kör aldrig automatiskt på en hydrerad rad — den blir en kvittens utan knappar", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-old", { hydrated: true, timestamp: 1 });
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u1", "Gör hero tydligare"), reply] });
    });
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId("openclaw-historic-action").textContent).toContain(
      "Från tidigare session",
    );
    expect(screen.queryByRole("button", { name: "Starta bygget" })).toBeNull();
  });

  it("kör inte automatiskt när svaret besvarar en intern väckning — kortet blir ett förslag", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-digest");
    act(() => {
      useOpenClawStore.setState({
        messages: [userTurn("d1", "[Byggresultat] Builderturen är klar.", "internal"), reply],
      });
    });
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Starta bygget" })).toBeTruthy();
  });

  it("kör högst ett automatiskt bygge per användarfråga", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const first = startBuildReply("sb-first");
    const second = startBuildReply("sb-second", { timestamp: Date.now() + 2 });
    act(() => {
      useOpenClawStore.setState({
        messages: [userTurn("u-once", "Gör hero tydligare"), first, second],
      });
    });
    render(
      <>
        <OpenClawMessage msg={first} />
        <OpenClawMessage msg={second} />
      </>,
    );
    await waitFor(() => expect(bridge.sendMessage).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Starta bygget" })).toBeTruthy();
  });
});

describe("OpenClawMessage — armerad auto-send via bryggan", () => {
  function armFollowups() {
    grantPowers();
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: Date.now() - 1_000,
        },
      });
    });
  }

  it.each(["Ändra inget", "Vad tycker du om startsidan?"])(
    "avbryter väntande armerad sändning efter ny verklig tur: %s",
    async (readOnlyText) => {
      armFollowups();
      let ready = false;
      const canSend = vi.fn(() => ready);
      const bridge = makeBridge({ canSend });
      registerBuilderBridge(bridge);
      const reply = armedFillReply("armed-pending-readonly", {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });
      act(() => {
        useOpenClawStore.setState({ messages: [userTurn("u-active", "Byt rubriken till Välkommen"), reply] });
      });
      const first = render(<OpenClawMessage msg={reply} />);
      await waitFor(() => expect(canSend).toHaveBeenCalled());
      expect(bridge.sendMessage).not.toHaveBeenCalled();

      act(() => {
        revokeOpenClawBuildConsent();
        useOpenClawStore.setState((state) => ({
          messages: [...state.messages, userTurn("u-readonly", readOnlyText, "chat", { allowBuild: false })],
        }));
      });
      ready = true;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(screen.getByText("Fältförslag")).toBeTruthy();
      expect(bridge.sendMessage).not.toHaveBeenCalled();
      expect(useOpenClawStore.getState().armedMandate).toBeNull();
      expect(useOpenClawStore.getState().armedContinuation).toBeNull();

      first.unmount();
      render(<OpenClawMessage msg={reply} />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(bridge.sendMessage).not.toHaveBeenCalled();
      expect(domSendMock).not.toHaveBeenCalled();
    },
  );

  it.each(["started", "settled"] as const)(
    "behåller reservationen över remount före %s-kvittot",
    async (status) => {
      armFollowups();
      let resolveSend!: (outcome: SendMessageOutcome) => void;
      let busy = false;
      const sendMessage = vi.fn(() => {
        busy = true;
        return new Promise<SendMessageOutcome>((resolve) => {
          resolveSend = (outcome) => { busy = false; resolve(outcome); };
        });
      });
      registerBuilderBridge(makeBridge({ sendMessage, canSend: () => !busy }));
      const reply = armedFillReply(`armed-pending-${status}`, {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });
      const first = render(<OpenClawMessage msg={reply} />);
      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
      first.unmount();
      const second = render(<OpenClawMessage msg={reply} />);
      await act(async () => {
        resolveSend(status === "started"
          ? { status: "started", via: "stream" }
          : { status: "settled", as: "f3_deterministic_release" });
      });
      expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
      expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBe(status);
      second.unmount();
      render(<OpenClawMessage msg={reply} />);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      expect(sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  it("återanvänder avvisat pending-kvitto över remount och tillåter explicit retry", async () => {
    armFollowups();
    let resolveSend!: (outcome: SendMessageOutcome) => void;
    const sendMessage = vi.fn()
      .mockImplementationOnce(() => new Promise<SendMessageOutcome>((resolve) => { resolveSend = resolve; }))
      .mockResolvedValueOnce({ status: "started", via: "stream" });
    registerBuilderBridge(makeBridge({ sendMessage }));
    const reply = armedFillReply("armed-pending-rejected", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });
    const first = render(<OpenClawMessage msg={reply} />);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      resolveSend({ status: "rejected", reason: "generation_in_progress", turnRecorded: false });
    });
    expect(await screen.findByText(/Buildern tog inte emot bygget/)).toBeTruthy();
    second.unmount();
    render(<OpenClawMessage msg={reply} />);
    expect(await screen.findByText(/Buildern tog inte emot bygget/)).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
  });

  it.each(["grant", "scope", "mandate"] as const)(
    "släpper en väntande reservation när %s avbryts före dispatch",
    async (cancel) => {
      armFollowups();
      const original = useOpenClawStore.getState();
      let ready = false;
      const canSend = vi.fn(() => ready);
      const sendMessage = vi.fn(async () => ({ status: "started", via: "stream" }) as const);
      registerBuilderBridge(makeBridge({ sendMessage, canSend }));
      const reply = armedFillReply(`armed-cancel-wait-${cancel}`, {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });
      const first = render(<OpenClawMessage msg={reply} />);
      await waitFor(() => expect(canSend).toHaveBeenCalled());
      act(() => {
        useOpenClawStore.setState(cancel === "grant" ? { powersOn: false }
          : cancel === "scope" ? { scopeKey: "cancelled-scope" } : { armedMandate: null });
      });
      first.unmount();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(sendMessage).not.toHaveBeenCalled();
      ready = true;
      act(() => {
        useOpenClawStore.setState({
          scopeKey: original.scopeKey,
          powersOn: true,
          armedMandate: original.armedMandate,
        });
      });
      render(<OpenClawMessage msg={reply} />);
      expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
    },
  );

  it.each(["grant", "scope", "mandate"] as const)(
    "förbrukar inget efter %s-avbrott under pending-kvitto och återspelar inte ett accepterat send",
    async (cancel) => {
      armFollowups();
      const original = useOpenClawStore.getState();
      let resolveSend!: (outcome: SendMessageOutcome) => void;
      const sendMessage = vi.fn(() => new Promise<SendMessageOutcome>((resolve) => { resolveSend = resolve; }));
      registerBuilderBridge(makeBridge({ sendMessage }));
      const reply = armedFillReply(`armed-cancel-receipt-${cancel}`, {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });
      const first = render(<OpenClawMessage msg={reply} />);
      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
      first.unmount();
      act(() => {
        useOpenClawStore.setState(cancel === "grant" ? { powersOn: false }
          : cancel === "scope" ? { scopeKey: "cancelled-scope" } : { armedMandate: null });
      });
      act(() => {
        useOpenClawStore.setState({
          scopeKey: original.scopeKey,
          powersOn: true,
          armedMandate: original.armedMandate,
        });
      });
      render(<OpenClawMessage msg={reply} />);
      await act(async () => { resolveSend({ status: "started", via: "stream" }); });
      expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
      expect(useOpenClawStore.getState().armedContinuation).toBeNull();
    },
  );

  it("skickar giltigt mål exakt en gång, förbrukar ett mandatsteg och registrerar en watch", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: armedAt,
        },
      });
    });
    const bridge = makeBridge();
    registerBuilderBridge(bridge);

    const reply = armedFillReply("armed-bridge", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });
    const { unmount } = render(<OpenClawMessage msg={reply} />);
    await waitFor(() => expect(bridge.sendMessage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bridge.sendMessage).mock.calls[0][0]).toBe("Gör hero-rubriken tydligare");
    expect(domFillMock).not.toHaveBeenCalled();
    expect(domSendMock).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
    expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBe("started");

    unmount();
    render(<OpenClawMessage msg={reply} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(bridge.sendMessage).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
  });

  it.each([
    {
      name: "annan chatt",
      bridge: { getChatId: () => "chat_b" },
      error: /Builderchatten har bytts/,
    },
    {
      name: "annan version",
      bridge: { getActiveVersionId: () => "version_2" },
      error: /Builderversionen har bytts/,
    },
  ])(
    "skickar inte ett armerat förslag som före mount tillhör $name",
    async ({ bridge: overrides, error }) => {
      grantPowers();
      const armedAt = Date.now() - 1_000;
      act(() => {
        useOpenClawStore.setState({
          armedMandate: {
            mode: "followups",
            remaining: 2,
            reason: "gör 2 follow-ups",
            createdAt: armedAt,
          },
        });
      });
      const bridge = makeBridge(overrides);
      registerBuilderBridge(bridge);
      const reply = armedFillReply("armed-wrong-target", {
        builderTarget: { chatId: "chat_1", versionId: "version_1" },
      });

      render(<OpenClawMessage msg={reply} />);

      expect(await screen.findByText(error)).toBeTruthy();
      expect(bridge.sendMessage).not.toHaveBeenCalled();
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
      expect(useOpenClawStore.getState().armedContinuation).toBeNull();
    },
  );

  it("förbrukar inget på typed rejection och återförsöker bara explicit", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: armedAt,
        },
      });
    });
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ status: "rejected", reason: "credit_gate", turnRecorded: false })
      .mockResolvedValueOnce({ status: "started", via: "stream" });
    const bridge = makeBridge({ sendMessage });
    registerBuilderBridge(bridge);
    const reply = armedFillReply("armed-rejected", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });

    render(<OpenClawMessage msg={reply} />);

    expect(await screen.findByText(/Buildern tog inte emot bygget \(credit_gate\)/)).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
    expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBe("started");
  });

  it("förbrukar inget på thrown send och återförsöker bara explicit", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: armedAt,
        },
      });
    });
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("lokalt testfel"))
      .mockResolvedValueOnce({ status: "settled", via: "f3_round" });
    const bridge = makeBridge({ sendMessage });
    registerBuilderBridge(bridge);
    const reply = armedFillReply("armed-throw", {
      builderTarget: { chatId: "chat_1", versionId: "version_1" },
    });

    render(<OpenClawMessage msg={reply} />);

    expect(await screen.findByText(/Utskicket till buildern misslyckades/)).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Skickad till buildern/)).toBeTruthy();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
    expect(useOpenClawStore.getState().armedContinuation?.sendOutcome).toBe("settled");
  });

  it("faller tillbaka till DOM-vägen utan brygga", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: {
          mode: "followups",
          remaining: 2,
          reason: "gör 2 follow-ups",
          createdAt: armedAt,
        },
      });
    });
    render(<OpenClawMessage msg={armedFillReply("armed-dom")} />);
    await waitFor(() => expect(domSendMock).toHaveBeenCalledTimes(1));
    expect(domFillMock).toHaveBeenCalledTimes(1);
  });
});
