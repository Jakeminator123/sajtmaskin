---
id: gm-omrade-05-followup-och-preview-kontrakt
status: scope
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 5 — Follow-up & preview-kontrakt (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 2** · **Beroende:** område 1

## Syfte
Produktens hjärta: en `FollowUpContract` som hindrar follow-up från att omedvetet byta
scaffold, tappa route, tappa capability eller bygga på fel version.

## Yta (owner-surface — verifieras mot HEAD)
- `src/lib/gen/follow-up-contract.ts` (ny) + test
- preview-session-pinning (`previewSessionId + versionId`)
- finalize-design-vägen (stale basversion → 409)

## Kontraktsfält
`baseVersionId` · `snapshotBrief` · `scaffoldId` (fryst) · `variantId` (fryst) ·
`routePlan` (fryst utom clear-redesign) · `capabilities` · `qualityTarget` (kan bara höjas) ·
`previewSessionId`.

## Klart när
Follow-up kan aldrig omedvetet byta scaffold/tappa route/bygga på fel version;
stabilitetstest låser det. Stale basversion ger serverfel, inte tyst bygge.

## Nivå 3 (skapas när området startar)
8–10 aktiviteter, smal `owner_files` var. Ej skapade än.
