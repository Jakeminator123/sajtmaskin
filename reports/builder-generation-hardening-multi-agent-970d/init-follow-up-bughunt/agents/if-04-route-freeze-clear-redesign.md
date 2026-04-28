## Agent IF-04 - Route freeze / clear-redesign

### Findings

| Severity | Location | Bug / risk | Confidence |
|----------|----------|------------|------------|
| High | `src/lib/gen/route-plan/route-plan-builder.ts:71-106` | Follow-up freeze intersects `brief.pages` with existing paths unless explicit add-route intent exists. A clear-redesign delta brief with new IA pages can be silently ignored. | 78% |
| Medium | `src/lib/gen/route-plan/route-plan-builder.ts:202-205`, `locale-dedupe.ts:32-45` | Locale dedupe runs after freeze and can remove a route that still exists on disk, contradicting route preservation. | 65% |
| Medium | `src/lib/gen/route-plan/path-utils.ts:18-40` | `existingRoutePaths` only detects `page.(t|j)sx?`. If snapshot/files lack page files, follow-up can fall back to init-like route planning. | 60% |
| Low | `route-plan-builder.ts` | `followUpIntent` / `clear-redesign` is not an input to route planning, so "frozen routes except clear-redesign" is not encoded here. | 85% as gap |

### Evidence

- Freeze creates routes from existing paths.
- Brief routes are only upserted under freeze if already present.
- Locale dedupe mutates the route list after freeze.

### Suggested fixes

1. Thread `followUpIntent` into route planning.
2. For clear-redesign, allow brief-route union or replacement under explicit policy.
3. Skip locale dedupe for pairs where both paths were already existing.
4. Fallback to snapshot route summary when `previousFiles` lacks page files.

**Model:** composer-2-fast (subagent)
