---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React/Next.js code, especially for hard Next.js changes involving data fetching, rendering, bundle size, hydration, or performance.
---

# Vercel React Best Practices

This project-local skill mirrors the Vercel Cursor plugin skill so agents can still discover and apply it even when plugin availability is inconsistent across Cursor startup modes.

## Quick start

1. For non-trivial React or Next.js changes, fetch the full guide:

```text
https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/AGENTS.md
```

2. For a focused issue, fetch the specific rule:

```text
https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/rules/{rule-name}.md
```

3. Apply the relevant pattern before making substantial edits.

## When to apply

Use this skill for:

- new React components or Next.js routes
- server/client data-fetching changes
- bundle size or dynamic import work
- rendering, hydration, or Suspense issues
- re-render optimization
- performance-focused code reviews
- larger Next.js refactors where architectural choices matter

## Priority order

Review candidate rules in this order:

1. Eliminating waterfalls: `async-*`
2. Bundle size optimization: `bundle-*`
3. Server-side performance: `server-*`
4. Client-side data fetching: `client-*`
5. Re-render optimization: `rerender-*`
6. Rendering performance: `rendering-*`
7. JavaScript performance: `js-*`
8. Advanced patterns: `advanced-*`

## High-value rule families

Start here for difficult Next.js work:

- `async-parallel`
- `async-api-routes`
- `async-suspense-boundaries`
- `bundle-barrel-imports`
- `bundle-dynamic-imports`
- `server-cache-react`
- `server-parallel-fetching`
- `server-serialization`
- `rerender-memo`
- `rerender-derived-state-no-effect`
- `rendering-hydration-no-flicker`
- `rendering-conditional-render`

## Expected workflow

When this skill applies:

1. Identify the dominant risk: waterfall, hydration, bundle, server performance, or re-render churn.
2. Fetch the matching Vercel rule doc or the full guide.
3. Prefer the Vercel-recommended pattern unless project constraints clearly require a deviation.
4. In reviews, call out the relevant rule family when it explains the recommendation.

## Source

Canonical source:

- `https://github.com/vercel-labs/agent-skills`

This local copy exists for discovery reliability, not to fork the source of truth.
