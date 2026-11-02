import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import {
  applyOpenClawTextFieldAction,
  isOpenClawSendReady,
  triggerOpenClawSend,
} from "@/lib/openclaw/text-field-actions";

vi.mock("@/lib/openclaw/text-field-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openclaw/text-field-actions")>();
  return {
    ...actual,
    applyOpenClawTextFieldAction: vi.fn(),
    isOpenClawSendReady: vi.fn(),
    triggerOpenClawSend: vi.fn(),
  };
});

const applyMock = vi.mocked(applyOpenClawTextFieldAction);
const readyMock = vi.mocked(isOpenClawSendReady);
const sendMock = vi.mocked(triggerOpenClawSend);

function submitFillMessage(timestamp: number): Msg {
  return {
    id: "msg-review-next-submit",
    role: "assistant",
    timestamp,
    content: [
      "Här är en föreslagen follow-up.",
      "<openclaw-action>",
      JSON.stringify({
        type: "fill_text_field",
        target: "builder.chat.primary",
        value: "Granska bilderna på startsidan",
        submit: true,
        label: "Builder-chatten",
      }),
      "</openclaw-action>",
    ].join("\n"),
  };
}

beforeEach(() => {
  act(() => { useOpenClawStore.setState({ messages: [] }); });
  applyMock.mockReturnValue({
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
  readyMock.mockReturnValue(true);
  sendMock.mockReturnValue({ ok: true });
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
    });
  });
  vi.clearAllMocks();
});

describe("OpenClawMessage — review_next vs armed auto-send", () => {
  it("does not render the armed auto-send card or click send under an active review_next mandate", async () => {
    const armedAt = Date.now() - 1_000;
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: {
        mode: "review_next",
        remaining: 1,
        reason: "granska nästa meddelande jag skapar",
        createdAt: armedAt,
      },
    });

    render(<OpenClawMessage msg={submitFillMessage(armedAt + 500)} />);

    // Manual fill card — never the armed auto-send card.
    expect(screen.getByText("Fältförslag")).toBeTruthy();
    expect(screen.queryByText(/Armerad autonomi · auto-send/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Godkänn och fyll" })).toBeTruthy();
    expect(screen.queryByText(/Fyller fältet och skickar/i)).toBeNull();

    // Armed card would call apply/send after ~100ms; wait past that window.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(applyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// SM-026: parse:n i föräldern föder ett nytt action-objekt när content ändras
// (streaming) och typewriter-effekten garanterar omrenderingar. Före fixen låg
// action-objektet i auto-send-effektens dependency-lista: varje omrendering
// körde cleanup (cancelled = true, timern rensades) och omstarten bailade på
// startedRef — retryloopen dog och kortet stod på "Fyller fältet och skickar…"
// för alltid. Testet låser att kedjan överlever både rena omrenderingar och
// content-uppdateringar efter att action-blocket parsats.
describe("OpenClawMessage — armed auto-send överlever omrenderingar (SM-026)", () => {
  function followupFillMessage(id: string, timestamp: number, suffix = ""): Msg {
    return {
      id,
      role: "assistant",
      timestamp,
      content: [
        "Kör nästa follow-up.",
        "<openclaw-action>",
        JSON.stringify({
          type: "fill_text_field",
          target: "builder.chat.primary",
          value: "Lägg till en kontaktsida",
          submit: true,
          label: "Builder-chatten",
        }),
        "</openclaw-action>",
        suffix,
      ].join("\n"),
    };
  }

  it("klickar skicka trots omrenderingar och content-tillväxt medan retry-kedjan väntar", async () => {
    const armedAt = Date.now() - 1_000;
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      // remaining: 2 så mandatet överlever klicket — annars konsumeras sista
      // steget, kortet byts mot manuella "Fältförslag" och sent-texten syns
      // aldrig i DOM:en.
      armedMandate: {
        mode: "followups",
        remaining: 2,
        reason: "gör follow-ups och buggranska",
        createdAt: armedAt,
      },
    });
    // Send-knappen är inte redo förrän senare — precis fönstret där
    // omrenderingarna dödade retry-kedjan före fixen.
    readyMock.mockReturnValue(false);

    const id = "msg-sm026-rerender";
    const { rerender } = render(<OpenClawMessage msg={followupFillMessage(id, armedAt + 500)} />);
    expect(screen.getByText(/Armerad autonomi · auto-send/i)).toBeTruthy();

    // Låt begin() (0 ms) + minst ett trySend-försök (100 ms) hinna köra.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 180));
    });
    expect(applyMock).toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();

    // Ren omrendering (nytt msg-objekt, samma content) + streaming-lik
    // content-tillväxt EFTER action-blocket (ny parse → ny action-identitet).
    rerender(<OpenClawMessage msg={followupFillMessage(id, armedAt + 500)} />);
    rerender(<OpenClawMessage msg={followupFillMessage(id, armedAt + 500, "Klart, säg till!")} />);

    // Nu blir knappen redo. Före fixen var kedjan redan död här och inget
    // klick kom någonsin.
    readyMock.mockReturnValue(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Skickad till buildern/i)).toBeTruthy();
  });
});

describe("OpenClawMessage — armed auto-send gates", () => {
  function followupFillMessage(id: string, timestamp: number): Msg {
    return {
      id,
      role: "assistant",
      timestamp,
      content: [
        "Kör nästa follow-up.",
        "<openclaw-action>",
        JSON.stringify({
          type: "fill_text_field",
          target: "builder.chat.primary",
          value: "Gör hero-rubriken tydligare",
          submit: true,
          label: "Builder-chatten",
        }),
        "</openclaw-action>",
      ].join("\n"),
    };
  }

  it.each([
    { name: "ny fråga utan mandat", content: "Vad tycker du om startsidan?", allowBuild: false },
    { name: "no-change utan metadata", content: "Ändra inget", allowBuild: undefined },
    { name: "byggtext utan metadata", content: "Byt rubriken till Välkommen", allowBuild: undefined },
    { name: "Fråga-läge för byggtext", content: "Byt rubriken till Välkommen", allowBuild: false },
    { name: "fråga med förfalskad metadata", content: "Vad tycker du om startsidan?", allowBuild: true },
    { name: "no-change med förfalskad metadata", content: "Ändra inget", allowBuild: true },
    { name: "hydrerad byggorder", content: "Byt rubriken till Välkommen", allowBuild: true, hydrated: true },
  ])("behåller $name som manuellt fill trots aktivt mandat", async ({ content, allowBuild, hydrated }) => {
    const armedAt = Date.now() - 1_000;
    const reply = followupFillMessage("msg-new-question", Date.now() + 1);
    const user: Msg = {
      id: "u-new-question",
      role: "user",
      kind: "chat",
      timestamp: Date.now(),
      content,
      ...(allowBuild === undefined ? {} : { allowBuild }),
      ...(hydrated ? { hydrated: true } : {}),
    };
    act(() => {
      useOpenClawStore.setState({
        messages: [user, reply],
        editEnabled: true,
        powersOn: true,
        grantedPowers: ["armed_autonomy"],
        armedMandate: {
          mode: "followups",
          remaining: 3,
          reason: "gör 3 follow-ups",
          createdAt: armedAt,
        },
      });
    });

    render(<OpenClawMessage msg={reply} />);
    expect(screen.getByText("Fältförslag")).toBeTruthy();
    expect(screen.queryByText(/Armerad autonomi · auto-send/i)).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(applyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(3);
    expect(useOpenClawStore.getState().armedContinuation).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Godkänn och fyll" }));
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(3);
  });

  it("never clicks send for submit:true without an active mandate", async () => {
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: null,
    });

    render(<OpenClawMessage msg={followupFillMessage("msg-no-mandate", Date.now())} />);

    expect(screen.getByText("Fältförslag")).toBeTruthy();
    expect(screen.queryByText(/Armerad autonomi · auto-send/i)).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(applyMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends exactly once for a new assistant action under an active mandate", async () => {
    const armedAt = Date.now() - 1_000;
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: {
        mode: "followups",
        remaining: 3,
        reason: "gör 3 follow-ups",
        createdAt: armedAt,
      },
    });

    render(<OpenClawMessage msg={followupFillMessage("msg-once-send", armedAt + 500)} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
  });

  it.each(["[Automatisk fortsättning]", "[Automatisk väckning]"])(
    "bevarar redan aktivt uttryckligt mandat efter %s",
    async (prefix) => {
      const armedAt = Date.now() - 1_000;
      const reply = followupFillMessage(`msg-active-${prefix}`, Date.now() + 1);
      act(() => {
        useOpenClawStore.setState({
          messages: [
            {
              id: "u-active-build",
              role: "user",
              kind: "chat",
              timestamp: armedAt,
              content: "Byt rubriken till Välkommen",
              allowBuild: true,
            },
            {
              id: "u-active-internal",
              role: "user",
              kind: "internal",
              timestamp: armedAt + 500,
              content: `${prefix} Läs byggresultatet och fortsätt uppdraget.`,
              allowBuild: false,
            },
            reply,
          ],
          editEnabled: true,
          powersOn: true,
          grantedPowers: ["armed_autonomy"],
          armedMandate: {
            mode: "followups",
            remaining: 3,
            reason: "gör 3 follow-ups",
            createdAt: armedAt,
          },
        });
      });

      render(<OpenClawMessage msg={reply} />);
      expect(screen.getByText(/Armerad autonomi · auto-send/i)).toBeTruthy();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(useOpenClawStore.getState().armedMandate?.remaining).toBe(2);
    },
  );

  it("does not double-send when the armed card remounts", async () => {
    const armedAt = Date.now() - 1_000;
    useOpenClawStore.setState({
      editEnabled: true,
      powersOn: true,
      grantedPowers: ["armed_autonomy"],
      armedMandate: {
        mode: "followups",
        remaining: 3,
        reason: "gör 3 follow-ups",
        createdAt: armedAt,
      },
    });

    const msg = followupFillMessage("msg-remount-send", armedAt + 500);
    const { unmount } = render(<OpenClawMessage msg={msg} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(sendMock).toHaveBeenCalledTimes(1);

    unmount();
    render(<OpenClawMessage msg={msg} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
