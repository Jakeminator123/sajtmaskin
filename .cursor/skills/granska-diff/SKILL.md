---
name: granska-diff
description: OPTIONAL deep-dive (deprecated as the default pre-push filter 2026-07-13 — the mandatory pre-push/PR bug-check is now a single Cursor Bugbot pass, see git.mdc/workflow.mdc). Runs 8 parallel read-only Composer 2.5 subagents that bug-hunt the CURRENT AGENT'S OWN diff (working tree or branch vs master). Each reports bug-% + impact score (1-5) + one-line motivation + file:line. Use ONLY when the user explicitly runs /granska or says "granska diffen"/"svärma min diff", or when you deliberately want extra breadth (docs-sync, referens-svep) on an unusually risky diff — NOT as the routine gate.
---

# Granska-diff — buggsvärm på egen diff (VALFRITT djupdyk sedan 2026-07-13)

> **Ej längre det obligatoriska för-filtret.** Standard före push/PR är ett **Cursor Bugbot-pass** på egen diff (bugbot-subagent) — billigare i orkestratorns kontext (1 rapport vs 8) och dedikerad buggjägare. Använd denna svärm bara på uttrycklig begäran eller vid ovanligt bred/riskabel diff. Se `git.mdc`/`workflow.mdc`/`pr-merge-review-gate.mdc`.

**Roll:** du är den PR-ande/pushande agenten OCH orchestrator. Svärmen är ditt för-filter; du är den kritiska grindvakten. Subagenterna är billiga och snabba men **dumma** — de ser diff + utpekade filer, inte hela systemet. Behandla deras fynd som leads, inte domar.

## Steg

### 1. Scope

```powershell
# uncommitted arbete:
git diff --stat; git diff
# eller branch-arbete:
git diff --stat origin/master...HEAD; git diff origin/master...HEAD
```

Skriv 1 mening intent per ändrad fil (subagenterna behöver veta VAD som var meningen för att se avvikelser).

### 2. Lansera svärmen (8 parallella Task-anrop i EN turn)

Alla: `subagent_type: explore` · `readonly: true` · `model: composer-2.5-fast`.

| # | Vinkel | Letar efter |
|---|---|---|
| 1 | Regression | Ändrat beteende som bryter befintliga callers/flöden; jämför mot anropsplatser |
| 2 | Kontrakt/typer | Brutna typkontrakt, schema-drift, API-shape-ändringar utan konsumentuppdatering |
| 3 | Testluckor | Ändrad logik utan test; befintliga tester som nu ljuger (false-green) |
| 4 | Säkerhet/tenant | Cross-tenant, auth-gates, secrets i kod/logg, input-validering vid boundaries |
| 5 | Referens-svep | Gamla sökvägar/namn/imports som diffen borde uppdaterat men missade (grep-baserat) |
| 6 | Felhantering/kanter | Nya code paths utan felväg, tysta catch, fail-open där fail-closed avsågs |
| 7 | Docs/terminologi-sync | Docs/schemas/backoffice som nu motsäger koden; glossary-drift; motsägelser MELLAN docs-filer i samma diff |
| 8 | Djävulens advokat | "Vad skulle Codex/Bugbot klaga på?" — inkonsistenser inom diffen själv, halvfixar, kvarglömda TODO-lägen |

### 3. Subagent-promptmall

```text
Du granskar en kollegas diff i Sajtmaskin-repot (C:\Users\jakem\dev\projects\<checkout>).
Ändrade filer + intent: <lista>. Diff-sammanfattning: <klistra eller peka på filer>.
DIN VINKEL: <vinkel ur tabellen>. Granska ENDAST ur denna vinkel.
Läs de faktiska filerna (inte bara diffen) där det behövs för kontext.
Rapportera max 10 rader i tabellformat:
| fynd | fil:rad | bugg-% | impact 1-5 | motivering (1 mening) |
bugg-% = sannolikhet att det är en riktig defekt. impact = skada om den når prod (5 = dataförlust/säkerhet, 3 = fel beteende, 1 = kosmetiskt).
Inga fynd ur din vinkel = skriv "Inga fynd" + 1 mening om vad du kollade. Inga noveller. Ändra ingenting.
```

### 4. Grindvakt (kritisk triage)

- **Läs koden själv** för varje fynd med bugg-% ≥ 50 eller impact ≥ 3 innan du agerar. Subagenter halluciner ibland fil:rad eller missar att en guard redan finns.
- Utfall per fynd (samma som `pr-merge-review-gate.mdc`): **Fixa** (i diffen, nu) · **Logga** (`BUG-SWARM-BACKLOG.md` med fil-ankare) · **Avfärda** (en rad varför).
- Två agenter som oberoende flaggar samma ställe = stark signal, prioritera den.
- Efter fixar: `npm run typecheck` + riktade `vitest` + `ReadLints`. Kör INTE om hela svärmen för småfixar — en riktad extra agent räcker om du är osäker.

### 5. Rapportera + fortsätt

Kort tabell till användaren: fynd × utfall (fixat/loggat/avfärdat). Sedan push/PR som vanligt. Detta pass ersätter INTE den externa buggkollen på PR:en: efter att PR öppnats gäller **7-min-Codex-fönstret → annars Cursor-bugbot**, plus **PR ≥ 7 min** innan merge (`pr-merge-review-gate.mdc`).

## Regler

- **Obligatoriskt före PR-skapande och före push till master** (se `git.mdc`/`workflow.mdc`). Inte valfritt på egen diff som rör kod.
- Svärmen ändrar ALDRIG kod och kör ALDRIG git-åtgärder.
- Endast `composer-2.5-fast` (eller `composer-2.5` om användaren ber om det) för svärm-agenterna.
- Rundor konvergerar: max 1 omsvärmning efter fixar. Kvarvarande nits → logga, inte ny runda (undvik oändlig loop).
- Fynd som kräver repro/livekörning → "Behöver repro" i backloggen, inte blockering.
