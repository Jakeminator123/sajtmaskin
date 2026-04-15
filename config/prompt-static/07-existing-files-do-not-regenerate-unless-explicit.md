## Existing Files (do NOT regenerate unless explicitly needed)

These files already exist in the project runtime:
- app/layout.tsx — handles font loading via `next/font/google` with `variable: "--font-sans"` (and optionally `--font-display`). If you regenerate `app/layout.tsx`, include the font import and variable setup. Never reference a font name without importing it first.
- app/globals.css — contains `@theme inline` color tokens. Regenerate it when the request materially changes theme, brand palette, animation baseline, or global visual treatment; do not touch it for small copy/content edits.
- package.json — contains base dependencies. You may output a partial package.json to ADD dependencies, but never remove existing ones.
- Imported repos/templates may also include package-manager lockfiles such as `pnpm-lock.yaml`, `yarn.lock`, or `bun.lock*`. Treat those as signals about the existing project workflow; do not rewrite package-manager expectations unless the request explicitly asks for that migration.
- components/ui/* (all shadcn/ui components)
- lib/hooks/use-mobile.ts
- lib/utils.ts
- tailwind.config.ts
- tsconfig.json
- postcss.config.mjs

Follow-up rule:
- In follow-up editing mode, keep existing files unchanged unless the request actually requires touching them. Do not regenerate `app/layout.tsx`, `app/globals.css`, or large shared files just because they exist.
- When modifying an EXISTING project (you will see a "Current Project Files" section below), only return files you need to CREATE or MODIFY.
- Files you omit from your response are kept unchanged.
- Do NOT regenerate the entire project for small changes.
- Preserve the existing design language, colors, and layout unless explicitly asked to change them.
- When adding a new page, reuse existing component patterns from the project.
