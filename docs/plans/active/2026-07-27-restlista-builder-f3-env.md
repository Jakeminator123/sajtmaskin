---
status: active
owner: unassigned
created: 2026-07-27
topic: Restlista — små, oberoende svansar som blev kvar när fyra nästan-levererade planer konsoliderades. R1–R4 + R6 levererade 2026-07-28 (#639), R10 körd och R11 avgjord 2026-07-29; kvar är env-scope i export, F3-observation, dossier-beteendetester och review-freshness
source: Kodverifiering 2026-07-27 mot master `3b419115` av fyra read-only-agenter. Ersätter svansarna i de raderade planerna 2026-07-13-builder-status-ui-declutter.md, 2026-07-13-anvandarsajt-env-konsolidering.md och 2026-07-13-stabilisering-verify-f3-doman-plan.md (§ 6, § 7, PR 4) — kärnan i de tre är levererad och indexerad i ../avklarat/README.md
---

# Restlista: builder-UI, F3-scope och env-klarhet

Varje rad här är **liten, oberoende och färdigutredd**. Inget i listan väntar på
ägarbeslut. Ta en eller flera i samma PR — de delar inte kod och behöver ingen
inbördes ordning.

De kommer från fyra planer vars kärna är levererad. Kärnleveranserna finns som
rader i [`../avklarat/README.md`](../avklarat/README.md); bara resterna lever
här.

**Levererat 2026-07-28 (#639):** R1, R2, R3, R4 och R6 — se
[`../avklarat/README.md`](../avklarat/README.md) för raden och git för diffen.

**R11 avgjord 2026-07-28** och därför borta ur tabellen: ägaren valde
prompt-prevention + Advisory som slutläge, så ingen raderingsmekanik byggs.
Motiveringen står under [R11-detaljen](#r11--avgjord-2026-07-28-prompt-prevention--advisory-är-slutläget)
och raden lever som policy i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).

**R10 körd 2026-07-29** — se [§ R10](#r10--körd-2026-07-29-prod-canary) för vad
canaryn bevisade och vad den avslöjade.

Raderna nedan är de som återstår.

## Restrader

| # | Rest | Ägarfil (kodverifierad 2026-07-27) | Åtgärd |
|---|---|---|---|
| R5 | `.env.local` faller tillbaka till hela dossier-katalogen | `project-scaffold.ts:688-689` (`selectedKeys === undefined`) | Ta bort fallbacken när alla vägar trådar scope |
| R7 | Ingen koppling från observerad F3-körning till dess kravlista | saknas (`capture-and-triage`-todo från stabiliseringsplanen) | Knyt observerad 412 till `chatId`/`versionId`/`missingByIntegration` |
| R8 | Inga beteendetester per Kopplad dossier | saknas — bara manifest-/validate-/select-tester | Mock mountar utan krasch per hard-dossier + aktiverings-E2E (dossier etapp 7.3-residual) |
| R9 | `merge:ready` invalideras inte av ny botkommentar | `review-window.yml:12-22` väntar på botar men bär ingen SHA; sign-off-format i `pr-merge-review-gate.mdc:58-65` | Sign-off bär head-SHA + timestamp; ny botkommentar efter sign-off tar bort labeln |

## Detaljer där raden inte räcker

### R5 — precondition är **inte** uppfylld (kodverifierat 2026-07-28)

Åtgärden säger "ta bort fallbacken när alla vägar trådar scope". Det gör de inte:
`buildExportableProject`s verbatim-gren anropar `buildPlaceholderEnvLocalBody()`
**utan** options (`build-exportable-project.ts:97`), så `selectedKeys` är
`undefined` där. Tar man bort fallbacken nu förlorar en importerad repo utan egen
`.env.local` hela placeholder-kuvertet, och preview↔verify-pariteten som Codex P2
på #594 införde bryts. Trådningen genom export/verify-vägen måste komma först.

### R5 — angränsande backlog-rad

`BUG-SWARM-BACKLOG.md` fick 2026-07-27 en P3-rad om att `resolvePreviewEnvLayers`
seedar **hela** placeholder-katalogen (56 nycklar) för varje design-preview. Det är
ett annat lager än R5 (som gäller `.env.local`-scaffoldingen), men samma tema: vi
seedar mer env än sajten använder. Tar du R5, läs den raden först — de kan visa sig
vara en leverans.

### R11 — avgjord 2026-07-28: prompt-prevention + Advisory är slutläget

**Ägarbeslutet:** ingen deterministisk raderingsmekanik byggs. Dossier/UI-ownership-planen
levererades 2026-07-28 (#639) som prompt-kontrakt plus en Advisory som gör ett kvarlämnat
anrop upptäckbart — se [`../avklarat/README.md`](../avklarat/README.md) §
Dossier/UI-ownership — och det är där kontraktet stannar. Raden lever vidare som
policyrad i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) → "Beslut & policy",
inte som öppen defekt. Motiveringen står nedan.

Det pipelinen alltså medvetet **inte** kan garantera: **att faktiskt ta bort
en konkurrerande yta modellen byggde i en tidigare runda.**

Kodläget: `mergeVersionFilesWithWarnings` (`version-manager.ts`) lägger föregående
version som bas och låter nya filer skriva över den, så en fil som inte re-emitteras
lever vidare. Enda deterministiska raderingsvägen är
`removeExplicitlyRemovedDossierFiles` (`finalize-merge.ts`), som bara släpper
**dossier-ägda** paths för dossiers användaren uttryckligen tagit bort. En
LLM-byggd `app/api/ai-chat/route.ts` matchar ingen av dem.

De två vägarna som låg på bordet, och vilken som valdes:

| Väg | Innebär | Risk | Utfall |
|---|---|---|---|
| Modellen deklarerar ersatta paths (t.ex. ett `REPLACES:`-direktiv som finalize raderar) | Nytt **utdataprotokoll** mellan modell och finalize | En felaktig deklaration raderar användarens filer — dataförlust, inte bara brus | **Avvisad** — risken är dataförlust, vinsten är mindre brus |
| Acceptera prompt-prevention + Advisory | Ingen ny mekanik | En envis modell kan fortfarande lämna två ytor; vi ser det i diagnostiken i stället för att stoppa det | **Vald 2026-07-28** |

Kvarvarande trade-off att leva med: två chatt-ytor kan fortfarande samexistera om
modellen struntar i prompt-blocket. Vi upptäcker det via Advisory:n i stället för
att förhindra det. Revisit bara om Advisory-träffarna visar att det händer ofta i
prod — då finns mätdata att väga dataförlustrisken mot.

### R10 — körd 2026-07-29 (prod-canary)

Hela kedjan kördes på prod (chat `85f8db72`, projekt `AxMkqz1thatP2UEx1mnrI`):
friprompt → F2-generering → Byggblock → "Bygg integrationer" → release-status.
Prompten var "frisörsalong i Göteborg med tre anställda, boka tid online".

**Vad canaryn bevisade i prod** — de tre UI-raderna ur den här listan som #639
levererade fungerar skarpt, inte bara lokalt:

| Rad | Prod-observation |
|---|---|
| R1 | Statusraden renderade "ReleaseGate behöver åtgärdas · Underkända kontroller: typecheck, build. · Visa diagnostik". Länken öppnade `VersionDiagnosticsDialog` för **v2** — den version verdiktet gällde, inte den valda. Det var precis Bugbot-fyndet på #639, och fixen håller i prod |
| R2 | Filträdet visade `env.example` med `auto`-badge, hovertext och `aria-label` ("Auto-genererad dokumentation… riktiga värden sparas under Byggblock, inte här") |
| R4 | Kravytans knapp öppnade **Byggblock**-popovern (3 hårda block, maskerat nyckelfält) — ingen andra env-editor |

**Vad canaryn avslöjade:** ingen version nådde `passed`. Tre import-/symbolfel
(saknad `Resend`-import, `sv` importerad type-only, `TS2440`-kollision på
`CircleDot`) stoppade både F2:s repair och F3:s ReleaseGate. Loggat som egen
P2-rad i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) — det är en
RepairGate-lucka, inte en UI-rad, så den hör inte hit.

**Vad R10 inte täckte:** publicering (`Publicera`) och egen domän. Sajten kunde
inte publiceras eftersom ReleaseGate var röd, vilket är korrekt beteende men
lämnar deploy-vägen oobserverad. Nästa canary bör köras på en prompt utan
integrationer, så release blir grön och publiceringssteget faktiskt nås.

### R7 — vad canaryn gav

Körningen producerade exakt den koppling R7 efterfrågar, men manuellt: ett rött
ReleaseGate-verdikt vars kravlista (`RESEND_API_KEY`, `DATABASE_URL`,
`EMAIL_FROM`, `CONTACT_EMAIL_TO`) syntes i kravytan, med `chatId` och `versionId`
i URL respektive dialog. Det som saknas är att **spara** den kopplingen så den
går att läsa i efterhand utan en öppen browser. Raden står kvar.

### R9 — avgränsning

Detta är process, inte produkt. Implementeras som lättviktigt checkjobb eller
utökning av `review-window.yml`, och speglas i
[`pr-merge-review-gate.mdc`](../../../.cursor/rules/pr-merge-review-gate.mdc).
Inget nytt governance-lager (jfr `project-phase-priorities.mdc`).

## Verifiering

| Rest | Minsta verifiering |
|---|---|
| R5 | `npm run typecheck` + `npm run test:followup-contract` + export/verify-svitarna |
| R8 | nya tester gröna + `npx vitest run` på berörd svit |
| R7 | prod-observation, ingen kodgrind |
| R9 | workflow-körning på en test-PR |

## Explicit icke-mål

- Ingen ny env-yta, ingen återinförd `ProjectEnvVarsPanel`.
- Ta inte bort `/readiness`-datan eller `canDeploy`-grinden — bara UI-presentationen.
- Ingen bred verify-refaktor; innehållsrevisionen har egen plan
  ([`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md)).
