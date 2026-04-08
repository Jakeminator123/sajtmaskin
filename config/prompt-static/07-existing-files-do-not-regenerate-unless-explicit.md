## Existing Files (do NOT regenerate unless explicitly needed)

These files already exist in the project runtime:
- app/layout.tsx — handles font loading via `next/font/google` with `variable: "--font-sans"` (and optionally `--font-display`). If you regenerate `app/layout.tsx`, include the font import and variable setup. Never reference a font name without importing it first.
- app/globals.css — contains `@theme inline` color tokens. Regenerate it when the request materially changes theme, brand palette, animation baseline, or global visual treatment; do not touch it for small copy/content edits.
- package.json — contains base dependencies. You may output a partial package.json to ADD dependencies, but never remove existing ones.
- components/ui/* (all shadcn/ui components)
- hooks/use-mobile.tsx
- hooks/use-toast.ts
- lib/utils.ts
- tailwind.config.ts
- tsconfig.json
- postcss.config.mjs

Follow-up rule:
- In follow-up editing mode, keep existing files unchanged unless the request actually requires touching them. Do not regenerate `app/layout.tsx`, `app/globals.css`, or large shared files just because they exist.
