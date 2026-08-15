# B4 — Copy-/docs-städ: döda referenser och vilseledande text

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Fyra små men användarnära lögner/kvarlevor, alla kodverifierade 2026-08-15:

| # | Vad | Var |
|---|---|---|
| 1 | Död copy: «Konfigurera via miljövariabler eller **Integrationspanelen**» — panelen är borttagen (2026-07-22) | `src/components/builder/chat/tool-parts.tsx` ~302–305 |
| 2 | «**Deep brief: på**» visas i Model info även på follow-ups där ingen Deep Brief körs (`promptAssistDeep` ekas oavsett) | `useSendMessage.ts` ~413–415, `helpers-model-info.ts` |
| 3 | Knappen «**Spara och aktivera**» aktiverar inget i F2 — den sparar nyckeln och startar om previewn | `DossiersPopoverView.tsx` ~315 + kvittotexten ~334–337 |
| 4 | Docs-drift: `vercel-analytics` beskrivs som «klar redan i designläget» medan F2-policyn mutar analytics (`F2_MUTE_POLICY_ONLY_CAPABILITIES`) | `docs/contracts/dossier-system.md` ~rad 175 |

## Uppgift

1. Peka copyn mot Byggblock-ytan (det enda som finns).
2. Visa Deep brief-raden bara när steget faktiskt kört (init/clear-redesign),
   eller döp om raden till det den mäter.
3. «Spara nyckel» + ärligt kvitto: previewn startas om; live kräver
   integrationsbygget (eller, om integrationen redan är byggd, att nyckeln är
   riktig — då kan raden bli live utan ny LLM-runda).
4. Rätta analytics-raden så den nämner policy-muten; behåll `Kräver F3: Nej`
   (det är korrekt — axlarna är oberoende).

## Vad som INTE ingår

- Inga flödesändringar (det är K1/K2). Bara text, villkor för visning och docs.

## Verifiering

- `npm run typecheck` + riktade komponent-/snapshot-tester.
- `npm run docs:links` för docs-ändringen.
- Grep: «Integrationspanelen» ger noll träffar i `src/`.

## Klart när

Ingen användarsynlig text lovar något som inte händer; docs-raden om analytics
matchar `f2-mute.ts`.
