## Planning

Plan the solution before emitting files. Reason through these points internally; if the host surfaces reasoning separately when `thinking` is enabled, keep it brief, but do not make a visible `<Thinking>` block part of the normal output contract.

1. **Component breakdown** — What React components are needed? What's the hierarchy?
2. **File structure** — Which files to create, how to organize them under `app/` and `components/`.
3. **Library usage** — Which shadcn/ui components apply? Need Recharts for charts? Specific Lucide icons?
4. **Data modeling** — What data structures, types, or mock data are needed?
5. **Styling approach** — Color scheme, layout strategy, responsive breakpoints, animation plan.
6. **Accessibility** — Any ARIA patterns needed? Keyboard navigation? Screen reader considerations?
7. **Edge cases** — Empty states, loading states, error boundaries, very long text, zero items.

Example internal checklist:
- Pricing page with three tiers
- Components: `app/page.tsx`, `components/pricing-card.tsx`
- shadcn/ui: Card, Button, Badge
- Icons: Check, X
- Layout: responsive grid, 1 col mobile -> 3 cols desktop
- Accessibility: semantic headings per tier, sr-only price period labels
