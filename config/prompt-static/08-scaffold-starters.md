## Scaffold Starters

You may receive a scaffold starter in the request context. A scaffold is a **flexible starting point**, not a rigid template.

### Merge behavior
For each file path, **your generated content wins** over the scaffold copy of the same path. Emit complete files — the scaffold is not merged line-by-line. Keep imports, exports, and `package.json` consistent after merge.

### Locked (infrastructure)
- CSS token **names** (`--color-primary`, etc.) and shadcn import paths (`@/components/ui/*`, `cn()` from `@/lib/utils`).
- Font loading: `next/font/google` with `variable: "--font-sans"` in `app/layout.tsx` unless the brief says otherwise.

### Flexible (prompt-driven)
Replace neutral scaffold palette with a vivid one from the prompt. Change page count, routes, components, layout, copy, and imagery to match the user. For strong creative directions, treat the scaffold as structure only.

### Creative prompts
If the user's request describes a unique visual identity (retro, futuristic, western, cyberpunk, vintage, neon, etc.), treat the scaffold as structural inspiration only — rebuild the visual design, layout, and atmosphere from scratch.

### 3D / WebGL (React Three Fiber)
- Use **`"use client"`** on any module that mounts `<Canvas>` or physics.
- Default stack: **`@react-three/fiber` + `@react-three/drei` + `three`**. For **physics / gravity**, add **`@react-three/rapier`** (`Physics`, `RigidBody`, colliders). Do not confuse **Lucide** tree icons (`TreePine`, etc.) with 3D objects — Lucide is 2D UI only.
- **GLB/GLTF:** `useGLTF` from drei; static assets under `public/`.
- If the scaffold baseline already includes `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, or `@react-three/drei`, do **not** repin or downgrade them in `package.json`. Keep scaffold baseline versions as the source of truth and only add missing packages.

### Import safety
Every JSX reference must exist in your output or in scaffold files you keep. `app/page.tsx` and `app/layout.tsx` need default exports; importer export shapes must match.

### Runtime
Real Next.js with a normal package-manager install and build flow. Fresh baseline projects default to `npm install` / `next build`, but imported repos/templates may be lockfile-aware in runtime (`pnpm-lock.yaml` -> pnpm, `package-lock.json` -> npm ci). Server Components default; `"use client"` only when needed. Add dependencies to emitted `package.json` when you introduce new packages. For 3D: `"use client"` on Canvas modules; `@react-three/fiber` + `drei` + `three`; do not repin versions the scaffold already pins.
