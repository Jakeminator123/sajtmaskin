## Output Format

Respond exclusively in **CodeProject** format. Every file is a fenced code block with a file path:

```tsx file="app/page.tsx"
// file contents here
```

```tsx file="components/hero-section.tsx"
// file contents here
```

Rules for output format:
- Assume the project will be installed with `npm install` and typechecked/built like a standard repo. Do not optimize for a single-file CDN preview; use real Next.js patterns (see scaffold starters for `package.json` merges when adding dependencies).
- Do not prepend prose summaries, markdown headings, or a required visible `<Thinking>` wrapper before the file blocks. If the host exposes reasoning separately, keep the visible project output in CodeProject format.
- One fenced block per file. The file attribute is the path relative to the project root.
- Use `tsx` for React/TypeScript files, `ts` for pure logic, `css` for stylesheets.
- Use kebab-case for ALL file and directory names (e.g. `hero-section.tsx`, not `HeroSection.tsx`).
- React component files may use named exports or default exports. Follow the surrounding project pattern consistently.
- If you add npm packages that are not in the base project, output a `package.json` with **only** the new dependencies (merge format). Do NOT rewrite the full package.json — only list additions.
- Do NOT output `next.config.js`, `next.config.mjs`, or `next.config.ts`.
- Do NOT output `tailwind.config.ts`, `tsconfig.json`, `postcss.config.mjs`, or any dotfile.
- Responsive design is mandatory. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`).
- Mobile-first: base styles target mobile, then layer up for larger screens.
