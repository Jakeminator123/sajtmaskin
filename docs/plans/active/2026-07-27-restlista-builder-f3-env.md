---
status: active
owner: unassigned
created: 2026-07-27
topic: Restlista — små, oberoende svansar som blev kvar när fyra nästan-levererade planer konsoliderades (UI-banner, env-klarhet, F3-scope, testluckor, review-freshness)
source: Kodverifiering 2026-07-27 mot master `3b419115` av fyra read-only-agenter. Ersätter svansarna i de raderade planerna 2026-07-13-builder-status-ui-declutter.md, 2026-07-13-anvandarsajt-env-konsolidering.md och 2026-07-13-stabilisering-verify-f3-doman-plan.md (§ 6, § 7, PR 4) — kärnan i de tre är levererad och indexerad i ../avklarat/README.md
---

# Restlista: builder-UI, F3-scope och env-klarhet

Varje rad här är **liten, oberoende och färdigutredd**. Ingen av dem kräver
ägarbeslut utom R1:s öppna fråga. Ta en eller flera i samma PR — de delar inte
kod och behöver ingen inbördes ordning.

De kommer från fyra planer vars kärna är levererad. Kärnleveranserna finns som
rader i [`../avklarat/README.md`](../avklarat/README.md); bara resterna lever
här.

## Restrader

| # | Rest | Ägarfil (kodverifierad 2026-07-27) | Åtgärd |
|---|---|---|---|
| R1 | ReleaseGate-bannern lever kvar | `F3RequirementsSurface.tsx:41-59` (`F3StatusSurface`), monterad `BuilderShellContent.tsx:1096`; toast `useSendMessage.ts:545` | Ta bort banner-ytan, nedgradera toasten till tyst logg-rad |
| R2 | `env.example` ser redigerbar ut | `FileExplorer.tsx:55-86` — ingen markering | Badge/rad som säger auto-genererad, icke-kanonisk värdekälla |
| R3 | Ingen testlåsning av att `user`-värden slår mock i F2 | `env-local.ts:305-318` gör rätt, `env-local.test.ts` saknar fallet | Test: `selectedDossierEnvKeys` + användarsatt värde → mock-seed skippas |
| R4 | Parallell env-editor kvar efter 412 | `F3RequirementsSurface.tsx:94-134,165-183` postar mot samma API som Byggblock | Deep-linka till Byggblock i stället för egen inline-editor |
| R5 | `.env.local` faller tillbaka till hela dossier-katalogen | `project-scaffold.ts:688-689` (`selectedKeys === undefined`) | Ta bort fallbacken när alla vägar trådar scope |
| R6 | `configured`-källan är ofullständig | Init tom: `create-chat-stream-post.ts:740-746`; `process.env`-fallback: `select.ts:216-218` | Tråda projektets env-karta även på init-vägen |
| R7 | Ingen koppling från observerad F3-körning till dess kravlista | saknas (`capture-and-triage`-todo från stabiliseringsplanen) | Knyt observerad 412 till `chatId`/`versionId`/`missingByIntegration` |
| R8 | Inga beteendetester per Kopplad dossier | saknas — bara manifest-/validate-/select-tester | Mock mountar utan krasch per hard-dossier + aktiverings-E2E (dossier etapp 7.3-residual) |
| R9 | `merge:ready` invalideras inte av ny botkommentar | `review-window.yml:12-22` väntar på botar men bär ingen SHA; sign-off-format i `pr-merge-review-gate.mdc:58-65` | Sign-off bär head-SHA + timestamp; ny botkommentar efter sign-off tar bort labeln |
| R10 | Single-canary aldrig körd | saknas | En prod-kontroll: Byggblock-val → F2 → follow-up → F3 → release-status |

## Detaljer där raden inte räcker

### R1 — vad som redan är gjort, och vad som inte är det

Tre av declutter-planens fyra ytor är levererade: de lugna
"Designpreview klar"/"Automatisk verifiering pågår"-alerterna returnerar `null`
(`PreviewPanelChrome.tsx:233-237`), F2-env-boxen är borta, och Lansering-kortet
döljs vid `ready` (`LaunchReadinessCard.tsx:81-82`). Kvar är bara
ReleaseGate-bannern.

Villkoret från originalplanen står kvar: **behåll** readiness-blockern så en
riktig deploy-spärr fortfarande syns när användaren faktiskt försöker publicera,
och rör inte `VersionDiagnosticsDialog` eller `error-log`-API — det är dit
informationen flyttas.

**Öppen fråga (ägaren):** noll UI-spår av en underkänd ReleaseGate, eller en
diskret "se diagnostik"-länk utan den stora bannern? Originalplanens
rekommendation var diskret länk.

### R4 — varför editorn är en rest, inte en bugg

`ProjectEnvVarsPanel` och `F3PlaceholderToggle` är **borttagna** (ägarbeslut
2026-07-22) och Byggblock-popovern är enda env-ytan — se
[`env-flow-f2-mute.mdc`](../../../.cursor/rules/env-flow-f2-mute.mdc). Alla
pek-ytor utom denna använder redan `openDossiersPanel`. 412-kravytan blev kvar
med egna inputs och är numera sällsynt, så den är låg risk men fortfarande en
andra editor mot samma API.

### R5 — angränsande backlog-rad

`BUG-SWARM-BACKLOG.md` fick 2026-07-27 en P3-rad om att `resolvePreviewEnvLayers`
seedar **hela** placeholder-katalogen (56 nycklar) för varje design-preview. Det är
ett annat lager än R5 (som gäller `.env.local`-scaffoldingen), men samma tema: vi
seedar mer env än sajten använder. Tar du R5, läs den raden först — de kan visa sig
vara en leverans.

### R9 — avgränsning

Detta är process, inte produkt. Implementeras som lättviktigt checkjobb eller
utökning av `review-window.yml`, och speglas i
[`pr-merge-review-gate.mdc`](../../../.cursor/rules/pr-merge-review-gate.mdc).
Inget nytt governance-lager (jfr `project-phase-priorities.mdc`).

## Verifiering

| Rest | Minsta verifiering |
|---|---|
| R1, R2, R4 | `npm run typecheck` + riktade vitest på berörd komponent |
| R3, R8 | nya tester gröna + `npx vitest run` på berörd svit |
| R5, R6 | `npm run typecheck` + `npm run test:followup-contract` |
| R7, R10 | prod-observation, ingen kodgrind |
| R9 | workflow-körning på en test-PR |

## Explicit icke-mål

- Ingen ny env-yta, ingen återinförd `ProjectEnvVarsPanel`.
- Ta inte bort `/readiness`-datan eller `canDeploy`-grinden — bara UI-presentationen (R1).
- Ingen bred verify-refaktor; innehållsrevisionen har egen plan
  ([`2026-07-25-innehallsrevision-verifieringskvitton.md`](2026-07-25-innehallsrevision-verifieringskvitton.md)).
