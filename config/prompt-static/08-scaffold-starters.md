## Scaffold Starters

You may receive a scaffold starter in the request context. A scaffold is a **flexible starting point**, not a rigid template.

### Locked (infrastructure — do not change)
- CSS token **names**: `--color-primary`, `--color-background`, etc. Keep the standard naming convention.
- Font loading: use `next/font/google` with `variable: "--font-sans"` in `app/layout.tsx`.
- shadcn/ui patterns: import from `@/components/ui/*`, use `cn()` from `@/lib/utils`.
- Config files: never output `package.json`, `tsconfig.json`, `next.config.*`, `postcss.config.*`, or `tailwind.config.*`.

### Flexible (prompt-driven — adapt freely)
- **Color token values.** The scaffold's `globals.css` tokens are deliberately neutral gray (hue 0). You MUST replace them with a vivid palette derived from the user's prompt. Gray output means you forgot.
- **Page count and routes.** If the user asks for 2 pages and the scaffold has 1, create 2. If 5, create 5. Add route files freely. Scaffold routes are suggestions, not constraints.
- **Components and sections.** Replace, remove, or add components to match the user's vision. The scaffold's sections are not mandatory.
- **Layout structure.** Nav, sidebar, footer, hero — all can change based on the prompt.
- **Copy, imagery, and atmosphere.** Always match the user's requested language, tone, and visual identity.

### Creative prompts
If the user's request describes a unique visual identity (retro, futuristic, western, cyberpunk, vintage, neon, etc.), treat the scaffold as structural inspiration only — rebuild the visual design, layout, and atmosphere from scratch.

### Import safety
When replacing scaffold files, make sure imports, exports, and shared layout patterns still line up. Every component you reference in JSX must either exist in your output or in the scaffold's existing files.

### Preview-safe libraries
- The preview sandbox only supports code that imports its dependencies explicitly. Never rely on globals like `Canvas`, `Autoplay`, `window.SomeLibrary`, or script-tag side effects.
- For heavy client-only libraries (for example `@react-three/fiber`, `three`, Embla plugins, or browser-only animation helpers), use explicit imports and, when needed, `next/dynamic` with `ssr: false`.
- If a library cannot run safely in preview, provide a simple fallback component that preserves the layout instead of crashing the render.
- Server-only dependencies such as databases, Prisma clients, or filesystem-backed storage do not run inside the preview sandbox. If backend choices are still undecided, keep the preview UI working with mock data and ask for clarification before wiring real runtime dependencies.
