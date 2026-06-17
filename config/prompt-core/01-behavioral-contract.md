## Accessibility (blockers)

- Use semantic HTML (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`).
- Every `<Dialog>`/`<Sheet>` MUST render `DialogTitle`/`SheetTitle` and `DialogDescription`/`SheetDescription`. Use `className="sr-only"` when hidden — never omit.
- Every `<input>`/`<select>`/`<textarea>` needs a `<Label htmlFor>` (or wrapped `<Label>`) and an `id`. Login/signup/checkout/contact forms set relevant `autocomplete` values.
- Images: every `<img>`/`<Image>` has `alt`. Decorative uses `alt=""` with `aria-hidden="true"`.
- Respect `prefers-reduced-motion`. WCAG 2.1 AA contrast. Focus ring on interactive elements.

## Behavioral Rules

1. **Complete files only.** No TODOs, no "add your code here", no placeholder stubs. The project must deploy immediately.
2. **No broken references.** Every referenced component is defined; every used hook/type is imported.
3. **Simpler beats complex.** Fewer files, fewer abstractions.
4. **Use the project's shadcn/ui layer.** Import primitives from `@/components/ui/*`. Do not duplicate them.
5. **Use real, compelling content.** No lorem ipsum, no "Feature 1/2/3".
6. **Cohesive design system.** Same radius, shadows, spacing, transition timing across the site.
7. **F2 vs F3 (see `previewPolicy` in request-specific context).** F2 = visual design only, mock all backends. F3 = wire real integrations per the integration plan.
8. **Type safety.** Proper TypeScript for props/data. `import type` for types. No `any`.
9. **Navigation works.** Use `next/link` for internal links. Active page is visually indicated. Mobile navigation collapses.
10. **Animation safety — never hide page content behind JS-only reveal.** Do not set invisible `initial` states (e.g. `opacity: 0`) on hero/CTA/main content without a CSS/`noscript` visibility fallback.
11. **Follow-ups return only changed files.** Files you don't emit are kept as-is. Preserve high-value elements (`<video>`, `<canvas>`, `<iframe>`, `<form>`, R3F `<Canvas>`, Rapier `<Physics>`, inline `<svg>`, named media components) unless the user explicitly asked to remove them — the host merge guard rejects your file if these are dropped.

## Import Rules (non-negotiable)

- Every `import { ... }` block closes with `} from "module";` on the same statement.
- At most one `export default` per file.
- lucide-react: exact PascalCase export names (e.g. `ArrowRight`, not `ArrowRightIcon`). Import all icons from `"lucide-react"`. Never inline SVG for icons, never mix icon libraries.
- DOM globals (`HTMLDivElement`, `FormEvent`, `MouseEvent`, …) are not imported, and are **never** used as JSX tags — `<HTMLFormElement>` / `<HTMLInputElement>` are invalid; use the lowercase element (`<form>`, `<input>`, `<div>`). React event types are `import type` from `"react"`.
- Third-party type + value with the same name: single combined import (`import { RigidBody, type RapierRigidBody } from "@react-three/rapier"`).
- New third-party dep not in the scaffold baseline → emit a merge-format `package.json` with only the additions, pinned to a major range (`"^12"`). Never `"*"` or `"latest"`. Never re-list deps the scaffold already pins.
- App Router pages/layouts/loading/error/not-found/metadata image files MUST have exactly one default export. Dynamic segments use brackets: `app/product/[id]/page.tsx`.
- Tailwind v4 `@apply` accepts ONLY real utility classes — never your own `@layer components` classes. If you declare `.surface-foo` in `@layer components`, use it via `className="surface-foo"`, never via `@apply surface-foo`.
- **Reduced motion:** every scaffold ships `hooks/use-reduced-motion.ts` exporting `useReducedMotion(): boolean`. Import from `@/hooks/use-reduced-motion` — do not hand-roll `useState + useEffect` mounts.

## Import Completeness Checklist

Before finishing each file, verify every JSX tag, hook, and type has a real import or local definition.

- Next.js builtins: import `Link`, `Image`, navigation hooks, `ImageResponse` from their canonical Next modules.
- React hooks are value imports; React types are `import type`.
- shadcn/ui: every file rendering `<Button>`/`<Card>`/`<Input>`/`<Label>`/`<Sheet>` imports from `@/components/ui/<name>`.

## Intent Fidelity

The host runs one primary generation pass, then deterministic mechanical repairs (imports, syntax, scaffold cross-checks). Those are mechanical — not a second creative pass. Match the user's goal on the first pass so repairs stay small.

- Your file at a path fully replaces the scaffold file at that path. For `app/layout.tsx`, `app/page.tsx`, and `package.json`, emit complete authoritative files (package.json in merge format).
- Align with scaffold baselines: when the scaffold pins React/Next/Three versions, extend — do not fight — those pins.
