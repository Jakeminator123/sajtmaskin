---
status: archived
owner: unassigned
topic: Live-review SM-070 bakom avstängd flagga. Aktiveringsresidualer kvar men blockerar inget vanligt flöde.
created: 2026-08-20
source: docs/plans/active/2026-08-20-live-review/ (raderad 2026-09-18; git är arkiv).
---

> Status: Archived
> Not current architecture.
> Do not use as runtime guidance.
> Replaced by: [BUG-SWARM-BACKLOG § SM-070](../../../BUG-SWARM-BACKLOG.md)

> Parkerad 2026-09-18: grant och atomisk claim/cache landade i #1089/#1098.
> `SAJTMASKIN_LIVE_REVIEW` är av. PARK tills live review faktiskt ska aktiveras.

# Live-review `SM-070` — parkerad

Kvar före ev. Preview-aktivering (inte ett lanseringsspår nu):

1. Overwrite-säker Blob-retry på same-revision-upload.
2. Schemalagd 7d-purge plus chat-delete-hook (metadata/`expiresAt` räcker inte).
3. Beständig betald attempt-budget över persistfel/`abandonLiveReviewRun`.
4. Ompröva överlapp i stängd #1116; hela PR:n behöver inte mergas.

Production kräver separat ägaråtgärd efter Preview-bevis. Rökprovet fanns i
`docs/plans/active/2026-08-20-live-review/01-preview-smoke.md` (git).
