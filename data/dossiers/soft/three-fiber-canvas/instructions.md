# When to use

Use this dossier whenever the brief mentions 3D, three.js, WebGL, an animated mascot/hero element, a rotating object, or a "playful" interactive scene. Triggers: `3d`, `three`, `webgl`, `animerad`, `roterande`, `flygande`, `hovrande`, `mascot`, `alien`, `köttbulle`, `figur`, `objekt`.

Best fit:

- A small decorative 3D element on the landing-page hero (alien, mascot, fruit, planet, abstract shape).
- A "responsive to mouse" floating object — use `useFrame` + a pointer-state hook to lerp the mesh toward the cursor.
- An interactive product preview where the user can rotate a model.

Do not use for:

- Static images that happen to look 3D-ish (use a regular `<img>` or `<svg>` instead — much smaller bundle).
- Heavy CAD-style scenes with many models — those need a dedicated viewer with model loader/cache that is outside the scope of this dossier.
- Background video loops (those should use `<video>` tags, not WebGL).

# How to integrate

Wrap any scene in `ThreeCanvasShell`. The shell handles four production-required concerns the codegen LLM otherwise tends to miss:

1. **SSR-safety** — `Canvas` references `window`/`document` at module load and crashes Next.js Server Components. The shell wraps the dynamic import with `{ ssr: false }`.
2. **Error boundary** — WebGL contexts can be lost (driver crash, tab backgrounded too long). Without a boundary the entire page unmounts. The shell renders a still fallback when context is lost.
3. **Reduced-motion + mobile fallback** — respects `prefers-reduced-motion` and skips animation frames; on detected low-end devices the canvas downgrades to a static fallback image/element.
4. **Renderer disposal** — calls `gl.dispose()` on unmount so WebGL memory is released when navigating away.

```tsx
// app/page.tsx
import { ThreeCanvasShell } from "@/components/three-canvas-shell";

export default function HomePage() {
  return (
    <header className="relative">
      <h1>Welcome to Bönan & Boken</h1>
      <ThreeCanvasShell
        className="h-40 w-40"
        ariaLabel="Decorative animated mascot"
        fallback={<div className="h-40 w-40 rounded-full bg-amber-100" />}
      >
        <YourScene />
      </ThreeCanvasShell>
    </header>
  );
}
```

`three-canvas-shell.tsx` is emitted verbatim by the dossier pipeline. Do **not** rewrite that shell, rename its export, remove the dynamic Canvas import, or inline Canvas directly in `app/page.tsx`. The shell is the safety boundary (SSR, error boundary, reduced-motion, DPR cap). Write the actual scene as a separate child component and place that child inside `ThreeCanvasShell`.

A typical scene looks like:

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

export function YourScene() {
  const meshRef = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.4;
    meshRef.current.position.y = Math.sin(Date.now() * 0.001) * 0.1;
  });
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
    </>
  );
}
```

Mouse-responsive scenes should use a small client-only hook that records pointer state, then lerp the mesh toward it inside `useFrame`. Keep the hook in a separate file (`components/pointer-state.tsx`) so the wrapper stays generic.

# Allowed primitives (allowlist)

The scene may ONLY use the following. Anything else is almost certainly a hallucination — do NOT invent component names.

**Lowercase R3F intrinsics (preferred for mascots / hero decor — zero extra imports needed):**

- Meshes: `<mesh>`, `<group>`, `<points>`, `<lineSegments>`.
- Geometries: `<boxGeometry>`, `<sphereGeometry>`, `<planeGeometry>`, `<cylinderGeometry>`, `<coneGeometry>`, `<torusGeometry>`, `<torusKnotGeometry>`, `<capsuleGeometry>`, `<ringGeometry>`, `<tetrahedronGeometry>`, `<icosahedronGeometry>`, `<octahedronGeometry>`, `<dodecahedronGeometry>`.
- Materials: `<meshStandardMaterial>`, `<meshBasicMaterial>`, `<meshPhongMaterial>`, `<meshNormalMaterial>`, `<meshMatcapMaterial>`, `<meshLambertMaterial>`, `<shaderMaterial>`, `<lineBasicMaterial>`, `<pointsMaterial>`.
- Lights: `<ambientLight>`, `<directionalLight>`, `<pointLight>`, `<spotLight>`, `<hemisphereLight>`.

**Capitalised helpers — ONLY if explicitly imported from `@react-three/drei`** (import exactly what you use, nothing else):

```tsx
import {
  Box, Sphere, Plane, Cylinder, Cone, Torus, TorusKnot, Capsule, Ring,
  Tetrahedron, Icosahedron, Octahedron, Dodecahedron,
  OrbitControls, PerspectiveCamera, OrthographicCamera,
  Environment, ContactShadows, Float, Html, Text, Billboard,
  MeshDistortMaterial, MeshWobbleMaterial, MeshTransmissionMaterial,
} from "@react-three/drei";
```

**Avoid entirely (these names do NOT exist in `three`, `@react-three/fiber`, or `@react-three/drei`):**

- `Cuboid`, `Cube`, `Block`, `Box3d`, `Sphere3d`, `Prism`, `Rectangle3d`, `Cylinder3d` — none of these exist. Use `<mesh><boxGeometry />...</mesh>` or `Box` from drei.
- `Lucide`, `Icon3d`, `Emoji3d`, any generic wrapper name you cannot find in the import list above — they are hallucinations.
- `RigidBody`, `Cuboid` (as a physics collider), `Ball` from `@react-three/rapier` — do NOT add physics. This dossier is for decorative animation only.

Rule of thumb: every capitalised JSX tag in the generated scene MUST have a corresponding `import` statement at the top of the file. No exceptions. If you cannot remember the exact import, fall back to the lowercase `<mesh>` + `<xGeometry />` + `<xMaterial />` pattern shown in the scene example above.

# UX rules

- Decorative elements MUST be marked `aria-hidden="true"` (set via `ariaLabel=""` or via the `decorative` prop) so screen readers do not announce them.
- Cap `dpr={[1, 1.5]}` on the `Canvas` — going to `2` on retina is a substantial battery hit on mobile for marginal visual gain.
- Use `frameloop="demand"` only when the scene is truly idle — for ambient animations leave it on `always`.
- Keep the canvas size bounded (`h-40 w-40`, `max-h-screen`, etc). A full-bleed canvas is a memory bomb on mobile.
- Prefer `meshStandardMaterial` over `meshPhysicalMaterial` for hero mascots — physical materials are 3-4× more expensive.

# Avoid

- Do not import `Canvas` directly in a Server Component file. Always go via this shell or a `dynamic(() => ..., { ssr: false })` wrapper of your own.
- Do not skip the error boundary. WebGL context loss is silent in dev but real in prod (especially on Safari and low-end Android).
- Do not animate inside `useEffect` — use `useFrame`. `useEffect` will not pause when the tab is hidden.
- Do not call `useState` inside `useFrame`. State updates trigger re-renders; use refs (`useRef`) for animation-only values.
- Do not load `.gltf` or `.glb` files unless absolutely necessary — they require `useGLTF` from `@react-three/drei`, suspense, and a fetch round-trip. For mascots, primitive geometries (sphere, box, torus, capsule) plus material variation usually look better and load instantly.
- Do not put the canvas inside a Tailwind `overflow-hidden`-only container without explicit dimensions — the canvas will collapse to 0×0.

# Verification

- View the page on a server-rendered build (`next build && next start`). The first HTML response should NOT include any `Canvas`/`r3f` markup — only the fallback. The canvas should hydrate after.
- Disable WebGL in dev tools (chrome://flags or about:config). The page should render the fallback without crashing.
- Force `prefers-reduced-motion: reduce` in dev tools. The canvas should still mount but not animate.
- Resize the browser to 320×640 (mobile). FPS should stay above 50 on a mid-range laptop. If not, drop the geometry segment count or remove the second light.
- Check memory: navigate away from the page, then back. Take a heap snapshot — there should be no growing pool of `WebGLRenderer` instances.
