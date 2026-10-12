# Starta tre nya Codex-chattar

Klistra in respektive block som användarmeddelande i en ny lokal chatt i samma
checkout. Använd inte fullhistorik-fork och skapa inte worktree. Modellvalen
görs i Codex; blocken ändrar inte appens inställningar automatiskt.
Säg sedan till samordnaren att chattarna är startade. Denne kopplar deras ID:n
och testar ACK innan första skrivpaketet. Startregistrering är readonly.

## 1 — Sol 6.1 / XHigh

```text
Du är chatt 1 i initiativet LLM-CLEANUP-20261011. Döp chatten till "1".
Arbeta i C:/Users/jakem/.codex/worktrees/llm-legacy-cleanup/sajtmaskin.
Läs AGENTS.md och sedan bara:
docs/plans/active/2026-10-11-llm-kedja-och-legacy/00-master-plan.md
docs/plans/active/2026-10-11-llm-kedja-och-legacy/01-kontrakt-och-kandidat.md

Jag, Jakob, ger den samordnande chatten mandat att kontakta dig, tilldela
avgränsade arbetsuppdrag och läsa dina svar. Du ansvarar för A1, A2 och senare
C1, men får börja skriva först när ett uttryckligt paket med skrivytor har
kommit från samordnaren. Du är inte ensam i checkouten: bevara andras ändringar.
Ingen branchväxling, commit, push, DB-apply eller nya underagenter på eget initiativ.

Registrera dig nu readonly: verifiera cwd, branch/HEAD, git-status och om
Codex-appens meddelande-/trådläsningsverktyg finns. Svara med
"LLM-CLEANUP-20261011/1 READY", dessa fakta och eventuell blockerare, högst
120 ord. Gör ingen bred repoanalys nu. Avsluta sedan turen och invänta uppdrag.
När samordnaren skickar ett uppdrag, bekräfta ACK i denna chatt och följ paketet.
Försök inte skicka tillbaka till den ephemeral sidokonversationen; samordnaren
läser ditt slutresultat här. Rapportera paket i högst 200 ord plus bevispekare.
```

## 2 — Sol 6.1 / High

```text
Du är chatt 2 i initiativet LLM-CLEANUP-20261011. Döp chatten till "2".
Arbeta i C:/Users/jakem/.codex/worktrees/llm-legacy-cleanup/sajtmaskin.
Läs AGENTS.md och sedan bara:
docs/plans/active/2026-10-11-llm-kedja-och-legacy/00-master-plan.md
docs/plans/active/2026-10-11-llm-kedja-och-legacy/02-legacy-och-agare.md

Jag, Jakob, ger den samordnande chatten mandat att kontakta dig, tilldela
avgränsade arbetsuppdrag och läsa dina svar. Du ansvarar för B1 och B2:
faktisk legacy-rensning, borttagning och enklare ägar-/dokumentationsytor.
Du får börja skriva först när ett uttryckligt paket med skrivytor kommit från
samordnaren. Du är inte ensam i checkouten: bevara andras ändringar. Ändra inte
chatt 1:s pipeline. Ingen branchväxling, commit, push, DB-apply eller nya underagenter.

Registrera dig nu readonly: verifiera cwd, branch/HEAD, git-status och om
Codex-appens meddelande-/trådläsningsverktyg finns. Svara med
"LLM-CLEANUP-20261011/2 READY", dessa fakta och eventuell blockerare, högst
120 ord. Ingen totalinventering nu. Avsluta sedan turen och invänta uppdrag.
Bekräfta nästa uppdrag med ACK i denna chatt. Samordnaren läser dina svar här;
skicka inte till den ephemeral sidokonversationen. Paketrapport högst 200 ord
plus bevispekare: vad försvann, tester och vad som faktiskt behöver beslut.
```

## 3 — Astra / High, readonly

```text
Du är chatt 3 i initiativet LLM-CLEANUP-20261011. Döp chatten till "3".
Arbeta readonly i C:/Users/jakem/.codex/worktrees/llm-legacy-cleanup/sajtmaskin.
Läs AGENTS.md och sedan bara:
docs/plans/active/2026-10-11-llm-kedja-och-legacy/00-master-plan.md
docs/plans/active/2026-10-11-llm-kedja-och-legacy/03-livscykel-och-granskning.md

Jag, Jakob, ger den samordnande chatten mandat att kontakta dig, ge avgränsade
granskningsuppdrag och läsa dina svar. Du ska förbli oberoende av författandet:
ingen produktkod, tester, planstatus, git- eller providerändring. Inga underagenter.
Granska inte hela repo nu. Vänta på fryst scope/bas/head eller en konkret
arkitekturfråga. Satsa på riktiga buggar/kontraktsbrott, inte nits eller extra lager.

Registrera dig readonly med cwd, branch/HEAD, git-status och tillgång till
Codex-appens meddelande-/trådläsningsverktyg. Svara
"LLM-CLEANUP-20261011/3 READY", högst 120 ord, och avsluta sedan turen.
Bekräfta nästa uppdrag med ACK här. Samordnaren läser resultatet i denna chatt;
skicka inte till den ephemeral sidokonversationen. Vid Buggpass följer du det
tilldelade formatet med säkerhet %, impact 1–5 och kort konkret kommentar.
Returnera verkliga fynd/bevis, aldrig ett påhittat godkännandekvitto.
```
