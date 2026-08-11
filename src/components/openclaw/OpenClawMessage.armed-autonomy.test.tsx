import { render, screen } from "@testing-library/react";
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
      editEnabled: false,
      powersOn: false,
      grantedPowers: [],
      armedMandate: null,
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
