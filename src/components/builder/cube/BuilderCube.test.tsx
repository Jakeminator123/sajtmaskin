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
      content: id === "chat" ? <textarea aria-label="Meddelande" defaultValue="" /> : <div data-testid={`content-${id}`}>{id}</div>,
      badge: id === "answers" ? 3 : undefined,
    };
  }
  return out;
}

function Harness({ onPosition = () => {}, initialMode = "cube" as CubeMode }: { onPosition?: (p: { x: number; y: number }) => void; initialMode?: CubeMode }) {
  const [active, setActive] = useState<CubeFaceId>("chat");
  const [mode, setMode] = useState<CubeMode>(initialMode);
  const [pos, setPos] = useState({ x: 40, y: 40 });
  const [size, setSize] = useState({ width: 400, height: 500 });
  const [cards, setCards] = useState<CubeCardsState>({ rects: {}, folded: [], order: [...CUBE_FACE_IDS] });
  return (
    <BuilderCube
      faces={faces()}
      activeFace={active}
      onActiveFaceChange={setActive}
      position={pos}
      onPositionChange={(p) => {
        onPosition(p);
        setPos(p);
      }}
      size={size}
      onSizeChange={setSize}
      mode={mode}
      onModeChange={setMode}
      cards={cards}
      onCardsChange={setCards}
      reducedMotion
    />
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
    const nodes = CUBE_FACE_IDS.filter((f) => f !== "chat").map((f) => screen.getByTestId(`content-${f}`));
    fireEvent.click(screen.getByRole("tab", { name: /^Svar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fäll ut till kort" }));
    expect(document.querySelector("[data-cube-mode]")?.getAttribute("data-cube-mode")).toBe("cards");
    expect(face("chat").getAttribute("role")).toBe("region");
    fireEvent.click(screen.getByRole("button", { name: "Samla till kub" }));
    fireEvent.click(screen.getByRole("tab", { name: "Chatt" }));
    expect(screen.getByLabelText("Meddelande")).toBe(textarea);
    expect(textarea.value).toBe("utkast");
    CUBE_FACE_IDS.filter((f) => f !== "chat").forEach((f, i) => expect(screen.getByTestId(`content-${f}`)).toBe(nodes[i]));
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

  it("shrinks and grows a card by multiplying its size", () => {
    render(<Harness initialMode="cards" />);
    const before = parseFloat(face("tools").style.width);
    fireEvent.click(screen.getByRole("button", { name: "Större tools" }));
    expect(parseFloat(face("tools").style.width)).toBe(Math.round(before * 1.14));
    fireEvent.click(screen.getByRole("button", { name: "Mindre tools" }));
    expect(parseFloat(face("tools").style.width)).toBe(Math.round(Math.round(before * 1.14) * 0.88));
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
