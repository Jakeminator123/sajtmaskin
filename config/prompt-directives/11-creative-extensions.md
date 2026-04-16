# Creative Extensions
<!-- directive: creative-extensions -->
<!-- cascade: explicit > indicated > inferred > default -->

This directive governs non-standard visual capabilities that go beyond typical website generation. These are activated when the brief, prompt, or capability map indicates the need.

## 3D / WebGL (React Three Fiber)
<!-- activation: capability-map includes "3d" or prompt mentions 3D/WebGL/Three.js -->

- Use **`"use client"`** on any module that mounts `<Canvas>` or physics.
- Default stack: **`@react-three/fiber` + `@react-three/drei` + `three`**. For **physics / gravity**, add **`@react-three/rapier`** (`Physics`, `RigidBody`, colliders). Do not confuse **Lucide** tree icons (`TreePine`, etc.) with 3D objects — Lucide is 2D UI only.
- **GLB/GLTF:** `useGLTF` from drei; static assets under `public/`.
- If the scaffold baseline already includes `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, or `@react-three/drei`, do **not** repin or downgrade them in `package.json`. Keep scaffold baseline versions as the source of truth and only add missing packages.
- When the user requests a 3D element (figure, scene, object, animation, character), ALWAYS implement it as a React Three Fiber `<Canvas>` scene with real geometry, materials, and lighting — **never** as a placeholder SVG, `<img>`, or `next/image`. If the requested 3D content is too complex to model precisely (e.g. a detailed human figure), create a simplified but real Three.js version: a stylized shape, abstract geometry, floating text mesh, or particle system that conveys the intended theme. A simple rotating 3D object is always better than a flat placeholder image.
- For 3D: `"use client"` on Canvas modules; `@react-three/fiber` + `drei` + `three`; do not repin versions the scaffold already pins.

## Particle Systems
<!-- activation: prompt mentions particles, confetti, snow, fireflies, stars -->

- Use CSS `@keyframes` for simple particle effects (floating dots, snow, confetti).
- For complex particle systems, use `@react-three/fiber` with custom shaders or `drei` helpers.
- Always respect `prefers-reduced-motion` — disable or simplify particles in reduced motion mode.

## Parallax & Scroll Effects
<!-- activation: prompt mentions parallax, scroll-driven, scroll-reveal -->

- Prefer CSS `scroll-timeline` or `animation-timeline: scroll()` for lightweight scroll-driven effects.
- For complex parallax, framer-motion's `useScroll` + `useTransform` is the approved pattern.
- Never use heavy scroll-hijacking libraries that break native scroll behavior.

## Custom Visual Effects
<!-- activation: prompt mentions smoke, fire, grain, glitch, neon-glow, vintage-film, etc. -->

- Use CSS `@keyframes` in globals.css freely for atmospheric effects.
- Use `framer-motion` for complex motion sequences.
- Layer CSS techniques: gradients, `mix-blend-mode`, `backdrop-filter`, `clip-path`, CSS masks, pseudo-elements.
- Prioritize the requested atmosphere over generic polished defaults.
- Always respect `prefers-reduced-motion` via `motion-safe:` / `motion-reduce:`.
