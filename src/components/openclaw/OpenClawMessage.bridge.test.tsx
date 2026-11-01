/**
 * Byggkommandon via builder-bryggan (plan 2026-10-22 «En chatt», E4):
 * direktbygg (`start_build`) och den armerade auto-sändningen går genom
 * `registerBuilderBridge` i stället för DOM-ifyllning, och varken hydrerade
 * rader eller svar på interna turer får starta något.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerBuilderBridge,
  resetBuilderBridgeForTests,
  type BuilderBridge,
} from "@/lib/openclaw/builder-bridge";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
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
    canSend: () => true,
    sendMessage: vi.fn(async () => ({ status: "started", via: "stream" }) as const),
    cancelGeneration: vi.fn(),
    ...overrides,
  };
}

function userTurn(id: string, content: string, kind: "chat" | "internal" = "chat"): Msg {
  return { id, role: "user", content, timestamp: Date.now() - 500, kind };
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
        prompt: "Gör om hero-sektionen.\n\nMål:\n- Tydligare CTA\n\nSektioner:\n- Hero\n- Bevis\n\nDesign:\n- Behåll tema",
      }),
      "</openclaw-action>",
    ].join("\n"),
    ...extra,
  };
}

function armedFillReply(id: string): Msg {
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
  it("tillåter bara svar på en riktig användarfråga (eller dess filtur)", () => {
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
    expect(resolveStartBuildAutoRun(messages, "nope")).toEqual({ allowed: false, userTurnId: null });
  });
});

describe("OpenClawMessage — direktbygg via bryggan", () => {
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
      useOpenClawStore.setState({ messages: [userTurn("u-interrupted", "Gör hero tydligare"), reply] });
    });
    render(<OpenClawMessage msg={reply} />);
    expect(screen.getByRole("status").textContent).toContain("Förslaget har inte körts");
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Starta/ })).toBeNull();
  });

  it("startar bygget genom bryggan exakt en gång, utan att röra DOM:en, och överlever remount", async () => {
    grantPowers();
    const bridge = makeBridge();
    registerBuilderBridge(bridge);
    const reply = startBuildReply("sb-1");
    act(() => {
      useOpenClawStore.setState({ messages: [userTurn("u1", "Gör hero tydligare"), reply] });
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
      useOpenClawStore.setState({ messages: [userTurn("u-once", "Gör hero tydligare"), first, second] });
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
  it("skickar genom bryggan, förbrukar ett mandatsteg och registrerar en watch", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: { mode: "followups", remaining: 2, reason: "gör 2 follow-ups", createdAt: armedAt },
      });
    });
    const bridge = makeBridge();
    registerBuilderBridge(bridge);

    render(<OpenClawMessage msg={armedFillReply("armed-bridge")} />);
    await waitFor(() => expect(bridge.sendMessage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(bridge.sendMessage).mock.calls[0][0]).toBe("Gör hero-rubriken tydligare");
    expect(domFillMock).not.toHaveBeenCalled();
    expect(domSendMock).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(1);
    expect(useOpenClawStore.getState().armedContinuation).not.toBeNull();
  });

  it("faller tillbaka till DOM-vägen utan brygga", async () => {
    grantPowers();
    const armedAt = Date.now() - 1_000;
    act(() => {
      useOpenClawStore.setState({
        armedMandate: { mode: "followups", remaining: 2, reason: "gör 2 follow-ups", createdAt: armedAt },
      });
    });
    render(<OpenClawMessage msg={armedFillReply("armed-dom")} />);
    await waitFor(() => expect(domSendMock).toHaveBeenCalledTimes(1));
    expect(domFillMock).toHaveBeenCalledTimes(1);
  });
});
