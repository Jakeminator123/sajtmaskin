# Handoff: PR-integration + Fast Edit Lane-härdning + route-tabs (2026-06-23)

**Master efter denna session:** `564b695b6` + denna avslutnings-commit (docs-sync + denna handoff).
**Enda öppna PR:** #175 (chgenberg) — **inte** vår, rör inte.

## TL;DR

Tre öppna PR-spår från parallella agenter konsoliderades till master, alla review-/bot-fynd spårade och åtgärdade eller medvetet deferrade. Master är typecheck/lint/test-grön och i synk. Enda reella kvarvarande tekniska spår: **MB-3** (Anthropic generator-fas inert).

## Vad som mergades (i ordning)

| PR | Vad | Merge-commit |
|---|---|---|
| #223 | Fast Edit Lane-härdning (quick-edit/preview-host races) + #221-modellfixar (MB-1/MB-2) | `e4b04c51a` |
| #224 | #222 (route-tabs + add/remove page) integrerat ovanpå #223 + 5 Codex P2 (route-group/Pages-Router/standalone-objekt/normaliserade länkar) | `eaaa58ff2` |
| #225 | Bugbot BB-1/BB-2: orphan/olänkade routes visas (badge + ta-bort) i stället för att döljas | `564b695b6` |

Plus governance-commits på master: backlog-loggning av bot-fynd, borttaget oanvänt `/långbänk`-kommando, ny `terminology.mdc`-sektion **Agent- och modellplan** (extern coach / Cursor-agent / GitHub-Vercel-botar / Sajtmaskins produktmodeller), `pr-bot-findings-sweep.mdc`, `db-env-parity.mdc`, och denna docs-sync av preview-session-kontraktet.

## Fixade fynd (alla spårade i `BUG-SWARM-BACKLOG.md`)

- **FEL-1/3/4/5/6** (Fast Edit Lane): klient trådar `engineLatestKnownVersionId`; host re-checkar `expectedBaseVersionId` i låset (409 `base_mismatch`); rollback vid patch-fail (500 `patch_failed`); `booting`→restart; env-flaggor i `serverSchema`.
- **FEL-2**: composer `baseVersionRef`-chaining (undo/redo/drop).
- **#4-härdning**: `.env*`/secrets/lockfiles blockas i quick-edit (`isBlockedQuickEditPath`, även i `isDeletableQuickEditPath`).
- **MB-1/MB-2**: prompt-assist-allowlist bakåtkompat; temperature strippas för `claude-opus`.
- **5 route-P2** (#224) + **BB-1/BB-2** (#225): route-group/Pages-Router-medveten fil↔route-mappning, reachability från filer utanför egen subtree, orphan-routes synliga+borttagbara.

## Live / ops

- **Fly preview-host (`vm-fly-jakem`)**: omdeployad från master → #223:s host-fixar är **live** (verifierat `fly deploy` exit 0). #224/#225 rör inte `preview-host/`, så ingen ny Fly-deploy krävdes där.
- Env-flaggor `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT` + `SAJTMASKIN_PREVIEW_PATCH_LANE` är PÅ i prod (Vercel) sedan #220-spåret.

## Öppet / deferrat (inget blockerar master)

1. **MB-3 (enda reella kodspåret)** — Anthropic generator-fas är inert: `buildProfiles.defaults.anthropic = claude-sonnet-4.6` kör fastän `phaseRouting.defaultByTier.anthropic.generator = claude-opus-4.8`. Huvud-generationsströmmen routar inte `generator` via `resolvePhaseModel`. Dokumenterat i `manifest.json` (`phaseRouting.notes`) + backlog. Riktig fix = koordinerad ändring i `create-chat-stream-post.ts`, `chat-message-stream-post.ts`, `generate-site-from-prompt.ts` (+ persisterad `chat.model`/`meta.modelId`) → egen testad PR.
2. **Codex re-review** — Codex var rate-limitad under #224/#225 (usage limit). Bugbot kördes i stället (hittade BB-1/BB-2, sen rent på #225-fixen). Kör en Codex-pass på `564b695b6` när kvoten återställts för extra ögon.
3. **DB-test (`pydatabastest.py`) FAIL** — **inte en bugg**: `EMPTY`-gruppens tabeller (genererade sajter + biprodukter) har rader i dev+prod, men testet förväntar sig "nollställt = tomt". Det är normal användardata. CI:s `db-blob-sync` är grön för att GitHub saknar DB-secrets → SKIP. Beslut (lämna/relaxa gate/wipa) ligger hos ägaren; ägaren valde **lämna**.
4. **Superseded worktree** — `../sajtmaskin-feat-preview-tabs` (branch `feat/preview-route-tabs`, #222) är ren och fullt ersatt av #224/#225. **Säker att ta bort** (`git worktree remove` + ev. `git branch -d`); lämnad orörd här eftersom den tillhör ett annat agent-spår.

## Gotchas för nästa agent

- **Meta vs produkt**: blanda inte Cursor-slug:ar (`claude-opus-4-8-thinking-max`) med produktmodell-id (`gpt-5.5`, `claude-opus-4.8`). Se `terminology.mdc` § Agent- och modellplan.
- **Bot-sweep**: läs ALLTID inline review-kommentarer via `gh api repos/<o>/<r>/pulls/<n>/comments` — `gh pr checks` visar inte Codex/Bugbot-fynd. Se `pr-bot-findings-sweep.mdc`.
- **Preview-host = egen Fly-tjänst**: ändringar i `preview-host/` kräver `fly deploy` (Vercel-deploy räcker inte).
