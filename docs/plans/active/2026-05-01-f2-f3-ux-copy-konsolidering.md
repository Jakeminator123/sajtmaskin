---
id: 2026-05-01-f2-f3-ux-copy-konsolidering
status: active
created: 2026-05-01
linear: null
parent: 2026-04-28-llm-flode-startlinje
supersedes: null
---

# F2/F3 UX-copy konsolidering

Kort plan för copy-spåret (spår B) från `Kvarvarande-uppgifter.md` #11. Den här planen äger bara ordval/label-städning och får inte ta över signal-/statuslogik (spår A).

## Scope

- Konsolidera "Bygg nu" / "F3" / "Bygg integrationer" till ett kanoniskt ordval per UI-yta.
- Säkerställ att copy inte lovar mer än signalerna faktiskt vet (ingen falsk "allt grönt"-text).
- Byt legacy-termen "sandbox" till `preview` / `VM` / `preview_host` i ny/ändrad text.

## Ej i scope

- Ingen ny backend-signal.
- Ingen statusprojektion i klientkod.
- Ingen ändring i quality-gate-logik.

## Målbild för text

| Kontext | Måltext (v1) |
|---|---|
| F2 klar, ej verifierad integration | `Design redo` |
| F2 verify pågår | `Verifierar design` |
| F3 explicit körning | `Bygger integrationer` |
| F3 klar | `Integrationsbuild klar` |
| Degraded/silent osäkerhet | Neutral text + länk till diagnos, inte "klart" |

## Källor

- `docs/plans/active/Kvarvarande-uppgifter.md` #11 (spår B)
- `docs/architecture/llm-flow-target-worldclass.md` (single status truth)
- `docs/architecture/version-status-state-machine.md`
