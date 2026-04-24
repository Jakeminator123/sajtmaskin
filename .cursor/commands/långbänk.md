# Långbänk

Lång, tung session där du **agerar orkestrator**: lanserar flera tunga/specialiserade subagents parallellt över olika spår, sammanfattar fynden, fixar glasklara förbättringar, verifierar och levererar enligt `/avslutning`.

Detta är inte ett snabb-svar-kommando. Förvänta dig **20–60 min** wall-clock med flera audit-agenter som körs samtidigt och flera commits/push-rundor.

## När kommandot kommer in

Användaren startar `/långbänk` ofta utan precision. Din första uppgift är att förstå **scope** och **underlag**. Två lägen:

### Läge A — användaren pekar på en mapp eller fil-glob

Exempel: `/långbänk på @docs/plans/active/master-post-cleanup-2026-04-23/` eller `/långbänk @src/lib/gen/autofix/`.

Då ÄR mappen underlaget. Läs **README**, **INDEX**, **CHECKLIST**, **STATUS-***, eller motsvarande, och behandla varje öppen punkt + planfil som ett spår en subagent ska driva. Fråga **inte** om underlag — du har det.

### Läge B — inget underlag pekas ut

Stoppa innan du startar agenter. Fråga användaren via `AskQuestion`-tool eller ren text vad scopet är. Erbjud tre val:

1. **"Jag pekar på en mapp/fil"** — användaren kommer skicka @-referens.
2. **"Skapa underlag åt mig"** — du föreslår att lansera **en tung exploration-agent** (claude-4.6-sonnet-medium-thinking eller claude-opus-4-7-thinking-xhigh om problemet är kvalitativt komplext) som producerar ett kort scope-dokument under `docs/plans/active/<datum>-långbänk-scope.md`. Underlaget måste innehålla **3–7 distinkta spår** med konkreta frågor. När underlaget är klart pausar du och frågar användaren om det fångar rätt scope, sen fortsätter du.
3. **"Buggjakt brett över repot"** — fri jakt utan specifikt scope. Du väljer själv 5 evergreen-spår: säkerhet, race conditions, dead code, schema-drift, doc-drift.

Beskriv vad varje val innebär (tids- och commit-volym) så användaren kan välja informerat.

## Modellval per spår (viktigt — orkestratorns största lever)

Det här är skillnaden mellan slö-långbänk och magisk-långbänk:

| Spårstyp | Modell | Varför |
|---|---|---|
| Tung kvalitativ audit / arkitekturanalys / rotorsaksjakt | `claude-4.6-sonnet-medium-thinking` | Bra balans reasoning ↔ hastighet, läser stora mappar |
| Allra svåraste reasoning där svaret är icke-trivialt | `claude-opus-4-7-thinking-xhigh` | Bara när kvaliteten verkligen krävs — dyrt och långsamt |
| Storskalig kod-refactor / kodgenerering (när du ska SKRIVA mycket) | `gpt-5.3-codex-high-fast` | Tunga edits över många filer |
| Snabba inventeringar, dead-code-listor, dublettkollar | `composer-2-fast` | Billig + snabb, räcker för "lista filer som inte importeras" |
| Snabba doc-konsolideringar, listfilter | `composer-2-fast` eller utan modell-flag | Default räcker |

Skicka modellen via `Task`-tool:ens `model`-parameter. Om du inte väljer modell ärver subagenten din parent-modell — det är ofta fel val för tunga jobb.

**Tumregel:** alltid `readonly: true` för audit-agenter. Spara skriv-rätten till efter du läst alla rapporter och själv valt vilka fixar som är värda att göra.

## Exekveringsmönster

### Steg 1 — Reconnaissance

Snabb shell-recon innan agenterna lanseras: `git status`, `git log --oneline -5`, lista innehållet i underlagsmappen, läs README/CHECKLIST. Detta tar 1–2 min och förhindrar att agenterna upprepar saker du redan vet.

### Steg 2 — Lansera 3–6 audit-agenter PARALLELLT

I **en enda** assistant-message med flera `Task`-tool-anrop. Inte sekventiellt — det är hela poängen med långbänk. Varje agent får:

- `subagent_type: "explore"` (eller `generalPurpose` om de behöver MCP-åtkomst)
- `readonly: true` (alltid för audits)
- `model: "<modell enligt tabellen ovan>"`
- `description: "<kort, 3–5 ord>"`
- `prompt`: **mycket detaljerad uppgiftsbeskrivning**. Inkludera:
  - Scope (vilka filer / vilken mapp)
  - Konkreta hint:ar om vad som kan vara fel (om du har förkunskap)
  - Vad svaret ska innehålla (filsökväg + radnummer + minimal fix-rekommendation)
  - "Var koncis. Skip kosmetiska/typografi-fynd."
  - "Returnera bara konkreta fynd, inte teoretiska 'kanske'."

Lämpliga spår att lansera parallellt:

- **Säkerhets-audit** (auth, CSRF, secrets, prompt injection, rate limit)
- **Race conditions / async-buggar** (stale closures, useEffect cleanup, SWR-mutate-mismatch)
- **Dead code / dupes** (oimporterade filer, deprekerade exports — kör med `composer-2-fast`)
- **Schema-strikthet** (zod `.strict()`, AJV `additionalProperties`, JSON-schema vs kod-typer)
- **Docs-drift** (referenser till filer/symboler som flyttats/raderats)
- **Backoffice/Streamlit-drift** (om kod-pipelinen ändrats)
- **Specifika rotorsaksjakter** ("varför failade X i senaste smoke-testet")

### Steg 3 — Sammanfatta + sortera fynd

När alla agenter är klara, listar du fynden i en tabell **i din egen response**:

| Spår | Fynd | Allvarlighet | Glasklart att fixa? |

Kategorisera varje fynd som **GLASKLAR** (lätt, hög-värde, låg risk → fixa nu), **KRÄVER ANALYS** (svårare eller policyfråga → dokumentera, lämna), eller **MEDVETET INTE FIXA** (designval, scope-out).

### Steg 4 — Fixa GLASKLAR-fynden

Implementera direkt. Använd `StrReplace`/`Write`/`EditNotebook` enligt fil-typ. Efter substantiella edits, kör `ReadLints` på ändrade filer.

### Steg 5 — Verifiera

```powershell
npm run typecheck
npx vitest run <relevanta sökvägar>
```

Bara körda tester som täcker de filer du ändrat. Inte hela suiten om det inte behövs (sparar tid).

### Steg 6 — Följ `/avslutning`

Origin-check (`git fetch --quiet` + `git rev-list --left-right --count HEAD...origin/<branch>`) → commit (med fil-baserad message via `.git-commit-msg.tmp` på Windows, **inte** heredoc — PowerShell stöder inte det) → push → verifiera att push gick fram.

Skriv commit-meddelandet i en `.tmp`-fil och kör `git commit -F .git-commit-msg.tmp`. Radera `.tmp`-filen efteråt.

### Steg 7 — Slutsvar

Rapportera enligt `/avslutning`:

- Vilka risker hittades och fixades (numrerad lista)
- Vad som medvetet **inte** togs bort/fixades och varför
- Vilken verifiering som kördes
- Commit-hash + branch + origin-sync-status
- Eventuell milstolps-tag om denna långbänk avslutar ett större spår

## Anti-mönster (gör INTE)

- **Sekventiella audit-agenter** — kör parallellt, alltid. Långbänkens hela poäng är wall-clock-effektivitet.
- **Allt-i-en mega-agent** — en agent med 10 frågor blir luddig. Dela upp i fokuserade spår.
- **Default-modellen för alla** — det är slöseri på tunga jobb och overkill på lätta.
- **Bredda scope under körning** — om en audit-agent föreslår 10 nya områden, lista dem som "kan städas senare", lansera inte nya agenter mitt i en runda. Ny långbänk i nästa session.
- **Fixa "skulle vara fint"-fynd** — om du inte kan motivera HÖG värde + LÅG risk, lämna det och skriv i `open-questions.md` istället.
- **Hoppa över origin-check** — andra agenter kan ha pushat under din långa session. `0 0` innan commit, alltid.

## Underlagsformat (om du behöver skapa det själv eller be användaren skapa)

Om Läge B → Val 2 valdes, scope-dokumentet ska följa detta minimum:

```markdown
# Långbänk-scope: <ämne> (<datum>)

## Bakgrund
2–4 meningar varför vi tar denna runda nu.

## Spår (3–7 stycken — varje blir en parallell agent)

### 1. <Spår-namn>
**Scope-paths:** `src/lib/...`, `docs/...`
**Frågor:**
- Konkret fråga 1
- Konkret fråga 2
**Förväntat svar:** lista med fil + rad + fix-rekommendation
**Modell-rekommendation:** `claude-4.6-sonnet-medium-thinking`

### 2. ...

## Avgränsningar (vad denna långbänk INTE täcker)
- ...
```

När du själv skapar underlaget med en agent: lansera ENDAST exploration-agenten först (inte de "riktiga" auditerna), pausa, visa scope för användaren, vänta på godkännande, sen kör Steg 2.

## Exempel på lyckad långbänk (referens)

Sessionen 2026-04-23/24 (Wave 5 verify + buggjakt + docs-drift) producerade 11 hot-fixes och ~25 dokumenterade öppna punkter över 3 commit-rundor inom ~6 timmar. Mönstret som funkade:

1. 4 parallella audits (server-repair, lansering-truth, schemas, backoffice) på `claude-4.6-sonnet-medium-thinking`
2. Sammanfattning visade 4 GLASKLARA fixar → fixade direkt
3. Commit + push
4. Ny runda: 5 parallella audits (LLM partial-files, image matching, security, race conditions, dead code)
5. 7 nya GLASKLARA fixar → fixade
6. Commit + push
7. `/avslutning` med milstolpe-tag

Detta var ~10x snabbare än sekventiell jakt skulle varit, och fixarnas kvalitet var hög för att varje agent var fokuserad på ett spår med rätt modell.
