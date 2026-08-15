# B1 — Providerval: negation, multi-hit och okänd provider

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

`pickForCapability` i `src/lib/gen/dossiers/select.ts` gör bara positiva
keywordträffar. Tre felklasser:

1. **Negation förstås inte.** `Använd inte Clerk. Bygg auth med Supabase.`
   träffar båda syskonen; defaulten (Clerk) vinner multi-hit-regeln
   (`matchedDefault ?? keywordMatches[0]`, ~rad 286–291).
2. **Multi-hit-vinsten stämplas `relevance-keyword`** — samma reason som ett
   äkta explicit val. `isExplicitDossierChoice()` blir sann, så det falska
   valet kan persisteras som syskonidentitet (`mutedDossierIds`) och överleva
   follow-ups och F2→F3.
3. **Okänd/felstavad provider** faller tyst till defaulten i stället för att
   markeras.

## Uppgift

- Extrahera negerade providermarkörer (sv/en: «inte X», «utan X», «byt från X»,
  «not X», «without X») och uteslut de syskonen ur kandidatlistan före match.
- Vid kvarvarande multi-hit där defaulten inte är uttryckligen begärd: välj
  **inte** tyst default med `relevance-keyword`-reason. Antingen välj den
  icke-default-träff som är entydig, eller falla till capability-default med
  reason `capability-match` (så att valet ALDRIG ser explicit ut när det inte är det).
- Selection-reason ska förbli den enda signalen för «äkta val» — inga nya fält.

## Vad som INTE ingår

- Embeddings, fuzzy match eller domänveto (medvetet uteslutna, se filhuvudet).
- Ny klargörandefråge-yta — den befintliga follow-up-klargöraren räcker om den
  behövs; annars deterministisk regel.

## Verifiering

- Nya fall i `src/lib/gen/dossiers/select.test.ts`: negation sv/en, negation +
  explicit alternativ, multi-hit utan negation, okänd provider, oförändrade
  befintliga fall (default, keyword, alias-pin, id-träff).
- `npm run typecheck` + riktad vitest.
- Golden-/prompttester som rör `mutedDossierIds`-persistens.

## Klart när

`Använd inte Clerk. Använd Supabase Auth.` väljer `supabase-auth`; ett
multi-hit-default-val kan aldrig persisteras som explicit; backlograd tillagd
eller avbockad i `BUG-SWARM-BACKLOG.md`.
