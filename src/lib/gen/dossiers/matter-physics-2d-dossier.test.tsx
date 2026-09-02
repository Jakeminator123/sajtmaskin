import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PHYSICS_MAX_BODIES,
  clampBodyCount,
  spawnPositions,
  toTransform,
} from "../../../../data/dossiers/soft/matter-physics-2d/components/physics-2d-layout";
import { createPhysicsScene } from "../../../../data/dossiers/soft/matter-physics-2d/components/physics-2d-scene";
import { PhysicsStage } from "../../../../data/dossiers/soft/matter-physics-2d/components/physics-stage";

const BAKERY = [
  "Kanelbulle",
  "Kardemummabulle",
  "Semla",
  "Prinsesstårta",
  "Surdegsbröd",
  "Chokladkaka",
];

function bakeryItems(count = BAKERY.length) {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    children: index < BAKERY.length ? BAKERY[index] : `Bakverk ${index + 1}`,
  }));
}

const originalMatchMedia = window.matchMedia;

function installMatchMedia(reducedMotion: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const cancelAnimationFrame = vi.fn((id: number) => {
  window.clearTimeout(id);
});

beforeEach(() => {
  cancelAnimationFrame.mockClear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  });
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("physics-2d-layout helpers", () => {
  it("spawnPositions(6, 600, 120) spreads six unique falling starts", () => {
    const first = spawnPositions(6, 600, 120);
    const second = spawnPositions(6, 600, 120);
    expect(first).toHaveLength(6);
    expect(first).toEqual(second);
    const seen = new Set<string>();
    for (const pos of first) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(600);
      expect(pos.y).toBeLessThan(0);
      seen.add(`${pos.x},${pos.y}`);
    }
    expect(seen.size).toBe(6);
  });

  it("clampBodyCount caps at PHYSICS_MAX_BODIES and passes small counts through", () => {
    expect(PHYSICS_MAX_BODIES).toBe(30);
    expect(clampBodyCount(45)).toBe(30);
    expect(clampBodyCount(3)).toBe(3);
  });

  it("toTransform centers the box and rounds to two decimals", () => {
    expect(toTransform(100, 50, 0, 20, 10)).toBe("translate3d(90px, 45px, 0) rotate(0rad)");
  });
});

describe("PhysicsStage", () => {
  it("enters live mode after mount when reduced motion is not set", async () => {
    render(<PhysicsStage ariaLabel="Bakverk som faller" items={bakeryItems()} />);

    const region = await screen.findByRole("region", { name: "Bakverk som faller" });
    await waitFor(() => {
      expect(region.getAttribute("data-physics-mode")).toBe("live");
    });
    expect(region.querySelectorAll("[data-physics-item]")).toHaveLength(BAKERY.length);
    expect(screen.getByRole("button", { name: "Starta om" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pausa" })).toBeTruthy();

    await waitFor(() => {
      const item = region.querySelector("[data-physics-item]") as HTMLElement | null;
      expect(item?.style.transform).toBeTruthy();
    });
  });

  it("renders a static grid under prefers-reduced-motion", () => {
    installMatchMedia(true);
    render(<PhysicsStage ariaLabel="Bakverk som faller" items={bakeryItems()} />);

    const region = screen.getByRole("region", { name: "Bakverk som faller" });
    expect(region.getAttribute("data-physics-mode")).toBe("static");
    expect(region.querySelectorAll("li")).toHaveLength(BAKERY.length);
    expect(screen.queryByRole("button", { name: "Starta om" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    for (const label of BAKERY) {
      expect(region.textContent).toContain(label);
    }
  });

  it("live mode drives at most 30 data-physics-item elements", async () => {
    render(<PhysicsStage ariaLabel="Många bakverk" items={bakeryItems(40)} />);

    const region = await screen.findByRole("region", { name: "Många bakverk" });
    await waitFor(() => {
      expect(region.getAttribute("data-physics-mode")).toBe("live");
    });
    expect(region.querySelectorAll("[data-physics-item]")).toHaveLength(30);
  });

  it("pause toggles aria-pressed and label; reset does not throw", async () => {
    render(<PhysicsStage ariaLabel="Bakverk som faller" items={bakeryItems()} />);
    await waitFor(() => {
      expect(screen.getByRole("region").getAttribute("data-physics-mode")).toBe("live");
    });

    const pause = screen.getByRole("button", { name: "Pausa" });
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pause);
    const resume = screen.getByRole("button", { name: "Fortsätt" });
    expect(resume.getAttribute("aria-pressed")).toBe("true");
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Starta om" }))).not.toThrow();
  });

  it("unmount does not throw and cancels the frame loop", async () => {
    const { unmount } = render(
      <PhysicsStage ariaLabel="Bakverk som faller" items={bakeryItems()} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("region").getAttribute("data-physics-mode")).toBe("live");
    });
    expect(() => unmount()).not.toThrow();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe("createPhysicsScene", () => {
  it("creates item bodies plus three walls, resizes walls only, steps, resets, and destroys", () => {
    const items = [
      { id: "kanel", width: 80, height: 40, shape: "box" as const },
      { id: "semla", width: 60, height: 60, shape: "circle" as const },
    ];
    const scene = createPhysicsScene({
      stageWidth: 400,
      stageHeight: 300,
      items,
    });

    expect(scene.engine.world.bodies).toHaveLength(items.length + 3);
    expect(scene.bodies.size).toBe(items.length);
    expect(scene.engine.world.bodies.filter((body) => body.isStatic)).toHaveLength(3);

    scene.resizeBounds(520, 360);
    expect(scene.engine.world.bodies.filter((body) => !body.isStatic)).toHaveLength(items.length);
    expect(scene.engine.world.bodies.filter((body) => body.isStatic)).toHaveLength(3);
    expect(scene.bodies.size).toBe(items.length);

    const body = scene.bodies.get("kanel");
    expect(body).toBeTruthy();
    const spawnY = body!.position.y;
    scene.step(16);
    expect(body!.position.y).toBeGreaterThan(spawnY);
    scene.reset();
    expect(body!.position.y).toBe(spawnY);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const detach = scene.attachMouse(host);
    expect(typeof detach).toBe("function");
    detach();
    host.remove();

    scene.destroy();
    expect(scene.engine.world.bodies).toHaveLength(0);
  });
});
