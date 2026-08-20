# Postcheck blockerar innan runtime hunnit bli redo

**Klar 2026-08-20 — [#1061](https://github.com/Jakeminator123/sajtmaskin/pull/1061).**

Våg 2 · Cloud · Fynd `P0-P2` · Verifierat mot proddump

## Målet

En lyckad generering målas som spärrad för att postchecken tittar för tidigt.
Användaren ser start-/omstartssidan och tror att bygget gick fel.

## Fyndet

I proddumpen 19 augusti fick v7 — F3-integrationer, 110 sekunder, `success: true` —
`product_postcheck.preview_boot_page` klockan 09:10:31.

`decidePreviewReadiness` sätter `productBlocked: true` när hosten inte är redo
**och** sidan ser ut som en boot-placeholder. Retry-fönstret räcker inte efter
en kall VM eller efter den `npm install`-svit som beskrivs i
[`preview-host-npm-254.md`](preview-host-npm-254.md).

Ankare (omverifiera):

- `src/lib/gen/verify/product-postcheck.ts:251-261, 849`
- `src/lib/capture/preview-boot-page.ts:29`

Error-log-signatur: `002f309f6ffc`.

## Fix

Vänta på host-ready **innan** en boot-sida får räknas som blockering. Använd den
retry som redan finns — bygg ingen ny grind och inget nytt tillstånd.

Skilj på de två fallen: «hosten svarar inte än» är en timing-fråga, «hosten är
redo och sidan är ändå en boot-placeholder» är en riktig defekt. Bara det andra
ska blockera.

## Beroende framåt

Våg 3 har två paket i samma fil: SM-017 (grinden stämplas grön före postcheck)
och `fake_form` i designläge. Båda väntar på att det här landar. Bredda inte
scope för att «ta dem samtidigt» — de behöver var sin granskning.

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/gen/verify src/lib/capture
```

Nytt test krävs: en icke-redo host får inte ge `productBlocked`.

## Gör inte

- Inför ingen ny grind och ingen ny statuskolumn.
- Höj inte bara timeouten blint — skilj på timing och defekt.
- Rör inte `SM-017`-telemetrin i den här PR:en.
