# Bevis — ImpactWin / Impact Gaming 2026-09-18

Kort identifierare och källor. Inte en andra incidentberättelse.
Coachens fulla kvitto ligger utanför git:
`C:\Users\jakem\Desktop\impactwin_impact_gaming_incident_2026-09-18.md`.

## Identitet

| Yta | Id |
|---|---|
| Plattform-deploy | `dpl_2Y3RWcFmDsBr2tJtmg55iqPo3gUh` (`master`, `0fc9a6a9d…`, sajtmaskin.se) |
| Kostnadsfri-slug | `impactwin-group-ab` (ingen slug `impact-gaming`) |
| Kostnadsfri project / chat / version | `9jncOyapcZHbdWPxFTxVx` / `d54e50f8-15a9-4d05-81ca-d881fa6df9c5` / `be549822-d8ec-4535-84b4-a46b47cfca33` |
| Impact Gaming project / chat | `tjMwuM2EJka_6Sxpe47fc` / `563f0359-648a-4b18-97dd-479851898cbd` |
| Import v1 / follow-up v2 | `5657ddb8-71ef-44b5-9052-ed599aa7458e` / `88337deb-8c71-484e-b950-887c0a04abb9` |
| Failad användar-deploy | `dpl_39P3KSusnZLwK8i8RQtpAyWgb24m` (`prj_doUXV3fRLV6WRDEiADSUNopXIFwP`) |
| Preview-sessioner | `ps_74db35ce-…` (ImpactWin), `ps_c565b944-…` (Impact Gaming) |

Samma inloggade konto (`9T1-wB…`) på båda projekten. Det bevisar inte
extern kund vs intern test — bara att det inte är två okopplade besökare.

## Tidslinje (UTC)

| Tid | Händelse |
|---|---|
| 10:57 | Kampanjrad `impactwin-group-ab` skapad/skickad (`industry=null`, spel-/lotteribeskrivning) |
| 14:52 | Entitlement claimed → project `9jncOyapcZHbdWPxFTxVx` |
| 14:53:21 | `create_chat` — sammanställd prompt: Restaurang/Bar + Meny/Boka bord + speltext |
| 14:55–15:01 | Tre lyckade generationer, preview uppe, `verification_state=passed`. Ingen deployrad |
| 15:01:18 | Ny chat: importerad v0-mall (`edit_kind=imported_repo`, template `ONoAgsMmNOt`) |
| 15:02:25 | Fly: peer-konflikt, fallback `--legacy-peer-deps`, runtime ready |
| 15:04:15 | Follow-up: anpassa till Impact Gaming / spelstudio |
| 15:06:11 | v2 skapad; preview_success=true |
| 15:09:53 | `POST /api/v0/deployments` 200 — pre-deploy-fixar (client-page + extra deps), **inte** React/Next |
| 15:10:15 | Deployrad `error`; ERESOLVE i bygglogg |
| 15:10:24 | `POST /api/v0/deployments/repair` startar |
| 15:11:16 | Fly: 2-fils patch på **samma** v2 |
| 15:26 ca | Repair 504: `Task timed out after 950 seconds` |
| efteråt | v2 fortfarande `repairing` / «Server-side repair in progress.» Ingen `repair_available` |

## Kodägare (current checkout)

| Fel | Owner |
|---|---|
| A | `src/lib/kostnadsfri/index.ts` (`buildPromptFromWizardData`, `INDUSTRY_PAGES`), `wizard-prefill.ts`, `agent-followups.ts`, `agent-brief.ts`, `src/lib/builder/wizard-taxonomy.ts` |
| B | `src/lib/gen/export/build-exportable-project.ts` (`verbatimRepo`), preview-host npm-install, deploy-quality-gate / publiceringsinstall |
| C | `src/app/api/v0/deployments/repair/route.ts` (`maxDuration=950`), `src/lib/deploy/deploy-repair.ts`, `repair-execution.ts` |

`SM-076` (#1242) täcker JS-`catch` när `files_json` är oförändrad. Isolate-kill
efter 950 s går inte in i den `catch`:en.
