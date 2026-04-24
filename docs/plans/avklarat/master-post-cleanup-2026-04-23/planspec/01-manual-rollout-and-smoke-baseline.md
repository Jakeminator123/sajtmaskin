---
id: master-post-cleanup-01
title: Plan 01 — gör rollout och smoke-baseline innan mer kod
status: proposed
created: 2026-04-23
priority: critical
blocked_by: [00]
estimated_effort: 30–90 min
mode: ops-first
---

# Mål

Avgör vad som faktiskt fortfarande är ett kodproblem och vad som bara är ett rollout- eller env-problem.

# Arbete

1. Om preview-host-fixen inte nått användaren än: deploya den.
2. Synka relevanta env-variabler där de faktiskt lever.
3. Kör tre korta verklighetstester:
   - enkel init-run
   - teknisk follow-up
   - 3D-follow-up: "3D-figur på en pizza som svävar över förstasidan"
4. Logga för varje run:
   - modalens statuskedja
   - om preview faktiskt bootar
   - om verifiering blir röd/gul/grön
   - om resultatet minst når Fidelity 2

# Hårda regler

- Inga opportunistiska kodändringar i repo:t här om det inte är absolut nödvändigt för att kunna göra smoke.
- Om ett problem försvinner efter deploy/env: markera motsvarande senare plan som `short`.

# Acceptans

- du vet vilka användarsymptom som fortfarande finns på riktigt
- du vet om HMR-stöket är löst i praktiken eller bara i kod
- du har en baseline för init, follow-up och 3D

# Handoff

Skriv `STATUS-01-rollout-and-smoke.md`.
