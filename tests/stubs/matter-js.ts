/**
 * Test stub for `matter-js` — a dependency of the GENERATED site (the
 * matter-physics-2d dossier ships it via manifest `dependencies`), not of this
 * repo. Dossier components import named Engine/Bodies/Body helpers at module
 * top, so unit tests and `tsc` need the import to resolve. Wired via the
 * `matter-js` alias in `vitest.config.ts` and `tsconfig.json` (see
 * tests/stubs/README.md). Every export is an inert, typed stand-in of the
 * subset the dossier actually touches.
 *
 * Deliberately NOT used by the warm-cache pre-VM typecheck: that pass drops
 * undecidable module errors instead (`src/lib/gen/preview/generated-only-modules.ts`).
 */

export interface Vector {
  x: number;
  y: number;
}

export interface Body {
  id: number;
  label: string;
  position: Vector;
  angle: number;
  velocity: Vector;
  angularVelocity: number;
  isStatic: boolean;
}

export interface World {
  bodies: Body[];
  constraints: unknown[];
}

export interface Engine {
  world: World;
  gravity: { x: number; y: number; scale: number };
}

export interface Mouse {
  element: HTMLElement;
  mousewheel: EventListener;
  pixelRatio: number;
}

export interface MouseConstraint {
  mouse: Mouse;
  constraint: unknown;
}

interface BodyOptions {
  isStatic?: boolean;
  label?: string;
  restitution?: number;
  friction?: number;
}

let nextBodyId = 1;

function createBody(x: number, y: number, opts?: BodyOptions): Body {
  return {
    id: nextBodyId++,
    label: opts?.label ?? "",
    position: { x, y },
    angle: 0,
    velocity: { x: 0, y: 0 },
    angularVelocity: 0,
    isStatic: opts?.isStatic ?? false,
  };
}

function isBody(value: unknown): value is Body {
  return (
    typeof value === "object" &&
    value !== null &&
    "position" in value &&
    "velocity" in value &&
    "isStatic" in value
  );
}

export const Engine = {
  create(opts?: { gravity?: { x?: number; y?: number; scale?: number } }): Engine {
    return {
      world: { bodies: [], constraints: [] },
      gravity: {
        x: opts?.gravity?.x ?? 0,
        y: opts?.gravity?.y ?? 1,
        scale: opts?.gravity?.scale ?? 0.001,
      },
    };
  },
  update(engine: Engine, _delta?: number): void {
    for (const body of engine.world.bodies) {
      if (body.isStatic) continue;
      body.position = { x: body.position.x, y: body.position.y + 1 };
    }
  },
  clear(engine: Engine): void {
    engine.world.bodies = [];
    engine.world.constraints = [];
  },
};

export const Bodies = {
  rectangle(x: number, y: number, _w: number, _h: number, opts?: BodyOptions): Body {
    return createBody(x, y, opts);
  },
  circle(x: number, y: number, _r: number, opts?: BodyOptions): Body {
    return createBody(x, y, opts);
  },
};

export const Body = {
  setPosition(body: Body, position: Vector): void {
    body.position = { x: position.x, y: position.y };
  },
  setVelocity(body: Body, velocity: Vector): void {
    body.velocity = { x: velocity.x, y: velocity.y };
  },
  setAngle(body: Body, angle: number): void {
    body.angle = angle;
  },
  setAngularVelocity(body: Body, angularVelocity: number): void {
    body.angularVelocity = angularVelocity;
  },
  setStatic(body: Body, isStatic: boolean): void {
    body.isStatic = isStatic;
  },
};

type CompositeMember = Body | MouseConstraint | unknown;

export const Composite = {
  add(world: World, bodyOrBodies: CompositeMember | CompositeMember[]): void {
    const list = Array.isArray(bodyOrBodies) ? bodyOrBodies : [bodyOrBodies];
    for (const item of list) {
      if (isBody(item)) world.bodies.push(item);
      else world.constraints.push(item);
    }
  },
  remove(world: World, bodyOrBodies: CompositeMember | CompositeMember[]): void {
    const list = Array.isArray(bodyOrBodies) ? bodyOrBodies : [bodyOrBodies];
    for (const item of list) {
      if (isBody(item)) world.bodies = world.bodies.filter((body) => body !== item);
      else world.constraints = world.constraints.filter((constraint) => constraint !== item);
    }
  },
  clear(world: World, keepStatic?: boolean): void {
    world.bodies = keepStatic ? world.bodies.filter((body) => body.isStatic) : [];
    world.constraints = [];
  },
};

export const Mouse = {
  create(element: HTMLElement): Mouse {
    const mousewheel: EventListener = () => {};
    element.addEventListener("wheel", mousewheel);
    element.addEventListener("mousewheel", mousewheel);
    element.addEventListener("DOMMouseScroll", mousewheel);
    return { element, mousewheel, pixelRatio: 1 };
  },
};

export const MouseConstraint = {
  create(_engine: Engine, opts: { mouse: Mouse; constraint?: unknown }): MouseConstraint {
    return { mouse: opts.mouse, constraint: opts.constraint ?? {} };
  },
};

const MatterJs = {
  Engine,
  Bodies,
  Body,
  Composite,
  Mouse,
  MouseConstraint,
};

export default MatterJs;
