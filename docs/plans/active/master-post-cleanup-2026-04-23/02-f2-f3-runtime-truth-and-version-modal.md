---
id: master-post-cleanup-02
title: Plan 02 — lås F2/F3-sanningen och gör versionsmodalen verklig
status: proposed
created: 2026-04-23
priority: critical
blocked_by: [00, 01]
estimated_effort: 4–8 h
mode: runtime-truth
---

# Mål

Gör det omöjligt för versionsmodalen att signalera "fel" när previewn i praktiken redan nått Fidelity 2.

# Definitioner

## Fidelity 2
Preview bootar, sidan renderar och användaren kan se ett fungerande resultat.

## Fidelity 3
Hårdare confidence: build/integration/extra verifiering där det är relevant.

# Arbete

1. Skriv den verkliga statuskedjan från transfer till verifiering.
2. Mappa UI-status till en enda sanningskälla.
3. Se till att F2-passage inte kan överskuggas av ett sent, osäkert F3-fynd.
4. Tillåt `warning` eller `unverified` där det är mer sant än `error`.
5. Om event-bus-flippen behövs: landa minsta version som löser sanningsproblemet.

# Hårda regler

- bygg inte ett nytt enormt statussystem
- lös den felaktiga användarbilden först
- håll transient boot/install/HMR från att bli permanent rött fel

# Acceptans

- visuellt fungerande preview slutar inte rött om bara F3 är osäker
- F2 och F3 blandas inte ihop i UI
- minst en problematisk baseline-run från plan 01 får bättre och sannare modalutgång

# Handoff

Skriv `STATUS-02-runtime-truth-and-modal.md`.
