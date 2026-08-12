import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { OpenClawMessage } from "./OpenClawMessage";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";

function assistantMessage(payload: string): Msg {
  return {
    id: "msg-1",
    role: "assistant",
    timestamp: Date.now(),
    content: [
      "Jag föreslår en liten ändring.",
      "<openclaw-action>",
      payload,
      "</openclaw-action>",
    ].join("\n"),
  };
}

afterEach(() => {
  act(() => {
    useOpenClawStore.setState({ editEnabled: false, armedMandate: null });
  });
});

describe("OpenClawRejectedActionCard", () => {
  it("renderar orsaken utan knappar när action-blocket avvisas", () => {
    render(<OpenClawMessage msg={assistantMessage(`{"type":"fill_text_field",`)} />);

    expect(screen.getByText("Förslaget kunde inte tolkas")).toBeTruthy();
    expect(screen.getByText("Actionblocket är inte giltig JSON.")).toBeTruthy();
    // Den synliga texten före blocket ska finnas kvar.
    expect(screen.getByText("Jag föreslår en liten ändring.")).toBeTruthy();
    // Rent informativt kort: inget får kunna köras den här vägen.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("visar förfiltrets svenska orsak när en snabbändring rör en skyddad fil", () => {
    useOpenClawStore.setState({ editEnabled: true });
    const payload = JSON.stringify({
      type: "apply_quick_edit",
      label: "Uppdatera beroenden",
      ops: [{ kind: "replace_content", path: "package.json", content: "{}" }],
    });

    render(<OpenClawMessage msg={assistantMessage(payload)} />);

    expect(screen.getByText("Förslaget kunde inte tolkas")).toBeTruthy();
    expect(screen.getByText(/skyddad fil/)).toBeTruthy();
    expect(screen.queryByText("Snabbändringsförslag")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renderar inget felkort för en giltig action", () => {
    const payload = JSON.stringify({
      type: "fill_text_field",
      target: "landing.freeform.primary",
      value: "En varm och modern salongssajt",
      label: "Frilägesfältet",
    });

    render(<OpenClawMessage msg={assistantMessage(payload)} />);

    expect(screen.queryByText("Förslaget kunde inte tolkas")).toBeNull();
    expect(screen.getByText("Fältförslag")).toBeTruthy();
  });
});
