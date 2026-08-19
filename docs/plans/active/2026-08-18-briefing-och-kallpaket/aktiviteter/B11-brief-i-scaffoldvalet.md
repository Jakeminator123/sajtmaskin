# B11 — Briefens åsikt i scaffold-valet

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: öppen PR #1042.
Ägarbeslut: **2026-08-19** (keyword-matchningen är för dum; Briefen ska väga in).
Efter [B7](B7-variantens-auktoritetsordning.md). Inte N5.

## Problemet

Slutligt scaffold-val körs redan efter Briefen
(`buildScaffoldQueryContext` → `matchScaffoldAuto`). Men Briefens stil- och
domänåsikt når knappt matchern:

| Brief-fält | Når scaffold-matchern? |
|---|---|
| `pages` namn/path | Ja — mot **typ**-ordlistor (`landing`, `shop`, `blogg`) |
| `visualDirection.styleKeywords` | Ja, samma typ-ordlistor |
| `toneAndVoice` | Ja i denna PR — keyword-boost + embedding-prompt |
| `domainProfile` | Ja i denna PR. Mappas till bank-token; `businessType` / `industry` läses inte |

Därför vinner «hemsida»/«sajt» ofta landing även när Briefen redan sagt
`spa-salon` eller `portfolio`.

## Uppgift

Dra `domainProfile` + `toneAndVoice` in i `ScaffoldQueryContext`. Ersätt de
döda fälten. Mjuk typboost från den stängda enumen (`ecommerce` → ecommerce,
`portfolio` → portfolio, `saas` → saas-landing, `spa-salon`/`restaurant` →
landing). Inga scaffold-id i brief-schemat.

## Vad som INTE ingår

- Ny orkestrator-LLM.
- Fria id:n i `siteBriefSchema`.
- Ändra dossier-val.
- Global sänkning av `MIN_SCORE` inne i B7 — det här är den egna ytan.
- ZIP / mall-import.
