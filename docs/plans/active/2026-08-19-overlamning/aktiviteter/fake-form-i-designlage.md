# `fake_form` målas som spärr i designläge

**Klar 2026-08-20 — [#1067](https://github.com/Jakeminator123/sajtmaskin/pull/1067).**

Våg 3 · Cloud · `SM-060` · Kontraktskrock, inte kodfel

## Målet

Signatur `def4a6d153de` har 11 träffar över 5 chattar. Postchecken flaggar
formulär som saknar `action` som `fake_form` — men i designläge är det **precis
vad kontraktet kräver**.

## Fyndet

F2-muten (`.cursor/rules/env-flow-f2-mute.mdc`) **förbjuder** integrationskod i
designläge: inga `app/api/**`-rutter, ingen SDK, ingen `process.env`. Den kräver
i stället lokal `useState` plus en demo-toast. Ett formulär utan `action` är
alltså det avsedda resultatet.

Postchecken behandlar samma mönster som en defekt och kan måla det som spärr.
Kontraktet är medvetet — utfallet mot användaren är felet.

Ankare (omverifiera; filen ändrades av #1061):

- `src/lib/gen/verify/product-postcheck.ts:387-397`
- `src/lib/chat-readiness.ts:206-217, 309-316`
- `.cursor/rules/env-flow-f2-mute.mdc` (kontraktet)

## Fix

Två godtagbara vägar:

1. Låt generatorn **märka** F2-demoformulär med ett attribut som snapshoten
   redan respekterar, så postchecken kan skilja dem från riktiga trasiga
   formulär.
2. Eller: räkna inte `fake_form` som spärr när genereringen kördes i designläge.

Alternativ 1 är att föredra — det bevarar signalen för verkliga fall.

## Gör inte

- **Ingen ny UI-yta.** Det här ska ta bort en falsk spärr, inte lägga till en ruta.
- Ändra inte F2-muten till att tillåta integrationskod. Kontraktet är avsiktligt.
- Sluta inte rapportera `fake_form` helt — det är en riktig defekt utanför
  designläge.
- Rör inte `persist-telemetry.ts` (ägs av `SM-017`-paketet i samma våg).

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/gen/verify src/lib/chat-readiness.test.ts
```

Nytt test krävs för båda riktningarna: designlägets demoformulär spärrar inte,
och ett trasigt formulär utanför designläge gör det fortfarande.
