# Loggbok — Dossier-/Byggblock-sanering (körning 2026-08-17)

Orkestrerad Cloud-körning av [`00-master-plan.md`](00-master-plan.md).
Branch: `cursor/dossier-ux-sanering-79ab` (från master `b1a75de8d`).
En PR för hela spåret; en commit per aktivitet.

Ägardirektiv för körningen (2026-08-17): fria händer inom planens ramar;
underagenter på Grok 4.6 high fast; provider vald → provider-specifik
integration, ingen provider → demo/mock som aldrig blockerar övriga steg.

## Framsteg

**Totalt: 8 % (1/12 aktiviteter klara)**

| Id | Aktivitet | Status | Commit |
|---|---|---|---|
| B1 | Providerval: negation/multi-hit/okänd provider | Pågår (subagent) | – |
| B2 | En F3-promptauktoritet (SM-005) | **Klar** | `512e7a9cd` |
| B3 | Plattforms-`process.env`-fallback bort | Ej startad | – |
| B4 | Copy-/docs-städ | Ej startad | – |
| B5 | F3-marker env-nycklar + detaljkort (SM-008/009) | Ej startad | – |
| K1 | En nyckel-/statusyta | Ej startad | – |
| K2 | Katalogklick stage:as | Ej startad | – |
| M1 | Strukturerad materialisering | Ej startad | – |
| U1 | Byggblock-ytans lyft | Ej startad | – |
| F1 | F2/F3-begreppsutfasning | Ej startad | – |
| HK | Housekeeping-svep (docs/schema/backlog/beslut/städ) | Ej startad | – |
| V | Slutverifiering + bugbot | Ej startad | – |

## Beslut under körningen

| När | Vad | Grund |
|---|---|---|
| 2026-08-17 | En PR i stället för tre | Ägaren: «det kvittar»; aktiviteterna bygger på varandra |
| 2026-08-17 | Subagentmodell `cursor-grok-4.6-high-fast` | Ägarens rabatt; `xhigh-fast` fanns inte i sessionens modellista |

## Anteckningar

(fylls på per aktivitet)
