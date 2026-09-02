"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  type PhysicsItemSpec,
  type PhysicsShape,
  PHYSICS_MAX_BODIES,
  clampBodyCount,
  toTransform,
} from "./physics-2d-layout";
import { createPhysicsScene, type PhysicsSceneHandle } from "./physics-2d-scene";

export interface PhysicsStageItem {
  id: string;
  shape?: PhysicsShape;
  className?: string;
  children: ReactNode;
}

export interface PhysicsStageProps {
  items: PhysicsStageItem[];
  ariaLabel: string;
  className?: string;
  height?: number;
  gravity?: number;
  restitution?: number;
  interactive?: boolean;
  showControls?: boolean;
  maxBodies?: number;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FALLBACK_ITEM_WIDTH = 120;
const FALLBACK_ITEM_HEIGHT = 80;
const FALLBACK_STAGE_WIDTH = 600;

const CONTROL_CLASS =
  "rounded-md bg-background/80 px-3 py-1.5 text-sm shadow ring-1 ring-border backdrop-blur hover:bg-background";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isMotionBlocked(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function measureItem(el: HTMLElement | undefined): { width: number; height: number } {
  const rect = el?.getBoundingClientRect();
  const width = rect && rect.width > 0 ? rect.width : FALLBACK_ITEM_WIDTH;
  const height = rect && rect.height > 0 ? rect.height : FALLBACK_ITEM_HEIGHT;
  return { width, height };
}

function writeTransforms(
  scene: PhysicsSceneHandle,
  specs: PhysicsItemSpec[],
  refs: Map<string, HTMLElement>,
): void {
  for (const spec of specs) {
    const body = scene.bodies.get(spec.id);
    const el = refs.get(spec.id);
    if (!body || !el) continue;
    el.style.transform = toTransform(
      body.position.x,
      body.position.y,
      body.angle,
      spec.width,
      spec.height,
    );
  }
}

export function PhysicsStage({
  items,
  ariaLabel,
  className,
  height = 480,
  gravity,
  restitution,
  interactive = true,
  showControls = true,
  maxBodies = PHYSICS_MAX_BODIES,
}: PhysicsStageProps) {
  const [sceneFailed, setSceneFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const motionBlocked = useSyncExternalStore(
    subscribeReducedMotion,
    isMotionBlocked,
    () => true,
  );

  const physicsItems = items.slice(0, clampBodyCount(items.length, maxBodies));
  const physicsKey = physicsItems.map((item) => `${item.id}:${item.shape ?? "box"}`).join("|");
  const mode: "static" | "live" = motionBlocked || sceneFailed ? "static" : "live";

  const stageRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const sceneRef = useRef<PhysicsSceneHandle | null>(null);
  const specsRef = useRef<PhysicsItemSpec[]>([]);
  const pausedRef = useRef(paused);
  const warnedFallbackRef = useRef(false);
  const physicsItemsRef = useRef(physicsItems);

  useEffect(() => {
    pausedRef.current = paused;
    physicsItemsRef.current = physicsItems;
  });

  useEffect(() => {
    if (mode !== "live") return;
    const stage = stageRef.current;
    if (!stage) return;

    const specs: PhysicsItemSpec[] = physicsItemsRef.current.map((item) => {
      const size = measureItem(itemRefs.current.get(item.id));
      return {
        id: item.id,
        width: size.width,
        height: size.height,
        shape: item.shape ?? "box",
      };
    });
    specsRef.current = specs;

    const stageRect = stage.getBoundingClientRect();
    const stageWidth = stage.clientWidth || stageRect.width || FALLBACK_STAGE_WIDTH;

    let scene: PhysicsSceneHandle;
    try {
      scene = createPhysicsScene({
        stageWidth,
        stageHeight: height,
        items: specs,
        gravity,
        restitution,
      });
    } catch (error) {
      if (!warnedFallbackRef.current) {
        warnedFallbackRef.current = true;
        console.warn("PhysicsStage: Matter scene failed, rendering a static grid.", error);
      }
      setSceneFailed(true);
      return;
    }

    sceneRef.current = scene;
    writeTransforms(scene, specs, itemRefs.current);

    let detachMouse: (() => void) | undefined;
    if (interactive) {
      detachMouse = scene.attachMouse(stage);
    }

    let offscreen = false;
    let hidden = document.hidden;
    const onVisibility = () => {
      hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        offscreen = entries[0] ? !entries[0].isIntersecting : false;
      });
      io.observe(stage);
    }

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (!box || box.width <= 0) return;
        scene.resizeBounds(box.width, box.height || height);
      });
      ro.observe(stage);
    }

    let cancelled = false;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (cancelled) return;
      frame = requestAnimationFrame(tick);
      if (last === null) last = now;
      if (pausedRef.current || hidden || offscreen) {
        last = now;
        return;
      }
      scene.step(now - last);
      last = now;
      writeTransforms(scene, specs, itemRefs.current);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      detachMouse?.();
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.destroy();
      sceneRef.current = null;
    };
  }, [mode, physicsKey, height, gravity, restitution, interactive, maxBodies]);

  const handleReset = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.reset();
    writeTransforms(scene, specsRef.current, itemRefs.current);
  };

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      className={className}
      data-physics-mode={mode}
    >
      {mode === "static" ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className={item.className}>
              {item.children}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div
            ref={stageRef}
            className="relative overflow-hidden rounded-xl border bg-muted/30 touch-none select-none"
            style={{ height }}
          >
            {physicsItems.map((item) => (
              <div
                key={item.id}
                data-physics-item={item.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.id, el);
                  else itemRefs.current.delete(item.id);
                }}
                className={["absolute left-0 top-0 will-change-transform", item.className]
                  .filter(Boolean)
                  .join(" ")}
              >
                {item.children}
              </div>
            ))}
          </div>
          {showControls ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button type="button" className={CONTROL_CLASS} onClick={handleReset}>
                Starta om
              </button>
              <button
                type="button"
                className={CONTROL_CLASS}
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? "Fortsätt" : "Pausa"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
