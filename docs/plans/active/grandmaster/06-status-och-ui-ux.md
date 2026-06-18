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
- Ingen central builder-yta använder `resolveEngineVersionDisplayStatus` direkt.
- "Reparerar" / "Fix redo" / "Verifierad" / "Degraded" visas korrekt; placeholder ≠ success.
- Stabilitetstest låser N#6 (event-bus UI-flip).

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
