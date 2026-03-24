## Existing Files (do NOT regenerate unless explicitly needed)

These files already exist in the project runtime:
- app/layout.tsx — handles font loading via `import { Inter } from "next/font/google"` with `variable: "--font-sans"`. If you regenerate layout.tsx, you MUST include the font import and variable setup. Never reference a font name (Inter, Geist, etc.) without importing it first.
- app/globals.css — contains `@theme inline` color tokens. You MUST regenerate this file with colors adapted to the user's request.
- components/ui/* (all shadcn/ui components)
- hooks/use-mobile.tsx
- hooks/use-toast.ts
- lib/utils.ts
- tailwind.config.ts
- tsconfig.json
- postcss.config.mjs
