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
| Verify/F3/domän-stabilisering | [`2026-07-13-stabilisering-verify-f3-doman-plan.md`](2026-07-13-stabilisering-verify-f3-doman-plan.md) | Slutför planens kvarvarande review-, invalidation- och canary-punkter. |
| Användarsajtens env-yta | [`2026-07-13-anvandarsajt-env-konsolidering.md`](2026-07-13-anvandarsajt-env-konsolidering.md) | Kräver produktbeslut eftersom förslaget påverkar F2:s env-policy. |
| Builder-status och UI-brus | [`2026-07-13-builder-status-ui-declutter.md`](2026-07-13-builder-status-ui-declutter.md) | Avgränsa copy och presentation från runtime-gates. |
| Builder-runtimeens robusthet | [`2026-07-13-builder-runtime-robusthet.md`](2026-07-13-builder-runtime-robusthet.md) | DB-backoff, CSP/fontbrus och scaffold-lint ska levereras separat. |
| Dossier/UI-ownership | [`2026-07-13-dossier-ui-ownership-kontrakt.md`](2026-07-13-dossier-ui-ownership-kontrakt.md) | Lås att en dossier inte skapar en konkurrerande användaryta. |
| Backoffice-stringens | [`2026-07-08-backoffice-stringens-plan.md`](2026-07-08-backoffice-stringens-plan.md) | Friska upp nuläget från [`refresh-handoff`](2026-07-13-backoffice-stringens-refresh-handoff.md) före implementation. |

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
