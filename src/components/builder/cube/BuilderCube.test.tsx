import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BuilderCube, type CubeCardsState, type CubeFaceSpec } from "./BuilderCube";
import { CUBE_FACE_IDS, type CubeFaceId } from "./cube-model";
import type { CubeMode } from "./cube-layout-storage";

function faces(): Record<CubeFaceId, CubeFaceSpec> {
  const out = {} as Record<CubeFaceId, CubeFaceSpec>;
  for (const id of CUBE_FACE_IDS) {
    out[id] = {
      label: id === "chat" ? "Chatt" : id === "answers" ? "Svar" : id,
      icon: <span>{id[0]}</span>,
      content:
        id === "chat" ? (
          <textarea aria-label="Meddelande" defaultValue="" />
        ) : (
          <div data-testid={`content-${id}`}>{id}</div>
        ),
      badge: id === "answers" ? 3 : undefined,
    };
  }
  return out;
}

function Harness({
  onPosition = () => {},
  onSize = () => {},
  onCards = () => {},
  resetTo,
  initialMode = "cube" as CubeMode,
}: {
  onPosition?: (p: { x: number; y: number }) => void;
  onSize?: (size: { width: number; height: number }) => void;
  onCards?: (cards: CubeCardsState) => void;
  resetTo?: { x: number; y: number };
  initialMode?: CubeMode;
}) {
  const [active, setActive] = useState<CubeFaceId>("chat");
  const [mode, setMode] = useState<CubeMode>(initialMode);
  const [pos, setPos] = useState({ x: 40, y: 40 });
  const [size, setSize] = useState({ width: 400, height: 500 });
  const [chatRevision, setChatRevision] = useState(0);
  const [cards, setCards] = useState<CubeCardsState>({
    rects: {},
    folded: [],
    order: [...CUBE_FACE_IDS],
  });
  return (
    <>
      <button onClick={() => setChatRevision((previous) => previous + 1)}>
        Uppdatera chatt {chatRevision}
      </button>
      {resetTo ? <button onClick={() => setPos(resetTo)}>Extern positionsreset</button> : null}
      <BuilderCube
      faces={faces()}
      activeFace={active}
      onActiveFaceChange={setActive}
      position={{ ...pos }}
      onPositionChange={(p) => {
        onPosition(p);
        setPos(p);
      }}
      size={{ ...size }}
      onSizeChange={(next) => {
        onSize(next);
        setSize(next);
      }}
      mode={mode}
      onModeChange={setMode}
      cards={cards}
      onCardsChange={(next) => {
        onCards(next);
        setCards(next);
      }}
        reducedMotion
      />
    </>
  );
}

const face = (id: CubeFaceId) => document.querySelector(`[data-cube-face="${id}"]`) as HTMLElement;

describe("BuilderCube", () => {
  it("renders a real tablist with six tabs and one interactive tabpanel", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    expect(tabs[1].getAttribute("aria-label")).toBe("Svar, 3 nya");
    const panel = face("chat");
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(tabs[0].getAttribute("aria-controls")).toBe(panel.id);
    for (const id of CUBE_FACE_IDS.filter((f) => f !== "chat")) {
      expect(face(id).hasAttribute("inert")).toBe(true);
      expect(face(id).getAttribute("aria-hidden")).toBe("true");
    }
    expect(panel.hasAttribute("inert")).toBe(false);
  });

  it("supports arrow keys, Home and End in the dock", () => {
    render(<Harness />);
    const tabs = () => screen.getAllByRole("tab");
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    fireEvent.keyDown(tabs()[1], { key: "End" });
    expect(tabs()[5].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[5], { key: "ArrowRight" });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(tabs()[5].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[5], { key: "Home" });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("keeps every face content node mounted across turns and cube/cards switches", () => {
    render(<Harness />);
    const textarea = screen.getByLabelText("Meddelande") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "utkast" } });
    const nodes = CUBE_FACE_IDS.filter((f) => f !== "chat").map((f) =>
      screen.getByTestId(`content-${f}`),
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Svar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fäll ut till kort" }));
    expect(document.querySelector("[data-cube-mode]")?.getAttribute("data-cube-mode")).toBe(
      "cards",
    );
    expect(face("chat").getAttribute("role")).toBe("region");
    fireEvent.click(screen.getByRole("button", { name: "Samla till kub" }));
    fireEvent.click(screen.getByRole("tab", { name: "Chatt" }));
    expect(screen.getByLabelText("Meddelande")).toBe(textarea);
    expect(textarea.value).toBe("utkast");
    CUBE_FACE_IDS.filter((f) => f !== "chat").forEach((f, i) =>
      expect(screen.getByTestId(`content-${f}`)).toBe(nodes[i]),
    );
  });

  it("moves focus to the new tabpanel when the focused face goes away", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      render(<Harness />);
      const textarea = screen.getByLabelText("Meddelande");
      textarea.focus();
      // Extern aktivering (t.ex. ett svar kom): klicka fliken utan att flytta fokus.
      act(() => {
        screen.getByRole("tab", { name: /^Svar/ }).click();
      });
      act(() => {
        vi.runAllTicks();
        vi.advanceTimersToNextFrame();
      });
      expect(document.activeElement).toBe(face("answers"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("folds a card into the bar (still mounted) and reopens it on top", () => {
    render(<Harness initialMode="cards" />);
    const bar = screen.getByRole("toolbar", { name: "Kort" });
    const chatBtn = bar.querySelector(`[aria-controls="${face("chat").id}"]`) as HTMLButtonElement;
    expect(chatBtn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Fäll ned Chatt till fältet" }));
    expect(chatBtn.getAttribute("aria-expanded")).toBe("false");
    expect(face("chat").hasAttribute("inert")).toBe(true);
    expect(screen.getByLabelText("Meddelande")).toBeTruthy();
    fireEvent.click(chatBtn);
    expect(chatBtn.getAttribute("aria-expanded")).toBe("true");
    const z = (id: CubeFaceId) => Number(face(id).style.zIndex);
    expect(Math.max(...CUBE_FACE_IDS.map(z))).toBe(z("chat"));
  });

  it("raises a card on a press anywhere in it, also in content hosted from outside", () => {
    render(<Harness initialMode="cards" />);
    const z = (id: CubeFaceId) => Number(face(id).style.zIndex);
    const top = () => CUBE_FACE_IDS.reduce((a, b) => (z(a) >= z(b) ? a : b));
    fireEvent.pointerDown(screen.getByTestId("content-tools"));
    expect(top()).toBe("tools");
    // Värdat innehåll (`relocation.tsx`): en nod som React inte renderade under
    // sidan. Dess React-händelser bubblar inte hit, så lyftet lyssnar i DOM:en.
    const hosted = document.createElement("div");
    face("avatar").querySelector("[data-cube-content]")?.appendChild(hosted);
    fireEvent.pointerDown(hosted);
    expect(top()).toBe("avatar");
  });

  it("raises a back card reached by focus and preserves its input when collecting", () => {
    render(<Harness initialMode="cards" />);
    const z = (id: CubeFaceId) => Number(face(id).style.zIndex);
    const textarea = screen.getByLabelText("Meddelande") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "utkast" } });

    act(() => screen.getByRole("button", { name: /Flytta Svar/ }).focus());
    expect(Math.max(...CUBE_FACE_IDS.map(z))).toBe(z("answers"));
    act(() => textarea.focus());
    expect(document.activeElement).toBe(textarea);
    expect(Math.max(...CUBE_FACE_IDS.map(z))).toBe(z("chat"));

    fireEvent.click(screen.getByRole("button", { name: "Samla till kub" }));
    expect(screen.getByRole("tab", { name: "Chatt" }).getAttribute("aria-selected")).toBe("true");
    expect(face("chat").hasAttribute("inert")).toBe(false);
    expect(screen.getByLabelText("Meddelande")).toBe(textarea);
    expect(textarea.value).toBe("utkast");
  });

  it("previews card drag geometry per frame but commits shared layout only on release", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onCards = vi.fn();
      render(<Harness initialMode="cards" onCards={onCards} />);
      const header = document.querySelector('[data-card-header="chat"]') as HTMLElement;
      const before = parseFloat(face("chat").style.left);
      fireEvent.pointerDown(header, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
      onCards.mockClear(); // The capture listener may first raise the card.

      fireEvent.pointerMove(header, { pointerId: 7, clientX: 132, clientY: 118 });
      act(() => vi.advanceTimersToNextFrame());

      expect(parseFloat(face("chat").style.left)).toBe(before + 32);
      expect(onCards).not.toHaveBeenCalled();

      fireEvent.pointerUp(header, { pointerId: 7, clientX: 132, clientY: 118 });
      expect(onCards).toHaveBeenCalledTimes(1);
      expect(onCards.mock.lastCall?.[0].rects.chat?.x).toBe(before + 32);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([false, true])("keeps the first drag of a back card with prior focus %s", (focusFirst) => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onCards = vi.fn();
      render(<Harness initialMode="cards" onCards={onCards} />);
      const header = document.querySelector('[data-card-header="answers"]') as HTMLElement;
      const before = parseFloat(face("answers").style.left);
      if (focusFirst) fireEvent.focusIn(header);
      fireEvent.pointerDown(header, { pointerId: 18, button: 0, clientX: 100, clientY: 100 });
      onCards.mockClear();
      fireEvent.pointerMove(header, { pointerId: 18, clientX: 130, clientY: 110 });
      act(() => vi.advanceTimersToNextFrame());
      expect(parseFloat(face("answers").style.left)).toBe(before + 30);
      fireEvent.pointerUp(header, { pointerId: 18, clientX: 130, clientY: 110 });
      expect(onCards.mock.lastCall?.[0].rects.answers?.x).toBe(before + 30);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["cube", "cards"] as const)("keeps a %s drag through a chat render with unchanged geometry", (mode) => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onPosition = vi.fn();
      const onCards = vi.fn();
      render(<Harness initialMode={mode} onPosition={onPosition} onCards={onCards} />);
      const header = document.querySelector(mode === "cube" ? "[data-cube-header]" : '[data-card-header="chat"]') as HTMLElement;
      const box = mode === "cube" ? document.querySelector("[data-cube-chrome]") as HTMLElement : face("chat");
      const before = parseFloat(box.style.left);
      fireEvent.pointerDown(header, { pointerId: 19, button: 0, clientX: 100, clientY: 100 });
      onCards.mockClear();
      fireEvent.pointerMove(header, { pointerId: 19, clientX: 120, clientY: 110 });
      fireEvent.click(screen.getByRole("button", { name: "Uppdatera chatt 0" }));
      act(() => vi.advanceTimersToNextFrame());
      expect(parseFloat(box.style.left)).toBe(before + 20);
      fireEvent.pointerMove(header, { pointerId: 19, clientX: 135, clientY: 115 });
      fireEvent.pointerUp(header, { pointerId: 19, clientX: 135, clientY: 115 });
      expect(parseFloat(box.style.left)).toBe(before + 35);
      if (mode === "cube") {
        expect(onPosition).toHaveBeenCalledTimes(1);
        expect(onPosition.mock.lastCall?.[0].x).toBe(before + 35);
      } else {
        expect(onCards).toHaveBeenCalledTimes(1);
        expect(onCards.mock.lastCall?.[0].rects.chat?.x).toBe(before + 35);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("previews cube movement per frame but commits position only on release", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onPosition = vi.fn();
      render(<Harness onPosition={onPosition} />);
      const header = document.querySelector("[data-cube-header]") as HTMLElement;
      fireEvent.pointerDown(header, { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(header, { pointerId: 8, clientX: 126, clientY: 114 });
      act(() => vi.advanceTimersToNextFrame());

      expect(onPosition).not.toHaveBeenCalled();
      expect(
        parseFloat((document.querySelector("[data-cube-chrome]") as HTMLElement).style.left),
      ).toBe(66);

      fireEvent.pointerUp(header, { pointerId: 8, clientX: 126, clientY: 114 });
      expect(onPosition).toHaveBeenCalledTimes(1);
      expect(onPosition).toHaveBeenLastCalledWith({ x: 66, y: 54 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits card resize on lost capture and allows the next resize", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onCards = vi.fn();
      render(<Harness initialMode="cards" onCards={onCards} />);
      const handle = face("chat").querySelector('[data-card-resize="se"]') as HTMLElement;
      const before = parseFloat(face("chat").style.width);
      fireEvent.pointerDown(handle, { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
      onCards.mockClear();

      fireEvent.pointerMove(handle, { pointerId: 9, clientX: 140, clientY: 125 });
      act(() => vi.advanceTimersToNextFrame());

      expect(parseFloat(face("chat").style.width)).toBe(before + 40);
      expect(onCards).not.toHaveBeenCalled();

      fireEvent.lostPointerCapture(handle, { pointerId: 9, clientX: 140, clientY: 125 });
      expect(onCards).toHaveBeenCalledTimes(1);
      expect(onCards.mock.lastCall?.[0].rects.chat?.width).toBe(before + 40);

      fireEvent.pointerDown(handle, { pointerId: 10, button: 0, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(handle, { pointerId: 10, clientX: 220, clientY: 210 });
      act(() => vi.advanceTimersToNextFrame());
      fireEvent.lostPointerCapture(handle, { pointerId: 10, clientX: 220, clientY: 210 });
      expect(onCards).toHaveBeenCalledTimes(2);
      expect(onCards.mock.lastCall?.[0].rects.chat?.width).toBe(before + 60);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["cube", "cards"] as const)("commits a cancelled %s pointer and accepts a new drag", (mode) => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      render(<Harness initialMode={mode} />);
      const header = document.querySelector(mode === "cube" ? "[data-cube-header]" : '[data-card-header="chat"]') as HTMLElement;
      const box = mode === "cube" ? document.querySelector("[data-cube-chrome]") as HTMLElement : face("chat");
      const before = parseFloat(box.style.left);
      fireEvent.pointerDown(header, { pointerId: 20, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(header, { pointerId: 20, clientX: 120, clientY: 110 });
      fireEvent.pointerCancel(header, { pointerId: 20 });
      expect(parseFloat(box.style.left)).toBe(before + 20);
      fireEvent.pointerDown(header, { pointerId: 21, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(header, { pointerId: 21, clientX: 130, clientY: 115 });
      fireEvent.pointerUp(header, { pointerId: 21 });
      expect(parseFloat(box.style.left)).toBe(before + 50);
      act(() => vi.advanceTimersToNextFrame());
      expect(parseFloat(box.style.left)).toBe(before + 50);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps bevels anchored during cube resize, commits lost capture, and permits retry", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onSize = vi.fn();
      render(<Harness onSize={onSize} />);
      const handle = document.querySelector('[data-cube-resize="se"]') as HTMLElement;
      const chrome = document.querySelector("[data-cube-chrome]") as HTMLElement;
      const before = parseFloat(chrome.style.width);
      const right = document.querySelector('[data-cube-bevel="right"]') as HTMLElement;
      const down = document.querySelector('[data-cube-bevel="down"]') as HTMLElement;

      fireEvent.pointerDown(handle, { pointerId: 11, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(handle, { pointerId: 11, clientX: 140, clientY: 125 });
      act(() => vi.advanceTimersToNextFrame());
      expect(parseFloat(chrome.style.width)).toBe(before + 40);
      expect(right.style.right).toBe("0px");
      expect(right.style.left).toBe("");
      expect(down.style.bottom).not.toBe("");
      expect(down.style.top).toBe("");
      fireEvent.lostPointerCapture(handle, { pointerId: 11, clientX: 140, clientY: 125 });
      expect(onSize).toHaveBeenCalledTimes(1);

      fireEvent.pointerDown(handle, { pointerId: 12, button: 0, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(handle, { pointerId: 12, clientX: 220, clientY: 210 });
      act(() => vi.advanceTimersToNextFrame());
      fireEvent.lostPointerCapture(handle, { pointerId: 12, clientX: 220, clientY: 210 });
      expect(onSize).toHaveBeenCalledTimes(2);
      expect(onSize.mock.lastCall?.[0].width).toBe(460);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a queued card frame on mode change and allows a following cube drag", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    try {
      const onPosition = vi.fn();
      render(<Harness initialMode="cards" onPosition={onPosition} />);
      const cardHeader = document.querySelector('[data-card-header="chat"]') as HTMLElement;
      fireEvent.pointerDown(cardHeader, { pointerId: 13, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(cardHeader, { pointerId: 13, clientX: 180, clientY: 160 });
      fireEvent.click(screen.getByRole("button", { name: "Samla till kub" }));
      const cubeLeft = face("chat").style.left;
      act(() => vi.advanceTimersToNextFrame());
      expect(face("chat").style.left).toBe(cubeLeft);

      const cubeHeader = document.querySelector("[data-cube-header]") as HTMLElement;
      fireEvent.pointerDown(cubeHeader, { pointerId: 14, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(cubeHeader, { pointerId: 14, clientX: 120, clientY: 110 });
      act(() => vi.advanceTimersToNextFrame());
      fireEvent.pointerUp(cubeHeader, { pointerId: 14, clientX: 120, clientY: 110 });
      expect(onPosition).toHaveBeenLastCalledWith({ x: 60, y: 50 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a no-op pointer start so an external reset becomes the next keyboard origin", () => {
    const onPosition = vi.fn();
    render(<Harness onPosition={onPosition} resetTo={{ x: 200, y: 180 }} />);
    const header = document.querySelector("[data-cube-header]") as HTMLElement;
    fireEvent.pointerDown(header, { pointerId: 15, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(header, { pointerId: 15, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Extern positionsreset" }));
    const resetTop = parseFloat((document.querySelector("[data-cube-chrome]") as HTMLElement).style.top);
    fireEvent.keyDown(screen.getByRole("button", { name: /Flytta panelen/ }), { key: "ArrowRight" });
    expect(onPosition.mock.lastCall?.[0]).toEqual({ x: 210, y: resetTop });
  });

  it("cancels and restores transient cube geometry when the stage changes mid-drag", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
      const onPosition = vi.fn();
      render(<Harness onPosition={onPosition} />);
      const header = document.querySelector("[data-cube-header]") as HTMLElement;
      const chrome = document.querySelector("[data-cube-chrome]") as HTMLElement;
      const canonicalLeft = chrome.style.left;
      fireEvent.pointerDown(header, { pointerId: 16, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(header, { pointerId: 16, clientX: 260, clientY: 120 });
      act(() => vi.advanceTimersToNextFrame());
      expect(chrome.style.left).not.toBe(canonicalLeft);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
      fireEvent(window, new Event("resize"));
      expect(chrome.style.left).toBe(canonicalLeft);
      act(() => vi.advanceTimersToNextFrame());
      expect(chrome.style.left).toBe(canonicalLeft);

      fireEvent.pointerDown(header, { pointerId: 17, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(header, { pointerId: 17, clientX: 120, clientY: 110 });
      act(() => vi.advanceTimersToNextFrame());
      fireEvent.pointerUp(header, { pointerId: 17, clientX: 120, clientY: 110 });
      expect(onPosition).toHaveBeenLastCalledWith({ x: 60, y: 50 });
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      vi.useRealTimers();
    }
  });

  it("shrinks and grows a card by multiplying its size", () => {
    render(<Harness initialMode="cards" />);
    const before = parseFloat(face("tools").style.width);
    fireEvent.click(screen.getByRole("button", { name: "Större tools" }));
    expect(parseFloat(face("tools").style.width)).toBe(Math.round(before * 1.14));
    fireEvent.click(screen.getByRole("button", { name: "Mindre tools" }));
    expect(parseFloat(face("tools").style.width)).toBe(
      Math.round(Math.round(before * 1.14) * 0.88),
    );
  });

  it("nudges the box with arrow keys on the grip (10 px, 40 px with Shift)", () => {
    const onPosition = vi.fn();
    render(<Harness onPosition={onPosition} />);
    const grip = screen.getByRole("button", { name: /Flytta panelen/ });
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(onPosition).toHaveBeenLastCalledWith({ x: 50, y: 40 });
    fireEvent.keyDown(grip, { key: "ArrowDown", shiftKey: true });
    expect(onPosition).toHaveBeenLastCalledWith({ x: 50, y: 80 });
  });
});
