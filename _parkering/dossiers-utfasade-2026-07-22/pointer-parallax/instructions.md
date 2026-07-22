# When to use

Use this dossier whenever the brief asks for **pointer-driven** or **mouse-driven parallax**, hover-tilt, or "follows the cursor" effects. Triggers (Swedish + English): `pointer-parallax`, `mouse-parallax`, `mus-parallax`, `cursor-parallax`, `följer muspekaren`, `följer musen`, `hover tilt`, `tilt card`, `parallax på mus`, `mouse-driven motion`.

Best fit:

- Hero illustration that subtly tilts as the cursor moves over it (DOM transform).
- Layered cards/SVG illustrations where each layer drifts at a different rate based on cursor distance from center.
- React Three Fiber scenes that need the cursor signal inside `useFrame` to drive object rotation/position.

Do not use for:

- Scroll-based parallax — use the sibling `scroll-parallax` dossier instead.
- Touch-only mobile interactions — `pointermove` works for touch but the visual effect is wasted on devices that don't have a hover state. Add `@media (hover: hover)` gating in CSS or branch on `window.matchMedia("(hover: hover)")`.
- 3D scenes where the existing `three-fiber-canvas` dossier already provides camera-controls (OrbitControls). Don't fight drei controls with this hook.

# How to integrate

This dossier ships **two** primitives. Pick based on consumer:

- **DOM consumer:** wrap your visual layer in `<PointerParallaxLayer targetRef={section}>`. The wrapper applies the transform.
- **R3F / imperative consumer:** call `usePointerParallax(targetRef)` and read `pointerRef.current.x` / `pointerRef.current.y` inside `useFrame` (or a vanilla `requestAnimationFrame` loop). The returned `MutableRefObject` updates without React re-renders.

```tsx
"use client";

import { useRef } from "react";
import { PointerParallaxLayer } from "@/components/pointer-parallax-layer";

export function HeroCard() {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden p-8">
      <PointerParallaxLayer
        targetRef={sectionRef}
        intensity={12}
        rotateIntensity={4}
        className="rounded-2xl border bg-card p-10"
      >
        <h2 className="text-3xl font-semibold">Tilts toward your cursor</h2>
      </PointerParallaxLayer>
    </section>
  );
}
```

R3F bridge example:

```tsx
"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { usePointerParallax } from "@/components/use-pointer-parallax";

function Mascot({ pointerRef }: { pointerRef: ReturnType<typeof usePointerParallax> }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = pointerRef.current.x * 0.4;
    groupRef.current.rotation.x = -pointerRef.current.y * 0.3;
  });
  return <group ref={groupRef}>{/* mesh */}</group>;
}

export function MascotScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const pointerRef = usePointerParallax(sectionRef);
  return (
    <div ref={sectionRef} className="relative h-[60vh]">
      <Canvas>
        <Mascot pointerRef={pointerRef} />
      </Canvas>
    </div>
  );
}
```

# API contract

```tsx
type PointerPosition = { x: number; y: number };

/**
 * Listens to pointermove on `window` (cheap) and writes pointer position
 * normalized to [-1, 1] across the targetRef's bounding box. Returns a
 * MutableRefObject so consumers can read inside useFrame / RAF without
 * triggering React re-renders.
 *
 * Frozen at { x: 0, y: 0 } when prefers-reduced-motion: reduce.
 */
declare function usePointerParallax(
  targetRef: React.RefObject<HTMLElement | null>,
): React.MutableRefObject<PointerPosition>;

interface PointerParallaxLayerProps {
  targetRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  /** Translate intensity in pixels at pointer extremes. Default 8. */
  intensity?: number;
  /** Optional rotate intensity in degrees. Default 0 (translate-only). */
  rotateIntensity?: number;
  /** Easing factor (0..1, higher = snappier). Default 0.12. */
  damping?: number;
  className?: string;
}
```

# Composition rules (the LLM should follow these without being asked)

- One `targetRef` can drive many layers; use the same ref for all sibling parallax cards in a section.
- The hook attaches its listener to `window` with `{ passive: true }` so scroll performance is unaffected. Don't proxy through React state — that defeats the whole purpose.
- `pointer-events-none` on decorative parallax layers so they don't steal hover/click from foreground.
- For R3F scenes that already have `OrbitControls` from drei, **don't** also use this hook — they will fight for the same input. Pick one.
- Set `transform-style: preserve-3d` and `perspective` on the parent when using `rotateIntensity` so the rotation actually looks 3D.

# Reduced-motion behavior (do not break this)

- The hook clamps the returned ref to `{ x: 0, y: 0 }` when `prefers-reduced-motion: reduce` matches.
- `PointerParallaxLayer` then renders the children with no transform — they stay in their natural position rather than disappearing.
- Same anti-pattern as elsewhere: never apply `motion-reduce:hidden` or any class that hides the layer entirely.
