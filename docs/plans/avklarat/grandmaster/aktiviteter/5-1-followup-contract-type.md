---
id: gm-akt-5-1-followup-contract-type
status: done
created: 2026-06-19
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: null
risk: low-medium
owner_files:
  - src/lib/gen/orchestration-snapshot.ts
  - src/lib/api/engine/chats/follow-up-orchestration-input.ts
---

# 5-1 — `FollowUpContract`-typ + builder

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · yt-karta [`llm-callsite-matrix.md`](../../../../architecture/llm-callsite-matrix.md) kluster E.

## Mål
Samla follow-up:ens i dag **spridda** ärvda/frysta fält till **ett explicit, läsbart kontraktsobjekt** som senare aktiviteter (5-2..5-7) kan validera mot. Additivt — ändra inte beteende i denna PR; bara introducera typen + en ren builder som härleder kontraktet ur det som redan finns.

## Bakgrund (verifierat mot HEAD)
`buildFollowUpOrchestrationInput` (`follow-up-orchestration-input.ts:54-125`) samlar redan brief, scaffold, variant, routes, capabilities, quality — men som lösa fält. Frysningen lever spridd: scaffold `orchestrate.ts:488-522`, variant `scaffold-variants/matcher.ts:46-80`, routes `route-plan-builder.ts:50-86`, quality `policy-helpers.ts:85-109`. Det finns inget `FollowUpContract`-objekt/schema idag.

## Steg
1. Definiera `FollowUpContract`-typen (ren TS-typ, ev. Zod) bredvid `buildFollowUpBriefFromSnapshot` i `orchestration-snapshot.ts`. Fält: `baseVersionId`, `snapshotBrief`, `scaffoldId`, `variantId`, `routePlan`, `capabilities`, `qualityTarget`, `previewSessionId`.
2. Lägg en ren `buildFollowUpContract(...)`-funktion som **härleder** kontraktet ur befintliga värden (snapshot + persisted ids + existing routes + prior quality). Inga nya källor — konsolidera, inför inte ny signal (jfr `terminology.mdc` signal-gate).
3. Bygg kontraktet i `buildFollowUpOrchestrationInput` och exponera det additivt (t.ex. på `OrchestrationInput` som `followUpContract?`), **utan** att ändra hur orchestrate i övrigt läser fälten (paritet bevaras).
4. Enbart typ + builder + enhetstester. Ingen gate, ingen enforcement (det är 5-2/5-3).

## Acceptans / tester
- Ny `orchestration-contract`/`follow-up-contract`-testfil: builder ger förväntat kontrakt för (a) vanlig follow-up, (b) clear-redesign, (c) saknad snapshot (graceful).
- `npm run typecheck` 0 fel · `npm run lint` 0 · befintliga follow-up-tester gröna (paritet).

## Guardrails
- **Additivt, beteendeneutralt.** Inga frysnings-/gate-ändringar här.
- Inga nya engelska tech-begrepp utöver `FollowUpContract` (motiverat: ersätter spridd implicit frysning med ett namngivet objekt — notera i glossary vid merge).
- Eget worktree, draft-PR (rör Område 5-runtimeyta → review-gate).
