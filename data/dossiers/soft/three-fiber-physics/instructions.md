# When to use

Use only when the user explicitly asks for physics-driven 3D: bouncing, falling, gravity, collisions, rigid bodies, colliders, Rapier, Cannon, or a physics simulation.

Do not use for decorative hover, floating, orbiting, levitating, product rotation, gentle bobbing, parallax or mascot motion. Those should stay in the `visual-3d` dossier with `useFrame`, transforms and drei helpers such as `Float`.

# How to integrate

- Keep the SSR-safe `ThreeCanvasShell` from the `visual-3d` dossier as the Canvas boundary.
- Put physics inside the child scene component, not inside `app/page.tsx`.
- Import `Physics`, `RigidBody` and colliders from `@react-three/rapier` only in the scene file that needs simulation.
- Use a small number of bodies and simple collider shapes. Prefer primitive geometry and avoid heavy GLTF physics unless the user explicitly provided assets.
- Provide a non-physics fallback pose so reduced-motion and WebGL fallback still show the object.

# Minimal pattern

```tsx
"use client";

import { Physics, RigidBody } from "@react-three/rapier";

export function PhysicsScene() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
      <Physics gravity={[0, -3, 0]}>
        <RigidBody restitution={0.7} colliders="ball">
          <mesh>
            <sphereGeometry args={[0.6, 32, 32]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </RigidBody>
      </Physics>
    </>
  );
}
```

# UX rules

- Keep physics scenes decorative unless the user explicitly asks for a game or simulator.
- Respect reduced-motion by keeping the scene readable without continuous simulation.
- Cap body count aggressively; a hero scene should usually have 1-5 dynamic bodies.
- Keep controls accessible from surrounding DOM UI. Do not hide important copy inside WebGL.

# Avoid

- Do not add `@react-three/rapier` for “hovrande”, “svävande”, “floating”, “hovering”, “levitating” or product turntable prompts unless the prompt also mentions gravity, falling, bouncing or collisions.
- Do not wrap the entire page in `<Physics>`.
- Do not use physics to fake ordinary CSS hover states or DOM animation.

# Verification

- Confirm `package.json` includes `@react-three/rapier` only for physics-driven prompts.
- Run the page with reduced motion enabled and verify the object remains visible.
- If the physics scene fails to initialize, the surrounding `ThreeCanvasShell` fallback must still render.
