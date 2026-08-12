import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX,
  clearChatInputFloatPosition,
  clampChatInputFloatPosition,
  defaultChatInputFloatPosition,
  readChatInputFloatPosition,
  resolveFloatPlacementSeed,
  writeChatInputFloatPosition,
} from "@/lib/builder/chat-input-float-position";
import { fireEvent, render, renderHook, screen, act } from "@testing-library/react";
import { ChatOutputCollapseBar } from "@/components/builder/chat/ChatOutputCollapseBar";
import { useChatInputFloatPosition } from "@/components/builder/chat/useChatInputFloatPosition";

describe("chat-input-float-position", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clamps a position inside the viewport with margin", () => {
    const clamped = clampChatInputFloatPosition(
      { x: -40, y: 9000 },
      { width: 200, height: 100 },
      { width: 1000, height: 800 },
      8,
    );
    expect(clamped).toEqual({ x: 8, y: 692 });
  });

  it("defaults to bottom-center", () => {
    const pos = defaultChatInputFloatPosition(
      { width: 400, height: 200 },
      { width: 1200, height: 900 },
      16,
    );
    expect(pos).toEqual({ x: 400, y: 684 });
  });

  it("persists position per chat", () => {
    writeChatInputFloatPosition("chat_a", { x: 12, y: 34 });
    expect(readChatInputFloatPosition("chat_a")).toEqual({ x: 12, y: 34 });
    expect(readChatInputFloatPosition("chat_b")).toBeNull();
    clearChatInputFloatPosition("chat_a");
    expect(readChatInputFloatPosition("chat_a")).toBeNull();
  });

  it("ignores corrupt storage payloads", () => {
    localStorage.setItem("sajtmaskin:chatInputFloatPos:chat_a", "{not-json");
    expect(readChatInputFloatPosition("chat_a")).toBeNull();
    localStorage.setItem("sajtmaskin:chatInputFloatPos:chat_a", JSON.stringify({ x: "nope" }));
    expect(readChatInputFloatPosition("chat_a")).toBeNull();
  });

  it("exposes a small drag threshold", () => {
    expect(CHAT_INPUT_FLOAT_DRAG_THRESHOLD_PX).toBe(4);
  });

  it("does not inherit another chat's in-memory coords when seeding", () => {
    const box = { width: 400, height: 200 };
    const viewport = { width: 1200, height: 900 };
    const previousChatCoords = { x: 12, y: 34 };
    // New chat has no stored position — must get default, not previousChatCoords.
    const seeded = resolveFloatPlacementSeed(null, box, viewport);
    expect(seeded).toEqual(defaultChatInputFloatPosition(box, viewport));
    expect(seeded).not.toEqual(previousChatCoords);

    writeChatInputFloatPosition("chat_b", previousChatCoords);
    const fromStorage = resolveFloatPlacementSeed(
      readChatInputFloatPosition("chat_b"),
      box,
      viewport,
    );
    expect(fromStorage).toEqual(
      clampChatInputFloatPosition(previousChatCoords, box, viewport),
    );
  });
});

describe("useChatInputFloatPosition", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads stored position after mount and persists updates", () => {
    writeChatInputFloatPosition("chat_a", { x: 40, y: 50 });
    const { result } = renderHook(() => useChatInputFloatPosition("chat_a"));
    expect(result.current.position).toEqual({ x: 40, y: 50 });

    act(() => {
      result.current.setPosition({ x: 10, y: 20 }, { width: 100, height: 80 });
    });
    expect(result.current.position).toEqual({ x: 10, y: 20 });
    expect(readChatInputFloatPosition("chat_a")).toEqual({ x: 10, y: 20 });
  });

  it("resets in-memory and stored position", () => {
    const { result } = renderHook(() => useChatInputFloatPosition("chat_a"));
    act(() => {
      result.current.placeDefault({ width: 200, height: 100 });
    });
    expect(result.current.position).not.toBeNull();
    act(() => result.current.resetPosition());
    expect(result.current.position).toBeNull();
    expect(readChatInputFloatPosition("chat_a")).toBeNull();
  });
});

describe("ChatOutputCollapseBar drag handle", () => {
  it("does not start drag from the toggle button (stopPropagation)", () => {
    const onToggle = vi.fn();
    const onDragDown = vi.fn();
    render(
      <ChatOutputCollapseBar
        isCollapsed
        onToggle={onToggle}
        messageCount={2}
        isStreaming={false}
        dragEnabled
        onDragHandlePointerDown={onDragDown}
      />,
    );

    const button = screen.getByRole("button", { name: "Visa chatten (2 meddelanden)" });
    fireEvent.pointerDown(button);
    expect(onDragDown).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("forwards pointerdown from the bar when drag is enabled", () => {
    const onDragDown = vi.fn();
    render(
      <ChatOutputCollapseBar
        isCollapsed
        onToggle={vi.fn()}
        messageCount={2}
        isStreaming={false}
        dragEnabled
        onDragHandlePointerDown={onDragDown}
      />,
    );

    fireEvent.pointerDown(screen.getByTestId("chat-output-collapse-bar"));
    expect(onDragDown).toHaveBeenCalledTimes(1);
  });
});
