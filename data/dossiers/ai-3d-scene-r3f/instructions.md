# When to use

Use this dossier whenever the prompt or follow-up requests:
- A 3D object, mesh, model, or scene anywhere on the page
- Hovering, floating, orbiting, spinning, or animated visual elements with depth
- Product visualisation (book, package, device, mockup) above static content
- A hero section with WebGL atmosphere
- "som flyger / hovrar / svävar / roterar" (Swedish: flies / hovers / floats / rotates)

If the user only asks for a 2D illustration, SVG, Lottie, or CSS animation — DO NOT use this dossier. R3F adds ~150 KB and a WebGL context.

# How to integrate

## 1. Dependencies (CRITICAL — version-pin compatible peers)

These three packages are version-sensitive. Mismatched majors crash at build or runtime with peer-dep warnings or "Cannot find module" errors. Use exactly this combo:

```json
{
  "three": "^0.170.0",
  "@react-three/fiber": "^9.0.0",
  "@react-three/drei": "^10.0.0"
}
```

Add them to `package.json` `dependencies`. Never mix `@react-three/fiber@9` with `@react-three/drei@9` — drei v9 is for fiber v8.

## 2. Wrap the Canvas in a Client Component

WebGL only runs in the browser. The `<Canvas>` from `@react-three/fiber` MUST live inside a Client Component (file starts with `"use client"`). Server Components cannot render WebGL.

Copy `components/floating-scene.tsx` from this dossier:

```tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls, Environment } from "@react-three/drei";
import { Suspense } from "react";
import { FloatingMesh } from "@/components/floating-mesh";

export function FloatingScene({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        className="motion-reduce:hidden"
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <Float speed={1.5} rotationIntensity={0.6} floatIntensity={1.2}>
            <FloatingMesh />
          </Float>
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}
```

## 3. SELF-CONTAINMENT RULE (most common bug)

If you `import { SomeMesh } from "@/components/some-mesh"` you MUST also generate `components/some-mesh.tsx` in the same response. Never import a mesh component "from the air" — the runtime cross-file-import-checker will create an empty stub and your 3D scene will be invisible.

Copy `components/floating-mesh.tsx` from this dossier as the starting mesh:

```tsx
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

export function FloatingMesh() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.4;
    meshRef.current.rotation.x += delta * 0.15;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[1.6, 2.2, 0.25]} />
      <meshStandardMaterial color="#d4a373" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}
```

Adapt the geometry to the request: book = thin box, planet = sphere, package = box, etc. Stay within `boxGeometry`, `sphereGeometry`, `cylinderGeometry`, `planeGeometry`, `torusGeometry` unless the user demands a real GLB model (then use `useGLTF` from drei + a public asset URL).

## 4. Mount in a page or section

Server Component can import a Client Component fine:

```tsx
import { FloatingScene } from "@/components/floating-scene";

export default function Page() {
  return (
    <section className="relative h-[420px]">
      <FloatingScene className="absolute inset-0 -z-10" />
      <div className="relative z-10">
        {/* hero copy goes here, scene floats behind */}
      </div>
    </section>
  );
}
```

# UX rules

- **Always include `aria-hidden="true"`** on the Canvas wrapper — screen readers should not announce decorative 3D.
- **Respect `prefers-reduced-motion`** — the example uses Tailwind's `motion-reduce:hidden` so the scene disappears for users who opt out. Provide a static fallback (image, gradient, or empty space).
- **Lazy-load on heavy pages** — wrap with `next/dynamic({ ssr: false })` if the scene is below-the-fold or on a route with critical LCP budget.
- **Mobile**: keep `dpr={[1, 2]}` (auto) and avoid more than 1 mesh on mobile. Heavy scenes destroy battery.
- **Performance**: never render multiple `<Canvas>` on the same page — use one Canvas and put multiple meshes inside it.

# Avoid

- **DO NOT mix versions** — `@react-three/fiber@^9` requires `@react-three/drei@^10` and `three@^0.170`. Mixing v9 drei with v9 fiber breaks builds. This is the #1 reason 3D dossiers fail in Sajtmaskin.
- **DO NOT put `<Canvas>` in a Server Component** — it crashes during SSR with "window is not defined".
- **DO NOT import mesh components without generating them** — autofix's stub generator will silently insert an empty file and the scene will render nothing.
- **DO NOT use `useFrame` outside a child of `<Canvas>`** — it throws "R3F: Hooks can only be used within the Canvas component!".
- **DO NOT load real GLB/GLTF models from arbitrary URLs** unless the user provides one — broken URLs cause Suspense to never resolve.

# Verification

- [ ] `package.json` shows exactly: `three@^0.170`, `@react-three/fiber@^9`, `@react-three/drei@^10` — no v9 drei
- [ ] Every imported mesh component (e.g. `BookMesh`, `PlanetMesh`) has a corresponding file in `components/` with a default or named export matching the import
- [ ] Canvas wrapper file starts with `"use client"`
- [ ] Preview shows the rotating/floating object (open browser, look behind / above the hero)
- [ ] No console errors about peer deps or `window is not defined`

---

**Source:** Hand-curated by Sajtmaskin team, 2026-04-17.
**R3F docs:** https://docs.pmnd.rs/react-three-fiber/getting-started/installation
**drei catalog:** https://github.com/pmndrs/drei
