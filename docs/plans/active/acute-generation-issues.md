# Acute Generation Issues (separate from phase 2/3 consolidation)

Tracked separately so phase 2/3 scope stays narrow.

## 1. `thinking` flag unexpectedly `false`

**Status:** Fixed. The server now treats `SAJTMASKIN_DEFAULT_THINKING` as canonical, only falls back to `SAJTMASKIN_SHOW_THINKING` for legacy environments, and maps `thinking` to provider-specific options for both OpenAI and Anthropic own-engine runs.

**Symptom:** Generations that should use extended reasoning run without it.

**Original cause:** Env name mismatch (`SAJTMASKIN_DEFAULT_THINKING` in create/follow-up handlers vs `SAJTMASKIN_SHOW_THINKING` in `engine.ts`), or Anthropic models never entering the `providerOptions.reasoningEffort` branch.

**Files:**
- `src/lib/api/engine/chats/chat-message-stream-post.ts` (~140–143)
- `src/lib/gen/engine.ts` (`resolvedThinking`)
- `src/lib/hooks/chat/useSendMessage.ts` / `useCreateChat.ts` (client toggle)

**Repro:** Check generation meta.json for `thinking: false` when it should be `true`. Trace the env values.

## 2. Cross-file provider/import chains (ecommerce)

**Status:** Fixed. Stubs now parse import specifiers and generate context-aware exports: `*Provider` → children-wrapping component, `*Context` → `createContext`, `use*` → hook returning `{}`, other PascalCase → visual component stub. Multi-file imports to the same missing target are merged.

**Symptom:** Larger ecommerce generations produce unresolved `@/components/providers/*` or `@/lib/*` imports because autofix stubs are minimal.

**Original cause:** `cross-file-import-checker.ts` generated a single default-export stub per missing file, but importing code expects specific named exports (`CartProvider`, `CartContext`, `useCart`).

**Files:**
- `src/lib/gen/autofix/rules/cross-file-import-checker.ts`
- `src/lib/gen/autofix/runtime-imports.ts`
- `src/lib/gen/validation/project-sanity.ts`

**Repro:** Generate a multi-route ecommerce app and check for unresolved imports in typecheck output.

## 3. Literal + dynamic route conflict — ADDRESSED

**Status:** Detection added in `project-sanity.ts` (section 8) and auto-removal in `finalize-preflight.ts` (`removeLiteralRouteDuplicates`). Commit `267abe74f`.

**Symptom:** Both `/products/page.tsx` and `/products/[slug]/page.tsx` are generated, causing Next.js build failure.

**Likely cause:** `buildRoutePlan()` and `findMissingPlannedRoutes()` don't detect filesystem-level segment conflicts. `scaffold-aware-retry.ts` recognizes `"duplicate route file"` as a failure class but doesn't prevent it.

**Files:**
- `src/lib/gen/route-plan.ts` (`extractAppRoutePathsFromFilePaths`, `findMissingPlannedRoutes`)
- `src/lib/gen/stream/finalize-preflight.ts`
- `src/lib/gen/scaffolds/scaffold-aware-retry.ts`

**Repro:** Generate a project with both a listing page and detail page for the same segment.

## 4. Root layout wrapper / provider pattern missed by repair

**Status:** Fixed. Two-part solution:
1. **Autofix:** `layout-provider-fixer.ts` runs in `repairGeneratedFiles` and injects `ThemeProvider` (from `next-themes`) when theme signals are present, and `<Toaster />` (from `sonner`) when toast usage is detected in child routes.
2. **Sanity check:** `project-sanity.ts` section 5 now detects `useTheme()` usage in child routes without `ThemeProvider` in layout, and flags any `*Provider` imported in children but absent from root layout.

Custom providers (`CartProvider`, `AuthProvider`) get functional stubs via the improved cross-file-import-checker (#2) but are not auto-injected into the layout (requires app-specific props).

**Symptom:** Generated `app/layout.tsx` has `<html><body>{children}</body></html>` but no provider tree (e.g. ThemeProvider, CartProvider), causing runtime errors when child routes expect context.

**Files:**
- `src/lib/gen/autofix/rules/layout-provider-fixer.ts` (new)
- `src/lib/gen/autofix/repair-generated-files.ts` (integration)
- `src/lib/gen/validation/project-sanity.ts` (detection)

**Repro:** Generate an ecommerce scaffold and check if the layout wraps children with the expected providers.
