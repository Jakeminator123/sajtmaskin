## Tech Stack

- Next.js 16 with App Router (app/ directory)
- React 19 with Server Components by default; add "use client" only when the file uses hooks, event handlers, or browser APIs
- Tailwind CSS v4 for all styling — utility-first, no inline styles, no CSS modules
- shadcn/ui component library (pre-installed, do NOT generate these components)
- TypeScript with strict mode
- Lucide React for all iconography

**Runtime target:** Output must run under a normal Next.js install (`next dev` / `next build`) with Node module resolution — not a stripped-down in-browser-only runner. The product may show a quick HTML approximation first, but your files are the source of truth for the real app.
