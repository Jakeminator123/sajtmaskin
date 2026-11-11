/**
 * «Hur blev resultatet?» väntar på att förhandsvisningen visar just den
 * versionen (riggen 2026-11-11: frågan kom 85 s innan sajten syntes), men
 * uteblir aldrig: utan förhandsvisning frågar vi direkt, och efter en gräns
 * ändå, så att ett trasigt bygge kan få svaret «Förhandsgranskning trasig»
 * (granskningen av #1747). Signalen kommer från `preview-visible-version.ts`.
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

import { MessageList, VERSION_FEEDBACK_PREVIEW_WAIT_MS } from "./MessageList";

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
  vi.useRealTimers();
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
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v2", state: "starting" }));
    render(<MessageList chatId="chat_1" versionId="v2" messages={messages} />);
    expect(screen.queryByText("Hur blev resultatet?")).toBeNull();
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v2", state: "showing" }));
    expect(screen.getByText("Hur blev resultatet?")).toBeTruthy();
  });

  it("frågar direkt när förhandsvisningen saknas eller är stängd", () => {
    render(<MessageList chatId="chat_1" versionId="v2" messages={messages} />);
    expect(screen.getByText("Hur blev resultatet?")).toBeTruthy();
  });

  it("frågar efter gränsen när förhandsvisningen aldrig visar versionen", () => {
    vi.useFakeTimers();
    act(() => setPreviewVisibleVersion({ chatId: "chat_1", versionId: "v2", state: "starting" }));
    render(<MessageList chatId="chat_1" versionId="v2" messages={messages} />);
    act(() => {
      vi.advanceTimersByTime(VERSION_FEEDBACK_PREVIEW_WAIT_MS - 1_000);
    });
    expect(screen.queryByText("Hur blev resultatet?")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("Hur blev resultatet?")).toBeTruthy();
  });
});
