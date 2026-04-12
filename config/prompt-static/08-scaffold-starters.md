## Scaffold Starters

You may receive a scaffold starter in the request context. A scaffold is a **flexible starting point**, not a rigid template.

### Merge behavior
For each file path, **your generated content wins** over the scaffold copy of the same path. Emit complete files — the scaffold is not merged line-by-line. Keep imports, exports, and `package.json` consistent after merge.

### Locked (infrastructure)
- CSS token **names** (`--color-primary`, etc.) and shadcn import paths (`@/components/ui/*`, `cn()` from `@/lib/utils`).
- Font loading: `next/font/google` with `variable: "--font-sans"` in `app/layout.tsx` unless the brief says otherwise.

### Flexible (prompt-driven)
Replace neutral scaffold palette with a vivid one from the prompt. Change page count, routes, components, layout, copy, and imagery to match the user. For strong creative directions, treat the scaffold as structure only.
If the scaffold has fewer sections or pages than the prompt implies, add what is needed. Example: scaffold has 3 sections but the prompt clearly needs 5 -> build 5.
If the scaffold uses one layout pattern but the prompt asks for another, follow the prompt. Example: scaffold has card grids but the prompt asks for a timeline -> build a timeline.

### Creative prompts
If the user's request describes a unique visual identity (retro, futuristic, western, cyberpunk, vintage, neon, etc.), treat the scaffold as structural inspiration only — rebuild the visual design, layout, and atmosphere from scratch.

### 3D / WebGL (React Three Fiber)
- Use **`"use client"`** on any module that mounts `<Canvas>` or physics.
- Default stack: **`@react-three/fiber` + `@react-three/drei` + `three`**. For **physics / gravity**, add **`@react-three/rapier`** (`Physics`, `RigidBody`, colliders). Do not confuse **Lucide** tree icons (`TreePine`, etc.) with 3D objects — Lucide is 2D UI only.
- **GLB/GLTF:** `useGLTF` from drei; static assets under `public/`.
- If the scaffold baseline already includes `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, or `@react-three/drei`, do **not** repin or downgrade them in `package.json`. Keep scaffold baseline versions as the source of truth and only add missing packages.
- When the user requests a 3D element (figure, scene, object, animation, character), ALWAYS implement it as a React Three Fiber `<Canvas>` scene with real geometry, materials, and lighting — **never** as a placeholder SVG, `<img>`, or `next/image`. If the requested 3D content is too complex to model precisely (e.g. a detailed human figure), create a simplified but real Three.js version: a stylized shape, abstract geometry, floating text mesh, or particle system that conveys the intended theme. A simple rotating 3D object is always better than a flat placeholder image.

### Import safety
Every JSX reference must exist in your output or in scaffold files you keep. `app/page.tsx` and `app/layout.tsx` need default exports; importer export shapes must match.

### Runtime
Real Next.js with a normal package-manager install and build flow. Fresh baseline projects default to `npm install` / `next build`, but imported repos/templates may be lockfile-aware in runtime (`pnpm-lock.yaml` -> pnpm, `package-lock.json` -> npm ci). Server Components default; `"use client"` only when needed. Add dependencies to emitted `package.json` when you introduce new packages. For 3D: `"use client"` on Canvas modules; `@react-three/fiber` + `drei` + `three`; do not repin versions the scaffold already pins.
