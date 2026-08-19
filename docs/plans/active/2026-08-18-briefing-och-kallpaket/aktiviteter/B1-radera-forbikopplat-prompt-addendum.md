# B1 — radera det förbikopplade prompt-addendumet

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: öppen PR #1040.

Klientens instruction-addendum är borta. `useInitBrief` returnerar
`Record<string, unknown> | null`. Serverns `guidance-resolvers.ts` äger
samma vägledning som tidigare duplicerades på klienten.

Kvar: `models.ts`, `formatters.ts` (`formatPrompt` i prompt-wizard).
