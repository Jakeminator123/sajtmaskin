# K1 — En nyckel-/statusyta

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Samma beslut och samma information bor på flera överlappande ställen
(kodinventerat 2026-08-15):

| Yta | Fil | Överlapp |
|---|---|---|
| Byggblock-popovern (Inkopplade + env-fält + Egna nycklar) | `preview-panel/dossiers/DossiersPopoverView.tsx` | enda env-SKRIVytan i dag |
| `F3RequirementsSurface` efter 412 | `readiness/F3RequirementsSurface.tsx` | listar samma saknade nycklar igen |
| `LaunchReadinessCard` | `readiness/LaunchReadinessCard.tsx` | «Öppna miljövariabler» i F3 |
| Status: panelbadge, Model info-raden «Planerad — kopplas in i nästa steg», chattkort, `F3StatusSurface` | flera | fyra parallella statusspråk |

Ägarbeslut D2: dubbla ytor/sanningsytor → **en** yta.

## Uppgift

- **Skriva nycklar:** endast i Byggblock-ytan. 412-ytan reduceras till kort
  besked + «Öppna Byggblock» på rätt block (delvis byggt — gör det till enda
  innehållet). `LaunchReadinessCard` länkar dit i stället för egen env-lista.
- **Läsa status:** en källa — dossiers-routen/`resolveDossierLifecycle` — och
  ett statusspråk. Klienten härleder inget eget. Model info-raden och
  panelbadgen ska säga samma ord om samma block.
- Ta bort ytor/textvarianter hellre än att lägga till (`mvp-scope-freeze.mdc`).

## Vad som INTE ingår

- Ingen ny statusmodell och inga nya statusord (samma fem `overviewStatus`).
- Panelens storlek/utseende (det är U1 — K1 är informationsägarskap).

## Verifiering

- `npm run typecheck` + komponenttester för de tre ytorna.
- Manuellt flöde i preview: 412 → Byggblock öppnas på rätt block → nyckel →
  samma status överallt.
- Docs som beskriver ytorna uppdateras i samma PR.

## Klart när

En användare med saknad nyckel möter exakt en plats att åtgärda den på, och
exakt ett statusspråk för blocket.
