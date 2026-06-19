---
id: gm-omrade-06-status-och-ui-ux
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 6 — Status & UI/UX (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 2** · **Beroende:** område 1

## Syfte
Event-bus som enda UI-status. Ersätt legacy DB-statusresolver, visa korrekta degraded
states, och gör follow-up-bas transparent ("du redigerar v7, senaste är v9").

## Yta (owner-surface — verifierad mot HEAD)
- `src/components/builder/VersionHistory.tsx`
- `src/app/builder/BuilderShellContent.tsx`
- läser (ej exklusivt): `src/lib/hooks/chat/useVersionStatus.ts`, `src/lib/logging/event-bus-projection.ts`

## Klart när
- [x] Ingen central builder-yta använder `resolveEngineVersionDisplayStatus` direkt — resolvern **borttagen** (6-3 punkt 2).
- [x] "Reparerar" / "Fix redo" / "Verifierad" / "Degraded" visas korrekt; placeholder ≠ success.
- [x] Stabilitetstest låser N#6 (event-bus UI-flip) — `status-resolver-single-writer.stability.test.ts` (hård import-invariant).

**Status (2026-06-19):** uppfyllt via 6-1 (#159), 6-2 (#160), 6-3 punkt 1 (#162) + 6-3 punkt 2 (denna draft-PR #163: S3-invariant aktiverad + legacy-resolver borttagen).

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
