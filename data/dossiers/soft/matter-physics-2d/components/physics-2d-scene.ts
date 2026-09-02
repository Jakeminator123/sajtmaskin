"use client";

import { Engine, Bodies, Body, Composite, Mouse, MouseConstraint } from "matter-js";
import type {
  Body as MatterBody,
  Engine as MatterEngine,
  MouseConstraint as MatterMouseConstraint,
} from "matter-js";

import {
  type PhysicsItemSpec,
  clampBodyCount,
  spawnPositions,
} from "./physics-2d-layout";

const WALL_THICKNESS = 64;
// Matter warns above this delta and the simulation gets springy; longer frames
// are split into equal sub-steps (at most MAX_SUBSTEPS, so a paused tab does
// not fast-forward the world when it comes back).
const MAX_STEP_MS = 16.667;
const MAX_SUBSTEPS = 3;
// A circle body only fits a near-square element; a wide pill on a circle body
// would visually stick out past the walls and roll on its end.
const CIRCLE_ASPECT_TOLERANCE = 0.25;

export interface CreatePhysicsSceneParams {
  stageWidth: number;
  stageHeight: number;
  items: PhysicsItemSpec[];
  gravity?: number;
  restitution?: number;
  friction?: number;
}

export interface PhysicsSceneHandle {
  engine: MatterEngine;
  bodies: Map<string, MatterBody>;
  step(deltaMs: number): void;
  reset(): void;
  resizeBounds(width: number, height: number): void;
  attachMouse(element: HTMLElement): () => void;
  destroy(): void;
}

function createWalls(width: number, height: number): MatterBody[] {
  const t = WALL_THICKNESS;
  return [
    Bodies.rectangle(width / 2, height + t / 2, width + t * 2, t, {
      isStatic: true,
      label: "wall-floor",
    }),
    Bodies.rectangle(-t / 2, height / 2, t, height + t * 2, {
      isStatic: true,
      label: "wall-left",
    }),
    Bodies.rectangle(width + t / 2, height / 2, t, height + t * 2, {
      isStatic: true,
      label: "wall-right",
    }),
  ];
}

function createItemBody(
  item: PhysicsItemSpec,
  x: number,
  y: number,
  restitution: number,
  friction: number,
): MatterBody {
  const opts = { restitution, friction, label: item.id };
  const nearSquare =
    Math.abs(item.width - item.height) <=
    Math.min(item.width, item.height) * CIRCLE_ASPECT_TOLERANCE;
  if (item.shape === "circle" && nearSquare) {
    const radius = Math.max(Math.max(item.width, item.height) / 2, 1);
    return Bodies.circle(x, y, radius, opts);
  }
  return Bodies.rectangle(x, y, item.width, item.height, opts);
}

export function createPhysicsScene(params: CreatePhysicsSceneParams): PhysicsSceneHandle {
  const gravity = params.gravity ?? 1;
  const restitution = params.restitution ?? 0.6;
  const friction = params.friction ?? 0.3;
  const items = params.items.slice(0, clampBodyCount(params.items.length));

  const engine = Engine.create({ gravity: { x: 0, y: gravity } });
  engine.gravity.y = gravity;

  let stageWidth = params.stageWidth;
  let stageHeight = params.stageHeight;
  const representativeWidth = items.reduce((max, item) => Math.max(max, item.width), 0) || 80;

  const bodies = new Map<string, MatterBody>();
  const itemBodies: MatterBody[] = [];
  const placeItems = (width: number) => {
    const starts = spawnPositions(items.length, width, representativeWidth);
    items.forEach((item, index) => {
      const pos = starts[index] ?? { x: width / 2, y: -80 };
      const existing = bodies.get(item.id);
      if (existing) {
        Body.setPosition(existing, pos);
        Body.setVelocity(existing, { x: 0, y: 0 });
        Body.setAngle(existing, 0);
        Body.setAngularVelocity(existing, 0);
        return;
      }
      const body = createItemBody(item, pos.x, pos.y, restitution, friction);
      bodies.set(item.id, body);
      itemBodies.push(body);
    });
  };

  placeItems(stageWidth);
  let walls = createWalls(stageWidth, stageHeight);
  Composite.add(engine.world, [...walls, ...itemBodies]);

  return {
    engine,
    bodies,
    step(deltaMs: number) {
      if (!(deltaMs > 0)) return;
      const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(deltaMs / MAX_STEP_MS)));
      const dt = Math.min(deltaMs / substeps, MAX_STEP_MS);
      for (let i = 0; i < substeps; i += 1) Engine.update(engine, dt);
    },
    reset() {
      placeItems(stageWidth);
    },
    resizeBounds(width: number, height: number) {
      stageWidth = width;
      stageHeight = height;
      Composite.remove(engine.world, walls);
      walls = createWalls(width, height);
      Composite.add(engine.world, walls);
    },
    attachMouse(element: HTMLElement) {
      const mouse = Mouse.create(element);
      const mouseConstraint: MatterMouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2 },
      });
      Composite.add(engine.world, mouseConstraint);
      // Matter registers wheel listeners that steal page scroll; drop them.
      // The handler exists at runtime but is not in @types/matter-js.
      const wheelHandler = (mouse as unknown as { mousewheel?: EventListener }).mousewheel;
      if (wheelHandler) {
        mouse.element.removeEventListener("wheel", wheelHandler);
        mouse.element.removeEventListener("mousewheel", wheelHandler);
        mouse.element.removeEventListener("DOMMouseScroll", wheelHandler);
      }
      return () => {
        Composite.remove(engine.world, mouseConstraint);
      };
    },
    destroy() {
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}
