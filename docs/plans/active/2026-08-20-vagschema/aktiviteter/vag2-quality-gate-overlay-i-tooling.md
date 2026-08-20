# Våg 2 — Fem tooling-läsare rapporterar falskt grönt efter `productBlocked`

Backlograd: `SM-068`
Beror på: inget. Blockerar: inget.
Ägda filer: `scripts/db/control-stats.mjs`, `scripts/db/latest-site.mjs`,
`scripts/db/dump-logs.mjs`, `scripts/observability/compare-control-stats.mjs`,
`scripts/observability/genlogs/assess.py`.

## Det verifierade fyndet

`#1068` (`SM-017`) löste det synliga: Backoffice Generation History lägger nu
postcheck-overlayen ovanpå finalize-kolumnen via
`resolveReportedQualityGateResult`
(`src/lib/db/services/reported-quality-gate.ts:4-37`, duplicerad i
`scripts/db/generation-history.mjs:118-130` och
`backoffice/pages/generation_history.py:74-88` eftersom Python och mjs inte kan
importera TS).

Premissen bakom overlayen står i modulens egen kommentar:
`generation_telemetry.quality_gate_result` är **finalize-only**. Product
Postcheck skriver `product_postcheck.summary` senare och stämplar aldrig om
kolumnen (`src/lib/hooks/chat/post-checks.ts:223-232` — nivån är
`warning`/`info`).

Fem läsare kringgår overlayen och läser kolumnen rå:

| Läsare | Ankare | Effekt |
|---|---|---|
| `scripts/db/control-stats.mjs` | `:228-232`, `:331-332`, `:340-341` | `GROUP BY quality_gate_result` — en `productBlocked`-körning hamnar i `preflight_passed`-hinken |
| `scripts/observability/compare-control-stats.mjs` | `deriveQualityGatePassPct` `:136-159` | räknar allt som `includes("passed")` som pass |
| `scripts/observability/genlogs/assess.py` | `:221`, `:228`, `:260-295`, `_PASS_WORDS` `:36-44` | `preflight_passed` → `"pass"`; `productBlocked` läses inte. Bara `level == "error"` degraderar verdiktet |
| `scripts/db/latest-site.mjs` | `:150`, `:174` | skriver ut `qualityGateResult` rått; postcheck-raderna hamnar i en separat sektion |
| `scripts/db/dump-logs.mjs` | `:141` | samma rå kolumn i dumpen |

Falsk-grön-vägen är alltså sammanhängande: kolumnen står kvar som
`preflight_passed` → control-stats bokför den som pass → jämförelse-KPI:n höjer
pass-procenten → genlogs kan nå `VERDICT_OK` för en körning där postchecken
blockerade produkten.

`src/lib/db/promote-guard.ts:4-7` läser också kolumnen rått, men **avsiktligt** —
promote äger finalize-verdiktet och overlayen är dokumenterad som display-only.
Rör inte den.

## Uppgiften

Låt de fem läsarna visa samma sanning som Generation History.

1. Lyft mjs-kopian av overlayen ur `generation-history.mjs` till en delad modul
   under `scripts/` (t.ex. `scripts/db/lib/`) och låt `control-stats.mjs`,
   `latest-site.mjs`, `dump-logs.mjs` och `compare-control-stats.mjs` importera
   den. Skapa **inte** en fjärde kopia.
2. Ge `genlogs/assess.py` motsvarande läsning. Python kan inte importera mjs —
   antingen läser den `product_postcheck.summary`-signalen själv, eller
   konsumerar det redan overlay-lagda värdet från det skript den ändå anropar.
   Välj det som ger **en** ägare av regeln, inte två.
3. Var uttrycklig i utdatat: en overlay-lagd rad ska gå att skilja från en rå
   finalize-rad, så en människa ser varför siffran ändrades.

## Gränser

- Ändra inte `quality_gate_result`-kolumnen, migrationer eller vad finalize
  skriver. Det här är läsarsidan.
- Rör inte `promote-guard.ts`.
- Ändra inte overlay-**regeln** (`preflight_passed` + `productBlocked` →
  `product_blocked`). Sprid den, definiera den inte på nytt.
- Ingen ny Backoffice-yta. `generation_history.py` är redan rätt.
- Rör inte prod-DB. Skripten körs read-only mot en pullad env-fil.

## Klart när

- De fyra mjs-skripten importerar **en** delad overlay-funktion; ingen kopia kvar
  utöver den TS-ägaren och den Python-läsaren.
- `genlogs/assess.py` kan inte längre nå `pass`/`VERDICT_OK` för en körning där
  `productBlocked` är sant.
- Ett riktat test eller en dokumenterad torrkörning per skript visar före/efter
  på en `productBlocked`-rad. Saknas prod-åtkomst i din miljö: skriv ett
  enhetstest mot overlay-funktionen och säg i PR-bodyn att livekörningen inte
  gjordes.
- `npm run typecheck` grön; `npm run lint:py` grön om du rört Python.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `#1068` lade postcheck-overlayen på Backoffice Generation History, men
> `control-stats.mjs`, `latest-site.mjs`, `dump-logs.mjs`,
> `compare-control-stats.mjs` och `genlogs/assess.py` läser fortfarande rå
> `quality_gate_result` och kan därför rapportera pass för en körning där
> postchecken blockerade produkten. Lyft mjs-overlayen till en delad modul och
> låt alla fyra importera den; ge Python-läsaren samma sanning utan att skapa en
> andra definition av regeln.
>
> Ändra inte kolumnen, finalize, migrationer eller `promote-guard.ts`. Lägg ingen
> ny Backoffice-yta. Ingen skrivande DB-åtkomst.
>
> Verifiering: `npm run typecheck`, `npm run lint:py` om Python rörts, plus ett
> test på overlay-funktionen. Kan du inte köra mot prod-DB: säg det i PR-bodyn i
> stället för att påstå att du verifierat livekörningen.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
