# When to use

Use this dossier only when the brief explicitly asks for Matter.js / 2D DOM physics: product images, cards or labels that fall, stack, bounce, collide and can be dragged. Triggers (Swedish + English): `Matter.js`, `2D-fysik`, `2D physics`, `DOM-fysik`, `DOM physics`, fysikdrivna kort/bilder, fallande, staplande, studsande eller kolliderande objekt som kan dras, kastbara kort.

Best fit:

- A bakery's product tags or a painter's colour cards that drop into a bounded stage and can be dragged.
- A small-business “our products” strip where the items themselves stay real DOM (text/images), and Matter only drives `transform`.

Do not use for:

- CSS hover / bounce, parallax, or confetti
- Drag-to-sort lists
- Three.js / Rapier / 3D (`physics-3d`)
- A game without explicit game mechanics (that is `interactive-game`, which may be combined)
- Decorative floating / hovering with no gravity or collisions

# How to integrate

Emit files 1:1 (keep them under `components/`, never `components/lib/`): `components/physics-stage.tsx` → `components/physics-stage.tsx` (import `@/components/physics-stage`); `components/physics-2d-scene.ts` → `components/physics-2d-scene.ts` (`@/components/physics-2d-scene`); `components/physics-2d-layout.ts` → `components/physics-2d-layout.ts` (`@/components/physics-2d-layout`). Add `matter-js` and `@types/matter-js` (0.20.x). Mount `PhysicsStage` with real DOM children. Live mode simulates at most `maxBodies` (default 30) items in input order; extras are omitted from the stage. The static grid lists every supplied item. Keep `physics-stage.tsx` and `physics-2d-scene.ts` verbatim. Relative imports stay `./physics-2d-scene` and `./physics-2d-layout`.

```tsx
import { PhysicsStage } from "@/components/physics-stage";

const bakverk = [
  { id: "kanel", label: "Kanelbulle" },
  { id: "kardemumma", label: "Kardemummabulle" },
  { id: "semla", label: "Semla" },
  { id: "prinsessa", label: "Prinsesstårta" },
  { id: "surdeg", label: "Surdegsbröd" },
  { id: "choklad", label: "Chokladkaka" },
];

export function BakeryPhysics() {
  return (
    <PhysicsStage ariaLabel="Bakverk som faller" height={480} items={bakverk.map((item) => ({
      id: item.id,
      className: "rounded-full bg-background px-4 py-2 text-sm shadow ring-1 ring-border",
      children: <div>{item.label}</div>,
    }))} />
  );
}
```

Pass images the same way (`<img alt="…" src="…">` or `next/image` inside `children`). Advanced call sites may import `createPhysicsScene` and `spawnPositions` from the sibling files.

# UX rules

- Stage height 360–560px (default 480). At most 30 physics bodies (`maxBodies`).
- Content stays semantic DOM and readable at rest; Matter only writes `transform`.
- `prefers-reduced-motion: reduce`, SSR, missing `matchMedia`, or a thrown scene → static grid with the same item children (no controls).
- Live controls: “Starta om” and “Pausa” / “Fortsätt”. No autoplay sound.
- Keyboard: item content stays focusable (links, buttons). Do not `tabIndex={-1}` the wrappers.
- Pause the loop when the tab is hidden, the stage is offscreen, or the user presses Pausa.

# Avoid

- Do not paraphrase `physics-stage.tsx` or `physics-2d-scene.ts` — bounded engine, wheel-listener removal, and static fallback are load-bearing.
- Do not render text or images into a canvas.
- Do not add `three`, `@react-three/fiber` or `@react-three/rapier`.
- Do not create a second engine on resize; call `resizeBounds` only.
- Do not let Matter’s mouse wheel listener hijack page scroll (`attachMouse` removes `wheel` / `mousewheel` / `DOMMouseScroll`).
- Do not exceed `maxBodies` (default 30).

# Verification

- Gravity and collisions are visible: items fall in, hit the floor and each other, and come to rest.
- Drag works with mouse and touch; the page still scrolls when the wheel is used over the stage.
- “Starta om” re-drops the items; “Pausa” / “Fortsätt” freeze and resume the loop (`aria-pressed` on Pausa).
- Resize the stage: still exactly three walls, no duplicated item bodies.
- Hide the tab or scroll the stage offscreen → the loop pauses; unmount cancels `requestAnimationFrame` and calls `destroy()`.
- `prefers-reduced-motion: reduce` (and first SSR paint) shows a grid of the same children, no controls.
