# Remaining Git Intake

## Current state

- `master` is in sync with `origin/master`.
- Local working tree has one intentional out-of-scope change:
  - `scripts/fly_vm/dashboard.py` (Fly.io/dashboard track owned by another agent).

## Explicitly excluded old agent commits

These commits are still unique relative to `master` and are intentionally **not** merged directly:

- `1267cfe2642c3d19365d660d2583ebc97b4718d7` (04 sandbox naming migration pass)
- `4afa7ab54878a2e1aa43e99394e5835f69265cb3` (07 mixed route-plan + docs pass)

Reasoning:

- `04` is broad and overlaps already-landed preview lifecycle/runtime areas.
- `07` code overlaps route-plan/orchestration work already landed via the 03 path.

## What to do instead of cherry-picking old commits

1. Keep Fly.io/dashboard work isolated until its owner lands it.
2. If sandbox naming needs more work, create a new small pass from current `master`:
   - docs/contracts and tiny UI/test cleanups only
   - no broad runtime migration
3. If follow-up route-plan needs more work, create a new focused pass from current `master`:
   - `src/lib/gen/route-plan.ts`
   - `src/lib/gen/orchestrate.ts`
   - `src/lib/api/engine/chats/chat-message-stream-post.ts`
   - with targeted tests and typecheck

## Final sync checklist

- `git status --short --branch`
- `git fetch origin`
- `git rev-list --left-right --count master...origin/master`
- If Fly.io track is intentionally local, keep only that file outside this intake.

