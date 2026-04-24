# AUDIT-05 — Code quality (wave 5)

| Fält | Värde |
|---|---|
| Agent | cloud-review #05 (`cloud-05`) |
| Baseline | `git diff 1c445da15..HEAD` (samma pre-wave-5 SHA som i `CLOUD-REVIEW-03.md`) |
| Scope | TS/TSX under `src/` i diff-listan (~27 filer) |
| Metod | `rg` mot fil-lista; manuell radgräns / prio-1-filer |

---

## A — Comment-tags `TODO\|FIXME\|XXX\|HACK\|@ts-`

| Fil | Rad | Utdrag | Ny i W5? | Severity |
|---|---|---|---|---|
| — | — | *Inga träffar* i wave-5 `src/`-diff | n/a | **info** |

Plan 11-relaterade buggar/krav är dokumenterade med vanliga blockkommentarer (t.ex. "Plan 11 / open-question #5") i stället för `TODO` — bättre spårbarhet.

---

## B — Debug / log-rester

| Fil | Rad | Mönster | Severity |
|---|---|---|---|
| *wave-5 prod (`*.ts` utan `.test`)* | | **`console.log`** | **0 träffar** — **info** |
| *wave-5 test* | | `.only(` / `.skip(` | **0 träffar** — **info** |
| *wave-5 prod* | | `debugger` | **0 träffar** — **info** |
| `orchestrate.ts` | 484–851 | `console.info` / `console.warn` (t.ex. `scaffold_semantic_unavailable`, `variant_drift`, `dossier_capability_unresolved`) | **warning** |
| `scaffold-variants/matcher.ts` | 50–105 | `console.info` (`variant_lock_*`) | **warning** |
| `stream/finalize-preflight.ts` | 577–580, 805 | `console.warn` (mechanical autofix fail, preflight catch) | **warning** |
| `api/engine/chats/chat-message-stream-post.ts` | 267, 625, 796 | `console.warn` | **warning** |
| `logging/generation-log-writer.ts` | 265, 317, 1921, 1969 | `console.warn` | **warning** |
| `gen/system-prompt/sections/dossiers.ts` | 108–112 | `console.warn` (medveten policy-kommentar) | **warning** |
| `providers/own-engine/generation-stream-post-finalize.ts` | 546 | `console.warn` (background server verification) | **warning** |

**Regel-översättning:** Ingen oavsiktlig `.only` / `debugger`. `console.log` i prod-kod: **saknas** i wave-5-scope. Kvar: **`console.info` / `console.warn`** — enligt review-brief bör tänkas om till `devLog` / central logger där det är produktionslarm, inte ad hoc.

---

## C — Type-svaghet (`any`, `as unknown as`, `@ts-*`)

| Fil | Rad | Mönster | Kan smalas? | Severity |
|---|---|---|---|---|
| `observability/metrics.test.ts` | 28, 227 | `as unknown as` | Test-mock — **ok** | **info** |
| `providers/own-engine/generation-stream-post-finalize.test.ts` | 485 | `as unknown as Array<...>` | Test — typas redan inom `<{...}>` | **info** |
| *wave-5 `src` (diff `+`-rader)* | — | `:\s*any` / `as any` | `git diff 1c445da15..HEAD` mot `src`: **0 nya** sådana rader | **info** |
| *wave-5* | — | `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | **0 träffar** | **info** |

**Sammanfattning antal nya `any` i plan-10/11-svepet:** praktiskt **0** i granskat diff; kvarstående `as unknown as` enbart i tester (motiverbart).

---

## D — Magic numbers (>100, särskilt budget/timing)

| Fil | Rad | Literal | Förslag | Severity |
|---|---|---|---|---|
| `system-prompt/build-dynamic-context.ts` | 248–250 | `900` (golv för `Math.max` mot budget) | `const MIN_DYNAMIC_CONTEXT_BUDGET_TOKENS = 900` eller hämta från `token-budgets` | **warning** |
| `api/engine/chats/chat-message-stream-post.ts` | 127 | `800` (prosa-prefix slice) | `PROSE_HEAD_MAX_CHARS` | **info** |
| `follow-up-clarification.ts` | 165, 197, 214 | `300`, `200`, `320` | redan delvis kommenterat (QW-3); kan namnges | **info** |
| `stream/finalize-preflight.ts` | 138 | `200` / `HOME_PAGE_MIN_RENDERED_CHARS` | **redan konstant** | **info** |
| `observability/metrics.ts` | 26, 35 | histogram buckets `100, 250, …` | **avsiktlig** bucket-lista | **info** |
| `scaffold-variants/matcher.ts` | 136 | `5381` | djb2-start — **idiom** | **info** |
| `gen/orchestrate.ts` | 120, 871 | `8192` (embedding cap, i kommentar) | API-konstant — ev. `EMBEDDING_MAX_INPUT_TOKENS` | **info** |

---

## E — Dead code / oanvänd import

| FYND | Bedömning |
|---|---|
| P32-kommentar i `orchestrate.ts` (ca rad 409–414) | Dokumenterar varför `requestKind` ser "död" ut — **inte** bortplockbar utan fas B. | **info** |
| Oanvända `export` / imports | **Ej** körts med `ts-prune`/eslint unused i denna pass — fyll på i plan-12 med automatiserad körning. | **info** (gap) |

---

## F — Namngivning / konvention

| FYND | Severity |
|---|---|
| Nya/ändrade filer följer **kebab-case** (t.ex. `follow-up-capability-detection.ts`, `generation-log-writer.ts`, `finalize-preflight.ts`). | **info** |
| `registry.ts` inuti `scaffold-variants/`: inre loop använder `const value` i skuggning av yttre `readString` — funkar men **läsbarhet** (ev. döp om) | **info** |

---

## G — Långa funktioner (>80 rader) — prio-1

| Fil | Funktion | ~Rader | Severity |
|---|---|---:|---|
| `orchestrate.ts` | `resolveOrchestrationBase` | ~414 (351–765) | **warning** (granskningssvår) |
| `stream/finalize-preflight.ts` | `runFinalizePreflight` | ~359 (471–830) | **warning** |
| `orchestrate.ts` | `finalizeOrchestrationPrompts` | ~127 (770–896) | **warning** (strax över 80) |
| `logging/generation-log-writer.ts` | `buildSummary` | ~78 (1658–1735) | **info** (precis under tröskel) |
| `stream/finalize-preflight.ts` | `runFinalizePreflightAll` | ~42 (303–344) | **info** |

**Split-förslag (konkret):**

- `resolveOrchestrationBase`: bryt ut **scaffold resolution** (auto/manual/persisted), **embedding/variant drift logging**, **dossier/capability path** i separata helpers.
- `runFinalizePreflight`: bryt ut **merged-syntax + mechanical autofix**-block (ca 519–600), **home-route gate** (641–658), **count parity** (668–696) — redan logiskt avdelat med kommentarer.

---

## Prio-1 filer (extra pass)

| Fil | Kort notis |
|---|---|
| `finalize-preflight.ts` | Stark Plan 11-täckning; `devLogAppend` används konsekvent; kvarstående `console.warn` i error-path. |
| `generation-log-writer.ts` | Sidoeffekter + fil-I/O; `console.warn` bara på misslyckad resolve/write — rimligt men bör alignas med logg-DSL. |
| `orchestrate.ts` | Många `console.info` för telemetri — risk för brus i produktion utan nivåstyrd logger. |
| `follow-up-capability-detection.ts` | Renare än grannar (inga `console`/`TODO` i snabbkoll). |
| `scaffold-variants/registry.ts` | Lokal JSON-parsing, små helpers; inga uppenbara smells. |
| `system-prompt/sections/dossiers.ts` | `console.warn` avsiktligt vid disk/path-fel; kommentar förklarar. |

---

## FIX-NEEDED (konkreta förslag)

1. **Loggning:** Ersätt eller gateway:a `console.info`/`console.warn` i `orchestrate.ts`, `matcher.ts`, `finalize-preflight.ts`, `chat-message-stream-post.ts`, `generation-log-writer.ts` mot **`devLog` / en strukturerad logger** enligt repo-policy (samma mönster som `finalize-preflight` redan använder med `devLogAppend`).
2. **Konstant:** Lyft `900` i `build-dynamic-context.ts` till namngiven budgetkonstant (ev. delad med `build-spec` / token-budgets).
3. **Refaktor (plan 12-storlek):** Dela upp `resolveOrchestrationBase` och `runFinalizePreflight` så granskare kan reasona per del utan 400+ rader per funktion.
4. **Verifiering E:** Kör `eslint` unused-imports eller `ts-prune` på `src/lib/gen` + `src/lib/logging` efter logg-refaktor.

---

## Sammanfattning

| Bedömning | Innehåll |
|---|---|
| **Starkt** | Inga `TODO`/`FIXME`/`HACK` i wave-5 `src/`-diff; inga `debugger`/`.only`; inga nya uppenbara `any` i produktionskod; Plan 11-kommentarer är **beskrivande**, inte teknisk skuld-taggar. |
| **Behöver städning innan plan 12** | **Konsekvent loggstrategi** (många `console.*` kvar) + **mycket långa** `resolveOrchestrationBase` / `runFinalizePreflight` + några **namnlösa tröskel-tal** (särskilt `900` i dynamic context). |
| **Klar = PR** | Filen följer `audit-reports/AUDIT-05-code-quality-<agent-id>.md`-konventionen; branch/PR enligt `README.md` i samma mapp. |
