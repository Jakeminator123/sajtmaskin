# Acute Generation Issues (separate from phase 2/3 consolidation)

Tracked separately so phase 2/3 scope stays narrow.

## 1. `thinking` flag unexpectedly `false`

**Symptom:** Generations that should use extended reasoning run without it.

**Likely cause:** Env name mismatch (`SAJTMASKIN_DEFAULT_THINKING` in follow-up stream vs `SAJTMASKIN_SHOW_THINKING` in `engine.ts`), or Anthropic models never entering the `providerOptions.reasoningEffort` branch.

**Files:**
- `src/lib/api/engine/chats/chat-message-stream-post.ts` (~140–143)
- `src/lib/gen/engine.ts` (`resolvedThinking`)
- `src/lib/hooks/chat/useSendMessage.ts` / `useCreateChat.ts` (client toggle)

**Repro:** Check generation meta.json for `thinking: false` when it should be `true`. Trace the env values.

## 2. Cross-file provider/import chains (ecommerce)

**Symptom:** Larger ecommerce generations produce unresolved `@/components/providers/*` or `@/lib/*` imports because autofix stubs are minimal.

**Likely cause:** `runtime-imports.ts` allowlist doesn't cover app-specific providers that the LLM invents. `cross-file-import-checker.ts` creates stub files but they're placeholders, not functional.

**Files:**
- `src/lib/gen/autofix/rules/cross-file-import-checker.ts`
- `src/lib/gen/autofix/runtime-imports.ts`
- `src/lib/gen/validation/project-sanity.ts`

**Repro:** Generate a multi-route ecommerce app and check for unresolved imports in typecheck output.

## 3. Literal + dynamic route conflict

**Symptom:** Both `/products/page.tsx` and `/products/[slug]/page.tsx` are generated, causing Next.js build failure.

**Likely cause:** `buildRoutePlan()` and `findMissingPlannedRoutes()` don't detect filesystem-level segment conflicts. `scaffold-aware-retry.ts` recognizes `"duplicate route file"` as a failure class but doesn't prevent it.

**Files:**
- `src/lib/gen/route-plan.ts` (`extractAppRoutePathsFromFilePaths`, `findMissingPlannedRoutes`)
- `src/lib/gen/stream/finalize-preflight.ts`
- `src/lib/gen/scaffolds/scaffold-aware-retry.ts`

**Repro:** Generate a project with both a listing page and detail page for the same segment.

## 4. Root layout wrapper / provider pattern missed by repair

**Symptom:** Generated `app/layout.tsx` has `<html><body>{children}</body></html>` but no provider tree (e.g. ThemeProvider, CartProvider), causing runtime errors when child routes expect context.

**Likely cause:** Minimal layout baseline in `finalize-preflight.test.ts` doesn't enforce provider presence. Scaffold `layout.tsx` files include richer shells but generated output may diverge. Neither `visual-qa.ts` nor `seo-preflight.ts` check for provider completeness.

**Files:**
- `src/lib/gen/stream/finalize-preflight.test.ts` (`withMinimalBaseline`)
- `src/lib/gen/scaffolds/*/files/app/layout.tsx`
- `src/lib/gen/verify/visual-qa.ts`

**Repro:** Generate an ecommerce scaffold and check if the layout wraps children with the expected providers.
