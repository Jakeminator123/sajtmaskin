---
status: active
owner: unassigned
topic: Dossier-förenkling i etapper — helhetsdom över systemet (behålls), nedbantning av poolen (etapp 1 levererad i denna PR-serie), och exakta kartor för de kvarvarande, tyngre etapperna.
created: 2026-08-06
source: Ägarens fria-händer-uppdrag 2026-08-05 (holistisk genomgång av dossiersystemet) + prod-körningen chat 3a6c5472 + prod-telemetri (generation_telemetry.meta.selectedDossierIds) + två kodkartläggningar.
---

# Dossier-förenkling: dom, leverans och kvarvarande etapper

## Dom över systemet (helhetsgranskningen)

**Arkitekturen behålls.** Trenivåmodellen (Capability = behov → Dossier/Byggblock
= vald implementation → Grupp = ren UI-rubrik), de tre oberoende axlarna
(Kopplad/Fristående · Demoläge · Kräver F3) och den deterministiska selektionen
är sunda och konsekvent implementerade. Det som kändes som "flera halvbyggda
system" är i själva verket ETT system med för många exemplar och för mycket
metadata-yta per exemplar. Därför: **banta exemplar, inte bygga om modellen.**

Verifierade fakta bakom domen:

- Bara **9 av 27** dossiers hade någonsin selekterats i prod
  (telemetri 2026-07-03→08-05, 80 generationer / 35 chattar).
- Poolstorleken kostar **inga** prompt-tokens (bara valda dossiers injiceras) —
  kostnaden är kuration, freshness-grind, veckovis acceptans-CI och kognitiv yta.
- Det fanns exakt **en** dossier-till-dossier-koppling i hela systemet
  (`subscriptions` ⇒ `auth` pinnad till supabase-auth). Beroendegrafen ägaren
  oroade sig för existerar inte.
- F2-för-backend-frågan är redan besvarad av mock-kontraktet: F2 emitterar
  aldrig serverfiler; ytan renderas med ärligt demoläge (`canned`/`seed`/
  `success`/`visual`), backend byggs i F3. Det som brast i prod-körningen var
  F3-exekveringen (verifier-dom + repair-undertryckande → `SM-023`/`SM-024`),
  inte modellen.

## Levererat (PR-serien 2026-08-06)

| Etapp | Innehåll | Läge |
|---|---|---|
| Fix-PR (`fix/dossier-defekter-0805`) | MapLibre-importfixen (verifierad med skarpt acceptansbygge), acceptansmatrisen täcker nu soft-dossiers med filer, F3-planblocket förbjuder suggestion-only-rundor, backlograder `SM-023`–`SM-026` | Klar, väntar på granskning |
| Etapp 1 (`feat/dossier-forenkling`) | Fyra hard-dossiers parkerade (`sentry-error-tracking`, `plausible-analytics`, `fal-image-generation`, `ably-realtime`) med full sweep: vokabulär, brief-prompt, grupper, undantagslista, backoffice-spegel, docs. Pool 27 → 23 (14 hard + 9 soft) | Klar, väntar på granskning |

Urvalskriteriet för etapp 1: noll prod-selektioner OCH noll lastbärande
kodreferenser (bara kommentarer/testfixturer). Systemet degraderar by design
när en capability saknar dossier — gamla snapshots selekterar tyst ingenting
och F3-godkännanden går den generiska providervägen.

## Kvarvarande etapper (kartlagda, ej påbörjade)

Referenskartorna nedan är grep-verifierade 2026-08-06. Ta en etapp i taget;
var och en är en egen PR med egen testsweep.

### Etapp 2 — `paddle-billing` + capability `subscriptions` (störst förenklingsvinst)

Tar bort systemets enda dossier-beroende (`DEPENDENT_CAPABILITIES` i
`select.ts` dör helt). 9 runtime-referenser: `select.ts` (pin +
expansion), `capability-inference.ts` (needsSubscriptions-flagga + regex),
`capability-prompt-filter.ts` (money-flow-dedup subscriptions/payments),
`follow-up-capability-vocabulary.ts` (subscriptions-entry),
`site-brief-generation.ts` (två promptsträngar), `capability-dossier-bridge.ts`,
`capability-removal.ts` (kommentar), scaffold-manifestens `sourceTemplateIds`
(ren proveniens, kan stå kvar). Plus tester i samtliga.
**Obs:** engångsbetalning (`payments`/stripe-checkout) berörs inte.

### Etapp 3 — databassyskonen (`neon-postgres`, `mongodb-atlas`)

Behåll `postgres-drizzle` som ensam databas-dossier (en Neon-connection-string
fungerar med pg-drivern). mongodb-atlas är tyngst refererad (13 runtime-filer:
pins i `resolve-base`, `tier3-build-spec`, `f3-approve-round`,
`finalize-design`, snapshot, dep-completer, select-keywords) och är dessutom
dokumentationens standardexempel för syskon-pins — sweepen ska peka om
exemplen till `supabase-auth` under `auth`. `SM-004` (postgres-dossierns
verbatim/rewritable-mix) och `SM-006` (dependency-backfillens providertapp)
bör tas i samma pass.

### Etapp 4 — AI-familjen (`ai-tool-calling-chat`, `rag-chat`)

Båda är overifierade, aldrig selekterade i prod och överlappar `openai-chat`.
Parkeras de dör dedup-regeln `ai-tool-calling` ⇒ droppa `ai-chat`
(`expandDependentCapabilities`) och rag-chats specialfall i
`system-prompt/budget.ts`. rag-chat är poolens största dossier (9 filer,
composite-providern openai+postgres). Brief-promptens `ai-tool-calling`/
`rag-chat`-regler trimmas i samma pass.

Slutläge efter etapp 2–4: **~9 hard + 9 soft = 18 dossiers**, noll
specialregler i selektionen utöver alias + relevanceKeywords + default.

## Frågor ägaren ställde, med svar

| Fråga | Svar |
|---|---|
| Byta till etablerat system (Vercel Marketplace)? | Nej. Marketplace provisionerar externa TJÄNSTER till ett Vercel-projekt — det kuraterar inte sajtkod. Behåll dossiers; Marketplace kan långt senare bli en F3-provisioneringsväg för nycklar. Närmast etablerad motsvarighet för soft-dossiers är shadcn-registryformatet (Sajtmaskin har redan `@sajtmaskin`-registryt) — en ev. konvergens är ett post-MVP-beslut. |
| Separat "implementation-agent" i LLM-flödet? | Nej. Prompten får redan instruktioner + verbatim-filer, och `applyDossierVerbatimPolicy` återställer verbatim-filer deterministiskt efter merge. A2-felet (suggestion i stället för kod) var ett kontraktshål, inte en saknad agent — åtgärdat i fix-PR:en via F3-planblocket. Fler agenter = fler rörliga delar (mot `pipeline-rules.mdc`). |
| Är mock-lägena för många? | Nej — de fem värdena driver olika komponentmönster och promptrader och är CI-grindade. Terminologin "Demoläge" täcker dem som ETT begrepp. |
| "Easy dossiers" (Street Fighter-visionen)? | Det ÄR soft-poolen (spel, karta, sök, galleri, 3D...). Gapet var att soft-filer aldrig typkontrollerades mot sina pinnade beroenden — stängt i fix-PR:en (acceptansmatrisen). Fler easy dossiers kan kurateras via `dossiers:curate` när MVP-frysen släpper. |

## Related

- Defektrader: `SM-023`–`SM-026` i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
- Kontrakt: [`docs/contracts/dossier-system.md`](../../../contracts/dossier-system.md)
- Parkeringsytor: `_parkering/dossiers-utfasade-2026-07-22/` · `_parkering/dossiers-utfasade-2026-08-06/`
