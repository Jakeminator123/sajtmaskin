# MVP-säkerhet och releaseberedskap

Ägaruppdrag 2026-09-09: ompröva den externa genomlysningen mot aktuell
`preview`, genomför rimliga avgränsade förbättringar med underagenter,
verifiera och gör housekeeping före **en samlad PR mot preview**.

## Ramar

- **Preview och produktion fortsätter dela databas**, enligt Jakobs uttryckliga
  beslut. Ingen ändring av DB-targets eller uppdelning av kunddata ingår.
- Bas vid start: `e4a58031dd644b4700b1312991a3f0156331ab52`. Uppdatera
  mot fjärrtip före PR; #1320/#1324 har därefter mergats av annan aktör.
  Integrationsbas: `17afaed7222af227e8477b68a2644c5c21f81f32`.
- Ursprung: extern MVP-genomlysning 2026-09-09 av äldre preview `e4761c4`.
  Rapportens observationer är underlag som verifieras, inte nya runtimekrav.
- Underagenter äger separata filer/områden. Parent samordnar integration,
  verifiering, dokumentation och PR. Inga parallella git-checkouts/commits.
- Kod och migrationsförslag görs reviewbara i PR. Inga merges, kundbetalningar,
  host-deployments eller destruktiva ändringar av levande data ingår.
- Grok 4.6 är inte tillgänglig i denna miljö; tillgängliga Codex-modeller
  används enligt ägarens mandat att välja andra modeller när det behövs.

## Arbetsordning och acceptans

| Spår | Omfattning | Klart när | Status |
|---|---|---|---|
| A – kontokoppling | Google får inte aktivera en overifierad registrants lösenord | Reproducerad sekvens blockeras; avsedd verifierad kontokoppling fungerar | Kod/test/review klart; releaseåtgärder återstår |
| B – wizardbehörighet | Ny RLS/ACL-migration och skydd mot migration-only-glapp | Publika roller nekas; backend kan hantera körningar; verifierat i isolerad Postgres | Kod/test/review klart; releaseåtgärder återstår |
| C – genereringskostnad | Begränsa parallellt odebiterbart arbete före AI-anrop | Vanlig användare kan inte konsumera samma fria/saldobaserade rätt parallellt; avbrott släpper skyddet först när arbetet avslutats | Kod/test/review klart; releaseåtgärder återstår |
| D – preview-host | Exakt releaseidentitet och bedömning av verklig projektisolering | Health kan bindas till bygg-SHA; kvarstående isoleringsrisk redovisas utan falsk säkerhetsgaranti | Kod/test/review klart; releaseåtgärder återstår |
| E – kundinformation | Verifierbara fel i publicerade texter och versionsdatum | Inga uppfunna bolagsuppgifter; korrekt drift-/leverantörsbeskrivning och tydliga kvarstående uppgifter | Kod/test/review klart; releaseåtgärder återstår |
| F – drift och release | Vercel/Supabase read-only, installera Fly CLI, riktad regression och PR | Verktygsåtkomst verifierad; ändringar granskade; housekeeping och en PR | Pågår |

## Verifiering och leverans

1. Underagent lämnar ändrade paths, egna tester, risker och kvarstående arbete.
2. Parent kör `verify:pr -- --plan`, relevanta tester, typecheck och berörda
   schema-/dokumentkontrakt. Ingen rutinmässig full supertestkörning.
3. Oberoende review av samlad diff; triagera konkreta fynd före sign-off.
4. Housekeeping: inga scratchfiler, hemligheter, dubbla planer eller
   orelaterade ändringar; uppdatera aktiva planroutern och buggsanning vid behov.
5. PR beskriver vad koden fixar, vad som kräver migration/host-release och
   vad som fortfarande blockerar öppen lansering. Active-planen behålls tills
   arbetet är mergat och återstående releaseåtgärder är överlämnade.

## Avgränsningar som inte får döljas

En katalog per projekt och filtrerade miljövariabler är inte säker isolering.
Ingen mikro-VM/containerlösning får betecknas produktionsklar utan körbar
verifiering av separata filsystem/processer/hemligheter och resursgränser.
Lösenordsåterställning, kontrollerad betald kundresa, lastprov och faktisk
leverantörs-/bolagsidentitet tas vidare som uttryckliga restpunkter om de inte
kan slutföras säkert i denna PR. Delad databas är ett ägarbeslut, inte en restbugg.

Buggsanning: `SM-078`–`SM-081` i [backloggen](../../../../BUG-SWARM-BACKLOG.md).
Detaljerad körjournal och slutbevis: [01-resultat.md](01-resultat.md).
