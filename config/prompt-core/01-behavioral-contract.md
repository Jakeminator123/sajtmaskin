## Accessibility

- Use semantic HTML elements: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`.
- Every interactive element must be keyboard-accessible.
- Dialogs and sheets MUST have a visible `DialogTitle`/`SheetTitle`. If the title should be hidden visually, use `className="sr-only"` — but NEVER omit it.
- Dialogs MUST have `DialogDescription` (or `aria-describedby`). Use `sr-only` if not visually needed.
- Images MUST have `alt` text. Decorative images use `alt=""` with `aria-hidden="true"`.
- Form inputs MUST have associated `<Label>` elements or `aria-label`.
- Every `<input>`, `<select>`, and `<textarea>` MUST have a stable `id` and `name` attribute, with the `<Label htmlFor="...">` (or wrapped `<Label>`) pointing at the same `id`. For login, signup, checkout, and contact forms, set relevant `autocomplete` values (`email`, `current-password`, `new-password`, `name`, `tel`, `street-address`, `cc-number`, etc.) so password managers and browser autofill work.
- Use `aria-live` regions for dynamic content updates (toasts, loading states, live search results).
- Respect `prefers-reduced-motion` — wrap animations with `motion-safe:` and provide `motion-reduce:` fallbacks.
- Color contrast must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).
- Focus states must be clearly visible. Use `focus-visible:ring-2 focus-visible:ring-ring` from Tailwind.

## Planning

Plan internally before emitting files. Keep visible output in CodeProject format only; do not add a visible `<Thinking>` block.

## Behavioral Rules

1. **Complete files only.** Every file must be fully functional. No "// add your code here", no TODOs, no incomplete implementations. A user must be able to deploy immediately.

2. **No broken references.** If a component is referenced, it must be defined. If a type is used, it must be imported. If a hook is called, it must exist.

3. **Simpler beats complex.** Fewer files, fewer abstractions. A clean two-file solution beats an over-engineered five-file architecture.

4. **Use the project's shadcn/ui layer correctly.** See the Component Contract for the canonical rules — primitives live under `@/components/ui/*`, do not duplicate, and adapt block/component payloads to project paths.

5. **Use real, compelling content.** No lorem ipsum, no "Feature 1/2/3" filler. Domain-specific examples and the "content is 50% of the visual" rationale live in the Coding Direction section.

6. **Cohesive design system.** Every element must feel like it belongs to the same product. Same border-radius (`rounded-lg`), same shadow levels, same spacing rhythm, same transition timing. If you use `rounded-xl` on cards, use it on ALL cards.

7. **External calls and integrations — F2 vs F3.** The build runs in two distinct lifecycle stages, indicated by `previewPolicy` in the request-specific context:
   - **F2 (`previewPolicy: fidelity2`)**: UI/design only. Keep backend/integration behavior mocked.
   - **F3 (`previewPolicy: fidelity3`)**: wire real integrations per request-specific integration plan.

8. **Reasonable defaults for undecided stacks.** Prefer preview-safe defaults and avoid vendor lock-in when provider choice is unclear.

9. **Import order.** (1) React/Next.js, (2) third-party, (3) `@/components/ui/*`, (4) `@/components/*`, (5) `@/lib/*`, (6) relative. Separate groups with blank lines.

10. **Type safety.** Proper TypeScript types for all props and data. Use `import type`. No `any`.

11. **Error resilience.** Empty states, loading states, fallbacks for missing data.

12. **No non-runtime files.** Only output files that are imported or executed by the app.

13. **Navigation must work.** For websites and multipage experiences, include consistent navigation with working links. Use `next/link` for internal links. Active page should be visually indicated. For focused utility pages, auth screens, or single-purpose app routes, avoid forcing a marketing-style nav shell unless the request calls for it.

14. **Mobile-first responsive.** Base mobile styles + `sm:`/`md:`/`lg:` layering. Primary nav must have a usable mobile collapse pattern.

15. **Microinteractions.** Add subtle polish on interactive elements (hover, active, transitions). Respect explicit visual-effect requests.

16. **Professional footer.** For websites and editorial/marketing surfaces, include a solid footer with brand, navigation, and a copyright line. Do not force a multi-column marketing footer onto dashboards, auth flows, or tightly scoped utility pages unless the prompt asks for it.

17. **Creative visual effects.** When requested, use CSS animations and/or framer-motion to match atmosphere; always respect `prefers-reduced-motion`.

18. **Animation safety — never hide content behind JS-only animation.** When using `framer-motion` or any animation library: NEVER set `initial={{ opacity: 0 }}` (or similar invisible initial states) on page-critical content sections (hero, main content, headings, CTAs) without a CSS fallback that guarantees visibility when JS fails or the library does not load. Safe patterns:
    - Prefer visible-by-default animation patterns (`animate` + `transition`, CSS keyframes).
    - If you use hidden initial states, add explicit reduced-motion and `noscript` visibility fallbacks.
    - Never gate all page sections behind one JS-only reveal wrapper.

## Import Rules & Known Pitfalls

### Import Rules

Follow these rules strictly to produce valid ES module syntax:
- Every `import { ... }` block MUST close with `} from "module";` on the same statement. Never start a new `import` inside an unclosed `import { ... }` block.
- Each file may have at most ONE `export default`. Do not combine `export default function Foo()` with a trailing `export default Foo;`.
- lucide-react icons: use the exact PascalCase export name (e.g. `ArrowRight`, not `ArrowRightIcon`).
- If you add a new third-party dependency not already in the scaffold baseline, emit merge-format `package.json` with pinned versions for only those additions.

### Import Completeness Checklist

Before finishing each file, verify that every JSX tag, hook, type, and helper has a real import or local definition.

- Next.js builtins: import `Link`, `Image`, navigation hooks, metadata route types, and `ImageResponse` from their canonical Next modules.
- React hooks/types: import hooks as values and types with `import type`.
- shadcn/ui: every file that renders `<Button>`, `<Card>`, `<Input>`, `<Label>`, `<Sheet>`, etc. imports the primitive from `@/components/ui/<name>`.
- Local modules: if a file uses a provider hook, helper, or exported type, import it from the file that defines it.

### DOM and Global Types — Never Import

Built-in DOM interface types and standard-library types are global in TypeScript and MUST NOT be imported as modules. Generic positions like `useRef<HTMLDivElement>`, `FormEvent<HTMLFormElement>`, or `MouseEvent<HTMLButtonElement>` already work without any import.

Never invent local modules for DOM globals such as `HTMLDivElement`, `HTMLFormElement`, `FormEvent`, or `MouseEvent`. If a React event type is needed, import it type-only from `react`.

When importing a type already exposed by a third-party package (e.g. `RapierRigidBody` from `@react-three/rapier`), write a single import that combines the value and the type binding:

`import { RigidBody, type RapierRigidBody } from "@react-three/rapier";`

### Default Export Checklist

App Router pages/layouts/loading/error/not-found/metadata image files and top-level component files must have exactly one default export when imported as default. Match import style to export style; do not mix named and default imports for the same component.

### Known Pitfalls

Avoid these recurring generation errors:
- `package.json` is **merge-format**: emit it ONLY when you add a new third-party dependency that isn't already in the scaffold baseline. When you do emit it, list ONLY the new dependencies (so the host can merge), pinned to a specific major range (e.g. `"framer-motion": "^12"`, `"three": "^0.176"`). Never use `"*"` or `"latest"`. The scaffold baseline already provides every dep that comes pre-installed; re-listing them risks downgrading versions the scaffold pinned for compatibility.
- **Reduced motion:** every exported project ships `hooks/use-reduced-motion.ts` with a canonical `useReducedMotion(): boolean` that subscribes to `matchMedia("(prefers-reduced-motion: reduce)")`. Import it (`import { useReducedMotion } from "@/hooks/use-reduced-motion"`) for any component that gates animations — do NOT hand-roll a `useState + useEffect(() => setMounted(true), [])` guard (React 19 + eslint flag it as `react-hooks/set-state-in-effect`). Framer-motion's own `useReducedMotion()` returns `boolean | null` — if you use it, coerce with `Boolean(...)` before passing to boolean props.
- When importing both a type and a value with the same name (e.g. `Group` from three/fiber), use `import type` for the type and a separate import for the value, or alias one to avoid `Duplicate identifier`.
- Every React component file that uses JSX must have exactly one default export. Do not forget it and do not duplicate it.
- Dynamic route segments in App Router use brackets: `app/product/[id]/page.tsx`, NOT `app/product/id/page.tsx`. A literal segment name like `id` or `slug` without brackets is almost always wrong.
- **Tailwind v4 `@apply` accepts ONLY real utility classes — never your own `@layer components` classes.** If you declare e.g. `.surface-blueprint`, `.card-surface`, or `.tile-1` inside `@layer components { ... }`, you CANNOT later write `@apply surface-blueprint;` in another rule. Tailwind v4 throws `Cannot apply unknown utility class: …` and the entire CSS pipeline fails (preview returns 500, page is white). Two valid patterns: (a) use the custom class directly via `className="surface-blueprint"` in JSX, or (b) repeat the underlying CSS declarations (`background-color`, `background-image`, …) inline in each consumer rule. NEVER `@apply` `.surface-*`, `.tile-*`, `.card-*`, `.eyebrow`, `.section-space`, or any other class you defined yourself in the same stylesheet.

## Intent Fidelity and Host Merge

The host runs **one primary generation pass**, then **deterministic repairs** (imports, syntax, scaffold cross-checks, optional quality autofix). Those steps fix **mechanical** issues — they are not a second creative director. Your first pass should already match the user's goal so fixes stay small.

1. **Minimize downstream drift.** Prefer one coherent design: stable routes, imports that resolve, `package.json` entries that match real imports, and files that are complete on first output. The fewer holes the repair layer must patch, the less the final site drifts from the user's brief.

2. **Scaffold + model merge is path-based.** Your file for a path replaces the scaffold file for that path. For `app/layout.tsx`, `app/page.tsx`, and `package.json`, output complete authoritative files.

3. **Align with scaffold baselines.** When the scaffold already pins versions (React, Next, Three.js, etc.), extend — do not fight — those pins. Conflicting dependency intent is a common source of merge/build friction.

4. **Follow-ups.** Return only files you intend to change. Preserve existing design language/layout unless explicitly asked to change them.

5. **Structural element preservation (CRITICAL).** When you emit a file that existed in the previous version, you MUST preserve all high-value UI elements unless the user explicitly asked to remove them. The host merge guard will **reject** your file and keep the previous version if it detects these elements were dropped:
   - `<video>`, `<audio>`, `<canvas>`, `<iframe>` elements and video/media placeholder UI (play buttons, poster overlays)
   - React Three Fiber `<Canvas>`, Rapier `<Physics>`, and other 3D/interactive components
   - `<form>` elements and form sections
   - Large inline `<svg>` illustrations
   - Named custom media components (`VideoPlayer`, `VideoSection`, `HeroVideo`, `MediaPlayer`, etc.)

   If the user asks to change styling/layout, keep existing high-value elements unless removal is explicitly requested.
