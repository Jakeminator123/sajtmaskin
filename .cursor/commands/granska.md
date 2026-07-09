# /granska — buggsvärm på din egen diff (före push/PR)

Kör **8 parallella read-only** Composer-subagenter riktade mot **exakt det du själv just ändrat** (working tree-diff eller branch-diff mot master). Varje agent granskar diffen från sin egen vinkel och rapporterar kort: **bugg-% + impact (1–5) + en menings motivering + fil:rad**. Du (den PR-ande/pushande/mergande agenten) är den **kritiska grindvakten**: subagenterna är snabba men dumma — verifiera varje fynd mot koden innan du agerar.

**Syfte:** sänka buggigheten i det som är på väg ut, INNAN push/PR — komplement till bugbot-passet (som körs på PR:en efteråt), inte ersättning.

## När den körs

- Du har gjort ändringar och står i begrepp att committa/pusha/PR:a.
- Användaren skriver `/granska`, eller du själv bedömer att diffen är riskabel (protected paths, pipeline, DB, env).

## Flöde

1. **Bestäm diff-scope:** `git diff` (uncommitted) eller `git diff origin/master...HEAD` (branch). Lista ändrade filer + kort intent (1 mening per fil).
2. **Lansera 8 Task-agenter parallellt** i EN assistant-turn:
   - `subagent_type: explore` · `readonly: true` · `model: composer-2.5-fast` (endast Composer 2.5).
   - Varje agent får **diffen/fillistan + intents + EN distinkt vinkel** (se skill för vinkeltabellen).
   - Krav på output: max ~10 rader, tabellformat `fynd | fil:rad | bugg-% | impact 1–5 | motivering (1 mening)`.
3. **Var kritisk:** för varje rapporterat fynd — läs koden själv och avgör om det stämmer. Subagenterna gissar ibland (de ser inte alltid hela kontexten). Ett fynd med 80 % + impact 4 som inte stämmer vid läsning = avfärda med en rad.
4. **Triagera** (samma tre utfall som review-gaten): **Fixa** i diffen · **Logga** i `BUG-SWARM-BACKLOG.md` · **Avfärda** med en rad varför.
5. **Verifiera efter fix:** `npm run typecheck` + riktade `vitest` + `ReadLints` på ändrade filer.
6. **Sedan** push/PR som vanligt (bugbot-passet på PR:en gäller fortfarande, per `pr-merge-review-gate.mdc`).

## Anti-mönster

- Sekventiella Task-anrop (poängen är parallellism).
- Samma vinkel till flera agenter.
- Blint fixa allt svärmen säger — grindvakten ska läsa koden först.
- Skrivrätt på svärm-agenter, eller git-åtgärder i svärmen.
- Köra /granska ISTÄLLET för bugbot-passet på PR:en — det är ett för-filter, inte ersättning.

## Projekt-skill

Vinkeltabell, subagent-promptmall och exempel: [`.cursor/skills/granska-diff/SKILL.md`](../skills/granska-diff/SKILL.md).
