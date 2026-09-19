// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OPENCLAW_EMPTY_REPLY_COPY } from "@/lib/openclaw/gateway-response";
import { OpenClawMessage } from "./OpenClawMessage";
import type { OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";

function assistant(content: string): Msg {
  return {
    id: "msg-empty",
    role: "assistant",
    timestamp: Date.now(),
    content,
  };
}

function waitingDots(container: HTMLElement) {
  return container.querySelectorAll(".h-1\\.5.w-1\\.5.animate-pulse");
}

describe("OpenClawMessage — terminal empty state", () => {
  it("shows the Swedish empty-state row for an incomplete action after the stream ends", () => {
    const { container } = render(
      <OpenClawMessage
        streaming={false}
        msg={assistant(`<openclaw-action>\n{"type":"fill_text_field","target":"builder.chat.primary","value":"Hej`)}
      />,
    );

    expect(screen.getByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeTruthy();
    expect(waitingDots(container)).toHaveLength(0);
    expect(screen.queryByText("Fältförslag")).toBeNull();
  });

  it("keeps waiting dots while an incomplete action is still streaming", () => {
    const { container } = render(
      <OpenClawMessage
        streaming
        msg={assistant(`<openclaw-action>\n{"type":"fill_text_field","target":"builder.chat.primary","value":"Hej`)}
      />,
    );

    expect(screen.queryByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeNull();
    expect(waitingDots(container).length).toBeGreaterThan(0);
  });

  it("shows a rejected-action error card instead of empty-state or waiting dots", () => {
    const { container } = render(
      <OpenClawMessage
        streaming={false}
        msg={assistant(
          [
            "<openclaw-action>",
            '{"type":"deploy_site","target":"production"}',
            "</openclaw-action>",
          ].join("\n"),
        )}
      />,
    );

    expect(screen.getByText("Förslaget kunde inte tolkas")).toBeTruthy();
    expect(screen.queryByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeNull();
    expect(waitingDots(container)).toHaveLength(0);
  });

  it("renders a finished empty message as the Swedish empty-state, not waiting dots", () => {
    const { container } = render(
      <OpenClawMessage streaming={false} msg={assistant("")} />,
    );

    expect(screen.getByText(OPENCLAW_EMPTY_REPLY_COPY)).toBeTruthy();
    expect(waitingDots(container)).toHaveLength(0);
  });
});
