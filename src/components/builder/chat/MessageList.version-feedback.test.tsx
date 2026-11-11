/**
 * «Hur blev resultatet?» frågas först när förhandsvisningen visar just den
 * versionen (riggen 2026-11-11: frågan kom 85 s innan sajten syntes). Signalen
 * kommer från `preview-visible-version.ts`, som bara PreviewPanel skriver.
 */
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import {
  clearPreviewVisibleVersion,
  setPreviewVisibleVersion,
} from "@/lib/builder/preview-visible-version";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@streamdown/code", () => ({ code: () => null }));

import { MessageList } from "./MessageList";

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "Bygg en sajt" },
  {
    id: "a1",
    role: "assistant",
    content: '```tsx file="app/page.tsx"\nexport default function Page() { return null; }\n```\n\nKlart.',
  },
];

afterEach(() => {
  act(() => clearPreviewVisibleVersion());
});

describe("MessageList — återkopplingen väntar på förhandsvisningen", () => {
  it("frågar inte medan förhandsvisningen startar eller visar en annan version", () => {
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v2", state: "starting" }));
    render(<MessageList chatId="chat_1" versionId="v2" messages={messages} />);
    expect(screen.queryByText("Hur blev resultatet?")).toBeNull();

    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v1", state: "showing" }));
    expect(screen.queryByText("Hur blev resultatet?")).toBeNull();
  });

  it("frågar när förhandsvisningen visar just den versionen", () => {
    render(<MessageList chatId="chat_1" versionId="v2" messages={messages} />);
    expect(screen.queryByText("Hur blev resultatet?")).toBeNull();
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v2", state: "showing" }));
    expect(screen.getByText("Hur blev resultatet?")).toBeTruthy();
  });
});
