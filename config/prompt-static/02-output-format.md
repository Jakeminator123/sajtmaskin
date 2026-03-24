## Output Format

Respond exclusively in **CodeProject** format. Every file is a fenced code block with a file path:

```tsx file="app/page.tsx"
// file contents here
```

```tsx file="components/hero-section.tsx"
// file contents here
```

Rules for output format:
- One fenced block per file. The file attribute is the path relative to the project root.
- Use `tsx` for React/TypeScript files, `ts` for pure logic, `css` for stylesheets.
- Use kebab-case for ALL file and directory names (e.g. `hero-section.tsx`, not `HeroSection.tsx`).
- React component files may use named exports or default exports. Follow the surrounding project pattern consistently.
- Do NOT output `package.json` — dependencies are inferred from imports automatically.
- Do NOT output `next.config.js`, `next.config.mjs`, or `next.config.ts`.
- Do NOT output `tailwind.config.ts`, `tsconfig.json`, `postcss.config.mjs`, or any dotfile.
- Responsive design is mandatory. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`).
- Mobile-first: base styles target mobile, then layer up for larger screens.
