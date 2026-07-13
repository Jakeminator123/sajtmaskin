---
status: active
owner: unassigned
created: 2026-07-13
topic: Builder-UI declutter — status-bannrar/boxar som ska bort eller bli logg-bara (ReleaseGate-banner, Designpreview-banner, F2 env-box), utan att tappa åtgärder som driver flödet
source: Kodläsning via explore-subagent 2026-07-13 (PreviewPanelChrome, PreviewPanelF3Trigger, F3RequirementsSurface, BuilderShellContent, VersionDiagnosticsDialog, LaunchReadinessCard) + ägarens observationer i chat 747636c8
---

# Builder-UI declutter — bannrar → logg

## TL;DR

Fyra status-ytor stör mer än de hjälper. Principen: **en banner som (a) inte är
kopplad till en åtgärd och (b) vars info finns kvar i logg/versionspanel → ta bort eller
gör tyst.** Behåll allt som *driver* något (autofix-trigger, `canDeploy`-grind). De två du
pekade ut (ReleaseGate-lint-bannern, Designpreview-bannern) och env-boxen är alla säkra att
ta bort / flytta till logg enligt kodläsningen.

Detta är en **plan, ingen implementation.**

## Ytor + beslut (verifierat mot kod)

### 1. "ReleaseGate behöver åtgärdas — Underkända kontroller: lint." → endast logg

| Var | Fil | Rad |
|---|---|---|
| Text sätts | `src/components/builder/preview-panel/PreviewPanelF3Trigger.tsx` | 231–242 |
| Banner renderas | `src/components/builder/F3RequirementsSurface.tsx` (`F3StatusSurface`) | 41–59 |
| Monteras | `src/app/builder/BuilderShellContent.tsx` | 810 |
| Toast (samma budskap) | `src/lib/hooks/chat/useSendMessage.ts` | 411, 413 |

**Åtgärd:** Ta bort banner-ytan (`F3StatusSurface`) och nedgradera toasten till tyst
logg-rad. Behåll `failedChecks`-detaljerna där de redan finns: `VersionDiagnosticsDialog`
(quality-gate-JSON) + DB `error-log`.

**Motivering:** Du sa själv "skitbra logg, men det ska inte upp i UI:t bara loggas".
Bannern har **ingen klick-åtgärd** — själva finalize/ReleaseGate körs oavsett. Info
dubblas i diagnostik + readiness. Säker att ta bort. (Behåll minst readiness-blockern så
en *deploy*-spärr fortfarande syns när man faktiskt försöker publicera — se punkt 4.)

### 2. "Designpreview klar" + "Automatisk verifiering pågår" → ta bort/krymp

| Var | Fil | Rad |
|---|---|---|
| Titel + detalj | `src/components/builder/preview-panel/PreviewPanelChrome.tsx` | 278–281 |
| Alert-render | samma | 712–729 |
| Lokalisering | `src/lib/builder/version-history-status-labels.ts` | 163–201 |

**Åtgärd:** Ta bort den informativa `<Alert>`-bannern (eller reducera till en liten
status-prick i toolbaren). Kort verifieringsstatus finns kvar per version i
`VersionHistory.tsx` (879–882).

**Motivering:** Ren informationsbanner, **ingen åtgärd**, ingen fetch. "Automatisk
verifiering pågår" i F2 är dessutom delvis missvisande (F2 kör ingen separat F3-verifiering).
Bär inget nödvändigt utöver det visuella → uppfyller ditt kriterium för borttag.

### 3. F2 env-box "auto-hanterade i env.example … Klicka Bygg integrationer" → ta bort

| Var | Fil | Rad |
|---|---|---|
| Box | `src/app/builder/BuilderShellContent.tsx` | 819–831 |

**Åtgärd:** Ta bort boxen. (Ersätts naturligt av F2-env-åtkomsten i den separata
env-konsolideringsplanen — annars lämna ytan tom i F2.)

**Motivering:** Ren onboarding-copy, inga knappar, inget runtime-beroende. Du vill bort med
den och den bär ingen nödvändig info. Helt säker. Kopplad till
[`2026-07-13-anvandarsajt-env-konsolidering.md`](2026-07-13-anvandarsajt-env-konsolidering.md).

### 4. "Lansering / Blockerar deploy / Rekommendationer" → behåll, men mildra F2

| Var | Fil | Rad |
|---|---|---|
| Kort | `src/components/builder/LaunchReadinessCard.tsx` | 114, 129, 142–143 |
| Data | `/api/engine/chats/[chatId]/readiness` → `useChatReadiness` | — |

**Åtgärd:** **Behåll** kortet — men se till att en F2-designkörning som råkar underkännas
inte skriker "Blockerar deploy" när användaren inte ens försöker publicera. Överväg att
bara visa blocker-listan när deploy faktiskt är målet, annars en mjukare status.

**Motivering:** Kortet får **inte** tas bort rakt av: `/readiness` driver `canDeploy` +
`deployDisabledReason` i headern. Utan den strukturen ser användaren bara en grå
Publicera-knapp utan förklaring. Men skärmbilden visar just problemet — en F2/F3-lint-miss
presenteras som en deploy-spärr mitt i designfasen.

### 5. "Versionsdiagnostik" → behåll (det ÄR loggen)

| Var | Fil | Rad |
|---|---|---|
| Dialog | `src/components/builder/VersionDiagnosticsDialog.tsx` | 348–454 |
| "Kör autofix" | samma | 411–414 |

**Åtgärd:** **Behåll.** Detta är den kanoniska loggvyn du gillade ("skitbra logg"). Enda
varningen: rör inte "Kör autofix"-knappen — den är en **manuell åtgärd** (skickar
repair-prompt, bypassar autofix-taket), inte bara visning.

**Motivering:** Att flytta bannrar (1–2) *till* logg förutsätter att loggvyn finns kvar.
Den här dialogen + `error-log`-API är den enda samlade loggytan i buildern.

## Sammanfattning

| # | Yta | Beslut | Villkor |
|---|---|---|---|
| 1 | ReleaseGate "behöver åtgärdas"-banner + toast | **Ta bort UI → logg** | Behåll readiness-blocker för faktisk deploy |
| 2 | "Designpreview klar / verifiering pågår"-banner | **Ta bort / krymp** | Kort status kvar i versionspanel |
| 3 | F2 env-box | **Ta bort** | Ersätts av F2-env-plan |
| 4 | Lansering-kort | **Behåll, mildra F2-copy** | `/readiness` måste driva `canDeploy` |
| 5 | Versionsdiagnostik | **Behåll** | "Kör autofix" är åtgärd, ej visning |

## Explicit icke-mål

- Ta inte bort `/readiness`-datan eller `canDeploy`-grinden — bara UI-presentationen.
- Ta inte bort `VersionDiagnosticsDialog` eller `error-log`-API (dit loggar vi ju bannrarna).
- Ingen ny loggyta byggs — vi återanvänder diagnostik-dialogen.

## Öppen fråga

- Punkt 1: vill du ha **noll** UI-spår av en underkänd ReleaseGate i F2/F3, eller en liten
  diskret "se diagnostik"-länk (utan den stora bannern)? Rekommendation: diskret länk.
