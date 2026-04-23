# OMTAG nattrapport — 2026-04-23 → 2026-04-24 morgon

> **TL;DR:** Fas 0 (4 agenter) + fas 1·05 + fas 2·D landade och pushades till `origin/master`. Fas 1·03 lämnad orörd (för stort för natt). Fas 2·A/B/C och fas 3 väntar. Repot är strukturellt betydligt bättre än 36h sedan — första gången det finns en eval-baseline att mäta kvalitetsdrift mot.

---

## Vad som landade i natt (6 merges, push:ade)

| # | Merge-commit | Beskrivning |
|---|---|---|
| fas 0·07 | (ingår i `cb6d11f57`) | prompt-core type-only-import-exempel (34 rader i 02-component-contract.md) |
| fas 0·04 | (ingår i `cb6d11f57`) | collapse 11 `SAJTMASKIN_*`-flaggor → hårdkodade konstanter |
| fas 0·02 | (ingår i `cb6d11f57`) | eval-baseline: 10 canonical prompts + runner + master-resultat committat |
| fas 0·01 | (ingår i `cb6d11f57`) | `scaffolds:embeddings:check` + prebuild-gate + hygien |
| orkestrering | `cb6d11f57` | fas 2 docs + PARKED-lista + gpt-review-referenser |
| fas 2·D | `0a0fbf488` | dossier AJV-validator över registry + CI + curate (17 dossiers passerar) |
| fas 1·05 | `d1bc644ae` | blocka scaffold-default `app/page.tsx` från att läcka till brand |

Master: `25353da70` → `d1bc644ae` (10 commits ovanpå utgångspunkten).

## Kort rationale per leverans

**fas 0·07** — `config/prompt-core/02-component-contract.md` fick 3 `✅`/`❌`-exempel för type-only-imports (Lucide-ikoner, prop-typer, React-events). Syftar till att sänka `autofix-heavy-load`-triggers på type-import-klassen. Följ upp via eval-baseline.

**fas 0·04** — `src/lib/env.ts` tappade 11 flaggor (`SAJTMASKIN_SHOW_THINKING`, `*_REPAIR_PASS_INDEX`, `*_RERUN_AFTER_FIX`, `*_SKIP_DOUBLE_VALIDATE*`, `*_RECURRING_PATTERNS*`, `*_USE_ERROR_LOG_RAG`, `*_DEFER_EXTRA_ROUTES*`, `*_FOLLOWUP_LIGHT_*` (3), `*_DEV_LOG_DOC_MAX_WORDS`). Verifierade som on-by-default-i-praktiken. Backoffice-sidor uppdaterade.

**fas 0·02** — `evals/` med 10 prompt-filer + `scripts/evals/run-baseline.mjs` + `diff-results.mjs` + master-baseline i `evals/results/baseline-master/`. **Detta är mätstickan** — kör `node scripts/evals/run-baseline.mjs` på kommande branches innan merge. Mer än ~10 % försämring på någon canonical prompt → reject.

**fas 0·01** — `scaffold-embeddings.json` var inte regelbundet regenererad. Lade till `npm run scaffolds:embeddings` + `:check` som körs i `prebuild`. Fynd dokumenterat i `OMTAG/01-FINDINGS.md`: dossiers är capability-deterministiska (inget embedding-script behövs där).

**fas 2·D** — `src/lib/gen/dossiers/validate-manifest.ts` (ny) använder AJV 8 + canonical `dossier.schema.json`. `registry.ts` VÄGRAR ladda manifest som inte validerar. `scripts/dossiers/validate-all.ts` (CI) täcker 3 cross-cutting invarianter: `defaultForCapability`-unicitet (hard error), `instructions.md`-rubriker (2 required + 3 recommended, substring-match), verbatim-fil-existens. `scripts/dossiers/validate-one.mjs` ready för backoffice-subprocess (Python-swap defer:ad). `curate-from-reference.ts` använder nu samma validator via `assertCurationOutput`. 50/50 dossier-tester passerar. 17 dossiers passerar validate-all (3 warnings för saknade rekommenderade rubriker — curator-signal, inte blocker).

**fas 1·05** — Rotorsaksfix för "Nordic Future Summit"-klassen: scaffold-default `app/page.tsx` läckte till brand-site när LLM bara skrev om `app/layout.tsx`. Ny `LLM_ONLY_PATHS`-set i `finalize-merge.ts` exkluderar `app/page.tsx` + `src/app/page.tsx` ur scaffold-merge-basen. Result-obj fick `scaffoldDefaultsBlocked` + `missingEmittedEssentials`. `finalize-version.ts` promoterar saknade essentials till `code_structure_failure`-preflight-errors → versionen markeras verification-blocked istället för att tyst servera scaffold-page under user-layout. Gäller både init och post-partial-file-repair remerge. 4 nya regress-tests i `finalize-merge.test.ts`.

**Medvetet INTE gjort i fas 1·05:**
- `app/layout.tsx` kvar som legitim scaffold-default (LLM hoppar ofta över layout)
- Config-filer (tailwind/next/tsconfig/globals.css) kvar — lågrisk för brand-läckage
- Shell-fallback-generator vid token-limit mid-stream — kan läggas till när behov dyker upp
- Prompt-hint-sektion "Scaffold defaults (som hint, inte fil)" — defer till efter 03-splittningen

## Vad som INTE gjordes och varför

| Doc | Varför lämnad |
|---|---|
| **fas 1·03 wave-split-heatspots** | Estimat 1–2 dagar (5 182 rader monoliter att splittra). För stort för en natt och för hög risk att landa halvgjort. Worktree `omtag-03` finns men är orörd; branchen `omtag/03-wave-split-heatspots` är skapad från master och väntar på dedikerad session. |
| **fas 2·A follow-up integrity** | Blockerad av 03 (rör `system-prompt.ts` monoliten + `chat-message-stream-post.ts`). Starta efter 03. |
| **fas 2·B scaffold/variant cleanup** | Ohindrad nu när 05 är mergat, men 1 dag estimat och rör hela landing-page-familjen — vill inte ta den risken sovande. Rekommenderas som första fas 2-agent du startar imorgon. |
| **fas 2·C autofix-härdning** | Blockerad av 03 (rör system-prompt) + kräver eval-baseline (klar) för M4-gaten. |
| **fas 3·06 unified status event bus** | Blockerad av 03 + 05 (`05` klart nu, `03` kvar). 1 dag estimat. |

## Master-state verifierat

Allt grönt vid `d1bc644ae`:

| Check | Resultat |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npx vitest run src/lib/gen/stream src/lib/gen/dossiers` | 111/111 passerar |
| `npm run dossiers:validate-all` | 17/17 passerar (3 recommended-rubriker-warnings) |
| `origin/master` | `d1bc644ae` (push rent, GitHub bypass-rule dokumenterad) |

## Vad jag rekommenderar när du vaknar

**Direkt (5 min):** verifiera bash:
```
git pull origin master
npm install                     # för nya ajv@^8 dev-dep
npm run typecheck
npm run dossiers:validate-all
```

**Dagstart — välj en:**

| Val | Vad | Varför nu |
|---|---|---|
| **A (rekommenderas)** | Kicka igång en dedikerad cloud-agent på `omtag/03-wave-split-heatspots` (worktree `omtag-03`, kördoc `OMTAG/03-wave-split-heatspots.md`) | Unlock:ar fas 2·A + 2·C + fas 3. Störst ROI. |
| **B** | Kicka igång `omtag/fas2-B-scaffold-variant-cleanup` parallellt — rör andra filer än 03 | Ytterligare parallellitet; landing-audit re-kör ger empirisk uplift. |
| **C** | Plocka E1 (follow-up-prompt-duplicate) själv innan 03 — 1h — sparar ~250 tokens/followup | Riskabelt om du vill låta 03-agenten röra samma filer. Hoppa över om A startas. |

**Gör INTE** utan att läsa `OMTAG/PARKED.md`: L1, L2, L3, M2, P32 Fas B-F, M3, P33, WebContainers. De är rätt senare, fel nu.

## Observationer från natten (för 03-agenten)

Vid fas 1·05-arbetet läste jag `finalize-merge.ts` + `version-manager.ts` + `finalize-version.ts`. Några fynd som inte åtgärdades utan är värdefull kontext för 03-split:

1. **`finalize-version.ts` (1 733 rader) har minst 5 tydliga "sektioner"** (preflight, partial-file-repair, verifier, merge, persist-policy) som lämpar sig för split per OMTAG 03:s förslag.
2. **`finalize-merge.ts` (nu ~200 rader efter 05)** är mycket mer i balans — 03 behöver troligen inte röra den.
3. **`mergeVersionFilesWithWarnings` i `version-manager.ts` (rad 227)** är väl avgränsad och skulle tåla att flyttas till `gen/merge/`-modul om 03 vill förenkla.

## Artefakter

- `OMTAG/` — kördokument + README med status-tabell + PARKED-lista
- `OMTAG/fas2/` — fas 2-kördokument (A/B/C/D)
- `gpt_review/` — guldrapporten + källor fas 2-agenter läser som inputs
- `evals/` — mätsticka + master-baseline
- `scripts/evals/` — runner + diff-script
- `scripts/embeddings/check-scaffold-embeddings.ts` — prebuild-hygiensgate
- `scripts/dossiers/validate-all.ts` + `validate-one.mjs` — AJV-validator entry-points
- `src/lib/gen/dossiers/validate-manifest.ts` + `.test.ts` — canonical validator

## Git-state nattens slut

```
d1bc644ae merge omtag/05-scaffold-default-removal
25cfd7c34 feat(finalize-merge): blocka scaffold-default page.tsx
0a0fbf488 merge omtag/fas2-D-dossier-contract
dd246d677 feat(dossiers): AJV-validator over registry + CI + curate
ed81d7e92 omtag(status): fas 0 klar
cb6d11f57 omtag(orchestration): fas 2 docs + parked list
(... 4 fas 0 merges ...)
25353da70 docs(AGENTS) — natt-utgångspunkt
```

---

**Om något gick sönder över natten:** `git reset --hard 25353da70` återställer till din nattutgångspunkt. All nattens arbete är pushat så ingenting förloras — men jag rekommenderar inte reset innan du läst igenom state:n först.

**Tack för din tid och tilliten. — Claude**
