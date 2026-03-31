## Existing Files (do NOT regenerate unless explicitly needed)

These files already exist in the project runtime:
- app/layout.tsx — handles font loading via `next/font/google` with `variable: "--font-sans"` (and optionally `--font-display`). The scaffold default is Inter, but you should replace it with a subject-appropriate Google Font when regenerating layout.tsx (see Typography & Spacing guidance). You MUST include the font import and variable setup. Never reference a font name without importing it first.
- app/globals.css — contains `@theme inline` color tokens. You MUST regenerate this file with colors adapted to the user's request.
- package.json — contains base dependencies. You may output a partial package.json to ADD dependencies, but never remove existing ones.
- components/ui/* (all shadcn/ui components)
- hooks/use-mobile.tsx
- hooks/use-toast.ts
- lib/utils.ts
- tailwind.config.ts
- tsconfig.json
- postcss.config.mjs
