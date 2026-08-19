# B11 — Briefens åsikt i scaffold-valet

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: landad i PR #1042; smalt follow-up-fixspår separerar ton från
scaffoldtyp.
Ägarbeslut: **2026-08-19** (keyword-matchningen är för dum; Briefen ska väga in).
Efter [B7](B7-variantens-auktoritetsordning.md). Inte N5.

## Problemet

Slutligt scaffold-val körs redan efter Briefen
(`buildScaffoldQueryContext` → `matchScaffoldAuto`). #1042 landade Briefens
stil- och domänåsikt i matchern. Den första landningen lät även
`toneAndVoice` delta i scaffold-keywords och embedding-prompten; det var för
brett eftersom tonord utan domänsignal då kunde göra en domänscaffold valbar.

| Brief-fält | Når scaffold-matchern? |
|---|---|
| `pages` namn/path | Ja — mot **typ**-ordlistor (`landing`, `shop`, `blogg`) |
| `visualDirection.styleKeywords` | Ja, samma typ-ordlistor |
| `toneAndVoice` | Nej efter fixspåret — styr copy och variant, aldrig scaffold-keywords eller scaffold-embedding |
| `domainProfile` | Ja, landat i #1042. Mappas till bank-token; `businessType` / `industry` läses inte |

Före #1042 vann «hemsida»/«sajt» därför ofta landing även när Briefen redan
sagt `spa-salon` eller `portfolio`.

## Uppgift

Landat i #1042: dra `domainProfile` in i `ScaffoldQueryContext`, ersätt de döda
fälten och ge en mjuk typboost från den stängda enumen (`ecommerce` →
ecommerce, `portfolio` → portfolio, `saas` → saas-landing,
`spa-salon`/`restaurant` → landing). Follow-up-fixen tar bort
`toneAndVoice` från både scaffold-keywords och scaffold-embedding. Ton får
fortsatt styra copy, variant och variantens addendum, men får inte ensam göra
en domänscaffold valbar. Inga scaffold-id i brief-schemat.

## Vad som INTE ingår

- Ny orkestrator-LLM.
- Fria id:n i `siteBriefSchema`.
- Ändra dossier-val.
- Global sänkning av `MIN_SCORE` inne i B7 — det här är den egna ytan.
- ZIP / mall-import.
