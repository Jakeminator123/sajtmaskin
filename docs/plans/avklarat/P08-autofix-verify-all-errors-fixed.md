# P08: Autofix — verifiera att alla listade fel fixas

## Problem

`buildAutoFixPrompt` i `helpers.ts` listar N fel i "AUTO-FIX REQUEST",
men inget steg verifierar att LLM:en returnerade fixar för alla N.
Om LLM:en bara fixar 1 av 3 märks det inte förrän nästa validering
(som kanske inte körs).

## Filer att undersöka

- `src/lib/hooks/chat/helpers.ts` (~rad 1064-1122) — `buildAutoFixPrompt`
- `src/lib/hooks/chat/useAutoFix.ts` (~rad 370) — skickar prompt som vanligt meddelande
- `src/lib/gen/autofix/validate-and-fix.ts` — server-side validering efter fix

## Möjlig implementation

1. I `buildAutoFixPrompt`: tagga varje fel med en ID (t.ex. `[FIX-1]`, `[FIX-2]`).
2. Efter LLM-svar: parsa output och verifiera att varje `[FIX-N]` adresserades.
3. Om missar: logga varning, eventuellt trigger ny fix-pass för de missade.

Alternativt: server-sidan (`validate-and-fix.ts`) jämför felräknare
före och efter fix — om antalet kvarvarande fel inte minskade tillräckligt,
flagga det i fault-fix-index.

## Risker

- LLM-output är opålitlig att parsa — regex-baserad verifiering kan ge
  false positives/negatives.
- Bättre approach kan vara att bara jämföra syntax-validation före/efter.

## Prioritet

Medel — indirekt kvalitet; befintlig validering fångar kvarvarande fel
men rapporterar inte att LLM:en missade dem.
