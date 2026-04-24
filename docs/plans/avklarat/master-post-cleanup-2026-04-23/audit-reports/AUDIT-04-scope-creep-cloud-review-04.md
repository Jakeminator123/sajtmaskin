# AUDIT-04 — Scope-creep + boundary violation (cloud-review-04)

**Read-only granskning.** Bas: `1c445da15^` (= `dedaf06a0`, sista commit före `docs(plans): wave 5 prompts (10 + 11) + checklist tracker`). Mål-HEAD: `5a7c2423a` (2026-04-24), PR #96 (plan-10) + #97 (plan-11) inklusive.

**Metod:** `git diff 1c445da15^..HEAD --name-only` + förenklad ägar-attribution via `b6da0b888` (plan-10) respektive `3f48c2840` (plan-11) + `git diff 7090fe63e 808659df4` (merge #97: vad som faktiskt ändrades i master när plan-11 landade).

## Tabell: fil → historisk plan-ägare → vem i wave 5 → bedömning

| Fil | Tidigare plan-ägare (02–09) / notering | Ändrad i wave 5 av | Bedömning |
|-----|----------------------------------------|--------------------|-----------|
| `.gitignore` | Repo/orkestrering | `9b9086105` (docs/audit, ej plan-10/11-kod) | **⚠️ gråzon** (metod-relaterad ändring, inte P10/11) |
| `docs/architecture/open-questions.md` | Living doc | Diverse doc-commits mellan/efter PR | **N/A** (dok) |
| `docs/plans/.../CHECKLIST.md` | Orkestrering | Diverse | **N/A** |
| `docs/plans/.../CLOUD-REVIEW-*.md`, `REVIEW-PROMPT-WAVE5.md`, `audit-reports/README.md` | Orkestrering | Diverse | **N/A** |
| `docs/plans/.../STATUS-10-latency-budgets.md` | plan-10 leverans | plan-10 (`b6da0b888` via #96) | **✅** |
| `docs/plans/.../STATUS-11-unified-repair.md` | plan-11 leverans | plan-11 (`3f48c2840` via #97) | **✅** |
| `docs/plans/.../wave5/PROMPT-10.md`, `PROMPT-11.md` | spec | `1c445da15` | **N/A** |
| `src/lib/logging/generation-log-writer.ts` | 03/observ (läs/ändra per PROMPT-03) | **plan-10** | **✅** P10 explicit scope; P11 får **inte** röra (P11 rörde den inte) |
| `src/lib/logging/generation-log-writer.test.ts` | samma | plan-10 | **✅** |
| `src/lib/observability/metrics.ts` | infra | plan-10 | **✅** P10 |
| `src/lib/observability/metrics.test.ts` | samma | plan-10 | **✅** |
| `src/lib/gen/stream/post-finalize-policies.ts` | post-finalize / verify-beslut | plan-10 | **✅** P10 (PROMPT-10 tillät “server-verify **eller motsvarande policy-fil**”; `design_preview_skip_verify` för F2+init+ren preflight ligger här) |
| `src/lib/gen/stream/finalize-version/runner.ts` | 08-territorium (kärna), P10 får enligt PROMPT endast fas-telemetri | plan-10 | **✅** — diff `b6da0b888` är *endast* `observePhase`/`recordPhaseDuration` + `latencyBudgetKind` + tidsstämplar; ingen pipeline-logik ändrad |
| `src/lib/providers/own-engine/generation-stream-post-finalize.ts` | 02/03/own-engine | plan-10 | **✅** P10 (samma commit som observability) |
| `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` | samma | plan-10 | **✅** |
| `src/lib/gen/verify/server-verify.ts` | 03/05/02 (policy) | *ingen wave-5-ändring i diff* | **N/A** (ingen creep; init-skip satt i `post-finalize-policies.ts`) |
| `src/lib/api/engine/chats/chat-message-stream-post.ts` | 03/05/orchestrering | plan-11 (variant-metadata m.m.) | **✅** P11 (PROMPT-11 Bug 2: `chat-message-stream-post` nämnd som möjlig) |
| `src/lib/builder/follow-up-capability-detection.ts` | plan-06-territorium | plan-11 Bug 3 | **✅** P11 |
| `src/lib/builder/follow-up-capability-detection.test.ts` | samma | plan-11 | **✅** |
| `src/lib/gen/follow-up-intent-types.ts` | fas-1 / intent | plan-11 | **✅** P11 (stöd för modify) |
| `src/lib/gen/orchestrate.ts` | 08 m.fl. (tät fil) | plan-11 Bug 2 | **✅** P11 explicit scope; **not:** vidare P08-refactor-ägarskap kolliderar tidsmässigt med funktionell bugfix — ändringen är fortfarande P11-motiverad |
| `src/lib/gen/orchestrate/generation-package.ts` | 08/orchestrate | plan-11 | **✅** P11 (variant fält) |
| `src/lib/gen/scaffold-variants/**` | 06/08 | plan-11 Bug 2 | **✅** P11 |
| `src/lib/gen/stream/finalize-preflight.ts` | 02/09 (merge) / pipeline | plan-11 Bug 1 | **✅** P11 |
| `src/lib/gen/stream/finalize-preflight.test.ts` | samma | plan-11 | **✅** |
| `src/lib/gen/stream/finalize-version.test.ts` | finalize-paket | plan-11 (justera tester mot ny preflight) | **✅** P11 |
| `src/lib/gen/system-prompt/sections/dossiers.ts` | 06/07 “prompt/dossier” (P12 vakt i PROMPT-10) | plan-11 Bug 3 (explicit) | **✅** P11 — motsvarar cloud-review-04:s explicita P11-lista; PROMPT-10 förbjöd P10 att röra `sections/**` (P10 rörde dem inte) |
| `src/lib/gen/system-prompt/sections/dossiers.test.ts` | samma | plan-11 | **✅** |
| `src/lib/gen/system-prompt/build-dynamic-context.ts` | prompt composition | plan-11 (stöd för modify-path) | **✅** P11 (Bug 3-stöd) — **⚠️** “plan-12-nära” men nödvändig konsekvent P11-leverans |
| `src/lib/gen/system-prompt/types.ts` | samma | plan-11 | **✅** samma som ovan |
| `src/lib/providers/own-engine/follow-up-clarification.ts` | 06/own-engine | plan-11 Bug 3 | **✅** P11 |
| `src/lib/providers/own-engine/follow-up-clarification.test.ts` | samma | plan-11 | **✅** |
| `src/lib/own-engine/session/own-engine-build-session.test.ts` | own-engine | plan-11 (minimal) | **✅** P11 (testfölje) |
| `src/lib/gen/stream/finalize-merge.ts` | 02/07 | *oförändrad i wave-5-range* | **N/A** (P11 PROMPT listade den; faktisk leverans tog samma bug via `finalize-preflight` — det är **underteckning/annan audit**, inte “creep” i denna betydelse) |
| `src/lib/gen/stream/finalize-version/preflight-phase.ts` | pipeline | *oförändrad i wave-5-range* | **N/A** samma som ovan |
| `src/lib/gen/verify/repair-loop.ts` | 03 | *oförändrad* | **✅** OFF-LIMITS respekterat |
| `src/lib/gen/autofix/**` | 04/05 | *inga* | **✅** OFF-LIMITS respekterat |
| `src/components/builder/Version*`, `preview-panel/**`, `ThinkingOverlay.tsx` | 02 | *inga* | **✅** OFF-LIMITS respekterat |

## Edge case: P11 branched före P10 / merge

- Merges: `55e950300` (PR #96, plan-10), `808659df4` (PR #97, plan-11). Andra parents: `b6da0b888` resp. `3f48c2840`.
- **`git diff 7090fe63e 808659df4`** (master före P11-merge → efter) innehåller **inga** av plan-10:s filer (`generation-log-writer`, `metrics`, `runner`, `post-finalize-policies`, `generation-stream-post-finalize` …). Plan-11-mergen applicerar bara P11-listan; plan-10-innehåll kommer uteslutande från **första** merge-parent (`7090fe63e`).

**Verifiering (identiska före/efter P11 för P10-nyckelfiler):**

- `git diff 7090fe63e:src/lib/logging/generation-log-writer.ts HEAD:src/lib/logging/generation-log-writer.ts` → tom (inga förlorade rader).
- `git diff 7090fe63e:src/lib/gen/stream/finalize-version/runner.ts HEAD:src/lib/gen/stream/finalize-version/runner.ts` → tom.
- P10:s `observePhase`-wrap + `recordPhaseDuration`-block finns kvar i `runner.ts` (se `b6da0b888` diff; HEAD matchar 7090fe63e för dessa rader efter P11).

## Förlorade rader pga merge-konflikt

**Inga identifierade** i den här granskningen: P11-mergen ändrade inte plan-10-filer; inget behov av manuell “ta bort P10 i konflikt” i historiken som går att se som tom diff ovan.

## Sammanfattning

| Fråga | Svar |
|-------|------|
| **Gren-överträdelse P10** | P10 rörde inte plan-11-exklusiva filer enligt PROMPT (`finalize-merge`, `finalize-preflight`, `repair-loop` **ej** av P10). `runner.ts` fick endast telemetri enligt diff. |
| **Gren-överträdelse P11** | P11 rörde inte plan-10-exklusiva filer; merge-diff mot `7090fe63e` innehåller bara P11-ändringar. |
| **OFF-LIMITS-lista (autofix, Version*, repair-loop, preview-panel, ThinkingOverlay)** | **0 träffar** i `1c445da15^..808659df4` för `src/`-mönstren. |
| **Leverans** | **Ren** m.a.p. hårda fil-gränser mellan P10/P11 och wave 1–4 “låsta” ytor. **⚠️** endast `.gitignore` via audit-orkestrering (ej produktbeteende). **Underteckning:** vissa P11 PROMPT-filer (t.ex. `finalize-merge`, `preflight-phase`) fick **ingen** netto-diff i master — stäng i separat “spec vs landed”-audit, inte som boundary creep. |

**`git rev-parse HEAD` (rapport-HEAD):** `5a7c2423a2863b9993b30ca49bfe8dbe584320ac`

---

**Klart:** denna fil skapad; öppna PR när du vill få in rapporten (ingen kodändring utöver denna rapport).
