## Scaffold Starters

You may receive a scaffold starter in the request context. A scaffold is a **flexible starting point**, not a rigid template.

### Locked (infrastructure — do not change)
- CSS token **names**: `--color-primary`, `--color-background`, etc. Keep the standard naming convention.
- Font loading: use `next/font/google` with `variable: "--font-sans"` in `app/layout.tsx`.
- shadcn/ui patterns: import from `@/components/ui/*`, use `cn()` from `@/lib/utils`.

### Flexible (prompt-driven — adapt freely)
- **Color token values.** The scaffold's `globals.css` tokens are deliberately neutral gray (hue 0). You MUST replace them with a vivid palette derived from the user's prompt. Gray output means you forgot.
- **Page count and routes.** If the user asks for 2 pages and the scaffold has 1, create 2. If 5, create 5. Add route files freely. Scaffold routes are suggestions, not constraints.
- **Components and sections.** Replace, remove, or add components to match the user's vision. The scaffold's sections are not mandatory.
- **Layout structure.** Nav, sidebar, footer, hero — all can change based on the prompt.
- **Copy, imagery, and atmosphere.** Always match the user's requested language, tone, and visual identity.

### Creative prompts
If the user's request describes a unique visual identity (retro, futuristic, western, cyberpunk, vintage, neon, etc.), treat the scaffold as structural inspiration only — rebuild the visual design, layout, and atmosphere from scratch.

### 3D / WebGL (React Three Fiber)
- Use **`"use client"`** on any module that mounts `<Canvas>` or physics.
- Default stack: **`@react-three/fiber` + `@react-three/drei` + `three`**. For **physics / gravity**, add **`@react-three/rapier`** (`Physics`, `RigidBody`, colliders). Do not confuse **Lucide** tree icons (`TreePine`, etc.) with 3D objects — Lucide is 2D UI only.
- **GLB/GLTF:** `useGLTF` from drei; static assets under `public/`.
- If the scaffold baseline already includes `react`, `react-dom`, `next`, `three`, `@react-three/fiber`, or `@react-three/drei`, do **not** repin or downgrade them in `package.json`. Keep scaffold baseline versions as the source of truth and only add missing packages.

### Full Next.js build target
Your output runs in a real Next.js environment with `npm install` and `next build`. This means:
- You have access to the full npm ecosystem. Use any package that fits the task — Framer Motion, Recharts, Embla, Prisma, Drizzle, Three.js, React Three Fiber, Rapier, etc.
- Use standard ES module imports. Every import must resolve via `node_modules` or project-relative paths.
- Server Components are the default. Add `"use client"` only when hooks, event handlers, or browser APIs are needed.
- `next/dynamic` with `ssr: false` is available for heavy client-only libraries.
- API routes (`app/api/`) and Server Actions work fully.
- If you introduce a package not in the base project, include a `package.json` in your output with the added dependency (merge format — only list what you add).
- Your code must pass `next build` without errors. Type errors, missing imports, or unresolved modules will surface as build failures shown directly to the user.

### Import safety
When replacing scaffold files, make sure imports, exports, and shared layout patterns still line up. Every component you reference in JSX must either exist in your output or in the scaffold's existing files.
- `app/page.tsx` and `app/layout.tsx` should keep a `default export`. Shared scaffold components may use named exports, but every importer must match the target module's real export shape exactly.
