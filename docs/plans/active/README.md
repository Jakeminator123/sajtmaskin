# Aktiva planer

Den här filen är en tunn router till arbete som fortfarande kan styra nya
ändringar. Levererad status, avslutade checklistor och beslutshistorik hör till
[`../avklarat/`](../avklarat/), [`../archived/`](../archived/) eller git.

Planlivscykeln ägs av
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc). Defekter och
repro-status ägs av [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md);
kopiera inte dess kö hit.

## Pågående spår

| Spår | Plan | Nästa beslut eller leverans |
| --- | --- | --- |
| Preview-/verifieringslivscykel | [`2026-07-preview-verification-lifecycle-simplification.md`](2026-07-preview-verification-lifecycle-simplification.md) | Levereras i PR: reload-dedup, icke-blockerande verify-UX, en F3-ägare, neutral supersede. Follow-up: runtime-ready-ombyggnad. |
| Verify/F3/domän-stabilisering | [`2026-07-13-stabilisering-verify-f3-doman-plan.md`](2026-07-13-stabilisering-verify-f3-doman-plan.md) | Slutför planens kvarvarande review-, invalidation- och canary-punkter. |
| Användarsajtens env-yta | [`2026-07-13-anvandarsajt-env-konsolidering.md`](2026-07-13-anvandarsajt-env-konsolidering.md) | Kräver produktbeslut eftersom förslaget påverkar F2:s env-policy. |
| Builder-status och UI-brus | [`2026-07-13-builder-status-ui-declutter.md`](2026-07-13-builder-status-ui-declutter.md) | Avgränsa copy och presentation från runtime-gates. |
| Builder-runtimeens robusthet | [`2026-07-13-builder-runtime-robusthet.md`](2026-07-13-builder-runtime-robusthet.md) | DB-backoff, CSP/fontbrus och scaffold-lint ska levereras separat. |
| Dossier/UI-ownership | [`2026-07-13-dossier-ui-ownership-kontrakt.md`](2026-07-13-dossier-ui-ownership-kontrakt.md) | Lås att en dossier inte skapar en konkurrerande användaryta. |
| Körningslogg + tokenmätning | [`2026-07-24-genlogg-och-tokenmatning.md`](2026-07-24-genlogg-och-tokenmatning.md) | Steg 2 (`llm_usage` + instrumentering) mergad 2026-07-25 (#613); steg 1 (lokalt insamlingsskript) ligger i #609. Kvar: steg 3 — vad mätningen ska användas till (per-token-kredit? Sajtagentens och D-ID:s förbrukning?). |
| Innehållsrevision för verifieringskvitton | [`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md) | Väntar på ägarbeslut (3 punkter): additiv migration + statuskontrakt som låter verdikt/kvitto säga vilket innehåll de gäller. Konsoliderar 3 backlog-rader. |
| Builder-åtgärdsprogram efter observationssession | [`2026-07-25-builder-atgardsprogram/00-master-plan.md`](2026-07-25-builder-atgardsprogram/00-master-plan.md) | Alla sex spår implementerade 2026-07-26; alla fem ägarbeslut fattade och inskrivna. F1–F9 arkiverade i [`backlog-arkiv-2026-07-25.md`](../avklarat/bug-swarm/backlog-arkiv-2026-07-25.md), F10 konsoliderad in i innehållsrevisions-raden. **Kvar innan planfamiljen flyttas till `avklarat/`:** acceptanskörningen i prod (prompten och de åtta kontrollerna står i master-planen) plus de DoD-rader som kräver manuell klickrunda i buildern — spår 04 rad 3–9, spår 03 rad 5–6, spår 05 rad 1, 2, 4, 6, 8. |
| Backoffice Byggstenar (scaffold/variant/byggblock/mall) | [`2026-07-24-backoffice-byggstenar/00-master-plan.md`](2026-07-24-backoffice-byggstenar/00-master-plan.md) | Etappleverans med ägargodkännande mellan varje steg. Fas A klar (hub, verb-namn, spara-läge repo/lokalt/prod, jargon bakom expandrar). Nästa: egen liten PR för baseline-backupen (dataförlust på ospårade filer), sedan Fas B → C → D-förslag. |
| Backoffice-stringens | [`2026-07-08-backoffice-stringens-plan.md`](2026-07-08-backoffice-stringens-plan.md) | Kärnan implementerad 2026-07-21 (6 grupper, konsoliderade sidor, backup/Återställning); kvar: P2-städ (subprocess-helpers, terminologi-svep, fler tester). Refresh-handoff arkiverad. |

## Andra aktiva sanningar

- Buggar och policybeslut: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md)
- Dokumentationskonsolideringens status:
  [`documentation-audit-2026-07-13.md`](../../audits/documentation-audit-2026-07-13.md)
- Stabil arkitektur och kontrakt: [`../../README.md`](../../README.md)

## När en plan är klar

Flytta planen till `../avklarat/` om den levererats och fortfarande har
referensvärde. Flytta den till `../archived/` om den är parkerad eller ersatt.
Radera rena arbetsanteckningar när git-historiken räcker. Uppdatera denna router
i samma PR.
