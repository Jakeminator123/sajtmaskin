import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import {
  applyOpenClawTextFieldAction,
  triggerOpenClawSend,
} from "@/lib/openclaw/text-field-actions";

vi.mock("@/lib/openclaw/text-field-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openclaw/text-field-actions")>();
  return {
    ...actual,
    applyOpenClawTextFieldAction: vi.fn(),
    triggerOpenClawSend: vi.fn(),
  };
});

const applyMock = vi.mocked(applyOpenClawTextFieldAction);
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
  sendMock.mockReturnValue({ ok: true });
});

afterEach(() => {
  act(() => {
    useOpenClawStore.setState({ editEnabled: false, armedMandate: null });
  });
  vi.clearAllMocks();
});

describe("OpenClawMessage — review_next vs armed auto-send", () => {
  it("does not render the armed auto-send card or click send under an active review_next mandate", async () => {
    const armedAt = Date.now() - 1_000;
    useOpenClawStore.setState({
      editEnabled: true,
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
