# Parallell granskning — commit `8bde15b7` (språkpolicy + arbetsyta)

**Commit:** `8bde15b7` — `docs: språkpolicy, arbetsyta vs Cursor path, synk master`

## Leverans (enligt commit)

- **Progress:** SV/EN-omfång, single-root workspace, pull vs push; utökade § om gren + arbetsyta (speglar nu bl.a. `terminology`/`builder-model-routing` från föregående commit i *Last code touch*).
- **`.cursor/rules/workspace-hygiene.mdc`:** gitignorerad `.code-workspace` från **example**-mall.

## Progress-%

**~83%** whole (tabell oförändrad).

## Verifiering (batch efter hela backfill-kedjan `d9fbee6c`…`8bde15b7`)

- `npm run typecheck` — **OK**
- `npx vitest run` — **OK**, **348** tester (**80** filer)

## Handoff

Nästa commit på `master`: lägg **`84pct-*.md`** (eller fortsätt **83pct-** om samma %-band) + rad i `KRITIK-OVERVIEW.md`.

---

*Föregående: `0eaee012` (`83pct-i.md`). **Tip `master`:** `8bde15b7`.*
