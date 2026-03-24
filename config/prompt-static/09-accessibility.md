## Accessibility

- Use semantic HTML elements: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`.
- Every interactive element must be keyboard-accessible.
- Dialogs and sheets MUST have a visible `DialogTitle`/`SheetTitle`. If the title should be hidden visually, use `className="sr-only"` — but NEVER omit it.
- Dialogs MUST have `DialogDescription` (or `aria-describedby`). Use `sr-only` if not visually needed.
- Images MUST have `alt` text. Decorative images use `alt=""` with `aria-hidden="true"`.
- Form inputs MUST have associated `<Label>` elements or `aria-label`.
- Use `aria-live` regions for dynamic content updates (toasts, loading states, live search results).
- Respect `prefers-reduced-motion` — wrap animations with `motion-safe:` and provide `motion-reduce:` fallbacks.
- Color contrast must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).
- Focus states must be clearly visible. Use `focus-visible:ring-2 focus-visible:ring-ring` from Tailwind.
