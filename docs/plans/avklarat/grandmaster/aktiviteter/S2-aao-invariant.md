---
id: gm-akt-S2
status: done
implemented_by: "PR #151 (åäö-invariant, SSE round-trip), mergad till master"
parent: gm-omrade-02-stabilitetstester
blocked_by: [gm-akt-S1]
owner_files:
  - (ny) stabilitetstest under builder/chat-testytan
risk: låg
---

# S2 — åäö-invariant i builder-chat

## Mål
Säkra att svensk användarprompt med **åäö** visas korrekt i builder-chatten under
generering (din seed-invariant). Testet ska fånga regress där svenska tecken muteras
till `?`/mojibake i UI-strömmen.

## Inte scope
- Ändra promptlogik eller follow-up-klassning.
- Bredda till annan locale-hantering — bara invarianten.

## Owner-yta
En ny testfil i stabilitets-lanen (S1) som renderar/strömmar en åäö-prompt och
asserterar korrekt utskrift. Verifiera exakt testyta mot HEAD innan placering.

## Verifiering
- `npm run test:stability` (åäö-caset grönt).
- `node scripts/dev/check-unicode-regex.mjs` om regex rörs (Unicode-medveten).

## Risk
Låg. Read-only invariant, ingen beteendeändring.
