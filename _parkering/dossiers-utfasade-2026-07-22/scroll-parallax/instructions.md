# When to use

Use this dossier whenever the brief asks for **scroll-driven parallax**, layered scroll effects, or "as you scroll, X moves slower/faster than Y". Triggers (Swedish + English): `parallax`, `scroll-parallax`, `scroll-effekt`, `scroll-driven`, `scroll-paralaks`, `parallax på scroll`, `pinned section`, `sticky parallax`, `layered scroll`.

Best fit:

- Hero background images that drift up slower than foreground text as you scroll.
- Layered SVG/illustration columns where each layer moves at a different speed.
- Section-pinned reveals where one element fades/translates as the section enters the viewport.

Do not use for:

- Pointer/mouse-driven parallax — use the sibling `pointer-parallax` dossier instead.
- 3D scenes that should respond to scroll — wrap the canvas in `ThreeCanvasShell` (from `three-fiber-canvas` dossier) and connect a single `useScroll` instance shared via a context if you really need both.
- Pure entrance animations (fade-in on mount) — use plain framer-motion `<motion.div initial animate>` without scroll mapping.

# How to integrate

Wrap any layer in `ScrollParallaxLayer`. The component owns three production-required concerns the codegen LLM otherwise tends to miss:

1. **Reduced-motion respect** — when `prefers-reduced-motion: reduce` matches, the component renders the children at their **end-state** transform without any scroll mapping. The layer is still visible — never returns `null`.
2. **Viewport-unit defaults** — `outputRange` accepts `[startVh, endVh]` style values so the effect scales across breakpoints rather than being pixel-pinned to one viewport size.
3. **Single `useScroll` per target** — passes the user-supplied `targetRef` to `useScroll({ target, offset })` so multiple layers on the same section share a scroll calculation cheaply.

```tsx
"use client";

import { useRef } from "react";
import Image from "next/image";
import { ScrollParallaxLayer } from "@/components/scroll-parallax-layer";

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={sectionRef} className="relative h-[120vh] overflow-hidden">
      <ScrollParallaxLayer
        targetRef={sectionRef}
        translateYRange={[-12, 12]}
        opacityRange={[1, 0.4]}
        className="absolute inset-0"
      >
        <Image src="/hero-bg.jpg" alt="" fill className="object-cover" priority />
      </ScrollParallaxLayer>

      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-32">
        <h1 className="text-balance text-5xl font-semibold">Slow & deliberate</h1>
      </div>
    </section>
  );
}
```

# API contract

```tsx
type Range = [number, number];

interface ScrollParallaxLayerProps {
  /** Ref to the section that drives the scroll progress. Required. */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Children rendered inside the parallax layer. */
  children: React.ReactNode;
  /** Translation in viewport-height percent. Default [-8, 8]. */
  translateYRange?: Range;
  /** Optional opacity mapping over the same scroll progress. */
  opacityRange?: Range;
  /** Optional scale mapping. Default disabled. */
  scaleRange?: Range;
  /**
   * `useScroll`'s offset prop. Default `["start end", "end start"]` so the
   * effect runs from when the section first appears to when it leaves.
   */
  offset?: [string, string];
  /** Forwarded to the wrapper div. */
  className?: string;
}
```

# Composition rules (the LLM should follow these without being asked)

- One `targetRef` can drive multiple `ScrollParallaxLayer` siblings inside the same section. Don't create one ref per layer — that breaks the shared scroll progress.
- Heavy layers (full-screen `<Image>`, R3F canvas, video) should be **inside** the parallax wrapper, not the wrapper inside them. The wrapper is `<motion.div>`, lightweight.
- Always set `overflow-hidden` on the parent section so the translated layer doesn't bleed into adjacent sections.
- Put `pointer-events-none` on decorative parallax layers (background images) so they don't steal clicks from foreground content.
- Never put a `ScrollParallaxLayer` inside another `ScrollParallaxLayer` — the inner transform will compound and look broken.

# Reduced-motion behavior (do not break this)

The wrapper reads `prefers-reduced-motion: reduce` once on mount via `window.matchMedia`. When set:

- `translateY`, `scale` and `opacity` mappings are bypassed.
- The layer renders children at their visual end-state (i.e. translateY = 0, opacity = max of the range, scale = 1).
- Never apply `motion-reduce:hidden` or any class that hides the parallax layer entirely — keep the content visible, just static. (This mirrors the same trap covered by the `three-fiber-canvas` dossier.)
